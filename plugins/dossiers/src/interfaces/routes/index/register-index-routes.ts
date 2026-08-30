import type { HanaPluginResources } from "@hana/plugin-runtime";

import { MetadataIndexApplication } from "../../../application/index/metadata-index-application.ts";

interface ContextLike {
  resources: HanaPluginResources;
  dataDir: string;
}

interface RequestLike {
  query(name: string): string | undefined;
  json(): Promise<unknown>;
}

interface RouteContextLike {
  req: RequestLike;
  json(value: unknown, status?: number): unknown;
}

type Handler = (context: RouteContextLike) => unknown | Promise<unknown>;
interface AppLike { get(path: string, handler: Handler): void; post(path: string, handler: Handler): void }

const MOUNT_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

class IndexRequestError extends Error {}

function application(ctx: ContextLike, mountId: unknown): MetadataIndexApplication {
  if (typeof mountId !== "string" || !MOUNT_ID.test(mountId)) throw new IndexRequestError("A valid workspace mount selection is required");
  return new MetadataIndexApplication({ resources: ctx.resources, workspaceRoot: { kind: "mount", mountId, path: "" }, dataDir: ctx.dataDir });
}

function route(handler: Handler): Handler {
  return async (context) => {
    try { return await handler(context); } catch (error) {
      const validation = error instanceof IndexRequestError;
      return context.json({ error: { code: validation ? "validation" : "index_unavailable", message: validation ? "The index request is invalid" : "The metadata index is unavailable", details: {} } }, validation ? 400 : 503);
    }
  };
}

async function body(context: RouteContextLike): Promise<Record<string, unknown>> {
  const value = await context.req.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new IndexRequestError("invalid body");
  return value as Record<string, unknown>;
}

export function registerIndexRoutes(app: AppLike, ctx: ContextLike): void {
  app.get("/index/status", route(async (c) => {
    const index = application(ctx, c.req.query("workspaceMountId"));
    try { return c.json(await index.status()); } finally { index.close(); }
  }));
  app.get("/index/search", route(async (c) => {
    const index = application(ctx, c.req.query("workspaceMountId"));
    try {
      const query = c.req.query("query") ?? "";
      const rawLimit = c.req.query("limit");
      const limit = rawLimit === undefined ? undefined : Number(rawLimit);
      if (query.length > 240 || (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100))) throw new IndexRequestError("invalid query");
      return c.json(await index.search({ query, limit, cursor: c.req.query("cursor") }));
    } finally { index.close(); }
  }));
  app.post("/index/rebuild", route(async (c) => {
    const input = await body(c);
    const index = application(ctx, input.workspaceMountId);
    try { return c.json(await index.rebuild()); } finally { index.close(); }
  }));
  app.post("/index/sync", route(async (c) => {
    const input = await body(c);
    const index = application(ctx, input.workspaceMountId);
    try {
      if (input.action === "upsert" && typeof input.dossierId === "string") return c.json(await index.upsert(input.dossierId));
      if (input.action === "delete" && typeof input.dossierId === "string") return c.json(index.delete(input.dossierId));
      throw new IndexRequestError("invalid sync input");
    } finally { index.close(); }
  }));
}
