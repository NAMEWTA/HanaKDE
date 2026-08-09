// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { JSONContent } from '@tiptap/core';
import { Schema, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputArea } from '../../components/InputArea';
import { useStore } from '../../stores';
import type { DeskSearchResult } from '../../types';

const mocks = vi.hoisted(() => ({
  editorOptions: undefined as undefined | Record<string, unknown>,
  editorText: '',
  editorJson: undefined as undefined | JSONContent,
  editorState: undefined as undefined | EditorState,
  updateHandler: undefined as undefined | (() => void),
  searchDeskFiles: vi.fn(async (_query: string): Promise<DeskSearchResult[]> => []),
  mentionMenuProps: undefined as undefined | {
    items: Array<{ source?: string; name: string }>;
    busy: boolean;
  },
}));

const mentionSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
  },
});

function editorJsonForText(text: string) {
  return {
    type: 'doc',
    content: text
      ? [{ type: 'paragraph', content: [{ type: 'text', text }] }]
      : [],
  };
}

function setMockEditorDocument(doc: ProseMirrorNode, cursor: number): void {
  mocks.editorText = doc.textBetween(0, doc.content.size, '\n', '');
  mocks.editorJson = doc.toJSON();
  mocks.editorState = EditorState.create({
    doc,
    selection: TextSelection.create(doc, cursor),
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

vi.mock('@tiptap/react', () => ({
  useEditor: (options: Record<string, unknown>) => {
    mocks.editorOptions = options;
    const chain = {
      deleteRange: vi.fn(() => chain),
      insertContent: vi.fn(() => chain),
      focus: vi.fn(() => chain),
      run: vi.fn(),
    };
    return {
      commands: {
        focus: vi.fn(),
        clearContent: vi.fn(),
        scrollIntoView: vi.fn(),
        setContent: vi.fn(),
        insertContent: vi.fn(),
        splitListItem: vi.fn(),
      },
      chain: () => chain,
      getText: () => mocks.editorText,
      getJSON: () => mocks.editorJson ?? editorJsonForText(mocks.editorText),
      isActive: vi.fn(() => false),
      isDestroyed: false,
      get state() {
        return mocks.editorState ?? { tr: { setMeta: vi.fn(() => ({})) } };
      },
      view: { dispatch: vi.fn() },
      on: vi.fn((event: string, handler: () => void) => {
        if (event === 'update') mocks.updateHandler = handler;
      }),
      off: vi.fn(),
    };
  },
  EditorContent: () => React.createElement('div', { 'data-testid': 'editor' }),
}));

vi.mock('@tiptap/starter-kit', () => ({
  default: { configure: () => ({}) },
}));

vi.mock('@tiptap/extension-bold', () => ({
  Bold: { extend: () => ({}) },
}));

vi.mock('@tiptap/extension-placeholder', () => ({
  default: { configure: () => ({ name: 'placeholder' }) },
}));

vi.mock('../../components/input/extensions/skill-badge', () => ({
  SkillBadge: { name: 'skillBadge' },
}));

vi.mock('../../components/input/extensions/file-badge', () => ({
  FileBadge: { name: 'fileBadge' },
}));

vi.mock('../../hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: 'zh-CN' }),
}));

vi.mock('../../hooks/use-config', () => ({
  fetchConfig: vi.fn(async () => ({})),
}));

vi.mock('../../hooks/use-hana-fetch', () => ({
  hanaFetch: vi.fn(async () => new Response('{}', { status: 200 })),
  hanaUrl: (path: string) => `http://127.0.0.1:3210${path}`,
}));

vi.mock('../../stores/session-actions', () => ({
  ensureSession: vi.fn(async () => ({
    sessionId: 'sess_input',
    sessionPath: '/session/input.jsonl',
    agentId: 'hana',
  })),
  loadSessions: vi.fn(),
  upsertOptimisticSessionFirstMessage: vi.fn(),
  continueDeletedAgentSession: vi.fn(),
}));

vi.mock('../../stores/desk-actions', () => ({
  loadDeskFiles: vi.fn(),
  searchDeskFiles: (query: string) => mocks.searchDeskFiles(query),
  toggleJianSidebar: vi.fn(),
}));

vi.mock('../../services/websocket', () => ({
  getWebSocket: vi.fn(() => ({ readyState: WebSocket.OPEN, send: vi.fn() })),
}));

vi.mock('../../MainContent', () => ({
  attachFilesFromPaths: vi.fn(),
}));

vi.mock('../../components/input/SlashCommandMenu', () => ({
  SlashCommandMenu: () => null,
}));

vi.mock('../../components/input/MentionMenu', () => ({
  MentionMenu: (props: {
    items: Array<{ source?: string; name: string }>;
    busy: boolean;
  }) => {
    mocks.mentionMenuProps = props;
    return React.createElement(
      'div',
      {
        'data-testid': 'mention-menu',
        'data-busy': String(props.busy),
        'data-item-count': String(props.items.length),
      },
      props.items.map(item => React.createElement(
        'div',
        { key: item.name, 'data-source': item.source ?? 'unknown' },
        item.name,
      )),
    );
  },
}));

vi.mock('../../components/input/InputStatusBars', () => ({
  InputStatusBars: () => null,
}));

vi.mock('../../components/input/InputContextRow', () => ({
  InputContextRow: () => null,
}));

vi.mock('../../components/input/InputControlBar', () => ({
  InputControlBar: () => null,
}));

vi.mock('../../components/input/SessionConfirmationPrompt', () => ({
  SessionConfirmationPrompt: () => null,
}));

vi.mock('../../hooks/use-slash-items', () => ({
  useSkillSlashItems: () => [],
  useServerSlashCommandItems: () => [],
}));

vi.mock('../../utils/paste-upload-feedback', () => ({
  notifyPasteUploadFailure: vi.fn(),
}));

vi.mock('../../services/stream-resume', () => ({
  replayStreamResume: vi.fn(),
  isStreamResumeRebuilding: () => null,
  isStreamScopedMessage: () => false,
  updateSessionStreamMeta: vi.fn(),
}));

function seedInputState() {
  useStore.setState({
    currentSessionPath: '/session/input.jsonl',
    currentSessionId: 'sess_input',
    currentAgentId: 'hana',
    pendingDraftId: 'draft-input',
    sessions: [],
    sessionLocatorsById: { sess_input: { path: '/session/input.jsonl' } },
    connected: true,
    pendingNewSession: false,
    streamingSessions: [],
    compactingSessions: [],
    inlineErrors: {},
    attachedFiles: [],
    attachedFilesBySession: {},
    docContextAttached: false,
    quoteCandidate: null,
    quotedSelections: [],
    quotedSelection: null,
    models: [{
      id: 'deepseek-chat',
      provider: 'deepseek',
      name: 'DeepSeek Chat',
      input: ['text'],
      isCurrent: true,
    }],
    sessionModelsByPath: {},
    previewItems: [],
    previewOpen: false,
    activeTabId: null,
    chatSessions: {},
    serverPort: 3210,
    serverToken: null,
    modelSwitching: false,
    welcomeVisible: false,
    agentYuan: 'hanako',
    deskFiles: [{ name: 'README.md', isDir: false }],
    deskBasePath: '/workspace',
    agents: [],
  } as never);
}

describe('InputArea file mention workspace search', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.editorOptions = undefined;
    mocks.editorText = '';
    mocks.editorJson = undefined;
    mocks.editorState = undefined;
    mocks.updateHandler = undefined;
    mocks.mentionMenuProps = undefined;
    mocks.searchDeskFiles.mockResolvedValue([{
      name: 'reader.ts',
      relativePath: 'src/reader.ts',
      parentSubdir: 'src',
      isDir: false,
    }]);
    seedInputState();
    window.platform = {} as typeof window.platform;
  });

  it('searches desk files when @ mention menu opens with a query and shows workspace results', async () => {
    const doc = mentionSchema.node('doc', null, [
      mentionSchema.node('paragraph', null, [mentionSchema.text('@read')]),
    ]);
    setMockEditorDocument(doc, doc.content.size - 1);

    render(React.createElement(InputArea));

    await waitFor(() => {
      expect(mocks.updateHandler).toBeTypeOf('function');
    });

    act(() => {
      mocks.updateHandler?.();
    });

    expect(screen.getByTestId('mention-menu')).toBeTruthy();

    await waitFor(() => {
      expect(mocks.searchDeskFiles).toHaveBeenCalledWith('read');
    }, { timeout: 500 });

    await waitFor(() => {
      expect(mocks.mentionMenuProps?.items.some(item => (
        item.source === 'workspace' && item.name === 'reader.ts'
      ))).toBe(true);
    }, { timeout: 500 });

    expect(screen.getByTestId('mention-menu').getAttribute('data-busy')).toBe('false');
  });

  it('invalidates an older workspace search when the active scope changes', async () => {
    const oldScopeSearch = deferred<DeskSearchResult[]>();
    const newScopeSearch = deferred<DeskSearchResult[]>();
    mocks.searchDeskFiles
      .mockReturnValueOnce(oldScopeSearch.promise)
      .mockReturnValueOnce(newScopeSearch.promise);

    const doc = mentionSchema.node('doc', null, [
      mentionSchema.node('paragraph', null, [mentionSchema.text('@read')]),
    ]);
    setMockEditorDocument(doc, doc.content.size - 1);
    render(React.createElement(InputArea));

    await waitFor(() => {
      expect(mocks.updateHandler).toBeTypeOf('function');
    });
    act(() => {
      mocks.updateHandler?.();
    });
    await waitFor(() => {
      expect(mocks.searchDeskFiles).toHaveBeenCalledTimes(1);
    }, { timeout: 500 });

    act(() => {
      useStore.setState({ deskBasePath: '/other-workspace' } as never);
    });
    await waitFor(() => {
      expect(mocks.searchDeskFiles).toHaveBeenCalledTimes(2);
    }, { timeout: 500 });

    await act(async () => {
      oldScopeSearch.resolve([{
        name: 'old-read.ts',
        relativePath: 'old-read.ts',
        parentSubdir: '',
        isDir: false,
      }]);
      await Promise.resolve();
    });
    expect(mocks.mentionMenuProps?.items.some(item => item.name === 'old-read.ts')).toBe(false);

    await act(async () => {
      newScopeSearch.resolve([{
        name: 'new-read.ts',
        relativePath: 'new-read.ts',
        parentSubdir: '',
        isDir: false,
      }]);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(mocks.mentionMenuProps?.items.some(item => item.name === 'new-read.ts')).toBe(true);
    });
  });

  it('renders only the latest result when consecutive queries resolve out of order', async () => {
    const firstSearch = deferred<DeskSearchResult[]>();
    const secondSearch = deferred<DeskSearchResult[]>();
    mocks.searchDeskFiles
      .mockReturnValueOnce(firstSearch.promise)
      .mockReturnValueOnce(secondSearch.promise);

    const firstDoc = mentionSchema.node('doc', null, [
      mentionSchema.node('paragraph', null, [mentionSchema.text('@first')]),
    ]);
    setMockEditorDocument(firstDoc, firstDoc.content.size - 1);
    render(React.createElement(InputArea));

    await waitFor(() => {
      expect(mocks.updateHandler).toBeTypeOf('function');
    });
    act(() => {
      mocks.updateHandler?.();
    });
    await waitFor(() => {
      expect(mocks.searchDeskFiles).toHaveBeenCalledWith('first');
    }, { timeout: 500 });

    const secondDoc = mentionSchema.node('doc', null, [
      mentionSchema.node('paragraph', null, [mentionSchema.text('@second')]),
    ]);
    setMockEditorDocument(secondDoc, secondDoc.content.size - 1);
    act(() => {
      mocks.updateHandler?.();
    });
    await waitFor(() => {
      expect(mocks.searchDeskFiles).toHaveBeenCalledWith('second');
    }, { timeout: 500 });

    await act(async () => {
      firstSearch.resolve([{
        name: 'first-result.ts',
        relativePath: 'first-result.ts',
        parentSubdir: '',
        isDir: false,
      }]);
      await Promise.resolve();
    });
    expect(mocks.mentionMenuProps?.items.some(item => item.name === 'first-result.ts')).toBe(false);

    await act(async () => {
      secondSearch.resolve([{
        name: 'second-result.ts',
        relativePath: 'second-result.ts',
        parentSubdir: '',
        isDir: false,
      }]);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(mocks.mentionMenuProps?.items.some(item => item.name === 'second-result.ts')).toBe(true);
      expect(screen.getByTestId('mention-menu')).toHaveAttribute('data-busy', 'false');
    });
  });

  it('closes the menu and aborts a pending workspace search when the trigger is cleared', async () => {
    const pendingSearch = deferred<DeskSearchResult[]>();
    const abort = vi.spyOn(AbortController.prototype, 'abort');
    mocks.searchDeskFiles.mockReturnValueOnce(pendingSearch.promise);

    const queryDoc = mentionSchema.node('doc', null, [
      mentionSchema.node('paragraph', null, [mentionSchema.text('@read')]),
    ]);
    setMockEditorDocument(queryDoc, queryDoc.content.size - 1);
    render(React.createElement(InputArea));

    await waitFor(() => {
      expect(mocks.updateHandler).toBeTypeOf('function');
    });
    act(() => {
      mocks.updateHandler?.();
    });
    await waitFor(() => {
      expect(mocks.searchDeskFiles).toHaveBeenCalledWith('read');
    }, { timeout: 500 });

    const clearedDoc = mentionSchema.node('doc', null, [mentionSchema.node('paragraph')]);
    setMockEditorDocument(clearedDoc, 1);
    act(() => {
      mocks.updateHandler?.();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('mention-menu')).toBeNull();
      expect(abort).toHaveBeenCalled();
    });

    await act(async () => {
      pendingSearch.resolve([{
        name: 'late-read.ts',
        relativePath: 'late-read.ts',
        parentSubdir: '',
        isDir: false,
      }]);
      await Promise.resolve();
    });

    expect(screen.queryByTestId('mention-menu')).toBeNull();
  });

  it('cleans up a pending workspace search on unmount', async () => {
    const pendingSearch = deferred<DeskSearchResult[]>();
    const abort = vi.spyOn(AbortController.prototype, 'abort');
    mocks.searchDeskFiles.mockReturnValueOnce(pendingSearch.promise);

    const doc = mentionSchema.node('doc', null, [
      mentionSchema.node('paragraph', null, [mentionSchema.text('@read')]),
    ]);
    setMockEditorDocument(doc, doc.content.size - 1);
    const view = render(React.createElement(InputArea));

    await waitFor(() => {
      expect(mocks.updateHandler).toBeTypeOf('function');
    });
    act(() => {
      mocks.updateHandler?.();
    });
    await waitFor(() => {
      expect(mocks.searchDeskFiles).toHaveBeenCalledWith('read');
    }, { timeout: 500 });

    view.unmount();
    expect(abort).toHaveBeenCalled();

    await act(async () => {
      pendingSearch.resolve([]);
      await Promise.resolve();
    });
  });

  it('returns to a stable empty state when the workspace provider rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.searchDeskFiles.mockRejectedValueOnce(new Error('workspace unavailable'));

    const doc = mentionSchema.node('doc', null, [
      mentionSchema.node('paragraph', null, [mentionSchema.text('@unavailable')]),
    ]);
    setMockEditorDocument(doc, doc.content.size - 1);
    render(React.createElement(InputArea));

    await waitFor(() => {
      expect(mocks.updateHandler).toBeTypeOf('function');
    });
    act(() => {
      mocks.updateHandler?.();
    });

    await waitFor(() => {
      expect(mocks.searchDeskFiles).toHaveBeenCalledWith('unavailable');
      expect(screen.getByTestId('mention-menu')).toHaveAttribute('data-busy', 'false');
      expect(screen.getByTestId('mention-menu')).toHaveAttribute('data-item-count', '0');
    }, { timeout: 500 });
    expect(warn).toHaveBeenCalledWith('[file-mention] search failed', expect.any(Error));
  });
});
