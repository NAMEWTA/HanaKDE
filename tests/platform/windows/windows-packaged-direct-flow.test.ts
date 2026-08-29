import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertPackagedFlowPlatform,
  assertPackagedFlowReceipt,
  PACKAGED_CHAT_CONNECTED_SELECTOR,
  PACKAGED_CHAT_EDITOR_SELECTOR,
  parsePackagedFlowOptions,
  resolvePackagedPiAiPath,
} from "../../../scripts/platform/windows/run-packaged-direct-flow.mjs";

describe("Windows packaged direct-flow runner", () => {
  it("fails closed outside Windows", () => {
    expect(() => assertPackagedFlowPlatform("win32")).not.toThrow();
    expect(() => assertPackagedFlowPlatform("darwin")).toThrow(/requires win32/);
    expect(() => assertPackagedFlowPlatform("linux")).toThrow(/requires win32/);
  });

  it("requires an installed HanaKDE.exe and validates version coordinates", () => {
    const root = fs.mkdtempSync(path.join(process.env.TEMP || ".", "hana-t22-packaged-options-"));
    const install = path.join(root, "install");
    fs.mkdirSync(install, { recursive: true });
    fs.writeFileSync(path.join(install, "HanaKDE.exe"), "fixture", "utf8");
    try {
      expect(parsePackagedFlowOptions(["--install", install, "--version", "0.446.6"]))
        .toMatchObject({ installRoot: path.resolve(install), executablePath: path.join(path.resolve(install), "HanaKDE.exe"), version: "0.446.6" });
      expect(() => parsePackagedFlowOptions([])).toThrow(/--install/);
      expect(() => parsePackagedFlowOptions(["--install", install, "--version", "../escape"]))
        .toThrow(/version/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires all installed-package flow and cleanup receipt rows", () => {
    const receipt = {
      appLaunched: true,
      healthReady: true,
      workspace: true,
      office: true,
      agent: true,
      at: true,
      cleanup: { appStopped: true, serverStopped: true, sandboxDisposed: true },
    };
    expect(assertPackagedFlowReceipt(receipt)).toBe(receipt);
    expect(() => assertPackagedFlowReceipt({ ...receipt, office: false })).toThrow(/office/);
  });

  it("keeps the packaged Pi AI provider path under the isolated Hana home", () => {
    const hanaHome = path.resolve("C:/tmp/hana-t22-home");
    const resolved = resolvePackagedPiAiPath({ hanaHome, version: "0.446.6", arch: "x64" });
    expect(resolved.startsWith(`${hanaHome}${path.sep}`)).toBe(true);
    expect(resolved).toContain(path.join(
      "artifacts", "server", "0.446.6-win32-x64", "node_modules", "@earendil-works", "pi-ai", "dist", "index.js",
    ));
  });

  it("keeps the direct flow Windows-only and isolated", () => {
    const source = fs.readFileSync(path.resolve("scripts/platform/windows/run-packaged-direct-flow.mjs"), "utf8");
    expect(source).toContain("createKnowledgeWorkspaceSandbox");
    expect(source).toContain("await sandbox.dispose()");
    expect(source).toContain("--remote-debugging-port=");
    expect(source).toContain("runOfficeFlow");
    expect(source).toContain("runAgentFlow");
    expect(source).toContain("runAtSearchFlow");
    expect(source).not.toContain("os.homedir");
  });

  it("targets the stable chat input identity instead of TipTap implementation classes", () => {
    expect(PACKAGED_CHAT_EDITOR_SELECTOR).toBe('#inputBox[contenteditable="true"]:visible');
    expect(PACKAGED_CHAT_CONNECTED_SELECTOR).toBe('.connection-status.connected:visible');
    const source = fs.readFileSync(path.resolve("scripts/platform/windows/run-packaged-direct-flow.mjs"), "utf8");
    expect(source).toContain("PACKAGED_CHAT_EDITOR_TIMEOUT_MS = 90_000");
    expect(source).toContain("page.locator(PACKAGED_CHAT_CONNECTED_SELECTOR).waitFor");
    expect(source).toContain('globalThis.localStorage.setItem("hana-tab", "chat")');
    expect(source).toContain('page.reload({ waitUntil: "domcontentloaded" })');
    expect(source).not.toContain('.ProseMirror[contenteditable="true"]:visible');
  });
});
