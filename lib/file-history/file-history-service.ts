import { createHash } from "node:crypto";
import path from "node:path";
import type { WorkspaceObservation } from "../../shared/workspace-observation.ts";
import {
  FileHistoryStore,
  type SnapshotOrigin,
} from "./history-store.ts";
import {
  FILE_HISTORY_POLICY,
  MAX_SNAPSHOT_BYTES,
  isIgnoredRelPath,
  isSafeHistoryRelativePath,
  isTrackedFile,
} from "./text-file-policy.ts";

export { FileHistoryStore } from "./history-store.ts";

export const FILE_HISTORY_DEFAULTS = Object.freeze({
  ...FILE_HISTORY_POLICY,
  debounceMs: 150,
  retentionIntervalMs: 24 * 60 * 60 * 1_000,
});

const CAPTURE_BATCH_SIZE = 128;
// A batch limits queue turnover; this lower limit caps retained source bodies.
const MAX_CONCURRENT_CAPTURES = 4;
const CONTROL_CHARACTER = /\p{Cc}/u;
const WINDOWS_DRIVE_PREFIX = /^[A-Za-z]:/;

export type FileHistoryHealth = "HEALTHY" | "DEGRADED" | "RECONCILING" | "FAILED";

export type FileHistoryRead = Readonly<{
  content?: Buffer;
  versionToken?: string | null;
  truncated?: boolean;
}>;

export type FileHistoryReadRequest = Readonly<{
  maxBytes: number;
}>;

export type FileHistorySubscription = Readonly<{
  release: () => void | Promise<void>;
}>;

export type MainFileHistoryEvent =
  | Readonly<{
    type: "main.resource.changed";
    sourceKey: "main";
    relativePath: string;
    versionToken?: string | null;
    operationContext?: string | null;
  }>
  | Readonly<{
    type: "main.resource.deleted";
    sourceKey: "main";
    relativePath: string;
  }>
  | Readonly<{
    type: "main.resource.renamed";
    sourceKey: "main";
    oldRelativePath: string;
    newRelativePath: string | null;
    versionToken?: string | null;
    operationContext?: string | null;
  }>;

export type MainFileHistoryBinding = Readonly<{
  sourceKey: "main";
  historyStoreKey: string;
  verifyPrivateStorePath: (candidateStorePath: string) => boolean | Promise<boolean>;
  subscribe: (consumer: (observation: WorkspaceObservation) => void | Promise<void>) => Promise<FileHistorySubscription>;
  subscribeEvents?: (consumer: (event: MainFileHistoryEvent) => void | Promise<void>) => (() => void);
  // The adapter must honor maxBytes before materializing content and signal a truncated read.
  read: (relativePath: string, request: FileHistoryReadRequest) => Promise<FileHistoryRead | null>;
}>;

type CreateStore = (input: {
  dbPath: string;
  mergeWindowMs: number;
  now: () => number;
}) => FileHistoryStore;

type CaptureRequest = {
  relativePath: string;
  origin: SnapshotOrigin;
  operationContext: string | null;
  versionToken: string | null;
  pathGeneration: number;
};

type BaselineCycle = {
  seenPaths: Set<string>;
};

type StoreMutation =
  | Readonly<{
    type: "delete";
    relativePath: string;
    deletedAt: number;
  }>
  | Readonly<{
    type: "rename";
    oldRelativePath: string;
    newRelativePath: string;
  }>;

type StoreOperation = StoreMutation | Readonly<{
  type: "reconcile";
  repairCycle: number;
}>;

