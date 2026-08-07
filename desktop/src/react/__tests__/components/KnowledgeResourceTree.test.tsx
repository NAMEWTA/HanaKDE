// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  KnowledgeSourceDto,
} from '../../../../../shared/knowledge-workspace-contract.ts';
import {
  KnowledgeWorkspaceClientError,
  type KnowledgeWorkspaceClient,
  type RendererResourceListResult,
} from '../../services/knowledge-workspace-client';
import {
  KnowledgeResourceTree,
  type KnowledgeResourceTreeChangeSignal,
} from '../../components/knowledge-workspace/KnowledgeResourceTree';
import type { ResourceWatchRelease } from '../../services/resource-events';
import { useStore } from '../../stores';

const mainSource: KnowledgeSourceDto = {
  sourceKey: 'main',
  displayName: 'Main workspace',
  role: 'main',
  capabilities: ['stat', 'read', 'list', 'watch'],
  availability: 'available',
};

const archiveSource: KnowledgeSourceDto = {
  sourceKey: 'archive',
  displayName: 'Archive',
  role: 'mounted',
  capabilities: ['stat', 'read', 'list', 'watch'],
  availability: 'available',
};

function listResult(
  items: Array<Partial<RendererResourceListResult['items'][number]> & {
    name: string;
    isDirectory: boolean;
  }>,
): RendererResourceListResult {
  return {
    items: items.map((item, index) => ({
      size: item.isDirectory ? null : (item.size ?? index + 1),
      mtimeMs: item.mtimeMs ?? index + 1,
      ...item,
    })),
  };
}

function treeClient(
  list: KnowledgeWorkspaceClient['resources']['list'],
): KnowledgeWorkspaceClient {
  return {
    resources: { list },
  } as KnowledgeWorkspaceClient;
}

function installTranslations() {
  window.t = ((key: string, vars?: Record<string, string | number>) => {
    const values: Record<string, string> = {
      'knowledge.tree.expand': 'Expand {name}',
      'knowledge.tree.collapse': 'Collapse {name}',
      'knowledge.tree.loading': 'Loading {name}',
      'knowledge.tree.loadError': 'Could not load {name}',
      'knowledge.tree.retry': 'Retry {name}',
      'knowledge.tree.unavailable': '{name} is unavailable',
      'knowledge.tree.emptyDirectory': '{name} is empty',
    };
    let value = values[key] ?? key;
    for (const [name, replacement] of Object.entries(vars ?? {})) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
    return value;
  }) as typeof window.t;
}

function renderTree({
  client,
  sources = [mainSource, archiveSource],
  workspaceKey = 'workspace-tree-16',
  subscribeToChanges,
  watchSource,
}: {
  client: KnowledgeWorkspaceClient;
  sources?: KnowledgeSourceDto[];
  workspaceKey?: string;
  subscribeToChanges?: (
    listener: (signal: KnowledgeResourceTreeChangeSignal) => void,
  ) => () => void;
  watchSource?: (sourceKey: string) => ResourceWatchRelease;
}) {
  return render(
    <KnowledgeResourceTree
      client={client}
      sources={sources}
      workspaceKey={workspaceKey}
      watchSource={watchSource ?? (() => () => {})}
      subscribeToChanges={subscribeToChanges ?? (() => () => {})}
      refreshDelayMs={0}
    />,
  );
}

