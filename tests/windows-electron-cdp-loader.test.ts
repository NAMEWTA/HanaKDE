import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { installWindowsElectronCdp } = require(
  "./knowledge-workspace-e2e/fixtures/windows-electron-cdp-loader.cjs",
) as {
  installWindowsElectronCdp(options: {
    argv: string[];
    app: { commandLine: { appendSwitch: ReturnType<typeof vi.fn> } };
    platform: NodeJS.Platform;
  }): { port: number; userDataDirectory: string } | null;
};

describe("Windows Electron early CDP loader", () => {
  it("registers a loopback debugger with an isolated absolute profile", () => {
    const appendSwitch = vi.fn();

    expect(installWindowsElectronCdp({
      argv: [
        "electron.exe",
        "desktop/bootstrap.cjs",
        "--hana-windows-cdp-port=41002",
        "--hana-windows-cdp-user-data-dir=C:\\temp\\electron-data",
      ],
      app: { commandLine: { appendSwitch } },
      platform: "win32",
    })).toEqual({
      port: 41_002,
      userDataDirectory: "C:\\temp\\electron-data",
    });
    expect(appendSwitch).toHaveBeenCalledWith(
      "user-data-dir",
      "C:\\temp\\electron-data",
    );
    expect(appendSwitch).toHaveBeenCalledWith(
      "remote-debugging-address",
      "127.0.0.1",
    );
    expect(appendSwitch).toHaveBeenCalledWith("remote-debugging-port", "41002");
    expect((globalThis as typeof globalThis & {
      __hanaWindowsCdpLoaderState?: unknown;
    }).__hanaWindowsCdpLoaderState).toEqual({
      port: 41_002,
      userDataConfigured: true,
    });
    delete (globalThis as typeof globalThis & {
      __hanaWindowsCdpLoaderState?: unknown;
    }).__hanaWindowsCdpLoaderState;
  });

  it("does not depend on application environment initialization", () => {
    const appendSwitch = vi.fn();
    expect(installWindowsElectronCdp({
      argv: [
        "electron",
        "--hana-windows-cdp-port=41002",
        "--hana-windows-cdp-user-data-dir=/tmp/electron-data",
      ],
      app: { commandLine: { appendSwitch } },
      platform: "darwin",
    })).toEqual({
      port: 41_002,
      userDataDirectory: "/tmp/electron-data",
    });
    expect(appendSwitch).toHaveBeenCalledWith("remote-debugging-port", "41002");
    delete (globalThis as typeof globalThis & {
      __hanaWindowsCdpLoaderState?: unknown;
    }).__hanaWindowsCdpLoaderState;
  });

  it("rejects invalid ports and non-absolute profiles", () => {
    const build = (port: string, userDataDirectory: string) => () => (
      installWindowsElectronCdp({
        argv: [
          "electron.exe",
          `--hana-windows-cdp-port=${port}`,
          `--hana-windows-cdp-user-data-dir=${userDataDirectory}`,
        ],
        app: { commandLine: { appendSwitch: vi.fn() } },
        platform: "win32",
      })
    );

    expect(build("0", "C:\\temp\\electron-data")).toThrow("invalid Chromium CDP port");
    expect(build("41002", "relative-profile")).toThrow("absolute Chromium user data directory");
  });
});
