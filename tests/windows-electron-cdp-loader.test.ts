import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { installWindowsElectronCdp } = require(
  "./knowledge-workspace-e2e/fixtures/windows-electron-cdp-loader.cjs",
) as {
  installWindowsElectronCdp(options: {
    app: { commandLine: { appendSwitch: ReturnType<typeof vi.fn> } };
    platform: NodeJS.Platform;
    env: NodeJS.ProcessEnv;
  }): { port: number; userDataDirectory: string } | null;
};

describe("Windows Electron early CDP loader", () => {
  it("registers a loopback debugger with an isolated absolute profile", () => {
    const appendSwitch = vi.fn();
    const env: NodeJS.ProcessEnv = {
      HANA_WINDOWS_CDP_PORT: "41002",
      HANA_WINDOWS_CDP_USER_DATA_DIR: "C:\\temp\\electron-data",
    };

    expect(installWindowsElectronCdp({
      app: { commandLine: { appendSwitch } },
      platform: "win32",
      env,
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
  });

  it("does not depend on application environment initialization", () => {
    const appendSwitch = vi.fn();
    expect(installWindowsElectronCdp({
      app: { commandLine: { appendSwitch } },
      platform: "darwin",
      env: {
        HANA_WINDOWS_CDP_PORT: "41002",
        HANA_WINDOWS_CDP_USER_DATA_DIR: "/tmp/electron-data",
      },
    })).toEqual({
      port: 41_002,
      userDataDirectory: "/tmp/electron-data",
    });
    expect(appendSwitch).toHaveBeenCalledWith("remote-debugging-port", "41002");
  });

  it("rejects invalid ports and non-absolute profiles", () => {
    const build = (port: string, userDataDirectory: string) => () => (
      installWindowsElectronCdp({
        app: { commandLine: { appendSwitch: vi.fn() } },
        platform: "win32",
        env: {
          HANA_WINDOWS_CDP_PORT: port,
          HANA_WINDOWS_CDP_USER_DATA_DIR: userDataDirectory,
        },
      })
    );

    expect(build("0", "C:\\temp\\electron-data")).toThrow("invalid Chromium CDP port");
    expect(build("41002", "relative-profile")).toThrow("absolute Chromium user data directory");
  });
});
