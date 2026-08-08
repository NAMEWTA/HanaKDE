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

  it('re-reads and records a native failure when the manifest CAS races once', async () => {
    const fixture = createKnowledgeTrashFixture({ 'race.md': { content: 'race' } });
    const batch = await fixture.service.trash([{ sourceKey: 'main', relativePath: 'race.md' }]);
    const entry = (await fixture.service.list('main'))[0].entries[0];
    fixture.resourceIO.writeExpectedVersion.mockImplementationOnce(async (resource) => ({
      ok: false,
      conflict: true,
      resourceKey: resource.path,
      resource,
    }));

    await fixture.service.failSystemTrash(entry.trashAddress, 'knowledge_resource_unavailable');

    expect(fixture.resourceIO.writeExpectedVersion).toHaveBeenCalledTimes(4);
    expect(await fixture.service.list('main')).toEqual([
      expect.objectContaining({
        batchId: batch.batchId,
        entries: [expect.objectContaining({
          state: 'trashed',
          errorCode: 'knowledge_resource_unavailable',
        })],
      }),
    ]);
  });

  it('rejects a native failure completion when its receipt cannot be re-read', async () => {
    const fixture = createKnowledgeTrashFixture({ 'unconfirmed.md': { content: 'unconfirmed' } });
    await fixture.service.trash([{ sourceKey: 'main', relativePath: 'unconfirmed.md' }]);
    const entry = (await fixture.service.list('main'))[0].entries[0];
    fixture.resourceIO.writeExpectedVersion.mockImplementation(async (resource) => ({
      changeType: 'modified' as const,
      resourceKey: resource.path,
      resource,
      version: { sequence: 999, size: 0 },
    }));

    await expect(fixture.service.failSystemTrash(entry.trashAddress, 'knowledge_resource_unavailable'))
      .rejects.toMatchObject({ code: 'knowledge_version_conflict' });
    const listed = await fixture.service.list('main');
    expect(listed[0].entries[0]).toMatchObject({ state: 'trashed' });
    expect(listed[0].entries[0]).not.toHaveProperty('errorCode');
  });
});
