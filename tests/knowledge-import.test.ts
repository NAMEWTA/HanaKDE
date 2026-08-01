import { describe, expect, it, vi } from 'vitest';
import { KnowledgeImportService } from '../core/knowledge-workspace/knowledge-import-service.ts';

function fixture() {
  const existing = new Set(['main:target/existing.txt']);
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
      stat: vi.fn(async resource => ({ exists: resource.kind === 'local-file' || existing.has(`main:${resource.path}`), isDirectory: false, resourceKey: resource.path, resource })),
      list: vi.fn(async resource => ({ resourceKey: resource.path, resource, items: [] })),
      transfer,
    },
    trashExisting,
    randomUUID: () => '00000000-0000-4000-8000-000000000051',
  });
  return { service, transfer, trashExisting };
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

  it('recursively merges directory conflicts and auto-suffixes file-directory type conflicts', async () => {
    const ref = (path: string) => ({ kind: 'mount' as const, mountId: 'main', path });
    const transferred: string[] = [];
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
          return { exists, isDirectory: directory, resourceKey: resource.path, resource };
        }),
        list: vi.fn(async resource => ({
          resourceKey: resource.path, resource,
          items: resource.kind === 'local-file' && resource.path === '/outside/Folder'
            ? [{ name: 'new.md', isDirectory: false, size: 3, mtimeMs: 1 }]
            : [],
        })),
        transfer: vi.fn(async ({ targetDirectory, targetName }) => {
          transferred.push(`${targetDirectory.path}/${targetName}`);
          return { target: ref(`${targetDirectory.path}/${targetName}`), version: 'v1', bytesTransferred: 3 };
        }),
      },
    });
    const merged = await service.import({
      items: [{ source: { kind: 'local-file', path: '/outside/Folder' }, originalName: 'Folder' }],
      target: { sourceKey: 'main', directoryPath: 'target' }, conflictPolicy: 'skip',
    });
    expect(merged).toEqual([expect.objectContaining({ ok: true, bytesTransferred: 3 })]);
    expect(transferred).toContain('target/Folder/new.md');

    const typeConflict = await service.import({
      items: [{ source: { kind: 'local-file', path: '/outside/Asset' }, originalName: 'Asset' }],
      target: { sourceKey: 'main', directoryPath: 'target' }, conflictPolicy: 'replace',
    });
    expect(typeConflict).toEqual([expect.objectContaining({ ok: true, targetAddress: { sourceKey: 'main', relativePath: 'target/Asset_2' } })]);
  });
});