type MainEntry = {
  binding: MainFileHistoryBinding;
  dbPath: string;
  store: FileHistoryStore;
  subscription: FileHistorySubscription | null;
  releaseEvents: (() => void) | null;
  retentionTimer: ReturnType<typeof setInterval> | null;
  captureTimer: ReturnType<typeof setTimeout> | null;
  drainPromise: Promise<void> | null;
  pending: Map<string, CaptureRequest>;
  failedCaptures: Map<string, CaptureRequest>;
  inflight: Set<Promise<unknown>>;
  pathGenerations: Map<string, number>;
  baselineCycles: Map<number, BaselineCycle>;
  failedStoreOperations: Map<string, StoreOperation>;
  latestObservedRepairCycle: number;
  lastReconciledBaselineCycle: number;
  knownCapturePaths: Set<string>;
  unresolvedSharedCycles: Map<number, "RECONCILING" | "DEGRADED" | "FAILED">;
  retentionFailed: boolean;
  generation: number;
  retired: boolean;
};

type PendingMain = Readonly<{
  binding: MainFileHistoryBinding;
  dbPath: string;
}>;

export class FileHistoryScopeError extends Error {}
export class FileHistoryPrivateStoreError extends Error {}

export class FileHistoryService {
  declare _privateStoreRoot: string;
  declare _createStore: CreateStore;
  declare _log: (message: string) => void;
  declare _now: () => number;
  declare _mergeWindowMs: number;
  declare _maxAgeMs: number;
  declare _maxTotalBytes: number;
  declare _debounceMs: number;
  declare _retentionIntervalMs: number;
  declare _entry: MainEntry | null;
  declare _pendingMain: PendingMain | null;
  declare _health: FileHistoryHealth | null;
  declare _retiredDisposals: Set<Promise<void>>;
  declare _lifecycleTail: Promise<void>;
  declare _lifecycleGeneration: number;

  constructor({
    privateStoreRoot,
    createStore = (input) => new FileHistoryStore(input),
    log = () => {},
    now = () => Date.now(),
    mergeWindowMs = FILE_HISTORY_DEFAULTS.mergeWindowMs,
    maxAgeMs = FILE_HISTORY_DEFAULTS.maxAgeMs,
    maxTotalBytes = FILE_HISTORY_DEFAULTS.maxTotalBytes,
    debounceMs = FILE_HISTORY_DEFAULTS.debounceMs,
    retentionIntervalMs = FILE_HISTORY_DEFAULTS.retentionIntervalMs,
  }: {
    privateStoreRoot: string;
    createStore?: CreateStore;
    log?: (message: string) => void;
    now?: () => number;
    mergeWindowMs?: number;
    maxAgeMs?: number;
    maxTotalBytes?: number;
    debounceMs?: number;
    retentionIntervalMs?: number;
  }) {
    this._privateStoreRoot = path.resolve(privateStoreRoot);
    this._createStore = createStore;
    this._log = log;
    this._now = now;
    this._mergeWindowMs = mergeWindowMs;
    this._maxAgeMs = maxAgeMs;
    this._maxTotalBytes = maxTotalBytes;
    this._debounceMs = debounceMs;
    this._retentionIntervalMs = retentionIntervalMs;
    this._entry = null;
    this._pendingMain = null;
    this._health = null;
    this._retiredDisposals = new Set();
    this._lifecycleTail = Promise.resolve();
    this._lifecycleGeneration = 0;
  }

  async activateMain(binding: MainFileHistoryBinding): Promise<FileHistoryHealth> {
    return this._withLifecycle(async () => {
      const pending = await this._prepareBinding(binding);
      const generation = this._nextLifecycleGeneration();
      await this._closeActive();
      this._pendingMain = pending;
      return this._openPending(generation);
    });
  }

  async retryMainHistory(): Promise<FileHistoryHealth> {
    return this._withLifecycle(async () => {
      const entry = this._entry;
      if (!entry) {
        return this._pendingMain ? this._openPending(this._lifecycleGeneration) : "FAILED";
      }
      if (!this._isCurrentEntry(entry)) return this._health || "FAILED";

      this._retryStoreOperations(entry, [...entry.failedStoreOperations.values()]);
      if (!this._isCurrentEntry(entry)) return this._health || "FAILED";

      const failedCaptures = [...entry.failedCaptures.values()];
      await this._captureRequests(entry, failedCaptures);
      if (!this._isCurrentEntry(entry)) return this._health || "FAILED";

      this._enforceRetention(entry, "retry");
      this._recomputeHealth(entry);
      return this._health || "FAILED";
    });
  }

