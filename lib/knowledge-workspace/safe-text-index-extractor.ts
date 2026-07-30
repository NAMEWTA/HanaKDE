import path from "node:path";
import type { ResourceIO } from "../resource-io/resource-io.ts";
import type {
  ResourceRef,
  ResourceVersion,
} from "../resource-io/types.ts";
import {
  KNOWLEDGE_ASSET_MAX_BYTES,
  decodeSafeAssetText,
  evaluateResourceOpenPolicy,
  type ResourceOpenPolicyDecision,
} from "./resource-open-policy.ts";
import {
  type KnowledgeIndexContentState,
  type KnowledgeIndexResourceDocument,
  type KnowledgeIndexResourceKind,
  foldSearchText,
} from "./knowledge-index-store.ts";
import {
  canonicalKnowledgeRelativePath,
} from "./knowledge-address.ts";

export const SAFE_TEXT_INDEX_MAX_BYTES = KNOWLEDGE_ASSET_MAX_BYTES;
export const SAFE_TEXT_INDEX_EXTRACTOR_CONTRACT_VERSION = "safe-text-index-v1";

export type SafeTextIndexResourceIO = Pick<ResourceIO, "stat" | "openRead">;

export type ExtractSafeTextIndexFactsInput = Readonly<{
  resourceIO: SafeTextIndexResourceIO;
  resource: ResourceRef;
  relativePath: string;
  indexedAtMs: number;
  signal?: AbortSignal;
}>;

export class SafeTextIndexVersionConflictError extends Error {
  readonly code = "resource_version_conflict";

  constructor() {
    super("safe text resource changed while it was being read");
    this.name = "SafeTextIndexVersionConflictError";
  }
}

export async function extractSafeTextIndexFacts(
  input: ExtractSafeTextIndexFactsInput,
): Promise<KnowledgeIndexResourceDocument> {
  const identity = validateInput(input);
  throwIfAborted(input.signal);
  const stat = await input.resourceIO.stat(input.resource, {
    auditRead: true,
    reason: "knowledge-index-stat",
  });
  throwIfAborted(input.signal);

  if (!stat.exists) {
    return metadataDocument({
      ...identity,
      sizeBytes: 0,
      mtimeMs: 0,
      versionToken: "missing",
      contentState: "missing",
      contentReason: "resource_missing",
      indexedAtMs: input.indexedAtMs,
    });
  }
  const sizeBytes = stat.version?.size;
  const mtimeMs = stat.version?.mtimeMs;
  const classification = classifyAtMetadataBoundary(identity.basename);
  const kind = indexKind(identity.basename, classification);
  if (stat.isDirectory) {
    return metadataDocument({
      ...identity,
      kind,
      sizeBytes: validSize(sizeBytes) ? sizeBytes : 0,
      mtimeMs: validMtime(mtimeMs) ? mtimeMs : 0,
      versionToken: versionToken(stat.version),
      contentState: "rejected",
      contentReason: "not_a_file",
      indexedAtMs: input.indexedAtMs,
    });
  }
  if (!validSize(sizeBytes) || !validMtime(mtimeMs)) {
    return metadataDocument({
      ...identity,
      kind,
      sizeBytes: validSize(sizeBytes) ? sizeBytes : 0,
      mtimeMs: validMtime(mtimeMs) ? mtimeMs : 0,
      versionToken: versionToken(stat.version),
      contentState: "rejected",
      contentReason: "content_size_unavailable",
      indexedAtMs: input.indexedAtMs,
    });
  }

  const metadata = {
    ...identity,
    kind,
    sizeBytes,
    mtimeMs,
    versionToken: versionToken(stat.version),
    indexedAtMs: input.indexedAtMs,
  };
  if (sizeBytes > SAFE_TEXT_INDEX_MAX_BYTES) {
    return metadataDocument({
      ...metadata,
      contentState: "rejected",
      contentReason: "content_too_large",
    });
  }
  if (classification.kind === "file-info") {
    const intentionallyMetadataOnly =
      classification.reason === "unsupported_type";
    return metadataDocument({
      ...metadata,
      contentState: intentionallyMetadataOnly ? "metadata-only" : "rejected",
      contentReason: classification.reason ?? "unsupported_type",
    });
  }
  if (classification.kind !== "text") {
    return metadataDocument({
      ...metadata,
      contentState: "metadata-only",
      contentReason: `${classification.kind}_metadata_only`,
    });
  }

  const opened = await input.resourceIO.openRead(
    input.resource,
    { expectedVersion: stat.version },
    {
      auditRead: true,
      reason: "knowledge-index-content",
    },
  );
  throwIfAborted(input.signal);
  if (
    opened.size !== sizeBytes
    || versionToken(opened.version) !== metadata.versionToken
  ) {
    throw new SafeTextIndexVersionConflictError();
  }
  const bytes = await readExactBody(
    opened.body,
    sizeBytes,
    input.signal,
  );
  const decoded = decodeSafeAssetText(bytes);
  if (decoded.ok === false) {
    return metadataDocument({
      ...metadata,
      contentState: "rejected",
      contentReason: decoded.reason,
    });
  }
  return {
    resource: {
      ...metadata,
      contentState: "indexed",
      contentReason: null,
    },
    page: null,
    headings: [],
    links: [],
    tags: [],
    tasks: [],
    search: {
      titleFold: foldSearchText(identity.basename),
      pathFold: foldSearchText(identity.relativePath),
      metadataFold: "",
      bodyFold: foldSearchText(decoded.content),
    },
  };
}

