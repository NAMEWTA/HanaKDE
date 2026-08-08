import { describe, expect, it, vi } from 'vitest';
import { KnowledgeCreateService } from '../core/knowledge-workspace/knowledge-create-service.ts';

function fixture() {
  const existing = new Set<string>();
  const resolveAddress = vi.fn(async (address) => ({
    kind: 'mount' as const,
    mountId: 'main',
    path: address.relativePath,
  }));
  const stat = vi.fn(async (ref) => ({
    exists: existing.has(ref.path),
    isDirectory: false,
    resourceKey: ref.path,
    resource: ref,
  }));
  const writeExpectedVersion = vi.fn(async (ref) => {
    if (existing.has(ref.path)) return { ok: false as const, conflict: true as const, resourceKey: ref.path, resource: ref };
    existing.add(ref.path);
    return { changeType: 'created' as const, resourceKey: ref.path, resource: ref };
  });
  const mkdir = vi.fn(async (ref) => {
    if (existing.has(ref.path)) throw Object.assign(new Error('exists'), { code: 'target_already_exists' });
    existing.add(ref.path);
    return { changeType: 'created' as const, resourceKey: ref.path, resource: ref };
  });
  const service = new KnowledgeCreateService({
    sourceRegistry: {
      get: () => ({
        sourceKey: 'main', displayName: 'Main', role: 'main' as const,
        availability: 'available' as const,
        capabilities: ['stat', 'write', 'mkdir'] as const,
      }),
      revalidate: vi.fn(async () => {}),
      resolveAddress,
    },
    resourceIO: { stat, writeExpectedVersion, mkdir },
  });
  return { service, existing, writeExpectedVersion, mkdir };
}

describe('KnowledgeCreateService', () => {
  it('creates a Page with one md suffix and never overwrites an existing target', async () => {
    const { service, existing } = fixture();
    await expect(service.create({
      kind: 'page', sourceKey: 'main', directoryPath: 'notes', name: 'Daily',
    })).resolves.toMatchObject({ address: { sourceKey: 'main', relativePath: 'notes/Daily.md' } });
    expect(existing.has('notes/Daily.md')).toBe(true);
    await expect(service.create({
      kind: 'page', sourceKey: 'main', directoryPath: 'notes', name: 'Daily.md',
    })).rejects.toMatchObject({ code: 'knowledge_resource_conflict' });
  });

  it('creates a folder atomically and rejects invalid, reserved and escaping names before IO', async () => {
    const { service, mkdir, writeExpectedVersion } = fixture();
    await expect(service.create({
      kind: 'folder', sourceKey: 'main', directoryPath: '', name: 'Projects',
    })).resolves.toMatchObject({ address: { relativePath: 'Projects' } });
    for (const name of ['', '.', '..', '.trash', 'a/b', 'a\\b', 'bad\0name']) {
      await expect(service.create({ kind: 'folder', sourceKey: 'main', directoryPath: '', name }))
        .rejects.toMatchObject({ code: 'knowledge_operation_precondition_failed' });
    }
    expect(mkdir).toHaveBeenCalledTimes(1);
    expect(writeExpectedVersion).not.toHaveBeenCalled();
  });

  it('honors cancellation and source capability failures without a partial resource', async () => {
    const { service, mkdir } = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(service.create({
      kind: 'folder', sourceKey: 'main', directoryPath: '', name: 'Cancelled',
    }, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(mkdir).not.toHaveBeenCalled();
  });
});
