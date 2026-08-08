// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeSourceDto } from '../../../../../shared/knowledge-workspace-contract.ts';
import type { KnowledgeWorkspaceClient } from '../../services/knowledge-workspace-client';
import { useStore } from '../../stores';
import {
  KnowledgeResourceTree,
  type KnowledgeResourceTreeHandle,
  sortKnowledgeTreeItems,
} from '../../components/knowledge-workspace/KnowledgeResourceTree';

const source: KnowledgeSourceDto = {
  sourceKey: 'main',
  displayName: 'Main',
  role: 'main',
  capabilities: ['list', 'read'],
  availability: 'available',
};

describe('KnowledgeResourceTree open projection', () => {
  beforeEach(() => {
    useStore.getState().openKnowledgeWorkspace('open-tree');
    window.t = ((key: string) => key) as typeof window.t;
  });
  afterEach(cleanup);

  it('keeps directories first and projects deterministic name, modified and extension order', () => {
    const items = [
      { name: 'z.md', isDirectory: false, size: 1, mtimeMs: 5 },
      { name: 'a.txt', isDirectory: false, size: 1, mtimeMs: 3 },
      { name: 'folder', isDirectory: true, size: null, mtimeMs: 9 },
    ];
    expect(sortKnowledgeTreeItems(items, { field: 'modified', direction: 'ascending' }).map(item => item.name))
      .toEqual(['folder', 'a.txt', 'z.md']);
    expect(sortKnowledgeTreeItems(items, { field: 'extension', direction: 'descending' }).map(item => item.name))
      .toEqual(['folder', 'a.txt', 'z.md']);
  });

  it('uses click and Space for preview, double click and Enter for pinned open', async () => {
    const onOpenResource = vi.fn();
    const client = {
      resources: {
        list: vi.fn(async () => ({
          items: [{ name: 'page.md', isDirectory: false, size: 1, mtimeMs: 1 }],
        })),
      },
    } as unknown as KnowledgeWorkspaceClient;
    render(
      <KnowledgeResourceTree
        client={client}
        sources={[source]}
        workspaceKey="open-tree"
        watchSource={() => () => {}}
        subscribeToChanges={() => () => {}}
        onOpenResource={onOpenResource}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /expand/i }));
    const page = await screen.findByRole('treeitem', { name: /page.md/ });
    fireEvent.click(page);
    expect(onOpenResource).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: 'preview',
      focusContent: false,
    }));
    fireEvent.keyDown(page, { code: 'Space', key: ' ' });
    expect(onOpenResource).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'preview' }));
    fireEvent.doubleClick(page);
    expect(onOpenResource).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'pinned' }));
    fireEvent.keyDown(page, { key: 'Enter' });
    expect(onOpenResource).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: 'pinned',
      focusContent: true,
    }));
  });

  it('explicitly locates a resource by expanding its ancestors and replacing tree selection', async () => {
    const ref = createRef<KnowledgeResourceTreeHandle>();
    const client = {
      resources: {
        list: vi.fn(async ({ relativePath }: { relativePath: string }) => ({
          items: relativePath === ''
            ? [
                { name: 'other.md', isDirectory: false, size: 1, mtimeMs: 1 },
                { name: 'deep', isDirectory: true, size: null, mtimeMs: 1 },
              ]
            : relativePath === 'deep'
              ? [{ name: 'nested', isDirectory: true, size: null, mtimeMs: 1 }]
              : [{ name: 'target.md', isDirectory: false, size: 1, mtimeMs: 1 }],
        })),
      },
    } as unknown as KnowledgeWorkspaceClient;
    render(
      <KnowledgeResourceTree
        ref={ref}
        client={client}
        sources={[source]}
        workspaceKey="open-tree"
        watchSource={() => () => {}}
        subscribeToChanges={() => () => {}}
      />,
    );

    fireEvent.click(screen.getByRole('treeitem', { name: /Main/ }));
    expect(screen.getByRole('treeitem', { name: /Main/ })).toHaveAttribute('aria-selected', 'true');

    act(() => {
      ref.current?.locateResource({
        kind: 'resource',
        sourceKey: 'main',
        relativePath: 'deep/nested/target.md',
      });
    });

    const target = await screen.findByRole('treeitem', { name: /target.md/ });
    await waitFor(() => expect(target).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByRole('treeitem', { name: /Main/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('treeitem', { name: /deep/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('treeitem', { name: /nested/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('treeitem', { selected: true })).toEqual([target]);
  });
});
