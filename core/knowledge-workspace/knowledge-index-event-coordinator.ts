import crypto from "node:crypto";
import path from "node:path";
import {
  KnowledgeIndexCoordinator,
} from "./knowledge-index-coordinator.ts";
import {
  type KnowledgeIndexHealth,
  type KnowledgeIndexIncrementalChange,
  type KnowledgeIndexResourceDocument,
} from "../../lib/knowledge-workspace/knowledge-index-store.ts";
import {
  extractSavedMarkdownIndexFacts,
  MarkdownIndexVersionConflictError,
} from "../../lib/knowledge-workspace/markdown-index-extractor.ts";
import {
  extractSafeTextIndexFacts,
} from "../../lib/knowledge-workspace/safe-text-index-extractor.ts";
import {
  canonicalKnowledgeRelativePath,
} from "../../lib/knowledge-workspace/knowledge-address.ts";
import type { ResourceIO } from "../../lib/resource-io/resource-io.ts";
import {
  normalizeResourceRef,
} from "../../lib/resource-io/resource-refs.ts";
import {
  RESOURCE_LIST_BLOCKED_ENTRIES,
} from "../../lib/resource-io/types.ts";
import type {
  ResourceEvent,
  ResourceEventCatchUpResult,
  ResourceRef,
  ResourceVersion,
} from "../../lib/resource-io/types.ts";

export const KNOWLEDGE_INDEX_EVENT_DEBOUNCE_MS = 100;
export const KNOWLEDGE_INDEX_EVENT_MAX_DEBOUNCE_MS = 500;
export const KNOWLEDGE_INDEX_EVENT_BURST_LIMIT = 5_000;
export const KNOWLEDGE_INDEX_EVENT_BURST_WINDOW_MS = 10_000;
/**
 * A rebuild writes one SQLite transaction per batch.  Keeping this bounded
 * preserves cancellation and renderer responsiveness without turning a large
 * source scan into one transaction per resource.
 */
export const KNOWLEDGE_INDEX_REBUILD_WRITE_BATCH_SIZE = 64;

export type KnowledgeIndexEventSource = Readonly<{
  eventPaths(event: ResourceEvent): readonly string[];
  scan(signal?: AbortSignal): AsyncIterable<KnowledgeIndexResourceDocument>;
  reread(
    relativePath: string,
    signal?: AbortSignal,
  ): Promise<KnowledgeIndexResourceDocument | null>;
  revalidate?(): void | Promise<void>;
}>;

type EventCoordinatorOptions = Readonly<{
  indexCoordinator: KnowledgeIndexCoordinator;
  sourceFor(sourceKey: string): KnowledgeIndexEventSource;
  initialSequenceFor?: (sourceKey: string) => number;
  now?: () => number;
  createId?: () => string;
  yieldNow?: () => Promise<void>;
  debounceMs?: number;
  maxDebounceMs?: number;
  burstLimit?: number;
  burstWindowMs?: number;
  onDiagnostic?: (diagnostic: KnowledgeIndexEventDiagnostic) => void;
}>;

export type KnowledgeIndexEventDiagnostic = Readonly<{
  sourceKey: string;
  state:
    | "queued"
    | "incremental"
    | "rebuild"
    | "degraded"
    | "ignored";
  reason: string;
  sequence: number;
  operationId?: string;
}>;

export type KnowledgeIndexEventCoordinatorInspection = Readonly<{
  sourceKey: string;
  pendingCount: number;
  replayCount: number;
  lastSequence: number;
  rebuilding: boolean;
  lastReason: string | null;
  lastOperationId: string | null;
}>;

type PendingHint = {
  sequence: number;
  operationId: string | null;
};

type SourceState = {
  pending: Map<string, PendingHint>;
  replay: Map<string, PendingHint>;
  pendingSince: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  lastSequence: number;
  burstTimes: number[];
  tail: Promise<void>;
  rebuilding: boolean;
  rebuildPromise: Promise<void> | null;
  rebuildAbort: AbortController | null;
  rebuildAbortRequested: boolean;
  rebuildKeepAlive: boolean;
  rebuildWaiters: Set<symbol>;
  rebuildAfterCurrentReason: string | null;
  rebuildRequiredReason: string | null;
  lastReason: string | null;
  lastOperationId: string | null;
  disposed: boolean;
};

