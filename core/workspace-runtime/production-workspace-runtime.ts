import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  FileHistoryRead,
  MainFileHistoryBinding,
  MainFileHistoryEvent,
} from "../../lib/file-history/file-history-service.ts";
import { MAX_SNAPSHOT_BYTES } from "../../lib/file-history/text-file-policy.ts";
import {
  attachInternalLocalResourceAuthority,
  resourceKeyForRef,
} from "../../lib/resource-io/resource-refs.ts";
import { ResourceIOError } from "../../lib/resource-io/errors.ts";
import { RESOURCE_READ_PROOF } from "../../lib/resource-io/types.ts";
import type {
  ProviderRootIdentity,
  ResourceChangedEvent,
  ResourceDeletedEvent,
  ResourceDescriptor,
  ResourceEvent,
  ResourceOpenReadOptions,
  ResourceOpenReadResult,
  ResourceOperationContext,
  ResourceRef,
  ResourceStat,
  ResourceVersion,
  ResourceWriteExpectedVersionResult,
} from "../../lib/resource-io/types.ts";
import type { WorkspaceObservation } from "../../shared/workspace-observation.ts";
import type {
  KnowledgeIndexSharedBaselinePort,
} from "../knowledge-workspace/knowledge-index-runtime.ts";
import type {
  KnowledgeIndexScopedRepairRequest,
  KnowledgeIndexSharedBaselineDifference,
} from "../knowledge-workspace/knowledge-index-event-coordinator.ts";
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

type KnowledgeSourceBaseline = Readonly<{
  generation: number;
  cursor: number;
  changes: KnowledgeIndexSharedBaselineDifference["changes"];
}>;

type ActiveKnowledgeSourceBaseline = Readonly<{
  generation: number;
  cursor: number | null;
}>;

type KnowledgeBaselineRepair = Readonly<{
  cursor: number;
  promise: Promise<void>;
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
  subscribe: (subscriber: (event: ResourceEvent) => unknown) => () => void;
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
  fileHistoryBinding: () => MainFileHistoryBinding | null;
}>;

type MainFileHistoryResourceIO = Readonly<{
  stat: (input: unknown, options?: ResourceOperationContext) => Promise<ResourceStat>;
  openRead: (
    input: unknown,
    readOptions?: ResourceOpenReadOptions,
    options?: ResourceOperationContext,
  ) => Promise<ResourceOpenReadResult>;
  writeExpectedVersion?: (
    input: unknown,
    content: string | Buffer,
    expectedVersion: ResourceVersion | null,
    options?: ResourceOperationContext,
  ) => Promise<ResourceWriteExpectedVersionResult>;
}>;

type MainFileHistoryRootRevalidator = (
  proof: MainWorkspaceRootProof,
) => Promise<MainWorkspaceRootProof | null>;

type CompletedMainFileHistoryRead = Readonly<{
  kind: "completed";
  content: Buffer;
  version: ResourceVersion;
  versionToken: string;
  ref: Extract<ResourceRef, { kind: "local-file" }>;
}>;

type MainFileHistoryReadAttempt = CompletedMainFileHistoryRead | Readonly<{
  kind: "truncated";
  versionToken: string | null;
}>;

type MainFileHistoryEventBus = Readonly<{
  subscribe: (subscriber: (event: ResourceEvent) => unknown) => () => void;
}>;

/**
 * Adapts the canonical main coordinator and ResourceEventBus for History.
 * It owns neither physical observation nor a filesystem traversal.
 */
