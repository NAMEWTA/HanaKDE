import {
  parseKnowledgeResourceAddress,
  type KnowledgeResourceAddress,
} from "../../shared/knowledge-workspace-contract.ts";
import {
  createKnowledgeWorkspaceError,
  isKnowledgeWorkspaceError,
  snapshotOwnData,
  toPublicKnowledgeErrorEnvelope,
} from "../../shared/knowledge-workspace-errors.ts";
import type {
  KnowledgeIndexHealth,
  KnowledgeIndexQueryLease,
} from "./knowledge-index-store.ts";

export const KNOWLEDGE_QUERY_DEFAULT_LIMIT = 50;
export const KNOWLEDGE_QUERY_MAX_LIMIT = 100;

const QUERY_KINDS = new Set([
  "tags",
  "outbound",
  "backlinks",
  "outline",
  "health",
]);
const GENERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const QUERY_FIELDS = Object.freeze({
  tags: new Set([
    "kind",
    "sourceKey",
    "relativePath",
    "tag",
    "generationId",
    "limit",
  ]),
  outbound: new Set(["kind", "address", "generationId", "limit"]),
  backlinks: new Set(["kind", "address", "generationId", "limit"]),
  outline: new Set(["kind", "address", "generationId", "limit"]),
  health: new Set(["kind", "sourceKey"]),
});

type QueryCoordinator = Readonly<{
  acquireQueryLease(sourceKey: string): KnowledgeIndexQueryLease;
  health(sourceKey: string): KnowledgeIndexHealth;
}>;

export type KnowledgeQueryRequest =
  | Readonly<{
    kind: "tags";
    sourceKey: string;
    relativePath?: string;
    tag?: string;
    generationId?: string;
    limit?: number;
  }>
  | Readonly<{
    kind: "outbound";
    address: KnowledgeResourceAddress;
    generationId?: string;
    limit?: number;
  }>
  | Readonly<{
    kind: "backlinks";
    address: KnowledgeResourceAddress;
    generationId?: string;
    limit?: number;
  }>
  | Readonly<{
    kind: "outline";
    address: KnowledgeResourceAddress;
    generationId?: string;
    limit?: number;
  }>
  | Readonly<{
    kind: "health";
    sourceKey: string;
  }>;

export type KnowledgeQueryResult =
  | Readonly<{
    kind: "tags";
    sourceKey: string;
    generationId: string;
    items: readonly Readonly<{
      tag: string;
      origin: "frontmatter" | "body";
      address: KnowledgeResourceAddress;
    }>[];
    hasMore: boolean;
  }>
  | Readonly<{
    kind: "outbound";
    sourceKey: string;
    generationId: string;
    items: readonly Readonly<{
      ordinal: number;
      linkKind: "wikilink" | "embed" | "markdown" | "content-ref";
      targetAddress: KnowledgeResourceAddress | null;
      fragment: string | null;
      fromOffset: number;
      toOffset: number;
    }>[];
    hasMore: boolean;
  }>
  | Readonly<{
    kind: "backlinks";
    sourceKey: string;
    generationId: string;
    items: readonly Readonly<{
      sourceAddress: KnowledgeResourceAddress;
      ordinal: number;
      linkKind: "wikilink" | "embed" | "markdown" | "content-ref";
      fragment: string | null;
      fromOffset: number;
      toOffset: number;
    }>[];
    hasMore: boolean;
  }>
  | Readonly<{
    kind: "outline";
    sourceKey: string;
    generationId: string;
    items: readonly Readonly<{
      ordinal: number;
      level: number;
      text: string;
      slug: string;
      fromOffset: number;
      toOffset: number;
    }>[];
    hasMore: boolean;
  }>
  | Readonly<{
    kind: "health";
    sourceKey: string;
    health: KnowledgeIndexHealth;
  }>;

export function queryKnowledgeIndex<
  Kind extends KnowledgeQueryRequest["kind"],
