import fs from "fs";
import path from "path";
import {
  loadAnydoc,
  resolveAnydocModulePath,
  type AnydocApi,
} from "./anydoc-loader.ts";
import {
  AnydocProcessRunner,
  HtmlProcessRunner,
  isScannedPdfConversionError,
  normalizeDerivedMarkdownLimit,
  type DocumentConversionRunner,
  type HtmlConversionRunner,
} from "./anydoc-process-runner.ts";
import { normalizeResourceRef } from "../resource-io/resource-refs.ts";
import { RESOURCE_READ_PROOF } from "../resource-io/types.ts";
import type {
  MaterializeResult,
  ResourceDescriptor,
  ResourceOpenReadOptions,
  ResourceOpenReadResult,
  ResourceOperationContext,
  ResourceRef,
  ResourceStat,
} from "../resource-io/types.ts";
import type {
  DocumentExtractionRequest,
  ExtractResult,
} from "./types.ts";

export type { AnydocApi } from "./anydoc-loader.ts";
export { MAX_DERIVED_MARKDOWN_BYTES } from "./anydoc-process-runner.ts";
export type {
  DocumentExtractionRequest,
  ExtractFailure,
  ExtractFailureReason,
  ExtractResult,
  ExtractSuccess,
} from "./types.ts";

export const MAX_INPUT_BYTES = 50 * 1024 * 1024;
export const EXTRACTOR_VERSION = "anydoc@0.1.2";

const SUPPORTED_FORMAT_HINT = "docx, pdf, xlsx, pptx, odt, ods, odp, rtf, epub, csv, html";
const SCANNED_PDF_MESSAGE = /scan(?:ned)?|image[- ]only|no text(?: layer)?|ocr/i;
const HTML_EXTENSIONS = new Set(["html", "htm"]);
const RESOURCE_KINDS = new Set<ResourceRef["kind"]>([
  "local-file",
  "mount",
  "session-file",
  "resource",
  "url",
]);

type ExtractionResourceIO = {
  stat(input: unknown, options?: ResourceOperationContext): Promise<ResourceStat>;
  openRead?: (
    input: unknown,
    readOptions?: ResourceOpenReadOptions,
    options?: ResourceOperationContext,
  ) => Promise<ResourceOpenReadResult>;
  materialize?: (
    input: unknown,
    options?: ResourceOperationContext,
  ) => Promise<MaterializeResult>;
  withMaterialized?: <T>(
    input: unknown,
    use: (materialized: MaterializeResult) => T | Promise<T>,
    options?: ResourceOperationContext,
  ) => Promise<T>;
};

export interface DocumentExtractionServiceOptions {
  resourceIO: ExtractionResourceIO;
  loadApi?: () => Promise<AnydocApi>;
  conversionRunner?: DocumentConversionRunner;
  htmlConversionRunner?: HtmlConversionRunner;
  maxDerivedMarkdownBytes?: number;
  extractorVersion?: string;
}

export class DocumentExtractionService {
  private readonly resourceIO: ExtractionResourceIO;
  private readonly loadApi: () => Promise<AnydocApi>;
  private readonly conversionRunner: DocumentConversionRunner | null;
  private readonly htmlConversionRunner: HtmlConversionRunner;
  private readonly maxDerivedMarkdownBytes: number;
  private readonly extractorVersion: string;

  constructor({
    resourceIO,
    loadApi,
    conversionRunner,
    htmlConversionRunner,
    maxDerivedMarkdownBytes,
    extractorVersion = EXTRACTOR_VERSION,
  }: DocumentExtractionServiceOptions) {
    if (!resourceIO || typeof resourceIO.stat !== "function") {
      throw new TypeError("DocumentExtractionService requires ResourceIO stat authority");
    }
    if (!hasDirectReadAuthority(resourceIO) && !hasMaterializationAuthority(resourceIO)) {
      throw new TypeError("DocumentExtractionService requires ResourceIO openRead or materialization authority");
    }
    this.resourceIO = resourceIO;
    this.loadApi = loadApi ?? loadAnydoc;
    this.maxDerivedMarkdownBytes = normalizeDerivedMarkdownLimit(maxDerivedMarkdownBytes);
    this.conversionRunner = conversionRunner
      ?? (loadApi ? null : new AnydocProcessRunner({
        getModulePath: resolveAnydocModulePath,
        maxOutputBytes: this.maxDerivedMarkdownBytes,
      }));
    this.htmlConversionRunner = htmlConversionRunner ?? new HtmlProcessRunner({
      maxOutputBytes: this.maxDerivedMarkdownBytes,
    });
    this.extractorVersion = extractorVersion;
  }

