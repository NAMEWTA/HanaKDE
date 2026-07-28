import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useStore } from 'zustand';
import {
  KNOWLEDGE_MARKDOWN_MAX_BYTES,
  MarkdownEditorSurface,
  knowledgeMarkdownContentGate,
  type MarkdownEditorSurfaceHandle,
  type MarkdownEditorSurfacePolicy,
} from '../preview/MarkdownEditorSurface';
import type {
  KnowledgeResourceAddress,
} from '../../../../../shared/knowledge-workspace-contract.ts';
import {
  KnowledgeWorkspaceClientError,
  knowledgeWorkspaceClient,
  type KnowledgeWorkspaceClient,
  type RendererResourceVersion,
} from '../../services/knowledge-workspace-client';
import {
  knowledgeDocumentKey,
  type KnowledgeDocumentRegistry,
  type KnowledgeDocumentSaveError,
  type KnowledgeDocumentSession,
} from '../../stores/knowledge-document-registry';
import {
  decodeKnowledgeMarkdownFile,
  encodeKnowledgeMarkdownFile,
} from '../../utils/knowledge-markdown-file';
import styles from './KnowledgeWorkspace.module.css';

type EditorLoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; reason: string };

export interface KnowledgeDocumentEditorProps {
  address: KnowledgeResourceAddress;
  viewId: string;
  groupId: string;
  registry: KnowledgeDocumentRegistry;
  client?: KnowledgeWorkspaceClient;
  onSaved?: (
    address: KnowledgeResourceAddress,
    version: RendererResourceVersion,
  ) => void;
  onOpenLink?: (url: string) => void | Promise<void>;
}

export interface KnowledgeDocumentNoticesProps {
  registry: KnowledgeDocumentRegistry;
}

function tr(key: string, vars?: Record<string, string | number>): string {
  return window.t?.(key, vars) ?? key;
}

function fileNameFromAddress(address: KnowledgeResourceAddress): string {
  return address.relativePath.split('/').at(-1) ?? address.relativePath;
}

function safeSize(version: RendererResourceVersion | undefined): number | null {
  return Number.isSafeInteger(version?.size) && Number(version?.size) >= 0
    ? Number(version?.size)
    : null;
}

function loadErrorReason(error: unknown): string {
  if (error instanceof KnowledgeWorkspaceClientError) {
    return tr('knowledge.document.loadErrorCode', { code: error.code });
  }
  return tr('knowledge.document.loadError');
}

function reportSaveError(
  registry: KnowledgeDocumentRegistry,
  address: KnowledgeResourceAddress,
  code: KnowledgeDocumentSaveError['code'],
): void {
  registry.getState().reportDocumentSaveError(address, {
    code,
    fileName: fileNameFromAddress(address),
    reason: code === 'conflict'
      ? 'knowledge.document.saveConflict'
      : 'knowledge.document.saveUnavailable',
  });
}

function sameVersionSize(
  version: RendererResourceVersion | undefined,
  fallbackSize: number,
  byteLength: number,
): boolean {
  const expectedSize = version?.size ?? fallbackSize;
  return expectedSize === byteLength;
}

