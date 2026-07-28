// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  KnowledgeSourceDto,
} from '../../../../../shared/knowledge-workspace-contract.ts';
import {
  KnowledgeWorkspaceClientError,
  type KnowledgeWorkspaceClient,
} from '../../services/knowledge-workspace-client';
import { useStore } from '../../stores';
import { KnowledgeWorkspace } from '../../components/knowledge-workspace/KnowledgeWorkspace';
import { ChannelTabBar } from '../../components/channels/ChannelTabBar';

const mainSource: KnowledgeSourceDto = {
  sourceKey: 'main',
  displayName: 'Main workspace',
  role: 'main',
  capabilities: ['stat', 'read', 'list', 'watch'],
  availability: 'available',
};

function clientWithListSources(
  listSources: KnowledgeWorkspaceClient['listSources'],
): KnowledgeWorkspaceClient {
  return {
    listSources,
  } as KnowledgeWorkspaceClient;
}

describe('KnowledgeWorkspace', () => {
  beforeEach(() => {
    window.t = ((key: string) => ({
      'channel.chatTab': 'Chat',
      'channel.tab': 'Channels',
      'knowledge.tab': 'Knowledge',
      'knowledge.workspaceLabel': 'Knowledge workspace',
      'knowledge.sources.heading': 'Sources',
      'knowledge.source.main': 'Main',
      'knowledge.tree.heading': 'Resource tree',
      'knowledge.tree.empty': 'No resources opened',
      'knowledge.editor.groupLabel': 'Editor group',
      'knowledge.editor.emptyTitle': 'Open a resource',
      'knowledge.editor.emptyDescription': 'Choose a resource from the tree.',
      'knowledge.sources.error': 'Sources unavailable',
      'knowledge.retry': 'Retry',
    })[key] ?? key) as typeof window.t;
    vi.stubGlobal('t', window.t);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    localStorage.clear();
    useStore.getState().openKnowledgeWorkspace('previous-workspace');
    useStore.setState({
      currentTab: 'chat',
      locale: 'en',
      pluginPages: [],
      hiddenPluginTabs: [],
      tabOrder: [],
      knowledgeSources: [{
        ...mainSource,
        sourceKey: 'old-mount',
        role: 'mounted',
        displayName: 'Restored mount must disappear',
      }],
      knowledgeExpandedPathsBySource: { main: ['restored/folder'] },
      knowledgeOpenResourceKeys: ['main:restored.md'],
      knowledgeActiveResourceKey: 'main:restored.md',
    } as never);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('exposes Knowledge as a fixed first-level entry beside Chat and Channels', () => {
    render(<ChannelTabBar />);

    const chat = screen.getByRole('button', { name: 'Chat' });
    const knowledge = screen.getByRole('button', { name: 'Knowledge' });
    const channels = screen.getByRole('button', { name: 'Channels' });
    expect(
      chat.compareDocumentPosition(knowledge) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      knowledge.compareDocumentPosition(channels) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(knowledge);

    expect(useStore.getState().currentTab).toBe('knowledge');
    expect(localStorage.getItem('hana-tab')).toBe('knowledge');
  });

  it('opens a fresh main-only shell with source, tree and one empty editor group', async () => {
    const listSources = vi.fn(async () => [mainSource]);
    render(
      <KnowledgeWorkspace
        client={clientWithListSources(listSources)}
        workspaceKey="workspace-session-15"
      />,
    );

    expect(
      screen.getByRole('main', { name: 'Knowledge workspace' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Sources' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tree', { name: 'Resource tree' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Editor group' }),
    ).toHaveAttribute('tabindex', '0');
    expect(screen.getByText('Open a resource')).toBeInTheDocument();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);

    await waitFor(() => expect(listSources).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Main workspace')).toBeInTheDocument();
    expect(screen.queryByText('Restored mount must disappear')).not.toBeInTheDocument();
    expect(useStore.getState()).toMatchObject({
      knowledgeWorkspaceKey: 'workspace-session-15',
      knowledgeExpandedPathsBySource: {},
      knowledgeOpenResourceKeys: [],
      knowledgeActiveResourceKey: null,
      knowledgeSourcesStatus: 'ready',
    });
  });

  it('keeps the main shell usable while loading fails and retries through the same public client', async () => {
    const unavailable = new KnowledgeWorkspaceClientError({
      code: 'knowledge_resource_unavailable',
      httpStatus: 503,
      retryable: true,
    });
    const listSources = vi.fn()
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValueOnce([mainSource]);

    render(
      <KnowledgeWorkspace
        client={clientWithListSources(listSources)}
        workspaceKey="workspace-session-error"
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Sources unavailable');
    expect(screen.getByText('Main')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Editor group' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    });

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText('Main workspace')).toBeInTheDocument();
    });
    expect(listSources).toHaveBeenCalledTimes(2);
  });

  it('aborts an in-flight source request when the full view unmounts', async () => {
    let observedSignal: AbortSignal | undefined;
    const listSources = vi.fn(({ signal } = {}) => {
      observedSignal = signal;
      return new Promise<KnowledgeSourceDto[]>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });
    const view = render(
      <KnowledgeWorkspace
        client={clientWithListSources(listSources)}
        workspaceKey="workspace-session-cancel"
      />,
    );

    await waitFor(() => expect(observedSignal).toBeDefined());
    view.unmount();

    expect(observedSignal?.aborted).toBe(true);
    expect(useStore.getState().knowledgeSourcesErrorCode).toBeNull();
  });
});
