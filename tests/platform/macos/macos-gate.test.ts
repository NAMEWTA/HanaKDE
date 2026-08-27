import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runMacosGate } from "../../../scripts/platform/macos/run-gate.mjs";

describe("macOS blocking gate runner", () => {
  it.skipIf(process.platform !== "darwin")("runs the real recursive watch, root identity, symlink, and suspend/resume matrix", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-t23-test-"));
    const result = await runMacosGate({ rootDir: root, cleanup: true });
    expect(result.platform).toBe("darwin");
    expect(result.fixture).toMatchObject({
      caseInsensitive: true,
      atomicReplaceObserved: true,
      rootReplacementIdentityChanged: true,
      symlinkEscapeDetected: true,
      suspendResumeObserved: true,
    });
    expect(result.fixture.recursiveEvents).toBeGreaterThan(0);
    expect(result.productWorkspace).toMatchObject({
      logicalConsumers: 2,
      legacyCloseBeforeCoordinatorOpen: true,
      maxActiveFsWatchers: 1,
      activeFsWatchersAfterStop: 0,
      cutoverOverlap: 0,
      baselineRuns: 2,
      lostNativeCallbackSuppressed: true,
      lostAbsentFromEventBus: true,
      lostIndexedAfterReconcile: true,
      observedEventAfterReconcile: true,
      observedIndexedAfterReconcile: true,
    });
    expect(result.productWorkspace.healthTransitions).toEqual([
      "HEALTHY",
      "DEGRADED",
      "RECONCILING",
      "HEALTHY",
    ]);
    expect(fs.existsSync(root)).toBe(false);
  }, 30_000);

  it("keeps a fail-closed platform guard in the runner", () => {
    const source = fs.readFileSync(path.resolve("scripts/platform/macos/run-gate.mjs"), "utf8");
    expect(source).toContain("blocking gate requires darwin");
    expect(source).not.toContain("adhoc-resign");
    expect(source).not.toContain("adhocResign");
  });

  it("does not create fixtures when called off macOS", async () => {
    if (process.platform === "darwin") return;
    const root = path.join(os.tmpdir(), `hana-t23-guard-${process.pid}-${Date.now()}`);
    await expect(runMacosGate({ rootDir: root })).rejects.toThrow(/requires darwin/);
    expect(fs.existsSync(root)).toBe(false);
  });
});
