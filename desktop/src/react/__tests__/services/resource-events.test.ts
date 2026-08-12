/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const hanaFetch = vi.hoisted(() => vi.fn(async (path: string): Promise<{
  ok?: boolean;
  status?: number;
  json: () => Promise<unknown>;
}> => ({
  json: async () => (
    path.endsWith('/subscribe')
      ? { ok: true, subscriptionId: 'sub-1' }
      : { ok: true, released: true }
  ),
})));

vi.mock('../../hooks/use-hana-fetch', () => ({ hanaFetch }));

describe('resource-events', () => {
  afterEach(() => {
    vi.useRealTimers();
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

  it('subscribes to Knowledge sources without exposing provider refs', async () => {
    const { retainKnowledgeSourceWatch } = await import('../../services/resource-events');

    const releaseFirst = retainKnowledgeSourceWatch('main');
    const releaseSecond = retainKnowledgeSourceWatch('main');
    await releaseFirst.ready;
    await releaseSecond.ready;

    expect(hanaFetch).toHaveBeenCalledTimes(1);
    expect(hanaFetch).toHaveBeenCalledWith('/api/resource-io/subscribe', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        purpose: 'knowledge-source-watch',
        sourceKeys: ['main'],
      }),
    }));
    expect(JSON.stringify(hanaFetch.mock.calls)).not.toMatch(
      /local-file|mountId|filePath|resolvedPath|[/\\\\](?:Users|private|tmp)[/\\\\]/,
    );
    expect(Object.keys(releaseFirst)).not.toContain('ready');

    releaseFirst();
    releaseSecond();
    await vi.waitFor(() => {
      expect(hanaFetch).toHaveBeenCalledWith(
        '/api/resource-io/subscriptions/sub-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  it('serializes a stale-cursor resubscribe behind the pending initial subscription', async () => {
    let subscribeCalls = 0;
    let resolveInitialSubscribe: ((response: {
      ok: boolean;
      status: number;
      json: () => Promise<unknown>;
    }) => void) | undefined;
    hanaFetch.mockImplementation(async (requestPath: string) => {
      if (requestPath.endsWith('/subscribe')) {
        subscribeCalls += 1;
        if (subscribeCalls === 1) {
          return await new Promise((resolve) => {
            resolveInitialSubscribe = resolve;
          });
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, subscriptionId: 'sub-2' }),
        };
      }
      if (requestPath.includes('/events?since=')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            stale: true,
            latestSequence: 4,
            events: [],
            resync: 'resource-stat-required',
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, released: true }),
      };
    });
    const {
      catchUpResourceEventsAfterReconnect,
      retainKnowledgeSourceWatch,
    } = await import('../../services/resource-events');

    const release = retainKnowledgeSourceWatch('main');
    await vi.waitFor(() => expect(subscribeCalls).toBe(1));
    const catchUp = catchUpResourceEventsAfterReconnect();
    await vi.waitFor(() => {
      expect(hanaFetch.mock.calls.some(
        ([requestPath]) => String(requestPath).includes('/events?since='),
      )).toBe(true);
    });
    expect(subscribeCalls).toBe(1);

    resolveInitialSubscribe?.({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, subscriptionId: 'sub-1' }),
    });
    await catchUp;
    expect(subscribeCalls).toBe(2);
    expect(hanaFetch).toHaveBeenCalledWith(
      '/api/resource-io/subscriptions/sub-1',
      expect.objectContaining({ method: 'DELETE' }),
    );

    release();
    await vi.waitFor(() => {
      expect(hanaFetch).toHaveBeenCalledWith(
        '/api/resource-io/subscriptions/sub-2',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  it('retains the subscription id and retries until DELETE is positively confirmed', async () => {
    vi.useFakeTimers();
    let deleteCalls = 0;
    hanaFetch.mockImplementation(async (requestPath: string) => {
      if (requestPath.endsWith('/subscribe')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, subscriptionId: 'sub-retry' }),
        };
      }
      deleteCalls += 1;
      if (deleteCalls === 1) throw new TypeError('network down');
      if (deleteCalls === 2) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ ok: false }),
        };
      }
      if (deleteCalls === 3) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, released: false }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, released: true }),
      };
    });
    const {
      retainKnowledgeSourceWatch,
      waitForResourceWatchCleanup,
    } = await import('../../services/resource-events');

    const release = retainKnowledgeSourceWatch('main');
    await Promise.resolve();
    await Promise.resolve();
    release();
    const cleanup = waitForResourceWatchCleanup();
    await vi.advanceTimersByTimeAsync(1_750);
    await cleanup;

    expect(deleteCalls).toBe(4);
    expect(hanaFetch).toHaveBeenLastCalledWith(
      '/api/resource-io/subscriptions/sub-retry',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('uses pagehide keepalive cleanup and cancels the active lease heartbeat', async () => {
    vi.useFakeTimers();
    hanaFetch.mockImplementation(async (requestPath: string) => {
      if (requestPath.endsWith('/subscribe')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            subscriptionId: 'sub-pagehide',
            leaseDurationMs: 30_000,
            leaseExpiresAt: new Date(Date.now() + 30_000).toISOString(),
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, released: true }),
      };
    });
    const {
      retainKnowledgeSourceWatch,
      waitForResourceWatchCleanup,
    } = await import('../../services/resource-events');

    retainKnowledgeSourceWatch('main');
    await Promise.resolve();
    await Promise.resolve();
    window.dispatchEvent(new Event('pagehide'));
    await waitForResourceWatchCleanup();

    expect(hanaFetch).toHaveBeenCalledWith(
      '/api/resource-io/subscriptions/sub-pagehide',
      expect.objectContaining({
        method: 'DELETE',
        keepalive: true,
      }),
    );
    await vi.advanceTimersByTimeAsync(30_000);
    expect(hanaFetch.mock.calls.some(
      ([requestPath]) => String(requestPath).endsWith('/renew'),
    )).toBe(false);
  });

  it('renews an active remote watch lease before it expires', async () => {
    vi.useFakeTimers();
    hanaFetch.mockImplementation(async (requestPath: string) => {
      if (requestPath.endsWith('/subscribe')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            subscriptionId: 'sub-renew',
            leaseDurationMs: 3_000,
            leaseExpiresAt: new Date(Date.now() + 3_000).toISOString(),
          }),
        };
      }
      if (requestPath.endsWith('/renew')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            renewed: true,
            leaseDurationMs: 3_000,
            leaseExpiresAt: new Date(Date.now() + 3_000).toISOString(),
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, released: true }),
      };
    });
    const {
      retainKnowledgeSourceWatch,
      waitForResourceWatchCleanup,
    } = await import('../../services/resource-events');

    const release = retainKnowledgeSourceWatch('main');
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(hanaFetch).toHaveBeenCalledWith(
      '/api/resource-io/subscriptions/sub-renew/renew',
      expect.objectContaining({ method: 'POST' }),
    );
    release();
    await waitForResourceWatchCleanup();
  });

  it('backs off after renew failures cross lease expiry and recovers after repeated subscribe failures', async () => {
    vi.useFakeTimers();
    let subscribeCalls = 0;
    let renewCalls = 0;
    let recovered = false;
    hanaFetch.mockImplementation(async (requestPath: string) => {
      if (requestPath.endsWith('/subscribe')) {
        subscribeCalls += 1;
        if (subscribeCalls > 1 && !recovered) throw new TypeError('offline');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            subscriptionId: `sub-backoff-${subscribeCalls}`,
            leaseDurationMs: 3_000,
            leaseExpiresAt: new Date(Date.now() + 3_000).toISOString(),
          }),
        };
      }
      if (requestPath.endsWith('/renew')) {
        renewCalls += 1;
        throw new TypeError('offline');
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, released: true }),
      };
    });
    const {
      retainKnowledgeSourceWatch,
      waitForResourceWatchCleanup,
    } = await import('../../services/resource-events');

    const release = retainKnowledgeSourceWatch('main');
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(7_000);

    expect(renewCalls).toBeGreaterThan(0);
    expect(renewCalls).toBeLessThanOrEqual(4);
    expect(subscribeCalls).toBeGreaterThan(1);
    expect(subscribeCalls).toBeLessThanOrEqual(5);

    const subscribeCallsBeforeRecovery = subscribeCalls;
    const renewCallsBeforeRecovery = renewCalls;
    recovered = true;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(subscribeCalls).toBeGreaterThan(subscribeCallsBeforeRecovery);
    expect(renewCalls).toBeGreaterThan(renewCallsBeforeRecovery);

    release();
    await waitForResourceWatchCleanup();
  });

  it('retries subscription reconstruction when renewed:false is followed by a transient subscribe failure', async () => {
    vi.useFakeTimers();
    let subscribeCalls = 0;
    hanaFetch.mockImplementation(async (requestPath: string) => {
      if (requestPath.endsWith('/subscribe')) {
        subscribeCalls += 1;
        if (subscribeCalls === 2) throw new TypeError('one transient failure');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            subscriptionId: `sub-rebuild-${subscribeCalls}`,
            leaseDurationMs: 3_000,
            leaseExpiresAt: new Date(Date.now() + 3_000).toISOString(),
          }),
        };
      }
      if (requestPath.endsWith('/renew')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, renewed: false }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, released: true }),
      };
    });
    const {
      retainKnowledgeSourceWatch,
      waitForResourceWatchCleanup,
    } = await import('../../services/resource-events');

    const release = retainKnowledgeSourceWatch('main');
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(2_500);

    expect(subscribeCalls).toBe(3);
    release();
    await waitForResourceWatchCleanup();
  });

  it('cancels a queued subscribe backoff before an authoritative gap resubscribe', async () => {
    vi.useFakeTimers();
    let subscribeCalls = 0;
    let resolveGapSubscribe: ((response: {
      ok: boolean;
      status: number;
      json: () => Promise<unknown>;
    }) => void) | undefined;
    hanaFetch.mockImplementation(async (requestPath: string) => {
      if (requestPath.endsWith('/subscribe')) {
        subscribeCalls += 1;
        if (subscribeCalls === 1) {
          return {
            ok: false,
            status: 503,
            json: async () => ({ error: 'temporarily unavailable' }),
          };
        }
        return await new Promise((resolve) => {
          resolveGapSubscribe = resolve;
        });
      }
      if (requestPath.includes('/events?since=')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            stale: true,
            latestSequence: 1,
            events: [],
            resync: 'resource-stat-required',
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, released: true }),
      };
    });
    const {
      catchUpResourceEventsAfterReconnect,
      retainKnowledgeSourceWatch,
      waitForResourceWatchCleanup,
    } = await import('../../services/resource-events');

    const release = retainKnowledgeSourceWatch('main');
    await Promise.resolve();
    await Promise.resolve();
    expect(subscribeCalls).toBe(1);

    const catchUp = catchUpResourceEventsAfterReconnect();
    await vi.waitFor(() => expect(subscribeCalls).toBe(2));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(subscribeCalls).toBe(2);

    resolveGapSubscribe?.({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, subscriptionId: 'sub-gap' }),
    });
    await catchUp;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(subscribeCalls).toBe(2);

    release();
    await waitForResourceWatchCleanup();
  });

  it('releases and restores watches across a BFCache page transition', async () => {
    let subscribeCalls = 0;
    hanaFetch.mockImplementation(async (requestPath: string) => {
      if (requestPath.endsWith('/subscribe')) {
        subscribeCalls += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            subscriptionId: `sub-cache-${subscribeCalls}`,
          }),
        };
      }
      if (requestPath.includes('/events?since=')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            stale: true,
            latestSequence: 1,
            events: [],
            resync: 'resource-stat-required',
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, released: true }),
      };
    });
    const {
      retainKnowledgeSourceWatch,
      catchUpResourceEventsAfterReconnect,
      waitForResourceWatchCleanup,
    } = await import('../../services/resource-events');
    const transitionEvent = (type: string) => {
      const event = new Event(type);
      Object.defineProperty(event, 'persisted', { value: true });
      return event;
    };

    const release = retainKnowledgeSourceWatch('main');
    await Promise.resolve();
    await Promise.resolve();
    window.dispatchEvent(transitionEvent('pagehide'));
    await waitForResourceWatchCleanup();
    await catchUpResourceEventsAfterReconnect();
    expect(subscribeCalls).toBe(1);
    window.dispatchEvent(transitionEvent('pageshow'));
    await vi.waitFor(() => expect(subscribeCalls).toBe(2));

    release();
    await waitForResourceWatchCleanup();
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

  it('recovers from a nonempty catch-up page projected as a resync', async () => {
    const applyEvent = vi.fn();
    const requeryAfterGap = vi.fn(async () => {});
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        stale: true,
        latestSequence: 2,
        events: [],
        resync: 'resource-stat-required',
      }),
    }));
    const { createResourceEventClient } = await import('../../services/resource-events');
    const client = createResourceEventClient({
      fetchImpl,
      applyEvent,
      requeryAfterGap,
    });

    await expect(client.catchUpAfterReconnect()).resolves.toEqual({
      stale: true,
      latestSequence: 2,
      events: [],
      resync: 'resource-stat-required',
    });

    expect(requeryAfterGap).toHaveBeenCalledOnce();
    expect(applyEvent).not.toHaveBeenCalled();
    expect(client.lastSeenSequence()).toBe(2);
  });

  it('accepts a safe resync cursor event and advances the sequence without paths', async () => {
    const { createResourceEventClient } = await import('../../services/resource-events');
    const client = createResourceEventClient({
      requeryAfterGap: vi.fn(async () => {}),
    });
    const event = {
      type: 'resource.resync_required',
      studioId: 'studio_1',
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
      studioId: '/private/server/studio',
      sequence: 13,
    })).rejects.toMatchObject({
      code: 'knowledge_operation_precondition_failed',
    });
    expect(client.lastSeenSequence()).toBe(12);
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

  it('fans accepted ResourceIO events out to Knowledge tree projections and stops after cleanup', async () => {
    const {
      processResourceEventMessage,
      subscribeKnowledgeResourceTreeChanges,
    } = await import('../../services/resource-events');
    const listener = vi.fn();
    const unsubscribe = subscribeKnowledgeResourceTreeChanges(listener);

    await processResourceEventMessage({
      type: 'resource.changed',
      changeType: 'created',
      sequence: 1,
      resourceKey: 'mount:docs:notes/new.md',
      resource: { kind: 'mount', mountId: 'docs', path: 'notes/new.md' },
      source: 'provider_watch',
      occurredAt: '2026-07-28T00:00:01.000Z',
    });

    expect(listener).toHaveBeenCalledWith({ kind: 'resource-event' });
    unsubscribe();

    await processResourceEventMessage({
      type: 'resource.deleted',
      sequence: 2,
      resourceKey: 'mount:docs:notes/new.md',
      resource: { kind: 'mount', mountId: 'docs', path: 'notes/new.md' },
      source: 'provider_watch',
      occurredAt: '2026-07-28T00:00:02.000Z',
    });
    expect(listener).toHaveBeenCalledTimes(1);
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
