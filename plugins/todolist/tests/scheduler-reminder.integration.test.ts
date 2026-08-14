import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TodoApplication } from "../src/service.ts";
import { TodoStore } from "../src/store.ts";

describe("todolist T-06 reminder seam", () => {
  it("claims once, emits the existing notification event, and does not claim delivery", async () => {
    const events: unknown[] = [];
    const ctx = { pluginId: "todolist", dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "hana-todolist-reminder-")), bus: { emit: vi.fn((event) => events.push(event)), request: vi.fn(async () => ({ ok: true })) } };
    const app = new TodoApplication(new TodoStore(ctx.dataDir), () => "2026-08-13T09:00:00.000Z", () => "rem-1");
    const todo = app.create({ title: "Notify", mode: "reminder", reminderAt: { kind: "exact", instant: "2026-08-13T10:00:00.000Z", timeZone: "UTC", offsetMinutes: 0 } }).todo;
    const scheduled = await app.scheduleReminder(todo.id, "2026-08-13T10:00:00.000Z", ctx);
    const handoff = await app.handoffReminder(scheduled.reminder.id, ctx);
    expect(handoff).toMatchObject({ reminder: { status: "handed_off" }, delivered: false });
    expect(events).toHaveLength(1);
    expect((await app.handoffReminder(scheduled.reminder.id, ctx)).reminder.status).toBe("handed_off");
  });
});