  isAvailable(): boolean {
    return this._entry !== null && this._health !== "FAILED";
  }

  getHealth(): FileHistoryHealth | null {
    return this._health;
  }

  listFiles() {
    return this._requireEntry().store.listFiles();
  }

  listVersions(relPath: string) {
    return this._requireEntry().store.listVersions(relPath);
  }

  getSnapshotContent(snapshotId: number) {
    return this._requireEntry().store.getSnapshotContent(snapshotId);
  }

  getSnapshotDiff(snapshotId: number, baseSnapshotId?: number) {
    return this._requireEntry().store.getSnapshotDiff(snapshotId, baseSnapshotId);
  }

  async waitForIdle(): Promise<void> {
    const entry = this._entry;
    if (!entry) return;
    while (this._isCurrentEntry(entry)) {
      if (entry.captureTimer) {
        await new Promise(resolve => setTimeout(resolve, Math.max(1, this._debounceMs) + 5));
        continue;
      }
      if (entry.inflight.size) {
        await Promise.allSettled([...entry.inflight]);
        continue;
      }
      if (!entry.drainPromise && entry.pending.size === 0) return;
      await Promise.resolve();
    }
  }

  async close(): Promise<void> {
    return this._withLifecycle(async () => {
      this._nextLifecycleGeneration();
      this._pendingMain = null;
      await this._closeActive();
      while (this._retiredDisposals.size) await Promise.allSettled([...this._retiredDisposals]);
      this._health = null;
    });
  }

  async _prepareBinding(binding: MainFileHistoryBinding): Promise<PendingMain> {
    if (!binding || binding.sourceKey !== "main") {
      throw new FileHistoryScopeError("file-history accepts only the authorized main source");
    }
    if (typeof binding.subscribe !== "function" || typeof binding.read !== "function") {
      throw new FileHistoryScopeError("file-history main binding is incomplete");
    }
    if (typeof binding.verifyPrivateStorePath !== "function") {
      throw new FileHistoryPrivateStoreError("file-history requires private store verification");
    }
    const dbPath = historyStorePathForKey(this._privateStoreRoot, binding.historyStoreKey);
    if (!await binding.verifyPrivateStorePath(dbPath)) {
      throw new FileHistoryPrivateStoreError("private file-history store must remain outside the workspace");
    }
    return Object.freeze({ binding, dbPath });
  }

  async _openPending(generation: number): Promise<FileHistoryHealth> {
    const pending = this._pendingMain;
    if (!pending || !this._isCurrentLifecycle(generation)) return "FAILED";
    this._health = "RECONCILING";
    let entry: MainEntry | null = null;
    try {
      const store = this._createStore({
        dbPath: pending.dbPath,
        mergeWindowMs: this._mergeWindowMs,
        now: this._now,
      });
      entry = {
        binding: pending.binding,
        dbPath: pending.dbPath,
        store,
        subscription: null,
        releaseEvents: null,
        retentionTimer: null,
        captureTimer: null,
        drainPromise: null,
        pending: new Map(),
        failedCaptures: new Map(),
        inflight: new Set(),
        pathGenerations: new Map(),
        baselineCycles: new Map(),
        failedStoreOperations: new Map(),
        latestObservedRepairCycle: -1,
        lastReconciledBaselineCycle: -1,
        knownCapturePaths: new Set(),
        unresolvedSharedCycles: new Map(),
        retentionFailed: false,
        generation,
        retired: false,
      };
      this._entry = entry;

      const subscription = await entry.binding.subscribe(observation => this._acceptObservation(entry!, observation));
      entry.subscription = subscription;
      if (!subscription || typeof subscription.release !== "function") {
        throw new FileHistoryScopeError("file-history observation subscription is incomplete");
      }
      if (!this._isCurrentEntry(entry)) {
        await this._disposeEntry(entry);
        return this._health || "FAILED";
      }

      if (entry.binding.subscribeEvents) {
        entry.releaseEvents = entry.binding.subscribeEvents(event => this._acceptEvent(entry!, event));
      }
      if (!this._isCurrentEntry(entry)) {
        await this._disposeEntry(entry);
        return this._health || "FAILED";
      }

      this._enforceRetention(entry, "initialization");
      if (this._retentionIntervalMs > 0) {
        entry.retentionTimer = setInterval(() => {
          if (!this._isCurrentEntry(entry!)) return;
          this._enforceRetention(entry!, "retention");
        }, this._retentionIntervalMs);
        entry.retentionTimer.unref?.();
      }
      this._recomputeHealth(entry);
      return this._health || "FAILED";
    } catch (error) {
      if (this._entry === entry) this._entry = null;
      await this._disposeEntry(entry);
      if (this._isCurrentLifecycle(generation)) {
        this._health = "FAILED";
        this._logFailure("initialization", error);
      }
      return this._health || "FAILED";
    }
  }

