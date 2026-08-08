import { describe, expect, it, vi } from 'vitest';
import { KnowledgeCopyService } from '../core/knowledge-workspace/knowledge-copy-service.ts';

const address = (sourceKey: string, relativePath: string) => ({ sourceKey, relativePath });

function fixture() {
  const existing = new Map<string, { directory: boolean; bytes: string }>([
    ['main:a.md', { directory: false, bytes: 'alpha' }],
    ['main:folder', { directory: true, bytes: 'tree' }],
    ['archive:a.md', { directory: false, bytes: 'existing' }],
  ]);
  const ref = (sourceKey: string, path: string) => ({ kind: 'mount' as const, mountId: sourceKey, path });
  const key = (resource: { mountId: string; path: string }) => `${resource.mountId}:${resource.path}`;
  const transfer = vi.fn(async ({ source, targetDirectory, targetName }) => {
    const sourceEntry = existing.get(key(source))!;
    const target = ref(targetDirectory.mountId, [targetDirectory.path, targetName].filter(Boolean).join('/'));
    existing.set(key(target), { ...sourceEntry });
    return { target, version: 'v1', bytesTransferred: sourceEntry.bytes.length };
  });
  const move = vi.fn(async (from, to) => {
    const entry = existing.get(key(from))!;
    existing.delete(key(from));
    existing.set(key(to), entry);
    return { oldResourceKey: key(from), newResourceKey: key(to), oldResource: from, newResource: to };
  });
  const service = new KnowledgeCopyService({
    sourceRegistry: {
      get: sourceKey => ({
        sourceKey,
        displayName: sourceKey,
        role: sourceKey === 'main' ? 'main' : 'mounted',
        availability: 'available',
        capabilities: ['stat', 'read', 'transfer', 'move'],
      }),
      revalidate: vi.fn(async () => {}),
      rootRef: sourceKey => ref(sourceKey, ''),
      resolveAddress: async input => ref(input.sourceKey, input.relativePath),
    },
    resourceIO: {
      stat: vi.fn(async resource => ({
        exists: existing.has(key(resource)),
        isDirectory: existing.get(key(resource))?.directory ?? false,
        version: existing.has(key(resource))
          ? { etag: `${key(resource)}:${existing.get(key(resource))!.bytes}` }
          : undefined,
        resourceKey: key(resource),
        resource,
      })),
      mkdir: vi.fn(),
      transfer,
      move,
    },
    randomUUID: () => '00000000-0000-4000-8000-000000000052',
  });
  return { service, existing, transfer, move };
}

describe('KnowledgeCopyService internal clipboard paste', () => {
  it('rejects unexpected identity fields and malformed root targets before side effects', async () => {
    const { service, transfer, move } = fixture();
    await expect(service.planPasteResources({
      intent: 'copy',
      items: [address('main', 'a.md')],
      target: { sourceKey: 'archive', directoryPath: '' },
      principal: { userId: 'attacker' },
    } as never)).rejects.toMatchObject({ code: 'knowledge_operation_precondition_failed' });
    await expect(service.planPasteResources({
      intent: 'copy',
      items: [address('main', 'a.md')],
      target: { sourceKey: '../archive', directoryPath: '' },
    })).rejects.toMatchObject({ code: 'knowledge_operation_precondition_failed' });
    expect(transfer).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
  });

  it('copies across sources byte-for-byte and allocates deterministic suffixes', async () => {
    const { service, existing } = fixture();
    const result = await service.pasteResources({
      intent: 'copy',
      items: [address('main', 'a.md')],
      target: { sourceKey: 'archive', directoryPath: '' },
    });
    expect(result).toEqual([expect.objectContaining({
      ok: true,
      targetAddress: address('archive', 'a_2.md'),
      effect: 'copy',
    })]);
    expect(existing.get('archive:a_2.md')?.bytes).toBe('alpha');
    expect(existing.get('main:a.md')?.bytes).toBe('alpha');
  });

  it('moves cuts only within one source and rejects cross-source cut before side effects', async () => {
    const { service, move, transfer } = fixture();
    await expect(service.pasteResources({
      intent: 'cut',
      items: [address('main', 'a.md')],
      target: { sourceKey: 'archive', directoryPath: '' },
    })).rejects.toMatchObject({ code: 'knowledge_operation_precondition_failed' });
    expect(move).not.toHaveBeenCalled();
    expect(transfer).not.toHaveBeenCalled();

    await expect(service.pasteResources({
      intent: 'cut',
      items: [address('main', 'a.md')],
      target: { sourceKey: 'main', directoryPath: 'folder' },
    })).resolves.toEqual([expect.objectContaining({ ok: true, effect: 'move' })]);
    expect(move).toHaveBeenCalledOnce();
  });

  it('normalizes ancestor selections and returns resource-level partial results', async () => {
    const { service, transfer } = fixture();
    transfer.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission_denied' }));
    const result = await service.pasteResources({
      intent: 'copy',
      items: [address('main', 'folder'), address('main', 'folder/child.md'), address('main', 'a.md')],
      target: { sourceKey: 'archive', directoryPath: '' },
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ ok: false, sourceAddress: address('main', 'folder') });
    expect(result[1]).toMatchObject({ ok: true, sourceAddress: address('main', 'a.md') });
  });

  it('reserves deterministic keep-both targets for same-name items during side-effect-free planning', async () => {
    const { service, existing, transfer, move } = fixture();
    existing.set('main:one/a.md', { directory: false, bytes: 'one' });
    existing.set('main:two/a.md', { directory: false, bytes: 'two' });

    const plan = await service.planPasteResources({
      intent: 'copy',
      items: [address('main', 'one/a.md'), address('main', 'two/a.md')],
      target: { sourceKey: 'archive', directoryPath: '' },
    });

    expect(plan).toEqual([
      expect.objectContaining({
        ok: true,
        prepared: expect.objectContaining({ targetAddress: address('archive', 'a_2.md') }),
      }),
      expect.objectContaining({
        ok: true,
        prepared: expect.objectContaining({ targetAddress: address('archive', 'a_3.md') }),
      }),
    ]);
    expect(transfer).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
    expect(existing.has('archive:a_2.md')).toBe(false);
    expect(existing.has('archive:a_3.md')).toBe(false);
  });

  it('rejects a prepared paste when its source version or fixed target changes', async () => {
    const { service, existing, transfer } = fixture();
    const [planned] = await service.planPasteResources({
      intent: 'copy',
      items: [address('main', 'a.md')],
      target: { sourceKey: 'archive', directoryPath: 'folder' },
    });
    if (!planned.ok) throw new Error('paste planning unexpectedly failed');

    existing.set('main:a.md', { directory: false, bytes: 'changed' });
    await expect(service.pastePrepared(planned.prepared)).rejects.toMatchObject({
      code: 'knowledge_version_conflict',
    });
    expect(transfer).not.toHaveBeenCalled();

    existing.set('main:a.md', { directory: false, bytes: 'alpha' });
    existing.set('archive:folder/a.md', { directory: false, bytes: 'occupied' });
    await expect(service.pastePrepared(planned.prepared)).rejects.toMatchObject({
      code: 'knowledge_resource_conflict',
    });
    expect(transfer).not.toHaveBeenCalled();
  });
});
