import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertPackagedFlowReceipt,
  assertPackagedFlowPlatform,
  hashAppBundleContents,
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
        "--arch",
        "x64",
        "--launch-smoke",
      ])).toEqual({
        dmgPath: dmg,
        version: "0.446.6",
        arch: "x64",
        fullFlow: false,
      });
      expect(() => parsePackagedFlowOptions(["--dmg", dmg, "--adhoc-resign"]))
        .toThrow(/unknown option/);
      expect(() => parsePackagedFlowOptions([])).toThrow(/--dmg/);
      expect(() => parsePackagedFlowOptions(["--dmg", dmg, "--version", "../escape"]))
        .toThrow(/version/);
      expect(() => parsePackagedFlowOptions(["--dmg", dmg, "--arch", "ppc64"]))
        .toThrow(/arch/);
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
      launchSigningMode: "package-untouched",
      scope: "full",
      quarantineSimulated: true,
      quarantineCleared: true,
      bundleHashBefore: "a".repeat(64),
      bundleHashAfter: "a".repeat(64),
      bundleBytesUnchanged: true,
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

  it("hashes app bundle bytes and symlink targets without observing xattrs", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-t23-bundle-hash-"));
    try {
      const app = path.join(root, "HanaKDE.app");
      fs.mkdirSync(path.join(app, "Contents"), { recursive: true });
      fs.writeFileSync(path.join(app, "Contents", "payload"), "one", "utf8");
      fs.symlinkSync("payload", path.join(app, "Contents", "payload-link"));
      const before = hashAppBundleContents(app);
      expect(before).toMatch(/^[a-f0-9]{64}$/);
      expect(hashAppBundleContents(app)).toBe(before);
      fs.writeFileSync(path.join(app, "Contents", "payload"), "two", "utf8");
      expect(hashAppBundleContents(app)).not.toBe(before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
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
    expect(source).not.toContain('execFile("codesign"');
    expect(source).not.toContain("adhocResign");
    expect(source).toContain('execFile("xattr"');
    expect(source).toContain("hashAppBundleContents");
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
