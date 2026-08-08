import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DurableKnowledgeOperationJournal } from '../core/knowledge-workspace/durable-operation-journal.ts';
import { KnowledgeTrashOperationCoordinator } from '../core/knowledge-workspace/knowledge-trash-operation-coordinator.ts';
import type { KnowledgeTrashContext } from '../core/knowledge-workspace/knowledge-trash-service.ts';
import { createKnowledgeTrashFixture } from './helpers/knowledge-trash-fixture.ts';

const OWNER: KnowledgeTrashContext = {
  principal: {
    kind: 'api',
    principalId: 'owner-1',
    userId: 'user-1',
    studioId: 'studio-1',
    sessionId: 'window-1',
  },
  sessionId: 'window-1',
  requestId: 'request-1',
};

describe('KnowledgeTrashOperationCoordinator', () => {
  let tempRoot: string | null = null;
  let uuidCounter = 100;

  afterEach(() => {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  function home(): string {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hana-trash-coordinator-'));
    return path.join(tempRoot, 'hana');
  }

  function nextUuid(): string {
    uuidCounter += 1;
    return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, '0')}`;
  }

  it('keeps delete planning side-effect free and commits idempotently by request hash', async () => {
    const hanakoHome = home();
    const fixture = createKnowledgeTrashFixture({ 'note.md': { content: 'note' } });
    const coordinator = new KnowledgeTrashOperationCoordinator({
      hanakoHome,
      sourceRegistry: fixture.sourceRegistry,
      resourceIO: fixture.resourceIO,
      randomUUID: () => nextUuid(),
    });

    const plan = await coordinator.planTrash([
      { sourceKey: 'main', relativePath: 'note.md' },
    ], OWNER);

    expect(plan).toMatchObject({
      kind: 'delete',
      sourceKey: 'main',
      batchId: plan.operationId,
      items: [{ originalAddress: { sourceKey: 'main', relativePath: 'note.md' } }],
    });
    expect(fixture.nodes.has('note.md')).toBe(true);
    expect(fixture.nodes.has(plan.items[0].trashAddress.relativePath)).toBe(false);
    await expect(coordinator.get(plan.operationId, OWNER)).resolves.toMatchObject({
      state: 'PREPARED',
    });
    await expect(coordinator.commit(plan.operationId, {
      requestHash: '0'.repeat(64),
    }, OWNER)).rejects.toMatchObject({ code: 'operation_id_reused' });

    const [first, second] = await Promise.all([
      coordinator.commit(plan.operationId, {
        requestHash: plan.requestHash,
      }, OWNER),
      coordinator.commit(plan.operationId, {
        requestHash: plan.requestHash,
      }, OWNER),
    ]);

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      kind: 'delete',
      state: 'FINALIZED',
      summary: { succeeded: 1, failed: 0 },
    });
    expect(fixture.nodes.has('note.md')).toBe(false);
    expect(fixture.nodes.has(plan.items[0].trashAddress.relativePath)).toBe(true);
    expect(fixture.resourceIO.move).toHaveBeenCalledTimes(1);
    expect(new DurableKnowledgeOperationJournal({ hanakoHome })
      .readTrash(plan.operationId)?.items[0].steps).toEqual([
      expect.objectContaining({ kind: 'manifest-write', state: 'applied' }),
      expect.objectContaining({ kind: 'resource-move', state: 'applied' }),
    ]);
  });

  it('preserves an unexpired PREPARED plan across restart and permits cancellation only by its owner', async () => {
    const hanakoHome = home();
    const fixture = createKnowledgeTrashFixture({ 'note.md': { content: 'note' } });
    const first = new KnowledgeTrashOperationCoordinator({
      hanakoHome,
      sourceRegistry: fixture.sourceRegistry,
      resourceIO: fixture.resourceIO,
      randomUUID: () => nextUuid(),
    });
    const plan = await first.planTrash([
      { sourceKey: 'main', relativePath: 'note.md' },
    ], OWNER);
    const restarted = new KnowledgeTrashOperationCoordinator({
      hanakoHome,
      sourceRegistry: fixture.sourceRegistry,
      resourceIO: fixture.resourceIO,
      randomUUID: () => nextUuid(),
    });

    await expect(restarted.recover()).resolves.toMatchObject({
      scanned: 1,
      rolledBack: 0,
      recoveryRequired: 0,
    });
    await expect(restarted.get(plan.operationId, OWNER)).resolves.toMatchObject({
      state: 'PREPARED',
    });
    await expect(restarted.cancel(plan.operationId, {
      ...OWNER,
      sessionId: 'window-2',
      principal: { ...OWNER.principal!, sessionId: 'window-2' },
    })).rejects.toMatchObject({ code: 'knowledge_resource_out_of_scope' });
    await expect(restarted.cancel(plan.operationId, OWNER)).resolves.toMatchObject({
      state: 'ROLLED_BACK',
      summary: { succeeded: 0, rolledBack: 1 },
    });
    expect(fixture.nodes.has('note.md')).toBe(true);
    expect(fixture.nodes.has(plan.items[0].trashAddress.relativePath)).toBe(false);
  });

  it('freezes the actual restore suffix in the immutable journal request', async () => {
    const hanakoHome = home();
    const fixture = createKnowledgeTrashFixture({ 'note.md': { content: 'trashed' } });
    const deleted = await fixture.service.trash([
      { sourceKey: 'main', relativePath: 'note.md' },
    ]);
    await fixture.resourceIO.writeExpectedVersion(
      fixture.ref('note.md'),
      'replacement',
      null,
    );
    const coordinator = new KnowledgeTrashOperationCoordinator({
      hanakoHome,
      sourceRegistry: fixture.sourceRegistry,
      resourceIO: fixture.resourceIO,
      randomUUID: () => nextUuid(),
    });

    const results = await coordinator.restore('main', deleted.batchId, undefined, OWNER);

    expect(results).toEqual([expect.objectContaining({
      ok: true,
      restoredAddress: { sourceKey: 'main', relativePath: 'note_2.md' },
    })]);
    const record = new DurableKnowledgeOperationJournal({ hanakoHome })
      .listTrash()
      .find(candidate => candidate.kind === 'restore');
    expect(record?.request.items[0].targetAddress).toEqual({
      sourceKey: 'main',
      relativePath: 'note_2.md',
    });
    expect(record?.items[0].targetAddress).toEqual(record?.request.items[0].targetAddress);
    expect(fixture.nodes.get('note_2.md')?.content.toString('utf8')).toBe('trashed');
  });

  it('finalizes a delete after restart when the payload move beat the manifest outcome', async () => {
    const hanakoHome = home();
    const fixture = createKnowledgeTrashFixture({ 'note.md': { content: 'note' } });
    const crash = new Error('simulated process death after delete move');
    let manifestWrites = 0;
    const crashingResourceIO = {
      ...fixture.resourceIO,
      writeExpectedVersion: vi.fn(async (...args: Parameters<typeof fixture.resourceIO.writeExpectedVersion>) => {
        if (args[0].path.endsWith('/manifest.json') && ++manifestWrites >= 2) throw crash;
        return fixture.resourceIO.writeExpectedVersion(...args);
      }),
    };
    const first = new KnowledgeTrashOperationCoordinator({
      hanakoHome,
      sourceRegistry: fixture.sourceRegistry,
      resourceIO: crashingResourceIO,
      randomUUID: () => nextUuid(),
    });

    await expect(first.trash([
      { sourceKey: 'main', relativePath: 'note.md' },
    ], OWNER)).rejects.toBe(crash);

    const journal = new DurableKnowledgeOperationJournal({ hanakoHome });
    const pending = journal.listTrash().find(candidate => candidate.kind === 'delete');
    expect(pending?.state).toBe('COMMITTING');
    expect(fixture.nodes.has('note.md')).toBe(false);
    expect(fixture.nodes.has(pending!.items[0].trashAddress.relativePath)).toBe(true);

    const restarted = new KnowledgeTrashOperationCoordinator({
      hanakoHome,
      sourceRegistry: fixture.sourceRegistry,
      resourceIO: fixture.resourceIO,
      randomUUID: () => nextUuid(),
    });
    await expect(restarted.recover()).resolves.toMatchObject({ finalized: 1 });
    expect(journal.readTrash(pending!.operationId)).toMatchObject({
      state: 'FINALIZED',
      items: [{
        state: 'applied',
        steps: [
          expect.objectContaining({ kind: 'manifest-write', state: 'applied' }),
          expect.objectContaining({ kind: 'resource-move', state: 'applied' }),
        ],
      }],
    });
  });

  it('finalizes a restore after restart when the payload move beat the manifest outcome', async () => {
    const hanakoHome = home();
    const fixture = createKnowledgeTrashFixture({ 'note.md': { content: 'note' } });
    const deleted = await fixture.service.trash([
      { sourceKey: 'main', relativePath: 'note.md' },
    ]);
    const crash = new Error('simulated process death after restore move');
    let manifestWrites = 0;
    const crashingResourceIO = {
      ...fixture.resourceIO,
      writeExpectedVersion: vi.fn(async (...args: Parameters<typeof fixture.resourceIO.writeExpectedVersion>) => {
        if (args[0].path.endsWith('/manifest.json') && ++manifestWrites >= 2) throw crash;
        return fixture.resourceIO.writeExpectedVersion(...args);
      }),
    };
    const first = new KnowledgeTrashOperationCoordinator({
      hanakoHome,
      sourceRegistry: fixture.sourceRegistry,
      resourceIO: crashingResourceIO,
      randomUUID: () => nextUuid(),
    });

    await expect(first.restore('main', deleted.batchId, undefined, OWNER)).rejects.toBe(crash);
    expect(fixture.nodes.get('note.md')?.content.toString('utf8')).toBe('note');

    const journal = new DurableKnowledgeOperationJournal({ hanakoHome });
    const pending = journal.listTrash().find(candidate => candidate.kind === 'restore');
    const restarted = new KnowledgeTrashOperationCoordinator({
      hanakoHome,
      sourceRegistry: fixture.sourceRegistry,
      resourceIO: fixture.resourceIO,
      randomUUID: () => nextUuid(),
    });
    await expect(restarted.recover()).resolves.toMatchObject({ finalized: 1 });
    expect(journal.readTrash(pending!.operationId)).toMatchObject({
      state: 'FINALIZED',
      items: [{ state: 'applied' }],
    });
  });

  it('replays restored link rewrites after restart before finalizing the operation', async () => {
    const hanakoHome = home();
    const fixture = createKnowledgeTrashFixture({
      Docs: { directory: true },
      'Docs/a.md': { content: '[B](b.md)' },
      'Docs/b.md': { content: '# B' },
    });
    const deleted = await fixture.service.trash([
      { sourceKey: 'main', relativePath: 'Docs/a.md' },
      { sourceKey: 'main', relativePath: 'Docs/b.md' },
    ]);
    fixture.nodes.set('Docs/a.md', {
      directory: false,
      content: Buffer.from('occupied'),
      version: 501,
    });
    fixture.nodes.set('Docs/b.md', {
      directory: false,
      content: Buffer.from('occupied'),
      version: 502,
    });
    const crash = new Error('simulated process death during restored link rewrite');
    let rejectLinkRewrite = true;
    const crashingResourceIO = {
      ...fixture.resourceIO,
      writeExpectedVersion: vi.fn(async (...args: Parameters<typeof fixture.resourceIO.writeExpectedVersion>) => {
        if (rejectLinkRewrite && args[0].path === 'Docs/a_2.md') throw crash;
        return fixture.resourceIO.writeExpectedVersion(...args);
      }),
    };
    const first = new KnowledgeTrashOperationCoordinator({
      hanakoHome,
      sourceRegistry: fixture.sourceRegistry,
      resourceIO: crashingResourceIO,
      randomUUID: () => nextUuid(),
    });

    await expect(first.restore('main', deleted.batchId, undefined, OWNER)).rejects.toBe(crash);
    expect(fixture.nodes.get('Docs/a_2.md')?.content.toString('utf8')).toBe('[B](b.md)');
    expect(fixture.nodes.get('Docs/b_2.md')?.content.toString('utf8')).toBe('# B');

    const journal = new DurableKnowledgeOperationJournal({ hanakoHome });
    const pending = journal.listTrash().find(candidate => candidate.kind === 'restore');
    expect(pending).toMatchObject({
      state: 'COMMITTING',
      request: {
        items: [
          { targetAddress: { sourceKey: 'main', relativePath: 'Docs/a_2.md' } },
          { targetAddress: { sourceKey: 'main', relativePath: 'Docs/b_2.md' } },
        ],
      },
    });

    rejectLinkRewrite = false;
    const restarted = new KnowledgeTrashOperationCoordinator({
      hanakoHome,
      sourceRegistry: fixture.sourceRegistry,
      resourceIO: fixture.resourceIO,
      randomUUID: () => nextUuid(),
    });
    await expect(restarted.recover()).resolves.toMatchObject({ finalized: 1 });
    expect(fixture.nodes.get('Docs/a_2.md')?.content.toString('utf8')).toBe('[B](b_2.md)');
    expect(journal.readTrash(pending!.operationId)).toMatchObject({
      state: 'FINALIZED',
      items: [{ state: 'applied' }, { state: 'applied' }],
    });
  });

  it('gates the source when native dispatch removed payload without a terminal receipt', async () => {
    const hanakoHome = home();
    const fixture = createKnowledgeTrashFixture({ 'note.md': { content: 'note' } });
    const first = new KnowledgeTrashOperationCoordinator({
      hanakoHome,
      sourceRegistry: fixture.sourceRegistry,
      resourceIO: fixture.resourceIO,
      randomUUID: () => nextUuid(),
    });
    const deleted = await first.trash([
      { sourceKey: 'main', relativePath: 'note.md' },
    ], OWNER);
    const manifest = await fixture.service.readBatch('main', deleted.batchId);
    const trashAddress = manifest.entries[0].trashAddress;
    const cleanupId = await first.beginSystemTrash(trashAddress, OWNER);
    await first.markSystemTrashGrantIssued(cleanupId, OWNER);
    await first.markSystemTrashDispatched(cleanupId, OWNER);
    fixture.nodes.delete(trashAddress.relativePath);

    const restarted = new KnowledgeTrashOperationCoordinator({
      hanakoHome,
      sourceRegistry: fixture.sourceRegistry,
      resourceIO: fixture.resourceIO,
      randomUUID: () => nextUuid(),
    });
    await expect(restarted.recover()).resolves.toMatchObject({ recoveryRequired: 1 });
    expect(restarted.isSourceRecovering('main')).toBe(true);
    expect(new DurableKnowledgeOperationJournal({ hanakoHome }).readTrash(cleanupId))
      .toMatchObject({ state: 'RECOVERY_REQUIRED' });
  });

  it('uses a durable native success receipt to finish manifest CAS after restart', async () => {
    const hanakoHome = home();
    const fixture = createKnowledgeTrashFixture({ 'note.md': { content: 'note' } });
    let rejectManifestWrites = false;
    const crash = new Error('simulated process death before cleanup manifest CAS');
    const resourceIO = {
      ...fixture.resourceIO,
      writeExpectedVersion: vi.fn(async (...args: Parameters<typeof fixture.resourceIO.writeExpectedVersion>) => {
        if (rejectManifestWrites && args[0].path.endsWith('/manifest.json')) throw crash;
        return fixture.resourceIO.writeExpectedVersion(...args);
      }),
    };
    const first = new KnowledgeTrashOperationCoordinator({
      hanakoHome,
      sourceRegistry: fixture.sourceRegistry,
      resourceIO,
      randomUUID: () => nextUuid(),
    });
    const deleted = await first.trash([
      { sourceKey: 'main', relativePath: 'note.md' },
    ], OWNER);
    const manifest = await fixture.service.readBatch('main', deleted.batchId);
    const trashAddress = manifest.entries[0].trashAddress;
    const cleanupId = await first.beginSystemTrash(trashAddress, OWNER);
    await first.markSystemTrashGrantIssued(cleanupId, OWNER);
    await first.markSystemTrashDispatched(cleanupId, OWNER);
    fixture.nodes.delete(trashAddress.relativePath);
    rejectManifestWrites = true;

    await expect(first.completeSystemTrash(cleanupId, true, OWNER)).rejects.toBe(crash);
    rejectManifestWrites = false;

    const restarted = new KnowledgeTrashOperationCoordinator({
      hanakoHome,
      sourceRegistry: fixture.sourceRegistry,
      resourceIO: fixture.resourceIO,
      randomUUID: () => nextUuid(),
    });
    await expect(restarted.recover()).resolves.toMatchObject({ finalized: 1 });
    expect(new DurableKnowledgeOperationJournal({ hanakoHome }).readTrash(cleanupId))
      .toMatchObject({ state: 'FINALIZED', items: [{ state: 'applied' }] });
    expect((await fixture.service.readBatch('main', deleted.batchId)).entries[0].state)
      .toBe('cleaned');
  });

  it('retries manifest CAS without appending a second native outcome', async () => {
    const hanakoHome = home();
    const fixture = createKnowledgeTrashFixture({ 'note.md': { content: 'note' } });
    let failNextManifestWrite = false;
    const crash = new Error('simulated transient manifest write failure');
    const resourceIO = {
      ...fixture.resourceIO,
      writeExpectedVersion: vi.fn(async (...args: Parameters<typeof fixture.resourceIO.writeExpectedVersion>) => {
        if (failNextManifestWrite && args[0].path.endsWith('/manifest.json')) {
          failNextManifestWrite = false;
          throw crash;
        }
        return fixture.resourceIO.writeExpectedVersion(...args);
      }),
    };
    const coordinator = new KnowledgeTrashOperationCoordinator({
      hanakoHome,
      sourceRegistry: fixture.sourceRegistry,
      resourceIO,
      randomUUID: () => nextUuid(),
    });
    const deleted = await coordinator.trash([
      { sourceKey: 'main', relativePath: 'note.md' },
    ], OWNER);
    const entry = (await fixture.service.readBatch('main', deleted.batchId)).entries[0];
    const cleanupId = await coordinator.beginSystemTrash(entry.trashAddress, OWNER);
    await coordinator.markSystemTrashGrantIssued(cleanupId, OWNER);
    await coordinator.markSystemTrashDispatched(cleanupId, OWNER);
    fixture.nodes.delete(entry.trashAddress.relativePath);
    failNextManifestWrite = true;

    await expect(coordinator.completeSystemTrash(cleanupId, true, OWNER)).rejects.toBe(crash);
    await expect(coordinator.completeSystemTrash(cleanupId, true, OWNER)).resolves.toBeUndefined();

    const record = new DurableKnowledgeOperationJournal({ hanakoHome }).readTrash(cleanupId);
    expect(record).toMatchObject({ state: 'FINALIZED' });
    expect(record?.items[0].steps.filter(step => step.kind === 'system-trash'))
      .toHaveLength(1);
  });

  it('retains an old-root cleanup record without degrading the new main root', async () => {
    const hanakoHome = home();
    const fixture = createKnowledgeTrashFixture({ 'note.md': { content: 'note' } }, { rootId: 'old-root' });
    const first = new KnowledgeTrashOperationCoordinator({
      hanakoHome,
      sourceRegistry: fixture.sourceRegistry,
      resourceIO: fixture.resourceIO,
      randomUUID: () => nextUuid(),
    });
    const deleted = await first.trash([
      { sourceKey: 'main', relativePath: 'note.md' },
    ], OWNER);
    const entry = (await fixture.service.readBatch('main', deleted.batchId)).entries[0];
    const cleanupId = await first.beginSystemTrash(entry.trashAddress, OWNER);
    await first.markSystemTrashGrantIssued(cleanupId, OWNER);
    await first.markSystemTrashDispatched(cleanupId, OWNER);
    const newRootRegistry = {
      ...fixture.sourceRegistry,
      rootIdentity: () => ({
        providerId: 'local_fs',
        identityNamespace: 'local_fs',
        opaqueRootId: 'new-root',
        scopeToken: 'scope:new-root',
        caseMode: 'sensitive' as const,
      }),
    };

    const restarted = new KnowledgeTrashOperationCoordinator({
      hanakoHome,
      sourceRegistry: newRootRegistry,
      resourceIO: fixture.resourceIO,
      randomUUID: () => nextUuid(),
    });
    await expect(restarted.recover()).resolves.toMatchObject({ recoveryRequired: 1 });
    expect(restarted.isSourceRecovering('main')).toBe(false);
    expect(new DurableKnowledgeOperationJournal({ hanakoHome }).readTrash(cleanupId))
      .toMatchObject({ state: 'COMMITTING' });
  });
});
