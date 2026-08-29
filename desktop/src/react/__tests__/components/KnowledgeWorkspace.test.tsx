// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelTabBar } from '../../components/channels/ChannelTabBar';
import { KnowledgeWorkspace } from '../../components/knowledge-workspace/KnowledgeWorkspace';
import { useStore } from '../../stores';

vi.mock('../../components/DeskSection', () => ({
  DeskSection: () => <section data-testid="shared-desk-section" />,
}));

vi.mock('../../components/PreviewPanel', () => ({
  PreviewPanel: ({ variant }: { variant?: string }) => (
    <section data-testid="shared-preview-panel" data-variant={variant} />
  ),
}));

vi.mock('../../components/app/WorkspaceFileChangeBridge', () => ({
  WorkspaceFileChangeBridge: () => <span data-testid="shared-workspace-watch" />,
}));

describe('KnowledgeWorkspace', () => {
  beforeEach(() => {
    window.t = ((key: string) => ({
      'channel.chatTab': 'Chat',
      'channel.tab': 'Channels',
      'knowledge.tab': 'Knowledge',
      'knowledge.workspaceLabel': 'Knowledge workspace',
      'knowledge.tree.heading': 'Resource tree',
      'knowledge.editor.groupLabel': 'Editor group',
    })[key] ?? key) as typeof window.t;
    localStorage.clear();
    useStore.setState({
      currentTab: 'chat',
      locale: 'en',
      pluginPages: [],
      hiddenPluginTabs: [],
      tabOrder: [],
      previewOpen: false,
    } as never);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps Knowledge as a first-level workspace', () => {
    render(<ChannelTabBar />);

    fireEvent.click(screen.getByRole('button', { name: 'Knowledge' }));

    expect(useStore.getState().currentTab).toBe('knowledge');
    expect(localStorage.getItem('hana-tab')).toBe('knowledge');
  });

  it('uses the upstream Desk and Preview workbench as its only primary surface', () => {
    render(<KnowledgeWorkspace />);

    expect(screen.getByRole('main', { name: 'Knowledge workspace' }))
      .toHaveAttribute('data-shared-workbench');
    expect(screen.getByTestId('shared-desk-section')).toBeInTheDocument();
    expect(screen.getByTestId('shared-preview-panel')).toHaveAttribute('data-variant', 'workspace');
    expect(screen.getByTestId('shared-workspace-watch')).toBeInTheDocument();
    expect(useStore.getState().previewOpen).toBe(true);
  });
});
