import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import registerTodoRoutes from "../routes/api.ts";
import { disposeRuntime } from "../src/runtime.ts";
import { cleanup, FakeBus, makePluginContext, tempDir } from "./helpers.ts";

type JsonObject = Record<string, unknown>;

interface ApiJson extends JsonObject {
  value: JsonObject;
  items: JsonObject[];
  todo: JsonObject;
  token: string;
}

async function json(response: Response): Promise<ApiJson> {
  const value = await response.json();
  assert.equal(response.ok, true, JSON.stringify(value));
  return value as ApiJson;
}

function request(app: Hono, path: string, method = "GET", body?: unknown): Promise<Response> {
  return Promise.resolve(app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  }));
}

test("HTTP Todo CRUD persists through route runtime recreation", async () => {
  const dir = tempDir("http-crud");
  const context = makePluginContext(dir, new FakeBus());
  const firstApp = new Hono();
  registerTodoRoutes(firstApp, context);

  try {
    const created = await json(await request(firstApp, "/api/todos", "POST", {
      title: "Route-backed Todo",
      description: "created through HTTP",
      mode: "manual",
      commandId: "http-create-1",
    }));
    const todoId = created.value.id as string;
    assert.equal(created.value.version, 1);

    const listed = await json(await request(firstApp, "/api/todos?view=all&limit=100"));
    assert.deepEqual(listed.items.map((item) => item.id), [todoId]);

    const updated = await json(await request(firstApp, `/api/todos/${todoId}`, "PATCH", {
      patch: { title: "Updated through HTTP", priority: "high" },
      expectedVersion: 1,
      mutationId: "http-update-1",
    }));
    assert.equal(updated.value.title, "Updated through HTTP");
    assert.equal(updated.value.priority, "high");
    assert.equal(updated.value.version, 2);

    const completed = await json(await request(firstApp, `/api/todos/${todoId}/complete`, "POST", {
      expectedVersion: 2,
      commandId: "http-complete-1",
    }));
    assert.equal(completed.value.status, "completed");
    assert.equal(completed.value.version, 3);

    const reopenedTodo = await json(await request(firstApp, `/api/todos/${todoId}/reopen`, "POST", {
      expectedVersion: 3,
      commandId: "http-reopen-1",
    }));
    assert.equal(reopenedTodo.value.status, "pending");
    assert.equal(reopenedTodo.value.version, 4);

    const trashed = await json(await request(firstApp, `/api/todos/${todoId}`, "DELETE", {
      expectedVersion: 4,
      commandId: "http-trash-1",
    }));
    assert.equal(typeof trashed.value.archivedAt, "string");

    const restored = await json(await request(firstApp, `/api/todos/${todoId}/restore`, "POST", {
      expectedVersion: 5,
      commandId: "http-restore-1",
    }));
    assert.equal(restored.value.archivedAt, undefined);
    assert.equal(restored.value.version, 6);

    disposeRuntime(context);
    const secondApp = new Hono();
    registerTodoRoutes(secondApp, context);
    const reopened = await json(await request(secondApp, `/api/todos/${todoId}`));
    assert.equal(reopened.todo.title, "Updated through HTTP");
    assert.equal(reopened.todo.status, "pending");
    assert.equal(reopened.todo.version, 6);

    await json(await request(secondApp, `/api/todos/${todoId}`, "DELETE", {
      expectedVersion: 6,
      commandId: "http-trash-2",
    }));
    const prepared = await json(await request(secondApp, `/api/todos/${todoId}/purge/prepare`, "POST", {
      expectedVersion: 7,
    }));
    await json(await request(secondApp, `/api/todos/${todoId}/purge/confirm`, "POST", {
      token: prepared.token,
    }));

    const afterPurge = await secondApp.request(`/api/todos/${todoId}`);
    assert.equal(afterPurge.status, 404);
  } finally {
    disposeRuntime(context);
    cleanup(dir);
  }
});

test("HTTP Project CRUD supports create, rename, trash, and restore", async () => {
  const dir = tempDir("http-project-crud");
  const context = makePluginContext(dir, new FakeBus());
  const app = new Hono();
  registerTodoRoutes(app, context);

  try {
    const created = await json(await request(app, "/api/projects", "POST", {
      name: "Personal",
      commandId: "project-create-1",
    }));
    const projectId = created.value.id as string;

    const renamed = await json(await request(app, `/api/projects/${projectId}`, "PATCH", {
      name: "Personal work",
      expectedVersion: 1,
    }));
    assert.equal(renamed.value.name, "Personal work");
    assert.equal(renamed.value.version, 2);

    const trashed = await json(await request(app, `/api/projects/${projectId}`, "DELETE", {
      expectedVersion: 2,
    }));
    assert.equal(typeof trashed.value.archivedAt, "string");

    const activeProjects = await json(await request(app, "/api/projects"));
    assert.equal(activeProjects.items.length, 0);

    const restored = await json(await request(app, `/api/projects/${projectId}/restore`, "POST", {
      expectedVersion: 3,
    }));
    assert.equal(restored.value.name, "Personal work");
    assert.equal(restored.value.archivedAt, undefined);
    assert.equal(restored.value.version, 4);
  } finally {
    disposeRuntime(context);
    cleanup(dir);
  }
});
