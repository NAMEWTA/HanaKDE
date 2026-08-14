import assert from "node:assert/strict";
import test from "node:test";
import { TodoApplication } from "../src/application/todo-application.ts";
import { TodoError } from "../src/errors.ts";
import { TodoStore } from "../src/infrastructure/store.ts";
import { cleanup, FakeBus, makeInvocation, tempDir, waitFor } from "./helpers.ts";

function trigger(localDateTime = "2030-01-02T09:00") {
  return { localDateTime, timeZone: "UTC", enabled: true };
}

test("manual CRUD is idempotent and optimistic conflicts fail closed", async () => {
  const dir = tempDir("crud");
  try {
    const app = new TodoApplication(new TodoStore(dir));
    const invocation = makeInvocation();
    const first = await app.createTodo({ title: "Ship review", tags: ["work"], commandId: "create-1" }, invocation);
    const replay = await app.createTodo({ title: "different text is ignored on replay", commandId: "create-1" }, invocation);
    assert.equal(replay.value.id, first.value.id);
    assert.equal(app.query({ view: "all" }).total, 1);

    const updated = await app.updateTodo(first.value.id, { description: "Detailed plan", priority: "high" }, first.value.version, invocation, "update-1");
    assert.equal(updated.value.description, "Detailed plan");
    assert.equal(updated.value.version, 2);
    await assert.rejects(
      app.updateTodo(first.value.id, { title: "stale" }, first.value.version, invocation),
      (error: unknown) => error instanceof TodoError && error.code === "conflict",
    );
  } finally {
    cleanup(dir);
  }
});

test("Reminder scheduling uses TaskRegistry runAt and duplicate wake emits once", async () => {
  const dir = tempDir("reminder");
  const bus = new FakeBus();
  try {
    const app = new TodoApplication(new TodoStore(dir));
    const invocation = makeInvocation(bus);
    const created = await app.createTodo({
      title: "Stand up",
      mode: "reminder",
      reminderTrigger: trigger(),
      commandId: "reminder-create",
    }, invocation);
    const schedule = bus.lastRequest("task:schedule");
    assert.ok(schedule);
    const payload = schedule.payload as Record<string, unknown>;
    assert.equal(payload.runAt, "2030-01-02T09:00:00.000Z");
    assert.equal("dueAt" in payload, false);
    const reminder = app.listReminders({ todoId: created.value.id }).items[0];
    assert.equal(reminder?.status, "scheduled");

    const first = await app.handoffReminder(reminder!.id, invocation);
    const second = await app.handoffReminder(reminder!.id, invocation);
    assert.equal(first.state, "handed_off");
    assert.equal(second.duplicate, true);
    assert.equal(bus.emitted.length, 1);
    assert.equal((bus.emitted[0]?.event.notification as Record<string, unknown>).kind, "todolist.reminder");
  } finally {
    cleanup(dir);
  }
});

test("Reminder cancellation is not reported as cancelled when the host rejects unschedule", async () => {
  const dir = tempDir("reminder-cancel");
  const bus = new FakeBus();
  try {
    const app = new TodoApplication(new TodoStore(dir));
    const invocation = makeInvocation(bus);
    const created = await app.createTodo({ title: "Cancelable", mode: "reminder", reminderTrigger: trigger(), commandId: "r-cancel" }, invocation);
    const reminder = app.listReminders({ todoId: created.value.id }).items[0]!;
    bus.failUnschedule = true;
    const result = await app.cancelReminder(reminder.id, invocation);
    assert.equal(result.reminder.status, "cancel_requested");
    assert.equal(result.effects.some((effect) => effect.status === "failed"), true);
    assert.match(result.reminder.lastError ?? "", /unschedule|TaskRegistry/i);
  } finally {
    cleanup(dir);
  }
});

