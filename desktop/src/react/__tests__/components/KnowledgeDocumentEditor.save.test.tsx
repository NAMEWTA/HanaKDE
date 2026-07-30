// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  KnowledgeResourceAddress,
} from '../../../../../shared/knowledge-workspace-contract.ts';
import {
  KNOWLEDGE_MARKDOWN_MAX_BYTES,
  type MarkdownEditorSurfaceHandle,
  type MarkdownEditorSurfacePolicy,
} from '../../components/preview/MarkdownEditorSurface';
import {
  KnowledgeDocumentEditor,
  KnowledgeDocumentNotices,
} from '../../components/knowledge-workspace/KnowledgeDocumentEditor';
import type {
  KnowledgeWorkspaceClient,
  RendererResourceVersion,
} from '../../services/knowledge-workspace-client';
import {
  createKnowledgeDocumentRegistry,
  knowledgeDocumentKey,
} from '../../stores/knowledge-document-registry';
import {
  decodeKnowledgeMarkdownFile,
  encodeKnowledgeMarkdownFile,
  knowledgeBase64FromBytes,
  knowledgeBytesFromBase64,
} from '../../utils/knowledge-markdown-file';

vi.mock('../../components/preview/MarkdownEditorSurface', async importOriginal => {
  const React = await import('react');
  const actual = await importOriginal<
    typeof import('../../components/preview/MarkdownEditorSurface')
  >();
  const MarkdownEditorSurface = React.forwardRef((props: {
    content: string;
    filePath?: string;
    markdownDisplayMode?: 'live-preview' | 'source';
    policy: MarkdownEditorSurfacePolicy;
    onContentChange?: (content: string) => void;
  }, ref: React.ForwardedRef<MarkdownEditorSurfaceHandle>) => {
    const contentRef = React.useRef(props.content);
    contentRef.current = props.content;
    const save = async () => {
      try {
        const result = await props.policy.save.execute(contentRef.current, null);
        if (!result.ok) {
          props.policy.save.onError?.({
            code: result.conflict ? 'conflict' : 'unavailable',
          });
        }
        return result.ok;
      } catch (cause) {
        props.policy.save.onError?.({ code: 'unavailable', cause });
        return false;
      }
    };
    React.useImperativeHandle(ref, () => ({
      getView: () => null,
      focus: () => undefined,
      save,
      isDirty: () => false,
      getScrollSnapshot: () => null,
      restoreScrollSnapshot: () => undefined,
      scrollToLine: () => undefined,
      scrollToOffset: () => undefined,
      getTopVisibleLine: () => 0,
      setMarkdownDisplayMode: () => 'changed',
    }));
    return (
      <textarea
        aria-label={`surface:${props.filePath ?? ''}`}
        data-markdown-display-mode={props.markdownDisplayMode}
        value={props.content}
        onChange={event => props.onContentChange?.(event.currentTarget.value)}
        onKeyDown={event => {
          if (
            event.key.toLowerCase() === 's'
            && (event.ctrlKey || event.metaKey)
          ) {
            event.preventDefault();
            void save();
          }
        }}
      />
    );
  });
  return { ...actual, MarkdownEditorSurface };
});

const address: KnowledgeResourceAddress = {
  sourceKey: 'main',
  relativePath: 'Notes/example.md',
};

const firstVersion: RendererResourceVersion = {
  etag: 'v1',
  sequence: 1,
  size: 5,
};

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decodedBase64Text(value: string): string {
  const decoded = knowledgeBytesFromBase64(value);
  if (!decoded) throw new Error('expected valid base64');
  return new TextDecoder().decode(decoded);
}

function clientFor(
  content: Uint8Array,
  options: {
    version?: RendererResourceVersion;
    write?: KnowledgeWorkspaceClient['resources']['writeExpectedVersion'];
  } = {},
): {
  client: KnowledgeWorkspaceClient;
  stat: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
} {
  const version = options.version ?? { ...firstVersion, size: content.byteLength };
  const stat = vi.fn(async () => ({
    exists: true,
    isDirectory: false,
    version,
  }));
  const read = vi.fn(async () => ({
    content: knowledgeBase64FromBytes(content),
    encoding: 'base64' as const,
    version,
  }));
  const write = vi.fn(options.write ?? (async () => ({
    ok: true as const,
    changeType: 'modified' as const,
    version: { ...version, etag: 'v2', sequence: 2 },
  })));
  return {
    stat,
    read,
    write,
    client: {
      resources: {
        stat,
        read,
        writeExpectedVersion: write,
      },
    } as unknown as KnowledgeWorkspaceClient,
  };
}

