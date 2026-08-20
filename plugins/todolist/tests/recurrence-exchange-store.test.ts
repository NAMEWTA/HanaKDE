import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { TodoExchange } from "../src/application/exchange.ts";
import { TodoApplication } from "../src/application/todo-application.ts";
import { TodoError } from "../src/errors.ts";
import { TodoStore } from "../src/infrastructure/store.ts";
import { cleanup, FakeBus, makeInvocation, tempDir } from "./helpers.ts";

test("recurrence materializes independent Todos with stable rule versions and idempotent replay", async () => {
  const dir = tempDir("recurrence");
  try {
    const app = new TodoApplication(new TodoStore(dir));
    const invocation = makeInvocation(new FakeBus());
    const source = await app.createTodo({ title: "Daily check", plannedFor: "2026-08-10" }, invocation);
    const created = await app.createRecurrenceSeries(source.value.id, {
      kind: "calendar",
      frequency: "daily",
      interval: 1,
      anchorDate: "2026-08-10",
      timeZone: "America/Los_Angeles",
    }, source.value.version, invocation, "2026-08-12");
    const all = app.query({ view: "all", limit: 100 }).items.filter((todo) => todo.recurrenceSeriesId === created.series.id);
    assert.equal(all.length, 3);
    assert.equal(new Set(all.map((todo) => todo.id)).size, 3);
    assert.deepEqual(all.map((todo) => todo.occurrenceMeta?.nominalLocalDate).sort(), ["2026-08-10", "2026-08-11", "2026-08-12"]);
    assert.equal(all.every((todo) => Boolean(todo.occurrenceMeta?.ruleVersionId)), true);

    const before = app.store.snapshot().revision;
    const replay = await app.materializeRecurrence(created.series.id, "2026-08-10", "2026-08-12", invocation);
    assert.equal(replay.items.length, 0);
    assert.equal(app.store.snapshot().revision, before);

    const occurrence = all.find((todo) => todo.occurrenceMeta?.nominalLocalDate === "2026-08-11")!;
    const oldRuleVersion = occurrence.occurrenceMeta!.ruleVersionId;
    const updated = await app.updateRecurrence(occurrence.id, "this_and_future", {
      expectedVersion: occurrence.version,
      patch: { title: "Every other day" },
      rule: {
        kind: "calendar",
        frequency: "daily",
        interval: 2,
        anchorDate: "2026-08-11",
        timeZone: "America/Los_Angeles",
      },
    }, invocation);
    assert.notEqual(updated.todo.occurrenceMeta?.ruleVersionId, oldRuleVersion);
    const historical = app.getTodo(source.value.id);
    assert.equal(historical.occurrenceMeta?.ruleVersionId, oldRuleVersion);
    assert.equal(app.listRecurrence().ruleVersions.length, 2);
  } finally {
    cleanup(dir);
  }
});

test("import preview survives a new application object and commit is atomic/idempotent", async () => {
  const sourceDir = tempDir("exchange-source");
  const targetDir = tempDir("exchange-target");
  try {
    const invocation = makeInvocation(new FakeBus(), { actorKey: "importer", sessionKey: "import-session" });
    const sourceStore = new TodoStore(sourceDir);
    const sourceApp = new TodoApplication(sourceStore);
    const project = await sourceApp.createProject("Imported project", invocation);
    await sourceApp.createTodo({ title: "Imported Todo", projectId: project.value.id }, invocation);
    const document = new TodoExchange(sourceStore).exportDocument();

    const firstExchange = new TodoExchange(new TodoStore(targetDir));
    const preview = await firstExchange.preview(JSON.stringify(document), invocation);
    assert.equal(preview.preview.canCommit, true);

    const afterRestart = new TodoExchange(new TodoStore(targetDir));
    const committed = await afterRestart.commit(preview.preview.id, "import-command", invocation);
    assert.equal(committed.imported.todos, 1);
    assert.equal(committed.imported.projects, 1);
    const replay = await afterRestart.commit(preview.preview.id, "import-command", invocation);
    assert.equal(replay.replayed, true);
    assert.equal(new TodoApplication(new TodoStore(targetDir)).query({ view: "all" }).total, 1);
  } finally {
    cleanup(sourceDir);
    cleanup(targetDir);
  }
});