  async _closeActive(): Promise<void> {
    const entry = this._entry;
    this._entry = null;
    await this._disposeEntry(entry);
  }

  async _disposeEntry(entry: MainEntry | null): Promise<void> {
    if (!entry || entry.retired) return;
    entry.retired = true;
    if (entry.retentionTimer) clearInterval(entry.retentionTimer);
    if (entry.captureTimer) clearTimeout(entry.captureTimer);
    entry.captureTimer = null;
    entry.pending.clear();
    entry.failedCaptures.clear();
    entry.baselineCycles.clear();
    entry.failedStoreOperations.clear();
    entry.knownCapturePaths.clear();
    try { entry.releaseEvents?.(); } catch {}
    try { await entry.subscription?.release(); } catch {}
    const disposal = Promise.allSettled([...entry.inflight]).then(() => {
      try { entry.store.close(); } catch {}
    });
    this._retiredDisposals.add(disposal);
    void disposal.then(() => this._retiredDisposals.delete(disposal));
  }

  _acceptObservation(entry: MainEntry, observation: WorkspaceObservation): void {
    if (!this._isCurrentEntry(entry) || observation?.sourceKey !== "main") return;
    try {
      const repairCycle = normalizedRepairCycle(observation.repairCycle);
      const staleRepairCycle = repairCycle < entry.latestObservedRepairCycle;
      if (staleRepairCycle) return;
      if (repairCycle > entry.latestObservedRepairCycle) {
        this._clearStaleReconciliations(entry, repairCycle);
      }
      entry.latestObservedRepairCycle = repairCycle;
      if (observation.type === "workspace.baseline") {
        if (observation.entryKind === "file" && isCapturablePath(observation.relativePath)) {
          this._baselineCycle(entry, observation.repairCycle).seenPaths.add(observation.relativePath);
          this._scheduleCapture(entry, observation.relativePath, "baseline", null, null);
        }
        return;
      }
      if (observation.type === "workspace.changed") {
        if (observation.changeType === "deleted") this._markDeleted(entry, observation.relativePath);
        else this._scheduleCapture(entry, observation.relativePath, "event", "workspace_observation", null);
        return;
      }
      if (observation.type === "workspace.health") this._acceptSharedHealth(entry, observation);
    } catch (error) {
      this._recordEntryFailure(entry, "observation", error);
    }
  }

