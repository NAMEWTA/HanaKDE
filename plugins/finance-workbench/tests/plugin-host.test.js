import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { PluginManager } from "../../../core/plugin-manager.ts";
import { EventBus } from "../../../hub/event-bus.ts";
import { servePluginAsset } from "../../../server/http/plugin-assets.ts";
import { Hono } from "hono";
import { cleanup, tempDir } from "./helpers.js";

test("real PluginManager loads page, widget, routes and tools while TaskRegistry is absent", async () => {
  const root = tempDir("host");
  const pluginsDir = path.join(root, "plugins");
  const pluginDir = path.join(pluginsDir, "finance-workbench");
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.cpSync(path.resolve("."), pluginDir, { recursive: true, filter: (source) => !source.includes(`${path.sep}node_modules`) });
  fs.symlinkSync(path.resolve("../../node_modules"), path.join(root, "node_modules"), "dir");
  const pm = new PluginManager({ pluginsDir, dataDir: path.join(root, "data"), bus: new EventBus(), appVersion: "0.0.4", preferencesManager: { getDisabledPlugins: () => [], getAllowFullAccessPlugins: () => true } });
  pm.scan();
  try {
    await pm.loadAll();
    assert.equal(pm.getPlugin("finance-workbench").status, "loaded");
    assert.equal(pm.getPages().some((page) => page.route === "/page"), true);
    assert.equal(pm.getWidgets().some((widget) => widget.route === "/widget"), true);
    const toolNames = pm.getAllTools().map((tool) => tool.name);
    for (const name of ["research_public", "portfolio_query", "backtest_run", "monitor_create", "export_report"]) assert.ok(toolNames.includes(`finance-workbench_${name}`));
    assert.equal(toolNames.some((name) => /trade|order|broker|position_change/.test(name)), false);
    const researchTool = pm.getPluginTool("finance-workbench", "research_public");
    assert.equal(researchTool.sessionPermission.readOnly, undefined);
    assert.equal(researchTool.sessionPermission.kind, "plugin_output");
    const backtestTool = pm.getPluginTool("finance-workbench", "backtest_run");
    assert.equal(backtestTool.sessionPermission.auto, "review");
    assert.equal(backtestTool.sessionPermission.resolveInvocation({ immutableId: "strategy-1" }).kind, "review");
    const app = pm.getRouteApp("finance-workbench");
    const page = await app.request("/page"), widget = await app.request("/widget"), api = await app.request("/api/status");
    assert.equal(page.status, 200); assert.match(await page.text(), /assets\/panel\.js/);
    assert.equal(widget.status, 200); assert.match(await widget.text(), /data-surface="widget"/);
    assert.equal(api.status, 200); assert.equal((await api.json()).plugin.trading, "permanently-disabled");
    const assetApp = new Hono();
    assetApp.get("/api/plugins/:id/assets/*", (c) => servePluginAsset(c, { pluginManager: pm }));
    for (const asset of ["panel.js", "panel.css"]) {
      const response = await assetApp.request(`/api/plugins/finance-workbench/assets/${asset}`);
      assert.equal(response.status, 200);
      assert.ok(Number(response.headers.get("content-length")) > 0);
    }
    const before = await (await app.request("/api/status")).json();
    const research = await pm.executePluginTool(researchTool, { toolCallId: "host-research", input: { asset: "600519.SH", question: "Evidence summary" }, runtimeCtx: { sessionId: "host-session" } });
    assert.match(research.content[0].text, /Evidence/);
    const after = await (await app.request("/api/status")).json();
    assert.ok(after.revision > before.revision);
    await pm.unloadPlugin("finance-workbench");
  } finally { cleanup(root); }
});
