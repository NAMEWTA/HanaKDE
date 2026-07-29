import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { EditorView } from '@codemirror/view';
import {
  knowledgeWritableSources,
  orderKnowledgeUnsavedDocuments,
  shouldConfirmKnowledgeViewClose,
  type KnowledgeLifecycleDocument,
} from '../../../../../core/knowledge-workspace/knowledge-workspace-lifecycle.ts';
import type {
  KnowledgeResourceAddress,
  KnowledgeSourceDto,
} from '../../../../../shared/knowledge-workspace-contract.ts';
import {
  knowledgeWorkspaceClient,
  type KnowledgeWorkspaceClient,
} from '../../services/knowledge-workspace-client';
import {
  registerKnowledgeWorkspaceCloseGuard,
} from '../../services/knowledge-workspace-lifecycle';
import {
  knowledgeDocumentKey,
  type KnowledgeDocumentRegistry,
} from '../../stores/knowledge-document-registry';
import {
  createKnowledgeOrphanDocument,
  saveKnowledgeDocument,
  type CreateKnowledgeOrphanDocumentInput,
  type CreateKnowledgeOrphanDocumentResult,
  type SaveKnowledgeDocumentInput,
  type SaveKnowledgeDocumentResult,
} from '../../utils/knowledge-document-operations';
import { KnowledgeAssetViewer } from './KnowledgeAssetViewer';
import {
  KnowledgeConflictResolver,
  type KnowledgeConflictResolverProps,
} from './KnowledgeConflictResolver';
import {
  KnowledgeDocumentEditor,
  KnowledgeDocumentNotices,
} from './KnowledgeDocumentEditor';
import {
  KnowledgeFindBar,
  type KnowledgeFindCommand,
} from './KnowledgeFindBar';
import {
  initialKnowledgeFindQuery,
} from '../../editor/knowledge-find-state';
import {
  KnowledgeTabBar,
  type KnowledgeBreadcrumbTarget,
  type KnowledgeEditorResourceKind,
  type KnowledgeEditorTab,
} from './KnowledgeTabBar';
import { UnsavedDocumentsDialog } from './UnsavedDocumentsDialog';
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
  prepareToClose(): Promise<boolean>;
  moveView(viewId: string, targetGroupId: string): boolean;
}

export interface KnowledgeEditorGroupsProps {
  registry: KnowledgeDocumentRegistry;
  client?: KnowledgeWorkspaceClient;
  workspaceKey: string;
  sources?: readonly KnowledgeSourceDto[];
  sourcesReady?: boolean;
  onLocateResource?(target: KnowledgeBreadcrumbTarget): void;
  conflictServices?: Pick<
    KnowledgeConflictResolverProps,
    'watchSource' | 'subscribeToChanges' | 'refreshDelayMs'
  >;
  lifecycleServices?: {
    saveDocument?(
      input: SaveKnowledgeDocumentInput,
    ): Promise<SaveKnowledgeDocumentResult>;
    createOrphanDocument?(
      input: CreateKnowledgeOrphanDocumentInput,
    ): Promise<CreateKnowledgeOrphanDocumentResult>;
  };
  onActiveTargetChange?(
    target: {
      viewId: string;
      kind: KnowledgeEditorResourceKind;
    } | null,
  ): void;
}

interface PendingUnsavedClose {
  tab: KnowledgeEditorTab;
  busy: boolean;
  error: 'conflict' | 'unavailable' | null;
  mode: 'close-view' | 'lifecycle';
  resolve?: (proceed: boolean) => void;
}

interface KnowledgeFindSession {
  groupId: string;
  viewId: string;
  command: KnowledgeFindCommand;
  commandRevision: number;
  documentRevision: number;
  initialQuery: string;
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
  registry.getState().closeDocumentView(tab.viewId);
  registry.getState().disposeDocumentSession(tab.address);
}

export const KnowledgeEditorGroups = forwardRef<
  KnowledgeEditorGroupsHandle,
  KnowledgeEditorGroupsProps
