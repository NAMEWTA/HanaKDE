import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  KnowledgeResourceAddress,
  KnowledgeSourceDto,
} from '../../../../../shared/knowledge-workspace-contract.ts';
import type { KnowledgeNativeCapabilities } from '../../../../../shared/knowledge-native-contract.ts';
import type {
  KnowledgeWorkspaceClient,
} from '../../services/knowledge-workspace-client';
import type {
  KnowledgeDocumentRegistry,
} from '../../stores/knowledge-document-registry';
import {
  KnowledgeEditorGroups,
  type KnowledgeEditorGroupsHandle,
} from './KnowledgeEditorGroups';
import {
  KnowledgeEditorStatusBar,
} from './KnowledgeEditorStatusBar';
import {
  KnowledgeResourceTree,
  type KnowledgeResourceTreeHandle,
  type KnowledgeResourceTreeProps,
} from './KnowledgeResourceTree';
import { KnowledgeSearch } from './KnowledgeSearch';
import {
  KnowledgeCurrentResourceViews,
  type KnowledgeCurrentResourceTarget,
} from './KnowledgeCurrentResourceViews';
import { CreateResourceDialog } from './CreateResourceDialog';
import { KnowledgeTrashView } from './KnowledgeTrashView';
import {
  getKnowledgeNativeCapabilities,
  invokeKnowledgeNative,
} from '../../services/knowledge-native-client';
import { useStore } from '../../stores';
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
  const renderedSources = useMemo(() => visibleSources(sources), [sources]);
  const sourcesHeadingId = 'knowledge-sources-heading';
  const [activeStatusTarget, setActiveStatusTarget] =
    useState<KnowledgeCurrentResourceTarget | null>(null);
  const editorGroupsRef = useRef<KnowledgeEditorGroupsHandle>(null);
  const resourceTreeRef = useRef<KnowledgeResourceTreeHandle>(null);
  const [selection, setSelection] = useState<{
    sourceKey: string | null;
    addresses: readonly KnowledgeResourceAddress[];
    targetDirectoryPath: string | null;
  }>({ sourceKey: 'main', addresses: [], targetDirectoryPath: '' });
  const [createKind, setCreateKind] = useState<'page' | 'folder' | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [nativeCapabilities, setNativeCapabilities] = useState<KnowledgeNativeCapabilities | null>(null);
  const knowledgeClipboard = useStore(state => state.knowledgeClipboard);
  const setKnowledgeClipboard = useStore(state => state.setKnowledgeClipboard);
  const retainKnowledgeClipboardFailures = useStore(state => state.retainKnowledgeClipboardFailures);

  useEffect(() => {
    let active = true;
    void getKnowledgeNativeCapabilities().then((capabilities) => {
      if (active) setNativeCapabilities(capabilities);
    });
    return () => { active = false; };
  }, []);

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

      <KnowledgeSearch
        client={treeClient}
        sources={renderedSources}
        onOpen={(item, sourceName) => {
          editorGroupsRef.current?.openResource({
            address: item.address,
            sourceName,
            kind: item.kind === 'page' ? 'markdown' : 'asset',
          });
        }}
      />

      <nav className={styles.treePanel} aria-label={tr('knowledge.tree.heading')}>
        <div className={styles.treeToolbar} role="toolbar" aria-label={tr('knowledge.actions.label')}>
          <h2 className={styles.panelHeading}>{tr('knowledge.tree.heading')}</h2>
          <button disabled={selection.targetDirectoryPath === null} type="button" onClick={() => setCreateKind('page')}>{tr('knowledge.action.newPage')}</button>
          <button disabled={selection.targetDirectoryPath === null} type="button" onClick={() => setCreateKind('folder')}>{tr('knowledge.action.newFolder')}</button>
          <button disabled={selection.targetDirectoryPath === null} type="button" onClick={() => void invokeKnowledgeNative({
            action: 'pickFiles',
            target: { sourceKey: selection.sourceKey ?? 'main', directoryPath: selection.targetDirectoryPath ?? '' },
            conflictPolicy: 'keep-both',
          })}>{tr('knowledge.action.import')}</button>
          <button disabled={selection.addresses.length === 0} type="button" onClick={() => setKnowledgeClipboard(treeWorkspaceKey, 'copy', selection.addresses)}>{tr('knowledge.action.copy')}</button>
          <button disabled={selection.addresses.length === 0} type="button" onClick={() => setKnowledgeClipboard(treeWorkspaceKey, 'cut', selection.addresses)}>{tr('knowledge.action.cut')}</button>
          <button disabled={(!nativeCapabilities?.fileClipboard && (!knowledgeClipboard || knowledgeClipboard.workspaceKey !== treeWorkspaceKey)) || !selection.sourceKey || selection.targetDirectoryPath === null} type="button" onClick={async () => {
            if (!selection.sourceKey) return;
            if (!knowledgeClipboard || knowledgeClipboard.workspaceKey !== treeWorkspaceKey) {
              await invokeKnowledgeNative({
                action: 'importClipboardFiles',
                target: { sourceKey: selection.sourceKey, directoryPath: selection.targetDirectoryPath ?? '' },
                conflictPolicy: 'keep-both',
              });
              return;
            }
            const results = await treeClient.pasteResources({
              intent: knowledgeClipboard.intent,
              items: knowledgeClipboard.addresses,
              target: { sourceKey: selection.sourceKey, directoryPath: selection.targetDirectoryPath ?? '' },
            });
            if (knowledgeClipboard.intent === 'cut') {
              retainKnowledgeClipboardFailures(results
                .filter(result => result.ok === false)
                .map(result => result.sourceAddress)
                .filter((address): address is KnowledgeResourceAddress => Boolean(address)));
            }
          }}>{tr('knowledge.action.paste')}</button>
          <button disabled={selection.addresses.length === 0} type="button" onClick={async () => {
            if (!window.confirm(tr('knowledge.trash.deleteConfirm'))) return;
            if (!await editorGroupsRef.current?.prepareResourceRemoval(selection.addresses)) return;
            const result = await treeClient.trashResources(selection.addresses);
            for (const item of result.items) {
              if (item.ok !== true || !item.originalAddress || typeof item.originalAddress !== 'object') continue;
              const original = item.originalAddress as KnowledgeResourceAddress;
              const registryState = documentRegistry.getState();
              for (const session of Object.values(registryState.sessions)) {
                if (
                  session.address.sourceKey === original.sourceKey
                  && (
                    session.address.relativePath === original.relativePath
                    || session.address.relativePath.startsWith(`${original.relativePath}/`)
                  )
                ) {
                  registryState.markDocumentResourceUnavailable(
                    session.address,
                    'missing',
                  );
                }
              }
            }
          }}>{tr('knowledge.action.delete')}</button>
          <button type="button" onClick={() => setTrashOpen(true)}>{tr('knowledge.trash.title')}</button>
        </div>
        <div
          className={styles.tree}
          role="tree"
          aria-label={tr('knowledge.tree.heading')}
        >
          <KnowledgeResourceTree
            ref={resourceTreeRef}
            client={treeClient}
            sources={renderedSources}
            workspaceKey={treeWorkspaceKey}
            onSelectionChange={({ sourceKey, addresses, contextTarget }) => {
              if (addresses.length > 1) {
                const parents = new Set(addresses.map(address => {
                  const slash = address.relativePath.lastIndexOf('/');
                  return slash < 0 ? '' : address.relativePath.slice(0, slash);
                }));
                setSelection({ sourceKey, addresses, targetDirectoryPath: parents.size === 1 ? [...parents][0] : null });
                return;
              }
              const target = contextTarget ?? addresses[0] ?? null;
              if (!target) {
                setSelection(current => {
                  const activeSourceKey = sourceKey
                    ?? current.sourceKey
                    ?? renderedSources[0]?.sourceKey
                    ?? null;
                  return {
                    sourceKey: activeSourceKey,
                    addresses,
                    targetDirectoryPath: activeSourceKey ? '' : null,
                  };
                });
                return;
              }
              const slash = target.relativePath.lastIndexOf('/');
              const parent = slash < 0 ? '' : target.relativePath.slice(0, slash);
              setSelection({ sourceKey, addresses, targetDirectoryPath: parent });
              void treeClient.resources.stat(target).then(stat => {
                if (stat.isDirectory) setSelection(current => ({ ...current, targetDirectoryPath: target.relativePath }));
              }).catch(() => {});
            }}
            onOpenResource={({ address, sourceName, mode, focusContent }) => {
              const opened = editorGroupsRef.current?.openResource({
                address,
                sourceName,
                kind: address.relativePath.toLocaleLowerCase().endsWith('.md')
                  ? 'markdown'
                  : 'asset',
              }, { mode });
              if (focusContent && opened) {
                requestAnimationFrame(() => {
                  editorGroupsRef.current?.focusView(opened.viewId);
                });
              }
            }}
            {...treeServices}
          />
        </div>
      </nav>

      <KnowledgeEditorGroups
        ref={editorGroupsRef}
        key={treeWorkspaceKey}
        registry={documentRegistry}
        client={treeClient}
        workspaceKey={treeWorkspaceKey}
        sources={renderedSources}
        sourcesReady={sourcesStatus === 'ready'}
        conflictServices={treeServices}
        onLocateResource={(target) => resourceTreeRef.current?.locateResource(target)}
        onActiveTargetChange={setActiveStatusTarget}
      />
      <KnowledgeCurrentResourceViews
        registry={documentRegistry}
        client={treeClient}
        activeTarget={activeStatusTarget}
        subscribeToChanges={treeServices?.subscribeToChanges}
        onRevealCurrent={(viewId, offset) => {
          editorGroupsRef.current?.revealOffset(viewId, offset);
        }}
        onOpenOutbound={(
          address,
          _sourceName,
          groupId,
          fragment,
          sourceKind,
          embedded,
        ) => {
          void editorGroupsRef.current?.openCurrentOutbound(
            address,
            groupId,
            fragment,
            sourceKind,
            embedded,
          );
        }}
        onOpenBacklink={(address, sourceName, groupId, offset) => {
          editorGroupsRef.current?.openBacklink({
            address,
            sourceName,
            kind: 'markdown',
          }, groupId, offset);
        }}
      />
      <KnowledgeEditorStatusBar
        registry={documentRegistry}
        activeTarget={activeStatusTarget}
      />
      <CreateResourceDialog
        client={treeClient}
        kind={createKind}
        sourceKey={selection.sourceKey ?? 'main'}
        directoryPath={selection.targetDirectoryPath ?? ''}
        onClose={() => setCreateKind(null)}
        onCreated={(result) => {
          if (result.kind !== 'page') return;
          const sourceName = renderedSources.find(source => source.sourceKey === result.address.sourceKey)?.displayName ?? result.address.sourceKey;
          const opened = editorGroupsRef.current?.openResource({ address: result.address, sourceName, kind: 'markdown' }, { mode: 'pinned' });
          if (opened) requestAnimationFrame(() => editorGroupsRef.current?.focusView(opened.viewId));
        }}
      />
      <KnowledgeTrashView
        client={treeClient}
        sources={renderedSources}
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        systemTrashAvailable={nativeCapabilities?.systemTrash === true}
      />
    </main>
  );
}
