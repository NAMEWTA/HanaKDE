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
import { encodeResourceTransferVersion } from '../../lib/resource-io/transfer.ts';
import type {
  ResourceOperationContext,
  ResourceRef,
  ResourceStat,
  ResourceTransferResult,
  ResourceVersion,
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

export type KnowledgeImportPreparedItem = Readonly<{
  source: ResourceRef;
  originalName: string;
  target: Readonly<{ sourceKey: string; directoryPath: string }>;
  targetAddress: KnowledgeResourceAddress;
  targetName: string;
  conflictPolicy: KnowledgeImportConflictPolicy;
  disposition: 'apply' | 'skip' | 'replace' | 'merge';
  resourceKind: 'file' | 'directory';
  expectedSourceVersion: ResourceVersion;
  expectedTargetVersion: ResourceVersion | null;
}>;

type SourceRegistrySurface = {
  get(sourceKey: string): KnowledgeSourceDto | null;
  revalidate(sourceKey: string): Promise<void>;
  rootRef(sourceKey: string): ResourceRef;
  resolveAddress(address: KnowledgeResourceAddress): Promise<ResourceRef>;
};
type ResourceIoSurface = {
  stat(ref: ResourceRef, context?: ResourceOperationContext): Promise<ResourceStat>;
  transfer(input: {
    source: ResourceRef;
    targetDirectory: ResourceRef;
    targetName: string;
    expectedTargetVersion: string | null;
    replaceExisting?: boolean;
    mergeExisting?: KnowledgeImportConflictPolicy;
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
    const results: KnowledgeImportItemResult[] = [];
    for (const item of request.items) {
      throwIfAborted(context.signal);
      try {
        results.push(await this.importPrepared(
          await this.planItem(item, request.target, request.conflictPolicy, context),
          context,
        ));
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

  async planItem(
    itemInput: KnowledgeImportItem,
    targetInput: KnowledgeImportRequest['target'],
    conflictPolicy: KnowledgeImportConflictPolicy,
    context: ResourceOperationContext & { signal?: AbortSignal } = {},
  ): Promise<KnowledgeImportPreparedItem> {
    const request = validateImportRequest({
      items: [itemInput],
      target: targetInput,
      conflictPolicy,
    });
    throwIfAborted(context.signal);
    await this.#requireTarget(request.target.sourceKey);
    const item = request.items[0];
    const allocation = await this.#allocate(item.source, item.originalName, request, context);
    if (!allocation.sourceStat.version) {
      throw createKnowledgeWorkspaceError('knowledge_operation_precondition_failed', 'knowledge import source version is unavailable');
    }
    const expectedTargetVersion = allocation.targetStat.exists
      ? allocation.targetStat.version
      : null;
    if (allocation.targetStat.exists && !expectedTargetVersion) {
      throw createKnowledgeWorkspaceError('knowledge_operation_precondition_failed', 'knowledge import target version is unavailable');
    }
    const targetAddress = Object.freeze({
      sourceKey: request.target.sourceKey,
      relativePath: joinPath(request.target.directoryPath, allocation.name),
    });
    return Object.freeze({
      source: item.source,
      originalName: item.originalName,
      target: request.target,
      targetAddress,
      targetName: allocation.name,
      conflictPolicy: request.conflictPolicy,
      disposition: allocation.skipped ? 'skip'
        : allocation.replace ? 'replace'
        : allocation.merge ? 'merge'
        : 'apply',
      resourceKind: allocation.sourceStat.isDirectory ? 'directory' : 'file',
      expectedSourceVersion: Object.freeze({ ...allocation.sourceStat.version }),
      expectedTargetVersion: expectedTargetVersion
        ? Object.freeze({ ...expectedTargetVersion })
        : null,
    });
  }

  async importPrepared(
    prepared: KnowledgeImportPreparedItem,
    context: ResourceOperationContext & { signal?: AbortSignal } = {},
  ): Promise<KnowledgeImportItemResult> {
    throwIfAborted(context.signal);
    await this.#requireTarget(prepared.target.sourceKey);
    const currentSource = await this.#resourceIO.stat(prepared.source, context);
    if (
      !currentSource.exists
      || !currentSource.version
      || !versionsEqual(currentSource.version, prepared.expectedSourceVersion)
    ) {
      throw createKnowledgeWorkspaceError('knowledge_version_conflict', 'knowledge import source changed after planning');
    }
    const targetRef = await this.#sourceRegistry.resolveAddress(prepared.targetAddress);
    const currentTarget = await this.#resourceIO.stat(targetRef, context);
    if (!versionsEqual(
      currentTarget.exists ? currentTarget.version : null,
      prepared.expectedTargetVersion,
    )) {
      throw createKnowledgeWorkspaceError('knowledge_version_conflict', 'knowledge import target changed after planning');
    }
    if (prepared.disposition === 'skip') {
      return Object.freeze({
        ok: true,
        skipped: true,
        originalName: prepared.originalName,
        targetAddress: null,
        bytesTransferred: 0,
      });
    }
    const targetDirectory = prepared.target.directoryPath
      ? await this.#sourceRegistry.resolveAddress({
          sourceKey: prepared.target.sourceKey,
          relativePath: prepared.target.directoryPath,
        })
      : this.#sourceRegistry.rootRef(prepared.target.sourceKey);
    let restoreExisting: (() => Promise<void>) | undefined;
    if (prepared.disposition === 'replace') {
      if (!this.#trashExisting) {
        throw createKnowledgeWorkspaceError('knowledge_operation_precondition_failed', 'knowledge import replace requires workspace trash');
      }
      restoreExisting = await this.#trashExisting(prepared.targetAddress, context);
    }
    let transfer: ResourceTransferResult;
    try {
      transfer = await this.#resourceIO.transfer({
        source: prepared.source,
        targetDirectory,
        targetName: prepared.targetName,
        expectedTargetVersion: prepared.disposition === 'merge'
          ? encodeResourceTransferVersion(prepared.expectedTargetVersion!)
          : null,
        ...(prepared.disposition === 'merge'
          ? { mergeExisting: prepared.conflictPolicy }
          : {}),
        operationId: context.operationId ?? this.#randomUUID(),
        signal: context.signal,
      }, context);
    } catch (error) {
      await restoreExisting?.();
      throw error;
    }
    return Object.freeze({
      ok: true,
      skipped: false,
      originalName: prepared.originalName,
      targetAddress: prepared.targetAddress,
      bytesTransferred: transfer.bytesTransferred,
    });
  }

  async #requireTarget(sourceKey: string): Promise<void> {
    await this.#sourceRegistry.revalidate(sourceKey);
    const source = this.#sourceRegistry.get(sourceKey);
    if (
      !source
      || source.availability !== 'available'
      || !['stat', 'write', 'transfer'].every(capability => source.capabilities.includes(capability as never))
    ) throw createKnowledgeWorkspaceError('knowledge_resource_unavailable', 'knowledge import target is unavailable');
  }

  async #allocate(
    sourceRef: ResourceRef,
    originalName: string,
    request: KnowledgeImportRequest,
    context: ResourceOperationContext,
  ): Promise<{
    name: string;
    replace: boolean;
    skipped: boolean;
    merge: boolean;
    sourceStat: ResourceStat;
    targetStat: ResourceStat;
  }> {
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
      if (!targetStat.exists) return { name, replace: false, skipped: false, merge: false, sourceStat, targetStat };
      if (sourceStat.isDirectory && targetStat.isDirectory) return { name, replace: false, skipped: false, merge: true, sourceStat, targetStat };
      if (sourceStat.isDirectory !== targetStat.isDirectory) continue;
      if (request.conflictPolicy === 'skip') return { name, replace: false, skipped: true, merge: false, sourceStat, targetStat };
      if (request.conflictPolicy === 'replace') return { name, replace: true, skipped: false, merge: false, sourceStat, targetStat };
    }
    throw createKnowledgeWorkspaceError('knowledge_resource_conflict', 'knowledge import names are exhausted');
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
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw Object.assign(new Error('knowledge import aborted'), { name: 'AbortError' });
}
function isAbortError(error: unknown): boolean { return (error as { name?: unknown })?.name === 'AbortError'; }
function versionsEqual(left: ResourceVersion | null | undefined, right: ResourceVersion | null): boolean {
  if (left == null || right == null) return left == null && right == null;
  return (["mtimeMs", "size", "sha256", "etag", "sequence"] as const)
    .every((field) => left[field] === right[field]);
}