test("import commit rejects a stale target revision with zero imported entities", async () => {
  const sourceDir = tempDir("exchange-stale-source");
  const targetDir = tempDir("exchange-stale-target");
  try {
    const invocation = makeInvocation();
    const sourceStore = new TodoStore(sourceDir);
    await new TodoApplication(sourceStore).createTodo({ title: "Source" }, invocation);
    const exchange = new TodoExchange(new TodoStore(targetDir));
    const preview = await exchange.preview(new TodoExchange(sourceStore).exportDocument(), invocation);
    await new TodoApplication(new TodoStore(targetDir)).createTodo({ title: "Concurrent target write" }, invocation);
    await assert.rejects(
      exchange.commit(preview.preview.id, "stale-command", invocation),
      (error: unknown) => error instanceof TodoError && error.code === "preview_stale",
    );
    assert.equal(new TodoApplication(new TodoStore(targetDir)).query({ view: "all" }).total, 1);
  } finally {
    cleanup(sourceDir);
    cleanup(targetDir);
  }
});

test("v1 migration preserves data but never reactivates old schedules or Sessions", () => {
  const dir = tempDir("migration");
  try {
    fs.writeFileSync(path.join(dir, "store.v1.json"), JSON.stringify({
      schemaVersion: 1,
      storeVersion: 7,
      todos: [{ id: "todo-old", title: "Legacy", status: "pending", mode: "reminder", reminderAt: { kind: "exact", instant: "2030-01-02T09:00:00.000Z", timeZone: "UTC", offsetMinutes: 0 }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", version: 2 }],
      projects: [],
      reminders: [{ id: "rem-old", todoId: "todo-old", dueAt: "2030-01-02T09:00:00.000Z", status: "scheduled", attempts: 0 }],
      runs: [{ id: "run-old", todoId: "todo-old", status: "running", createdAt: "2026-01-01T00:00:00.000Z" }],
      attempts: [],
    }, null, 2));
    const snapshot = new TodoStore(dir).snapshot();
    assert.equal(snapshot.todos["todo-old"]?.mode, "manual");
    assert.equal(snapshot.todos["todo-old"]?.reminderTrigger?.enabled, false);
    assert.equal(snapshot.reminders["rem-old"]?.status, "handoff_unknown");
    assert.equal(snapshot.runs["run-old"]?.status, "needs_action");
    assert.equal(Object.keys(snapshot.intents).length, 0);
    assert.equal(fs.existsSync(path.join(dir, "store.v1.json.pre-v2.bak")), true);
  } finally {
    cleanup(dir);
  }
});

test("atomic store failure leaves the prior file readable and unchanged", async () => {
  const dir = tempDir("store-failure");
  try {
    const store = new TodoStore(dir);
    const before = store.snapshot();
    store.injectFailure("before_rename");
    await assert.rejects(store.transact((draft) => {
      draft.runtime.taskBackend = "ready";
    }), (error: unknown) => error instanceof TodoError && error.code === "transaction_failed");
    const after = new TodoStore(dir).snapshot();
    assert.equal(after.revision, before.revision);
    assert.equal(after.runtime.taskBackend, before.runtime.taskBackend);
    const temporaryFiles = fs.readdirSync(dir).filter((name) => name.endsWith(".tmp"));
    assert.deepEqual(temporaryFiles, []);
  } finally {
    cleanup(dir);
  }
});

test("exchange preserves portable ResourceRefs and never exports materialized absolute paths", async () => {
  const dir = tempDir("exchange-resource-ref");
  const materialized = tempDir("exchange-materialized");
  try {
    const store = new TodoStore(dir);
    const app = new TodoApplication(store);
    const invocation = makeInvocation(new FakeBus(), {
      resources: { materialize: async () => ({ path: materialized }) },
    });
    await app.createTodo({
      title: "Portable automation",
      mode: "agent_execute",
      agentTrigger: { localDateTime: "2030-01-02T09:00", timeZone: "UTC", enabled: true },
      agentId: "agent-one",
      instructions: "Create a report.",
      permissionMode: "workspace_write",
      workspaceRef: { scheme: "hana-workspace", resourceId: "resource-123", relativePath: "reports" },
    }, invocation);
    const json = JSON.stringify(new TodoExchange(store).exportDocument());
    assert.match(json, /resource-123/);
    assert.equal(json.includes(materialized), false);
  } finally {
    cleanup(materialized);
    cleanup(dir);
  }
});
