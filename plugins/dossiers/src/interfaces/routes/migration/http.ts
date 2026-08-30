import { MigrationError } from "../../../application/migration/errors.ts";

interface RequestLike {
  query(name: string): string | undefined;
  json(): Promise<unknown>;
}

export interface RouteContextLike {
  req: RequestLike;
  json(value: unknown, status?: number): unknown;
}

export type RouteHandler = (context: RouteContextLike) => unknown | Promise<unknown>;
export interface HonoAppLike { get(path: string, handler: RouteHandler): void; post(path: string, handler: RouteHandler): void }

export async function readJson(context: RouteContextLike): Promise<Record<string, unknown>> {
  const value = await context.req.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MigrationError("validation", "The request body must be an object");
  return value as Record<string, unknown>;
}

export function asyncRoute(handler: RouteHandler): RouteHandler {
  return async (context) => {
    try { return await handler(context); }
    catch (error) {
      const migration = error instanceof MigrationError ? error : new MigrationError("resource_operation_failed", "The migration service is unavailable");
      const status = migration.code === "validation" ? 400
        : migration.code === "confirmation_required" || migration.code === "plan_expired" || migration.code === "not_required" || migration.code === "recovery_required" ? 409
          : migration.code === "future_version" || migration.code === "incompatible_library" || migration.code === "integrity_failed" ? 422
            : 503;
      return context.json({ error: { code: migration.code, message: migration.message, details: migration.details } }, status);
    }
  };
}
