import type {
  ProviderRootIdentity,
  ResourceRef,
} from "../../lib/resource-io/types.ts";
import {
  MAIN_WORKSPACE_SOURCE_KEY,
  type WorkspaceHealth,
  type WorkspaceHealthReason,
  type WorkspaceBaselineObservation,
  type WorkspaceObservation,
  type WorkspaceSnapshot,
} from "../../shared/workspace-observation.ts";

export type MainWorkspaceRootProof = Readonly<{
  root: Extract<ResourceRef, { kind: "local-file" }>;
  identity: ProviderRootIdentity;
  watchTarget: unknown;
}>;

export type MainWorkspaceRootAuthority = Readonly<{
  proveMain: (root: ResourceRef) => Promise<MainWorkspaceRootProof | null>;
  revalidateMain: (proof: MainWorkspaceRootProof) => Promise<MainWorkspaceRootProof | null>;
}>;

export type WorkspaceBaselineEntry = Readonly<{
  relativePath: string;
  kind: "file" | "directory";
}>;

export type WorkspaceWatchChange = Readonly<{
  relativePath: string;
  changeType: "created" | "modified" | "deleted";
}>;

export type WorkspaceWatchListener = Readonly<{
  onChange: (change: WorkspaceWatchChange) => void;
  onGap: () => void;
  onError: () => void;
}>;

export type WorkspaceWatchHandle = Readonly<{
  close: () => void | Promise<void>;
}>;

export type WorkspaceWatchAdapter = Readonly<{
  open: (proof: MainWorkspaceRootProof, listener: WorkspaceWatchListener) => WorkspaceWatchHandle;
  baseline: (
    proof: MainWorkspaceRootProof,
  ) => Iterable<WorkspaceBaselineEntry> | AsyncIterable<WorkspaceBaselineEntry>;
}>;

export type WorkspaceConsumer = (observation: WorkspaceObservation) => void | Promise<void>;

export type WorkspaceSubscription = Readonly<{
  release: () => Promise<void>;
}>;

export type MainWorkspaceRuntime = Readonly<{
  switchMain: (root: ResourceRef) => Promise<WorkspaceSnapshot>;
  subscribe: (consumer: WorkspaceConsumer) => Promise<WorkspaceSubscription>;
  reportGap: () => Promise<WorkspaceSnapshot>;
  retryMain: () => Promise<WorkspaceSnapshot>;
  snapshot: () => WorkspaceSnapshot | null;
  close: () => Promise<void>;
}>;

export class WorkspaceRootAuthorizationError extends Error {
  readonly code = "workspace_root_not_authorized";

  constructor() {
    super("main workspace root authorization is unavailable");
  }
}

export function createMainWorkspaceRuntime({
  rootAuthority,
  watchAdapter,
}: {
  rootAuthority: MainWorkspaceRootAuthority;
  watchAdapter: WorkspaceWatchAdapter;
}): MainWorkspaceRuntime {
  return new WorkspaceWatchCoordinator(rootAuthority, watchAdapter);
}

export class WorkspaceWatchCoordinator implements MainWorkspaceRuntime {
  readonly #rootAuthority: MainWorkspaceRootAuthority;
  readonly #watchAdapter: WorkspaceWatchAdapter;
  #session: MainWorkspaceSession | null = null;
  #tail: Promise<void> = Promise.resolve();

  constructor(rootAuthority: MainWorkspaceRootAuthority, watchAdapter: WorkspaceWatchAdapter) {
    this.#rootAuthority = rootAuthority;
    this.#watchAdapter = watchAdapter;
  }

