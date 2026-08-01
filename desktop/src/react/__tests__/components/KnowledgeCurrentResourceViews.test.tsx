// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KnowledgeCurrentResourceViews,
  type KnowledgeCurrentResourceTarget,
} from '../../components/knowledge-workspace/KnowledgeCurrentResourceViews';
import type {
  KnowledgeWorkspaceClient,
  RendererKnowledgeBacklinksResult,
} from '../../services/knowledge-workspace-client';
import {
  KnowledgeWorkspaceClientError,
} from '../../services/knowledge-workspace-client';
import {
  createKnowledgeDocumentRegistry,
} from '../../stores/knowledge-document-registry';

const address = {
  sourceKey: 'main',
  relativePath: 'Notes/Current.md',
};

const target: KnowledgeCurrentResourceTarget = {
  viewId: 'view-1',
  groupId: 'group-1',
  kind: 'markdown',
  address,
  sourceName: 'Main',
};

const emptyBacklinks: RendererKnowledgeBacklinksResult = {
  kind: 'backlinks',
  sourceKey: 'main',
  generationId: 'generation-1',
  items: [],
  hasMore: false,
};

function createRegistry(
  buffer = '# Draft\n[[Plans/Next.md#Today]]',
  baseline = '# Saved',
) {
  const registry = createKnowledgeDocumentRegistry({
    ownerId: 'owner',
    windowId: 'current-resource-test',
  });
  registry.getState().establishDocumentSession({
    address,
    buffer,
    baseline,
  });
  registry.getState().openDocumentView({
    viewId: target.viewId,
    address,
    groupId: target.groupId,
  });
  return registry;
}

function createClient(
  querySavedBacklinks = vi.fn().mockResolvedValue(emptyBacklinks),
) {
  return {
    querySavedBacklinks,
  } as unknown as KnowledgeWorkspaceClient;
}

