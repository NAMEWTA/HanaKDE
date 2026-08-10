import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createMainFileHistoryBinding,
  createProductionWorkspaceRuntime,
} from "../core/workspace-runtime/production-workspace-runtime.ts";
import type { MainWorkspaceRuntime } from "../core/workspace-runtime/main-workspace-runtime.ts";
import {
  FileHistoryService,
  historyStorePathForKey,
} from "../lib/file-history/file-history-service.ts";
import { MAX_SNAPSHOT_BYTES } from "../lib/file-history/text-file-policy.ts";
import { ResourceEventBus } from "../lib/resource-io/resource-event-bus.ts";
import type {
  ResourceOpenReadResult,
  ResourceStat,
} from "../lib/resource-io/types.ts";
import { MAIN_WORKSPACE_SOURCE_KEY, type WorkspaceSnapshot } from "../shared/workspace-observation.ts";

const HISTORY_RUNTIME_SNAPSHOT: WorkspaceSnapshot = Object.freeze({
  sourceKey: MAIN_WORKSPACE_SOURCE_KEY,
  health: "HEALTHY",
  cursor: 0,
  repairCycle: 0,
  consumerCount: 0,
  observing: true,
});

function createHistoryRuntime(
  subscribe: MainWorkspaceRuntime["subscribe"] = vi.fn(async () => ({
    release: async () => undefined,
  })),
): MainWorkspaceRuntime {
  return {
    switchMain: vi.fn(async () => HISTORY_RUNTIME_SNAPSHOT),
    subscribe,
    reportGap: vi.fn(async () => HISTORY_RUNTIME_SNAPSHOT),
    retryMain: vi.fn(async () => HISTORY_RUNTIME_SNAPSHOT),
    snapshot: vi.fn(() => HISTORY_RUNTIME_SNAPSHOT),
    close: vi.fn(async () => undefined),
  };
}

