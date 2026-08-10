import fs from "node:fs";
import path from "node:path";
import { resourceKeyForRef } from "../../lib/resource-io/resource-refs.ts";
import type {
  ResourceChangedEvent,
  ResourceDeletedEvent,
  ResourceDescriptor,
} from "../../lib/resource-io/types.ts";
import type { WorkspaceObservation } from "../../shared/workspace-observation.ts";
import {
  createMainWorkspaceRuntime,
  type MainWorkspaceRootAuthority,
  type MainWorkspaceRootProof,
  type MainWorkspaceRuntime,
  type WorkspaceBaselineEntry,
  type WorkspaceSubscription,
  type WorkspaceWatchAdapter,
  type WorkspaceWatchListener,
} from "./main-workspace-runtime.ts";

export type ProductionOwnerCounts = Readonly<{
  watchers: number;
  mutations: number;
  baselines: number;
}>;

export type ProductionHealthCounts = Readonly<{
  watchers: number | null;
  mutations: number | null;
  baselines: number | null;
}>;

export type ProductionOwner = Readonly<{
  start?: () => Promise<void> | void;
  stop: () => Promise<void> | void;
  inspect: () => ProductionOwnerCounts;
}>;

export type ProductionCutoverSnapshot = Readonly<{
  state: "HEALTHY" | "DEGRADED" | "RECONCILING" | "FAILED";
  overlap: number | null;
  legacy: ProductionHealthCounts;
  coordinator: ProductionHealthCounts;
}>;

export type SingleOwnerProductionCutover = Readonly<{
  start: () => Promise<ProductionCutoverSnapshot>;
  stop: () => Promise<ProductionCutoverSnapshot>;
  snapshot: () => ProductionCutoverSnapshot;
}>;

export const EMPTY_PRODUCTION_OWNER_COUNTS: ProductionOwnerCounts = Object.freeze({
  watchers: 0,
  mutations: 0,
  baselines: 0,
});

const UNPROVEN_PRODUCTION_OWNER_COUNTS: ProductionHealthCounts = Object.freeze({
  watchers: null,
  mutations: null,
  baselines: null,
});

export type KnowledgeSharedBaselineChange = Readonly<{
  relativePath: string;
  changeType: "upsert" | "deleted";
}>;

export type KnowledgeSharedBaselineDifference = Readonly<{
  type: "shared-baseline-difference";
  sourceKey: "main";
  cursor: number;
  coverage: "source";
  changes: readonly KnowledgeSharedBaselineChange[];
}>;

type KnowledgeSourceBaseline = Readonly<{
  generation: number;
  cursor: number;
  changes: readonly KnowledgeSharedBaselineChange[];
}>;

type ActiveKnowledgeSourceBaseline = Readonly<{
  generation: number;
  cursor: number | null;
}>;

type KnowledgeBaselineRepair = Readonly<{
  cursor: number;
  promise: Promise<void>;
}>;

export type KnowledgeScopedRepairRequest = Readonly<{
  sourceKey: string;
  afterSequence: number;
  reason: string;
}>;

export type KnowledgeSharedBaselinePort = Readonly<{
  subscribe: (consumer: (input: KnowledgeSharedBaselineDifference) => void) => () => void;
  requestRepair: (request: KnowledgeScopedRepairRequest) => Promise<void>;
}>;

type MainWorkspaceRuntimeForKnowledgeBaseline = Pick<
  MainWorkspaceRuntime,
  "snapshot" | "reportGap" | "retryMain"
>;

type ResourceChangedInput = Omit<
  ResourceChangedEvent,
  "type" | "sequence" | "occurredAt"
>;

type ResourceDeletedInput = Omit<
  ResourceDeletedEvent,
  "type" | "sequence" | "occurredAt"
>;

export type ProductionWorkspaceEventBus = Readonly<{
  latestSequence: () => number;
  changed: (input: ResourceChangedInput) => unknown;
  deleted: (input: ResourceDeletedInput) => unknown;
}>;

type LegacyWatchEntry = Readonly<{
  ref?: Readonly<{ kind?: unknown }>;
  filePath?: unknown;
}>;

export type ProductionLegacyWatchRegistry = Readonly<{
  entries?: ReadonlyMap<string, LegacyWatchEntry>;
  release: (resourceKey: string) => unknown;
}>;

export type ProductionWorkspaceRuntimeAssembly = Readonly<{
  canonicalRoot: string | null;
  runtime: MainWorkspaceRuntime;
  sharedBaseline: MainWorkspaceKnowledgeSharedBaselineAdapter;
  cutover: SingleOwnerProductionCutover;
}>;

