import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useStore } from 'zustand';
import type {
  KnowledgeResourceAddress,
  KnowledgeSourceDto,
} from '../../../../../shared/knowledge-workspace-contract.ts';
import {
  knowledgeWorkspaceClient,
  type KnowledgeWorkspaceClient,
} from '../../services/knowledge-workspace-client';
import {
  retainKnowledgeSourceWatch,
  subscribeKnowledgeResourceTreeChanges,
  type KnowledgeResourceTreeChangeSignal,
} from '../../services/resource-events';
import {
  type KnowledgeDocumentRegistry,
  type KnowledgeDocumentSession,
} from '../../stores/knowledge-document-registry';
import {
  KnowledgeDocumentReadError,
  readKnowledgeMarkdownSnapshot,
  saveKnowledgeDocument,
  type KnowledgeDocumentReadFailureReason,
  type SaveKnowledgeDocumentInput,
  type SaveKnowledgeDocumentResult,
} from '../../utils/knowledge-document-operations';
import styles from './KnowledgeWorkspace.module.css';

export type KnowledgeConflictWatchSource = (
  sourceKey: string,
) => () => void;

export type KnowledgeConflictSubscribeToChanges = (
  listener: (signal: KnowledgeResourceTreeChangeSignal) => void,
) => () => void;

export interface KnowledgeConflictResolverProps {
  registry: KnowledgeDocumentRegistry;
  client?: KnowledgeWorkspaceClient;
  watchSource?: KnowledgeConflictWatchSource;
  subscribeToChanges?: KnowledgeConflictSubscribeToChanges;
  refreshDelayMs?: number;
  sources?: readonly KnowledgeSourceDto[];
  saveDocument?: (
    input: SaveKnowledgeDocumentInput,
  ) => Promise<SaveKnowledgeDocumentResult>;
}

type ExternalErrors = Record<string, KnowledgeDocumentReadFailureReason>;
const EMPTY_KNOWLEDGE_SOURCES: readonly KnowledgeSourceDto[] = [];

function tr(key: string, vars?: Record<string, string | number>): string {
  return window.t?.(key, vars) ?? key;
}

function fileNameFromAddress(address: KnowledgeResourceAddress): string {
  return address.relativePath.split('/').at(-1) ?? address.relativePath;
}

function conflictIdentity(session: KnowledgeDocumentSession): string {
  return `${session.key}:${JSON.stringify(session.conflict?.diskVersion ?? null)}`;
}

function formatSummary(
  format: KnowledgeDocumentSession['format'],
): string {
  return [
    format.lineEnding === 'crlf' ? 'CRLF' : 'LF',
    format.hadBom ? 'UTF-8 BOM' : null,
    format.mixedLineEndings ? 'MIXED' : null,
  ].filter(Boolean).join(' · ');
}