  _acceptEvent(entry: MainEntry, event: MainFileHistoryEvent): void {
    if (!this._isCurrentEntry(entry) || !event || event.sourceKey !== "main") return;
    try {
      if (event.type === "main.resource.changed") {
        this._scheduleCapture(entry, event.relativePath, "event", event.operationContext || null, event.versionToken || null);
        return;
      }
      if (event.type === "main.resource.deleted") {
        this._markDeleted(entry, event.relativePath);
        return;
      }
      if (event.type === "main.resource.renamed") {
        if (!isCapturablePath(event.oldRelativePath)) return;
        const retainForRetry = this._hasPendingRenameTarget(entry, event.oldRelativePath);
        this._invalidateCapture(entry, event.oldRelativePath);
        if (!event.newRelativePath || !isCapturablePath(event.newRelativePath)) {
          this._markDeleted(entry, event.oldRelativePath, false);
          return;
        }
        entry.knownCapturePaths.delete(event.oldRelativePath);
        this._scheduleCapture(entry, event.newRelativePath, "event", event.operationContext || null, event.versionToken || null);
        this._applyStoreOperation(entry, {
          type: "rename",
          oldRelativePath: event.oldRelativePath,
          newRelativePath: event.newRelativePath,
        }, retainForRetry);
      }
    } catch (error) {
      this._recordEntryFailure(entry, "event", error);
    }
  }

  _markDeleted(entry: MainEntry, relativePath: string, invalidate = true): void {
    if (!isCapturablePath(relativePath)) return;
    if (invalidate) this._invalidateCapture(entry, relativePath);
    entry.knownCapturePaths.delete(relativePath);
    this._applyStoreOperation(entry, {
      type: "delete",
      relativePath,
      deletedAt: this._now(),
    }, this._hasPendingRenameTarget(entry, relativePath));
  }

  _acceptSharedHealth(
    entry: MainEntry,
    observation: Extract<WorkspaceObservation, { type: "workspace.health" }>,
  ): void {
    const repairCycle = normalizedRepairCycle(observation.repairCycle);
    if (observation.health === "HEALTHY") {
      this._reconcileBaselineCycle(entry, repairCycle);
      for (const cycle of entry.unresolvedSharedCycles.keys()) {
        if (cycle <= repairCycle) entry.unresolvedSharedCycles.delete(cycle);
      }
      this._recomputeHealth(entry);
      return;
    }
    if (observation.health === "RECONCILING") this._baselineCycle(entry, repairCycle);
    entry.unresolvedSharedCycles.set(repairCycle, observation.health);
    this._recomputeHealth(entry);
  }

  _reconcileBaselineCycle(entry: MainEntry, repairCycle: number): void {
    const operation: StoreOperation = { type: "reconcile", repairCycle };
    const operationKey = storeOperationKey(operation);
    if (
      !this._isCurrentEntry(entry)
      || repairCycle < entry.latestObservedRepairCycle
      || repairCycle <= entry.lastReconciledBaselineCycle
    ) {
      entry.failedStoreOperations.delete(operationKey);
      return;
    }
    const cycle = entry.baselineCycles.get(repairCycle) || { seenPaths: new Set<string>() };
    const priorPaths = new Set(entry.knownCapturePaths);
    try {
      for (const file of entry.store.listFiles()) priorPaths.add(file.relPath);
    } catch (error) {
      entry.failedStoreOperations.set(operationKey, operation);
      this._logFailure("reconcile", error);
      this._recomputeHealth(entry);
      return;
    }
    for (const relativePath of priorPaths) {
      if (!cycle.seenPaths.has(relativePath)) this._markDeleted(entry, relativePath);
    }
    entry.knownCapturePaths = new Set(cycle.seenPaths);
    entry.lastReconciledBaselineCycle = repairCycle;
    entry.baselineCycles.delete(repairCycle);
    entry.failedStoreOperations.delete(operationKey);
    for (const pendingCycle of entry.baselineCycles.keys()) {
      if (pendingCycle < repairCycle) entry.baselineCycles.delete(pendingCycle);
    }
  }