>(
  coordinator: QueryCoordinator,
  input: Extract<KnowledgeQueryRequest, { kind: Kind }>,
  options?: { signal?: AbortSignal },
): Promise<Extract<KnowledgeQueryResult, { kind: Kind }>>;
export function queryKnowledgeIndex(
  coordinator: QueryCoordinator,
  input: unknown,
  options?: { signal?: AbortSignal },
): Promise<KnowledgeQueryResult>;
export async function queryKnowledgeIndex(
  coordinator: QueryCoordinator,
  input: unknown,
  options: { signal?: AbortSignal } = {},
): Promise<KnowledgeQueryResult> {
  const request = parseKnowledgeQueryRequest(input);
  assertNotAborted(options.signal);
  if (request.kind === "health") {
    try {
      const health = coordinator.health(request.sourceKey);
      assertNotAborted(options.signal);
      return Object.freeze({
        kind: "health",
        sourceKey: request.sourceKey,
        health,
      });
    } catch (error) {
      throw publicQueryError(error);
    }
  }

  let lease: KnowledgeIndexQueryLease | null = null;
  try {
    const sourceKey = request.kind === "tags"
      ? request.sourceKey
      : request.address.sourceKey;
    lease = coordinator.acquireQueryLease(sourceKey);
    if (
      request.generationId !== undefined
      && request.generationId !== lease.generationId
    ) {
      throw createKnowledgeWorkspaceError(
        "knowledge_version_conflict",
        "knowledge query generation changed",
        { state: "stale_generation" },
      );
    }
    const limit = request.limit ?? KNOWLEDGE_QUERY_DEFAULT_LIMIT;
    const rowLimit = limit + 1;
    assertNotAborted(options.signal);

    if (request.kind === "tags") {
      const rows = lease.queryTags({
        ...(request.relativePath === undefined
          ? {}
          : { relativePath: request.relativePath }),
        ...(request.tag === undefined ? {} : { tag: request.tag }),
        limit: rowLimit,
      });
      assertNotAborted(options.signal);
      return Object.freeze({
        kind: "tags",
        sourceKey,
        generationId: lease.generationId,
        items: Object.freeze(rows.slice(0, limit).map((row) => Object.freeze({
          tag: row.tag,
          origin: row.origin,
          address: Object.freeze({
            sourceKey,
            relativePath: row.relativePath,
          }),
        }))),
        hasMore: rows.length > limit,
      });
    }

    if (request.kind === "outline") {
      const rows = lease.queryOutline(request.address.relativePath, rowLimit);
      assertNotAborted(options.signal);
      return Object.freeze({
        kind: "outline",
        sourceKey,
        generationId: lease.generationId,
        items: Object.freeze(rows.slice(0, limit)),
        hasMore: rows.length > limit,
      });
    }

    const rows = request.kind === "outbound"
      ? lease.queryOutbound(request.address.relativePath, rowLimit)
      : lease.queryBacklinks(request.address.relativePath, rowLimit);
    assertNotAborted(options.signal);
    if (request.kind === "outbound") {
      return Object.freeze({
        kind: "outbound",
        sourceKey,
        generationId: lease.generationId,
        items: Object.freeze(rows.slice(0, limit).map((row) => Object.freeze({
          ordinal: row.ordinal,
          linkKind: row.linkKind,
          targetAddress: row.resolvedRelativePath === null
            ? null
            : Object.freeze({
              sourceKey,
              relativePath: row.resolvedRelativePath,
            }),
          fragment: row.fragment,
          fromOffset: row.fromOffset,
          toOffset: row.toOffset,
        }))),
        hasMore: rows.length > limit,
      });
    }
    return Object.freeze({
      kind: "backlinks",
      sourceKey,
      generationId: lease.generationId,
      items: Object.freeze(rows.slice(0, limit).map((row) => Object.freeze({
        sourceAddress: Object.freeze({
          sourceKey,
          relativePath: row.relativePath,
        }),
        ordinal: row.ordinal,
        linkKind: row.linkKind,
        fragment: row.fragment,
        fromOffset: row.fromOffset,
        toOffset: row.toOffset,
      }))),
      hasMore: rows.length > limit,
    });
  } catch (error) {
    throw publicQueryError(error);
  } finally {
    lease?.release();
  }
}

