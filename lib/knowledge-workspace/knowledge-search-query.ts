import {
  createKnowledgeWorkspaceError,
  isKnowledgeWorkspaceError,
  toKnowledgeErrorEnvelope,
  type KnowledgeErrorCode,
} from "../../shared/knowledge-workspace-errors.ts";
import {
  foldSearchText,
  type KnowledgeIndexQueryLease,
  type KnowledgeIndexResourceKind,
  type KnowledgeIndexSearchQueryRow,
} from "./knowledge-index-store.ts";

export const KNOWLEDGE_SEARCH_DEFAULT_LIMIT = 50;
export const KNOWLEDGE_SEARCH_MAX_LIMIT = 100;
export const KNOWLEDGE_SEARCH_MAX_QUERY_CODE_POINTS = 512;
export const KNOWLEDGE_SEARCH_MAX_SNIPPETS = 3;
export const KNOWLEDGE_SEARCH_MAX_SNIPPET_CODE_POINTS = 240;
const SEARCH_BATCH_SIZE = 256;
// Keep broad/short-term searches responsive. The cursor still exposes more
// results within this bounded candidate window without allowing an unindexed
// term to turn every renderer request into a full 100k-row scan.
const SEARCH_MAX_CANDIDATES = 1_250;
const SEARCH_SORT_KEY = "score-desc,path-byte,resource-id";

export type KnowledgeSearchSource = Readonly<{
  sourceKey: string;
  displayName: string;
  availability: string;
}>;

type SearchCoordinator = Readonly<{
  acquireQueryLease(sourceKey: string): KnowledgeIndexQueryLease;
}>;

export type KnowledgeSearchRequest = Readonly<{
  query: string;
  limit?: number;
  cursors?: Readonly<Record<string, string>>;
  scope?: Readonly<{
    kind: "tag";
    sourceKey: string;
  }>;
}>;

export type KnowledgeSearchSnippet = Readonly<{
  field: "title" | "path" | "metadata" | "body";
  text: string;
}>;

export type KnowledgeSearchItem = Readonly<{
  address: Readonly<{ sourceKey: string; relativePath: string }>;
  title: string;
  kind: KnowledgeIndexResourceKind;
  score: number;
  snippets: readonly KnowledgeSearchSnippet[];
}>;

export type KnowledgeSearchGroup =
  | Readonly<{
    state: "ready";
    sourceKey: string;
    displayName: string;
    generationId: string;
    items: readonly KnowledgeSearchItem[];
    nextCursor: string | null;
  }>
  | Readonly<{
    state: "error";
    sourceKey: string;
    displayName: string;
    error: Readonly<{
      code: KnowledgeErrorCode;
      httpStatus: number;
      retryable: boolean;
      details?: Readonly<Record<string, unknown>>;
    }>;
  }>;

export type KnowledgeSearchResult = Readonly<{
  query: string;
  scope: KnowledgeSearchRequest["scope"] | null;
  groups: readonly KnowledgeSearchGroup[];
}>;

type SearchExpression = readonly (readonly string[])[];

