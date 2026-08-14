import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TodoApplication } from "../src/service.ts";
import { TodoStore } from "../src/store.ts";

describe("todolist T-07 automation run seam", () => {
  it("keeps one Run per Todo occurrence and appends an Attempt on retry", () => {
    const app = new TodoApplication(new TodoStore(fs.mkdtempSync(path.join(os.tmpdir(), "hana-todolist-run-"))), () => "2026-08-13T09:00:00.000Z", () => "run-1");
    const todo = app.create({ title: "Automate", mode: "agent_execute", plannedFor: { kind: "date", date: "2026-08-13" }, agentId: "agent-1", instructions: "Run the authorized task", permissionMode: "operate", workspaceRef: "resource:workspace" }).todo;
    const first = app.createRun(todo.id, "occ-1").run;
    expect(app.createRun(todo.id, "occ-1").run.id).toBe(first.id);
    app.setRunState(first.id, "failed", { diagnostic: "redacted", summary: "accepted" });
    const retry = app.retryRun(first.id);
    expect(retry).toMatchObject({ run: { status: "queued" }, attemptNumber: 2 });
    expect(app.setRunState(first.id, "cancel_requested").run.status).toBe("cancel_requested");
    expect(app.setRunState(first.id, "cancelled").run.status).toBe("cancelled");
  });
});
