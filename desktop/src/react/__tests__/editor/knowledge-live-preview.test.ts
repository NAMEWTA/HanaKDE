/**
 * @vitest-environment jsdom
 */
import { history, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMarkdownLivePreviewExtensions } from '../../editor/create-markdown-editor-extensions';
import {
  getKnowledgeMarkdownViewMode,
  knowledgeMarkdownModeExtensions,
  reconfigureKnowledgeMarkdownMode,
} from '../../editor/knowledge-live-preview';
import {
  createKnowledgeDocumentRegistry,
  knowledgeDocumentKey,
} from '../../stores/knowledge-document-registry';

const views: EditorView[] = [];

function createView(
  doc: string,
  selection = doc.length,
  onUpdate?: (docChanged: boolean) => void,
) {
  const parent = document.body.appendChild(document.createElement('div'));
  const compartment = new Compartment();
  const live = createMarkdownLivePreviewExtensions({ imageContext: {} });
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor: selection },
      extensions: [
        markdown({ base: markdownLanguage }),
        history(),
        compartment.of(knowledgeMarkdownModeExtensions('live-preview', live)),
        ...(onUpdate
          ? [EditorView.updateListener.of(update => onUpdate(update.docChanged))]
          : []),
      ],
    }),
  });
  views.push(view);
  return {
    view,
    parent,
    compartment,
    live,
  };
}

function lineText(parent: HTMLElement, number: number): string {
  return parent.querySelectorAll('.cm-line')[number - 1]?.textContent ?? '';
}

afterEach(() => {
  while (views.length > 0) views.pop()?.destroy();
  document.body.replaceChildren();
});

