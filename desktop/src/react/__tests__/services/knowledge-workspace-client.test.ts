import { describe, expect, it, vi } from 'vitest';
import {
  createKnowledgeWorkspaceClient,
  KnowledgeWorkspaceClientError,
} from '../../services/knowledge-workspace-client';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function changedEvent(sequence: number) {
  return {
    type: 'resource.changed' as const,
    changeType: 'modified' as const,
    sequence,
    resourceKey: `mount:docs:notes/${sequence}.md`,
    resource: {
      kind: 'mount' as const,
      mountId: 'docs',
      path: `notes/${sequence}.md`,
    },
    source: 'api',
    occurredAt: `2026-07-28T00:00:${String(sequence).padStart(2, '0')}.000Z`,
  };
}

async function advanceResourceCursor(
  client: ReturnType<typeof createKnowledgeWorkspaceClient>,
  sequence: number,
) {
  for (let current = 1; current <= sequence; current += 1) {
    await client.applyResourceEvent(changedEvent(current));
  }
}

describe('knowledge workspace client', () => {
  it('loads and validates the public source projection through the shared Renderer seam', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      sources: [{
        sourceKey: 'main',
        displayName: 'Workspace',
        role: 'main',
        capabilities: ['stat', 'read', 'list'],
        availability: 'available',
      }],
    }));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    await expect(client.listSources()).resolves.toEqual([{
      sourceKey: 'main',
      displayName: 'Workspace',
      role: 'main',
      capabilities: ['stat', 'read', 'list'],
      availability: 'available',
    }]);
    expect(fetchImpl).toHaveBeenCalledWith('/api/knowledge-workspace/sources', {
      method: 'GET',
      signal: undefined,
      throwOnHttpError: false,
    });
  });

  it('maps a failed response to the stable public knowledge error without exposing server text', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      code: 'knowledge_resource_unavailable',
      httpStatus: 503,
      retryable: true,
      message: 'private path /Users/alice/Secret',
    }, 503));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    const error = await client.listSources().catch((caught) => caught);

    expect(error).toBeInstanceOf(KnowledgeWorkspaceClientError);
    expect(error).toMatchObject({
      code: 'knowledge_resource_unavailable',
      httpStatus: 503,
      retryable: true,
    });
    expect(String(error)).not.toContain('/Users/alice/Secret');
  });

  it('sanitizes transport failures while preserving explicit caller aborts', async () => {
    const client = createKnowledgeWorkspaceClient({
      fetchImpl: vi.fn(async () => {
        throw new Error('connect failed at /Users/alice/Secret/socket');
      }),
    });

    const error = await client.listSources().catch((caught) => caught);

    expect(error).toMatchObject({
      code: 'knowledge_resource_unavailable',
      httpStatus: 503,
      retryable: true,
    });
    expect(String(error)).not.toContain('/Users/alice/Secret');
  });

  it('maps authorization failures to the out-of-scope knowledge error', async () => {
    const client = createKnowledgeWorkspaceClient({
      fetchImpl: vi.fn(async () => jsonResponse({
        error: 'insufficient_scope',
        reason: 'private server detail',
        capability: 'files.read',
      }, 403)),
    });

    await expect(client.listSources()).rejects.toMatchObject({
      code: 'knowledge_resource_out_of_scope',
      httpStatus: 403,
      retryable: false,
    });
  });

  it('fails closed when a successful response contains an unsafe source DTO', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      sources: [{
        sourceKey: 'main',
        displayName: '/Users/alice/Secret',
        role: 'main',
        capabilities: ['read'],
        availability: 'available',
      }],
    }));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    const error = await client.listSources().catch((caught) => caught);

    expect(error).toMatchObject({
      name: 'KnowledgeWorkspaceClientError',
      code: 'invalid_display_name',
      httpStatus: 400,
      retryable: false,
    });
    expect(String(error)).not.toContain('/Users/alice/Secret');
  });

  it('rejects a successful sources response that omits the sources array', async () => {
    const client = createKnowledgeWorkspaceClient({
      fetchImpl: vi.fn(async () => jsonResponse({ ok: true })),
    });

    await expect(client.listSources()).rejects.toMatchObject({
      code: 'knowledge_operation_precondition_failed',
      details: { field: 'sources' },
    });
  });

  it('propagates caller cancellation without converting it into a retryable server failure', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async (_path: string, options?: RequestInit) => {
      return await new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          reject(options.signal?.reason);
        }, { once: true });
      });
    });
    const client = createKnowledgeWorkspaceClient({ fetchImpl });
    const pending = client.listSources({ signal: controller.signal });

    controller.abort(new DOMException('cancelled', 'AbortError'));

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('preserves cancellation while consuming a response body', async () => {
    const controller = new AbortController();
    const reason = new DOMException('cancelled while reading', 'AbortError');
    const client = createKnowledgeWorkspaceClient({
      fetchImpl: vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          controller.abort(reason);
          throw reason;
        },
      })),
    });

    await expect(client.listSources({
      signal: controller.signal,
    })).rejects.toBe(reason);
  });

  it('preserves a caller abort that carries a custom non-AbortError reason', async () => {
    const controller = new AbortController();
    const reason = new Error('workspace switched');
    const fetchImpl = vi.fn(async (_path: string, options?: RequestInit) => {
      return await new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(reason), { once: true });
      });
    });
    const client = createKnowledgeWorkspaceClient({ fetchImpl });
    const pending = client.listSources({ signal: controller.signal });

    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
  });

  it('registers and removes mounted sources without sending Renderer authority or native paths', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        source: {
          sourceKey: 'research',
          displayName: 'Research',
          role: 'mounted',
          capabilities: ['read', 'list'],
          availability: 'available',
        },
      }, 201))
      .mockResolvedValueOnce(jsonResponse({ ok: true, sourceKey: 'research' }));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    await expect(client.registerSource({
      sourceKey: 'research',
      displayName: 'Research',
      mountId: 'mount-research',
    })).resolves.toMatchObject({ sourceKey: 'research', role: 'mounted' });
    await expect(client.removeSource('research')).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenNthCalledWith(1, '/api/knowledge-workspace/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceKey: 'research',
        displayName: 'Research',
        mountId: 'mount-research',
      }),
      signal: undefined,
      throwOnHttpError: false,
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      '/api/knowledge-workspace/sources/research',
      {
        method: 'DELETE',
        signal: undefined,
        throwOnHttpError: false,
      },
    );
  });

  it('fails closed when source removal returns a false success body', async () => {
    const client = createKnowledgeWorkspaceClient({
      fetchImpl: vi.fn(async () => jsonResponse({
        ok: false,
        sourceKey: 'research',
      })),
    });

    await expect(client.removeSource('research')).rejects.toMatchObject({
      code: 'knowledge_operation_precondition_failed',
      details: { field: 'removeSource' },
    });
  });

  it('recovers the resource-event cursor after a stale WebSocket gap without creating another watcher', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      stale: true,
      latestSequence: 9,
      events: [],
      resync: 'resource-stat-required',
    }));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });
    const recoverFromGap = vi.fn(async () => {});
    const applyEvent = vi.fn();
    await advanceResourceCursor(client, 4);

    await expect(client.catchUpResourceEvents({
      applyEvent,
      recoverFromGap,
    })).resolves.toMatchObject({ stale: true, latestSequence: 9 });

    expect(fetchImpl).toHaveBeenCalledWith('/api/resource-io/events?since=4', {
      method: 'GET',
      signal: undefined,
      throwOnHttpError: false,
    });
    expect(recoverFromGap).toHaveBeenCalledOnce();
    expect(applyEvent).not.toHaveBeenCalled();
    expect(client.lastResourceEventSequence()).toBe(9);
  });

  it('turns a non-contiguous catch-up response into authoritative recovery', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      stale: false,
      latestSequence: 6,
      events: [changedEvent(6)],
    }));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });
    await advanceResourceCursor(client, 4);
    const recoverFromGap = vi.fn(async () => {});
    const applyEvent = vi.fn();

    await expect(client.catchUpResourceEvents({
      applyEvent,
      recoverFromGap,
    })).resolves.toMatchObject({
      stale: true,
      latestSequence: 6,
      resync: 'resource-stat-required',
    });

    expect(recoverFromGap).toHaveBeenCalledOnce();
    expect(applyEvent).not.toHaveBeenCalled();
    expect(client.lastResourceEventSequence()).toBe(6);
  });

  it('resets the cursor after authoritative recovery from a server sequence epoch rollback', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      stale: false,
      latestSequence: 0,
      events: [],
    }));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });
    await advanceResourceCursor(client, 4);
    const recoverFromGap = vi.fn(async () => {});
    const applyEvent = vi.fn();

    await client.catchUpResourceEvents({ recoverFromGap, applyEvent });
    expect(recoverFromGap).toHaveBeenCalledOnce();
    expect(client.lastResourceEventSequence()).toBe(0);

    await client.applyResourceEvent(changedEvent(1), {
      recoverFromGap,
      applyEvent,
    });
    expect(applyEvent).toHaveBeenCalledWith(expect.objectContaining({
      sequence: 1,
    }));
    expect(client.lastResourceEventSequence()).toBe(1);
  });

  it('does not advance the cursor when applying a caught-up event fails', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      stale: false,
      latestSequence: 5,
      events: [changedEvent(5)],
    }));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });
    await advanceResourceCursor(client, 4);
    const recoverFromGap = vi.fn(async () => {});
    const applyFailure = new Error('projection failed');

    await expect(client.catchUpResourceEvents({
      applyEvent: () => {
        throw applyFailure;
      },
      recoverFromGap,
    })).rejects.toBe(applyFailure);

    expect(recoverFromGap).toHaveBeenCalledOnce();
    expect(client.lastResourceEventSequence()).toBe(4);
  });

  it('replays a live event gap before applying and committing the new cursor', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      stale: false,
      latestSequence: 6,
      events: [changedEvent(5), changedEvent(6)],
    }));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });
    await advanceResourceCursor(client, 4);
    const applyEvent = vi.fn();
    const recoverFromGap = vi.fn(async () => {});

    await client.applyResourceEvent(changedEvent(6), {
      applyEvent,
      recoverFromGap,
    });

    expect(fetchImpl).toHaveBeenCalledWith('/api/resource-io/events?since=4', expect.objectContaining({
      method: 'GET',
    }));
    expect(applyEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({ sequence: 5 }));
    expect(applyEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({ sequence: 6 }));
    expect(client.lastResourceEventSequence()).toBe(6);
  });

  it('does not commit a live event cursor before its handler succeeds', async () => {
    const client = createKnowledgeWorkspaceClient({ fetchImpl: vi.fn() });
    await advanceResourceCursor(client, 4);
    const failure = new Error('live projection failed');

    await expect(client.applyResourceEvent(changedEvent(5), {
      applyEvent: () => {
        throw failure;
      },
      recoverFromGap: vi.fn(async () => {}),
    })).rejects.toBe(failure);

    expect(client.lastResourceEventSequence()).toBe(4);
  });

  it('rejects unknown event fields before they can poison the shared cursor', async () => {
    const client = createKnowledgeWorkspaceClient({
      fetchImpl: vi.fn(),
    });

    await expect(client.applyResourceEvent({
      ...changedEvent(9),
      token: 'secret',
    })).rejects.toMatchObject({
      code: 'knowledge_operation_precondition_failed',
    });

    expect(client.lastResourceEventSequence()).toBe(0);
  });

  it('turns loopback events carrying native paths into recovery without exposing the path', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      stale: false,
      latestSequence: 5,
      events: [{
        type: 'resource.changed',
        changeType: 'modified',
        sequence: 5,
        resourceKey: 'local_fs:/Users/alice/Secret/a.md',
        resource: {
          kind: 'local-file',
          path: '/Users/alice/Secret/a.md',
          filePath: '/Users/alice/Secret/a.md',
        },
        source: 'provider_watch',
        occurredAt: '2026-07-28T00:00:05.000Z',
      }],
    }));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });
    await advanceResourceCursor(client, 4);
    const recoverFromGap = vi.fn(async () => {});
    const applyEvent = vi.fn();

    const result = await client.catchUpResourceEvents({
      applyEvent,
      recoverFromGap,
    });

    expect(result).toMatchObject({
      stale: true,
      latestSequence: 5,
      events: [],
    });
    expect(JSON.stringify(result)).not.toContain('/Users/alice/Secret');
    expect(recoverFromGap).toHaveBeenCalledOnce();
    expect(applyEvent).not.toHaveBeenCalled();
  });

  it('reads ordinary resources through ResourceIO and strips local-only response paths', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      resourceKey: 'mount:docs:notes/a.md',
      resource: { kind: 'mount', mountId: 'docs', path: 'notes/a.md' },
      filePath: '/Users/alice/Secret/notes/a.md',
      content: '# A',
      encoding: 'utf-8',
      version: { mtimeMs: 12, size: 3, etag: 'v1' },
    }));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    await expect(client.resources.read({
      sourceKey: 'main',
      relativePath: 'notes/a.md',
    })).resolves.toEqual({
      content: '# A',
      encoding: 'utf-8',
      version: { mtimeMs: 12, size: 3, etag: 'v1' },
    });
    expect(fetchImpl).toHaveBeenCalledWith('/api/resource-io/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: { sourceKey: 'main', relativePath: 'notes/a.md' },
        encoding: 'utf-8',
      }),
      signal: undefined,
      throwOnHttpError: false,
    });
  });

  it('uses expected-version ResourceIO writes and returns only the provider-neutral result', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      resourceKey: 'mount:docs:notes/a.md',
      resource: { kind: 'mount', mountId: 'docs', path: 'notes/a.md' },
      filePath: '/Users/alice/Secret/notes/a.md',
      changeType: 'modified',
      version: { mtimeMs: 13, size: 4, etag: 'v2' },
    }));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    await expect(client.resources.writeExpectedVersion(
      { sourceKey: 'main', relativePath: 'notes/a.md' },
      '# B',
      { mtimeMs: 12, size: 3, etag: 'v1' },
    )).resolves.toEqual({
      ok: true,
      changeType: 'modified',
      version: { mtimeMs: 13, size: 4, etag: 'v2' },
    });
    expect(fetchImpl).toHaveBeenCalledWith('/api/resource-io/write-expected-version', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: { sourceKey: 'main', relativePath: 'notes/a.md' },
        content: '# B',
        encoding: 'utf-8',
        expectedVersion: { mtimeMs: 12, size: 3, etag: 'v1' },
      }),
      signal: undefined,
      throwOnHttpError: false,
    });
  });

  it('returns an expected-version conflict as data so the document session can enter explicit resolution', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      ok: false,
      conflict: true,
      safeMessage: 'Resource write conflict',
      filePath: '/Users/alice/Secret/notes/a.md',
      version: { mtimeMs: 14, size: 5, etag: 'v3' },
    }, 409));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    await expect(client.resources.writeExpectedVersion(
      { sourceKey: 'main', relativePath: 'notes/a.md' },
      '# B',
      { mtimeMs: 12, size: 3, etag: 'v1' },
    )).resolves.toEqual({
      ok: false,
      conflict: true,
      version: { mtimeMs: 14, size: 5, etag: 'v3' },
    });
  });

  it('maps a 409 body without an explicit version conflict to the stable conflict error', async () => {
    const client = createKnowledgeWorkspaceClient({
      fetchImpl: vi.fn(async () => jsonResponse({
        ok: false,
        conflict: false,
      }, 409)),
    });

    await expect(client.resources.writeExpectedVersion(
      { sourceKey: 'main', relativePath: 'notes/a.md' },
      '# B',
      { mtimeMs: 12, size: 3, etag: 'v1' },
    )).rejects.toMatchObject({
      code: 'knowledge_resource_conflict',
      httpStatus: 409,
      retryable: false,
    });
  });

  it('preserves a stable 409 knowledge error envelope instead of treating it as write-conflict data', async () => {
    const client = createKnowledgeWorkspaceClient({
      fetchImpl: vi.fn(async () => jsonResponse({
        code: 'knowledge_resource_conflict',
        httpStatus: 409,
        retryable: false,
      }, 409)),
    });

    await expect(client.resources.writeExpectedVersion(
      { sourceKey: 'main', relativePath: 'notes/a.md' },
      '# B',
      { mtimeMs: 12, size: 3, etag: 'v1' },
    )).rejects.toMatchObject({
      code: 'knowledge_resource_conflict',
      httpStatus: 409,
      retryable: false,
    });
  });

  it('projects ResourceIO stat responses without local identity fields', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      exists: true,
      isDirectory: false,
      filePath: '/Users/alice/Secret/notes/a.md',
      version: { size: 3, mtimeMs: 12 },
    }));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    await expect(client.resources.stat({
      sourceKey: 'main',
      relativePath: 'notes/a.md',
    })).resolves.toEqual({
      exists: true,
      isDirectory: false,
      version: { size: 3, mtimeMs: 12 },
    });
  });

  it('validates ResourceIO directory entries before exposing them to Knowledge state', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      resourceKey: 'mount:docs:notes',
      filePath: '/Users/alice/Secret/notes',
      items: [{
        name: 'a.md',
        isDirectory: false,
        size: 3,
        mtimeMs: 12,
        filePath: '/Users/alice/Secret/notes/a.md',
      }],
    }));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    await expect(client.resources.list({
      sourceKey: 'main',
      relativePath: 'notes',
    })).resolves.toEqual({
      items: [{
        name: 'a.md',
        isDirectory: false,
        size: 3,
        mtimeMs: 12,
      }],
    });
  });

  it('rejects fractional byte counts in ResourceIO projections', async () => {
    const client = createKnowledgeWorkspaceClient({
      fetchImpl: vi.fn(async () => jsonResponse({
        items: [{
          name: 'a.md',
          isDirectory: false,
          size: 1.5,
          mtimeMs: 12,
        }],
      })),
    });

    await expect(client.resources.list({
      sourceKey: 'main',
      relativePath: 'notes',
    })).rejects.toMatchObject({
      code: 'knowledge_operation_precondition_failed',
      details: { field: 'items.0' },
    });
  });

  it('keeps ResourceIO search results source-relative and omits provider file paths', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      matches: [{
        filePath: '/Users/alice/Secret/notes/a.md',
        relativePath: 'notes/a.md',
        parentSubdir: 'notes',
        name: 'a.md',
        line: 2,
        text: 'needle',
        isDirectory: false,
        size: 6,
        mtimeMs: 12,
      }],
    }));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    await expect(client.resources.search(
      { sourceKey: 'main', relativePath: 'notes' },
      'needle',
    )).resolves.toEqual({
      matches: [{
        relativePath: 'notes/a.md',
        parentSubdir: 'notes',
        name: 'a.md',
        line: 2,
        text: 'needle',
        isDirectory: false,
        size: 6,
        mtimeMs: 12,
      }],
    });
  });
});
