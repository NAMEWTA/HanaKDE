import { describe, expect, it, vi } from "vitest";
import { createMainWorkspaceRuntime } from "../core/workspace-runtime/main-workspace-runtime.ts";
import { createResourceMainRootAuthority } from "../core/workspace-runtime/resource-main-root-authority.ts";
import { MAIN_WORKSPACE_CUTOVER_DESCRIPTOR } from "../shared/workspace-observation.ts";

const mainRoot = { kind: "local-file" as const, path: "/isolated/main" };

function createRootAuthority() {
  const proof = proofFor(mainRoot);
  return {
    proveMain: vi.fn(async () => proof),
    revalidateMain: vi.fn(async () => proof),
  };
}

function proofFor(root: typeof mainRoot, suffix = root.path) {
  return {
    root,
    identity: {
      providerId: "local_fs",
      identityNamespace: "local_fs",
      opaqueRootId: `root:${suffix}`,
      scopeToken: `scope:${suffix}`,
      caseMode: "sensitive" as const,
    },
    watchTarget: { privateRoot: root.path },
  };
}

describe("main workspace runtime", () => {
  it("shares one physical watcher and one baseline until the last logical consumer releases", async () => {
    const rootAuthority = createRootAuthority();
    const close = vi.fn();
    const watchAdapter = {
      open: vi.fn(() => ({ close })),
      baseline: vi.fn(async function* () {
        yield { relativePath: "Notes/A.md", kind: "file" as const };
      }),
    };
    const runtime = createMainWorkspaceRuntime({ rootAuthority, watchAdapter });

    await runtime.switchMain(mainRoot);
    const first = await runtime.subscribe(() => undefined);
    const second = await runtime.subscribe(() => undefined);

    expect(watchAdapter.open).toHaveBeenCalledTimes(1);
    expect(watchAdapter.baseline).toHaveBeenCalledTimes(1);

    await first.release();
    expect(close).not.toHaveBeenCalled();

    await second.release();
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes the old main before opening a fresh lifecycle and never upgrades a mount", async () => {
    const firstRoot = { kind: "local-file" as const, path: "/isolated/first" };
    const secondRoot = { kind: "local-file" as const, path: "/isolated/second" };
    const proofs = new Map([
      [firstRoot.path, proofFor(firstRoot)],
      [secondRoot.path, proofFor(secondRoot)],
    ]);
    const rootAuthority = {
      proveMain: vi.fn(async (root) => proofs.get(root.path) ?? null),
      revalidateMain: vi.fn(async (proof) => proof),
    };
    const closes: Array<ReturnType<typeof vi.fn>> = [];
    const watchAdapter = {
      open: vi.fn(() => {
        const close = vi.fn();
        closes.push(close);
        return { close };
      }),
      baseline: vi.fn(async function* () {
        yield { relativePath: "Notes/A.md", kind: "file" as const };
      }),
    };
    const runtime = createMainWorkspaceRuntime({ rootAuthority, watchAdapter });

    await runtime.switchMain(firstRoot);
    const oldSubscription = await runtime.subscribe(() => undefined);
    await runtime.switchMain(secondRoot);

    expect(closes[0]).toHaveBeenCalledOnce();
    expect(runtime.snapshot()).toMatchObject({
      sourceKey: "main",
      consumerCount: 0,
      observing: false,
      health: "RECONCILING",
    });

    await expect(runtime.switchMain({
      kind: "mount",
      mountId: "research",
      path: "",
    })).rejects.toMatchObject({ code: "workspace_root_not_authorized" });
    expect(rootAuthority.proveMain).toHaveBeenCalledTimes(2);
    expect(closes[0]).toHaveBeenCalledOnce();

    await oldSubscription.release();
  });

  it("runs one scoped baseline per repair cycle through all health states", async () => {
    const rootAuthority = createRootAuthority();
    const health: string[] = [];
    const closes: Array<ReturnType<typeof vi.fn>> = [];
    let baselineFails = false;
    const watchAdapter = {
      open: vi.fn(() => {
        const close = vi.fn();
        closes.push(close);
        return { close };
      }),
      baseline: vi.fn(async function* () {
        if (baselineFails) throw new Error("synthetic scan failure");
        yield { relativePath: "Notes/A.md", kind: "file" as const };
      }),
    };
    const runtime = createMainWorkspaceRuntime({ rootAuthority, watchAdapter });

    await runtime.switchMain(mainRoot);
    await runtime.subscribe((observation) => {
      if (observation.type === "workspace.health") health.push(observation.health);
    });

    baselineFails = true;
    await runtime.reportGap();
    expect(runtime.snapshot()).toMatchObject({
      health: "FAILED",
      repairCycle: 2,
      observing: false,
    });
    expect(closes[1]).toHaveBeenCalledOnce();

    baselineFails = false;
    await runtime.retryMain();
    expect(runtime.snapshot()).toMatchObject({ health: "HEALTHY", repairCycle: 3 });
    expect(watchAdapter.baseline).toHaveBeenCalledTimes(3);
    expect(health).toEqual([
      "RECONCILING",
      "HEALTHY",
      "DEGRADED",
      "RECONCILING",
      "FAILED",
      "DEGRADED",
      "RECONCILING",
      "HEALTHY",
    ]);
  });

  it("fails closed for a replaced root and does not start a replacement watcher", async () => {
    const rootAuthority = createRootAuthority();
    const replaced = proofFor(mainRoot, "replacement");
    rootAuthority.revalidateMain.mockResolvedValue(replaced);
    const close = vi.fn();
    const watchAdapter = {
      open: vi.fn(() => ({ close })),
      baseline: vi.fn(async function* () {
        yield { relativePath: "Notes/A.md", kind: "file" as const };
      }),
    };
    const runtime = createMainWorkspaceRuntime({ rootAuthority, watchAdapter });

    await runtime.switchMain(mainRoot);
    await runtime.subscribe(() => undefined);
    await runtime.reportGap();

    expect(runtime.snapshot()).toMatchObject({ health: "FAILED", observing: false });
    expect(watchAdapter.open).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledOnce();
  });

  it("drops cached baseline facts when root revalidation becomes unavailable", async () => {
    const rootAuthority = createRootAuthority();
    const replayedPaths: string[] = [];
    rootAuthority.revalidateMain.mockRejectedValue(new Error("root unavailable"));
    const watchAdapter = {
      open: vi.fn(() => ({ close: vi.fn() })),
      baseline: vi.fn(async function* () {
        yield { relativePath: "Notes/A.md", kind: "file" as const };
      }),
    };
    const runtime = createMainWorkspaceRuntime({ rootAuthority, watchAdapter });

    await runtime.switchMain(mainRoot);
    await runtime.subscribe(() => undefined);
    await runtime.reportGap();
    await runtime.subscribe((observation) => {
      if (observation.type === "workspace.baseline") replayedPaths.push(observation.relativePath);
    });

    expect(runtime.snapshot()).toMatchObject({ health: "FAILED", observing: false });
    expect(replayedPaths).toEqual([]);
  });

  it("projects only relative observations and keeps the T-12 cutover descriptor declarative", async () => {
    const rootAuthority = createRootAuthority();
    const observations: unknown[] = [];
    const watchAdapter = {
      open: vi.fn(() => ({ close: vi.fn() })),
      baseline: vi.fn(async function* () {
        yield { relativePath: "Notes/Private.md", kind: "file" as const };
      }),
    };
    const runtime = createMainWorkspaceRuntime({ rootAuthority, watchAdapter });

    await runtime.switchMain(mainRoot);
    await runtime.subscribe((observation) => {
      observations.push(observation);
    });

    expect(JSON.stringify({ snapshot: runtime.snapshot(), observations }))
      .not.toContain("/isolated/main");
    expect(MAIN_WORKSPACE_CUTOVER_DESCRIPTOR).toMatchObject({
      phase: "isolated-proof",
      productionOwner: null,
      cutoverTicket: "T-12",
    });
  });

  it("does not duplicate the shared baseline for a 50k-entry synthetic tree", async () => {
    const rootAuthority = createRootAuthority();
    let observedBaselines = 0;
    const watchAdapter = {
      open: vi.fn(() => ({ close: vi.fn() })),
      baseline: vi.fn(async function* () {
        for (let index = 0; index < 50_000; index += 1) {
          yield {
            relativePath: `Tree/${index}.md`,
            kind: "file" as const,
          };
        }
      }),
    };
    const runtime = createMainWorkspaceRuntime({ rootAuthority, watchAdapter });

    await runtime.switchMain(mainRoot);
    await runtime.subscribe((observation) => {
      if (observation.type === "workspace.baseline") observedBaselines += 1;
    });
    await runtime.subscribe(() => undefined);

    expect(observedBaselines).toBe(50_000);
    expect(watchAdapter.open).toHaveBeenCalledTimes(1);
    expect(watchAdapter.baseline).toHaveBeenCalledTimes(1);
  });

  it("replays the established shared baseline to later consumers without another walk", async () => {
    const rootAuthority = createRootAuthority();
    const lateConsumerEntries: string[] = [];
    const watchAdapter = {
      open: vi.fn(() => ({ close: vi.fn() })),
      baseline: vi.fn(async function* () {
        yield { relativePath: "Notes/A.md", kind: "file" as const };
        yield { relativePath: "Notes/B.md", kind: "file" as const };
      }),
    };
    const runtime = createMainWorkspaceRuntime({ rootAuthority, watchAdapter });

    await runtime.switchMain(mainRoot);
    await runtime.subscribe(() => undefined);
    await runtime.subscribe((observation) => {
      if (observation.type === "workspace.baseline") {
        lateConsumerEntries.push(observation.relativePath);
      }
    });

    expect(lateConsumerEntries).toEqual(["Notes/A.md", "Notes/B.md"]);
    expect(watchAdapter.baseline).toHaveBeenCalledTimes(1);
  });

  it("uses ResourceIO proof and watch-target authority without accepting mounts or changed identities", async () => {
    const identity = proofFor(mainRoot).identity;
    const resourceIO = {
      getRootIdentity: vi.fn(async () => identity),
      resolveWatchTarget: vi.fn(() => ({
        ref: mainRoot,
        filePath: mainRoot.path,
        isDirectory: true,
      })),
    };
    const authority = createResourceMainRootAuthority({ resourceIO });

    const proof = await authority.proveMain(mainRoot);
    expect(proof).not.toBeNull();
    await expect(authority.proveMain({ kind: "mount", mountId: "research", path: "" }))
      .resolves.toBeNull();

    resourceIO.getRootIdentity.mockResolvedValue(proofFor(mainRoot, "replacement").identity);
    await expect(authority.revalidateMain(proof!)).resolves.toBeNull();
  });
});