  async extract(request: DocumentExtractionRequest): Promise<ExtractResult> {
    const resource = extractionResource(request?.resource);
    const signal = request?.signal;
    const context: ResourceOperationContext = {
      ...(request?.context || {}),
      auditRead: request?.context?.auditRead ?? true,
    };

    throwIfAborted(signal);
    let stat: ResourceStat;
    try {
      stat = await this.resourceIO.stat(resource, context);
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw resourceReadError(error);
    }
    throwIfAborted(signal);

    if (!stat.exists) return parseFailed();
    if (stat.isDirectory) return unsupported();

    const reportedSize = sizeFromStat(stat);
    if (reportedSize !== null && reportedSize > MAX_INPUT_BYTES) {
      return tooLarge(reportedSize);
    }

    let api: AnydocApi;
    try {
      api = await this.loadApi();
    } catch (error) {
      if (isAbortError(error)) throw error;
      return parseFailed();
    }
    throwIfAborted(signal);
    const filename = filenameFor(resource, stat.resource, request?.filenameHint);
    try {
      const directResult = await this.convertDirectlyReadable(
        resource,
        context,
        api,
        stat,
        filename,
        signal,
      );
      if (directResult) return directResult;

      if (!hasMaterializationAuthority(this.resourceIO)) return parseFailed();
      return await this.convertMaterialized(
        resource,
        context,
        api,
        filename,
        signal,
      );
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw resourceReadError(error);
    }
  }

  private async convertDirectlyReadable(
    resource: ResourceRef,
    context: ResourceOperationContext,
    api: AnydocApi,
    stat: ResourceStat,
    filename: string | null,
    signal: AbortSignal | undefined,
  ): Promise<ExtractResult | null> {
    const bytes = await this.readAuthorizedBytes(resource, context, stat, signal);
    if (bytes === null) return null;
    if (!Buffer.isBuffer(bytes)) return bytes;

    const format = detectedFormat(api, bytes, filename);
    if (format === "html" || (!format && isHtmlFilename(filename))) {
      return this.convertHtml(bytes, signal);
    }
    if (format) return this.convertBytes(api, bytes, format, signal);
    return unsupported();
  }

  private async readAuthorizedBytes(
    resource: ResourceRef,
    context: ResourceOperationContext,
    stat: ResourceStat,
    signal: AbortSignal | undefined,
  ): Promise<Buffer | ExtractResult | null> {
    if (typeof this.resourceIO.openRead === "function") {
      try {
        const opened = await this.resourceIO.openRead(
          resource,
          boundedOpenReadOptions(stat),
          context,
        );
        return await readOpenedResource(opened, signal);
      } catch (error) {
        if (!isCapabilityDenied(error)) throw error;
      }
    }

    return null;
  }

  private async convertMaterialized(
    resource: ResourceRef,
    context: ResourceOperationContext,
    api: AnydocApi,
    filename: string | null,
    signal: AbortSignal | undefined,
  ): Promise<ExtractResult> {
    return this.withMaterialized(resource, context, async (materialized) => {
      throwIfAborted(signal);
      if (materialized.isDirectory) return unsupported();
      const bytes = await readMaterializedBytes(materialized.filePath, signal);
      if (!Buffer.isBuffer(bytes)) return bytes;

      const materializedFilename = filename || path.basename(materialized.filePath);
      const format = detectedFormat(api, bytes, materializedFilename)
        ?? normalizedFormat(api.formatFromPath?.(materialized.filePath));
      if (format === "html" || (!format && isHtmlFilename(materializedFilename))) {
        return this.convertHtml(bytes, signal);
      }
      if (!format) return unsupported();
      if (!this.conversionRunner && !supportsPathConversion(api)) return parseFailed();
      return this.convertPath(api, materialized.filePath, format, signal);
    });
  }

  private async convertPath(
    api: AnydocApi,
    filePath: string,
    format: string,
    signal: AbortSignal | undefined,
  ): Promise<ExtractResult> {
    try {
      throwIfAborted(signal);
      const markdown = this.conversionRunner
        ? await this.conversionRunner.convertMaterializedPath(filePath, signal)
        : await api.toMarkdown!(filePath);
      throwIfAborted(signal);
      return success(markdown, format, this.extractorVersion, this.maxDerivedMarkdownBytes);
    } catch (error) {
      if (isAbortError(error)) throw error;
      return format === "pdf" && (
        isScannedPdfConversionError(error) || SCANNED_PDF_MESSAGE.test(errorMessage(error))
      )
        ? scannedPdf()
        : parseFailed();
    }
  }

