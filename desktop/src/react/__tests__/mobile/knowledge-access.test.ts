import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createKnowledgeWorkspaceClient,
  KnowledgeWorkspaceClientError,
  knowledgeWorkspaceClient,
  type KnowledgeWorkspaceFetch,
} from '../../services/knowledge-workspace-client';
import { useStore } from '../../stores';
import {
  initializeMobileKnowledgeAccess,
  mobileKnowledgeWorkspaceClient,
} from '../../mobile/knowledge-access';

function response(
  body: unknown,
  status = 200,
): Awaited<ReturnType<KnowledgeWorkspaceFetch>> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('mobile knowledge access', () => {
  afterEach(() => {
    useStore.getState().openKnowledgeWorkspace('test-reset');
    vi.restoreAllMocks();
  });

  it('uses the unique Open knowledge client and hydrates only source-relative DTOs', async () => {
    useStore.setState({
      deskBasePath: '/desktop-only',
      deskExpandedPaths: ['legacy-tree'],
    });
    const deskBefore = {
      deskBasePath: useStore.getState().deskBasePath,
      deskExpandedPaths: useStore.getState().deskExpandedPaths,
    };
    const fetchImpl = vi.fn<KnowledgeWorkspaceFetch>(async () => response({
      sources: [
        {
          sourceKey: 'main',
          displayName: 'Main',
          role: 'main',
          capabilities: ['stat', 'read', 'list'],
          availability: 'available',
        },
        {
          sourceKey: 'research',
          displayName: 'Research',
          role: 'mounted',
          capabilities: ['stat', 'read', 'list'],
          availability: 'available',
        },
      ],
    }));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    expect(mobileKnowledgeWorkspaceClient).toBe(knowledgeWorkspaceClient);
    await initializeMobileKnowledgeAccess({
      workspaceKey: 'server_1:studio_1',
      client,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/knowledge-workspace/sources',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(useStore.getState()).toMatchObject({
      knowledgeWorkspaceKey: 'server_1:studio_1',
      knowledgeSourcesStatus: 'ready',
      knowledgeSources: [
        {
          sourceKey: 'main',
          displayName: 'Main',
          role: 'main',
          capabilities: ['stat', 'read', 'list'],
          availability: 'available',
        },
        {
          sourceKey: 'research',
          displayName: 'Research',
          role: 'mounted',
          capabilities: ['stat', 'read', 'list'],
          availability: 'available',
        },
      ],
      knowledgeExpandedPathsBySource: {},
      knowledgeOpenResourceKeys: [],
      knowledgeActiveResourceKey: null,
      ...deskBefore,
    });
    expect(JSON.stringify(useStore.getState().knowledgeSources))
      .not.toMatch(/filePath|resolvedPath|opaqueRootId|scopeToken|native/i);
  });

  it('rejects absolute and provider-native locators before a mobile request is sent', async () => {
    const fetchImpl = vi.fn<KnowledgeWorkspaceFetch>();
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    await expect(client.resources.stat({
      sourceKey: 'main',
      relativePath: '/private/server/note.md',
    })).rejects.toMatchObject({
      code: 'invalid_relative_path',
      httpStatus: 400,
      retryable: false,
    });
    await expect(client.resources.stat({
      sourceKey: 'main',
      relativePath: 'C:\\Users\\Owner\\note.md',
    })).rejects.toMatchObject({
      code: 'invalid_relative_path',
    });
    await expect(client.resources.stat({
      sourceKey: 'main',
      relativePath: 'note.md',
      filePath: '/private/server/note.md',
    } as never)).rejects.toMatchObject({
      code: 'forbidden_contract_field',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps identical relative paths source-scoped and transfers by address without native locators', async () => {
    const fetchImpl = vi.fn<KnowledgeWorkspaceFetch>(async (requestPath, options) => {
      const body = options?.body ? JSON.parse(String(options.body)) : {};
      if (requestPath === '/api/resource-io/read') {
        return response({
          content: body.address.sourceKey === 'main'
            ? '# Main\n\n[[main-link]]'
            : '# Research\n\n[[research-link]]',
          encoding: 'utf-8',
        });
      }
      if (requestPath === '/api/resource-io/transfer') {
        return response({
          ok: true,
          target: {
            sourceKey: body.targetDirectoryAddress.sourceKey,
            relativePath: `${body.targetDirectoryAddress.relativePath}/${body.targetName}`,
          },
          version: 'v1:27:1',
          bytesTransferred: 27,
        });
      }
      throw new Error(`unexpected path ${requestPath}`);
    });
    const client = createKnowledgeWorkspaceClient({ fetchImpl });
    const main = await client.resources.read({
      sourceKey: 'main',
      relativePath: 'same.md',
    });
    const research = await client.resources.read({
      sourceKey: 'research',
      relativePath: 'same.md',
    });

    expect(main.content).toBe('# Main\n\n[[main-link]]');
    expect(research.content).toBe('# Research\n\n[[research-link]]');
    await expect(client.resources.transfer(
      { sourceKey: 'research', relativePath: 'same.md' },
      { sourceKey: 'main', relativePath: 'copies' },
      'research-copy.md',
      { operationId: '123e4567-e89b-42d3-a456-426614174000' },
    )).resolves.toEqual({
      ok: true,
      target: { sourceKey: 'main', relativePath: 'copies/research-copy.md' },
      version: 'v1:27:1',
      bytesTransferred: 27,
    });
    const transferCall = fetchImpl.mock.calls.find(
      ([requestPath]) => requestPath === '/api/resource-io/transfer',
    );
    expect(transferCall?.[1]?.body).toBe(JSON.stringify({
      sourceAddress: { sourceKey: 'research', relativePath: 'same.md' },
      targetDirectoryAddress: { sourceKey: 'main', relativePath: 'copies' },
      targetName: 'research-copy.md',
      operationId: '123e4567-e89b-42d3-a456-426614174000',
    }));
    expect(String(transferCall?.[1]?.body))
      .not.toMatch(/mountId|filePath|resolvedPath|scopeToken|native/i);
  });

  it('preserves the shared conflict and stable error metadata for Mobile', async () => {
    const fetchImpl = vi.fn<KnowledgeWorkspaceFetch>()
      .mockResolvedValueOnce(response({
        ok: false,
        conflict: true,
        version: { mtimeMs: 10, size: 4 },
      }, 409))
      .mockResolvedValueOnce(response({
        code: 'knowledge_resource_out_of_scope',
        httpStatus: 403,
        retryable: false,
      }, 403));
    const client = createKnowledgeWorkspaceClient({ fetchImpl });

    await expect(client.resources.writeExpectedVersion(
      { sourceKey: 'main', relativePath: 'note.md' },
      'next',
      { mtimeMs: 1, size: 3 },
    )).resolves.toEqual({
      ok: false,
      conflict: true,
      version: { mtimeMs: 10, size: 4 },
    });
    await expect(client.resources.read({
      sourceKey: 'main',
      relativePath: 'note.md',
    })).rejects.toEqual(expect.objectContaining({
      name: 'KnowledgeWorkspaceClientError',
      code: 'knowledge_resource_out_of_scope',
      httpStatus: 403,
      retryable: false,
    }));
  });

  it('records stable availability failures and does not reinterpret cancellation', async () => {
    const unavailable = createKnowledgeWorkspaceClient({
      fetchImpl: vi.fn<KnowledgeWorkspaceFetch>(async () => {
        throw new Error('transport leaked path /private/server');
      }),
    });

    await expect(initializeMobileKnowledgeAccess({
      workspaceKey: 'server_1:studio_1',
      client: unavailable,
    })).rejects.toBeInstanceOf(KnowledgeWorkspaceClientError);
    expect(useStore.getState()).toMatchObject({
      knowledgeSourcesStatus: 'error',
      knowledgeSourcesErrorCode: 'knowledge_resource_unavailable',
    });

    const controller = new AbortController();
    const reason = new Error('mobile navigation cancelled');
    controller.abort(reason);
    const cancelled = createKnowledgeWorkspaceClient({
      fetchImpl: vi.fn<KnowledgeWorkspaceFetch>(async () => {
        throw reason;
      }),
    });

    await expect(initializeMobileKnowledgeAccess({
      workspaceKey: 'server_2:studio_1',
      client: cancelled,
      signal: controller.signal,
    })).rejects.toBe(reason);
    expect(useStore.getState()).toMatchObject({
      knowledgeWorkspaceKey: 'server_2:studio_1',
      knowledgeSourcesStatus: 'idle',
      knowledgeSourcesErrorCode: null,
    });
  });
});
