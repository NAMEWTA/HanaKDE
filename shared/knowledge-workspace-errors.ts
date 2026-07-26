import { KNOWLEDGE_CONTRACT_ISSUE_METADATA } from "./knowledge-workspace-contract.ts";

export const KNOWLEDGE_ERROR_CODES = Object.freeze([
  "knowledge_resource_not_found",
  "knowledge_resource_conflict",
  "knowledge_version_conflict",
  "knowledge_resource_out_of_scope",
  "knowledge_resource_unavailable",
  "knowledge_operation_plan_expired",
  "knowledge_operation_precondition_failed",
  "knowledge_link_rewrite_failed",
  "knowledge_index_unavailable",
  "knowledge_transfer_limit_exceeded",
  "knowledge_transfer_entry_unsupported",
  "knowledge_trash_entry_not_found",
  "knowledge_trash_parent_blocked",
  "knowledge_native_capability_unavailable",
  "source_root_not_disjoint",
  "source_root_identity_unprovable",
  "operation_id_reused",
  "source_recovery_in_progress",
] as const);
if (new Set(KNOWLEDGE_ERROR_CODES).size !== KNOWLEDGE_ERROR_CODES.length) {
  throw new Error("Duplicate knowledge error code");
}

export type KnowledgeErrorCode = (typeof KNOWLEDGE_ERROR_CODES)[number];

export type KnowledgeErrorMetadata = Readonly<{
  code: KnowledgeErrorCode;
  httpStatus: number;
  retryable: boolean;
}>;

function metadata(code: KnowledgeErrorCode, httpStatus: number, retryable: boolean): KnowledgeErrorMetadata {
  return Object.freeze({ code, httpStatus, retryable });
}

export const KNOWLEDGE_ERROR_METADATA = Object.freeze({
  knowledge_resource_not_found: metadata("knowledge_resource_not_found", 404, false),
  knowledge_resource_conflict: metadata("knowledge_resource_conflict", 409, false),
  knowledge_version_conflict: metadata("knowledge_version_conflict", 409, true),
  knowledge_resource_out_of_scope: metadata("knowledge_resource_out_of_scope", 403, false),
  knowledge_operation_plan_expired: metadata("knowledge_operation_plan_expired", 410, true),
  knowledge_operation_precondition_failed: metadata("knowledge_operation_precondition_failed", 412, false),
  knowledge_link_rewrite_failed: metadata("knowledge_link_rewrite_failed", 409, true),
  knowledge_index_unavailable: metadata("knowledge_index_unavailable", 503, true),
  knowledge_transfer_limit_exceeded: metadata("knowledge_transfer_limit_exceeded", 413, false),
  knowledge_transfer_entry_unsupported: metadata("knowledge_transfer_entry_unsupported", 422, false),
  knowledge_trash_entry_not_found: metadata("knowledge_trash_entry_not_found", 404, false),
  knowledge_trash_parent_blocked: metadata("knowledge_trash_parent_blocked", 409, false),
  knowledge_native_capability_unavailable: metadata("knowledge_native_capability_unavailable", 501, false),
  source_root_not_disjoint: metadata("source_root_not_disjoint", 409, false),
  source_root_identity_unprovable: metadata("source_root_identity_unprovable", 422, false),
  operation_id_reused: metadata("operation_id_reused", 409, false),
  source_recovery_in_progress: metadata("source_recovery_in_progress", 503, true),
  knowledge_resource_unavailable: metadata("knowledge_resource_unavailable", 503, true),
} satisfies Record<KnowledgeErrorCode, KnowledgeErrorMetadata>);

const CODE_SET = new Set<string>(KNOWLEDGE_ERROR_CODES);
const SAFE_DETAIL_TEXT_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const LEGACY_CODE_MAP: Readonly<Record<string, KnowledgeErrorCode>> = Object.freeze({
  resource_not_found: "knowledge_resource_not_found",
  target_already_exists: "knowledge_resource_conflict",
  resource_access_denied: "knowledge_resource_out_of_scope",
  capability_denied: "knowledge_resource_out_of_scope",
  provider_not_available: "knowledge_resource_unavailable",
  resource_event_catch_up_unavailable: "knowledge_resource_unavailable",
  cross_provider_copy_unsupported: "knowledge_transfer_entry_unsupported",
  cross_provider_move_unsupported: "knowledge_transfer_entry_unsupported",
  invalid_resource_ref: "knowledge_operation_precondition_failed",
  resource_expired: "knowledge_operation_precondition_failed",
  invalid_resource_path: "knowledge_operation_precondition_failed",
  resource_not_file: "knowledge_operation_precondition_failed",
  invalid_path: "knowledge_operation_precondition_failed",
  invalid_mount_root: "knowledge_operation_precondition_failed",
  invalid_trash_namespace: "knowledge_operation_precondition_failed",
  invalid_url: "knowledge_operation_precondition_failed",
  invalid_url_scheme: "knowledge_operation_precondition_failed",
  blocked_private_url: "knowledge_resource_out_of_scope",
  url_redirect_limit: "knowledge_operation_precondition_failed",
  invalid_url_redirect: "knowledge_operation_precondition_failed",
  url_fetch_failed: "knowledge_resource_unavailable",
  url_response_too_large: "knowledge_transfer_limit_exceeded",
});

