import { describe, expect, it } from 'vitest';
import { createKnowledgeTrashFixture } from './helpers/knowledge-trash-fixture.ts';

describe('KnowledgeTrashService restore', () => {
  it('recreates parents and deterministically suffixes a whole conflicting directory', async () => {
    const fixture = createKnowledgeTrashFixture({
      Projects: { directory: true },
      'Projects/existing.md': { content: 'existing' },
      Archive: { directory: true },
      'Archive/Projects': { directory: true },
      'Archive/Projects/page.md': { content: 'restored' },
    });
    const batch = await fixture.service.trash([{ sourceKey: 'main', relativePath: 'Archive/Projects' }]);
    const result = await fixture.service.restore('main', batch.batchId);
    expect(result).toEqual([expect.objectContaining({ ok: true, restoredAddress: { sourceKey: 'main', relativePath: 'Archive/Projects' } })]);

    const second = await fixture.service.trash([{ sourceKey: 'main', relativePath: 'Projects' }]);
    fixture.nodes.set('Projects', { directory: true, content: Buffer.alloc(0), version: 999 });
    fixture.nodes.set('Projects/new.md', { directory: false, content: Buffer.from('new'), version: 1000 });
    await expect(fixture.service.restore('main', second.batchId)).resolves.toEqual([
      expect.objectContaining({ ok: true, restoredAddress: { sourceKey: 'main', relativePath: 'Projects_2' } }),
    ]);
    expect(fixture.nodes.has('Projects_2/existing.md')).toBe(true);
  });

  it('reports a parent blocked by a file without moving the trash payload', async () => {
    const fixture = createKnowledgeTrashFixture({ 'blocked/page.md': { content: 'page' }, blocked: { directory: true } });
    const batch = await fixture.service.trash([{ sourceKey: 'main', relativePath: 'blocked/page.md' }]);
    fixture.nodes.delete('blocked');
    fixture.nodes.set('blocked', { directory: false, content: Buffer.from('file'), version: 100 });
    await expect(fixture.service.restore('main', batch.batchId)).resolves.toEqual([
      expect.objectContaining({ ok: false, errorCode: 'knowledge_trash_parent_blocked' }),
    ]);
  });

  it('rewrites links only when both endpoints are restored from the same batch', async () => {
    const fixture = createKnowledgeTrashFixture({
      Docs: { directory: true },
      'Docs/a.md': { content: '[B](b.md)' },
      'Docs/b.md': { content: '# B' },
    });
    const batch = await fixture.service.trash([
      { sourceKey: 'main', relativePath: 'Docs/a.md' },
      { sourceKey: 'main', relativePath: 'Docs/b.md' },
    ]);
    fixture.nodes.set('Docs/a.md', { directory: false, content: Buffer.from('occupied'), version: 101 });
    fixture.nodes.set('Docs/b.md', { directory: false, content: Buffer.from('occupied'), version: 102 });
    await fixture.service.restore('main', batch.batchId);
    expect(fixture.nodes.get('Docs/a_2.md')?.content.toString('utf8')).toBe('[B](b_2.md)');

    const partial = createKnowledgeTrashFixture({ 'a.md': { content: '[B](b.md)' }, 'b.md': { content: '# B' } });
    const partialBatch = await partial.service.trash([
      { sourceKey: 'main', relativePath: 'a.md' },
      { sourceKey: 'main', relativePath: 'b.md' },
    ]);
    partial.nodes.set('a.md', { directory: false, content: Buffer.from('occupied'), version: 201 });
    await partial.service.restore('main', partialBatch.batchId, [partialBatch.items[0].entryId]);
    expect(partial.nodes.get('a_2.md')?.content.toString('utf8')).toBe('[B](b.md)');
  });
});
