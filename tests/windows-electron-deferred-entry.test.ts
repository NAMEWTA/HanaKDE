import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { runDeferredWindowsElectronEntry } = require(
  "./knowledge-workspace-e2e/fixtures/windows-electron-deferred-entry.cjs",
) as {
  runDeferredWindowsElectronEntry(options: {
    env: NodeJS.ProcessEnv;
    waitUntilReady(): Promise<void>;
    loadBootstrap(path: string): unknown;
    onError(error: unknown): void;
  }): string;
};

describe("Windows Electron deferred entry", () => {
  it("loads the real bootstrap only after Electron's native ready promise", async () => {
    let markReady: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => { markReady = resolve; });
    const loadBootstrap = vi.fn();
    const onError = vi.fn();

    expect(runDeferredWindowsElectronEntry({
      env: { HANA_WINDOWS_DEFERRED_BOOTSTRAP_PATH: "D:\\repo\\desktop\\bootstrap.cjs" },
      waitUntilReady: () => ready,
      loadBootstrap,
      onError,
    })).toBe("D:\\repo\\desktop\\bootstrap.cjs");
    expect(loadBootstrap).not.toHaveBeenCalled();

    markReady?.();
    await ready;
    await new Promise((resolve) => setImmediate(resolve));
    expect(loadBootstrap).toHaveBeenCalledWith("D:\\repo\\desktop\\bootstrap.cjs");
    expect(onError).not.toHaveBeenCalled();
  });

  it("rejects a relative bootstrap path before scheduling work", () => {
    expect(() => runDeferredWindowsElectronEntry({
      env: { HANA_WINDOWS_DEFERRED_BOOTSTRAP_PATH: "desktop/bootstrap.cjs" },
      waitUntilReady: vi.fn(() => Promise.resolve()),
      loadBootstrap: vi.fn(),
      onError: vi.fn(),
    })).toThrow("absolute deferred bootstrap path");
  });
});
