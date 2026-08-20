import { TodoError, asTodoError, errorResponse } from "../errors.ts";

export interface HonoRequestLike {
  json(): Promise<unknown>;
  query(name: string): string | undefined;
  queries?(name: string): string[] | undefined;
  param(name: string): string;
}

export interface HonoContextLike {
  req: HonoRequestLike;
  json(value: unknown, status?: number): unknown;
  text(value: string, status?: number, headers?: Record<string, string>): unknown;
  html(value: string, status?: number): unknown;
  get?(key: string): unknown;
}

export interface HonoAppLike {
  get(path: string, handler: (c: HonoContextLike) => unknown | Promise<unknown>): void;
  post(path: string, handler: (c: HonoContextLike) => unknown | Promise<unknown>): void;
  patch(path: string, handler: (c: HonoContextLike) => unknown | Promise<unknown>): void;
  delete(path: string, handler: (c: HonoContextLike) => unknown | Promise<unknown>): void;
}

export async function readJson(c: HonoContextLike): Promise<Record<string, unknown>> {
  try {
    const value = await c.req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("body is not an object");
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof TodoError) throw error;
    throw new TodoError("validation", "Request body must be a valid JSON object", { field: "body" });
  }
}

export function queryBoolean(c: HonoContextLike, name: string, fallback = false): boolean {
  const value = c.req.query(name);
  if (value === undefined || value === "") return fallback;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new TodoError("validation", `${name} must be true or false`, { field: name });
}

export function queryNumber(c: HonoContextLike, name: string, fallback?: number): number | undefined {
  const value = c.req.query(name);
  if (value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TodoError("validation", `${name} must be a number`, { field: name });
  return number;
}

export function queryList(c: HonoContextLike, name: string): string[] | undefined {
  const many = c.req.queries?.(name)?.flatMap((value) => value.split(","));
  const one = c.req.query(name)?.split(",");
  const values = (many?.length ? many : one)?.map((value) => value.trim()).filter(Boolean);
  return values?.length ? [...new Set(values)] : undefined;
}

export function statusFor(error: unknown): number {
  const normalized = asTodoError(error);
  switch (normalized.code) {
    case "validation": return 400;
    case "not_found": return 404;
    case "confirmation_required": return 428;
    case "confirmation_invalid":
    case "capability": return 403;
    case "conflict":
    case "preview_stale":
    case "reference_conflict": return 409;
    case "backend_unavailable":
    case "store":
    case "migration_failed": return 503;
    default: return 500;
  }
}

export function jsonError(c: HonoContextLike, error: unknown): unknown {
  return c.json(errorResponse(error), statusFor(error));
}

export function asyncRoute(handler: (c: HonoContextLike) => unknown | Promise<unknown>): (c: HonoContextLike) => Promise<unknown> {
  return async (c) => {
    try {
      return await handler(c);
    } catch (error) {
      return jsonError(c, error);
    }
  };
}
