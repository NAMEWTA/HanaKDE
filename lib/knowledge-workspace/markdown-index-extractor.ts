import crypto from "node:crypto";
import path from "node:path";
import {
  type KnowledgeIndexContentState,
  type KnowledgeIndexResourceDocument,
  foldSearchText,
} from "./knowledge-index-store.ts";
import {
  uniqueMarkdownHeadingId,
} from "./markdown-heading-slug.ts";
import {
  parseMarkdownKnowledgeIr,
  type MarkdownFrontmatterToken,
  type MarkdownKnowledgeIr,
  type MarkdownTaskMarkerToken,
} from "./markdown-knowledge-ir.ts";
import {
  projectFrontmatterFromToken,
  type FrontmatterEditableValue,
} from "./frontmatter-projection.ts";
import {
  canonicalKnowledgeRelativePath,
} from "./knowledge-address.ts";
import {
  resolveKnowledgeMarkdownDestination,
  resolveKnowledgeWikilink,
} from "./link-resolver.ts";

export const MARKDOWN_INDEX_MAX_BYTES = 10 * 1024 * 1024;
export const MARKDOWN_INDEX_EXTRACTOR_CONTRACT_VERSION = "markdown-index-v1";

export type MarkdownIndexContentAvailability =
  | "available"
  | "missing"
  | "permission-denied"
  | "source-unavailable";

export type ExtractSavedMarkdownIndexFactsInput = Readonly<{
  relativePath: string;
  sizeBytes: number;
  mtimeMs: number;
  versionToken: string;
  indexedAtMs: number;
  contentAvailability?: MarkdownIndexContentAvailability;
  /**
   * Server-only seam. Callers must implement this with ResourceIO after stat
   * and pass the stat version as the expected version. Renderer buffers are
   * deliberately not accepted by this contract.
   */
  readSavedContent: (expectedVersionToken: string) => Promise<Uint8Array>;
  signal?: AbortSignal;
}>;

export class MarkdownIndexVersionConflictError extends Error {
  readonly code = "resource_version_conflict";

  constructor() {
    super("saved Markdown content changed while it was being read");
    this.name = "MarkdownIndexVersionConflictError";
  }
}

export async function extractSavedMarkdownIndexFacts(
  input: ExtractSavedMarkdownIndexFactsInput,
): Promise<KnowledgeIndexResourceDocument> {
  const metadata = validateInput(input);
  throwIfAborted(input.signal);
  const availability = input.contentAvailability ?? "available";
  if (availability === "missing") {
    return metadataOnlyDocument(metadata, "missing", "missing");
  }
  if (availability === "permission-denied") {
    return metadataOnlyDocument(
      metadata,
      "rejected",
      "permission_denied",
    );
  }
  if (availability === "source-unavailable") {
    return metadataOnlyDocument(
      metadata,
      "rejected",
      "source_unavailable",
    );
  }
  if (metadata.sizeBytes > MARKDOWN_INDEX_MAX_BYTES) {
    return metadataOnlyDocument(metadata, "rejected", "too_large");
  }

  const bytes = await input.readSavedContent(input.versionToken);
  throwIfAborted(input.signal);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== metadata.sizeBytes) {
    throw new MarkdownIndexVersionConflictError();
  }
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return metadataOnlyDocument(metadata, "rejected", "invalid_utf8");
  }
  if (source.startsWith("\ufeff")) source = source.slice(1);
  throwIfAborted(input.signal);

  const ir = parseMarkdownKnowledgeIr(source, { signal: input.signal });
  const frontmatterToken = ir.tokens.find(
    (token): token is MarkdownFrontmatterToken =>
      token.kind === "frontmatter",
  );
  const projection = projectFrontmatterFromToken(
    source,
    frontmatterToken ?? null,
  );
  const frontmatterJson = projection.mode === "properties"
    ? JSON.stringify(Object.fromEntries(
        projection.fields.map((field) => [field.key, field.value]),
      ))
    : null;
  const metadataText = frontmatterToken
    ? source.slice(
        frontmatterToken.contentRange.from,
        frontmatterToken.contentRange.to,
      )
    : "";
  const bodyText = frontmatterToken
    ? source.slice(frontmatterToken.range.to).replace(/^(?:\r\n|\r|\n)/, "")
    : source;
  const title = metadata.basename.slice(0, -metadata.extension.length);
  const headings = extractHeadings(ir);
  const links = extractLinks(metadata.relativePath, ir);
  const tags = extractTags(source, ir, frontmatterToken);
  const tasks = extractTasks(source, ir);

  return {
    resource: {
      ...metadata,
      kind: "page",
      contentState: "indexed",
      contentReason: null,
    },
    page: {
      title,
      frontmatterJson,
      bodyText,
      bodyHash: crypto.createHash("sha256").update(bodyText).digest("hex"),
    },
    headings,
    links,
    tags,
    tasks,
    search: {
      titleFold: foldSearchText(title),
      pathFold: foldSearchText(metadata.relativePath),
      metadataFold: foldSearchText([
        metadataText,
        ...tags.map((tag) => tag.tag),
      ].filter(Boolean).join("\n")),
      bodyFold: foldSearchText(bodyText),
    },
  };
}

