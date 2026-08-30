export type MigrationErrorCode =
  | "validation"
  | "not_required"
  | "confirmation_required"
  | "plan_expired"
  | "future_version"
  | "incompatible_library"
  | "recovery_required"
  | "resource_operation_failed"
  | "integrity_failed";

export class MigrationError extends Error {
  readonly code: MigrationErrorCode;
  readonly details: Record<string, string | number | boolean | null>;

  constructor(code: MigrationErrorCode, message: string, details: Record<string, string | number | boolean | null> = {}) {
    super(message);
    this.name = "MigrationError";
    this.code = code;
    this.details = details;
  }
}