  private async convertBytes(
    api: AnydocApi,
    bytes: Buffer,
    format: string,
    signal: AbortSignal | undefined,
  ): Promise<ExtractResult> {
    try {
      throwIfAborted(signal);
      const markdown = this.conversionRunner
        ? await this.conversionRunner.convertBytes(bytes, format, signal)
        : await api.toMarkdownBytes(bytes, format);
      throwIfAborted(signal);
      return success(markdown, format, this.extractorVersion, this.maxDerivedMarkdownBytes);
    } catch (error) {
      if (isAbortError(error)) throw error;
      return format === "pdf" && (
        isScannedPdfConversionError(error) || SCANNED_PDF_MESSAGE.test(errorMessage(error))
      )
        ? scannedPdf()
        : parseFailed();
    }
  }

  private async convertHtml(
    bytes: Buffer,
    signal: AbortSignal | undefined,
  ): Promise<ExtractResult> {
    try {
      throwIfAborted(signal);
      const markdown = await this.htmlConversionRunner.convertHtml(bytes, signal);
      throwIfAborted(signal);
      return success(markdown, "html", this.extractorVersion, this.maxDerivedMarkdownBytes);
    } catch (error) {
      if (isAbortError(error)) throw error;
      return parseFailed();
    }
  }

  private async withMaterialized<T>(
    resource: ResourceRef,
    context: ResourceOperationContext,
    use: (materialized: MaterializeResult) => Promise<T>,
  ): Promise<T> {
    if (typeof this.resourceIO.withMaterialized === "function") {
      return this.resourceIO.withMaterialized(resource, use, context);
    }
    const materialized = await this.resourceIO.materialize!(resource, context);
    try {
      return await use(materialized);
    } finally {
      if (typeof materialized.cleanup === "function") await materialized.cleanup();
    }
  }
}

export function createDocumentExtractionService(
  options: DocumentExtractionServiceOptions,
): DocumentExtractionService {
  return new DocumentExtractionService(options);
}

export async function extractDocument(
  request: DocumentExtractionRequest,
  options: DocumentExtractionServiceOptions,
): Promise<ExtractResult> {
  return createDocumentExtractionService(options).extract(request);
}

function extractionResource(input: unknown): ResourceRef {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Document extraction requires an authorized ResourceRef");
  }
  const kind = (input as { kind?: unknown }).kind;
  if (typeof kind !== "string" || !RESOURCE_KINDS.has(kind as ResourceRef["kind"])) {
    throw new TypeError("Document extraction requires an authorized ResourceRef");
  }
  return normalizeResourceRef(input);
}

function hasDirectReadAuthority(resourceIO: ExtractionResourceIO): boolean {
  return typeof resourceIO.openRead === "function";
}

function hasMaterializationAuthority(resourceIO: ExtractionResourceIO): boolean {
  return typeof resourceIO.withMaterialized === "function" || typeof resourceIO.materialize === "function";
}

function supportsPathConversion(api: AnydocApi): api is AnydocApi & Required<Pick<AnydocApi, "toMarkdown">> {
  return typeof api.toMarkdown === "function";
}

function sizeFromStat(stat: ResourceStat): number | null {
  const size = stat.version?.size;
  return typeof size === "number" && Number.isSafeInteger(size) && size >= 0 ? size : null;
}

function boundedOpenReadOptions(stat: ResourceStat): ResourceOpenReadOptions {
  const size = sizeFromStat(stat);
  return {
    end: size === null ? MAX_INPUT_BYTES : Math.max(size - 1, 0),
    ...(stat.version ? { expectedVersion: stat.version } : {}),
    ...(stat[RESOURCE_READ_PROOF] ? { [RESOURCE_READ_PROOF]: stat[RESOURCE_READ_PROOF] } : {}),
  };
}

async function readOpenedResource(
  opened: ResourceOpenReadResult,
  signal: AbortSignal | undefined,
): Promise<Buffer | ExtractResult> {
  const chunks: Buffer[] = [];
  let length = 0;
  const knownOversized = opened.size > MAX_INPUT_BYTES;
  for await (const chunk of opened.body) {
    throwIfAborted(signal);
    if (knownOversized) return tooLarge(opened.size);
    const remaining = MAX_INPUT_BYTES - length;
    if (chunk.byteLength > remaining) return tooLarge(length + chunk.byteLength);
    const bytes = Buffer.from(chunk);
    length += bytes.byteLength;
    chunks.push(bytes);
  }
  throwIfAborted(signal);
  if (knownOversized) return tooLarge(opened.size);
  return Buffer.concat(chunks, length);
}