type ValidatedMetadata =
  KnowledgeIndexResourceDocument["resource"] extends infer Resource
    ? Omit<
        Extract<Resource, object>,
        "kind" | "contentState" | "contentReason"
      >
    : never;

function validateInput(
  input: ExtractSavedMarkdownIndexFactsInput,
): ValidatedMetadata {
  if (!input || typeof input !== "object") {
    throw new TypeError("saved Markdown index input is required");
  }
  const canonical = canonicalKnowledgeRelativePath(input.relativePath);
  if (!canonical.ok || canonical.value !== input.relativePath) {
    throw new TypeError("saved Markdown relativePath must be canonical");
  }
  const basename = path.posix.basename(input.relativePath);
  if (!/\.md$/iu.test(basename)) {
    throw new TypeError("saved Markdown relativePath must end in .md");
  }
  if (
    !Number.isSafeInteger(input.sizeBytes)
    || input.sizeBytes < 0
    || !Number.isFinite(input.mtimeMs)
    || typeof input.versionToken !== "string"
    || input.versionToken.length === 0
    || !Number.isSafeInteger(input.indexedAtMs)
    || typeof input.readSavedContent !== "function"
  ) {
    throw new TypeError("saved Markdown metadata is invalid");
  }
  if (
    input.contentAvailability !== undefined
    && ![
      "available",
      "missing",
      "permission-denied",
      "source-unavailable",
    ].includes(
      input.contentAvailability,
    )
  ) {
    throw new TypeError("saved Markdown availability is invalid");
  }
  return {
    relativePath: input.relativePath,
    parentPath: path.posix.dirname(input.relativePath) === "."
      ? ""
      : path.posix.dirname(input.relativePath),
    basename,
    extension: basename.slice(-3),
    sizeBytes: input.sizeBytes,
    mtimeMs: input.mtimeMs,
    versionToken: input.versionToken,
    indexedAtMs: input.indexedAtMs,
  };
}

function metadataOnlyDocument(
  metadata: ValidatedMetadata,
  contentState: Exclude<KnowledgeIndexContentState, "indexed">,
  contentReason: string,
): KnowledgeIndexResourceDocument {
  const title = metadata.basename.slice(0, -metadata.extension.length);
  return {
    resource: {
      ...metadata,
      kind: "page",
      contentState,
      contentReason,
    },
    page: null,
    headings: [],
    links: [],
    tags: [],
    tasks: [],
    search: {
      titleFold: foldSearchText(title),
      pathFold: foldSearchText(metadata.relativePath),
      metadataFold: "",
      bodyFold: "",
    },
  };
}

function extractHeadings(
  ir: MarkdownKnowledgeIr,
): KnowledgeIndexResourceDocument["headings"] {
  const seen = new Map<string, number>();
  let ordinal = 0;
  return ir.tokens.flatMap((token) => {
    if (token.kind !== "heading") return [];
    const heading = {
      ordinal,
      level: token.level,
      text: token.text,
      slug: uniqueMarkdownHeadingId(token.text, seen),
      fromOffset: token.range.from,
      toOffset: token.range.to,
    };
    ordinal += 1;
    return [heading];
  });
}

