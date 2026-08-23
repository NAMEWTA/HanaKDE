import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { installWhenElectronApiAvailable, installWindowsElectronCdp } = require(
  "./knowledge-workspace-e2e/fixtures/windows-electron-cdp-loader.cjs",
) as {
  installWindowsElectronCdp(options: {
    app: { commandLine: { appendSwitch: ReturnType<typeof vi.fn> } };
    platform: NodeJS.Platform;
    env: NodeJS.ProcessEnv;
  }): { port: number; userDataDirectory: string } | null;
  installWhenElectronApiAvailable(options: {
    moduleApi: {
      _load(request: string, parent?: unknown, isMain?: boolean): unknown;
    };
    platform: NodeJS.Platform;
    env: NodeJS.ProcessEnv;
  }): () => void;
};

describe("Windows Electron early CDP loader", () => {
  it("installs when the application first receives the complete Electron API", () => {
    const appendSwitch = vi.fn();
    const electronApi = { app: { commandLine: { appendSwitch } } };
    const originalLoad = vi.fn((request: string) => (
      request === "electron" ? electronApi : { request }
    ));
    const moduleApi = { _load: originalLoad };
    installWhenElectronApiAvailable({
      moduleApi,
      platform: "win32",
      env: {
        HANA_WINDOWS_CDP_PORT: "41002",
        HANA_WINDOWS_CDP_USER_DATA_DIR: "C:\\temp\\electron-data",
      },
    });

    expect(moduleApi._load("node:path")).toEqual({ request: "node:path" });
    expect(appendSwitch).not.toHaveBeenCalled();
    expect(moduleApi._load("electron")).toBe(electronApi);
    expect(appendSwitch).toHaveBeenCalledWith("remote-debugging-port", "41002");
    expect(moduleApi._load).toBe(originalLoad);
    delete (globalThis as typeof globalThis & {
      __hanaWindowsCdpLoaderState?: unknown;
    }).__hanaWindowsCdpLoaderState;
  });

  it("registers a loopback debugger with an isolated absolute profile", () => {
    const appendSwitch = vi.fn();

    expect(installWindowsElectronCdp({
      app: { commandLine: { appendSwitch } },
      platform: "win32",
      env: {
        HANA_WINDOWS_CDP_PORT: "41002",
        HANA_WINDOWS_CDP_USER_DATA_DIR: "C:\\temp\\electron-data",
      },
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
    delete (globalThis as typeof globalThis & {
      __hanaWindowsCdpLoaderState?: unknown;
    }).__hanaWindowsCdpLoaderState;
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