describe("production workspace runtime assembly", () => {
  it("owns the legacy-to-coordinator handoff and bridges watched changes through the injected EventBus", async () => {
    const order: string[] = [];
    let listener: {
      onChange(change: { relativePath: string; changeType: "created" | "modified" | "deleted" }): void;
      onGap(): void;
      onError(): void;
    } | null = null;
    const legacyWatchRegistry = {
      entries: new Map([
        ["legacy-main", {
          ref: { kind: "local-file" },
          filePath: "/workspace/notes/old.md",
        }],
      ]),
      release: vi.fn((resourceKey: string) => {
        order.push(`release:${resourceKey}`);
        legacyWatchRegistry.entries.delete(resourceKey);
      }),
    };
    const resourceEvents = new ResourceEventBus({ emit: () => undefined });
    const changed = vi.spyOn(resourceEvents, "changed");
    const runtime = createProductionWorkspaceRuntime({
      rootPath: "/workspace",
      rootAuthority: {
        proveMain: async (root) => {
          if (root.kind !== "local-file") return null;
          return {
            root: { kind: "local-file", path: root.path },
            identity: {
              providerId: "local_fs",
              identityNamespace: "test",
              opaqueRootId: "workspace",
              scopeToken: "scope",
              caseMode: "sensitive",
            },
            watchTarget: {
              ref: { kind: "local-file", path: root.path },
              filePath: root.path,
              isDirectory: true,
            },
          };
        },
        revalidateMain: async (proof) => proof,
      },
      watchAdapter: {
        open: (_proof, nextListener) => {
          listener = nextListener;
          order.push("watch-open");
          return { close: () => { order.push("watch-close"); } };
        },
        baseline: function* () {
          order.push("baseline");
          yield { relativePath: "notes", kind: "directory" as const };
          yield { relativePath: "notes/old.md", kind: "file" as const };
        },
      },
      resourceEvents,
      legacyWatchRegistry,
      isolatedProof: () => { order.push("isolated-proof"); },
      beforeCoordinatorStart: () => { order.push("repartition"); },
      historyResourceIO: {
        stat: vi.fn<() => Promise<ResourceStat>>(),
        openRead: vi.fn<() => Promise<ResourceOpenReadResult>>(),
      },
    });

    await runtime.cutover.start();

    expect(order).toEqual([
      "isolated-proof",
      "release:legacy-main",
      "repartition",
      "watch-open",
      "baseline",
    ]);
    expect(runtime.cutover.snapshot()).toMatchObject({
      state: "HEALTHY",
      overlap: 0,
      legacy: { watchers: 0, mutations: 0, baselines: 0 },
      coordinator: { watchers: 1, mutations: 0, baselines: 1 },
    });
    expect(runtime.fileHistoryBinding()).toMatchObject({ sourceKey: "main" });
    const historyEvents = vi.fn();
    const releaseHistoryEvents = runtime.fileHistoryBinding()!.subscribeEvents!(historyEvents);
    resourceEvents.changed({
      changeType: "modified",
      resourceKey: "local_fs:/workspace/notes/event.md",
      resource: { kind: "local-file", path: "/workspace/notes/event.md" },
      source: "agent_tool",
      sessionPath: null,
    });
    expect(historyEvents).toHaveBeenCalledWith(expect.objectContaining({
      type: "main.resource.changed",
      relativePath: "notes/event.md",
      operationContext: "agent_tool",
    }));
    releaseHistoryEvents();

    listener?.onChange({ relativePath: "notes/new.md", changeType: "created" });
    await vi.waitFor(() => {
      expect(changed).toHaveBeenCalledWith(expect.objectContaining({
        resourceKey: "local_fs:/workspace/notes/new.md",
        source: "provider_watch",
      }));
    });

    await runtime.cutover.stop();
    expect(order).toContain("watch-close");
    expect(runtime.cutover.snapshot()).toMatchObject({
      state: "DEGRADED",
      overlap: 0,
    });
    expect(runtime.fileHistoryBinding()).toBeNull();
  });

  it("rejects a production assembly without required File History inputs", () => {
    const base = {
      rootPath: "/workspace",
      rootAuthority: {
        proveMain: vi.fn(),
        revalidateMain: vi.fn(),
      },
      resourceEvents: {
        latestSequence: () => 0,
        changed: vi.fn(),
        deleted: vi.fn(),
      },
      legacyWatchRegistry: { release: vi.fn() },
      isolatedProof: vi.fn(),
      beforeCoordinatorStart: vi.fn(),
    };

    expect(() => createProductionWorkspaceRuntime({
      ...base,
      historyResourceIO: { stat: vi.fn(), openRead: vi.fn() },
    } as never)).toThrow(/file-history assembly/i);
    expect(() => createProductionWorkspaceRuntime({
      ...base,
      resourceEvents: new ResourceEventBus({ emit: () => undefined }),
    } as never)).toThrow(/file-history assembly/i);
  });

  it("adapts only canonical main observations and EventBus facts for File History", async () => {
    let workspaceConsumer: ((observation: unknown) => unknown) | null = null;
    let eventConsumer: ((event: unknown) => unknown) | null = null;
    const workspaceRelease = vi.fn(async () => undefined);
    const eventRelease = vi.fn();
    const subscribe: MainWorkspaceRuntime["subscribe"] = vi.fn(async (consumer) => {
        workspaceConsumer = consumer;
        return { release: workspaceRelease };
      });
    const runtime = createHistoryRuntime(subscribe);
    const resourceEvents = {
      subscribe: vi.fn((consumer) => {
        eventConsumer = consumer;
        return eventRelease;
      }),
    };
    const stat = vi.fn<() => Promise<ResourceStat>>(async () => ({
      exists: true,
      isDirectory: false,
      resourceKey: "local_fs:/workspace/notes/a.md",
      resource: { kind: "local-file" as const, path: "/workspace/notes/a.md" },
      version: { mtimeMs: 10, size: 3 },
    } satisfies ResourceStat));
    const openRead = vi.fn<() => Promise<ResourceOpenReadResult>>(async () => ({
      resource: { kind: "local-file" as const, path: "/workspace/notes/a.md" },
      resourceKey: "local_fs:/workspace/notes/a.md",
      body: (async function* () { yield Buffer.from("abc"); })(),
      size: 3,
      mtimeMs: 10,
      version: { mtimeMs: 10, size: 3 },
    } satisfies ResourceOpenReadResult));
    const binding = createMainFileHistoryBinding({
      rootProof: {
        root: { kind: "local-file", path: "/workspace-alias" },
        identity: {
          providerId: "local_fs",
          identityNamespace: "local_fs",
          opaqueRootId: "opaque-main-root",
          scopeToken: "scope",
          caseMode: "sensitive",
        },
        watchTarget: {
          ref: { kind: "local-file", path: "/workspace" },
          filePath: "/workspace",
          isDirectory: true,
        },
      },
      runtime,
      resourceEvents,
      resourceIO: { stat, openRead },
    });

    expect(binding.historyStoreKey).not.toContain("/workspace");
    expect(await binding.verifyPrivateStorePath("/private/file-history/history.sqlite")).toBe(true);
    expect(await binding.verifyPrivateStorePath("/workspace/file-history/history.sqlite")).toBe(false);

    const observationConsumer = vi.fn();
    const subscription = await binding.subscribe(observationConsumer);
    expect(runtime.subscribe).toHaveBeenCalledWith(observationConsumer);
    await subscription.release();
    expect(workspaceRelease).toHaveBeenCalledOnce();
    expect(workspaceConsumer).toBe(observationConsumer);

    const historyEvents = vi.fn();
    const releaseEvents = binding.subscribeEvents!(historyEvents);
    eventConsumer?.({
      type: "resource.changed",
      resource: { kind: "local-file", path: "/workspace/notes/a.md" },
      resourceKey: "local_fs:/workspace/notes/a.md",
      changeType: "modified",
      source: "agent_tool",
      sessionPath: null,
      sequence: 4,
      occurredAt: "2026-08-10T00:00:00.000Z",
      version: { mtimeMs: 10, size: 3 },
    });
    eventConsumer?.({
      type: "resource.renamed",
      oldResource: { kind: "local-file", path: "/workspace/notes/a.md" },
      oldResourceKey: "local_fs:/workspace/notes/a.md",
      newResource: { kind: "local-file", path: "/workspace/notes/b.md" },
      newResourceKey: "local_fs:/workspace/notes/b.md",
      source: "api",
      sessionPath: null,
      sequence: 5,
      occurredAt: "2026-08-10T00:00:01.000Z",
    });
    eventConsumer?.({
      type: "resource.changed",
      resource: { kind: "mount", mountId: "docs", path: "a.md" },
      resourceKey: "mount:docs:a.md",
      changeType: "modified",
      source: "mount",
      sessionPath: null,
      sequence: 6,
      occurredAt: "2026-08-10T00:00:02.000Z",
    });
    eventConsumer?.({
      type: "resource.changed",
      resource: { kind: "session-file", fileId: "sf_1" },
      resourceKey: "session_file:sf_1",
      changeType: "modified",
      source: "session_file",
      sessionPath: "/sessions/a.jsonl",
      sequence: 7,
      occurredAt: "2026-08-10T00:00:03.000Z",
    });
    eventConsumer?.({
      type: "resource.changed",
      resource: { kind: "local-file", path: "/outside/a.md" },
      resourceKey: "local_fs:/outside/a.md",
      changeType: "modified",
      source: "provider_watch",
      sessionPath: null,
      sequence: 8,
      occurredAt: "2026-08-10T00:00:04.000Z",
    });

    expect(historyEvents).toHaveBeenCalledTimes(2);
    expect(historyEvents.mock.calls.map(([event]) => event)).toEqual([
      expect.objectContaining({
        type: "main.resource.changed",
        sourceKey: "main",
        relativePath: "notes/a.md",
        operationContext: "agent_tool",
      }),
      expect.objectContaining({
        type: "main.resource.renamed",
        sourceKey: "main",
        oldRelativePath: "notes/a.md",
        newRelativePath: "notes/b.md",
        operationContext: "api",
      }),
    ]);
    releaseEvents();
    expect(eventRelease).toHaveBeenCalledOnce();

    await expect(binding.read("notes/a.md", { maxBytes: MAX_SNAPSHOT_BYTES })).resolves.toMatchObject({
      content: Buffer.from("abc"),
    });
    expect(openRead).toHaveBeenCalledWith(
      { kind: "local-file", path: "/workspace/notes/a.md" },
      expect.objectContaining({ end: 2, expectedVersion: { mtimeMs: 10, size: 3 } }),
      expect.objectContaining({ source: "provider_watch", reason: "file_history" }),
    );

    stat.mockResolvedValueOnce({
      exists: true,
      isDirectory: false,
      resourceKey: "local_fs:/workspace/notes/a.md",
      resource: { kind: "local-file" as const, path: "/workspace/notes/a.md" },
    } satisfies ResourceStat);
    openRead.mockResolvedValueOnce({
      resource: { kind: "local-file" as const, path: "/workspace/notes/a.md" },
      resourceKey: "local_fs:/workspace/notes/a.md",
      body: (async function* () { yield Buffer.from("abc"); })(),
      size: 3,
      mtimeMs: 10,
      version: { mtimeMs: 10, size: 3 },
    } satisfies ResourceOpenReadResult);
    await binding.read("notes/a.md", { maxBytes: MAX_SNAPSHOT_BYTES });
    expect(openRead).toHaveBeenLastCalledWith(
      { kind: "local-file", path: "/workspace/notes/a.md" },
      expect.objectContaining({ end: MAX_SNAPSHOT_BYTES - 1 }),
      expect.objectContaining({ source: "provider_watch", reason: "file_history" }),
    );
  });

  it("does not consume an oversized openRead body for File History", async () => {
    let bodyConsumed = false;
    const body = (async function* () {
      bodyConsumed = true;
      yield Buffer.alloc(0);
    })();
    const binding = createMainFileHistoryBinding({
      rootProof: {
        root: { kind: "local-file", path: "/workspace" },
        identity: {
          providerId: "local_fs",
          identityNamespace: "local_fs",
          opaqueRootId: "opaque-main-root",
          scopeToken: "scope",
          caseMode: "sensitive",
        },
        watchTarget: {
          ref: { kind: "local-file", path: "/workspace" },
          filePath: "/workspace",
          isDirectory: true,
        },
      },
      runtime: createHistoryRuntime(),
      resourceEvents: { subscribe: vi.fn(() => () => undefined) },
      resourceIO: {
        stat: vi.fn<() => Promise<ResourceStat>>(async () => ({
          exists: true,
          isDirectory: false,
          resourceKey: "local_fs:/workspace/large.md",
          resource: { kind: "local-file" as const, path: "/workspace/large.md" },
          version: { mtimeMs: 10, size: 1 },
        } satisfies ResourceStat)),
        openRead: vi.fn<() => Promise<ResourceOpenReadResult>>(async () => ({
          resource: { kind: "local-file" as const, path: "/workspace/large.md" },
          resourceKey: "local_fs:/workspace/large.md",
          body,
          size: MAX_SNAPSHOT_BYTES + 1,
          mtimeMs: 10,
          version: { mtimeMs: 10, size: MAX_SNAPSHOT_BYTES + 1 },
        } satisfies ResourceOpenReadResult)),
      },
    });

    await expect(binding.read("large.md", { maxBytes: MAX_SNAPSHOT_BYTES })).resolves.toEqual({
      truncated: true,
      versionToken: expect.any(String),
    });
    expect(bodyConsumed).toBe(false);
  });

  it("rejects a private store path that enters the main workspace through a symlink", async () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-history-private-store-"));
    try {
      const workspace = path.join(temporaryRoot, "workspace");
      const workspacePrivateDirectory = path.join(workspace, ".private");
      const outsideAlias = path.join(temporaryRoot, "outside-alias");
      fs.mkdirSync(workspacePrivateDirectory, { recursive: true });
      fs.symlinkSync(workspacePrivateDirectory, outsideAlias);
      const binding = createMainFileHistoryBinding({
        rootProof: {
          root: { kind: "local-file", path: workspace },
          identity: {
            providerId: "local_fs",
            identityNamespace: "local_fs",
            opaqueRootId: "opaque-main-root",
            scopeToken: "scope",
            caseMode: "sensitive",
          },
          watchTarget: {
            ref: { kind: "local-file", path: workspace },
            filePath: workspace,
            isDirectory: true,
          },
        },
        runtime: createHistoryRuntime(),
        resourceEvents: { subscribe: vi.fn(() => () => undefined) },
        resourceIO: { stat: vi.fn(), openRead: vi.fn() },
      });

      expect(await binding.verifyPrivateStorePath(path.join(outsideAlias, "history.sqlite"))).toBe(false);
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects a File History store whose Hana home ancestor resolves into main Workspace", async () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-history-home-symlink-"));
    try {
      const workspace = path.join(temporaryRoot, "workspace");
      const hanakoHomeAlias = path.join(temporaryRoot, "hanako-home-alias");
      fs.mkdirSync(workspace, { recursive: true });
      fs.symlinkSync(workspace, hanakoHomeAlias);
      const binding = createMainFileHistoryBinding({
        rootProof: {
          root: { kind: "local-file", path: workspace },
          identity: {
            providerId: "local_fs",
            identityNamespace: "local_fs",
            opaqueRootId: "opaque-main-root",
            scopeToken: "scope",
            caseMode: "sensitive",
          },
          watchTarget: {
            ref: { kind: "local-file", path: workspace },
            filePath: workspace,
            isDirectory: true,
          },
        },
        runtime: createHistoryRuntime(),
        resourceEvents: { subscribe: vi.fn(() => () => undefined) },
        resourceIO: { stat: vi.fn(), openRead: vi.fn() },
      });

      const storePath = historyStorePathForKey(hanakoHomeAlias, "main-opaque-store-key");
      expect(storePath).toContain(hanakoHomeAlias);
      expect(await binding.verifyPrivateStorePath(storePath)).toBe(false);

      const createStore = vi.fn();
      const history = new FileHistoryService({ privateStoreRoot: hanakoHomeAlias, createStore });
      await expect(history.activateMain(binding)).rejects.toThrow(/outside the workspace/);
      expect(createStore).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
