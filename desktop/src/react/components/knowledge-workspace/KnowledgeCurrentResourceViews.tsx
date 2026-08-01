import { useEffect, useMemo, useState } from 'react';
import { useStore as useRegistryStore } from 'zustand';
import type {
  KnowledgeResourceAddress,
} from '../../../../../shared/knowledge-workspace-contract.ts';
import {
  deriveKnowledgeCurrentResource,
} from '../../editor/knowledge-current-resource';
import {
  KnowledgeWorkspaceClientError,
  type KnowledgeWorkspaceClient,
  type RendererKnowledgeBacklinksResult,
} from '../../services/knowledge-workspace-client';
import {
  subscribeKnowledgeResourceTreeChanges,
  type KnowledgeResourceTreeChangeSignal,
} from '../../services/resource-events';
import {
  type KnowledgeDocumentRegistry,
} from '../../stores/knowledge-document-registry';
import type {
  KnowledgeEditorResourceKind,
} from './KnowledgeTabBar';
import styles from './KnowledgeWorkspace.module.css';

const tr = (key: string, vars?: Record<string, string | number>) =>
  window.t?.(key, vars) ?? key;

export interface KnowledgeCurrentResourceTarget {
  viewId: string;
  groupId: string;
  kind: KnowledgeEditorResourceKind;
  address: KnowledgeResourceAddress;
  sourceName: string;
}

export interface KnowledgeCurrentResourceViewsProps {
  registry: KnowledgeDocumentRegistry;
  client: KnowledgeWorkspaceClient;
  activeTarget: KnowledgeCurrentResourceTarget | null;
  onRevealCurrent(viewId: string, offset: number): void;
  onOpenOutbound(
    address: KnowledgeResourceAddress,
    sourceName: string,
    groupId: string,
    fragment: string | null,
    sourceKind: 'wikilink' | 'markdown_link',
    embedded: boolean,
  ): void;
  onOpenBacklink(
    address: KnowledgeResourceAddress,
    sourceName: string,
    groupId: string,
    offset: number,
  ): void;
  subscribeToChanges?: (
    listener: (signal: KnowledgeResourceTreeChangeSignal) => void,
  ) => () => void;
  refreshDelayMs?: number;
}

type BacklinksState =
  | { status: 'idle' | 'loading' }
  | {
      status: 'ready';
      queryKey: string;
      result: RendererKnowledgeBacklinksResult;
    }
  | { status: 'error'; queryKey: string; retryable: boolean };

type ProjectionInput = {
  queryKey: string;
  buffer: string;
  address: KnowledgeResourceAddress;
};

const EMPTY_PROJECTION = { outline: [], outbound: [] } as const;
const INDEX_SETTLE_RECHECK_MS = 2_000;

function referenceLabel(
  address: KnowledgeResourceAddress,
  fragment: string | null,
): string {
  return fragment
    ? `${address.relativePath}#${fragment}`
    : address.relativePath;
}

