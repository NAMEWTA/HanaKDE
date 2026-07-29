/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import {
  EditorSelection,
  EditorState,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import katex from 'katex';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  collectKnowledgeMathElements,
  knowledgeMathField,
} from '../../editor/knowledge-math-field';
import { knowledgeMarkdownModeExtensions } from '../../editor/knowledge-live-preview';

function editor(doc: string, selection?: EditorSelection): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection,
      extensions: [EditorState.allowMultipleSelections.of(true), knowledgeMathField],
    }),
  });
}

describe('knowledge math field', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.t = ((key: string) => ({
      'knowledge.math.editSource': 'Edit math source',
      'knowledge.math.renderError': 'Formula error',
    }[key] ?? key)) as typeof window.t;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('collects inline $…$ and block $$…$$ while preserving formula source', () => {
    const doc = [
      'Euler: $e^{i\\pi} + 1 = 0$',
      '$$',
      '\\int_0^1 x^2\\,dx',
      '$$',
    ].join('\n');

    expect(collectKnowledgeMathElements(doc)).toEqual([
      expect.objectContaining({
        kind: 'inline',
        source: 'e^{i\\pi} + 1 = 0',
      }),
      expect.objectContaining({
        kind: 'block',
        source: '\\int_0^1 x^2\\,dx',
      }),
    ]);
  });

  it('does not parse escaped dollars, inline code, or fenced code as formulas', () => {
    const doc = [
      'Price \\$5 and `$notMath$`, but $x+1$ is math.',
      '```js',
      'const raw = "$hidden$";',
      '$$',
      'also hidden',
      '$$',
      '```',
    ].join('\n');

    expect(collectKnowledgeMathElements(doc)).toEqual([
      expect.objectContaining({ kind: 'inline', source: 'x+1' }),
    ]);
  });

  it('renders only after every cursor and selection leaves an element', () => {
    const doc = 'before $x+1$ between $y+1$ after';
    const first = doc.indexOf('$x+1$');
    const second = doc.indexOf('$y+1$');
    const view = editor(
      doc,
      EditorSelection.create([
        EditorSelection.range(first + 1, first + 3),
        EditorSelection.cursor(second + 2),
      ]),
    );

    expect(view.dom.querySelectorAll('.cm-math-widget')).toHaveLength(0);
    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(0),
        EditorSelection.cursor(doc.length),
      ]),
    });
    expect(view.dom.querySelectorAll('.cm-math-inline-widget')).toHaveLength(2);
    view.destroy();
  });

  it('does not invoke KaTeX while editing and refreshes once after leaving', () => {
    const renderToString = vi.spyOn(katex, 'renderToString');
    const doc = 'before $x+1$ after';
    const math = doc.indexOf('$x+1$');
    const view = editor(
      doc,
      EditorSelection.create([EditorSelection.cursor(math + 2)]),
    );

    expect(renderToString).not.toHaveBeenCalled();
    view.dispatch({ changes: { from: math + 2, to: math + 3, insert: 'y' } });
    expect(renderToString).not.toHaveBeenCalled();
    view.dispatch({ selection: { anchor: 0 } });
    expect(renderToString).toHaveBeenCalledTimes(1);
    expect(view.dom.querySelector('.cm-math-inline-widget .katex')).toBeInstanceOf(HTMLElement);
    view.destroy();
  });

  it('isolates inline and block errors, keeps source unchanged, and makes errors editable', () => {
    const doc = [
      'before $\\badCommand{$ after',
      '$$',
      '\\anotherBad{',
      '$$',
      'valid $x^2$',
    ].join('\n');
    const view = editor(doc);

    expect(view.dom.querySelectorAll('.cm-math-widget.is-error')).toHaveLength(2);
    expect(view.dom.querySelector('.cm-math-widget.is-rendered .katex')).toBeInstanceOf(HTMLElement);
    expect(view.state.doc.toString()).toBe(doc);

    const inlineError = view.dom.querySelector<HTMLElement>('.cm-math-inline-widget.is-error')!;
    expect(inlineError).toHaveAttribute('role', 'button');
    expect(inlineError).toHaveAttribute('aria-label', 'Edit math source');
    expect(inlineError.textContent).toBe('Formula error');
    inlineError.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    }));
    expect(view.state.selection.main.head).toBe(doc.indexOf('$\\badCommand{'));
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it('keeps untrusted KaTeX commands inert under strict, non-trusting options', () => {
    const doc = 'before $\\href{javascript:alert(1)}{click}$ after';
    const view = editor(doc);
    const widget = view.dom.querySelector('.cm-math-widget');

    expect(widget).toHaveClass('is-rendered');
    expect(widget?.querySelector('a, script, iframe, [onclick]')).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it('returns to block source with the keyboard and stays literal in Source mode', () => {
    const doc = 'before\n$$\ny^2\n$$\nafter';
    const view = editor(doc);
    const widget = view.dom.querySelector<HTMLElement>('.cm-math-block-widget')!;
    widget.dispatchEvent(new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    }));
    expect(view.state.selection.main.head).toBe(doc.indexOf('$$'));
    expect(view.dom.querySelector('.cm-math-block-widget')).toBeNull();
    view.destroy();

    const sourceParent = document.createElement('div');
    document.body.appendChild(sourceParent);
    const sourceView = new EditorView({
      parent: sourceParent,
      state: EditorState.create({
        doc,
        extensions: [knowledgeMarkdownModeExtensions('source', [knowledgeMathField])],
      }),
    });
    expect(sourceView.dom.querySelector('.cm-math-widget')).toBeNull();
    expect(sourceView.state.doc.toString()).toBe(doc);
    sourceView.destroy();
  });
});
