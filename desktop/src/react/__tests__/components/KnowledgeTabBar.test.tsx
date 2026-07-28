// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KnowledgeTabBar,
  type KnowledgeEditorTab,
} from '../../components/knowledge-workspace/KnowledgeTabBar';

const tabs: KnowledgeEditorTab[] = [
  {
    viewId: 'view-a',
    address: { sourceKey: 'main', relativePath: 'notes/A.md' },
    sourceName: 'Main workspace',
    kind: 'markdown',
    preview: true,
  },
  {
    viewId: 'view-b',
    address: { sourceKey: 'main', relativePath: 'notes/archive.tar.gz' },
    sourceName: 'Main workspace',
    kind: 'asset',
    preview: false,
  },
];

describe('KnowledgeTabBar', () => {
  beforeEach(() => {
    window.t = ((key: string, vars?: Record<string, string | number>) => ({
      'knowledge.tabs.label': 'Open resources',
      'knowledge.tabs.preview': `Preview ${vars?.name}`,
      'knowledge.tabs.close': `Close ${vars?.name}`,
      'knowledge.tabs.openSide': `Open ${vars?.name} to the side`,
      'knowledge.breadcrumb.label': 'Resource location',
    })[key] ?? key) as typeof window.t;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows complete filenames and exposes one selected tab with preview semantics', () => {
    render(
      <KnowledgeTabBar
        tabs={tabs}
        activeViewId="view-a"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onOpenSide={vi.fn()}
        onPin={vi.fn()}
        onLocateResource={vi.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Preview A.md' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'archive.tar.gz' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByRole('tab', { name: 'Preview A.md' })).toHaveAttribute(
      'data-preview',
      'true',
    );
  });

  it('supports keyboard tab activation, explicit pinning, close and side-open actions', () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();
    const onOpenSide = vi.fn();
    const onPin = vi.fn();
    render(
      <KnowledgeTabBar
        tabs={tabs}
        activeViewId="view-a"
        onActivate={onActivate}
        onClose={onClose}
        onOpenSide={onOpenSide}
        onPin={onPin}
        onLocateResource={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Preview A.md' }), {
      key: 'ArrowRight',
    });
    expect(onActivate).toHaveBeenCalledWith('view-b');

    fireEvent.doubleClick(screen.getByRole('tab', { name: 'Preview A.md' }));
    expect(onPin).toHaveBeenCalledWith('view-a');

    fireEvent.click(screen.getByRole('button', { name: 'Close A.md' }));
    expect(onClose).toHaveBeenCalledWith('view-a');

    fireEvent.click(
      screen.getByRole('button', { name: 'Open A.md to the side' }),
    );
    expect(onOpenSide).toHaveBeenCalledWith('view-a');
  });

  it('renders source-relative breadcrumbs and locates only on an explicit segment click', () => {
    const onLocateResource = vi.fn();
    render(
      <KnowledgeTabBar
        tabs={tabs}
        activeViewId="view-a"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onOpenSide={vi.fn()}
        onPin={vi.fn()}
        onLocateResource={onLocateResource}
      />,
    );

    expect(screen.getByLabelText('Resource location')).toHaveTextContent(
      'Main workspace',
    );
    expect(screen.getByLabelText('Resource location')).toHaveTextContent('notes');
    expect(screen.getByLabelText('Resource location')).toHaveTextContent('A.md');
    expect(screen.queryByText(/Users|Documents/)).not.toBeInTheDocument();
    expect(onLocateResource).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'notes' }));
    expect(onLocateResource).toHaveBeenCalledWith({
      kind: 'folder',
      sourceKey: 'main',
      relativePath: 'notes',
    });
    fireEvent.click(screen.getByRole('button', { name: 'A.md' }));
    expect(onLocateResource).toHaveBeenLastCalledWith({
      kind: 'resource',
      sourceKey: 'main',
      relativePath: 'notes/A.md',
    });
  });
});