function ConflictCard({
  session,
  client,
  registry,
  saveDocument,
}: {
  session: KnowledgeDocumentSession;
  client: KnowledgeWorkspaceClient;
  registry: KnowledgeDocumentRegistry;
  saveDocument: NonNullable<KnowledgeConflictResolverProps['saveDocument']>;
}) {
  const conflict = session.conflict;
  const [merged, setMerged] = useState(conflict?.local ?? session.buffer);
  const [saving, setSaving] = useState(false);
  if (!conflict) return null;

  const resolve = async (
    resolution:
      | { kind: 'merge'; content: string }
      | { kind: 'local' }
      | { kind: 'disk' },
  ) => {
    if (saving) return;
    setSaving(true);
    try {
      const staged = registry.getState().resolveDocumentConflict(
        session.address,
        resolution,
      );
      if (!staged) return;
      await saveDocument({
        registry,
        address: session.address,
        client,
      });
    } finally {
      setSaving(false);
    }
  };

  const name = fileNameFromAddress(session.address);
  return (
    <section
      className={styles.conflictCard}
      role="region"
      aria-label={tr('knowledge.conflict.label', { name })}
      data-knowledge-conflict=""
    >
      <header className={styles.conflictHeader}>
        <h2>{tr('knowledge.conflict.title', { name })}</h2>
        <p>{tr('knowledge.conflict.description')}</p>
      </header>
      <div className={styles.conflictVersions}>
        <label>
          <span>
            {tr('knowledge.conflict.baseline')}
            <small>{formatSummary(session.format)}</small>
          </span>
          <textarea
            aria-label={tr('knowledge.conflict.baselineLabel', { name })}
            readOnly
            value={conflict.baseline}
          />
        </label>
        <label>
          <span>
            {tr('knowledge.conflict.local')}
            <small>{formatSummary(session.format)}</small>
          </span>
          <textarea
            aria-label={tr('knowledge.conflict.localLabel', { name })}
            readOnly
            value={conflict.local}
          />
        </label>
        <label>
          <span>
            {tr('knowledge.conflict.disk')}
            <small>{formatSummary(conflict.diskFormat)}</small>
          </span>
          <textarea
            aria-label={tr('knowledge.conflict.diskLabel', { name })}
            readOnly
            value={conflict.disk}
          />
        </label>
      </div>
      <label className={styles.conflictMerge}>
        <span>{tr('knowledge.conflict.merged')}</span>
        <textarea
          aria-label={tr('knowledge.conflict.mergedLabel', { name })}
          value={merged}
          onChange={event => setMerged(event.currentTarget.value)}
        />
      </label>
      <div className={styles.conflictActions}>
        <button
          type="button"
          disabled={saving}
          onClick={() => void resolve({ kind: 'merge', content: merged })}
        >
          {tr('knowledge.conflict.mergeAndSave')}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void resolve({ kind: 'local' })}
        >
          {tr('knowledge.conflict.useLocal')}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void resolve({ kind: 'disk' })}
        >
          {tr('knowledge.conflict.useDisk')}
        </button>
      </div>
    </section>
  );
}