describe('KnowledgeCurrentResourceViews', () => {
  beforeEach(() => {
    window.t = ((key: string) => ({
      'knowledge.currentViews.heading': 'Current resource',
      'knowledge.currentViews.empty': 'Open a Markdown page.',
      'knowledge.currentViews.outline': 'Outline',
      'knowledge.currentViews.outbound': 'Outbound links',
      'knowledge.currentViews.backlinks': 'Backlinks',
      'knowledge.currentViews.liveBuffer': 'Live buffer',
      'knowledge.currentViews.savedIndex': 'Saved index',
      'knowledge.currentViews.unsavedDifference':
        'Outline and outbound links include unsaved edits; backlinks use saved files.',
      'knowledge.currentViews.noOutline': 'No headings',
      'knowledge.currentViews.noOutbound': 'No outbound links',
      'knowledge.currentViews.noBacklinks': 'No backlinks',
      'knowledge.currentViews.loadingBacklinks': 'Loading backlinks',
      'knowledge.currentViews.backlinksError': 'Could not load backlinks',
      'knowledge.currentViews.moreBacklinks': 'More backlinks are available',
      'knowledge.retry': 'Retry',
    }[key] ?? key)) as typeof window.t;
  });

  afterEach(() => {
    cleanup();
  });

  it('projects unsaved outline and same-source outbound links from the live buffer', async () => {
    const registry = createRegistry([
      '# Draft',
      '## Today',
      '[[Plans/Next.md#Now]]',
      '[Sibling](Sibling.md#Part)',
      '[[research:Secret.md]]',
      '[external](https://example.test)',
    ].join('\n'));
    const onRevealCurrent = vi.fn();
    const onOpenOutbound = vi.fn();

    const { container } = render(
      <KnowledgeCurrentResourceViews
        registry={registry}
        client={createClient()}
        activeTarget={target}
        onRevealCurrent={onRevealCurrent}
        onOpenOutbound={onOpenOutbound}
        onOpenBacklink={vi.fn()}
      />,
    );

    expect(screen.getByText('Outline').nextSibling).toHaveTextContent(
      'Live buffer',
    );
    expect(screen.getByText('Backlinks').nextSibling).toHaveTextContent(
      'Saved index',
    );
    expect(screen.getByText(/include unsaved edits/)).toHaveTextContent(
      'include unsaved edits',
    );
    expect(screen.getByRole('button', { name: 'Draft' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Today' })).toBeVisible();
    expect(screen.getByRole('button', {
      name: 'Plans/Next.md#Now',
    })).toBeVisible();
    expect(screen.getByRole('button', {
      name: 'Notes/Sibling.md#Part',
    })).toBeVisible();
    expect(container).not.toHaveTextContent('Secret.md');
    expect(container).not.toHaveTextContent('example.test');

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(onRevealCurrent).toHaveBeenCalledWith(
      'view-1',
      expect.any(Number),
    );

    fireEvent.click(screen.getByRole('button', {
      name: 'Plans/Next.md#Now',
    }));
    expect(onOpenOutbound).toHaveBeenCalledWith(
      {
        sourceKey: 'main',
        relativePath: 'Plans/Next.md',
      },
      'Main',
      'group-1',
      'Now',
      'wikilink',
      false,
    );
  });

  it('keeps backlinks on the saved index while unsaved buffer views update live', async () => {
    const querySavedBacklinks = vi.fn().mockResolvedValue({
      kind: 'backlinks',
      sourceKey: 'main',
      generationId: 'generation-1',
      items: [{
        sourceAddress: {
          sourceKey: 'main',
          relativePath: 'Notes/Saved Referrer.md',
        },
        ordinal: 0,
        linkKind: 'wikilink',
        fragment: null,
        fromOffset: 17,
        toOffset: 28,
      }],
      hasMore: true,
    } satisfies RendererKnowledgeBacklinksResult);
    const registry = createRegistry();
    const onOpenBacklink = vi.fn();

    render(
      <KnowledgeCurrentResourceViews
        registry={registry}
        client={createClient(querySavedBacklinks)}
        activeTarget={target}
        onRevealCurrent={vi.fn()}
        onOpenOutbound={vi.fn()}
        onOpenBacklink={onOpenBacklink}
      />,
    );

    await screen.findByRole('button', { name: 'Notes/Saved Referrer.md' });
    expect(querySavedBacklinks).toHaveBeenCalledTimes(1);
    expect(querySavedBacklinks).toHaveBeenCalledWith({
      address,
      limit: 100,
    }, expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
    expect(screen.getByText('More backlinks are available')).toBeVisible();

    act(() => {
      registry.getState().replaceDocumentBuffer(
        'view-1',
        '# New live heading\n[[Plans/Changed.md]]',
      );
    });
    await screen.findByRole('button', { name: 'New live heading' });
    expect(screen.getByRole('button', {
      name: 'Plans/Changed.md',
    })).toBeVisible();
    expect(screen.getByRole('button', {
      name: 'Notes/Saved Referrer.md',
    })).toBeVisible();
    expect(querySavedBacklinks).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', {
      name: 'Notes/Saved Referrer.md',
    }));
    expect(onOpenBacklink).toHaveBeenCalledWith(
      {
        sourceKey: 'main',
        relativePath: 'Notes/Saved Referrer.md',
      },
      'Main',
      'group-1',
      17,
    );
  });

  it('refreshes backlinks after a save and cancels the previous request', async () => {
    const signals: AbortSignal[] = [];
    const querySavedBacklinks = vi.fn((
      _input: unknown,
      options?: { signal?: AbortSignal },
    ) => {
      if (options?.signal) signals.push(options.signal);
      return new Promise<RendererKnowledgeBacklinksResult>(() => undefined);
    });
    const registry = createRegistry();

    render(
      <KnowledgeCurrentResourceViews
        registry={registry}
        client={createClient(querySavedBacklinks)}
        activeTarget={target}
        onRevealCurrent={vi.fn()}
        onOpenOutbound={vi.fn()}
        onOpenBacklink={vi.fn()}
      />,
    );
    await waitFor(() => expect(querySavedBacklinks).toHaveBeenCalledTimes(1));

    act(() => {
      const session = Object.values(registry.getState().sessions)[0]!;
      registry.getState().commitSavedDocument(
        address,
        session.buffer,
        {
          mtimeMs: 2,
          size: 40,
          sha256: 'saved-sha',
        },
      );
    });

    await waitFor(() => expect(querySavedBacklinks).toHaveBeenCalledTimes(2));
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });

  it('refreshes saved backlinks after another resource publishes a change', async () => {
    type ChangeSignal = { kind: 'resource-event' } | { kind: 'resync' };
    let publishChange: ((signal: ChangeSignal) => void) | null = null;
    const subscribeToChanges = vi.fn((
      listener: (signal: ChangeSignal) => void,
    ) => {
      publishChange = listener;
      return () => {
        publishChange = null;
      };
    });
    const querySavedBacklinks = vi.fn()
      .mockResolvedValueOnce(emptyBacklinks)
      .mockResolvedValueOnce({
        ...emptyBacklinks,
        generationId: 'generation-2',
        items: [{
          sourceAddress: {
            sourceKey: 'main',
            relativePath: 'Notes/New Referrer.md',
          },
          ordinal: 0,
          linkKind: 'markdown',
          fragment: null,
          fromOffset: 12,
          toOffset: 30,
        }],
      } satisfies RendererKnowledgeBacklinksResult);

    render(
      <KnowledgeCurrentResourceViews
        registry={createRegistry()}
        client={createClient(querySavedBacklinks)}
        activeTarget={target}
        onRevealCurrent={vi.fn()}
        onOpenOutbound={vi.fn()}
        onOpenBacklink={vi.fn()}
        subscribeToChanges={subscribeToChanges}
        refreshDelayMs={0}
      />,
    );

    await waitFor(() => expect(querySavedBacklinks).toHaveBeenCalledTimes(1));
    act(() => publishChange?.({ kind: 'resource-event' }));

    expect(await screen.findByRole('button', {
      name: 'Notes/New Referrer.md',
    })).toBeVisible();
    expect(querySavedBacklinks).toHaveBeenCalledTimes(2);
  });

  it('does not render a previous resource result while switching or after a stale response', async () => {
    const registry = createRegistry();
    const secondAddress = {
      sourceKey: 'research',
      relativePath: 'Other.md',
    };
    const secondTarget: KnowledgeCurrentResourceTarget = {
      ...target,
      viewId: 'view-2',
      address: secondAddress,
      sourceName: 'Research',
    };
    act(() => {
      registry.getState().establishDocumentSession({
        address: secondAddress,
        buffer: '# Other',
        baseline: '# Other',
      });
      registry.getState().openDocumentView({
        viewId: secondTarget.viewId,
        address: secondAddress,
        groupId: secondTarget.groupId,
      });
    });
    const pending: Array<{
      resolve(result: RendererKnowledgeBacklinksResult): void;
      signal?: AbortSignal;
    }> = [];
    const querySavedBacklinks = vi.fn((
      _input: unknown,
      options?: { signal?: AbortSignal },
    ) => new Promise<RendererKnowledgeBacklinksResult>((resolve) => {
      pending.push({ resolve, signal: options?.signal });
    }));
    const client = createClient(querySavedBacklinks);
    const { rerender } = render(
      <KnowledgeCurrentResourceViews
        registry={registry}
        client={client}
        activeTarget={target}
        onRevealCurrent={vi.fn()}
        onOpenOutbound={vi.fn()}
        onOpenBacklink={vi.fn()}
      />,
    );
    await waitFor(() => expect(pending).toHaveLength(1));

    rerender(
      <KnowledgeCurrentResourceViews
        registry={registry}
        client={client}
        activeTarget={secondTarget}
        onRevealCurrent={vi.fn()}
        onOpenOutbound={vi.fn()}
        onOpenBacklink={vi.fn()}
      />,
    );
    expect(screen.queryByText('Draft')).not.toBeInTheDocument();
    expect(screen.getByText('Loading backlinks')).toBeVisible();
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[0]?.signal?.aborted).toBe(true);

    await act(async () => {
      pending[1]!.resolve({
        ...emptyBacklinks,
        sourceKey: 'research',
        generationId: 'research-generation',
        items: [{
          sourceAddress: {
            sourceKey: 'research',
            relativePath: 'Research Referrer.md',
          },
          ordinal: 0,
          linkKind: 'wikilink',
          fragment: null,
          fromOffset: 4,
          toOffset: 12,
        }],
      });
      pending[0]!.resolve({
        ...emptyBacklinks,
        items: [{
          sourceAddress: {
            sourceKey: 'main',
            relativePath: 'Stale Main Referrer.md',
          },
          ordinal: 0,
          linkKind: 'wikilink',
          fragment: null,
          fromOffset: 4,
          toOffset: 12,
        }],
      });
    });

    expect(await screen.findByRole('button', {
      name: 'Research Referrer.md',
    })).toBeVisible();
    expect(screen.queryByText('Stale Main Referrer.md')).not.toBeInTheDocument();
  });

  it('retries a transient saved-index failure without exposing details', async () => {
    const querySavedBacklinks = vi.fn()
      .mockRejectedValueOnce(new KnowledgeWorkspaceClientError({
        code: 'knowledge_index_unavailable',
        httpStatus: 503,
        retryable: true,
        details: { field: '/private/index.sqlite' },
      }))
      .mockResolvedValueOnce(emptyBacklinks);

    render(
      <KnowledgeCurrentResourceViews
        registry={createRegistry()}
        client={createClient(querySavedBacklinks)}
        activeTarget={target}
        onRevealCurrent={vi.fn()}
        onOpenOutbound={vi.fn()}
        onOpenBacklink={vi.fn()}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load backlinks',
    );
    expect(document.body).not.toHaveTextContent('/private/index.sqlite');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(querySavedBacklinks).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('No backlinks')).toBeVisible();
  });

  it('does not query an unavailable resource and renders permission failures safely', async () => {
    const cleanBuffer = '# Saved';
    const unavailableRegistry = createRegistry(cleanBuffer, cleanBuffer);
    act(() => {
      unavailableRegistry.getState().markDocumentResourceUnavailable(
        address,
        'source-unavailable',
      );
    });
    const unavailableQuery = vi.fn().mockResolvedValue(emptyBacklinks);
    const unavailableView = render(
      <KnowledgeCurrentResourceViews
        registry={unavailableRegistry}
        client={createClient(unavailableQuery)}
        activeTarget={target}
        onRevealCurrent={vi.fn()}
        onOpenOutbound={vi.fn()}
        onOpenBacklink={vi.fn()}
      />,
    );
    expect(unavailableQuery).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load backlinks',
    );
    unavailableView.unmount();

    const deniedQuery = vi.fn().mockRejectedValue(
      new KnowledgeWorkspaceClientError({
        code: 'knowledge_resource_out_of_scope',
        httpStatus: 403,
        retryable: false,
        details: { field: '/private/secret.md' },
      }),
    );
    const availableRegistry = createRegistry();
    render(
      <KnowledgeCurrentResourceViews
        registry={availableRegistry}
        client={createClient(deniedQuery)}
        activeTarget={target}
        onRevealCurrent={vi.fn()}
        onOpenOutbound={vi.fn()}
        onOpenBacklink={vi.fn()}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load backlinks',
    );
    expect(screen.queryByRole('button', { name: 'Retry' }))
      .not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('/private/secret.md');
  });
});
