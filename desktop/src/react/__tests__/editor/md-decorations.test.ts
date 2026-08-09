/**
 * @vitest-environment jsdom
 */
import { EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildMarkdownDecorations,
  collectLivePreviewRanges,
  markdownBlockDecoField,
  markdownDecoPlugin,
  markdownImageContextFacet,
} from '../../editor/md-decorations';
import { knowledgeCodeBlockField } from '../../editor/knowledge-code-block-field';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('markdown URL decorations', () => {
  it('keeps bare URLs visible while concealing named link destinations', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: [
          'https://example.com/bare',
          '[Example](https://example.com/hidden)',
        ].join('\n'),
        extensions: [
          markdown({ base: markdownLanguage }),
          markdownDecoPlugin,
        ],
      }),
    });

    expect(parent.textContent).toContain('https://example.com/bare');
    expect(parent.textContent).toContain('Example');
    expect(parent.textContent).not.toContain('https://example.com/hidden');

    view.destroy();
  });
});

describe('collectLivePreviewRanges', () => {
  it('collects Obsidian highlights and safe background spans', () => {
    const ranges = collectLivePreviewRanges([
      'GDP ==平减指数== and $x+1$',
      '$$',
      'y^2',
      '$$',
      '<span style="background:#fff88f">高亮</span>',
    ].join('\n'), new Set());

    expect(ranges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'mark', text: '平减指数' }),
      expect.objectContaining({ kind: 'mark', text: '高亮', color: '#fff88f' }),
    ]));
  });

  it('reveals only the highlighted element touched by the selection', () => {
    const source = '==first== and ==second==';
    const ranges = collectLivePreviewRanges(source, new Set([1]), {
      selectionRanges: [{ from: 3, to: 3 }],
    });

    expect(ranges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'mark', text: 'second' }),
    ]));
    expect(ranges).toHaveLength(3);
  });

  it('does not collect highlight ranges inside code blocks', () => {
    const ranges = collectLivePreviewRanges([
      '```js',
      'const price = "$x+1$"; // ==keep raw==',
      '```',
    ].join('\n'), new Set());

    expect(ranges).toEqual([]);
  });

  it('does not collect highlight ranges inside inline code', () => {
    const ranges = collectLivePreviewRanges('Use `$x+1$` and `==raw==` outside ==mark==', new Set());

    expect(ranges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'mark', text: 'mark' }),
    ]));
    expect(ranges).toHaveLength(3);
  });

  it('does not provide block math decorations through the view plugin decoration set', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({ doc: 'intro\n$$\ny^2\n$$' }),
    });

    const blockSpecs: unknown[] = [];
    buildMarkdownDecorations(view).between(0, view.state.doc.length, (_from, _to, deco) => {
      if ((deco.spec as { block?: boolean }).block) blockSpecs.push(deco.spec);
    });

    view.destroy();
    expect(blockSpecs).toEqual([]);
  });

  it('provides block math decorations through the direct state field', () => {
    const state = EditorState.create({
      doc: 'intro\n$$\ny^2\n$$',
      extensions: [markdownBlockDecoField],
    });
    const specs: unknown[] = [];

    state.field(markdownBlockDecoField).between(0, state.doc.length, (_from, _to, deco) => {
      if ((deco.spec as { block?: boolean }).block) specs.push(deco.spec);
    });

    expect(specs).toHaveLength(1);
  });

  it('reveals block math source when the rendered block is clicked', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'intro\n$$\ny^2\n$$',
        extensions: [markdownBlockDecoField],
      }),
    });

    const widget = parent.querySelector('.cm-math-block-widget');
    expect(widget).toBeInstanceOf(HTMLElement);

    widget?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(view.state.selection.main.head).toBe(6);
    const blockSpecs: unknown[] = [];
    view.state.field(markdownBlockDecoField).between(0, view.state.doc.length, (_from, _to, deco) => {
      if ((deco.spec as { block?: boolean }).block) blockSpecs.push(deco.spec);
    });
    expect(blockSpecs).toEqual([]);

    view.destroy();
  });

  it('renders standard markdown images relative to the markdown file in live preview', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const seenPaths: string[] = [];
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'intro\n![Cover](./assets/cover.png)',
        extensions: [
          markdown({ base: markdownLanguage }),
          markdownImageContextFacet.of({
            filePath: '/vault/notes/chapter.md',
            getFileUrl: (filePath) => {
              seenPaths.push(filePath);
              return `file://${filePath}`;
            },
          }),
          markdownDecoPlugin,
        ],
      }),
    });

    const img = parent.querySelector('.cm-image-widget img');

    expect(seenPaths).toEqual(['/vault/notes/assets/cover.png']);
    expect(img?.getAttribute('src')).toBe('file:///vault/notes/assets/cover.png');
    expect(img?.getAttribute('alt')).toBe('Cover');

    view.destroy();
  });

  it('reveals standard markdown image source when the selection touches it', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const doc = 'intro\n![Cover](./assets/cover.png)';
    const imageLine = doc.indexOf('![Cover]');
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        selection: { anchor: imageLine + 2 },
        extensions: [
          markdown({ base: markdownLanguage }),
          markdownImageContextFacet.of({
            filePath: '/vault/notes/chapter.md',
            getFileUrl: (filePath) => `file://${filePath}`,
          }),
          markdownDecoPlugin,
          markdownBlockDecoField,
        ],
      }),
    });

    const img = parent.querySelector('.cm-image-widget img');
    const blockSpecs: unknown[] = [];
    view.state.field(markdownBlockDecoField).between(0, view.state.doc.length, (from, to, deco) => {
      if (from === view.state.doc.line(2).to && to === view.state.doc.line(2).to) {
        blockSpecs.push(deco.spec);
      }
    });

    expect(parent.textContent).toContain('![Cover](./assets/cover.png)');
    expect(img).toBeNull();
    expect(blockSpecs).toEqual([]);

    view.destroy();
  });

  it('renders Obsidian image embeds in live preview', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'intro\n![[attachments/diagram.png|120]]',
        extensions: [
          markdown({ base: markdownLanguage }),
          markdownImageContextFacet.of({
            filePath: '/vault/notes/chapter.md',
            getFileUrl: (filePath) => `file://${filePath}`,
          }),
          markdownDecoPlugin,
        ],
      }),
    });

    const img = parent.querySelector('.cm-image-widget img');

    expect(img?.getAttribute('src')).toBe('file:///vault/notes/attachments/diagram.png');
    expect(img?.getAttribute('alt')).toBe('diagram.png');

    view.destroy();
  });

  it('reveals Obsidian image source when the selection touches it', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const doc = 'intro\n![[attachments/diagram.png|120]]';
    const imageLine = doc.indexOf('![[attachments');
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        selection: { anchor: imageLine + 3 },
        extensions: [
          markdown({ base: markdownLanguage }),
          markdownImageContextFacet.of({
            filePath: '/vault/notes/chapter.md',
            getFileUrl: (filePath) => `file://${filePath}`,
          }),
          markdownDecoPlugin,
          markdownBlockDecoField,
        ],
      }),
    });

    const img = parent.querySelector('.cm-image-widget img');
    const blockSpecs: unknown[] = [];
    view.state.field(markdownBlockDecoField).between(0, view.state.doc.length, (from, to, deco) => {
      if (from === view.state.doc.line(2).to && to === view.state.doc.line(2).to) {
        blockSpecs.push(deco.spec);
      }
    });

    expect(parent.textContent).toContain('![[attachments/diagram.png|120]]');
    expect(img).toBeNull();
    expect(blockSpecs).toEqual([]);

    view.destroy();
  });

  it('marks the outer edges of quote and code block surfaces', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: [
          '> first quote line',
          '> second quote line',
          '',
          '```ts',
          'const x = 1;',
          'const y = 2;',
          '```',
        ].join('\n'),
        extensions: [
          markdown({ base: markdownLanguage }),
          markdownDecoPlugin,
          knowledgeCodeBlockField,
        ],
      }),
    });

    const quoteLines = [...parent.querySelectorAll('.cm-blockquote-line')];
    const codeLines = [...parent.querySelectorAll('.cm-codeblock-line')];

    expect(quoteLines).toHaveLength(2);
    expect(quoteLines[0].classList.contains('cm-blockquote-line-first')).toBe(true);
    expect(quoteLines[0].classList.contains('cm-blockquote-line-last')).toBe(false);
    expect(quoteLines[1].classList.contains('cm-blockquote-line-last')).toBe(true);
    expect(quoteLines[1].classList.contains('cm-blockquote-line-first')).toBe(false);

    expect(codeLines).toHaveLength(4);
    expect(codeLines[0].classList.contains('cm-codeblock-line-first')).toBe(true);
    expect(codeLines[0].classList.contains('cm-codeblock-line-last')).toBe(false);
    expect(codeLines.at(-1)?.classList.contains('cm-codeblock-line-last')).toBe(true);
    expect(codeLines.at(-1)?.classList.contains('cm-codeblock-line-first')).toBe(false);

    view.destroy();
  });

  it('allows a collapsed caret on fenced-code boundaries and reveals the whole block', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const doc = [
      'before',
      '```ts',
      'const x = 1;',
      '```',
      'after',
    ].join('\n');
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        selection: { anchor: doc.indexOf('const') },
        extensions: [
          markdown({ base: markdownLanguage }),
          markdownDecoPlugin,
          knowledgeCodeBlockField,
        ],
      }),
    });
    const opening = view.state.doc.line(2);
    const closing = view.state.doc.line(4);

    view.dispatch({ selection: { anchor: opening.from } });
    expect(view.state.selection.main.anchor).toBe(opening.from);
    expect(parent.textContent).toContain('```ts');

    view.dispatch({ selection: { anchor: view.state.doc.line(3).to } });
    view.dispatch({ selection: { anchor: closing.from } });
    expect(view.state.selection.main.anchor).toBe(closing.from);
    expect(parent.textContent).toContain('```');

    view.destroy();
  });

  it('does not intercept pointer presses on a revealed fenced-code boundary', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const doc = ['```ts', 'const x = 1;', '```'].join('\n');
    const bodyPosition = doc.indexOf('const');
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        selection: { anchor: bodyPosition },
        extensions: [
          markdown({ base: markdownLanguage }),
          markdownDecoPlugin,
          knowledgeCodeBlockField,
        ],
      }),
    });
    const openingLine = parent.querySelector<HTMLElement>('.cm-codeblock-line-first');
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });

    openingLine?.dispatchEvent(event);

    expect(view.state.selection.main.anchor).toBe(0);
    expect(parent.textContent).toContain('```ts');
    view.destroy();
  });

  it('keeps the initial caret on an opening fence so its source is editable', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const doc = ['```ts', 'const x = 1;', '```'].join('\n');
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        selection: { anchor: 0 },
        extensions: [
          markdown({ base: markdownLanguage }),
          markdownDecoPlugin,
          knowledgeCodeBlockField,
        ],
      }),
    });

    view.focus();

    expect(view.state.selection.main.anchor).toBe(0);
    expect(parent.textContent).toContain('```ts');
    view.destroy();
  });

  it('does not add copy controls to inactive fenced code blocks in the markdown editor', async () => {
    window.t = ((key: string) => {
      if (key === 'attach.copy') return '复制';
      if (key === 'attach.copied') return '已复制';
      return key;
    }) as typeof window.t;
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: [
          'intro',
          '```ts',
          'const x = 1;',
          '```',
        ].join('\n'),
        extensions: [
          markdown({ base: markdownLanguage }),
          markdownDecoPlugin,
          knowledgeCodeBlockField,
        ],
      }),
    });

    const button = parent.querySelector<HTMLButtonElement>('.cm-codeblock-copy-btn');

    expect(button).toBeNull();
    button?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(writeText).not.toHaveBeenCalled();

    view.destroy();
  });
  it('reveals the whole code block source while editing inside the block', async () => {
    window.t = ((key: string) => {
      if (key === 'attach.copy') return '复制';
      if (key === 'attach.copied') return '已复制';
      return key;
    }) as typeof window.t;
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const doc = [
      'intro',
      '```ts',
      'const x = 1;',
      '```',
    ].join('\n');
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        selection: { anchor: doc.indexOf('x = 1') },
        extensions: [
          markdown({ base: markdownLanguage }),
          markdownDecoPlugin,
          knowledgeCodeBlockField,
        ],
      }),
    });

    const button = parent.querySelector<HTMLButtonElement>('.cm-codeblock-copy-btn');

    expect(button).toBeNull();
    expect(parent.textContent).toContain('```ts');
    expect(parent.textContent).toContain('```');
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(writeText).not.toHaveBeenCalled();

    view.destroy();
  });
});

