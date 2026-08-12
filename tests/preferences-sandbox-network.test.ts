import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { PreferencesManager } from "../core/preferences-manager.ts";

function makeUserDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-prefs-sandbox-network-"));
  return {
    userDir: path.join(root, "user"),
    agentsDir: path.join(root, "agents"),
  };
}

function makePrefs() {
  const dirs = makeUserDir();
  return new PreferencesManager(dirs);
}

function seedPrefsFile(dirs, contents) {
  fs.mkdirSync(dirs.userDir, { recursive: true });
  fs.writeFileSync(path.join(dirs.userDir, "preferences.json"), JSON.stringify(contents), "utf-8");
}

describe("PreferencesManager sandbox network preference", () => {
  it("defaults sandbox networking to enabled so sandboxed commands keep network functionality", () => {
    const prefs = makePrefs();

    expect(prefs.getSandboxNetwork()).toBe(true);
  });

  it("stores sandbox networking as an explicit boolean", () => {
    const prefs = makePrefs();

    prefs.setSandboxNetwork("true");
    expect(prefs.getSandboxNetwork()).toBe(true);
    expect(prefs.getPreferences().sandbox_network).toBe(true);

    prefs.setSandboxNetwork(false);
    expect(prefs.getSandboxNetwork()).toBe(false);
    expect(prefs.getPreferences().sandbox_network).toBe(false);
  });
});

describe("PreferencesManager sandbox network current-config behavior", () => {
  it("defaults an absent sandbox_network to enabled without persisting a marker", () => {
    const dirs = makeUserDir();
    seedPrefsFile(dirs, { locale: "zh-CN" });

    const prefs = new PreferencesManager(dirs);

    expect(prefs.getSandboxNetwork()).toBe(true);
    const stored = prefs.getPreferences();
    expect(stored.sandbox_network).toBeUndefined();
    expect(stored).not.toHaveProperty("_defaultsRelaxedMigrated");
    expect(stored.locale).toBe("zh-CN");
  });

  it("keeps an explicit sandbox_network=false without a marker", () => {
    const dirs = makeUserDir();
    seedPrefsFile(dirs, { sandbox_network: false });

    const prefs = new PreferencesManager(dirs);

    expect(prefs.getSandboxNetwork()).toBe(false);
    expect(prefs.getPreferences().sandbox_network).toBe(false);
    expect(prefs.getPreferences()).not.toHaveProperty("_defaultsRelaxedMigrated");
  });
});