function extractLinks(
  relativePath: string,
  ir: MarkdownKnowledgeIr,
): KnowledgeIndexResourceDocument["links"] {
  const page = { sourceKey: "index-source", relativePath };
  const links: Array<KnowledgeIndexResourceDocument["links"][number]> = [];
  let ordinal = 0;
  for (const token of ir.tokens) {
    if (token.kind === "wikilink") {
      const resolution = resolveKnowledgeWikilink(page, {
        address: token.address,
        ...(token.fragment === undefined
          ? {}
          : { fragment: token.fragment }),
      });
      const link = {
        ordinal,
        linkKind: token.embedded
          ? "embed" as const
          : token.display !== undefined
            ? "content-ref" as const
            : "wikilink" as const,
        rawTarget: token.address,
        resolvedRelativePath: resolution.kind === "internal"
          ? resolution.address.relativePath
          : null,
        fragment: resolution.kind === "internal"
          ? resolution.fragment
          : null,
        fromOffset: token.range.from,
        toOffset: token.range.to,
      };
      ordinal += 1;
      links.push(link);
      continue;
    }
    if (token.kind === "markdown_link") {
      const resolution = resolveKnowledgeMarkdownDestination(
        page,
        token.destination,
      );
      const link = {
        ordinal,
        linkKind: token.embedded ? "embed" as const : "markdown" as const,
        rawTarget: token.destination,
        resolvedRelativePath: resolution.kind === "internal"
          ? resolution.address.relativePath
          : null,
        fragment: resolution.kind === "internal"
          ? resolution.fragment
          : null,
        fromOffset: token.range.from,
        toOffset: token.range.to,
      };
      ordinal += 1;
      links.push(link);
    }
  }
  return links;
}

function extractTags(
  source: string,
  ir: MarkdownKnowledgeIr,
  frontmatterToken: MarkdownFrontmatterToken | undefined,
): KnowledgeIndexResourceDocument["tags"] {
  const tags: { tag: string; origin: "frontmatter" | "body" }[] = [];
  const seen = new Set<string>();
  const add = (raw: string, origin: "frontmatter" | "body"): void => {
    const tag = normalizeTag(raw);
    const key = `${origin}\0${tag ?? ""}`;
    if (!tag || seen.has(key)) return;
    seen.add(key);
    tags.push({ tag, origin });
  };
  const projection = projectFrontmatterFromToken(
    source,
    frontmatterToken ?? null,
  );
  if (projection.mode === "properties") {
    const value = projection.fields.find((field) => field.key === "tags")
      ?.value;
    for (const tag of frontmatterTags(value)) add(tag, "frontmatter");
  }
  for (const token of ir.tokens) {
    if (token.kind === "tag") add(token.tag, "body");
  }
  return tags;
}

function frontmatterTags(
  value: FrontmatterEditableValue | undefined,
): readonly string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return value as readonly string[];
  }
  return [];
}

function normalizeTag(raw: string): string | null {
  const tag = raw.normalize("NFC").trim();
  return tag.length > 0 && !/\p{Cc}/u.test(tag) ? tag : null;
}

function extractTasks(
  source: string,
  ir: MarkdownKnowledgeIr,
): KnowledgeIndexResourceDocument["tasks"] {
  let ordinal = 0;
  return ir.tokens.flatMap((token) => {
    if (token.kind !== "task_marker") return [];
    const lineEnd = findLineEnd(source, token);
    const task = {
      ordinal,
      checked: token.checked,
      text: source.slice(token.markerRange.to, lineEnd).trim(),
      fromOffset: token.markerRange.from,
      toOffset: lineEnd,
    };
    ordinal += 1;
    return [task];
  });
}

function findLineEnd(source: string, token: MarkdownTaskMarkerToken): number {
  for (let index = token.markerRange.to; index < source.length; index += 1) {
    if (source[index] === "\r" || source[index] === "\n") return index;
  }
  return source.length;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("saved Markdown index extraction aborted");
  error.name = "AbortError";
  throw error;
}
