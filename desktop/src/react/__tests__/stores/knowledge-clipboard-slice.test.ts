import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import {
  activeKnowledgeClipboard,
  createKnowledgeClipboardSlice,
  type KnowledgeClipboardSlice,
} from '../../stores/knowledge-clipboard-slice';

const address = (sourceKey: string, relativePath: string) => ({ sourceKey, relativePath });

describe('knowledge clipboard slice', () => {
  it('captures a single-source structured copy/cut payload without system paths', () => {
    const store = create<KnowledgeClipboardSlice>()(set => createKnowledgeClipboardSlice(set));
    store.getState().setKnowledgeClipboard('workspace-1', 'cut', [
      address('main', 'a.md'),
      address('main', 'folder'),
    ]);
    expect(store.getState().knowledgeClipboard).toEqual({
      workspaceKey: 'workspace-1',
      sourceKey: 'main',
      intent: 'cut',
      addresses: [address('main', 'a.md'), address('main', 'folder')],
    });
    expect(activeKnowledgeClipboard(store.getState(), 'workspace-2')).toBeNull();
  });

  it('rejects mixed sources and retains only failed cut items for retry', () => {
    const store = create<KnowledgeClipboardSlice>()(set => createKnowledgeClipboardSlice(set));
    store.getState().setKnowledgeClipboard('workspace-1', 'copy', [
      address('main', 'a.md'), address('archive', 'b.md'),
    ]);
    expect(store.getState().knowledgeClipboard).toBeNull();
    store.getState().setKnowledgeClipboard('workspace-1', 'cut', [
      address('main', 'a.md'), address('main', 'b.md'),
    ]);
    store.getState().retainKnowledgeClipboardFailures([address('main', 'b.md')]);
    expect(store.getState().knowledgeClipboard?.addresses).toEqual([address('main', 'b.md')]);
    store.getState().retainKnowledgeClipboardFailures([]);
    expect(store.getState().knowledgeClipboard).toBeNull();
  });
});