export type KnowledgeErrorEnvelope = KnowledgeErrorMetadata & {
  details?: KnowledgeSafeErrorDetails;
};

export type KnowledgeSafeErrorDetails = Readonly<{
  field?: string;
  capability?: string;
  limit?: number;
  actual?: number;
  state?: string;
}>;

export class KnowledgeWorkspaceError extends Error {
  readonly code: KnowledgeErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly details?: KnowledgeSafeErrorDetails;

  constructor(code: KnowledgeErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "KnowledgeWorkspaceError";
    const definition = KNOWLEDGE_ERROR_METADATA[code];
    this.code = definition.code;
    this.httpStatus = definition.httpStatus;
    this.retryable = definition.retryable;
    this.details = details === undefined ? undefined : validateSafeDetails(details);
  }

  get status(): number {
    return this.httpStatus;
  }
}

export function isKnowledgeErrorCode(value: unknown): value is KnowledgeErrorCode {
  return typeof value === "string" && CODE_SET.has(value);
}

export function normalizeKnowledgeErrorCode(value: unknown): KnowledgeErrorCode | undefined {
  return mapLegacyKnowledgeErrorCode(value);
}

export function mapLegacyKnowledgeErrorCode(value: unknown): KnowledgeErrorCode | undefined {
  if (isKnowledgeErrorCode(value)) return value;
  return typeof value === "string" ? LEGACY_CODE_MAP[value] : undefined;
}

export function createKnowledgeWorkspaceError(
  code: KnowledgeErrorCode,
  message: string,
  details?: unknown,
): KnowledgeWorkspaceError {
  return new KnowledgeWorkspaceError(code, message, details);
}

export function toKnowledgeErrorEnvelope(input: unknown): KnowledgeErrorEnvelope | undefined {
  const snapshot = snapshotOwnData(input, 20);
  if (!snapshot) return undefined;
  const code = normalizeKnowledgeErrorCode(snapshot.code);
  if (!code) return undefined;
  const definition = KNOWLEDGE_ERROR_METADATA[code];
  let details: KnowledgeSafeErrorDetails | undefined;
  try {
    details = snapshot.details === undefined
      ? undefined
      : validateSafeDetails(snapshot.details);
  } catch {
    return undefined;
  }
  return details === undefined ? definition : Object.freeze({ ...definition, details });
}

export function toPublicKnowledgeErrorEnvelope(input: unknown): Readonly<{
  code: string;
  httpStatus: number;
  retryable: boolean;
}> | undefined {
  const rawCode = snapshotOwnData(input, 20)?.code;
  if (
    typeof rawCode === "string"
    && Object.prototype.hasOwnProperty.call(KNOWLEDGE_CONTRACT_ISSUE_METADATA, rawCode)
  ) {
    return KNOWLEDGE_CONTRACT_ISSUE_METADATA[
      rawCode as keyof typeof KNOWLEDGE_CONTRACT_ISSUE_METADATA
    ];
  }
  return undefined;
}

export function isKnowledgeWorkspaceError(input: unknown): input is KnowledgeWorkspaceError {
  try {
    return input instanceof KnowledgeWorkspaceError;
  } catch {
    return false;
  }
}

function validateSafeDetails(details: unknown): KnowledgeSafeErrorDetails {
  const snapshot = snapshotOwnData(details, 5);
  if (!snapshot) throw new TypeError("Unsafe knowledge error details");
  const safe: {
    field?: string;
    capability?: string;
    limit?: number;
    actual?: number;
    state?: string;
  } = {};
  for (const key of Object.keys(snapshot)) {
    if (!["field", "capability", "limit", "actual", "state"].includes(key)) {
      throw new TypeError("Unsafe knowledge error details");
    }
  }
  for (const key of ["field", "capability", "state"] as const) {
    const value = snapshot[key];
    if (value !== undefined) {
      if (typeof value !== "string" || !SAFE_DETAIL_TEXT_PATTERN.test(value)) throw new TypeError("Unsafe knowledge error details");
      safe[key] = value;
    }
  }
  for (const key of ["limit", "actual"] as const) {
    const value = snapshot[key];
    if (value !== undefined) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new TypeError("Unsafe knowledge error details");
      safe[key] = value;
    }
  }
  return Object.freeze(safe);
}

export function snapshotOwnData(value: unknown, maxFields: number): Record<string, unknown> | undefined {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    const prototype = Object.getPrototypeOf(value);
    const errorObject = value instanceof Error;
    if (prototype !== Object.prototype && prototype !== null && !errorObject) return undefined;
    const keys = Reflect.ownKeys(value);
    if (keys.length > maxFields || keys.some((key) => typeof key === "symbol")) return undefined;
    const snapshot: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (errorObject && key === "stack" && descriptor && !descriptor.enumerable) continue;
      if (!descriptor || !("value" in descriptor)) return undefined;
      snapshot[String(key)] = descriptor.value;
    }
    return snapshot;
  } catch {
    return undefined;
  }
}
