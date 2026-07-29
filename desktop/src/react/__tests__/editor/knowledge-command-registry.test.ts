/**
 * @vitest-environment jsdom
 */
import { history, undo } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
  EditorSelection,
  EditorState,
  Transaction,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createKnowledgeCommandExtensions,
  executeKnowledgeFormatCommand,
  executeKnowledgeSlashCommand,
  filterKnowledgeCommands,
  KNOWLEDGE_COMMAND_DEFINITIONS,
  localizeKnowledgeCommands,
  type KnowledgeSlashMenuRequest,
} from '../../editor/knowledge-command-registry';
import {
  createMarkdownEditorCompartments,
  createMarkdownEditorExtensions,
} from '../../editor/create-markdown-editor-extensions';

const views: EditorView[] = [];

function createView(
  doc = '',
  selection: EditorSelection | { anchor: number; head?: number } = { anchor: doc.length },
  commandMenu = false,
  onChange: (request: KnowledgeSlashMenuRequest | null) => void = () => undefined,
): EditorView {
  const parent = document.body.appendChild(document.createElement('div'));
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection,
      extensions: [
        markdown(),
        history(),
        ...(commandMenu
          ? createKnowledgeCommandExtensions({
              translate: key => key,
              onSlashMenuChange: onChange,
            })
          : []),
      ],
    }),
  });
  views.push(view);
  return view;
}

function type(view: EditorView, text: string): void {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: EditorSelection.cursor(from + text.length),
    annotations: Transaction.userEvent.of('input.type'),
  });
}

function typeText(view: EditorView, text: string): void {
  for (const character of text) type(view, character);
}

function key(
  view: EditorView,
  keyName: string,
  modifiers: Pick<KeyboardEventInit, 'ctrlKey' | 'metaKey' | 'shiftKey'> = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: keyName,
    ...modifiers,
    bubbles: true,
    cancelable: true,
  });
  view.contentDOM.dispatchEvent(event);
  return event;
}

function active(
  request: KnowledgeSlashMenuRequest | null,
): KnowledgeSlashMenuRequest {
  if (!request) throw new Error('expected slash menu request');
  return request;
}

afterEach(() => {
  while (views.length > 0) views.pop()?.destroy();
  document.body.replaceChildren();
});

