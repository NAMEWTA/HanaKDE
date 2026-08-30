export type DocumentErrorCode =
  | "validation"
  | "not_found"
  | "conflict"
  | "library_blocked"
  | "capacity_insufficient"
  | "preview_stale"
  | "preview_cancelled"
  | "resource_operation_failed";

export class DocumentError extends Error {
  readonly code: DocumentErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: DocumentErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "DocumentError";
    this.code = code;
    this.details = details;
  }
}

export function documentErrorBody(error: unknown): { error: { code: DocumentErrorCode; message: string; details: Record<string, unknown> } } {
  if (error instanceof DocumentError) {
    return { error: { code: error.code, message: error.message, details: error.details } };
  }
  return { error: { code: "resource_operation_failed", message: "The document operation could not be completed", details: {} } };
}
