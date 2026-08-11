import path from "node:path";
import type {
  DocumentExtractionRequest,
  DocumentExtractionService,
  ExtractResult,
} from "../document-extract/index.ts";
import { EXTRACTOR_VERSION } from "../document-extract/index.ts";
import type { ResourceIO } from "../resource-io/resource-io.ts";
import type { ResourceRef, ResourceVersion } from "../resource-io/types.ts";
import {
  canonicalKnowledgeRelativePath,
} from "./knowledge-address.ts";
import {
  type KnowledgeIndexContentState,
  type KnowledgeIndexResourceDocument,
  type KnowledgeIndexResourceKind,
  foldSearchText,
} from "./knowledge-index-store.ts";
import {
  extractDerivedMarkdownIndexFacts,
} from "./markdown-index-extractor.ts";

export const DOCUMENT_INDEX_EXTRACTOR_CONTRACT_VERSION =
  `document-index-v1+${EXTRACTOR_VERSION}`;

export type DocumentIndexExtractionPort = Pick<DocumentExtractionService, "extract">;

export type ExtractDocumentIndexFactsInput = Readonly<{
  resourceIO: Pick<ResourceIO, "stat">;
  extraction: DocumentIndexExtractionPort;
  resource: ResourceRef;
  relativePath: string;
  indexedAtMs: number;
  signal?: AbortSignal;
}>;

export class DocumentIndexVersionConflictError extends Error {
  readonly code = "resource_version_conflict";

  constructor() {
    super("document changed while it was being extracted");
    this.name = "DocumentIndexVersionConflictError";
  }
}

const CANONICAL_DOCUMENT_EXTENSIONS = new Set([
  ".docx",
  ".xlsx",
  ".xlsm",
  ".pptx",
  ".odt",
  ".ods",
  ".odp",
  ".rtf",
  ".epub",
  ".pdf",
]);

export function isCanonicalDocumentPath(relativePath: string): boolean {
  return CANONICAL_DOCUMENT_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase());
}

export async function extractDocumentIndexFacts(
  input: ExtractDocumentIndexFactsInput,
): Promise<KnowledgeIndexResourceDocument | null> {
  const identity = validateInput(input);
  if (!isCanonicalDocumentPath(identity.relativePath)) return null;
  const stat = await input.resourceIO.stat(input.resource, {
    auditRead: true,
    reason: "knowledge-index-document-stat",
  });
  throwIfAborted(input.signal);
  const kind = resourceKind(identity.extension);
  if (!stat.exists) {
    return metadataDocument(identity, kind, "missing", "resource_missing", input.indexedAtMs);
  }
  if (stat.isDirectory) {
    return metadataDocument(identity, kind, "rejected", "not_a_file", input.indexedAtMs);
  }
  const sizeBytes = stat.version?.size;
  const mtimeMs = stat.version?.mtimeMs;
  if (!validSize(sizeBytes) || !validMtime(mtimeMs)) {
    return metadataDocument(
      { ...identity, sizeBytes: validSize(sizeBytes) ? sizeBytes : 0, mtimeMs: validMtime(mtimeMs) ? mtimeMs : 0 },
      kind,
      "rejected",
      "content_size_unavailable",
      input.indexedAtMs,
    );
  }

  const resourceVersionToken = versionToken(stat.version);
  let result: ExtractResult;
  try {
    const request: DocumentExtractionRequest = {
      resource: input.resource,
      filenameHint: identity.basename,
      signal: input.signal,
      context: {
        auditRead: true,
        reason: "knowledge-index-document-extract",
      },
    };
    result = await input.extraction.extract(request);
  } catch (error) {
    if (isAbortError(error)) throw error;
    return metadataDocument(
      { ...identity, sizeBytes, mtimeMs, versionToken: resourceVersionToken },
      kind,
      "rejected",
      "extraction_unavailable",
      input.indexedAtMs,
    );
  }
  throwIfAborted(input.signal);
  const current = await input.resourceIO.stat(input.resource, {
    auditRead: true,
    reason: "knowledge-index-document-version",
  });
  if (versionToken(current.version) !== resourceVersionToken) {
    throw new DocumentIndexVersionConflictError();
  }
  const versionedToken = JSON.stringify({
    resource: resourceVersionToken,
    extractor: result.ok ? result.extractorVersion : DOCUMENT_INDEX_EXTRACTOR_CONTRACT_VERSION,
  });
  const metadata = {
    ...identity,
    sizeBytes,
    mtimeMs,
    versionToken: versionedToken,
  };
  if (result.ok === false) {
    return metadataDocument(
      metadata,
      kind,
      "rejected",
      `document_${result.reason.replace(/-/g, "_")}`,
      input.indexedAtMs,
    );
  }
  return extractDerivedMarkdownIndexFacts({
    ...metadata,
    indexedAtMs: input.indexedAtMs,
    markdown: result.markdown,
    kind,
    signal: input.signal,
  });
}

