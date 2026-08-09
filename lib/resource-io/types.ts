export const RESOURCE_SCOPE_ROOT = Symbol("hana.resource-io.scope-root");

type ResourceInternalScope = {
  [RESOURCE_SCOPE_ROOT]?: string;
};

export type ResourceRef = (
  | { kind: "local-file"; path: string }
  | { kind: "mount"; mountId: string; path: string }
  | { kind: "session-file"; fileId: string; sessionId?: string; sessionPath?: string }
  | { kind: "resource"; resourceId: string }
  | { kind: "url"; url: string }
) & ResourceInternalScope;

export type ResourceVersion = {
  mtimeMs?: number;
  size?: number | null;
  sha256?: string;
  etag?: string;
  sequence?: number;
};

export type ResourceDescriptor = ResourceRef & {
  provider?: string;
  filePath?: string;
  displayName?: string;
  isDirectory?: boolean;
};

export type ResourceEventSource =
  | "agent_tool"
  | "provider_watch"
  | "api"
  | "plugin"
  | "bash_reconcile"
  | "mount"
  | "session_file"
  | "unknown";

export type ResourceChangedEvent = {
  type: "resource.changed";
  changeType: "created" | "modified";
  resourceKey: string;
  resource: ResourceDescriptor;
  version?: ResourceVersion;
  source: ResourceEventSource;
  reason?: string;
  sessionPath?: string | null;
  sequence: number;
  occurredAt: string;
  operationId?: string;
};

export type ResourceDeletedEvent = {
  type: "resource.deleted";
  resourceKey: string;
  resource: ResourceDescriptor;
  source: ResourceEventSource;
  sessionPath?: string | null;
  sequence: number;
  occurredAt: string;
  operationId?: string;
};

export type ResourceRenamedEvent = {
  type: "resource.renamed";
  oldResourceKey: string;
  newResourceKey: string;
  oldResource: ResourceDescriptor;
  newResource: ResourceDescriptor;
  source: ResourceEventSource;
  sessionPath?: string | null;
  sequence: number;
  occurredAt: string;
  operationId?: string;
};

export type ResourceEvent =
  | ResourceChangedEvent
  | ResourceDeletedEvent
  | ResourceRenamedEvent;

export type ResourceEventCatchUpResult =
  | {
    stale: false;
    latestSequence: number;
    events: ResourceEvent[];
  }
  | {
    stale: true;
    latestSequence: number;
    events: [];
  };

export type ResourceProviderCapabilities = {
  stat?: boolean;
  read?: boolean;
  openRead?: boolean;
  write?: boolean;
  writeExpectedVersion?: boolean;
  edit?: boolean;
  list?: boolean;
  search?: boolean;
  watch?: boolean;
  materialize?: boolean;
  copy?: boolean;
  rename?: boolean;
  move?: boolean;
  trash?: boolean;
  delete?: boolean;
  mkdir?: boolean;
  exportTree?: boolean;
  importTree?: boolean;
};

export type ProviderRootIdentity = Readonly<{
  providerId: string;
  identityNamespace: string;
  opaqueRootId: string;
  scopeToken: string;
  caseMode: "sensitive" | "insensitive" | "unknown";
}>;

export type RootRelation =
  | "same"
  | "ancestor"
  | "descendant"
  | "disjoint"
  | "unknown";

export type ResourceProviderCapability = keyof ResourceProviderCapabilities;

export type ResourceProviderId =
  | "local_fs"
  | "mount"
  | "session_file"
  | "resource"
  | "url";

/**
 * Provider-owned proof that binds a stat result to a later read. The symbol
 * keeps the proof out of JSON, logs, and remote DTO projection while allowing
 * in-process callers to carry it across the ResourceIO seam.
 */
export const RESOURCE_READ_PROOF = Symbol("hana.resource-io.read-proof");

/**
 * Provider-only signal for directory entries intentionally omitted from a
 * public list response (for example a symlink or junction). It is not
 * serializable and lets integrity-sensitive in-process callers reject a scan
 * while ordinary UI listing continues to show authorized entries.
 */
export const RESOURCE_LIST_BLOCKED_ENTRIES = Symbol("hana.resource-io.list-blocked-entries");

export type ResourceReadProof = Readonly<{
  providerId: ResourceProviderId;
  value: unknown;
}>;

export type ResourceStat = {
  resourceKey: string;
  resource: ResourceDescriptor;
  exists: boolean;
  isDirectory: boolean;
  version?: ResourceVersion;
  filePath?: string;
  [RESOURCE_READ_PROOF]?: ResourceReadProof;
};

export type ResourceReadResult = {
  resourceKey: string;
  resource: ResourceDescriptor;
  content: Buffer;
  version?: ResourceVersion;
  filePath?: string;
};

export type ResourceOpenReadOptions = {
  start?: number;
  end?: number;
  expectedVersion?: ResourceVersion;
  [RESOURCE_READ_PROOF]?: ResourceReadProof;
};

