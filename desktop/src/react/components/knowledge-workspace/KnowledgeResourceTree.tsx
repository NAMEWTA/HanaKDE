import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, DragEvent, KeyboardEvent } from 'react';
import type {
  KnowledgeResourceAddress,
  KnowledgeSourceDto,
} from '../../../../../shared/knowledge-workspace-contract.ts';
import {
  type KnowledgeWorkspaceClient,
  type RendererResourceListItem,
} from '../../services/knowledge-workspace-client';
import {
  retainKnowledgeSourceWatch,
  subscribeKnowledgeResourceTreeChanges,
  type KnowledgeResourceTreeChangeSignal,
  type ResourceWatchRelease,
} from '../../services/resource-events';
import { useStore } from '../../stores';
import {
  KNOWLEDGE_DRAG_MIME,
  parseKnowledgeDragPayload,
} from '../../../../../shared/knowledge-drag-contract.ts';
import { KnowledgeDragController } from './knowledge-drag-controller';
import { invokeKnowledgeNative } from '../../services/knowledge-native-client';
import { KNOWLEDGE_ATTACHMENT_RESOURCE_MIME } from '../../editor/knowledge-attachment-policy';
import type { KnowledgeBreadcrumbTarget } from './KnowledgeTabBar';
import {
  createKnowledgeTreeSelectionState,
  knowledgeTreeNodeKey,
  knowledgeTreeSelectionReducer,
  moveKnowledgeTreeFocus,
  type KnowledgeTreeSelectionState,
  type KnowledgeTreeVisibleNode,
} from './resource-tree-selection';
import styles from './KnowledgeWorkspace.module.css';

export type { KnowledgeResourceTreeChangeSignal };

type DirectoryStatus = 'loading' | 'ready' | 'error';

type DirectoryState = {
  items: RendererResourceListItem[];
  status: DirectoryStatus;
};

type DirectoryStateMap = Record<string, DirectoryState>;

// A source can be mounted while its first files are still being materialized
// by an external writer. This is deliberately a single delayed snapshot, not
// a polling interval: it closes the initial watcher-registration window while
// leaving intentionally empty roots idle afterwards.
const INITIAL_ROOT_CATCH_UP_DELAY_MS = 500;

type WatchSource = (sourceKey: string) => ResourceWatchRelease;
type SubscribeToChanges = (
  listener: (signal: KnowledgeResourceTreeChangeSignal) => void,
) => () => void;

export interface KnowledgeResourceTreeProps {
  client: KnowledgeWorkspaceClient;
  sources: KnowledgeSourceDto[];
  workspaceKey: string;
  watchSource?: WatchSource;
  subscribeToChanges?: SubscribeToChanges;
  refreshDelayMs?: number;
  onOpenResource?(input: Readonly<{
    address: KnowledgeResourceAddress;
    sourceName: string;
    mode: 'preview' | 'pinned';
    focusContent: boolean;
  }>): void;
  onSelectionChange?(input: Readonly<{
    sourceKey: string | null;
    addresses: readonly KnowledgeResourceAddress[];
    contextTarget: KnowledgeResourceAddress | null;
  }>): void;
}

export interface KnowledgeResourceTreeHandle {
  locateResource(target: KnowledgeBreadcrumbTarget): void;
}

export type KnowledgeTreeSort = Readonly<{
  field: 'name' | 'modified' | 'extension';
  direction: 'ascending' | 'descending';
}>;

const naturalNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

function tr(
  key: string,
  vars?: Record<string, string | number>,
): string {
  return window.t?.(key, vars) ?? key;
}

function directoryKey(sourceKey: string, relativePath: string): string {
  return `${sourceKey}\u0000${relativePath}`;
}

function splitDirectoryKey(key: string): KnowledgeResourceAddress {
  const separatorIndex = key.indexOf('\u0000');
  return {
    sourceKey: key.slice(0, separatorIndex),
    relativePath: key.slice(separatorIndex + 1),
  };
}

function joinRelativePath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

function isPathOrDescendant(candidate: string, parent: string): boolean {
  return parent === ''
    || candidate === parent
    || candidate.startsWith(`${parent}/`);
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sortKnowledgeTreeItems(
  items: RendererResourceListItem[],
  sort: KnowledgeTreeSort = { field: 'name', direction: 'ascending' },
): RendererResourceListItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      if (left.item.isDirectory !== right.item.isDirectory) {
        return left.item.isDirectory ? -1 : 1;
      }
      let projected = sort.field === 'modified'
        ? left.item.mtimeMs - right.item.mtimeMs
        : sort.field === 'extension'
          ? naturalNameCollator.compare(
              fileExtension(left.item.name),
              fileExtension(right.item.name),
            )
          : naturalNameCollator.compare(left.item.name, right.item.name);
      if (sort.direction === 'descending') projected *= -1;
      if (projected !== 0) return projected;
      const natural = naturalNameCollator.compare(left.item.name, right.item.name);
      if (natural !== 0) return natural;
      const exact = compareCodePoints(left.item.name, right.item.name);
      return exact || left.index - right.index;
    })
    .map(({ item }) => item);
}