export function createMainFileHistoryBinding({
  rootProof,
  runtime,
  resourceEvents,
  resourceIO,
  revalidateRoot,
}: {
  rootProof: MainWorkspaceRootProof;
  runtime: MainWorkspaceRuntime;
  resourceEvents: MainFileHistoryEventBus;
  resourceIO: MainFileHistoryResourceIO;
  revalidateRoot?: MainFileHistoryRootRevalidator;
}): MainFileHistoryBinding {
  if (rootProof?.root?.kind !== "local-file" || !path.isAbsolute(rootProof.root.path)) {
    throw new TypeError("file-history main root must be absolute");
  }
  if (!isLocalMainRootIdentity(rootProof.identity)) {
    throw new TypeError("file-history main root proof is unavailable");
  }
  // ResourceIO may canonicalize an alias such as /var while the authorized
  // root ref preserves its submitted spelling. The coordinator's revalidated
  // watch target is the physical root that both its baseline and ResourceIO
  // reads use, so membership checks must use that same identity.
  const resolvedRootPath = canonicalPhysicalWatchPath(
    workspaceWatchTargetDirectory(rootProof, "file-history main"),
  );
  if (!resolvedRootPath) throw new TypeError("file-history main root is unavailable");
  const rootIdentity = rootProof.identity;
  const historyStoreKey = historyStoreKeyForRoot(rootIdentity);

  return Object.freeze({
    sourceKey: "main" as const,
    historyStoreKey,
    verifyPrivateStorePath: (candidateStorePath) => isOutsideMainWorkspace(
      resolvedRootPath,
      candidateStorePath,
      rootIdentity.caseMode,
    ),
    subscribe: (consumer) => runtime.subscribe(consumer),
    subscribeEvents: (consumer) => resourceEvents.subscribe((event) => {
      const projected = projectMainFileHistoryEvent(resolvedRootPath, rootIdentity.caseMode, event);
      if (projected) return consumer(projected);
      return undefined;
    }),
    read: (relativePath, request) => readMainFileHistoryContent({
      rootPath: resolvedRootPath,
      rootIdentity,
      caseMode: rootIdentity.caseMode,
      resourceIO,
      relativePath,
      request,
    }),
    restore: (relativePath, content, expectedVersionToken) => restoreMainFileHistoryContent({
      rootProof,
      rootPath: resolvedRootPath,
      caseMode: rootIdentity.caseMode,
      resourceIO,
      revalidateRoot,
      relativePath,
      content,
      expectedVersionToken,
    }),
  });
}

function isLocalMainRootIdentity(value: ProviderRootIdentity): boolean {
  return value.providerId === "local_fs"
    && typeof value.identityNamespace === "string"
    && value.identityNamespace.length > 0
    && typeof value.opaqueRootId === "string"
    && value.opaqueRootId.length > 0
    && typeof value.scopeToken === "string"
    && value.scopeToken.length > 0
    && ["sensitive", "insensitive", "unknown"].includes(value.caseMode);
}

function historyStoreKeyForRoot(identity: ProviderRootIdentity): string {
  const digest = createHash("sha256")
    .update(identity.identityNamespace)
    .update("\0")
    .update(identity.opaqueRootId)
    .update("\0")
    .update(identity.scopeToken)
    .digest("base64url");
  return `main-${digest}`;
}

