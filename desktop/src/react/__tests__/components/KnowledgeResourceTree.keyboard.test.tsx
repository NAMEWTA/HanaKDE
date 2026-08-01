// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeSourceDto } from '../../../../../shared/knowledge-workspace-contract.ts';
import type { KnowledgeWorkspaceClient } from '../../services/knowledge-workspace-client';
import { useStore } from '../../stores';
import { KnowledgeResourceTree } from '../../components/knowledge-workspace/KnowledgeResourceTree';

const source: KnowledgeSourceDto = {
  sourceKey: 'main',
  displayName: 'Main',
  role: 'main',
  capabilities: ['list', 'read'],
  availability: 'available',
};

const client = {
  resources: {
    list: vi.fn(async ({ relativePath }: { relativePath: string }) => ({
      items: relativePath === ''
        ? [
            { name: 'docs', isDirectory: true, size: null, mtimeMs: 1 },
            { name: 'one.md', isDirectory: false, size: 1, mtimeMs: 2 },
            { name: 'two.md', isDirectory: false, size: 1, mtimeMs: 3 },
          ]
        : [{ name: 'nested.md', isDirectory: false, size: 1, mtimeMs: 4 }],
    })),
  },
} as unknown as KnowledgeWorkspaceClient;

describe('KnowledgeResourceTree keyboard selection', () => {
  beforeEach(() => {
    useStore.getState().openKnowledgeWorkspace('keyboard-tree');
    window.t = ((key: string) => key) as typeof window.t;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('supports roving focus, stable shift ranges, non-contiguous toggles and hierarchy keys', async () => {
    render(
      <KnowledgeResourceTree
        client={client}
        sources={[source]}
        workspaceKey="keyboard-tree"
        watchSource={() => () => {}}
        subscribeToChanges={() => () => {}}
      />,
    );
    const root = screen.getByRole('treeitem', { name: /Main/ });
    fireEvent.keyDown(root, { key: 'Enter' });
    const docs = await screen.findByRole('treeitem', { name: /docs/ });
    const one = screen.getByRole('treeitem', { name: /one.md/ });
    const two = screen.getByRole('treeitem', { name: /two.md/ });

    fireEvent.click(docs);
    fireEvent.keyDown(docs, { key: 'ArrowDown', shiftKey: true });
    await waitFor(() => {
      expect(docs).toHaveAttribute('aria-selected', 'true');
      expect(one).toHaveAttribute('aria-selected', 'true');
    });

    fireEvent.keyDown(one, { key: 'ArrowDown', ctrlKey: true });
    fireEvent.keyDown(two, { code: 'Space', ctrlKey: true });
    await waitFor(() => expect(two).toHaveAttribute('aria-selected', 'true'));

    fireEvent.keyDown(docs, { key: 'ArrowRight' });
    expect(await screen.findByRole('treeitem', { name: /nested.md/ })).toBeInTheDocument();
    fireEvent.keyDown(docs, { key: 'ArrowLeft' });
    await waitFor(() => expect(screen.queryByText('nested.md')).not.toBeInTheDocument());
  });

  it('clears the canonical selection when the tree background is clicked', async () => {
    const onSelectionChange = vi.fn();
    const { container } = render(
      <KnowledgeResourceTree
        client={client}
        sources={[source]}
        workspaceKey="keyboard-tree"
        watchSource={() => () => {}}
        subscribeToChanges={() => () => {}}
        onSelectionChange={onSelectionChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /expand/i }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /one.md/ }));
    const background = container.querySelector('ul[role="group"]')!;
    fireEvent.click(background);
    await waitFor(() => expect(onSelectionChange).toHaveBeenLastCalledWith({
      sourceKey: null,
      addresses: [],
      contextTarget: null,
    }));
  });
});
