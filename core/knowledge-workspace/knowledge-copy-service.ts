import {
  parseKnowledgeResourceAddress,
  type KnowledgeResourceAddress,
  type KnowledgeSourceCapability,
  type KnowledgeSourceDto,
} from "../../shared/knowledge-workspace-contract.ts";
import {
  createKnowledgeWorkspaceError,
  isKnowledgeWorkspaceError,
  normalizeKnowledgeErrorCode,
  type KnowledgeErrorCode,
} from "../../shared/knowledge-workspace-errors.ts";
import {
  createKnowledgeOperationId,
} from "../../lib/knowledge-workspace/knowledge-operation-plan.ts";
import type {
  ResourceMutationResult,
  ResourceMoveResult,
  ResourceOperationContext,
  ResourceRef,
  ResourceStat,
  ResourceTransferRequest,
  ResourceTransferResult,
} from "../../lib/resource-io/types.ts";

const MAX_KEEP_BOTH_ATTEMPTS = 10_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const EMBEDDABLE_ASSET_EXTENSIONS = new Set([
  "aac",
  "avif",
  "bmp",
  "flac",
  "gif",
  "ico",
  "jpeg",
  "jpg",
  "m4a",
  "m4v",
  "mov",
  "mp3",
  "mp4",
  "oga",
  "ogg",
  "ogv",
  "pdf",
  "png",
  "wav",
  "weba",
  "webm",
  "webp",
]);

export type KnowledgeEditorCopyKind = "page" | "attachment";

export type KnowledgeEditorCopyRequest = Readonly<{
  sourceAddress: KnowledgeResourceAddress;
  pageAddress: KnowledgeResourceAddress;
  kind: KnowledgeEditorCopyKind;
  localDate?: string;
}>;

export type KnowledgeEditorCopyResult = Readonly<{
  copied: boolean;
  targetAddress: KnowledgeResourceAddress;
  bytesTransferred: number;
  embed: boolean;
  originalName: string;
}>;

export type KnowledgeExternalEditorCopyRequest = Readonly<{
  source: ResourceRef;
  sourceSizeBytes: number;
  originalName: string;
  mimeType?: string;
  pageAddress: KnowledgeResourceAddress;
  localDate: string;
}>;

export type KnowledgeEditorCopyPreparedItem = Readonly<{
  source: ResourceRef;
  sourceAddress?: KnowledgeResourceAddress;
  expectedSourceVersion: NonNullable<ResourceStat["version"]>;
  pageAddress: KnowledgeResourceAddress;
  expectedPageVersion: NonNullable<ResourceStat["version"]>;
  targetDirectoryAddress: KnowledgeResourceAddress;
  targetAddress: KnowledgeResourceAddress;
  kind: KnowledgeEditorCopyKind;
  originalName: string;
  embed: boolean;
}>;

export type KnowledgeEditorCopyPlan =
  | Readonly<{ disposition: "reference"; result: KnowledgeEditorCopyResult }>
  | Readonly<{ disposition: "copy"; prepared: KnowledgeEditorCopyPreparedItem }>;

export type KnowledgeEditorCopyOperation = Readonly<{
  plan: KnowledgeEditorCopyPlan;
  execute(context: KnowledgeCopyContext): Promise<KnowledgeEditorCopyResult>;
}>;

export type KnowledgeEditorCopyBatchRequest = Readonly<{
  items: readonly Readonly<{
    sourceAddress: KnowledgeResourceAddress;
    kind: KnowledgeEditorCopyKind;
  }>[];
  pageAddress: KnowledgeResourceAddress;
  localDate?: string;
}>;

export type KnowledgeEditorCopyBatchItemResult =
  | Readonly<{ ok: true; result: KnowledgeEditorCopyResult }>
  | Readonly<{ ok: false; errorCode: KnowledgeErrorCode }>;

export type KnowledgeCopyContext = ResourceOperationContext & {
  signal?: AbortSignal;
};

export type KnowledgeInternalPasteRequest = Readonly<{
  intent: "copy" | "cut";
  items: readonly KnowledgeResourceAddress[];
  target: Readonly<{ sourceKey: string; directoryPath: string }>;
}>;

export type KnowledgeInternalPasteItemResult =
  | Readonly<{
    ok: true;
    sourceAddress: KnowledgeResourceAddress;
    targetAddress: KnowledgeResourceAddress;
    effect: "copy" | "move";
  }>
  | Readonly<{
    ok: false;
    sourceAddress: KnowledgeResourceAddress;
    errorCode: KnowledgeErrorCode;
  }>;

export type KnowledgeInternalPastePreparedItem = Readonly<{
  intent: "copy" | "cut";
  sourceAddress: KnowledgeResourceAddress;
  targetAddress: KnowledgeResourceAddress;
  target: Readonly<{ sourceKey: string; directoryPath: string }>;
  resourceKind: "file" | "directory";
  expectedSourceVersion: NonNullable<ResourceStat["version"]>;
}>;

export type KnowledgeInternalPastePlanItemResult =
  | Readonly<{ ok: true; prepared: KnowledgeInternalPastePreparedItem }>
  | Readonly<{ ok: false; sourceAddress: KnowledgeResourceAddress; errorCode: KnowledgeErrorCode }>;

