import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { installWindowsElectronPlaywrightLoader } = require(
  "./knowledge-workspace-e2e/fixtures/windows-electron-playwright-loader.cjs",
) as {
  installWindowsElectronPlaywrightLoader(options: {
    argv: string[];
    app: { commandLine: { appendSwitch: ReturnType<typeof vi.fn> } };
    env?: NodeJS.ProcessEnv;
    globalObject: {
      __playwright_run?: () => Promise<void>;
      __hanaWindowsPlaywrightBootstrap?: () => void;
      __hanaWindowsPlaywrightState?: {
        connected: boolean;
        bootstrapRegistered: boolean;
        bootstrapStarted: boolean;
        bootstrapLoaded: boolean;
        bootstrapError: string | null;
      };
    };
  }): number;
};

describe("Windows Electron Playwright loader", () => {
  it("keeps the application entry while releasing Electron's real ready event", async () => {
    const argv = [
      "electron.exe",
      "--inspect=0",
      "--remote-debugging-port=0",
      "--hana-playwright-cdp-port=43123",
      "desktop/bootstrap.cjs",
      "--user-data-dir=test-data",
    ];
    const globalObject: {
      __playwright_run?: () => Promise<void>;
      __hanaWindowsPlaywrightBootstrap?: () => void;
      __hanaWindowsPlaywrightState?: {
        connected: boolean;
        bootstrapRegistered: boolean;
        bootstrapStarted: boolean;
        bootstrapLoaded: boolean;
        bootstrapError: string | null;
      };
    } = {};
    const appendSwitch = vi.fn();

    expect(installWindowsElectronPlaywrightLoader({
      argv,
      app: { commandLine: { appendSwitch } },
      env: { HANA_GPU_SANDBOX_COMPAT: "1" },
      globalObject,
    })).toBe(43_123);
    expect(argv).toEqual([
      "electron.exe",
      "desktop/bootstrap.cjs",
      "--user-data-dir=test-data",
    ]);
    expect(appendSwitch).toHaveBeenCalledWith("remote-debugging-port", "43123");
    expect(appendSwitch).toHaveBeenCalledWith("remote-debugging-address", "127.0.0.1");
    expect(appendSwitch).toHaveBeenCalledWith("disable-gpu-sandbox");
    expect(appendSwitch).toHaveBeenCalledWith("disable-features", "GpuSandbox");
    const bootstrap = vi.fn();
    globalObject.__hanaWindowsPlaywrightBootstrap = bootstrap;
    if (globalObject.__hanaWindowsPlaywrightState) {
      globalObject.__hanaWindowsPlaywrightState.bootstrapRegistered = true;
    }
    await expect(globalObject.__playwright_run?.()).resolves.toBeUndefined();
    expect(bootstrap).toHaveBeenCalledOnce();
    expect(globalObject.__hanaWindowsPlaywrightState).toMatchObject({
      connected: true,
      bootstrapRegistered: true,
      bootstrapStarted: true,
    });
  });

  it("rejects a launch outside Playwright's remote-debugging contract", () => {
    expect(() => installWindowsElectronPlaywrightLoader({
      argv: ["electron.exe", "desktop/bootstrap.cjs"],
      app: { commandLine: { appendSwitch: vi.fn() } },
      env: {},
      globalObject: {},
    })).toThrow("requires Playwright remote debugging");
  });
});
