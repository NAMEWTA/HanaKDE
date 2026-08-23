import { describe, expect, it, vi } from "vitest";

import {
  assertDesktopLaunchAlive,
  assertInspectorIdentity,
  buildWindowsElectronCdpArgs,
  endpointFromPayload,
  rendererTargetIdFromInfo,
  reserveDistinctLoopbackPorts,
} from "./knowledge-workspace-e2e/fixtures/windows-electron-cdp.ts";

describe("Windows Electron direct CDP fixture", () => {
  it("builds distinct loopback-only inspector and Chromium launch arguments", () => {
    expect(buildWindowsElectronCdpArgs({
      nodeInspectorPort: 41_001,
      chromiumPort: 41_002,
      loaderPath: "/repo/tests/windows-electron-cdp-loader.cjs",
      bootstrapPath: "/repo/desktop/bootstrap.cjs",
      launchToken: "fixture-token",
      electronArgs: ["--fixture-argument", "--user-data-dir=/tmp/electron-data"],
    })).toEqual([
      "--inspect=127.0.0.1:41001",
      "--remote-debugging-port=41002",
      "--remote-debugging-address=127.0.0.1",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--user-data-dir=/tmp/electron-data",
      "-r",
      "/repo/tests/windows-electron-cdp-loader.cjs",
      "/repo/desktop/bootstrap.cjs",
      "--hana-windows-cdp-token=fixture-token",
      "--hana-windows-cdp-port=41002",
      "--hana-windows-cdp-user-data-dir=/tmp/electron-data",
      "--fixture-argument",
    ]);
  });

  it("rejects a missing or ambiguous Chromium user data directory", () => {
    const build = (electronArgs: string[]) => buildWindowsElectronCdpArgs({
      nodeInspectorPort: 41_001,
      chromiumPort: 41_002,
      loaderPath: "/repo/tests/windows-electron-cdp-loader.cjs",
      bootstrapPath: "/repo/desktop/bootstrap.cjs",
      launchToken: "fixture-token",
      electronArgs,
    });

    expect(() => build([])).toThrow("exactly one non-empty user data directory");
    expect(() => build(["--user-data-dir="])).toThrow(
      "exactly one non-empty user data directory",
    );
    expect(() => build([
      "--user-data-dir=/tmp/one",
      "--user-data-dir=/tmp/two",
    ])).toThrow("exactly one non-empty user data directory");
  });

  it("retries a duplicate transient port rather than launching both CDP servers on it", async () => {
    const reserve = vi.fn()
      .mockResolvedValueOnce(41_001)
      .mockResolvedValueOnce(41_001)
      .mockResolvedValueOnce(41_002);

    await expect(reserveDistinctLoopbackPorts(reserve)).resolves.toEqual({
      nodeInspectorPort: 41_001,
      chromiumPort: 41_002,
    });
    expect(reserve).toHaveBeenCalledTimes(3);
  });

  it("accepts only a loopback endpoint for the requested debugger port", () => {
    expect(endpointFromPayload({
      webSocketDebuggerUrl: "ws://127.0.0.1:41001/uuid",
    }, "node", 41_001)).toBe("ws://127.0.0.1:41001/uuid");
    expect(endpointFromPayload({
      webSocketDebuggerUrl: "ws://localhost:41001/uuid",
    }, "node", 41_001)).toBe("ws://127.0.0.1:41001/uuid");
    expect(endpointFromPayload({
      webSocketDebuggerUrl: "ws://example.com:41001/uuid",
    }, "node", 41_001)).toBeNull();
    expect(endpointFromPayload({
      webSocketDebuggerUrl: "ws://127.0.0.1:41002/uuid",
    }, "node", 41_001)).toBeNull();
  });

  it("rejects a foreign inspector before evaluating Electron main-process callbacks", () => {
    expect(() => assertInspectorIdentity(
      { pid: 101, token: "expected" },
      { pid: 101, token: "expected" },
    )).not.toThrow();
    expect(() => assertInspectorIdentity(
      { pid: 102, token: "expected" },
      { pid: 101, token: "expected" },
    )).toThrow("did not belong to the spawned application");
    expect(() => assertInspectorIdentity(
      { pid: 101, token: "foreign" },
      { pid: 101, token: "expected" },
    )).toThrow("did not belong to the spawned application");
  });

  it("accepts only desktop page target metadata for renderer ownership checks", () => {
    expect(rendererTargetIdFromInfo({
      targetId: "renderer-target",
      type: "page",
      url: "file:///repo/desktop/dist-renderer/index.html",
    })).toBe("renderer-target");
    expect(() => rendererTargetIdFromInfo({
      targetId: "worker-target",
      type: "service_worker",
      url: "file:///repo/desktop/dist-renderer/index.html",
    })).toThrow("did not expose the desktop renderer target");
    expect(() => rendererTargetIdFromInfo({
      targetId: "foreign-page",
      type: "page",
      url: "https://example.com/",
    })).toThrow("did not expose the desktop renderer target");
  });

  it("reports child and CDP loss immediately while waiting for the main window", () => {
    expect(() => assertDesktopLaunchAlive(
      { exitCode: 1, signalCode: null },
      { isConnected: () => true },
      { isConnected: () => true },
    )).toThrow("exited before its main window opened");
    expect(() => assertDesktopLaunchAlive(
      { exitCode: null, signalCode: null },
      { isConnected: () => false },
      { isConnected: () => true },
    )).toThrow("Chromium CDP disconnected before its main window opened");
    expect(() => assertDesktopLaunchAlive(
      { exitCode: null, signalCode: null },
      { isConnected: () => true },
      { isConnected: () => false },
    )).toThrow("node inspector disconnected before its main window opened");
  });
});
