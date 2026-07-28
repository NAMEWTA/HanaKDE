import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties } from 'react';
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
} from '../../services/resource-events';
import { useStore } from '../../stores';
import styles from './KnowledgeWorkspace.module.css';

export type { KnowledgeResourceTreeChangeSignal };

type DirectoryStatus = 'loading' | 'ready' | 'error';

type DirectoryState = {
  items: RendererResourceListItem[];
  status: DirectoryStatus;
};

type DirectoryStateMap = Record<string, DirectoryState>;

type WatchSource = (sourceKey: string) => () => void;
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
}

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
): RendererResourceListItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      if (left.item.isDirectory !== right.item.isDirectory) {
        return left.item.isDirectory ? -1 : 1;
      }
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

export function KnowledgeResourceTree({
  client,
  sources,
  workspaceKey,
  watchSource = retainKnowledgeSourceWatch,
  subscribeToChanges = subscribeKnowledgeResourceTreeChanges,
  refreshDelayMs = 120,
}: KnowledgeResourceTreeProps) {
  const expandedPathsBySource = useStore(
    (state) => state.knowledgeExpandedPathsBySource,
  );
  const setExpandedPaths = useStore(
    (state) => state.setKnowledgeExpandedPaths,
  );
  const [directories, setDirectories] = useState<DirectoryStateMap>({});
  const directoriesRef = useRef<DirectoryStateMap>({});
  const controllersRef = useRef(new Map<string, AbortController>());
  const requestIdsRef = useRef(new Map<string, number>());
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
          items: sortKnowledgeTreeItems(visibleItems),
          status: 'ready',
        },
      }));
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
  }, [client, updateDirectories, workspaceKey]);

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
    directoriesRef.current = {};
    setDirectories({});
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
    const releaseWatches = sources
      .filter((source) => (
        source.availability === 'available'
        && source.capabilities.includes('watch')
      ))
      .map((source) => watchSource(source.sourceKey));
    return () => {
      for (const release of releaseWatches) release();
    };
  }, [sources, watchSource]);

  useEffect(() => subscribeToChanges(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      refreshLoadedDirectories();
    }, Math.max(0, refreshDelayMs));
  }), [refreshDelayMs, refreshLoadedDirectories, subscribeToChanges]);

  useEffect(() => () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
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

  const sourceRows = useMemo(() => sources.map((source) => {
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
        source={source}
        states={directories}
      />
    );
  }), [
    directories,
    expandedPathsBySource,
    loadDirectory,
    sources,
    toggleDirectory,
  ]);

  if (sourceRows.length === 0) {
    return <p className={styles.emptyTree}>{tr('knowledge.tree.empty')}</p>;
  }
  return (
    <ul className={styles.knowledgeTreeRoots} role="group">
      {sourceRows}
    </ul>
  );
}

function SourceNode({
  source,
  expanded,
  expandedPaths,
  directoryState,
  states,
  onToggle,
  onRetry,
}: {
  source: KnowledgeSourceDto;
  expanded: boolean;
  expandedPaths: string[];
  directoryState?: DirectoryState;
  states: DirectoryStateMap;
  onToggle(relativePath: string): void;
  onRetry(relativePath: string): void;
}) {
  const listable = isSourceListable(source);
  return (
    <li className={styles.knowledgeTreeListItem} role="none">
      <div
        aria-disabled={!listable || undefined}
        aria-expanded={listable ? expanded : undefined}
        aria-level={1}
        className={styles.knowledgeTreeItem}
        data-source-key={source.sourceKey}
        role="treeitem"
      >
        {listable ? (
          <button
            aria-label={tr(
              expanded ? 'knowledge.tree.collapse' : 'knowledge.tree.expand',
              { name: source.displayName },
            )}
            className={styles.treeDisclosureButton}
            onClick={() => onToggle('')}
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
}) {
  const items = directoryState?.items ?? [];
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
        return (
          <li className={styles.knowledgeTreeListItem} key={relativePath} role="none">
            <div
              aria-expanded={item.isDirectory ? expanded : undefined}
              aria-level={level}
              className={styles.knowledgeTreeItem}
              data-resource-name={item.name}
              data-resource-path={relativePath}
              data-source-key={source.sourceKey}
              role="treeitem"
              style={{ '--knowledge-tree-level': level } as CSSProperties}
              tabIndex={-1}
              title={item.name}
            >
              {item.isDirectory ? (
                <button
                  aria-label={tr(
                    expanded ? 'knowledge.tree.collapse' : 'knowledge.tree.expand',
                    { name: item.name },
                  )}
                  className={styles.treeDisclosureButton}
                  onClick={() => onToggle(relativePath)}
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
