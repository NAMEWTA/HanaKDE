import { hanaFetch } from '../hooks/use-hana-fetch';
import {
  createKnowledgeWorkspaceClient,
  knowledgeWorkspaceClient,
  type KnowledgeResourceEvent,
  type KnowledgeWorkspaceFetch,
  type KnowledgeWorkspaceClient,
} from './knowledge-workspace-client';
import {
  invalidateAllDeskTreePaths,
  PREVIEW_DOCUMENT_CATCH_UP_REFRESH_OPTIONS,
  refreshOpenPreviewDocuments,
} from '../utils/preview-document-refresh';

export type ResourceRef =
  | { kind: 'local-file'; path: string }
  | { kind: 'mount'; mountId: string; path: string };

type WatchRef =
  | ResourceRef
  | { kind: 'knowledge-source'; sourceKey: string };

type WatchEntry = {
  ref: WatchRef;
  refCount: number;
  subscriptionId: string | null;
  leaseDurationMs: number | null;
  leaseExpiresAt: number | null;
  leaseRenewTimer: ReturnType<typeof setTimeout> | null;
  subscriptionRetryAttempt: number;
  disposed: boolean;
  suspended: boolean;
  released: boolean;
  releaseKeepalive: boolean;
  releasePromise: Promise<void> | null;
  ready: Promise<void>;
  confirmed: Promise<void>;
  confirm(): void;
};

// This receipt is renderer-process-only. It lets consumers close the first
// snapshot/watch-registration window without adding authority or data to any
// ResourceIO DTO, event payload, diagnostic, or persisted state.
export type ResourceWatchRelease = (() => void) & {
  readonly ready?: Promise<void>;
};

const watches = new Map<string, WatchEntry>();
const pendingWatchCleanup = new Set<Promise<void>>();
const WATCH_RELEASE_RETRY_MIN_MS = 250;
const WATCH_RELEASE_RETRY_MAX_MS = 2_000;
const WATCH_RENEW_RETRY_MS = 1_000;
const WATCH_SUBSCRIBE_RETRY_MIN_MS = 500;
const WATCH_SUBSCRIBE_RETRY_MAX_MS = 5_000;
let pageLifecycleCleanupBound = false;

type ResourceEvent = {
  type?: string;
  sequence?: number;
  [key: string]: unknown;
};

type ResourceEventFetch = (
  path: string,
  opts?: RequestInit & { timeout?: number; throwOnHttpError?: boolean },
) => Promise<{
  ok?: boolean;
  status?: number;
  json: () => Promise<unknown>;
}>;

type ResourceEventClientOptions = {
  fetchImpl?: ResourceEventFetch;
  applyEvent?: (event: ResourceEvent) => void;
  resubscribeWatches?: () => Promise<void> | void;
  requeryAfterGap?: () => Promise<void> | void;
  client?: KnowledgeWorkspaceClient;
};

type ForegroundCatchUpOptions = {
  windowObj?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null;
  documentObj?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> | null;
  catchUp?: () => Promise<unknown> | unknown;
  minIntervalMs?: number;
  now?: () => number;
};

export type KnowledgeResourceTreeChangeSignal =
  | { kind: 'resource-event' }
  | { kind: 'resync' };

type KnowledgeResourceTreeChangeListener = (
  signal: KnowledgeResourceTreeChangeSignal,
) => void;

const knowledgeResourceTreeChangeListeners = new Set<
  KnowledgeResourceTreeChangeListener
>();

export function subscribeKnowledgeResourceTreeChanges(
  listener: KnowledgeResourceTreeChangeListener,
): () => void {
  knowledgeResourceTreeChangeListeners.add(listener);
  return () => {
    knowledgeResourceTreeChangeListeners.delete(listener);
  };
}

function publishKnowledgeResourceTreeChange(
  signal: KnowledgeResourceTreeChangeSignal,
): void {
  for (const listener of knowledgeResourceTreeChangeListeners) {
    try {
      listener(signal);
    } catch (error) {
      console.warn('[resource-events] knowledge tree listener failed:', error);
    }
  }
}

