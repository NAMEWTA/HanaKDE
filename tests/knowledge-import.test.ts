import { describe, expect, it, vi } from 'vitest';
import { KnowledgeImportService } from '../core/knowledge-workspace/knowledge-import-service.ts';

function fixture() {
  const existing = new Set(['main:target/existing.txt']);
  let reverseVersionKeyOrder = false;
  const ref = (path: string) => ({ kind: 'mount' as const, mountId: 'main', path });
  const transfer = vi.fn(async ({ targetDirectory, targetName }) => ({
    target: ref(`${targetDirectory.path}/${targetName}`), version: 'v1', bytesTransferred: 7,
  }));
  const trashExisting = vi.fn(async (address) => {
    const key = `main:${address.relativePath}`;
    existing.delete(key);
    return async () => { existing.add(key); };
  });
  const service = new KnowledgeImportService({
    sourceRegistry: {
      get: () => ({ sourceKey: 'main', displayName: 'Main', role: 'main', availability: 'available', capabilities: ['stat', 'write', 'transfer'] }),
      revalidate: vi.fn(async () => {}), rootRef: () => ref(''),
      resolveAddress: async address => ref(address.relativePath),
    },
      resourceIO: {
      stat: vi.fn(async resource => {
        const exists = resource.kind === 'local-file' || existing.has(`main:${resource.path}`);
        const version = reverseVersionKeyOrder
          ? { size: 7, sequence: 1 }
          : { sequence: 1, size: 7 };
        return { exists, isDirectory: false, ...(exists ? { version } : {}), resourceKey: resource.path, resource };
      }),
        transfer,
    },
    trashExisting,
    randomUUID: () => '00000000-0000-4000-8000-000000000051',
  });
  return {
    service,
    transfer,
    trashExisting,
    reverseVersionKeyOrder: () => { reverseVersionKeyOrder = true; },
  };
}

describe('KnowledgeImportService', () => {
  it('applies skip, keep-both and replace without exposing source paths in results', async () => {
    for (const [policy, expected] of [
      ['skip', null], ['keep-both', 'target/existing_2.txt'], ['replace', 'target/existing.txt'],
    ] as const) {
      const { service, trashExisting } = fixture();
      const [result] = await service.import({
        items: [{ source: { kind: 'local-file', path: '/private/existing.txt' }, originalName: 'existing.txt' }],
        target: { sourceKey: 'main', directoryPath: 'target' }, conflictPolicy: policy,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.targetAddress?.relativePath ?? null).toBe(expected);
        expect(JSON.stringify(result)).not.toContain('/private');
      }
      expect(trashExisting).toHaveBeenCalledTimes(policy === 'replace' ? 1 : 0);
    }
  });

  it('returns per-resource failures and aborts the batch without starting later entries', async () => {
    const { service, transfer } = fixture();
    transfer.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission_denied' }));
    const results = await service.import({
      items: [
        { source: { kind: 'local-file', path: '/private/a' }, originalName: 'a' },
        { source: { kind: 'local-file', path: '/private/b' }, originalName: 'b' },
      ],
      target: { sourceKey: 'main', directoryPath: 'target' }, conflictPolicy: 'keep-both',
    });
    expect(results).toEqual([
      expect.objectContaining({ ok: false, originalName: 'a' }),
      expect.objectContaining({ ok: true, originalName: 'b' }),
    ]);

    const controller = new AbortController();
    controller.abort();
    await expect(service.import({
      items: [{ source: { kind: 'local-file', path: '/private/c' }, originalName: 'c' }],
      target: { sourceKey: 'main', directoryPath: '' }, conflictPolicy: 'skip',
    }, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('accepts an unchanged source version when provider key order differs after planning', async () => {
    const { service, transfer, reverseVersionKeyOrder } = fixture();
    const prepared = await service.planItem(
      { source: { kind: 'local-file', path: '/private/new.txt' }, originalName: 'new.txt' },
      { sourceKey: 'main', directoryPath: 'target' },
      'keep-both',
    );
    reverseVersionKeyOrder();

    await expect(service.importPrepared(prepared)).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        targetAddress: { sourceKey: 'main', relativePath: 'target/new.txt' },
      }),
    );
    expect(transfer).toHaveBeenCalledTimes(1);
  });

  it('recursively merges directory conflicts and auto-suffixes file-directory type conflicts', async () => {
    const ref = (path: string) => ({ kind: 'mount' as const, mountId: 'main', path });
    const transfers: Array<Record<string, unknown>> = [];
    const service = new KnowledgeImportService({
      sourceRegistry: {
        get: () => ({ sourceKey: 'main', displayName: 'Main', role: 'main', availability: 'available', capabilities: ['stat', 'write', 'transfer'] }),
        revalidate: vi.fn(async () => {}), rootRef: () => ref(''),
        resolveAddress: async address => ref(address.relativePath),
      },
      resourceIO: {
        stat: vi.fn(async resource => {
          const sourcePath = resource.kind === 'local-file' ? resource.path : '';
          const directory = sourcePath === '/outside/Folder' || ['target/Folder', 'target/Asset'].includes(resource.path);
          const exists = resource.kind === 'local-file' || ['target/Folder', 'target/Asset'].includes(resource.path);
          return { exists, isDirectory: directory, ...(exists ? { version: { sequence: 1, size: directory ? null : 3 } } : {}), resourceKey: resource.path, resource };
        }),
        transfer: vi.fn(async (request) => {
          const { targetDirectory, targetName } = request;
          transfers.push(request);
          return { target: ref(`${targetDirectory.path}/${targetName}`), version: 'v1', bytesTransferred: 3 };
        }),
      },
    });
    const merged = await service.import({
      items: [{ source: { kind: 'local-file', path: '/outside/Folder' }, originalName: 'Folder' }],
      target: { sourceKey: 'main', directoryPath: 'target' }, conflictPolicy: 'skip',
    });
    expect(merged).toEqual([expect.objectContaining({ ok: true, bytesTransferred: 3 })]);
    expect(transfers[0]).toMatchObject({
      targetName: 'Folder',
      mergeExisting: 'skip',
      expectedTargetVersion: expect.any(String),
    });

    const typeConflict = await service.import({
      items: [{ source: { kind: 'local-file', path: '/outside/Asset' }, originalName: 'Asset' }],
      target: { sourceKey: 'main', directoryPath: 'target' }, conflictPolicy: 'replace',
    });
    expect(typeConflict).toEqual([expect.objectContaining({ ok: true, targetAddress: { sourceKey: 'main', relativePath: 'target/Asset_2' } })]);
  });
});
