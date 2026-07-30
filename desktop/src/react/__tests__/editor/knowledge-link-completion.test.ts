// @vitest-environment jsdom

import {
  closeCompletion,
  CompletionContext,
  currentCompletions,
  startCompletion,
  type Completion,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  KnowledgeResourceAddress,
} from '../../../../../shared/knowledge-workspace-contract.ts';
import {
  createKnowledgeLinkCompletionSource,
  createKnowledgeEditorAutocomplete,
  listKnowledgeLinkCandidates,
  type KnowledgeLinkCompletionConfig,
} from '../../editor/knowledge-link-completion';

const views: EditorView[] = [];

function config(): KnowledgeLinkCompletionConfig {
  return {
    pageAddress: {
      sourceKey: 'main',
      relativePath: 'Notes/Today.md',
    },
    listDirectory: vi.fn(async (address: KnowledgeResourceAddress) => {
      expect(address.sourceKey).toBe('main');
      const itemsByPath: Record<string, Array<{
        name: string;
        isDirectory: boolean;
      }>> = {
        '': [
          { name: '.trash', isDirectory: true },
          { name: 'Notes', isDirectory: true },
          { name: 'Image.png', isDirectory: false },
          { name: 'Unsafe.svg', isDirectory: false },
        ],
        Notes: [
          { name: 'Alpha 10.md', isDirectory: false },
          { name: 'Alpha 2.md', isDirectory: false },
          { name: 'ÉCOLE.md', isDirectory: false },
          { name: 'clip.mp4', isDirectory: false },
        ],
      };
      const items = itemsByPath[address.relativePath] ?? [];
      return {
        items: items.map(item => ({
          ...item,
          size: 1,
          mtimeMs: 1,
        })),
      };
    }),
  };
}

async function completion(
  doc: string,
  completionConfig = config(),
): Promise<CompletionResult | null> {
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
  });
  return await createKnowledgeLinkCompletionSource(completionConfig)(
    new CompletionContext(state, doc.length, false),
  ) as CompletionResult | null;
}

afterEach(() => {
  while (views.length > 0) views.pop()?.destroy();
  document.body.replaceChildren();
});

describe('knowledge Wikilink completion', () => {
  it('recursively lists only the current source and naturally sorts full paths', async () => {
    const completionConfig = config();
    const controller = new AbortController();
    const candidates = await listKnowledgeLinkCandidates(completionConfig, {
      embedded: false,
      query: 'alpha',
      signal: controller.signal,
    });

    expect(candidates).toEqual([
      'Notes/Alpha 2.md',
      'Notes/Alpha 10.md',
    ]);
    expect(completionConfig.listDirectory).toHaveBeenCalledWith({
      sourceKey: 'main',
      relativePath: '',
    }, {
      signal: controller.signal,
    });
    expect(completionConfig.listDirectory).not.toHaveBeenCalledWith(
      expect.objectContaining({ sourceKey: 'other' }),
      expect.anything(),
    );
  });

  it('uses Unicode case-insensitive substring matching and filters embedded types', async () => {
    const ordinary = await completion('[[éco');
    expect(ordinary?.options.map(option => option.label)).toEqual([
      'Notes/ÉCOLE.md',
    ]);

    const embedded = await completion('![[', config());
    expect(embedded?.options.map(option => option.label)).toEqual([
      'Image.png',
      'Notes/Alpha 2.md',
      'Notes/Alpha 10.md',
      'Notes/clip.mp4',
      'Notes/ÉCOLE.md',
    ]);
    expect(embedded?.options.map(option => option.label))
      .not.toContain('Unsafe.svg');
  });

  it('opens for ordinary and embedded syntax but never inside code or frontmatter', async () => {
    expect((await completion('[['))?.from).toBe(0);
    expect((await completion('![[Notes'))?.from).toBe(0);
    expect(await completion('`[[Notes')).toBeNull();
    expect(await completion('```md\n[[Notes')).toBeNull();
    expect(await completion('---\nkey: [[Notes')).toBeNull();
    expect(await completion('plain text')).toBeNull();
  });

  it('inserts the canonical source-relative path in one undoable transaction', async () => {
    const doc = 'Open [[alpha';
    const result = await completion(doc);
    const option = result?.options[0] as Completion;
    const parent = document.body.appendChild(document.createElement('div'));
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        selection: { anchor: doc.length },
        extensions: [history()],
      }),
    });
    views.push(view);
    const apply = option.apply;
    expect(typeof apply).toBe('function');
    (apply as Exclude<Exclude<Completion['apply'], string>, undefined>)(
      view,
      option,
      result?.from ?? 0,
      doc.length,
    );

    expect(view.state.doc.toString()).toBe('Open [[Notes/Alpha 2.md]]');
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('returns no candidates without creating, copying, or guessing a target', async () => {
    const completionConfig = config();
    const result = await completion('[[does-not-exist', completionConfig);
    expect(result?.options).toEqual([]);
    expect(completionConfig.listDirectory).toHaveBeenCalled();
  });

  it('serves Wikilinks and footnotes through one editor autocomplete owner', async () => {
    const parent = document.body.appendChild(document.createElement('div'));
    const wikilinkView = new EditorView({
      parent,
      state: EditorState.create({
        doc: '[[',
        selection: { anchor: 2 },
        extensions: [createKnowledgeEditorAutocomplete(config())],
      }),
    });
    views.push(wikilinkView);
    expect(startCompletion(wikilinkView)).toBe(true);
    await vi.waitFor(() => {
      expect(currentCompletions(wikilinkView.state).map(option => option.label))
        .toContain('Notes/Alpha 2.md');
    });
    expect(closeCompletion(wikilinkView)).toBe(true);

    const footnoteDoc = 'Use [^\n\n[^note]: body';
    const footnoteParent = document.body.appendChild(document.createElement('div'));
    const footnoteView = new EditorView({
      parent: footnoteParent,
      state: EditorState.create({
        doc: footnoteDoc,
        selection: { anchor: 'Use [^'.length },
        extensions: [createKnowledgeEditorAutocomplete(config())],
      }),
    });
    views.push(footnoteView);
    expect(startCompletion(footnoteView)).toBe(true);
    await vi.waitFor(() => {
      expect(currentCompletions(footnoteView.state).map(option => option.label))
        .toEqual(['note']);
    });
  });
});
