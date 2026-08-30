export type ExchangeErrorCode =
  | "validation"
  | "not_found"
  | "conflict"
  | "confirmation_required"
  | "confirmation_invalid"
  | "unsafe_archive"
  | "archive_limit_exceeded"
  | "unsupported_schema"
  | "integrity_failed"
  | "library_blocked"
  | "resource_operation_failed";

export class ExchangeError extends Error {
  readonly code: ExchangeErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: ExchangeErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ExchangeError";
    this.code = code;
    this.details = details;
  }
}

export function exchangeErrorBody(error: unknown): { error: { code: ExchangeErrorCode; message: string; details: Record<string, unknown> } } {
  if (error instanceof ExchangeError) return { error: { code: error.code, message: error.message, details: error.details } };
  return { error: { code: "resource_operation_failed", message: "The dossier exchange operation failed", details: {} } };
}
