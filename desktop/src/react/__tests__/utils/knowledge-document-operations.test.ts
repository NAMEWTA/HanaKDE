import { describe, expect, it, vi } from 'vitest';
import type {
  KnowledgeResourceAddress,
} from '../../../../../shared/knowledge-workspace-contract.ts';
import type {
  KnowledgeWorkspaceClient,
} from '../../services/knowledge-workspace-client';
import {
  createKnowledgeDocumentRegistry,
  knowledgeDocumentKey,
} from '../../stores/knowledge-document-registry';
import {
  createKnowledgeOrphanDocument,
} from '../../utils/knowledge-document-operations';
import {
  knowledgeBytesFromBase64,
} from '../../utils/knowledge-markdown-file';

const from: KnowledgeResourceAddress = {
  sourceKey: 'lost',
  relativePath: 'Notes/Original.md',
};

function orphanRegistry() {
  const registry = createKnowledgeDocumentRegistry({
    ownerId: 'owner',
    windowId: 'orphan-operation-test',
  });
  registry.getState().establishDocumentSession({
    address: from,
    buffer: '# original\n',
    diskVersion: { etag: 'old', size: 12 },
    format: {
      hadBom: true,
      lineEnding: 'crlf',
      mixedLineEndings: false,
    },
  });
  registry.getState().openDocumentView({
    viewId: 'view-a',
    address: from,
    groupId: 'group-a',
  });
  registry.getState().replaceDocumentBuffer(
    'view-a',
    '# original\nlocal\n',
  );
  registry.getState().markDocumentResourceUnavailable(
    from,
    'source-unavailable',
  );
  return registry;
}

describe('knowledge orphan document operations', () => {
  it('creates a new Page with LF and no BOM before rebinding the session', async () => {
    const registry = orphanRegistry();
    const to = {
      sourceKey: 'main',
      relativePath: 'Recovered.md',
    };
    const writeExpectedVersion = vi.fn(async (
      _address: KnowledgeResourceAddress,
      _content: string,
      _expectedVersion: unknown,
      _options?: unknown,
    ) => ({
      ok: true as const,
      version: { etag: 'created', size: 17 },
    }));
    const client = {
      resources: { writeExpectedVersion },
    } as unknown as KnowledgeWorkspaceClient;

    await expect(createKnowledgeOrphanDocument({
      registry,
      from,
      to,
      client,
    })).resolves.toMatchObject({ ok: true });

    const encoded = writeExpectedVersion.mock.calls[0]?.[1];
    const bytes = knowledgeBytesFromBase64(encoded);
    expect(bytes && new TextDecoder().decode(bytes)).toBe(
      '# original\nlocal\n',
    );
    expect(writeExpectedVersion).toHaveBeenCalledWith(
      to,
      expect.any(String),
      null,
      { encoding: 'base64', signal: undefined },
    );
    expect(registry.getState().sessions[knowledgeDocumentKey(to)])
      .toMatchObject({
        format: {
          hadBom: false,
          lineEnding: 'lf',
          mixedLineEndings: false,
        },
      });
  });

  it('reports an already-open target as a create conflict without writing', async () => {
    const registry = orphanRegistry();
    const to = {
      sourceKey: 'main',
      relativePath: 'Occupied.md',
    };
    registry.getState().establishDocumentSession({
      address: to,
      buffer: '# occupied\n',
      diskVersion: { etag: 'occupied', size: 11 },
    });
    const writeExpectedVersion = vi.fn();
    const client = {
      resources: { writeExpectedVersion },
    } as unknown as KnowledgeWorkspaceClient;

    await expect(createKnowledgeOrphanDocument({
      registry,
      from,
      to,
      client,
    })).resolves.toEqual({ ok: false, reason: 'conflict' });
    expect(writeExpectedVersion).not.toHaveBeenCalled();
  });
});
