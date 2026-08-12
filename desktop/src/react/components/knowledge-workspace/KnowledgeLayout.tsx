import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  invokeKnowledgeNativeGrant,
  invokeKnowledgeNative,
} from '../../services/knowledge-native-client';
import { isMarkdownFileName } from '../../utils/file-kind';
import { ContextMenu, type ContextMenuItem } from '../../ui/ContextMenu';
import { ICONS } from '../desk/desk-types';
import { useStore } from '../../stores';
import { knowledgeClipboardPasteAllowed } from '../../stores/knowledge-clipboard-slice';
import styles from './KnowledgeWorkspace.module.css';

const tr = (key: string) => window.t?.(key) ?? key;

function menuLabel(key: string, fallback: string): string {
  const translated = tr(key);
  return translated === key ? fallback : translated;
}

function menuIcon(markup: string) {
  return <span dangerouslySetInnerHTML={{ __html: markup }} />;
}

function toolbarIcon(markup: string) {
  return (
    <span
      aria-hidden="true"
      className={styles.toolbarIcon}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

function parentDirectory(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/');
  return slash < 0 ? '' : relativePath.slice(0, slash);
}

function baseName(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/');
  return slash < 0 ? relativePath : relativePath.slice(slash + 1);
}

function joinRelativePath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

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
    main ? { ...main, displayName: tr('knowledge.source.main') } : {
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
  const selectedSourceWritable = renderedSources.find(
    source => source.sourceKey === selection.sourceKey,
  )?.capabilities.includes('write') === true;
  const selectedSourceCanTrash = renderedSources.find(
    source => source.sourceKey === selection.sourceKey,
  )?.capabilities.includes('trash') === true;
  const knowledgeClipboard = useStore(state => state.knowledgeClipboard);
  const activeClipboard = knowledgeClipboard?.workspaceKey === treeWorkspaceKey
    ? knowledgeClipboard
    : null;
  const setKnowledgeClipboard = useStore(state => state.setKnowledgeClipboard);
  const retainKnowledgeClipboardFailures = useStore(state => state.retainKnowledgeClipboardFailures);
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
    items: ContextMenuItem[];
  } | null>(null);

  const markDocumentsUnavailable = useCallback((items: readonly Record<string, unknown>[]) => {
    const registryState = documentRegistry.getState();
    for (const item of items) {
      if (item.ok !== true || !item.originalAddress || typeof item.originalAddress !== 'object') continue;
      const original = item.originalAddress as KnowledgeResourceAddress;
      for (const session of Object.values(registryState.sessions)) {
        if (
          session.address.sourceKey === original.sourceKey
          && (
            session.address.relativePath === original.relativePath
            || session.address.relativePath.startsWith(`${original.relativePath}/`)
          )
        ) {
          registryState.markDocumentResourceUnavailable(session.address, 'missing');
        }
      }
    }
  }, [documentRegistry]);

  const notifyResourceActionError = useCallback((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : String(cause);
    window.dispatchEvent(new CustomEvent('hana-inline-notice', {
      detail: { text: message, type: 'error' },
    }));
  }, []);

  const createContextMenu = useCallback((input: Readonly<{
    position: { x: number; y: number };
    address: KnowledgeResourceAddress;
    isDirectory: boolean;
    addresses: readonly KnowledgeResourceAddress[];
  }>) => {
    const addresses = input.addresses.length > 0 ? input.addresses : [input.address];
    const source = renderedSources.find(candidate => candidate.sourceKey === input.address.sourceKey);
    const writable = source?.capabilities.includes('write') === true;
    const canTrash = source?.capabilities.includes('trash') === true;
    const hasOnlyResources = addresses.every(address => address.relativePath.length > 0);
    const canUseNativeResourceAction = hasOnlyResources;
    const icon = (markup: string) => menuIcon(markup);
    const copyRelativePath = () => {
      const value = addresses.length === 1
        ? addresses[0].relativePath
        : addresses.map(address => address.relativePath).join('\n');
      void navigator.clipboard?.writeText(value).catch(() => {});
    };
    const rename = async () => {
      if (addresses.length !== 1 || !hasOnlyResources || !writable) return;
      const address = addresses[0];
      const currentName = baseName(address.relativePath);
      const nextName = window.prompt(menuLabel('knowledge.context.renamePrompt', '重命名'), currentName)?.trim();
      if (!nextName || nextName === currentName || nextName.includes('/') || nextName.includes('\\')) return;
      try {
        const stat = await treeClient.resources.stat(address);
        if (!stat.exists || !stat.version) return;
        const plan = await treeClient.operations.plan({
          kind: 'rename',
          from: address,
          to: {
            sourceKey: address.sourceKey,
            relativePath: joinRelativePath(parentDirectory(address.relativePath), nextName),
          },
          expectedVersion: stat.version,
        });
        await treeClient.operations.commit(plan.operationId, plan.requestHash);
        resourceTreeRef.current?.locateResource({
          kind: input.isDirectory ? 'folder' : 'resource',
          sourceKey: address.sourceKey,
          relativePath: joinRelativePath(parentDirectory(address.relativePath), nextName),
        });
      } catch (cause) {
        notifyResourceActionError(cause);
      }
    };
    const deleteResources = async () => {
      if (!canTrash || !hasOnlyResources) return;
      if (!window.confirm(tr('knowledge.trash.deleteConfirm'))) return;
      try {
        if (!await editorGroupsRef.current?.prepareResourceRemoval(addresses)) return;
        const result = await treeClient.trashResources(addresses);
        markDocumentsUnavailable(result.items);
      } catch (cause) {
        notifyResourceActionError(cause);
      }
    };
    const openDefault = async () => {
      if (!canUseNativeResourceAction || input.isDirectory || !nativeCapabilities?.openDefault || addresses.length !== 1) return;
      try {
        await invokeKnowledgeNativeGrant(treeClient, 'openDefault', input.address);
      } catch (cause) {
        notifyResourceActionError(cause);
      }
    };
    const reveal = async () => {
      if (!canUseNativeResourceAction || !nativeCapabilities?.reveal || addresses.length !== 1) return;
      try {
        await invokeKnowledgeNativeGrant(treeClient, 'reveal', input.address);
      } catch (cause) {
        notifyResourceActionError(cause);
      }
    };
    const copyAbsolutePath = async () => {
      if (!canUseNativeResourceAction || !nativeCapabilities?.copyPath || addresses.length !== 1) return;
      try {
        await invokeKnowledgeNativeGrant(treeClient, 'copyPath', input.address);
      } catch (cause) {
        notifyResourceActionError(cause);
      }
    };
    setContextMenu({
      position: input.position,
      items: [
        {
          label: menuLabel('knowledge.action.cut', '剪切'),
          icon: icon(ICONS.cut),
          disabled: !hasOnlyResources || !writable,
          action: () => setKnowledgeClipboard(treeWorkspaceKey, 'cut', addresses),
        },
        {
          label: menuLabel('knowledge.action.copy', '复制'),
          icon: icon(ICONS.copy),
          disabled: !hasOnlyResources,
          action: () => setKnowledgeClipboard(treeWorkspaceKey, 'copy', addresses),
        },
        {
          label: menuLabel('knowledge.action.delete', '删除'),
          icon: icon(ICONS.trash),
          danger: true,
          disabled: !canTrash || !hasOnlyResources,
          action: () => { void deleteResources(); },
        },
        {
          label: menuLabel('knowledge.context.rename', '重命名'),
          icon: icon(ICONS.rename),
          disabled: addresses.length !== 1 || !hasOnlyResources || !writable,
          action: () => { void rename(); },
        },
        { divider: true },
        {
          label: menuLabel('knowledge.context.copyRelativePath', '复制相对路径'),
          icon: icon(ICONS.doc),
          disabled: !hasOnlyResources,
          action: copyRelativePath,
        },
        ...(canUseNativeResourceAction && addresses.length === 1 && nativeCapabilities?.copyPath ? [{
          label: menuLabel('knowledge.context.copyAbsolutePath', '复制绝对路径'),
          icon: icon(ICONS.doc),
          tooltip: menuLabel('knowledge.context.copyAbsolutePath', '复制绝对路径'),
          action: () => { void copyAbsolutePath(); },
        }] : []),
        {
          label: menuLabel('knowledge.context.openFolder', '打开文件夹'),
          icon: icon(ICONS.folder),
          disabled: addresses.length !== 1,
          action: () => resourceTreeRef.current?.locateResource({
            kind: 'folder',
            sourceKey: input.address.sourceKey,
            relativePath: input.isDirectory ? input.address.relativePath : parentDirectory(input.address.relativePath),
          }),
        },
        ...(canUseNativeResourceAction && !input.isDirectory && addresses.length === 1 && nativeCapabilities?.openDefault ? [{
          label: menuLabel('knowledge.asset.openDefault', '用默认应用程序打开'),
          icon: icon(ICONS.file),
          action: () => { void openDefault(); },
        }] : []),
        ...(canUseNativeResourceAction && addresses.length === 1 && nativeCapabilities?.reveal ? [{
          label: menuLabel('knowledge.context.reveal', '在文件管理器中显示'),
          icon: icon(ICONS.folderOpen),
          action: () => { void reveal(); },
        }] : []),
      ],
    });
  }, [
    editorGroupsRef,
    nativeCapabilities,
    notifyResourceActionError,
    renderedSources,
    markDocumentsUnavailable,
    setKnowledgeClipboard,
    treeClient,
    treeWorkspaceKey,
  ]);

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
          <button aria-label={tr('knowledge.action.newPage')} title={tr('knowledge.action.newPage')} disabled={selection.targetDirectoryPath === null || !selectedSourceWritable} type="button" onClick={() => setCreateKind('page')}>{toolbarIcon(ICONS.markdown)}</button>
          <button aria-label={tr('knowledge.action.newFolder')} title={tr('knowledge.action.newFolder')} disabled={selection.targetDirectoryPath === null || !selectedSourceWritable} type="button" onClick={() => setCreateKind('folder')}>{toolbarIcon(ICONS.folder)}</button>
          <button aria-label={tr('knowledge.action.import')} title={tr('knowledge.action.import')} disabled={selection.targetDirectoryPath === null || !selectedSourceWritable || nativeCapabilities?.filePicker !== true} type="button" onClick={() => void invokeKnowledgeNative({
            action: 'pickFiles',
            target: { sourceKey: selection.sourceKey ?? 'main', directoryPath: selection.targetDirectoryPath ?? '' },
            conflictPolicy: 'keep-both',
          })}>{toolbarIcon(ICONS.finderOpen)}</button>
          <button aria-label={tr('knowledge.action.copy')} title={tr('knowledge.action.copy')} disabled={selection.addresses.length === 0} type="button" onClick={() => setKnowledgeClipboard(treeWorkspaceKey, 'copy', selection.addresses)}>{toolbarIcon(ICONS.copy)}</button>
          <button aria-label={tr('knowledge.action.cut')} title={tr('knowledge.action.cut')} disabled={selection.addresses.length === 0 || !selectedSourceWritable} type="button" onClick={() => setKnowledgeClipboard(treeWorkspaceKey, 'cut', selection.addresses)}>{toolbarIcon(ICONS.cut)}</button>
          <button aria-label={tr('knowledge.action.paste')} title={tr('knowledge.action.paste')} disabled={(!nativeCapabilities?.fileClipboard && !activeClipboard) || !selection.sourceKey || selection.targetDirectoryPath === null || !selectedSourceWritable} type="button" onClick={async () => {
            if (!selection.sourceKey) return;
            if (knowledgeClipboard && !activeClipboard) {
              retainKnowledgeClipboardFailures(knowledgeClipboard.addresses);
              notifyResourceActionError(new Error(menuLabel(
                'knowledge.clipboard.staleWorkspace',
                '剪贴板来自已关闭的工作区',
              )));
              return;
            }
            if (!activeClipboard) {
              await invokeKnowledgeNative({
                action: 'importClipboardFiles',
                target: { sourceKey: selection.sourceKey, directoryPath: selection.targetDirectoryPath ?? '' },
                conflictPolicy: 'keep-both',
              });
              return;
            }
            if (!knowledgeClipboardPasteAllowed(activeClipboard, selection.sourceKey)) {
              retainKnowledgeClipboardFailures(activeClipboard?.addresses ?? []);
              notifyResourceActionError(new Error(menuLabel(
                'knowledge.clipboard.crossSourceCut',
                '剪切只能在同一工作目录内粘贴',
              )));
              return;
            }
            const results = await treeClient.pasteResources({
              intent: activeClipboard!.intent,
              items: activeClipboard!.addresses,
              target: { sourceKey: selection.sourceKey, directoryPath: selection.targetDirectoryPath ?? '' },
            });
            if (activeClipboard!.intent === 'cut') {
              retainKnowledgeClipboardFailures(results
                .filter(result => result.ok === false)
                .map(result => result.sourceAddress)
                .filter((address): address is KnowledgeResourceAddress => Boolean(address)));
            }
          }}>{toolbarIcon(ICONS.paste)}</button>
          <button aria-label={tr('knowledge.action.delete')} title={tr('knowledge.action.delete')} disabled={selection.addresses.length === 0 || !selectedSourceCanTrash} type="button" onClick={async () => {
            if (!window.confirm(tr('knowledge.trash.deleteConfirm'))) return;
            if (!await editorGroupsRef.current?.prepareResourceRemoval(selection.addresses)) return;
            const result = await treeClient.trashResources(selection.addresses);
            markDocumentsUnavailable(result.items);
          }}>{toolbarIcon(ICONS.trash)}</button>
          <button aria-label={tr('knowledge.trash.title')} title={tr('knowledge.trash.title')} type="button" onClick={() => setTrashOpen(true)}>{toolbarIcon(ICONS.folder)}</button>
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
            onContextMenu={createContextMenu}
            onOpenResource={({ address, sourceName, mode, focusContent }) => {
              const opened = editorGroupsRef.current?.openResource({
                address,
                sourceName,
                kind: isMarkdownFileName(address.relativePath)
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
          // A successful create already has a canonical address. Refresh and
          // reveal that exact branch immediately instead of waiting for the
          // best-effort filesystem watcher, which can be delayed on NTFS.
          resourceTreeRef.current?.locateResource({
            kind: result.kind === 'folder' ? 'folder' : 'resource',
            sourceKey: result.address.sourceKey,
            relativePath: result.address.relativePath,
          });
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
      {contextMenu && (
        <ContextMenu
          items={contextMenu.items}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
        />
      )}
    </main>
  );
}
