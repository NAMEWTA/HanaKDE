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
import { knowledgeEnterCommand } from '../../editor/knowledge-enter-commands';

const CURSOR = '|^|';
const views: EditorView[] = [];

function createView(markedDocument: string, extensions = [markdown(), history()]): EditorView {
  const cursor = markedDocument.indexOf(CURSOR);
  if (cursor < 0) throw new Error('test document must include a cursor');
  const doc = markedDocument.slice(0, cursor)
    + markedDocument.slice(cursor + CURSOR.length);
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(cursor),
      extensions,
    }),
  });
  views.push(view);
  return view;
}

function markedText(view: EditorView): string {
  const cursor = view.state.selection.main.head;
  const doc = view.state.doc.toString();
  return `${doc.slice(0, cursor)}${CURSOR}${doc.slice(cursor)}`;
}

function runEnter(markedDocument: string): string | false {
  const view = createView(markedDocument);
  if (!knowledgeEnterCommand(view)) return false;
  return markedText(view);
}

afterEach(() => {
  while (views.length > 0) views.pop()?.destroy();
  document.body.innerHTML = '';
});

describe('knowledge Markdown Enter transactions', () => {
  it.each([
    ['- alpha|^|', '- alpha\n- |^|'],
    ['* alpha|^|', '* alpha\n* |^|'],
    ['+ alpha|^|', '+ alpha\n+ |^|'],
    ['7. alpha|^|', '7. alpha\n8. |^|'],
    ['11) alpha|^|', '11) alpha\n12) |^|'],
    ['7.   alpha|^|', '7.   alpha\n8.   |^|'],
    ['> quote|^|', '> quote\n> |^|'],
  ])('continues the current unordered, ordered, or quote structure: %s', (input, expected) => {
    expect(runEnter(input)).toBe(expected);
  });

  it.each([
    ['- [ ] todo|^|', '- [ ] todo\n- [ ] |^|'],
    ['- [x] done|^|', '- [x] done\n- [ ] |^|'],
    ['- [X] done|^|', '- [X] done\n- [ ] |^|'],
    ['2)  [x]  done|^|', '2)  [x]  done\n3)  [ ]  |^|'],
    ['> - [x] quoted|^|', '> - [x] quoted\n> - [ ] |^|'],
    ['  - [x] nested|^|', '  - [x] nested\n  - [ ] |^|'],
  ])('continues tasks as unchecked while preserving parent structure: %s', (input, expected) => {
    expect(runEnter(input)).toBe(expected);
  });

  it.each([
    ['- |^|', '|^|'],
    ['7. |^|', '|^|'],
    ['- [x] |^|', '|^|'],
    ['> |^|', '|^|'],
    ['> > |^|', '> |^|'],
    ['  - |^|', '- |^|'],
    ['  +   |^|', '+   |^|'],
    ['>   - [ ] |^|', '> - |^|'],
  ])('exits exactly one empty structure layer: %s', (input, expected) => {
    expect(runEnter(input)).toBe(expected);
  });

  it('creates only the new ordered marker and leaves existing non-contiguous siblings byte-exact', () => {
    expect(runEnter('1. first\n3. current|^|\n8. intentional')).toBe(
      '1. first\n3. current\n4. |^|\n8. intentional',
    );
  });

  it('splits at the cursor and preserves the remaining list body', () => {
    expect(runEnter('- alpha|^| beta')).toBe('- alpha\n- |^| beta');
  });

  it.each([
    ['paragraph|^|'],
    ['```md\n- code|^|\n```'],
    ['~~~\n> code|^|\n~~~'],
    ['> ```md\n> - quoted code|^|\n> ```'],
    ['- parent\n  ```md\n  - nested code|^|\n  ```'],
  ])('falls through outside supported Markdown structures: %s', (input) => {
    expect(runEnter(input)).toBe(false);
  });

  it('falls through for selections, readonly state, and a caret inside the prefix', () => {
    const selected = createView('- item|^|');
    selected.dispatch({ selection: EditorSelection.range(0, selected.state.doc.length) });
    expect(knowledgeEnterCommand(selected)).toBe(false);

    const readOnly = createView('- item|^|', [
      markdown(),
      EditorState.readOnly.of(true),
    ]);
    expect(knowledgeEnterCommand(readOnly)).toBe(false);

    const prefix = createView('- |^|item');
    prefix.dispatch({ selection: EditorSelection.cursor(1) });
    expect(knowledgeEnterCommand(prefix)).toBe(false);
  });

  it('dispatches one ordinary input transaction and undoes the whole Enter in one step', () => {
    const original = '> - [x] done';
    const view = createView(`${original}|^|`);
    const dispatch = vi.spyOn(view, 'dispatch');

    expect(knowledgeEnterCommand(view)).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(markedText(view)).toBe('> - [x] done\n> - [ ] |^|');

    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(original);
  });

  it('does not mutate state before a dispatch failure is surfaced', () => {
    const view = createView('- item|^|');
    const original = view.state;
    vi.spyOn(view, 'dispatch').mockImplementation(() => {
      throw new Error('dispatch unavailable');
    });

    expect(() => knowledgeEnterCommand(view)).toThrow('dispatch unavailable');
    expect(view.state).toBe(original);
  });

  it('is the writable Markdown Surface Enter keymap and falls through elsewhere', () => {
    const createSurfaceView = (
      markedDocument: string,
      mode: 'markdown' | 'text',
      readOnly = false,
    ) => {
      const cursor = markedDocument.indexOf(CURSOR);
      const doc = markedDocument.replace(CURSOR, '');
      const parent = document.body.appendChild(document.createElement('div'));
      const compartments = createMarkdownEditorCompartments();
      const view = new EditorView({
        parent,
        state: EditorState.create({
          doc,
          selection: EditorSelection.cursor(cursor),
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

    const markdownView = createSurfaceView('- item|^|', 'markdown');
    markdownView.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
    }));
    expect(markedText(markdownView)).toBe('- item\n- |^|');

    const textView = createSurfaceView('- item|^|', 'text');
    textView.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
    }));
    expect(textView.state.doc.toString()).toBe('- item\n');

    const readOnlyView = createSurfaceView('- item|^|', 'markdown', true);
    readOnlyView.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
    }));
    expect(readOnlyView.state.doc.toString()).toBe('- item');
  });
});
