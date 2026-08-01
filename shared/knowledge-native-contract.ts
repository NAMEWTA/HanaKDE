export const KNOWLEDGE_NATIVE_IPC_CHANNELS = Object.freeze({
  capabilities: 'knowledge-native:capabilities',
  invoke: 'knowledge-native:invoke',
});

export type KnowledgeNativeCapabilities = Readonly<{
  directoryPicker: boolean;
  filePicker: boolean;
  fileClipboard: boolean;
  openDefault: boolean;
  reveal: boolean;
  systemTrash: boolean;
}>;

export type KnowledgeNativeRequest =
  | Readonly<{
    action: 'pickFiles' | 'pickDirectory' | 'importClipboardFiles';
    target: Readonly<{ sourceKey: string; directoryPath: string }>;
    conflictPolicy: 'skip' | 'keep-both' | 'replace';
  }>
  | Readonly<{
    /**
     * File objects are opaque handles. The preload resolves them and sends only
     * the derived native paths to Main; no path is ever returned to Renderer.
     */
    action: 'importDroppedFiles';
    files: readonly unknown[];
    target: Readonly<{ sourceKey: string; directoryPath: string }>;
    conflictPolicy: 'skip' | 'keep-both' | 'replace';
  }>
  | Readonly<{
    action: 'openDefault' | 'reveal' | 'systemTrash';
    grantId: string;
  }>;

export type KnowledgeNativeResult =
  | Readonly<{ ok: true; cancelled: true }>
  | Readonly<{ ok: true; cancelled: false; result: unknown }>
  | Readonly<{ ok: false; code: 'knowledge_native_capability_unavailable' | 'knowledge_operation_precondition_failed' | 'knowledge_resource_unavailable' }>;

const GRANT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function parseKnowledgeNativeRequest(input: unknown): KnowledgeNativeRequest | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (['openDefault', 'reveal', 'systemTrash'].includes(String(value.action))) {
    return Object.keys(value).every(key => ['action', 'grantId'].includes(key))
      && typeof value.grantId === 'string'
      && GRANT_PATTERN.test(value.grantId)
      ? Object.freeze({
          action: value.action as 'openDefault' | 'reveal' | 'systemTrash',
          grantId: value.grantId,
        })
      : null;
  }
  if (!['pickFiles', 'pickDirectory', 'importClipboardFiles', 'importDroppedFiles'].includes(String(value.action))) return null;
  const dropped = value.action === 'importDroppedFiles';
  if (!Object.keys(value).every(key => ['action', 'target', 'conflictPolicy', ...(dropped ? ['files'] : [])].includes(key))) return null;
  const target = value.target as Record<string, unknown> | null;
  if (
    !target
    || typeof target !== 'object'
    || Array.isArray(target)
    || !Object.keys(target).every(key => ['sourceKey', 'directoryPath'].includes(key))
    || typeof target.sourceKey !== 'string'
    || !/^[a-z][a-z0-9-]{0,31}$/u.test(target.sourceKey)
    || typeof target.directoryPath !== 'string'
    || !isDirectoryPath(target.directoryPath)
    || !['skip', 'keep-both', 'replace'].includes(String(value.conflictPolicy))
    || (dropped && (!Array.isArray(value.files) || value.files.length === 0 || value.files.length > 1_000))
  ) return null;
  const common = {
    target: Object.freeze({
      sourceKey: target.sourceKey,
      directoryPath: target.directoryPath,
    }),
    conflictPolicy: value.conflictPolicy as 'skip' | 'keep-both' | 'replace',
  };
  return dropped
    ? Object.freeze({ action: 'importDroppedFiles' as const, files: Object.freeze([...(value.files as unknown[])]), ...common })
    : Object.freeze({ action: value.action as 'pickFiles' | 'pickDirectory' | 'importClipboardFiles', ...common });
}

function isDirectoryPath(value: string): boolean {
  return value === '' || (
    !value.startsWith('/')
    && !value.endsWith('/')
    && value.split('/').every(segment => (
      segment.length > 0
      && segment !== '.'
      && segment !== '..'
      && segment !== '.trash'
      && !/[\\\p{Cc}]/u.test(segment)
    ))
  );
}