test("Reminder cancellation stays cancel_requested when TaskRegistry returns removed false", async () => {
  const dir = tempDir("reminder-cancel-not-removed");
  const bus = new FakeBus();
  try {
    const app = new TodoApplication(new TodoStore(dir));
    const invocation = makeInvocation(bus);
    const created = await app.createTodo({
      title: "Reminder already being claimed",
      mode: "reminder",
      reminderTrigger: trigger(),
    }, invocation);
    const reminder = app.listReminders({ todoId: created.value.id }).items[0]!;
    bus.unscheduleRemoved = false;
    const result = await app.cancelReminder(reminder.id, invocation);
    assert.equal(result.reminder.status, "cancel_requested");
    assert.equal(result.effects.some((effect) => effect.status === "failed"), true);
    assert.match(result.reminder.lastError ?? "", /did not confirm Reminder cancellation/i);
  } finally {
    cleanup(dir);
  }
});

test("Agent Session acceptance leaves Run running until a host terminal event", async () => {
  const dir = tempDir("automation");
  const workspace = tempDir("automation-workspace");
  const bus = new FakeBus();
  try {
    const app = new TodoApplication(new TodoStore(dir));
    const invocation = makeInvocation(bus, { resources: { materialize: async () => ({ path: workspace }) } });
    const created = await app.createTodo({
      title: "Generate report",
      mode: "agent_execute",
      agentTrigger: trigger(),
      agentId: "agent-one",
      instructions: "Generate the report and save it in the authorized workspace.",
      permissionMode: "workspace_write",
      workspaceRef: { scheme: "hana-workspace", resourceId: "workspace-one" },
      commandId: "automation-create",
    }, invocation);
    const run = app.listRuns({ todoId: created.value.id }).items[0]!;
    assert.equal(run.status, "scheduled");
    const started = await app.startRun(run.id, invocation);
    assert.equal(started.accepted, true);
    assert.equal(started.run.status, "running");
    assert.equal(started.attempt?.status, "running");
    assert.equal(bus.countRequests("session:create"), 1);
    assert.equal(bus.countRequests("session:send"), 1);

    // A terminal event from another Session must never complete this Run.
    bus.emitSession({ type: "session_complete", status: "completed", summary: "Wrong session" }, "/sessions/session-other");
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(app.getRunDetails(run.id).run.status, "running");

    bus.emitSession({ type: "session_complete", status: "completed", summary: "Report saved" }, "/sessions/session-1");
    await waitFor(() => app.getRunDetails(run.id).run.status === "succeeded");
    const terminal = app.getRunDetails(run.id);
    assert.equal(terminal.run.status, "succeeded");
    assert.equal(terminal.attempts[0]?.status, "succeeded");
    assert.match(terminal.run.resultSummary ?? "", /Report saved/);
  } finally {
    cleanup(workspace);
    cleanup(dir);
  }
});

test("Agent cancellation remains cancel_requested when Session host does not confirm abort", async () => {
  const dir = tempDir("automation-cancel");
  const workspace = tempDir("automation-cancel-workspace");
  const bus = new FakeBus();
  try {
    const app = new TodoApplication(new TodoStore(dir));
    const invocation = makeInvocation(bus, { resources: { materialize: async () => ({ path: workspace }) } });
    const created = await app.createTodo({
      title: "Cancelable agent run",
      mode: "agent_execute",
      agentTrigger: trigger(),
      agentId: "agent-one",
      instructions: "Do bounded work.",
      permissionMode: "workspace_write",
      workspaceRef: { scheme: "hana-workspace", resourceId: "workspace-one" },
    }, invocation);
    const run = app.listRuns({ todoId: created.value.id }).items[0]!;
    await app.startRun(run.id, invocation);
    bus.abortResult = false;
    const cancelled = await app.cancelRun(run.id, invocation);
    assert.equal(cancelled.run.status, "cancel_requested");
    assert.equal(cancelled.effects.some((effect) => effect.status === "failed"), true);
  } finally {
    cleanup(workspace);
    cleanup(dir);
  }
});

