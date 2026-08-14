import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TodoApplication } from "../src/service.ts";
import { TodoStore } from "../src/store.ts";
import { TodoError } from "../src/errors.ts";

function makeApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-todolist-"));
  const store = new TodoStore(dir);
  return { app: new TodoApplication(store, () => "2026-08-13T09:00:00.000Z", () => "todo-1"), store, dir };
}

describe("todolist T-01 CRUD seam", () => {
  it("creates and reads through the same persistent store with bounded pagination", () => {
    const { app, dir } = makeApp();
    const created = app.create({ title: "Ship Todo plugin", tags: ["release", "release"] });
    expect(created.todo).toMatchObject({ id: "todo-1", title: "Ship Todo plugin", version: 1, status: "pending", tags: ["release"] });
    const reopened = new TodoApplication(new TodoStore(dir));
    expect(reopened.query({ limit: 1 }).items[0]).toMatchObject(created.todo);
  });

  it("updates, completes, reopens, and rejects stale versions atomically", () => {
    const { app } = makeApp();
    const created = app.create({ title: "Initial" });
    const updated = app.update(created.todo.id, { title: "Updated", expectedVersion: 1 });
    expect(app.complete(created.todo.id, updated.todo.version).todo.status).toBe("completed");
    expect(app.reopen(created.todo.id, 3).todo.status).toBe("pending");
    expect(() => app.update(created.todo.id, { title: "stale", expectedVersion: 1 })).toThrowError(expect.objectContaining({ code: "conflict" }));
    expect(app.get(created.todo.id).todo.title).toBe("Updated");
  });

  it("rejects invalid input and rolls back a failed commit without leaking diagnostics", () => {
    const { app, store } = makeApp();
    expect(() => app.create({ title: "" })).toThrowError(expect.objectContaining({ code: "validation" }));
    const created = app.create({ title: "Keep" });
    store.injectCommitFailure();
    expect(() => app.update(created.todo.id, { title: "Nope", expectedVersion: 1 })).toThrowError(expect.objectContaining({ code: "transaction_failed" }));
    expect(app.get(created.todo.id).todo.title).toBe("Keep");
    const error = new TodoError("validation", "bad", { secret: "do-not-show", absolutePath: "/private" });
    expect(error.details).toEqual({});
  });
});