function isSourceListable(source: KnowledgeSourceDto): boolean {
  return source.availability === 'available'
    && source.capabilities.includes('list');
}

function DisclosureIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="14"
      viewBox="0 0 24 24"
      width="14"
    >
      {expanded
        ? <polyline points="6 9 12 15 18 9" />
        : <polyline points="9 6 15 12 9 18" />}
    </svg>
  );
}

function ResourceIcon({ directory }: { directory: boolean }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="15"
      viewBox="0 0 24 24"
      width="15"
    >
      {directory
        ? <path d="M3 6h7l2 2h9v10H3z" />
        : <path d="M6 3h8l4 4v14H6zM14 3v5h4" />}
    </svg>
  );
}

export const KnowledgeResourceTree = forwardRef<
  KnowledgeResourceTreeHandle,
  KnowledgeResourceTreeProps
>(function KnowledgeResourceTree({
  client,
  sources,
  workspaceKey,
  watchSource = retainKnowledgeSourceWatch,
  subscribeToChanges = subscribeKnowledgeResourceTreeChanges,
  refreshDelayMs = 120,
  onOpenResource,
  onSelectionChange,
}, ref) {
  const expandedPathsBySource = useStore(
    (state) => state.knowledgeExpandedPathsBySource,
  );
  const setExpandedPaths = useStore(
    (state) => state.setKnowledgeExpandedPaths,
  );
  const [directories, setDirectories] = useState<DirectoryStateMap>({});
  const [selection, dispatchSelection] = useReducer(
    knowledgeTreeSelectionReducer,
    undefined,
    createKnowledgeTreeSelectionState,
  );
  const [sortBySource, setSortBySource] = useState<Record<string, KnowledgeTreeSort>>({});
  const directoriesRef = useRef<DirectoryStateMap>({});
  const onSelectionChangeRef = useRef(onSelectionChange);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const controllersRef = useRef(new Map<string, AbortController>());
  const requestIdsRef = useRef(new Map<string, number>());
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRootCatchUpKeysRef = useRef(new Set<string>());
  const initialRootCatchUpTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const confirmedWatchRootKeysRef = useRef(new Set<string>());
  const watchReadyCatchUpKeysRef = useRef(new Set<string>());
  const loadDirectoryRef = useRef<((
    source: KnowledgeSourceDto,
    relativePath: string,
    force?: boolean,
  ) => Promise<void>) | null>(null);
  const pendingLocateKeyRef = useRef<string | null>(null);
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);
  const workspaceKeyRef = useRef(workspaceKey);
  const sourcesRef = useRef(sources);

  sourcesRef.current = sources;

  const updateDirectories = useCallback((
    updater: (current: DirectoryStateMap) => DirectoryStateMap,
  ) => {
    setDirectories((current) => {
      const next = updater(current);
      directoriesRef.current = next;
      return next;
    });
  }, []);

  const abortDirectoryBranch = useCallback((
    sourceKey: string,
    relativePath: string,
    clearCache: boolean,
  ) => {
    for (const [key, controller] of controllersRef.current) {
      const address = splitDirectoryKey(key);
      if (
        address.sourceKey === sourceKey
        && isPathOrDescendant(address.relativePath, relativePath)
      ) {
        requestIdsRef.current.set(
          key,
          (requestIdsRef.current.get(key) ?? 0) + 1,
        );
        controller.abort();
        controllersRef.current.delete(key);
      }
    }
    if (clearCache) {
      updateDirectories((current) => Object.fromEntries(
        Object.entries(current).filter(([key]) => {
          const address = splitDirectoryKey(key);
          return address.sourceKey !== sourceKey
            || !isPathOrDescendant(address.relativePath, relativePath);
        }),
      ));
    }
  }, [updateDirectories]);

  const loadDirectory = useCallback(async (
    source: KnowledgeSourceDto,
    relativePath: string,
    force = false,
  ) => {
    if (!isSourceListable(source)) return;
    const key = directoryKey(source.sourceKey, relativePath);
    const current = directoriesRef.current[key];
    if (!force && current) return;

    controllersRef.current.get(key)?.abort();
    const controller = new AbortController();
    controllersRef.current.set(key, controller);
    const requestId = (requestIdsRef.current.get(key) ?? 0) + 1;
    requestIdsRef.current.set(key, requestId);
    const requestWorkspaceKey = workspaceKey;

    updateDirectories((state) => ({
      ...state,
      [key]: {
        items: state[key]?.items ?? [],
        status: 'loading',
      },
    }));

    try {
      const result = await client.resources.list(
        { sourceKey: source.sourceKey, relativePath },
        { signal: controller.signal },
      );
      if (
        controller.signal.aborted
        || requestIdsRef.current.get(key) !== requestId
        || workspaceKeyRef.current !== requestWorkspaceKey
      ) {
        return;
      }
      const visibleItems = result.items.filter(
        (item) => !(relativePath === '' && item.name === '.trash'),
      );
      updateDirectories((state) => ({
        ...state,
        [key]: {
          items: sortKnowledgeTreeItems(
            visibleItems,
            sortBySource[source.sourceKey],
          ),
          status: 'ready',
        },
      }));
      if (
        relativePath === ''
        && confirmedWatchRootKeysRef.current.has(key)
        && !watchReadyCatchUpKeysRef.current.has(key)
      ) {
        watchReadyCatchUpKeysRef.current.add(key);
        void loadDirectoryRef.current?.(source, '', true);
      }
      // A source root can be created or externally populated immediately
      // before this tree establishes its watch. One empty initial snapshot
      // would otherwise remain visible until a later filesystem event. Take
      // one delayed snapshot to close that blind window, without polling an
      // intentionally empty workspace or changing explicit retry behavior.
      if (
        relativePath === ''
        && visibleItems.length === 0
        && !initialRootCatchUpKeysRef.current.has(key)
      ) {
        initialRootCatchUpKeysRef.current.add(key);
        const timer = setTimeout(() => {
          initialRootCatchUpTimersRef.current.delete(key);
          if (workspaceKeyRef.current !== requestWorkspaceKey) return;
          const currentSource = sourcesRef.current.find(
            (candidate) => candidate.sourceKey === source.sourceKey,
          );
          if (currentSource) {
            void loadDirectoryRef.current?.(currentSource, '', true);
          }
        }, Math.max(INITIAL_ROOT_CATCH_UP_DELAY_MS, refreshDelayMs));
        initialRootCatchUpTimersRef.current.set(key, timer);
      }
    } catch {
      if (
        controller.signal.aborted
        || requestIdsRef.current.get(key) !== requestId
        || workspaceKeyRef.current !== requestWorkspaceKey
      ) {
        return;
      }
      updateDirectories((state) => ({
        ...state,
        [key]: {
          items: state[key]?.items ?? [],
          status: 'error',
        },
      }));
    } finally {
      if (controllersRef.current.get(key) === controller) {
        controllersRef.current.delete(key);
      }
    }
  }, [client, refreshDelayMs, sortBySource, updateDirectories, workspaceKey]);

  loadDirectoryRef.current = loadDirectory;

  const refreshLoadedDirectories = useCallback(() => {
    const currentExpanded = useStore.getState().knowledgeExpandedPathsBySource;
    const sourceByKey = new Map(
      sourcesRef.current.map((source) => [source.sourceKey, source]),
    );
    for (const key of Object.keys(directoriesRef.current)) {
      const address = splitDirectoryKey(key);
      if (!(currentExpanded[address.sourceKey] ?? []).includes(address.relativePath)) {
        continue;
      }
      const source = sourceByKey.get(address.sourceKey);
      if (source) void loadDirectory(source, address.relativePath, true);
    }
  }, [loadDirectory]);

  useEffect(() => {
    if (workspaceKeyRef.current === workspaceKey) return;
    workspaceKeyRef.current = workspaceKey;
    for (const controller of controllersRef.current.values()) controller.abort();
    controllersRef.current.clear();
    requestIdsRef.current.clear();
    for (const timer of initialRootCatchUpTimersRef.current.values()) {
      clearTimeout(timer);
    }
    initialRootCatchUpTimersRef.current.clear();
    initialRootCatchUpKeysRef.current.clear();
    confirmedWatchRootKeysRef.current.clear();
    watchReadyCatchUpKeysRef.current.clear();
    directoriesRef.current = {};
    setDirectories({});
    setSortBySource({});
    pendingLocateKeyRef.current = null;
    dispatchSelection({ type: 'clear' });
  }, [workspaceKey]);

  useEffect(() => {
    for (const source of sources) {
      for (const relativePath of expandedPathsBySource[source.sourceKey] ?? []) {
        const key = directoryKey(source.sourceKey, relativePath);
        if (!directoriesRef.current[key]) {
          void loadDirectory(source, relativePath);
        }
      }
    }
  }, [expandedPathsBySource, loadDirectory, sources]);

  useEffect(() => {
    const activeSourceKeys = new Set(sources.map((source) => source.sourceKey));
    for (const [key, controller] of controllersRef.current) {
      const { sourceKey } = splitDirectoryKey(key);
      if (activeSourceKeys.has(sourceKey)) continue;
      controller.abort();
      controllersRef.current.delete(key);
    }
    updateDirectories((current) => Object.fromEntries(
      Object.entries(current).filter(([key]) => (
        activeSourceKeys.has(splitDirectoryKey(key).sourceKey)
      )),
    ));
  }, [sources, updateDirectories]);

  useEffect(() => {
    let active = true;
    const releaseWatches = sources
      .filter((source) => (
        source.availability === 'available'
        && source.capabilities.includes('watch')
      ))
      .map((source) => ({ source, release: watchSource(source.sourceKey) }));

    for (const { source, release } of releaseWatches) {
      void release.ready?.then(() => {
        const key = directoryKey(source.sourceKey, '');
        confirmedWatchRootKeysRef.current.add(key);
        if (
          !active
          || workspaceKeyRef.current !== workspaceKey
          || watchReadyCatchUpKeysRef.current.has(key)
        ) {
          return;
        }
        const currentSource = sourcesRef.current.find(
          (candidate) => candidate.sourceKey === source.sourceKey,
        );
        if (!currentSource || !directoriesRef.current[key]) return;
        watchReadyCatchUpKeysRef.current.add(key);
        void loadDirectoryRef.current?.(currentSource, '', true);
      });
    }

    return () => {
      active = false;
      for (const { release } of releaseWatches) release();
    };
  }, [sources, watchSource, workspaceKey]);

  useEffect(() => subscribeToChanges(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      refreshLoadedDirectories();
    }, Math.max(0, refreshDelayMs));
  }), [refreshDelayMs, refreshLoadedDirectories, subscribeToChanges]);

  useEffect(() => () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    for (const timer of initialRootCatchUpTimersRef.current.values()) {
      clearTimeout(timer);
    }
    initialRootCatchUpTimersRef.current.clear();
    initialRootCatchUpKeysRef.current.clear();
    confirmedWatchRootKeysRef.current.clear();
    watchReadyCatchUpKeysRef.current.clear();
    for (const controller of controllersRef.current.values()) controller.abort();
    controllersRef.current.clear();
  }, []);

  const toggleDirectory = useCallback((
    source: KnowledgeSourceDto,
    relativePath: string,
  ) => {
    const current = expandedPathsBySource[source.sourceKey] ?? [];
    if (current.includes(relativePath)) {
      const next = current.filter(
        (path) => !isPathOrDescendant(path, relativePath),
      );
      setExpandedPaths(source.sourceKey, next);
      abortDirectoryBranch(source.sourceKey, relativePath, true);
      return;
    }
    setExpandedPaths(source.sourceKey, [...current, relativePath]);
    void loadDirectory(source, relativePath, true);
  }, [
    abortDirectoryBranch,
    expandedPathsBySource,
    loadDirectory,
    setExpandedPaths,
  ]);

  const visibleNodes = useMemo(() => buildVisibleKnowledgeTreeNodes(
    sources,
    expandedPathsBySource,
    directories,
    sortBySource,
  ), [directories, expandedPathsBySource, sortBySource, sources]);
  const dragController = useMemo(() => new KnowledgeDragController({
    onExpand: ({ sourceKey, directoryPath }) => {
      const source = sourcesRef.current.find(candidate => candidate.sourceKey === sourceKey);
      if (source) toggleDirectory(source, directoryPath);
    },
  }), [toggleDirectory]);
  useEffect(() => () => dragController.dispose(), [dragController]);

  // A rendered row may receive a pointer event before passive effects run.
  // Keep the reducer's semantic lookup in lockstep with that rendered list.
  useLayoutEffect(() => {
    dispatchSelection({ type: 'replace-visible', nodes: visibleNodes });
  }, [visibleNodes]);

  useEffect(() => {
    const key = pendingLocateKeyRef.current;
    if (!key || !visibleNodes.some(node => node.key === key)) return;
    pendingLocateKeyRef.current = null;
    dispatchSelection({ type: 'select', key });
    requestAnimationFrame(() => {
      const row = rowRefs.current.get(key);
      row?.scrollIntoView?.({ block: 'nearest' });
      row?.focus();
    });
  }, [visibleNodes]);

  useImperativeHandle(ref, () => ({
    locateResource(target) {
      const source = sources.find(candidate => candidate.sourceKey === target.sourceKey);
      if (!source) return;
      const relativePath = target.relativePath ?? '';
      const key = knowledgeTreeNodeKey(target.sourceKey, relativePath);
      pendingLocateKeyRef.current = key;

      if (target.kind === 'source') {
        dispatchSelection({ type: 'select', key });
        requestAnimationFrame(() => {
          const row = rowRefs.current.get(key);
          row?.scrollIntoView?.({ block: 'nearest' });
          row?.focus();
        });
        pendingLocateKeyRef.current = null;
        return;
      }

      const segments = relativePath.split('/');
      const ancestors = [''];
      for (let index = 1; index < segments.length; index += 1) {
        ancestors.push(segments.slice(0, index).join('/'));
      }
      const current = expandedPathsBySource[target.sourceKey] ?? [];
      const next = [...current];
      for (const ancestor of ancestors) {
        if (!next.includes(ancestor)) next.push(ancestor);
        // Locating a resource immediately after a mutation cannot rely on a
        // platform watcher having delivered the invalidation already.
        void loadDirectory(source, ancestor, true);
      }
      setExpandedPaths(target.sourceKey, next);
    },
  }), [expandedPathsBySource, loadDirectory, setExpandedPaths, sources]);

  useEffect(() => {
    const nodeByKey = new Map(selection.visibleNodes.map(node => [node.key, node]));
    const toAddress = (key: string | null): KnowledgeResourceAddress | null => {
      const node = key ? nodeByKey.get(key) : undefined;
      return node && node.relativePath
        ? { sourceKey: node.sourceKey, relativePath: node.relativePath }
        : null;
    };
    onSelectionChangeRef.current?.({
      sourceKey: selection.sourceKey,
      addresses: selection.selectedKeys
        .map(toAddress)
        .filter((address): address is KnowledgeResourceAddress => Boolean(address)),
      contextTarget: toAddress(selection.contextTargetKey),
    });
  }, [selection]);

  const focusRow = useCallback((key: string) => {
    requestAnimationFrame(() => rowRefs.current.get(key)?.focus());
  }, []);

  const interact: TreeInteraction = {
    selection,
    registerRow: (key, element) => {
      if (element) rowRefs.current.set(key, element);
      else rowRefs.current.delete(key);
    },
    select: (key, options = {}) => {
      dispatchSelection({ type: 'select', key, ...options });
      focusRow(key);
    },
    context: (key) => {
      dispatchSelection({ type: 'context', key });
      focusRow(key);
    },
    keyDown: (event, key) => {
      const node = selection.visibleNodes.find(candidate => candidate.key === key);
      if (!node) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.code === 'Space') {
        event.preventDefault();
        dispatchSelection({ type: 'toggle-focused', key });
        return;
      }
      const movement = keyboardMovement(event.key);
      if (movement) {
        event.preventDefault();
        const target = moveKnowledgeTreeFocus(selection, movement);
        if (!target) return;
        if (command) dispatchSelection({ type: 'focus', key: target });
        else dispatchSelection({
          type: 'select',
          key: target,
          range: event.shiftKey,
        });
        focusRow(target);
        return;
      }
      const source = sources.find(candidate => candidate.sourceKey === node.sourceKey);
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && source) {
        event.preventDefault();
        if (event.key === 'ArrowLeft') {
          if (node.isDirectory && node.expanded) {
            toggleDirectory(source, node.relativePath);
            return;
          }
          if (node.parentKey) {
            dispatchSelection({ type: command ? 'focus' : 'select', key: node.parentKey });
            focusRow(node.parentKey);
          }
          return;
        }
        if (node.isDirectory && !node.expanded) {
          toggleDirectory(source, node.relativePath);
          return;
        }
        const child = selection.visibleNodes.find(candidate => candidate.parentKey === node.key);
        if (child) {
          dispatchSelection({ type: command ? 'focus' : 'select', key: child.key });
          focusRow(child.key);
        }
        return;
      }
      if (event.key !== 'Enter' && event.code !== 'Space') return;
      event.preventDefault();
      if (node.isDirectory) {
        if (source && event.key === 'Enter') toggleDirectory(source, node.relativePath);
        return;
      }
      openTreeResource(node, event.key === 'Enter' ? 'pinned' : 'preview', event.key === 'Enter');
    },
    open: (key, mode, focusContent) => {
      const node = selection.visibleNodes.find(candidate => candidate.key === key)
        ?? visibleNodes.find(candidate => candidate.key === key);
      if (node) openTreeResource(node, mode, focusContent);
    },
    toggle: (source, relativePath) => toggleDirectory(source, relativePath),
    dragStart: (event, key) => {
      const node = visibleNodes.find(candidate => candidate.key === key);
      if (!node?.relativePath) return;
      const selectedNodes = selection.selectedKeys.includes(key)
        ? selection.selectedKeys
          .map(selectedKey => visibleNodes.find(candidate => candidate.key === selectedKey))
          .filter((candidate): candidate is KnowledgeTreeVisibleNode => Boolean(candidate?.relativePath))
        : [node];
      const addresses = selectedNodes.map(candidate => ({ sourceKey: candidate.sourceKey, relativePath: candidate.relativePath }));
      if (addresses.some(address => address.sourceKey !== node.sourceKey)) return;
      const payload = { kind: 'knowledge-resources' as const, sourceKey: node.sourceKey, addresses };
      dragController.begin(payload);
      event.dataTransfer.setData(KNOWLEDGE_DRAG_MIME, JSON.stringify(payload));
      const editorItems = selectedNodes
        .filter(candidate => !candidate.isDirectory)
        .map(candidate => ({
          sourceAddress: {
            sourceKey: candidate.sourceKey,
            relativePath: candidate.relativePath,
          },
          kind: candidate.relativePath.toLocaleLowerCase().endsWith('.md')
            ? 'page'
            : 'attachment',
        }));
      if (editorItems.length > 0) {
        event.dataTransfer.setData(
          KNOWLEDGE_ATTACHMENT_RESOURCE_MIME,
          JSON.stringify(editorItems),
        );
      }
      event.dataTransfer.effectAllowed = 'copyMove';
    },
    dragOver: (event, key) => {
      const node = visibleNodes.find(candidate => candidate.key === key);
      if (!node?.isDirectory) return;
      if (!dragController.state().payload) {
        if (event.dataTransfer.files.length > 0) {
          dragController.begin({
            kind: 'external-files',
            nativeRequestId: crypto.randomUUID(),
          });
        }
        let parsed = null;
        try { parsed = parseKnowledgeDragPayload(JSON.parse(event.dataTransfer.getData(KNOWLEDGE_DRAG_MIME) || 'null')); } catch { parsed = null; }
        if (parsed) dragController.begin(parsed);
      }
      const rect = event.currentTarget.getBoundingClientRect();
      dragController.hover({
        address: { sourceKey: node.sourceKey, directoryPath: node.relativePath },
        directory: true,
        expanded: Boolean(node.expanded),
      }, rect.height ? (event.clientY - rect.top) / rect.height : 0.5);
      if (dragController.state().effect !== 'none') {
        event.preventDefault();
        event.dataTransfer.dropEffect = dragController.state().effect === 'move' ? 'move' : 'copy';
      }
    },
    drop: async (event, key) => {
      event.preventDefault();
      const node = visibleNodes.find(candidate => candidate.key === key);
      if (!node?.isDirectory) return dragController.cancel();
      const dropped = dragController.drop();
      if (!dropped) return;
      if (dropped.payload.kind === 'external-files') {
        const files = Array.from(event.dataTransfer.files);
        if (files.length === 0) return;
        await invokeKnowledgeNative({
          action: 'importDroppedFiles',
          files,
          target: dropped.target.address,
          conflictPolicy: 'keep-both',
        });
        return;
      }
      await client.pasteResources({
        intent: dropped.effect === 'move' ? 'cut' : 'copy',
        items: dropped.payload.addresses,
        target: dropped.target.address,
      });
    },
    dragEnd: () => dragController.cancel(),
  };

  function openTreeResource(
    node: KnowledgeTreeVisibleNode,
    mode: 'preview' | 'pinned',
    focusContent: boolean,
  ) {
    if (node.isDirectory || !node.relativePath) return;
    const source = sources.find(candidate => candidate.sourceKey === node.sourceKey);
    if (!source) return;
    onOpenResource?.({
      address: { sourceKey: node.sourceKey, relativePath: node.relativePath },
      sourceName: source.displayName,
      mode,
      focusContent,
    });
  }

  const sourceRows = sources.map((source) => {
    const expanded = (expandedPathsBySource[source.sourceKey] ?? []).includes('');
    const state = directories[directoryKey(source.sourceKey, '')];
    return (
      <SourceNode
        directoryState={state}
        expanded={expanded}
        expandedPaths={expandedPathsBySource[source.sourceKey] ?? []}
        key={source.sourceKey}
        onRetry={(relativePath) => void loadDirectory(source, relativePath, true)}
        onToggle={(relativePath) => toggleDirectory(source, relativePath)}
        interact={interact}
        sort={sortBySource[source.sourceKey] ?? { field: 'name', direction: 'ascending' }}
        onSort={(sort) => setSortBySource(current => ({ ...current, [source.sourceKey]: sort }))}
        source={source}
        states={directories}
      />
    );
  });

  if (sourceRows.length === 0) {
    return <p className={styles.emptyTree}>{tr('knowledge.tree.empty')}</p>;
  }
  return (
    <ul
      className={styles.knowledgeTreeRoots}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          dispatchSelection({ type: 'clear-selection' });
        }
      }}
      role="group"
    >
      {sourceRows}
    </ul>
  );
});

