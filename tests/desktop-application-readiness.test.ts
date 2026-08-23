import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { resolveDesktopApplicationReady } = require(
  "../desktop/src/shared/application-readiness.cjs",
) as {
  resolveDesktopApplicationReady(options: {
    app: { whenReady(): Promise<unknown> };
    env: NodeJS.ProcessEnv;
    globalObject: { __hanaWindowsPlaywrightReady?: Promise<unknown> };
  }): Promise<unknown>;
};

describe("desktop application readiness", () => {
  it("uses Electron readiness for ordinary desktop launches", async () => {
    const nativeReady = Promise.resolve("native");
    const whenReady = vi.fn(() => nativeReady);

    await expect(resolveDesktopApplicationReady({
      app: { whenReady },
      env: {},
      globalObject: {},
    })).resolves.toBe("native");
    expect(whenReady).toHaveBeenCalledOnce();
  });

  it("uses the isolated Playwright gate without consuming native readiness", async () => {
    const gate = Promise.resolve("playwright");
    const whenReady = vi.fn(() => Promise.resolve("native"));

    await expect(resolveDesktopApplicationReady({
      app: { whenReady },
      env: { HANA_WINDOWS_PLAYWRIGHT_READY_GATE: "1" },
      globalObject: { __hanaWindowsPlaywrightReady: gate },
    })).resolves.toBe("playwright");
    expect(whenReady).not.toHaveBeenCalled();
  });
});
