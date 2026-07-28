/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { undo } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KNOWLEDGE_MARKDOWN_MAX_BYTES,
  MarkdownEditorSurface,
  decodeKnowledgeMarkdown,
  knowledgeMarkdownContentGate,
  type MarkdownEditorSurfaceHandle,
  type MarkdownEditorSurfacePolicy,
} from '../../components/preview/MarkdownEditorSurface';

function elementRect(width = 960, height = 640): DOMRect {
  return {
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    right: width,
    bottom: height,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function policy(
  save: MarkdownEditorSurfacePolicy['save'],
  overrides: Partial<MarkdownEditorSurfacePolicy> = {},
): MarkdownEditorSurfacePolicy {
  return {
    save,
    attachment: null,
    openLink: null,
    contentGate: ({ content }) => ({
      allowed: true,
      content,
    }),
    ...overrides,
  };
}

describe('MarkdownEditorSurface', () => {
  let elementRectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    elementRectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => elementRect());
    Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
    Range.prototype.getBoundingClientRect = vi.fn(() => elementRect(0, 0));
  });

  afterEach(() => {
    cleanup();
    elementRectSpy.mockRestore();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('accepts strict UTF-8 through 10 MiB, strips a BOM, and rejects invalid or oversized bytes', () => {
    const atLimit = new Uint8Array(KNOWLEDGE_MARKDOWN_MAX_BYTES);
    atLimit.fill(0x61);
    expect(decodeKnowledgeMarkdown(atLimit)).toMatchObject({
      allowed: true,
      hadBom: false,
    });

    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, 0x23, 0x20, 0x41]);
    expect(decodeKnowledgeMarkdown(withBom)).toEqual({
      allowed: true,
      content: '# A',
      byteLength: withBom.byteLength,
      hadBom: true,
    });

    expect(decodeKnowledgeMarkdown(new Uint8Array([0xc3, 0x28]))).toEqual({
      allowed: false,
      reason: 'invalid_utf8',
      byteLength: 2,
    });
    expect(decodeKnowledgeMarkdown(new Uint8Array(KNOWLEDGE_MARKDOWN_MAX_BYTES + 1))).toEqual({
      allowed: false,
      reason: 'content_too_large',
      byteLength: KNOWLEDGE_MARKDOWN_MAX_BYTES + 1,
    });
    expect(knowledgeMarkdownContentGate({ content: '\ud800' })).toEqual({
      allowed: false,
      reason: 'invalid_utf8',
      byteLength: 3,
    });
    expect(knowledgeMarkdownContentGate({ content: `\ufeff${'a'.repeat(32)}` })).toEqual({
      allowed: true,
      content: 'a'.repeat(32),
      byteLength: 35,
      hadBom: true,
    });
  });

  it('keeps Preview autosave policy at 600ms and checkpoints before writing', async () => {
    const checkpoint = vi.fn(async () => undefined);
    const execute = vi.fn(async () => ({
      ok: true as const,
      conflict: false as const,
      version: { mtimeMs: 2, size: 7, sha256: 'next' },
    }));
    const ref = createRef<MarkdownEditorSurfaceHandle>();

    render(
      <MarkdownEditorSurface
        ref={ref}
        content="before"
        mode="markdown"
        policy={policy({
          scopeKey: 'preview:test',
          mode: 'autosave',
          delayMs: 600,
          checkpoint,
          execute,
        })}
      />,
    );

    act(() => ref.current?.getView()?.dispatch({
      changes: { from: 0, to: 6, insert: 'after' },
    }));
    await act(async () => {
      vi.advanceTimersByTime(599);
      await Promise.resolve();
    });
    expect(execute).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(checkpoint).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith('after', null);
  });

  it('keeps Knowledge dirty until an explicit manual save and reports conflicts', async () => {
    const onChange = vi.fn();
    const onError = vi.fn();
    const execute = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        conflict: true,
        version: { mtimeMs: 3, size: 8, sha256: 'disk' },
      })
      .mockResolvedValueOnce({
        ok: true,
        conflict: false,
        version: { mtimeMs: 4, size: 7, sha256: 'saved' },
      });
    const ref = createRef<MarkdownEditorSurfaceHandle>();

    render(
      <MarkdownEditorSurface
        ref={ref}
        content="before"
        fileVersion={{ mtimeMs: 1, size: 6, sha256: 'base' }}
        mode="markdown"
        policy={policy({
          scopeKey: 'knowledge:test',
          mode: 'manual',
          execute,
          onError,
        }, {
          contentGate: knowledgeMarkdownContentGate,
        })}
        onContentChange={onChange}
      />,
    );

    act(() => ref.current?.getView()?.dispatch({
      changes: { from: 0, to: 6, insert: 'after' },
    }));
    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    expect(execute).not.toHaveBeenCalled();
    expect(ref.current?.isDirty()).toBe(true);

    await act(async () => {
      expect(await ref.current?.save()).toBe(false);
    });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'conflict',
    }));
    expect(ref.current?.isDirty()).toBe(true);

    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });
    expect(execute).toHaveBeenLastCalledWith('after', {
      mtimeMs: 1,
      size: 6,
      sha256: 'base',
    });
    expect(ref.current?.isDirty()).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith('after', {
      mtimeMs: 4,
      size: 7,
      sha256: 'saved',
    });
  });

  it('never flushes an old surface draft through a newly selected save scope', async () => {
    const executeA = vi.fn(async () => ({ ok: true, conflict: false, version: null }));
    const executeB = vi.fn(async () => ({ ok: true, conflict: false, version: null }));
    const ref = createRef<MarkdownEditorSurfaceHandle>();
    const { rerender } = render(
      <MarkdownEditorSurface
        ref={ref}
        content="document A"
        filePath="a.md"
        mode="markdown"
        policy={policy({
          scopeKey: 'knowledge:main:a.md',
          mode: 'autosave',
          delayMs: 600,
          execute: executeA,
        })}
      />,
    );
    act(() => ref.current?.getView()?.dispatch({
      changes: { from: 0, to: 'document A'.length, insert: 'draft A' },
    }));

    rerender(
      <MarkdownEditorSurface
        ref={ref}
        content="document B"
        filePath="b.md"
        mode="markdown"
        policy={policy({
          scopeKey: 'knowledge:main:b.md',
          mode: 'autosave',
          delayMs: 600,
          execute: executeB,
        })}
      />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(executeA).not.toHaveBeenCalled();
    expect(executeB).not.toHaveBeenCalled();
  });

  it('fails closed on an unavailable save target and keeps the draft dirty', async () => {
    const onError = vi.fn();
    const ref = createRef<MarkdownEditorSurfaceHandle>();
    render(
      <MarkdownEditorSurface
        ref={ref}
        content="before"
        mode="markdown"
        policy={policy({
          scopeKey: 'knowledge:unavailable',
          mode: 'manual',
          execute: vi.fn(async () => {
            throw new Error('EACCES');
          }),
          onError,
        })}
      />,
    );
    act(() => ref.current?.getView()?.dispatch({
      changes: { from: 0, to: 6, insert: 'draft' },
    }));

    await act(async () => {
      expect(await ref.current?.save()).toBe(false);
    });
    expect(onError).toHaveBeenCalledWith({
      code: 'unavailable',
      cause: expect.objectContaining({ message: 'EACCES' }),
    });
    expect(ref.current?.isDirty()).toBe(true);
  });

  it('uses the shared extension factory with one undo history and existing markdown decorations', () => {
    vi.spyOn(EditorView.prototype, 'coordsAtPos').mockReturnValue({
      left: 200,
      right: 260,
      top: 32,
      bottom: 56,
    });
    vi.spyOn(EditorView.prototype, 'lineBlockAt').mockReturnValue({
      top: 32,
      bottom: 56,
      height: 24,
    } as ReturnType<EditorView['lineBlockAt']>);
    vi.spyOn(EditorView.prototype, 'moveToLineBoundary').mockImplementation(start => start);
    const ref = createRef<MarkdownEditorSurfaceHandle>();
    const { container } = render(
      <MarkdownEditorSurface
        ref={ref}
        content={'Alpha\n\nBeta'}
        mode="markdown"
        policy={policy({
          scopeKey: 'knowledge:history',
          mode: 'manual',
          execute: vi.fn(async () => ({ ok: true, conflict: false, version: null })),
        })}
      />,
    );
    act(() => vi.runOnlyPendingTimers());
    const view = ref.current!.getView()!;
    expect(container.querySelector('.cm-markdown-block-handle')).toBeTruthy();

    act(() => view.dispatch({
      changes: { from: 0, to: 5, insert: 'Changed' },
    }));
    expect(view.state.doc.toString()).toBe('Changed\n\nBeta');
    act(() => {
      expect(undo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).toBe('Alpha\n\nBeta');
  });

  it('injects attachment and link-open policies without filesystem or global navigation access', async () => {
    const insert = vi.fn(async () => '![photo](assets/photo.png)');
    const open = vi.fn(async () => undefined);
    const ref = createRef<MarkdownEditorSurfaceHandle>();
    const { container } = render(
      <MarkdownEditorSurface
        ref={ref}
        content="[Docs](https://example.com)"
        mode="markdown"
        policy={policy({
          scopeKey: 'knowledge:policy',
          mode: 'manual',
          execute: vi.fn(async () => ({ ok: true, conflict: false, version: null })),
        }, {
          attachment: {
            accepts: () => true,
            insert,
            onError: vi.fn(),
          },
          openLink: { open },
        })}
      />,
    );

    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    fireEvent.paste(container.querySelector('.cm-content')!, {
      clipboardData: {
        files: [file],
        items: [{ kind: 'file', getAsFile: () => file }],
        types: ['Files'],
      },
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      files: [file],
    }));
    expect(ref.current?.getView()?.state.doc.toString()).toContain('![photo](assets/photo.png)');

    const view = ref.current!.getView()!;
    vi.spyOn(view, 'posAtCoords').mockReturnValue(
      view.state.doc.toString().indexOf('https://example.com') + 3,
    );
    fireEvent.click(container.querySelector('.cm-content')!, {
      ctrlKey: true,
      clientX: 10,
      clientY: 10,
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(open).toHaveBeenCalledWith('https://example.com');
  });

  it('applies content gate before creating EditorState and destroys the view on cleanup', () => {
    const onRejected = vi.fn();
    const destroy = vi.fn();
    const execute = vi.fn(async () => ({ ok: true, conflict: false, version: null }));
    const acceptedPolicy = policy({
      scopeKey: 'knowledge:accepted',
      mode: 'manual',
      execute,
    });
    const { unmount } = render(
      <MarkdownEditorSurface
        content="accepted"
        mode="markdown"
        policy={acceptedPolicy}
        onViewDestroy={destroy}
      />,
    );
    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();

    const rejectedPolicy = policy({
      scopeKey: 'knowledge:rejected',
      mode: 'manual',
      execute: vi.fn(async () => ({ ok: true, conflict: false, version: null })),
    }, {
      contentGate: () => ({
        allowed: false,
        reason: 'content_too_large',
        byteLength: KNOWLEDGE_MARKDOWN_MAX_BYTES + 1,
      }),
    });
    const { container } = render(
      <MarkdownEditorSurface
        content="must not enter CodeMirror"
        mode="markdown"
        policy={rejectedPolicy}
        onContentRejected={onRejected}
      />,
    );
    expect(container.querySelector('.cm-editor')).toBeNull();
    expect(onRejected).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'content_too_large',
    }));
  });
});