type TreeInteraction = {
  selection: KnowledgeTreeSelectionState;
  registerRow(key: string, element: HTMLDivElement | null): void;
  select(key: string, options?: { additive?: boolean; range?: boolean }): void;
  context(key: string): void;
  keyDown(event: KeyboardEvent<HTMLDivElement>, key: string): void;
  open(key: string, mode: 'preview' | 'pinned', focusContent: boolean): void;
  toggle(source: KnowledgeSourceDto, relativePath: string): void;
  dragStart(event: DragEvent<HTMLDivElement>, key: string): void;
  dragOver(event: DragEvent<HTMLDivElement>, key: string): void;
  drop(event: DragEvent<HTMLDivElement>, key: string): Promise<void> | void;
  dragEnd(): void;
};

function SourceNode({
  source,
  expanded,
  expandedPaths,
  directoryState,
  states,
  onToggle,
  onRetry,
  interact,
  sort,
  onSort,
}: {
  source: KnowledgeSourceDto;
  expanded: boolean;
  expandedPaths: string[];
  directoryState?: DirectoryState;
  states: DirectoryStateMap;
  onToggle(relativePath: string): void;
  onRetry(relativePath: string): void;
  interact: TreeInteraction;
  sort: KnowledgeTreeSort;
  onSort(sort: KnowledgeTreeSort): void;
}) {
  const listable = isSourceListable(source);
  const key = knowledgeTreeNodeKey(source.sourceKey, '');
  const selected = interact.selection.selectedKeys.includes(key);
  const focused = interact.selection.focusKey === key
    || (!interact.selection.focusKey && interact.selection.visibleNodes[0]?.key === key);
  return (
    <li className={styles.knowledgeTreeListItem} role="none">
      <div
        aria-disabled={!listable || undefined}
        aria-expanded={listable ? expanded : undefined}
        aria-level={1}
        aria-selected={selected}
        className={styles.knowledgeTreeItem}
        data-source-key={source.sourceKey}
        onDragOver={(event) => interact.dragOver(event, key)}
        onDrop={(event) => void interact.drop(event, key)}
        onClick={(event) => interact.select(key, {
          additive: event.metaKey || event.ctrlKey,
          range: event.shiftKey,
        })}
        onContextMenu={(event) => {
          event.preventDefault();
          interact.context(key);
        }}
        onDoubleClick={() => listable && onToggle('')}
        onKeyDown={(event) => interact.keyDown(event, key)}
        ref={(element) => interact.registerRow(key, element)}
        role="treeitem"
        tabIndex={focused ? 0 : -1}
      >
        {listable ? (
          <button
            aria-label={tr(
              expanded ? 'knowledge.tree.collapse' : 'knowledge.tree.expand',
              { name: source.displayName },
            )}
            className={styles.treeDisclosureButton}
            onClick={(event) => {
              event.stopPropagation();
              onToggle('');
            }}
            type="button"
          >
            <DisclosureIcon expanded={expanded} />
          </button>
        ) : (
          <span className={styles.treeDisclosureSpacer} aria-hidden="true" />
        )}
        <span className={styles.treeSourceIcon} aria-hidden="true">
          <ResourceIcon directory />
        </span>
        <span className={styles.knowledgeTreeName}>{source.displayName}</span>
        <select
          aria-label={tr('knowledge.tree.sort', { name: source.displayName })}
          className={styles.knowledgeTreeSort}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onSort(parseTreeSort(event.target.value))}
          value={`${sort.field}:${sort.direction}`}
        >
          <option value="name:ascending">{tr('knowledge.tree.sortNameAscending')}</option>
          <option value="name:descending">{tr('knowledge.tree.sortNameDescending')}</option>
          <option value="modified:ascending">{tr('knowledge.tree.sortModifiedAscending')}</option>
          <option value="modified:descending">{tr('knowledge.tree.sortModifiedDescending')}</option>
          <option value="extension:ascending">{tr('knowledge.tree.sortExtensionAscending')}</option>
          <option value="extension:descending">{tr('knowledge.tree.sortExtensionDescending')}</option>
        </select>
      </div>
      {!listable && (
        <p className={styles.treeInlineStatus} role="status">
          {tr('knowledge.tree.unavailable', { name: source.displayName })}
        </p>
      )}
      {expanded && (
        <DirectoryGroup
          directoryName={source.displayName}
          directoryState={directoryState}
          expandedPaths={expandedPaths}
          level={2}
          onRetry={onRetry}
          onToggle={onToggle}
          interact={interact}
          sort={sort}
          parentPath=""
          source={source}
          states={states}
        />
      )}
    </li>
  );
}

