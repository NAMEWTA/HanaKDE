import { vi } from 'vitest';
import { KnowledgeTrashService } from '../../core/knowledge-workspace/knowledge-trash-service.ts';
import type { KnowledgeSourceDto } from '../../shared/knowledge-workspace-contract.ts';

type Node = { directory: boolean; content: Buffer; version: number };

export function createKnowledgeTrashFixture(initial: Record<string, { directory?: boolean; content?: string }> = {}) {
  const nodes = new Map<string, Node>();
  let sequence = 1;
  for (const [path, value] of Object.entries(initial)) {
    nodes.set(path, { directory: value.directory ?? false, content: Buffer.from(value.content ?? ''), version: sequence++ });
  }
  const ref = (path: string) => ({ kind: 'mount' as const, mountId: 'main', path });
  const stat = vi.fn(async (resource: ReturnType<typeof ref>) => {
    const node = nodes.get(resource.path);
    return {
      exists: Boolean(node),
      isDirectory: node?.directory ?? false,
      ...(node ? { version: { sequence: node.version, size: node.directory ? null : node.content.length } } : {}),
      resourceKey: resource.path,
      resource,
    };
  });
  const read = vi.fn(async (resource: ReturnType<typeof ref>) => {
    const node = nodes.get(resource.path);
    if (!node || node.directory) throw Object.assign(new Error('not found'), { code: 'resource_not_found' });
    return { resourceKey: resource.path, resource, content: Buffer.from(node.content), version: { sequence: node.version, size: node.content.length } };
  });
  const list = vi.fn(async (resource: ReturnType<typeof ref>) => {
    const node = nodes.get(resource.path);
    if (!node?.directory) throw Object.assign(new Error('not directory'), { code: 'resource_not_found' });
    const prefix = resource.path ? `${resource.path}/` : '';
    const immediate = new Map<string, Node>();
    for (const [path, child] of nodes) {
      if (!path.startsWith(prefix) || path === resource.path) continue;
      const rest = path.slice(prefix.length);
      if (!rest.includes('/')) immediate.set(rest, child);
    }
    return {
      resourceKey: resource.path,
      resource,
      items: [...immediate].map(([name, child]) => ({ name, isDirectory: child.directory, size: child.directory ? null : child.content.length, mtimeMs: child.version })),
    };
  });
  const mkdir = vi.fn(async (resource: ReturnType<typeof ref>) => {
    if (nodes.has(resource.path)) throw Object.assign(new Error('exists'), { code: 'target_already_exists' });
    const node = { directory: true, content: Buffer.alloc(0), version: sequence++ };
    nodes.set(resource.path, node);
    return { changeType: 'created' as const, resourceKey: resource.path, resource, version: { sequence: node.version } };
  });
  const move = vi.fn(async (from: ReturnType<typeof ref>, to: ReturnType<typeof ref>) => {
    const node = nodes.get(from.path);
    if (!node) throw Object.assign(new Error('not found'), { code: 'resource_not_found' });
    if (nodes.has(to.path)) throw Object.assign(new Error('exists'), { code: 'target_already_exists' });
    const descendants = [...nodes].filter(([path]) => path.startsWith(`${from.path}/`));
    nodes.delete(from.path);
    nodes.set(to.path, { ...node, version: sequence++ });
    for (const [path, child] of descendants) {
      nodes.delete(path);
      nodes.set(`${to.path}${path.slice(from.path.length)}`, { ...child, version: sequence++ });
    }
    return { oldResourceKey: from.path, newResourceKey: to.path, oldResource: from, newResource: to };
  });
  const writeExpectedVersion = vi.fn(async (resource: ReturnType<typeof ref>, content: string | Buffer, expected: { sequence?: number } | null) => {
    const current = nodes.get(resource.path);
    if ((expected === null && current) || (expected !== null && current?.version !== expected.sequence)) {
      return { ok: false as const, conflict: true as const, resourceKey: resource.path, resource };
    }
    const node = { directory: false, content: Buffer.from(content), version: sequence++ };
    nodes.set(resource.path, node);
    return { changeType: current ? 'modified' as const : 'created' as const, resourceKey: resource.path, resource, version: { sequence: node.version, size: node.content.length } };
  });
  let uuidCounter = 0;
  const randomUUID = () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`;
  const sourceRegistry = {
    get: (): KnowledgeSourceDto => ({ sourceKey: 'main', displayName: 'Main', role: 'main', availability: 'available', capabilities: ['stat', 'read', 'write', 'list', 'mkdir', 'move', 'trash'] }),
    revalidate: vi.fn(async () => {}),
    resolveAddress: vi.fn(async (address: { relativePath: string }) => ref(address.relativePath)),
  };
  const service = new KnowledgeTrashService({
    sourceRegistry,
    resourceIO: { stat, read, list, mkdir, move, writeExpectedVersion },
    randomUUID,
    now: () => new Date('2026-08-01T00:00:00.000Z'),
  });
  return { service, nodes, ref, sourceRegistry, resourceIO: { stat, read, list, mkdir, move, writeExpectedVersion } };
}
