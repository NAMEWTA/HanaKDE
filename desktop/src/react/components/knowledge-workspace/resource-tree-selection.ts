export type KnowledgeTreeVisibleNode = Readonly<{
  key: string;
  sourceKey: string;
  relativePath: string;
  parentKey: string | null;
  isDirectory: boolean;
  expanded?: boolean;
}>;

export type KnowledgeTreeSelectionState = Readonly<{
  visibleNodes: readonly KnowledgeTreeVisibleNode[];
  selectedKeys: readonly string[];
  sourceKey: string | null;
  focusKey: string | null;
  anchorKey: string | null;
  contextTargetKey: string | null;
}>;

export type KnowledgeTreeSelectionAction =
  | Readonly<{ type: 'replace-visible'; nodes: readonly KnowledgeTreeVisibleNode[] }>
  | Readonly<{ type: 'select'; key: string; additive?: boolean; range?: boolean }>
  | Readonly<{ type: 'focus'; key: string }>
  | Readonly<{ type: 'toggle-focused'; key: string }>
  | Readonly<{ type: 'context'; key: string }>
  | Readonly<{ type: 'clear-selection' }>
  | Readonly<{ type: 'clear' }>;

export function createKnowledgeTreeSelectionState(): KnowledgeTreeSelectionState {
  return {
    visibleNodes: [],
    selectedKeys: [],
    sourceKey: null,
    focusKey: null,
    anchorKey: null,
    contextTargetKey: null,
  };
}

export function knowledgeTreeSelectionReducer(
  state: KnowledgeTreeSelectionState,
  action: KnowledgeTreeSelectionAction,
): KnowledgeTreeSelectionState {
  switch (action.type) {
    case 'replace-visible':
      return replaceVisibleNodes(state, action.nodes);
    case 'select':
      return selectNode(state, action);
    case 'focus':
      return focusNode(state, action.key);
    case 'toggle-focused':
      return toggleFocusedNode(state, action.key);
    case 'context':
      return contextNode(state, action.key);
    case 'clear-selection':
      return {
        ...state,
        selectedKeys: [],
        sourceKey: null,
        anchorKey: null,
        contextTargetKey: null,
      };
    case 'clear':
      return createKnowledgeTreeSelectionState();
  }
}

export function normalizeKnowledgeTreeSelection(
  keys: readonly string[],
  visibleNodes: readonly KnowledgeTreeVisibleNode[],
  preferredSourceKey?: string | null,
): string[] {
  const nodeByKey = new Map(visibleNodes.map(node => [node.key, node]));
  const firstNode = keys.map(key => nodeByKey.get(key)).find(Boolean);
  const sourceKey = preferredSourceKey ?? firstNode?.sourceKey ?? null;
  if (!sourceKey) return [];
  const requested = new Set(keys.filter(key => nodeByKey.get(key)?.sourceKey === sourceKey));
  const normalized: string[] = [];
  for (const node of visibleNodes) {
    if (!requested.has(node.key) || node.sourceKey !== sourceKey) continue;
    if (normalized.some(key => isAncestor(nodeByKey.get(key), node))) continue;
    for (let index = normalized.length - 1; index >= 0; index -= 1) {
      if (isAncestor(node, nodeByKey.get(normalized[index]))) {
        normalized.splice(index, 1);
      }
    }
    normalized.push(node.key);
  }
  return normalized;
}

export function knowledgeTreeNodeKey(
  sourceKey: string,
  relativePath: string,
): string {
  return `${sourceKey}\u0000${relativePath}`;
}

export function moveKnowledgeTreeFocus(
  state: KnowledgeTreeSelectionState,
  movement: 'previous' | 'next' | 'first' | 'last' | 'page-up' | 'page-down',
  pageSize = 10,
): string | null {
  if (state.visibleNodes.length === 0) return null;
  const current = state.visibleNodes.findIndex(node => node.key === state.focusKey);
  if (movement === 'first') return state.visibleNodes[0].key;
  if (movement === 'last') return state.visibleNodes.at(-1)!.key;
  const start = current < 0 ? 0 : current;
  const delta = movement === 'previous'
    ? -1
    : movement === 'next'
      ? 1
      : movement === 'page-up'
        ? -Math.max(1, pageSize)
        : Math.max(1, pageSize);
  const target = Math.max(0, Math.min(state.visibleNodes.length - 1, start + delta));
  return state.visibleNodes[target].key;
}

function replaceVisibleNodes(
  state: KnowledgeTreeSelectionState,
  nodes: readonly KnowledgeTreeVisibleNode[],
): KnowledgeTreeSelectionState {
  const keys = new Set(nodes.map(node => node.key));
  const selectedKeys = normalizeKnowledgeTreeSelection(
    state.selectedKeys.filter(key => keys.has(key)),
    nodes,
    state.sourceKey,
  );
  const sourceKey = selectedKeys.length > 0
    ? nodes.find(node => node.key === selectedKeys[0])?.sourceKey ?? null
    : null;
  const next = {
    visibleNodes: [...nodes],
    selectedKeys,
    sourceKey,
    focusKey: state.focusKey && keys.has(state.focusKey) ? state.focusKey : null,
    anchorKey: state.anchorKey && keys.has(state.anchorKey) ? state.anchorKey : null,
    contextTargetKey: state.contextTargetKey && keys.has(state.contextTargetKey)
      ? state.contextTargetKey
      : null,
  };
  return selectionStatesEqual(state, next) ? state : next;
}