function isOutsideMainWorkspace(
  rootPath: string,
  candidateStorePath: unknown,
  caseMode: ProviderRootIdentity["caseMode"],
): boolean {
  if (typeof candidateStorePath !== "string" || !path.isAbsolute(candidateStorePath)) return false;
  const canonicalRoot = canonicalPhysicalWatchPath(rootPath);
  const canonicalCandidate = canonicalPhysicalWatchPath(candidateStorePath);
  if (!canonicalRoot || !canonicalCandidate) return false;
  const relative = path.relative(
    comparisonPath(canonicalRoot, caseMode),
    comparisonPath(canonicalCandidate, caseMode),
  );
  return relative !== ""
    && (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
}

function projectMainFileHistoryEvent(
  rootPath: string,
  caseMode: ProviderRootIdentity["caseMode"],
  event: ResourceEvent,
): MainFileHistoryEvent | null {
  if (event.type === "resource.changed") {
    const relativePath = mainRelativePath(rootPath, caseMode, event.resource);
    if (!relativePath || event.resource.isDirectory === true) return null;
    return Object.freeze({
      type: "main.resource.changed" as const,
      sourceKey: "main" as const,
      relativePath,
      // Event metadata schedules capture only. A completed bounded read mints
      // the token that History stores and restore later compares.
      versionToken: versionSchedulingHint(event.version),
      operationContext: event.source,
    });
  }
  if (event.type === "resource.deleted") {
    const relativePath = mainRelativePath(rootPath, caseMode, event.resource);
    if (!relativePath || event.resource.isDirectory === true) return null;
    return Object.freeze({
      type: "main.resource.deleted" as const,
      sourceKey: "main" as const,
      relativePath,
    });
  }

  const oldRelativePath = mainRelativePath(rootPath, caseMode, event.oldResource);
  const newRelativePath = mainRelativePath(rootPath, caseMode, event.newResource);
  if (event.oldResource.isDirectory === true || event.newResource.isDirectory === true) return null;
  if (oldRelativePath) {
    return Object.freeze({
      type: "main.resource.renamed" as const,
      sourceKey: "main" as const,
      oldRelativePath,
      newRelativePath,
      operationContext: event.source,
    });
  }
  if (!newRelativePath) return null;
  return Object.freeze({
    type: "main.resource.changed" as const,
    sourceKey: "main" as const,
    relativePath: newRelativePath,
    operationContext: event.source,
  });
}

async function readMainFileHistoryContent({
  rootPath,
  rootIdentity,
  caseMode,
  resourceIO,
  relativePath,
  request,
}: {
  rootPath: string;
  rootIdentity: ProviderRootIdentity;
  caseMode: ProviderRootIdentity["caseMode"];
  resourceIO: MainFileHistoryResourceIO;
  relativePath: string;
  request: Readonly<{ maxBytes: number }>;
}): Promise<FileHistoryRead | null> {
  const attempt = await readCompletedMainFileHistoryContent({
    rootPath,
    rootIdentity,
    caseMode,
    resourceIO,
    relativePath,
    request,
  });
  if (!attempt) return null;
  if (attempt.kind === "truncated") {
    return Object.freeze({ truncated: true, versionToken: attempt.versionToken });
  }
  return Object.freeze({ content: attempt.content, versionToken: attempt.versionToken });
}

async function readCompletedMainFileHistoryContent({
  rootPath,
  rootIdentity,
  caseMode,
  resourceIO,
  relativePath,
  request,
}: {
  rootPath: string;
  rootIdentity: ProviderRootIdentity;
  caseMode: ProviderRootIdentity["caseMode"];
  resourceIO: MainFileHistoryResourceIO;
  relativePath: string;
  request: Readonly<{ maxBytes: number }>;
}): Promise<MainFileHistoryReadAttempt | null> {
  const maxBytes = boundedHistoryReadLimit(request?.maxBytes);
  if (!maxBytes || !isSafeWorkspaceRelativePath(relativePath)) return null;
  const filePath = path.resolve(rootPath, ...relativePath.split("/"));
  const ref = attachInternalLocalResourceAuthority(
    { kind: "local-file" as const, path: filePath },
    { scopeRoot: rootPath, activationRootIdentity: rootIdentity },
  );
  if (mainRelativePath(rootPath, caseMode, ref) !== relativePath) return null;

  const context = Object.freeze({ source: "provider_watch" as const, reason: "file_history" });
  try {
    const stat = await resourceIO.stat(ref, context);
    if (
      !stat.exists
      || stat.isDirectory
      || mainRelativePath(rootPath, caseMode, stat.resource) !== relativePath
    ) {
      return null;
    }
    const statSize = safeResourceSize(stat.version?.size);
    if (statSize !== null && statSize > maxBytes) {
      return Object.freeze({ kind: "truncated" as const, versionToken: versionSchedulingHint(stat.version) });
    }
    if (stat[RESOURCE_READ_PROOF]) {
      attachInternalLocalResourceAuthority(ref, { readProof: stat[RESOURCE_READ_PROOF] });
    }
    Object.freeze(ref);
    const opened = await resourceIO.openRead(ref, boundedOpenReadOptions(stat, maxBytes), context);
    if (
      mainRelativePath(rootPath, caseMode, opened.resource) !== relativePath
      || !Number.isSafeInteger(opened.size)
      || opened.size < 0
    ) {
      return null;
    }
    const versionHint = versionSchedulingHint(opened.version);
    if (opened.size > maxBytes) {
      return Object.freeze({ kind: "truncated" as const, versionToken: versionHint });
    }

    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of opened.body) {
      if (!(chunk instanceof Uint8Array)) {
        return Object.freeze({ kind: "truncated" as const, versionToken: versionHint });
      }
      if (chunk.byteLength > maxBytes - length) {
        return Object.freeze({ kind: "truncated" as const, versionToken: versionHint });
      }
      const bytes = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      chunks.push(bytes);
      length += bytes.byteLength;
    }
    if (length !== opened.size) {
      return Object.freeze({ kind: "truncated" as const, versionToken: versionHint });
    }
    const version = Object.freeze({ ...opened.version });
    if (!hasVersionAuthority(version)) return null;
    const content = Buffer.concat(chunks, length);
    return Object.freeze({
      kind: "completed" as const,
      content,
      version,
      versionToken: contentBoundVersionToken(version, content),
      ref,
    });
  } catch {
    return null;
  }
}