function DirectoryGroup({
  source,
  parentPath,
  directoryName,
  level,
  expandedPaths,
  directoryState,
  states,
  onToggle,
  onRetry,
  interact,
  sort,
}: {
  source: KnowledgeSourceDto;
  parentPath: string;
  directoryName: string;
  level: number;
  expandedPaths: string[];
  directoryState?: DirectoryState;
  states: DirectoryStateMap;
  onToggle(relativePath: string): void;
  onRetry(relativePath: string): void;
  interact: TreeInteraction;
  sort: KnowledgeTreeSort;
}) {
  const items = sortKnowledgeTreeItems(directoryState?.items ?? [], sort);
  return (
    <ul
      aria-label={directoryName}
      className={styles.knowledgeTreeGroup}
      role="group"
    >
      {items.map((item) => {
        const relativePath = joinRelativePath(parentPath, item.name);
        const expanded = item.isDirectory && expandedPaths.includes(relativePath);
        const childState = states[directoryKey(source.sourceKey, relativePath)];
        const key = knowledgeTreeNodeKey(source.sourceKey, relativePath);
        const selected = interact.selection.selectedKeys.includes(key);
        const focused = interact.selection.focusKey === key;
        return (
          <li className={styles.knowledgeTreeListItem} key={relativePath} role="none">
            <div
              aria-expanded={item.isDirectory ? expanded : undefined}
              aria-level={level}
              aria-posinset={items.indexOf(item) + 1}
              aria-selected={selected}
              aria-setsize={items.length}
              className={styles.knowledgeTreeItem}
              data-resource-name={item.name}
              data-resource-path={relativePath}
              data-source-key={source.sourceKey}
              draggable
              onDragStart={(event) => interact.dragStart(event, key)}
              onDragEnd={() => interact.dragEnd()}
              onDragOver={(event) => interact.dragOver(event, key)}
              onDrop={(event) => void interact.drop(event, key)}
              onClick={(event) => {
                interact.select(key, {
                  additive: event.metaKey || event.ctrlKey,
                  range: event.shiftKey,
                });
                if (!item.isDirectory) interact.open(key, 'preview', false);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                interact.context(key);
              }}
              onDoubleClick={() => {
                if (item.isDirectory) interact.toggle(source, relativePath);
                else interact.open(key, 'pinned', true);
              }}
              onKeyDown={(event) => interact.keyDown(event, key)}
              ref={(element) => interact.registerRow(key, element)}
              role="treeitem"
              style={{ '--knowledge-tree-level': level } as CSSProperties}
              tabIndex={focused ? 0 : -1}
              title={item.name}
            >
              {item.isDirectory ? (
                <button
                  aria-label={tr(
                    expanded ? 'knowledge.tree.collapse' : 'knowledge.tree.expand',
                    { name: item.name },
                  )}
                  className={styles.treeDisclosureButton}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle(relativePath);
                  }}
                  type="button"
                >
                  <DisclosureIcon expanded={expanded} />
                </button>
              ) : (
                <span className={styles.treeDisclosureSpacer} aria-hidden="true" />
              )}
              <span className={styles.treeResourceIcon} aria-hidden="true">
                <ResourceIcon directory={item.isDirectory} />
              </span>
              <span className={styles.knowledgeTreeName}>{item.name}</span>
            </div>
            {expanded && (
              <DirectoryGroup
                directoryName={item.name}
                directoryState={childState}
                expandedPaths={expandedPaths}
                level={level + 1}
                onRetry={onRetry}
                onToggle={onToggle}
                interact={interact}
                sort={sort}
                parentPath={relativePath}
                source={source}
                states={states}
              />
            )}
          </li>
        );
      })}
      {directoryState?.status === 'loading' && (
        <li className={styles.treeInlineStatus} role="status">
          {tr('knowledge.tree.loading', { name: directoryName })}
        </li>
      )}
      {directoryState?.status === 'error' && (
        <li className={styles.treeInlineError} role="alert">
          <span>{tr('knowledge.tree.loadError', { name: directoryName })}</span>
          <button
            className={styles.treeRetryButton}
            onClick={() => onRetry(parentPath)}
            type="button"
          >
            {tr('knowledge.tree.retry', { name: directoryName })}
          </button>
        </li>
      )}
      {directoryState?.status === 'ready' && items.length === 0 && (
        <li className={styles.treeInlineStatus} role="status">
          {tr('knowledge.tree.emptyDirectory', { name: directoryName })}
        </li>
      )}
    </ul>
  );
}

