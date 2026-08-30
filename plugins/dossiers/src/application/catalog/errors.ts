export type CatalogErrorCode =
  | "validation"
  | "not_found"
  | "conflict"
  | "reference_conflict"
  | "migration_required"
  | "library_blocked"
  | "resource_operation_failed";

export class CatalogError extends Error {
  readonly code: CatalogErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: CatalogErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "CatalogError";
    this.code = code;
    this.details = details;
  }
}

export function catalogErrorBody(error: unknown): {
  ok: false;
  error: { code: CatalogErrorCode; message: string; details: Record<string, unknown> };
} {
  const normalized = error instanceof CatalogError
    ? error
    : new CatalogError("resource_operation_failed", "The catalog operation could not be completed");
  return {
    ok: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
    },
  };
}