function translate(key: string, vars?: Record<string, string | number>): string {
  const values: Record<string, string> = {
    'knowledge.retry': 'Retry',
    'knowledge.document.loading': 'Loading document…',
    'knowledge.document.tooLarge': 'Document is too large',
    'knowledge.document.invalid_utf8': 'Document is not valid UTF-8',
    'knowledge.document.invalid_base64': 'Document is not valid base64',
    'knowledge.document.editorLabel': 'Edit {name}',
    'knowledge.document.modeLabel': 'Markdown display mode',
    'knowledge.document.livePreviewMode': 'Live Preview',
    'knowledge.document.sourceMode': 'Source',
    'knowledge.document.noticesLabel': 'Document notices',
    'knowledge.document.saveConflict': 'the file changed on disk',
    'knowledge.document.saveUnavailable': 'the save service is unavailable',
    'knowledge.document.saveError':
      'Could not save {name}: {reason}. Your changes are still in the editor.',
    'knowledge.document.dismissSaveError': 'Dismiss save error for {name}',
    'knowledge.document.mixedLineEndings':
      '{name} contains mixed line endings; first save uses {ending}.',
  };
  let value = values[key] ?? key;
  for (const [name, replacement] of Object.entries(vars ?? {})) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}

async function openEditor(input: {
  content?: Uint8Array;
  client?: KnowledgeWorkspaceClient;
  viewId?: string;
  registry?: ReturnType<typeof createKnowledgeDocumentRegistry>;
  onSaved?: (
    address: KnowledgeResourceAddress,
    version: RendererResourceVersion,
  ) => void;
} = {}) {
  const content = input.content ?? bytes('hello');
  const services = input.client
    ? { client: input.client }
    : clientFor(content);
  const registry = input.registry ?? createKnowledgeDocumentRegistry({
    ownerId: 'owner',
    windowId: 'window',
  });
  const viewId = input.viewId ?? 'view-1';
  const result = render(
    <>
      <KnowledgeDocumentEditor
        address={address}
        viewId={viewId}
        groupId="group-1"
        registry={registry}
        client={services.client}
        onSaved={input.onSaved}
      />
      <KnowledgeDocumentNotices registry={registry} />
    </>,
  );
  const editor = await screen.findByRole('textbox', {
    name: 'surface:Notes/example.md',
  });
  return { ...services, registry, result, editor };
}