/**
 * Converts canonical main-workspace observations into the narrow baseline
 * port consumed by Knowledge. It never owns a watcher or source walk.
 */
export class MainWorkspaceKnowledgeSharedBaselineAdapter {
  readonly port: KnowledgeSharedBaselinePort;
  readonly #currentResourceEventSequence: () => number;
  readonly #consumers = new Set<(input: KnowledgeSharedBaselineDifference) => void>();
  readonly #entries = new Map<string, "upsert">();
  #runtime: MainWorkspaceRuntimeForKnowledgeBaseline | null = null;
  #healthy = false;
  #nextSourceGeneration = 0;
  #activeSourceBaseline: ActiveKnowledgeSourceBaseline | null = null;
  #completedSourceBaseline: KnowledgeSourceBaseline | null = null;
  #repair: KnowledgeBaselineRepair | null = null;

  constructor({
    currentResourceEventSequence,
  }: {
    currentResourceEventSequence: () => number;
  }) {
    if (typeof currentResourceEventSequence !== "function") {
      throw new TypeError("main workspace knowledge baseline requires a resource event cursor");
    }
    this.#currentResourceEventSequence = currentResourceEventSequence;
    this.port = Object.freeze({
      subscribe: (consumer) => this.subscribe(consumer),
      requestRepair: (request) => this.requestRepair(request),
    });
  }

  attach(runtime: MainWorkspaceRuntimeForKnowledgeBaseline): void {
    if (!runtime || typeof runtime.snapshot !== "function") {
      throw new TypeError("main workspace knowledge baseline runtime is unavailable");
    }
    this.detach();
    this.#runtime = runtime;
  }

  detach(runtime?: MainWorkspaceRuntimeForKnowledgeBaseline): void {
    if (runtime && this.#runtime !== runtime) return;
    this.#runtime = null;
    this.#repair = null;
    this.#clearBaseline();
  }

  subscribe(consumer: (input: KnowledgeSharedBaselineDifference) => void): () => void {
    if (typeof consumer !== "function") {
      throw new TypeError("knowledge shared baseline consumer must be a function");
    }
    this.#consumers.add(consumer);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#consumers.delete(consumer);
    };
  }

