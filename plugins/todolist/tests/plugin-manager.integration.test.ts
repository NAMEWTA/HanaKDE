import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PluginManager } from "../../../core/plugin-manager.ts";

describe("todolist builtin contribution", () => {
  it("is discovered, loaded, exposes only namespaced user tools and a page", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-todolist-pm-data-"));
    const pm = new PluginManager({
      pluginsDirs: [path.resolve("plugins")],
      dataDir,
      bus: { emit() {}, subscribe() { return () => {}; } },
    } as any);
    pm.scan();
    await pm.loadAll();
    expect(pm.getPlugin("todolist")).toMatchObject({ id: "todolist", source: "builtin", status: "loaded" });
    expect(pm.getPages().some((page) => page.pluginId === "todolist" && page.route === "/page")).toBe(true);
    const names = pm.getAllTools().filter((tool) => tool._pluginId === "todolist").map((tool) => tool.name).sort();
    expect(names).toEqual(["todolist_automation", "todolist_capture", "todolist_complete", "todolist_create", "todolist_delete", "todolist_delete_confirm", "todolist_delete_prepare", "todolist_exchange", "todolist_get", "todolist_project", "todolist_query", "todolist_recurrence", "todolist_reminder", "todolist_reopen", "todolist_restore", "todolist_update"]);
    expect(names).not.toContain("todo_write");
    await pm.unloadPlugin("todolist", { source: "builtin" });
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
});