  async switchMain(root: ResourceRef): Promise<WorkspaceSnapshot> {
    return this.#withLock(async () => {
      const proof = await this.#proveMain(root);
      if (this.#session) await this.#session.close();

      let session!: MainWorkspaceSession;
      session = new MainWorkspaceSession({
        proof,
        rootAuthority: this.#rootAuthority,
        watchAdapter: this.#watchAdapter,
        requestGapRepair: () => void this.#withLock(async () => {
          if (this.#session === session) await session.repair("event-gap");
        }),
        requestWatchFailure: () => void this.#withLock(async () => {
          if (this.#session === session) await session.markWatchFailure();
        }),
      });
      this.#session = session;
      return session.snapshot();
    });
  }

  async subscribe(consumer: WorkspaceConsumer): Promise<WorkspaceSubscription> {
    if (typeof consumer !== "function") throw new TypeError("workspace consumer must be a function");

    return this.#withLock(async () => {
      const session = this.#requireSession();
      const subscriptionId = session.addConsumer(consumer);
      await session.ensureObserved();
      let released = false;
      return Object.freeze({
        release: async () => {
          if (released) return;
          released = true;
          await this.#withLock(async () => session.releaseConsumer(subscriptionId));
        },
      });
    });
  }

  async reportGap(): Promise<WorkspaceSnapshot> {
    return this.#withLock(async () => {
      const session = this.#requireSession();
      await session.repair("event-gap");
      return session.snapshot();
    });
  }

  async retryMain(): Promise<WorkspaceSnapshot> {
    return this.#withLock(async () => {
      const session = this.#requireSession();
      await session.repair("retry");
      return session.snapshot();
    });
  }

  snapshot(): WorkspaceSnapshot | null {
    return this.#session?.snapshot() ?? null;
  }

  async close(): Promise<void> {
    await this.#withLock(async () => {
      if (!this.#session) return;
      await this.#session.close();
      this.#session = null;
    });
  }

  async #proveMain(root: ResourceRef): Promise<MainWorkspaceRootProof> {
    if (root.kind !== "local-file") throw new WorkspaceRootAuthorizationError();
    let proof: MainWorkspaceRootProof | null = null;
    try {
      proof = await this.#rootAuthority.proveMain(root);
    } catch {
      throw new WorkspaceRootAuthorizationError();
    }
    if (!isValidRootProof(proof)) throw new WorkspaceRootAuthorizationError();
    return proof;
  }

  #requireSession(): MainWorkspaceSession {
    if (!this.#session) throw new WorkspaceRootAuthorizationError();
    return this.#session;
  }

  #withLock<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.#tail.then(operation, operation);
    this.#tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

class MainWorkspaceSession {
  readonly #rootAuthority: MainWorkspaceRootAuthority;
  readonly #watchAdapter: WorkspaceWatchAdapter;
  readonly #requestGapRepair: () => void;
  readonly #requestWatchFailure: () => void;
  readonly #consumers = new Map<number, WorkspaceConsumer>();
  readonly #baselineEntries = new Map<string, WorkspaceBaselineObservation>();
  #proof: MainWorkspaceRootProof;
  #watcher: WorkspaceWatchHandle | null = null;
  #nextConsumerId = 1;
  #initialBaselineAttempted = false;
  #baselineComplete = false;
  #closed = false;
  #health: WorkspaceHealth = "RECONCILING";
  #cursor = 0;
  #repairCycle = 0;

  constructor({
    proof,
    rootAuthority,
    watchAdapter,
    requestGapRepair,
    requestWatchFailure,
  }: {
    proof: MainWorkspaceRootProof;
    rootAuthority: MainWorkspaceRootAuthority;
    watchAdapter: WorkspaceWatchAdapter;
    requestGapRepair: () => void;
    requestWatchFailure: () => void;
  }) {
    this.#proof = proof;
    this.#rootAuthority = rootAuthority;
    this.#watchAdapter = watchAdapter;
    this.#requestGapRepair = requestGapRepair;
    this.#requestWatchFailure = requestWatchFailure;
  }

  snapshot(): WorkspaceSnapshot {
    return Object.freeze({
      sourceKey: MAIN_WORKSPACE_SOURCE_KEY,
      health: this.#health,
      cursor: this.#cursor,
      repairCycle: this.#repairCycle,
      consumerCount: this.#consumers.size,
      observing: this.#watcher !== null,
    });
  }

  addConsumer(consumer: WorkspaceConsumer): number {
    const id = this.#nextConsumerId;
    this.#nextConsumerId += 1;
    this.#consumers.set(id, consumer);
    if (this.#baselineComplete) {
      for (const observation of this.#baselineEntries.values()) {
        this.#deliver(consumer, observation);
      }
    }
    this.#deliver(consumer, this.#healthObservation("initializing"));
    return id;
  }