type SourceRegistrySurface = {
  get(sourceKey: string): KnowledgeSourceDto | null;
  revalidate(sourceKey: string): Promise<void>;
  resolveAddress(address: KnowledgeResourceAddress): Promise<ResourceRef>;
  rootRef?(sourceKey: string): ResourceRef;
};

type ResourceIoSurface = {
  stat(
    ref: ResourceRef,
    context?: ResourceOperationContext,
  ): Promise<ResourceStat>;
  mkdir(
    ref: ResourceRef,
    context?: ResourceOperationContext & {
      expectedVersion?: null;
    },
  ): Promise<ResourceMutationResult>;
  transfer(
    request: ResourceTransferRequest,
    context?: ResourceOperationContext,
  ): Promise<ResourceTransferResult>;
  move?(
    from: ResourceRef,
    to: ResourceRef,
    context?: ResourceOperationContext & {
      expectedSourceVersion?: ResourceStat["version"];
      expectedTargetVersion?: null;
    },
  ): Promise<ResourceMoveResult>;
};

export class KnowledgeCopyService {
  readonly #sourceRegistry: SourceRegistrySurface;
  readonly #resourceIO: ResourceIoSurface;
  readonly #randomUUID: () => string;

  constructor(input: {
    sourceRegistry: SourceRegistrySurface;
    resourceIO: ResourceIoSurface;
    randomUUID?: () => string;
  }) {
    this.#sourceRegistry = input.sourceRegistry;
    this.#resourceIO = input.resourceIO;
    this.#randomUUID = input.randomUUID ?? createKnowledgeOperationId;
  }