export function KnowledgeCurrentResourceViews({
  registry,
  client,
  activeTarget,
  onRevealCurrent,
  onOpenOutbound,
  onOpenBacklink,
  subscribeToChanges = subscribeKnowledgeResourceTreeChanges,
  refreshDelayMs = 650,
}: KnowledgeCurrentResourceViewsProps) {
  const activeMarkdownViewId = activeTarget?.kind === 'markdown'
    ? activeTarget.viewId
    : null;
  const activeSourceKey = activeTarget?.kind === 'markdown'
    ? activeTarget.address.sourceKey
    : null;
  const activeRelativePath = activeTarget?.kind === 'markdown'
    ? activeTarget.address.relativePath
    : null;
  const view = useRegistryStore(
    registry,
    state => activeMarkdownViewId
      ? state.views[activeMarkdownViewId]
      : undefined,
  );
  const session = useRegistryStore(
    registry,
    state => view ? state.sessions[view.sessionKey] : undefined,
  );
  const sessionKey = session?.key;
  const sessionBuffer = session?.buffer;
  const queryKey = activeSourceKey !== null && activeRelativePath !== null
    ? `${activeSourceKey}\0${activeRelativePath}`
    : null;
  const projectionInput = useMemo<ProjectionInput | null>(() => (
    queryKey && sessionKey !== undefined && sessionBuffer !== undefined
      ? {
          queryKey,
          buffer: sessionBuffer,
          address: {
            sourceKey: activeSourceKey!,
            relativePath: activeRelativePath!,
          },
        }
      : null
  ), [
    activeRelativePath,
    activeSourceKey,
    queryKey,
    sessionBuffer,
    sessionKey,
  ]);
  const projection = useMemo(() => (
    projectionInput?.queryKey === queryKey
      ? deriveKnowledgeCurrentResource(
          projectionInput.buffer,
          projectionInput.address,
        )
      : EMPTY_PROJECTION
  ), [
    projectionInput,
    queryKey,
  ]);
  const [retryRevision, setRetryRevision] = useState(0);
  const [backlinks, setBacklinks] = useState<BacklinksState>({
    status: 'idle',
  });
  const savedRevision = session
    ? [
        session.pendingCreate ? 'pending' : 'saved',
        session.resourceState,
        session.diskVersion?.mtimeMs ?? '',
        session.diskVersion?.size ?? '',
        session.diskVersion?.sha256 ?? '',
        session.diskVersion?.etag ?? '',
        session.diskVersion?.sequence ?? '',
      ].join('\0')
    : '';
  const backlinkQueryState = !session
    ? 'inactive'
    : session.resourceState === 'source-unavailable'
      ? 'unavailable'
      : (
          session.orphan
          || session.pendingCreate
          || session.resourceState === 'missing'
        )
        ? 'empty'
        : 'ready';

  useEffect(() => {
    const timers = new Set<number>();
    const clearTimers = () => {
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
    };
    const unsubscribe = subscribeToChanges(() => {
      clearTimers();
      const firstDelay = Math.max(0, refreshDelayMs);
      for (const delay of [firstDelay, firstDelay + INDEX_SETTLE_RECHECK_MS]) {
        const timer = window.setTimeout(() => {
          timers.delete(timer);
          setRetryRevision(value => value + 1);
        }, delay);
        timers.add(timer);
      }
    });
    return () => {
      unsubscribe();
      clearTimers();
    };
  }, [refreshDelayMs, subscribeToChanges]);

  useEffect(() => {
    if (
      activeSourceKey === null
      || activeRelativePath === null
      || queryKey === null
      || backlinkQueryState === 'inactive'
      || backlinkQueryState === 'empty'
    ) {
      setBacklinks({ status: 'idle' });
      return;
    }
    if (backlinkQueryState === 'unavailable') {
      setBacklinks({ status: 'error', queryKey, retryable: false });
      return;
    }
    const controller = new AbortController();
    setBacklinks({ status: 'loading' });
    void client.querySavedBacklinks({
      address: {
        sourceKey: activeSourceKey,
        relativePath: activeRelativePath,
      },
      limit: 100,
    }, {
      signal: controller.signal,
    }).then(result => {
      if (!controller.signal.aborted) {
        setBacklinks({ status: 'ready', queryKey, result });
      }
    }).catch(error => {
      if (controller.signal.aborted) return;
      setBacklinks({
        status: 'error',
        queryKey,
        retryable: error instanceof KnowledgeWorkspaceClientError
          ? error.retryable
          : true,
      });
    });
    return () => controller.abort();
  }, [
    activeRelativePath,
    activeSourceKey,
    backlinkQueryState,
    client,
    queryKey,
    retryRevision,
    savedRevision,
  ]);

  const headingId = 'knowledge-current-resource-heading';
  const active = activeTarget?.kind === 'markdown' && session;
  const visibleBacklinks = backlinks.status === 'ready'
    || backlinks.status === 'error'
    ? backlinks.queryKey === queryKey
      ? backlinks
      : { status: 'loading' as const }
    : backlinks;

  return (
    <aside
      className={styles.currentResourceViews}
      aria-labelledby={headingId}
      data-knowledge-current-resource-views=""
    >
      <h2 className={styles.panelHeading} id={headingId}>
        {tr('knowledge.currentViews.heading')}
      </h2>
      {!active ? (
        <p className={styles.currentViewEmpty} role="status">
          {tr('knowledge.currentViews.empty')}
        </p>
      ) : (
        <>
          <p className={styles.currentViewResource}>
            {activeTarget.address.relativePath}
          </p>
          {session.dirty ? (
            <p className={styles.currentViewDirtyNote} role="status">
              {tr('knowledge.currentViews.unsavedDifference')}
            </p>
          ) : null}

          <section
            className={styles.currentViewSection}
            aria-labelledby="knowledge-current-outline-heading"
          >
            <header className={styles.currentViewSectionHeader}>
              <h3 id="knowledge-current-outline-heading">
                {tr('knowledge.currentViews.outline')}
              </h3>
              <span data-fact-source="buffer">
                {tr('knowledge.currentViews.liveBuffer')}
              </span>
            </header>
            {projection.outline.length === 0 ? (
              <p className={styles.currentViewEmpty}>
                {tr('knowledge.currentViews.noOutline')}
              </p>
            ) : (
              <ul className={styles.currentViewList}>
                {projection.outline.map(item => (
                  <li key={`${item.fromOffset}:${item.slug}`}>
                    <button
                      type="button"
                      data-outline-level={item.level}
                      onClick={() => onRevealCurrent(
                        activeTarget.viewId,
                        item.fromOffset,
                      )}
                    >
                      {item.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            className={styles.currentViewSection}
            aria-labelledby="knowledge-current-outbound-heading"
          >
            <header className={styles.currentViewSectionHeader}>
              <h3 id="knowledge-current-outbound-heading">
                {tr('knowledge.currentViews.outbound')}
              </h3>
              <span data-fact-source="buffer">
                {tr('knowledge.currentViews.liveBuffer')}
              </span>
            </header>
            {projection.outbound.length === 0 ? (
              <p className={styles.currentViewEmpty}>
                {tr('knowledge.currentViews.noOutbound')}
              </p>
            ) : (
              <ul className={styles.currentViewList}>
                {projection.outbound.map(item => (
                  <li key={`${item.fromOffset}:${item.ordinal}`}>
                    <button
                      type="button"
                      onClick={() => onOpenOutbound(
                        item.targetAddress,
                        activeTarget.sourceName,
                        activeTarget.groupId,
                        item.fragment,
                        item.sourceKind,
                        item.embedded,
                      )}
                    >
                      {referenceLabel(item.targetAddress, item.fragment)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            className={styles.currentViewSection}
            aria-labelledby="knowledge-current-backlinks-heading"
          >
            <header className={styles.currentViewSectionHeader}>
              <h3 id="knowledge-current-backlinks-heading">
                {tr('knowledge.currentViews.backlinks')}
              </h3>
              <span data-fact-source="saved-index">
                {tr('knowledge.currentViews.savedIndex')}
              </span>
            </header>
            {visibleBacklinks.status === 'loading' ? (
              <p className={styles.currentViewEmpty} role="status">
                {tr('knowledge.currentViews.loadingBacklinks')}
              </p>
            ) : visibleBacklinks.status === 'error' ? (
              <div className={styles.currentViewError} role="alert">
                <span>{tr('knowledge.currentViews.backlinksError')}</span>
                {visibleBacklinks.retryable ? (
                  <button
                    type="button"
                    onClick={() => setRetryRevision(value => value + 1)}
                  >
                    {tr('knowledge.retry')}
                  </button>
                ) : null}
              </div>
            ) : visibleBacklinks.status === 'ready'
              && visibleBacklinks.result.items.length > 0 ? (
                <>
                  <ul className={styles.currentViewList}>
                    {visibleBacklinks.result.items.map(item => (
                      <li key={`${item.sourceAddress.relativePath}:${item.ordinal}`}>
                        <button
                          type="button"
                          onClick={() => onOpenBacklink(
                            item.sourceAddress,
                            activeTarget.sourceName,
                            activeTarget.groupId,
                            item.fromOffset,
                          )}
                        >
                          {item.sourceAddress.relativePath}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {visibleBacklinks.result.hasMore ? (
                    <p className={styles.currentViewMore}>
                      {tr('knowledge.currentViews.moreBacklinks')}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className={styles.currentViewEmpty}>
                  {tr('knowledge.currentViews.noBacklinks')}
                </p>
              )}
          </section>
        </>
      )}
    </aside>
  );
}
