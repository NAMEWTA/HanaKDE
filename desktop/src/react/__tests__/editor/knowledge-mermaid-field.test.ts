/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import {
  EditorSelection,
  EditorState,
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
  collectKnowledgeMermaidBlocks,
  knowledgeMermaidField,
} from '../../editor/knowledge-mermaid-field';
import { knowledgeMarkdownModeExtensions } from '../../editor/knowledge-live-preview';
import { __setMermaidLoaderForTests } from '../../utils/mermaid-renderer';

function editor(doc: string, selection?: EditorSelection): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection,
      extensions: [EditorState.allowMultipleSelections.of(true), knowledgeMermaidField],
    }),
  });
}

describe('knowledge Mermaid field', () => {
  const initialize = vi.fn();
  const render = vi.fn(
    async (
      id: string,
      source: string,
    ): Promise<{ svg: string; bindFunctions?: (element: Element) => void }> => ({
      svg: `<svg data-id="${id}"><text>${source}</text></svg>`,
    }),
  );

  beforeEach(() => {
    document.body.innerHTML = '';
    initialize.mockClear();
    render.mockClear();
    window.t = ((key: string) => ({
      'knowledge.mermaid.editSource': 'Edit Mermaid source',
      'knowledge.mermaid.loading': 'Rendering Mermaid diagram…',
      'knowledge.mermaid.renderError': 'Diagram error',
    }[key] ?? key)) as typeof window.t;
    __setMermaidLoaderForTests(async () => ({ initialize, render }));
  });

  afterEach(() => {
    __setMermaidLoaderForTests(null);
    document.body.innerHTML = '';
  });

  it('collects compatible Mermaid fences without changing their exact source', () => {
    const source = [
      'intro',
      '````mermaid',
      'graph TD',
      '  A-->B',
      '```',
      '````',
    ].join('\n');

    expect(collectKnowledgeMermaidBlocks(source)).toEqual([
      expect.objectContaining({
        from: 6,
        source: 'graph TD\n  A-->B\n```',
        startLine: 2,
        endLine: 6,
      }),
    ]);
  });

  it('renders only after every cursor and selection leaves the whole fence', async () => {
    const doc = 'outside\n```mermaid\ngraph TD\nA-->B\n```\nafter';
    const inside = doc.indexOf('A-->B') + 1;
    const view = editor(
      doc,
      EditorSelection.create([
        EditorSelection.cursor(0),
        EditorSelection.range(inside, inside + 2),
      ]),
    );

    expect(view.dom.querySelector('.cm-mermaid-widget')).toBeNull();
    expect(render).not.toHaveBeenCalled();

    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(0),
        EditorSelection.cursor(doc.length),
      ]),
    });
    await vi.waitFor(() => {
      expect(view.dom.querySelector('.cm-mermaid-widget svg')).toBeInstanceOf(SVGElement);
    });
    expect(render).toHaveBeenCalledTimes(1);
    view.destroy();
  });

  it('uses fixed strict config, discards event binding, and sanitizes active SVG', async () => {
    const bindFunctions = vi.fn();
    render.mockResolvedValueOnce({
      svg: [
        '<svg id="safe-diagram" onload="alert(1)">',
        '<style>',
        '#safe-diagram text{fill:red;animation:dash 1s infinite}',
        'body{fill:black}',
        '@keyframes dash{to{stroke-dashoffset:0}}',
        '</style>',
        '<script>alert(1)</script>',
        '<foreignObject><iframe src="https://evil.test"></iframe></foreignObject>',
        '<image href="javascript:alert(1)"/>',
        '<text style="fill:blue;stroke:url(https://evil.test)" onclick="alert(1)">safe</text>',
        '</svg>',
      ].join(''),
      bindFunctions,
    });
    const maliciousConfig = [
      '%%{init: {"securityLevel":"loose","flowchart":{"htmlLabels":true}}}%%',
      'graph TD',
      'A-->B',
    ].join('\n');
    const view = editor(`outside\n\`\`\`mermaid\n${maliciousConfig}\n\`\`\``);

    await vi.waitFor(() => {
      expect(view.dom.querySelector('.cm-mermaid-widget')).toHaveClass('is-rendered');
    });
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({
      startOnLoad: false,
      securityLevel: 'strict',
      htmlLabels: false,
      secure: expect.arrayContaining([
        'securityLevel',
        'flowchart',
        'htmlLabels',
        'themeCSS',
        'themeVariables',
      ]),
      flowchart: expect.objectContaining({ htmlLabels: false }),
    }));
    expect(bindFunctions).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledWith(expect.any(String), maliciousConfig);
    const svg = view.dom.querySelector('.cm-mermaid-widget svg');
    expect(svg?.querySelector('text')?.textContent).toBe('safe');
    expect(svg?.querySelector('script, foreignObject, iframe, image')).toBeNull();
    expect(svg?.querySelector('[onload], [onclick]')).toBeNull();
    expect(svg?.querySelector('style')?.textContent).toContain(
      '#safe-diagram text{fill:red}',
    );
    expect(svg?.querySelector('style')?.textContent).not.toMatch(
      /body|animation|keyframes/i,
    );
    expect(svg?.querySelector('text')?.getAttribute('style')).toBe('fill:blue');
    view.destroy();
  });

  it('cancels a departed widget and never lets its stale result replace newer source', async () => {
    let resolveOld!: (result: { svg: string }) => void;
    render.mockImplementation((_id: string, source: string) => {
      if (source.includes('A-->B')) {
        return new Promise<{ svg: string }>((resolve) => {
          resolveOld = resolve;
        });
      }
      return Promise.resolve({ svg: `<svg><text>${source}</text></svg>` });
    });
    const doc = 'outside\n```mermaid\ngraph TD\nA-->B\n```';
    const view = editor(doc);
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));

    const arrow = view.state.doc.toString().indexOf('A-->B');
    view.dispatch({ selection: { anchor: arrow + 1 } });
    view.dispatch({ changes: { from: arrow, to: arrow + 5, insert: 'A-->C' } });
    view.dispatch({ selection: { anchor: 0 } });

    await vi.waitFor(() => {
      expect(view.dom.querySelector('.cm-mermaid-widget text')?.textContent).toContain('A-->C');
    });
    resolveOld({ svg: '<svg><text>stale A-->B</text></svg>' });
    await Promise.resolve();
    await Promise.resolve();
    expect(view.dom.querySelector('.cm-mermaid-widget text')?.textContent).toContain('A-->C');
    expect(view.dom.textContent).not.toContain('stale A-->B');
    view.destroy();
  });

  it('caches identical source and isolates a failed block from the document', async () => {
    render.mockImplementation(async (_id: string, source: string) => {
      if (source === 'bad') throw new Error('parse failed');
      return { svg: `<svg><text>${source}</text></svg>` };
    });
    const doc = [
      'outside',
      '```mermaid',
      'same',
      '```',
      '```mermaid',
      'same',
      '```',
      '```mermaid',
      'bad',
      '```',
    ].join('\n');
    const view = editor(doc);

    await vi.waitFor(() => {
      expect(view.dom.querySelectorAll('.cm-mermaid-widget.is-rendered')).toHaveLength(2);
      expect(view.dom.querySelector('.cm-mermaid-widget.is-error')?.textContent).toBe('Diagram error');
    });
    expect(render).toHaveBeenCalledTimes(2);
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it('returns to source by pointer or keyboard and is absent from Source mode', async () => {
    const doc = 'outside\n```mermaid\ngraph TD\nA-->B\n```';
    const view = editor(doc);
    await vi.waitFor(() => {
      expect(view.dom.querySelector('.cm-mermaid-widget')).toBeInstanceOf(HTMLElement);
    });
    const widget = view.dom.querySelector<HTMLElement>('.cm-mermaid-widget')!;
    expect(widget).toHaveAttribute('role', 'button');
    expect(widget).toHaveAttribute('aria-label', 'Edit Mermaid source');
    widget.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }));
    expect(view.state.selection.main.head).toBe(doc.indexOf('```mermaid'));
    expect(view.dom.querySelector('.cm-mermaid-widget')).toBeNull();
    view.destroy();

    const sourceParent = document.createElement('div');
    document.body.appendChild(sourceParent);
    const sourceView = new EditorView({
      parent: sourceParent,
      state: EditorState.create({
        doc,
        extensions: [knowledgeMarkdownModeExtensions('source', [knowledgeMermaidField])],
      }),
    });
    expect(sourceView.dom.querySelector('.cm-mermaid-widget')).toBeNull();
    expect(sourceView.state.doc.toString()).toBe(doc);
    sourceView.destroy();
  });
});
