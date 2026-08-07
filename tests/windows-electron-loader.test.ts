import { describe, expect, it, vi } from "vitest";
import {
  installWindowsElectronLoader,
} from "./knowledge-workspace-e2e/fixtures/windows-electron-loader.cjs";

describe("Windows Electron Playwright loader", () => {
  it("keeps the application entrypoint while removing Playwright bootstrap switches", async () => {
    const argv = [
      "electron.exe",
      "--inspect=0",
      "--remote-debugging-port=0",
      "--hana-playwright-cdp-port=43123",
      "desktop/bootstrap.cjs",
      "--user-data-dir=test-data",
    ];
    const globalObject: { __playwright_run?: () => Promise<void> } = {};
    const appendSwitch = vi.fn();

    expect(installWindowsElectronLoader({
      argv,
      app: { commandLine: { appendSwitch } },
      globalObject,
    })).toBe(43123);

    expect(argv).toEqual([
      "electron.exe",
      "desktop/bootstrap.cjs",
      "--user-data-dir=test-data",
    ]);
    expect(appendSwitch).toHaveBeenCalledWith("remote-debugging-port", "43123");
    expect(appendSwitch).toHaveBeenCalledWith("remote-debugging-address", "127.0.0.1");
    await expect(globalObject.__playwright_run?.()).resolves.toBeUndefined();
  });

  it("rejects a launch outside Playwright's remote-debugging contract", () => {
    expect(() => installWindowsElectronLoader({
      argv: ["electron.exe", "desktop/bootstrap.cjs"],
      app: { commandLine: { appendSwitch: vi.fn() } },
      globalObject: {},
    })).toThrow("requires Playwright remote debugging");
  });
});