  _scheduleCapture(
    entry: MainEntry,
    relativePath: string,
    origin: SnapshotOrigin,
    operationContext: string | null,
    versionToken: string | null,
  ): void {
    if (!isCapturablePath(relativePath) || !this._isCurrentEntry(entry)) return;
    this._clearFailedStoreOperationsForCapture(entry, relativePath);
    const pathGeneration = this._nextPathGeneration(entry, relativePath);
    entry.failedCaptures.delete(relativePath);
    entry.knownCapturePaths.add(relativePath);
    entry.pending.set(relativePath, { relativePath, origin, operationContext, versionToken, pathGeneration });
    this._scheduleDrain(entry);
  }

  _scheduleDrain(entry: MainEntry): void {
    if (!this._isCurrentEntry(entry) || entry.captureTimer || entry.drainPromise) return;
    entry.captureTimer = setTimeout(() => {
      entry.captureTimer = null;
      const drain = this._drainCaptures(entry);
      entry.drainPromise = drain;
      this._track(entry, drain);
      void drain.then(
        () => this._finishDrain(entry, drain),
        () => this._finishDrain(entry, drain),
      );
    }, this._debounceMs);
    entry.captureTimer.unref?.();
  }

  _finishDrain(entry: MainEntry, drain: Promise<void>): void {
    if (entry.drainPromise === drain) entry.drainPromise = null;
    if (this._isCurrentEntry(entry) && entry.pending.size) this._scheduleDrain(entry);
  }

  async _drainCaptures(entry: MainEntry): Promise<void> {
    let attemptedCapture = false;
    while (this._isCurrentEntry(entry) && entry.pending.size) {
      const requests: CaptureRequest[] = [];
      for (const [relativePath, request] of entry.pending) {
        entry.pending.delete(relativePath);
        requests.push(request);
        if (requests.length === CAPTURE_BATCH_SIZE) break;
      }
      attemptedCapture ||= requests.length > 0;
      await this._captureRequests(entry, requests);
    }
    if (attemptedCapture && this._isCurrentEntry(entry)) this._enforceRetention(entry, "batch");
  }

  async _captureRequests(entry: MainEntry, requests: CaptureRequest[]): Promise<void> {
    for (let index = 0; index < requests.length; index += MAX_CONCURRENT_CAPTURES) {
      if (!this._isCurrentEntry(entry)) return;
      await Promise.all(requests.slice(index, index + MAX_CONCURRENT_CAPTURES).map(request => this._capture(entry, request)));
    }
  }

  async _capture(entry: MainEntry, request: CaptureRequest): Promise<boolean> {
    if (!this._isCurrentCapture(entry, request)) return false;
    try {
      const read = await entry.binding.read(request.relativePath, { maxBytes: MAX_SNAPSHOT_BYTES });
      if (!this._isCurrentCapture(entry, request)) return false;
      if (!read || read.truncated) {
        this._clearFailedCapture(entry, request);
        this._recomputeHealth(entry);
        return true;
      }
      if (!Buffer.isBuffer(read.content)) throw new TypeError("file-history bounded reader returned no snapshot buffer");
      if (read.content.length > MAX_SNAPSHOT_BYTES) {
        throw new RangeError("file-history bounded reader exceeded the 5 MiB limit");
      }
      entry.store.recordSnapshot({
        relPath: request.relativePath,
        content: read.content,
        origin: request.origin,
        opContext: request.operationContext,
        versionToken: request.versionToken || read.versionToken || null,
        capturedAt: this._now(),
      });
      this._clearFailedCapture(entry, request);
      this._recomputeHealth(entry);
      return true;
    } catch (error) {
      if (!this._isCurrentCapture(entry, request)) return false;
      entry.failedCaptures.set(request.relativePath, request);
      this._recordEntryFailure(entry, "capture", error);
      return false;
    }
  }

  _invalidateCapture(entry: MainEntry, relativePath: string): void {
    this._nextPathGeneration(entry, relativePath);
    entry.pending.delete(relativePath);
    entry.failedCaptures.delete(relativePath);
    this._recomputeHealth(entry);
  }