  async planCopyForEditor(
    input: KnowledgeEditorCopyRequest,
    context: KnowledgeCopyContext = {},
  ): Promise<KnowledgeEditorCopyPlan> {
    throwIfAborted(context.signal);
    const request = validateCopyRequest(input);
    const source = await this.#requireSource(
      request.sourceAddress.sourceKey,
      ["stat", "read"],
    );
    const targetSource = await this.#requireSource(
      request.pageAddress.sourceKey,
      ["stat", "read"],
    );
    const sourceRef = await this.#sourceRegistry.resolveAddress(
      request.sourceAddress,
    );
    const pageRef = await this.#sourceRegistry.resolveAddress(
      request.pageAddress,
    );
    const [sourceStat, pageStat] = await Promise.all([
      this.#resourceIO.stat(sourceRef, context),
      this.#resourceIO.stat(pageRef, context),
    ]);
    requireFile(sourceStat, "source");
    requireFile(pageStat, "page");
    const sourceVersion = requireVersion(sourceStat, "source");
    const pageVersion = requireVersion(pageStat, "page");
    const originalName = basename(request.sourceAddress.relativePath);
    if (
      request.kind === "page"
      && !hasExtension(request.sourceAddress.relativePath, "md")
    ) {
      throw createKnowledgeWorkspaceError(
        "knowledge_operation_precondition_failed",
        "editor Page copy source must be Markdown",
      );
    }
    if (source.sourceKey === targetSource.sourceKey) {
      return Object.freeze({
        disposition: "reference",
        result: Object.freeze({
          copied: false,
          targetAddress: Object.freeze({ ...request.sourceAddress }),
          bytesTransferred: 0,
          embed: request.kind === "attachment" && isEmbeddable(originalName),
          originalName,
        }),
      });
    }
    requireCapabilities(source, ["transfer"]);
    return this.#planResolvedForEditor({
      source: sourceRef,
      sourceAddress: request.sourceAddress,
      expectedSourceVersion: sourceVersion,
      pageAddress: request.pageAddress,
      expectedPageVersion: pageVersion,
      kind: request.kind,
      localDate: request.localDate,
      originalName,
      targetSource,
      context,
    });
  }

  async planExternalCopyForEditor(
    input: KnowledgeExternalEditorCopyRequest,
    context: KnowledgeCopyContext = {},
  ): Promise<Extract<KnowledgeEditorCopyPlan, { disposition: "copy" }>> {
    throwIfAborted(context.signal);
    const request = validateExternalCopyRequest(input);
    const targetSource = await this.#requireSource(
      request.pageAddress.sourceKey,
      ["stat", "read"],
    );
    const pageRef = await this.#sourceRegistry.resolveAddress(request.pageAddress);
    const pageStat = await this.#resourceIO.stat(pageRef, context);
    requireFile(pageStat, "page");
    return this.#planResolvedForEditor({
      source: request.source,
      expectedSourceVersion: Object.freeze({ size: request.sourceSizeBytes }),
      pageAddress: request.pageAddress,
      expectedPageVersion: requireVersion(pageStat, "page"),
      kind: "attachment",
      localDate: request.localDate,
      originalName: request.originalName,
      targetSource,
      context,
    });
  }

  async copyPreparedForEditor(
    prepared: KnowledgeEditorCopyPreparedItem,
    context: KnowledgeCopyContext = {},
  ): Promise<KnowledgeEditorCopyResult> {
    throwIfAborted(context.signal);
    await this.#requireSource(
      prepared.targetAddress.sourceKey,
      prepared.kind === "attachment"
        ? ["stat", "write", "mkdir", "transfer"]
        : ["stat", "write", "transfer"],
    );
    if (prepared.sourceAddress) {
      await this.#requireSource(prepared.sourceAddress.sourceKey, ["stat", "read", "transfer"]);
      const sourceStat = await this.#resourceIO.stat(
        await this.#sourceRegistry.resolveAddress(prepared.sourceAddress),
        context,
      );
      if (
        !sourceStat.exists
        || !versionsEqual(sourceStat.version, prepared.expectedSourceVersion)
      ) {
        throw createKnowledgeWorkspaceError(
          "knowledge_version_conflict",
          "editor copy source changed after planning",
        );
      }
    }
    const pageStat = await this.#resourceIO.stat(
      await this.#sourceRegistry.resolveAddress(prepared.pageAddress),
      context,
    );
    if (
      !pageStat.exists
      || pageStat.isDirectory
      || !versionsEqual(pageStat.version, prepared.expectedPageVersion)
    ) {
      throw createKnowledgeWorkspaceError(
        "knowledge_version_conflict",
        "editor copy page changed after planning",
      );
    }
    await this.#ensureTargetDirectory(
      prepared.targetDirectoryAddress,
      prepared.kind === "attachment",
      context,
    );
    const targetRef = await this.#sourceRegistry.resolveAddress(prepared.targetAddress);
    if ((await this.#resourceIO.stat(targetRef, context)).exists) {
      throw createKnowledgeWorkspaceError(
        "knowledge_resource_conflict",
        "editor copy target changed after planning",
      );
    }
    const targetDirectoryRef = await this.#sourceRegistry.resolveAddress(
      prepared.targetDirectoryAddress,
    );
    const transfer = await this.#resourceIO.transfer({
      source: prepared.source,
      targetDirectory: targetDirectoryRef,
      targetName: basename(prepared.targetAddress.relativePath),
      expectedTargetVersion: null,
      operationId: context.operationId ?? this.#randomUUID(),
      signal: context.signal,
    }, {
      ...context,
      source: context.source ?? "api",
    });
    return Object.freeze({
      copied: true,
      targetAddress: prepared.targetAddress,
      bytesTransferred: transfer.bytesTransferred,
      embed: prepared.embed,
      originalName: prepared.originalName,
    });
  }

  async #planResolvedForEditor(input: {
    source: ResourceRef;
    sourceAddress?: KnowledgeResourceAddress;
    expectedSourceVersion: NonNullable<ResourceStat["version"]>;
    pageAddress: KnowledgeResourceAddress;
    expectedPageVersion: NonNullable<ResourceStat["version"]>;
    kind: KnowledgeEditorCopyKind;
    localDate?: string;
    originalName: string;
    targetSource: KnowledgeSourceDto;
    context: KnowledgeCopyContext;
  }): Promise<Extract<KnowledgeEditorCopyPlan, { disposition: "copy" }>> {
    requireCapabilities(
      input.targetSource,
      input.kind === "attachment"
        ? ["write", "mkdir", "transfer"]
        : ["write", "transfer"],
    );
    const pageDirectory = dirname(input.pageAddress.relativePath);
    const targetDirectoryAddress = Object.freeze({
      sourceKey: input.pageAddress.sourceKey,
      relativePath: input.kind === "attachment"
        ? joinPath(pageDirectory, "assets")
        : pageDirectory,
    });
    const directoryStat = await this.#resourceIO.stat(
      await this.#sourceRegistry.resolveAddress(targetDirectoryAddress),
      input.context,
    );
    if (directoryStat.exists && !directoryStat.isDirectory) {
      throw createKnowledgeWorkspaceError(
        "knowledge_operation_precondition_failed",
        "knowledge editor copy target directory is occupied",
      );
    }
    if (!directoryStat.exists && input.kind !== "attachment") {
      throw createKnowledgeWorkspaceError(
        "knowledge_resource_not_found",
        "knowledge editor copy target directory does not exist",
      );
    }
    const baseName = input.kind === "attachment"
      ? `${input.localDate}-${input.originalName}`
      : input.originalName;
    let targetAddress: KnowledgeResourceAddress | null = null;
    for (let index = 1; index <= MAX_KEEP_BOTH_ATTEMPTS; index += 1) {
      throwIfAborted(input.context.signal);
      const candidate = Object.freeze({
        sourceKey: targetDirectoryAddress.sourceKey,
        relativePath: joinPath(
          targetDirectoryAddress.relativePath,
          keepBothName(baseName, index),
        ),
      });
      if (!(await this.#resourceIO.stat(
        await this.#sourceRegistry.resolveAddress(candidate),
        input.context,
      )).exists) {
        targetAddress = candidate;
        break;
      }
    }
    if (!targetAddress) {
      throw createKnowledgeWorkspaceError(
        "knowledge_resource_conflict",
        "editor copy could not allocate a deterministic target name",
      );
    }
    return Object.freeze({
      disposition: "copy",
      prepared: Object.freeze({
        source: input.source,
        ...(input.sourceAddress ? { sourceAddress: input.sourceAddress } : {}),
        expectedSourceVersion: input.expectedSourceVersion,
        pageAddress: input.pageAddress,
        expectedPageVersion: input.expectedPageVersion,
        targetDirectoryAddress,
        targetAddress,
        kind: input.kind,
        originalName: input.originalName,
        embed: input.kind === "attachment" && isEmbeddable(
          basename(targetAddress.relativePath),
        ),
      }),
    });
  }

  async copyForEditor(
    input: KnowledgeEditorCopyRequest,
    context: KnowledgeCopyContext = {},
  ): Promise<KnowledgeEditorCopyResult> {
    throwIfAborted(context.signal);
    const request = validateCopyRequest(input);
    const source = await this.#requireSource(
      request.sourceAddress.sourceKey,
      ["stat", "read"],
    );
    const targetSource = await this.#requireSource(
      request.pageAddress.sourceKey,
      ["stat", "read"],
    );
    const sourceRef = await this.#sourceRegistry.resolveAddress(
      request.sourceAddress,
    );
    const pageRef = await this.#sourceRegistry.resolveAddress(
      request.pageAddress,
    );
    const [sourceStat, pageStat] = await Promise.all([
      this.#resourceIO.stat(sourceRef, context),
      this.#resourceIO.stat(pageRef, context),
    ]);
    requireFile(sourceStat, "source");
    requireFile(pageStat, "page");
    const originalName = basename(request.sourceAddress.relativePath);
    if (
      request.kind === "page"
      && !hasExtension(request.sourceAddress.relativePath, "md")
    ) {
      throw createKnowledgeWorkspaceError(
        "knowledge_operation_precondition_failed",
        "editor Page copy source must be Markdown",
      );
    }

    if (source.sourceKey === targetSource.sourceKey) {
      return Object.freeze({
        copied: false,
        targetAddress: Object.freeze({ ...request.sourceAddress }),
        bytesTransferred: 0,
        embed: request.kind === "attachment" && isEmbeddable(originalName),
        originalName,
      });
    }

    requireCapabilities(source, ["transfer"]);
    return this.#copyResolvedForEditor({
      sourceRef,
      pageAddress: request.pageAddress,
      kind: request.kind,
      localDate: request.localDate,
      originalName,
      targetSource,
      context,
    });
  }

  async copyExternalForEditor(
    input: KnowledgeExternalEditorCopyRequest,
    context: KnowledgeCopyContext = {},
  ): Promise<KnowledgeEditorCopyResult> {
    throwIfAborted(context.signal);
    const request = validateExternalCopyRequest(input);
    const targetSource = await this.#requireSource(
      request.pageAddress.sourceKey,
      ["stat", "read"],
    );
    const pageRef = await this.#sourceRegistry.resolveAddress(request.pageAddress);
    requireFile(await this.#resourceIO.stat(pageRef, context), "page");
    return this.#copyResolvedForEditor({
      sourceRef: request.source,
      pageAddress: request.pageAddress,
      kind: "attachment",
      localDate: request.localDate,
      originalName: request.originalName,
      targetSource,
      context,
    });
  }

  async #copyResolvedForEditor(input: {
    sourceRef: ResourceRef;
    pageAddress: KnowledgeResourceAddress;
    kind: KnowledgeEditorCopyKind;
    localDate?: string;
    originalName: string;
    targetSource: KnowledgeSourceDto;
    context: KnowledgeCopyContext;
  }): Promise<KnowledgeEditorCopyResult> {
    requireCapabilities(
      input.targetSource,
      input.kind === "attachment"
        ? ["write", "mkdir", "transfer"]
        : ["write", "transfer"],
    );
    const pageDirectory = dirname(input.pageAddress.relativePath);
    const targetDirectoryAddress: KnowledgeResourceAddress = {
      sourceKey: input.pageAddress.sourceKey,
      relativePath: input.kind === "attachment"
        ? joinPath(pageDirectory, "assets")
        : pageDirectory,
    };
    await this.#ensureTargetDirectory(
      targetDirectoryAddress,
      input.kind === "attachment",
      input.context,
    );
    const baseName = input.kind === "attachment"
      ? `${input.localDate}-${input.originalName}`
      : input.originalName;

    for (let index = 1; index <= MAX_KEEP_BOTH_ATTEMPTS; index += 1) {
      throwIfAborted(input.context.signal);
      const targetName = keepBothName(baseName, index);
      try {
        const transfer = await this.#resourceIO.transfer({
          source: input.sourceRef,
          targetDirectory: await this.#sourceRegistry.resolveAddress(
            targetDirectoryAddress,
          ),
          targetName,
          expectedTargetVersion: null,
          operationId: this.#randomUUID(),
          signal: input.context.signal,
        }, {
          ...input.context,
          source: input.context.source ?? "api",
        });
        return Object.freeze({
          copied: true,
          targetAddress: Object.freeze({
            sourceKey: input.pageAddress.sourceKey,
            relativePath: joinPath(
              targetDirectoryAddress.relativePath,
              targetName,
            ),
          }),
          bytesTransferred: transfer.bytesTransferred,
          embed: input.kind === "attachment" && isEmbeddable(targetName),
          originalName: input.originalName,
        });
      } catch (error) {
        if (!isTargetConflict(error)) throw normalizeCopyError(error);
      }
    }
    throw createKnowledgeWorkspaceError(
      "knowledge_resource_conflict",
      "editor copy could not allocate a deterministic target name",
    );
  }

  async copyBatchForEditor(
    input: KnowledgeEditorCopyBatchRequest,
    context: KnowledgeCopyContext = {},
  ): Promise<KnowledgeEditorCopyBatchItemResult[]> {
    const pageAddress = requireAddress(input?.pageAddress, "pageAddress");
    if (!Array.isArray(input?.items)) {
      throw createKnowledgeWorkspaceError(
        "knowledge_operation_precondition_failed",
        "editor copy batch items are required",
      );
    }
    const results: KnowledgeEditorCopyBatchItemResult[] = [];
    for (const item of input.items) {
      throwIfAborted(context.signal);
      try {
        results.push({
          ok: true,
          result: await this.copyForEditor({
            sourceAddress: item.sourceAddress,
            pageAddress,
            kind: item.kind,
            localDate: input.localDate,
          }, context),
        });
      } catch (error) {
        if (isAbortError(error)) throw error;
        results.push({
          ok: false,
          errorCode: normalizeKnowledgeErrorCode(
            ownErrorCode(error),
          ) ?? "knowledge_resource_unavailable",
        });
      }
    }
    return results;
  }

  async pasteResources(
    input: KnowledgeInternalPasteRequest,
    context: KnowledgeCopyContext = {},
  ): Promise<KnowledgeInternalPasteItemResult[]> {
    const results: KnowledgeInternalPasteItemResult[] = [];
    for (const item of await this.planPasteResources(input, context)) {
      throwIfAborted(context.signal);
      if ("errorCode" in item) {
        results.push(Object.freeze({
          ok: false,
          sourceAddress: item.sourceAddress,
          errorCode: item.errorCode,
        }));
        continue;
      }
      try {
        results.push(await this.pastePrepared(item.prepared, context));
      } catch (error) {
        if (isAbortError(error)) throw error;
        results.push(Object.freeze({
          ok: false,
          sourceAddress: item.prepared.sourceAddress,
          errorCode: normalizeKnowledgeErrorCode(ownErrorCode(error))
            ?? "knowledge_resource_unavailable",
        }));
      }
    }
    return results;
  }

  async planPasteResources(
    input: KnowledgeInternalPasteRequest,
    context: KnowledgeCopyContext = {},
  ): Promise<KnowledgeInternalPastePlanItemResult[]> {
    throwIfAborted(context.signal);
    const request = validateInternalPasteRequest(input);
    const sourceKey = request.items[0].sourceKey;
    if (request.intent === "cut" && sourceKey !== request.target.sourceKey) {
      throw createKnowledgeWorkspaceError(
        "knowledge_operation_precondition_failed",
        "cross-source cut must be converted to copy explicitly",
      );
    }
    await this.#requireSource(sourceKey, ["stat", "read"]);
    await this.#requireSource(
      request.target.sourceKey,
      request.intent === "cut" ? ["stat", "move"] : ["stat", "transfer"],
    );
    if (request.intent === "cut" && typeof this.#resourceIO.move !== "function") {
      throw createKnowledgeWorkspaceError("knowledge_resource_unavailable", "knowledge move is unavailable");
    }
    const results: KnowledgeInternalPastePlanItemResult[] = [];
    const reservedTargets = new Set<string>();
    for (const sourceAddress of request.items) {
      try {
        const sourceRef = await this.#sourceRegistry.resolveAddress(sourceAddress);
        const sourceStat = await this.#resourceIO.stat(sourceRef, context);
        if (!sourceStat.exists || !sourceStat.version) {
          throw createKnowledgeWorkspaceError("knowledge_resource_not_found", "knowledge copy source does not exist");
        }
        const targetAddress = await this.#allocatePasteAddress(
          request.target.sourceKey,
          request.target.directoryPath,
          basename(sourceAddress.relativePath),
          sourceStat.isDirectory,
          context,
          reservedTargets,
        );
        reservedTargets.add(pasteAddressKey(targetAddress));
        results.push(Object.freeze({
          ok: true,
          prepared: Object.freeze({
            intent: request.intent,
            sourceAddress: Object.freeze({ ...sourceAddress }),
            targetAddress: Object.freeze(targetAddress),
            target: request.target,
            resourceKind: sourceStat.isDirectory ? "directory" : "file",
            expectedSourceVersion: Object.freeze({ ...sourceStat.version }),
          }),
        }));
      } catch (error) {
        if (isAbortError(error)) throw error;
        results.push(Object.freeze({
          ok: false,
          sourceAddress: Object.freeze({ ...sourceAddress }),
          errorCode: normalizeKnowledgeErrorCode(ownErrorCode(error))
            ?? "knowledge_resource_unavailable",
        }));
      }
    }
    return results;
  }

  async pastePrepared(
    prepared: KnowledgeInternalPastePreparedItem,
    context: KnowledgeCopyContext = {},
  ): Promise<Extract<KnowledgeInternalPasteItemResult, { ok: true }>> {
    throwIfAborted(context.signal);
    await this.#requireSource(prepared.sourceAddress.sourceKey, ["stat", "read"]);
    const target = await this.#requireSource(
      prepared.target.sourceKey,
      prepared.intent === "cut" ? ["stat", "move"] : ["stat", "transfer"],
    );
    const sourceRef = await this.#sourceRegistry.resolveAddress(prepared.sourceAddress);
    const targetRef = await this.#sourceRegistry.resolveAddress(prepared.targetAddress);
    const [sourceStat, targetStat] = await Promise.all([
      this.#resourceIO.stat(sourceRef, context),
      this.#resourceIO.stat(targetRef, context),
    ]);
    if (
      !sourceStat.exists
      || !sourceStat.version
      || !versionsEqual(sourceStat.version, prepared.expectedSourceVersion)
    ) {
      throw createKnowledgeWorkspaceError("knowledge_version_conflict", "knowledge paste source changed after planning");
    }
    if (targetStat.exists) {
      throw createKnowledgeWorkspaceError("knowledge_resource_conflict", "knowledge paste target changed after planning");
    }
    if (prepared.intent === "cut") {
      if (!this.#resourceIO.move) {
        throw createKnowledgeWorkspaceError("knowledge_resource_unavailable", "knowledge move is unavailable");
      }
      await this.#resourceIO.move(sourceRef, targetRef, {
        ...context,
        expectedSourceVersion: prepared.expectedSourceVersion,
        expectedTargetVersion: null,
        operationId: context.operationId ?? this.#randomUUID(),
      });
    } else {
      const targetDirectoryRef = prepared.target.directoryPath
        ? await this.#sourceRegistry.resolveAddress({
            sourceKey: target.sourceKey,
            relativePath: prepared.target.directoryPath,
          })
        : this.#sourceRegistry.rootRef?.(target.sourceKey);
      if (!targetDirectoryRef) {
        throw createKnowledgeWorkspaceError("knowledge_resource_unavailable", "knowledge source root is unavailable");
      }
      await this.#resourceIO.transfer({
        source: sourceRef,
        targetDirectory: targetDirectoryRef,
        targetName: basename(prepared.targetAddress.relativePath),
        expectedTargetVersion: null,
        operationId: context.operationId ?? this.#randomUUID(),
        signal: context.signal,
      }, context);
    }
    return Object.freeze({
      ok: true,
      sourceAddress: prepared.sourceAddress,
      targetAddress: prepared.targetAddress,
      effect: prepared.intent === "cut" ? "move" : "copy",
    });
  }

  async #allocatePasteAddress(
    sourceKey: string,
    directoryPath: string,
    originalName: string,
    directory: boolean,
    context: KnowledgeCopyContext,
    reservedTargets: ReadonlySet<string> = new Set(),
  ): Promise<KnowledgeResourceAddress> {
    for (let index = 1; index <= MAX_KEEP_BOTH_ATTEMPTS; index += 1) {
      const name = pasteKeepBothName(originalName, index, directory);
      const address = {
        sourceKey,
        relativePath: joinPath(directoryPath, name),
      };
      if (reservedTargets.has(pasteAddressKey(address))) continue;
      const ref = await this.#sourceRegistry.resolveAddress(address);
      if (!(await this.#resourceIO.stat(ref, context)).exists) return address;
    }
    throw createKnowledgeWorkspaceError(
      "knowledge_resource_conflict",
      "knowledge paste target names are exhausted",
    );
  }

  async #requireSource(
    sourceKey: string,
    capabilities: readonly KnowledgeSourceCapability[],
  ): Promise<KnowledgeSourceDto> {
    const source = this.#sourceRegistry.get(sourceKey);
    if (!source || source.availability !== "available") {
      throw createKnowledgeWorkspaceError(
        "knowledge_resource_unavailable",
        "knowledge copy source is unavailable",
      );
    }
    requireCapabilities(source, capabilities);
    try {
      await this.#sourceRegistry.revalidate(sourceKey);
    } catch {
      throw createKnowledgeWorkspaceError(
        "knowledge_resource_unavailable",
        "knowledge copy source could not be revalidated",
      );
    }
    return source;
  }

  async #ensureTargetDirectory(
    address: KnowledgeResourceAddress,
    createWhenMissing: boolean,
    context: KnowledgeCopyContext,
  ): Promise<void> {
    const ref = await this.#sourceRegistry.resolveAddress(address);
    let stat = await this.#resourceIO.stat(ref, context);
    if (stat.exists) {
      if (!stat.isDirectory) {
        throw createKnowledgeWorkspaceError(
          "knowledge_operation_precondition_failed",
          "knowledge attachment directory is occupied by a non-directory",
        );
      }
      return;
    }
    if (!createWhenMissing) {
      throw createKnowledgeWorkspaceError(
        "knowledge_resource_not_found",
        "knowledge copy target directory does not exist",
      );
    }
    try {
      await this.#resourceIO.mkdir(ref, {
        ...context,
        expectedVersion: null,
        source: context.source ?? "api",
      });
      return;
    } catch (error) {
      if (!isTargetConflict(error)) throw normalizeCopyError(error);
    }
    stat = await this.#resourceIO.stat(ref, context);
    if (!stat.exists || !stat.isDirectory) {
      throw createKnowledgeWorkspaceError(
        "knowledge_operation_precondition_failed",
        "knowledge attachment directory could not be established",
      );
    }
  }
}

