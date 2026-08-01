import type {
  KnowledgeResourceAddress,
  KnowledgeSourceDto,
} from '../../shared/knowledge-workspace-contract.ts';
import {
  createKnowledgeWorkspaceError,
  normalizeKnowledgeErrorCode,
  type KnowledgeErrorCode,
} from '../../shared/knowledge-workspace-errors.ts';
import { createKnowledgeOperationId } from '../../lib/knowledge-workspace/knowledge-operation-plan.ts';
import type {
  ResourceOperationContext,
  ResourceListResult,
  ResourceRef,
  ResourceStat,
  ResourceTransferResult,
} from '../../lib/resource-io/types.ts';

export type KnowledgeImportConflictPolicy = 'skip' | 'keep-both' | 'replace';
export type KnowledgeImportItem = Readonly<{
  source: ResourceRef;
  originalName: string;
}>;
export type KnowledgeImportRequest = Readonly<{
  items: readonly KnowledgeImportItem[];
  target: Readonly<{ sourceKey: string; directoryPath: string }>;
  conflictPolicy: KnowledgeImportConflictPolicy;
}>;
export type KnowledgeImportItemResult =
  | Readonly<{ ok: true; skipped: boolean; originalName: string; targetAddress: KnowledgeResourceAddress | null; bytesTransferred: number }>
  | Readonly<{ ok: false; originalName: string; errorCode: KnowledgeErrorCode }>;

type SourceRegistrySurface = {
  get(sourceKey: string): KnowledgeSourceDto | null;
  revalidate(sourceKey: string): Promise<void>;
  rootRef(sourceKey: string): ResourceRef;
  resolveAddress(address: KnowledgeResourceAddress): Promise<ResourceRef>;
};
type ResourceIoSurface = {
  stat(ref: ResourceRef, context?: ResourceOperationContext): Promise<ResourceStat>;
  list(ref: ResourceRef, context?: ResourceOperationContext): Promise<ResourceListResult>;
  transfer(input: {
    source: ResourceRef;
    targetDirectory: ResourceRef;
    targetName: string;
    expectedTargetVersion: null;
    replaceExisting?: boolean;
    signal?: AbortSignal;
    operationId: string;
  }, context?: ResourceOperationContext): Promise<ResourceTransferResult>;
};

export class KnowledgeImportService {
  readonly #sourceRegistry: SourceRegistrySurface;
  readonly #resourceIO: ResourceIoSurface;
  readonly #randomUUID: () => string;
  readonly #trashExisting?: (address: KnowledgeResourceAddress, context: ResourceOperationContext) => Promise<() => Promise<void>>;

  constructor(input: {
    sourceRegistry: SourceRegistrySurface;
    resourceIO: ResourceIoSurface;
    randomUUID?: () => string;
    trashExisting?: (address: KnowledgeResourceAddress, context: ResourceOperationContext) => Promise<() => Promise<void>>;
  }) {
    this.#sourceRegistry = input.sourceRegistry;
    this.#resourceIO = input.resourceIO;
    this.#randomUUID = input.randomUUID ?? createKnowledgeOperationId;
    this.#trashExisting = input.trashExisting;
  }

