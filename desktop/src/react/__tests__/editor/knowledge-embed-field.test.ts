/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { history, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  Compartment,
  EditorSelection,
  EditorState,
} from '@codemirror/state';
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
  createKnowledgeEmbedField,
  extractKnowledgeEmbedSection,
  KNOWLEDGE_EMBED_MAX_DEPTH,
  type KnowledgeEmbedFieldConfig,
  type KnowledgeEmbedPageReadResult,
} from '../../editor/knowledge-embed-field';
import { createMarkdownLivePreviewExtensions } from '../../editor/create-markdown-editor-extensions';
import {
  knowledgeMarkdownModeExtensions,
  reconfigureKnowledgeMarkdownMode,
} from '../../editor/knowledge-live-preview';

const host = {
  sourceKey: 'main',
  relativePath: 'Notes/Host.md',
} as const;

const views: EditorView[] = [];

function editor(
  doc: string,
  config: KnowledgeEmbedFieldConfig,
): EditorView {
  const parent = document.body.appendChild(document.createElement('div'));
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(doc.length),
      extensions: [
        history(),
        createKnowledgeEmbedField(config),
      ],
    }),
  });
  views.push(view);
  return view;
}

function pageReader(
  pages: Readonly<Record<string, string | KnowledgeEmbedPageReadResult>>,
) {
  return vi.fn(async (address): Promise<KnowledgeEmbedPageReadResult> => {
    const value = pages[address.relativePath];
    if (typeof value === 'string') return { ok: true, content: value };
    return value ?? { ok: false, reason: 'missing' };
  });
}

function config(
  pages: Readonly<Record<string, string | KnowledgeEmbedPageReadResult>>,
  overrides: Partial<KnowledgeEmbedFieldConfig> = {},
): KnowledgeEmbedFieldConfig {
  return {
    pageAddress: host,
    readPage: pageReader(pages),
    ...overrides,
  };
}

