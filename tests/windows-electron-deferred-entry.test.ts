import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { runDeferredWindowsElectronEntry } = require(
  "./knowledge-workspace-e2e/fixtures/windows-electron-deferred-entry.cjs",
) as {
  runDeferredWindowsElectronEntry(options: {
    env: NodeJS.ProcessEnv;
    isReady(): boolean;
    registerBootstrap(bootstrap: () => void): void;
    loadBootstrap(path: string): unknown;
    onError(error: unknown): void;
  }): string;
};

describe("Windows Electron deferred entry", () => {
  it("registers the real bootstrap for Playwright to load after native readiness", () => {
    let bootstrap: (() => void) | undefined;
    const loadBootstrap = vi.fn();
    const onError = vi.fn();

    expect(runDeferredWindowsElectronEntry({
      env: { HANA_WINDOWS_DEFERRED_BOOTSTRAP_PATH: "D:\\repo\\desktop\\bootstrap.cjs" },
      isReady: () => true,
      registerBootstrap: (callback) => { bootstrap = callback; },
      loadBootstrap,
      onError,
    })).toBe("D:\\repo\\desktop\\bootstrap.cjs");
    expect(loadBootstrap).not.toHaveBeenCalled();

    bootstrap?.();
    expect(loadBootstrap).toHaveBeenCalledWith("D:\\repo\\desktop\\bootstrap.cjs");
    expect(onError).not.toHaveBeenCalled();
  });

  it("rejects a relative bootstrap path before scheduling work", () => {
    expect(() => runDeferredWindowsElectronEntry({
      env: { HANA_WINDOWS_DEFERRED_BOOTSTRAP_PATH: "desktop/bootstrap.cjs" },
      isReady: vi.fn(() => true),
      registerBootstrap: vi.fn(),
      loadBootstrap: vi.fn(),
      onError: vi.fn(),
    })).toThrow("absolute deferred bootstrap path");
  });
});
