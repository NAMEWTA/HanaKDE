/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const hanaFetch = vi.hoisted(() => vi.fn(async (path: string) => ({
  json: async () => (path.endsWith('/subscribe') ? { ok: true, subscriptionId: 'sub-1' } : { ok: true }),
})));

vi.mock('../../hooks/use-hana-fetch', () => ({ hanaFetch }));

describe('resource-events', () => {
  afterEach(() => {
    vi.resetModules();
    hanaFetch.mockClear();
  });

  it('shares one backend resource subscription per local file and releases it after the last subscriber leaves', async () => {
    const { retainLocalFileResourceWatch } = await import('../../services/resource-events');

    const releaseFirst = retainLocalFileResourceWatch('/tmp/note.md');
    const releaseSecond = retainLocalFileResourceWatch('/tmp/note.md');
    await Promise.resolve();

    expect(hanaFetch).toHaveBeenCalledTimes(1);
    expect(hanaFetch).toHaveBeenCalledWith('/api/resource-io/subscribe', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        purpose: 'resource-watch',
        resources: [{ kind: 'local-file', path: '/tmp/note.md' }],
      }),
    }));

    releaseFirst();
    await Promise.resolve();
    expect(hanaFetch).toHaveBeenCalledTimes(1);

    releaseSecond();
    await Promise.resolve();
    await Promise.resolve();

    expect(hanaFetch).toHaveBeenCalledWith('/api/resource-io/subscriptions/sub-1', expect.objectContaining({
      method: 'DELETE',
    }));
  });

  it('dedupes mount ResourceRefs without materializing native paths in the renderer', async () => {
    const { retainResourceWatch } = await import('../../services/resource-events');

    const releaseFirst = retainResourceWatch({ kind: 'mount', mountId: 'mount_docs', path: 'notes' });
    const releaseSecond = retainResourceWatch({ kind: 'mount', mountId: 'mount_docs', path: 'notes/' });
    await Promise.resolve();

    expect(hanaFetch).toHaveBeenCalledTimes(1);
    expect(hanaFetch).toHaveBeenCalledWith('/api/resource-io/subscribe', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        purpose: 'resource-watch',
        resources: [{ kind: 'mount', mountId: 'mount_docs', path: 'notes' }],
      }),
    }));

    releaseFirst();
    releaseSecond();
  });

  it('requests catch-up after reconnect with the last seen resource event sequence', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ stale: false, latestSequence: 1, events: [] }),
    }));
    const { createResourceEventClient } = await import('../../services/resource-events');
    const client = createResourceEventClient({ fetchImpl });

    await client.handleEvent({
      type: 'resource.changed',
      sequence: 1,
      resourceKey: 'mount:docs:a.md',
      resource: { kind: 'mount', mountId: 'docs', path: 'a.md' },
      changeType: 'modified',
      source: 'api',
      occurredAt: '2026-06-22T00:00:00.000Z',
    });
    await client.catchUpAfterReconnect();

    expect(fetchImpl).toHaveBeenCalledWith('/api/resource-io/events?since=1', expect.objectContaining({
      method: 'GET',
      throwOnHttpError: false,
    }));
  });

  it('applies caught-up resource events through the same event handler', async () => {
    const event = {
      type: 'resource.changed',
      sequence: 2,
      resourceKey: 'mount:docs:notes/b.md',
      resource: { kind: 'mount', mountId: 'docs', path: 'notes/b.md' },
      changeType: 'modified',
      source: 'provider_watch',
      occurredAt: '2026-06-22T00:00:01.000Z',
    };
    const applyEvent = vi.fn();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ stale: false, latestSequence: 2, events: [event] }),
    }));
    const { createResourceEventClient } = await import('../../services/resource-events');
    const client = createResourceEventClient({ fetchImpl, applyEvent });
    await client.handleEvent({
      ...event,
      sequence: 1,
      resourceKey: 'mount:docs:notes/a.md',
      resource: { kind: 'mount', mountId: 'docs', path: 'notes/a.md' },
      occurredAt: '2026-06-22T00:00:00.000Z',
    });

    await client.catchUpAfterReconnect();

    expect(applyEvent).toHaveBeenCalledWith({
      type: 'resource.changed',
      changeType: 'modified',
      sequence: 2,
      resource: { kind: 'mount', mountId: 'docs', path: 'notes/b.md' },
      source: 'provider_watch',
      occurredAt: '2026-06-22T00:00:01.000Z',
    });
    expect(client.lastSeenSequence()).toBe(2);
  });

  it('accepts a safe resync cursor event and advances the sequence without paths', async () => {
    const { createResourceEventClient } = await import('../../services/resource-events');
    const client = createResourceEventClient({
      requeryAfterGap: vi.fn(async () => {}),
    });
    const event = {
      type: 'resource.resync_required',
      stale: true,
      resync: 'resource-stat-required',
      source: 'provider_watch',
      operationId: '6f0d2f1a-4d5e-4a5b-9b6a-1f2e3d4c5b6a',
      sourceId: '7f0d2f1a-4d5e-4a5b-9b6a-1f2e3d4c5b6b',
      sequence: 12,
      occurredAt: '2026-07-26T00:00:00.000Z',
    };
    await client.handleEvent(event);
    expect(client.lastSeenSequence()).toBe(12);
    expect(JSON.stringify(event)).not.toMatch(/[/\\\\](?:Users|private|tmp)[/\\\\]/);
    await expect(client.handleEvent({
      ...event,
      sequence: 13,
      stale: false,
    })).rejects.toMatchObject({
      code: 'knowledge_operation_precondition_failed',
    });
    expect(client.lastSeenSequence()).toBe(12);
  });

  it('shares the production cursor with the singleton Knowledge workspace client', async () => {
    const {
      processResourceEventMessage,
    } = await import('../../services/resource-events');
    const {
      knowledgeWorkspaceClient,
    } = await import('../../services/knowledge-workspace-client');

    await processResourceEventMessage({
      type: 'resource.changed',
      changeType: 'modified',
      sequence: 1,
      resourceKey: 'mount:docs:notes/a.md',
      resource: { kind: 'mount', mountId: 'docs', path: 'notes/a.md' },
      source: 'api',
      occurredAt: '2026-07-28T00:00:01.000Z',
    });

    expect(knowledgeWorkspaceClient.lastResourceEventSequence()).toBe(1);
  });

  it('resubscribes and performs authoritative requery before accepting a stale cursor', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        stale: true,
        latestSequence: 8,
        events: [],
        resync: 'resource-stat-required',
      }),
    }));
    const resubscribeWatches = vi.fn(async () => {});
    const requeryAfterGap = vi.fn(async () => {});
    const { createResourceEventClient } = await import('../../services/resource-events');
    const client = createResourceEventClient({
      fetchImpl,
      resubscribeWatches,
      requeryAfterGap,
    });

    await client.catchUpAfterReconnect();

    expect(resubscribeWatches).toHaveBeenCalledOnce();
    expect(requeryAfterGap).toHaveBeenCalledOnce();
    expect(client.lastSeenSequence()).toBe(8);
  });

  it('requests ResourceIO catch-up when the renderer returns to the foreground', async () => {
    const listeners = new Map<string, () => void>();
    const windowObj = {
      addEventListener: vi.fn((type: string, listener: () => void) => listeners.set(`window:${type}`, listener)),
      removeEventListener: vi.fn(),
    };
    let visibilityState: Document['visibilityState'] = 'hidden';
    const documentObj = {
      addEventListener: vi.fn((type: string, listener: () => void) => listeners.set(`document:${type}`, listener)),
      removeEventListener: vi.fn(),
      get visibilityState() {
        return visibilityState;
      },
    };
    const catchUp = vi.fn(async () => undefined);
    const { bindResourceEventForegroundCatchUp } = await import('../../services/resource-events');

    const dispose = bindResourceEventForegroundCatchUp(undefined, {
      windowObj: windowObj as never,
      documentObj: documentObj as never,
      catchUp,
      minIntervalMs: 0,
      now: () => 100,
    });

    listeners.get('window:focus')?.();
    expect(catchUp).not.toHaveBeenCalled();

    visibilityState = 'visible';
    listeners.get('document:visibilitychange')?.();
    await Promise.resolve();

    expect(catchUp).toHaveBeenCalledTimes(1);
    dispose();
    expect(windowObj.removeEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(documentObj.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});
