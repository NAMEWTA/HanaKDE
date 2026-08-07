import { describe, expect, it } from "vitest";
import {
  installWindowsElectronLoader,
} from "./knowledge-workspace-e2e/fixtures/windows-electron-loader.cjs";

describe("Windows Electron Playwright loader", () => {
  it("keeps the application entrypoint while removing Playwright bootstrap switches", async () => {
    const argv = [
      "electron.exe",
      "--inspect=0",
      "--remote-debugging-port=0",
      "desktop/bootstrap.cjs",
      "--user-data-dir=test-data",
    ];
    const globalObject: { __playwright_run?: () => Promise<void> } = {};

    installWindowsElectronLoader({ argv, globalObject });

    expect(argv).toEqual([
      "electron.exe",
      "desktop/bootstrap.cjs",
      "--user-data-dir=test-data",
    ]);
    await expect(globalObject.__playwright_run?.()).resolves.toBeUndefined();
  });

  it("rejects a launch outside Playwright's remote-debugging contract", () => {
    expect(() => installWindowsElectronLoader({
      argv: ["electron.exe", "desktop/bootstrap.cjs"],
      globalObject: {},
    })).toThrow("requires Playwright remote debugging");
  });
});