export type ResourceOpenReadResult = {
  resourceKey: string;
  resource: ResourceDescriptor;
  body: AsyncIterable<Uint8Array>;
  size: number;
  mtimeMs: number;
  version: ResourceVersion;
  filePath?: string;
};

export type ResourceMutationResult = {
  changeType: "created" | "modified";
  resourceKey: string;
  resource: ResourceDescriptor;
  version?: ResourceVersion;
  filePath?: string;
};

export type ResourceWriteConflictResult = {
  ok: false;
  conflict: true;
  resourceKey: string;
  resource: ResourceDescriptor;
  version?: ResourceVersion;
  filePath?: string;
};

export type ResourceWriteExpectedVersionResult =
  | ResourceMutationResult
  | ResourceWriteConflictResult;

export type ResourceMoveResult = {
  oldResourceKey: string;
  newResourceKey: string;
  oldResource: ResourceDescriptor;
  newResource: ResourceDescriptor;
  oldFilePath?: string;
  newFilePath?: string;
};

export type ResourceTrashOptions = {
  namespace?: string;
  metadata?: Record<string, unknown>;
};

export type ResourceMutationPreconditions = {
  expectedVersion?: ResourceVersion | null;
};

export type ResourceMovePreconditions = {
  expectedSourceVersion?: ResourceVersion;
  expectedTargetVersion?: ResourceVersion | null;
};

export type ResourceTrashResult = {
  resourceKey: string;
  resource: ResourceDescriptor;
  trashId: string;
  trashPath?: string;
  payloadPath?: string;
  filePath?: string;
};

export type ResourceEdit = {
  oldText: string;
  newText: string;
};

export type ResourceListItem = {
  name: string;
  isDirectory: boolean;
  size: number | null;
  mtimeMs: number;
};

export type ResourceListResult = {
  resourceKey: string;
  resource: ResourceDescriptor;
  items: ResourceListItem[];
  [RESOURCE_LIST_BLOCKED_ENTRIES]?: readonly string[];
};

export type ResourceSearchMatch = {
  filePath: string;
  line: number;
  text: string;
  name?: string;
  relativePath?: string;
  parentSubdir?: string;
  isDirectory?: boolean;
  size?: number | null;
  mtimeMs?: number;
};

export type ResourceSearchResult = {
  resourceKey: string;
  resource: ResourceDescriptor;
  matches: ResourceSearchMatch[];
};

export type MaterializeResult = {
  resourceKey: string;
  resource: ResourceDescriptor;
  filePath: string;
  version?: ResourceVersion;
  isDirectory?: boolean;
  cleanup?: () => void | Promise<void>;
};

export type ResourceExportDirectoryEntry = {
  kind: "directory";
  path: string[];
};

export type ResourceExportFileEntry = {
  kind: "file";
  path: string[];
  sizeBytes: number;
  version: ResourceVersion;
  body: AsyncIterable<Uint8Array>;
};

export type ResourceExportSymbolicLinkEntry = {
  kind: "symbolic_link";
  path: string[];
  linkTarget: string;
};

export type ResourceExportEntry =
  | ResourceExportDirectoryEntry
  | ResourceExportFileEntry
  | ResourceExportSymbolicLinkEntry;

export type ResourceExportTreeOptions = {
  signal?: AbortSignal;
  registerScopeRevalidator?: (
    revalidate: () => void | Promise<void>,
  ) => void;
};

export type ResourceImportTreeOptions = {
  signal?: AbortSignal;
  expectedTargetVersion?: string | null;
  replaceExisting?: boolean;
  mergeExisting?: "skip" | "keep-both" | "replace";
  operationId: string;
  abortTransfer?: () => void;
  revalidateSourceScope?: () => void | Promise<void>;
};

export type ResourceImportTreeResult = {
  changeType: "created" | "modified";
  resourceKey: string;
  resource: ResourceDescriptor;
  version?: ResourceVersion;
  bytesTransferred: number;
  filePath?: string;
};

export type ResourceImportTreeRecoveryOptions = {
  operationId: string;
  expectedTargetVersion: string;
};

export type ResourceImportTreeRecoveryResult = {
  outcome: "none" | "committed" | "rolled-back";
  version?: ResourceVersion;
};

export type ResourceTransferRequest = {
  source: ResourceRef;
  targetDirectory: ResourceRef;
  targetName: string;
  expectedTargetVersion?: string | null;
  replaceExisting?: boolean;
  mergeExisting?: "skip" | "keep-both" | "replace";
  signal?: AbortSignal;
  operationId: string;
};

export type ResourceTransferRecoveryRequest = {
  target: ResourceRef;
  operationId: string;
  expectedTargetVersion: ResourceVersion;
};

export type ResourceTransferResult = {
  target: ResourceRef;
  version: string;
  bytesTransferred: number;
};

export type SessionFileResolution = {
  ref: Extract<ResourceRef, { kind: "session-file" }>;
  entry: Record<string, any>;
  filePath: string;
  sourceRef?: ResourceRef;
  displayName?: string;
  storageKind?: string;
};

