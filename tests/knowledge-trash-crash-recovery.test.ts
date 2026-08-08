import { describe, expect, it } from 'vitest';
import { serializeKnowledgeTrashManifest } from '../lib/knowledge-workspace/knowledge-trash-manifest.ts';
import { createKnowledgeTrashFixture } from './helpers/knowledge-trash-fixture.ts';

describe('KnowledgeTrashService crash recovery', () => {
  it('converges a persisted pending intent from disk facts without exposing the payload', async () => {
    const batchId = '00000000-0000-4000-8000-000000000055';
    const entryId = '00000000-0000-4000-8000-000000000056';
    const trashPath = `.trash/${batchId}/payload/000001-note.md`;
    const manifestPath = `.trash/${batchId}/manifest.json`;
    const manifest = {
      schemaVersion: 1 as const,
      batchId,
      sourceKey: 'main',
      deletedAt: '2026-08-01T00:00:00.000Z',
      entries: [{
        entryId,
        originalAddress: { sourceKey: 'main', relativePath: 'note.md' },
        trashAddress: { sourceKey: 'main', relativePath: trashPath },
        kind: 'file' as const,
        deletedAt: '2026-08-01T00:00:00.000Z',
        state: 'pending' as const,
      }],
    };
    const { service } = createKnowledgeTrashFixture({
      '.trash': { directory: true },
      [`.trash/${batchId}`]: { directory: true },
      [`.trash/${batchId}/payload`]: { directory: true },
      [trashPath]: { content: 'note' },
      [manifestPath]: { content: serializeKnowledgeTrashManifest(manifest) },
    });
    await expect(service.recoverBatch('main', batchId)).resolves.toMatchObject({ entries: [{ state: 'trashed' }] });
    await expect(service.list('main')).resolves.toHaveLength(1);
  });
});