export function createResourceEventClient({
  fetchImpl = hanaFetch,
  applyEvent,
  resubscribeWatches,
  requeryAfterGap,
  client: injectedClient,
}: ResourceEventClientOptions = {}) {
  const client = injectedClient ?? createKnowledgeWorkspaceClient({
    fetchImpl: adaptResourceEventFetch(fetchImpl),
  });
  let eventQueue: Promise<void> = Promise.resolve();

  const recoverFromGap = async (): Promise<void> => {
    await resubscribeWatches?.();
    if (requeryAfterGap) {
      await requeryAfterGap();
    } else {
      await recoverDeskResourcesAfterGap();
    }
  };

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const result = eventQueue.then(task);
    eventQueue = result.then(() => undefined, () => undefined);
    return result;
  };

  const handleEvent = (
    event: ResourceEvent | null | undefined,
    applyEventOverride?: (event: ResourceEvent) => Promise<void> | void,
  ): Promise<void> => {
    if (!isResourceEventMessage(event)) return Promise.resolve();
    const handler = applyEventOverride || applyEvent;
    return enqueue(() => client.applyResourceEvent(event, {
      recoverFromGap,
      applyEvent: (safeEvent: KnowledgeResourceEvent) => handler?.(safeEvent),
    }));
  };

  const catchUpAfterReconnect = (
    options: {
      applyEvent?: (event: ResourceEvent) => Promise<void> | void;
    } = {},
  ) => enqueue(async () => {
    const handler = options.applyEvent || applyEvent;
    return client.catchUpResourceEvents({
      recoverFromGap,
      applyEvent: (event: KnowledgeResourceEvent) => handler?.(event),
    });
  });

  return {
    handleEvent,
    catchUpAfterReconnect,
    lastSeenSequence: client.lastResourceEventSequence,
  };
}

async function recoverDeskResourcesAfterGap(): Promise<void> {
  invalidateAllDeskTreePaths();
  publishKnowledgeResourceTreeChange({ kind: 'resync' });
  await refreshOpenPreviewDocuments(PREVIEW_DOCUMENT_CATCH_UP_REFRESH_OPTIONS);
}

function adaptResourceEventFetch(fetchImpl: ResourceEventFetch): KnowledgeWorkspaceFetch {
  return async (path, options) => {
    const response = await fetchImpl(path, options);
    return {
      ok: response.ok !== false,
      status: typeof response.status === 'number' ? response.status : 200,
      json: response.json,
    };
  };
}

const resourceEventClient = createResourceEventClient({
  client: knowledgeWorkspaceClient,
  resubscribeWatches: resubscribeActiveWatches,
});

function normalizeResourceRef(ref: WatchRef): WatchRef {
  if (ref.kind === 'local-file') {
    return { kind: 'local-file', path: ref.path };
  }
  if (ref.kind === 'knowledge-source') {
    return { kind: 'knowledge-source', sourceKey: ref.sourceKey };
  }
  return {
    kind: 'mount',
    mountId: ref.mountId,
    path: String(ref.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''),
  };
}

export function resourceWatchKey(ref: WatchRef): string {
  const normalized = normalizeResourceRef(ref);
  if (normalized.kind === 'local-file') {
    const slashed = normalized.path.replace(/\\/g, '/').replace(/\/+$/g, '');
    return `local-file:${/^[A-Za-z]:/.test(slashed) ? slashed.toLowerCase() : slashed}`;
  }
  if (normalized.kind === 'knowledge-source') {
    return `knowledge-source:${normalized.sourceKey}`;
  }
  return `mount:${normalized.mountId}:${normalized.path}`;
}

export function retainResourceWatch(ref: ResourceRef): ResourceWatchRelease {
  return retainWatch(ref);
}