function validateInternalPasteRequest(
  input: unknown,
): KnowledgeInternalPasteRequest {
  if (!isPlainRecord(input)) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "knowledge paste request is invalid",
    );
  }
  const allowedFields = new Set(["intent", "items", "target"]);
  if (Object.keys(input).some(field => !allowedFields.has(field))) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "knowledge paste request contains an unexpected field",
    );
  }
  const target = input.target;
  if (
    typeof input.intent !== "string"
    || !["copy", "cut"].includes(input.intent)
    || !Array.isArray(input.items)
    || input.items.length === 0
    || !isPlainRecord(target)
    || Object.keys(target).some(field => field !== "sourceKey" && field !== "directoryPath")
    || typeof target.directoryPath !== "string"
  ) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "knowledge paste request is invalid",
    );
  }
  const parsedTarget = parseKnowledgeResourceAddress({
    sourceKey: target.sourceKey,
    relativePath: target.directoryPath || "__source_root__",
  });
  if (parsedTarget.ok === false) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "knowledge paste target is invalid",
    );
  }
  const parsedItems = input.items.map(item => {
    const parsed = parseKnowledgeResourceAddress(item);
    if (parsed.ok === false) throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "knowledge paste source address is invalid",
    );
    return parsed.value;
  });
  const sourceKey = parsedItems[0].sourceKey;
  if (parsedItems.some(item => item.sourceKey !== sourceKey)) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "knowledge paste selection must belong to one source",
    );
  }
  const normalized = parsedItems.filter((item, index) => !parsedItems.some((ancestor, candidate) => (
    candidate !== index
    && ancestor.relativePath !== item.relativePath
    && item.relativePath.startsWith(`${ancestor.relativePath}/`)
  )));
  return Object.freeze({
    intent: input.intent as "copy" | "cut",
    items: Object.freeze(normalized.map(item => Object.freeze(item))),
    target: Object.freeze({
      sourceKey: parsedTarget.value.sourceKey,
      directoryPath: target.directoryPath,
    }),
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function pasteKeepBothName(name: string, index: number, directory: boolean): string {
  if (index === 1) return name;
  if (directory) return `${name}_${index}`;
  const dot = name.lastIndexOf(".");
  return dot > 0
    ? `${name.slice(0, dot)}_${index}${name.slice(dot)}`
    : `${name}_${index}`;
}

const MIME_EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/pdf": "pdf",
});

