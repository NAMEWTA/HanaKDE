import { describe, expect, it, vi } from 'vitest';
import { createKnowledgeTrashFixture } from './helpers/knowledge-trash-fixture.ts';

describe('KnowledgeTrashService native cleanup', () => {
  it('retains payload and manifest when system trash fails, then records cleanup only after acceptance', async () => {
    const fixture = createKnowledgeTrashFixture({ 'old.md': { content: 'old' } });
    const batch = await fixture.service.trash([{ sourceKey: 'main', relativePath: 'old.md' }]);
    const payloadPath = [...fixture.nodes.keys()].find(path => path.includes('/payload/000001-old.md'))!;
    const rejected = vi.fn(async () => false);
    const failed = await fixture.service.cleanup({ sourceKey: 'main', batchId: batch.batchId, moveToSystemTrash: rejected });
    expect(failed).toEqual([expect.objectContaining({ ok: false, errorCode: 'knowledge_native_capability_unavailable' })]);
    expect(fixture.nodes.has(payloadPath)).toBe(true);
    await expect(fixture.service.list('main')).resolves.toEqual([
      expect.objectContaining({
        entries: [expect.objectContaining({
          state: 'trashed',
          errorCode: 'knowledge_native_capability_unavailable',
        })],
      }),
    ]);

    const accepted = vi.fn(async (address) => {
      fixture.nodes.delete(address.relativePath);
      return true;
    });
    await expect(fixture.service.cleanup({ sourceKey: 'main', batchId: batch.batchId, moveToSystemTrash: accepted }))
      .resolves.toEqual([expect.objectContaining({ ok: true })]);
    expect(fixture.nodes.has(payloadPath)).toBe(false);
    await expect(fixture.service.list('main')).resolves.toEqual([]);
  });

  it('records a failed Main completion without making the retained entry unrestorable', async () => {
    const fixture = createKnowledgeTrashFixture({ 'retry.md': { content: 'retry' } });
    const batch = await fixture.service.trash([{ sourceKey: 'main', relativePath: 'retry.md' }]);
    const listed = await fixture.service.list('main');
    const address = listed[0].entries[0].trashAddress;

    await fixture.service.failSystemTrash(address, 'knowledge_resource_unavailable');

    await expect(fixture.service.list('main')).resolves.toEqual([
      expect.objectContaining({
        entries: [expect.objectContaining({ state: 'trashed', errorCode: 'knowledge_resource_unavailable' })],
      }),
    ]);
    await expect(fixture.service.restore('main', batch.batchId)).resolves.toEqual([
      expect.objectContaining({ ok: true, restoredAddress: { sourceKey: 'main', relativePath: 'retry.md' } }),
    ]);
  });
});
