import { ExchangeError, exchangeErrorBody } from "../../../application/exchange/errors.ts";

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
export interface HonoAppLike { get(path: string, handler: Handler): void; post(path: string, handler: Handler): void; }

export async function readJson(context: HonoContextLike): Promise<Record<string, unknown>> {
  try {
    const value = await context.req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    return value as Record<string, unknown>;
  } catch { throw new ExchangeError("validation", "Request body must be a JSON object", { field: "body" }); }
}

function statusFor(error: unknown): number {
  if (!(error instanceof ExchangeError)) return 500;
  switch (error.code) {
    case "validation":
    case "unsafe_archive":
    case "archive_limit_exceeded":
    case "unsupported_schema":
    case "integrity_failed": return 400;
    case "not_found": return 404;
    case "conflict":
    case "confirmation_required":
    case "confirmation_invalid": return 409;
    case "library_blocked":
    case "resource_operation_failed": return 503;
  }
}

export function asyncRoute(handler: Handler): Handler {
  return async (context) => {
    try { return await handler(context); }
    catch (error) { return context.json(exchangeErrorBody(error), statusFor(error)); }
  };
}
