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

export type FileHistoryHealth = "HEALTHY" | "DEGRADED" | "RECONCILING" | "FAILED";

export type FileHistoryRead = Readonly<{
  content: Buffer;
  versionToken?: string | null;
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
  read: (relativePath: string) => Promise<FileHistoryRead | null>;
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
};

type PendingCapture = CaptureRequest & { timer: ReturnType<typeof setTimeout> };

type MainEntry = {
  binding: MainFileHistoryBinding;
  dbPath: string;
  store: FileHistoryStore;
  subscription: FileHistorySubscription | null;
  releaseEvents: (() => void) | null;
  retentionTimer: ReturnType<typeof setInterval> | null;
  pending: Map<string, PendingCapture>;
  failedCaptures: Map<string, CaptureRequest>;
  inflight: Set<Promise<unknown>>;
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
  }

  async activateMain(binding: MainFileHistoryBinding): Promise<FileHistoryHealth> {
    const pending = await this._prepareBinding(binding);
    await this._closeActive();
    this._pendingMain = pending;
    return this._openPending();
  }

  async retryMainHistory(): Promise<FileHistoryHealth> {
    if (this._entry) {
      const entry = this._entry;
      this._health = "RECONCILING";
      const failedCaptures = [...entry.failedCaptures.values()];
      entry.failedCaptures.clear();
      const retryResults = await Promise.all(failedCaptures.map(request => this._capture(
        entry,
        request.relativePath,
        request.origin,
        request.operationContext,
        request.versionToken,
      )));
      if (!this._isCurrentEntry(entry)) return this._health || "FAILED";
      let retentionSucceeded = true;
      try {
        entry.store.enforceRetention({
          maxAgeMs: this._maxAgeMs,
          maxTotalBytes: this._maxTotalBytes,
          now: this._now(),
        });
      } catch (error) {
        retentionSucceeded = false;
        this._recordFailure("retry", error, "DEGRADED");
      }
      if (retentionSucceeded && retryResults.every(Boolean) && entry.failedCaptures.size === 0) this._health = "HEALTHY";
      return this._health || "FAILED";
    }
    return this._pendingMain ? this._openPending() : "FAILED";
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
    await new Promise(resolve => setTimeout(resolve, this._debounceMs + 5));
    while (entry.inflight.size) await Promise.allSettled([...entry.inflight]);
  }

  async close(): Promise<void> {
    await this._closeActive();
    while (this._retiredDisposals.size) await Promise.allSettled([...this._retiredDisposals]);
    this._pendingMain = null;
    this._health = null;
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

  async _openPending(): Promise<FileHistoryHealth> {
    const pending = this._pendingMain;
    if (!pending) return "FAILED";
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
        pending: new Map(),
        failedCaptures: new Map(),
        inflight: new Set(),
        retired: false,
      };
      this._entry = entry;
      entry.subscription = await entry.binding.subscribe(observation => this._acceptObservation(entry!, observation));
      if (entry.binding.subscribeEvents) {
        entry.releaseEvents = entry.binding.subscribeEvents(event => this._acceptEvent(entry!, event));
      }
      entry.store.enforceRetention({
        maxAgeMs: this._maxAgeMs,
        maxTotalBytes: this._maxTotalBytes,
        now: this._now(),
      });
      entry.retentionTimer = setInterval(() => {
        if (this._entry !== entry) return;
        try {
          entry.store.enforceRetention({
            maxAgeMs: this._maxAgeMs,
            maxTotalBytes: this._maxTotalBytes,
            now: this._now(),
          });
        } catch (error) {
          this._recordFailure("retention", error, "DEGRADED");
        }
      }, this._retentionIntervalMs);
      entry.retentionTimer.unref?.();
      this._health = "HEALTHY";
      return this._health;
    } catch (error) {
      if (this._entry === entry) this._entry = null;
      await this._disposeEntry(entry);
      this._recordFailure("initialization", error, "FAILED");
      return "FAILED";
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
    for (const capture of entry.pending.values()) clearTimeout(capture.timer);
    entry.pending.clear();
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
      if (observation.type === "workspace.baseline") {
        if (observation.entryKind === "file") this._scheduleCapture(entry, observation.relativePath, "baseline", null, null);
        return;
      }
      if (observation.type === "workspace.changed") {
        if (observation.changeType === "deleted") this._markDeleted(entry, observation.relativePath);
        else this._scheduleCapture(entry, observation.relativePath, "event", "workspace_observation", null);
        return;
      }
      if (observation.type === "workspace.health" && (observation.health === "DEGRADED" || observation.health === "FAILED")) {
        if (this._health !== "FAILED") this._health = "DEGRADED";
      }
    } catch (error) {
      this._recordFailure("observation", error, "DEGRADED");
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
        if (!event.newRelativePath || !isCapturablePath(event.newRelativePath)) {
          this._markDeleted(entry, event.oldRelativePath);
          return;
        }
        entry.store.renamePath(event.oldRelativePath, event.newRelativePath);
        this._scheduleCapture(entry, event.newRelativePath, "event", event.operationContext || null, event.versionToken || null);
      }
    } catch (error) {
      this._recordFailure("event", error, "DEGRADED");
    }
  }

  _markDeleted(entry: MainEntry, relativePath: string): void {
    if (!isCapturablePath(relativePath)) return;
    try {
      entry.store.markDeleted(relativePath, this._now());
    } catch (error) {
      this._recordFailure("delete", error, "DEGRADED");
    }
  }

  _scheduleCapture(
    entry: MainEntry,
    relativePath: string,
    origin: SnapshotOrigin,
    operationContext: string | null,
    versionToken: string | null,
  ): void {
    if (!isCapturablePath(relativePath)) return;
    const prior = entry.pending.get(relativePath);
    if (prior) clearTimeout(prior.timer);
    const timer = setTimeout(() => {
      entry.pending.delete(relativePath);
      this._track(entry, this._capture(entry, relativePath, origin, operationContext, versionToken));
    }, this._debounceMs);
    timer.unref?.();
    entry.pending.set(relativePath, { timer, relativePath, origin, operationContext, versionToken });
  }

  async _capture(
    entry: MainEntry,
    relativePath: string,
    origin: SnapshotOrigin,
    operationContext: string | null,
    versionToken: string | null,
  ): Promise<boolean> {
    if (!this._isCurrentEntry(entry)) return false;
    try {
      const read = await entry.binding.read(relativePath);
      if (!this._isCurrentEntry(entry)) return false;
      if (!read || !Buffer.isBuffer(read.content)) return true;
      if (read.content.length > MAX_SNAPSHOT_BYTES) return true;
      entry.store.recordSnapshot({
        relPath: relativePath,
        content: read.content,
        origin,
        opContext: operationContext,
        versionToken: versionToken || read.versionToken || null,
        capturedAt: this._now(),
      });
      entry.store.enforceRetention({
        maxAgeMs: this._maxAgeMs,
        maxTotalBytes: this._maxTotalBytes,
        now: this._now(),
      });
      if (this._health === "DEGRADED") this._health = "HEALTHY";
      entry.failedCaptures.delete(relativePath);
      return true;
    } catch (error) {
      if (!this._isCurrentEntry(entry)) return false;
      entry.failedCaptures.set(relativePath, { relativePath, origin, operationContext, versionToken });
      this._recordFailure("capture", error, "DEGRADED");
      return false;
    }
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
    return this._entry === entry && !entry.retired;
  }

  _recordFailure(stage: string, error: unknown, health: FileHistoryHealth): void {
    this._health = health;
    const message = error instanceof Error ? error.message : String(error);
    this._log(`file-history ${stage} failed: ${message}`);
  }
}

export function historyStorePathForKey(privateStoreRoot: string, historyStoreKey: string): string {
  if (typeof historyStoreKey !== "string" || !historyStoreKey || historyStoreKey.length > 512 || /[\\/\0]/.test(historyStoreKey)) {
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

function isCapturablePath(relativePath: unknown): relativePath is string {
  return isSafeHistoryRelativePath(relativePath)
    && !isIgnoredRelPath(relativePath)
    && isTrackedFile(relativePath);
}