function normalizeExternalFileName(
  originalName: unknown,
  mimeType: unknown,
): string {
  if (
    typeof originalName !== "string"
    || originalName.includes("/")
    || originalName.includes("\\")
    || /\p{Cc}/u.test(originalName)
    || originalName.length > 255
  ) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "external attachment name is invalid",
    );
  }
  const trimmed = originalName.trim();
  if (trimmed && trimmed !== "." && trimmed !== "..") return trimmed;
  const extension = typeof mimeType === "string"
    ? MIME_EXTENSIONS[mimeType.toLocaleLowerCase()]
    : undefined;
  return extension ? `image.${extension}` : "image";
}

function isSessionFileRef(input: unknown): input is Extract<
  ResourceRef,
  { kind: "session-file" }
> {
  return typeof input === "object"
    && input !== null
    && !Array.isArray(input)
    && Object.keys(input).every(field => ["kind", "fileId"].includes(field))
    && (input as { kind?: unknown }).kind === "session-file"
    && typeof (input as { fileId?: unknown }).fileId === "string"
    && (input as { fileId: string }).fileId.length > 0
    && (input as { fileId: string }).fileId.length <= 256
    && !/\p{Cc}/u.test((input as { fileId: string }).fileId);
}

function validateExternalCopyRequest(
  input: unknown,
): KnowledgeExternalEditorCopyRequest {
  if (
    !isPlainRecord(input)
    || Object.keys(input).some(field => ![
      "source",
      "sourceSizeBytes",
      "originalName",
      "mimeType",
      "pageAddress",
      "localDate",
    ].includes(field))
    || !isSessionFileRef(input.source)
    || !Number.isSafeInteger(input.sourceSizeBytes)
    || (input.sourceSizeBytes as number) < 0
    || (
      input.mimeType !== undefined
      && (
        typeof input.mimeType !== "string"
        || input.mimeType.length > 255
        || /\p{Cc}/u.test(input.mimeType)
      )
    )
    || !isValidLocalDate(input.localDate)
  ) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "external editor copy request is invalid",
    );
  }
  const pageAddress = requireAddress(input.pageAddress, "pageAddress");
  if (!hasExtension(pageAddress.relativePath, "md")) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "external editor copy target must be a Markdown Page",
    );
  }
  return Object.freeze({
    source: input.source,
    sourceSizeBytes: input.sourceSizeBytes as number,
    originalName: normalizeExternalFileName(input.originalName, input.mimeType),
    ...(input.mimeType === undefined ? {} : { mimeType: input.mimeType as string }),
    pageAddress,
    localDate: input.localDate,
  });
}