describe('KnowledgeDocumentEditor manual save tracer', () => {
  beforeEach(() => {
    window.t = translate as typeof window.t;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('stats before reading and creates neither a session nor editor above 10 MiB', async () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner',
      windowId: 1,
    });
    const read = vi.fn();
    const stat = vi.fn(async () => ({
      exists: true,
      isDirectory: false,
      version: {
        etag: 'large',
        size: KNOWLEDGE_MARKDOWN_MAX_BYTES + 1,
      },
    }));
    const client = {
      resources: { stat, read },
    } as unknown as KnowledgeWorkspaceClient;

    render(
      <KnowledgeDocumentEditor
        address={address}
        viewId="oversize"
        groupId="group"
        registry={registry}
        client={client}
      />,
    );

    expect(await screen.findByText('Document is too large')).toBeInTheDocument();
    expect(stat).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    expect(registry.getState().sessions).toEqual({});
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('strictly rejects invalid UTF-8 after a bounded base64 read', async () => {
    const invalid = Uint8Array.from([0xff, 0xfe]);
    const services = clientFor(invalid);
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner',
      windowId: 2,
    });
    render(
      <KnowledgeDocumentEditor
        address={address}
        viewId="invalid"
        groupId="group"
        registry={registry}
        client={services.client}
      />,
    );

    expect(await screen.findByText('Document is not valid UTF-8')).toBeInTheDocument();
    expect(services.stat.mock.invocationCallOrder[0]).toBeLessThan(
      services.read.mock.invocationCallOrder[0],
    );
    expect(registry.getState().sessions).toEqual({});
  });

  it('cancels a stale open without creating its session or view', async () => {
    let resolveFirst: ((value: {
      exists: true;
      isDirectory: false;
      version: RendererResourceVersion;
    }) => void) | undefined;
    const firstAddress = { ...address, relativePath: 'Notes/slow.md' };
    const nextAddress = { ...address, relativePath: 'Notes/next.md' };
    const stat = vi.fn((requested: KnowledgeResourceAddress) => {
      if (requested.relativePath === firstAddress.relativePath) {
        return new Promise<{
          exists: true;
          isDirectory: false;
          version: RendererResourceVersion;
        }>(resolve => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve({
        exists: true as const,
        isDirectory: false as const,
        version: { etag: 'next', size: 4 },
      });
    });
    const read = vi.fn(async () => ({
      content: knowledgeBase64FromBytes(bytes('next')),
      encoding: 'base64' as const,
      version: { etag: 'next', size: 4 },
    }));
    const client = {
      resources: { stat, read },
    } as unknown as KnowledgeWorkspaceClient;
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner',
      windowId: 'cancel',
    });
    const view = render(
      <KnowledgeDocumentEditor
        address={firstAddress}
        viewId="cancel-view"
        groupId="group"
        registry={registry}
        client={client}
      />,
    );
    await waitFor(() => expect(stat).toHaveBeenCalledWith(
      firstAddress,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    view.rerender(
      <KnowledgeDocumentEditor
        address={nextAddress}
        viewId="cancel-view"
        groupId="group"
        registry={registry}
        client={client}
      />,
    );
    expect(await screen.findByRole('textbox', {
      name: 'surface:Notes/next.md',
    })).toBeInTheDocument();

    await act(async () => {
      resolveFirst?.({
        exists: true,
        isDirectory: false,
        version: { etag: 'slow', size: 4 },
      });
      await Promise.resolve();
    });
    expect(registry.getState().sessions[knowledgeDocumentKey(firstAddress)])
      .toBeUndefined();
    expect(registry.getState().sessions[knowledgeDocumentKey(nextAddress)])
      .toBeDefined();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('does not autosave on edit, blur, idle time, or rerender and exposes no Save All', async () => {
    const services = clientFor(bytes('hello'));
    const { editor, result, registry } = await openEditor({
      content: bytes('hello'),
      client: services.client,
    });

    fireEvent.change(editor, { target: { value: 'edited' } });
    fireEvent.blur(editor);
    vi.useFakeTimers();
    result.rerender(
      <KnowledgeDocumentEditor
        address={address}
        viewId="view-1"
        groupId="group-2"
        registry={registry}
        client={services.client}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    expect(services.write).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /save all/i })).not.toBeInTheDocument();
  });

  it('creates a pending Wikilink Page on first edit and keeps later edits manual', async () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner',
      windowId: 'pending',
    });
    registry.getState().establishDocumentSession({
      address,
      buffer: '',
      baseline: '',
      diskVersion: null,
      pendingCreate: true,
    });
    const services = clientFor(bytes(''), {
      write: vi.fn(async () => ({
        ok: true as const,
        changeType: 'created' as const,
        version: { etag: 'created', sequence: 1, size: 1 },
      })),
    });
    const { editor } = await openEditor({
      client: services.client,
      registry,
    });

    fireEvent.change(editor, { target: { value: 'a' } });
    await waitFor(() => expect(services.write).toHaveBeenCalledTimes(1));
    expect(services.write).toHaveBeenCalledWith(
      address,
      expect.any(String),
      null,
      { encoding: 'base64', signal: undefined },
    );
    await waitFor(() => {
      expect(registry.getState().sessions[knowledgeDocumentKey(address)])
        .toMatchObject({
          baseline: 'a',
          pendingCreate: false,
          dirty: false,
        });
    });

    fireEvent.change(editor, { target: { value: 'ab' } });
    await act(async () => {
      await Promise.resolve();
    });
    expect(services.write).toHaveBeenCalledTimes(1);
    expect(registry.getState().sessions[knowledgeDocumentKey(address)])
      .toMatchObject({
        buffer: 'ab',
        baseline: 'a',
        dirty: true,
      });
  });

  it('switches the current view display mode without saving or changing the buffer', async () => {
    const services = clientFor(bytes('# hello'));
    const { editor, registry } = await openEditor({
      content: bytes('# hello'),
      client: services.client,
    });
    const key = knowledgeDocumentKey(address);

    expect(editor).toHaveAttribute('data-markdown-display-mode', 'live-preview');
    expect(screen.getByRole('button', { name: 'Live Preview' }))
      .toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Source' }));

    expect(editor).toHaveAttribute('data-markdown-display-mode', 'source');
    expect(screen.getByRole('button', { name: 'Source' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(registry.getState().views['view-1'].mode).toBe('source');
    expect(registry.getState().sessions[key]).toMatchObject({
      buffer: '# hello',
      baseline: '# hello',
      dirty: false,
    });
    expect(registry.getState().sessions[key].history.undo).toHaveLength(0);
    expect(services.write).not.toHaveBeenCalled();
  });

  it('uses Ctrl/Cmd+S, latest expected version, and updates baseline only after success', async () => {
    const onSaved = vi.fn();
    let resolveWrite: ((value: {
      ok: true;
      changeType: 'modified';
      version: RendererResourceVersion;
    }) => void) | undefined;
    const write = vi.fn(() => new Promise<{
      ok: true;
      changeType: 'modified';
      version: RendererResourceVersion;
    }>(resolve => {
      resolveWrite = resolve;
    }));
    const content = bytes('hello');
    const services = clientFor(content, {
      version: { etag: 'latest-v7', sequence: 7, size: content.byteLength },
      write,
    });
    const { editor, registry } = await openEditor({
      content,
      client: services.client,
      onSaved,
    });

    fireEvent.change(editor, { target: { value: 'edited' } });
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });
    expect(services.write).toHaveBeenCalledWith(
      address,
      expect.any(String),
      { etag: 'latest-v7', sequence: 7, size: content.byteLength },
      { encoding: 'base64' },
    );
    let session = registry.getState().sessions[knowledgeDocumentKey(address)];
    expect(session.buffer).toBe('edited');
    expect(session.baseline).toBe('hello');
    expect(session.dirty).toBe(true);

    await act(async () => {
      resolveWrite?.({
        ok: true,
        changeType: 'modified',
        version: { etag: 'latest-v8', sequence: 8, size: 6 },
      });
      await Promise.resolve();
    });

    session = registry.getState().sessions[knowledgeDocumentKey(address)];
    expect(session.baseline).toBe('edited');
    expect(session.diskVersion).toEqual({
      etag: 'latest-v8',
      sequence: 8,
      size: 6,
    });
    expect(session.dirty).toBe(false);
    expect(session.history.undo).toHaveLength(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('preserves UTF-8 BOM and a single CRLF style without changing logical lines', async () => {
    const source = bytes('\ufeffone\r\ntwo\r\n');
    const services = clientFor(source);
    const { editor, registry } = await openEditor({
      content: source,
      client: services.client,
    });
    expect(editor).toHaveValue('one\ntwo\n');

    fireEvent.change(editor, { target: { value: 'one\ntwo\nthree\n' } });
    fireEvent.keyDown(editor, { key: 's', metaKey: true });
    await waitFor(() => expect(services.write).toHaveBeenCalledTimes(1));
    const encoded = services.write.mock.calls[0][1] as string;
    const saved = knowledgeBytesFromBase64(encoded);
    expect(saved).not.toBeNull();
    expect(decodedBase64Text(encoded)).toBe('one\r\ntwo\r\nthree\r\n');
    expect(saved?.slice(0, 3)).toEqual(Uint8Array.from([0xef, 0xbb, 0xbf]));
    expect(
      registry.getState().sessions[knowledgeDocumentKey(address)].history.undo,
    ).toHaveLength(1);
  });

  it('normalizes mixed endings by majority with an LF tie and announces the first save', async () => {
    const majority = decodeKnowledgeMarkdownFile(
      knowledgeBase64FromBytes(bytes('a\r\nb\r\nc\nd')),
    );
    const tie = decodeKnowledgeMarkdownFile(
      knowledgeBase64FromBytes(bytes('a\r\nb\nc')),
    );
    expect(majority).toMatchObject({
      ok: true,
      content: 'a\nb\nc\nd',
      format: {
        lineEnding: 'crlf',
        mixedLineEndings: true,
      },
    });
    expect(tie).toMatchObject({
      ok: true,
      format: {
        lineEnding: 'lf',
        mixedLineEndings: true,
      },
    });
    if (!majority.ok || !tie.ok) throw new Error('decode must succeed');
    expect(encodeKnowledgeMarkdownFile(majority.content, majority.format))
      .toMatchObject({ ok: true });
    const tiedWrite = encodeKnowledgeMarkdownFile(tie.content, tie.format);
    if (!tiedWrite.ok) throw new Error('encode must succeed');
    expect(decodedBase64Text(tiedWrite.base64)).toBe('a\nb\nc');

    await openEditor({ content: bytes('a\r\nb\nc') });
    expect(screen.getByRole('status')).toHaveTextContent(
      'example.md contains mixed line endings; first save uses LF.',
    );
  });

  it('saves the shared latest buffer from either view and keeps one shared baseline', async () => {
    const services = clientFor(bytes('start'));
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner',
      windowId: 'shared',
    });
    const first = await openEditor({
      content: bytes('start'),
      client: services.client,
      registry,
      viewId: 'left',
    });
    const second = render(
      <KnowledgeDocumentEditor
        address={address}
        viewId="right"
        groupId="group-right"
        registry={registry}
        client={services.client}
      />,
    );
    const editors = await screen.findAllByRole('textbox');
    fireEvent.change(editors[0], { target: { value: 'latest shared' } });
    await waitFor(() => expect(editors[1]).toHaveValue('latest shared'));
    fireEvent.keyDown(editors[1], { key: 's', ctrlKey: true });
    await waitFor(() => expect(services.write).toHaveBeenCalledTimes(1));

    expect(decodedBase64Text(
      services.write.mock.calls[0][1] as string,
    )).toBe('latest shared');
    const session = registry.getState().sessions[knowledgeDocumentKey(address)];
    expect(session.baseline).toBe('latest shared');
    expect(session.dirty).toBe(false);
    expect(registry.getState().views.left.sessionKey)
      .toBe(registry.getState().views.right.sessionKey);
    first.result.unmount();
    second.unmount();
  });

  it('keeps buffer dirty, blocks repeated direct saves during conflict, and clears the reused notice after explicit resolution', async () => {
    const content = bytes('hello');
    const write = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        conflict: true,
        version: { etag: 'external', size: content.byteLength },
      })
      .mockResolvedValueOnce({
        ok: true,
        changeType: 'modified',
        version: { etag: 'saved', size: 6 },
      });
    const services = clientFor(content, { write });
    const { editor, registry } = await openEditor({
      content,
      client: services.client,
    });
    fireEvent.change(editor, { target: { value: 'edited' } });

    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save example.md: the file changed on disk. Your changes are still in the editor.',
    );
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    let session = registry.getState().sessions[knowledgeDocumentKey(address)];
    expect(session.buffer).toBe('edited');
    expect(session.baseline).toBe('hello');
    expect(session.dirty).toBe(true);
    expect(session.conflict).toMatchObject({
      baseline: 'hello',
      local: 'edited',
      disk: 'hello',
      diskVersion: { etag: 'external', size: content.byteLength },
    });

    fireEvent.click(screen.getByRole('button', {
      name: 'Dismiss save error for example.md',
    }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(registry.getState().resolveDocumentConflict(address, {
      kind: 'local',
    })).toBe(true);
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    session = registry.getState().sessions[knowledgeDocumentKey(address)];
    expect(session.dirty).toBe(false);
    expect(session.saveError).toBeNull();
  });

  it('treats service failure as persistent unavailable notice without moving focus', async () => {
    const content = bytes('hello');
    const write = vi.fn(async () => {
      throw new Error('offline');
    });
    const services = clientFor(content, { write });
    const { editor, registry } = await openEditor({
      content,
      client: services.client,
    });
    editor.focus();
    fireEvent.change(editor, { target: { value: 'edited' } });
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'the save service is unavailable',
    );
    expect(document.activeElement).toBe(editor);
    const session = registry.getState().sessions[knowledgeDocumentKey(address)];
    expect(session.dirty).toBe(true);
    expect(session.buffer).toBe('edited');
  });
});