async function restoreMainFileHistoryContent({
  rootProof,
  rootPath,
  caseMode,
  resourceIO,
  revalidateRoot,
  relativePath,
  content,
  expectedVersionToken,
}: {
  rootProof: MainWorkspaceRootProof;
  rootPath: string;
  caseMode: ProviderRootIdentity["caseMode"];
  resourceIO: MainFileHistoryResourceIO;
  revalidateRoot?: MainFileHistoryRootRevalidator;
  relativePath: string;
  content: Buffer;
  expectedVersionToken: string;
}): Promise<ResourceWriteExpectedVersionResult> {
  if (
    !Buffer.isBuffer(content)
    || typeof expectedVersionToken !== "string"
    || expectedVersionToken.length === 0
    || expectedVersionToken.length > 4_096
  ) {
    throw restoreVersionConflict();
  }
  await revalidateMainHistoryRoot({ rootProof, rootPath, revalidateRoot });
  const read = await readCompletedMainFileHistoryContent({
    rootPath,
    rootIdentity: rootProof.identity,
    caseMode,
    resourceIO,
    relativePath,
    request: { maxBytes: MAX_SNAPSHOT_BYTES },
  });
  if (!read || read.kind !== "completed" || read.versionToken !== expectedVersionToken) {
    throw restoreVersionConflict();
  }
  if (typeof resourceIO.writeExpectedVersion !== "function") {
    throw new ResourceIOError("File-history restore is unavailable", {
      code: "provider_not_available",
      status: 503,
    });
  }
  return resourceIO.writeExpectedVersion(
    read.ref,
    content,
    read.version,
    Object.freeze({
      source: "api" as const,
      reason: "history_restore",
      operationId: randomUUID(),
    }),
  );
}

async function revalidateMainHistoryRoot({
  rootProof,
  rootPath,
  revalidateRoot,
}: {
  rootProof: MainWorkspaceRootProof;
  rootPath: string;
  revalidateRoot?: MainFileHistoryRootRevalidator;
}): Promise<void> {
  let currentProof = rootProof;
  try {
    if (revalidateRoot) {
      const revalidated = await revalidateRoot(rootProof);
      if (!revalidated) throw restoreVersionConflict();
      currentProof = revalidated;
    }
    const currentRootPath = canonicalPhysicalWatchPath(
      workspaceWatchTargetDirectory(currentProof, "file-history restore"),
    );
    if (
      !currentRootPath
      || !sameMainRootIdentity(rootProof.identity, currentProof.identity)
      || comparisonPath(currentRootPath, rootProof.identity.caseMode)
        !== comparisonPath(rootPath, rootProof.identity.caseMode)
      || !fs.statSync(currentRootPath).isDirectory()
    ) {
      throw restoreVersionConflict();
    }
  } catch (error) {
    if (error instanceof ResourceIOError) throw error;
    throw restoreVersionConflict();
  }
}

function boundedHistoryReadLimit(value: unknown): number | null {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) return null;
  return Math.min(Number(value), MAX_SNAPSHOT_BYTES);
}

function boundedOpenReadOptions(stat: ResourceStat, maxBytes: number): ResourceOpenReadOptions {
  const size = safeResourceSize(stat.version?.size);
  return {
    end: size === null ? maxBytes - 1 : Math.min(Math.max(size - 1, 0), maxBytes - 1),
    ...(stat.version ? { expectedVersion: stat.version } : {}),
    ...(stat[RESOURCE_READ_PROOF] ? { [RESOURCE_READ_PROOF]: stat[RESOURCE_READ_PROOF] } : {}),
  };
}

