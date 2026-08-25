import assert from "node:assert/strict";
import test from "node:test";
import FinancePlugin from "../index.js";
import { getRuntime, releaseRuntime } from "../src/runtime.js";
import { cleanup, FakeBus, makeContext, tempDir } from "./helpers.js";

test("lifecycle degrades missing TaskRegistry without failing foreground plugin", async () => {
  const dir = tempDir("lifecycle-degrade");
  try {
    const ctx = makeContext(dir, { bus: new FakeBus({ failRegister: true }) });
    const plugin = new FinancePlugin();
    plugin.ctx = ctx;
    plugin.register = () => undefined;
    await plugin.onload();
    assert.equal(getRuntime(ctx).status().automation.status, "backend_unavailable");
    assert.equal(getRuntime(ctx).status().modules.every((item) => item.status === "available"), true);
    await plugin.onunload();
  } finally { cleanup(dir); }
});

test("lifecycle awaits handler unregister and monitor unschedule on unload", async () => {
  const dir = tempDir("lifecycle-cleanup");
  const bus = new FakeBus();
  try {
    const ctx = makeContext(dir, { bus });
    const plugin = new FinancePlugin();
    plugin.ctx = ctx;
    plugin.register = () => undefined;
    await plugin.onload();
    assert.ok(bus.handlers.has("finance-workbench-monitor"));
    assert.ok(bus.handlers.has("finance-workbench-research"));
    await getRuntime(ctx).createMonitor({ assetId: "600519.SH", condition: "above", threshold: 1000, confirmed: true });
    assert.equal(bus.schedules.size, 1);
    await plugin.onunload();
    assert.equal(bus.schedules.size, 0);
    assert.equal(bus.handlers.has("finance-workbench-monitor"), false);
    assert.equal(bus.handlers.has("finance-workbench-research"), false);
  } finally { cleanup(dir); }
});

test("runtime keeps stable host context while SessionFile staging stays invocation-owned", async () => {
  const dir = tempDir("session-isolation");
  try {
    const staged = [];
    const lifecycleCtx = makeContext(dir);
    lifecycleCtx.sessionId = "lifecycle";
    const sessionA = { ...makeContext(dir), sessionId: "session-a", stageFile: (input) => { staged.push({ owner: "a", input }); return { type: "session_file", fileId: "a" }; } };
    const sessionB = { ...makeContext(dir), sessionId: "session-b", stageFile: (input) => { staged.push({ owner: "b", input }); return { type: "session_file", fileId: "b" }; } };
    const runtime = getRuntime(lifecycleCtx);
    assert.equal(getRuntime(sessionA), runtime);
    assert.equal(runtime.ctx.sessionId, "lifecycle");
    const previewB = runtime.previewExport({ sections: ["portfolio"] }).preview;
    await runtime.writeExport({ confirmed: true, previewId: previewB.previewId, confirmToken: previewB.confirmToken, digest: previewB.digest, revision: previewB.revision }, sessionB);
    const previewA = runtime.previewExport({ sections: ["portfolio"] }).preview;
    await runtime.writeExport({ confirmed: true, previewId: previewA.previewId, confirmToken: previewA.confirmToken, digest: previewA.digest, revision: previewA.revision }, sessionA);
    assert.deepEqual(staged.map((item) => item.owner), ["b", "a"]);
    assert.deepEqual(staged.map((item) => item.input.sessionId), ["session-b", "session-a"]);
    releaseRuntime(lifecycleCtx);
  } finally { cleanup(dir); }
});
