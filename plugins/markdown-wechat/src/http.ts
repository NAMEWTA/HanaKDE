export interface HonoRequestLike {
  json(): Promise<unknown>;
  query(name: string): string | undefined;
}

export interface HonoContextLike {
  req: HonoRequestLike;
  json(value: unknown, status?: number): unknown;
  html(value: string, status?: number): unknown;
  get?(name: string): unknown;
}

export interface HonoAppLike {
  get(path: string, handler: (c: HonoContextLike) => unknown | Promise<unknown>): void;
  post(path: string, handler: (c: HonoContextLike) => unknown | Promise<unknown>): void;
  put(path: string, handler: (c: HonoContextLike) => unknown | Promise<unknown>): void;
}

export async function readJson(c: HonoContextLike): Promise<Record<string, unknown>> {
  const value = await c.req.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "invalid_request", "Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function asyncJsonRoute(
  handler: (c: HonoContextLike) => unknown | Promise<unknown>,
): (c: HonoContextLike) => Promise<unknown> {
  return async (c) => {
    try {
      return await handler(c);
    } catch (error) {
      if (error instanceof HttpError) {
        return c.json({ ok: false, error: { code: error.code, message: error.message } }, error.status);
      }
      const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
      const code = typeof record.code === "string" ? record.code.toLowerCase() : "internal_error";
      const message = error instanceof Error ? error.message : String(error);
      const status = code.includes("conflict") || code.includes("locked") ? 409 : code.includes("denied") || code.includes("forbidden") ? 403 : 500;
      return c.json({ ok: false, error: { code, message } }, status);
    }
  };
}

export function escapeHtmlAttribute(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
