/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { waitFor } from '@testing-library/dom';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createKnowledgeSafeHtmlField,
  type KnowledgeSafeHtmlFieldConfig,
} from '../../editor/knowledge-safe-html-field';
import { knowledgeMarkdownModeExtensions } from '../../editor/knowledge-live-preview';

const page = {
  sourceKey: 'notes',
  relativePath: 'Guides/Start.md',
} as const;

function editor(
  doc: string,
  config: KnowledgeSafeHtmlFieldConfig,
  selection?: EditorSelection,
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
        createKnowledgeSafeHtmlField(config),
      ],
    }),
  });
}

describe('knowledge safe HTML field', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.t = ((key: string) => ({
      'knowledge.html.preview': 'Safe preview',
      'knowledge.html.unsafe': 'Unsafe HTML',
      'knowledge.html.unsafeEditSource': 'Edit unsafe source',
      'knowledge.html.assetLoading': 'Loading asset',
      'knowledge.html.assetUnavailable': 'Asset unavailable',
    }[key] ?? key)) as typeof window.t;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:controlled-preview'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (URL as Partial<typeof URL>).createObjectURL;
    delete (URL as Partial<typeof URL>).revokeObjectURL;
    document.body.innerHTML = '';
  });

  it('renders inline and block HTML only after every selection leaves their source', () => {
    const doc = [
      'before <mark>**safe**</mark> after',
      '<details>',
      '<summary>More</summary>',
      '',
      '- one',
      '</details>',
    ].join('\n');
    const inline = doc.indexOf('<mark>');
    const block = doc.indexOf('<details>');
    const view = editor(
      doc,
      { pageAddress: page },
      EditorSelection.create([
        EditorSelection.cursor(inline + 2),
        EditorSelection.cursor(block + 2),
      ]),
    );

    expect(view.dom.querySelector('.cm-knowledge-safe-html')).toBeNull();
    view.dispatch({ selection: { anchor: 0 } });
    expect(view.dom.querySelector('.cm-knowledge-safe-html-inline mark strong'))
      .toHaveTextContent('safe');
    expect(view.dom.querySelector('.cm-knowledge-safe-html-block details li'))
      .toHaveTextContent('one');
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it('shows an inert nonblocking status for dangerous HTML and returns to source', () => {
    const doc = '<script>alert(1)</script>';
    const view = editor(
      doc,
      { pageAddress: page },
      EditorSelection.create([EditorSelection.cursor(doc.length)]),
    );
    const status = view.dom.querySelector<HTMLElement>(
      '.cm-knowledge-safe-html.is-error',
    )!;

    expect(status).toHaveTextContent('Unsafe HTML');
    expect(status.querySelector('script, iframe, style')).toBeNull();
    status.focus();
    expect(view.state.selection.main.head).toBe(0);
    expect(view.dom.querySelector('.cm-knowledge-safe-html')).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it('never activates an external link on render, hover, focus, or scroll', () => {
    const activate = vi.fn();
    const doc = '<a href="https://example.com/page">site</a>';
    const view = editor(doc, {
      pageAddress: page,
      onActivateLink: activate,
    }, EditorSelection.create([EditorSelection.cursor(doc.length)]));
    const link = view.dom.querySelector<HTMLElement>(
      '[data-knowledge-link-kind="external"]',
    )!;
    expect(link, view.dom.innerHTML).not.toBeNull();

    link.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    link.focus();
    view.scrollDOM.dispatchEvent(new Event('scroll'));
    expect(activate).not.toHaveBeenCalled();

    link.click();
    expect(activate).toHaveBeenCalledOnce();
    expect(activate).toHaveBeenCalledWith({
      kind: 'external',
      url: 'https://example.com/page',
    });
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it('reads a same-source local Asset as base64 and releases its controlled URL', async () => {
    const readAsset = vi.fn(async () => ({
      content: btoa('png-bytes'),
      encoding: 'base64' as const,
    }));
    const doc = '<img src="../Assets/picture.png" alt="Picture">';
    const view = editor(
      doc,
      { pageAddress: page, readAsset },
      EditorSelection.create([EditorSelection.cursor(doc.length)]),
    );

    expect(readAsset).toHaveBeenCalledWith(
      {
        sourceKey: 'notes',
        relativePath: 'Assets/picture.png',
      },
      { signal: expect.any(AbortSignal) },
    );
    await waitFor(() => {
      expect(view.dom.querySelector('img')).toHaveAttribute(
        'src',
        'blob:controlled-preview',
      );
    });
    expect(view.dom.querySelector('img')).toHaveAttribute('alt', 'Picture');
    view.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:controlled-preview');
  });

  it('cancels an in-flight ResourceIO read when the preview is destroyed', () => {
    let signal: AbortSignal | undefined;
    const readAsset = vi.fn((_address, options) => {
      signal = options.signal;
      return new Promise<never>(() => {});
    });
    const view = editor(
      '<img src="../Assets/picture.png">',
      { pageAddress: page, readAsset },
      EditorSelection.create([
        EditorSelection.cursor('<img src="../Assets/picture.png">'.length),
      ]),
    );

    expect(signal?.aborted).toBe(false);
    view.destroy();
    expect(signal?.aborted).toBe(true);
  });

  it('keeps version-conflicted or unavailable Asset bytes as a nonblocking status', async () => {
    const readAsset = vi.fn(async () => ({
      content: btoa('short'),
      encoding: 'base64' as const,
      expectedSize: 100,
    }));
    const doc = '<img src="../Assets/picture.png">';
    const view = editor(
      doc,
      { pageAddress: page, readAsset },
      EditorSelection.create([EditorSelection.cursor(doc.length)]),
    );

    await waitFor(() => {
      expect(view.dom.querySelector('.cm-knowledge-safe-html-asset.is-error'))
        .toHaveTextContent('Asset unavailable');
    });
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it('keeps raw HTML literal in Source mode', () => {
    const doc = '<details><summary>Title</summary>body</details>';
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [
          knowledgeMarkdownModeExtensions('source', [
            createKnowledgeSafeHtmlField({ pageAddress: page }),
          ]),
        ],
      }),
    });

    expect(view.dom.querySelector('.cm-knowledge-safe-html')).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });
});
