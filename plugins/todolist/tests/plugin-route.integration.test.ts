import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import registerRoutes from "../routes/api.ts";

describe("todolist authenticated route seam", () => {
  it("uses one ctx/dataDir store for route create, query, version conflict, and trash", async () => {
    const ctx = { pluginId: "todolist", dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "hana-todolist-route-")), bus: { emit() {}, request: async () => ({ ok: true }) } };
    const app = new Hono(); registerRoutes(app, ctx);
    const createdResponse = await app.request("/api/todos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Route todo" }) });
    const created = await createdResponse.json();
    expect(created.todo.title).toBe("Route todo");
    const queryResponse = await app.request("/api/todos");
    expect((await queryResponse.json()).items).toHaveLength(1);
    const stale = await app.request(`/api/todos/${created.todo.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: 99, title: "bad" }) });
    expect(stale.status).toBe(409);
    const trashed = await app.request(`/api/todos/${created.todo.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: 1 }) });
    expect((await trashed.json()).todo.deletedAt).toBeTruthy();
    expect((await (await app.request("/api/todos")).json()).items).toHaveLength(0);
  });
});
