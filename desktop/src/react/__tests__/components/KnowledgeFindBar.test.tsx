// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { history, undo } from '@codemirror/commands';
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
import { createRef } from 'react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock('../../services/resource-events', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../services/resource-events')
  >();
  return {
    ...actual,
    retainKnowledgeSourceWatch: () => () => undefined,
  };
});
import {
  KnowledgeFindBar,
  type KnowledgeFindBarProps,
} from '../../components/knowledge-workspace/KnowledgeFindBar';
import {
  KnowledgeEditorGroups,
  type KnowledgeEditorGroupsHandle,
  type KnowledgeOpenResource,
} from '../../components/knowledge-workspace/KnowledgeEditorGroups';
import {
  createMarkdownEditorCompartments,
  createMarkdownEditorExtensions,
} from '../../editor/create-markdown-editor-extensions';
import {
  findKnowledgeMatches,
  initialKnowledgeFindQuery,
  knowledgeFindHighlightExtension,
} from '../../editor/knowledge-find-state';
import type {
  KnowledgeWorkspaceClient,
} from '../../services/knowledge-workspace-client';
import {
  createKnowledgeDocumentRegistry,
  knowledgeDocumentKey,
} from '../../stores/knowledge-document-registry';
import type {
  KnowledgeResourceAddress,
} from '../../../../../shared/knowledge-workspace-contract.ts';

const labels: Record<string, string> = {
  'knowledge.find.label': 'Find and replace',
  'knowledge.find.query': 'Find',
  'knowledge.find.replacement': 'Replace with',
  'knowledge.find.matchCase': 'Match case',
  'knowledge.find.wholeWord': 'Match whole word',
  'knowledge.find.previous': 'Previous match',
  'knowledge.find.next': 'Next match',
  'knowledge.find.replace': 'Replace current match',
  'knowledge.find.replaceAll': 'Replace all matches',
  'knowledge.find.expandReplace': 'Show replace controls',
  'knowledge.find.collapseReplace': 'Hide replace controls',
  'knowledge.find.close': 'Close find and replace',
};

const views: EditorView[] = [];
const integrationDocuments = new Map([
  ['notes/A.md', 'alpha one alpha'],
  ['notes/B.md', 'beta alpha beta'],
  ['notes/C.md', 'gamma'],
  ['assets/picture.png', 'png'],
]);

function base64(value: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(value)));
}

function integrationClient(): KnowledgeWorkspaceClient {
  return {
    resources: {
      stat: vi.fn(async (address: KnowledgeResourceAddress) => {
        const content = integrationDocuments.get(address.relativePath) ?? '';
        return {
          exists: true,
          isDirectory: false,
          version: {
            etag: `etag:${address.relativePath}`,
            size: content.length,
          },
        };
      }),
      read: vi.fn(async (address: KnowledgeResourceAddress) => ({
        content: base64(
          integrationDocuments.get(address.relativePath) ?? '',
        ),
        encoding: 'base64' as const,
        version: {
          etag: `etag:${address.relativePath}`,
          size: (
            integrationDocuments.get(address.relativePath) ?? ''
          ).length,
        },
      })),
      writeExpectedVersion: vi.fn(async () => ({
        ok: true as const,
        version: { etag: 'saved', size: 1 },
      })),
    },
  } as unknown as KnowledgeWorkspaceClient;
}

function integrationResource(
  relativePath: string,
  kind: 'markdown' | 'asset' = 'markdown',
): KnowledgeOpenResource {
  return {
    address: { sourceKey: 'main', relativePath },
    sourceName: 'Main',
    kind,
  };
}

function createView(
  doc: string,
  selection: EditorSelection | ReturnType<typeof EditorSelection.cursor> =
    EditorSelection.cursor(0),
): EditorView {
  const parent = document.body.appendChild(document.createElement('div'));
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: 'ranges' in selection
        ? selection
        : EditorSelection.create([selection]),
      extensions: [
        history(),
        knowledgeFindHighlightExtension,
      ],
    }),
  });
  views.push(view);
  return view;
}

