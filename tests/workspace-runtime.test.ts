import { describe, expect, it, vi } from "vitest";
import {
  createMainWorkspaceRuntime,
  type WorkspaceWatchListener,
} from "../core/workspace-runtime/main-workspace-runtime.ts";
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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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

  it("revalidates and takes a fresh baseline when observation resumes after the last release", async () => {
    const rootAuthority = createRootAuthority();
    let baselineRound = 0;
    const resumedBaselines: string[] = [];
    const watchAdapter = {
      open: vi.fn(() => ({ close: vi.fn() })),
      baseline: vi.fn(async function* () {
        baselineRound += 1;
        yield {
          relativePath: baselineRound === 1 ? "Notes/BeforeRelease.md" : "Notes/AfterRelease.md",
          kind: "file" as const,
        };
      }),
    };
    const runtime = createMainWorkspaceRuntime({ rootAuthority, watchAdapter });

    await runtime.switchMain(mainRoot);
    const first = await runtime.subscribe(() => undefined);
    await first.release();
    rootAuthority.revalidateMain.mockClear();

    await runtime.subscribe((observation) => {
      if (observation.type === "workspace.baseline") resumedBaselines.push(observation.relativePath);
    });

    expect(rootAuthority.revalidateMain).toHaveBeenCalledTimes(2);
    expect(watchAdapter.open).toHaveBeenCalledTimes(2);
    expect(watchAdapter.baseline).toHaveBeenCalledTimes(2);
    expect(resumedBaselines).toEqual(["Notes/AfterRelease.md"]);
  });

  it("does not emit stale HEALTHY or baseline facts while a post-release root proof fails", async () => {
    const rootAuthority = createRootAuthority();
    const replaced = proofFor(mainRoot, "replacement");
    const health: string[] = [];
    const baselines: string[] = [];
    const watchAdapter = {
      open: vi.fn(() => ({ close: vi.fn() })),
      baseline: vi.fn(async function* () {
        yield { relativePath: "Notes/BeforeRelease.md", kind: "file" as const };
      }),
    };
    const runtime = createMainWorkspaceRuntime({ rootAuthority, watchAdapter });

    await runtime.switchMain(mainRoot);
    const first = await runtime.subscribe(() => undefined);
    await first.release();
    rootAuthority.revalidateMain.mockResolvedValue(replaced);

    await runtime.subscribe((observation) => {
      if (observation.type === "workspace.health") health.push(observation.health);
      if (observation.type === "workspace.baseline") baselines.push(observation.relativePath);
    });

    expect(health).toEqual(["RECONCILING", "FAILED"]);
    expect(baselines).toEqual([]);
    expect(runtime.snapshot()).toMatchObject({ health: "FAILED", observing: false });
  });

  it("fails closed when the root is replaced while an async baseline is in flight", async () => {
    const rootAuthority = createRootAuthority();
    const replaced = proofFor(mainRoot, "replacement");
    const baselineStarted = deferred();
    const allowBaseline = deferred();
    const baselines: string[] = [];
    const close = vi.fn();
    const watchAdapter = {
      open: vi.fn(() => ({ close })),
      baseline: vi.fn(async function* () {
        baselineStarted.resolve();
        await allowBaseline.promise;
        yield { relativePath: "Notes/ShouldNotLeak.md", kind: "file" as const };
      }),
    };
    const runtime = createMainWorkspaceRuntime({ rootAuthority, watchAdapter });

    await runtime.switchMain(mainRoot);
    const starting = runtime.subscribe((observation) => {
      if (observation.type === "workspace.baseline") baselines.push(observation.relativePath);
    });
    await baselineStarted.promise;
    rootAuthority.revalidateMain.mockResolvedValue(replaced);
    allowBaseline.resolve();
    await starting;

    expect(runtime.snapshot()).toMatchObject({ health: "FAILED", observing: false });
    expect(close).toHaveBeenCalledOnce();
    expect(baselines).toEqual([]);
  });

  it("does not replay a deletion that raced an async baseline to a later consumer", async () => {
    const rootAuthority = createRootAuthority();
    const baselineStarted = deferred();
    const allowBaseline = deferred();
    const deletedPaths: string[] = [];
    let listener: WorkspaceWatchListener | undefined;
    const watchAdapter = {
      open: vi.fn((_proof, nextListener: WorkspaceWatchListener) => {
        listener = nextListener;
        return { close: vi.fn() };
      }),
      baseline: vi.fn(async function* () {
        baselineStarted.resolve();
        await allowBaseline.promise;
        yield { relativePath: "Notes/DeletedDuringScan.md", kind: "file" as const };
      }),
    };
    const runtime = createMainWorkspaceRuntime({ rootAuthority, watchAdapter });

    await runtime.switchMain(mainRoot);
    const starting = runtime.subscribe((observation) => {
      if (observation.type === "workspace.changed" && observation.changeType === "deleted") {
        deletedPaths.push(observation.relativePath);
      }
    });
    await baselineStarted.promise;
    listener!.onChange({ relativePath: "Notes/DeletedDuringScan.md", changeType: "deleted" });
    allowBaseline.resolve();
    await starting;
    await vi.waitFor(() => {
      expect(deletedPaths).toEqual(["Notes/DeletedDuringScan.md"]);
    });

    const laterBaselines: string[] = [];
    await runtime.subscribe((observation) => {
      if (observation.type === "workspace.baseline") laterBaselines.push(observation.relativePath);
    });

    expect(laterBaselines).toEqual([]);
  });

  it("fails closed before publishing a watcher change whose root scope proof changed", async () => {
    const rootAuthority = createRootAuthority();
    const changedScope = proofFor(mainRoot);
    changedScope.identity = {
      ...changedScope.identity,
      scopeToken: "scope:changed",
    };
    const close = vi.fn();
    const observations: string[] = [];
    let listener: WorkspaceWatchListener | undefined;
    const watchAdapter = {
      open: vi.fn((_proof, nextListener: WorkspaceWatchListener) => {
        listener = nextListener;
        return { close };
      }),
      baseline: vi.fn(async function* () {
        yield { relativePath: "Notes/A.md", kind: "file" as const };
      }),
    };
    const runtime = createMainWorkspaceRuntime({ rootAuthority, watchAdapter });

    await runtime.switchMain(mainRoot);
    await runtime.subscribe((observation) => {
      if (observation.type === "workspace.changed") observations.push(observation.relativePath);
    });
    rootAuthority.revalidateMain.mockReset();
    rootAuthority.revalidateMain.mockResolvedValue(changedScope);
    listener!.onChange({ relativePath: "Notes/B.md", changeType: "modified" });

    await vi.waitFor(() => {
      expect(runtime.snapshot()).toMatchObject({ health: "FAILED", observing: false });
    });
    expect(rootAuthority.revalidateMain).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(observations).toEqual([]);

    const replayedBaselines: string[] = [];
    await runtime.subscribe((observation) => {
      if (observation.type === "workspace.baseline") replayedBaselines.push(observation.relativePath);
    });
    expect(replayedBaselines).toEqual([]);
  });

  it("fails closed for an unavailable root proof before publishing a watcher event", async () => {
    const rootAuthority = createRootAuthority();
    const close = vi.fn();
    const observations: string[] = [];
    let listener: WorkspaceWatchListener | undefined;
    const watchAdapter = {
      open: vi.fn((_proof, nextListener: WorkspaceWatchListener) => {
        listener = nextListener;
        return { close };
      }),
      baseline: vi.fn(async function* () {
        yield { relativePath: "Notes/A.md", kind: "file" as const };
      }),
    };
    const runtime = createMainWorkspaceRuntime({ rootAuthority, watchAdapter });

    await runtime.switchMain(mainRoot);
    await runtime.subscribe((observation) => {
      if (observation.type === "workspace.changed") observations.push(observation.relativePath);
    });
    rootAuthority.revalidateMain.mockResolvedValue(null);
    listener!.onChange({ relativePath: "Notes/B.md", changeType: "created" });

    await vi.waitFor(() => {
      expect(runtime.snapshot()).toMatchObject({ health: "FAILED", observing: false });
    });
    expect(close).toHaveBeenCalledOnce();
    expect(observations).toEqual([]);

    const replayedBaselines: string[] = [];
    await runtime.subscribe((observation) => {
      if (observation.type === "workspace.baseline") replayedBaselines.push(observation.relativePath);
    });
    expect(replayedBaselines).toEqual([]);
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