export function KnowledgeDocumentEditor({
  address,
  viewId,
  groupId,
  registry,
  client = knowledgeWorkspaceClient,
  onSaved,
  onOpenLink,
}: KnowledgeDocumentEditorProps) {
  const addressKey = knowledgeDocumentKey(address);
  const requestAddress = useMemo<KnowledgeResourceAddress>(() => ({
    sourceKey: address.sourceKey,
    relativePath: address.relativePath,
  }), [address.relativePath, address.sourceKey]);
  const session = useStore(registry, state => state.sessions[addressKey]);
  const view = useStore(registry, state => state.views[viewId]);
  const editorRef = useRef<MarkdownEditorSurfaceHandle>(null);
  const requestIdRef = useRef(0);
  const [retryRevision, setRetryRevision] = useState(0);
  const [loadState, setLoadState] = useState<EditorLoadState>(() => (
    session ? { status: 'ready' } : { status: 'loading' }
  ));

  useEffect(() => {
    if (!session) return;
    const currentView = registry.getState().views[viewId];
    if (!currentView) {
      registry.getState().openDocumentView({
        viewId,
        address: requestAddress,
        groupId,
      });
    } else if (currentView.sessionKey !== addressKey) {
      setLoadState({
        status: 'error',
        reason: tr('knowledge.document.viewUnavailable'),
      });
      return;
    } else if (currentView.groupId !== groupId) {
      registry.getState().updateDocumentView(viewId, { groupId });
    }
    setLoadState({ status: 'ready' });
  }, [addressKey, groupId, registry, requestAddress, session, viewId]);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const controller = new AbortController();
    let disposed = false;

    const isStale = () => (
      disposed
      || controller.signal.aborted
      || requestIdRef.current !== requestId
    );
    const openView = (): boolean => {
      try {
        registry.getState().openDocumentView({
          viewId,
          address: requestAddress,
          groupId,
        });
        return true;
      } catch {
        setLoadState({
          status: 'error',
          reason: tr('knowledge.document.viewUnavailable'),
        });
        return false;
      }
    };

    const existing = registry.getState().sessions[addressKey];
    if (existing) {
      if (openView()) setLoadState({ status: 'ready' });
      return () => {
        disposed = true;
        controller.abort();
      };
    }

    setLoadState({ status: 'loading' });
    void (async () => {
      try {
        const stat = await client.resources.stat(requestAddress, {
          signal: controller.signal,
        });
        if (isStale()) return;
        if (!stat.exists) {
          setLoadState({
            status: 'error',
            reason: tr('knowledge.document.missing'),
          });
          return;
        }
        if (stat.isDirectory) {
          setLoadState({
            status: 'error',
            reason: tr('knowledge.document.notFile'),
          });
          return;
        }
        const size = safeSize(stat.version);
        if (size === null) {
          setLoadState({
            status: 'error',
            reason: tr('knowledge.document.sizeUnavailable'),
          });
          return;
        }
        if (size > KNOWLEDGE_MARKDOWN_MAX_BYTES) {
          setLoadState({
            status: 'error',
            reason: tr('knowledge.document.tooLarge'),
          });
          return;
        }

        const read = await client.resources.read(requestAddress, {
          encoding: 'base64',
          signal: controller.signal,
        });
        if (isStale()) return;
        if (read.encoding !== 'base64') {
          setLoadState({
            status: 'error',
            reason: tr('knowledge.document.invalidEncoding'),
          });
          return;
        }
        const decoded = decodeKnowledgeMarkdownFile(read.content);
        if (
          !decoded.ok
          || !sameVersionSize(read.version, size, decoded.byteLength)
        ) {
          setLoadState({
            status: 'error',
            reason: decoded.ok
              ? tr('knowledge.document.changedWhileOpening')
              : tr(`knowledge.document.${decoded.reason}`),
          });
          return;
        }
        const diskVersion = read.version ?? stat.version;
        if (!diskVersion) {
          setLoadState({
            status: 'error',
            reason: tr('knowledge.document.versionUnavailable'),
          });
          return;
        }
        if (isStale()) return;
        registry.getState().establishDocumentSession({
          address: requestAddress,
          buffer: decoded.content,
          diskVersion,
          format: decoded.format,
        });
        if (isStale()) return;
        if (openView()) setLoadState({ status: 'ready' });
      } catch (error) {
        if (isStale()) return;
        setLoadState({
          status: 'error',
          reason: loadErrorReason(error),
        });
      }
    })();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [
    addressKey,
    client,
    groupId,
    registry,
    requestAddress,
    retryRevision,
    viewId,
  ]);

  const savePolicy = useMemo<MarkdownEditorSurfacePolicy>(() => ({
    save: {
      scopeKey: `${registry.getState().context.ownerId}:${String(
        registry.getState().context.windowId,
      )}:${addressKey}`,
      mode: 'manual',
      execute: async () => {
        const current = registry.getState().sessions[addressKey];
        if (!current?.diskVersion) {
          reportSaveError(registry, requestAddress, 'unavailable');
          return { ok: false };
        }
        if (!current.dirty && !current.format.mixedLineEndings) {
          registry.getState().clearDocumentSaveError(requestAddress);
          return { ok: true };
        }
        const savedBuffer = current.buffer;
        const encoded = encodeKnowledgeMarkdownFile(
          savedBuffer,
          current.format,
        );
        if (!encoded.ok) {
          reportSaveError(registry, requestAddress, 'unavailable');
          return { ok: false };
        }
        const result = await client.resources.writeExpectedVersion(
          requestAddress,
          encoded.base64,
          current.diskVersion,
          { encoding: 'base64' },
        );
        if (!result.ok) {
          reportSaveError(registry, requestAddress, 'conflict');
          return { ok: false, conflict: true };
        }
        if (!result.version) {
          reportSaveError(registry, requestAddress, 'unavailable');
          return { ok: false };
        }
        registry.getState().commitSavedDocument(
          requestAddress,
          savedBuffer,
          result.version,
        );
        try {
          onSaved?.(requestAddress, result.version);
        } catch {
          // Saving already succeeded; an index refresh signal must not rewrite it
          // into a false document-save failure.
        }
        return { ok: true };
      },
      onError: error => {
        reportSaveError(registry, requestAddress, error.code);
      },
    },
    attachment: null,
    openLink: onOpenLink ? { open: onOpenLink } : null,
    contentGate: knowledgeMarkdownContentGate,
  }), [addressKey, client, onOpenLink, onSaved, registry, requestAddress]);

  const handleSelection = useCallback((editorView: NonNullable<
    ReturnType<MarkdownEditorSurfaceHandle['getView']>
  >) => {
    const selection = editorView.state.selection.main;
    registry.getState().updateDocumentView(viewId, {
      cursor: selection.head,
      selection: {
        anchor: selection.anchor,
        head: selection.head,
      },
      viewport: {
        from: editorView.viewport.from,
        to: editorView.viewport.to,
      },
    });
  }, [registry, viewId]);

  if (loadState.status === 'error') {
    return (
      <div className={styles.documentUnavailable} role="alert">
        <p>{loadState.reason}</p>
        <button
          className={styles.retryButton}
          type="button"
          onClick={() => setRetryRevision(revision => revision + 1)}
        >
          {tr('knowledge.retry')}
        </button>
      </div>
    );
  }
  if (loadState.status === 'loading' || !session || !view) {
    return (
      <div className={styles.documentStatus} role="status" aria-live="polite">
        {tr('knowledge.document.loading')}
      </div>
    );
  }

  return (
    <section
      className={styles.documentEditor}
      aria-label={tr('knowledge.document.editorLabel', {
        name: fileNameFromAddress(requestAddress),
      })}
      data-dirty={session.dirty ? 'true' : 'false'}
    >
      <MarkdownEditorSurface
        ref={editorRef}
        content={session.buffer}
        mode="markdown"
        filePath={requestAddress.relativePath}
        policy={savePolicy}
        initialScrollSnapshot={{
          scrollTop: view.scroll.top,
          scrollLeft: view.scroll.left,
        }}
        onContentChange={content => {
          registry.getState().replaceDocumentBuffer(viewId, content);
        }}
        onSelectionChange={handleSelection}
        onScrollSnapshotChange={(snapshot) => {
          registry.getState().updateDocumentView(viewId, {
            scroll: {
              top: Math.max(0, snapshot.scrollTop),
              left: Math.max(0, snapshot.scrollLeft ?? 0),
            },
          });
        }}
      />
    </section>
  );
}

