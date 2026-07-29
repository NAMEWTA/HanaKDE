/**
 * @vitest-environment jsdom
 */
import { history, undoDepth } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  Compartment,
  EditorState,
  type Extension,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  knowledgeMarkdownModeExtensions,
} from '../../editor/knowledge-live-preview';
import {
  knowledgeTableField,
  parseKnowledgeGfmTable,
} from '../../editor/knowledge-table-field';

function createTableView(
  doc: string,
  selection = 0,
  extensions: readonly Extension[] = [knowledgeTableField],
): { parent: HTMLDivElement; view: EditorView } {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor: selection },
      extensions: [
        markdown({ base: markdownLanguage }),
        history(),
        ...extensions,
      ],
    }),
  });
  return { parent, view };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('knowledge GFM table model', () => {
  it('derives GFM alignment and cell content without changing the source', () => {
    const source = [
      '| Left | Center | Right | Default |',
      '| :--- | :---: | ---: | --- |',
      '| a\\|b | **bold** | c | d |',
    ].join('\n');

    expect(parseKnowledgeGfmTable(source)).toEqual({
      headers: ['Left', 'Center', 'Right', 'Default'],
      alignments: ['left', 'center', 'right', null],
      rows: [['a\\|b', '**bold**', 'c', 'd']],
    });
    expect(source).toContain('| :--- | :---: | ---: | --- |');
  });

  it('rejects malformed delimiter rows instead of repairing them', () => {
    expect(parseKnowledgeGfmTable('| A | B |\n| -- | --- |\n| 1 | 2 |')).toBeNull();
    expect(parseKnowledgeGfmTable('| A | B |\n| --- |\n| 1 | 2 |')).toBeNull();
  });
});

describe('knowledge table Live Preview', () => {
  it('renders an inactive table as a read-only derived block with inline Markdown', () => {
    window.t = ((key: string) => (
      key === 'knowledge.table.editSource' ? '编辑表格源码' : key
    )) as typeof window.t;
    const doc = [
      'Before',
      '',
      '| Left | Center | Right | Default |',
      '| :--- | :---: | ---: | --- |',
      '| a | **bold** | c | d |',
    ].join('\n');
    const { parent, view } = createTableView(doc);
    const widget = parent.querySelector<HTMLElement>('.cm-knowledge-table-widget');
    const cells = widget?.querySelectorAll('th, td');

    expect(widget).toBeInstanceOf(HTMLElement);
    expect(widget?.getAttribute('aria-label')).toBe('编辑表格源码');
    expect(widget?.getAttribute('role')).toBe('button');
    expect(widget?.tabIndex).toBe(0);
    expect(widget?.querySelectorAll('[contenteditable], input, button')).toHaveLength(0);
    expect(cells).toHaveLength(8);
    expect(cells?.[0].getAttribute('style')).toContain('text-align: left');
    expect(cells?.[1].getAttribute('style')).toContain('text-align: center');
    expect(cells?.[2].getAttribute('style')).toContain('text-align: right');
    expect(cells?.[3].getAttribute('style')).toBeNull();
    expect(widget?.querySelector('strong')?.textContent).toBe('bold');
    expect(view.state.doc.toString()).toBe(doc);
    expect(undoDepth(view.state)).toBe(0);

    view.destroy();
  });

  it.each([
    ['header', '| A'],
    ['delimiter', ':---'],
    ['body', '**one**'],
  ])('reveals the entire source when the selection touches the %s row', (_label, needle) => {
    const doc = [
      'Before',
      '',
      '| A | B |',
      '| :--- | ---: |',
      '| **one** | two |',
      '',
      'After',
    ].join('\n');
    const { parent, view } = createTableView(doc);

    expect(parent.querySelector('.cm-knowledge-table-widget')).not.toBeNull();
    view.dispatch({ selection: { anchor: doc.indexOf(needle) } });
    expect(parent.querySelector('.cm-knowledge-table-widget')).toBeNull();
    expect(parent.textContent).toContain('| :--- | ---: |');
    expect(parent.textContent).toContain('| **one** | two |');

    view.dispatch({ selection: { anchor: doc.indexOf('After') } });
    expect(parent.querySelector('.cm-knowledge-table-widget')).not.toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it('reveals one source buffer on pointer or keyboard activation without a document transaction', () => {
    const doc = [
      'Before',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
    ].join('\n');
    const { parent, view } = createTableView(doc);
    const tableFrom = doc.indexOf('| A');
    const pointerWidget = parent.querySelector<HTMLElement>('.cm-knowledge-table-widget');

    pointerWidget?.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    }));
    expect(view.state.selection.main.anchor).toBe(tableFrom);
    expect(parent.querySelector('.cm-knowledge-table-widget')).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
    expect(undoDepth(view.state)).toBe(0);

    view.dispatch({ selection: { anchor: 0 } });
    const keyboardWidget = parent.querySelector<HTMLElement>('.cm-knowledge-table-widget');
    keyboardWidget?.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }));
    expect(view.state.selection.main.anchor).toBe(tableFrom);
    expect(view.state.doc.toString()).toBe(doc);
    expect(undoDepth(view.state)).toBe(0);
    view.destroy();
  });

  it('keeps Source mode and invalid pseudo-tables as literal Markdown', () => {
    const valid = '| A | B |\n| --- | --- |\n| 1 | 2 |';
    const mode = new Compartment();
    const source = createTableView(valid, 0, [
      mode.of(knowledgeMarkdownModeExtensions('source', [knowledgeTableField])),
    ]);

    expect(source.parent.querySelector('.cm-knowledge-table-widget')).toBeNull();
    expect(source.parent.textContent).toContain('| --- | --- |');
    source.view.dispatch({
      effects: mode.reconfigure(
        knowledgeMarkdownModeExtensions('live-preview', [knowledgeTableField]),
      ),
      selection: { anchor: source.view.state.doc.length },
    });
    expect(source.parent.querySelector('.cm-knowledge-table-widget')).not.toBeNull();
    source.view.destroy();

    const malformed = '| A | B |\n| -- | --- |\n| 1 | 2 |';
    const invalid = createTableView(malformed, malformed.length);
    expect(invalid.parent.querySelector('.cm-knowledge-table-widget')).toBeNull();
    expect(invalid.parent.textContent).toContain('| -- | --- |');
    expect(invalid.view.state.doc.toString()).toBe(malformed);
    invalid.view.destroy();
  });

  it('creates no observer or editor surface that can leak when the widget is destroyed', () => {
    const observers: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
    class TestResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      constructor() {
        observers.push(this);
      }
    }
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    const doc = 'Before\n\n| A |\n| --- |\n| 1 |';
    const { parent, view } = createTableView(doc);

    expect(parent.querySelector('.cm-knowledge-table-widget')).not.toBeNull();
    expect(observers).toHaveLength(1);
    view.destroy();
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    expect(parent.querySelector('.cm-knowledge-table-widget')).toBeNull();
  });
});
