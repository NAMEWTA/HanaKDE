import { LifecycleError, lifecycleErrorBody } from "../../../application/lifecycle/errors.ts";

export interface HonoRequestLike {
  json(): Promise<unknown>;
  query(name: string): string | undefined;
  param(name: string): string;
}

export interface HonoContextLike {
  req: HonoRequestLike;
  json(value: unknown, status?: number): unknown;
}

type Handler = (context: HonoContextLike) => unknown | Promise<unknown>;

export interface HonoAppLike {
  get(path: string, handler: Handler): void;
  post(path: string, handler: Handler): void;
}

export async function readJson(context: HonoContextLike): Promise<Record<string, unknown>> {
  try {
    const value = await context.req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch { throw new LifecycleError("validation", "Request body must be a JSON object", { field: "body" }); }
}

export function revision(value: unknown, field: string): number {
  const parsed = typeof value === "string" && value ? Number(value) : value;
  if (!Number.isInteger(parsed) || (parsed as number) < 1) throw new LifecycleError("validation", `${field} must be a positive integer`, { field });
  return parsed as number;
}

function statusFor(error: unknown): number {
  if (!(error instanceof LifecycleError)) return 500;
  switch (error.code) {
    case "validation": return 400;
    case "not_found": return 404;
    case "conflict":
    case "confirmation_required":
    case "confirmation_invalid":
    case "retention_active": return 409;
    case "library_blocked":
    case "resource_operation_failed": return 503;
  }
}

export function asyncRoute(handler: Handler): Handler {
  return async (context) => {
    try { return await handler(context); }
    catch (error) { return context.json(lifecycleErrorBody(error), statusFor(error)); }
  };
}
