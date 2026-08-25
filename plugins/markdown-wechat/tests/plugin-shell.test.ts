import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PluginManager } from "../../../core/plugin-manager.ts";
import { EventBus } from "../../../hub/event-bus.ts";
import { runtimeCount } from "../src/runtime.ts";
import { removeDirectory, temporaryDirectory } from "./helpers.ts";

const pluginRoot = path.resolve(import.meta.dirname, "..");
const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) removeDirectory(dir); });

function managerFixture(): PluginManager {
  const dataDir = temporaryDirectory("markdown-wechat-host-"); directories.push(dataDir);
  const manager = new PluginManager({
    pluginsDirs: [path.dirname(pluginRoot)],
    dataDir,
    bus: new EventBus(),
    appVersion: "0.0.4",
    resourceIO: {
      async stat() { return { version: { etag: "v1" } }; },
      async read() { return { content: "# Resource", name: "resource.md", version: { etag: "v1" } }; },
      async writeExpectedVersion() { return { ok: true, version: { etag: "v2" } }; },
    },
    registerSessionFile(input: Record<string, unknown>) {
      return { fileId: "file-1", ...input };
    },
  } as any);
  const descriptor = manager.scan().find((entry: any) => entry.id === "markdown-wechat");
  if (!descriptor) throw new Error("markdown-wechat descriptor was not scanned");
  (manager as any)._scanned = [descriptor];
  return manager;
}

describe("real PluginManager integration", () => {
  it("loads routes, surfaces and named tool at the host app version", async () => {
    const manager = managerFixture();
    await manager.loadAll();
    const diagnostic = manager.getDiagnostics().find((entry: any) => entry.id === "markdown-wechat");
    expect(diagnostic).toMatchObject({
      status: "loaded",
      source: "builtin",
      routes: { hasRouteApp: true },
    });
    expect(diagnostic?.routes.pages).toEqual(expect.arrayContaining([expect.objectContaining({ route: "/page" })]));
    expect(diagnostic?.routes.widgets).toEqual(expect.arrayContaining([expect.objectContaining({ route: "/widget" })]));
    expect(diagnostic?.tools).toEqual([{ name: "markdown-wechat_render", dynamic: false }]);
    expect(manager.getPages()).toHaveLength(1);
    expect(manager.getWidgets()).toHaveLength(1);
    expect(manager.getAllTools().map((tool: any) => tool.name)).toContain("markdown-wechat_render");

    const app = manager.getRouteApp("markdown-wechat");
    expect(app).toBeTruthy();
    const page = await app.request("http://hana.local/page");
    const widget = await app.request("http://hana.local/widget");
    const state = await app.request("http://hana.local/api/state");
    const diagnostics = await app.request("http://hana.local/api/diagnostics");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("data-surface=\"page\"");
    expect(widget.status).toBe(200);
    expect(await widget.text()).toContain("data-surface=\"widget\"");
    expect(await state.json()).toMatchObject({ ok: true, state: { schemaVersion: 1, revision: 0 } });
    expect(await diagnostics.json()).toMatchObject({ ok: true, plugin: "markdown-wechat", tools: ["render"] });

    await manager.activatePluginRoute("markdown-wechat", "/page");
    expect(runtimeCount()).toBe(1);
    const tool = manager.getAllTools().find((entry: any) => entry.name === "markdown-wechat_render");
    const result = await manager.executePluginTool(tool, { input: { markdown: "# Host tool" }, runtimeCtx: {} });
    expect(result.content[0].text).toContain("Rendered Markdown WeChat HTML");
    await manager.unloadPlugin("markdown-wechat");
    expect(runtimeCount()).toBe(0);
  });

  it("does not retain runtime state across unload and reload", async () => {
    const manager = managerFixture();
    await manager.loadAll();
    await manager.activatePluginRoute("markdown-wechat", "/widget");
    expect(runtimeCount()).toBe(1);
    await manager.unloadPlugin("markdown-wechat");
    expect(runtimeCount()).toBe(0);
    await manager.loadAll();
    expect(manager.getPlugin("markdown-wechat")?.status).toBe("loaded");
    await manager.activatePluginRoute("markdown-wechat", "/page");
    expect(runtimeCount()).toBe(1);
    await manager.unloadPlugin("markdown-wechat");
    expect(runtimeCount()).toBe(0);
  });
});