  async import(
    input: KnowledgeImportRequest,
    context: ResourceOperationContext & { signal?: AbortSignal } = {},
  ): Promise<KnowledgeImportItemResult[]> {
    const request = validateImportRequest(input);
    throwIfAborted(context.signal);
    await this.#sourceRegistry.revalidate(request.target.sourceKey);
    const source = this.#sourceRegistry.get(request.target.sourceKey);
    if (
      !source
      || source.availability !== 'available'
      || !['stat', 'write', 'transfer'].every(capability => source.capabilities.includes(capability as never))
    ) throw createKnowledgeWorkspaceError('knowledge_resource_unavailable', 'knowledge import target is unavailable');
    const targetDirectory = request.target.directoryPath
      ? await this.#sourceRegistry.resolveAddress({
          sourceKey: request.target.sourceKey,
          relativePath: request.target.directoryPath,
        })
      : this.#sourceRegistry.rootRef(request.target.sourceKey);
    const results: KnowledgeImportItemResult[] = [];
    for (const item of request.items) {
      throwIfAborted(context.signal);
      try {
        const allocation = await this.#allocate(item.source, item.originalName, request, context);
        if (allocation.skipped) {
          results.push(Object.freeze({
            ok: true,
            skipped: true,
            originalName: item.originalName,
            targetAddress: null,
            bytesTransferred: 0,
          }));
          continue;
        }
        let restoreExisting: (() => Promise<void>) | undefined;
        if (allocation.replace) {
          if (!this.#trashExisting) throw createKnowledgeWorkspaceError('knowledge_operation_precondition_failed', 'knowledge import replace requires workspace trash');
          restoreExisting = await this.#trashExisting({
            sourceKey: request.target.sourceKey,
            relativePath: joinPath(request.target.directoryPath, allocation.name),
          }, context);
        }
        let transfer;
        try {
          transfer = allocation.merge
            ? await this.#mergeDirectory(item.source, {
                sourceKey: request.target.sourceKey,
                directoryPath: joinPath(request.target.directoryPath, allocation.name),
              }, request.conflictPolicy, context)
            : await this.#resourceIO.transfer({
                source: item.source,
                targetDirectory,
                targetName: allocation.name,
                expectedTargetVersion: null,
                operationId: this.#randomUUID(),
                signal: context.signal,
              }, context);
        } catch (error) {
          await restoreExisting?.();
          throw error;
        }
        results.push(Object.freeze({
          ok: true,
          skipped: false,
          originalName: item.originalName,
          targetAddress: Object.freeze({
            sourceKey: request.target.sourceKey,
            relativePath: joinPath(request.target.directoryPath, allocation.name),
          }),
          bytesTransferred: transfer.bytesTransferred,
        }));
      } catch (error) {
        if (isAbortError(error)) throw error;
        results.push(Object.freeze({
          ok: false,
          originalName: item.originalName,
          errorCode: normalizeKnowledgeErrorCode((error as { code?: unknown })?.code)
            ?? 'knowledge_resource_unavailable',
        }));
      }
    }
    return results;
  }

  async #allocate(
    sourceRef: ResourceRef,
    originalName: string,
    request: KnowledgeImportRequest,
    context: ResourceOperationContext,
  ): Promise<{ name: string; replace: boolean; skipped: boolean; merge: boolean }> {
    const sourceStat = await this.#resourceIO.stat(sourceRef, context);
    if (!sourceStat.exists) throw createKnowledgeWorkspaceError('knowledge_resource_not_found', 'knowledge import source is unavailable');
    for (let index = 1; index <= 10_000; index += 1) {
      const name = index === 1 ? originalName : keepBothName(originalName, index);
      const address = {
        sourceKey: request.target.sourceKey,
        relativePath: joinPath(request.target.directoryPath, name),
      };
      const targetRef = await this.#sourceRegistry.resolveAddress(address);
      const targetStat = await this.#resourceIO.stat(targetRef, context);
      if (!targetStat.exists) return { name, replace: false, skipped: false, merge: false };
      if (sourceStat.isDirectory && targetStat.isDirectory) return { name, replace: false, skipped: false, merge: true };
      if (sourceStat.isDirectory !== targetStat.isDirectory) continue;
      if (request.conflictPolicy === 'skip') return { name, replace: false, skipped: true, merge: false };
      if (request.conflictPolicy === 'replace') return { name, replace: true, skipped: false, merge: false };
    }
    throw createKnowledgeWorkspaceError('knowledge_resource_conflict', 'knowledge import names are exhausted');
  }

  async #mergeDirectory(
    sourceDirectory: ResourceRef,
    target: { sourceKey: string; directoryPath: string },
    conflictPolicy: KnowledgeImportConflictPolicy,
    context: ResourceOperationContext & { signal?: AbortSignal },
  ): Promise<{ bytesTransferred: number }> {
    let bytesTransferred = 0;
    const listing = await this.#resourceIO.list(sourceDirectory, context);
    for (const child of listing.items) {
      throwIfAborted(context.signal);
      const childSource = childRef(sourceDirectory, child.name);
      const nestedRequest: KnowledgeImportRequest = {
        items: [{ source: childSource, originalName: child.name }],
        target,
        conflictPolicy,
      };
      const [result] = await this.import(nestedRequest, context);
      if (!result || result.ok !== true) {
        const errorCode = result && 'errorCode' in result
          ? result.errorCode
          : 'knowledge_resource_unavailable';
        throw createKnowledgeWorkspaceError(errorCode, 'knowledge directory merge item failed');
      }
      bytesTransferred += result.bytesTransferred;
    }
    return { bytesTransferred };
  }
}

function validateImportRequest(input: KnowledgeImportRequest): KnowledgeImportRequest {
  if (
    !input
    || !Array.isArray(input.items)
    || input.items.length === 0
    || input.items.length > 100_000
    || !['skip', 'keep-both', 'replace'].includes(input.conflictPolicy)
    || !input.target
    || !/^[a-z][a-z0-9-]{0,31}$/u.test(input.target.sourceKey)
    || !isDirectoryPath(input.target.directoryPath)
    || input.items.some(item => !item?.source || !isName(item.originalName))
  ) throw createKnowledgeWorkspaceError('knowledge_operation_precondition_failed', 'knowledge import request is invalid');
  return Object.freeze({
    ...input,
    items: Object.freeze(input.items.map(item => Object.freeze({ ...item }))),
    target: Object.freeze({ ...input.target }),
  });
}

function isDirectoryPath(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || (
    !value.startsWith('/') && !value.endsWith('/')
    && value.split('/').every(isName)
  ));
}
function isName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 255
    && value !== '.' && value !== '..' && value !== '.trash' && !/[\\/\p{Cc}]/u.test(value);
}
function keepBothName(name: string, index: number): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)}_${index}${name.slice(dot)}` : `${name}_${index}`;
}
function joinPath(parent: string, name: string): string { return parent ? `${parent}/${name}` : name; }
function childRef(parent: ResourceRef, name: string): ResourceRef {
  if (parent.kind === 'local-file') return { kind: 'local-file', path: `${parent.path.replace(/[\\/]$/u, '')}/${name}` };
  if (parent.kind === 'mount') return { kind: 'mount', mountId: parent.mountId, path: joinPath(parent.path, name) };
  throw createKnowledgeWorkspaceError('knowledge_transfer_entry_unsupported', 'knowledge import directory source cannot be traversed');
}
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw Object.assign(new Error('knowledge import aborted'), { name: 'AbortError' });
}
function isAbortError(error: unknown): boolean { return (error as { name?: unknown })?.name === 'AbortError'; }
