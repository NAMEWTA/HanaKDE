import { DocumentError, documentErrorBody } from "../../application/documents/errors.ts";

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
    throw new DocumentError("validation", "Request body must be a JSON object", { field: "body" });
  }
}

export function requiredRevision(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new DocumentError("validation", "A positive expected revision is required", { field: "expectedRevision" });
  return value as number;
}

function statusFor(error: unknown): number {
  if (!(error instanceof DocumentError)) return 500;
  switch (error.code) {
    case "validation": return 400;
    case "not_found": return 404;
    case "conflict":
    case "preview_stale":
    case "preview_cancelled": return 409;
    case "capacity_insufficient": return 413;
    case "library_blocked":
    case "resource_operation_failed": return 503;
  }
}

export function asyncRoute(handler: Handler): Handler {
  return async (context) => {
    try {
      return await handler(context);
    } catch (error) {
      return context.json(documentErrorBody(error), statusFor(error));
    }
  };
}