  async releaseConsumer(subscriptionId: number): Promise<void> {
    this.#consumers.delete(subscriptionId);
    if (this.#consumers.size === 0) await this.#closeWatcher();
  }

  async ensureObserved(): Promise<void> {
    if (this.#closed || this.#health === "FAILED") return;
    if (!this.#watcher && !this.#startWatcher()) return;
    if (!this.#initialBaselineAttempted) {
      this.#initialBaselineAttempted = true;
      await this.#runBaseline("initializing");
    }
  }

  async repair(reason: Extract<WorkspaceHealthReason, "event-gap" | "retry">): Promise<void> {
    if (this.#closed) return;
    this.#setHealth("DEGRADED", reason);
    const proof = await this.#revalidate();
    if (!proof) {
      try {
        await this.#closeWatcher();
      } catch {
        this.#setHealth("FAILED", "watch-error");
      }
      return;
    }
    try {
      await this.#closeWatcher();
    } catch {
      this.#setHealth("FAILED", "watch-error");
      return;
    }
    if (!this.#startWatcher()) return;
    await this.#runBaseline(reason);
  }

  async markWatchFailure(): Promise<void> {
    if (this.#closed) return;
    this.#setHealth("DEGRADED", "watch-error");
    try {
      await this.#closeWatcher();
    } catch {
      this.#setHealth("FAILED", "watch-error");
    }
  }

  async close(): Promise<void> {
    await this.#closeWatcher();
    this.#closed = true;
    this.#consumers.clear();
    this.#baselineEntries.clear();
    this.#baselineComplete = false;
  }

  #startWatcher(): boolean {
    try {
      const watcher = this.#watchAdapter.open(this.#proof, {
        onChange: (change) => this.#handleChange(change),
        onGap: this.#requestGapRepair,
        onError: this.#requestWatchFailure,
      });
      if (!watcher || typeof watcher.close !== "function") throw new Error("invalid workspace watcher");
      this.#watcher = watcher;
      return true;
    } catch {
      this.#setHealth("FAILED", "watch-error");
      return false;
    }
  }

  async #closeWatcher(): Promise<void> {
    const watcher = this.#watcher;
    if (!watcher) return;
    await watcher.close();
    this.#watcher = null;
  }

  async #runBaseline(reason: WorkspaceHealthReason): Promise<void> {
    this.#setHealth("RECONCILING", reason);
    this.#baselineComplete = false;
    this.#baselineEntries.clear();
    this.#repairCycle += 1;
    try {
      for await (const entry of asAsyncIterable(this.#watchAdapter.baseline(this.#proof))) {
        if (!isValidBaselineEntry(entry)) throw new Error("invalid workspace baseline entry");
        this.#cursor += 1;
        const observation = Object.freeze({
          type: "workspace.baseline" as const,
          sourceKey: MAIN_WORKSPACE_SOURCE_KEY,
          relativePath: entry.relativePath,
          entryKind: entry.kind,
          cursor: this.#cursor,
          repairCycle: this.#repairCycle,
        });
        this.#baselineEntries.set(entry.relativePath, observation);
        this.#publish(observation);
      }
      this.#baselineComplete = true;
      this.#setHealth("HEALTHY", reason);
    } catch {
      this.#baselineEntries.clear();
      this.#baselineComplete = false;
      this.#setHealth("FAILED", "baseline-failed");
      try {
        await this.#closeWatcher();
      } catch {
        this.#setHealth("FAILED", "watch-error");
      }
    }
  }

  async #revalidate(): Promise<MainWorkspaceRootProof | null> {
    let proof: MainWorkspaceRootProof | null = null;
    try {
      proof = await this.#rootAuthority.revalidateMain(this.#proof);
    } catch {
      this.#baselineEntries.clear();
      this.#baselineComplete = false;
      this.#setHealth("FAILED", "root-unavailable");
      return null;
    }
    if (!isValidRootProof(proof)) {
      this.#baselineEntries.clear();
      this.#baselineComplete = false;
      this.#setHealth("FAILED", "root-unavailable");
      return null;
    }
    if (!sameRootIdentity(this.#proof.identity, proof.identity)) {
      this.#baselineEntries.clear();
      this.#baselineComplete = false;
      this.#setHealth("FAILED", "root-replaced");
      return null;
    }
    this.#proof = proof;
    return proof;
  }

  #handleChange(change: WorkspaceWatchChange): void {
    if (this.#closed || !isValidWatchChange(change)) {
      this.#requestGapRepair();
      return;
    }
    this.#cursor += 1;
    const observation = Object.freeze({
      type: "workspace.changed" as const,
      sourceKey: MAIN_WORKSPACE_SOURCE_KEY,
      relativePath: change.relativePath,
      changeType: change.changeType,
      cursor: this.#cursor,
      repairCycle: this.#repairCycle,
    });
    if (change.changeType === "deleted") {
      this.#baselineEntries.delete(change.relativePath);
    } else {
      this.#baselineEntries.set(change.relativePath, Object.freeze({
        type: "workspace.baseline" as const,
        sourceKey: MAIN_WORKSPACE_SOURCE_KEY,
        relativePath: change.relativePath,
        entryKind: "file" as const,
        cursor: this.#cursor,
        repairCycle: this.#repairCycle,
      }));
    }
    this.#publish(observation);
  }

  #setHealth(health: WorkspaceHealth, reason: WorkspaceHealthReason): void {
    if (this.#health === health) return;
    this.#health = health;
    this.#publish(this.#healthObservation(reason));
  }

  #healthObservation(reason: WorkspaceHealthReason): WorkspaceObservation {
    return Object.freeze({
      type: "workspace.health" as const,
      sourceKey: MAIN_WORKSPACE_SOURCE_KEY,
      health: this.#health,
      reason,
      cursor: this.#cursor,
      repairCycle: this.#repairCycle,
    });
  }

  #publish(observation: WorkspaceObservation): void {
    for (const consumer of this.#consumers.values()) this.#deliver(consumer, observation);
  }

  #deliver(consumer: WorkspaceConsumer, observation: WorkspaceObservation): void {
    try {
      const result = consumer(observation);
      if (result && typeof (result as PromiseLike<unknown>).then === "function") {
        void Promise.resolve(result).catch(() => undefined);
      }
    } catch {
      // Individual projections cannot make the shared observation owner fail.
    }
  }
}

