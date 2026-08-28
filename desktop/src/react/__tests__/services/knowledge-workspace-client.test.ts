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
  it('scopes knowledge and ResourceIO requests to the active Desk workspace', async () => {
    const fetchImpl = vi.fn(async (path: string) => {
      if (path.startsWith('/api/knowledge-workspace/sources')) {
        return jsonResponse({ sources: [] });
      }
      if (path.startsWith('/api/resource-io/read')) {
        return jsonResponse({ content: '# Note', encoding: 'utf-8' });
      }
      return jsonResponse({ stale: false, latestSequence: 0, events: [] });
    });
    const client = createKnowledgeWorkspaceClient({
      fetchImpl,
      workspaceSelector: {
        workspaceMountId: 'workspace-docs',
        workspaceLabel: '工作项目',
        workspaceAgentId: 'agent-1',
      },
    });

    await client.listSources();
    await client.resources.read({ sourceKey: 'main', relativePath: 'README.md' });
    await client.catchUpResourceEvents();

    const suffix = 'workspaceMountId=workspace-docs&workspaceLabel=%E5%B7%A5%E4%BD%9C%E9%A1%B9%E7%9B%AE&workspaceAgentId=agent-1';
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      `/api/knowledge-workspace/sources?${suffix}`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      `/api/resource-io/read?${suffix}`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      `/api/resource-io/events?since=0&${suffix}`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('copies an editor resource through the domain endpoint and validates the result', async () => {
    const fetchImpl = vi.fn(async (
      _path: string,
      _options?: RequestInit,
    ) => jsonResponse({
      result: {
        copied: true,
        targetAddress: {
          sourceKey: 'main',
          relativePath: 'Notes/assets/2026-07-30-photo.png',
        },
        bytesTransferred: 5,
        embed: true,
        originalName: 'photo.png',
      },
    }, 201));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    await expect(client.copyForEditor({
      sourceAddress: {
        sourceKey: 'research',
        relativePath: 'Media/photo.png',
      },
      pageAddress: {
        sourceKey: 'main',
        relativePath: 'Notes/Host.md',
      },
      kind: 'attachment',
      localDate: '2026-07-30',
    })).resolves.toMatchObject({
      copied: true,
      targetAddress: {
        sourceKey: 'main',
        relativePath: 'Notes/assets/2026-07-30-photo.png',
      },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/knowledge-workspace/copy-for-editor',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          sourceAddress: {
            sourceKey: 'research',
            relativePath: 'Media/photo.png',
          },
          pageAddress: {
            sourceKey: 'main',
            relativePath: 'Notes/Host.md',
          },
          kind: 'attachment',
          localDate: '2026-07-30',
        }),
      }),
    );
  });

  it('streams an external File body with opaque bounded metadata', async () => {
    const fetchImpl = vi.fn(async (
      _path: string,
      _options?: RequestInit,
    ) => jsonResponse({
      result: {
        copied: true,
        targetAddress: {
          sourceKey: 'main',
          relativePath: 'Notes/assets/2026-07-30-photo.png',
        },
        bytesTransferred: 5,
        embed: true,
        originalName: 'photo.png',
      },
    }, 201));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });
    const file = new File(['bytes'], 'photo.png', { type: 'image/png' });

    await client.copyExternalForEditor(file, {
      pageAddress: {
        sourceKey: 'main',
        relativePath: 'Notes/Host.md',
      },
      localDate: '2026-07-30',
    });

    const [, options] = fetchImpl.mock.calls[0];
    expect(fetchImpl.mock.calls[0][0]).toBe(
      '/api/knowledge-workspace/copy-external-for-editor',
    );
    expect(options?.body).toBe(file);
    const metadataHeader = (
      options?.headers as Record<string, string>
    )['X-Hanako-Knowledge-Copy'];
    expect(JSON.parse(
      Buffer.from(metadataHeader, 'base64url').toString('utf8'),
    )).toEqual({
      fileName: 'photo.png',
      fileSize: 5,
      mimeType: 'image/png',
      pageAddress: {
        sourceKey: 'main',
        relativePath: 'Notes/Host.md',
      },
      localDate: '2026-07-30',
    });
    expect(metadataHeader).not.toContain('/Users/');
  });

  it('rejects unsafe fields in an editor copy response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      result: {
        copied: true,
        targetAddress: {
          sourceKey: 'main',
          relativePath: 'Notes/assets/2026-07-30-photo.png',
        },
        bytesTransferred: 5,
        embed: true,
        originalName: 'photo.png',
        absolutePath: '/Users/example/private/photo.png',
      },
    }, 201));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    await expect(client.copyForEditor({
      sourceAddress: {
        sourceKey: 'research',
        relativePath: 'Media/photo.png',
      },
      pageAddress: {
        sourceKey: 'main',
        relativePath: 'Notes/Host.md',
      },
      kind: 'attachment',
      localDate: '2026-07-30',
    })).rejects.toMatchObject({
      code: 'knowledge_operation_precondition_failed',
    });
  });

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

  it('plans, commits, reads, and cancels operations through the public Renderer seam', async () => {
    const operationId = '8de89f1b-c8ee-42ba-9c13-795eafd712df';
    const requestHash = 'a'.repeat(64);
    const from = { sourceKey: 'main', relativePath: 'notes/old.md' };
    const to = { sourceKey: 'main', relativePath: 'notes/new.md' };
    const projections = { session: 'applied', event: 'applied', index: 'applied' };
    const result = {
      schemaVersion: 1,
      operationId,
      requestHash,
      kind: 'rename',
      state: 'FINALIZED',
      completedAt: '2026-07-28T00:00:03.000Z',
      items: [{
        from,
        to,
        state: 'applied',
        checkpointId: 'checkpoint-1',
      }],
      summary: {
        succeeded: 1,
        failed: 0,
        rolledBack: 0,
        recoveryRequired: 0,
      },
      projections,
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        plan: {
          schemaVersion: 1,
          operationId,
          requestHash,
          kind: 'rename',
          createdAt: '2026-07-28T00:00:00.000Z',
          expiresAt: '2026-07-28T00:15:00.000Z',
          checkpointRequired: true,
          items: [{ from, to, expectedVersion: { etag: 'v1' } }],
          preview: { resourceChanges: 1, linkWrites: 0 },
        },
      }, 201))
      .mockResolvedValueOnce(jsonResponse({ result }))
      .mockResolvedValueOnce(jsonResponse({
        operation: {
          schemaVersion: 1,
          operationId,
          requestHash,
          kind: 'rename',
          state: 'PREPARED',
          createdAt: '2026-07-28T00:00:00.000Z',
          expiresAt: '2026-07-28T00:15:00.000Z',
          items: [{
            itemId: 'item-1',
            from,
            to,
            expectedVersion: { etag: 'v1' },
            state: 'prepared',
            checkpointId: 'checkpoint-1',
            steps: [{
              stepId: 'checkpoint',
              kind: 'checkpoint',
              state: 'applied',
              intentAt: '2026-07-28T00:00:01.000Z',
              outcomeAt: '2026-07-28T00:00:02.000Z',
            }],
          }],
          projections: { session: 'pending', event: 'pending', index: 'pending' },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        result: {
          ...result,
          state: 'ROLLED_BACK',
          items: [{
            from,
            to,
            state: 'rolled-back',
            errorCode: 'knowledge_operation_precondition_failed',
            rollbackStatus: 'not-required',
          }],
          summary: {
            succeeded: 0,
            failed: 1,
            rolledBack: 1,
            recoveryRequired: 0,
          },
          projections: { session: 'pending', event: 'pending', index: 'pending' },
        },
      }));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    await expect(client.operations.plan({
      kind: 'rename',
      from,
      to,
      expectedVersion: { etag: 'v1' },
    })).resolves.toMatchObject({ operationId, requestHash });
    await expect(client.operations.commit(operationId, requestHash))
      .resolves.toMatchObject({
        operationId,
        state: 'FINALIZED',
        summary: { succeeded: 1 },
      });
    await expect(client.operations.get(operationId)).resolves.toEqual({
      schemaVersion: 1,
      operationId,
      requestHash,
      kind: 'rename',
      state: 'PREPARED',
      createdAt: '2026-07-28T00:00:00.000Z',
      expiresAt: '2026-07-28T00:15:00.000Z',
      items: [{
        from,
        to,
        state: 'prepared',
        checkpointId: 'checkpoint-1',
      }],
      projections: { session: 'pending', event: 'pending', index: 'pending' },
    });
    await expect(client.operations.cancel(operationId))
      .resolves.toMatchObject({ state: 'ROLLED_BACK' });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      '/api/knowledge-workspace/operations/plan',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          kind: 'rename',
          from,
          to,
          expectedVersion: { etag: 'v1' },
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      `/api/knowledge-workspace/operations/${operationId}/commit`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ requestHash }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      `/api/knowledge-workspace/operations/${operationId}`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      `/api/knowledge-workspace/operations/${operationId}/cancel`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uses the shared plan/commit protocol for delete and restore and parses cleanup plans', async () => {
    const deleteId = '10000000-0000-4000-8000-000000000001';
    const restoreId = '10000000-0000-4000-8000-000000000002';
    const cleanupId = '10000000-0000-4000-8000-000000000003';
    const entryId = '10000000-0000-4000-8000-000000000004';
    const requestHash = 'b'.repeat(64);
    const originalAddress = { sourceKey: 'main', relativePath: 'notes/page.md' };
    const trashAddress = {
      sourceKey: 'main',
      relativePath: `.trash/${deleteId}/payload/000001-page.md`,
    };
    const timestamps = {
      createdAt: '2026-08-07T00:00:00.000Z',
      expiresAt: '2026-08-07T00:15:00.000Z',
    };
    const planItem = {
      entryId,
      originalAddress,
      trashAddress,
      resourceKind: 'file',
      expectedVersion: { etag: 'v1' },
    };
    const projections = { session: 'applied', event: 'applied', index: 'applied' };
    const summary = {
      succeeded: 1,
      failed: 0,
      rolledBack: 0,
      recoveryRequired: 0,
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        plan: {
          schemaVersion: 1,
          operationId: deleteId,
          requestHash,
          kind: 'delete',
          sourceKey: 'main',
          batchId: deleteId,
          ...timestamps,
          items: [planItem],
        },
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        result: {
          schemaVersion: 1,
          operationId: deleteId,
          requestHash,
          kind: 'delete',
          sourceKey: 'main',
          batchId: deleteId,
          state: 'FINALIZED',
          completedAt: '2026-08-07T00:00:01.000Z',
          items: [{ ...planItem, expectedVersion: undefined, state: 'applied' }],
          summary,
          projections,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        plan: {
          schemaVersion: 1,
          operationId: restoreId,
          requestHash,
          kind: 'restore',
          sourceKey: 'main',
          batchId: deleteId,
          ...timestamps,
          items: [{ ...planItem, targetAddress: originalAddress }],
        },
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        result: {
          schemaVersion: 1,
          operationId: restoreId,
          requestHash,
          kind: 'restore',
          sourceKey: 'main',
          batchId: deleteId,
          state: 'FINALIZED',
          completedAt: '2026-08-07T00:00:02.000Z',
          items: [{
            entryId,
            originalAddress,
            trashAddress,
            targetAddress: originalAddress,
            resourceKind: 'file',
            state: 'applied',
          }],
          summary,
          projections,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        plan: {
          schemaVersion: 1,
          operationId: cleanupId,
          requestHash,
          kind: 'cleanup',
          sourceKey: 'main',
          batchId: deleteId,
          ...timestamps,
          items: [planItem],
        },
      }, 201));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    await expect(client.trashResources([originalAddress])).resolves.toEqual({
      batchId: deleteId,
      sourceKey: 'main',
      items: [{ entryId, originalAddress, ok: true }],
    });
    await expect(client.restoreTrash('main', deleteId, [entryId])).resolves.toEqual([
      { entryId, ok: true, restoredAddress: originalAddress },
    ]);
    await expect(client.planTrashCleanup(trashAddress)).resolves.toMatchObject({
      operationId: cleanupId,
      kind: 'cleanup',
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      '/api/knowledge-workspace/operations/plan',
      expect.objectContaining({
        body: JSON.stringify({ kind: 'delete', addresses: [originalAddress] }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      '/api/knowledge-workspace/trash/restore/plan',
      expect.objectContaining({
        body: JSON.stringify({ sourceKey: 'main', batchId: deleteId, entryIds: [entryId] }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      5,
      '/api/knowledge-workspace/trash/cleanup/plan',
      expect.objectContaining({ body: JSON.stringify({ address: trashAddress }) }),
    );
  });

  it('creates one cleanup plan before requesting a system-trash native grant', async () => {
    const operationId = '20000000-0000-4000-8000-000000000001';
    const batchId = '20000000-0000-4000-8000-000000000002';
    const entryId = '20000000-0000-4000-8000-000000000003';
    const address = {
      sourceKey: 'main',
      relativePath: `.trash/${batchId}/payload/000001-page.md`,
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        plan: {
          schemaVersion: 1,
          operationId,
          requestHash: 'c'.repeat(64),
          kind: 'cleanup',
          sourceKey: 'main',
          batchId,
          createdAt: '2026-08-07T00:00:00.000Z',
          expiresAt: '2026-08-07T00:15:00.000Z',
          items: [{
            entryId,
            originalAddress: { sourceKey: 'main', relativePath: 'page.md' },
            trashAddress: address,
            resourceKind: 'file',
            expectedVersion: { etag: 'trash-v1' },
          }],
        },
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        grant: {
          grantId: 'grant-system-trash',
          expiresAt: Date.now() + 60_000,
        },
      }, 201));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    await expect(client.createNativeGrant('systemTrash', address)).resolves.toMatchObject({
      grantId: 'grant-system-trash',
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      '/api/knowledge-workspace/trash/cleanup/plan',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ address }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      '/api/knowledge-workspace/native/grants',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          action: 'systemTrash',
          address,
          operationId,
        }),
      }),
    );
  });

  it('rejects operation responses carrying native authority fields instead of projecting them into UI state', async () => {
    const client = createKnowledgeWorkspaceClient({
      fetchImpl: vi.fn(async () => jsonResponse({
        plan: {
          schemaVersion: 1,
          operationId: '8de89f1b-c8ee-42ba-9c13-795eafd712df',
          requestHash: 'a'.repeat(64),
          kind: 'rename',
          createdAt: '2026-07-28T00:00:00.000Z',
          expiresAt: '2026-07-28T00:15:00.000Z',
          checkpointRequired: true,
          rootIdentity: '/Users/alice/Secret',
          items: [{
            from: { sourceKey: 'main', relativePath: 'old.md' },
            to: { sourceKey: 'main', relativePath: 'new.md' },
            expectedVersion: { etag: 'v1' },
          }],
          preview: { resourceChanges: 1, linkWrites: 0 },
        },
      })),
    });

    const error = await client.operations.plan({
      kind: 'rename',
      from: { sourceKey: 'main', relativePath: 'old.md' },
      to: { sourceKey: 'main', relativePath: 'new.md' },
      expectedVersion: { etag: 'v1' },
    }).catch((caught) => caught);

    expect(error).toMatchObject({
      code: 'knowledge_operation_precondition_failed',
      details: { field: 'plan' },
    });
    expect(String(error)).not.toContain('/Users/alice/Secret');
  });

  it('propagates caller cancellation while planning an operation', async () => {
    const controller = new AbortController();
    const reason = new DOMException('cancelled', 'AbortError');
    const client = createKnowledgeWorkspaceClient({
      fetchImpl: vi.fn(async (_path: string, options?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(options.signal?.reason),
            { once: true },
          );
        })),
    });
    const pending = client.operations.plan({
      kind: 'rename',
      from: { sourceKey: 'main', relativePath: 'old.md' },
      to: { sourceKey: 'main', relativePath: 'new.md' },
      expectedVersion: { etag: 'v1' },
    }, { signal: controller.signal });

    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
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

  it('uses a null expected version for conflict-safe new Page creation', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      resourceKey: 'mount:docs:Recovered.md',
      resource: { kind: 'mount', mountId: 'docs', path: 'Recovered.md' },
      changeType: 'created',
      version: { mtimeMs: 13, size: 4, etag: 'created' },
    }));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    await expect(client.resources.writeExpectedVersion(
      { sourceKey: 'main', relativePath: 'Recovered.md' },
      '# A',
      null,
    )).resolves.toMatchObject({
      ok: true,
      changeType: 'created',
    });
    expect(fetchImpl).toHaveBeenCalledWith('/api/resource-io/write-expected-version', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: { sourceKey: 'main', relativePath: 'Recovered.md' },
        content: '# A',
        encoding: 'utf-8',
        expectedVersion: null,
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

  it('uses the super-search endpoint and validates grouped source-relative DTOs', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      result: {
        query: 'alpha',
        scope: null,
        groups: [{
          state: 'ready',
          sourceKey: 'main',
          displayName: 'Main',
          generationId: 'generation-1',
          nextCursor: null,
          items: [{
            address: {
              sourceKey: 'main',
              relativePath: 'Notes/Alpha.md',
            },
            title: 'Alpha',
            kind: 'page',
            score: 120,
            snippets: [{ field: 'body', text: 'alpha body' }],
          }],
        }],
      },
    }));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    await expect(client.searchKnowledge({
      query: 'alpha',
    })).resolves.toEqual({
      query: 'alpha',
      scope: null,
      groups: [{
        state: 'ready',
        sourceKey: 'main',
        displayName: 'Main',
        generationId: 'generation-1',
        nextCursor: null,
        items: [{
          address: {
            sourceKey: 'main',
            relativePath: 'Notes/Alpha.md',
          },
          title: 'Alpha',
          kind: 'page',
          score: 120,
          snippets: [{ field: 'body', text: 'alpha body' }],
        }],
      }],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/knowledge-workspace/search',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ query: 'alpha' }),
      }),
    );
  });

  it('rejects cross-source or oversized search DTOs before exposing them', async () => {
    const client = createKnowledgeWorkspaceClient({
      fetchImpl: vi.fn(async () => jsonResponse({
        result: {
          query: 'alpha',
          scope: null,
          groups: [{
            state: 'ready',
            sourceKey: 'main',
            displayName: 'Main',
            generationId: 'generation-1',
            nextCursor: null,
            items: [{
              address: {
                sourceKey: 'research',
                relativePath: 'Secret.md',
              },
              title: 'Secret',
              kind: 'page',
              score: 1,
              snippets: [{ field: 'body', text: 'x'.repeat(241) }],
            }],
          }],
        },
      })),
    });
    await expect(client.searchKnowledge({ query: 'alpha' })).rejects
      .toMatchObject({
        code: 'knowledge_operation_precondition_failed',
        details: { field: 'search.address' },
      });
  });

  it('queries saved backlinks and validates the source-relative response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      result: {
        kind: 'backlinks',
        sourceKey: 'main',
        generationId: 'generation-2',
        items: [{
          sourceAddress: {
            sourceKey: 'main',
            relativePath: 'Notes/Referrer.md',
          },
          ordinal: 0,
          linkKind: 'wikilink',
          fragment: 'Section',
          fromOffset: 10,
          toOffset: 31,
        }],
        hasMore: false,
      },
    }));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    await expect(client.querySavedBacklinks({
      address: {
        sourceKey: 'main',
        relativePath: 'Notes/Target.md',
      },
      generationId: 'generation-2',
      limit: 50,
    })).resolves.toEqual({
      kind: 'backlinks',
      sourceKey: 'main',
      generationId: 'generation-2',
      items: [{
        sourceAddress: {
          sourceKey: 'main',
          relativePath: 'Notes/Referrer.md',
        },
        ordinal: 0,
        linkKind: 'wikilink',
        fragment: 'Section',
        fromOffset: 10,
        toOffset: 31,
      }],
      hasMore: false,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/knowledge-workspace/query',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          kind: 'backlinks',
          address: {
            sourceKey: 'main',
            relativePath: 'Notes/Target.md',
          },
          generationId: 'generation-2',
          limit: 50,
        }),
      }),
    );
  });

  it('rejects cross-source and unknown backlink fields before exposing them', async () => {
    const client = createKnowledgeWorkspaceClient({
      fetchImpl: vi.fn(async () => jsonResponse({
        result: {
          kind: 'backlinks',
          sourceKey: 'main',
          generationId: 'generation-2',
          items: [{
            sourceAddress: {
              sourceKey: 'research',
              relativePath: 'Notes/Referrer.md',
            },
            ordinal: 0,
            linkKind: 'wikilink',
            fragment: null,
            fromOffset: 10,
            toOffset: 20,
            absolutePath: '/private/referrer.md',
          }],
          hasMore: false,
        },
      })),
    });

    await expect(client.querySavedBacklinks({
      address: {
        sourceKey: 'main',
        relativePath: 'Notes/Target.md',
      },
    })).rejects.toMatchObject({
      code: 'knowledge_operation_precondition_failed',
      details: { field: 'query.items.0' },
    });
  });
});