function retainWatch(ref: WatchRef): ResourceWatchRelease {
  const normalizedRef = normalizeResourceRef(ref);
  const key = resourceWatchKey(normalizedRef);
  const existing = watches.get(key);
  if (existing) {
    existing.refCount += 1;
    return createWatchRelease(key, existing.confirmed);
  }

  let confirm = () => {};
  const confirmed = new Promise<void>((resolve) => {
    confirm = resolve;
  });

  const entry: WatchEntry = {
    ref: normalizedRef,
    refCount: 1,
    subscriptionId: null,
    leaseDurationMs: null,
    leaseExpiresAt: null,
    leaseRenewTimer: null,
    subscriptionRetryAttempt: 0,
    disposed: false,
    suspended: false,
    released: false,
    releaseKeepalive: false,
    releasePromise: null,
    ready: Promise.resolve(),
    confirmed,
    confirm,
  };
  entry.ready = subscribeEntry(entry);
  watches.set(key, entry);
  bindPageLifecycleCleanup();
  return createWatchRelease(key, entry.confirmed);
}

function createWatchRelease(key: string, ready: Promise<void>): ResourceWatchRelease {
  const release = (() => releaseResourceWatch(key)) as ResourceWatchRelease;
  Object.defineProperty(release, 'ready', {
    value: ready,
    enumerable: false,
  });
  return release;
}

async function subscribeEntry(entry: WatchEntry): Promise<void> {
  if (
    entry.disposed
    || entry.suspended
    || entry.subscriptionId
  ) {
    return;
  }
  entry.released = false;
  const body = entry.ref.kind === 'knowledge-source'
    ? {
        purpose: 'knowledge-source-watch',
        sourceKeys: [entry.ref.sourceKey],
      }
    : {
        purpose: 'resource-watch',
        resources: [entry.ref],
      };
  try {
    const response = await hanaFetch('/api/resource-io/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      throwOnHttpError: false,
    });
    const data = await response.json().catch(() => null);
    if (
      response.ok === false
      || (typeof response.status === 'number' && response.status >= 400)
      || typeof data?.subscriptionId !== 'string'
    ) {
      throw new Error(
        typeof data?.error === 'string'
          ? data.error
          : 'Resource watch subscription was not confirmed',
      );
    }
    entry.subscriptionId = data.subscriptionId;
    entry.subscriptionRetryAttempt = 0;
    configureEntryLease(entry, data);
    entry.confirm();
    if (entry.disposed || entry.suspended) await releaseEntry(entry);
  } catch (err) {
    if (!entry.disposed && !entry.suspended) {
      console.warn('[resource-events] watch failed:', err);
      scheduleEntrySubscriptionRetry(entry);
    }
  }
}

export function retainLocalFileResourceWatch(filePath: string): ResourceWatchRelease {
  return retainResourceWatch({ kind: 'local-file', path: filePath });
}

export function retainKnowledgeSourceWatch(sourceKey: string): ResourceWatchRelease {
  return retainWatch({ kind: 'knowledge-source', sourceKey });
}

function releaseResourceWatch(key: string): void {
  const entry = watches.get(key);
  if (!entry) return;
  if (entry.refCount > 1) {
    entry.refCount -= 1;
    return;
  }
  watches.delete(key);
  unbindPageLifecycleCleanupIfIdle();
  entry.disposed = true;
  entry.confirm();
  trackWatchCleanup(entry.ready.then(() => releaseEntry(entry)));
}

function releaseEntry(entry: WatchEntry): Promise<void> {
  if (entry.releasePromise) return entry.releasePromise;
  clearEntryLeaseRenewal(entry);
  if (entry.released || !entry.subscriptionId) return Promise.resolve();
  entry.releasePromise = releaseEntryWithConfirmation(entry)
    .finally(() => {
      entry.releasePromise = null;
    });
  return entry.releasePromise;
}