export function parseKnowledgeQueryRequest(
  input: unknown,
): KnowledgeQueryRequest {
  const value = snapshotOwnData(input, 8);
  if (!value || typeof value.kind !== "string" || !QUERY_KINDS.has(value.kind)) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "knowledge query kind is invalid",
      { field: "kind" },
    );
  }
  const kind = value.kind as keyof typeof QUERY_FIELDS;
  for (const field of Object.keys(value)) {
    if (!QUERY_FIELDS[kind].has(field)) {
      throw createKnowledgeWorkspaceError(
        "knowledge_operation_precondition_failed",
        "knowledge query field is invalid",
        { field },
      );
    }
  }
  if (kind === "health") {
    return Object.freeze({
      kind,
      sourceKey: parseSourceKey(value.sourceKey),
    });
  }
  const generationId = optionalGenerationId(value.generationId);
  const limit = optionalLimit(value.limit);
  if (kind === "tags") {
    const sourceKey = parseSourceKey(value.sourceKey);
    const relativePath = value.relativePath === undefined
      ? undefined
      : parseAddress({
        sourceKey,
        relativePath: value.relativePath,
      }).relativePath;
    const tag = optionalTag(value.tag);
    return Object.freeze({
      kind,
      sourceKey,
      ...(relativePath === undefined ? {} : { relativePath }),
      ...(tag === undefined ? {} : { tag }),
      ...(generationId === undefined ? {} : { generationId }),
      ...(limit === undefined ? {} : { limit }),
    });
  }
  const address = parseAddress(value.address);
  return Object.freeze({
    kind,
    address,
    ...(generationId === undefined ? {} : { generationId }),
    ...(limit === undefined ? {} : { limit }),
  });
}

function parseAddress(value: unknown): KnowledgeResourceAddress {
  const parsed = parseKnowledgeResourceAddress(value);
  if (parsed.ok === false) throw parsed.error;
  return Object.freeze(parsed.value);
}

function parseSourceKey(value: unknown): string {
  return parseAddress({
    sourceKey: value,
    relativePath: "__knowledge_query__",
  }).sourceKey;
}

function optionalGenerationId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !GENERATION_ID_PATTERN.test(value)) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "knowledge query generation is invalid",
      { field: "generationId" },
    );
  }
  return value;
}

function optionalLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "number"
    || !Number.isInteger(value)
    || value < 1
    || value > KNOWLEDGE_QUERY_MAX_LIMIT
  ) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "knowledge query limit is invalid",
      {
        field: "limit",
        limit: KNOWLEDGE_QUERY_MAX_LIMIT,
        ...(typeof value === "number" && Number.isFinite(value) && value >= 0
          ? { actual: value }
          : {}),
      },
    );
  }
  return value;
}

function optionalTag(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "knowledge query tag is invalid",
      { field: "tag" },
    );
  }
  const tag = value.normalize("NFC").trim();
  if (
    tag.length === 0
    || Array.from(tag).length > 512
    || /\p{Cc}/u.test(tag)
  ) {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "knowledge query tag is invalid",
      { field: "tag" },
    );
  }
  return tag;
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw Object.assign(new Error("knowledge query aborted"), {
    name: "AbortError",
    code: "ABORT_ERR",
  });
}

function publicQueryError(error: unknown): unknown {
  if (
    isKnowledgeWorkspaceError(error)
    || toPublicKnowledgeErrorEnvelope(error)
    || (
      error instanceof Error
      && error.name === "AbortError"
      && (error as Error & { code?: unknown }).code === "ABORT_ERR"
    )
  ) {
    return error;
  }
  return createKnowledgeWorkspaceError(
    "knowledge_index_unavailable",
    "knowledge index query is unavailable",
  );
}
