import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { TodoApplication } from "../src/service.ts";
import { TodoStore } from "../src/store.ts";

function makeApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-todolist-life-"));
  const store = new TodoStore(dir);
  return { app: new TodoApplication(store, () => "2026-08-13T09:00:00.000Z", randomUUID), store };
}

describe("todolist T-02 lifecycle seam", () => {
  it("soft deletes, lists Trash, restores, and preserves the Todo identity", () => {
    const { app } = makeApp();
    const created = app.create({ title: "Recover me" });
    const trashed = app.remove(created.todo.id, created.todo.version);
    expect(app.query().items).toHaveLength(0);
    expect(app.query({ includeTrash: true }).items[0]).toMatchObject({ id: created.todo.id, deletedAt: trashed.todo.deletedAt, title: "Recover me" });
    expect(app.restore(created.todo.id, trashed.todo.version).todo).toMatchObject({ id: created.todo.id, deletedAt: null, version: 3 });
  });

  it("requires a session-bound, one-shot confirmation for permanent purge", () => {
    const { app } = makeApp();
    const created = app.create({ title: "Purge me" });
    const trashed = app.remove(created.todo.id, created.todo.version);
    const prepared = app.preparePurge([trashed.todo.id], "session-a");
    expect(() => app.confirmPurge(prepared.confirmationId, "session-b")).toThrowError(expect.objectContaining({ code: "forbidden" }));
    expect(app.confirmPurge(prepared.confirmationId, "session-a").purged).toEqual([trashed.todo.id]);
    expect(() => app.confirmPurge(prepared.confirmationId, "session-a")).toThrowError(expect.objectContaining({ code: "conflict" }));
    expect(() => app.get(trashed.todo.id, true)).toThrowError(expect.objectContaining({ code: "not_found" }));
  });

  it("rolls back a failed purge without partially deleting targets", () => {
    const { app, store } = makeApp();
    const first = app.remove(app.create({ title: "one" }).todo.id, 1).todo;
    const second = app.remove(app.create({ title: "two" }).todo.id, 1).todo;
    const prepared = app.preparePurge([first.id, second.id], "session-a");
    store.injectCommitFailure();
    expect(() => app.confirmPurge(prepared.confirmationId, "session-a")).toThrowError(expect.objectContaining({ code: "transaction_failed" }));
    expect(app.query({ includeTrash: true }).items).toHaveLength(2);
  });
});