  _clearFailedCapture(entry: MainEntry, request: CaptureRequest): void {
    const failed = entry.failedCaptures.get(request.relativePath);
    if (failed?.pathGeneration === request.pathGeneration) entry.failedCaptures.delete(request.relativePath);
  }

  _applyStoreOperation(entry: MainEntry, operation: StoreMutation, retainForRetry = false): boolean {
    if (!this._isCurrentEntry(entry)) return false;
    const operationKey = storeOperationKey(operation);
    if (retainForRetry) {
      // A dependent mutation must wait until its rename source is established.
      entry.failedStoreOperations.set(operationKey, operation);
      this._recomputeHealth(entry);
      return true;
    }
    try {
      if (operation.type === "delete") entry.store.markDeleted(operation.relativePath, operation.deletedAt);
      else entry.store.renamePath(operation.oldRelativePath, operation.newRelativePath);
      entry.failedStoreOperations.delete(operationKey);
      this._recomputeHealth(entry);
      return true;
    } catch (error) {
      entry.failedStoreOperations.set(operationKey, operation);
      this._logFailure(operation.type, error);
      this._recomputeHealth(entry);
      return false;
    }
  }

  _retryStoreOperations(entry: MainEntry, operations: StoreOperation[]): void {
    for (const operation of operations) {
      if (!this._isCurrentEntry(entry)) return;
      if (entry.failedStoreOperations.get(storeOperationKey(operation)) !== operation) continue;
      if (operation.type === "reconcile") {
        this._reconcileBaselineCycle(entry, operation.repairCycle);
        if (entry.failedStoreOperations.get(storeOperationKey(operation)) === operation) return;
      } else if (!this._applyStoreOperation(entry, operation)) {
        return;
      }
    }
  }

  _clearFailedStoreOperationsForCapture(entry: MainEntry, relativePath: string): void {
    const invalidatedRenameTargets = new Set<string>();
    for (const [operationKey, operation] of entry.failedStoreOperations) {
      const removesDirectly = (
        (operation.type === "delete" && operation.relativePath === relativePath)
        || (operation.type === "rename" && operation.oldRelativePath === relativePath)
      );
      const removesAsRenameDependent = (
        operation.type === "delete"
          ? invalidatedRenameTargets.has(operation.relativePath)
          : operation.type === "rename" && invalidatedRenameTargets.has(operation.oldRelativePath)
      );
      if (!removesDirectly && !removesAsRenameDependent) continue;
      entry.failedStoreOperations.delete(operationKey);
      if (operation.type === "rename") invalidatedRenameTargets.add(operation.newRelativePath);
    }
  }

  _hasPendingRenameTarget(entry: MainEntry, relativePath: string): boolean {
    for (const operation of entry.failedStoreOperations.values()) {
      if (operation.type === "rename" && operation.newRelativePath === relativePath) return true;
    }
    return false;
  }

  _clearStaleReconciliations(entry: MainEntry, repairCycle: number): void {
    for (const [operationKey, operation] of entry.failedStoreOperations) {
      if (operation.type === "reconcile" && operation.repairCycle < repairCycle) {
        entry.failedStoreOperations.delete(operationKey);
      }
    }
  }

  _nextPathGeneration(entry: MainEntry, relativePath: string): number {
    const generation = (entry.pathGenerations.get(relativePath) || 0) + 1;
    entry.pathGenerations.set(relativePath, generation);
    return generation;
  }

  _baselineCycle(entry: MainEntry, repairCycle: number): BaselineCycle {
    const normalizedCycle = normalizedRepairCycle(repairCycle);
    let cycle = entry.baselineCycles.get(normalizedCycle);
    if (!cycle) {
      cycle = { seenPaths: new Set() };
      entry.baselineCycles.set(normalizedCycle, cycle);
    }
    return cycle;
  }