type ResourceIdentity = Readonly<{
  relativePath: string;
  parentPath: string;
  basename: string;
  extension: string;
}>;

function validateInput(input: ExtractSafeTextIndexFactsInput): ResourceIdentity {
  if (
    !input
    || typeof input !== "object"
    || !input.resourceIO
    || typeof input.resourceIO.stat !== "function"
    || typeof input.resourceIO.openRead !== "function"
    || !input.resource
    || typeof input.resource !== "object"
    || !Number.isSafeInteger(input.indexedAtMs)
  ) {
    throw new TypeError("safe text index input is invalid");
  }
  const canonical = canonicalKnowledgeRelativePath(input.relativePath);
  if (!canonical.ok || canonical.value !== input.relativePath) {
    throw new TypeError("safe text index relativePath must be canonical");
  }
  const basename = path.posix.basename(input.relativePath);
  if (/\.md$/iu.test(basename)) {
    throw new TypeError("safe text index extractor does not accept Markdown");
  }
  const dot = basename.lastIndexOf(".");
  return {
    relativePath: input.relativePath,
    parentPath: path.posix.dirname(input.relativePath) === "."
      ? ""
      : path.posix.dirname(input.relativePath),
    basename,
    extension: dot < 0 ? "" : basename.slice(dot),
  };
}

function classifyAtMetadataBoundary(
  basename: string,
): ResourceOpenPolicyDecision {
  return evaluateResourceOpenPolicy({
    fileName: basename,
    exists: true,
    isDirectory: false,
    sizeBytes: 0,
  });
}

function indexKind(
  basename: string,
  classification: ResourceOpenPolicyDecision,
): KnowledgeIndexResourceKind {
  if (
    classification.kind === "text"
    || classification.kind === "image"
    || classification.kind === "pdf"
    || classification.kind === "audio"
    || classification.kind === "video"
  ) {
    return classification.kind;
  }
  const extension = basename.split(".").at(-1)?.toLowerCase() ?? "";
  if (["lnk", "url", "uri", "webloc", "desktop"].includes(extension)) {
    return "link";
  }
  if (["svg", "svgz"].includes(extension)) return "image";
  if (["html", "htm", "xhtml", "mmd", "mermaid"].includes(extension)) {
    return "text";
  }
  return "binary";
}

function metadataDocument(
  metadata: ResourceIdentity & Readonly<{
    kind?: KnowledgeIndexResourceKind;
    sizeBytes: number;
    mtimeMs: number;
    versionToken: string;
    contentState: Exclude<KnowledgeIndexContentState, "indexed">;
    contentReason: string;
    indexedAtMs: number;
  }>,
): KnowledgeIndexResourceDocument {
  return {
    resource: {
      ...metadata,
      kind: metadata.kind ?? "unknown",
    },
    page: null,
    headings: [],
    links: [],
    tags: [],
    tasks: [],
    search: {
      titleFold: foldSearchText(metadata.basename),
      pathFold: foldSearchText(metadata.relativePath),
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

async function readExactBody(
  body: AsyncIterable<Uint8Array>,
  expectedBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let received = 0;
  for await (const chunk of body) {
    throwIfAborted(signal);
    if (!(chunk instanceof Uint8Array)) {
      throw new SafeTextIndexVersionConflictError();
    }
    received += chunk.byteLength;
    if (received > expectedBytes) {
      throw new SafeTextIndexVersionConflictError();
    }
    chunks.push(chunk);
  }
  throwIfAborted(signal);
  if (received !== expectedBytes) {
    throw new SafeTextIndexVersionConflictError();
  }
  const result = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("safe text index extraction aborted");
  error.name = "AbortError";
  throw error;
}
