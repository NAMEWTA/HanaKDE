import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import TodoListPlugin from "../index.ts";
import { renderPage } from "../routes/page.ts";
import { requestContextFromHono } from "../src/interfaces/context.ts";
import { stageJson } from "../src/interfaces/tool.ts";
import { disposeRuntime, getRuntime } from "../src/runtime.ts";
import { cleanup, FakeBus, makeInvocation, makePluginContext, tempDir } from "./helpers.ts";

test("one runtime is shared across distinct route/tool context objects for the same dataDir", async () => {
  const dir = tempDir("runtime-share");
  const bus = new FakeBus();
  const firstContext = makePluginContext(dir, bus, { userId: "alice" });
  const secondContext = makePluginContext(dir, bus, { userId: "bob", sessionId: "second" });
  try {
    const first = getRuntime(firstContext);
    const second = getRuntime(secondContext);
    assert.strictEqual(first, second);
    const created = await first.application.createTodo({ title: "shared state", commandId: "shared-create" }, makeInvocation(bus));
    assert.equal(second.application.getTodo(created.value.id).title, "shared state");
  } finally {
    disposeRuntime(firstContext);
    cleanup(dir);
  }
});

test("HTTP invocation uses request-level principal and capability-scoped bus", () => {
  const rootBus = new FakeBus();
  const scopedBus = new FakeBus();
  const root = makePluginContext(tempDir("request-context"), rootBus, { userId: "root-user" });
  const invocation = requestContextFromHono({
    get(key: string) {
      if (key !== "pluginRequestContext") return undefined;
      return { principal: { userId: "request-user", sessionId: "request-session" }, bus: scopedBus };
    },
  }, root);
  assert.equal(invocation.actorKey, "request-user");
  assert.equal(invocation.sessionKey, "request-session");
  assert.strictEqual(invocation.bus, scopedBus);
  cleanup(root.dataDir);
});