  accept(runtime: MainWorkspaceRuntimeForKnowledgeBaseline, observation: WorkspaceObservation): void {
    if (runtime !== this.#runtime || observation.sourceKey !== "main") return;
    if (observation.type === "workspace.health") {
      if (observation.health !== "HEALTHY") {
        if (!this.#activeSourceBaseline) this.#beginFreshSourceBaseline();
        return;
      }
      this.#completeFreshSourceBaseline();
      return;
    }
    if (
      observation.type === "workspace.baseline"
      && observation.entryKind === "file"
      && isSafeWorkspaceRelativePath(observation.relativePath)
    ) {
      if (!this.#activeSourceBaseline) this.#beginFreshSourceBaseline();
      this.#entries.set(observation.relativePath, "upsert");
    }
  }

  requestRepair(request: KnowledgeScopedRepairRequest): Promise<void> {
    if (!isValidKnowledgeScopedRepairRequest(request)) {
      return Promise.reject(new TypeError("knowledge shared baseline repair request is invalid"));
    }
    if (!this.#runtime) {
      return Promise.reject(new Error("main workspace shared baseline is unavailable"));
    }
    const cursor = this.#currentCanonicalResourceEventCursor();
    if (cursor === null || request.afterSequence > cursor) {
      return Promise.reject(new Error("main workspace shared baseline cursor is stale"));
    }
    const completed = this.#completedSourceBaseline;
    if (
      request.reason === "source_bound"
      && this.#healthy
      && completed
      && completed.cursor >= request.afterSequence
      && completed.cursor <= cursor
    ) {
      this.#publishSource(completed);
      return Promise.resolve();
    }
    if (this.#repair) {
      if (request.afterSequence > this.#repair.cursor) {
        return Promise.reject(new Error("main workspace shared baseline cursor is stale"));
      }
      return this.#repair.promise;
    }
    const runtime = this.#runtime;
    const repair = this.#repairCanonical(runtime, cursor);
    this.#repair = Object.freeze({ cursor, promise: repair });
    void repair.then(
      () => {
        if (this.#repair?.promise === repair) this.#repair = null;
      },
      () => {
        if (this.#repair?.promise === repair) this.#repair = null;
      },
    );
    return repair;
  }

  async #repairCanonical(
    runtime: MainWorkspaceRuntimeForKnowledgeBaseline,
    sourceCursor: number,
  ): Promise<void> {
    const snapshot = runtime.snapshot();
    if (!snapshot || this.#runtime !== runtime) {
      throw new Error("main workspace shared baseline is unavailable");
    }
    const activeBaseline = this.#beginFreshSourceBaseline(sourceCursor);
    if (!activeBaseline || activeBaseline.cursor !== sourceCursor) {
      throw new Error("main workspace shared baseline cursor is unavailable");
    }
    if (snapshot.health === "FAILED" || snapshot.observing !== true) {
      await runtime.retryMain();
    } else {
      await runtime.reportGap();
    }
    const completed = this.#completedSourceBaseline;
    if (
      this.#runtime !== runtime
      || !this.#healthy
      || !completed
      || completed.generation !== activeBaseline.generation
      || completed.cursor !== sourceCursor
    ) {
      throw new Error("main workspace shared baseline is unavailable");
    }
  }

  #beginFreshSourceBaseline(cursor = this.#currentCanonicalResourceEventCursor()): ActiveKnowledgeSourceBaseline | null {
    this.#healthy = false;
    this.#entries.clear();
    this.#completedSourceBaseline = null;
    const baseline = Object.freeze({
      generation: ++this.#nextSourceGeneration,
      cursor,
    });
    this.#activeSourceBaseline = baseline;
    return cursor === null ? null : baseline;
  }

  #completeFreshSourceBaseline(): void {
    const active = this.#activeSourceBaseline ?? this.#beginFreshSourceBaseline();
    if (!active || active.cursor === null) return;
    const baseline = Object.freeze({
      generation: active.generation,
      // Captured before the source walk: later events stay in ResourceEventBus replay.
      cursor: active.cursor,
      changes: Object.freeze([...this.#entries.keys()]
        .sort((left, right) => left.localeCompare(right))
        .map((relativePath) => Object.freeze({
          relativePath,
          changeType: "upsert" as const,
        }))),
    });
    this.#healthy = true;
    this.#activeSourceBaseline = null;
    this.#completedSourceBaseline = baseline;
    this.#publishSource(baseline);
  }

  #publishSource(baseline: KnowledgeSourceBaseline): void {
    this.#publish(Object.freeze({
      type: "shared-baseline-difference" as const,
      sourceKey: "main" as const,
      cursor: baseline.cursor,
      coverage: "source" as const,
      changes: baseline.changes,
    }));
  }

  #currentCanonicalResourceEventCursor(): number | null {
    let cursor: number;
    try {
      cursor = this.#currentResourceEventSequence();
    } catch {
      return null;
    }
    if (!Number.isSafeInteger(cursor) || cursor < 0) return null;
    return cursor;
  }

  #publish(input: KnowledgeSharedBaselineDifference): void {
    for (const consumer of this.#consumers) {
      try {
        consumer(input);
      } catch {
        // Derived consumers cannot make the canonical observation owner fail.
      }
    }
  }

  #clearBaseline(): void {
    this.#healthy = false;
    this.#activeSourceBaseline = null;
    this.#completedSourceBaseline = null;
    this.#entries.clear();
  }
}

/**
 * Serializes the one-way production owner handoff while exposing only
 * aggregate proof, never paths, root identities, or owner handles.
 */