function selectionStatesEqual(
  left: KnowledgeTreeSelectionState,
  right: KnowledgeTreeSelectionState,
): boolean {
  return left.sourceKey === right.sourceKey
    && left.focusKey === right.focusKey
    && left.anchorKey === right.anchorKey
    && left.contextTargetKey === right.contextTargetKey
    && arraysEqual(left.selectedKeys, right.selectedKeys)
    && left.visibleNodes.length === right.visibleNodes.length
    && left.visibleNodes.every((node, index) => {
      const other = right.visibleNodes[index];
      return node.key === other?.key
        && node.sourceKey === other.sourceKey
        && node.relativePath === other.relativePath
        && node.parentKey === other.parentKey
        && node.isDirectory === other.isDirectory
        && Boolean(node.expanded) === Boolean(other.expanded);
    });
}

function arraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function selectNode(
  state: KnowledgeTreeSelectionState,
  action: Extract<KnowledgeTreeSelectionAction, { type: 'select' }>,
): KnowledgeTreeSelectionState {
  const node = findNode(state, action.key);
  if (!node) return state;
  if (action.range) {
    const anchor = findNode(state, state.anchorKey);
    if (anchor?.sourceKey === node.sourceKey) {
      const start = state.visibleNodes.findIndex(candidate => candidate.key === anchor.key);
      const end = state.visibleNodes.findIndex(candidate => candidate.key === node.key);
      const rangeKeys = state.visibleNodes
        .slice(Math.min(start, end), Math.max(start, end) + 1)
        .filter(candidate => candidate.sourceKey === node.sourceKey)
        .map(candidate => candidate.key);
      return {
        ...state,
        selectedKeys: normalizeKnowledgeTreeSelection(
          action.additive ? [...state.selectedKeys, ...rangeKeys] : rangeKeys,
          state.visibleNodes,
          node.sourceKey,
        ),
        sourceKey: node.sourceKey,
        focusKey: node.key,
        contextTargetKey: null,
      };
    }
  }
  const selectedKeys = action.additive && state.sourceKey === node.sourceKey
    ? normalizeKnowledgeTreeSelection(
        [...state.selectedKeys, node.key],
        state.visibleNodes,
        node.sourceKey,
      )
    : [node.key];
  return {
    ...state,
    selectedKeys,
    sourceKey: node.sourceKey,
    focusKey: node.key,
    anchorKey: node.key,
    contextTargetKey: null,
  };
}

function focusNode(
  state: KnowledgeTreeSelectionState,
  key: string,
): KnowledgeTreeSelectionState {
  return findNode(state, key) ? { ...state, focusKey: key } : state;
}

function toggleFocusedNode(
  state: KnowledgeTreeSelectionState,
  key: string,
): KnowledgeTreeSelectionState {
  const node = findNode(state, key);
  if (!node) return state;
  const sameSource = state.sourceKey === node.sourceKey;
  const selected = sameSource && state.selectedKeys.includes(key);
  const keys = selected
    ? state.selectedKeys.filter(candidate => candidate !== key)
    : sameSource
      ? [...state.selectedKeys, key]
      : [key];
  const selectedKeys = normalizeKnowledgeTreeSelection(keys, state.visibleNodes, node.sourceKey);
  return {
    ...state,
    selectedKeys,
    sourceKey: selectedKeys.length > 0 ? node.sourceKey : null,
    focusKey: node.key,
    anchorKey: state.anchorKey ?? node.key,
    contextTargetKey: null,
  };
}

function contextNode(
  state: KnowledgeTreeSelectionState,
  key: string,
): KnowledgeTreeSelectionState {
  const node = findNode(state, key);
  if (!node) return state;
  const selected = state.sourceKey === node.sourceKey
    && state.selectedKeys.includes(node.key);
  return {
    ...state,
    selectedKeys: selected ? state.selectedKeys : [node.key],
    sourceKey: node.sourceKey,
    focusKey: node.key,
    anchorKey: selected ? state.anchorKey : node.key,
    contextTargetKey: node.key,
  };
}

function findNode(
  state: KnowledgeTreeSelectionState,
  key: string | null,
): KnowledgeTreeVisibleNode | undefined {
  return key ? state.visibleNodes.find(node => node.key === key) : undefined;
}

function isAncestor(
  ancestor: KnowledgeTreeVisibleNode | undefined,
  descendant: KnowledgeTreeVisibleNode | undefined,
): boolean {
  return Boolean(
    ancestor
    && descendant
    && ancestor.sourceKey === descendant.sourceKey
    && ancestor.relativePath !== descendant.relativePath
    && (
      ancestor.relativePath === ''
      || descendant.relativePath.startsWith(`${ancestor.relativePath}/`)
    ),
  );
}
