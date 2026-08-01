import {
  KNOWLEDGE_CONTRACT_ISSUE_METADATA,
  parseKnowledgeResourceAddress,
  parseKnowledgeSourceDto,
  type KnowledgeContractErrorCode,
  type KnowledgeResourceAddress,
  type KnowledgeSourceDto,
} from '../../../../shared/knowledge-workspace-contract.ts';
import {
  KNOWLEDGE_ERROR_METADATA,
  normalizeKnowledgeErrorCode,
  type KnowledgeErrorCode,
  type KnowledgeSafeErrorDetails,
} from '../../../../shared/knowledge-workspace-errors.ts';
import { isOperationCorrelationId } from '../../../../shared/knowledge-diagnostics.ts';
import { hanaFetch } from '../hooks/use-hana-fetch';

export interface KnowledgeWorkspaceResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type KnowledgeWorkspaceFetch = (
  path: string,
  options?: RequestInit & {
    timeout?: number;
    throwOnHttpError?: boolean;
  },
) => Promise<KnowledgeWorkspaceResponse>;

export interface KnowledgeWorkspaceClientOptions {
  fetchImpl?: KnowledgeWorkspaceFetch;
}

export interface KnowledgeWorkspaceRequestOptions {
  signal?: AbortSignal;
}

export interface RegisterKnowledgeSourceInput {
  sourceKey: string;
  displayName: string;
  mountId: string;
}

export type RendererResourceVersion = {
  mtimeMs?: number;
  size?: number | null;
  sha256?: string;
  etag?: string;
  sequence?: number;
};

export type RendererResourceReadResult = {
  content: string;
  encoding: 'utf-8' | 'base64';
  version?: RendererResourceVersion;
};

export type RendererResourceWriteResult =
  | {
      ok: true;
      changeType: 'created' | 'modified';
      version?: RendererResourceVersion;
    }
  | {
      ok: false;
      conflict: true;
      version?: RendererResourceVersion;
    };

export type RendererResourceStatResult = {
  exists: boolean;
  isDirectory: boolean;
  version?: RendererResourceVersion;
};

export type RendererResourceListItem = {
  name: string;
  isDirectory: boolean;
  size: number | null;
  mtimeMs: number;
};

export type RendererResourceListResult = {
  items: RendererResourceListItem[];
};

export type RendererResourceSearchMatch = {
  line: number;
  text: string;
  name?: string;
  relativePath?: string;
  parentSubdir?: string;
  isDirectory?: boolean;
  size?: number | null;
  mtimeMs?: number;
};

export type RendererResourceSearchResult = {
  matches: RendererResourceSearchMatch[];
};

export interface KnowledgeResourceClient {
  stat(
    address: KnowledgeResourceAddress,
    options?: KnowledgeWorkspaceRequestOptions,
  ): Promise<RendererResourceStatResult>;
  list(
    address: KnowledgeResourceAddress,
    options?: KnowledgeWorkspaceRequestOptions,
  ): Promise<RendererResourceListResult>;
  search(
    address: KnowledgeResourceAddress,
    query: string,
    options?: KnowledgeWorkspaceRequestOptions,
  ): Promise<RendererResourceSearchResult>;
  read(
    address: KnowledgeResourceAddress,
    options?: KnowledgeWorkspaceRequestOptions & {
      encoding?: 'utf-8' | 'base64';
    },
  ): Promise<RendererResourceReadResult>;
  writeExpectedVersion(
    address: KnowledgeResourceAddress,
    content: string,
    expectedVersion: RendererResourceVersion | null,
    options?: KnowledgeWorkspaceRequestOptions & {
      encoding?: 'utf-8' | 'base64';
    },
  ): Promise<RendererResourceWriteResult>;
  transfer(
    sourceAddress: KnowledgeResourceAddress,
    targetDirectoryAddress: KnowledgeResourceAddress,
    targetName: string,
    options: KnowledgeWorkspaceRequestOptions & {
      operationId: string;
      expectedTargetVersion?: string | null;
    },
  ): Promise<RendererResourceTransferResult>;
}

export type RendererResourceTransferResult = {
  ok: true;
  target: KnowledgeResourceAddress;
  version?: string;
  bytesTransferred: number;
};

export type RendererKnowledgeSearchScope = {
  kind: 'tag';
  sourceKey: string;
};

export type RendererKnowledgeSearchItem = {
  address: KnowledgeResourceAddress;
  title: string;
  kind:
    | 'page'
    | 'text'
    | 'image'
    | 'pdf'
    | 'audio'
    | 'video'
    | 'binary'
    | 'link'
    | 'unknown';
  score: number;
  snippets: Array<{
    field: 'title' | 'path' | 'metadata' | 'body';
    text: string;
  }>;
};

export type RendererKnowledgeSearchGroup =
  | {
      state: 'ready';
      sourceKey: string;
      displayName: string;
      generationId: string;
      items: RendererKnowledgeSearchItem[];
      nextCursor: string | null;
    }
  | {
      state: 'error';
      sourceKey: string;
      displayName: string;
      error: {
        code: KnowledgeErrorCode;
        httpStatus: number;
        retryable: boolean;
        details?: KnowledgeSafeErrorDetails;
      };
    };

export type RendererKnowledgeSearchResult = {
  query: string;
  scope: RendererKnowledgeSearchScope | null;
  groups: RendererKnowledgeSearchGroup[];
};

export type RendererKnowledgeBacklinkItem = {
  sourceAddress: KnowledgeResourceAddress;
  ordinal: number;
  linkKind: 'wikilink' | 'embed' | 'markdown' | 'content-ref';
  fragment: string | null;
  fromOffset: number;
  toOffset: number;
};

export type RendererKnowledgeBacklinksResult = {
  kind: 'backlinks';
  sourceKey: string;
  generationId: string;
  items: RendererKnowledgeBacklinkItem[];
  hasMore: boolean;
};

export type RendererKnowledgeEditorCopyInput = {
  sourceAddress: KnowledgeResourceAddress;
  pageAddress: KnowledgeResourceAddress;
  kind: 'page' | 'attachment';
  localDate?: string;
};

export type RendererKnowledgeEditorCopyResult = {
  copied: boolean;
  targetAddress: KnowledgeResourceAddress;
  bytesTransferred: number;
  embed: boolean;
  originalName: string;
};

export type RendererKnowledgeRenameOperationRequest = {
  kind: 'rename';
  from: KnowledgeResourceAddress;
  to: KnowledgeResourceAddress;
  expectedVersion: RendererResourceVersion;
};

export type RendererKnowledgeMoveOperationRequest = {
  kind: 'move';
  from: KnowledgeResourceAddress;
  to: KnowledgeResourceAddress;
  expectedVersion: RendererResourceVersion;
};

export type RendererKnowledgeOperationRequest =
  | RendererKnowledgeRenameOperationRequest
  | RendererKnowledgeMoveOperationRequest;

export type RendererKnowledgeOperationState =
  | 'PLANNED'
  | 'PREPARING'
  | 'PREPARED'
  | 'COMMITTING'
  | 'COMMITTED'
  | 'FINALIZED'
  | 'ROLLING_BACK'
  | 'ROLLED_BACK'
  | 'RECOVERY_REQUIRED'
  | 'FAILED_PERMANENTLY';

export type RendererKnowledgeOperationItemState =
  | 'pending'
  | 'prepared'
  | 'applying'
  | 'applied'
  | 'rolling-back'
  | 'rolled-back'
  | 'failed'
  | 'recovery-required';

export type RendererKnowledgeOperationProjectionState =
  | 'pending'
  | 'applied'
  | 'retrying';

export type RendererKnowledgeOperationPlan = {
  schemaVersion: 1;
  operationId: string;
  requestHash: string;
  kind: 'rename' | 'move';
  createdAt: string;
  expiresAt: string;
  checkpointRequired: true;
  items: Array<{
    from: KnowledgeResourceAddress;
    to: KnowledgeResourceAddress;
    expectedVersion: RendererResourceVersion;
  }>;
  preview: {
    resourceChanges: number;
    linkWrites: number;
  };
};

export type RendererKnowledgeOperationSummary = {
  schemaVersion: 1;
  operationId: string;
  requestHash: string;
  kind: 'rename' | 'move';
  state: RendererKnowledgeOperationState;
  createdAt?: string;
  expiresAt?: string;
  completedAt?: string;
  items: Array<{
    from: KnowledgeResourceAddress;
    to: KnowledgeResourceAddress;
    state: RendererKnowledgeOperationItemState;
    checkpointId?: string;
    errorCode?: string;
    rollbackStatus?: 'not-required' | 'rolled-back' | 'failed';
  }>;
  summary?: {
    succeeded: number;
    failed: number;
    rolledBack: number;
    recoveryRequired: number;
  };
  projections: {
    session: RendererKnowledgeOperationProjectionState;
    event: RendererKnowledgeOperationProjectionState;
    index: RendererKnowledgeOperationProjectionState;
  };
};

export interface KnowledgeOperationClient {
  plan(
    request: RendererKnowledgeOperationRequest,
    options?: KnowledgeWorkspaceRequestOptions,
  ): Promise<RendererKnowledgeOperationPlan>;
  commit(
    operationId: string,
    requestHash: string,
    options?: KnowledgeWorkspaceRequestOptions,
  ): Promise<RendererKnowledgeOperationSummary>;
  cancel(
    operationId: string,
    options?: KnowledgeWorkspaceRequestOptions,
  ): Promise<RendererKnowledgeOperationSummary>;
  get(
    operationId: string,
    options?: KnowledgeWorkspaceRequestOptions,
  ): Promise<RendererKnowledgeOperationSummary>;
}

