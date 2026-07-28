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

type WatchEntry = {
  ref: ResourceRef;
  refCount: number;
  subscriptionId: string | null;
  disposed: boolean;
  released: boolean;
  ready: Promise<void>;
};

const watches = new Map<string, WatchEntry>();

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

function normalizeResourceRef(ref: ResourceRef): ResourceRef {
  if (ref.kind === 'local-file') {
    return { kind: 'local-file', path: ref.path };
  }
  return {
    kind: 'mount',
    mountId: ref.mountId,
    path: String(ref.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''),
  };
}

export function resourceWatchKey(ref: ResourceRef): string {
  const normalized = normalizeResourceRef(ref);
  if (normalized.kind === 'local-file') {
    const slashed = normalized.path.replace(/\\/g, '/').replace(/\/+$/g, '');
    return `local-file:${/^[A-Za-z]:/.test(slashed) ? slashed.toLowerCase() : slashed}`;
  }
  return `mount:${normalized.mountId}:${normalized.path}`;
}

export function retainResourceWatch(ref: ResourceRef): () => void {
  const normalizedRef = normalizeResourceRef(ref);
  const key = resourceWatchKey(normalizedRef);
  const existing = watches.get(key);
  if (existing) {
    existing.refCount += 1;
    return () => releaseResourceWatch(key);
  }

  const entry: WatchEntry = {
    ref: normalizedRef,
    refCount: 1,
    subscriptionId: null,
    disposed: false,
    released: false,
    ready: Promise.resolve(),
  };
  entry.ready = subscribeEntry(entry);
  watches.set(key, entry);
  return () => releaseResourceWatch(key);
}

function subscribeEntry(entry: WatchEntry): Promise<void> {
  entry.released = false;
  return hanaFetch('/api/resource-io/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purpose: 'resource-watch', resources: [entry.ref] }),
    throwOnHttpError: false,
  })
    .then(res => res.json())
    .then((data) => {
      if (typeof data?.subscriptionId === 'string') entry.subscriptionId = data.subscriptionId;
      else console.warn('[resource-events] watch failed:', data?.error || entry.ref);
      if (entry.disposed) releaseEntry(entry);
    })
    .catch((err) => {
      if (!entry.disposed) console.warn('[resource-events] watch failed:', err);
    });
}

export function retainLocalFileResourceWatch(filePath: string): () => void {
  return retainResourceWatch({ kind: 'local-file', path: filePath });
}

function releaseResourceWatch(key: string): void {
  const entry = watches.get(key);
  if (!entry) return;
  if (entry.refCount > 1) {
    entry.refCount -= 1;
    return;
  }
  watches.delete(key);
  entry.disposed = true;
  void entry.ready.then(() => releaseEntry(entry));
}

function releaseEntry(entry: WatchEntry): void {
  if (entry.released || !entry.subscriptionId) return;
  entry.released = true;
  void hanaFetch(`/api/resource-io/subscriptions/${encodeURIComponent(entry.subscriptionId)}`, {
    method: 'DELETE',
    throwOnHttpError: false,
  }).catch((err) => {
    console.warn('[resource-events] unwatch failed:', err);
  });
}

async function resubscribeActiveWatches(): Promise<void> {
  const entries = [...watches.values()].filter(entry => !entry.disposed);
  await Promise.all(entries.map(async (entry) => {
    const previousSubscriptionId = entry.subscriptionId;
    entry.subscriptionId = null;
    if (previousSubscriptionId) {
      await hanaFetch(`/api/resource-io/subscriptions/${encodeURIComponent(previousSubscriptionId)}`, {
        method: 'DELETE',
        throwOnHttpError: false,
      }).catch((err) => {
        console.warn('[resource-events] stale unwatch failed:', err);
      });
    }
    if (!entry.disposed) entry.ready = subscribeEntry(entry);
    await entry.ready;
  }));
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
  return resourceEventClient.handleEvent(event, applyEvent);
}

export function catchUpResourceEventsAfterReconnect(applyEvent?: (event: ResourceEvent) => void): Promise<unknown> {
  return resourceEventClient.catchUpAfterReconnect({ applyEvent });
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
