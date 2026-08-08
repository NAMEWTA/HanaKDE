import {
  parseKnowledgeResourceAddress,
  type KnowledgeResourceAddress,
} from './knowledge-workspace-contract.ts';

export const KNOWLEDGE_DRAG_MIME = 'application/x-openhanako-knowledge-resources+json';

export type KnowledgeInternalDragPayload = Readonly<{
  kind: 'knowledge-resources';
  sourceKey: string;
  addresses: readonly KnowledgeResourceAddress[];
}>;

export type KnowledgeExternalDragPayload = Readonly<{
  kind: 'external-files';
  nativeRequestId: string;
}>;

export type KnowledgeDragPayload = KnowledgeInternalDragPayload | KnowledgeExternalDragPayload;
export type KnowledgeDropEffect = 'move' | 'copy' | 'import' | 'none';

export function parseKnowledgeDragPayload(input: unknown): KnowledgeDragPayload | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (value.kind === 'external-files') {
    return Object.keys(value).every(key => ['kind', 'nativeRequestId'].includes(key))
      && typeof value.nativeRequestId === 'string'
      && /^[A-Za-z0-9_-]{16,128}$/u.test(value.nativeRequestId)
      ? Object.freeze({ kind: 'external-files', nativeRequestId: value.nativeRequestId })
      : null;
  }
  if (
    value.kind !== 'knowledge-resources'
    || typeof value.sourceKey !== 'string'
    || !Array.isArray(value.addresses)
    || value.addresses.length === 0
    || !Object.keys(value).every(key => ['kind', 'sourceKey', 'addresses'].includes(key))
  ) return null;
  const addresses: KnowledgeResourceAddress[] = [];
  for (const inputAddress of value.addresses) {
    const parsed = parseKnowledgeResourceAddress(inputAddress);
    if (parsed.ok === false || parsed.value.sourceKey !== value.sourceKey) return null;
    addresses.push(Object.freeze(parsed.value));
  }
  return Object.freeze({
    kind: 'knowledge-resources',
    sourceKey: value.sourceKey,
    addresses: Object.freeze(addresses),
  });
}

export function knowledgeDropEffect(
  payload: KnowledgeDragPayload | null,
  target: Readonly<{ sourceKey: string; directory: boolean }> | null,
): KnowledgeDropEffect {
  if (!payload || !target?.directory) return 'none';
  if (payload.kind === 'external-files') return 'import';
  return payload.sourceKey === target.sourceKey ? 'move' : 'copy';
}
