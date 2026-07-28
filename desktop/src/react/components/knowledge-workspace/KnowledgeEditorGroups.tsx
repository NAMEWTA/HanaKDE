import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type {
  KnowledgeResourceAddress,
} from '../../../../../shared/knowledge-workspace-contract.ts';
import type {
  KnowledgeWorkspaceClient,
} from '../../services/knowledge-workspace-client';
import {
  knowledgeDocumentKey,
  type KnowledgeDocumentRegistry,
} from '../../stores/knowledge-document-registry';
import { KnowledgeAssetViewer } from './KnowledgeAssetViewer';
import {
  KnowledgeDocumentEditor,
  KnowledgeDocumentNotices,
} from './KnowledgeDocumentEditor';
import {
  KnowledgeTabBar,
  type KnowledgeBreadcrumbTarget,
  type KnowledgeEditorResourceKind,
  type KnowledgeEditorTab,
} from './KnowledgeTabBar';
import styles from './KnowledgeWorkspace.module.css';

export type KnowledgeEditorSplitDirection = 'horizontal' | 'vertical';

export interface KnowledgeOpenResource {
  address: KnowledgeResourceAddress;
  sourceName: string;
  kind?: KnowledgeEditorResourceKind;
}

export interface KnowledgeOpenResourceOptions {
  mode?: 'preview' | 'pinned';
  groupId?: string;
}

export interface KnowledgeOpenSideOptions {
  fromGroupId?: string;
  direction?: KnowledgeEditorSplitDirection;
}

export interface KnowledgeOpenResult {
  viewId: string;
  groupId: string;
  reused: boolean;
}

export interface KnowledgeEditorGroupsHandle {
  openResource(
    resource: KnowledgeOpenResource,
    options?: KnowledgeOpenResourceOptions,
  ): KnowledgeOpenResult;
  openInSide(
    resource: KnowledgeOpenResource,
    options?: KnowledgeOpenSideOptions,
  ): KnowledgeOpenResult;
  splitGroup(
    groupId: string,
    direction: KnowledgeEditorSplitDirection,
  ): string;
  activateView(viewId: string): boolean;
  pinView(viewId: string): boolean;
  closeView(viewId: string): boolean;
  moveView(viewId: string, targetGroupId: string): boolean;
}

export interface KnowledgeEditorGroupsProps {
  registry: KnowledgeDocumentRegistry;
  client?: KnowledgeWorkspaceClient;
  workspaceKey: string;
  onLocateResource?(target: KnowledgeBreadcrumbTarget): void;
}

interface KnowledgeEditorGroupNode {
  kind: 'group';
  id: string;
  tabs: KnowledgeEditorTab[];
  activeViewId: string | null;
}

interface KnowledgeEditorSplitNode {
  kind: 'split';
  id: string;
  direction: KnowledgeEditorSplitDirection;
  first: KnowledgeEditorLayoutNode;
  second: KnowledgeEditorLayoutNode;
}

type KnowledgeEditorLayoutNode =
  | KnowledgeEditorGroupNode
  | KnowledgeEditorSplitNode;

interface KnowledgeEditorLayout {
  root: KnowledgeEditorLayoutNode;
  activeGroupId: string;
}

function tr(key: string, vars?: Record<string, string | number>): string {
  return window.t?.(key, vars) ?? key;
}

function resourceKind(resource: KnowledgeOpenResource): KnowledgeEditorResourceKind {
  if (resource.kind) return resource.kind;
  return resource.address.relativePath.toLocaleLowerCase().endsWith('.md')
    ? 'markdown'
    : 'asset';
}

function sameAddress(
  left: KnowledgeResourceAddress,
  right: KnowledgeResourceAddress,
): boolean {
  return (
    left.sourceKey === right.sourceKey
    && left.relativePath === right.relativePath
  );
}

function firstGroup(node: KnowledgeEditorLayoutNode): KnowledgeEditorGroupNode {
  return node.kind === 'group' ? node : firstGroup(node.first);
}

