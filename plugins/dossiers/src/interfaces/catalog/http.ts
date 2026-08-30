import { CatalogError, catalogErrorBody } from "../../application/catalog/errors.ts";

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
  patch(path: string, handler: Handler): void;
  delete(path: string, handler: Handler): void;
}

export async function readJson(context: HonoContextLike): Promise<Record<string, unknown>> {
  try {
    const value = await context.req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch {
    throw new CatalogError("validation", "Request body must be a JSON object", { field: "body" });
  }
}

export function inputWithoutWorkspace(input: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...input };
  delete rest.workspaceMountId;
  return rest;
}

function statusFor(error: unknown): number {
  if (!(error instanceof CatalogError)) return 500;
  switch (error.code) {
    case "validation": return 400;
    case "not_found": return 404;
    case "conflict":
    case "reference_conflict":
    case "migration_required": return 409;
    case "library_blocked":
    case "resource_operation_failed": return 503;
  }
}

export function asyncRoute(handler: Handler): Handler {
  return async (context) => {
    try {
      return await handler(context);
    } catch (error) {
      return context.json(catalogErrorBody(error), statusFor(error));
    }
  };
}

export function positiveNumber(value: unknown, fallback?: number): number {
  if (value === undefined || value === "") {
    if (fallback !== undefined) return fallback;
    throw new CatalogError("validation", "A positive integer is required");
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new CatalogError("validation", "A positive integer is required");
  return parsed;
}