function renderBar(
  view: EditorView,
  overrides: Partial<KnowledgeFindBarProps> = {},
) {
  const props: KnowledgeFindBarProps = {
    editorView: view,
    command: 'find',
    commandRevision: 1,
    documentRevision: 0,
    initialQuery: '',
    onClose: vi.fn(),
    ...overrides,
  };
  const result = render(<KnowledgeFindBar {...props} />);
  return {
    ...result,
    props,
    rerenderBar(next: Partial<KnowledgeFindBarProps>) {
      Object.assign(props, next);
      result.rerender(<KnowledgeFindBar {...props} />);
    },
  };
}

describe('KnowledgeFindBar', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.t = ((key: string) => labels[key] ?? key) as typeof window.t;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => (
      window.setTimeout(() => callback(0), 0)
    ));
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      window.clearTimeout(handle);
    });
    Range.prototype.getClientRects = vi.fn(
      () => [] as unknown as DOMRectList,
    );
    Range.prototype.getBoundingClientRect = vi.fn(
      () => ({
        x: 0,
        y: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      }) as DOMRect,
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        x: 0,
        y: 0,
        top: 0,
        right: 800,
        bottom: 600,
        left: 0,
        width: 800,
        height: 600,
        toJSON: () => ({}),
      } as DOMRect);
  });

  afterEach(() => {
    cleanup();
    while (views.length > 0) views.pop()?.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('uses literal Unicode-aware case and whole-word options without regex mode', () => {
    const state = EditorState.create({
      doc: 'Cat cat scatter .*[x] Cät cät',
    });
    expect(findKnowledgeMatches(state, {
      query: 'cat',
      caseSensitive: false,
      wholeWord: false,
    })).toHaveLength(3);
    expect(findKnowledgeMatches(state, {
      query: 'cat',
      caseSensitive: false,
      wholeWord: true,
    })).toHaveLength(2);
    expect(findKnowledgeMatches(state, {
      query: 'Cat',
      caseSensitive: true,
      wholeWord: true,
    })).toHaveLength(1);
    expect(findKnowledgeMatches(state, {
      query: 'cät',
      caseSensitive: false,
      wholeWord: true,
    })).toHaveLength(2);
    expect(findKnowledgeMatches(state, {
      query: '.*[x]',
      caseSensitive: false,
      wholeWord: false,
    })).toEqual([{ from: 16, to: 21 }]);
    expect(findKnowledgeMatches(state, {
      query: '',
      caseSensitive: false,
      wholeWord: false,
    })).toEqual([]);
  });

  it('initializes from a single-line source selection and searches concealed syntax', () => {
    const doc = '**needle** [label](needle)';
    const selectedFrom = doc.indexOf('needle');
    const view = createView(
      doc,
      EditorSelection.single(selectedFrom, selectedFrom + 6),
    );
    renderBar(view, { initialQuery: 'needle' });

    expect(screen.getByRole('textbox', { name: 'Find' })).toHaveValue('needle');
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(view.state.selection.main).toMatchObject({
      from: selectedFrom,
      to: selectedFrom + 6,
    });
  });

  it('rejects a real multiline selection as an initial query', () => {
    const view = createView(
      'first\nsecond',
      EditorSelection.single(0, 'first\nsecond'.length),
    );
    expect(initialKnowledgeFindQuery(view)).toBe('');
    view.dispatch({
      selection: EditorSelection.single(0, 'first'.length),
    });
    expect(initialKnowledgeFindQuery(view)).toBe('first');
    view.dispatch({ selection: EditorSelection.cursor(3) });
    expect(initialKnowledgeFindQuery(view)).toBe('');
  });

  it('starts at the cursor, wraps previous and next, and keeps a unique match selected', () => {
    const view = createView('one xx one yy one', EditorSelection.cursor(5));
    renderBar(view, { initialQuery: 'one' });

    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous match' }));
    expect(screen.getByText('3 / 3')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Find' }), {
      target: { value: 'xx' },
    });
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    const before = view.state.selection.main;
    fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
    expect(view.state.selection.main).toEqual(before);
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
  });

  it('recomputes the shared set for explicit case and whole-word toggles', () => {
    const view = createView('Cat cat scatter');
    renderBar(view, { initialQuery: 'cat' });
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Match whole word' }));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Match case' }));
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(view.state.sliceDoc(
      view.state.selection.main.from,
      view.state.selection.main.to,
    )).toBe('cat');
  });

  it('uses Enter directions in find and the same replace action for both replacement Enter variants', () => {
    const view = createView('one one one');
    renderBar(view, {
      command: 'replace',
      initialQuery: 'one',
    });
    const find = screen.getByRole('textbox', { name: 'Find' });
    fireEvent.keyDown(find, { key: 'Enter' });
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    fireEvent.keyDown(find, { key: 'Enter', shiftKey: true });
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    const replace = screen.getByRole('textbox', { name: 'Replace with' });
    fireEvent.change(replace, { target: { value: 'two' } });
    fireEvent.keyDown(replace, { key: 'Enter', shiftKey: true });
    expect(view.state.doc.toString()).toBe('two one one');
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.keyDown(replace, { key: 'Enter' });
    expect(view.state.doc.toString()).toBe('two two one');
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
  });

  it('expands with Mod-H, preserves find state, and Mod-F never collapses replace', async () => {
    const view = createView('alpha beta alpha');
    const result = renderBar(view);
    fireEvent.change(screen.getByRole('textbox', { name: 'Find' }), {
      target: { value: 'alpha' },
    });
    fireEvent.click(screen.getByRole('button', {
      name: 'Show replace controls',
    }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Replace with' }), {
      target: { value: 'omega' },
    });

    result.rerenderBar({ command: 'find', commandRevision: 2 });
    expect(screen.getByRole('textbox', { name: 'Find' })).toHaveValue('alpha');
    expect(screen.getByRole('textbox', { name: 'Replace with' }))
      .toHaveValue('omega');

    result.rerenderBar({ command: 'replace', commandRevision: 3 });
    expect(screen.getByRole('textbox', { name: 'Find' })).toHaveValue('alpha');
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Replace with' }))
        .toHaveFocus();
    });
  });

  it('replaces one literal match, selects the next, and participates in undo', () => {
    const view = createView('foo foo');
    renderBar(view, {
      command: 'replace',
      initialQuery: 'foo',
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Replace with' }), {
      target: { value: '$1\\1' },
    });
    fireEvent.click(screen.getByRole('button', {
      name: 'Replace current match',
    }));

    expect(view.state.doc.toString()).toBe('$1\\1 foo');
    expect(view.state.sliceDoc(
      view.state.selection.main.from,
      view.state.selection.main.to,
    )).toBe('foo');
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('foo foo');
  });

  it('advances by match start after the replaced range', () => {
    const view = createView('aa aa');
    renderBar(view, {
      command: 'replace',
      initialQuery: 'aa',
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Replace with' }), {
      target: { value: 'a' },
    });
    fireEvent.click(screen.getByRole('button', {
      name: 'Replace current match',
    }));

    expect(view.state.doc.toString()).toBe('a aa');
    expect(view.state.selection.main.from).toBe(2);
    expect(view.state.sliceDoc(
      view.state.selection.main.from,
      view.state.selection.main.to,
    )).toBe('aa');
  });

  it('replaces a stable pre-command snapshot in one undo transaction', () => {
    const view = createView('a a');
    renderBar(view, {
      command: 'replace',
      initialQuery: 'a',
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Replace with' }), {
      target: { value: 'aa' },
    });
    fireEvent.click(screen.getByRole('button', {
      name: 'Replace all matches',
    }));

    expect(view.state.doc.toString()).toBe('aa aa');
    expect(screen.getByText(/\/ 4$/)).toBeInTheDocument();
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('a a');
    expect(undo(view)).toBe(false);
  });

  it('keeps empty and no-match controls enabled as harmless operations', () => {
    const view = createView('alpha');
    renderBar(view, { command: 'replace' });
    const before = view.state.doc.toString();

    for (const name of [
      'Previous match',
      'Next match',
      'Replace current match',
      'Replace all matches',
    ]) {
      const button = screen.getByRole('button', { name });
      expect(button).not.toBeDisabled();
      fireEvent.click(button);
    }
    expect(screen.getByText('0 / 0')).toBeInTheDocument();
    expect(view.state.doc.toString()).toBe(before);

    fireEvent.change(screen.getByRole('textbox', { name: 'Find' }), {
      target: { value: 'missing' },
    });
    fireEvent.click(screen.getByRole('button', {
      name: 'Replace all matches',
    }));
    expect(view.state.doc.toString()).toBe(before);
  });

  it('keeps replace commands harmless for a read-only Markdown view', () => {
    const parent = document.body.appendChild(document.createElement('div'));
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'alpha alpha',
        extensions: [
          EditorState.readOnly.of(true),
          knowledgeFindHighlightExtension,
        ],
      }),
    });
    views.push(view);
    renderBar(view, {
      command: 'replace',
      initialQuery: 'alpha',
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Replace with' }), {
      target: { value: 'omega' },
    });
    fireEvent.click(screen.getByRole('button', {
      name: 'Replace current match',
    }));
    fireEvent.click(screen.getByRole('button', {
      name: 'Replace all matches',
    }));
    expect(view.state.doc.toString()).toBe('alpha alpha');
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('highlights every source match, distinguishes current, and recomputes edits', async () => {
    const view = createView('red red red');
    const result = renderBar(view, { initialQuery: 'red' });
    expect(view.dom.querySelectorAll('.cm-knowledge-find-match')).toHaveLength(3);
    expect(view.dom.querySelectorAll('.cm-knowledge-find-match-current'))
      .toHaveLength(1);

    act(() => {
      view.dispatch({ changes: { from: 0, to: 4, insert: '' } });
    });
    result.rerenderBar({ documentRevision: 1 });
    await waitFor(() => {
      expect(screen.getByText('1 / 2')).toBeInTheDocument();
      expect(view.dom.querySelectorAll('.cm-knowledge-find-match'))
        .toHaveLength(2);
    });
  });

  it('closes by Escape or button, clears special highlights, and restores editor focus', async () => {
    const view = createView('alpha alpha');
    const onClose = vi.fn();
    const first = renderBar(view, { initialQuery: 'alpha', onClose });
    expect(view.dom.querySelectorAll('.cm-knowledge-find-match')).toHaveLength(2);

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Find' }), {
      key: 'Escape',
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(view.dom.querySelector('.cm-knowledge-find-match')).toBeNull();
    await waitFor(() => expect(view.hasFocus).toBe(true));

    first.unmount();
    const secondClose = vi.fn();
    renderBar(view, { initialQuery: 'alpha', onClose: secondClose });
    fireEvent.click(screen.getByRole('button', {
      name: 'Close find and replace',
    }));
    expect(secondClose).toHaveBeenCalledOnce();
    expect(view.dom.querySelector('.cm-knowledge-find-match')).toBeNull();
  });

  it('traps focus in the fixed visible control order and keeps inputs ephemeral', () => {
    const view = createView('alpha');
    renderBar(view, {
      command: 'replace',
      initialQuery: 'alpha',
    });
    const controls = [
      screen.getByRole('button', { name: 'Hide replace controls' }),
      screen.getByRole('textbox', { name: 'Find' }),
      screen.getByRole('button', { name: 'Match case' }),
      screen.getByRole('button', { name: 'Match whole word' }),
      screen.getByRole('button', { name: 'Previous match' }),
      screen.getByRole('button', { name: 'Next match' }),
      screen.getByRole('textbox', { name: 'Replace with' }),
      screen.getByRole('button', { name: 'Replace current match' }),
      screen.getByRole('button', { name: 'Replace all matches' }),
      screen.getByRole('button', { name: 'Close find and replace' }),
    ];
    expect(controls[1]).toHaveAttribute('autocomplete', 'off');
    expect(controls[6]).toHaveAttribute('autocomplete', 'off');

    controls[0].focus();
    for (let index = 1; index < controls.length; index += 1) {
      fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
      expect(controls[index]).toHaveFocus();
    }
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(controls[0]).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, {
      key: 'Tab',
      shiftKey: true,
    });
    expect(controls.at(-1)).toHaveFocus();
  });

  it('registers only Mod-F and Mod-H find shortcuts on the Markdown surface', () => {
    const requests: string[] = [];
    const parent = document.body.appendChild(document.createElement('div'));
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'source',
        extensions: createMarkdownEditorExtensions({
          mode: 'markdown',
          markdownDisplayMode: 'source',
          readOnly: true,
          compartments: createMarkdownEditorCompartments(),
          imageContext: {},
          observeExtension: [],
          onOpenBlockMenu: () => undefined,
          knowledgeFind: {
            onRequest: command => requests.push(command),
          },
        }),
      }),
    });
    views.push(view);

    fireEvent.keyDown(view.contentDOM, { key: 'f', ctrlKey: true });
    fireEvent.keyDown(view.contentDOM, { key: 'h', ctrlKey: true });
    fireEvent.keyDown(view.contentDOM, { key: 'F3' });
    fireEvent.keyDown(view.contentDOM, { key: 'F3', shiftKey: true });
    expect(requests).toEqual(['find', 'replace']);
  });

  it('keeps one group-owned query across Markdown tabs and closes it across groups or assets', async () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner',
      windowId: 'find-integration',
    });
    const controller = createRef<KnowledgeEditorGroupsHandle>();
    render(
      <KnowledgeEditorGroups
        ref={controller}
        registry={registry}
        client={integrationClient()}
        workspaceKey="find-workspace"
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
      />,
    );

    let first = { viewId: '', groupId: '', reused: false };
    let second = first;
    act(() => {
      first = controller.current!.openResource(
        integrationResource('notes/A.md'),
        { mode: 'pinned' },
      );
      second = controller.current!.openResource(
        integrationResource('notes/B.md'),
        { mode: 'pinned' },
      );
      controller.current!.activateView(first.viewId);
    });
    await waitFor(() => {
      expect(document.querySelector(
        `#knowledge-panel-${first.viewId} .cm-content`,
      )).toBeInTheDocument();
    });

    const firstEditor = document.querySelector<HTMLElement>(
      `#knowledge-panel-${first.viewId} .cm-content`,
    )!;
    firstEditor.focus();
    fireEvent.keyDown(firstEditor, { key: 'f', ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByRole('search', { name: 'Find and replace' }))
        .toBeInTheDocument();
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Find' }), {
      target: { value: 'alpha' },
    });
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    act(() => {
      controller.current!.activateView(second.viewId);
    });
    await waitFor(() => {
      expect(document.querySelector(
        `#knowledge-panel-${second.viewId} .cm-content`,
      )).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Find' }))
        .toHaveValue('alpha');
      expect(screen.getByText('1 / 1')).toBeInTheDocument();
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Find' }), {
      key: 'h',
      ctrlKey: true,
    });
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Replace with' }))
        .toBeInTheDocument();
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Replace with' }), {
      target: { value: 'omega' },
    });
    fireEvent.click(screen.getByRole('button', {
      name: 'Replace current match',
    }));
    expect(registry.getState().sessions[
      knowledgeDocumentKey(integrationResource('notes/A.md').address)
    ]?.buffer).toBe('alpha one alpha');
    expect(registry.getState().sessions[
      knowledgeDocumentKey(integrationResource('notes/B.md').address)
    ]?.buffer).toBe('beta omega beta');

    act(() => {
      controller.current!.openInSide(
        integrationResource('notes/C.md'),
        { fromGroupId: second.groupId },
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole('search', { name: 'Find and replace' }))
        .not.toBeInTheDocument();
    });

    act(() => {
      controller.current!.activateView(second.viewId);
    });
    const secondEditor = document.querySelector<HTMLElement>(
      `#knowledge-panel-${second.viewId} .cm-content`,
    )!;
    secondEditor.focus();
    fireEvent.keyDown(secondEditor, { key: 'f', ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByRole('search', { name: 'Find and replace' }))
        .toBeInTheDocument();
    });
    expect(screen.getByRole('textbox', { name: 'Find' })).toHaveValue('');
    expect(screen.queryByRole('textbox', { name: 'Replace with' }))
      .not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Match case' }))
      .toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Match whole word' }))
      .toHaveAttribute('aria-pressed', 'false');
    act(() => {
      controller.current!.openResource(
        integrationResource('assets/picture.png', 'asset'),
        { mode: 'pinned', groupId: second.groupId },
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole('search', { name: 'Find and replace' }))
        .not.toBeInTheDocument();
    });

    act(() => {
      controller.current!.activateView(first.viewId);
    });
    const restoredFirstEditor = document.querySelector<HTMLElement>(
      `#knowledge-panel-${first.viewId} .cm-content`,
    )!;
    restoredFirstEditor.focus();
    fireEvent.keyDown(restoredFirstEditor, { key: 'f', ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByRole('search', { name: 'Find and replace' }))
        .toBeInTheDocument();
    });
    act(() => {
      registry.getState().markDocumentResourceUnavailable(
        integrationResource('notes/A.md').address,
        'missing',
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole('search', { name: 'Find and replace' }))
        .not.toBeInTheDocument();
    });
  });
});
