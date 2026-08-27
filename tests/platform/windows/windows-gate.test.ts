import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  inspectWindowsInstaller,
  inspectWindowsPackage,
  runWindowsGate,
} from "../../../scripts/platform/windows/run-gate.mjs";

const sourcePath = path.resolve("scripts/platform/windows/run-gate.mjs");

function writePeFixture(target: string) {
  const bytes = Buffer.alloc(128);
  bytes.write("MZ", 0, "ascii");
  bytes.writeUInt32LE(64, 0x3c);
  bytes.write("PE\0\0", 64, "ascii");
  fs.writeFileSync(target, bytes);
}

describe("Windows blocking gate runner", () => {
  it.skipIf(process.platform !== "win32")("runs the real Windows filesystem matrix", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-t22-real-"));
    const result = await runWindowsGate({ rootDir: root, cleanup: true });
    expect(result.platform).toBe("win32");
    expect(result.fixture).toMatchObject({
      caseInsensitive: true,
      junctionEscapeDetected: true,
      rootReplacementIdentityChanged: true,
      lockedRenameDenied: true,
      renameBurstObserved: true,
      tempSaveObserved: true,
      watcherClosed: true,
      outsideUntouched: true,
    });
    expect(result.fixture.recursiveEvents).toBeGreaterThan(0);
    expect(fs.existsSync(root)).toBe(false);
  }, 30_000);

  it("keeps a fail-closed win32 guard and the required native probes", () => {
    const source = fs.readFileSync(sourcePath, "utf8");
    expect(source).toContain("blocking gate requires win32");
    expect(source).toContain('fs.symlinkSync(outside, junction, "junction")');
    expect(source).toContain("PowerShell locked-file probe readiness");
    expect(source).toContain("recursive watcher temp-save event");
    expect(source).toContain("dist-secure-fs/win-");
  });

  it("does not create fixtures when called off Windows", async () => {
    if (process.platform === "win32") return;
    const root = path.join(os.tmpdir(), `hana-t22-guard-${process.pid}-${Date.now()}`);
    await expect(runWindowsGate({ rootDir: root })).rejects.toThrow(/requires win32/);
    expect(fs.existsSync(root)).toBe(false);
  });

  it("inspects a complete unpacked Windows package through an injected archive listing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-t22-package-"));
    try {
      const seed = path.join(root, "resources", "seed");
      fs.mkdirSync(seed, { recursive: true });
      for (const relative of [
        "HanaKDE.exe",
        "resources/app.asar",
        "resources/git/cmd/git.exe",
        "resources/git/mingw64/bin/git.exe",
        "resources/git/usr/bin/sh.exe",
        "resources/sandbox/windows/hana-win-sandbox.exe",
        "resources/seed/server-0.446.6-win32-x64.tar.gz",
        "resources/seed/renderer-0.446.6.tar.gz",
        "resources/seed/seed-train-win32-x64.json",
        "resources/seed/seed-train-win32-x64.json.sig",
      ]) {
        const target = path.join(root, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (relative.endsWith(".exe")) writePeFixture(target);
        else fs.writeFileSync(target, "fixture", "utf8");
      }
      const result = inspectWindowsPackage(root, {
        signatureInspector: () => ({ status: "NotSigned", statusMessage: "Not signed" }),
        archiveLister: () => [
          "bundle/index.js",
          "bundle/anydoc-child.cjs",
          "bundle/html-child.ts",
          "dist-secure-fs/win-x64/hana-secure-fs-helper.exe",
        ],
      });
      expect(result).toMatchObject({
        executable: "HanaKDE.exe",
        manifest: "seed-train-win32-x64.json",
        minGitRuntime: "resources/git",
        sandboxHelper: "resources/sandbox/windows/hana-win-sandbox.exe",
        secureHelper: "dist-secure-fs/win-x64/hana-secure-fs-helper.exe",
        authenticodeStatus: "NotSigned",
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a package archive without the Windows secure helper", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-t22-package-missing-"));
    try {
      const seed = path.join(root, "resources", "seed");
      fs.mkdirSync(seed, { recursive: true });
      for (const relative of [
        "HanaKDE.exe",
        "resources/app.asar",
        "resources/git/cmd/git.exe",
        "resources/git/mingw64/bin/git.exe",
        "resources/git/usr/bin/sh.exe",
        "resources/sandbox/windows/hana-win-sandbox.exe",
        "resources/seed/server-0.446.6-win32-x64.tar.gz",
        "resources/seed/renderer-0.446.6.tar.gz",
        "resources/seed/seed-train-win32-x64.json",
        "resources/seed/seed-train-win32-x64.json.sig",
      ]) {
        const target = path.join(root, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (relative.endsWith(".exe")) writePeFixture(target);
        else fs.writeFileSync(target, "fixture", "utf8");
      }
      expect(() => inspectWindowsPackage(root, {
        archiveLister: () => [
          "bundle/index.js",
          "bundle/anydoc-child.cjs",
          "bundle/html-child.ts",
        ],
      })).toThrow(/secure-fs\/win-x64/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects unsupported package architectures before reading package paths", () => {
    expect(() => inspectWindowsPackage("/unused", { arch: "../../escape" })).toThrow(/unsupported Windows architecture/);
  });

  it("requires a real executable for the NSIS inventory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-t22-installer-"));
    try {
      const installer = path.join(root, "HanaKDE-0.446.6.exe");
      writePeFixture(installer);
      expect(inspectWindowsInstaller(installer, {
        signatureInspector: () => ({ status: "NotSigned", statusMessage: "Not signed" }),
      })).toEqual({
        installer: "HanaKDE-0.446.6.exe",
        peHeaderVerified: true,
        authenticodeStatus: "NotSigned",
      });
      expect(() => inspectWindowsInstaller(installer, {
        signatureInspector: () => ({ status: "Valid", signerCertificate: { subject: "CN=Unexpected" } }),
      })).toThrow(/NotSigned/);
      const wrongExtension = path.join(root, "not-an-installer.zip");
      fs.writeFileSync(wrongExtension, "fixture", "utf8");
      expect(() => inspectWindowsInstaller(wrongExtension)).toThrow(/\.exe/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses PowerShell Authenticode inspection and wires the packaged direct flow", () => {
    const source = fs.readFileSync(sourcePath, "utf8");
    expect(source).toContain("Get-AuthenticodeSignature");
    expect(source).toContain("HANA_AUTHENTICODE_TARGET");
    expect(source).toContain("runPackagedDirectFlow");
    expect(source).toContain('process.argv.includes("--direct-flow")');
  });
});
