import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TodoApplication } from "../src/service.ts";
import { TodoStore } from "../src/store.ts";

function context(request: (type: string, payload: unknown) => Promise<unknown>) {
  return { pluginId: "todolist", dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "hana-todolist-capabilities-")), bus: { request: vi.fn(request), emit: vi.fn() } };
}

describe("todolist host-capability closure", () => {
  it("keeps a reminder visible as failed when TaskRegistry is unavailable", async () => {
    const ctx = context(async () => { throw new Error("host unavailable"); });
    const app = new TodoApplication(new TodoStore(ctx.dataDir), () => "2026-08-13T09:00:00.000Z", () => "reminder-1");
    const todo = app.create({ title: "Reminder", mode: "reminder", reminderAt: { kind: "exact", instant: "2026-08-13T10:00:00.000Z", timeZone: "UTC", offsetMinutes: 0 } }).todo;
    const result = await app.scheduleReminder(todo.id, "2026-08-13T10:00:00.000Z", ctx);
    expect(result).toMatchObject({ backgroundStatus: "failed", diagnostic: expect.stringContaining("TaskRegistry") });
    expect(app.store.snapshot().reminders[0].status).toBe("failed");
  });

  it("marks an Agent run actionable when scheduling is unavailable and starts it through Session", async () => {
    const calls: string[] = [];
    const ctx = context(async (type, payload: any) => {
      calls.push(type);
      if (type === "task:schedule") throw new Error("scheduler unavailable");
      if (type === "session:create") return { sessionRef: { sessionId: "session-1" } };
      if (type === "session:send") return { accepted: true, payload };
      return { ok: true };
    });
    const app = new TodoApplication(new TodoStore(ctx.dataDir), () => "2026-08-13T09:00:00.000Z", () => "run-1");
    const todo = app.create({ title: "Agent job", mode: "agent_execute", plannedFor: { kind: "date", date: "2026-08-13" }, agentId: "agent-1", instructions: "Do the authorized work", permissionMode: "operate", workspaceRef: "resource:workspace" }).todo;
    const scheduled = await app.scheduleAgentRun(todo.id, null, ctx);
    expect(scheduled).toMatchObject({ backgroundStatus: "needs_action" });
    const started = await app.startRun(scheduled.run.id, ctx);
    expect(started).toMatchObject({ accepted: true, run: { status: "running", sessionRef: { sessionId: "session-1" } } });
    expect(calls).toEqual(["task:schedule", "session:create", "session:send"]);
  });

  it("rejects impossible calendar dates and finds todos with normalized search", () => {
    const ctx = context(async () => ({ ok: true }));
    const app = new TodoApplication(new TodoStore(ctx.dataDir), () => "2026-08-13T09:00:00.000Z", () => "todo-1");
    expect(() => app.create({ title: "Impossible", plannedFor: { kind: "date", date: "2026-02-30" } })).toThrowError(/plannedFor/);
    app.create({ title: "  Café  ", notes: "Project note", tags: ["Focus"] });
    expect(app.query({ search: "CAFÉ" }).items).toHaveLength(1);
    expect(app.query({ search: "FOCUS" }).items).toHaveLength(1);
  });

  it("requests host cancellation after a Todo with background work enters Trash", async () => {
    const calls: string[] = [];
    const ctx = context(async (type) => { calls.push(type); return { ok: true }; });
    const app = new TodoApplication(new TodoStore(ctx.dataDir), () => "2026-08-13T09:00:00.000Z", () => "todo-1");
    const todo = app.create({ title: "Cancel me", mode: "reminder", reminderAt: { kind: "exact", instant: "2026-08-13T10:00:00.000Z", timeZone: "UTC", offsetMinutes: 0 } }).todo;
    await app.scheduleReminder(todo.id, "2026-08-13T10:00:00.000Z", ctx);
    app.remove(todo.id, todo.version);
    await app.cancelBackgroundForTodo(todo.id, ctx);
    expect(calls).toContain("task:unschedule");
  });
});