export type KnowledgeResourceEventDescriptor =
  | { kind: 'mount'; mountId: string; path: string; isDirectory?: boolean }
  | { kind: 'resource'; resourceId: string; isDirectory?: boolean };

type KnowledgeResourceEventBase = {
  sequence: number;
  occurredAt: string;
  source: string;
  operationId?: string;
};

export type KnowledgeResourceEvent =
  | (KnowledgeResourceEventBase & {
      type: 'resource.changed';
      changeType: 'created' | 'modified';
      resource: KnowledgeResourceEventDescriptor;
      version?: RendererResourceVersion;
    })
  | (KnowledgeResourceEventBase & {
      type: 'resource.deleted';
      resource: KnowledgeResourceEventDescriptor;
    })
  | (KnowledgeResourceEventBase & {
      type: 'resource.renamed';
      oldResource: KnowledgeResourceEventDescriptor;
      newResource: KnowledgeResourceEventDescriptor;
    });

export type KnowledgeResourceEventCatchUp =
  | {
      stale: true;
      latestSequence: number;
      events: [];
      resync: 'resource-stat-required';
    }
  | {
      stale: false;
      latestSequence: number;
      events: KnowledgeResourceEvent[];
    };

export interface KnowledgeWorkspaceClient {
  resources: KnowledgeResourceClient;
  operations: KnowledgeOperationClient;
  copyForEditor(
    input: RendererKnowledgeEditorCopyInput,
    options?: KnowledgeWorkspaceRequestOptions,
  ): Promise<RendererKnowledgeEditorCopyResult>;
  copyExternalForEditor(
    file: File,
    input: {
      pageAddress: KnowledgeResourceAddress;
      localDate: string;
    },
    options?: KnowledgeWorkspaceRequestOptions,
  ): Promise<RendererKnowledgeEditorCopyResult>;
  createResource(input: { kind: 'page' | 'folder'; sourceKey: string; directoryPath: string; name: string }, options?: KnowledgeWorkspaceRequestOptions): Promise<{ kind: 'page' | 'folder'; address: KnowledgeResourceAddress }>;
  pasteResources(input: { intent: 'copy' | 'cut'; items: readonly KnowledgeResourceAddress[]; target: { sourceKey: string; directoryPath: string } }, options?: KnowledgeWorkspaceRequestOptions): Promise<Array<Record<string, unknown>>>;
  trashResources(addresses: readonly KnowledgeResourceAddress[], options?: KnowledgeWorkspaceRequestOptions): Promise<{ batchId: string; sourceKey: string; items: Array<Record<string, unknown>> }>;
  listTrash(sourceKey: string, options?: KnowledgeWorkspaceRequestOptions): Promise<Array<Record<string, unknown>>>;
  restoreTrash(sourceKey: string, batchId: string, entryIds?: readonly string[], options?: KnowledgeWorkspaceRequestOptions): Promise<Array<Record<string, unknown>>>;
  createNativeGrant(action: 'openDefault' | 'reveal' | 'systemTrash', address: KnowledgeResourceAddress, options?: KnowledgeWorkspaceRequestOptions): Promise<{ grantId: string; expiresAt: number }>;
  listSources(options?: KnowledgeWorkspaceRequestOptions): Promise<KnowledgeSourceDto[]>;
  registerSource(
    input: RegisterKnowledgeSourceInput,
    options?: KnowledgeWorkspaceRequestOptions,
  ): Promise<KnowledgeSourceDto>;
  removeSource(
    sourceKey: string,
    options?: KnowledgeWorkspaceRequestOptions,
  ): Promise<void>;
  searchKnowledge(
    input: {
      query: string;
      limit?: number;
      cursors?: Record<string, string>;
      scope?: RendererKnowledgeSearchScope;
    },
    options?: KnowledgeWorkspaceRequestOptions,
  ): Promise<RendererKnowledgeSearchResult>;
  querySavedBacklinks(
    input: {
      address: KnowledgeResourceAddress;
      generationId?: string;
      limit?: number;
    },
    options?: KnowledgeWorkspaceRequestOptions,
  ): Promise<RendererKnowledgeBacklinksResult>;
  applyResourceEvent(
    event: unknown,
    handlers?: KnowledgeResourceEventHandlers,
  ): Promise<void>;
  catchUpResourceEvents(
    handlers?: KnowledgeResourceEventHandlers,
    options?: KnowledgeWorkspaceRequestOptions,
  ): Promise<KnowledgeResourceEventCatchUp>;
  lastResourceEventSequence(): number;
}

export type KnowledgeResourceEventHandlers = {
  applyEvent?: (event: KnowledgeResourceEvent) => Promise<void> | void;
  recoverFromGap?: () => Promise<void> | void;
};

export type KnowledgeWorkspaceClientErrorCode =
  | KnowledgeErrorCode
  | KnowledgeContractErrorCode;

export class KnowledgeWorkspaceClientError extends Error {
  readonly code: KnowledgeWorkspaceClientErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly details?: KnowledgeSafeErrorDetails;

  constructor(input: {
    code: KnowledgeWorkspaceClientErrorCode;
    httpStatus: number;
    retryable: boolean;
    details?: KnowledgeSafeErrorDetails;
  }) {
    super(input.code);
    this.name = 'KnowledgeWorkspaceClientError';
    this.code = input.code;
    this.httpStatus = input.httpStatus;
    this.retryable = input.retryable;
    this.details = input.details;
  }
}