export function createSingleOwnerProductionCutover({
  isolatedProof,
  legacyOwner,
  newOwner,
}: {
  isolatedProof: () => Promise<void> | void;
  legacyOwner: ProductionOwner;
  newOwner: Required<Pick<ProductionOwner, "start">> & ProductionOwner;
}): SingleOwnerProductionCutover {
  let state: ProductionCutoverSnapshot["state"] = "DEGRADED";
  let active = false;
  let requiresCandidateRelease = false;
  let tail: Promise<void> = Promise.resolve();

  const inspectedSnapshot = (): ProductionCutoverSnapshot => {
    const legacy = normalizeProductionOwnerCounts(legacyOwner.inspect());
    const coordinator = normalizeProductionOwnerCounts(newOwner.inspect());
    return Object.freeze({
      state,
      overlap: ownerOverlap(legacy, coordinator),
      legacy,
      coordinator,
    });
  };

  const snapshot = (): ProductionCutoverSnapshot => {
    try {
      return inspectedSnapshot();
    } catch {
      state = "FAILED";
      requiresCandidateRelease = active;
      return Object.freeze({
        state,
        overlap: null,
        legacy: UNPROVEN_PRODUCTION_OWNER_COUNTS,
        coordinator: UNPROVEN_PRODUCTION_OWNER_COUNTS,
      });
    }
  };

  const requireReleased = (owner: ProductionOwner, label: string): void => {
    let counts: ProductionOwnerCounts;
    try {
      counts = normalizeProductionOwnerCounts(owner.inspect());
    } catch {
      throw new Error(`${label} release cannot be proven`);
    }
    if (counts.watchers !== 0 || counts.mutations !== 0 || counts.baselines !== 0) {
      throw new Error(`${label} release cannot be proven`);
    }
  };

  const run = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = tail.then(operation, operation);
    tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  return Object.freeze({
    start: () => run(async () => {
      if (active && state === "HEALTHY") return snapshot();
      state = "RECONCILING";
      if (active || requiresCandidateRelease) {
        try {
          await newOwner.stop();
          requireReleased(newOwner, "new owner");
          active = false;
          requiresCandidateRelease = false;
        } catch (error) {
          active = false;
          requiresCandidateRelease = true;
          state = "FAILED";
          throw error;
        }
      }
      try {
        await isolatedProof();
        await legacyOwner.stop();
        requireReleased(legacyOwner, "legacy owner");
      } catch (error) {
        active = false;
        state = "FAILED";
        throw error;
      }

      try {
        await newOwner.start();
        const current = inspectedSnapshot();
        if (current.overlap !== 0) throw new Error("production owner overlap detected");
        state = "HEALTHY";
        active = true;
        requiresCandidateRelease = false;
        return snapshot();
      } catch (error) {
        try {
          await newOwner.stop();
          requireReleased(newOwner, "new owner");
          requiresCandidateRelease = false;
        } finally {
          active = false;
          state = "FAILED";
        }
        throw error;
      }
    }),
    stop: () => run(async () => {
      if (!active && !requiresCandidateRelease) return snapshot();
      state = "RECONCILING";
      try {
        await newOwner.stop();
        requireReleased(newOwner, "new owner");
        active = false;
        requiresCandidateRelease = false;
        state = "DEGRADED";
      } catch (error) {
        active = false;
        requiresCandidateRelease = true;
        state = "FAILED";
        throw error;
      }
      return snapshot();
    }),
    snapshot,
  });
}

/**
 * Builds the production coordinator from injected authority, watcher, and
 * EventBus sinks. Engine supplies lifecycle callbacks and watch repartition.
 */
export function createProductionWorkspaceRuntime({
  rootPath,
  rootAuthority,
  watchAdapter = createProductionWorkspaceWatchAdapter(),
  resourceEvents,
  legacyWatchRegistry,
  isolatedProof,
  beforeCoordinatorStart,
  sharedBaseline = new MainWorkspaceKnowledgeSharedBaselineAdapter({
    currentResourceEventSequence: () => resourceEvents.latestSequence(),
  }),
}: {
  rootPath: string;
  rootAuthority: MainWorkspaceRootAuthority;
  watchAdapter?: WorkspaceWatchAdapter;
  resourceEvents: ProductionWorkspaceEventBus;
  legacyWatchRegistry: ProductionLegacyWatchRegistry;
  isolatedProof: () => Promise<void> | void;
  beforeCoordinatorStart: () => Promise<void> | void;
  sharedBaseline?: MainWorkspaceKnowledgeSharedBaselineAdapter;
}): ProductionWorkspaceRuntimeAssembly {
  if (!path.isAbsolute(rootPath)) {
    throw new TypeError("production workspace root must be absolute");
  }
  const resolvedRootPath = path.resolve(rootPath);
  const root = Object.freeze({ kind: "local-file" as const, path: resolvedRootPath });
  const runtime = createMainWorkspaceRuntime({ rootAuthority, watchAdapter });
  const legacyOwner = createLegacyProductionWorkspaceOwner({
    rootPath: resolvedRootPath,
    watchRegistry: legacyWatchRegistry,
  });
  let subscription: WorkspaceSubscription | null = null;
  const newOwner: Required<Pick<ProductionOwner, "start">> & ProductionOwner = Object.freeze({
    start: async () => {
      await beforeCoordinatorStart();
      await runtime.switchMain(root);
      sharedBaseline.attach(runtime);
      subscription = await runtime.subscribe((observation) => {
        bridgeProductionWorkspaceObservation({
          rootPath: resolvedRootPath,
          observation,
          resourceEvents,
        });
        sharedBaseline.accept(runtime, observation);
      });
      const snapshot = runtime.snapshot();
      if (!snapshot?.observing || snapshot.health !== "HEALTHY") {
        throw new Error("main workspace coordinator did not become healthy");
      }
    },
    stop: async () => {
      const currentSubscription = subscription;
      subscription = null;
      try {
        await currentSubscription?.release();
      } finally {
        try {
          sharedBaseline.detach(runtime);
        } finally {
          await runtime.close();
        }
      }
    },
    inspect: () => inspectProductionWorkspaceCoordinator(runtime),
  });
  const cutover = createSingleOwnerProductionCutover({
    isolatedProof,
    legacyOwner,
    newOwner,
  });
  return Object.freeze({
    canonicalRoot: canonicalPhysicalWatchPath(resolvedRootPath),
    runtime,
    sharedBaseline,
    cutover,
  });
}