async function releaseEntryWithConfirmation(entry: WatchEntry): Promise<void> {
  let retryMs = WATCH_RELEASE_RETRY_MIN_MS;
  do {
    const subscriptionId = entry.subscriptionId;
    if (!subscriptionId) return;
    try {
      const response = await hanaFetch(
        `/api/resource-io/subscriptions/${encodeURIComponent(subscriptionId)}`,
        {
          method: 'DELETE',
          throwOnHttpError: false,
          ...(entry.releaseKeepalive ? { keepalive: true } : {}),
        },
      );
      const data = await response.json().catch(() => null);
      if (
        response.ok !== false
        && (typeof response.status !== 'number' || response.status < 400)
        && data?.ok === true
        && data?.released === true
      ) {
        if (entry.subscriptionId === subscriptionId) {
          entry.subscriptionId = null;
          entry.released = true;
          entry.leaseDurationMs = null;
          entry.leaseExpiresAt = null;
        }
        return;
      }
      console.warn('[resource-events] unwatch was not confirmed:', data);
    } catch (err) {
      console.warn('[resource-events] unwatch failed:', err);
    }
    if (entry.releaseKeepalive) return;
    if (entry.leaseExpiresAt && Date.now() >= entry.leaseExpiresAt) {
      entry.subscriptionId = null;
      entry.released = true;
      entry.leaseDurationMs = null;
      entry.leaseExpiresAt = null;
      return;
    }
    await waitForWatchRetry(retryMs);
    retryMs = Math.min(retryMs * 2, WATCH_RELEASE_RETRY_MAX_MS);
  } while (entry.subscriptionId);
}

function trackWatchCleanup(cleanup: Promise<void>): void {
  pendingWatchCleanup.add(cleanup);
  void cleanup.finally(() => pendingWatchCleanup.delete(cleanup));
}

export async function waitForResourceWatchCleanup(): Promise<void> {
  while (pendingWatchCleanup.size > 0) {
    await Promise.all([...pendingWatchCleanup]);
  }
}

async function resubscribeActiveWatches(): Promise<void> {
  const entries = [...watches.values()].filter(
    entry => !entry.disposed && !entry.suspended,
  );
  await Promise.all(entries.map((entry) => {
    clearEntryLeaseRenewal(entry);
    const previousReady = entry.ready;
    const nextReady = previousReady.then(async () => {
      if (entry.disposed || entry.suspended) {
        releaseEntry(entry);
        return;
      }
      const previousSubscriptionId = entry.subscriptionId;
      if (previousSubscriptionId) {
        await releaseEntry(entry);
      }
      if (!entry.disposed && !entry.suspended) {
        entry.released = false;
        await subscribeEntry(entry);
      }
    });
    entry.ready = nextReady;
    return nextReady;
  }));
}

function configureEntryLease(entry: WatchEntry, data: unknown): void {
  const record = data && typeof data === 'object' ? data as Record<string, unknown> : null;
  const leaseDurationMs = Number(record?.leaseDurationMs);
  const leaseExpiresAt = typeof record?.leaseExpiresAt === 'string'
    ? Date.parse(record.leaseExpiresAt)
    : NaN;
  if (
    !Number.isFinite(leaseDurationMs)
    || leaseDurationMs < 1_000
    || !Number.isFinite(leaseExpiresAt)
  ) {
    entry.leaseDurationMs = null;
    entry.leaseExpiresAt = null;
    return;
  }
  entry.leaseDurationMs = Math.floor(leaseDurationMs);
  // Use a local lease window for retry cutoffs; the ISO timestamp remains a
  // public diagnostic, but server/client wall clocks need not be synchronized.
  entry.leaseExpiresAt = Date.now() + entry.leaseDurationMs;
  scheduleEntryLeaseRenewal(entry);
}