function findGroup(
  node: KnowledgeEditorLayoutNode,
  groupId: string,
): KnowledgeEditorGroupNode | null {
  if (node.kind === 'group') return node.id === groupId ? node : null;
  return findGroup(node.first, groupId) ?? findGroup(node.second, groupId);
}

function findTab(
  node: KnowledgeEditorLayoutNode,
  predicate: (tab: KnowledgeEditorTab) => boolean,
): { group: KnowledgeEditorGroupNode; tab: KnowledgeEditorTab } | null {
  if (node.kind === 'group') {
    const tab = node.tabs.find(predicate);
    return tab ? { group: node, tab } : null;
  }
  return findTab(node.first, predicate) ?? findTab(node.second, predicate);
}

function mapGroup(
  node: KnowledgeEditorLayoutNode,
  groupId: string,
  update: (group: KnowledgeEditorGroupNode) => KnowledgeEditorGroupNode,
): KnowledgeEditorLayoutNode {
  if (node.kind === 'group') return node.id === groupId ? update(node) : node;
  const first = mapGroup(node.first, groupId, update);
  const second = mapGroup(node.second, groupId, update);
  return first === node.first && second === node.second
    ? node
    : { ...node, first, second };
}

function mapTabs(
  node: KnowledgeEditorLayoutNode,
  update: (tab: KnowledgeEditorTab) => KnowledgeEditorTab,
): KnowledgeEditorLayoutNode {
  if (node.kind === 'group') {
    const tabs = node.tabs.map(update);
    return tabs.every((tab, index) => tab === node.tabs[index])
      ? node
      : { ...node, tabs };
  }
  const first = mapTabs(node.first, update);
  const second = mapTabs(node.second, update);
  return first === node.first && second === node.second
    ? node
    : { ...node, first, second };
}

function replaceGroup(
  node: KnowledgeEditorLayoutNode,
  groupId: string,
  replacement: KnowledgeEditorLayoutNode,
): KnowledgeEditorLayoutNode {
  if (node.kind === 'group') return node.id === groupId ? replacement : node;
  const first = replaceGroup(node.first, groupId, replacement);
  const second = replaceGroup(node.second, groupId, replacement);
  return first === node.first && second === node.second
    ? node
    : { ...node, first, second };
}

function withoutView(
  node: KnowledgeEditorLayoutNode,
  viewId: string,
): KnowledgeEditorLayoutNode {
  if (node.kind === 'group') {
    const index = node.tabs.findIndex(tab => tab.viewId === viewId);
    if (index < 0) return node;
    const tabs = node.tabs.filter(tab => tab.viewId !== viewId);
    let activeViewId = node.activeViewId;
    if (activeViewId === viewId) {
      activeViewId = tabs[Math.min(index, tabs.length - 1)]?.viewId ?? null;
    }
    return { ...node, tabs, activeViewId };
  }
  const first = withoutView(node.first, viewId);
  const second = withoutView(node.second, viewId);
  return first === node.first && second === node.second
    ? node
    : { ...node, first, second };
}

