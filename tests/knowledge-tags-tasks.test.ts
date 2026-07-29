/**
 * @vitest-environment jsdom
 */
import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractKnowledgePageTags,
} from '../lib/knowledge-workspace/knowledge-tags.ts';
import {
  MarkdownKnowledgeIrAbortError,
} from '../lib/knowledge-workspace/markdown-knowledge-ir.ts';
import {
  taskField,
  togglePageTask,
} from '../desktop/src/react/editor/task-field.ts';

function createTaskView(
  doc: string,
  extensions: Parameters<typeof EditorState.create>[0]['extensions'] = [],
): { parent: HTMLElement; view: EditorView } {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [taskField, extensions],
    }),
  });
  return { parent, view };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('KW-US-175 source-scoped page tags', () => {
  it('accepts one Frontmatter string without splitting spaces or commas', () => {
    const page = extractKnowledgePageTags(
      'main',
      '---\ntags: "  café, research notes  "\n---\nbody',
    );

    expect(page).toEqual({
      sourceKey: 'main',
      tags: [{
        tag: 'café, research notes',
        origins: ['frontmatter'],
      }],
    });
  });

  it('normalizes NFC, preserves case, rejects controls, and dedupes exact values', () => {
    const source = [
      '---',
      String.raw`tags: [" é ", "é", "Tag", "tag", "", "bad\u0007"]`,
      '---',
      '#é #Tag #body #body',
    ].join('\n');

    expect(extractKnowledgePageTags('main', source).tags).toEqual([
      { tag: 'é', origins: ['frontmatter', 'body'] },
      { tag: 'Tag', origins: ['frontmatter', 'body'] },
      { tag: 'tag', origins: ['frontmatter'] },
      { tag: 'body', origins: ['body'] },
    ]);
  });

  it.each([
    '42',
    '["ok", 42]',
    '[["nested"]]',
    '{ nested: true }',
  ])('ignores an unsupported Frontmatter tags value %s', (value) => {
    const source = `---\ntags: ${value}\n---\n#body`;
    expect(extractKnowledgePageTags('main', source).tags).toEqual([
      { tag: 'body', origins: ['body'] },
    ]);
  });

  it('applies the complete body boundary matrix through the shared IR', () => {
    const source = [
      '# Heading',
      '#visible #123 #1a #-a #/a',
      String.raw`word#joined _#joined /#joined \#escaped ##double`,
      '`#inline`',
      '```md',
      '#fenced',
      '```',
      'https://example.test/#url',
      '<https://example.test/#auto>',
      '[label](docs/#destination)',
    ].join('\n');

    expect(extractKnowledgePageTags('main', source).tags).toEqual([
      { tag: 'visible', origins: ['body'] },
      { tag: '1a', origins: ['body'] },
      { tag: '-a', origins: ['body'] },
      { tag: '/a', origins: ['body'] },
    ]);
  });

  it('does not derive Frontmatter tags from malformed YAML', () => {
    const source = '---\ntags: ["broken"\n---\n#body';
    expect(extractKnowledgePageTags('main', source).tags).toEqual([
      { tag: 'body', origins: ['body'] },
    ]);
  });

  it('reuses the lossless projection boundary instead of reading part of complex YAML', () => {
    const source = [
      '---',
      'tags: ["frontmatter-must-not-project"]',
      'nested:',
      '  value: true',
      '---',
      '#body',
    ].join('\n');
    expect(extractKnowledgePageTags('main', source).tags).toEqual([
      { tag: 'body', origins: ['body'] },
    ]);
  });

  it('keeps identical page tags in separate source projections', () => {
    const main = extractKnowledgePageTags('main', '#same');
    const mounted = extractKnowledgePageTags('research', '#same');

    expect(main.sourceKey).toBe('main');
    expect(mounted.sourceKey).toBe('research');
    expect(main.tags).toEqual(mounted.tags);
    expect(main).not.toEqual(mounted);
  });

  it('cancels without returning a partial projection', () => {
    const controller = new AbortController();
    controller.abort();

    expect(() => extractKnowledgePageTags(
      'main',
      '#tag\n'.repeat(2_000),
      { signal: controller.signal },
    )).toThrow(MarkdownKnowledgeIrAbortError);
  });
});

describe('KW-US-176 page task transactions', () => {
  it('renders only shared-IR GFM task markers with native accessible controls', () => {
    const { parent, view } = createTaskView([
      '- [ ] open',
      '- [X] complete',
      'paragraph [ ] text',
      '> [x] quoted text',
      '`- [ ] inline code`',
      '```md',
      '- [x] fenced',
      '```',
    ].join('\n'));
    const tasks = [...parent.querySelectorAll<HTMLInputElement>('.cm-page-task')];

    expect(tasks).toHaveLength(2);
    expect(tasks.map(task => task.checked)).toEqual([false, true]);
    expect(tasks.map(task => task.getAttribute('aria-label'))).toEqual([
      'knowledge.task.open',
      'knowledge.task.completed',
    ]);
    expect(tasks.every(task => task.type === 'checkbox' && task.tabIndex === 0)).toBe(true);
    view.destroy();
  });

  it('writes exactly one canonical marker in one transaction and one undo step', () => {
    const updates: number[] = [];
    const source = '- [ ] open';
    const { parent, view } = createTaskView(source, [
      history(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) updates.push(update.transactions.length);
      }),
    ]);

    parent.querySelector<HTMLInputElement>('.cm-page-task')?.click();

    expect(view.state.doc.toString()).toBe('- [x] open');
    expect(updates).toEqual([1]);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    view.destroy();
  });

  it('normalizes an accepted uppercase marker to open on toggle', () => {
    const { parent, view } = createTaskView('- [X] complete');

    parent.querySelector<HTMLInputElement>('.cm-page-task')?.click();

    expect(view.state.doc.toString()).toBe('- [ ] complete');
    view.destroy();
  });

  it('refuses stale marker positions and read-only editors without mutation', () => {
    const stale = createTaskView('- [ ] open');
    stale.view.dispatch({ changes: { from: 0, to: 1, insert: 'p' } });
    const staleSource = stale.view.state.doc.toString();
    expect(togglePageTask(stale.view, 2)).toBe('not_task');
    expect(stale.view.state.doc.toString()).toBe(staleSource);
    stale.view.destroy();

    const locked = createTaskView('- [ ] locked', [
      EditorState.readOnly.of(true),
    ]);
    const input = locked.parent.querySelector<HTMLInputElement>('.cm-page-task');
    expect(input?.disabled).toBe(true);
    expect(togglePageTask(locked.view, 2)).toBe('read_only');
    expect(locked.view.state.doc.toString()).toBe('- [ ] locked');
    locked.view.destroy();
  });

  it('does not hide a dispatch failure or mutate before the failed transaction', () => {
    const { view } = createTaskView('- [ ] open');
    const source = view.state.doc.toString();
    const failedView = {
      state: view.state,
      dispatch: vi.fn(() => {
        throw new Error('injected dispatch failure');
      }),
    } as unknown as EditorView;

    expect(() => togglePageTask(failedView, 2)).toThrow('injected dispatch failure');
    expect(view.state.doc.toString()).toBe(source);
    expect(failedView.dispatch).toHaveBeenCalledTimes(1);
    view.destroy();
  });
});
