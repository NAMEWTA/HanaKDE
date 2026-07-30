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
  originalName: string;
  mimeType?: string;
  pageAddress: KnowledgeResourceAddress;
  localDate: string;
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

type SourceRegistrySurface = {
  get(sourceKey: string): KnowledgeSourceDto | null;
  revalidate(sourceKey: string): Promise<void>;
  resolveAddress(address: KnowledgeResourceAddress): Promise<ResourceRef>;
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
    if (
      typeof input !== "object"
      || input === null
      || Array.isArray(input)
      || Object.keys(input).some(field => ![
        "source",
        "originalName",
        "mimeType",
        "pageAddress",
        "localDate",
      ].includes(field))
      || !isSessionFileRef(input.source)
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
    const originalName = normalizeExternalFileName(
      input.originalName,
      input.mimeType,
    );
    const targetSource = await this.#requireSource(
      pageAddress.sourceKey,
      ["stat", "read"],
    );
    const pageRef = await this.#sourceRegistry.resolveAddress(pageAddress);
    requireFile(await this.#resourceIO.stat(pageRef, context), "page");
    return this.#copyResolvedForEditor({
      sourceRef: input.source,
      pageAddress,
      kind: "attachment",
      localDate: input.localDate,
      originalName,
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

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException("Aborted", "AbortError");
}