export function createLegacyProductionWorkspaceOwner({
  rootPath,
  watchRegistry,
}: {
  rootPath: string;
  watchRegistry: ProductionLegacyWatchRegistry;
}): ProductionOwner {
  const matchingResourceKeys = (): string[] => {
    const canonicalRoot = canonicalPhysicalWatchPath(rootPath);
    if (!canonicalRoot) return [];
    return [...(watchRegistry.entries?.entries() ?? [])]
      .filter(([, entry]) => {
        if (entry?.ref?.kind !== "local-file") return false;
        const canonicalTarget = canonicalPhysicalWatchPath(entry.filePath);
        return canonicalTarget !== null
          && isSameOrPhysicalDescendant(canonicalRoot, canonicalTarget);
      })
      .map(([resourceKey]) => resourceKey);
  };

  return Object.freeze({
    stop: () => {
      for (const resourceKey of matchingResourceKeys()) {
        while (watchRegistry.entries?.has(resourceKey)) watchRegistry.release(resourceKey);
      }
    },
    inspect: () => Object.freeze({
      watchers: matchingResourceKeys().length,
      mutations: 0,
      baselines: 0,
    }),
  });
}

export function createProductionWorkspaceWatchAdapter(): WorkspaceWatchAdapter {
  return Object.freeze({
    open: (proof: MainWorkspaceRootProof, listener: WorkspaceWatchListener) => {
      const rootPath = workspaceWatchTargetDirectory(proof, "workspace watch");
      const watcher = fs.watch(rootPath, { persistent: false, recursive: true }, (eventType, filename) => {
        if (!filename) {
          listener.onGap();
          return;
        }
        const relativePath = path.relative(rootPath, path.resolve(rootPath, String(filename)))
          .split(path.sep)
          .join("/");
        if (!isSafeWorkspaceRelativePath(relativePath)) {
          listener.onGap();
          return;
        }
        const changedPath = path.join(rootPath, ...relativePath.split("/"));
        listener.onChange({
          relativePath,
          changeType: eventType === "change"
            ? "modified"
            : fs.existsSync(changedPath) ? "created" : "deleted",
        });
      });
      watcher.on("error", () => listener.onError());
      return Object.freeze({ close: () => watcher.close() });
    },
    baseline: async function* (proof: MainWorkspaceRootProof): AsyncGenerator<WorkspaceBaselineEntry> {
      const rootPath = workspaceWatchTargetDirectory(proof, "workspace baseline");
      const pending = [rootPath];
      while (pending.length > 0) {
        const directory = pending.pop();
        if (!directory) continue;
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          if (entry.isSymbolicLink()) continue;
          const fullPath = path.join(directory, entry.name);
          const relativePath = path.relative(rootPath, fullPath).split(path.sep).join("/");
          if (!isSafeWorkspaceRelativePath(relativePath)) continue;
          if (entry.isDirectory()) {
            pending.push(fullPath);
            yield { relativePath, kind: "directory" };
          } else if (entry.isFile()) {
            yield { relativePath, kind: "file" };
          }
        }
      }
    },
  });
}