async function readMaterializedBytes(
  filePath: string,
  signal: AbortSignal | undefined,
): Promise<Buffer | ExtractResult> {
  const file = await fs.promises.open(filePath, "r");
  try {
    const metadata = await file.stat();
    if (!metadata.isFile()) return unsupported();
    if (metadata.size > MAX_INPUT_BYTES) return tooLarge(metadata.size);

    const chunks: Buffer[] = [];
    let length = 0;
    while (length <= MAX_INPUT_BYTES) {
      throwIfAborted(signal);
      const bytes = Buffer.allocUnsafe(Math.min(
        64 * 1024,
        MAX_INPUT_BYTES + 1 - length,
      ));
      const { bytesRead } = await file.read(bytes, 0, bytes.byteLength, length);
      if (bytesRead === 0) break;
      length += bytesRead;
      if (length > MAX_INPUT_BYTES) return tooLarge(length);
      chunks.push(bytes.subarray(0, bytesRead));
    }
    throwIfAborted(signal);
    return Buffer.concat(chunks, length);
  } finally {
    await file.close();
  }
}

function detectedFormat(api: AnydocApi, bytes: Buffer, filename: string | null): string | null {
  const fromBytes = normalizedFormat(api.formatFromBytes(bytes));
  if (fromBytes) return fromBytes;
  if (!filename) return null;
  const extension = path.extname(filename).replace(/^\./, "").toLowerCase();
  if (!extension) return null;
  return normalizedFormat(api.formatFromExtension(extension));
}

function normalizedFormat(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function isHtmlFilename(filename: string | null): boolean {
  return Boolean(filename && HTML_EXTENSIONS.has(path.extname(filename).slice(1).toLowerCase()));
}

function filenameFor(
  resource: ResourceRef,
  descriptor: ResourceDescriptor | undefined,
  hint: string | undefined,
): string | null {
  if (typeof hint === "string" && hint.trim()) {
    if (hint.includes("/") || hint.includes("\\")) {
      throw new TypeError("Document extraction filenameHint must not contain a path");
    }
    return hint.trim();
  }
  if (typeof descriptor?.displayName === "string" && descriptor.displayName.trim()) {
    return path.basename(descriptor.displayName.trim());
  }
  if (resource.kind === "local-file") return path.basename(resource.path);
  if (resource.kind === "mount") return path.basename(resource.path);
  if (resource.kind === "url") {
    try {
      return path.basename(new URL(resource.url).pathname);
    } catch {
      return null;
    }
  }
  return null;
}

function success(
  markdown: unknown,
  format: string,
  extractorVersion: string,
  maxDerivedMarkdownBytes: number,
): ExtractResult {
  if (typeof markdown !== "string") return parseFailed();
  if (Buffer.byteLength(markdown, "utf8") > maxDerivedMarkdownBytes) return parseFailed();
  const normalized = normalizeMarkdown(markdown);
  return {
    ok: true,
    markdown: normalized,
    format,
    warnings: normalized.trim() ? [] : ["document parsed successfully but contained no text"],
    extractorVersion,
  };
}

function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function tooLarge(size: number): ExtractResult {
  return {
    ok: false,
    reason: "too-large",
    message: `document is ${size} bytes, above the ${MAX_INPUT_BYTES} byte extraction limit`,
  };
}

function unsupported(): ExtractResult {
  return {
    ok: false,
    reason: "unsupported",
    message: `could not identify a supported document format; supported formats include ${SUPPORTED_FORMAT_HINT}`,
  };
}

function scannedPdf(): ExtractResult {
  return {
    ok: false,
    reason: "scanned-pdf",
    message: "PDF appears to contain no extractable text.",
  };
}

function parseFailed(): ExtractResult {
  return {
    ok: false,
    reason: "parse-failed",
    message: "Document extraction failed.",
  };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof Error && reason.name === "AbortError") throw reason;
  const error = new Error(reason instanceof Error && reason.message ? reason.message : "Document extraction cancelled");
  error.name = "AbortError";
  throw error;
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: unknown })?.name === "AbortError";
}

function isCapabilityDenied(error: unknown): boolean {
  return (error as { code?: unknown })?.code === "capability_denied";
}

function resourceReadError(error: unknown): Error {
  const safe = new Error("Document extraction could not read the authorized resource.");
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string") (safe as Error & { code?: string }).code = code;
  return safe;
}

function errorMessage(error: unknown): string {
  return typeof (error as { message?: unknown })?.message === "string"
    ? (error as { message: string }).message
    : String(error);
}
