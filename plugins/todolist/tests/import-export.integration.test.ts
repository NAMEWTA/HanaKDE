import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TodoApplication } from "../src/service.ts";
import { TodoStore } from "../src/store.ts";
import { TodoExchange } from "../src/exchange.ts";

function make() {
  const app = new TodoApplication(new TodoStore(fs.mkdtempSync(path.join(os.tmpdir(), "hana-todolist-exchange-"))), () => "2026-08-13T09:00:00.000Z", () => "exchange-1");
  return { app, exchange: new TodoExchange(app, () => "2026-08-13T09:00:00.000Z") };
}

describe("todolist T-09 exchange seam", () => {
  it("previews without writing, commits JSON v1 by digest, and rejects duplicate commit", () => {
    const { app, exchange } = make();
    const preview = exchange.preview({ kind: "hana-todolist", schemaVersion: 1, todos: [{ id: "import-1", title: "Imported", notes: "", status: "pending", mode: "manual", plannedFor: null, deadline: null, reminderAt: null, projectId: null, tags: [], createdAt: "2026-08-13T09:00:00.000Z", updatedAt: "2026-08-13T09:00:00.000Z", completedAt: null, deletedAt: null, version: 1 }], projects: [] }, "command-1");
    expect(app.query().items).toHaveLength(0);
    expect(exchange.commit(preview.previewId).imported).toEqual(["import-1"]);
    expect(() => exchange.commit(preview.previewId)).toThrowError(expect.objectContaining({ code: "already_committed" }));
  });

  it("rejects SQLite/unknown/sensitive input and exports a redacted JSON plus Review markdown", () => {
    const { exchange } = make();
    expect(() => exchange.preview("SQLite format 3\u0000", "sqlite")).toThrowError(expect.objectContaining({ code: "unsupported_format" }));
    expect(() => exchange.preview({ kind: "unknown", schemaVersion: 99, todos: [], projects: [] }, "unknown")).toThrowError(expect.objectContaining({ code: "unsupported_format" }));
    expect(() => exchange.preview({ kind: "hana-todolist", schemaVersion: 1, todos: [], projects: [], secret: "x" }, "secret")).toThrowError(expect.objectContaining({ code: "invalid_schema" }));
    expect(exchange.export().content).not.toMatch(/secret|transcript|workspacePath/);
    expect(exchange.markdownReview()).toContain("Hana Todo Review");
  });
});
