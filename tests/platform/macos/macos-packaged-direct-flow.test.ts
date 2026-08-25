import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertPackagedFlowReceipt,
  assertPackagedFlowPlatform,
  parsePackagedFlowOptions,
  resolvePackagedPiAiPath,
} from "../../../scripts/platform/macos/run-packaged-direct-flow.mjs";

describe("macOS packaged direct-flow runner", () => {
  it("fails closed outside Darwin", () => {
    expect(() => assertPackagedFlowPlatform("darwin")).not.toThrow();
    expect(() => assertPackagedFlowPlatform("win32")).toThrow(/requires darwin/);
    expect(() => assertPackagedFlowPlatform("linux")).toThrow(/requires darwin/);
  });

  it("requires an explicit DMG and validates artifact coordinates", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-t23-packaged-options-"));
    const dmg = path.join(root, "HanaKDE.dmg");
    fs.writeFileSync(dmg, "fixture", "utf8");
    try {
      expect(parsePackagedFlowOptions([
        "--dmg",
        dmg,
        "--version",
        "0.446.6",
        "--adhoc-resign",
      ])).toEqual({
        dmgPath: dmg,
        version: "0.446.6",
        adhocResign: true,
      });
      expect(() => parsePackagedFlowOptions([])).toThrow(/--dmg/);
      expect(() => parsePackagedFlowOptions(["--dmg", dmg, "--version", "../escape"]))
        .toThrow(/version/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires a complete machine-readable package receipt", () => {
    const receipt = {
      platform: "darwin",
      arch: "arm64",
      dmgVerified: true,
      dmgMounted: true,
      appInstalled: true,
      launchSigningMode: "adhoc",
      appLaunched: true,
      unsafeNoSandboxAbsent: true,
      healthReady: true,
      history: { live: true, afterReload: true },
      office: true,
      agent: true,
      at: true,
      cleanup: {
        appStopped: true,
        serverStopped: true,
        mountDetached: true,
        sandboxDisposed: true,
      },
    };
    expect(assertPackagedFlowReceipt(receipt)).toBe(receipt);
    expect(() => assertPackagedFlowReceipt({
      ...receipt,
      at: false,
    })).toThrow(/at/);
    const withoutDmgVerification = { ...receipt };
    delete withoutDmgVerification.dmgVerified;
    expect(() => assertPackagedFlowReceipt(withoutDmgVerification)).toThrow(/dmgVerified/);
  });

  it("resolves the deterministic provider only inside the activated package artifact", () => {
    const hanaHome = path.resolve("/tmp/hana-t23-home");
    const resolved = resolvePackagedPiAiPath({
      hanaHome,
      version: "0.446.6",
      platform: "darwin",
      arch: "arm64",
    });
    expect(resolved.startsWith(`${hanaHome}${path.sep}`)).toBe(true);
    expect(resolved).toContain(path.join(
      "artifacts",
      "server",
      "0.446.6-darwin-arm64",
      "node_modules",
      "@earendil-works",
      "pi-ai",
      "dist",
      "index.js",
    ));
  });

  it("keeps user state and cleanup inside the disposable workspace fixture", () => {
    const source = fs.readFileSync(
      path.resolve("scripts/platform/macos/run-packaged-direct-flow.mjs"),
      "utf8",
    );
    expect(source).not.toContain("os.homedir");
    expect(source).not.toContain("Library/Application Support");
    expect(source).toContain("createKnowledgeWorkspaceSandbox");
    expect(source).toContain("await sandbox.dispose()");
    expect(source).toContain('execFile("hdiutil"');
    expect(source).toContain('execFile("codesign"');
    expect(source).toContain("runAtSearchFlow");
  });

  it("is wired as an explicit full-flow option rather than an inventory side effect", () => {
    const source = fs.readFileSync(
      path.resolve("scripts/platform/macos/run-gate.mjs"),
      "utf8",
    );
    expect(source).toContain('process.argv.includes("--direct-flow")');
    expect(source).toContain("runPackagedDirectFlow");
  });
});
