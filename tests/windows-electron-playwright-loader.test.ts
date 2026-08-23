import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { installWindowsElectronPlaywrightLoader } = require(
  "./knowledge-workspace-e2e/fixtures/windows-electron-playwright-loader.cjs",
) as {
  installWindowsElectronPlaywrightLoader(options: {
    argv: string[];
    app: {
      commandLine: { appendSwitch: ReturnType<typeof vi.fn> };
      isReady(): boolean;
      whenReady(): Promise<unknown>;
    };
    env?: NodeJS.ProcessEnv;
    globalObject: {
      __playwright_run?: () => Promise<void>;
      __hanaWindowsPlaywrightReady?: Promise<unknown>;
      __hanaWindowsPlaywrightState?: {
        nativeReady: boolean;
        playwrightReleased: boolean;
      };
    };
  }): number;
};

describe("Windows Electron Playwright loader", () => {
  it("keeps the application entry while deferring its ready promise until Playwright connects", async () => {
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
      __hanaWindowsPlaywrightReady?: Promise<unknown>;
      __hanaWindowsPlaywrightState?: {
        nativeReady: boolean;
        playwrightReleased: boolean;
      };
    } = {};
    const appendSwitch = vi.fn();
    let markNativeReady: ((event: unknown) => void) | undefined;
    const nativeReady = new Promise((resolve) => { markNativeReady = resolve; });
    let nativeIsReady = false;
    const app = {
      commandLine: { appendSwitch },
      isReady: () => nativeIsReady,
      whenReady: () => nativeReady,
    };
    const originalIsReady = app.isReady;
    const originalWhenReady = app.whenReady;

    expect(installWindowsElectronPlaywrightLoader({
      argv,
      app,
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
    expect(app.isReady).toBe(originalIsReady);
    expect(app.whenReady).toBe(originalWhenReady);
    let applicationReady = false;
    globalObject.__hanaWindowsPlaywrightReady?.then(() => { applicationReady = true; });
    const run = globalObject.__playwright_run?.();
    await new Promise((resolve) => setImmediate(resolve));
    expect(applicationReady).toBe(false);
    nativeIsReady = true;
    markNativeReady?.({ ready: true });
    await expect(run).resolves.toBeUndefined();
    await globalObject.__hanaWindowsPlaywrightReady;
    expect(app.isReady()).toBe(true);
    expect(applicationReady).toBe(true);
    expect(globalObject.__hanaWindowsPlaywrightState).toMatchObject({
      nativeReady: true,
      playwrightReleased: true,
    });
  });

  it("rejects a launch outside Playwright's remote-debugging contract", () => {
    expect(() => installWindowsElectronPlaywrightLoader({
      argv: ["electron.exe", "desktop/bootstrap.cjs"],
      app: {
        commandLine: { appendSwitch: vi.fn() },
        isReady: () => false,
        whenReady: () => Promise.resolve(),
      },
      env: {},
      globalObject: {},
    })).toThrow("requires Playwright remote debugging");
  });
});
