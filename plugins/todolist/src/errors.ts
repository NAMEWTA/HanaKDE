import { randomUUID } from "node:crypto";

export type TodoErrorCode =
  | "validation"
  | "not_found"
  | "conflict"
  | "capability"
  | "backend_unavailable"
  | "store"
  | "migration_failed"
  | "preview_stale"
  | "reference_conflict"
  | "transaction_failed"
  | "confirmation_required"
  | "confirmation_invalid"
  | "export_failed"
  | "unknown";

export interface TodoErrorShape {
  ok: false;
  error: {
    code: TodoErrorCode;
    message: string;
    identity: string;
    field?: string;
    recoverable: boolean;
    nextAction?: string;
  };
}

export class TodoError extends Error {
  readonly code: TodoErrorCode;
  readonly identity: string;
  readonly field?: string;
  readonly recoverable: boolean;
  readonly nextAction?: string;
  readonly causeValue?: unknown;

  constructor(
    code: TodoErrorCode,
    message: string,
    options: {
      identity?: string;
      field?: string;
      recoverable?: boolean;
      nextAction?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "TodoError";
    this.code = code;
    this.identity = options.identity ?? `todoerr_${randomUUID()}`;
    this.field = options.field;
    this.recoverable = options.recoverable ?? ["conflict", "capability", "backend_unavailable", "preview_stale", "store"].includes(code);
    this.nextAction = options.nextAction;
    this.causeValue = options.cause;
  }
}

export function asTodoError(error: unknown): TodoError {
  if (error instanceof TodoError) return error;
  const message = error instanceof Error ? error.message : "Unknown Todo failure";
  return new TodoError("unknown", redactText(message), { cause: error, recoverable: true, nextAction: "retry" });
}

export function errorResponse(error: unknown): TodoErrorShape {
  const normalized = asTodoError(error);
  return {
    ok: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      identity: normalized.identity,
      field: normalized.field,
      recoverable: normalized.recoverable,
      nextAction: normalized.nextAction,
    },
  };
}

export function redactText(value: string): string {
  return value
    .replace(/(?:[A-Za-z]:\\|\/)(?:[^\s"']+[\\/])+[^\s"']*/g, "[redacted-path]")
    .replace(/\b(?:sk|pk|tok|token|secret|key)_[A-Za-z0-9_-]{8,}\b/gi, "[redacted-secret]")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [redacted]")
    .slice(0, 600);
}

export function assert(condition: unknown, code: TodoErrorCode, message: string, field?: string): asserts condition {
  if (!condition) throw new TodoError(code, message, { field, recoverable: code !== "validation" });
}
