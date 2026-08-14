import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TodoApplication } from "../src/service.ts";
import { TodoStore } from "../src/store.ts";

describe("todolist T-05 recurrence seam", () => {
  it("materializes a bounded daily window idempotently", () => {
    const app = new TodoApplication(new TodoStore(fs.mkdtempSync(path.join(os.tmpdir(), "hana-todolist-rec-"))), () => "2026-08-13T09:00:00.000Z", () => "rec-1");
    const todo = app.create({ title: "Daily" }).todo;
    const rule = app.createRecurrence(todo.id, { frequency: "daily", interval: 1 });
    const first = app.materialize(todo.id, "2026-08-13", 3);
    const second = app.materialize(todo.id, "2026-08-13", 3);
    expect(rule.rule.frequency).toBe("daily");
    expect(first.occurrences.map((item) => item.id)).toEqual(["rec-1:2026-08-13", "rec-1:2026-08-14", "rec-1:2026-08-15"]);
    expect(second.occurrences).toHaveLength(0);
  });

  it("creates exactly one next occurrence after completing an after-completion occurrence", () => {
    const app = new TodoApplication(new TodoStore(fs.mkdtempSync(path.join(os.tmpdir(), "hana-todolist-after-"))), () => "2026-08-13T09:00:00.000Z", () => "after-1");
    const todo = app.create({ title: "After completion" }).todo;
    const rule = app.createRecurrence(todo.id, { frequency: "daily", interval: 2, afterCompletion: true });
    const materialized = app.materialize(todo.id, "2026-08-13", 1);
    const completed = app.completeOccurrence(materialized.occurrences[0].id);
    expect(completed.created).toHaveLength(1);
    expect(completed.created[0].id).toBe(`${rule.rule.id}:2026-08-15`);
    expect(app.completeOccurrence(materialized.occurrences[0].id).created).toHaveLength(0);
  });

  it("skips an occurrence and versions rule edits without rewriting history", () => {
    const app = new TodoApplication(new TodoStore(fs.mkdtempSync(path.join(os.tmpdir(), "hana-todolist-history-"))), () => "2026-08-13T09:00:00.000Z", () => "history-1");
    const todo = app.create({ title: "History" }).todo;
    const rule = app.createRecurrence(todo.id, { frequency: "weekly", interval: 1 });
    const occurrence = app.materialize(todo.id, "2026-08-13", 1).occurrences[0];
    expect(app.skipOccurrence(occurrence.id).occurrence.status).toBe("skipped");
    const edited = app.updateRecurrence(rule.rule.id, rule.rule.version, { status: "paused", interval: 2 });
    expect(edited.rule).toMatchObject({ status: "paused", interval: 2, version: 2 });
    expect(app.queryOccurrences(todo.id)[0]).toMatchObject({ id: occurrence.id, status: "skipped", occurrenceDate: "2026-08-13" });
  });
});
