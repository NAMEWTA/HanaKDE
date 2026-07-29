import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useStore } from 'zustand';
import {
  MarkdownEditorSurface,
  knowledgeMarkdownContentGate,
  type MarkdownEditorSurfaceHandle,
  type MarkdownEditorSurfacePolicy,
} from '../preview/MarkdownEditorSurface';
import type {
  KnowledgeResourceAddress,
} from '../../../../../shared/knowledge-workspace-contract.ts';
import {
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
  KnowledgeDocumentReadError,
  readKnowledgeMarkdownSnapshot,
  saveKnowledgeDocument,
} from '../../utils/knowledge-document-operations';
import styles from './KnowledgeWorkspace.module.css';
import type {
  KnowledgeLinkActivation,
} from '../../editor/knowledge-link-field';

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
  onOpenKnowledgeLink?: (
    activation: KnowledgeLinkActivation,
  ) => void | Promise<void>;
  onRequestOrphanSave?: () => void;
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

function loadErrorReason(error: unknown): string {
  if (error instanceof KnowledgeDocumentReadError) {
    return tr(`knowledge.document.${error.reason}`);
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

export function KnowledgeDocumentEditor({
  address,
  viewId,
  groupId,
  registry,
  client = knowledgeWorkspaceClient,
  onSaved,
  onOpenLink,
  onOpenKnowledgeLink,
  onRequestOrphanSave,
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
        const snapshot = await readKnowledgeMarkdownSnapshot(
          client,
          requestAddress,
          {
            signal: controller.signal,
          },
        );
        if (isStale()) return;
        registry.getState().establishDocumentSession({
          address: requestAddress,
          buffer: snapshot.buffer,
          diskVersion: snapshot.diskVersion,
          format: snapshot.format,
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
        if (current?.orphan) {
          onRequestOrphanSave?.();
          return { ok: true };
        }
        return saveKnowledgeDocument({
          registry,
          address: requestAddress,
          client,
          onSaved,
        });
      },
      onError: error => {
        reportSaveError(registry, requestAddress, error.code);
      },
    },
    attachment: null,
    openLink: onOpenLink ? { open: onOpenLink } : null,
    knowledgeLinks: {
      pageAddress: requestAddress,
      checkAddress: async (target, options) => (
        await client.resources.stat(target, options)
      ).exists,
      onActivate: activation => {
        if (activation.kind === 'external') {
          if (activation.url) return onOpenLink?.(activation.url);
          return undefined;
        }
        return onOpenKnowledgeLink?.(activation);
      },
      labels: {
        internal: (target, availability) => tr(
          availability === 'missing'
            ? 'knowledge.link.missing'
            : availability === 'unavailable'
              ? 'knowledge.link.unavailable'
              : 'knowledge.link.open',
          { path: target.relativePath },
        ),
        external: url => tr('knowledge.link.external', { url }),
        broken: reason => tr('knowledge.link.invalid', { reason }),
      },
    },
    contentGate: knowledgeMarkdownContentGate,
  }), [
    addressKey,
    client,
    onOpenLink,
    onOpenKnowledgeLink,
    onRequestOrphanSave,
    onSaved,
    registry,
    requestAddress,
  ]);

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

  const setDisplayMode = useCallback((
    mode: 'live-preview' | 'source',
  ) => {
    const result = editorRef.current?.setMarkdownDisplayMode(mode)
      ?? 'unavailable';
    if (result === 'changed' || result === 'unchanged') {
      registry.getState().updateDocumentView(viewId, { mode });
    }
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
  if (
    !session.orphan
    && (
      session.resourceState === 'missing'
      || session.resourceState === 'source-unavailable'
    )
  ) {
    return (
      <div className={styles.documentUnavailable} role="status">
        <p>
          {tr(
            session.resourceState === 'missing'
              ? 'knowledge.document.resourceMissing'
              : 'knowledge.document.sourceUnavailable',
            { name: fileNameFromAddress(session.address) },
          )}
        </p>
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
      data-orphan={session.orphan ? 'true' : 'false'}
    >
      <div
        className={styles.documentModeToolbar}
        role="group"
        aria-label={tr('knowledge.document.modeLabel')}
      >
        <button
          type="button"
          aria-label={tr('knowledge.document.livePreviewMode')}
          aria-pressed={view.mode === 'live-preview'}
          className={view.mode === 'live-preview'
            ? styles.documentModeButtonActive
            : undefined}
          onClick={() => setDisplayMode('live-preview')}
        >
          {tr('knowledge.document.livePreviewMode')}
        </button>
        <button
          type="button"
          aria-label={tr('knowledge.document.sourceMode')}
          aria-pressed={view.mode === 'source'}
          className={view.mode === 'source'
            ? styles.documentModeButtonActive
            : undefined}
          onClick={() => setDisplayMode('source')}
        >
          {tr('knowledge.document.sourceMode')}
        </button>
      </div>
      {session.orphan ? (
        <p className={styles.documentOrphanStatus} role="status">
          {tr('knowledge.document.orphan', {
            name: fileNameFromAddress(session.address),
          })}
        </p>
      ) : null}
      <MarkdownEditorSurface
        ref={editorRef}
        content={session.buffer}
        incomingContentMode="registry-authoritative"
        savedContent={session.baseline}
        mode="markdown"
        markdownDisplayMode={view.mode}
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