function safeResourceSize(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function mainRelativePath(
  rootPath: string,
  caseMode: ProviderRootIdentity["caseMode"],
  resource: ResourceDescriptor,
): string | null {
  if (resource?.kind !== "local-file" || typeof resource.path !== "string" || !path.isAbsolute(resource.path)) {
    return null;
  }
  const candidatePath = path.resolve(resource.path);
  const comparisonRelative = path.relative(
    comparisonPath(rootPath, caseMode),
    comparisonPath(candidatePath, caseMode),
  );
  if (
    !comparisonRelative
    || comparisonRelative === ".."
    || comparisonRelative.startsWith(`..${path.sep}`)
    || path.isAbsolute(comparisonRelative)
  ) {
    return null;
  }
  const relativePath = path.relative(rootPath, candidatePath).split(path.sep).join("/");
  return isSafeWorkspaceRelativePath(relativePath) ? relativePath : null;
}

function comparisonPath(value: string, caseMode: ProviderRootIdentity["caseMode"]): string {
  const resolved = path.resolve(value);
  return caseMode === "insensitive"
    ? resolved.normalize("NFC").toLocaleLowerCase("en-US")
    : resolved;
}

function versionSchedulingHint(version: ResourceVersion | undefined): string | null {
  if (!version) return null;
  const values = [version.mtimeMs, version.size, version.sha256, version.etag, version.sequence];
  if (values.every(value => value === undefined)) return null;
  return createHash("sha256").update(JSON.stringify(values)).digest("base64url");
}

function contentBoundVersionToken(version: ResourceVersion, content: Buffer): string {
  const values = [version.mtimeMs, version.size, version.sha256, version.etag, version.sequence];
  return createHash("sha256")
    .update(JSON.stringify(values))
    .update("\0")
    .update(content)
    .digest("base64url");
}

function hasVersionAuthority(version: ResourceVersion): boolean {
  return [version.mtimeMs, version.size, version.sha256, version.etag, version.sequence]
    .some(value => value !== undefined);
}

function sameMainRootIdentity(
  left: ProviderRootIdentity,
  right: ProviderRootIdentity,
): boolean {
  return left.providerId === right.providerId
    && left.identityNamespace === right.identityNamespace
    && left.opaqueRootId === right.opaqueRootId
    && left.scopeToken === right.scopeToken
    && left.caseMode === right.caseMode;
}

function restoreVersionConflict(): ResourceIOError {
  return new ResourceIOError("File-history restore conflict", {
    code: "resource_version_conflict",
    status: 409,
  });
}

/**
 * Converts canonical main-workspace observations into the narrow baseline
 * port consumed by Knowledge. It never owns a watcher or source walk.
 */
export class MainWorkspaceKnowledgeSharedBaselineAdapter {
  readonly port: KnowledgeIndexSharedBaselinePort;
  readonly #currentResourceEventSequence: () => number;
  readonly #consumers = new Set<(input: KnowledgeIndexSharedBaselineDifference) => void>();
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

  subscribe(consumer: (input: KnowledgeIndexSharedBaselineDifference) => void): () => void {
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

  requestRepair(request: KnowledgeIndexScopedRepairRequest): Promise<void> {
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

  #publish(input: KnowledgeIndexSharedBaselineDifference): void {
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
  historyResourceIO,
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
  historyResourceIO: MainFileHistoryResourceIO;
  sharedBaseline?: MainWorkspaceKnowledgeSharedBaselineAdapter;
}): ProductionWorkspaceRuntimeAssembly {
  if (
    !historyResourceIO
    || typeof historyResourceIO.stat !== "function"
    || typeof historyResourceIO.openRead !== "function"
    || typeof resourceEvents?.subscribe !== "function"
  ) {
    throw new TypeError("production workspace file-history assembly is unavailable");
  }
  if (!path.isAbsolute(rootPath)) {
    throw new TypeError("production workspace root must be absolute");
  }
  const resolvedRootPath = path.resolve(rootPath);
  const root = Object.freeze({ kind: "local-file" as const, path: resolvedRootPath });
  let mainRootProof: MainWorkspaceRootProof | null = null;
  const coordinatorRootAuthority: MainWorkspaceRootAuthority = Object.freeze({
    proveMain: async (candidate) => {
      const proof = await rootAuthority.proveMain(candidate);
      mainRootProof = proof;
      return proof;
    },
    revalidateMain: async (proof) => {
      const revalidated = await rootAuthority.revalidateMain(proof);
      mainRootProof = revalidated;
      return revalidated;
    },
  });
  const runtime = createMainWorkspaceRuntime({ rootAuthority: coordinatorRootAuthority, watchAdapter });
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
  const fileHistoryBinding = (): MainFileHistoryBinding | null => {
    const proof = mainRootProof;
    const snapshot = runtime.snapshot();
    if (
      !proof
      || !snapshot?.observing
      || snapshot.health !== "HEALTHY"
    ) {
      return null;
    }
    return createMainFileHistoryBinding({
      rootProof: proof,
      runtime,
      resourceEvents: {
        subscribe: (subscriber) => resourceEvents.subscribe(subscriber),
      },
      resourceIO: historyResourceIO,
      revalidateRoot: (candidate) => rootAuthority.revalidateMain(candidate),
    });
  };
  return Object.freeze({
    canonicalRoot: canonicalPhysicalWatchPath(resolvedRootPath),
    runtime,
    sharedBaseline,
    cutover,
    fileHistoryBinding,
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
): request is KnowledgeIndexScopedRepairRequest & { sourceKey: "main" } {
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
