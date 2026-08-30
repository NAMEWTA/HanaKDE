export type LifecycleErrorCode =
  | "validation"
  | "not_found"
  | "conflict"
  | "confirmation_required"
  | "confirmation_invalid"
  | "retention_active"
  | "library_blocked"
  | "resource_operation_failed";

export class LifecycleError extends Error {
  readonly code: LifecycleErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: LifecycleErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "LifecycleError";
    this.code = code;
    this.details = details;
  }
}

export function lifecycleErrorBody(error: unknown) {
  const normalized = error instanceof LifecycleError
    ? error
    : new LifecycleError("resource_operation_failed", "The dossier lifecycle operation could not be completed");
  return { error: { code: normalized.code, message: normalized.message, details: normalized.details } };
}