function validateCopyRequest(
  input: KnowledgeEditorCopyRequest,
): KnowledgeEditorCopyRequest {
  if (
    typeof input !== "object"
    || input === null
    || Array.isArray(input)
  ) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "editor copy request is invalid",
    );
  }
  const allowedFields = new Set([
    "sourceAddress",
    "pageAddress",
    "kind",
    "localDate",
  ]);
  if (Object.keys(input).some(field => !allowedFields.has(field))) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "editor copy request contains an unexpected field",
    );
  }
  const sourceAddress = requireAddress(input?.sourceAddress, "sourceAddress");
  const pageAddress = requireAddress(input?.pageAddress, "pageAddress");
  if (!hasExtension(pageAddress.relativePath, "md")) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "editor copy target must be a Markdown Page",
    );
  }
  if (input?.kind !== "page" && input?.kind !== "attachment") {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "editor copy kind is invalid",
    );
  }
  if (
    input.kind === "attachment"
    && !isValidLocalDate(input.localDate)
  ) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "editor attachment copy requires a valid local calendar date",
    );
  }
  return {
    sourceAddress,
    pageAddress,
    kind: input.kind,
    ...(input.localDate ? { localDate: input.localDate } : {}),
  };
}

function requireAddress(
  value: unknown,
  field: string,
): KnowledgeResourceAddress {
  const parsed = parseKnowledgeResourceAddress(value);
  if (parsed.ok === false || parsed.value.relativePath.length === 0) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      `editor copy ${field} is invalid`,
      { field },
    );
  }
  return parsed.value;
}

