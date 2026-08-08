import { describe, expect, it } from 'vitest';
import { parseKnowledgeTrashManifest } from '../lib/knowledge-workspace/knowledge-trash-manifest.ts';
import { createKnowledgeTrashFixture } from './helpers/knowledge-trash-fixture.ts';

const address = (relativePath: string) => ({ sourceKey: 'main', relativePath });

describe('KnowledgeTrashService delete', () => {
  it('normalizes a one-source selection and atomically moves top-level resources into a manifest batch', async () => {
    const { service, nodes } = createKnowledgeTrashFixture({
      folder: { directory: true },
      'folder/child.md': { content: 'child' },
      'note.md': { content: 'note' },
    });
    const result = await service.trash([address('folder'), address('folder/child.md'), address('note.md')]);
    expect(result.items).toHaveLength(2);
    expect(result.items.every(item => item.ok)).toBe(true);
    expect(nodes.has('folder')).toBe(false);
    expect(nodes.has('note.md')).toBe(false);
    const manifestPath = `.trash/${result.batchId}/manifest.json`;
    const manifest = parseKnowledgeTrashManifest(nodes.get(manifestPath)!.content.toString('utf8'));
    expect(manifest.entries.map(entry => [entry.originalAddress.relativePath, entry.state])).toEqual([
      ['folder', 'trashed'],
      ['note.md', 'trashed'],
    ]);
    expect([...nodes.keys()].some(path => path.endsWith('/payload/000001-folder/child.md'))).toBe(true);
  });

  it('fails closed when .trash is replaced by a file and rejects cross-source or reserved selections', async () => {
    const { service, nodes } = createKnowledgeTrashFixture({ '.trash': { content: 'hostile' }, 'note.md': { content: 'note' } });
    await expect(service.trash([address('note.md')])).rejects.toMatchObject({ code: 'knowledge_resource_out_of_scope' });
    expect(nodes.has('note.md')).toBe(true);
    await expect(service.trash([address('.trash/secret')])).rejects.toMatchObject({ code: 'knowledge_operation_precondition_failed' });
    await expect(service.trash([address('note.md'), { sourceKey: 'other', relativePath: 'x.md' }])).rejects.toMatchObject({ code: 'knowledge_operation_precondition_failed' });
  });
});