export type ResourceWatchTarget = {
  ref?: ResourceRef;
  filePath: string;
  isDirectory?: boolean;
  resourceKey: string;
  resource: ResourceDescriptor;
  toResource?: (changedPath: string) => {
    resourceKey: string;
    resource: ResourceDescriptor;
    filePath?: string;
  };
};

export type ResourceProvider = {
  id: ResourceProviderId;
  capabilities?: (ref: ResourceRef) => ResourceProviderCapabilities;
  getRootIdentity?: (
    ref: ResourceRef,
    context?: ResourceOperationContext,
  ) => Promise<ProviderRootIdentity>;
  watchTarget?: (ref: ResourceRef) => ResourceWatchTarget;
  stat?: (ref: ResourceRef) => Promise<ResourceStat>;
  read?: (ref: ResourceRef) => Promise<ResourceReadResult>;
  openRead?: (
    ref: ResourceRef,
    options?: ResourceOpenReadOptions,
  ) => Promise<ResourceOpenReadResult>;
  write?: (ref: ResourceRef, content: string | Buffer) => Promise<ResourceMutationResult>;
  writeExpectedVersion?: (ref: ResourceRef, content: string | Buffer, expectedVersion: ResourceVersion | null) => Promise<ResourceWriteExpectedVersionResult>;
  edit?: (ref: ResourceRef, edits: ResourceEdit[]) => Promise<ResourceMutationResult>;
  mkdir?: (ref: ResourceRef, options?: ResourceMutationPreconditions) => Promise<ResourceMutationResult>;
  delete?: (ref: ResourceRef, options?: ResourceMutationPreconditions) => Promise<ResourceMutationResult>;
  list?: (ref: ResourceRef) => Promise<ResourceListResult>;
  search?: (ref: ResourceRef, options?: Record<string, unknown>) => Promise<ResourceSearchResult>;
  materialize?: (ref: ResourceRef) => Promise<MaterializeResult>;
  copy?: (from: ResourceRef, to: ResourceRef, options?: ResourceMutationPreconditions) => Promise<ResourceMutationResult>;
  rename?: (
    from: ResourceRef,
    to: ResourceRef,
    options?: ResourceMovePreconditions,
  ) => Promise<ResourceMoveResult>;
  move?: (
    from: ResourceRef,
    to: ResourceRef,
    options?: ResourceMovePreconditions,
  ) => Promise<ResourceMoveResult>;
  trash?: (ref: ResourceRef, options?: ResourceTrashOptions) => Promise<ResourceTrashResult>;
  exportTree?: (ref: ResourceRef, options?: ResourceExportTreeOptions) => AsyncIterable<ResourceExportEntry>;
  importTreeAtomically?: (
    targetDirectory: ResourceRef,
    targetName: string,
    entries: AsyncIterable<ResourceExportEntry>,
    options: ResourceImportTreeOptions,
  ) => Promise<ResourceImportTreeResult>;
  recoverImportTreePublication?: (
    target: ResourceRef,
    options: ResourceImportTreeRecoveryOptions,
  ) => Promise<ResourceImportTreeRecoveryResult>;
};

export type ResourcePrincipal = {
  kind: "agent" | "plugin" | "api" | "watch" | "system";
  principalId?: string | null;
  scopes?: string[];
  userId?: string | null;
  studioId?: string | null;
  sessionId?: string | null;
  sessionPath?: string | null;
  pluginId?: string | null;
  connectionKind?: string | null;
  credentialKind?: string | null;
  requestId?: string | null;
};

export type ResourceOperationContext = {
  source?: ResourceEventSource;
  reason?: string;
  principal?: ResourcePrincipal;
  sessionId?: string | null;
  sessionPath?: string | null;
  requestId?: string | null;
  emit?: boolean;
  auditRead?: boolean;
  operationId?: string;
  expectedVersion?: ResourceVersion | null;
  expectedSourceVersion?: ResourceVersion;
  expectedTargetVersion?: ResourceVersion | null;
};

export type ResourceAuditOutcome = "allowed" | "denied" | "conflict";

export type ResourceAuditOperation = ResourceProviderCapability | "transfer";

export type ResourceAuditEvent = {
  type: "resource.audit";
  outcome: ResourceAuditOutcome;
  operation: ResourceAuditOperation;
  providerId?: ResourceProviderId;
  resourceKey?: string;
  resource?: ResourceDescriptor;
  principal?: ResourcePrincipal;
  reason?: string;
  code?: string;
  safeMessage?: string;
  sessionId?: string | null;
  sessionPath?: string | null;
  requestId?: string | null;
  operationId?: string;
  sequence: number;
  occurredAt: string;
};

export type ResourceAuditSink = {
  record(event: Omit<ResourceAuditEvent, "type" | "sequence" | "occurredAt">): ResourceAuditEvent | void;
};
