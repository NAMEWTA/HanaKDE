/**
 * @vitest-environment jsdom
 */
import { Compartment, EditorState, Transaction } from '@codemirror/state';
import { EditorView, type ViewUpdate } from '@codemirror/view';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownEditorSurface } from '../../components/preview/MarkdownEditorSurface';
import {
  createMarkdownEditorExtensions,
  MARKDOWN_EDITOR_MAX_UTF8_BYTES,
  type MarkdownEditorCompartments,
} from '../../editor/create-markdown-editor-extensions';

function visibleEditorRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 960,
    height: 640,
    top: 0,
    right: 960,
    bottom: 640,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function createCompartments(): MarkdownEditorCompartments {
  return {
    lang: new Compartment(),
    highlight: new Compartment(),
    gutter: new Compartment(),
    conceal: new Compartment(),
    theme: new Compartment(),
  };
}

interface HarnessProps {
  configurationKey: string;
  createExtensions: Parameters<typeof MarkdownEditorSurface>[0]['createExtensions'];
  onViewChange?: Parameters<typeof MarkdownEditorSurface>[0]['onViewChange'];
  onViewCreated?: Parameters<typeof MarkdownEditorSurface>[0]['onViewCreated'];
}

function SurfaceHarness({
  configurationKey,
  createExtensions,
  onViewChange,
  onViewCreated,
}: HarnessProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <MarkdownEditorSurface
      configurationKey={configurationKey}
      containerRef={containerRef}
      initialContent="initial"
      mode="text"
      createExtensions={createExtensions}
      onViewChange={onViewChange}
      onViewCreated={onViewCreated}
    />
  );
}

