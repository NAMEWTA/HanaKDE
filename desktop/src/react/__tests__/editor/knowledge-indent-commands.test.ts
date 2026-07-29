/**
 * @vitest-environment jsdom
 */
import { history, undo } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMarkdownEditorCompartments,
  createMarkdownEditorExtensions,
} from '../../editor/create-markdown-editor-extensions';
import {
  knowledgeIndentCommand,
  knowledgeOutdentCommand,
} from '../../editor/knowledge-indent-commands';

const views: EditorView[] = [];

function createView(
  doc: string,
  selection: EditorSelection | { anchor: number; head?: number },
  extensions = [markdown(), history()],
): EditorView {
  const parent = document.body.appendChild(document.createElement('div'));
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection,
      extensions,
    }),
  });
  views.push(view);
  return view;
}

afterEach(() => {
  while (views.length > 0) views.pop()?.destroy();
  document.body.replaceChildren();
});

describe('knowledge Markdown indent transactions', () => {
  it('inserts exactly two spaces at an empty caret in ordinary Markdown', () => {
    const view = createView('alpha', { anchor: 2 });

    expect(knowledgeIndentCommand(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('al  pha');
    expect(view.state.selection.main.head).toBe(4);
    expect(view.state.doc.toString()).not.toContain('\t');
  });

  it('uses the same two-space caret insertion inside fenced code regardless of language', () => {
    const doc = '```python\nvalue\n```';
    const caret = doc.indexOf('value') + 2;
    const view = createView(doc, { anchor: caret });

    knowledgeIndentCommand(view);

    expect(view.state.doc.toString()).toBe('```python\nva  lue\n```');
    expect(view.state.selection.main.head).toBe(caret + 2);
  });

  it('treats a partial single-line selection as a whole-line indent', () => {
    const view = createView('alpha beta', { anchor: 2, head: 7 });

    knowledgeIndentCommand(view);

    expect(view.state.doc.toString()).toBe('  alpha beta');
    expect(view.state.sliceDoc(
      view.state.selection.main.from,
      view.state.selection.main.to,
    )).toBe('pha b');
  });

  it('indents only explicitly selected lines and keeps selection content stable', () => {
    const doc = '- parent\n  - child\n    - grandchild\n8. sibling';
    const from = doc.indexOf('parent');
    const to = doc.indexOf('grandchild') + 'grandchild'.length;
    const view = createView(doc, { anchor: from, head: to });
    const selected = view.state.sliceDoc(from, to);

    knowledgeIndentCommand(view);

    expect(view.state.doc.toString()).toBe(
      '  - parent\n    - child\n      - grandchild\n8. sibling',
    );
    expect(view.state.sliceDoc(
      view.state.selection.main.from,
      view.state.selection.main.to,
    )).toBe(selected.replaceAll('\n', '\n  '));
  });

  it('does not include a next line whose start is only the selection boundary', () => {
    const doc = 'one\ntwo\nthree';
    const view = createView(doc, {
      anchor: 1,
      head: doc.indexOf('three'),
    });

    knowledgeIndentCommand(view);

    expect(view.state.doc.toString()).toBe('  one\n  two\nthree');
  });

  it('preserves a backward multi-line selection while mapping every changed line', () => {
    const doc = 'one\ntwo\nthree';
    const view = createView(doc, {
      anchor: doc.indexOf('three') + 3,
      head: doc.indexOf('one') + 1,
    });

    knowledgeIndentCommand(view);

    expect(view.state.doc.toString()).toBe('  one\n  two\n  three');
    expect(view.state.selection.main.anchor).toBeGreaterThan(
      view.state.selection.main.head,
    );
  });

  it('does not infer or move unselected list descendants or renumber ordered lines', () => {
    const doc = '3. parent\n  8. child\n    - grandchild\n13. after';
    const view = createView(doc, { anchor: doc.indexOf('parent') });

    knowledgeIndentCommand(view);

    expect(view.state.doc.toString()).toBe(
      '3.   parent\n  8. child\n    - grandchild\n13. after',
    );
  });

  it.each([
    ['  alpha', 'alpha'],
    [' alpha', 'alpha'],
    ['alpha', 'alpha'],
    ['\talpha', '\talpha'],
    [' \talpha', '\talpha'],
  ])('outdents only up to two leading ASCII spaces: %j', (input, expected) => {
    const view = createView(input, { anchor: input.length });

    expect(knowledgeOutdentCommand(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(expected);
  });

  it('outdents every selected line independently without touching adjacent lines', () => {
    const doc = 'before\n  alpha\n beta\ngamma\nafter';
    const from = doc.indexOf('alpha');
    const to = doc.indexOf('gamma') + 'gamma'.length;
    const view = createView(doc, { anchor: from, head: to });

    knowledgeOutdentCommand(view);

    expect(view.state.doc.toString()).toBe('before\nalpha\nbeta\ngamma\nafter');
  });

  it('supports multiple carets in one transaction without touching other lines', () => {
    const doc = 'one\ntwo\nthree';
    const view = createView(
      doc,
      EditorSelection.create([
        EditorSelection.cursor(1),
        EditorSelection.cursor(doc.indexOf('three') + 2),
      ]),
      [
        markdown(),
        history(),
        EditorState.allowMultipleSelections.of(true),
      ],
    );
    const dispatch = vi.spyOn(view, 'dispatch');

    knowledgeIndentCommand(view);

    expect(view.state.doc.toString()).toBe('o  ne\ntwo\nth  ree');
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('allows repeated Tab to form four leading spaces without semantic repair', () => {
    const view = createView('text', { anchor: 0, head: 4 });

    knowledgeIndentCommand(view);
    knowledgeIndentCommand(view);

    expect(view.state.doc.toString()).toBe('    text');
  });

  it('dispatches one input transaction and undoes the entire multi-line edit in one step', () => {
    const original = '- one\n- two\n- three';
    const view = createView(original, {
      anchor: 0,
      head: original.length,
    });
    const dispatch = vi.spyOn(view, 'dispatch');

    knowledgeIndentCommand(view);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(view.state.doc.toString()).toBe('  - one\n  - two\n  - three');
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(original);
  });

  it('returns unavailable for readonly state and exposes dispatch failure without pre-mutation', () => {
    const readOnly = createView('alpha', { anchor: 2 }, [
      markdown(),
      EditorState.readOnly.of(true),
    ]);
    expect(knowledgeIndentCommand(readOnly)).toBe(false);
    expect(knowledgeOutdentCommand(readOnly)).toBe(false);

    const failed = createView('alpha', { anchor: 2 });
    const original = failed.state;
    vi.spyOn(failed, 'dispatch').mockImplementation(() => {
      throw new Error('dispatch unavailable');
    });
    expect(() => knowledgeIndentCommand(failed)).toThrow('dispatch unavailable');
    expect(failed.state).toBe(original);
  });

  it('owns Tab only in writable Markdown and preserves browser focus semantics elsewhere', () => {
    const createSurfaceView = (
      mode: 'markdown' | 'text',
      readOnly = false,
    ) => {
      const parent = document.body.appendChild(document.createElement('div'));
      const compartments = createMarkdownEditorCompartments();
      const view = new EditorView({
        parent,
        state: EditorState.create({
          doc: 'alpha',
          selection: { anchor: 2 },
          extensions: createMarkdownEditorExtensions({
            mode,
            readOnly,
            compartments,
            imageContext: {},
            observeExtension: [],
            onOpenBlockMenu: () => undefined,
          }),
        }),
      });
      views.push(view);
      return view;
    };
    const pressTab = (view: EditorView, shiftKey = false) => {
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(event);
      return event;
    };

    const markdownView = createSurfaceView('markdown');
    expect(pressTab(markdownView).defaultPrevented).toBe(true);
    expect(markdownView.state.doc.toString()).toBe('al  pha');

    const textView = createSurfaceView('text');
    expect(pressTab(textView).defaultPrevented).toBe(false);
    expect(textView.state.doc.toString()).toBe('alpha');

    const readOnlyView = createSurfaceView('markdown', true);
    expect(pressTab(readOnlyView).defaultPrevented).toBe(false);
    expect(readOnlyView.state.doc.toString()).toBe('alpha');

    const outdentView = createSurfaceView('markdown');
    outdentView.dispatch({
      changes: { from: 0, insert: '  ' },
      selection: { anchor: 7 },
    });
    expect(pressTab(outdentView, true).defaultPrevented).toBe(true);
    expect(outdentView.state.doc.toString()).toBe('alpha');
  });
});