function scheduleEntryLeaseRenewal(entry: WatchEntry, retry = false): void {
  clearEntryLeaseRenewal(entry);
  if (
    entry.disposed
    || entry.suspended
    || !entry.subscriptionId
    || !entry.leaseDurationMs
    || !entry.leaseExpiresAt
  ) {
    return;
  }
  const delayMs = retry
    ? Math.max(
        250,
        Math.min(
          WATCH_RENEW_RETRY_MS,
          Math.max(0, entry.leaseExpiresAt - Date.now()),
        ),
      )
    : Math.max(250, Math.floor(entry.leaseDurationMs / 3));
  entry.leaseRenewTimer = setTimeout(() => {
    entry.leaseRenewTimer = null;
    const renewal = entry.ready.then(() => renewEntryLease(entry));
    entry.ready = renewal;
    void renewal.catch((err) => {
      console.warn('[resource-events] watch lease renewal failed:', err);
    });
  }, delayMs);
}

async function renewEntryLease(entry: WatchEntry): Promise<void> {
  const subscriptionId = entry.subscriptionId;
  if (entry.disposed || entry.suspended || !subscriptionId) return;
  try {
    const response = await hanaFetch(
      `/api/resource-io/subscriptions/${encodeURIComponent(subscriptionId)}/renew`,
      {
        method: 'POST',
        throwOnHttpError: false,
      },
    );
    const data = await response.json().catch(() => null);
    if (
      response.ok !== false
      && (typeof response.status !== 'number' || response.status < 400)
      && data?.ok === true
      && data?.renewed === true
    ) {
      configureEntryLease(entry, data);
      return;
    }
    if (data?.ok === true && data?.renewed === false) {
      entry.subscriptionId = null;
      entry.leaseDurationMs = null;
      entry.leaseExpiresAt = null;
      scheduleEntrySubscriptionRetry(entry);
      return;
    }
  } catch (err) {
    console.warn('[resource-events] watch lease renewal failed:', err);
  }
  if (entry.leaseExpiresAt && Date.now() >= entry.leaseExpiresAt) {
    entry.subscriptionId = null;
    entry.leaseDurationMs = null;
    entry.leaseExpiresAt = null;
    scheduleEntrySubscriptionRetry(entry);
    return;
  }
  scheduleEntryLeaseRenewal(entry, true);
}

function scheduleEntrySubscriptionRetry(entry: WatchEntry): void {
  clearEntryLeaseRenewal(entry);
  if (entry.disposed || entry.suspended || entry.subscriptionId) return;
  const exponent = Math.min(entry.subscriptionRetryAttempt, 8);
  const delayMs = Math.min(
    WATCH_SUBSCRIBE_RETRY_MIN_MS * (2 ** exponent),
    WATCH_SUBSCRIBE_RETRY_MAX_MS,
  );
  entry.subscriptionRetryAttempt += 1;
  entry.leaseRenewTimer = setTimeout(() => {
    entry.leaseRenewTimer = null;
    const retry = entry.ready.then(() => {
      if (entry.disposed || entry.suspended || entry.subscriptionId) return;
      return subscribeEntry(entry);
    });
    entry.ready = retry;
    void retry.catch((err) => {
      console.warn('[resource-events] watch resubscribe failed:', err);
    });
  }, delayMs);
}

function clearEntryLeaseRenewal(entry: WatchEntry): void {
  if (entry.leaseRenewTimer) clearTimeout(entry.leaseRenewTimer);
  entry.leaseRenewTimer = null;
}

