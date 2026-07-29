import { useState } from 'react';
import type {
  KnowledgeSourceDto,
} from '../../../../../shared/knowledge-workspace-contract.ts';
import type {
  KnowledgeWorkspaceClient,
} from '../../services/knowledge-workspace-client';
import type {
  KnowledgeDocumentRegistry,
} from '../../stores/knowledge-document-registry';
import { KnowledgeEditorGroups } from './KnowledgeEditorGroups';
import {
  KnowledgeEditorStatusBar,
  type KnowledgeEditorStatusTarget,
} from './KnowledgeEditorStatusBar';
import {
  KnowledgeResourceTree,
  type KnowledgeResourceTreeProps,
} from './KnowledgeResourceTree';
import styles from './KnowledgeWorkspace.module.css';

const tr = (key: string) => window.t?.(key) ?? key;

export interface KnowledgeLayoutProps {
  sources: KnowledgeSourceDto[];
  sourcesStatus: 'idle' | 'loading' | 'ready' | 'error';
  treeClient: KnowledgeWorkspaceClient;
  treeWorkspaceKey: string;
  documentRegistry: KnowledgeDocumentRegistry;
  treeServices?: Pick<
    KnowledgeResourceTreeProps,
    'watchSource' | 'subscribeToChanges' | 'refreshDelayMs'
  >;
  onRetry(): void;
}

function visibleSources(sources: KnowledgeSourceDto[]): KnowledgeSourceDto[] {
  const main = sources.find((source) => source.sourceKey === 'main');
  const mounted = sources.filter((source) => source.sourceKey !== 'main');
  return [
    main ?? {
      sourceKey: 'main',
      displayName: tr('knowledge.source.main'),
      role: 'main',
      capabilities: [],
      availability: 'available',
    },
    ...mounted,
  ];
}

export function KnowledgeLayout({
  sources,
  sourcesStatus,
  treeClient,
  treeWorkspaceKey,
  documentRegistry,
  treeServices,
  onRetry,
}: KnowledgeLayoutProps) {
  const renderedSources = visibleSources(sources);
  const sourcesHeadingId = 'knowledge-sources-heading';
  const [activeStatusTarget, setActiveStatusTarget] =
    useState<KnowledgeEditorStatusTarget | null>(null);

  return (
    <main
      className={styles.workspace}
      aria-label={tr('knowledge.workspaceLabel')}
      data-knowledge-workspace=""
    >
      <section
        className={styles.sourcesPanel}
        role="region"
        aria-labelledby={sourcesHeadingId}
      >
        <h2 className={styles.panelHeading} id={sourcesHeadingId}>
          {tr('knowledge.sources.heading')}
        </h2>
        <ul className={styles.sourceList}>
          {renderedSources.map((source) => (
            <li
              className={styles.sourceItem}
              data-availability={source.availability}
              data-source-key={source.sourceKey}
              key={source.sourceKey}
            >
              <span className={styles.sourceIndicator} aria-hidden="true" />
              <span className={styles.sourceName}>{source.displayName}</span>
              {source.role === 'main' && source.displayName !== tr('knowledge.source.main') && (
                <span className={styles.sourceRole}>
                  {tr('knowledge.source.main')}
                </span>
              )}
            </li>
          ))}
        </ul>
        {sourcesStatus === 'loading' && (
          <p className={styles.status} role="status">
            {tr('knowledge.sources.loading')}
          </p>
        )}
        {sourcesStatus === 'error' && (
          <div className={styles.sourceError} role="alert">
            <span>{tr('knowledge.sources.error')}</span>
            <button className={styles.retryButton} type="button" onClick={onRetry}>
              {tr('knowledge.retry')}
            </button>
          </div>
        )}
      </section>

      <nav className={styles.treePanel} aria-label={tr('knowledge.tree.heading')}>
        <h2 className={styles.panelHeading}>{tr('knowledge.tree.heading')}</h2>
        <div
          className={styles.tree}
          role="tree"
          aria-label={tr('knowledge.tree.heading')}
        >
          <KnowledgeResourceTree
            client={treeClient}
            sources={renderedSources}
            workspaceKey={treeWorkspaceKey}
            {...treeServices}
          />
        </div>
      </nav>

      <KnowledgeEditorGroups
        key={treeWorkspaceKey}
        registry={documentRegistry}
        client={treeClient}
        workspaceKey={treeWorkspaceKey}
        sources={renderedSources}
        sourcesReady={sourcesStatus === 'ready'}
        conflictServices={treeServices}
        onActiveTargetChange={setActiveStatusTarget}
      />
      <KnowledgeEditorStatusBar
        registry={documentRegistry}
        activeTarget={activeStatusTarget}
      />
    </main>
  );
}