describe('knowledge embed field', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    window.t = ((key: string, params?: Record<string, string | number>) => {
      const messages: Record<string, string> = {
        'knowledge.embed.loading': 'Loading embed',
        'knowledge.embed.openPage': 'Open {path}',
        'knowledge.embed.cycle': 'Circular embed',
        'knowledge.embed.depth': 'Depth limit',
        'knowledge.embed.missing': 'Missing embed',
        'knowledge.embed.sectionMissing': 'Missing section',
        'knowledge.embed.unavailable': 'Unavailable embed',
        'knowledge.embed.tooLarge': 'Large embed',
        'knowledge.embed.invalidEncoding': 'Invalid embed',
      };
      return (messages[key] ?? key).replace(
        /\{(\w+)\}/gu,
        (_, name: string) => String(params?.[name] ?? `{${name}}`),
      );
    }) as typeof window.t;
  });

  afterEach(() => {
    while (views.length > 0) views.pop()?.destroy();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('extracts the first exact section through deeper headings and stops at a peer', () => {
    const source = [
      '# Root',
      'before',
      '## Target',
      'body',
      '### Child',
      'child body',
      '## Next',
      'after',
      '## Target',
      'second',
    ].join('\n');

    expect(extractKnowledgeEmbedSection(source, 'Target')).toEqual({
      ok: true,
      content: [
        '## Target',
        'body',
        '### Child',
        'child body',
        '',
      ].join('\n'),
      from: source.indexOf('## Target'),
      to: source.indexOf('## Next'),
    });
    expect(extractKnowledgeEmbedSection(source, 'target')).toEqual({
      ok: false,
      reason: 'section_missing',
    });
  });

  it('renders saved whole-page and exact-section content without changing host source or history', async () => {
    const source = [
      '# Source',
      'intro',
      '## Exact',
      '**selected**',
      '### Child',
      'child',
      '## Later',
      'hidden',
    ].join('\n');
    const doc = 'before\n\n![[Pages/Source.md#Exact]]\n\nafter';
    const readPage = pageReader({ 'Pages/Source.md': source });
    const view = editor(doc, {
      pageAddress: host,
      readPage,
    });

    await waitFor(() => {
      expect(view.dom.querySelector('.cm-knowledge-embed-content h2'))
        .toHaveTextContent('Exact');
    });
    expect(view.dom.querySelector('.cm-knowledge-embed-content strong'))
      .toHaveTextContent('selected');
    expect(view.dom.querySelector('.cm-knowledge-embed-content h3'))
      .toHaveTextContent('Child');
    expect(view.dom.querySelector('.cm-knowledge-embed-content')).toHaveAttribute(
      'contenteditable',
      'false',
    );
    expect(view.dom.querySelector('.cm-knowledge-embed-content'))
      .not.toHaveTextContent('Later');
    expect(readPage).toHaveBeenCalledWith(
      { sourceKey: 'main', relativePath: 'Pages/Source.md' },
      { signal: expect.any(AbortSignal) },
    );
    expect(view.state.doc.toString()).toBe(doc);
    expect(undo(view)).toBe(false);
  });

  it('coexists with knowledge links in Live Preview and preserves raw syntax in Source mode', async () => {
    const doc = '![[Source.md]]\n\ncursor';
    const readPage = pageReader({ 'Source.md': '# Saved source' });
    const livePreview = createMarkdownLivePreviewExtensions({
      imageContext: {},
      knowledgeLinks: { pageAddress: host },
      knowledgeEmbeds: {
        pageAddress: host,
        readPage,
      },
    });
    const mode = new Compartment();
    const parent = document.body.appendChild(document.createElement('div'));
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        selection: EditorSelection.cursor(doc.length),
        extensions: [
          markdown({ base: markdownLanguage }),
          mode.of(knowledgeMarkdownModeExtensions('live-preview', livePreview)),
        ],
      }),
    });
    views.push(view);

    await waitFor(() => {
      expect(view.dom.querySelector('.cm-knowledge-embed-content h1'))
        .toHaveTextContent('Saved source');
    });
    expect(view.state.doc.toString()).toBe(doc);

    expect(reconfigureKnowledgeMarkdownMode(
      view,
      mode,
      'source',
      livePreview,
    )).toBe('changed');
    expect(view.dom.querySelector('.cm-knowledge-embed')).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
    expect(view.dom).toHaveTextContent('![[Source.md]]');
  });

  it('resolves embedded links against the source Page and gives explicit targets click priority', async () => {
    const activatePage = vi.fn();
    const activateLink = vi.fn();
    const view = editor('![[Guides/Source.md]]', config({
      'Guides/Source.md': [
        'Plain source text.',
        '[Child](Child.md#Part)',
        '[Web](https://example.com/docs)',
      ].join('\n\n'),
    }, {
      onActivatePage: activatePage,
      onActivateLink: activateLink,
    }));

    await waitFor(() => {
      expect(view.dom.querySelectorAll('.cm-knowledge-embed-content a'))
        .toHaveLength(2);
    });
    const links = view.dom.querySelectorAll<HTMLAnchorElement>(
      '.cm-knowledge-embed-content a',
    );
    links[0]?.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      button: 0,
    }));
    links[1]?.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      button: 0,
    }));
    expect(activateLink).toHaveBeenNthCalledWith(1, {
      kind: 'internal',
      address: {
        sourceKey: 'main',
        relativePath: 'Guides/Child.md',
      },
      fragment: 'Part',
    });
    expect(activateLink).toHaveBeenNthCalledWith(2, {
      kind: 'external',
      url: 'https://example.com/docs',
    });
    expect(activatePage).not.toHaveBeenCalled();

    view.dom.querySelector('p')?.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      button: 0,
    }));
    expect(activatePage).toHaveBeenCalledWith({
      address: {
        sourceKey: 'main',
        relativePath: 'Guides/Source.md',
      },
      fragment: null,
    });
  });

  it('renders nested branches independently and stops a full-address cycle locally', async () => {
    const view = editor(
      '![[B.md]]\n\n![[C.md]]',
      config({
        'B.md': 'B before\n\n![[Notes/Host.md]]\n\nB after',
        'C.md': '# C survives',
      }),
    );

    await waitFor(() => {
      expect(view.dom.querySelector('.cm-knowledge-embed-status.is-cycle'))
        .toHaveTextContent('Circular embed');
      expect(view.dom).toHaveTextContent('C survives');
    });
    expect(view.dom).toHaveTextContent('B before');
    expect(view.dom).toHaveTextContent('B after');
    expect(view.dom.querySelectorAll('.cm-knowledge-embed')).toHaveLength(2);
  });

  it('bounds acyclic recursion while preserving already-rendered outer content', async () => {
    const pages: Record<string, string> = {};
    for (let index = 1; index <= KNOWLEDGE_EMBED_MAX_DEPTH + 1; index += 1) {
      pages[`P${index}.md`] = `P${index}\n\n![[P${index + 1}.md]]`;
    }
    const readPage = pageReader(pages);
    const view = editor('![[P1.md]]', {
      pageAddress: host,
      readPage,
    });

    await waitFor(() => {
      expect(view.dom.querySelector('.cm-knowledge-embed-status.is-depth'))
        .toHaveTextContent('Depth limit');
    });
    expect(view.dom).toHaveTextContent('P1');
    expect(view.dom).toHaveTextContent(`P${KNOWLEDGE_EMBED_MAX_DEPTH}`);
    expect(readPage).toHaveBeenCalledTimes(KNOWLEDGE_EMBED_MAX_DEPTH);
  });

  it('shows independent nonblocking states for missing, unavailable, invalid, large, and absent sections', async () => {
    const view = editor(
      [
        '![[Missing.md]]',
        '![[Unavailable.md]]',
        '![[Invalid.md]]',
        '![[Large.md]]',
        '![[Present.md#Absent]]',
      ].join('\n\n'),
      config({
        'Unavailable.md': { ok: false, reason: 'unavailable' },
        'Invalid.md': { ok: false, reason: 'invalid_utf8' },
        'Large.md': { ok: false, reason: 'content_too_large' },
        'Present.md': '# Present',
      }),
    );

    await waitFor(() => {
      expect(view.dom.querySelector('.is-missing')).toHaveTextContent('Missing embed');
      expect(view.dom.querySelector('.is-unavailable')).toHaveTextContent('Unavailable embed');
      expect(view.dom.querySelector('.is-invalid-utf8')).toHaveTextContent('Invalid embed');
      expect(view.dom.querySelector('.is-content-too-large')).toHaveTextContent('Large embed');
      expect(view.dom.querySelector('.is-section-missing')).toHaveTextContent('Missing section');
    });
  });

  it('contains a provider failure inside the affected embed branch', async () => {
    const readPage = vi.fn(async () => {
      throw new Error('provider denied access');
    });
    const view = editor('![[Denied.md]]', {
      pageAddress: host,
      readPage,
    });

    await waitFor(() => {
      expect(view.dom.querySelector('.is-unavailable'))
        .toHaveTextContent('Unavailable embed');
    });
    expect(view.state.doc.toString()).toBe('![[Denied.md]]');
  });

  it('ignores cross-source and non-Page embeds without reading or guessing', async () => {
    const readPage = pageReader({});
    const doc = '![[other:Page.md]] ![[Asset.pdf]] ![[Image.png]]';
    const view = editor(doc, {
      pageAddress: host,
      readPage,
    });

    await Promise.resolve();
    expect(readPage).not.toHaveBeenCalled();
    expect(view.dom.querySelector('.cm-knowledge-embed')).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('cancels every pending ResourceIO read when the widget is destroyed', () => {
    let signal: AbortSignal | undefined;
    const readPage = vi.fn((_address, options) => {
      signal = options.signal;
      return new Promise<KnowledgeEmbedPageReadResult>(() => {});
    });
    const view = editor('![[Slow.md]]', {
      pageAddress: host,
      readPage,
    });

    expect(signal?.aborted).toBe(false);
    view.destroy();
    views.splice(views.indexOf(view), 1);
    expect(signal?.aborted).toBe(true);
  });

  it('lets a real text selection win over plain-area opening', async () => {
    const activatePage = vi.fn();
    const view = editor('![[Source.md]]', config({
      'Source.md': 'Selectable text',
    }, {
      onActivatePage: activatePage,
    }));
    await waitFor(() => {
      expect(view.dom.querySelector('.cm-knowledge-embed-content p'))
        .toHaveTextContent('Selectable text');
    });
    const paragraph = view.dom.querySelector('p')!;
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      anchorNode: paragraph.firstChild,
      focusNode: paragraph.firstChild,
      toString: () => 'Selectable',
    } as unknown as Selection);

    paragraph.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      button: 0,
    }));
    expect(activatePage).not.toHaveBeenCalled();
  });

  it('re-reads saved content after a refresh-key compartment update and sanitizes active HTML', async () => {
    const compartment = new Compartment();
    let content = 'old <script>alert(1)</script>';
    const readPage = vi.fn(async (): Promise<KnowledgeEmbedPageReadResult> => ({
      ok: true,
      content,
    }));
    const parent = document.body.appendChild(document.createElement('div'));
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: '![[Source.md]]',
        selection: EditorSelection.cursor('![[Source.md]]'.length),
        extensions: [
          compartment.of(createKnowledgeEmbedField({
            pageAddress: host,
            refreshKey: 'v1',
            readPage,
          })),
        ],
      }),
    });
    views.push(view);
    await waitFor(() => expect(view.dom).toHaveTextContent('old'));
    expect(view.dom.querySelector('script')).toBeNull();

    content = 'new saved content';
    view.dispatch({
      effects: compartment.reconfigure(createKnowledgeEmbedField({
        pageAddress: host,
        refreshKey: 'v2',
        readPage,
      })),
    });
    await waitFor(() => expect(view.dom).toHaveTextContent('new saved content'));
    expect(view.dom).not.toHaveTextContent('old');
    expect(readPage).toHaveBeenCalledTimes(2);
    expect(view.state.doc.toString()).toBe('![[Source.md]]');
  });
});