export class KnowledgeIndexEventCoordinator {
  readonly #indexCoordinator: KnowledgeIndexCoordinator;
  readonly #sourceFor: (sourceKey: string) => KnowledgeIndexEventSource;
  readonly #initialSequenceFor?: (sourceKey: string) => number;
  readonly #now: () => number;
  readonly #createId: () => string;
  readonly #yieldNow: () => Promise<void>;
  readonly #debounceMs: number;
  readonly #maxDebounceMs: number;
  readonly #burstLimit: number;
  readonly #burstWindowMs: number;
  readonly #onDiagnostic?: (diagnostic: KnowledgeIndexEventDiagnostic) => void;
  readonly #states = new Map<string, SourceState>();

  constructor(options: EventCoordinatorOptions) {
    if (
      !options
      || !(options.indexCoordinator instanceof KnowledgeIndexCoordinator)
      || typeof options.sourceFor !== "function"
    ) {
      throw new TypeError("knowledge index event coordinator options are invalid");
    }
    this.#indexCoordinator = options.indexCoordinator;
    this.#sourceFor = options.sourceFor;
    this.#initialSequenceFor = options.initialSequenceFor;
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? (() => crypto.randomUUID());
    this.#yieldNow = options.yieldNow
      ?? (() => new Promise((resolve) => setImmediate(resolve)));
    this.#debounceMs = validDuration(
      options.debounceMs ?? KNOWLEDGE_INDEX_EVENT_DEBOUNCE_MS,
      "debounceMs",
    );
    this.#maxDebounceMs = validDuration(
      options.maxDebounceMs ?? KNOWLEDGE_INDEX_EVENT_MAX_DEBOUNCE_MS,
      "maxDebounceMs",
    );
    if (this.#maxDebounceMs < this.#debounceMs) {
      throw new TypeError("maxDebounceMs must be at least debounceMs");
    }
    this.#burstLimit = validPositiveInteger(
      options.burstLimit ?? KNOWLEDGE_INDEX_EVENT_BURST_LIMIT,
      "burstLimit",
    );
    this.#burstWindowMs = validDuration(
      options.burstWindowMs ?? KNOWLEDGE_INDEX_EVENT_BURST_WINDOW_MS,
      "burstWindowMs",
    );
    this.#onDiagnostic = options.onDiagnostic;
  }

  health(sourceKey: string): KnowledgeIndexHealth {
    return this.#indexCoordinator.health(validSourceKey(sourceKey));
  }

  accept(sourceKey: string, event: ResourceEvent): void {
    const key = validSourceKey(sourceKey);
    validateResourceEventHint(event);
    const state = this.#state(key);
    if (state.disposed) return;
    if (event.sequence <= state.lastSequence) {
      this.#diagnose(key, state, "ignored", "stale_or_duplicate", event);
      return;
    }

    const previousSequence = state.lastSequence;
    state.lastSequence = event.sequence;
    state.lastOperationId = validOperationId(event.operationId);
    const now = this.#now();
    state.burstTimes.push(now);
    const burstFloor = now - this.#burstWindowMs;
    state.burstTimes = state.burstTimes.filter((time) => time >= burstFloor);

    const rebuildReason = event.sequence > previousSequence + 1
      ? "sequence_gap"
      : state.burstTimes.length >= this.#burstLimit
        ? "event_burst"
        : resourceEventRequiresSourceRebuild(event)
          ? "directory_event"
          : null;
    if (rebuildReason) {
      this.#diagnose(key, state, "queued", rebuildReason, event);
      this.#requireRebuild(key, state, rebuildReason);
      return;
    }

    let paths: readonly string[];
    try {
      paths = normalizeEventPaths(this.#sourceFor(key).eventPaths(event));
    } catch {
      this.#requestRebuild(key, state, "event_hint_invalid");
      return;
    }
    if (paths.length === 0) {
      this.#requestRebuild(key, state, "event_hint_unresolvable");
      return;
    }
    const target = state.rebuilding ? state.replay : state.pending;
    for (const relativePath of paths) {
      coalesceHint(target, relativePath, {
        sequence: event.sequence,
        operationId: state.lastOperationId,
      });
    }
    this.#diagnose(key, state, "queued", "event_hint", event);

    if (!state.rebuilding) this.#scheduleFlush(key, state);
  }

  observe(sourceKey: string, event: ResourceEvent): void {
    const key = validSourceKey(sourceKey);
    validateResourceEventHint(event);
    const state = this.#state(key);
    if (state.disposed) return;
    if (event.sequence <= state.lastSequence) {
      this.#diagnose(key, state, "ignored", "stale_or_duplicate", event);
      return;
    }
    const previousSequence = state.lastSequence;
    state.lastSequence = event.sequence;
    state.lastOperationId = validOperationId(event.operationId);
    if (event.sequence > previousSequence + 1) {
      this.#requireRebuild(key, state, "sequence_gap");
      return;
    }
    this.#diagnose(key, state, "ignored", "outside_source", event);
  }

  acceptCatchUp(
    sourceKey: string,
    result: ResourceEventCatchUpResult,
  ): void {
    const key = validSourceKey(sourceKey);
    if (!result || typeof result !== "object") {
      throw new TypeError("resource event catch-up result is invalid");
    }
    const state = this.#state(key);
    if (result.stale) {
      state.lastSequence = Math.max(
        state.lastSequence,
        validSequence(result.latestSequence),
      );
      this.#requestRebuild(key, state, "catch_up_stale");
      return;
    }
    for (const event of [...result.events].sort(
      (left, right) => left.sequence - right.sequence,
    )) {
      this.accept(key, event);
    }
  }

  async flush(sourceKey: string): Promise<void> {
    const key = validSourceKey(sourceKey);
    const state = this.#state(key);
    this.#clearTimer(state);
    return this.#enqueue(state, () => this.#flushPending(key, state));
  }

  rebuild(
    sourceKey: string,
    options: { signal?: AbortSignal; reason?: string } = {},
  ): Promise<void> {
    const key = validSourceKey(sourceKey);
    const state = this.#state(key);
    if (options.signal?.aborted) return Promise.reject(abortError());
    const promise = state.rebuildPromise ?? this.#startRebuild(
      key,
      state,
      options.reason ?? "requested",
      false,
    );
    return this.#waitForRebuild(promise, state, options.signal);
  }

  inspect(sourceKey: string): KnowledgeIndexEventCoordinatorInspection {
    const key = validSourceKey(sourceKey);
    const state = this.#state(key);
    return Object.freeze({
      sourceKey: key,
      pendingCount: state.pending.size,
      replayCount: state.replay.size,
      lastSequence: state.lastSequence,
      rebuilding: state.rebuilding,
      lastReason: state.lastReason,
      lastOperationId: state.lastOperationId,
    });
  }

  dispose(sourceKey?: string): Promise<void> {
    const keys = sourceKey === undefined
      ? [...this.#states.keys()]
      : [validSourceKey(sourceKey)];
    const pending: Promise<void>[] = [];
    for (const key of keys) {
      const state = this.#states.get(key);
      if (!state) continue;
      state.disposed = true;
      this.#clearTimer(state);
      state.rebuildAbort?.abort();
      state.pending.clear();
      state.replay.clear();
      pending.push(state.tail);
      this.#states.delete(key);
    }
    return Promise.allSettled(pending).then(() => {});
  }

  #state(sourceKey: string): SourceState {
    const existing = this.#states.get(sourceKey);
    if (existing) return existing;
    let lastSequence = this.#initialSequenceFor
      ? validSequence(this.#initialSequenceFor(sourceKey))
      : 0;
    if (!this.#initialSequenceFor) {
      try {
        const health = this.#indexCoordinator.health(sourceKey);
        if (health.state === "ready") lastSequence = health.sequence;
      } catch {
        // A source with no store starts at sequence zero.
      }
    }
    const state: SourceState = {
      pending: new Map(),
      replay: new Map(),
      pendingSince: null,
      timer: null,
      lastSequence,
      burstTimes: [],
      tail: Promise.resolve(),
      rebuilding: false,
      rebuildPromise: null,
      rebuildAbort: null,
      rebuildAbortRequested: false,
      rebuildKeepAlive: false,
      rebuildWaiters: new Set(),
      rebuildAfterCurrentReason: null,
      rebuildRequiredReason: null,
      lastReason: null,
      lastOperationId: null,
      disposed: false,
    };
    this.#states.set(sourceKey, state);
    return state;
  }

  #scheduleFlush(sourceKey: string, state: SourceState): void {
    if (state.timer) clearTimeout(state.timer);
    const now = this.#now();
    state.pendingSince ??= now;
    const remaining = Math.max(
      0,
      this.#maxDebounceMs - (now - state.pendingSince),
    );
    const delay = Math.min(this.#debounceMs, remaining);
    state.timer = setTimeout(() => {
      state.timer = null;
      void this.flush(sourceKey).catch(() => {
        // Health and a sanitized diagnostic carry the failure.
      });
    }, delay);
  }

  #requestRebuild(
    sourceKey: string,
    state: SourceState,
    reason: string,
  ): void {
    this.#clearTimer(state);
    state.rebuildKeepAlive = true;
    if (state.rebuildPromise) return;
    this.#startRebuild(sourceKey, state, reason, true);
  }

  #requireRebuild(
    sourceKey: string,
    state: SourceState,
    reason: string,
  ): void {
    if (state.rebuilding) {
      state.rebuildKeepAlive = true;
      state.rebuildAfterCurrentReason ??= reason;
      return;
    }
    this.#requestRebuild(sourceKey, state, reason);
  }

  async #flushPending(
    sourceKey: string,
    state: SourceState,
  ): Promise<void> {
    if (state.disposed) return;
    if (state.rebuilding) {
      mergeHints(state.replay, state.pending);
      state.pending.clear();
      return;
    }
    if (state.rebuildRequiredReason) {
      await this.#runRebuild(
        sourceKey,
        state,
        state.rebuildRequiredReason,
      );
      return;
    }
    if (state.pending.size === 0) return;
    const health = this.#indexCoordinator.health(sourceKey);
    if (health.state !== "ready" && health.state !== "degraded") {
      await this.#runRebuild(
        sourceKey,
        state,
        `health_${health.state}`,
      );
      return;
    }
    const pending = state.pending;
    state.pending = new Map();
    state.pendingSince = null;
    try {
      const source = this.#sourceFor(sourceKey);
      await source.revalidate?.();
      const changes = await rereadHints(
        source,
        pending,
      );
      await source.revalidate?.();
      if (changes.length > 0) {
        await this.#indexCoordinator.applyIncremental(sourceKey, {
          lastCompleteSequence: maxHintSequence(
            pending,
            health.state === "ready" ? health.sequence : 0,
          ),
          changes,
        });
      }
      this.#indexCoordinator.clearDegraded(sourceKey);
      this.#diagnose(
        sourceKey,
        state,
        "incremental",
        "disk_reread_complete",
      );
    } catch (error) {
      mergeHints(state.pending, pending);
      state.pendingSince ??= this.#now();
      this.#markDegraded(sourceKey, state, errorReason(error));
      throw error;
    }
  }

  async #runRebuild(
    sourceKey: string,
    state: SourceState,
    reason: string,
  ): Promise<void> {
    if (state.disposed) return;
    this.#clearTimer(state);
    mergeHints(state.replay, state.pending);
    state.pending.clear();
    state.pendingSince = null;
    state.rebuilding = true;
    state.rebuildRequiredReason = reason;
    state.lastReason = reason;
    const controller = new AbortController();
    state.rebuildAbort = controller;
    if (state.rebuildAbortRequested) controller.abort();
    const startedSequence = state.lastSequence;
    const rebuildId = validArtifactId(this.#createId(), "rebuild");
    const generationId = validArtifactId(this.#createId(), "generation");
    let rebuild: Awaited<ReturnType<KnowledgeIndexCoordinator["beginRebuild"]>>
      | null = null;
    let appliedSequence = startedSequence;
    try {
      const source = this.#sourceFor(sourceKey);
      await source.revalidate?.();
      rebuild = await this.#indexCoordinator.beginRebuild(sourceKey, {
        rebuildId,
        generationId,
        startedSequence,
        signal: controller.signal,
      });
      let processed = 0;
      let lastYieldAt = this.#now();
      const batch: KnowledgeIndexResourceDocument[] = [];
      for await (const document of source.scan(controller.signal)) {
        throwIfAborted(controller.signal);
        batch.push(document);
        processed += 1;
        if (
          batch.length >= KNOWLEDGE_INDEX_REBUILD_WRITE_BATCH_SIZE
          || this.#now() - lastYieldAt >= 50
        ) {
          rebuild.replaceResources(batch.splice(0));
        }
        if (processed % 200 === 0 || this.#now() - lastYieldAt >= 50) {
          rebuild.setProgress(Math.min(0.9, processed / (processed + 200)));
          await this.#yieldNow();
          lastYieldAt = this.#now();
        }
      }
      if (batch.length > 0) rebuild.replaceResources(batch.splice(0));

      while (state.replay.size > 0) {
        const replay = state.replay;
        state.replay = new Map();
        const changes = await rereadHints(
          source,
          replay,
          controller.signal,
        );
        for (const change of changes) {
          if (change.kind === "replace") {
            rebuild.replaceResource(change.document);
          } else {
            rebuild.deleteResource(change.relativePath);
          }
        }
        appliedSequence = maxHintSequence(replay, appliedSequence);
      }
      await source.revalidate?.();
      throwIfAborted(controller.signal);
      rebuild.setProgress(0.99);
      await rebuild.publish({
        lastCompleteSequence: appliedSequence,
      });
      rebuild = null;
      state.rebuildRequiredReason = null;
      this.#indexCoordinator.clearDegraded(sourceKey);
      this.#diagnose(sourceKey, state, "rebuild", reason);
    } catch (error) {
      rebuild?.cancel();
      if (isAbortError(error)) {
        state.rebuildRequiredReason = null;
      } else {
        this.#markDegraded(sourceKey, state, errorReason(error));
      }
      throw error;
    } finally {
      state.rebuildAbort = null;
      state.rebuilding = false;
      const rebuildAfterCurrentReason = state.rebuildAfterCurrentReason;
      state.rebuildAfterCurrentReason = null;
      if (state.replay.size > 0) {
        mergeHints(state.pending, state.replay);
        state.replay.clear();
        state.pendingSince = this.#now();
      }
      if (rebuildAfterCurrentReason) {
        state.rebuildRequiredReason = rebuildAfterCurrentReason;
        state.pendingSince ??= this.#now();
      }
      if (state.pending.size > 0 || state.rebuildRequiredReason) {
        this.#scheduleFlush(sourceKey, state);
      }
    }
  }

  #startRebuild(
    sourceKey: string,
    state: SourceState,
    reason: string,
    keepAlive: boolean,
  ): Promise<void> {
    state.rebuildKeepAlive = keepAlive;
    state.rebuildAbortRequested = false;
    const run = this.#enqueue(state, () =>
      this.#runRebuild(sourceKey, state, reason)
    );
    const tracked = run.finally(() => {
      if (state.rebuildPromise === tracked) {
        state.rebuildPromise = null;
        state.rebuildAbortRequested = false;
        state.rebuildKeepAlive = false;
      }
    });
    state.rebuildPromise = tracked;
    void tracked.catch(() => {
      // Health and a sanitized diagnostic carry the failure.
    });
    return tracked;
  }

  #waitForRebuild(
    promise: Promise<void>,
    state: SourceState,
    signal?: AbortSignal,
  ): Promise<void> {
    const token = Symbol("knowledge-index-rebuild-waiter");
    state.rebuildWaiters.add(token);
    const releaseWaiter = () => {
      state.rebuildWaiters.delete(token);
    };
    if (!signal) return promise.finally(releaseWaiter);

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        releaseWaiter();
        callback();
      };
      const onAbort = () => finish(() => {
        if (
          state.rebuildPromise === promise
          && state.rebuildWaiters.size === 0
          && !state.rebuildKeepAlive
        ) {
          if (state.rebuildAbort) state.rebuildAbort.abort();
          else state.rebuildAbortRequested = true;
        }
        reject(abortError());
      });
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) {
        onAbort();
        return;
      }
      void promise.then(
        () => finish(resolve),
        (error) => finish(() => reject(error)),
      );
    });
  }

  #markDegraded(
    sourceKey: string,
    state: SourceState,
    reason: string,
  ): void {
    const safeReason = sanitizeReason(reason);
    try {
      this.#indexCoordinator.markDegraded(sourceKey, safeReason);
    } catch {
      // A source without a readable generation remains unavailable.
    }
    this.#diagnose(sourceKey, state, "degraded", safeReason);
  }

  #diagnose(
    sourceKey: string,
    state: SourceState,
    status: KnowledgeIndexEventDiagnostic["state"],
    reason: string,
    event?: ResourceEvent,
  ): void {
    state.lastReason = sanitizeReason(reason);
    this.#onDiagnostic?.(Object.freeze({
      sourceKey,
      state: status,
      reason: state.lastReason,
      sequence: event?.sequence ?? state.lastSequence,
      ...(state.lastOperationId
        ? { operationId: state.lastOperationId }
        : {}),
    }));
  }

  #clearTimer(state: SourceState): void {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
  }

  #enqueue(state: SourceState, task: () => Promise<void>): Promise<void> {
    const run = state.tail.then(task, task);
    state.tail = run.catch(() => {});
    return run;
  }
}

