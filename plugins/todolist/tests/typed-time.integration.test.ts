import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TodoApplication } from "../src/service.ts";
import { TodoStore } from "../src/store.ts";

describe("todolist T-04 typed time projection", () => {
  it("keeps date values floating and uses the earlier planned/deadline date once", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-todolist-time-"));
    const app = new TodoApplication(new TodoStore(dir), () => "2026-08-13T09:00:00.000Z", () => "time-1");
    const result = app.create({ title: "Review", plannedFor: { kind: "date", date: "2026-08-14" }, deadline: { kind: "date", date: "2026-08-13" } });
    expect(app.query({ view: "today", timeZone: "UTC" }).items[0]).toMatchObject({ id: result.todo.id, attentionDate: "2026-08-13" });
    expect(app.query({ view: "upcoming", timeZone: "UTC" }).items).toHaveLength(0);
  });

  it("preserves exact instant and zone metadata", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-todolist-time-"));
    const app = new TodoApplication(new TodoStore(dir), () => "2026-08-13T09:00:00.000Z", () => "time-2");
    const result = app.create({ title: "DST aware", plannedFor: { kind: "exact", instant: "2026-11-01T05:30:00.000Z", timeZone: "America/New_York", offsetMinutes: -240 } });
    expect(result.todo.plannedFor).toEqual({ kind: "exact", instant: "2026-11-01T05:30:00.000Z", timeZone: "America/New_York", offsetMinutes: -240 });
  });

  it("does not allow agent execution without an explicit trigger when editing mode", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-todolist-mode-"));
    const app = new TodoApplication(new TodoStore(dir), () => "2026-08-13T09:00:00.000Z", () => "mode-1");
    const todo = app.create({ title: "Manual" }).todo;
    expect(() => app.update(todo.id, { expectedVersion: todo.version, mode: "agent_execute" })).toThrowError(expect.objectContaining({ code: "validation" }));
  });
});