async function* asAsyncIterable<T>(
  source: Iterable<T> | AsyncIterable<T>,
): AsyncIterable<T> {
  if (Symbol.asyncIterator in Object(source)) {
    yield* source as AsyncIterable<T>;
    return;
  }
  yield* source as Iterable<T>;
}

function isValidRootProof(value: MainWorkspaceRootProof | null): value is MainWorkspaceRootProof {
  return Boolean(value)
    && value.root?.kind === "local-file"
    && typeof value.root.path === "string"
    && value.watchTarget !== undefined
    && validIdentity(value.identity);
}

function validIdentity(value: ProviderRootIdentity): boolean {
  return Boolean(value)
    && typeof value.providerId === "string"
    && typeof value.identityNamespace === "string"
    && typeof value.opaqueRootId === "string"
    && typeof value.scopeToken === "string"
    && (value.caseMode === "sensitive" || value.caseMode === "insensitive" || value.caseMode === "unknown");
}

function sameRootIdentity(a: ProviderRootIdentity, b: ProviderRootIdentity): boolean {
  return a.providerId === b.providerId
    && a.identityNamespace === b.identityNamespace
    && a.opaqueRootId === b.opaqueRootId
    && a.scopeToken === b.scopeToken
    && a.caseMode === b.caseMode;
}

function isValidBaselineEntry(value: WorkspaceBaselineEntry): boolean {
  return Boolean(value)
    && isSafeRelativePath(value.relativePath)
    && (value.kind === "file" || value.kind === "directory");
}

function isValidWatchChange(value: WorkspaceWatchChange): boolean {
  return Boolean(value)
    && isSafeRelativePath(value.relativePath)
    && (value.changeType === "created" || value.changeType === "modified" || value.changeType === "deleted");
}

function isSafeRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.startsWith("/") || value.includes("\\")) return false;
  return value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}