describe('knowledge live preview modes', () => {
  it('switches on the same EditorView without content changes, saving, or history loss', async () => {
    const updates: boolean[] = [];
    const save = vi.fn();
    const source = '# Title\n\n**bold**\n\nplain';
    const {
      view, parent, compartment, live,
    } = createView(source, source.length, changed => updates.push(changed));
    const originalView = view;
    view.scrollDOM.scrollTop = 73;
    view.scrollDOM.scrollLeft = 11;

    expect(getKnowledgeMarkdownViewMode(view.state)).toBe('live-preview');
    await vi.waitFor(() => {
      expect(lineText(parent, 1)).toBe('Title');
      expect(lineText(parent, 3)).toBe('bold');
    });

    const sourceResult = reconfigureKnowledgeMarkdownMode(
      view,
      compartment,
      'source',
      live,
    );
    expect(sourceResult).toBe('changed');
    expect(view).toBe(originalView);
    expect(view.state.doc.toString()).toBe(source);
    expect(getKnowledgeMarkdownViewMode(view.state)).toBe('source');
    expect(lineText(parent, 1)).toBe('# Title');
    expect(lineText(parent, 3)).toBe('**bold**');
    expect(view.scrollDOM.scrollTop).toBe(73);
    expect(view.scrollDOM.scrollLeft).toBe(11);

    view.dispatch({ changes: { from: source.length, insert: '!' } });
    expect(view.state.doc.toString()).toBe(`${source}!`);
    expect(reconfigureKnowledgeMarkdownMode(
      view,
      compartment,
      'live-preview',
      live,
    )).toBe('changed');
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    expect(updates.filter(Boolean)).toHaveLength(2);
    expect(save).not.toHaveBeenCalled();
  });

  it('force-refreshes the current mode without moving selection, scroll, or history', () => {
    const source = '# Title\n\nbody';
    const {
      view, compartment, live,
    } = createView(source, source.indexOf('body'));
    view.dispatch({
      changes: { from: source.length, insert: '!' },
      selection: { anchor: source.indexOf('body') + 2 },
    });
    view.scrollDOM.scrollTop = 91;
    view.scrollDOM.scrollLeft = 7;
    const selection = view.state.selection.toJSON();

    expect(reconfigureKnowledgeMarkdownMode(
      view,
      compartment,
      'live-preview',
      live,
      { force: true },
    )).toBe('changed');
    expect(view.state.doc.toString()).toBe(`${source}!`);
    expect(view.state.selection.toJSON()).toEqual(selection);
    expect(view.scrollDOM.scrollTop).toBe(91);
    expect(view.scrollDOM.scrollLeft).toBe(7);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
  });

  it('reveals only a touched inline element and only active block markers', () => {
    const inlineSource = '**one** and **two**\nplain';
    const inline = createView(inlineSource, inlineSource.indexOf('one') + 1);

    expect(lineText(inline.parent, 1)).toBe('**one** and two');
    inline.view.dispatch({
      selection: { anchor: inlineSource.indexOf('two') + 1 },
    });
    expect(lineText(inline.parent, 1)).toBe('one and **two**');

    const blockSource = '# Heading\n- item\n- [ ] task\n> quote\nplain';
    const block = createView(blockSource, blockSource.indexOf('Heading'));
    expect(lineText(block.parent, 1)).toBe('# Heading');
    expect(lineText(block.parent, 2)).toBe('item');
    expect(lineText(block.parent, 4).trim()).toBe('quote');
    expect(block.parent.querySelectorAll('.cm-page-task')).toHaveLength(1);

    block.view.dispatch({
      selection: { anchor: blockSource.indexOf('[ ]') + 1 },
    });
    expect(lineText(block.parent, 1)).toBe('Heading');
    expect(lineText(block.parent, 3)).toContain('[ ] task');
    expect(block.parent.querySelectorAll('.cm-page-task')).toHaveLength(0);
  });

  it('keeps view mode and scroll independent while sharing one buffer and history', () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner',
      windowId: 'window',
    });
    const address = {
      sourceKey: 'main',
      relativePath: 'Notes/shared.md',
    };
    const key = registry.getState().establishDocumentSession({
      address,
      buffer: 'shared',
    });
    registry.getState().openDocumentView({
      viewId: 'left',
      address,
      groupId: 'group-left',
    });
    registry.getState().openDocumentView({
      viewId: 'right',
      address,
      groupId: 'group-right',
    });

    registry.getState().updateDocumentView('left', {
      mode: 'source',
      scroll: { top: 120, left: 3 },
    });
    registry.getState().updateDocumentView('right', {
      scroll: { top: 7, left: 0 },
    });
    registry.getState().replaceDocumentBuffer('left', 'shared edit');

    expect(registry.getState().sessions[key].buffer).toBe('shared edit');
    expect(registry.getState().views.left).toMatchObject({
      mode: 'source',
      scroll: { top: 120, left: 3 },
    });
    expect(registry.getState().views.right).toMatchObject({
      mode: 'live-preview',
      scroll: { top: 7, left: 0 },
    });
    expect(registry.getState().sessions[key].history.undo).toHaveLength(1);
    expect(registry.getState().undoDocument('right')).toBe(true);
    expect(registry.getState().sessions[knowledgeDocumentKey(address)].buffer)
      .toBe('shared');
    expect(registry.getState().views.left.mode).toBe('source');
    expect(registry.getState().views.right.mode).toBe('live-preview');
  });

  it('returns explicit unchanged, unavailable, and failed results', () => {
    const {
      view, compartment, live,
    } = createView('plain');
    expect(reconfigureKnowledgeMarkdownMode(
      view,
      compartment,
      'live-preview',
      live,
    )).toBe('unchanged');
    expect(reconfigureKnowledgeMarkdownMode(
      null,
      compartment,
      'source',
      live,
    )).toBe('unavailable');

    const failedView = {
      state: view.state,
      scrollDOM: view.scrollDOM,
      dispatch: () => {
        throw new Error('injected failure');
      },
    } as unknown as EditorView;
    expect(reconfigureKnowledgeMarkdownMode(
      failedView,
      compartment,
      'source',
      live,
    )).toBe('failed');
    expect(getKnowledgeMarkdownViewMode(view.state)).toBe('live-preview');
  });
});
