import {
  isKnowledgeErrorCode,
  type KnowledgeErrorCode,
  snapshotOwnData,
} from "./knowledge-workspace-errors.ts";
import {
  parseKnowledgeResourceAddress,
  type KnowledgeResourceAddress,
} from "./knowledge-workspace-contract.ts";

export const KNOWLEDGE_REBUILD_REASONS = [
  "watch_gap",
  "watch_overflow",
  "index_corrupt",
  "source_recovered",
  "manual",
] as const;

export type KnowledgeRebuildReason = (typeof KNOWLEDGE_REBUILD_REASONS)[number];
export type KnowledgeDiagnosticSummary = {
  errorCode: KnowledgeErrorCode;
  operationId?: string;
  address?: KnowledgeResourceAddress;
  sequence?: number;
  rebuildReason?: KnowledgeRebuildReason;
};
export type KnowledgeDiagnosticParseResult =
  | { ok: true; value: KnowledgeDiagnosticSummary }
  | { ok: false; error: "invalid_diagnostic_summary" };

const FIELDS = new Set(["errorCode", "operationId", "address", "sequence", "rebuildReason"]);
const REBUILD_REASON_SET = new Set<string>(KNOWLEDGE_REBUILD_REASONS);
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isOperationCorrelationId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

export function parseKnowledgeDiagnosticSummary(input: unknown): KnowledgeDiagnosticParseResult {
  const snapshot = snapshotOwnData(input, 8);
  if (!snapshot || Object.keys(snapshot).some((field) => !FIELDS.has(field))) return invalid();
  if (!isKnowledgeErrorCode(snapshot.errorCode)) return invalid();

  const value: KnowledgeDiagnosticSummary = { errorCode: snapshot.errorCode };
  if (snapshot.operationId !== undefined) {
    if (!isOperationCorrelationId(snapshot.operationId)) return invalid();
    value.operationId = snapshot.operationId;
  }
  if (snapshot.address !== undefined) {
    const addressSnapshot = snapshotOwnData(snapshot.address, 2);
    if (!addressSnapshot) return invalid();
    const address = parseKnowledgeResourceAddress(addressSnapshot);
    if (!address.ok || looksLikeLocator(address.value.relativePath)) return invalid();
    value.address = address.value;
  }
  if (snapshot.sequence !== undefined) {
    if (!Number.isSafeInteger(snapshot.sequence) || Number(snapshot.sequence) < 0) return invalid();
    value.sequence = Number(snapshot.sequence);
  }
  if (snapshot.rebuildReason !== undefined) {
    if (typeof snapshot.rebuildReason !== "string" || !REBUILD_REASON_SET.has(snapshot.rebuildReason)) return invalid();
    value.rebuildReason = snapshot.rebuildReason as KnowledgeRebuildReason;
  }
  return { ok: true, value };
}

export function exportKnowledgeDiagnosticSummary(input: unknown): string {
  const parsed = parseKnowledgeDiagnosticSummary(input);
  if (!parsed.ok) throw new TypeError("Invalid knowledge diagnostic summary");
  const value = {
    ...parsed.value,
    ...(parsed.value.address
      ? { address: { sourceKey: parsed.value.address.sourceKey, relativePath: "[redacted]" } }
      : {}),
  };
  return `${JSON.stringify({ schemaVersion: 1, ...value })}\n`;
}

function looksLikeLocator(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/u.test(value)
    || /^\\\\/u.test(value)
    || /^file:\/\//iu.test(value);
}

function invalid(): KnowledgeDiagnosticParseResult {
  return { ok: false, error: "invalid_diagnostic_summary" };
}
