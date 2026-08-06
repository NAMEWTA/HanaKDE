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
import type {
  KnowledgeSourceDto,
} from '../../../../../shared/knowledge-workspace-contract.ts';
import {
  KnowledgeSearch,
} from '../../components/knowledge-workspace/KnowledgeSearch';
import type {
  KnowledgeWorkspaceClient,
  RendererKnowledgeSearchResult,
} from '../../services/knowledge-workspace-client';

const sources: KnowledgeSourceDto[] = [
  {
    sourceKey: 'main',
    displayName: 'Main',
    role: 'main',
    capabilities: ['read'],
    availability: 'available',
  },
  {
    sourceKey: 'research',
    displayName: 'Research',
    role: 'mounted',
    capabilities: ['read'],
    availability: 'available',
  },
];

function result(): RendererKnowledgeSearchResult {
  return {
    query: 'alpha',
    scope: null,
    groups: [
      {
        state: 'ready',
        sourceKey: 'main',
        displayName: 'Main',
        generationId: 'main-generation',
        nextCursor: 'next-main',
        items: [{
          address: { sourceKey: 'main', relativePath: 'Notes/Alpha.md' },
          title: 'Alpha',
          kind: 'page',
          score: 120,
          snippets: [{ field: 'body', text: 'body #alpha' }],
        }],
      },
      {
        state: 'ready',
        sourceKey: 'research',
        displayName: 'Research',
        generationId: 'research-generation',
        nextCursor: null,
        items: [{
          address: {
            sourceKey: 'research',
            relativePath: 'Archive/Alpha.pdf',
          },
          title: 'Alpha paper',
          kind: 'pdf',
          score: 999,
          snippets: [{ field: 'path', text: 'Archive/Alpha.pdf' }],
        }],
      },
    ],
  };
}

function testClient(
  searchKnowledge: KnowledgeWorkspaceClient['searchKnowledge'],
): KnowledgeWorkspaceClient {
  return { searchKnowledge } as KnowledgeWorkspaceClient;
}