describe('MarkdownEditorSurface', () => {
  let rectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(visibleEditorRect);
    Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
    Range.prototype.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON: () => ({}),
    }));
  });

  afterEach(() => {
    rectSpy.mockRestore();
    document.body.innerHTML = '';
  });

  it('owns one EditorView lifecycle and rebuilds only for a configuration change', async () => {
    const firstFactory = vi.fn(() => []);
    const secondFactory = vi.fn(() => []);
    const views: Array<EditorView | null> = [];
    const cleanups: Array<ReturnType<typeof vi.fn>> = [];
    const onViewCreated = vi.fn((view: EditorView) => {
      const cleanup = vi.fn();
      cleanups.push(cleanup);
      expect(view.state.doc.toString()).toBe('initial');
      return cleanup;
    });
    const onViewChange = vi.fn((view: EditorView | null) => {
      views.push(view);
    });
    const rendered = render(
      <SurfaceHarness
        configurationKey="one"
        createExtensions={firstFactory}
        onViewChange={onViewChange}
        onViewCreated={onViewCreated}
      />,
    );

    await waitFor(() => expect(onViewCreated).toHaveBeenCalledTimes(1));
    const firstView = views.find((view): view is EditorView => view !== null);
    expect(firstFactory).toHaveBeenCalledTimes(1);

    rendered.rerender(
      <SurfaceHarness
        configurationKey="one"
        createExtensions={secondFactory}
        onViewChange={onViewChange}
        onViewCreated={onViewCreated}
      />,
    );
    expect(firstFactory).toHaveBeenCalledTimes(1);
    expect(secondFactory).not.toHaveBeenCalled();
    expect(cleanups[0]).not.toHaveBeenCalled();

    rendered.rerender(
      <SurfaceHarness
        configurationKey="two"
        createExtensions={secondFactory}
        onViewChange={onViewChange}
        onViewCreated={onViewCreated}
      />,
    );
    await waitFor(() => expect(onViewCreated).toHaveBeenCalledTimes(2));
    expect(secondFactory).toHaveBeenCalledTimes(1);
    expect(cleanups[0]).toHaveBeenCalledTimes(1);
    expect(firstView?.dom.parentElement).toBeNull();

    rendered.unmount();
    expect(cleanups[1]).toHaveBeenCalledTimes(1);
  });

  it('injects save, content-gate, and read-only policies without app dependencies', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const onDocumentChange = vi.fn<(update: ViewUpdate) => void>();
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'A',
        extensions: createMarkdownEditorExtensions({
          mode: 'text',
          compartments: createCompartments(),
          contentPolicy: { readOnly: false },
          savePolicy: { onDocumentChange },
          openLinkPolicy: { open: () => true },
        }),
      }),
    });

    view.dispatch({ changes: { from: 1, insert: 'B' } });
    view.dispatch({
      changes: { from: 2, insert: 'C' },
      annotations: Transaction.remote.of(true),
    });

    expect(view.state.doc.toString()).toBe('ABC');
    expect(onDocumentChange).toHaveBeenCalledTimes(1);
    expect(onDocumentChange.mock.calls[0][0].state.doc.toString()).toBe('AB');
    view.destroy();

    const gatedParent = document.createElement('div');
    document.body.appendChild(gatedParent);
    const gatedView = new EditorView({
      parent: gatedParent,
      state: EditorState.create({
        doc: 'locked',
        extensions: createMarkdownEditorExtensions({
          mode: 'text',
          compartments: createCompartments(),
          contentPolicy: {
            readOnly: false,
            allowTransaction: transaction => !transaction.docChanged,
          },
          openLinkPolicy: { open: () => true },
        }),
      }),
    });
    gatedView.dispatch({ changes: { from: 0, to: 6, insert: 'changed' } });
    expect(gatedView.state.doc.toString()).toBe('locked');
    gatedView.destroy();

    const readOnlyState = EditorState.create({
      doc: 'readonly',
      extensions: createMarkdownEditorExtensions({
        mode: 'text',
        compartments: createCompartments(),
        contentPolicy: { readOnly: true },
        openLinkPolicy: { open: () => true },
      }),
    });
    expect(readOnlyState.facet(EditorState.readOnly)).toBe(true);
    expect(readOnlyState.facet(EditorView.editable)).toBe(false);
  });

  it('edits strict UTF-8 through the 10 MiB boundary with an incremental gate', () => {
    const exactLimit = `${'a'.repeat(MARKDOWN_EDITOR_MAX_UTF8_BYTES - 3)}界`;
    const extensions = createMarkdownEditorExtensions({
      mode: 'text',
      compartments: createCompartments(),
      contentPolicy: {
        readOnly: false,
        strictUtf8MaxBytes: MARKDOWN_EDITOR_MAX_UTF8_BYTES,
      },
      openLinkPolicy: { open: () => true },
    });
    const state = EditorState.create({ doc: exactLimit, extensions });

    const overLimit = state.update({
      changes: { from: state.doc.length, insert: '!' },
    }).state;
    expect(overLimit.doc).toBe(state.doc);

    const withinLimit = state.update({
      changes: {
        from: state.doc.length - 1,
        to: state.doc.length,
        insert: 'b',
      },
    }).state;
    expect(withinLimit.doc.sliceString(withinLimit.doc.length - 1)).toBe('b');

    const invalidUtf8 = withinLimit.update({
      changes: { from: withinLimit.doc.length, insert: '\ud800' },
    }).state;
    expect(invalidUtf8.doc).toBe(withinLimit.doc);

    const threeByteExtensions = createMarkdownEditorExtensions({
      mode: 'text',
      compartments: createCompartments(),
      contentPolicy: { readOnly: false, strictUtf8MaxBytes: 3 },
      openLinkPolicy: { open: () => true },
    });
    expect(() => EditorState.create({
      doc: '界!',
      extensions: threeByteExtensions,
    })).toThrow(/strict UTF-8/);
    expect(() => EditorState.create({
      doc: '\ud800',
      extensions: threeByteExtensions,
    })).toThrow(/strict UTF-8/);
  });

  it('rejects surrogate-splitting edits and counts 4-byte characters exactly', () => {
    const extensions = createMarkdownEditorExtensions({
      mode: 'text',
      compartments: createCompartments(),
      contentPolicy: { readOnly: false, strictUtf8MaxBytes: 8 },
      openLinkPolicy: { open: () => true },
    });
    const state = EditorState.create({ doc: '\u{1f600}a', extensions });

    const splitDeletion = state.update({ changes: { from: 0, to: 1 } }).state;
    expect(splitDeletion.doc).toBe(state.doc);

    const splitInsertion = state.update({
      changes: { from: 1, insert: 'x' },
    }).state;
    expect(splitInsertion.doc).toBe(state.doc);

    const atLimit = state.update({
      changes: { from: state.doc.length, insert: '€' },
    }).state;
    expect(atLimit.doc.toString()).toBe('\u{1f600}a€');

    const overLimit = atLimit.update({
      changes: { from: atLimit.doc.length, insert: 'b' },
    }).state;
    expect(overLimit.doc).toBe(atLimit.doc);

    const emojiRemoved = atLimit.update({ changes: { from: 0, to: 2 } }).state;
    expect(emojiRemoved.doc.toString()).toBe('a€');

    const refilled = emojiRemoved.update({
      changes: { from: emojiRemoved.doc.length, insert: '\u{1f600}' },
    }).state;
    expect(refilled.doc.toString()).toBe('a€\u{1f600}');
  });

  it('composes a manual-save adapter with the strict UTF-8 gate on one surface', async () => {
    const dirtyDocs: string[] = [];
    let editorView: EditorView | null = null;
    const createExtensions = (compartments: MarkdownEditorCompartments) =>
      createMarkdownEditorExtensions({
        mode: 'markdown',
        compartments,
        contentPolicy: { readOnly: false, strictUtf8MaxBytes: 16 },
        savePolicy: {
          onDocumentChange(update) {
            dirtyDocs.push(update.state.doc.toString());
          },
        },
        openLinkPolicy: { open: () => true },
      });
    render(
      <SurfaceHarness
        configurationKey="knowledge-manual-save"
        createExtensions={createExtensions}
        onViewChange={(view) => {
          editorView = view;
        }}
      />,
    );
    await waitFor(() => expect(editorView).not.toBeNull());
    const view = editorView as unknown as EditorView;

    view.dispatch({ changes: { from: 7, insert: ' 界' } });
    expect(view.state.doc.toString()).toBe('initial 界');
    expect(dirtyDocs).toEqual(['initial 界']);

    view.dispatch({
      changes: { from: view.state.doc.length, insert: '界界' },
    });
    expect(view.state.doc.toString()).toBe('initial 界');
    expect(dirtyDocs).toEqual(['initial 界']);

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: 'reloaded' },
      annotations: Transaction.remote.of(true),
    });
    expect(view.state.doc.toString()).toBe('reloaded');
    expect(dirtyDocs).toEqual(['initial 界']);
  });

  it('delegates attachment and link behavior to injected policies', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const attachmentPolicy = {
      onDragOver: vi.fn(() => true),
      onDrop: vi.fn(() => true),
      onPaste: vi.fn(() => true),
    };
    const openLink = vi.fn(() => true);
    const doc = '[Target](./target.md)';
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: createMarkdownEditorExtensions({
          mode: 'markdown',
          compartments: createCompartments(),
          contentPolicy: { readOnly: false },
          attachmentPolicy,
          openLinkPolicy: { open: openLink },
        }),
      }),
    });

    fireEvent.dragOver(view.contentDOM);
    fireEvent.drop(view.contentDOM);
    fireEvent.paste(view.contentDOM);
    vi.spyOn(view, 'posAtCoords').mockReturnValue(doc.indexOf('./target.md') + 2);
    fireEvent.click(view.contentDOM, {
      ctrlKey: true,
      clientX: 1,
      clientY: 1,
    });

    expect(attachmentPolicy.onDragOver).toHaveBeenCalledWith(
      expect.any(Event),
      view,
    );
    expect(attachmentPolicy.onDrop).toHaveBeenCalledWith(
      expect.any(Event),
      view,
    );
    expect(attachmentPolicy.onPaste).toHaveBeenCalledWith(
      expect.any(Event),
      view,
    );
    expect(openLink).toHaveBeenCalledWith(expect.objectContaining({
      url: './target.md',
      view,
    }));
    view.destroy();
  });
});