describe('knowledge command registry', () => {
  it('freezes exactly the V1 flat command set and excludes deferred commands', () => {
    expect(KNOWLEDGE_COMMAND_DEFINITIONS.map(item => item.id)).toEqual([
      'bold',
      'italic',
      'inline-code',
      'markdown-link',
      'wikilink',
      'heading-1',
      'heading-2',
      'heading-3',
      'heading-4',
      'heading-5',
      'heading-6',
      'unordered-list',
      'ordered-list',
      'task',
      'quote',
      'code-block',
      'divider',
    ]);
    expect(KNOWLEDGE_COMMAND_DEFINITIONS.map(item => item.id)).not.toEqual(
      expect.arrayContaining(['table', 'image', 'footnote', 'math', 'query', 'lua']),
    );
    expect(KNOWLEDGE_COMMAND_DEFINITIONS.every(item => (
      item.template.length > 0
      && item.cursorOffset >= 0
      && item.cursorOffset <= item.template.length
    ))).toBe(true);
  });

  it('uses Unicode case-insensitive substrings, prefix priority, and stable registry order', () => {
    const commands = localizeKnowledgeCommands(key => ({
      'knowledge.commands.bold.name': 'Alpha Bold',
      'knowledge.commands.italic.name': 'Beta ALPHA',
      'knowledge.commands.markdownLink.name': 'Markdown Link',
    })[key] ?? key);

    expect(filterKnowledgeCommands(commands, 'ALPHA').map(item => item.id).slice(0, 2))
      .toEqual(['bold', 'italic']);
    expect(filterKnowledgeCommands(commands, 'link').map(item => item.id))
      .toEqual(['markdown-link', 'wikilink']);
    expect(filterKnowledgeCommands(commands, '')).toEqual(commands);
    expect(filterKnowledgeCommands(commands, 'not-present')).toEqual([]);
  });

  it.each([
    ['bold', '**alpha**'],
    ['italic', '*alpha*'],
    ['inline-code', '`alpha`'],
  ] as const)('formats only the explicit selection for %s', (id, expected) => {
    const view = createView('before alpha after', { anchor: 7, head: 12 });
    const dispatch = vi.spyOn(view, 'dispatch');

    expect(executeKnowledgeFormatCommand(view, id)).toBe(true);
    expect(view.state.doc.toString()).toBe(`before ${expected} after`);
    expect(view.state.sliceDoc(
      view.state.selection.main.from,
      view.state.selection.main.to,
    )).toBe('alpha');
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('inserts paired structures at a caret without expanding the current word', () => {
    const cases = [
      ['bold', 'wo****rd', 4],
      ['italic', 'wo**rd', 3],
      ['inline-code', 'wo``rd', 3],
      ['markdown-link', 'wo[]()rd', 3],
    ] as const;
    for (const [id, expected, cursor] of cases) {
      const view = createView('word', { anchor: 2 });
      expect(executeKnowledgeFormatCommand(view, id)).toBe(true);
      expect(view.state.doc.toString()).toBe(expected);
      expect(view.state.selection.main.head).toBe(cursor);
      view.destroy();
      views.pop();
    }
  });

  it('wraps a link selection and undoes each shortcut as one transaction', () => {
    const view = createView('alpha', { anchor: 0, head: 5 });

    executeKnowledgeFormatCommand(view, 'markdown-link');

    expect(view.state.doc.toString()).toBe('[alpha]()');
    expect(view.state.sliceDoc(
      view.state.selection.main.from,
      view.state.selection.main.to,
    )).toBe('alpha');
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('alpha');
  });

  it('does not format readonly or multiple-cursor states', () => {
    const readonly = new EditorView({
      parent: document.body.appendChild(document.createElement('div')),
      state: EditorState.create({
        doc: 'alpha',
        extensions: [EditorState.readOnly.of(true)],
      }),
    });
    views.push(readonly);
    expect(executeKnowledgeFormatCommand(readonly, 'bold')).toBe(false);

    const multiple = new EditorView({
      parent: document.body.appendChild(document.createElement('div')),
      state: EditorState.create({
        doc: 'alpha',
        selection: EditorSelection.create([
          EditorSelection.cursor(1),
          EditorSelection.cursor(3),
        ]),
        extensions: [EditorState.allowMultipleSelections.of(true)],
      }),
    });
    views.push(multiple);
    expect(executeKnowledgeFormatCommand(multiple, 'bold')).toBe(false);
    expect(multiple.state.doc.toString()).toBe('alpha');
  });

  it('binds the four shortcuts only in the writable Knowledge Markdown surface', () => {
    const createSurface = (mode: 'markdown' | 'text', readOnly = false) => {
      const parent = document.body.appendChild(document.createElement('div'));
      const view = new EditorView({
        parent,
        state: EditorState.create({
          doc: 'alpha',
          selection: { anchor: 0, head: 5 },
          extensions: createMarkdownEditorExtensions({
            mode,
            readOnly,
            compartments: createMarkdownEditorCompartments(),
            imageContext: {},
            observeExtension: [],
            onOpenBlockMenu: () => undefined,
            knowledgeCommands: {
              translate: value => value,
              onSlashMenuChange: () => undefined,
            },
          }),
        }),
      });
      views.push(view);
      return view;
    };
    const modifier = navigator.platform?.startsWith('Mac')
      ? { metaKey: true }
      : { ctrlKey: true };
    const markdownView = createSurface('markdown');
    expect(key(markdownView, 'b', modifier).defaultPrevented).toBe(true);
    expect(markdownView.state.doc.toString()).toBe('**alpha**');

    const textView = createSurface('text');
    expect(key(textView, 'b', modifier).defaultPrevented).toBe(false);
    expect(textView.state.doc.toString()).toBe('alpha');

    const readonlyView = createSurface('markdown', true);
    expect(key(readonlyView, 'b', modifier).defaultPrevented).toBe(false);
    expect(readonlyView.state.doc.toString()).toBe('alpha');
  });

  it('opens after a typed slash anywhere and keeps the slash as the stable query origin', () => {
    let request: KnowledgeSlashMenuRequest | null = null;
    const view = createView('path and ```js``` ', undefined, true, next => {
      request = next;
    });

    type(view, '/');
    expect(active(request).triggerFrom).toBe('path and ```js``` '.length);
    expect(active(request).query).toBe('');
    expect(active(request).commands).toHaveLength(17);

    type(view, 'link');
    expect(active(request).triggerFrom).toBe('path and ```js``` '.length);
    expect(active(request).query).toBe('link');
    expect(active(request).commands.map(item => item.id)).toEqual([
      'markdown-link',
      'wikilink',
    ]);
  });

  it('replaces an explicit selection with the trigger but rejects composition and multi-cursor input', () => {
    let request: KnowledgeSlashMenuRequest | null = null;
    const selected = createView('alpha beta', { anchor: 0, head: 5 }, true, next => {
      request = next;
    });
    type(selected, '/');
    expect(selected.state.doc.toString()).toBe('/ beta');
    expect(active(request).triggerFrom).toBe(0);

    request = null;
    const composing = createView('', undefined, true, next => {
      request = next;
    });
    const composingState = vi.spyOn(composing, 'composing', 'get').mockReturnValue(true);
    type(composing, '/');
    expect(request).toBeNull();
    expect(executeKnowledgeFormatCommand(composing, 'bold')).toBe(false);
    composingState.mockRestore();

    request = null;
    const parent = document.body.appendChild(document.createElement('div'));
    const multi = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'ab',
        selection: EditorSelection.create([
          EditorSelection.cursor(0),
          EditorSelection.cursor(2),
        ]),
        extensions: [
          EditorState.allowMultipleSelections.of(true),
          ...createKnowledgeCommandExtensions({
            translate: value => value,
            onSlashMenuChange: next => {
              request = next;
            },
          }),
        ],
      }),
    });
    views.push(multi);
    multi.dispatch({
      changes: multi.state.changeByRange(range => ({
        changes: { from: range.from, to: range.to, insert: '/' },
        range: EditorSelection.cursor(range.from + 1),
      })).changes,
      annotations: Transaction.userEvent.of('input.type'),
    });
    expect(request).toBeNull();
  });

  it('closes at the first Unicode whitespace and preserves every typed character', () => {
    let request: KnowledgeSlashMenuRequest | null = null;
    const view = createView('', undefined, true, next => {
      request = next;
    });

    typeText(view, '/bold');
    expect(request).not.toBeNull();
    type(view, '\u3000');

    expect(request).toBeNull();
    expect(view.state.doc.toString()).toBe('/bold\u3000');
    type(view, 'later');
    expect(request).toBeNull();
    expect(view.state.doc.toString()).toBe('/bold\u3000later');
  });

  it('restores the full list on query Backspace and closes only after the trigger is deleted', () => {
    let request: KnowledgeSlashMenuRequest | null = null;
    const view = createView('', undefined, true, next => {
      request = next;
    });
    typeText(view, '/bold');
    for (let index = 0; index < 4; index += 1) {
      const head = view.state.selection.main.head;
      view.dispatch({
        changes: { from: head - 1, to: head },
        selection: EditorSelection.cursor(head - 1),
        annotations: Transaction.userEvent.of('delete.backward'),
      });
    }
    expect(active(request).query).toBe('');
    expect(active(request).commands).toHaveLength(17);

    view.dispatch({
      changes: { from: 0, to: 1 },
      selection: EditorSelection.cursor(0),
      annotations: Transaction.userEvent.of('delete.backward'),
    });
    expect(request).toBeNull();
    expect(view.state.doc.toString()).toBe('');
  });

  it('supports Arrow keys, Home, End, Escape, and an empty-result Enter entirely from the editor', () => {
    let request: KnowledgeSlashMenuRequest | null = null;
    const view = createView('', undefined, true, next => {
      request = next;
    });
    type(view, '/');

    expect(key(view, 'ArrowUp').defaultPrevented).toBe(true);
    expect(active(request).selectedIndex).toBe(16);
    expect(key(view, 'Home').defaultPrevented).toBe(true);
    expect(active(request).selectedIndex).toBe(0);
    expect(key(view, 'End').defaultPrevented).toBe(true);
    expect(active(request).selectedIndex).toBe(16);
    expect(key(view, 'Escape').defaultPrevented).toBe(true);
    expect(request).toBeNull();
    expect(view.state.doc.toString()).toBe('/');

    const emptyView = createView('', undefined, true, next => {
      request = next;
    });
    typeText(emptyView, '/zz-no-command');
    expect(active(request).commands).toHaveLength(0);
    expect(key(emptyView, 'Enter').defaultPrevented).toBe(true);
    expect(emptyView.state.doc.toString()).toBe('/zz-no-command');
  });

  it('does not capture slash-navigation keys while the menu is inactive', () => {
    const view = createView('alpha', undefined, true);

    expect(key(view, 'Escape').defaultPrevented).toBe(false);
    expect(key(view, 'End').defaultPrevented).toBe(false);
    expect(key(view, 'ArrowDown').defaultPrevented).toBe(false);
    expect(view.state.doc.toString()).toBe('alpha');
  });

  it('executes an inline slash template at the trigger and ignores preceding text', () => {
    let request: KnowledgeSlashMenuRequest | null = null;
    const view = createView('alpha', undefined, true, next => {
      request = next;
    });
    typeText(view, '/link');
    const dispatch = vi.spyOn(view, 'dispatch');

    expect(active(request).execute('markdown-link')).toBe(true);

    expect(view.state.doc.toString()).toBe('alpha[]()');
    expect(view.state.selection.main.head).toBe(6);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(request).toBeNull();
  });

  it('puts block templates on a new line only when the trigger is not at line start', () => {
    const heading = KNOWLEDGE_COMMAND_DEFINITIONS.find(item => item.id === 'heading-1')!;
    const middle = createView('openhanako/heading', { anchor: 18 });
    expect(executeKnowledgeSlashCommand(middle, heading, 10, 18)).toBe(true);
    expect(middle.state.doc.toString()).toBe('openhanako\n# ');
    expect(middle.state.selection.main.head).toBe(13);

    const lineStart = createView('/heading', { anchor: 8 });
    expect(executeKnowledgeSlashCommand(lineStart, heading, 0, 8)).toBe(true);
    expect(lineStart.state.doc.toString()).toBe('# ');
    expect(lineStart.state.selection.main.head).toBe(2);
  });

  it('uses every declared slash template with its one declared cursor and one undo step', () => {
    for (const definition of KNOWLEDGE_COMMAND_DEFINITIONS) {
      const source = `/query`;
      const view = createView(source, { anchor: source.length });
      expect(executeKnowledgeSlashCommand(
        view,
        definition,
        0,
        source.length,
      )).toBe(true);
      expect(view.state.doc.toString()).toBe(definition.template);
      expect(view.state.selection.ranges).toHaveLength(1);
      expect(view.state.selection.main.head).toBe(definition.cursorOffset);
      expect(undo(view)).toBe(true);
      expect(view.state.doc.toString()).toBe(source);
      view.destroy();
      views.pop();
    }
  });

  it('fails closed for stale query ranges, readonly state, and dispatch faults', () => {
    const bold = KNOWLEDGE_COMMAND_DEFINITIONS[0];
    const stale = createView('/bold changed', { anchor: 5 });
    expect(executeKnowledgeSlashCommand(stale, bold, 0, stale.state.doc.length)).toBe(false);
    expect(stale.state.doc.toString()).toBe('/bold changed');

    const readonly = new EditorView({
      parent: document.body.appendChild(document.createElement('div')),
      state: EditorState.create({
        doc: '/bold',
        extensions: [EditorState.readOnly.of(true)],
      }),
    });
    views.push(readonly);
    expect(executeKnowledgeSlashCommand(readonly, bold, 0, 5)).toBe(false);

    const failed = createView('/bold', { anchor: 5 });
    const original = failed.state;
    vi.spyOn(failed, 'dispatch').mockImplementation(() => {
      throw new Error('dispatch unavailable');
    });
    expect(() => executeKnowledgeSlashCommand(failed, bold, 0, 5))
      .toThrow('dispatch unavailable');
    expect(failed.state).toBe(original);
  });
});
