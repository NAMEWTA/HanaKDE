export type AgentErrorCode =
  | "validation"
  | "not_found"
  | "conflict"
  | "invocation_required"
  | "confirmation_required"
  | "confirmation_invalid"
  | "model_access_disabled"
  | "resource_operation_failed";

export class AgentError extends Error {
  readonly code: AgentErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: AgentErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "AgentError";
    this.code = code;
    this.details = details;
  }
}

export function agentErrorBody(error: unknown) {
  if (error instanceof AgentError) return { error: { code: error.code, message: error.message, details: error.details } };
  return { error: { code: "resource_operation_failed" as const, message: "The Agent dossier operation could not be completed", details: {} } };
}