test("queued Agent Run remains cancel_requested when TaskRegistry returns removed false", async () => {
  const dir = tempDir("automation-cancel-not-removed");
  const bus = new FakeBus();
  try {
    const app = new TodoApplication(new TodoStore(dir));
    const invocation = makeInvocation(bus);
    const created = await app.createTodo({
      title: "Queued automation",
      mode: "agent_execute",
      agentTrigger: trigger(),
      agentId: "agent-one",
      instructions: "Do bounded work.",
      permissionMode: "workspace_write",
      workspaceRef: { scheme: "hana-workspace", resourceId: "workspace-one" },
    }, invocation);
    const run = app.listRuns({ todoId: created.value.id }).items[0]!;
    bus.unscheduleRemoved = false;
    const result = await app.cancelRun(run.id, invocation);
    assert.equal(result.run.status, "cancel_requested");
    assert.equal(result.effects.some((effect) => effect.status === "failed"), true);
    assert.equal(bus.countRequests("session:abort"), 0);
  } finally {
    cleanup(dir);
  }
});

test("running Agent Run may cancel when Session abort is confirmed even if schedule was already claimed", async () => {
  const dir = tempDir("automation-cancel-session-confirmed");
  const workspace = tempDir("automation-cancel-session-confirmed-workspace");
  const bus = new FakeBus();
  try {
    const app = new TodoApplication(new TodoStore(dir));
    const invocation = makeInvocation(bus, { resources: { materialize: async () => ({ path: workspace }) } });
    const created = await app.createTodo({
      title: "Running automation",
      mode: "agent_execute",
      agentTrigger: trigger(),
      agentId: "agent-one",
      instructions: "Do bounded work.",
      permissionMode: "workspace_write",
      workspaceRef: { scheme: "hana-workspace", resourceId: "workspace-one" },
    }, invocation);
    const run = app.listRuns({ todoId: created.value.id }).items[0]!;
    await app.startRun(run.id, invocation);
    bus.abortResult = true;
    bus.unscheduleRemoved = false;
    const result = await app.cancelRun(run.id, invocation);
    assert.equal(result.run.status, "cancelled");
    const abortRequest = bus.lastRequest("session:abort");
    assert.deepEqual(abortRequest?.payload, { sessionPath: "/sessions/session-1" });
  } finally {
    cleanup(workspace);
    cleanup(dir);
  }
});

test("running Agent Run fails closed when the host did not provide a sessionPath", async () => {
  const dir = tempDir("automation-cancel-no-session-path");
  const workspace = tempDir("automation-cancel-no-session-path-workspace");
  const bus = new FakeBus();
  bus.sessionPathAvailable = false;
  try {
    const app = new TodoApplication(new TodoStore(dir));
    const invocation = makeInvocation(bus, { resources: { materialize: async () => ({ path: workspace }) } });
    const created = await app.createTodo({
      title: "Automation without path",
      mode: "agent_execute",
      agentTrigger: trigger(),
      agentId: "agent-one",
      instructions: "Do bounded work.",
      permissionMode: "workspace_write",
      workspaceRef: { scheme: "hana-workspace", resourceId: "workspace-one" },
    }, invocation);
    const run = app.listRuns({ todoId: created.value.id }).items[0]!;
    await app.startRun(run.id, invocation);
    const result = await app.cancelRun(run.id, invocation);
    assert.equal(result.run.status, "cancel_requested");
    assert.equal(result.effects.some((effect) => effect.status === "failed"), true);
    assert.equal(bus.countRequests("session:abort"), 0);
    assert.match(result.run.lastError ?? "", /sessionPath/i);
  } finally {
    cleanup(workspace);
    cleanup(dir);
  }
});

test("purge confirmation is bound to actor, session, target, and version", async () => {
  const dir = tempDir("purge");
  try {
    const app = new TodoApplication(new TodoStore(dir));
    const alice = makeInvocation(new FakeBus(), { actorKey: "alice", sessionKey: "session-a" });
    const bob = makeInvocation(new FakeBus(), { actorKey: "bob", sessionKey: "session-b" });
    const created = await app.createTodo({ title: "Delete me" }, alice);
    const trashed = await app.trashTodo(created.value.id, created.value.version, alice);
    const prepared = await app.preparePurge(created.value.id, trashed.value.version, alice);
    await assert.rejects(
      app.confirmPurge(created.value.id, prepared.token, bob),
      (error: unknown) => error instanceof TodoError && error.code === "confirmation_invalid",
    );
    const result = await app.confirmPurge(created.value.id, prepared.token, alice);
    assert.equal(result.ok, true);
    assert.throws(() => app.getTodo(created.value.id), (error: unknown) => error instanceof TodoError && error.code === "not_found");
  } finally {
    cleanup(dir);
  }
});