export async function searchKnowledgeIndex(
  coordinator: SearchCoordinator,
  input: unknown,
  options: {
    sources: readonly KnowledgeSearchSource[];
    signal?: AbortSignal;
  },
): Promise<KnowledgeSearchResult> {
  const request = parseKnowledgeSearchRequest(input);
  assertNotAborted(options.signal);
  const expression = lexSearchExpression(request.query);
  const normalizedQuery = JSON.stringify(expression);
  const sources = request.scope
    ? options.sources.filter((source) => source.sourceKey === request.scope!.sourceKey)
    : options.sources;
  if (request.scope && sources.length !== 1) {
    throw createKnowledgeWorkspaceError(
      "knowledge_resource_out_of_scope",
      "knowledge search tag scope is outside the active source session",
      { field: "scope.sourceKey" },
    );
  }
  if (
    request.cursors
    && Object.keys(request.cursors).some((sourceKey) =>
      !sources.some((source) => source.sourceKey === sourceKey)
    )
  ) {
    throw createKnowledgeWorkspaceError(
      "knowledge_resource_out_of_scope",
      "knowledge search cursor is outside the active source session",
      { field: "cursors" },
    );
  }
  const groups = await Promise.all(sources.map(async (source) => {
    if (source.availability !== "available") {
      return searchErrorGroup(source, createKnowledgeWorkspaceError(
        "knowledge_resource_unavailable",
        "knowledge search source is unavailable",
      ));
    }
    try {
      return await searchSource(coordinator, source, request, expression, {
        normalizedQuery,
        signal: options.signal,
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      return searchErrorGroup(source, error);
    }
  }));
  assertNotAborted(options.signal);
  return Object.freeze({
    query: request.query,
    scope: request.scope ?? null,
    groups: Object.freeze(groups),
  });
}

export function parseKnowledgeSearchRequest(
  input: unknown,
): KnowledgeSearchRequest {
  if (!isRecord(input)) throw invalidSearch("request");
  const allowed = new Set(["query", "limit", "cursors", "scope"]);
  if (Object.keys(input).some((field) => !allowed.has(field))) {
    throw invalidSearch("request");
  }
  if (
    typeof input.query !== "string"
    || codePoints(input.query).length === 0
    || codePoints(input.query).length > KNOWLEDGE_SEARCH_MAX_QUERY_CODE_POINTS
    || /\p{Cc}/u.test(input.query)
  ) {
    throw invalidSearch("query");
  }
  const limit = input.limit === undefined
    ? undefined
    : validLimit(input.limit);
  let cursors: Readonly<Record<string, string>> | undefined;
  if (input.cursors !== undefined) {
    if (!isRecord(input.cursors)) throw invalidSearch("cursors");
    const values: Record<string, string> = {};
    for (const [sourceKey, cursor] of Object.entries(input.cursors)) {
      validSourceKey(sourceKey, "cursors");
      if (
        typeof cursor !== "string"
        || cursor.length === 0
        || cursor.length > 4_096
      ) {
        throw invalidSearch("cursors");
      }
      values[sourceKey] = cursor;
    }
    cursors = Object.freeze(values);
  }
  let scope: KnowledgeSearchRequest["scope"];
  if (input.scope !== undefined) {
    if (
      !isRecord(input.scope)
      || Object.keys(input.scope).some((field) =>
        field !== "kind" && field !== "sourceKey"
      )
      || input.scope.kind !== "tag"
    ) {
      throw invalidSearch("scope");
    }
    scope = Object.freeze({
      kind: "tag",
      sourceKey: validSourceKey(input.scope.sourceKey, "scope.sourceKey"),
    });
  }
  return Object.freeze({
    query: input.query.normalize("NFC"),
    ...(limit === undefined ? {} : { limit }),
    ...(cursors === undefined ? {} : { cursors }),
    ...(scope === undefined ? {} : { scope }),
  });
}

export function lexSearchExpression(query: string): SearchExpression {
  const tokens: Array<{ value: string; operator: boolean }> = [];
  let value = "";
  let quoted = false;
  let escaped = false;
  let tokenQuoted = false;
  const push = () => {
    if (value.length === 0) {
      tokenQuoted = false;
      return;
    }
    tokens.push({
      value: foldSearchText(value),
      operator: !tokenQuoted && value === "OR",
    });
    value = "";
    tokenQuoted = false;
  };
  for (const character of query.normalize("NFC")) {
    if (escaped) {
      value += character === '"' || character === "\\"
        ? character
        : `\\${character}`;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      if (quoted) {
        quoted = false;
        tokenQuoted = true;
        push();
      } else {
        push();
        quoted = true;
        tokenQuoted = true;
      }
      continue;
    }
    if (!quoted && /\s/u.test(character)) {
      push();
      continue;
    }
    value += character;
  }
  if (escaped) value += "\\";
  push();

  const branches: string[][] = [[]];
  for (const token of tokens) {
    if (token.operator) {
      if (branches.at(-1)!.length > 0) branches.push([]);
      continue;
    }
    if (token.value.length > 0) branches.at(-1)!.push(token.value);
  }
  const nonEmpty = branches.filter((branch) => branch.length > 0);
  if (nonEmpty.length === 0) throw invalidSearch("query");
  return Object.freeze(nonEmpty.map((branch) => Object.freeze(branch)));
}

async function searchSource(
  coordinator: SearchCoordinator,
  source: KnowledgeSearchSource,
  request: KnowledgeSearchRequest,
  expression: SearchExpression,
  options: { normalizedQuery: string; signal?: AbortSignal },
): Promise<Extract<KnowledgeSearchGroup, { state: "ready" }>> {
  let lease: KnowledgeIndexQueryLease | null = null;
  try {
    lease = coordinator.acquireQueryLease(source.sourceKey);
    const cursor = request.cursors?.[source.sourceKey];
    const scopeBinding = request.scope
      ? `tag:${request.scope.sourceKey}`
      : "all";
    const offset = cursor
      ? decodeCursor(cursor, {
        sourceKey: source.sourceKey,
        generationId: lease.generationId,
        query: options.normalizedQuery,
        scope: scopeBinding,
        sort: SEARCH_SORT_KEY,
      })
      : 0;
    const ftsQuery = candidateFtsQuery(expression);
  const matches: Array<{
    row: KnowledgeIndexSearchQueryRow;
    score: number;
    branch: readonly string[];
  }> = [];
    let candidateOffset = 0;
    let truncated = false;
    while (true) {
      assertNotAborted(options.signal);
      const remainingCandidates = SEARCH_MAX_CANDIDATES - candidateOffset;
      if (remainingCandidates <= 0) {
        truncated = true;
        break;
      }
      const rows = lease.querySearchCandidates({
        ftsQuery,
        offset: candidateOffset,
        limit: Math.min(SEARCH_BATCH_SIZE, remainingCandidates),
        includeDisplayText: false,
      });
      for (const row of rows) {
        const branch = matchingBranch(row, expression);
        if (!branch) continue;
        matches.push({
          row,
          score: searchScore(row, branch),
          branch,
        });
      }
      if (rows.length < Math.min(SEARCH_BATCH_SIZE, remainingCandidates)) break;
      candidateOffset += rows.length;
      await yieldForCancellation(options.signal);
    }
    matches.sort((left, right) => (
      right.score - left.score
      || byteCompare(left.row.relativePath, right.row.relativePath)
      || left.row.resourceId - right.row.resourceId
    ));
    const limit = request.limit ?? KNOWLEDGE_SEARCH_DEFAULT_LIMIT;
    const selected = matches.slice(offset, offset + limit);
    const displayText = typeof lease.querySearchDisplayText === "function"
      ? lease.querySearchDisplayText(selected.map(({ row }) => row.resourceId))
      : new Map<number, { frontmatterJson: string | null; bodyText: string | null }>();
    const selectedWithSnippets = selected.map((match) => {
      const display = displayText.get(match.row.resourceId);
      const row = display
        ? { ...match.row, frontmatterJson: display.frontmatterJson, bodyText: display.bodyText }
        : match.row;
      return { ...match, row, snippets: snippetsFor(row, match.branch) };
    });
    const nextOffset = offset + selected.length;
    return Object.freeze({
      state: "ready",
      sourceKey: source.sourceKey,
      displayName: source.displayName,
      generationId: lease.generationId,
      items: Object.freeze(selectedWithSnippets.map(({ row, score, snippets }) =>
        Object.freeze({
          address: Object.freeze({
            sourceKey: source.sourceKey,
            relativePath: row.relativePath,
          }),
          title: row.title,
          kind: row.kind,
          score,
          snippets,
        })
      )),
      nextCursor: nextOffset < matches.length || truncated
        ? encodeCursor({
          sourceKey: source.sourceKey,
          generationId: lease.generationId,
          query: options.normalizedQuery,
          scope: scopeBinding,
          sort: SEARCH_SORT_KEY,
          offset: nextOffset,
        })
        : null,
    });
  } finally {
    lease?.release();
  }
}

function candidateFtsQuery(expression: SearchExpression): string | null {
  const candidates: string[] = [];
  for (const branch of expression) {
    const long = branch.filter((term) => codePoints(term).length >= 3);
    if (long.length === 0) return null;
    for (const term of long) {
      candidates.push(`"${term.replaceAll('"', '""')}"`);
    }
  }
  return [...new Set(candidates)].join(" OR ");
}

function matchingBranch(
  row: KnowledgeIndexSearchQueryRow,
  expression: SearchExpression,
): readonly string[] | null {
  const fields = [
    row.titleFold,
    row.pathFold,
    row.metadataFold,
    row.bodyFold,
  ];
  return expression.find((branch) =>
    branch.every((term) => fields.some((field) => field.includes(term)))
  ) ?? null;
}

function searchScore(
  row: KnowledgeIndexSearchQueryRow,
  terms: readonly string[],
): number {
  const fields = [
    { value: row.titleFold, weight: 40 },
    { value: row.pathFold, weight: 30 },
    { value: row.metadataFold, weight: 20 },
    { value: row.bodyFold, weight: 10 },
  ];
  let score = 0;
  for (const term of terms) {
    for (const field of fields) {
      if (!field.value.includes(term)) continue;
      score += field.weight;
      if (field.value === term) score += 100;
      else if (field.value.startsWith(term)) score += 20;
    }
  }
  return score;
}

function snippetsFor(
  row: KnowledgeIndexSearchQueryRow,
  terms: readonly string[],
): readonly KnowledgeSearchSnippet[] {
  const candidates = [
    { field: "title" as const, folded: row.titleFold, display: row.title },
    { field: "path" as const, folded: row.pathFold, display: row.relativePath },
    {
      field: "metadata" as const,
      folded: row.metadataFold,
      display: row.frontmatterJson,
    },
    { field: "body" as const, folded: row.bodyFold, display: row.bodyText },
  ];
  const snippets: KnowledgeSearchSnippet[] = [];
  for (const candidate of candidates) {
    if (!candidate.display) continue;
    const offset = terms.reduce((best, term) => {
      const found = candidate.folded.indexOf(term);
      return found < 0 ? best : Math.min(best, found);
    }, Number.POSITIVE_INFINITY);
    if (!Number.isFinite(offset)) continue;
    snippets.push(Object.freeze({
      field: candidate.field,
      text: boundedSnippet(
        candidate.display,
        codePoints(candidate.folded.slice(0, offset)).length,
      ),
    }));
    if (snippets.length === KNOWLEDGE_SEARCH_MAX_SNIPPETS) break;
  }
  return Object.freeze(snippets);
}

function boundedSnippet(value: string, approximateOffset: number): string {
  const points = codePoints(value);
  if (points.length <= KNOWLEDGE_SEARCH_MAX_SNIPPET_CODE_POINTS) return value;
  const start = Math.max(
    0,
    Math.min(points.length - KNOWLEDGE_SEARCH_MAX_SNIPPET_CODE_POINTS,
      approximateOffset - 60),
  );
  return `${start > 0 ? "…" : ""}${
    points.slice(
      start,
      start + KNOWLEDGE_SEARCH_MAX_SNIPPET_CODE_POINTS
        - (start > 0 ? 1 : 0),
    ).join("")
  }`;
}

function encodeCursor(input: {
  sourceKey: string;
  generationId: string;
  query: string;
  scope: string;
  sort: string;
  offset: number;
}): string {
  return Buffer.from(JSON.stringify({ v: 1, ...input }), "utf8")
    .toString("base64url");
}

function decodeCursor(
  value: string,
  binding: {
    sourceKey: string;
    generationId: string;
    query: string;
    scope: string;
    sort: string;
  },
): number {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw invalidSearch("cursors");
  }
  if (
    !isRecord(decoded)
    || decoded.v !== 1
    || decoded.sourceKey !== binding.sourceKey
    || decoded.query !== binding.query
    || decoded.scope !== binding.scope
    || decoded.sort !== binding.sort
    || typeof decoded.offset !== "number"
    || !Number.isSafeInteger(decoded.offset)
    || decoded.offset < 0
  ) {
    throw invalidSearch("cursors");
  }
  if (decoded.generationId !== binding.generationId) {
    throw createKnowledgeWorkspaceError(
      "knowledge_version_conflict",
      "knowledge search cursor generation changed",
      { state: "stale_generation" },
    );
  }
  return decoded.offset;
}

function searchErrorGroup(
  source: KnowledgeSearchSource,
  error: unknown,
): Extract<KnowledgeSearchGroup, { state: "error" }> {
  const safe = (isKnowledgeWorkspaceError(error)
    ? toKnowledgeErrorEnvelope(error)
    : toKnowledgeErrorEnvelope(createKnowledgeWorkspaceError(
      "knowledge_index_unavailable",
      "knowledge search source failed",
    )))!;
  return Object.freeze({
    state: "error",
    sourceKey: source.sourceKey,
    displayName: source.displayName,
    error: Object.freeze({
      code: safe.code,
      httpStatus: safe.httpStatus,
      retryable: safe.retryable,
      ...(safe.details ? { details: safe.details } : {}),
    }),
  });
}

function validLimit(value: unknown): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 1
    || value > KNOWLEDGE_SEARCH_MAX_LIMIT
  ) {
    throw invalidSearch("limit");
  }
  return value;
}

function validSourceKey(value: unknown, field: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 128
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)
  ) {
    throw invalidSearch(field);
  }
  return value;
}

function invalidSearch(field: string) {
  return createKnowledgeWorkspaceError(
    "knowledge_operation_precondition_failed",
    `knowledge search ${field} is invalid`,
    { field },
  );
}

function assertNotAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : Object.assign(new Error("knowledge search aborted"), {
      name: "AbortError",
      code: "ABORT_ERR",
    });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error
    && (error.name === "AbortError"
      || (error as Error & { code?: unknown }).code === "ABORT_ERR");
}

async function yieldForCancellation(signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  assertNotAborted(signal);
}

function byteCompare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function codePoints(value: string): string[] {
  return Array.from(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