describe('KnowledgeSearch', () => {
  beforeEach(() => {
    const strings: Record<string, string> = {
      'knowledge.search.label': 'Search knowledge',
      'knowledge.search.input': 'Search query',
      'knowledge.search.placeholder': 'Search all saved knowledge',
      'knowledge.search.scope': 'Source: {source}',
      'knowledge.search.clearScope': 'Search all sources',
      'knowledge.search.submit': 'Search',
      'knowledge.search.loading': 'Searching',
      'knowledge.search.resultCount': '{count} results',
      'knowledge.search.error': 'Search unavailable',
      'knowledge.search.sourceError': '{source} failed',
      'knowledge.search.tag': 'Search tag #{tag} in {source}',
      'knowledge.search.more': 'More from {source}',
      'knowledge.retry': 'Retry',
    };
    window.t = ((key: string, vars?: Record<string, string | number>) => {
      let value = strings[key] ?? key;
      for (const [name, replacement] of Object.entries(vars ?? {})) {
        value = value.replaceAll(`{${name}}`, String(replacement));
      }
      return value;
    }) as typeof window.t;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders source groups in API order, opens saved resources, and pages one source', async () => {
    const searchKnowledge = vi.fn()
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce({
        ...result(),
        groups: [{
          ...result().groups[0],
          state: 'ready',
          nextCursor: null,
          items: [{
            address: { sourceKey: 'main', relativePath: 'Notes/Alpha-2.md' },
            title: 'Alpha 2',
            kind: 'page',
            score: 100,
            snippets: [],
          }],
        }, result().groups[1]],
      });
    const onOpen = vi.fn();
    render(
      <KnowledgeSearch
        client={testClient(searchKnowledge)}
        sources={sources}
        onOpen={onOpen}
      />,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search query' }), {
      target: { value: 'alpha' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    const groups = await screen.findAllByRole('heading', { level: 3 });
    expect(groups.map((heading) => heading.textContent)).toEqual([
      'Main',
      'Research',
    ]);
    expect(screen.queryByText('999')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Alpha paper/ }));
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        address: {
          sourceKey: 'research',
          relativePath: 'Archive/Alpha.pdf',
        },
      }),
      'Research',
    );

    fireEvent.click(screen.getByRole('button', { name: 'More from Main' }));
    expect(await screen.findByText('Alpha 2')).toBeInTheDocument();
    expect(searchKnowledge).toHaveBeenLastCalledWith({
      query: 'alpha',
      cursors: { main: 'next-main' },
    }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('supports Arrow navigation, Escape dismissal, ARIA status, and retry', async () => {
    const searchKnowledge = vi.fn()
      .mockResolvedValueOnce(result())
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(result());
    render(
      <KnowledgeSearch
        client={testClient(searchKnowledge)}
        sources={sources}
        onOpen={() => {}}
      />,
    );
    const searchbox = screen.getByRole('searchbox', { name: 'Search query' });
    fireEvent.change(searchbox, { target: { value: 'alpha' } });
    fireEvent.submit(searchbox.closest('form')!);
    const alpha = (await screen.findByText('Alpha')).closest('button')!;
    expect(screen.getByRole('status')).toHaveTextContent('2 results');

    searchbox.focus();
    fireEvent.keyDown(screen.getByRole('search'), { key: 'ArrowDown' });
    expect(alpha).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('search'), { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: /Alpha paper/ })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('search'), { key: 'Escape' });
    expect(screen.queryByText('Alpha paper')).not.toBeInTheDocument();

    fireEvent.submit(searchbox.closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Search unavailable',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Alpha paper')).toBeInTheDocument();
  });

  it('turns tag navigation into a visible non-editable source scope and can clear it', async () => {
    const searchKnowledge = vi.fn(async (input) => ({
      query: input.query,
      scope: input.scope ?? null,
      groups: [],
    }));
    const view = render(
      <KnowledgeSearch
        client={testClient(searchKnowledge)}
        sources={sources}
        onOpen={() => {}}
      />,
    );

    view.rerender(
      <KnowledgeSearch
        client={testClient(searchKnowledge)}
        sources={sources}
        tagNavigation={{ tag: 'alpha', sourceKey: 'research', revision: 1 }}
        onOpen={() => {}}
      />,
    );
    expect(await screen.findByText('Source: Research')).toHaveAttribute(
      'data-source-key',
      'research',
    );
    expect(screen.getByRole('searchbox')).toHaveValue('alpha');
    await waitFor(() => expect(searchKnowledge).toHaveBeenCalledWith({
      query: 'alpha',
      scope: { kind: 'tag', sourceKey: 'research' },
    }, expect.objectContaining({ signal: expect.any(AbortSignal) })));

    fireEvent.click(screen.getByRole('button', { name: 'Search all sources' }));
    expect(screen.queryByText('Source: Research')).not.toBeInTheDocument();
  });

  it('turns a body tag result into a prefilled source-locked search', async () => {
    const searchKnowledge = vi.fn(async () => result());
    render(
      <KnowledgeSearch
        client={testClient(searchKnowledge)}
        sources={sources}
        onOpen={() => {}}
      />,
    );
    const searchbox = screen.getByRole('searchbox');
    fireEvent.change(searchbox, { target: { value: 'body' } });
    fireEvent.submit(searchbox.closest('form')!);
    fireEvent.click(await screen.findByRole('button', {
      name: 'Search tag #alpha in Main',
    }));

    expect(screen.getByRole('searchbox')).toHaveValue('alpha');
    expect(await screen.findByText('Source: Main')).toHaveAttribute(
      'data-source-key',
      'main',
    );
    expect(searchKnowledge).toHaveBeenLastCalledWith({
      query: 'alpha',
      scope: { kind: 'tag', sourceKey: 'main' },
    }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('aborts an older request and ignores its late result', async () => {
    const pending: Array<{
      signal: AbortSignal | undefined;
      resolve(value: RendererKnowledgeSearchResult): void;
    }> = [];
    const searchKnowledge = vi.fn((_, options = {}) =>
      new Promise<RendererKnowledgeSearchResult>((resolve) => {
        pending.push({ signal: options.signal, resolve });
      })
    );
    render(
      <KnowledgeSearch
        client={testClient(searchKnowledge)}
        sources={sources}
        onOpen={() => {}}
      />,
    );
    const searchbox = screen.getByRole('searchbox');
    fireEvent.change(searchbox, { target: { value: 'first' } });
    fireEvent.submit(searchbox.closest('form')!);
    fireEvent.change(searchbox, { target: { value: 'second' } });
    fireEvent.submit(searchbox.closest('form')!);

    expect(pending[0]?.signal?.aborted).toBe(true);
    await act(async () => pending[0]?.resolve(result()));
    expect(screen.queryByText('Alpha paper')).not.toBeInTheDocument();
  });

  it('cancels a loading query when its text changes so the replacement can submit', async () => {
    const pending: Array<{
      signal: AbortSignal | undefined;
      resolve(value: RendererKnowledgeSearchResult): void;
    }> = [];
    const searchKnowledge = vi.fn((_, options = {}) =>
      new Promise<RendererKnowledgeSearchResult>((resolve) => {
        pending.push({ signal: options.signal, resolve });
      })
    );
    render(
      <KnowledgeSearch
        client={testClient(searchKnowledge)}
        sources={sources}
        onOpen={() => {}}
      />,
    );
    const searchbox = screen.getByRole('searchbox');
    const submit = screen.getByRole('button', { name: 'Search' });

    fireEvent.change(searchbox, { target: { value: 'first' } });
    fireEvent.click(submit);
    expect(submit).toBeDisabled();

    fireEvent.change(searchbox, { target: { value: 'second' } });
    expect(pending[0]?.signal?.aborted).toBe(true);
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(searchKnowledge).toHaveBeenLastCalledWith({ query: 'second' }, expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
  });
});