function waitForWatchRetry(delayMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

function bindPageLifecycleCleanup(): void {
  if (pageLifecycleCleanupBound || typeof window === 'undefined') return;
  window.addEventListener('pagehide', releaseAllWatchesOnPageHide);
  window.addEventListener('pageshow', resumeWatchesFromPageCache);
  pageLifecycleCleanupBound = true;
}

function unbindPageLifecycleCleanupIfIdle(): void {
  if (
    !pageLifecycleCleanupBound
    || watches.size > 0
    || typeof window === 'undefined'
  ) {
    return;
  }
  window.removeEventListener('pagehide', releaseAllWatchesOnPageHide);
  window.removeEventListener('pageshow', resumeWatchesFromPageCache);
  pageLifecycleCleanupBound = false;
}

function releaseAllWatchesOnPageHide(event: PageTransitionEvent): void {
  const entries = [...watches.values()];
  if (!event.persisted) {
    watches.clear();
    unbindPageLifecycleCleanupIfIdle();
  }
  for (const entry of entries) {
    if (event.persisted) entry.suspended = true;
    else {
      entry.disposed = true;
      entry.confirm();
    }
    entry.releaseKeepalive = true;
    clearEntryLeaseRenewal(entry);
    trackWatchCleanup(entry.ready.then(() => releaseEntry(entry)));
  }
}

function resumeWatchesFromPageCache(event: PageTransitionEvent): void {
  if (!event.persisted) return;
  for (const entry of watches.values()) {
    if (!entry.suspended || entry.disposed) continue;
    entry.suspended = false;
    entry.releaseKeepalive = false;
    const resume = entry.ready.then(async () => {
      if (entry.subscriptionId) await releaseEntry(entry);
      // A pagehide keepalive attempt may have completed without confirmation
      // while this resume was queued; retry once in normal confirmed mode.
      if (entry.subscriptionId) await releaseEntry(entry);
      if (!entry.disposed && !entry.subscriptionId) {
        entry.released = false;
        await subscribeEntry(entry);
      }
    });
    entry.ready = resume;
    void resume.catch((err) => {
      console.warn('[resource-events] page-cache watch resume failed:', err);
    });
  }
}

export function isResourceEventMessage(
  event: ResourceEvent | null | undefined,
): event is ResourceEvent {
  return event?.type === 'resource.resync_required'
    || event?.type === 'resource.changed'
    || event?.type === 'resource.deleted'
    || event?.type === 'resource.renamed';
}

export function processResourceEventMessage(
  event: ResourceEvent | null | undefined,
  applyEvent?: (event: ResourceEvent) => Promise<void> | void,
): Promise<void> {
  return resourceEventClient.handleEvent(event, async (safeEvent) => {
    publishKnowledgeResourceTreeChange({
      kind: 'resource-event',
    });
    await applyEvent?.(safeEvent);
  });
}

export function catchUpResourceEventsAfterReconnect(applyEvent?: (event: ResourceEvent) => void): Promise<unknown> {
  return resourceEventClient.catchUpAfterReconnect({
    applyEvent: (safeEvent) => {
      publishKnowledgeResourceTreeChange({
        kind: 'resource-event',
      });
      applyEvent?.(safeEvent);
    },
  });
}

export function bindResourceEventForegroundCatchUp(
  applyEvent?: (event: ResourceEvent) => void,
  options: ForegroundCatchUpOptions = {},
): () => void {
  const windowObj = options.windowObj ?? (typeof window !== 'undefined' ? window : null);
  const documentObj = options.documentObj ?? (typeof document !== 'undefined' ? document : null);
  if (!windowObj || !documentObj) return () => {};

  const minIntervalMs = Math.max(0, Math.floor(Number(options.minIntervalMs ?? 1000) || 0));
  const now = options.now ?? (() => Date.now());
  const catchUp = options.catchUp ?? (() => catchUpResourceEventsAfterReconnect(applyEvent));
  let inFlight = false;
  let lastStartedAt = 0;

  const run = () => {
    if (documentObj.visibilityState === 'hidden') return;
    const startedAt = now();
    if (inFlight || (lastStartedAt && startedAt - lastStartedAt < minIntervalMs)) return;
    inFlight = true;
    lastStartedAt = startedAt;
    Promise.resolve(catchUp())
      .catch((err) => {
        console.warn('[resource-events] foreground catch-up failed:', err);
      })
      .finally(() => {
        inFlight = false;
      });
  };

  const onVisibilityChange = () => {
    if (documentObj.visibilityState === 'visible') run();
  };

  windowObj.addEventListener('focus', run);
  documentObj.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    windowObj.removeEventListener('focus', run);
    documentObj.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
