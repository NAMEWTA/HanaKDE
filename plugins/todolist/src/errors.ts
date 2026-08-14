export type TodoErrorCode =
  | "validation"
  | "not_found"
  | "conflict"
  | "forbidden"
  | "capability_unavailable"
  | "storage_failure"
  | "transaction_failed"
  | "unsupported_format"
  | "invalid_schema"
  | "reference_conflict"
  | "preview_stale"
  | "already_committed"
  | "export_failed";

export class TodoError extends Error {
  readonly code: TodoErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(code: TodoErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "TodoError";
    this.code = code;
    this.status = code === "forbidden" ? 403 : code === "not_found" ? 404 : code === "capability_unavailable" ? 503 : code === "storage_failure" || code === "transaction_failed" ? 500 : code === "conflict" || code === "preview_stale" ? 409 : 400;
    this.details = redactDetails(details);
  }
}

export function redactDetails(details: Record<string, unknown> = {}) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (/token|secret|message|transcript|path/i.test(key)) continue;
    if (typeof value === "string" && value.length > 240) output[key] = value.slice(0, 240);
    else output[key] = value;
  }
  return output;
}

export function asTodoError(error: unknown): TodoError {
  if (error instanceof TodoError) return error;
  return new TodoError("storage_failure", "Todo storage is unavailable");
}

export function errorBody(error: unknown) {
  const normalized = asTodoError(error);
  return { error: normalized.code, detail: normalized.message, ...normalized.details };
}
