import {
  parseKnowledgeResourceAddress,
  type KnowledgeResourceAddress,
} from "./knowledge-workspace-contract.ts";
import { isOperationCorrelationId } from "./knowledge-diagnostics.ts";
import {
  snapshotOwnData,
} from "./knowledge-workspace-errors.ts";
import { MAIN_WORKSPACE_SOURCE_KEY } from "./workspace-observation.ts";

const DEFAULT_WORKSPACE_HISTORY_LIMIT = 10;

/**
 * A renderer-safe projection fact. It deliberately contains no resolved
 * filesystem locator, Agent identity, or version content.
 */
export type AgentFileChangeFact = Readonly<{
  sessionId: string;
  operationId: string;
  resource: Readonly<KnowledgeResourceAddress>;
}>;

/** A locally stamped activity correlation, not a second history store. */
export type AgentActivityOperationCorrelation = Readonly<{
  operationId: string;
  scopeGeneration: number;
}>;

export type AgentFileChangeProjectionScope = Readonly<{
  sessionId: string | null | undefined;
  scopeGeneration: number | null | undefined;
  operationCorrelations: readonly AgentActivityOperationCorrelation[];
}>;

export type AgentFileChangeProjection =
  | Readonly<{
    kind: "main-history";
    operationId: string;
    resource: Readonly<KnowledgeResourceAddress>;
  }>
  | Readonly<{
    kind: "operation-impact";
    operationId: string;
    resource: Readonly<KnowledgeResourceAddress>;
  }>;

const AGENT_FILE_CHANGE_FACT_FIELDS = new Set([
  "sessionId",
  "operationId",
  "resource",
]);
const OPAQUE_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,256}$/u;

export function isAgentFileChangeSessionId(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_SESSION_ID_PATTERN.test(value);
}

export function isAgentFileChangeScopeGeneration(
  value: unknown,
): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Accept only an explicitly scoped, source-relative event envelope. The
 * parser is intentionally closed to additions so raw paths and inferred
 * Agent metadata cannot become a History authority by accident.
 */
export function parseAgentFileChangeFact(
  input: unknown,
): AgentFileChangeFact | null {
  const snapshot = snapshotOwnData(input, AGENT_FILE_CHANGE_FACT_FIELDS.size);
  if (
    !snapshot
    || Object.keys(snapshot).some((field) => !AGENT_FILE_CHANGE_FACT_FIELDS.has(field))
    || !isAgentFileChangeSessionId(snapshot.sessionId)
    || !isOperationCorrelationId(snapshot.operationId)
  ) {
    return null;
  }

  const parsedResource = parseKnowledgeResourceAddress(snapshot.resource);
  if (!parsedResource.ok) return null;

  return Object.freeze({
    sessionId: snapshot.sessionId,
    operationId: snapshot.operationId,
    resource: Object.freeze({ ...parsedResource.value }),
  });
}

/**
 * Correlation is evaluated before source role. A source-relative main address
 * is eligible to open the existing T-16 History UI only when the renderer has
 * an exact conversation, operation, and local scope-generation proof.
 */
export function projectAgentFileChangeFact(
  input: unknown,
  scope: AgentFileChangeProjectionScope,
): AgentFileChangeProjection | null {
  const fact = parseAgentFileChangeFact(input);
  if (
    !fact
    || !isAgentFileChangeSessionId(scope.sessionId)
    || !isAgentFileChangeScopeGeneration(scope.scopeGeneration)
    || fact.sessionId !== scope.sessionId
  ) {
    return null;
  }

  const correlated = scope.operationCorrelations.some((correlation) => (
    isOperationCorrelationId(correlation?.operationId)
    && isAgentFileChangeScopeGeneration(correlation?.scopeGeneration)
    && correlation.operationId === fact.operationId
    && correlation.scopeGeneration === scope.scopeGeneration
  ));
  if (!correlated) return null;

  return Object.freeze({
    kind: fact.resource.sourceKey === MAIN_WORKSPACE_SOURCE_KEY
      ? "main-history"
      : "operation-impact",
    operationId: fact.operationId,
    resource: fact.resource,
  });
}

export function normalizeWorkspacePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const slashed = trimmed.replace(/\\/g, "/");
  if (slashed === "/") return "/";
  if (/^[A-Za-z]:\/?$/.test(slashed)) return slashed.endsWith("/") ? slashed : `${slashed}/`;
  return slashed.replace(/\/+$/g, "");
}

export function mergeWorkspaceHistory(existing: string[] = [], additions: string[] = [], options: { limit?: number } = {}): string[] {
  const limit = Number.isFinite(options.limit) ? options.limit! : DEFAULT_WORKSPACE_HISTORY_LIMIT;
  const next: string[] = [];
  const push = (value: unknown) => {
    const normalized = normalizeWorkspacePath(value);
    if (!normalized || next.includes(normalized)) return;
    next.push(normalized);
  };
  for (const value of [...additions].reverse()) push(value);
  for (const value of existing) push(value);
  return next.slice(0, Math.max(0, limit));
}

export function removeWorkspaceHistoryEntries(existing: string[] = [], removals: string | string[] = []): string[] {
  const removeSet = new Set((Array.isArray(removals) ? removals : [removals])
    .map(normalizeWorkspacePath)
    .filter(Boolean));
  if (removeSet.size === 0) return mergeWorkspaceHistory(existing, []);
  return mergeWorkspaceHistory(existing, []).filter((item) => !removeSet.has(item));
}

export function clearWorkspaceHistory(): string[] {
  return [];
}

export function buildWorkspacePickerItems({ selectedFolder, homeFolder, cwdHistory }: { selectedFolder?: string | null; homeFolder?: string | null; cwdHistory?: string[] } = {}): string[] {
  const items: string[] = [];
  const push = (value: unknown) => {
    const normalized = normalizeWorkspacePath(value);
    if (!normalized || items.includes(normalized)) return;
    items.push(normalized);
  };
  push(selectedFolder);
  push(homeFolder);
  for (const value of Array.isArray(cwdHistory) ? cwdHistory : []) push(value);
  return items;
}

export function workspaceDisplayName(value: unknown, fallback = ""): string {
  const normalized = normalizeWorkspacePath(value);
  if (!normalized) return fallback;
  if (normalized === "/") return "/";
  const trimmed = normalized.replace(/\/+$/g, "");
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || normalized;
}