  _enforceRetention(entry: MainEntry, stage: string): void {
    if (!this._isCurrentEntry(entry)) return;
    try {
      entry.store.enforceRetention({
        maxAgeMs: this._maxAgeMs,
        maxTotalBytes: this._maxTotalBytes,
        now: this._now(),
      });
      entry.retentionFailed = false;
    } catch (error) {
      entry.retentionFailed = true;
      this._logFailure(stage, error);
    }
    this._recomputeHealth(entry);
  }

  _recordEntryFailure(entry: MainEntry, stage: string, error: unknown): void {
    if (!this._isCurrentEntry(entry)) return;
    this._logFailure(stage, error);
    this._recomputeHealth(entry);
  }

  _recomputeHealth(entry: MainEntry): void {
    if (!this._isCurrentEntry(entry)) return;
    const sharedStates = [...entry.unresolvedSharedCycles.values()];
    const hasSharedFailure = sharedStates.some(state => state === "DEGRADED" || state === "FAILED");
    const hasSharedReconciliation = sharedStates.some(state => state === "RECONCILING");
    if (hasSharedFailure || entry.failedCaptures.size > 0 || entry.failedStoreOperations.size > 0 || entry.retentionFailed) {
      this._health = "DEGRADED";
      return;
    }
    this._health = hasSharedReconciliation ? "RECONCILING" : "HEALTHY";
  }

  _track(entry: MainEntry, promise: Promise<unknown>): void {
    entry.inflight.add(promise);
    void promise.then(
      () => entry.inflight.delete(promise),
      () => entry.inflight.delete(promise),
    );
  }

  _requireEntry(): MainEntry {
    if (!this._entry || this._health === "FAILED") throw new Error("file-history main store is unavailable");
    return this._entry;
  }

  _isCurrentEntry(entry: MainEntry): boolean {
    return this._entry === entry
      && !entry.retired
      && entry.generation === this._lifecycleGeneration;
  }

  _isCurrentCapture(entry: MainEntry, request: CaptureRequest): boolean {
    return this._isCurrentEntry(entry)
      && entry.pathGenerations.get(request.relativePath) === request.pathGeneration;
  }

  _nextLifecycleGeneration(): number {
    this._lifecycleGeneration += 1;
    return this._lifecycleGeneration;
  }

  _isCurrentLifecycle(generation: number): boolean {
    return generation === this._lifecycleGeneration;
  }

  _withLifecycle<T>(operation: () => Promise<T>): Promise<T> {
    const run = this._lifecycleTail.then(operation, operation);
    this._lifecycleTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  _logFailure(stage: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this._log(`file-history ${stage} failed: ${message}`);
  }
}

function storeOperationKey(operation: StoreOperation): string {
  if (operation.type === "delete") return JSON.stringify([operation.type, operation.relativePath]);
  if (operation.type === "rename") {
    return JSON.stringify([operation.type, operation.oldRelativePath, operation.newRelativePath]);
  }
  return JSON.stringify([operation.type, operation.repairCycle]);
}

export function historyStorePathForKey(privateStoreRoot: string, historyStoreKey: string): string {
  if (
    typeof historyStoreKey !== "string"
    || !historyStoreKey
    || historyStoreKey.length > 512
    || /[\\/]/.test(historyStoreKey)
    || CONTROL_CHARACTER.test(historyStoreKey)
    || WINDOWS_DRIVE_PREFIX.test(historyStoreKey)
  ) {
    throw new FileHistoryPrivateStoreError("file-history store key must be opaque");
  }
  const root = path.resolve(privateStoreRoot);
  const keyHash = createHash("sha256").update(historyStoreKey).digest("hex");
  const dbPath = path.join(root, "file-history", keyHash, "history.sqlite");
  const relative = path.relative(root, dbPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new FileHistoryPrivateStoreError("file-history store path escaped its private root");
  }
  return dbPath;
}

function normalizedRepairCycle(value: unknown): number {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function isCapturablePath(relativePath: unknown): relativePath is string {
  return isSafeHistoryRelativePath(relativePath)
    && !isIgnoredRelPath(relativePath)
    && isTrackedFile(relativePath);
}