test("production page shell loads host CSS, plugin CSS, locale, and escapes theme input", () => {
  const query = new Map([
    ["locale", "ja"],
    ["hana-theme", "dark\"><script>alert(1)</script>"],
    ["hana-css", encodeURIComponent("/assets/hana-theme.css")],
  ]);
  const html = renderPage({
    req: {
      json: async () => ({}),
      query: (name: string) => query.get(name),
      param: () => "",
    },
    json: () => undefined,
    text: () => undefined,
    html: () => undefined,
  });
  assert.match(html, /<html lang="ja"/);
  assert.match(html, /\/assets\/hana-theme\.css/);
  assert.match(html, /\/api\/plugins\/todolist\/assets\/page\.css/);
  assert.match(html, /\/api\/plugins\/todolist\/assets\/page\.js/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test("published tools do not expose internal wake or arbitrary state-confirmation actions", () => {
  const toolsDir = path.resolve("tools");
  const source = fs.readdirSync(toolsDir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => fs.readFileSync(path.join(toolsDir, name), "utf8"))
    .join("\n");
  assert.doesNotMatch(source, /\bset_state\b/);
  assert.doesNotMatch(source, /\bconfirm_cancel\b/);
  assert.doesNotMatch(source, /\bwake\b/);
  assert.doesNotMatch(source, /setRunState|confirmCancel/);
});


test("HTTP invocation fails closed to no side-effect bus when request context is absent", () => {
  const rootBus = new FakeBus();
  const dir = tempDir("request-context-missing");
  try {
    const root = makePluginContext(dir, rootBus, { userId: "root-user" });
    const invocation = requestContextFromHono({ get: () => undefined }, root);
    assert.equal(invocation.actorKey, "root-user");
    assert.equal(invocation.bus, undefined);
  } finally {
    cleanup(dir);
  }
});

test("plugin lifecycle registers both schedule handlers with timeout and disposes them", async () => {
  const dir = tempDir("lifecycle");
  const bus = new FakeBus();
  const plugin = new TodoListPlugin();
  plugin.ctx = makePluginContext(dir, bus);
  try {
    await plugin.onload();
    assert.deepEqual([...bus.registered.keys()].sort(), ["todolist.agent_execute", "todolist.reminder"]);
    const registrations = bus.requests.filter((item) => item.type === "task:register-handler");
    assert.equal(registrations.length, 2);
    assert.equal(registrations.every((item) => item.options?.timeout === 10_000), true);
    for (const handler of bus.registered.values()) {
      assert.equal(typeof handler.run, "function");
      assert.equal(typeof handler.abort, "function");
      assert.doesNotThrow(() => (handler.abort as (taskId: string) => void)("registry-task-id"));
    }
  } finally {
    await plugin.onunload();
    assert.equal(bus.registered.size, 0);
    cleanup(dir);
  }
});

test("dynamic tool permission resolvers return complete fail-closed descriptors", async () => {
  const createTool = await import("../tools/create.ts");
  const automationTool = await import("../tools/automation.ts");
  const invalid = createTool.sessionPermission.resolveInvocation?.({ title: "" });
  assert.equal(invalid, null);
  const manual = createTool.sessionPermission.resolveInvocation?.({ title: "Manual", mode: "manual" });
  assert.deepEqual(
    { action: manual?.action, kind: manual?.kind, capability: manual?.capability },
    { action: "create_manual", kind: "routine", capability: "todolist.create.manual" },
  );
  const agent = createTool.sessionPermission.resolveInvocation?.({ title: "Agent", mode: "agent_execute" });
  assert.equal(agent?.kind, "review");
  assert.equal(agent?.capability, "todolist.create.agent_execute");
  const read = automationTool.sessionPermission.resolveInvocation?.({ action: "get", runId: "run-1" });
  assert.equal(read?.kind, "read");
  const sideEffect = automationTool.sessionPermission.resolveInvocation?.({ action: "cancel", runId: "run-1" });
  assert.equal(sideEffect?.kind, "review");
  assert.equal(sideEffect?.target?.id, "run-1");
});

test("quick capture creates exactly one manual Todo and has an IME composition guard", () => {
  const source = fs.readFileSync(path.resolve("src/ui/browser-app.ts"), "utf8");
  assert.match(source, /name="title" type="text" maxlength="240"/);
  assert.doesNotMatch(source, /split\(\/\\r\?\\n\//);
  assert.match(source, /event\.isComposing/);
  assert.doesNotMatch(source, /name="titles"/);
});

test("Todo page inherits the Hana design contract instead of defining a private visual theme", () => {
  const css = fs.readFileSync(path.resolve("assets/page.css"), "utf8");
  const page = fs.readFileSync(path.resolve("src/ui/page.tsx"), "utf8");

  for (const token of ["--bg", "--bg-card", "--accent", "--text", "--text-muted", "--border", "--radius-input", "--radius-card"]) {
    assert.match(css, new RegExp(token.replaceAll("-", "\\-")), `missing host design token ${token}`);
  }
  assert.match(page, /HanaThemeProvider mode="inherit"/);
  assert.match(page, /className="react-todo-host todo-theme"/);
  assert.match(css, /--todo-radius-input:\s*var\(--radius-input, 4px\)/);
  assert.match(css, /--todo-radius-panel:\s*var\(--radius-card, 8px\)/);
  assert.doesNotMatch(css, /#6f5cff|--hana-color-|--hana-radius-/i);
  assert.doesNotMatch(css, /letter-spacing:\s*-/i);
  assert.doesNotMatch(css, /border-radius:\s*(?:9|1[0-9]|[2-9][0-9])px/i);
});

test("AI receives the complete namespaced Todo tool catalog", async () => {
  const expected = [
    ["automation.ts", "automation"],
    ["capture.ts", "capture"],
    ["complete.ts", "complete"],
    ["create.ts", "create"],
    ["delete-confirm.ts", "delete_confirm"],
    ["delete-prepare.ts", "delete_prepare"],
    ["delete.ts", "delete"],
    ["exchange.ts", "exchange"],
    ["get.ts", "get"],
    ["project.ts", "project"],
    ["query.ts", "query"],
    ["recurrence.ts", "recurrence"],
    ["reminder.ts", "reminder"],
    ["reopen.ts", "reopen"],
    ["restore.ts", "restore"],
    ["update.ts", "update"],
  ];
  assert.deepEqual(fs.readdirSync(path.resolve("tools")).filter((name) => name.endsWith(".ts")).sort(), expected.map(([file]) => file));

  for (const [file, name] of expected) {
    const tool = await import(`../tools/${file}`);
    assert.equal(tool.name, name, `${file} has the wrong public name`);
    assert.equal(typeof tool.description, "string", `${file} must describe its AI behavior`);
    assert.ok(tool.description.length > 20, `${file} description is too weak for AI use`);
    assert.equal(typeof tool.parameters, "object", `${file} must publish a parameter schema`);
    assert.equal(typeof tool.execute, "function", `${file} must publish an executor`);
    assert.equal(typeof tool.sessionPermission, "object", `${file} must publish a permission contract`);
  }
});


test("status and inline export fallback never disclose plugin-private absolute paths", async () => {
  const dir = tempDir("privacy-boundary");
  const ctx = makePluginContext(dir, new FakeBus());
  try {
    const runtime = getRuntime(ctx);
    const status = runtime.application.status();
    assert.equal(status.store.storage, "plugin_private");
    assert.equal(JSON.stringify(status).includes(path.resolve(dir)), false);

    const staged = await stageJson(ctx, { version: 2, sample: true });
    const serialized = JSON.stringify(staged);
    assert.equal(serialized.includes(path.resolve(dir)), false);
    assert.equal((staged as { staged?: boolean }).staged, false);
    assert.equal("filePath" in (staged as Record<string, unknown>), false);
    const exportsDir = path.join(dir, "exports");
    assert.equal(fs.existsSync(exportsDir) ? fs.readdirSync(exportsDir).length : 0, 0);
  } finally {
    disposeRuntime(ctx);
    cleanup(dir);
  }
});
