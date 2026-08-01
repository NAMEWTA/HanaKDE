import {
  type KnowledgeResourceAddress,
  type KnowledgeSourceDto,
} from '../../shared/knowledge-workspace-contract.ts';
import {
  createKnowledgeWorkspaceError,
} from '../../shared/knowledge-workspace-errors.ts';
import type {
  ResourceMutationResult,
  ResourceOperationContext,
  ResourceRef,
  ResourceStat,
  ResourceWriteExpectedVersionResult,
} from '../../lib/resource-io/types.ts';

export type KnowledgeCreateRequest = Readonly<{
  kind: 'page' | 'folder';
  sourceKey: string;
  directoryPath: string;
  name: string;
}>;

export type KnowledgeCreateResult = Readonly<{
  kind: KnowledgeCreateRequest['kind'];
  address: KnowledgeResourceAddress;
  version?: ResourceMutationResult['version'];
}>;

type SourceRegistrySurface = {
  get(sourceKey: string): KnowledgeSourceDto | null;
  revalidate(sourceKey: string): Promise<void>;
  resolveAddress(address: KnowledgeResourceAddress): Promise<ResourceRef>;
};

type ResourceIoSurface = {
  stat(ref: ResourceRef, context?: ResourceOperationContext): Promise<ResourceStat>;
  writeExpectedVersion(
    ref: ResourceRef,
    content: string | Buffer,
    expectedVersion: null,
    context?: ResourceOperationContext,
  ): Promise<ResourceWriteExpectedVersionResult>;
  mkdir(
    ref: ResourceRef,
    context?: ResourceOperationContext & { expectedVersion?: null },
  ): Promise<ResourceMutationResult>;
};

export class KnowledgeCreateService {
  readonly #sourceRegistry: SourceRegistrySurface;
  readonly #resourceIO: ResourceIoSurface;

  constructor(input: {
    sourceRegistry: SourceRegistrySurface;
    resourceIO: ResourceIoSurface;
  }) {
    this.#sourceRegistry = input.sourceRegistry;
    this.#resourceIO = input.resourceIO;
  }

  async create(
    input: KnowledgeCreateRequest,
    context: ResourceOperationContext & { signal?: AbortSignal } = {},
  ): Promise<KnowledgeCreateResult> {
    throwIfAborted(context.signal);
    const request = validateCreateRequest(input);
    await this.#sourceRegistry.revalidate(request.sourceKey);
    const source = this.#sourceRegistry.get(request.sourceKey);
    requireWritableSource(source, request.kind);
    const relativePath = joinPath(
      request.directoryPath,
      request.kind === 'page' && !request.name.toLocaleLowerCase().endsWith('.md')
        ? `${request.name}.md`
        : request.name,
    );
    const address = Object.freeze({ sourceKey: request.sourceKey, relativePath });
    const ref = await this.#sourceRegistry.resolveAddress(address);
    throwIfAborted(context.signal);
    const prior = await this.#resourceIO.stat(ref, context);
    if (prior.exists) throw conflict();
    try {
      const result = request.kind === 'page'
        ? await this.#resourceIO.writeExpectedVersion(ref, '', null, context)
        : await this.#resourceIO.mkdir(ref, { ...context, expectedVersion: null });
      if ('conflict' in result && result.conflict) throw conflict();
      return Object.freeze({
        kind: request.kind,
        address,
        ...(result.version ? { version: Object.freeze({ ...result.version }) } : {}),
      });
    } catch (error) {
      if (isConflict(error)) throw conflict();
      throw error;
    }
  }
}

function validateCreateRequest(input: KnowledgeCreateRequest): KnowledgeCreateRequest {
  if (
    !input
    || typeof input !== 'object'
    || !['page', 'folder'].includes(input.kind)
    || !/^[a-z][a-z0-9-]{0,31}$/u.test(input.sourceKey)
    || !isDirectoryPath(input.directoryPath)
    || !isResourceName(input.name)
  ) {
    throw createKnowledgeWorkspaceError(
      'knowledge_operation_precondition_failed',
      'knowledge create request is invalid',
    );
  }
  return Object.freeze({ ...input, name: input.name.trim() });
}

function isDirectoryPath(value: unknown): value is string {
  return typeof value === 'string' && (
    value === ''
    || (!value.startsWith('/')
      && !value.endsWith('/')
      && value.split('/').every(segment => isResourceName(segment)))
  );
}

function isResourceName(value: unknown): value is string {
  return typeof value === 'string'
    && value === value.trim()
    && value.length > 0
    && value.length <= 255
    && value !== '.'
    && value !== '..'
    && value !== '.trash'
    && !/[\\/\p{Cc}]/u.test(value);
}

function requireWritableSource(
  source: KnowledgeSourceDto | null,
  kind: KnowledgeCreateRequest['kind'],
): asserts source is KnowledgeSourceDto {
  const required = kind === 'page' ? ['stat', 'write'] : ['stat', 'mkdir'];
  if (
    !source
    || source.availability !== 'available'
    || required.some(capability => !source.capabilities.includes(capability as never))
  ) {
    throw createKnowledgeWorkspaceError(
      'knowledge_resource_unavailable',
      'knowledge source cannot create this resource',
    );
  }
}

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

function conflict() {
  return createKnowledgeWorkspaceError(
    'knowledge_resource_conflict',
    'knowledge create target already exists',
  );
}

function isConflict(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  return code === 'target_already_exists'
    || code === 'resource_conflict'
    || code === 'knowledge_resource_conflict';
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw Object.assign(new Error('knowledge create aborted'), { name: 'AbortError' });
}