function requireCapabilities(
  source: KnowledgeSourceDto,
  capabilities: readonly KnowledgeSourceCapability[],
): void {
  for (const capability of capabilities) {
    if (!source.capabilities.includes(capability)) {
      throw createKnowledgeWorkspaceError(
        "knowledge_resource_out_of_scope",
        "knowledge copy capability is unavailable",
        { capability },
      );
    }
  }
}

function requireFile(stat: ResourceStat, role: "source" | "page"): void {
  if (!stat.exists) {
    throw createKnowledgeWorkspaceError(
      "knowledge_resource_not_found",
      `knowledge copy ${role} does not exist`,
    );
  }
  if (stat.isDirectory) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      `knowledge copy ${role} must be a file`,
    );
  }
}

function requireVersion(
  stat: ResourceStat,
  role: "source" | "page",
): NonNullable<ResourceStat["version"]> {
  if (!stat.version) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      `knowledge copy ${role} version is unavailable`,
    );
  }
  return Object.freeze({ ...stat.version });
}

function isValidLocalDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function basename(relativePath: string): string {
  return relativePath.split("/").at(-1) ?? relativePath;
}

function dirname(relativePath: string): string {
  const segments = relativePath.split("/");
  segments.pop();
  return segments.join("/");
}

function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).join("/");
}

