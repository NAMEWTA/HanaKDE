import { Hono } from "hono";
import { isSafeHistoryRelativePath } from "../../lib/file-history/text-file-policy.ts";

const FORBIDDEN_SELECTORS = ["agentId", "root", "workspaceId"];

function parsePositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function hasForbiddenSelector(request: { query: (name: string) => string | undefined }): boolean {
  return FORBIDDEN_SELECTORS.some(name => request.query(name) !== undefined);
}

function mainHistoryService(engine: any, c: any): any | Response {
  if (hasForbiddenSelector(c.req)) return c.json({ error: "main history does not accept workspace selectors" }, 400);
  const service = typeof engine?.getFileHistoryService === "function" ? engine.getFileHistoryService() : null;
  if (!service || typeof service.isAvailable !== "function" || !service.isAvailable()) {
    return c.json({ error: "main history is unavailable" }, 503);
  }
  return service;
}

function errorResponse(c: any, error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  return c.json({ error: "file history request failed" }, /not found/i.test(message) ? 404 : 500);
}

export function createFileHistoryRoute(engine: any) {
  const route = new Hono();

  route.get("/file-history/files", async (c) => {
    const service = mainHistoryService(engine, c);
    if (service instanceof Response) return service;
    try {
      return c.json({ files: service.listFiles() });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  route.get("/file-history/versions", async (c) => {
    const service = mainHistoryService(engine, c);
    if (service instanceof Response) return service;
    const relPath = c.req.query("relPath");
    if (!isSafeHistoryRelativePath(relPath)) return c.json({ error: "invalid relPath" }, 400);
    try {
      return c.json({ versions: service.listVersions(relPath) });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  route.get("/file-history/diff", async (c) => {
    const service = mainHistoryService(engine, c);
    if (service instanceof Response) return service;
    const snapshotId = parsePositiveInteger(c.req.query("snapshotId"));
    const baseQuery = c.req.query("baseSnapshotId");
    const baseSnapshotId = baseQuery === undefined ? undefined : parsePositiveInteger(baseQuery);
    if (!snapshotId || (baseQuery !== undefined && !baseSnapshotId)) return c.json({ error: "invalid snapshot id" }, 400);
    try {
      return c.json({ diff: service.getSnapshotDiff(snapshotId, baseSnapshotId) });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  return route;
}