type ResourceIdentity = Readonly<{
  relativePath: string;
  parentPath: string;
  basename: string;
  extension: string;
}>;

function validateInput(input: ExtractDocumentIndexFactsInput): ResourceIdentity {
  if (!input || typeof input !== "object" || !input.resourceIO || !input.extraction) {
    throw new TypeError("document index extraction input is invalid");
  }
  const canonical = canonicalKnowledgeRelativePath(input.relativePath);
  if (!canonical.ok || canonical.value !== input.relativePath) {
    throw new TypeError("document index relativePath must be canonical");
  }
  if (!Number.isSafeInteger(input.indexedAtMs) || input.indexedAtMs < 0) {
    throw new TypeError("document index indexedAtMs is invalid");
  }
  const basename = path.posix.basename(input.relativePath);
  return {
    relativePath: input.relativePath,
    parentPath: path.posix.dirname(input.relativePath) === "." ? "" : path.posix.dirname(input.relativePath),
    basename,
    extension: path.posix.extname(basename),
  };
}

function resourceKind(extension: string): KnowledgeIndexResourceKind {
  return extension.toLowerCase() === ".pdf" ? "pdf" : "binary";
}

function metadataDocument(
  identity: ResourceIdentity & Partial<Pick<KnowledgeIndexResourceDocument["resource"], "sizeBytes" | "mtimeMs" | "versionToken">>,
  kind: KnowledgeIndexResourceKind,
  contentState: Exclude<KnowledgeIndexContentState, "indexed">,
  contentReason: string,
  indexedAtMs: number,
): KnowledgeIndexResourceDocument {
  const title = identity.basename.slice(0, -identity.extension.length) || identity.basename;
  return {
    resource: {
      ...identity,
      sizeBytes: identity.sizeBytes ?? 0,
      mtimeMs: identity.mtimeMs ?? 0,
      versionToken: identity.versionToken ?? "missing",
      kind,
      contentState,
      contentReason,
      indexedAtMs,
    },
    page: null,
    headings: [],
    links: [],
    tags: [],
    tasks: [],
    search: {
      titleFold: foldSearchText(title),
      pathFold: foldSearchText(identity.relativePath),
      metadataFold: "",
      bodyFold: "",
    },
  };
}

function versionToken(version?: ResourceVersion): string {
  return JSON.stringify({
    mtimeMs: version?.mtimeMs ?? null,
    size: version?.size ?? null,
    sha256: version?.sha256 ?? null,
    etag: version?.etag ?? null,
    sequence: version?.sequence ?? null,
  });
}

function validSize(value: number | null | undefined): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function validMtime(value: number | undefined): value is number {
  return Number.isFinite(value) && Number(value) >= 0;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("document index extraction aborted");
  error.name = "AbortError";
  throw error;
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { name?: unknown }).name === "AbortError");
}
