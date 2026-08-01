import { describe, expect, it } from 'vitest';
import {
  createKnowledgeTreeSelectionState,
  knowledgeTreeSelectionReducer,
  normalizeKnowledgeTreeSelection,
  type KnowledgeTreeVisibleNode,
} from '../../components/knowledge-workspace/resource-tree-selection';

const nodes: KnowledgeTreeVisibleNode[] = [
  { key: 'main\0', sourceKey: 'main', relativePath: '', parentKey: null, isDirectory: true },
  { key: 'main\0docs', sourceKey: 'main', relativePath: 'docs', parentKey: 'main\0', isDirectory: true },
  { key: 'main\0docs/a.md', sourceKey: 'main', relativePath: 'docs/a.md', parentKey: 'main\0docs', isDirectory: false },
  { key: 'main\0b.md', sourceKey: 'main', relativePath: 'b.md', parentKey: 'main\0', isDirectory: false },
  { key: 'archive\0', sourceKey: 'archive', relativePath: '', parentKey: null, isDirectory: true },
];

describe('knowledge tree selection reducer', () => {
  it('keeps one source and removes descendants covered by a selected ancestor', () => {
    expect(normalizeKnowledgeTreeSelection(
      ['main\0docs/a.md', 'main\0docs', 'archive\0'],
      nodes,
      'main',
    )).toEqual(['main\0docs']);
  });

  it('preserves an existing multi-selection on context click and replaces it otherwise', () => {
    let state = createKnowledgeTreeSelectionState();
    state = knowledgeTreeSelectionReducer(state, {
      type: 'replace-visible',
      nodes,
    });
    state = knowledgeTreeSelectionReducer(state, { type: 'select', key: 'main\0docs' });
    state = knowledgeTreeSelectionReducer(state, {
      type: 'select',
      key: 'main\0b.md',
      additive: true,
    });
    state = knowledgeTreeSelectionReducer(state, {
      type: 'context',
      key: 'main\0docs',
    });
    expect(state.selectedKeys).toEqual(['main\0docs', 'main\0b.md']);
    expect(state.contextTargetKey).toBe('main\0docs');

    state = knowledgeTreeSelectionReducer(state, {
      type: 'context',
      key: 'archive\0',
    });
    expect(state.selectedKeys).toEqual(['archive\0']);
    expect(state.sourceKey).toBe('archive');
  });

  it('keeps focus independent, anchors ranges, and prunes vanished nodes on refresh', () => {
    let state = knowledgeTreeSelectionReducer(createKnowledgeTreeSelectionState(), {
      type: 'replace-visible',
      nodes,
    });
    state = knowledgeTreeSelectionReducer(state, { type: 'select', key: 'main\0docs/a.md' });
    state = knowledgeTreeSelectionReducer(state, { type: 'focus', key: 'main\0b.md' });
    expect(state.selectedKeys).toEqual(['main\0docs/a.md']);
    expect(state.focusKey).toBe('main\0b.md');
    expect(state.anchorKey).toBe('main\0docs/a.md');

    state = knowledgeTreeSelectionReducer(state, {
      type: 'replace-visible',
      nodes: nodes.filter(node => node.key !== 'main\0docs/a.md'),
    });
    expect(state.selectedKeys).toEqual([]);
    expect(state.anchorKey).toBeNull();
    expect(state.focusKey).toBe('main\0b.md');
  });

  it('uses the stable anchor for ranges and supports non-contiguous toggles', () => {
    let state = knowledgeTreeSelectionReducer(createKnowledgeTreeSelectionState(), {
      type: 'replace-visible',
      nodes,
    });
    state = knowledgeTreeSelectionReducer(state, { type: 'select', key: 'main\0docs' });
    state = knowledgeTreeSelectionReducer(state, {
      type: 'select',
      key: 'main\0b.md',
      range: true,
    });
    expect(state.selectedKeys).toEqual(['main\0docs', 'main\0b.md']);
    expect(state.focusKey).toBe('main\0b.md');

    state = knowledgeTreeSelectionReducer(state, {
      type: 'toggle-focused',
      key: 'main\0b.md',
    });
    expect(state.selectedKeys).toEqual(['main\0docs']);
    expect(state.anchorKey).toBe('main\0docs');
  });

  it('clears transient state on workspace replacement instead of restoring stale targets', () => {
    let state = knowledgeTreeSelectionReducer(createKnowledgeTreeSelectionState(), {
      type: 'replace-visible',
      nodes,
    });
    state = knowledgeTreeSelectionReducer(state, { type: 'select', key: 'main\0docs' });
    state = knowledgeTreeSelectionReducer(state, { type: 'clear' });
    expect(state).toMatchObject({
      selectedKeys: [],
      sourceKey: null,
      focusKey: null,
      anchorKey: null,
      contextTargetKey: null,
    });
  });

  it('preserves reducer identity when an equivalent visible projection is rebuilt', () => {
    const state = knowledgeTreeSelectionReducer(createKnowledgeTreeSelectionState(), {
      type: 'replace-visible',
      nodes,
    });
    const refreshed = knowledgeTreeSelectionReducer(state, {
      type: 'replace-visible',
      nodes: nodes.map(node => ({ ...node })),
    });
    expect(refreshed).toBe(state);
  });
});
