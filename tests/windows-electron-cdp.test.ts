import { describe, expect, it, vi } from "vitest";

import {
  assertDesktopLaunchAlive,
  assertInspectorIdentity,
  buildWindowsElectronCdpArgs,
  endpointFromPayload,
  rendererSentinelMatches,
  reserveDistinctLoopbackPorts,
} from "./knowledge-workspace-e2e/fixtures/windows-electron-cdp.ts";

describe("Windows Electron direct CDP fixture", () => {
  it("builds distinct loopback-only inspector and Chromium launch arguments", () => {
    expect(buildWindowsElectronCdpArgs({
      nodeInspectorPort: 41_001,
      chromiumPort: 41_002,
      bootstrapPath: "/repo/desktop/bootstrap.cjs",
      launchToken: "fixture-token",
      electronArgs: ["--user-data-dir=/tmp/electron-data"],
    })).toEqual([
      "--inspect=127.0.0.1:41001",
      "--remote-debugging-port=41002",
      "--remote-debugging-address=127.0.0.1",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "/repo/desktop/bootstrap.cjs",
      "--hana-windows-cdp-token=fixture-token",
      "--user-data-dir=/tmp/electron-data",
    ]);
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

  it("accepts a Chromium page only after it presents the verified renderer sentinel", () => {
    expect(rendererSentinelMatches("renderer-token", "renderer-token")).toBe(true);
    expect(rendererSentinelMatches("foreign-token", "renderer-token")).toBe(false);
    expect(rendererSentinelMatches(undefined, "renderer-token")).toBe(false);
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
