import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createFileHistoryRoute } from "../server/routes/file-history.ts";

function makeApp() {
  const service = {
    isAvailable: vi.fn(() => true),
    listFiles: vi.fn(() => [{ relPath: "a.md", deletedAt: null, lastCapturedAt: 1_000, snapshotCount: 2 }]),
    listVersions: vi.fn(() => [{ id: 7, capturedAt: 1_000, origin: "event", opContext: "agent_tool", rawSize: 5 }]),
    getSnapshotContent: vi.fn(() => ({ relPath: "a.md", content: Buffer.from("hello"), capturedAt: 1_000, origin: "event" })),
    getSnapshotDiff: vi.fn(() => ({
      relPath: "a.md",
      fromSnapshotId: 6,
      toSnapshotId: 7,
      lines: [{ kind: "added", text: "hello\n" }],
    })),
  };
  const engine = { getFileHistoryService: () => service };
  const app = new Hono();
  app.route("/api", createFileHistoryRoute(engine));
  return { app, service };
}

describe("file-history route", () => {
  it("queries only the already authorized current main history", async () => {
    const { app, service } = makeApp();
    const res = await app.request("/api/file-history/files");
    expect(res.status).toBe(200);
    expect((await res.json()).files).toEqual(expect.arrayContaining([expect.objectContaining({ relPath: "a.md" })]));
    expect(service.listFiles).toHaveBeenCalledWith();
  });

  it("returns timeline and line diff without accepting a root selector", async () => {
    const { app, service } = makeApp();
    const versions = await app.request("/api/file-history/versions?relPath=a.md");
    expect(versions.status).toBe(200);
    expect((await versions.json()).versions[0].id).toBe(7);

    const diff = await app.request("/api/file-history/diff?snapshotId=7&baseSnapshotId=6");
    expect(diff.status).toBe(200);
    expect((await diff.json()).diff.lines[0]).toMatchObject({ kind: "added", text: "hello\n" });
    expect(service.getSnapshotDiff).toHaveBeenCalledWith(7, 6);
  });

  it("rejects raw root, public workspace identity, and arbitrary agent selectors", async () => {
    const { app, service } = makeApp();
    for (const query of [
      "?root=%2Fprivate%2Fworkspace",
      "?workspaceId=forged-public-id",
      "?agentId=someone-else",
    ]) {
      const res = await app.request(`/api/file-history/files${query}`);
      expect(res.status).toBe(400);
    }
    expect(service.listFiles).not.toHaveBeenCalled();
  });

  it("rejects path traversal and unavailable main history", async () => {
    const { app, service } = makeApp();
    expect((await app.request("/api/file-history/versions?relPath=../../etc/passwd")).status).toBe(400);
    expect((await app.request("/api/file-history/versions?relPath=%2Fetc%2Fpasswd")).status).toBe(400);
    service.isAvailable.mockReturnValue(false);
    expect((await app.request("/api/file-history/files")).status).toBe(503);
  });

  it("does not expose full snapshot text or the pre-convergence restore endpoint", async () => {
    const { app } = makeApp();
    expect((await app.request("/api/file-history/snapshot?id=7")).status).toBe(404);
    expect((await app.request("/api/file-history/restore", { method: "POST" })).status).toBe(404);
  });
});