describe('markdown syntax reveal lifetime', () => {
  it('renders one to six bare heading markers as body text without changing hash-prefixed words', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: ['#', '##', '###', '####', '#####', '######', '#标签', '#text'].join('\n'),
        extensions: [
          markdown({ base: markdownLanguage }),
          markdownDecoPlugin,
        ],
      }),
    });

    const lines = [...parent.querySelectorAll('.cm-line')];
    expect(lines.map(line => line.textContent)).toEqual([
      '#', '##', '###', '####', '#####', '######', '#标签', '#text',
    ]);
    for (const line of lines.slice(0, 6)) {
      expect(line.classList.contains('cm-unconfirmed-heading-line')).toBe(true);
      expect(line.classList.contains('cm-center-line')).toBe(false);
    }
    for (const line of lines.slice(6)) {
      expect(line.classList.contains('cm-unconfirmed-heading-line')).toBe(false);
      expect(line.classList.contains('cm-center-line')).toBe(false);
    }

    view.destroy();
  });

  it('keeps bare heading markers visible until space confirms the heading, then reveals them on Backspace', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: '',
        extensions: [
          markdown({ base: markdownLanguage }),
          markdownDecoPlugin,
        ],
      }),
    });

    view.dispatch({
      changes: { from: 0, insert: '#' },
      selection: { anchor: 1 },
      annotations: Transaction.userEvent.of('input.type'),
    });
    expect(parent.textContent).toBe('#');
    expect(parent.querySelector('.cm-line')?.classList.contains('cm-unconfirmed-heading-line')).toBe(true);
    expect(parent.querySelector('.cm-line')?.classList.contains('cm-center-line')).toBe(false);

    view.dispatch({
      changes: { from: 1, insert: '#' },
      selection: { anchor: 2 },
      annotations: Transaction.userEvent.of('input.type'),
    });
    expect(parent.textContent).toBe('##');
    expect(parent.querySelector('.cm-line')?.classList.contains('cm-unconfirmed-heading-line')).toBe(true);

    view.dispatch({
      changes: { from: 2, insert: ' ' },
      selection: { anchor: 3 },
      annotations: Transaction.userEvent.of('input.type'),
    });
    expect(parent.textContent).toBe('## ');
    expect(parent.querySelector('.cm-line')?.classList.contains('cm-unconfirmed-heading-line')).toBe(false);

    view.dispatch({
      changes: { from: 2, to: 3 },
      selection: { anchor: 2 },
      annotations: Transaction.userEvent.of('delete.backward'),
    });
    expect(parent.textContent).toBe('##');
    expect(parent.querySelector('.cm-line')?.classList.contains('cm-unconfirmed-heading-line')).toBe(true);

    view.dispatch({
      changes: { from: 1, to: 2 },
      selection: { anchor: 1 },
      annotations: Transaction.userEvent.of('delete.backward'),
    });
    expect(parent.textContent).toBe('#');

    view.dispatch({
      changes: { from: 0, to: 1 },
      selection: { anchor: 0 },
      annotations: Transaction.userEvent.of('delete.backward'),
    });
    expect(parent.textContent).toBe('');

    view.destroy();
  });

  it('keeps block markers visible while their line is active', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'Heading',
        selection: { anchor: 0 },
        extensions: [
          markdown({ base: markdownLanguage }),
          markdownDecoPlugin,
        ],
      }),
    });

    view.dispatch({
      changes: { from: 0, to: 0, insert: '#' },
      selection: { anchor: 1 },
      annotations: Transaction.userEvent.of('input.type'),
    });
    expect(parent.textContent).toBe('#Heading');

    view.dispatch({
      changes: { from: 1, to: 1, insert: '#' },
      selection: { anchor: 2 },
      annotations: Transaction.userEvent.of('input.type'),
    });
    expect(parent.textContent).toBe('##Heading');

    view.dispatch({
      changes: { from: 2, to: 2, insert: ' ' },
      selection: { anchor: 3 },
      annotations: Transaction.userEvent.of('input.type'),
    });
    expect(parent.textContent).toBe('## Heading');

    view.dispatch({ selection: { anchor: 5 } });
    expect(parent.textContent).toBe('## Heading');

    view.destroy();
  });
});