export function KnowledgeConflictResolver({
  registry,
  client = knowledgeWorkspaceClient,
  watchSource = retainKnowledgeSourceWatch,
  subscribeToChanges = subscribeKnowledgeResourceTreeChanges,
  refreshDelayMs = 80,
  saveDocument = saveKnowledgeDocument,
  sources = EMPTY_KNOWLEDGE_SOURCES,
}: KnowledgeConflictResolverProps) {
  const sessions = useStore(registry, state => state.sessions);
  const sourceKeys = useMemo(() => Array.from(new Set(
    Object.values(sessions).map(session => session.address.sourceKey),
  )).sort(), [sessions]);
  const sourceKeysIdentity = sourceKeys.join('\n');
  const watchableSourceKeys = sources.length === 0
    ? sourceKeys
    : sourceKeys.filter(sourceKey => sources.some(source => (
        source.sourceKey === sourceKey
        && source.availability === 'available'
      )));
  const watchableSourceKeysIdentity = watchableSourceKeys.join('\n');
  const sourceAvailabilityIdentity = sources
    .map(source => `${source.sourceKey}:${source.availability}`)
    .sort()
    .join('\n');
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [externalErrors, setExternalErrors] = useState<ExternalErrors>({});

  useEffect(() => {
    const releases = watchableSourceKeys.map(
      sourceKey => watchSource(sourceKey),
    );
    return () => {
      for (const release of releases) release();
    };
  }, [watchableSourceKeysIdentity, watchSource]); // eslint-disable-line react-hooks/exhaustive-deps -- the sorted identity reconciles source leases.

  const refreshSession = useCallback(async (
    session: KnowledgeDocumentSession,
  ) => {
    if (session.orphan || session.resourceState === 'missing') return;
    const projectedSource = sources.find(source => (
      source.sourceKey === session.address.sourceKey
    ));
    if (
      sources.length > 0
      && (
        !projectedSource
        || projectedSource.availability !== 'available'
      )
    ) {
      registry.getState().markDocumentResourceUnavailable(
        session.address,
        'source-unavailable',
      );
      setExternalErrors(current => {
        if (!(session.key in current)) return current;
        const next = { ...current };
        delete next[session.key];
        return next;
      });
      return;
    }
    controllersRef.current.get(session.key)?.abort();
    const controller = new AbortController();
    controllersRef.current.set(session.key, controller);
    try {
      const snapshot = await readKnowledgeMarkdownSnapshot(
        client,
        session.address,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      registry.getState().reconcileExternalDocument(
        session.address,
        snapshot,
      );
      setExternalErrors(current => {
        if (!(session.key in current)) return current;
        const next = { ...current };
        delete next[session.key];
        return next;
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      const reason = error instanceof KnowledgeDocumentReadError
        ? error.reason
        : 'loadError';
      if (reason === 'missing') {
        registry.getState().markDocumentResourceUnavailable(
          session.address,
          'missing',
        );
        setExternalErrors(current => {
          if (!(session.key in current)) return current;
          const next = { ...current };
          delete next[session.key];
          return next;
        });
        return;
      }
      const currentSession = registry.getState().sessions[session.key];
      if (currentSession?.resourceState === 'source-unavailable') {
        setExternalErrors(current => {
          if (!(session.key in current)) return current;
          const next = { ...current };
          delete next[session.key];
          return next;
        });
        return;
      }
      setExternalErrors(current => ({
        ...current,
        [session.key]: reason,
      }));
    } finally {
      if (controllersRef.current.get(session.key) === controller) {
        controllersRef.current.delete(session.key);
      }
    }
  }, [client, registry, sources]);

  const refreshOpenSessions = useCallback(() => {
    for (const session of Object.values(registry.getState().sessions)) {
      void refreshSession(session);
    }
  }, [refreshSession, registry]);

  useEffect(() => {
    if (sourceKeys.length > 0) refreshOpenSessions();
  }, [refreshOpenSessions, sourceAvailabilityIdentity, sourceKeysIdentity]); // eslint-disable-line react-hooks/exhaustive-deps -- retained/restored sources perform one stat/read catch-up.

  useEffect(() => subscribeToChanges(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      refreshOpenSessions();
    }, Math.max(0, refreshDelayMs));
  }), [refreshDelayMs, refreshOpenSessions, subscribeToChanges]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    for (const controller of controllersRef.current.values()) {
      controller.abort();
    }
    controllersRef.current.clear();
  }, []);

  const conflicts = Object.values(sessions).filter(
    (session): session is KnowledgeDocumentSession & {
      conflict: NonNullable<KnowledgeDocumentSession['conflict']>;
    } => session.conflict !== null,
  );
  const errorSessions = Object.entries(externalErrors)
    .map(([key, reason]) => {
      const session = sessions[key];
      return session ? { session, reason } : null;
    })
    .filter((entry): entry is {
      session: KnowledgeDocumentSession;
      reason: KnowledgeDocumentReadFailureReason;
    } => entry !== null);

  if (conflicts.length === 0 && errorSessions.length === 0) return null;
  return (
    <aside
      className={styles.conflictResolver}
      aria-label={tr('knowledge.conflict.resolverLabel')}
    >
      {errorSessions.map(({ session, reason }) => (
        <div className={styles.conflictRefreshError} role="alert" key={session.key}>
          <span>
            {tr('knowledge.conflict.refreshError', {
              name: fileNameFromAddress(session.address),
              reason: tr(`knowledge.document.${reason}`),
            })}
          </span>
          <button
            type="button"
            onClick={() => void refreshSession(session)}
          >
            {tr('knowledge.retry')}
          </button>
        </div>
      ))}
      {conflicts.map(session => (
        <ConflictCard
          key={conflictIdentity(session)}
          session={session}
          client={client}
          registry={registry}
          saveDocument={saveDocument}
        />
      ))}
    </aside>
  );
}