export function createKnowledgeWorkspaceClient({
  fetchImpl = hanaFetch,
}: KnowledgeWorkspaceClientOptions = {}): KnowledgeWorkspaceClient {
  let lastResourceEventSequence = 0;

  const commitResourceEvent = (event: unknown): void => {
    const sequence = parseResourceEventCursor(event);
    if (sequence !== null && sequence > lastResourceEventSequence) {
      lastResourceEventSequence = sequence;
    }
  };

  const catchUpResourceEvents = async (
    handlers: KnowledgeResourceEventHandlers = {},
    options: KnowledgeWorkspaceRequestOptions = {},
  ): Promise<KnowledgeResourceEventCatchUp> => {
    const body = await requestJson(
      fetchImpl,
      `/api/resource-io/events?since=${lastResourceEventSequence}`,
      {
        method: 'GET',
        signal: options.signal,
      },
    );
    const catchUp = parseResourceEventCatchUp(body);
    if (catchUp.stale === true) {
      await requireGapRecovery(handlers.recoverFromGap);
      lastResourceEventSequence = catchUp.latestSequence;
      return catchUp;
    }
    if (!isContiguousCatchUp(catchUp, lastResourceEventSequence)) {
      await requireGapRecovery(handlers.recoverFromGap);
      lastResourceEventSequence = catchUp.latestSequence;
      return {
        stale: true,
        latestSequence: catchUp.latestSequence,
        events: [],
        resync: 'resource-stat-required',
      };
    }
    for (const event of catchUp.events) {
      if (event.sequence <= lastResourceEventSequence) continue;
      try {
        await handlers.applyEvent?.(event);
      } catch (error) {
        await requireGapRecovery(handlers.recoverFromGap);
        throw error;
      }
      commitResourceEvent(event);
    }
    lastResourceEventSequence = Math.max(
      lastResourceEventSequence,
      catchUp.latestSequence,
    );
    return catchUp;
  };

  const applyResourceEvent = async (
    input: unknown,
    handlers: KnowledgeResourceEventHandlers = {},
  ): Promise<void> => {
    const resyncSequence = parseResourceResyncEvent(input);
    if (resyncSequence !== null) {
      if (resyncSequence <= lastResourceEventSequence) return;
      await requireGapRecovery(handlers.recoverFromGap);
      lastResourceEventSequence = resyncSequence;
      return;
    }
    if (!isValidInternalResourceEvent(input)) {
      throw invalidResponse('event');
    }
    const sequence = parseResourceEventBase(input)!.sequence;
    if (sequence <= lastResourceEventSequence) return;
    if (sequence !== lastResourceEventSequence + 1) {
      await catchUpResourceEvents(handlers);
      if (sequence <= lastResourceEventSequence) return;
      if (sequence !== lastResourceEventSequence + 1) {
        await requireGapRecovery(handlers.recoverFromGap);
        lastResourceEventSequence = sequence;
        return;
      }
    }
    const event = parseResourceEvent(input);
    if (!event) {
      await requireGapRecovery(handlers.recoverFromGap);
      lastResourceEventSequence = sequence;
      return;
    }
    try {
      await handlers.applyEvent?.(event);
    } catch (error) {
      await requireGapRecovery(handlers.recoverFromGap);
      throw error;
    }
    lastResourceEventSequence = sequence;
  };

  const resources: KnowledgeResourceClient = {
    async stat(address, options = {}) {
      const safeAddress = validateKnowledgeAddress(address);
      const body = await requestJson(fetchImpl, '/api/resource-io/stat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: safeAddress }),
        signal: options.signal,
      });
      return parseResourceStatResult(body);
    },
    async list(address, options = {}) {
      const safeAddress = validateKnowledgeListAddress(address);
      const body = await requestJson(fetchImpl, '/api/resource-io/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: safeAddress }),
        signal: options.signal,
      });
      return parseResourceListResult(body);
    },
    async search(address, query, options = {}) {
      const safeAddress = validateKnowledgeAddress(address);
      if (
        typeof query !== 'string'
        || query.length === 0
        || query.length > 10_000
        || /\p{Cc}/u.test(query)
      ) {
        throw invalidResponse('query');
      }
      const body = await requestJson(fetchImpl, '/api/resource-io/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: safeAddress, query }),
        signal: options.signal,
      });
      return parseResourceSearchResult(body);
    },
    async read(address, options = {}) {
      const safeAddress = validateKnowledgeAddress(address);
      const body = await requestJson(fetchImpl, '/api/resource-io/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: safeAddress,
          encoding: options.encoding ?? 'utf-8',
        }),
        signal: options.signal,
      });
      return parseResourceReadResult(body);
    },
    async writeExpectedVersion(address, content, expectedVersion, options = {}) {
      const safeAddress = validateKnowledgeAddress(address);
      if (typeof content !== 'string') throw invalidResponse('content');
      const safeExpectedVersion = expectedVersion === null
        ? null
        : parseResourceVersion(expectedVersion);
      if (
        safeExpectedVersion !== null
        && (!safeExpectedVersion || Object.keys(safeExpectedVersion).length === 0)
      ) {
        throw invalidResponse('expectedVersion');
      }
      const body = await requestJson(
        fetchImpl,
        '/api/resource-io/write-expected-version',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: safeAddress,
            content,
            encoding: options.encoding ?? 'utf-8',
            expectedVersion: safeExpectedVersion,
          }),
          signal: options.signal,
        },
        (status, responseBody) => (
          status === 409
          && isRecord(responseBody)
          && responseBody.ok === false
          && responseBody.conflict === true
        ),
      );
      return parseResourceWriteResult(body);
    },
    async transfer(
      sourceAddress,
      targetDirectoryAddress,
      targetName,
      options,
    ) {
      const safeSourceAddress = validateKnowledgeAddress(sourceAddress);
      const safeTargetDirectoryAddress = validateKnowledgeAddress(
        targetDirectoryAddress,
      );
      if (
        typeof targetName !== 'string'
        || targetName.length === 0
        || targetName === '.'
        || targetName === '..'
        || targetName.includes('/')
        || targetName.includes('\\')
        || /\p{Cc}/u.test(targetName)
      ) {
        throw invalidResponse('targetName');
      }
      if (!isOperationCorrelationId(options?.operationId)) {
        throw invalidResponse('operationId');
      }
      if (
        options.expectedTargetVersion !== undefined
        && options.expectedTargetVersion !== null
        && (
          typeof options.expectedTargetVersion !== 'string'
          || options.expectedTargetVersion.length === 0
        )
      ) {
        throw invalidResponse('expectedTargetVersion');
      }
      const body = await requestJson(
        fetchImpl,
        '/api/resource-io/transfer',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceAddress: safeSourceAddress,
            targetDirectoryAddress: safeTargetDirectoryAddress,
            targetName,
            operationId: options.operationId,
            ...(options.expectedTargetVersion !== undefined
              ? { expectedTargetVersion: options.expectedTargetVersion }
              : {}),
          }),
          signal: options.signal,
        },
      );
      return parseResourceTransferResult(body);
    },
  };

  const operations: KnowledgeOperationClient = {
    async plan(request, options = {}) {
      const safeRequest = validateKnowledgeOperationRequest(request);
      const body = await requestJson(
        fetchImpl,
        '/api/knowledge-workspace/operations/plan',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(safeRequest),
          signal: options.signal,
        },
      );
      return parseKnowledgeOperationPlanEnvelope(body);
    },
    async commit(operationId, requestHash, options = {}) {
      validateOperationId(operationId);
      validateRequestHash(requestHash);
      const body = await requestJson(
        fetchImpl,
        `/api/knowledge-workspace/operations/${encodeURIComponent(operationId)}/commit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestHash }),
          signal: options.signal,
        },
      );
      return parseKnowledgeOperationEnvelope(body, 'result');
    },
    async cancel(operationId, options = {}) {
      validateOperationId(operationId);
      const body = await requestJson(
        fetchImpl,
        `/api/knowledge-workspace/operations/${encodeURIComponent(operationId)}/cancel`,
        {
          method: 'POST',
          signal: options.signal,
        },
      );
      return parseKnowledgeOperationEnvelope(body, 'result');
    },
    async get(operationId, options = {}) {
      validateOperationId(operationId);
      const body = await requestJson(
        fetchImpl,
        `/api/knowledge-workspace/operations/${encodeURIComponent(operationId)}`,
        {
          method: 'GET',
          signal: options.signal,
        },
      );
      return parseKnowledgeOperationEnvelope(body, 'operation');
    },
  };

  return {
    resources,
    operations,
    async copyForEditor(input, options = {}) {
      const sourceAddress = validateKnowledgeAddress(input?.sourceAddress);
      const pageAddress = validateKnowledgeAddress(input?.pageAddress);
      if (input?.kind !== 'page' && input?.kind !== 'attachment') {
        throw invalidResponse('kind');
      }
      if (
        input.kind === 'attachment'
        && (
          typeof input.localDate !== 'string'
          || !/^\d{4}-\d{2}-\d{2}$/u.test(input.localDate)
        )
      ) {
        throw invalidResponse('localDate');
      }
      const body = await requestJson(
        fetchImpl,
        '/api/knowledge-workspace/copy-for-editor',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceAddress,
            pageAddress,
            kind: input.kind,
            ...(input.localDate ? { localDate: input.localDate } : {}),
          }),
          signal: options.signal,
        },
      );
      const result = parseKnowledgeEditorCopyEnvelope(body);
      if (result.targetAddress.sourceKey !== pageAddress.sourceKey) {
        throw invalidResponse('targetAddress.sourceKey');
      }
      return result;
    },
    async copyExternalForEditor(file, input, options = {}) {
      if (
        typeof file !== 'object'
        || file === null
        || typeof file.name !== 'string'
        || file.name.length > 255
        || file.name.includes('/')
        || file.name.includes('\\')
        || /\p{Cc}/u.test(file.name)
        || typeof file.size !== 'number'
        || !Number.isSafeInteger(file.size)
        || file.size < 0
        || typeof file.type !== 'string'
        || file.type.length > 255
        || /\p{Cc}/u.test(file.type)
      ) {
        throw invalidResponse('file');
      }
      const pageAddress = validateKnowledgeAddress(input?.pageAddress);
      if (
        typeof input?.localDate !== 'string'
        || !/^\d{4}-\d{2}-\d{2}$/u.test(input.localDate)
      ) {
        throw invalidResponse('localDate');
      }
      const metadata = encodeKnowledgeCopyMetadata({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        pageAddress,
        localDate: input.localDate,
      });
      if (metadata.length > 8192) throw invalidResponse('file');
      const body = await requestJson(
        fetchImpl,
        '/api/knowledge-workspace/copy-external-for-editor',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Hanako-Knowledge-Copy': metadata,
          },
          body: file,
          signal: options.signal,
        },
      );
      const result = parseKnowledgeEditorCopyEnvelope(body);
      if (result.targetAddress.sourceKey !== pageAddress.sourceKey) {
        throw invalidResponse('targetAddress.sourceKey');
      }
      return result;
    },
    async createResource(input, options = {}) {
      const body = await requestJson(fetchImpl, '/api/knowledge-workspace/resources/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: options.signal,
      });
      if (!isRecord(body) || !isRecord(body.result) || !['page', 'folder'].includes(String(body.result.kind))) throw invalidResponse('create.result');
      return { kind: body.result.kind as 'page' | 'folder', address: validateKnowledgeAddress(body.result.address as KnowledgeResourceAddress) };
    },
    async pasteResources(input, options = {}) {
      const body = await requestJson(fetchImpl, '/api/knowledge-workspace/resources/paste', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: options.signal,
      });
      if (!isRecord(body) || !Array.isArray(body.results) || body.results.some(item => !isRecord(item))) throw invalidResponse('paste.results');
      return body.results;
    },
    async trashResources(addresses, options = {}) {
      const body = await requestJson(fetchImpl, '/api/knowledge-workspace/trash', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ addresses }), signal: options.signal,
      });
      if (!isRecord(body) || !isRecord(body.result) || typeof body.result.batchId !== 'string' || typeof body.result.sourceKey !== 'string' || !Array.isArray(body.result.items)) throw invalidResponse('trash.result');
      return { batchId: body.result.batchId, sourceKey: body.result.sourceKey, items: body.result.items.filter(isRecord) };
    },
    async listTrash(sourceKey, options = {}) {
      validateSourceKey(sourceKey);
      const body = await requestJson(fetchImpl, `/api/knowledge-workspace/trash/${encodeURIComponent(sourceKey)}`, { method: 'GET', signal: options.signal });
      if (!isRecord(body) || !Array.isArray(body.batches) || body.batches.some(batch => !isRecord(batch))) throw invalidResponse('trash.batches');
      return body.batches;
    },
    async restoreTrash(sourceKey, batchId, entryIds, options = {}) {
      validateSourceKey(sourceKey);
      if (!/^[0-9a-f-]{36}$/iu.test(batchId)) throw invalidResponse('trash.batchId');
      const body = await requestJson(fetchImpl, `/api/knowledge-workspace/trash/${encodeURIComponent(sourceKey)}/${encodeURIComponent(batchId)}/restore`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(entryIds ? { entryIds } : {}) }), signal: options.signal,
      });
      if (!isRecord(body) || !Array.isArray(body.results) || body.results.some(result => !isRecord(result))) throw invalidResponse('trash.restore');
      return body.results;
    },
    async createNativeGrant(action, address, options = {}) {
      const body = await requestJson(fetchImpl, '/api/knowledge-workspace/native/grants', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, address: validateKnowledgeAddress(address) }), signal: options.signal,
      });
      if (!isRecord(body) || !isRecord(body.grant) || typeof body.grant.grantId !== 'string' || typeof body.grant.expiresAt !== 'number') throw invalidResponse('native.grant');
      return { grantId: body.grant.grantId, expiresAt: body.grant.expiresAt };
    },
    async searchKnowledge(input, options = {}) {
      validateKnowledgeSearchInput(input);
      const body = await requestJson(
        fetchImpl,
        '/api/knowledge-workspace/search',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
          signal: options.signal,
        },
      );
      return parseKnowledgeSearchEnvelope(body);
    },
    async querySavedBacklinks(input, options = {}) {
      const address = validateKnowledgeAddress(input?.address);
      if (
        input.generationId !== undefined
        && (
          typeof input.generationId !== 'string'
          || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(input.generationId)
        )
      ) {
        throw invalidResponse('query.generationId');
      }
      if (
        input.limit !== undefined
        && (
          !Number.isSafeInteger(input.limit)
          || Number(input.limit) < 1
          || Number(input.limit) > 100
        )
      ) {
        throw invalidResponse('query.limit');
      }
      const body = await requestJson(
        fetchImpl,
        '/api/knowledge-workspace/query',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'backlinks',
            address,
            ...(input.generationId === undefined
              ? {}
              : { generationId: input.generationId }),
            ...(input.limit === undefined ? {} : { limit: input.limit }),
          }),
          signal: options.signal,
        },
      );
      return parseKnowledgeBacklinksEnvelope(body, address.sourceKey);
    },
    async listSources(options = {}) {
      const body = await requestJson(fetchImpl, '/api/knowledge-workspace/sources', {
        method: 'GET',
        signal: options.signal,
      });
      if (!isRecord(body) || !Array.isArray(body.sources)) {
        throw invalidResponse('sources');
      }
      const sources = body.sources;
      return sources.map((source: unknown) => {
        return validatedSourceDto(source);
      });
    },
    async registerSource(input, options = {}) {
      validateRegisterSourceInput(input);
      const body = await requestJson(fetchImpl, '/api/knowledge-workspace/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceKey: input.sourceKey,
          displayName: input.displayName,
          mountId: input.mountId,
        }),
        signal: options.signal,
      });
      return validatedSourceDto(isRecord(body) ? body.source : undefined);
    },
    async removeSource(sourceKey, options = {}) {
      validateSourceKey(sourceKey);
      const body = await requestJson(
        fetchImpl,
        `/api/knowledge-workspace/sources/${encodeURIComponent(sourceKey)}`,
        {
          method: 'DELETE',
          signal: options.signal,
        },
      );
      if (
        !isRecord(body)
        || body.ok !== true
        || body.sourceKey !== sourceKey
      ) {
        throw invalidResponse('removeSource');
      }
    },
    applyResourceEvent,
    catchUpResourceEvents,
    lastResourceEventSequence: () => lastResourceEventSequence,
  };
}

function validateKnowledgeSearchInput(input: unknown): void {
  if (
    !isRecord(input)
    || typeof input.query !== 'string'
    || Array.from(input.query).length === 0
    || Array.from(input.query).length > 512
    || /\p{Cc}/u.test(input.query)
    || (
      input.limit !== undefined
      && (
        !Number.isSafeInteger(input.limit)
        || Number(input.limit) < 1
        || Number(input.limit) > 100
      )
    )
    || (
      input.cursors !== undefined
      && (
        !isRecord(input.cursors)
        || Object.values(input.cursors).some((cursor) =>
          typeof cursor !== 'string'
          || cursor.length === 0
          || cursor.length > 4096
        )
      )
    )
    || (
      input.scope !== undefined
      && (
        !isRecord(input.scope)
        || input.scope.kind !== 'tag'
        || typeof input.scope.sourceKey !== 'string'
      )
    )
  ) {
    throw invalidResponse('search');
  }
}

function parseKnowledgeSearchEnvelope(
  input: unknown,
): RendererKnowledgeSearchResult {
  if (
    !isRecord(input)
    || Object.keys(input).length !== 1
    || !isRecord(input.result)
    || typeof input.result.query !== 'string'
    || !Array.isArray(input.result.groups)
  ) {
    throw invalidResponse('search.result');
  }
  const scope = input.result.scope === null
    ? null
    : parseKnowledgeSearchScope(input.result.scope);
  return {
    query: input.result.query,
    scope,
    groups: input.result.groups.map(parseKnowledgeSearchGroup),
  };
}

function parseKnowledgeSearchScope(
  input: unknown,
): RendererKnowledgeSearchScope {
  if (
    !isRecord(input)
    || input.kind !== 'tag'
    || typeof input.sourceKey !== 'string'
  ) {
    throw invalidResponse('search.scope');
  }
  return { kind: 'tag', sourceKey: input.sourceKey };
}

function parseKnowledgeSearchGroup(
  input: unknown,
): RendererKnowledgeSearchGroup {
  if (
    !isRecord(input)
    || typeof input.sourceKey !== 'string'
    || typeof input.displayName !== 'string'
  ) {
    throw invalidResponse('search.group');
  }
  if (input.state === 'error') {
    if (!isRecord(input.error)) throw invalidResponse('search.error');
    const code = normalizeKnowledgeErrorCode(input.error.code);
    if (
      !code
      || !Number.isSafeInteger(input.error.httpStatus)
      || typeof input.error.retryable !== 'boolean'
    ) {
      throw invalidResponse('search.error');
    }
    return {
      state: 'error',
      sourceKey: input.sourceKey,
      displayName: input.displayName,
      error: {
        code,
        httpStatus: input.error.httpStatus as number,
        retryable: input.error.retryable,
        ...(safeDetails(input.error.details)
          ? { details: safeDetails(input.error.details) }
          : {}),
      },
    };
  }
  if (
    input.state !== 'ready'
    || typeof input.generationId !== 'string'
    || !Array.isArray(input.items)
    || (
      input.nextCursor !== null
      && typeof input.nextCursor !== 'string'
    )
  ) {
    throw invalidResponse('search.group');
  }
  return {
    state: 'ready',
    sourceKey: input.sourceKey,
    displayName: input.displayName,
    generationId: input.generationId,
    items: input.items.map((item) =>
      parseKnowledgeSearchItem(item, input.sourceKey as string)
    ),
    nextCursor: input.nextCursor as string | null,
  };
}

function parseKnowledgeSearchItem(
  input: unknown,
  sourceKey: string,
): RendererKnowledgeSearchItem {
  const kinds = new Set([
    'page',
    'text',
    'image',
    'pdf',
    'audio',
    'video',
    'binary',
    'link',
    'unknown',
  ]);
  if (
    !isRecord(input)
    || typeof input.title !== 'string'
    || !kinds.has(String(input.kind))
    || typeof input.score !== 'number'
    || !Number.isFinite(input.score)
    || !Array.isArray(input.snippets)
    || input.snippets.length > 3
  ) {
    throw invalidResponse('search.item');
  }
  const parsedAddress = parseKnowledgeResourceAddress(input.address);
  if (
    parsedAddress.ok === false
    || parsedAddress.value.sourceKey !== sourceKey
  ) {
    throw invalidResponse('search.address');
  }
  const fields = new Set(['title', 'path', 'metadata', 'body']);
  const snippets = input.snippets.map((snippet) => {
    if (
      !isRecord(snippet)
      || !fields.has(String(snippet.field))
      || typeof snippet.text !== 'string'
      || Array.from(snippet.text).length > 240
    ) {
      throw invalidResponse('search.snippet');
    }
    return {
      field: snippet.field as RendererKnowledgeSearchItem['snippets'][number]['field'],
      text: snippet.text,
    };
  });
  return {
    address: parsedAddress.value,
    title: input.title,
    kind: input.kind as RendererKnowledgeSearchItem['kind'],
    score: input.score,
    snippets,
  };
}

function parseKnowledgeBacklinksEnvelope(
  input: unknown,
  expectedSourceKey: string,
): RendererKnowledgeBacklinksResult {
  if (
    !isRecord(input)
    || Object.keys(input).length !== 1
    || !isRecord(input.result)
  ) {
    throw invalidResponse('query.result');
  }
  const result = input.result;
  rejectResponseFields(
    result,
    new Set([
      'kind',
      'sourceKey',
      'generationId',
      'items',
      'hasMore',
    ]),
    'query.result',
  );
  if (
    result.kind !== 'backlinks'
    || result.sourceKey !== expectedSourceKey
    || typeof result.generationId !== 'string'
    || result.generationId.length === 0
    || !Array.isArray(result.items)
    || typeof result.hasMore !== 'boolean'
  ) {
    throw invalidResponse('query.result');
  }
  return {
    kind: 'backlinks',
    sourceKey: expectedSourceKey,
    generationId: result.generationId,
    items: result.items.map((item, index) =>
      parseKnowledgeBacklinkItem(item, expectedSourceKey, index)
    ),
    hasMore: result.hasMore,
  };
}

function parseKnowledgeBacklinkItem(
  input: unknown,
  expectedSourceKey: string,
  index: number,
): RendererKnowledgeBacklinkItem {
  const field = `query.items.${index}`;
  if (!isRecord(input)) throw invalidResponse(field);
  rejectResponseFields(
    input,
    new Set([
      'sourceAddress',
      'ordinal',
      'linkKind',
      'fragment',
      'fromOffset',
      'toOffset',
    ]),
    field,
  );
  const address = parseKnowledgeResourceAddress(input.sourceAddress);
  if (
    address.ok === false
    || address.value.sourceKey !== expectedSourceKey
    || !Number.isSafeInteger(input.ordinal)
    || Number(input.ordinal) < 0
    || !['wikilink', 'embed', 'markdown', 'content-ref'].includes(
      String(input.linkKind),
    )
    || (
      input.fragment !== null
      && typeof input.fragment !== 'string'
    )
    || !Number.isSafeInteger(input.fromOffset)
    || Number(input.fromOffset) < 0
    || !Number.isSafeInteger(input.toOffset)
    || Number(input.toOffset) < Number(input.fromOffset)
  ) {
    throw invalidResponse(field);
  }
  return {
    sourceAddress: address.value,
    ordinal: input.ordinal as number,
    linkKind: input.linkKind as RendererKnowledgeBacklinkItem['linkKind'],
    fragment: input.fragment as string | null,
    fromOffset: input.fromOffset as number,
    toOffset: input.toOffset as number,
  };
}

function parseKnowledgeEditorCopyEnvelope(
  input: unknown,
): RendererKnowledgeEditorCopyResult {
  if (
    !isRecord(input)
    || Object.keys(input).length !== 1
    || !isRecord(input.result)
  ) {
    throw invalidResponse('result');
  }
  const result = input.result;
  const allowed = new Set([
    'copied',
    'targetAddress',
    'bytesTransferred',
    'embed',
    'originalName',
  ]);
  if (
    Object.keys(result).some(field => !allowed.has(field))
    || typeof result.copied !== 'boolean'
    || typeof result.embed !== 'boolean'
    || !Number.isSafeInteger(result.bytesTransferred)
    || (result.bytesTransferred as number) < 0
    || typeof result.originalName !== 'string'
    || result.originalName.length === 0
    || result.originalName.includes('/')
    || result.originalName.includes('\\')
    || /\p{Cc}/u.test(result.originalName)
  ) {
    throw invalidResponse('result');
  }
  const targetAddress = parseKnowledgeResourceAddress(result.targetAddress);
  if (
    targetAddress.ok === false
    || targetAddress.value.relativePath.length === 0
  ) {
    throw invalidResponse('targetAddress');
  }
  return {
    copied: result.copied,
    targetAddress: targetAddress.value,
    bytesTransferred: result.bytesTransferred as number,
    embed: result.embed,
    originalName: result.originalName,
  };
}

function encodeKnowledgeCopyMetadata(input: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary)
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '');
}

export const knowledgeWorkspaceClient = createKnowledgeWorkspaceClient();

async function requestJson(
  fetchImpl: KnowledgeWorkspaceFetch,
  path: string,
  options: RequestInit,
  acceptErrorResponse: (
    status: number,
    body: unknown,
  ) => boolean = () => false,
): Promise<unknown> {
  let response: KnowledgeWorkspaceResponse;
  try {
    response = await fetchImpl(path, {
      ...options,
      throwOnHttpError: false,
    });
  } catch (error) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? error;
    }
    if (isAbortError(error)) throw error;
    if (error instanceof KnowledgeWorkspaceClientError) throw error;
    throw new KnowledgeWorkspaceClientError(
      KNOWLEDGE_ERROR_METADATA.knowledge_resource_unavailable,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? error;
    }
    if (isAbortError(error)) throw error;
    body = null;
  }
  if (!response.ok && !acceptErrorResponse(response.status, body)) {
    throw clientErrorFromResponse(response.status, body);
  }
  return body;
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === 'AbortError';
}

function validatedSourceDto(input: unknown): KnowledgeSourceDto {
  const parsed = parseKnowledgeSourceDto(input);
  if (parsed.ok === false) {
    throw new KnowledgeWorkspaceClientError(parsed.error);
  }
  return parsed.value;
}

function validateRegisterSourceInput(input: RegisterKnowledgeSourceInput): void {
  const parsed = parseKnowledgeSourceDto({
    sourceKey: input?.sourceKey,
    displayName: input?.displayName,
    role: 'mounted',
    capabilities: [],
    availability: 'available',
  });
  if (parsed.ok === false) throw new KnowledgeWorkspaceClientError(parsed.error);
  if (
    typeof input.mountId !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(input.mountId)
  ) {
    throw new KnowledgeWorkspaceClientError({
      code: 'knowledge_operation_precondition_failed',
      httpStatus: 412,
      retryable: false,
      details: { field: 'mountId' },
    });
  }
}

function validateSourceKey(sourceKey: string): void {
  const parsed = parseKnowledgeSourceDto({
    sourceKey,
    displayName: 'Source',
    role: sourceKey === 'main' ? 'main' : 'mounted',
    capabilities: [],
    availability: 'available',
  });
  if (parsed.ok === false) throw new KnowledgeWorkspaceClientError(parsed.error);
}

function validateKnowledgeAddress(input: KnowledgeResourceAddress): KnowledgeResourceAddress {
  const parsed = parseKnowledgeResourceAddress(input);
  if (parsed.ok === false) throw new KnowledgeWorkspaceClientError(parsed.error);
  return parsed.value;
}

function validateKnowledgeListAddress(
  input: KnowledgeResourceAddress,
): KnowledgeResourceAddress {
  if (input?.relativePath !== '') return validateKnowledgeAddress(input);
  validateSourceKey(input.sourceKey);
  return { sourceKey: input.sourceKey, relativePath: '' };
}

function parseResourceReadResult(input: unknown): RendererResourceReadResult {
  if (
    !isRecord(input)
    || typeof input.content !== 'string'
    || (input.encoding !== 'utf-8' && input.encoding !== 'base64')
  ) {
    throw invalidResponse('content');
  }
  const version = parseResourceVersion(input.version);
  return {
    content: input.content,
    encoding: input.encoding,
    ...(version ? { version } : {}),
  };
}

function parseResourceStatResult(input: unknown): RendererResourceStatResult {
  if (
    !isRecord(input)
    || typeof input.exists !== 'boolean'
    || typeof input.isDirectory !== 'boolean'
  ) {
    throw invalidResponse('stat');
  }
  const version = parseResourceVersion(input.version);
  return {
    exists: input.exists,
    isDirectory: input.isDirectory,
    ...(version ? { version } : {}),
  };
}

function parseResourceListResult(input: unknown): RendererResourceListResult {
  if (!isRecord(input) || !Array.isArray(input.items)) {
    throw invalidResponse('items');
  }
  return {
    items: input.items.map((item, index) => parseResourceListItem(item, index)),
  };
}

function parseResourceListItem(input: unknown, index: number): RendererResourceListItem {
  const size = isRecord(input) ? input.size : undefined;
  const mtimeMs = isRecord(input) ? input.mtimeMs : undefined;
  if (
    !isRecord(input)
    || typeof input.name !== 'string'
    || input.name.length === 0
    || input.name === '.'
    || input.name === '..'
    || input.name.includes('/')
    || /\p{Cc}/u.test(input.name)
    || typeof input.isDirectory !== 'boolean'
    || (size !== null && !isNonNegativeSafeInteger(size))
    || !isNonNegativeFiniteNumber(mtimeMs)
  ) {
    throw invalidResponse(`items.${index}`);
  }
  const safeSize: number | null = size === null ? null : Number(size);
  return {
    name: input.name,
    isDirectory: input.isDirectory,
    size: safeSize,
    mtimeMs,
  };
}

function parseResourceSearchResult(input: unknown): RendererResourceSearchResult {
  if (!isRecord(input) || !Array.isArray(input.matches)) {
    throw invalidResponse('matches');
  }
  return {
    matches: input.matches.map((match, index) => parseResourceSearchMatch(match, index)),
  };
}

function parseResourceSearchMatch(input: unknown, index: number): RendererResourceSearchMatch {
  if (
    !isRecord(input)
    || !isNonNegativeSafeInteger(input.line)
    || typeof input.text !== 'string'
    || input.text.length > 1_048_576
  ) {
    throw invalidResponse(`matches.${index}`);
  }
  const match: RendererResourceSearchMatch = {
    line: input.line,
    text: input.text,
  };
  if (input.name !== undefined) {
    if (
      typeof input.name !== 'string'
      || input.name.length === 0
      || input.name.includes('/')
      || /\p{Cc}/u.test(input.name)
    ) {
      throw invalidResponse(`matches.${index}.name`);
    }
    match.name = input.name;
  }
  for (const key of ['relativePath', 'parentSubdir'] as const) {
    const value = input[key];
    if (value === undefined) continue;
    const parsed = parseKnowledgeResourceAddress({
      sourceKey: 'validation',
      relativePath: value,
    });
    if (!parsed.ok) throw invalidResponse(`matches.${index}.${key}`);
    match[key] = parsed.value.relativePath;
  }
  if (input.isDirectory !== undefined) {
    if (typeof input.isDirectory !== 'boolean') {
      throw invalidResponse(`matches.${index}.isDirectory`);
    }
    match.isDirectory = input.isDirectory;
  }
  if (input.size !== undefined) {
    const size = input.size;
    if (size !== null && !isNonNegativeSafeInteger(size)) {
      throw invalidResponse(`matches.${index}.size`);
    }
    match.size = size === null ? null : Number(size);
  }
  if (input.mtimeMs !== undefined) {
    if (!isNonNegativeFiniteNumber(input.mtimeMs)) {
      throw invalidResponse(`matches.${index}.mtimeMs`);
    }
    match.mtimeMs = input.mtimeMs;
  }
  return match;
}

function parseResourceWriteResult(input: unknown): RendererResourceWriteResult {
  if (!isRecord(input)) throw invalidResponse('result');
  const version = parseResourceVersion(input.version);
  if (input.conflict === true && input.ok === false) {
    return {
      ok: false,
      conflict: true,
      ...(version ? { version } : {}),
    };
  }
  if (input.ok === false || input.conflict !== undefined) {
    throw invalidResponse('result');
  }
  if (input.changeType !== 'created' && input.changeType !== 'modified') {
    throw invalidResponse('changeType');
  }
  return {
    ok: true,
    changeType: input.changeType,
    ...(version ? { version } : {}),
  };
}

function parseResourceTransferResult(input: unknown): RendererResourceTransferResult {
  if (
    !isRecord(input)
    || input.ok !== true
    || !isNonNegativeSafeInteger(input.bytesTransferred)
  ) {
    throw invalidResponse('transfer');
  }
  const target = validateKnowledgeAddress(input.target as KnowledgeResourceAddress);
  if (
    input.version !== undefined
    && (typeof input.version !== 'string' || input.version.length === 0)
  ) {
    throw invalidResponse('transfer.version');
  }
  return {
    ok: true,
    target,
    ...(typeof input.version === 'string' ? { version: input.version } : {}),
    bytesTransferred: input.bytesTransferred,
  };
}

const OPERATION_STATES = new Set<RendererKnowledgeOperationState>([
  'PLANNED',
  'PREPARING',
  'PREPARED',
  'COMMITTING',
  'COMMITTED',
  'FINALIZED',
  'ROLLING_BACK',
  'ROLLED_BACK',
  'RECOVERY_REQUIRED',
  'FAILED_PERMANENTLY',
]);
const OPERATION_ITEM_STATES = new Set<RendererKnowledgeOperationItemState>([
  'pending',
  'prepared',
  'applying',
  'applied',
  'rolling-back',
  'rolled-back',
  'failed',
  'recovery-required',
]);
const OPERATION_PROJECTION_STATES =
  new Set<RendererKnowledgeOperationProjectionState>([
    'pending',
    'applied',
    'retrying',
  ]);
const OPERATION_ROLLBACK_STATUSES = new Set([
  'not-required',
  'rolled-back',
  'failed',
]);
const OPERATION_HASH_PATTERN = /^[a-f0-9]{64}$/;

function validateKnowledgeOperationRequest(
  input: RendererKnowledgeOperationRequest,
): RendererKnowledgeOperationRequest {
  if (!isRecord(input) || (input.kind !== 'rename' && input.kind !== 'move')) {
    throw invalidResponse('operation.kind');
  }
  rejectResponseFields(
    input,
    new Set(['kind', 'from', 'to', 'expectedVersion']),
    'operation',
  );
  const from = validateKnowledgeAddress(input.from);
  const to = validateKnowledgeAddress(input.to);
  if (
    from.sourceKey !== to.sourceKey
    || from.relativePath === to.relativePath
  ) {
    throw invalidResponse('operation.to');
  }
  const expectedVersion = parseResourceVersion(input.expectedVersion);
  if (!expectedVersion || Object.keys(expectedVersion).length === 0) {
    throw invalidResponse('operation.expectedVersion');
  }
  rejectResponseFields(
    input.expectedVersion,
    new Set(['mtimeMs', 'size', 'sha256', 'etag', 'sequence']),
    'operation.expectedVersion',
  );
  return {
    kind: input.kind,
    from,
    to,
    expectedVersion,
  };
}

function parseKnowledgeOperationPlanEnvelope(
  input: unknown,
): RendererKnowledgeOperationPlan {
  if (!isRecord(input)) throw invalidResponse('plan');
  rejectResponseFields(input, new Set(['plan']), 'plan');
  const plan = input.plan;
  if (!isRecord(plan)) throw invalidResponse('plan');
  rejectResponseFields(
    plan,
    new Set([
      'schemaVersion',
      'operationId',
      'requestHash',
      'kind',
      'createdAt',
      'expiresAt',
      'checkpointRequired',
      'items',
      'preview',
    ]),
    'plan',
  );
  validateOperationIdentity(plan);
  if (
    plan.checkpointRequired !== true
    || !isIsoTimestampValue(plan.createdAt)
    || !isIsoTimestampValue(plan.expiresAt)
    || Date.parse(plan.expiresAt) - Date.parse(plan.createdAt) !== 15 * 60 * 1_000
    || !Array.isArray(plan.items)
    || plan.items.length !== 1
    || !isRecord(plan.preview)
  ) {
    throw invalidResponse('plan');
  }
  rejectResponseFields(
    plan.preview,
    new Set(['resourceChanges', 'linkWrites']),
    'plan.preview',
  );
  if (
    !isNonNegativeSafeInteger(plan.preview.resourceChanges)
    || plan.preview.resourceChanges !== plan.items.length
    || !isNonNegativeSafeInteger(plan.preview.linkWrites)
  ) {
    throw invalidResponse('plan.preview');
  }
  const items = plan.items.map((item, index) =>
    parseKnowledgeOperationPlanItem(item, index)
  );
  return {
    schemaVersion: 1,
    operationId: plan.operationId as string,
    requestHash: plan.requestHash as string,
    kind: plan.kind as RendererKnowledgeOperationPlan['kind'],
    createdAt: plan.createdAt as string,
    expiresAt: plan.expiresAt as string,
    checkpointRequired: true,
    items,
    preview: {
      resourceChanges: plan.preview.resourceChanges,
      linkWrites: plan.preview.linkWrites,
    },
  };
}

function parseKnowledgeOperationPlanItem(
  input: unknown,
  index: number,
): RendererKnowledgeOperationPlan['items'][number] {
  if (!isRecord(input)) throw invalidResponse(`plan.items.${index}`);
  rejectResponseFields(
    input,
    new Set(['from', 'to', 'expectedVersion']),
    `plan.items.${index}`,
  );
  const expectedVersion = parseResourceVersion(input.expectedVersion);
  if (!expectedVersion || Object.keys(expectedVersion).length === 0) {
    throw invalidResponse(`plan.items.${index}.expectedVersion`);
  }
  rejectResponseFields(
    input.expectedVersion as Record<string, unknown>,
    new Set(['mtimeMs', 'size', 'sha256', 'etag', 'sequence']),
    `plan.items.${index}.expectedVersion`,
  );
  return {
    from: validateKnowledgeAddress(input.from as KnowledgeResourceAddress),
    to: validateKnowledgeAddress(input.to as KnowledgeResourceAddress),
    expectedVersion,
  };
}

function parseKnowledgeOperationEnvelope(
  input: unknown,
  field: 'result' | 'operation',
): RendererKnowledgeOperationSummary {
  if (!isRecord(input)) throw invalidResponse(field);
  rejectResponseFields(input, new Set([field]), field);
  return parseKnowledgeOperationSummary(input[field], field);
}

function parseKnowledgeOperationSummary(
  input: unknown,
  field: string,
): RendererKnowledgeOperationSummary {
  if (!isRecord(input)) throw invalidResponse(field);
  rejectResponseFields(
    input,
    new Set([
      'schemaVersion',
      'operationId',
      'requestHash',
      'kind',
      'state',
      'createdAt',
      'expiresAt',
      'completedAt',
      'items',
      'summary',
      'projections',
    ]),
    field,
  );
  validateOperationIdentity(input);
  if (
    typeof input.state !== 'string'
    || !OPERATION_STATES.has(input.state as RendererKnowledgeOperationState)
    || !Array.isArray(input.items)
    || input.items.length === 0
    || !isRecord(input.projections)
  ) {
    throw invalidResponse(field);
  }
  for (const timestamp of ['createdAt', 'expiresAt', 'completedAt'] as const) {
    if (
      input[timestamp] !== undefined
      && !isIsoTimestampValue(input[timestamp])
    ) {
      throw invalidResponse(`${field}.${timestamp}`);
    }
  }
  rejectResponseFields(
    input.projections,
    new Set(['session', 'event', 'index']),
    `${field}.projections`,
  );
  const projections = {
    session: parseProjectionState(input.projections.session, field),
    event: parseProjectionState(input.projections.event, field),
    index: parseProjectionState(input.projections.index, field),
  };
  const items = input.items.map((item, index) =>
    parseKnowledgeOperationSummaryItem(item, field, index)
  );
  const summary = input.summary === undefined
    ? undefined
    : parseKnowledgeOperationResultSummary(input.summary, field, items.length);
  if ((input.completedAt === undefined) !== (summary === undefined)) {
    throw invalidResponse(`${field}.summary`);
  }
  return {
    schemaVersion: 1,
    operationId: input.operationId as string,
    requestHash: input.requestHash as string,
    kind: input.kind as RendererKnowledgeOperationSummary['kind'],
    state: input.state as RendererKnowledgeOperationState,
    ...(typeof input.createdAt === 'string' ? { createdAt: input.createdAt } : {}),
    ...(typeof input.expiresAt === 'string' ? { expiresAt: input.expiresAt } : {}),
    ...(typeof input.completedAt === 'string'
      ? { completedAt: input.completedAt }
      : {}),
    items,
    ...(summary ? { summary } : {}),
    projections,
  };
}

function parseKnowledgeOperationSummaryItem(
  input: unknown,
  field: string,
  index: number,
): RendererKnowledgeOperationSummary['items'][number] {
  if (!isRecord(input)) throw invalidResponse(`${field}.items.${index}`);
  rejectResponseFields(
    input,
    new Set([
      'itemId',
      'from',
      'to',
      'expectedVersion',
      'state',
      'checkpointId',
      'appliedVersion',
      'errorCode',
      'rollbackStatus',
      'steps',
    ]),
    `${field}.items.${index}`,
  );
  if (
    typeof input.state !== 'string'
    || !OPERATION_ITEM_STATES.has(
      input.state as RendererKnowledgeOperationItemState,
    )
  ) {
    throw invalidResponse(`${field}.items.${index}.state`);
  }
  for (const key of ['itemId', 'checkpointId', 'errorCode'] as const) {
    if (
      input[key] !== undefined
      && (typeof input[key] !== 'string' || input[key].length === 0)
    ) {
      throw invalidResponse(`${field}.items.${index}.${key}`);
    }
  }
  if (
    input.rollbackStatus !== undefined
    && (
      typeof input.rollbackStatus !== 'string'
      || !OPERATION_ROLLBACK_STATUSES.has(input.rollbackStatus)
    )
  ) {
    throw invalidResponse(`${field}.items.${index}.rollbackStatus`);
  }
  for (const key of ['expectedVersion', 'appliedVersion'] as const) {
    if (input[key] !== undefined) {
      const version = parseResourceVersion(input[key]);
      if (!version || Object.keys(version).length === 0) {
        throw invalidResponse(`${field}.items.${index}.${key}`);
      }
      rejectResponseFields(
        input[key] as Record<string, unknown>,
        new Set(['mtimeMs', 'size', 'sha256', 'etag', 'sequence']),
        `${field}.items.${index}.${key}`,
      );
    }
  }
  if (input.steps !== undefined) {
    if (!Array.isArray(input.steps)) {
      throw invalidResponse(`${field}.items.${index}.steps`);
    }
    input.steps.forEach((step, stepIndex) =>
      validateKnowledgeOperationStep(step, field, index, stepIndex)
    );
  }
  return {
    from: validateKnowledgeAddress(input.from as KnowledgeResourceAddress),
    to: validateKnowledgeAddress(input.to as KnowledgeResourceAddress),
    state: input.state as RendererKnowledgeOperationItemState,
    ...(typeof input.checkpointId === 'string'
      ? { checkpointId: input.checkpointId }
      : {}),
    ...(typeof input.errorCode === 'string'
      ? { errorCode: input.errorCode }
      : {}),
    ...(typeof input.rollbackStatus === 'string'
      ? {
          rollbackStatus: input.rollbackStatus as
            | 'not-required'
            | 'rolled-back'
            | 'failed',
        }
      : {}),
  };
}

function validateKnowledgeOperationStep(
  input: unknown,
  field: string,
  itemIndex: number,
  stepIndex: number,
): void {
  const stepField = `${field}.items.${itemIndex}.steps.${stepIndex}`;
  if (!isRecord(input)) throw invalidResponse(stepField);
  rejectResponseFields(
    input,
    new Set(['stepId', 'kind', 'state', 'intentAt', 'outcomeAt', 'errorCode']),
    stepField,
  );
  if (
    typeof input.stepId !== 'string'
    || !['checkpoint', 'primary-rename', 'link-write'].includes(
      String(input.kind),
    )
    || !['intent', 'applied', 'rolled-back', 'failed'].includes(
      String(input.state),
    )
    || !isIsoTimestampValue(input.intentAt)
    || (
      input.outcomeAt !== undefined
      && !isIsoTimestampValue(input.outcomeAt)
    )
    || (
      input.errorCode !== undefined
      && (typeof input.errorCode !== 'string' || input.errorCode.length === 0)
    )
  ) {
    throw invalidResponse(stepField);
  }
}

function parseKnowledgeOperationResultSummary(
  input: unknown,
  field: string,
  itemCount: number,
): NonNullable<RendererKnowledgeOperationSummary['summary']> {
  if (!isRecord(input)) throw invalidResponse(`${field}.summary`);
  rejectResponseFields(
    input,
    new Set(['succeeded', 'failed', 'rolledBack', 'recoveryRequired']),
    `${field}.summary`,
  );
  if (
    !isNonNegativeSafeInteger(input.succeeded)
    || !isNonNegativeSafeInteger(input.failed)
    || !isNonNegativeSafeInteger(input.rolledBack)
    || !isNonNegativeSafeInteger(input.recoveryRequired)
    || input.succeeded + input.failed !== itemCount
    || input.rolledBack > input.failed
    || input.recoveryRequired > input.failed
  ) {
    throw invalidResponse(`${field}.summary`);
  }
  return {
    succeeded: input.succeeded,
    failed: input.failed,
    rolledBack: input.rolledBack,
    recoveryRequired: input.recoveryRequired,
  };
}

function parseProjectionState(
  input: unknown,
  field: string,
): RendererKnowledgeOperationProjectionState {
  if (
    typeof input !== 'string'
    || !OPERATION_PROJECTION_STATES.has(
      input as RendererKnowledgeOperationProjectionState,
    )
  ) {
    throw invalidResponse(`${field}.projections`);
  }
  return input as RendererKnowledgeOperationProjectionState;
}

function validateOperationIdentity(input: Record<string, unknown>): void {
  if (
    input.schemaVersion !== 1
    || (input.kind !== 'rename' && input.kind !== 'move')
    || !isOperationCorrelationId(input.operationId)
    || typeof input.requestHash !== 'string'
    || !OPERATION_HASH_PATTERN.test(input.requestHash)
  ) {
    throw invalidResponse('operation.identity');
  }
}

function validateOperationId(input: unknown): asserts input is string {
  if (!isOperationCorrelationId(input)) throw invalidResponse('operationId');
}

function validateRequestHash(input: unknown): asserts input is string {
  if (typeof input !== 'string' || !OPERATION_HASH_PATTERN.test(input)) {
    throw invalidResponse('requestHash');
  }
}

function isIsoTimestampValue(input: unknown): input is string {
  return typeof input === 'string' && isIsoTimestamp(input);
}

function rejectResponseFields(
  input: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  field: string,
): void {
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw invalidResponse(field);
  }
}

function parseResourceVersion(input: unknown): RendererResourceVersion | undefined {
  if (input === undefined) return undefined;
  if (!isRecord(input)) throw invalidResponse('version');
  const version: RendererResourceVersion = {};
  if (input.mtimeMs !== undefined) {
    if (!isNonNegativeFiniteNumber(input.mtimeMs)) {
      throw invalidResponse('version.mtimeMs');
    }
    version.mtimeMs = input.mtimeMs;
  }
  if (input.sequence !== undefined) {
    if (!isNonNegativeSafeInteger(input.sequence)) {
      throw invalidResponse('version.sequence');
    }
    version.sequence = input.sequence;
  }
  if (input.size !== undefined) {
    const size = input.size;
    if (
      size !== null
      && !isNonNegativeSafeInteger(size)
    ) {
      throw invalidResponse('version.size');
    }
    version.size = size === null ? null : Number(size);
  }
  for (const key of ['sha256', 'etag'] as const) {
    const value = input[key];
    if (value !== undefined) {
      if (typeof value !== 'string' || value.length > 512) {
        throw invalidResponse(`version.${key}`);
      }
      version[key] = value;
    }
  }
  return version;
}

function parseResourceEventCatchUp(input: unknown): KnowledgeResourceEventCatchUp {
  if (!isRecord(input) || !isNonNegativeSafeInteger(input.latestSequence)) {
    throw invalidResponse('latestSequence');
  }
  if (input.stale === true) {
    if (
      !Array.isArray(input.events)
      || input.events.length !== 0
      || input.resync !== 'resource-stat-required'
    ) {
      throw invalidResponse('events');
    }
    return {
      stale: true,
      latestSequence: input.latestSequence,
      events: [],
      resync: 'resource-stat-required',
    };
  }
  if (input.stale !== false || !Array.isArray(input.events)) {
    throw invalidResponse('stale');
  }
  const events: KnowledgeResourceEvent[] = [];
  for (const event of input.events) {
    if (!isValidInternalResourceEvent(event)) throw invalidResponse('events');
    const parsed = parseResourceEvent(event);
    if (!parsed) {
      return {
        stale: true,
        latestSequence: input.latestSequence,
        events: [],
        resync: 'resource-stat-required',
      };
    }
    events.push(parsed);
  }
  return {
    stale: false,
    latestSequence: input.latestSequence,
    events,
  };
}

function parseResourceEvent(input: unknown): KnowledgeResourceEvent | null {
  const base = parseResourceEventBase(input);
  if (!base || !isRecord(input)) return null;
  if (input.type === 'resource.changed') {
    const resource = parseResourceEventDescriptor(input.resource);
    if (
      !resource
      || (input.changeType !== 'created' && input.changeType !== 'modified')
    ) {
      return null;
    }
    let version: RendererResourceVersion | undefined;
    try {
      version = parseResourceVersion(input.version);
    } catch {
      return null;
    }
    return {
      ...base,
      type: 'resource.changed',
      changeType: input.changeType,
      resource,
      ...(version ? { version } : {}),
    };
  }
  if (input.type === 'resource.deleted') {
    const resource = parseResourceEventDescriptor(input.resource);
    return resource
      ? { ...base, type: 'resource.deleted', resource }
      : null;
  }
  if (input.type === 'resource.renamed') {
    const oldResource = parseResourceEventDescriptor(input.oldResource);
    const newResource = parseResourceEventDescriptor(input.newResource);
    return oldResource && newResource
      ? {
          ...base,
          type: 'resource.renamed',
          oldResource,
          newResource,
        }
      : null;
  }
  return null;
}

function parseResourceEventCursor(input: unknown): number | null {
  const base = parseResourceEventBase(input);
  if (base && isValidInternalResourceEvent(input)) {
    return base.sequence;
  }
  return parseResourceResyncEvent(input);
}

const RESOURCE_EVENT_SOURCES = new Set([
  'agent_tool',
  'provider_watch',
  'api',
  'plugin',
  'bash_reconcile',
  'mount',
  'session_file',
  'unknown',
]);

const RESOURCE_CHANGED_EVENT_FIELDS = new Set([
  'type',
  'changeType',
  'resourceKey',
  'resource',
  'version',
  'source',
  'reason',
  'sessionPath',
  'sequence',
  'occurredAt',
  'operationId',
]);

const RESOURCE_DELETED_EVENT_FIELDS = new Set([
  'type',
  'resourceKey',
  'resource',
  'source',
  'sessionPath',
  'sequence',
  'occurredAt',
  'operationId',
]);

const RESOURCE_RENAMED_EVENT_FIELDS = new Set([
  'type',
  'oldResourceKey',
  'newResourceKey',
  'oldResource',
  'newResource',
  'source',
  'sessionPath',
  'sequence',
  'occurredAt',
  'operationId',
]);

const RESOURCE_RESYNC_EVENT_FIELDS = new Set([
  'type',
  'studioId',
  'stale',
  'resync',
  'source',
  'sourceId',
  'sequence',
  'occurredAt',
  'operationId',
]);

const INTERNAL_RESOURCE_DESCRIPTOR_FIELDS = new Set([
  'kind',
  'path',
  'mountId',
  'resourceId',
  'fileId',
  'sessionId',
  'sessionPath',
  'url',
  'provider',
  'filePath',
  'displayName',
  'isDirectory',
]);

function isValidInternalResourceEvent(input: unknown): boolean {
  if (!isRecord(input) || !parseResourceEventBase(input)) return false;
  if (input.type === 'resource.changed') {
    return hasOnlyFields(input, RESOURCE_CHANGED_EVENT_FIELDS)
      && (input.changeType === 'created' || input.changeType === 'modified')
      && isNonEmptyString(input.resourceKey)
      && isValidInternalResourceDescriptor(input.resource)
      && isOptionalResourceVersion(input.version)
      && isOptionalBoundedString(input.reason, 128)
      && isOptionalString(input.sessionPath);
  }
  if (input.type === 'resource.deleted') {
    return hasOnlyFields(input, RESOURCE_DELETED_EVENT_FIELDS)
      && isNonEmptyString(input.resourceKey)
      && isValidInternalResourceDescriptor(input.resource)
      && isOptionalString(input.sessionPath);
  }
  if (input.type === 'resource.renamed') {
    return hasOnlyFields(input, RESOURCE_RENAMED_EVENT_FIELDS)
      && isNonEmptyString(input.oldResourceKey)
      && isNonEmptyString(input.newResourceKey)
      && isValidInternalResourceDescriptor(input.oldResource)
      && isValidInternalResourceDescriptor(input.newResource)
      && isOptionalString(input.sessionPath);
  }
  return false;
}

function parseResourceResyncEvent(input: unknown): number | null {
  if (
    !isRecord(input)
    || !hasOnlyFields(input, RESOURCE_RESYNC_EVENT_FIELDS)
    || input.type !== 'resource.resync_required'
    || input.stale !== true
    || input.resync !== 'resource-stat-required'
    || !parseResourceEventBase(input)
    || !isOptionalSafeStudioId(input.studioId)
    || !isOptionalOperationCorrelationId(input.sourceId)
  ) {
    return null;
  }
  return input.sequence as number;
}

function isOptionalSafeStudioId(value: unknown): boolean {
  return value === undefined
    || (
      typeof value === 'string'
      && value.length > 0
      && value.length <= 256
      && !value.includes('/')
      && !/[\\\p{Cc}]/u.test(value)
    );
}

function isOptionalOperationCorrelationId(value: unknown): boolean {
  return value === undefined
    || (
      typeof value === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    );
}

function isValidInternalResourceDescriptor(input: unknown): boolean {
  if (!isRecord(input) || !hasOnlyFields(input, INTERNAL_RESOURCE_DESCRIPTOR_FIELDS)) {
    return false;
  }
  if (
    !isOptionalBoundedString(input.provider, 64)
    || !isOptionalString(input.filePath)
    || !isOptionalBoundedString(input.displayName, 512)
    || (input.isDirectory !== undefined && typeof input.isDirectory !== 'boolean')
  ) {
    return false;
  }
  if (input.kind === 'local-file') return typeof input.path === 'string';
  if (input.kind === 'mount') {
    return isNonEmptyString(input.mountId) && typeof input.path === 'string';
  }
  if (input.kind === 'resource') return isNonEmptyString(input.resourceId);
  if (input.kind === 'session-file') {
    return isNonEmptyString(input.fileId)
      && isOptionalString(input.sessionId)
      && isOptionalString(input.sessionPath);
  }
  if (input.kind === 'url') return isNonEmptyString(input.url);
  return false;
}

function isOptionalResourceVersion(input: unknown): boolean {
  if (input === undefined) return true;
  try {
    parseResourceVersion(input);
    return true;
  } catch {
    return false;
  }
}

function hasOnlyFields(
  input: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  return Object.keys(input).every((field) => allowed.has(field));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isOptionalBoundedString(value: unknown, maxLength: number): boolean {
  return value === undefined
    || (typeof value === 'string' && value.length <= maxLength);
}

function parseResourceEventBase(input: unknown): KnowledgeResourceEventBase | null {
  if (
    !isRecord(input)
    || !isNonNegativeSafeInteger(input.sequence)
    || typeof input.occurredAt !== 'string'
    || !isIsoTimestamp(input.occurredAt)
    || typeof input.source !== 'string'
    || !RESOURCE_EVENT_SOURCES.has(input.source)
  ) {
    return null;
  }
  const base: KnowledgeResourceEventBase = {
    sequence: input.sequence,
    occurredAt: input.occurredAt,
    source: input.source,
  };
  if (input.operationId !== undefined) {
    if (
      typeof input.operationId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.operationId)
    ) {
      return null;
    }
    base.operationId = input.operationId;
  }
  return base;
}

function parseResourceEventDescriptor(input: unknown): KnowledgeResourceEventDescriptor | null {
  if (!isRecord(input)) return null;
  let descriptor: KnowledgeResourceEventDescriptor;
  if (input.kind === 'resource') {
    if (
      typeof input.resourceId !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(input.resourceId)
    ) {
      return null;
    }
    descriptor = { kind: 'resource', resourceId: input.resourceId };
  } else if (input.kind === 'mount') {
    if (
      typeof input.mountId !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(input.mountId)
      || typeof input.path !== 'string'
    ) {
      return null;
    }
    const parsedPath = parseKnowledgeResourceAddress({
      sourceKey: 'validation',
      relativePath: input.path,
    });
    if (parsedPath.ok === false) return null;
    descriptor = {
      kind: 'mount',
      mountId: input.mountId,
      path: parsedPath.value.relativePath,
    };
  } else {
    return null;
  }
  if (input.isDirectory !== undefined) {
    if (typeof input.isDirectory !== 'boolean') return null;
    descriptor.isDirectory = input.isDirectory;
  }
  return descriptor;
}

function isIsoTimestamp(value: string): boolean {
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function isContiguousCatchUp(
  catchUp: Extract<KnowledgeResourceEventCatchUp, { stale: false }>,
  cursor: number,
): boolean {
  let expected = cursor + 1;
  for (const event of catchUp.events) {
    if (event.sequence !== expected) return false;
    expected += 1;
  }
  return catchUp.latestSequence === expected - 1;
}

async function requireGapRecovery(
  recoverFromGap: (() => Promise<void> | void) | undefined,
): Promise<void> {
  if (!recoverFromGap) throw invalidResponse('recoverFromGap');
  await recoverFromGap();
}

function invalidResponse(field: string): KnowledgeWorkspaceClientError {
  return new KnowledgeWorkspaceClientError({
    code: 'knowledge_operation_precondition_failed',
    httpStatus: 412,
    retryable: false,
    details: { field },
  });
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function clientErrorFromResponse(status: number, body: unknown): KnowledgeWorkspaceClientError {
  const record = isRecord(body) ? body : {};
  const rawCode = typeof record.code === 'string' ? record.code : record.error;
  const normalizedCode = normalizeKnowledgeErrorCode(rawCode);
  if (normalizedCode) {
    const metadata = KNOWLEDGE_ERROR_METADATA[normalizedCode];
    return new KnowledgeWorkspaceClientError({
      ...metadata,
      details: safeDetails(record.details),
    });
  }
  const contractCode = typeof record.code === 'string'
    && Object.prototype.hasOwnProperty.call(KNOWLEDGE_CONTRACT_ISSUE_METADATA, record.code)
    ? record.code as keyof typeof KNOWLEDGE_CONTRACT_ISSUE_METADATA
    : null;
  if (contractCode) {
    return new KnowledgeWorkspaceClientError(KNOWLEDGE_CONTRACT_ISSUE_METADATA[contractCode]);
  }
  const code: KnowledgeErrorCode = status === 401
    || status === 403
    || rawCode === 'insufficient_scope'
    ? 'knowledge_resource_out_of_scope'
    : status === 404
      ? 'knowledge_resource_not_found'
      : status === 409
        ? 'knowledge_resource_conflict'
        : status >= 500
          ? 'knowledge_resource_unavailable'
          : 'knowledge_operation_precondition_failed';
  return new KnowledgeWorkspaceClientError(KNOWLEDGE_ERROR_METADATA[code]);
}

function safeDetails(value: unknown): KnowledgeSafeErrorDetails | undefined {
  if (!isRecord(value)) return undefined;
  const details: {
    field?: string;
    capability?: string;
    limit?: number;
    actual?: number;
    state?: string;
  } = {};
  for (const key of ['field', 'capability', 'state'] as const) {
    const item = value[key];
    if (typeof item === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(item)) {
      details[key] = item;
    }
  }
  for (const key of ['limit', 'actual'] as const) {
    const item = value[key];
    if (typeof item === 'number' && Number.isFinite(item) && item >= 0) {
      details[key] = item;
    }
  }
  return Object.keys(details).length > 0 ? details : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
