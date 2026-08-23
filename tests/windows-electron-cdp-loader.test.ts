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
    env: NodeJS.ProcessEnv;
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
      env: { HANA_KNOWLEDGE_E2E: "1" },
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

  it("stays inactive outside the isolated Windows fixture", () => {
    const appendSwitch = vi.fn();
    expect(installWindowsElectronCdp({
      argv: [],
      app: { commandLine: { appendSwitch } },
      platform: "darwin",
      env: { HANA_KNOWLEDGE_E2E: "1" },
    })).toBeNull();
    expect(appendSwitch).not.toHaveBeenCalled();
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
        env: { HANA_KNOWLEDGE_E2E: "1" },
      })
    );

    expect(build("0", "C:\\temp\\electron-data")).toThrow("invalid Chromium CDP port");
    expect(build("41002", "relative-profile")).toThrow("absolute Chromium user data directory");
  });
});