test("Agent workspaces persist opaque ResourceRefs and reject absolute paths or credentials", async () => {
  const dir = tempDir("resource-ref");
  const workspace = tempDir("resource-materialized");
  try {
    const app = new TodoApplication(new TodoStore(dir));
    const invocation = makeInvocation(new FakeBus(), {
      resources: { materialize: async () => ({ path: workspace }) },
    });
    const created = await app.createTodo({
      title: "Portable workspace",
      mode: "agent_execute",
      agentTrigger: trigger(),
      agentId: "agent-one",
      instructions: "Work only in the selected resource.",
      permissionMode: "workspace_write",
      workspaceRef: { scheme: "hana-workspace", resourceId: "workspace-one", relativePath: "reports" },
    }, invocation);
    assert.deepEqual(created.value.workspaceRef, {
      scheme: "hana-workspace",
      resourceId: "workspace-one",
      relativePath: "reports",
    });

    await assert.rejects(
      app.createTodo({
        title: "Unsafe workspace",
        mode: "agent_execute",
        agentTrigger: trigger(),
        agentId: "agent-one",
        instructions: "Unsafe input",
        permissionMode: "workspace_write",
        workspaceRef: { kind: "local", path: workspace },
      }, invocation),
      (error: unknown) => error instanceof TodoError && error.code === "validation" && /absolute path/i.test(error.message),
    );

    await assert.rejects(
      app.createTodo({
        title: "Credential-bearing workspace",
        mode: "agent_execute",
        agentTrigger: trigger(),
        agentId: "agent-one",
        instructions: "Unsafe input",
        permissionMode: "workspace_write",
        workspaceRef: { scheme: "hana-workspace", resourceId: "workspace-two", accessToken: "do-not-store" },
      }, invocation),
      (error: unknown) => error instanceof TodoError && error.code === "validation" && /credentials or secrets/i.test(error.message),
    );
  } finally {
    cleanup(workspace);
    cleanup(dir);
  }
});

test("purge removes dependent Reminder intents and keeps recurrence references valid", async () => {
  const dir = tempDir("purge-cascade");
  const bus = new FakeBus();
  try {
    const app = new TodoApplication(new TodoStore(dir));
    const invocation = makeInvocation(bus);
    const reminded = await app.createTodo({
      title: "Reminder to purge",
      mode: "reminder",
      reminderTrigger: trigger(),
    }, invocation);
    const reminderId = app.listReminders({ todoId: reminded.value.id }).items[0]!.id;
    const trashedReminder = await app.trashTodo(reminded.value.id, reminded.value.version, invocation);
    const preparedReminder = await app.preparePurge(reminded.value.id, trashedReminder.value.version, invocation);
    await app.confirmPurge(reminded.value.id, preparedReminder.token, invocation);
    const afterReminderPurge = app.store.snapshot();
    assert.equal(afterReminderPurge.reminders[reminderId], undefined);
    assert.equal(Object.values(afterReminderPurge.intents).some((intent) => intent.entityId === reminderId), false);

    const source = await app.createTodo({ title: "Recurring source", plannedFor: "2026-08-10" }, invocation);
    const recurrence = await app.createRecurrenceSeries(source.value.id, {
      kind: "calendar",
      frequency: "daily",
      interval: 1,
      anchorDate: "2026-08-10",
      timeZone: "UTC",
    }, source.value.version, invocation, "2026-08-11");
    const sourceAfterRecurrence = app.getTodo(source.value.id);
    const trashedSource = await app.trashTodo(source.value.id, sourceAfterRecurrence.version, invocation);
    const preparedSource = await app.preparePurge(source.value.id, trashedSource.value.version, invocation);
    await app.confirmPurge(source.value.id, preparedSource.token, invocation);
    const afterSourcePurge = app.store.snapshot();
    const series = afterSourcePurge.recurrenceSeries[recurrence.series.id];
    assert.ok(series);
    assert.notEqual(series.sourceTodoId, source.value.id);
    assert.ok(afterSourcePurge.todos[series.sourceTodoId]);
  } finally {
    cleanup(dir);
  }
});
