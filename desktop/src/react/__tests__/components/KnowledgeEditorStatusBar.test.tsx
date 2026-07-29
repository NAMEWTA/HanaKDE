// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  KnowledgeEditorStatusBar,
  type KnowledgeEditorStatusTarget,
  calculateKnowledgeEditorStatus,
} from '../../components/knowledge-workspace/KnowledgeEditorStatusBar';
import {
  KnowledgeEditorGroups,
  type KnowledgeEditorGroupsHandle,
} from '../../components/knowledge-workspace/KnowledgeEditorGroups';
import {
  createMarkdownEditorCompartments,
  createMarkdownEditorExtensions,
} from '../../editor/create-markdown-editor-extensions';
import type {
  KnowledgeWorkspaceClient,
} from '../../services/knowledge-workspace-client';
import {
  createKnowledgeDocumentRegistry,
} from '../../stores/knowledge-document-registry';

const address = {
  sourceKey: 'main',
  relativePath: 'notes/status.md',
};

function interpolate(
  template: string,
  vars: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => (
    String(vars[key] ?? `{${key}}`)
  ));
}

describe('KnowledgeEditorStatusBar', () => {
  beforeEach(() => {
    window.t = ((key: string, vars?: Record<string, string | number>) => {
      const messages: Record<string, string> = {
        'knowledge.editor.status.label': 'Markdown editor position',
        'knowledge.editor.status.summary':
          'Line {line}, column {column} · {characters} characters',
      };
      return interpolate(messages[key] ?? key, vars);
    }) as typeof window.t;
  });

  afterEach(() => {
    cleanup();
  });

  function setup(buffer = 'first\nA😀B\nlast') {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner',
      windowId: 'status-test',
    });
    registry.getState().establishDocumentSession({ address, buffer });
    registry.getState().openDocumentView({
      viewId: 'view-1',
      address,
      groupId: 'group-1',
    });
    return registry;
  }

  it('shows the active selection head as a real source line and column', () => {
    const registry = setup();
    act(() => {
      registry.getState().updateDocumentView('view-1', {
        cursor: 9,
        selection: { anchor: 12, head: 9 },
      });
    });

    render(
      <KnowledgeEditorStatusBar
        registry={registry}
        activeTarget={{ viewId: 'view-1', kind: 'markdown' }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Line 2, column 4 · 14 characters',
    );
  });

  it('tracks unsaved source and counts Unicode code points rather than UTF-16 units', () => {
    const registry = setup('a😀');
    const { container } = render(
      <KnowledgeEditorStatusBar
        registry={registry}
        activeTarget={{ viewId: 'view-1', kind: 'markdown' }}
      />,
    );

    expect(container.querySelector(
      '[data-knowledge-editor-status-summary]',
    )).toHaveTextContent('Line 1, column 1 · 2 characters');

    act(() => {
      registry.getState().replaceDocumentBuffer('view-1', 'a😀\n四', {
        cursor: 5,
        selection: { anchor: 5, head: 5 },
      });
    });
    expect(container.querySelector(
      '[data-knowledge-editor-status-summary]',
    )).toHaveTextContent('Line 2, column 2 · 4 characters');
  });

  it('keeps one empty fixed bar for assets and unavailable Markdown', () => {
    const registry = setup();
    const { container, rerender } = render(
      <KnowledgeEditorStatusBar
        registry={registry}
        activeTarget={{ viewId: 'asset-1', kind: 'asset' }}
      />,
    );
    const bar = container.querySelector(
      '[data-knowledge-editor-status-bar]',
    );
    expect(bar).toBeInTheDocument();
    expect(bar).toBeEmptyDOMElement();

    act(() => {
      registry.getState().markDocumentResourceUnavailable(
        address,
        'source-unavailable',
      );
    });
    rerender(
      <KnowledgeEditorStatusBar
        registry={registry}
        activeTarget={{ viewId: 'view-1', kind: 'markdown' }}
      />,
    );
    expect(bar).toBeEmptyDOMElement();
  });

  it('is read-only text with no navigation, menu, or state controls', () => {
    const registry = setup();
    const { container } = render(
      <KnowledgeEditorStatusBar
        registry={registry}
        activeTarget={{ viewId: 'view-1', kind: 'markdown' }}
      />,
    );

    expect(container.querySelectorAll(
      'button, a, input, select, textarea, [tabindex]',
    )).toHaveLength(0);
    expect(container.textContent).not.toMatch(
      /save|saving|dirty|conflict|offline/i,
    );
  });

  it('returns no projection without a usable Markdown session', () => {
    expect(calculateKnowledgeEditorStatus(undefined, undefined)).toBeNull();
  });

  it('soft-wraps without a line gutter and navigates by logical source lines', () => {
    const parent = document.body.appendChild(document.createElement('div'));
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: '012345\nx\nabcdef',
        selection: EditorSelection.cursor(5),
        extensions: createMarkdownEditorExtensions({
          mode: 'markdown',
          markdownDisplayMode: 'source',
          readOnly: false,
          compartments: createMarkdownEditorCompartments(),
          imageContext: {},
          observeExtension: [],
          onOpenBlockMenu: () => undefined,
        }),
      }),
    });

    expect(view.contentDOM).toHaveClass('cm-lineWrapping');
    expect(parent.querySelector('.cm-gutters')).not.toBeInTheDocument();
    fireEvent.keyDown(view.contentDOM, { key: 'ArrowDown' });
    expect(view.state.selection.main.head).toBe(8);
    fireEvent.keyDown(view.contentDOM, { key: 'ArrowDown', shiftKey: true });
    expect(view.state.selection.main).toMatchObject({
      anchor: 8,
      head: 10,
    });
    fireEvent.keyDown(view.contentDOM, { key: 'Home' });
    expect(view.state.selection.main.head).toBe(9);
    fireEvent.keyDown(view.contentDOM, { key: 'End', shiftKey: true });
    expect(view.state.selection.main).toMatchObject({
      anchor: 9,
      head: 15,
    });

    view.destroy();
    parent.remove();
  });

  it('follows the active editor group and retains it when sidebar focus changes', async () => {
    const registry = setup('alpha');
    const secondAddress = {
      sourceKey: 'main',
      relativePath: 'notes/second.md',
    };
    registry.getState().establishDocumentSession({
      address: secondAddress,
      buffer: 'one\ntwo',
    });
    const controller = createRef<KnowledgeEditorGroupsHandle>();

    function Integration() {
      const [target, setTarget] =
        useState<KnowledgeEditorStatusTarget | null>(null);
      return (
        <>
          <button type="button">Sidebar target</button>
          <KnowledgeEditorGroups
            ref={controller}
            registry={registry}
            client={{} as KnowledgeWorkspaceClient}
            workspaceKey="status-integration"
            sources={[{
              sourceKey: 'main',
              displayName: 'Main',
              role: 'main',
              capabilities: ['read', 'write', 'watch'],
              availability: 'available',
            }]}
            conflictServices={{
              watchSource: () => () => undefined,
              subscribeToChanges: () => () => undefined,
            }}
            onActiveTargetChange={setTarget}
          />
          <KnowledgeEditorStatusBar
            registry={registry}
            activeTarget={target}
          />
        </>
      );
    }

    render(<Integration />);
    act(() => {
      controller.current?.openResource({
        address,
        sourceName: 'Main',
        kind: 'markdown',
      }, { mode: 'pinned' });
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(
      'Line 1, column 1 · 5 characters',
    ));

    let secondViewId = '';
    act(() => {
      secondViewId = controller.current?.openInSide({
        address: secondAddress,
        sourceName: 'Main',
        kind: 'markdown',
      }).viewId ?? '';
    });
    await waitFor(() => expect(
      registry.getState().views[secondViewId],
    ).toBeDefined());
    act(() => {
      registry.getState().updateDocumentView(secondViewId, {
        cursor: 7,
        selection: { anchor: 7, head: 7 },
      });
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Line 2, column 4 · 7 characters',
    );

    const groups = screen.getAllByRole('group');
    fireEvent.focus(groups[0]);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(
      'Line 1, column 1 · 5 characters',
    ));
    fireEvent.focus(screen.getByRole('button', { name: 'Sidebar target' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Line 1, column 1 · 5 characters',
    );
  });

  it('keeps the status row fixed and hides the whole summary at narrow widths', () => {
    const css = fs.readFileSync(path.join(
      process.cwd(),
      'desktop/src/react/components/knowledge-workspace/KnowledgeWorkspace.module.css',
    ), 'utf8');
    expect(css).toContain('grid-area: status');
    expect(css).toContain('height: 1.75rem');
    expect(css).toMatch(
      /@container knowledge-editor-status \(max-width: 22rem\)[\s\S]*?\.knowledgeEditorStatusGroup[\s\S]*?display: none/,
    );
    expect(css).not.toMatch(
      /\.knowledgeEditorStatusGroup\s*\{[^}]*text-overflow:\s*ellipsis/,
    );
  });
});
