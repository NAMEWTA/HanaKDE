/**
 * @vitest-environment jsdom
 */
import { history, undoDepth } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { markdown } from '@codemirror/lang-markdown';
import {
  HighlightStyle,
  LanguageDescription,
  syntaxHighlighting,
  syntaxTree,
} from '@codemirror/language';
import {
  Compartment,
  EditorState,
  type Extension,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import {
  Emoji,
  GFM,
  Subscript,
  Superscript,
} from '@lezer/markdown';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { markdownHighlight } from '../../editor/highlight';
import { knowledgeCodeBlockField } from '../../editor/knowledge-code-block-field';
import {
  knowledgeMarkdownModeExtensions,
} from '../../editor/knowledge-live-preview';

const javascriptDescription = LanguageDescription.of({
  name: 'JavaScript',
  alias: ['js', 'javascript'],
  support: javascript(),
});
const deterministicCodeHighlight = HighlightStyle.define([
  { tag: tags.keyword, class: 'tok-keyword' },
  { tag: tags.string, class: 'tok-string' },
  { tag: tags.number, class: 'tok-number' },
]);
const previewCss = readFileSync(
  resolve(process.cwd(), 'desktop/src/react/components/Preview.module.css'),
  'utf8',
);

function createCodeView(
  doc: string,
  selection = 0,
  extensions: readonly Extension[] = [knowledgeCodeBlockField],
): { parent: HTMLDivElement; view: EditorView } {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor: selection },
      extensions: [
        markdown({
          extensions: [GFM, Subscript, Superscript, Emoji],
          codeLanguages: [javascriptDescription],
        }),
        syntaxHighlighting(markdownHighlight),
        syntaxHighlighting(deterministicCodeHighlight),
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

describe('knowledge fenced code Live Preview', () => {
  it('hides inactive fences and renders a static highlighted body without controls', async () => {
    const doc = [
      'Before',
      '',
      '```js',
      'const answer = "safe";',
      '```',
    ].join('\n');
    const { parent, view } = createCodeView(doc);

    await vi.waitFor(() => {
      expect(parent.querySelectorAll('.cm-knowledge-code-line')).toHaveLength(3);
      expect(parent.querySelector('.tok-keyword')).not.toBeNull();
    });
    expect(parent.textContent).not.toContain('```js');
    expect(parent.textContent).not.toContain('```');
    expect(parent.textContent).toContain('const answer = "safe";');
    expect(parent.querySelectorAll('button, [role="button"], .cm-codeblock-toolbar')).toHaveLength(0);
    expect(view.state.doc.toString()).toBe(doc);
    expect(undoDepth(view.state)).toBe(0);
    view.destroy();
  });

  it.each([
    ['opening fence', '```js'],
    ['language', 'js'],
    ['body', 'answer'],
    ['closing fence', '```\nAfter'],
  ])('reveals the whole fence source when the selection touches the %s', (_label, needle) => {
    const doc = [
      'Before',
      '```js',
      'const answer = 42;',
      '```',
      'After',
    ].join('\n');
    const position = needle === 'js'
      ? doc.indexOf('js')
      : needle === '```\nAfter'
        ? doc.lastIndexOf('```')
        : doc.indexOf(needle);
    const { parent, view } = createCodeView(doc);

    expect(parent.textContent).not.toContain('```js');
    view.dispatch({ selection: { anchor: position } });
    expect(parent.textContent).toContain('```js');
    expect(parent.textContent).toContain('```');
    expect(view.state.doc.toString()).toBe(doc);
    expect(undoDepth(view.state)).toBe(0);

    view.dispatch({ selection: { anchor: doc.indexOf('After') } });
    expect(parent.textContent).not.toContain('```js');
    view.destroy();
  });

  it('reveals all source for a non-empty selection crossing any part of the block', () => {
    const doc = 'Before\n```js\nconst answer = 42;\n```\nAfter';
    const { parent, view } = createCodeView(doc);
    view.dispatch({
      selection: {
        anchor: doc.indexOf('Before'),
        head: doc.indexOf('answer') + 3,
      },
    });

    expect(parent.textContent).toContain('```js');
    expect(parent.textContent).toContain('```');
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it('keeps unknown and absent languages as plain monospaced text', () => {
    for (const opening of ['```unknown-runtime', '```']) {
      const doc = `Before\n${opening}\nlaunch(never)\n\`\`\``;
      const { parent, view } = createCodeView(doc);

      expect(parent.textContent).toContain('launch(never)');
      expect(parent.querySelectorAll('.cm-knowledge-code-line')).toHaveLength(3);
      expect(parent.querySelector('.tok-keyword, .tok-string, .tok-number')).toBeNull();
      expect(view.state.doc.toString()).toBe(doc);
      view.destroy();
    }
    expect(previewCss).toMatch(
      /:global\(\.cm-knowledge-code-line\)\s*\{[^}]*font-family:\s*var\(--font-mono\)/,
    );
  });

  it.each(['javascript', 'lua', 'query', 'template'])(
    'never executes %s fences or exposes run, output, copy, or line-number UI',
    (language) => {
      const invoke = vi.fn();
      vi.stubGlobal('launch', invoke);
      const doc = `Before\n\`\`\`${language}\nlaunch("never")\n\`\`\``;
      const { parent, view } = createCodeView(doc);

      parent.querySelector('.cm-knowledge-code-line')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      expect(invoke).not.toHaveBeenCalled();
      expect(parent.querySelectorAll(
        'button, [role="button"], .cm-codeblock-toolbar, .cm-gutters, [data-output]',
      )).toHaveLength(0);
      expect(view.state.doc.toString()).toBe(doc);
      expect(undoDepth(view.state)).toBe(0);
      view.destroy();
    },
  );

  it('leaves Mermaid to its dedicated preview field', () => {
    const doc = 'Before\n```mermaid\ngraph TD; A-->B;\n```';
    const { parent, view } = createCodeView(doc);

    expect(parent.querySelector('.cm-knowledge-code-line')).toBeNull();
    expect(parent.textContent).toContain('```mermaid');
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it('keeps malformed or unclosed fences as source instead of guessing a preview', () => {
    for (const doc of [
      'Before\n```js\nconst x = 1;',
      'Before\n```js\nconst x = 1;\n~~~',
    ]) {
      const { parent, view } = createCodeView(doc, doc.length);

      expect(parent.querySelector('.cm-knowledge-code-line')).toBeNull();
      expect(parent.textContent).toContain('```js');
      expect(view.state.doc.toString()).toBe(doc);
      view.destroy();
    }
  });

  it('keeps Source mode literal and restores derived preview without changing the document', () => {
    const doc = '```js\nconst x = 1;\n```';
    const mode = new Compartment();
    const { parent, view } = createCodeView(doc, doc.length, [
      mode.of(knowledgeMarkdownModeExtensions('source', [knowledgeCodeBlockField])),
    ]);

    expect(parent.textContent).toContain('```js');
    expect(parent.querySelector('.cm-knowledge-code-line')).toBeNull();
    view.dispatch({
      effects: mode.reconfigure(
        knowledgeMarkdownModeExtensions('live-preview', [knowledgeCodeBlockField]),
      ),
      selection: { anchor: view.state.doc.length },
    });
    expect(parent.textContent).not.toContain('```js');
    expect(parent.querySelectorAll('.cm-knowledge-code-line')).toHaveLength(3);
    expect(view.state.doc.toString()).toBe(doc);
    expect(undoDepth(view.state)).toBe(0);
    view.destroy();
  });

  it('uses responsive visual soft wrap without adding lines, history, or observers', () => {
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
    const doc = `Before\n\`\`\`\n${'long-token-'.repeat(40)}\n\`\`\``;
    const { parent, view } = createCodeView(doc);
    const beforeLines = view.state.doc.lines;

    parent.style.width = '240px';
    window.dispatchEvent(new Event('resize'));

    expect(previewCss).toMatch(
      /:global\(\.cm-knowledge-code-line\)\s*\{[^}]*white-space:\s*pre-wrap[^}]*overflow-wrap:\s*anywhere[^}]*word-break:\s*break-word/,
    );
    expect(view.state.doc.lines).toBe(beforeLines);
    expect(view.state.doc.toString()).toBe(doc);
    expect(undoDepth(view.state)).toBe(0);
    expect(observers).toHaveLength(1);
    view.destroy();
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
  });

  it('keeps the nested parser limited to the selected language description', () => {
    const knownDoc = 'Before\n```js\nconst x = 1;\n```';
    const unknownDoc = 'Before\n```mystery\nconst x = 1;\n```';
    const known = createCodeView(knownDoc);
    const unknown = createCodeView(unknownDoc);
    const knownNode = syntaxTree(known.view.state).resolveInner(
      knownDoc.indexOf('const') + 2,
    );
    const unknownNode = syntaxTree(unknown.view.state).resolveInner(
      unknownDoc.indexOf('const') + 2,
    );

    expect(knownNode.name).toBe('const');
    expect(knownNode.parent?.name).toBe('VariableDeclaration');
    expect(unknownNode.name).toBe('CodeText');
    known.view.destroy();
    unknown.view.destroy();
  });
});