function collapseEmptyGroups(
  node: KnowledgeEditorLayoutNode,
): KnowledgeEditorLayoutNode | null {
  if (node.kind === 'group') return node.tabs.length === 0 ? null : node;
  const first = collapseEmptyGroups(node.first);
  const second = collapseEmptyGroups(node.second);
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

function allTabs(node: KnowledgeEditorLayoutNode): KnowledgeEditorTab[] {
  return node.kind === 'group'
    ? node.tabs
    : [...allTabs(node.first), ...allTabs(node.second)];
}

function createInitialLayout(groupId: string): KnowledgeEditorLayout {
  return {
    root: {
      kind: 'group',
      id: groupId,
      tabs: [],
      activeViewId: null,
    },
    activeGroupId: groupId,
  };
}

function releaseTabView(
  registry: KnowledgeDocumentRegistry,
  tab: KnowledgeEditorTab,
): void {
  if (tab.kind !== 'markdown') return;
  const session = registry.getState().sessions[knowledgeDocumentKey(tab.address)];
  registry.getState().closeDocumentView(tab.viewId);
  if (!session?.dirty) {
    registry.getState().disposeDocumentSession(tab.address);
  }
}

export const KnowledgeEditorGroups = forwardRef<
  KnowledgeEditorGroupsHandle,
  KnowledgeEditorGroupsProps
>(function KnowledgeEditorGroups({
  registry,
  client,
  workspaceKey,
  onLocateResource,
}, ref) {
  const nextGroupId = useRef(1);
  const nextSplitId = useRef(1);
  const nextViewId = useRef(1);
  const initialGroupId = 'knowledge-group-1';
  const [layout, setLayout] = useState<KnowledgeEditorLayout>(() =>
    createInitialLayout(initialGroupId));
  const layoutRef = useRef(layout);
  const workspaceKeyRef = useRef(workspaceKey);

  const commitLayout = (next: KnowledgeEditorLayout) => {
    layoutRef.current = next;
    setLayout(next);
  };

  const createGroupId = () => {
    nextGroupId.current += 1;
    return `knowledge-group-${nextGroupId.current}`;
  };
  const createSplitId = () => `knowledge-split-${nextSplitId.current++}`;
  const createViewId = () => `knowledge-view-${nextViewId.current++}`;

  const activateView = (viewId: string): boolean => {
    const found = findTab(layoutRef.current.root, tab => tab.viewId === viewId);
    if (!found) return false;
    commitLayout({
      root: mapGroup(layoutRef.current.root, found.group.id, group => ({
        ...group,
        activeViewId: viewId,
      })),
      activeGroupId: found.group.id,
    });
    return true;
  };

  const pinView = (viewId: string): boolean => {
    const found = findTab(layoutRef.current.root, tab => tab.viewId === viewId);
    if (!found) return false;
    if (!found.tab.preview) return true;
    commitLayout({
      ...layoutRef.current,
      root: mapTabs(layoutRef.current.root, tab => (
        tab.viewId === viewId ? { ...tab, preview: false } : tab
      )),
    });
    return true;
  };

  const closeView = (viewId: string): boolean => {
    const current = layoutRef.current;
    const found = findTab(current.root, tab => tab.viewId === viewId);
    if (!found) return false;
    releaseTabView(registry, found.tab);
    const removed = withoutView(current.root, viewId);
    const collapsed = collapseEmptyGroups(removed)
      ?? createInitialLayout(initialGroupId).root;
    const activeGroup = findGroup(collapsed, current.activeGroupId)
      ?? firstGroup(collapsed);
    commitLayout({
      root: collapsed,
      activeGroupId: activeGroup.id,
    });
    return true;
  };

  const splitGroup = (
    groupId: string,
    direction: KnowledgeEditorSplitDirection,
  ): string => {
    const current = layoutRef.current;
    const target = findGroup(current.root, groupId)
      ?? findGroup(current.root, current.activeGroupId)
      ?? firstGroup(current.root);
    const newGroupId = createGroupId();
    const newGroup: KnowledgeEditorGroupNode = {
      kind: 'group',
      id: newGroupId,
      tabs: [],
      activeViewId: null,
    };
    const split: KnowledgeEditorSplitNode = {
      kind: 'split',
      id: createSplitId(),
      direction,
      first: target,
      second: newGroup,
    };
    commitLayout({
      root: replaceGroup(current.root, target.id, split),
      activeGroupId: newGroupId,
    });
    return newGroupId;
  };

  const openResource = (
    resource: KnowledgeOpenResource,
    options: KnowledgeOpenResourceOptions = {},
  ): KnowledgeOpenResult => {
    const current = layoutRef.current;
    const existing = findTab(
      current.root,
      tab => sameAddress(tab.address, resource.address),
    );
    if (existing) {
      const shouldPin = options.mode === 'pinned' && existing.tab.preview;
      const root = shouldPin
        ? mapTabs(current.root, tab => (
            tab.viewId === existing.tab.viewId
              ? { ...tab, preview: false }
              : tab
          ))
        : current.root;
      commitLayout({
        root: mapGroup(root, existing.group.id, group => ({
          ...group,
          activeViewId: existing.tab.viewId,
        })),
        activeGroupId: existing.group.id,
      });
      return {
        viewId: existing.tab.viewId,
        groupId: existing.group.id,
        reused: true,
      };
    }

    const target = (
      (options.groupId ? findGroup(current.root, options.groupId) : null)
      ?? findGroup(current.root, current.activeGroupId)
      ?? firstGroup(current.root)
    );
    const viewId = createViewId();
    const preview = (options.mode ?? 'preview') === 'preview';
    const tab: KnowledgeEditorTab = {
      viewId,
      address: { ...resource.address },
      sourceName: resource.sourceName,
      kind: resourceKind(resource),
      preview,
    };
    let replacedPreviewId: string | null = null;
    const root = mapGroup(current.root, target.id, group => {
      const previousPreview = preview
        ? group.tabs.find(candidate => candidate.preview)
        : undefined;
      replacedPreviewId = previousPreview?.viewId ?? null;
      const tabs = previousPreview
        ? group.tabs.filter(candidate => candidate.viewId !== previousPreview.viewId)
        : group.tabs;
      return {
        ...group,
        tabs: [...tabs, tab],
        activeViewId: viewId,
      };
    });
    if (replacedPreviewId) {
      const replaced = findTab(
        current.root,
        candidate => candidate.viewId === replacedPreviewId,
      );
      if (replaced) releaseTabView(registry, replaced.tab);
    }
    commitLayout({ root, activeGroupId: target.id });
    return { viewId, groupId: target.id, reused: false };
  };

  const openInSide = (
    resource: KnowledgeOpenResource,
    options: KnowledgeOpenSideOptions = {},
  ): KnowledgeOpenResult => {
    const current = layoutRef.current;
    const fromGroup = (
      (options.fromGroupId
        ? findGroup(current.root, options.fromGroupId)
        : null)
      ?? findGroup(current.root, current.activeGroupId)
      ?? firstGroup(current.root)
    );
    const groupId = createGroupId();
    const viewId = createViewId();
    const tab: KnowledgeEditorTab = {
      viewId,
      address: { ...resource.address },
      sourceName: resource.sourceName,
      kind: resourceKind(resource),
      preview: false,
    };
    const newGroup: KnowledgeEditorGroupNode = {
      kind: 'group',
      id: groupId,
      tabs: [tab],
      activeViewId: viewId,
    };
    const split: KnowledgeEditorSplitNode = {
      kind: 'split',
      id: createSplitId(),
      direction: options.direction ?? 'horizontal',
      first: fromGroup,
      second: newGroup,
    };
    commitLayout({
      root: replaceGroup(current.root, fromGroup.id, split),
      activeGroupId: groupId,
    });
    return { viewId, groupId, reused: false };
  };

  const moveView = (viewId: string, targetGroupId: string): boolean => {
    const current = layoutRef.current;
    const found = findTab(current.root, tab => tab.viewId === viewId);
    const target = findGroup(current.root, targetGroupId);
    if (!found || !target) return false;
    if (found.group.id === target.id) {
      pinView(viewId);
      return true;
    }
    const movedTab = { ...found.tab, preview: false };
    let root = withoutView(current.root, viewId);
    root = mapGroup(root, target.id, group => ({
      ...group,
      tabs: [...group.tabs, movedTab],
      activeViewId: viewId,
    }));
    root = collapseEmptyGroups(root) ?? createInitialLayout(initialGroupId).root;
    commitLayout({ root, activeGroupId: target.id });
    const registryView = registry.getState().views[viewId];
    if (registryView) {
      registry.getState().updateDocumentView(viewId, { groupId: target.id });
    }
    return true;
  };

  useImperativeHandle(ref, () => ({
    openResource,
    openInSide,
    splitGroup,
    activateView,
    pinView,
    closeView,
    moveView,
  }));

  useEffect(() => registry.subscribe((state) => {
    const current = layoutRef.current;
    let changed = false;
    const root = mapTabs(current.root, (tab) => {
      if (!tab.preview || tab.kind !== 'markdown') return tab;
      const session = state.sessions[knowledgeDocumentKey(tab.address)];
      if (!session?.dirty) return tab;
      changed = true;
      return { ...tab, preview: false };
    });
    if (changed) commitLayout({ ...current, root });
  }), [registry]);

  useEffect(() => {
    if (workspaceKeyRef.current === workspaceKey) return;
    for (const tab of allTabs(layoutRef.current.root)) {
      if (tab.kind === 'markdown') registry.getState().closeDocumentView(tab.viewId);
    }
    workspaceKeyRef.current = workspaceKey;
    nextGroupId.current = 1;
    nextSplitId.current = 1;
    nextViewId.current = 1;
    commitLayout(createInitialLayout(initialGroupId));
  }, [registry, workspaceKey]);

  const renderNode = (node: KnowledgeEditorLayoutNode): React.ReactNode => {
    if (node.kind === 'split') {
      return (
        <div
          className={styles.knowledgeEditorSplit}
          data-split-direction={node.direction}
          key={node.id}
        >
          {renderNode(node.first)}
          <div className={styles.knowledgeEditorDivider} aria-hidden="true" />
          {renderNode(node.second)}
        </div>
      );
    }

    return (
      <section
        className={styles.knowledgeEditorGroup}
        data-active={layout.activeGroupId === node.id ? 'true' : 'false'}
        data-editor-group-id={node.id}
        key={node.id}
        role="group"
        aria-label={tr('knowledge.editor.groupLabel', {
          number: node.id.replace('knowledge-group-', ''),
        })}
        tabIndex={0}
        onFocus={() => {
          if (layoutRef.current.activeGroupId !== node.id) {
            commitLayout({ ...layoutRef.current, activeGroupId: node.id });
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(event) => {
          const viewId = event.dataTransfer.getData(
            'application/x-openhanako-knowledge-view',
          );
          if (!viewId) return;
          event.preventDefault();
          moveView(viewId, node.id);
        }}
      >
        <div className={styles.knowledgeGroupToolbar}>
          <button
            type="button"
            aria-label={tr('knowledge.editor.splitHorizontal')}
            onClick={() => splitGroup(node.id, 'horizontal')}
          >
            ⇥
          </button>
          <button
            type="button"
            aria-label={tr('knowledge.editor.splitVertical')}
            onClick={() => splitGroup(node.id, 'vertical')}
          >
            ⇩
          </button>
        </div>
        {node.tabs.length > 0 ? (
          <KnowledgeTabBar
            tabs={node.tabs}
            activeViewId={node.activeViewId}
            onActivate={activateView}
            onClose={closeView}
            onOpenSide={(viewId) => {
              const found = findTab(
                layoutRef.current.root,
                tab => tab.viewId === viewId,
              );
              if (found) {
                openInSide(found.tab, {
                  fromGroupId: found.group.id,
                  direction: 'horizontal',
                });
              }
            }}
            onPin={pinView}
            onLocateResource={onLocateResource}
          />
        ) : null}
        <div className={styles.knowledgeGroupContent}>
          {node.tabs.length === 0 ? (
            <div className={styles.emptyEditor}>
              <h1 className={styles.emptyTitle}>
                {tr('knowledge.editor.emptyTitle')}
              </h1>
              <p className={styles.emptyDescription}>
                {tr('knowledge.editor.emptyDescription')}
              </p>
            </div>
          ) : node.tabs.map(tab => (
            <div
              id={`knowledge-panel-${tab.viewId}`}
              className={styles.knowledgeTabPanel}
              role="tabpanel"
              aria-hidden={node.activeViewId === tab.viewId ? undefined : 'true'}
              hidden={node.activeViewId !== tab.viewId}
              key={tab.viewId}
            >
              {tab.kind === 'markdown' ? (
                <KnowledgeDocumentEditor
                  address={tab.address}
                  viewId={tab.viewId}
                  groupId={node.id}
                  registry={registry}
                  client={client}
                />
              ) : (
                <KnowledgeAssetViewer
                  address={tab.address}
                  sourceName={tab.sourceName}
                  client={client}
                />
              )}
            </div>
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className={styles.knowledgeEditorGroups}>
      {renderNode(layout.root)}
      <KnowledgeDocumentNotices registry={registry} />
    </div>
  );
});
