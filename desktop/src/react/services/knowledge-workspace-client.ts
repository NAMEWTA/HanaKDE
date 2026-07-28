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
    expectedVersion: RendererResourceVersion,
    options?: KnowledgeWorkspaceRequestOptions & {
      encoding?: 'utf-8' | 'base64';
    },
  ): Promise<RendererResourceWriteResult>;
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
  listSources(options?: KnowledgeWorkspaceRequestOptions): Promise<KnowledgeSourceDto[]>;
  registerSource(
    input: RegisterKnowledgeSourceInput,
    options?: KnowledgeWorkspaceRequestOptions,
  ): Promise<KnowledgeSourceDto>;
  removeSource(
    sourceKey: string,
    options?: KnowledgeWorkspaceRequestOptions,
  ): Promise<void>;
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
      const safeAddress = validateKnowledgeAddress(address);
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
      const safeExpectedVersion = parseResourceVersion(expectedVersion);
      if (!safeExpectedVersion || Object.keys(safeExpectedVersion).length === 0) {
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
  };

  return {
    resources,
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
    || !isOptionalOperationCorrelationId(input.sourceId)
  ) {
    return null;
  }
  return input.sequence as number;
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