describe('KnowledgeResourceTree', () => {
  beforeEach(() => {
    installTranslations();
    useStore.getState().openKnowledgeWorkspace('workspace-tree-16');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lazily projects every source through KnowledgeResourceAddress and keeps complete names', async () => {
    const list = vi.fn(async ({ sourceKey, relativePath }) => {
      if (sourceKey === 'main' && relativePath === '') {
        return listResult([
          { name: '.trash', isDirectory: true },
          { name: 'Folder 10', isDirectory: true },
          { name: 'Folder 2', isDirectory: true },
          { name: 'notes.md', isDirectory: false },
          { name: 'raw.sdfds', isDirectory: false },
        ]);
      }
      if (sourceKey === 'main' && relativePath === 'Folder 2') {
        return listResult([
          { name: 'nested.page.md', isDirectory: false },
        ]);
      }
      return listResult([]);
    });

    renderTree({ client: treeClient(list) });

    expect(screen.getByRole('treeitem', { name: /Main workspace/ })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: /Archive/ })).toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Expand Main workspace' }));

    await waitFor(() => {
      expect(list).toHaveBeenCalledWith(
        { sourceKey: 'main', relativePath: '' },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(screen.queryByText('.trash')).not.toBeInTheDocument();
    expect(screen.getByText('notes.md')).toBeInTheDocument();
    expect(screen.getByText('raw.sdfds')).toBeInTheDocument();

    const mainGroup = screen.getByRole('group', { name: 'Main workspace' });
    expect(
      within(mainGroup).getAllByRole('treeitem').map((item) => item.getAttribute('data-resource-name')),
    ).toEqual(['Folder 2', 'Folder 10', 'notes.md', 'raw.sdfds']);

    fireEvent.click(screen.getByRole('button', { name: 'Expand Folder 2' }));
    expect(await screen.findByText('nested.page.md')).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith(
      { sourceKey: 'main', relativePath: 'Folder 2' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(useStore.getState().knowledgeExpandedPathsBySource.main).toEqual([
      '',
      'Folder 2',
    ]);
  });

  it('publishes selected files in both tree-operation and editor-attachment drag formats', async () => {
    const list = vi.fn(async () => listResult([
      { name: 'Page.md', isDirectory: false },
      { name: 'photo.png', isDirectory: false },
    ]));
    renderTree({ client: treeClient(list), sources: [mainSource] });
    fireEvent.click(screen.getByRole('button', { name: 'Expand Main workspace' }));
    const page = await screen.findByRole('treeitem', { name: /Page\.md/u });
    const values = new Map<string, string>();

    fireEvent.dragStart(page, {
      dataTransfer: {
        setData: (type: string, value: string) => values.set(type, value),
        effectAllowed: 'none',
      },
    });

    expect(JSON.parse(values.get('application/x-openhanako-knowledge-resources+json') ?? 'null'))
      .toMatchObject({ sourceKey: 'main', addresses: [{ relativePath: 'Page.md' }] });
    expect(JSON.parse(values.get('application/x-hanako-knowledge-editor-resources+json') ?? 'null'))
      .toEqual([{
        sourceAddress: { sourceKey: 'main', relativePath: 'Page.md' },
        kind: 'page',
      }]);
  });

  it('aborts a pending branch when it is collapsed and ignores the stale result', async () => {
    let resolveList: ((value: RendererResourceListResult) => void) | undefined;
    let signal: AbortSignal | undefined;
    const list = vi.fn((_address, options = {}) => {
      signal = options.signal;
      return new Promise<RendererResourceListResult>((resolve) => {
        resolveList = resolve;
      });
    });

    renderTree({
      client: treeClient(list),
      sources: [mainSource],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Expand Main workspace' }));
    await waitFor(() => expect(signal).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Main workspace' }));
    expect(signal?.aborted).toBe(true);

    await act(async () => {
      resolveList?.(listResult([{ name: 'ghost.md', isDirectory: false }]));
      await Promise.resolve();
    });
    expect(screen.queryByText('ghost.md')).not.toBeInTheDocument();
    expect(useStore.getState().knowledgeExpandedPathsBySource.main).toEqual([]);
  });

  it('keeps healthy sources visible when one source fails and retries only that source', async () => {
    const unavailable = new KnowledgeWorkspaceClientError({
      code: 'knowledge_resource_unavailable',
      httpStatus: 503,
      retryable: true,
    });
    let archiveAttempt = 0;
    const list = vi.fn(async ({ sourceKey }) => {
      if (sourceKey === 'main') {
        return listResult([{ name: 'main.md', isDirectory: false }]);
      }
      archiveAttempt += 1;
      if (archiveAttempt === 1) throw unavailable;
      return listResult([{ name: 'archive.tar.gz', isDirectory: false }]);
    });

    renderTree({ client: treeClient(list) });
    fireEvent.click(screen.getByRole('button', { name: 'Expand Main workspace' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand Archive' }));

    expect(await screen.findByText('main.md')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load Archive');
    expect(screen.getByText('main.md')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry Archive' }));
    expect(await screen.findByText('archive.tar.gz')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('uses the shared source watcher only for watchable sources and releases it on cleanup', () => {
    const releases = new Map<string, ReturnType<typeof vi.fn>>();
    const watchSource = vi.fn((sourceKey: string) => {
      const release = vi.fn();
      releases.set(sourceKey, release);
      return release;
    });
    const unavailableArchive = {
      ...archiveSource,
      availability: 'unavailable' as const,
    };
    const view = renderTree({
      client: treeClient(vi.fn()),
      sources: [mainSource, unavailableArchive],
      watchSource,
    });

    expect(watchSource).toHaveBeenCalledTimes(1);
    expect(watchSource).toHaveBeenCalledWith('main');
    expect(screen.getByRole('status')).toHaveTextContent('Archive is unavailable');

    view.unmount();
    expect(releases.get('main')).toHaveBeenCalledOnce();
  });

  it('refreshes loaded branches after existing resource events without clearing failed siblings', async () => {
    let listener: ((signal: KnowledgeResourceTreeChangeSignal) => void) | undefined;
    let revision = 0;
    let rejectArchiveRefresh = false;
    const list = vi.fn(async ({ sourceKey }) => {
      if (sourceKey === 'archive' && rejectArchiveRefresh) {
        throw new KnowledgeWorkspaceClientError({
          code: 'knowledge_resource_unavailable',
          httpStatus: 503,
          retryable: true,
        });
      }
      const suffix = revision === 0 ? 'before' : 'after';
      return listResult([{
        name: `${sourceKey}-${suffix}.md`,
        isDirectory: false,
      }]);
    });

    renderTree({
      client: treeClient(list),
      subscribeToChanges: (nextListener) => {
        listener = nextListener;
        return () => {
          listener = undefined;
        };
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Expand Main workspace' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand Archive' }));
    expect(await screen.findByText('main-before.md')).toBeInTheDocument();
    expect(await screen.findByText('archive-before.md')).toBeInTheDocument();

    revision = 1;
    rejectArchiveRefresh = true;
    act(() => listener?.({ kind: 'resource-event' }));

    expect(await screen.findByText('main-after.md')).toBeInTheDocument();
    expect(screen.getByText('archive-before.md')).toBeInTheDocument();
    expect(screen.queryByText('main-before.md')).not.toBeInTheDocument();
  });

  it('takes one catch-up snapshot when the first expanded source-root listing is empty', async () => {
    let calls = 0;
    const list = vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? listResult([])
        : listResult([{ name: 'appeared-after-watch.md', isDirectory: false }]);
    });

    renderTree({
      client: treeClient(list),
      sources: [mainSource],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Expand Main workspace' }));

    expect(await screen.findByText('appeared-after-watch.md')).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('revalidates an expanded empty root when its source watch is confirmed', async () => {
    let confirmWatch: (() => void) | undefined;
    const watchReady = new Promise<void>((resolve) => {
      confirmWatch = resolve;
    });
    const release = vi.fn() as ResourceWatchRelease;
    Object.defineProperty(release, 'ready', {
      value: watchReady,
      enumerable: false,
    });
    let revision = 0;
    const list = vi.fn(async () => (
      revision === 0
        ? listResult([])
        : listResult([{ name: 'written-after-watch.md', isDirectory: false }])
    ));

    renderTree({
      client: treeClient(list),
      sources: [mainSource],
      watchSource: () => release,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Expand Main workspace' }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

    revision = 1;
    act(() => confirmWatch?.());

    expect(await screen.findByText('written-after-watch.md')).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('revalidates after a watch confirms before the first root snapshot arrives', async () => {
    let confirmWatch: (() => void) | undefined;
    const watchReady = new Promise<void>((resolve) => {
      confirmWatch = resolve;
    });
    const release = vi.fn() as ResourceWatchRelease;
    Object.defineProperty(release, 'ready', {
      value: watchReady,
      enumerable: false,
    });
    let revision = 0;
    const list = vi.fn(async () => (
      revision === 0
        ? listResult([])
        : listResult([{ name: 'written-after-early-watch.md', isDirectory: false }])
    ));

    renderTree({
      client: treeClient(list),
      sources: [mainSource],
      watchSource: () => release,
    });
    act(() => confirmWatch?.());
    revision = 1;
    fireEvent.click(screen.getByRole('button', { name: 'Expand Main workspace' }));

    expect(await screen.findByText('written-after-early-watch.md')).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('restores expansion only inside the same workspace session', async () => {
    const list = vi.fn(async ({ relativePath }) => (
      relativePath === ''
        ? listResult([{ name: 'deep', isDirectory: true }])
        : listResult([{ name: 'leaf.md', isDirectory: false }])
    ));
    const client = treeClient(list);
    const first = renderTree({ client, sources: [mainSource] });

    fireEvent.click(screen.getByRole('button', { name: 'Expand Main workspace' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Expand deep' }));
    expect(await screen.findByText('leaf.md')).toBeInTheDocument();
    first.unmount();

    renderTree({ client, sources: [mainSource] });
    expect(await screen.findByText('leaf.md')).toBeInTheDocument();
    cleanup();

    useStore.getState().openKnowledgeWorkspace('new-workspace');
    renderTree({
      client,
      sources: [mainSource],
      workspaceKey: 'new-workspace',
    });
    expect(screen.getByRole('button', { name: 'Expand Main workspace' })).toBeInTheDocument();
    expect(screen.queryByText('deep')).not.toBeInTheDocument();
  });
});
