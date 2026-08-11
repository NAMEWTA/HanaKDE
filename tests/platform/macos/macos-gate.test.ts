import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runMacosGate } from "../../../scripts/platform/macos/run-gate.mjs";

describe("macOS blocking gate runner", () => {
  it("runs the real recursive watch, root identity, symlink, and suspend/resume matrix", async () => {
    expect(process.platform).toBe("darwin");
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
    expect(fs.existsSync(root)).toBe(false);
  });

  it("keeps a fail-closed platform guard in the runner", () => {
    const source = fs.readFileSync(path.resolve("scripts/platform/macos/run-gate.mjs"), "utf8");
    expect(source).toContain("blocking gate requires darwin");
  });
});