export function bridgeProductionWorkspaceObservation({
  rootPath,
  observation,
  resourceEvents,
}: {
  rootPath: string;
  observation: WorkspaceObservation;
  resourceEvents: ProductionWorkspaceEventBus;
}): void {
  if (
    observation.type !== "workspace.changed"
    || observation.sourceKey !== "main"
    || !isSafeWorkspaceRelativePath(observation.relativePath)
  ) {
    return;
  }
  const filePath = path.resolve(rootPath, ...observation.relativePath.split("/"));
  const relative = path.relative(rootPath, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return;
  const resourceKey = resourceKeyForRef({ kind: "local-file", path: filePath });
  // A deleted entry cannot be statted safely. Keep its shape unknown so
  // Knowledge performs source repair; existing directories are explicit repair.
  const isDirectory = observation.changeType === "deleted"
    ? undefined
    : safeExistingDirectory(filePath);
  const resource: ResourceDescriptor = {
    kind: "local-file",
    provider: "local_fs",
    path: filePath,
    filePath,
    ...(isDirectory === undefined ? {} : { isDirectory }),
  };
  if (observation.changeType === "deleted") {
    resourceEvents.deleted({
      resourceKey,
      resource,
      source: "provider_watch",
      sessionPath: null,
    });
    return;
  }
  resourceEvents.changed({
    changeType: observation.changeType,
    resourceKey,
    resource,
    ...(isDirectory ? { version: { size: null } } : {}),
    source: "provider_watch",
    sessionPath: null,
  });
}

export function isSafeWorkspaceRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.startsWith("/") || value.includes("\\")) return false;
  return value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

export function safeExistingDirectory(value: string): boolean {
  try {
    return fs.statSync(value).isDirectory();
  } catch {
    return false;
  }
}

export function resolveExistingWorkspaceDirectory(value: unknown): string | null {
  if (typeof value !== "string" || !path.isAbsolute(value)) return null;
  const rootPath = path.resolve(value);
  return safeExistingDirectory(rootPath) ? rootPath : null;
}

/**
 * Resolves a path through the existing physical filesystem where possible.
 * A missing leaf stays comparable when its nearest ancestor is canonical.
 */
export function canonicalPhysicalWatchPath(value: unknown): string | null {
  if (typeof value !== "string" || !path.isAbsolute(value)) return null;
  const suffix: string[] = [];
  let candidate = path.resolve(value);
  while (true) {
    try {
      const canonical = typeof fs.realpathSync.native === "function"
        ? fs.realpathSync.native(candidate)
        : fs.realpathSync(candidate);
      return path.join(path.normalize(canonical), ...suffix.reverse());
    } catch {
      const parent = path.dirname(candidate);
      if (parent === candidate) return null;
      suffix.push(path.basename(candidate));
      candidate = parent;
    }
  }
}

export function isSameOrPhysicalDescendant(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative === ""
    || (
      relative !== ".."
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative)
    );
}

function isValidKnowledgeScopedRepairRequest(
  request: unknown,
): request is KnowledgeScopedRepairRequest & { sourceKey: "main" } {
  if (!request || typeof request !== "object" || Array.isArray(request)) return false;
  const candidate = request as Record<string, unknown>;
  return candidate.sourceKey === "main"
    && Number.isSafeInteger(candidate.afterSequence)
    && Number(candidate.afterSequence) >= 0
    && typeof candidate.reason === "string"
    && candidate.reason.length > 0;
}

function normalizeProductionOwnerCounts(value: unknown): ProductionOwnerCounts {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("production owner inspection is invalid");
  }
  const candidate = value as Record<string, unknown>;
  return Object.freeze({
    watchers: requiredProductionCount(candidate.watchers),
    mutations: requiredProductionCount(candidate.mutations),
    baselines: requiredProductionCount(candidate.baselines),
  });
}

function requiredProductionCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error("production owner inspection is invalid");
  }
  return Number(value);
}

function ownerOverlap(legacy: ProductionOwnerCounts, coordinator: ProductionOwnerCounts): number {
  return Math.max(
    0,
    legacy.watchers + coordinator.watchers - 1,
    legacy.mutations + coordinator.mutations - 1,
    legacy.baselines + coordinator.baselines - 1,
  );
}

function inspectProductionWorkspaceCoordinator(runtime: MainWorkspaceRuntime): ProductionOwnerCounts {
  const snapshot = runtime.snapshot();
  return Object.freeze({
    watchers: snapshot?.observing ? 1 : 0,
    mutations: 0,
    baselines: snapshot?.observing ? 1 : 0,
  });
}

function workspaceWatchTargetDirectory(proof: MainWorkspaceRootProof, label: string): string {
  const target = proof.watchTarget;
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    throw new Error(`${label} target is unavailable`);
  }
  const filePath = (target as Record<string, unknown>).filePath;
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
    throw new Error(`${label} target is unavailable`);
  }
  return filePath;
}