function buildVisibleKnowledgeTreeNodes(
  sources: readonly KnowledgeSourceDto[],
  expandedPathsBySource: Record<string, string[]>,
  directories: DirectoryStateMap,
  sortBySource: Record<string, KnowledgeTreeSort>,
): KnowledgeTreeVisibleNode[] {
  const visible: KnowledgeTreeVisibleNode[] = [];
  for (const source of sources) {
    const expandedPaths = expandedPathsBySource[source.sourceKey] ?? [];
    const rootKey = knowledgeTreeNodeKey(source.sourceKey, '');
    visible.push({
      key: rootKey,
      sourceKey: source.sourceKey,
      relativePath: '',
      parentKey: null,
      isDirectory: true,
      expanded: expandedPaths.includes(''),
    });
    if (!expandedPaths.includes('')) continue;
    appendDirectory('', rootKey);

    function appendDirectory(parentPath: string, parentKey: string) {
      const state = directories[directoryKey(source.sourceKey, parentPath)];
      const items = sortKnowledgeTreeItems(
        state?.items ?? [],
        sortBySource[source.sourceKey],
      );
      for (const item of items) {
        const relativePath = joinRelativePath(parentPath, item.name);
        const key = knowledgeTreeNodeKey(source.sourceKey, relativePath);
        const expanded = item.isDirectory && expandedPaths.includes(relativePath);
        visible.push({
          key,
          sourceKey: source.sourceKey,
          relativePath,
          parentKey,
          isDirectory: item.isDirectory,
          expanded,
        });
        if (expanded) appendDirectory(relativePath, key);
      }
    }
  }
  return visible;
}

function keyboardMovement(
  key: string,
): Parameters<typeof moveKnowledgeTreeFocus>[1] | null {
  switch (key) {
    case 'ArrowUp':
      return 'previous';
    case 'ArrowDown':
      return 'next';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    case 'PageUp':
      return 'page-up';
    case 'PageDown':
      return 'page-down';
    default:
      return null;
  }
}

function fileExtension(name: string): string {
  const lastDot = name.lastIndexOf('.');
  return lastDot > 0 && lastDot < name.length - 1
    ? name.slice(lastDot + 1)
    : '';
}

function parseTreeSort(value: string): KnowledgeTreeSort {
  const [field, direction] = value.split(':');
  if (
    !['name', 'modified', 'extension'].includes(field)
    || !['ascending', 'descending'].includes(direction)
  ) {
    return { field: 'name', direction: 'ascending' };
  }
  return {
    field: field as KnowledgeTreeSort['field'],
    direction: direction as KnowledgeTreeSort['direction'],
  };
}