function noticeText(session: KnowledgeDocumentSession): string | null {
  if (session.saveError) {
    return tr('knowledge.document.saveError', {
      name: session.saveError.fileName,
      reason: tr(session.saveError.reason),
    });
  }
  if (session.format.mixedLineEndings) {
    return tr('knowledge.document.mixedLineEndings', {
      name: fileNameFromAddress(session.address),
      ending: session.format.lineEnding === 'crlf' ? 'CRLF' : 'LF',
    });
  }
  return null;
}

export function KnowledgeDocumentNotices({
  registry,
}: KnowledgeDocumentNoticesProps) {
  const sessions = useStore(registry, state => state.sessions);
  const notices = Object.values(sessions)
    .map(session => ({ session, text: noticeText(session) }))
    .filter((entry): entry is {
      session: KnowledgeDocumentSession;
      text: string;
    } => entry.text !== null);

  if (notices.length === 0) return null;
  return (
    <div
      className={styles.documentNotices}
      aria-label={tr('knowledge.document.noticesLabel')}
    >
      {notices.map(({ session, text }) => (
        <div
          className={styles.documentNotice}
          data-kind={session.saveError ? 'error' : 'information'}
          role={session.saveError ? 'alert' : 'status'}
          key={session.key}
        >
          <span>{text}</span>
          {session.saveError ? (
            <button
              type="button"
              className={styles.documentNoticeClose}
              aria-label={tr('knowledge.document.dismissSaveError', {
                name: session.saveError.fileName,
              })}
              onClick={() => {
                registry.getState().clearDocumentSaveError(session.address);
              }}
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
