import { describe, expect, it, vi } from 'vitest';
import { KnowledgeRefactorService } from '../core/knowledge-workspace/knowledge-refactor-service.ts';

describe('KnowledgeRefactorService rollback and recovery boundary', () => {
  it('restores every already-written backlink when a later expected-version write fails', async () => {
    const files = new Map([
      ['a.md', { content: Buffer.from('[[Old.md]]'), version: 1 }],
      ['b.md', { content: Buffer.from('[old](Old.md)'), version: 1 }],
    ]);
    let forwardWrites = 0;
    const writeExpectedVersion = vi.fn(async (ref, content, expected) => {
      const file = files.get(ref.path)!;
      if (file.version !== expected.sequence) return { ok: false as const, conflict: true as const, resourceKey: ref.path, resource: ref };
      if (Buffer.from(content).toString('utf8').includes('New.md') && ++forwardWrites === 2) {
        return { ok: false as const, conflict: true as const, resourceKey: ref.path, resource: ref };
      }
      file.content = Buffer.from(content);
      file.version += 1;
      return { changeType: 'modified' as const, resourceKey: ref.path, resource: ref, version: { sequence: file.version, size: file.content.length } };
    });
    const service = new KnowledgeRefactorService({
      sourceRegistry: {
        revalidate: vi.fn(async () => {}),
        resolveAddress: async address => ({ kind: 'mount' as const, mountId: 'main', path: address.relativePath }),
      },
      resourceIO: {
        stat: vi.fn(async ref => ({ exists: true, isDirectory: false, version: { sequence: files.get(ref.path)!.version, size: files.get(ref.path)!.content.length }, resourceKey: ref.path, resource: ref })),
        read: vi.fn(async ref => ({ content: Buffer.from(files.get(ref.path)!.content), version: { sequence: files.get(ref.path)!.version, size: files.get(ref.path)!.content.length }, resourceKey: ref.path, resource: ref })),
        writeExpectedVersion,
      },
      findSavedBacklinks: async () => [
        { sourceKey: 'main', relativePath: 'a.md' },
        { sourceKey: 'main', relativePath: 'b.md' },
      ],
    });
    await expect(service.rewriteSavedLinks({
      operationId: '00000000-0000-4000-8000-000000000054',
      from: { sourceKey: 'main', relativePath: 'Old.md' },
      to: { sourceKey: 'main', relativePath: 'New.md' },
      context: {},
    })).rejects.toMatchObject({ code: 'knowledge_link_rewrite_failed' });
    expect(files.get('a.md')!.content.toString('utf8')).toBe('[[Old.md]]');
    expect(files.get('b.md')!.content.toString('utf8')).toBe('[old](Old.md)');
  });
});