>(function KnowledgeEditorGroups({
  registry,
  client,
  workspaceKey,
  sources = [],
  sourcesReady = true,
  onLocateResource,
  conflictServices,
  lifecycleServices,
  onActiveTargetChange,
}, ref) {
  const nextGroupId = useRef(1);
  const nextSplitId = useRef(1);
  const nextViewId = useRef(1);
  const initialGroupId = 'knowledge-group-1';
  const [layout, setLayout] = useState<KnowledgeEditorLayout>(() =>
    createInitialLayout(initialGroupId));
  const layoutRef = useRef(layout);
  const workspaceKeyRef = useRef(workspaceKey);
  const prepareToCloseRef = useRef<() => Promise<boolean>>(
    async () => true,
  );
  const [pendingUnsavedClose, setPendingUnsavedClose] =
    useState<PendingUnsavedClose | null>(null);
  const pendingUnsavedCloseRef = useRef<PendingUnsavedClose | null>(null);
  const editorViewsRef = useRef(new Map<string, EditorView>());
  const [, setEditorViewRevision] = useState(0);
  const [findSession, setFindSession] =
    useState<KnowledgeFindSession | null>(null);

  const commitPendingUnsavedClose = (
    next: PendingUnsavedClose | null,
  ): void => {
    pendingUnsavedCloseRef.current = next;
    setPendingUnsavedClose(next);
  };

  const commitLayout = (next: KnowledgeEditorLayout) => {
    layoutRef.current = next;
    setLayout(next);
  };

  const openFind = (request: {
    command: KnowledgeFindCommand;
    groupId: string;
    viewId: string;
  }) => {
    const currentLayout = layoutRef.current;
    const group = findGroup(currentLayout.root, request.groupId);
    const activeTab = group?.tabs.find(
      tab => tab.viewId === group.activeViewId,
    );
    if (
      currentLayout.activeGroupId !== request.groupId
      || activeTab?.kind !== 'markdown'
      || activeTab.viewId !== request.viewId
    ) {
      return;
    }
    setFindSession(current => {
      if (current?.groupId === request.groupId) {
        return {
          ...current,
          viewId: request.viewId,
          command: request.command,
          commandRevision: current.commandRevision + 1,
          documentRevision: current.documentRevision + 1,
        };
      }
      return {
        ...request,
        commandRevision: 1,
        documentRevision: 0,
        initialQuery: initialKnowledgeFindQuery(
          editorViewsRef.current.get(request.viewId) ?? null,
        ),
      };
    });
  };

  const registerEditorView = (
    viewId: string,
    editorView: EditorView | null,
  ) => {
    if (editorView) editorViewsRef.current.set(viewId, editorView);
    else editorViewsRef.current.delete(viewId);
    setEditorViewRevision(revision => revision + 1);
    setFindSession(current => {
      if (current?.viewId !== viewId) return current;
      if (!editorView) return null;
      return {
        ...current,
        documentRevision: current.documentRevision + 1,
      };
    });
  };

  const notifyEditorViewUpdate = (viewId: string) => {
    setFindSession(current => (
      current?.viewId === viewId
        ? { ...current, documentRevision: current.documentRevision + 1 }
        : current
    ));
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

  const closeViewImmediately = (viewId: string): boolean => {
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

  const closeView = (viewId: string): boolean => {
    const current = layoutRef.current;
    const found = findTab(current.root, tab => tab.viewId === viewId);
    if (!found || pendingUnsavedCloseRef.current) return false;
    if (found.tab.kind !== 'markdown') {
      return closeViewImmediately(viewId);
    }
    const state = registry.getState();
    const session = state.sessions[knowledgeDocumentKey(found.tab.address)];
    const viewIds = session
      ? Object.values(state.views)
          .filter(view => view.sessionKey === session.key)
          .map(view => view.id)
      : [];
    if (
      !session
      || !shouldConfirmKnowledgeViewClose({
        sessionKey: session.key,
        address: session.address,
        sourceName: found.tab.sourceName,
        buffer: session.buffer,
        dirty: session.dirty,
        orphan: session.orphan,
        resourceState: session.resourceState,
        viewIds,
        displayOrder: 0,
        active: true,
      }, viewId)
    ) {
      return closeViewImmediately(viewId);
    }
    commitPendingUnsavedClose({
      tab: found.tab,
      busy: false,
      error: null,
      mode: 'close-view',
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
    if (!sourcesReady) return;
    const sourceByKey = new Map(sources.map(source => [
      source.sourceKey,
      source,
    ]));
    const reconcileSourceAvailability = (
      state: ReturnType<KnowledgeDocumentRegistry['getState']>,
    ) => {
      for (const session of Object.values(state.sessions)) {
        const source = sourceByKey.get(session.address.sourceKey);
        const unavailable = (
          !source
          || source.availability !== 'available'
        );
        const dirtyAndReadOnly = (
          session.dirty
          && source?.availability === 'available'
          && !source.capabilities.includes('write')
        );
        if (unavailable || dirtyAndReadOnly) {
          registry.getState().markDocumentResourceUnavailable(
            session.address,
            'source-unavailable',
          );
        }
      }
    };
    reconcileSourceAvailability(registry.getState());
    return registry.subscribe(reconcileSourceAvailability);
  }, [registry, sources, sourcesReady]);

  useEffect(() => {
    if (workspaceKeyRef.current === workspaceKey) return;
    for (const tab of allTabs(layoutRef.current.root)) {
      if (tab.kind === 'markdown') registry.getState().closeDocumentView(tab.viewId);
    }
    workspaceKeyRef.current = workspaceKey;
    nextGroupId.current = 1;
    nextSplitId.current = 1;
    nextViewId.current = 1;
    editorViewsRef.current.clear();
    setFindSession(null);
    commitLayout(createInitialLayout(initialGroupId));
  }, [registry, workspaceKey]);

  useEffect(() => {
    setFindSession(current => {
      if (!current) return current;
      if (layout.activeGroupId !== current.groupId) return null;
      const group = findGroup(layout.root, current.groupId);
      const tab = group?.tabs.find(
        candidate => candidate.viewId === group.activeViewId,
      );
      if (!tab || tab.kind !== 'markdown') return null;
      if (tab.viewId === current.viewId) return current;
      return {
        ...current,
        viewId: tab.viewId,
        documentRevision: current.documentRevision + 1,
      };
    });
  }, [layout]);

  const resolvePendingSave = async (target?: {
    address: KnowledgeResourceAddress;
    sourceName: string;
  }) => {
    const pending = pendingUnsavedCloseRef.current;
    if (!pending || pending.busy) return;
    const activeClient = client ?? knowledgeWorkspaceClient;
    commitPendingUnsavedClose({ ...pending, busy: true, error: null });
    const session = registry.getState().sessions[
      knowledgeDocumentKey(pending.tab.address)
    ];
    if (!session) {
      commitPendingUnsavedClose(null);
      if (pending.mode === 'lifecycle') {
        pending.resolve?.(true);
      } else {
        closeViewImmediately(pending.tab.viewId);
      }
      return;
    }
    if (session.orphan) {
      if (!target) {
        commitPendingUnsavedClose({
          ...pending,
          busy: false,
          error: 'unavailable',
        });
        return;
      }
      const create = lifecycleServices?.createOrphanDocument
        ?? createKnowledgeOrphanDocument;
      const result = await create({
        registry,
        from: pending.tab.address,
        to: target.address,
        client: activeClient,
      });
      if (!result.ok) {
        if (pending.mode === 'close-view') {
          commitPendingUnsavedClose({
            ...pending,
            busy: false,
            error: result.reason,
          });
          return;
        }
        registry.getState().reportDocumentSaveError(
          pending.tab.address,
          {
            code: result.reason === 'conflict'
              ? 'conflict'
              : 'unavailable',
            fileName: pending.tab.address.relativePath.split('/').at(-1)
              ?? pending.tab.address.relativePath,
            reason: result.reason === 'conflict'
              ? 'knowledge.document.saveConflict'
              : 'knowledge.document.saveUnavailable',
          },
        );
        commitPendingUnsavedClose(null);
        pending.resolve?.(false);
        return;
      }
      commitLayout({
        ...layoutRef.current,
        root: mapTabs(layoutRef.current.root, tab => (
          tab.kind === 'markdown'
          && sameAddress(tab.address, pending.tab.address)
            ? {
                ...tab,
                address: { ...target.address },
                sourceName: target.sourceName,
              }
            : tab
        )),
      });
    } else {
      const save = lifecycleServices?.saveDocument ?? saveKnowledgeDocument;
      const result = await save({
        registry,
        address: pending.tab.address,
        client: activeClient,
      });
      if (!result.ok) {
        commitPendingUnsavedClose(null);
        pending.resolve?.(false);
        return;
      }
    }
    commitPendingUnsavedClose(null);
    if (pending.mode === 'lifecycle') {
      pending.resolve?.(true);
    } else {
      closeViewImmediately(pending.tab.viewId);
    }
  };

  const discardPending = () => {
    const pending = pendingUnsavedCloseRef.current;
    if (!pending || pending.busy) return;
    registry.getState().discardDocumentChanges(pending.tab.address);
    commitPendingUnsavedClose(null);
    if (pending.mode === 'lifecycle') {
      pending.resolve?.(true);
    } else {
      closeViewImmediately(pending.tab.viewId);
    }
  };

  const cancelPending = () => {
    const pending = pendingUnsavedCloseRef.current;
    if (!pending || pending.busy) return;
    commitPendingUnsavedClose(null);
    pending.resolve?.(false);
  };

  const requestLifecycleDecision = (
    tab: KnowledgeEditorTab,
  ): Promise<boolean> => new Promise((resolve) => {
    commitPendingUnsavedClose({
      tab,
      busy: false,
      error: null,
      mode: 'lifecycle',
      resolve,
    });
  });

  const prepareToClose = async (): Promise<boolean> => {
    if (pendingUnsavedCloseRef.current) return false;
    const current = layoutRef.current;
    const tabs = allTabs(current.root);
    const activeGroup = findGroup(current.root, current.activeGroupId);
    const activeViewId = activeGroup?.activeViewId ?? null;
    const documents = new Map<string, KnowledgeLifecycleDocument>();
    for (const [displayOrder, tab] of tabs.entries()) {
      if (tab.kind !== 'markdown') continue;
      const session = registry.getState().sessions[
        knowledgeDocumentKey(tab.address)
      ];
      if (!session) continue;
      const existing = documents.get(session.key);
      if (existing) {
        existing.viewIds.push(tab.viewId);
        existing.active ||= tab.viewId === activeViewId;
        continue;
      }
      documents.set(session.key, {
        sessionKey: session.key,
        address: { ...session.address },
        sourceName: tab.sourceName,
        buffer: session.buffer,
        dirty: session.dirty,
        orphan: session.orphan,
        resourceState: session.resourceState,
        viewIds: [tab.viewId],
        displayOrder,
        active: tab.viewId === activeViewId,
      });
    }
    for (const document of orderKnowledgeUnsavedDocuments(
      [...documents.values()],
    )) {
      const tab = tabs.find(candidate => (
        candidate.kind === 'markdown'
        && knowledgeDocumentKey(candidate.address) === document.sessionKey
      ));
      if (!tab) continue;
      if (!await requestLifecycleDecision(tab)) return false;
    }
    return true;
  };
  prepareToCloseRef.current = prepareToClose;

  useImperativeHandle(ref, () => ({
    openResource,
    openInSide,
    splitGroup,
    activateView,
    pinView,
    closeView,
    prepareToClose,
    moveView,
  }));

  useEffect(() => {
    const unregister = registerKnowledgeWorkspaceCloseGuard(
      () => prepareToCloseRef.current(),
    );
    return () => {
      unregister();
      const pending = pendingUnsavedCloseRef.current;
      pendingUnsavedCloseRef.current = null;
      pending?.resolve?.(false);
    };
  }, []);

  const activeGroup = findGroup(layout.root, layout.activeGroupId);
  const activeTab = activeGroup?.tabs.find(
    tab => tab.viewId === activeGroup.activeViewId,
  ) ?? null;
  const activeTargetViewId = activeTab?.viewId ?? null;
  const activeTargetKind = activeTab?.kind ?? null;
  useEffect(() => {
    onActiveTargetChange?.(activeTargetViewId && activeTargetKind
      ? { viewId: activeTargetViewId, kind: activeTargetKind }
      : null);
  }, [
    activeTargetKind,
    activeTargetViewId,
    onActiveTargetChange,
  ]);

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
        onKeyDown={(event) => {
          if (
            event.defaultPrevented
            || !(event.metaKey || event.ctrlKey)
          ) {
            return;
          }
          const key = event.key.toLocaleLowerCase();
          if (key !== 'f' && key !== 'h') return;
          const tab = node.tabs.find(
            candidate => candidate.viewId === node.activeViewId,
          );
          if (!tab || tab.kind !== 'markdown') return;
          event.preventDefault();
          event.stopPropagation();
          openFind({
            command: key === 'h' ? 'replace' : 'find',
            groupId: node.id,
            viewId: tab.viewId,
          });
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
                  onRequestOrphanSave={() => {
                    if (!pendingUnsavedCloseRef.current) {
                      commitPendingUnsavedClose({
                        tab,
                        busy: false,
                        error: null,
                        mode: 'close-view',
                      });
                    }
                  }}
                  onFindRequest={openFind}
                  onEditorViewChange={registerEditorView}
                  onEditorViewUpdate={notifyEditorViewUpdate}
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
          {findSession?.groupId === node.id ? (
            <KnowledgeFindBar
              editorView={
                editorViewsRef.current.get(findSession.viewId) ?? null
              }
              command={findSession.command}
              commandRevision={findSession.commandRevision}
              documentRevision={findSession.documentRevision}
              initialQuery={findSession.initialQuery}
              onClose={() => setFindSession(null)}
            />
          ) : null}
        </div>
      </section>
    );
  };

  return (
    <div className={styles.knowledgeEditorGroups}>
      {renderNode(layout.root)}
      <KnowledgeConflictResolver
        registry={registry}
        client={client}
        sources={sources}
        {...conflictServices}
      />
      <KnowledgeDocumentNotices registry={registry} />
      {pendingUnsavedClose ? (
        <UnsavedDocumentsDialog
          document={{
            address: pendingUnsavedClose.tab.address,
            sourceName: pendingUnsavedClose.tab.sourceName,
            orphan: registry.getState().sessions[
              knowledgeDocumentKey(pendingUnsavedClose.tab.address)
            ]?.orphan === true,
          }}
          writableSources={knowledgeWritableSources(sources)}
          busy={pendingUnsavedClose.busy}
          error={pendingUnsavedClose.error}
          onSave={target => void resolvePendingSave(target)}
          onDiscard={discardPending}
          onCancel={cancelPending}
        />
      ) : null}
    </div>
  );
});