function pasteAddressKey(address: KnowledgeResourceAddress): string {
  return `${address.sourceKey}\0${address.relativePath}`;
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 && dot < fileName.length - 1
    ? fileName.slice(dot + 1)
    : "";
}

function hasExtension(relativePath: string, extension: string): boolean {
  return extensionOf(basename(relativePath)).toLocaleLowerCase() === extension;
}

function isEmbeddable(fileName: string): boolean {
  return EMBEDDABLE_ASSET_EXTENSIONS.has(
    extensionOf(fileName).toLocaleLowerCase(),
  );
}

function keepBothName(originalName: string, index: number): string {
  if (index <= 1) return originalName;
  const dot = originalName.lastIndexOf(".");
  const suffix = `_${index}`;
  return dot > 0 && dot < originalName.length - 1
    ? `${originalName.slice(0, dot)}${suffix}${originalName.slice(dot)}`
    : `${originalName}${suffix}`;
}

function isTargetConflict(error: unknown): boolean {
  const code = normalizeKnowledgeErrorCode(ownErrorCode(error));
  return code === "knowledge_resource_conflict"
    || code === "knowledge_version_conflict";
}

function ownErrorCode(error: unknown): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(error, "code");
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function normalizeCopyError(error: unknown): unknown {
  if (isAbortError(error) || isKnowledgeWorkspaceError(error)) return error;
  const code = normalizeKnowledgeErrorCode(ownErrorCode(error));
  return code
    ? createKnowledgeWorkspaceError(code, "knowledge copy failed")
    : createKnowledgeWorkspaceError(
        "knowledge_resource_unavailable",
        "knowledge copy service is unavailable",
      );
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && Object.getOwnPropertyDescriptor(error, "name")?.value === "AbortError";
}

function versionsEqual(left: ResourceStat["version"], right: ResourceStat["version"]): boolean {
  if (left == null || right == null) return left == null && right == null;
  return (["mtimeMs", "size", "sha256", "etag", "sequence"] as const)
    .every((field) => left[field] === right[field]);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException("Aborted", "AbortError");
}
