/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import {
  CompletionContext,
  currentCompletions,
  startCompletion,
  type Completion,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { history, undo } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
  EditorSelection,
  EditorState,
  type Extension,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  collectKnowledgeFootnotes,
  knowledgeFootnoteCompletion,
  knowledgeFootnoteCompletionSource,
  knowledgeFootnoteField,
} from '../../editor/knowledge-footnote-field';
import { knowledgeMarkdownModeExtensions } from '../../editor/knowledge-live-preview';

function editor(
  doc: string,
  selection?: EditorSelection,
  extensions: readonly Extension[] = [knowledgeFootnoteField],
): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection,
      extensions: [
        EditorState.allowMultipleSelections.of(true),
        ...extensions,
      ],
    }),
  });
}

function completionResult(
  doc: string,
  explicit = false,
  readOnly = false,
): CompletionResult | null {
  const state = EditorState.create({
    doc,
    extensions: readOnly ? [EditorState.readOnly.of(true)] : [],
  });
  return knowledgeFootnoteCompletionSource(
    new CompletionContext(state, doc.length, explicit),
  ) as CompletionResult | null;
}

describe('knowledge footnote field', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.t = ((key: string, params?: Record<string, string | number>) => {
      const strings: Record<string, string> = {
        'knowledge.footnote.jumpToDefinition': 'Jump [^{label}]',
        'knowledge.footnote.editInline': 'Edit inline {number}',
        'knowledge.footnote.missingDefinition': 'Missing [^{label}]',
        'knowledge.footnote.duplicateDefinition': 'Duplicate [^{label}]',
        'knowledge.footnote.duplicateBadge': 'Duplicate footnote',
      };
      return (strings[key] ?? key).replace(
        /\{(\w+)\}/gu,
        (_, name: string) => String(params?.[name] ?? `{${name}}`),
      );
    }) as typeof window.t;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('parses exact labels, multiline bodies, first-wins duplicates, and no code syntax', () => {
    const source = [
      'A[^Note] B[^note] C^[inline].',
      '`[^hidden]`',
      '```md',
      '[^fenced]: hidden',
      '```',
      '[^Note]: First **paragraph**.',
      '',
      '    - second paragraph',
      '\tthird line',
      '[^Note]: duplicate',
      '[^note]: lower case',
    ].join('\n');
    const model = collectKnowledgeFootnotes(source);

    expect(model.definitions.map(definition => ({
      label: definition.label,
      content: definition.content,
      duplicate: definition.duplicate,
    }))).toEqual([
      {
        label: 'Note',
        content: 'First **paragraph**.\n\n- second paragraph\nthird line',
        duplicate: false,
      },
      { label: 'Note', content: 'duplicate', duplicate: true },
      { label: 'note', content: 'lower case', duplicate: false },
    ]);
    expect(model.references.map(reference => reference.label)).toEqual(['Note', 'note']);
    expect(model.inlineFootnotes.map(footnote => footnote.content)).toEqual(['inline']);
  });

  it('renders compact markers and a sanitized Markdown hover without a bottom list', () => {
    const doc = [
      'Text[^note] and inline^[inline **bold**].',
      '',
      '[^note]: **Bold** [link](https://example.com) ![remote](https://example.com/x.png)',
    ].join('\n');
    const view = editor(doc);
    const markers = view.dom.querySelectorAll<HTMLElement>('.cm-footnote-marker');

    expect(markers).toHaveLength(2);
    expect(markers[0]).toHaveAttribute('role', 'button');
    expect(markers[0]).toHaveAttribute('aria-label', 'Jump [^note]');
    expect(markers[0].querySelector('.cm-footnote-marker-glyph')).toHaveTextContent('1');
    expect(markers[1].querySelector('.cm-footnote-marker-glyph')).toHaveTextContent('2');

    markers[0].dispatchEvent(new MouseEvent('mouseenter'));
    const tooltip = markers[0].querySelector<HTMLElement>('.cm-footnote-tooltip')!;
    expect(tooltip.hidden).toBe(false);
    expect(tooltip.querySelector('strong')).toHaveTextContent('Bold');
    expect(tooltip.querySelector('a')).toHaveTextContent('link');
    expect(tooltip.querySelector('img, script, iframe, section.footnotes')).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it('jumps to the first definition, while Alt/Option and inline activation reveal source', () => {
    const doc = [
      'Text[^note] and inline^[detail].',
      '',
      '[^note]: definition',
      '[^note]: duplicate',
    ].join('\n');
    const view = editor(doc);
    const referenceFrom = doc.indexOf('[^note]');
    const definitionFrom = doc.indexOf('[^note]:');
    const inlineFrom = doc.indexOf('^[detail]');
    const reference = view.dom.querySelector<HTMLElement>('.cm-footnote-marker-reference')!;

    reference.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    }));
    expect(view.state.selection.main.head).toBe(definitionFrom);

    view.dispatch({ selection: { anchor: 0 } });
    view.dom.querySelector<HTMLElement>('.cm-footnote-marker-reference')!
      .dispatchEvent(new MouseEvent('mousedown', {
        altKey: true,
        bubbles: true,
        cancelable: true,
      }));
    expect(view.state.selection.main.head).toBe(referenceFrom);

    view.dispatch({ selection: { anchor: 0 } });
    view.dom.querySelector<HTMLElement>('.cm-footnote-marker-inline')!
      .dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }));
    expect(view.state.selection.main.head).toBe(inlineFrom);
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it('reveals every marker touched by any selection and refreshes only after leaving', () => {
    const doc = 'A[^one] B[^two]\n\n[^one]: 1\n[^two]: 2';
    const one = doc.indexOf('[^one]');
    const two = doc.indexOf('[^two]');
    const view = editor(
      doc,
      EditorSelection.create([
        EditorSelection.range(one + 1, one + 3),
        EditorSelection.cursor(two + 2),
      ]),
    );

    expect(view.dom.querySelectorAll('.cm-footnote-marker')).toHaveLength(0);
    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(0),
        EditorSelection.cursor(doc.length),
      ]),
    });
    expect(view.dom.querySelectorAll('.cm-footnote-marker')).toHaveLength(2);
    view.destroy();
  });

  it('shows deterministic missing and duplicate diagnostics and recalculates after edits', () => {
    const doc = [
      'A[^Note] B[^note]',
      '[^Note]: winner',
      '[^Note]: later',
    ].join('\n');
    const view = editor(doc);

    expect(view.dom.querySelectorAll('.cm-footnote-marker.is-error')).toHaveLength(1);
    expect(view.dom.querySelector('.cm-footnote-marker.is-error'))
      .toHaveAttribute('aria-label', 'Missing [^note]');
    expect(view.dom.querySelectorAll('.cm-footnote-duplicate')).toHaveLength(1);
    expect(view.dom.querySelector('.cm-footnote-duplicate'))
      .toHaveAttribute('aria-label', 'Duplicate [^Note]');

    const firstDefinition = doc.indexOf('[^Note]: winner');
    const firstDefinitionEnd = firstDefinition + '[^Note]: winner\n'.length;
    view.dispatch({ changes: { from: firstDefinition, to: firstDefinitionEnd } });
    expect(view.dom.querySelectorAll('.cm-footnote-duplicate')).toHaveLength(0);
    expect(view.state.doc.toString()).toContain('[^Note]: later');
    view.destroy();
  });

  it('completes local first definitions in case-sensitive source order with one undo step', () => {
    const doc = [
      '[^Beta]: first',
      '[^beta]: lower',
      '[^Beta]: duplicate',
      '[^Bravo]: third',
      '',
      'Use [^B',
    ].join('\n');
    const result = completionResult(doc)!;

    expect(result.from).toBe(doc.lastIndexOf('[^B'));
    expect(result.options.map(option => option.label)).toEqual(['Beta', 'Bravo']);
    expect(result.options.map(option => option.detail)).toEqual(['[^Beta]', '[^Bravo]']);
    expect(completionResult(`${doc.slice(0, -1)}b`)?.options.map(option => option.label))
      .toEqual(['beta']);
    expect(completionResult('```md\ncode [^B')).toBeNull();
    expect(completionResult(doc, false, true)).toBeNull();

    const view = editor(doc, undefined, [history()]);
    const completion = result.options[0] as Completion;
    const apply = completion.apply;
    expect(typeof apply).toBe('function');
    (apply as Exclude<Exclude<Completion['apply'], string>, undefined>)(
      view,
      completion,
      result.from,
      doc.length,
    );
    expect(view.state.doc.toString()).toMatch(/Use \[\^Beta\]$/u);
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it('keeps Source mode literal while retaining footnote completion', async () => {
    const doc = 'Text[^note]\n\n[^note]: body\n\nUse [^';
    const view = editor(
      doc,
      EditorSelection.create([EditorSelection.cursor(doc.length)]),
      [
        markdown(),
        knowledgeMarkdownModeExtensions('source', [knowledgeFootnoteField]),
        knowledgeFootnoteCompletion,
      ],
    );

    expect(view.dom.querySelector('.cm-footnote-marker')).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
    const result = knowledgeFootnoteCompletionSource(
      new CompletionContext(view.state, doc.length, false, view),
    ) as CompletionResult;
    expect(result.options.map(option => option.label)).toEqual(['note']);
    expect(startCompletion(view)).toBe(true);
    await vi.waitFor(() => {
      expect(currentCompletions(view.state).map(option => option.label))
        .toEqual(['note']);
    });
    view.destroy();
  });
});
