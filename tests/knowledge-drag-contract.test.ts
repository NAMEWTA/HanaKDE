import { describe, expect, it } from 'vitest';
import { knowledgeDropEffect, parseKnowledgeDragPayload } from '../shared/knowledge-drag-contract.ts';

describe('knowledge drag contract', () => {
  it('uses move for same-source, copy for cross-source and import for native external payloads', () => {
    const internal = parseKnowledgeDragPayload({
      kind: 'knowledge-resources',
      sourceKey: 'main',
      addresses: [{ sourceKey: 'main', relativePath: 'a.md' }],
    });
    expect(knowledgeDropEffect(internal, { sourceKey: 'main', directory: true })).toBe('move');
    expect(knowledgeDropEffect(internal, { sourceKey: 'archive', directory: true })).toBe('copy');
    const external = parseKnowledgeDragPayload({
      kind: 'external-files', nativeRequestId: 'native_request_1234',
    });
    expect(knowledgeDropEffect(external, { sourceKey: 'main', directory: true })).toBe('import');
    expect(knowledgeDropEffect(internal, { sourceKey: 'main', directory: false })).toBe('none');
  });

  it('rejects mixed sources, unknown fields, invalid addresses and path-bearing external payloads', () => {
    expect(parseKnowledgeDragPayload({
      kind: 'knowledge-resources', sourceKey: 'main',
      addresses: [{ sourceKey: 'archive', relativePath: 'a.md' }],
    })).toBeNull();
    expect(parseKnowledgeDragPayload({
      kind: 'external-files', nativeRequestId: 'native_request_1234', path: '/private/a',
    })).toBeNull();
  });
});