type ResourceIOReaderOptions = Readonly<{
  resourceIO: Pick<ResourceIO, "stat" | "list" | "openRead">;
  root: ResourceRef;
  resolveAddress(relativePath: string): ResourceRef | Promise<ResourceRef>;
  revalidate(): void | Promise<void>;
  now?: () => number;
}>;

export class ResourceIOKnowledgeIndexSourceReader
implements KnowledgeIndexEventSource {
  readonly #resourceIO: Pick<ResourceIO, "stat" | "list" | "openRead">;
  readonly #root: ResourceRef;
  readonly #resolveAddress: (
    relativePath: string,
  ) => ResourceRef | Promise<ResourceRef>;
  readonly #revalidate: () => void | Promise<void>;
  readonly #now: () => number;

  constructor(options: ResourceIOReaderOptions) {
    if (
      !options
      || !options.resourceIO
      || typeof options.resourceIO.stat !== "function"
      || typeof options.resourceIO.list !== "function"
      || typeof options.resourceIO.openRead !== "function"
      || typeof options.resolveAddress !== "function"
      || typeof options.revalidate !== "function"
    ) {
      throw new TypeError("ResourceIO knowledge index reader is invalid");
    }
    this.#resourceIO = options.resourceIO;
    this.#root = normalizeResourceRef(options.root);
    if (!["local-file", "mount"].includes(this.#root.kind)) {
      throw new TypeError("knowledge index source root is not hierarchical");
    }
    this.#resolveAddress = options.resolveAddress;
    this.#revalidate = options.revalidate;
    this.#now = options.now ?? Date.now;
  }

  revalidate(): void | Promise<void> {
    return this.#revalidate();
  }

  eventPaths(event: ResourceEvent): readonly string[] {
    const refs = event.type === "resource.renamed"
      ? [event.oldResource, event.newResource]
      : [event.resource];
    return Object.freeze(refs.flatMap((ref) => {
      const relativePath = this.#relativePath(ref);
      return relativePath ? [relativePath] : [];
    }));
  }

  async *scan(
    signal?: AbortSignal,
  ): AsyncIterable<KnowledgeIndexResourceDocument> {
    const queue: Array<{ ref: ResourceRef; relativePath: string }> = [{
      ref: this.#root,
      relativePath: "",
    }];
    while (queue.length > 0) {
      throwIfAborted(signal);
      const current = queue.shift()!;
      const listing = await this.#resourceIO.list(current.ref, {
        auditRead: true,
        reason: "knowledge-index-scan",
      });
      if ((listing[RESOURCE_LIST_BLOCKED_ENTRIES]?.length ?? 0) > 0) {
        // A UI can safely omit a link and keep showing its authorized
        // siblings. An index rebuild is an integrity operation, so it must
        // reject the whole source rather than silently publish a partial scan.
        throw Object.assign(new Error("knowledge index source contains a blocked entry"), {
          code: "knowledge_resource_out_of_scope",
        });
      }
      for (const item of [...listing.items].sort((left, right) =>
        left.name.localeCompare(right.name)
      )) {
        throwIfAborted(signal);
        if (
          item.name.length === 0
          || item.name === "."
          || item.name === ".."
          || /[/\\\p{Cc}]/u.test(item.name)
        ) {
          throw new Error("knowledge_index_scan_name_invalid");
        }
        const relativePath = current.relativePath
          ? `${current.relativePath}/${item.name}`
          : item.name;
        if (relativePath === ".trash" || relativePath.startsWith(".trash/")) {
          continue;
        }
        const ref = await this.#resolveAndValidate(relativePath);
        if (item.isDirectory) {
          queue.push({ ref, relativePath });
          continue;
        }
        const document = await this.reread(relativePath, signal);
        if (document) yield document;
      }
    }
  }

  async reread(
    relativePath: string,
    signal?: AbortSignal,
  ): Promise<KnowledgeIndexResourceDocument | null> {
    const canonical = canonicalRelativePath(relativePath);
    const ref = await this.#resolveAndValidate(canonical);
    throwIfAborted(signal);
    const stat = await this.#resourceIO.stat(ref, {
      auditRead: true,
      reason: "knowledge-index-reread-stat",
    });
    throwIfAborted(signal);
    if (!stat.exists || stat.isDirectory) return null;
    if (/\.md$/iu.test(canonical)) {
      const sizeBytes = stat.version?.size;
      const mtimeMs = stat.version?.mtimeMs;
      if (
        !Number.isSafeInteger(sizeBytes)
        || Number(sizeBytes) < 0
        || !Number.isFinite(mtimeMs)
      ) {
        throw new Error("knowledge_index_stat_incomplete");
      }
      const expectedVersion = stat.version ?? {};
      const expectedVersionToken = versionToken(expectedVersion);
      const document = await extractSavedMarkdownIndexFacts({
        relativePath: canonical,
        sizeBytes: Number(sizeBytes),
        mtimeMs: Number(mtimeMs),
        versionToken: expectedVersionToken,
        indexedAtMs: this.#now(),
        signal,
        readSavedContent: async (token) => {
          if (token !== expectedVersionToken) {
            throw new MarkdownIndexVersionConflictError();
          }
          const opened = await this.#resourceIO.openRead(
            ref,
            { expectedVersion },
            {
              auditRead: true,
              reason: "knowledge-index-markdown-content",
            },
          );
          if (
            opened.size !== sizeBytes
            || versionToken(opened.version) !== expectedVersionToken
          ) {
            throw new MarkdownIndexVersionConflictError();
          }
          return readExactBody(opened.body, Number(sizeBytes), signal);
        },
      });
      await this.#assertAddressStable(canonical, ref);
      return document;
    }
    const document = await extractSafeTextIndexFacts({
      resourceIO: this.#resourceIO,
      resource: ref,
      relativePath: canonical,
      indexedAtMs: this.#now(),
      signal,
    });
    await this.#assertAddressStable(canonical, ref);
    return document;
  }

  async #resolveAndValidate(relativePath: string): Promise<ResourceRef> {
    return normalizeResourceRef(await this.#resolveAddress(relativePath));
  }

  async #assertAddressStable(
    relativePath: string,
    expected: ResourceRef,
  ): Promise<void> {
    const current = await this.#resolveAndValidate(relativePath);
    if (JSON.stringify(current) !== JSON.stringify(expected)) {
      throw new Error("knowledge_index_address_changed");
    }
  }

  #relativePath(input: unknown): string | null {
    let ref: ResourceRef;
    try {
      ref = normalizeResourceRef(input);
    } catch {
      return null;
    }
    if (this.#root.kind === "mount" && ref.kind === "mount") {
      if (this.#root.mountId !== ref.mountId) return null;
      const rootPath = slashPath(this.#root.path);
      const candidate = slashPath(ref.path);
      if (
        rootPath
        && candidate !== rootPath
        && !candidate.startsWith(`${rootPath}/`)
      ) {
        return null;
      }
      const relative = rootPath
        ? candidate.slice(rootPath.length).replace(/^\/+/, "")
        : candidate;
      return relative ? maybeCanonicalRelativePath(relative) : null;
    }
    if (this.#root.kind === "local-file" && ref.kind === "local-file") {
      const relative = path.relative(
        path.resolve(this.#root.path),
        path.resolve(ref.path),
      ).replace(/\\/g, "/");
      if (
        !relative
        || relative === ".."
        || relative.startsWith("../")
        || path.isAbsolute(relative)
      ) {
        return null;
      }
      return maybeCanonicalRelativePath(relative);
    }
    return null;
  }
}

async function rereadHints(
  source: KnowledgeIndexEventSource,
  hints: Map<string, PendingHint>,
  signal?: AbortSignal,
): Promise<KnowledgeIndexIncrementalChange[]> {
  const changes: KnowledgeIndexIncrementalChange[] = [];
  for (const relativePath of [...hints.keys()].sort()) {
    throwIfAborted(signal);
    const document = await source.reread(relativePath, signal);
    changes.push(document
      ? { kind: "replace", document }
      : { kind: "delete", relativePath });
  }
  return changes;
}

async function readExactBody(
  body: AsyncIterable<Uint8Array>,
  expectedBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    throwIfAborted(signal);
    if (!(chunk instanceof Uint8Array)) {
      throw new MarkdownIndexVersionConflictError();
    }
    total += chunk.byteLength;
    if (total > expectedBytes) {
      throw new MarkdownIndexVersionConflictError();
    }
    chunks.push(chunk);
  }
  if (total !== expectedBytes) throw new MarkdownIndexVersionConflictError();
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function versionToken(version: ResourceVersion): string {
  return JSON.stringify({
    etag: version.etag ?? null,
    mtimeMs: version.mtimeMs ?? null,
    sequence: version.sequence ?? null,
    sha256: version.sha256 ?? null,
    size: version.size ?? null,
  });
}

function normalizeEventPaths(paths: readonly string[]): readonly string[] {
  if (!Array.isArray(paths)) {
    throw new TypeError("knowledge index event paths are invalid");
  }
  return Object.freeze([...new Set(paths.map(canonicalRelativePath))].sort());
}

function canonicalRelativePath(value: string): string {
  const result = canonicalKnowledgeRelativePath(value);
  if (!result.ok || result.value !== value) {
    throw new TypeError("knowledge index relativePath must be canonical");
  }
  return result.value;
}

function maybeCanonicalRelativePath(value: string): string | null {
  try {
    return canonicalRelativePath(value.normalize("NFC"));
  } catch {
    return null;
  }
}

function slashPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function resourceEventRequiresSourceRebuild(event: ResourceEvent): boolean {
  if (event.type === "resource.changed") {
    return event.resource.isDirectory === true || event.version?.size === null;
  }
  if (event.type === "resource.deleted") {
    return event.resource.isDirectory !== false;
  }
  return event.oldResource.isDirectory !== false
    || event.newResource.isDirectory !== false;
}

function abortError(): Error {
  return Object.assign(new Error("knowledge index rebuild aborted"), {
    name: "AbortError",
    code: "ABORT_ERR",
  });
}

function coalesceHint(
  target: Map<string, PendingHint>,
  relativePath: string,
  hint: PendingHint,
): void {
  const existing = target.get(relativePath);
  if (!existing || hint.sequence >= existing.sequence) {
    target.set(relativePath, hint);
  }
}

function mergeHints(
  target: Map<string, PendingHint>,
  source: Map<string, PendingHint>,
): void {
  for (const [relativePath, hint] of source) {
    coalesceHint(target, relativePath, hint);
  }
}

function maxHintSequence(
  hints: Map<string, PendingHint>,
  fallback: number,
): number {
  let sequence = 0;
  for (const hint of hints.values()) sequence = Math.max(sequence, hint.sequence);
  return Math.max(sequence, fallback);
}

function validateResourceEventHint(event: ResourceEvent): void {
  if (
    !event
    || typeof event !== "object"
    || ![
      "resource.changed",
      "resource.deleted",
      "resource.renamed",
    ].includes(event.type)
    || !Number.isSafeInteger(event.sequence)
    || event.sequence < 0
  ) {
    throw new TypeError("resource event hint is invalid");
  }
}

function validSourceKey(sourceKey: string): string {
  if (
    typeof sourceKey !== "string"
    || sourceKey.length === 0
    || sourceKey.length > 256
    || /[/\\\p{Cc}]/u.test(sourceKey)
  ) {
    throw new TypeError("knowledge index sourceKey is invalid");
  }
  return sourceKey;
}

function validSequence(sequence: number): number {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new TypeError("resource event sequence is invalid");
  }
  return sequence;
}

function validDuration(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 60_000) {
    throw new TypeError(`${name} is invalid`);
  }
  return value;
}

function validPositiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} is invalid`);
  }
  return value;
}

function validArtifactId(value: string, prefix: string): string {
  if (
    typeof value !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)
  ) {
    throw new TypeError(`knowledge index ${prefix} id is invalid`);
  }
  return value;
}

function validOperationId(value: string | undefined): string | null {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : null;
}

function sanitizeReason(reason: string): string {
  const safe = String(reason)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 128);
  return safe || "index_update_failed";
}

function errorReason(error: unknown): string {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "index_update_failed";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw Object.assign(new Error("knowledge index coordination aborted"), {
    name: "AbortError",
    code: "ABORT_ERR",
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error
    && (error.name === "AbortError"
      || (error as Error & { code?: string }).code === "ABORT_ERR");
}
