import path from "path";
import fs from "fs";
import os from "os";
import { EventEmitter } from "node:events";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HanaEngine,
  MainWorkspaceKnowledgeSharedBaselineAdapter,
} from "../core/engine.ts";
import { KnowledgeIndexRuntime } from "../core/knowledge-workspace/knowledge-index-runtime.ts";
import { SourceRegistry } from "../core/knowledge-workspace/source-registry.ts";
import { bridgeProductionWorkspaceObservation } from "../core/workspace-runtime/production-workspace-runtime.ts";
import type { MainWorkspaceRuntime } from "../core/workspace-runtime/main-workspace-runtime.ts";
import {
  MAIN_WORKSPACE_SOURCE_KEY,
  type WorkspaceHealth,
  type WorkspaceSnapshot,
} from "../shared/workspace-observation.ts";
import {
  FileHistoryService,
  type FileHistoryStore,
} from "../lib/file-history/file-history-service.ts";
import { searchKnowledgeIndex } from "../lib/knowledge-workspace/knowledge-search-query.ts";
import { LocalFsProvider } from "../lib/resource-io/providers/local-fs-provider.ts";
import { ResourceEventBus } from "../lib/resource-io/resource-event-bus.ts";
import { ResourceIO } from "../lib/resource-io/resource-io.ts";
import { resourceKeyForRef } from "../lib/resource-io/resource-refs.ts";
import { createProductionWorkspaceHealthRoute } from "../server/composition/production-workspace-health.ts";

let workspaceRoot: string | null = null;

afterEach(() => {
  if (workspaceRoot) fs.rmSync(workspaceRoot, { recursive: true, force: true });
  workspaceRoot = null;
  vi.restoreAllMocks();
});

type KnowledgeBaselineRuntime = Pick<
  MainWorkspaceRuntime,
  "snapshot" | "reportGap" | "retryMain"
>;

function workspaceSnapshot(
  health: WorkspaceHealth = "HEALTHY",
  observing = true,
): WorkspaceSnapshot {
  return {
    sourceKey: MAIN_WORKSPACE_SOURCE_KEY,
    health,
    cursor: 0,
    repairCycle: 0,
    consumerCount: 0,
    observing,
  };
}

function createKnowledgeBaselineRuntime({
  health = "HEALTHY",
  observing = true,
  reportGap = vi.fn(async () => workspaceSnapshot(health, observing)),
  retryMain = vi.fn(async () => workspaceSnapshot(health, observing)),
}: Readonly<{
  health?: WorkspaceHealth;
  observing?: boolean;
  reportGap?: () => Promise<WorkspaceSnapshot>;
  retryMain?: () => Promise<WorkspaceSnapshot>;
}> = {}): KnowledgeBaselineRuntime {
  return {
    snapshot: vi.fn(() => workspaceSnapshot(health, observing)),
    reportGap,
    retryMain,
  };
}

function installEngineHistoryStub(engine: any): void {
  let available = false;
  engine._fileHistoryService = {
    close: vi.fn(async () => { available = false; }),
    isAvailable: () => available,
    activateMain: vi.fn(async () => { available = true; }),
  };
  engine._fileHistoryStoreKey = null;
  engine._mainFileHistoryBinding = null;
}

function createMemoryHistoryStore(onClose: () => void = () => {}): FileHistoryStore {
  const snapshots: Array<{
    id: number;
    relPath: string;
    content: Buffer;
    capturedAt: number;
    origin: "baseline" | "event" | "restore";
    opContext: string | null;
    versionToken: string | null;
  }> = [];
  let closed = false;
  const assertOpen = () => {
    if (closed) throw new Error("file-history store is closed");
  };
  return {
    recordSnapshot: ({ relPath, content, capturedAt = 0, origin, opContext = null, versionToken = null }) => {
      assertOpen();
      const snapshot = {
        id: snapshots.length + 1,
        relPath,
        content: Buffer.from(content),
        capturedAt,
        origin,
        opContext,
        versionToken,
      };
      snapshots.push(snapshot);
      return { status: "inserted" as const, snapshotId: snapshot.id };
    },
    enforceRetention: () => assertOpen(),
    listFiles: () => {
      assertOpen();
      return [...new Set(snapshots.map(snapshot => snapshot.relPath))].map(relPath => {
        const matching = snapshots.filter(snapshot => snapshot.relPath === relPath);
        return {
          relPath,
          deletedAt: null,
          lastCapturedAt: matching.at(-1)?.capturedAt || 0,
          snapshotCount: matching.length,
        };
      });
    },
    listVersions: (relPath: string) => {
      assertOpen();
      return snapshots
        .filter(snapshot => snapshot.relPath === relPath)
        .slice()
        .reverse()
        .map(({ id, capturedAt, origin, opContext, content, versionToken }) => ({
          id,
          capturedAt,
          origin,
          opContext,
          rawSize: content.length,
          versionToken,
        }));
    },
    getSnapshotContent: (snapshotId: number) => {
      assertOpen();
      const snapshot = snapshots.find(candidate => candidate.id === snapshotId);
      if (!snapshot) throw new Error(`file-history snapshot ${snapshotId} not found`);
      return {
        relPath: snapshot.relPath,
        content: Buffer.from(snapshot.content),
        capturedAt: snapshot.capturedAt,
        origin: snapshot.origin,
      };
    },
    getSnapshotDiff: () => [],
    markDeleted: () => assertOpen(),
    renamePath: () => {
      assertOpen();
      return false;
    },
    close: () => {
      if (closed) return;
      closed = true;
      onClose();
    },
  } as unknown as FileHistoryStore;
}

describe("HanaEngine ResourceEvent emission", () => {
  it("emits agent SessionFile writes as resource.changed without a legacy app-event projection", () => {
    const engine = Object.create(HanaEngine.prototype);
    const listener = vi.fn();
    engine._eventBus = null;
    engine._listeners = new Set([listener]);
    const sessionPath = path.join("/sessions", "a.jsonl");
    const filePath = path.join("/workspace", "draft.md");
    const file = {
      id: "sf_created",
      sessionPath,
      filePath,
      realPath: filePath,
      origin: "agent_write",
      operations: ["created"],
      mtimeMs: 123,
      size: 5,
    };
    engine.registerSessionFile = vi.fn(() => file);

    const result = engine.recordSessionFileOperation({
      sessionPath,
      filePath,
      origin: "agent_write",
      operation: "created",
    });

    expect(result).toBe(file);
    const events = listener.mock.calls.map(([event]) => event);
    expect(events[0]).toMatchObject({
      type: "resource.changed",
      source: "agent_tool",
      reason: "agent_write",
      sessionPath,
      fileId: "sf_created",
      operation: "created",
      resource: {
        kind: "local-file",
        provider: "local_fs",
        path: filePath,
        filePath,
      },
    });
    expect(events).toHaveLength(1);
  });

  it("emits bare ResourceIO resource.changed without a legacy app-event projection", () => {
    const engine = Object.create(HanaEngine.prototype);
    const listener = vi.fn();
    engine._eventBus = null;
    engine._listeners = new Set([listener]);

    engine._emitEvent({
      type: "resource.changed",
      changeType: "modified",
      source: "agent_tool",
      reason: "agent_write",
      sessionPath: "/sessions/a.jsonl",
      resourceKey: "local_fs:/workspace/draft.md",
      resource: {
        kind: "local-file",
        provider: "local_fs",
        path: "/workspace/draft.md",
        filePath: "/workspace/draft.md",
      },
      sequence: 1,
      occurredAt: "2026-06-21T00:00:00.000Z",
    }, "/sessions/a.jsonl");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({ type: "resource.changed" });
  });

  it("bridges coordinator deletions through the canonical ResourceEventBus deletion path", () => {
    const events = {
      latestSequence: () => 0,
      changed: vi.fn(),
      deleted: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };

    bridgeProductionWorkspaceObservation({
      rootPath: "/workspace",
      observation: {
        type: "workspace.changed",
        sourceKey: "main",
        relativePath: "notes/deleted.md",
        changeType: "deleted",
        cursor: 0,
        repairCycle: 0,
      },
      resourceEvents: events,
    });

    expect(events.deleted).toHaveBeenCalledWith(expect.objectContaining({
      source: "provider_watch",
      resourceKey: "local_fs:/workspace/notes/deleted.md",
    }));
    expect(events.changed).not.toHaveBeenCalled();
  });

  it("marks created directories for source repair and leaves deleted shapes unknown", () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-main-workspace-directory-"));
    const directory = path.join(workspaceRoot, "notes");
    fs.mkdirSync(directory);
    const events = {
      latestSequence: () => 0,
      changed: vi.fn(),
      deleted: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };

    bridgeProductionWorkspaceObservation({
      rootPath: workspaceRoot,
      observation: {
        type: "workspace.changed",
        sourceKey: "main",
        relativePath: "notes",
        changeType: "created",
        cursor: 0,
        repairCycle: 0,
      },
      resourceEvents: events,
    });
    expect(events.changed).toHaveBeenCalledWith(expect.objectContaining({
      resource: expect.objectContaining({ isDirectory: true }),
      version: { size: null },
      source: "provider_watch",
    }));

    fs.rmSync(directory, { recursive: true });
    bridgeProductionWorkspaceObservation({
      rootPath: workspaceRoot,
      observation: {
        type: "workspace.changed",
        sourceKey: "main",
        relativePath: "notes",
        changeType: "deleted",
        cursor: 0,
        repairCycle: 0,
      },
      resourceEvents: events,
    });
    expect(events.deleted).toHaveBeenCalledWith(expect.objectContaining({
      resource: expect.not.objectContaining({ isDirectory: false }),
      source: "provider_watch",
    }));
  });

  it("starts and releases the real Engine production coordinator without exposing its root", async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-main-workspace-"));
    fs.writeFileSync(path.join(workspaceRoot, "existing.md"), "before");
    const engine = Object.create(HanaEngine.prototype);
    installEngineHistoryStub(engine);
    const events = { changed: vi.fn(), deleted: vi.fn(), subscribe: vi.fn(() => () => undefined) };
    const registry = { entries: new Map(), release: vi.fn() };
    let onFileSystemEvent: ((eventType: string, filename: string) => void) | null = null;
    const close = vi.fn();
    vi.spyOn(fs, "watch").mockImplementation(((_root, _options, listener) => {
      onFileSystemEvent = listener as (eventType: string, filename: string) => void;
      return {
        close,
        on: vi.fn(),
      } as never;
    }) as never);
    engine.getHomeCwd = () => workspaceRoot;
    engine._mainWorkspaceRuntime = null;
    engine._mainWorkspaceCutover = null;
    engine._mainWorkspaceRoot = null;
    engine._resourceWatchRegistry = registry;
    engine._resourceEvents = () => events;
    engine.getResourceIO = () => ({
      getRootIdentity: async () => ({
        providerId: "local_fs",
        identityNamespace: "local_fs",
        opaqueRootId: "root-proof",
        scopeToken: "scope-proof",
        caseMode: "sensitive",
      }),
      resolveWatchTarget: () => ({
        ref: { kind: "local-file", path: workspaceRoot },
        filePath: workspaceRoot,
        isDirectory: true,
      }),
      stat: vi.fn(),
      openRead: vi.fn(),
    });

    await engine._startProductionWorkspaceRuntime();

    const healthy = engine.getProductionWorkspaceHealth();
    expect(healthy).toMatchObject({
      state: "HEALTHY",
      overlap: 0,
      coordinator: { watchers: 1, baselines: 1 },
    });
    expect(JSON.stringify(healthy)).not.toContain(workspaceRoot);

    fs.writeFileSync(path.join(workspaceRoot, "created.md"), "created");
    onFileSystemEvent?.("rename", "created.md");
    await vi.waitFor(() => expect(events.changed).toHaveBeenCalledWith(expect.objectContaining({
      resourceKey: expect.stringContaining("created.md"),
    })));
    fs.rmSync(path.join(workspaceRoot, "created.md"));
    onFileSystemEvent?.("rename", "created.md");
    await vi.waitFor(() => expect(events.deleted).toHaveBeenCalledWith(expect.objectContaining({
      resourceKey: expect.stringContaining("created.md"),
    })));

    await engine._stopProductionWorkspaceRuntime();
    expect(close).toHaveBeenCalledOnce();
    expect(engine.getProductionWorkspaceHealth()).toMatchObject({
      state: "DEGRADED",
      overlap: 0,
    });
  });

  it("cuts over the active agent explicit home only after closing the old production observer", async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-main-workspace-cutover-"));
    const rootA = path.join(workspaceRoot, "workspace-a");
    const rootB = path.join(workspaceRoot, "workspace-b");
    const homeRoot = path.join(workspaceRoot, "home");
    fs.mkdirSync(rootA);
    fs.mkdirSync(rootB);
    fs.mkdirSync(homeRoot);
    const engine = Object.create(HanaEngine.prototype);
    installEngineHistoryStub(engine);
    const order: string[] = [];
    const activeAgent = { config: { desk: { home_folder: rootA }, last_cwd: rootA } };
    engine._agentMgr = {
      activeAgentId: "active",
      agent: activeAgent,
    };
    engine._sessionCoord = {
      currentSessionPath: "/sessions/normal.jsonl",
      getSessionWorkspaceMount: vi.fn(() => null),
    };
    engine.getExplicitHomeCwd = vi.fn(() => activeAgent.config.desk?.home_folder || null);
    engine.getHomeCwd = vi.fn(() => homeRoot);
    engine._mainWorkspaceRuntime = null;
    engine._mainWorkspaceCutover = null;
    engine._mainWorkspaceRoot = null;
    engine._resourceWatchRegistry = { entries: new Map(), release: vi.fn() };
    engine._resourceEvents = () => ({ changed: vi.fn(), deleted: vi.fn(), subscribe: vi.fn(() => () => undefined) });
    engine.getResourceIO = () => ({
      getRootIdentity: async (root) => ({
        providerId: "local_fs",
        identityNamespace: "local_fs",
        opaqueRootId: `root-proof:${root.path}`,
        scopeToken: `scope-proof:${root.path}`,
        caseMode: "sensitive",
      }),
      resolveWatchTarget: (root) => ({
        ref: root,
        filePath: root.path,
        isDirectory: true,
      }),
      stat: vi.fn(),
      openRead: vi.fn(),
    });
    vi.spyOn(fs, "watch").mockImplementation(((_root, _options, _listener) => {
      const watchedRoot = String(_root);
      order.push(`open:${watchedRoot}`);
      return {
        close: () => order.push(`close:${watchedRoot}`),
        on: vi.fn(),
      } as never;
    }) as never);
    engine._configCoord = {
      updateConfig: vi.fn(async (partial) => {
        activeAgent.config = {
          ...activeAgent.config,
          ...partial,
          ...(partial?.desk ? { desk: { ...activeAgent.config.desk, ...partial.desk } } : {}),
        };
        return { ok: true };
      }),
    };

    await engine._startProductionWorkspaceRuntime();
    await expect(engine.updateConfig({ desk: { home_folder: rootB } })).resolves.toEqual({ ok: true });

    expect(order).toEqual([
      `open:${rootA}`,
      `close:${rootA}`,
      `open:${rootB}`,
    ]);
    expect(engine._mainWorkspaceRoot).toBe(rootB);
    await engine._stopProductionWorkspaceRuntime();
  });

  it("cuts over production main from A to B after SessionCoordinator uses switchAgentOnly", async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-main-workspace-agent-switch-"));
    const rootA = path.join(workspaceRoot, "workspace-a");
    const rootB = path.join(workspaceRoot, "workspace-b");
    fs.mkdirSync(rootA);
    fs.mkdirSync(rootB);
    const agents = {
      a: { config: { desk: { home_folder: rootA } } },
      b: { config: { desk: { home_folder: rootB } } },
    };
    let activeAgentId: keyof typeof agents = "a";
    const engine = Object.create(HanaEngine.prototype);
    installEngineHistoryStub(engine);
    const order: string[] = [];
    engine._agentMgr = {
      get activeAgentId() { return activeAgentId; },
      get agent() { return agents[activeAgentId]; },
      switchAgentOnly: vi.fn(async (agentId) => {
        activeAgentId = agentId;
        return { agentId };
      }),
    };
    engine.getHomeCwd = () => rootA;
    engine._mainWorkspaceRuntime = null;
    engine._mainWorkspaceCutover = null;
    engine._mainWorkspaceRoot = null;
    engine._resourceWatchRegistry = { entries: new Map(), release: vi.fn() };
    const eventBus = new ResourceEventBus({ emit: () => {} });
    engine._resourceEvents = () => eventBus;
    engine.getResourceIO = () => ({
      getRootIdentity: async (root) => ({
        providerId: "local_fs",
        identityNamespace: "local_fs",
        opaqueRootId: `root-proof:${root.path}`,
        scopeToken: `scope-proof:${root.path}`,
        caseMode: "sensitive",
      }),
      resolveWatchTarget: (root) => ({ ref: root, filePath: root.path, isDirectory: true }),
      stat: vi.fn(),
      openRead: vi.fn(),
    });
    vi.spyOn(fs, "watch").mockImplementation(((_root, _options, _listener) => {
      const watchedRoot = String(_root);
      order.push(`open:${watchedRoot}`);
      return { close: () => order.push(`close:${watchedRoot}`), on: vi.fn() } as never;
    }) as never);

    await engine._startProductionWorkspaceRuntime();
    await expect(engine.switchAgentOnly("b")).resolves.toEqual({ agentId: "b" });

    expect(engine._agentMgr.switchAgentOnly).toHaveBeenCalledWith("b");
    expect(order).toEqual([`open:${rootA}`, `close:${rootA}`, `open:${rootB}`]);
    expect(engine._mainWorkspaceRoot).toBe(rootB);
    expect(engine.getProductionWorkspaceHealth()).toMatchObject({ state: "HEALTHY", overlap: 0 });
    await engine._stopProductionWorkspaceRuntime();
  });

  it("keeps A's production owner active when target switchAgentOnly activation fails", async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-main-workspace-agent-switch-failure-"));
    const rootA = path.join(workspaceRoot, "workspace-a");
    const rootB = path.join(workspaceRoot, "workspace-b");
    fs.mkdirSync(rootA);
    fs.mkdirSync(rootB);
    const activeAgent = { config: { desk: { home_folder: rootA } } };
    const engine = Object.create(HanaEngine.prototype);
    installEngineHistoryStub(engine);
    const order: string[] = [];
    engine._agentMgr = {
      activeAgentId: "a",
      agent: activeAgent,
      switchAgentOnly: vi.fn(async () => {
        throw new Error("target activation failed");
      }),
    };
    engine.getHomeCwd = () => rootA;
    engine._mainWorkspaceRuntime = null;
    engine._mainWorkspaceCutover = null;
    engine._mainWorkspaceRoot = null;
    engine._resourceWatchRegistry = { entries: new Map(), release: vi.fn() };
    const eventBus = new ResourceEventBus({ emit: () => {} });
    engine._resourceEvents = () => eventBus;
    engine.getResourceIO = () => ({
      getRootIdentity: async (root) => ({
        providerId: "local_fs",
        identityNamespace: "local_fs",
        opaqueRootId: `root-proof:${root.path}`,
        scopeToken: `scope-proof:${root.path}`,
        caseMode: "sensitive",
      }),
      resolveWatchTarget: (root) => ({ ref: root, filePath: root.path, isDirectory: true }),
      stat: vi.fn(),
      openRead: vi.fn(),
    });
    vi.spyOn(fs, "watch").mockImplementation(((_root, _options, _listener) => {
      const watchedRoot = String(_root);
      order.push(`open:${watchedRoot}`);
      return { close: () => order.push(`close:${watchedRoot}`), on: vi.fn() } as never;
    }) as never);

    await engine._startProductionWorkspaceRuntime();
    await expect(engine.switchAgentOnly("b")).rejects.toThrow("target activation failed");

    expect(order).toEqual([`open:${rootA}`]);
    expect(order).not.toContain(`open:${rootB}`);
    expect(engine._mainWorkspaceRoot).toBe(rootA);
    expect(engine.getProductionWorkspaceHealth()).toMatchObject({ state: "HEALTHY", overlap: 0 });
    await engine._stopProductionWorkspaceRuntime();
  });

  it("does not retarget main when a focused mounted session records last_cwd", async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-main-workspace-mounted-"));
    const rootA = path.join(workspaceRoot, "workspace-a");
    const mountedRoot = path.join(workspaceRoot, "mounted-docs");
    const homeRoot = path.join(workspaceRoot, "home");
    fs.mkdirSync(rootA);
    fs.mkdirSync(mountedRoot);
    fs.mkdirSync(homeRoot);
    const engine = Object.create(HanaEngine.prototype);
    installEngineHistoryStub(engine);
    const order: string[] = [];
    const activeAgent = { config: { desk: { home_folder: rootA }, last_cwd: rootA } };
    engine._agentMgr = { activeAgentId: "active", agent: activeAgent };
    engine._sessionCoord = {
      currentSessionPath: "/sessions/mounted.jsonl",
      getSessionWorkspaceMount: vi.fn(() => ({ mountId: "mount_docs", label: "Docs" })),
    };
    engine.getExplicitHomeCwd = vi.fn(() => activeAgent.config.desk?.home_folder || null);
    engine.getHomeCwd = vi.fn(() => homeRoot);
    engine._mainWorkspaceRuntime = null;
    engine._mainWorkspaceCutover = null;
    engine._mainWorkspaceRoot = null;
    engine._resourceWatchRegistry = { entries: new Map(), release: vi.fn() };
    engine._resourceEvents = () => ({ changed: vi.fn(), deleted: vi.fn(), subscribe: vi.fn(() => () => undefined) });
    engine.getResourceIO = () => ({
      getRootIdentity: async (root) => ({
        providerId: "local_fs",
        identityNamespace: "local_fs",
        opaqueRootId: `root-proof:${root.path}`,
        scopeToken: `scope-proof:${root.path}`,
        caseMode: "sensitive",
      }),
      resolveWatchTarget: (root) => ({ ref: root, filePath: root.path, isDirectory: true }),
      stat: vi.fn(),
      openRead: vi.fn(),
    });
    vi.spyOn(fs, "watch").mockImplementation(((_root, _options, _listener) => {
      const watchedRoot = String(_root);
      order.push(`open:${watchedRoot}`);
      return { close: () => order.push(`close:${watchedRoot}`), on: vi.fn() } as never;
    }) as never);
    engine._configCoord = {
      updateConfig: vi.fn(async (partial) => {
        activeAgent.config = { ...activeAgent.config, ...partial };
        return { ok: true };
      }),
    };

    await engine._startProductionWorkspaceRuntime();
    await expect(engine.updateConfig({ last_cwd: mountedRoot })).resolves.toEqual({ ok: true });

    expect(order).toEqual([`open:${rootA}`]);
    expect(engine._mainWorkspaceRoot).toBe(rootA);
    await engine._stopProductionWorkspaceRuntime();
  });

  it("fails closed for an unavailable explicit home instead of observing the default", async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-main-workspace-unavailable-"));
    const rootA = path.join(workspaceRoot, "workspace-a");
    const unavailableRoot = path.join(workspaceRoot, "unavailable");
    const homeRoot = path.join(workspaceRoot, "default-home");
    fs.mkdirSync(rootA);
    fs.mkdirSync(homeRoot);
    const engine = Object.create(HanaEngine.prototype);
    installEngineHistoryStub(engine);
    const order: string[] = [];
    const activeAgent = { config: { desk: { home_folder: rootA } } };
    engine._agentMgr = { activeAgentId: "active", agent: activeAgent };
    engine.getHomeCwd = vi.fn(() => homeRoot);
    engine._mainWorkspaceRuntime = null;
    engine._mainWorkspaceCutover = null;
    engine._mainWorkspaceRoot = null;
    engine._resourceWatchRegistry = { entries: new Map(), release: vi.fn() };
    engine._resourceEvents = () => ({ changed: vi.fn(), deleted: vi.fn(), subscribe: vi.fn(() => () => undefined) });
    engine.getResourceIO = () => ({
      getRootIdentity: async (root) => ({
        providerId: "local_fs",
        identityNamespace: "local_fs",
        opaqueRootId: `root-proof:${root.path}`,
        scopeToken: `scope-proof:${root.path}`,
        caseMode: "sensitive",
      }),
      resolveWatchTarget: (root) => ({ ref: root, filePath: root.path, isDirectory: true }),
      stat: vi.fn(),
      openRead: vi.fn(),
    });
    vi.spyOn(fs, "watch").mockImplementation(((_root, _options, _listener) => {
      const watchedRoot = String(_root);
      order.push(`open:${watchedRoot}`);
      return { close: () => order.push(`close:${watchedRoot}`), on: vi.fn() } as never;
    }) as never);
    engine._configCoord = {
      updateConfig: vi.fn(async (partial) => {
        activeAgent.config = {
          ...activeAgent.config,
          ...partial,
          ...(partial?.desk ? { desk: { ...activeAgent.config.desk, ...partial.desk } } : {}),
        };
        return { ok: true };
      }),
    };

    await engine._startProductionWorkspaceRuntime();
    await expect(engine.updateConfig({ desk: { home_folder: unavailableRoot } })).resolves.toEqual({ ok: true });

    expect(order).toEqual([`open:${rootA}`, `close:${rootA}`]);
    expect(engine._mainWorkspaceRoot).toBeNull();
    expect(engine.getProductionWorkspaceHealth()).toMatchObject({ state: "FAILED", overlap: 0 });

    await engine._startProductionWorkspaceRuntime();

    expect(order).toEqual([`open:${rootA}`, `close:${rootA}`]);
    expect(engine._mainWorkspaceRoot).toBeNull();
    expect(engine.getProductionWorkspaceHealth()).toMatchObject({ state: "FAILED", overlap: 0 });
  });

  it("does not restart the production owner for a non-focused agent home update", async () => {
    const engine = Object.create(HanaEngine.prototype);
    engine._agentMgr = {
      activeAgentId: "active",
      agent: { config: { desk: { home_folder: "/workspace/active" } } },
    };
    engine._configCoord = { updateConfig: vi.fn(async () => ({ ok: true })) };
    engine._startProductionWorkspaceRuntime = vi.fn(async () => ({}));

    await expect(engine.updateConfig(
      { desk: { home_folder: "/workspace/background" } },
      { agentId: "background" },
    )).resolves.toEqual({ ok: true });

    expect(engine._startProductionWorkspaceRuntime).not.toHaveBeenCalled();
  });

  it("captures main History baseline and watcher facts without reactivating a healthy root", async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-engine-file-history-seam-"));
    const workspace = path.join(workspaceRoot, "workspace");
    const hanakoHome = path.join(workspaceRoot, "hana");
    fs.mkdirSync(workspace, { recursive: true });
    fs.mkdirSync(hanakoHome, { recursive: true });
    fs.writeFileSync(path.join(workspace, "Initial.md"), "# Initial\n\nalpha", "utf8");

    const eventBus = new ResourceEventBus({ emit: () => undefined });
    const resourceIO = new ResourceIO({
      providers: { local_fs: new LocalFsProvider({ cwd: workspaceRoot }) },
      eventBus,
    });
    const historyStore = createMemoryHistoryStore();
    const engine = Object.create(HanaEngine.prototype);
    engine.hanakoHome = hanakoHome;
    engine._fileHistoryService = new FileHistoryService({
      privateStoreRoot: hanakoHome,
      createStore: () => historyStore,
      debounceMs: 0,
      mergeWindowMs: 0,
    });
    engine._mainFileHistoryBinding = null;
    engine._fileHistoryStoreKey = null;
    engine._mainWorkspaceSharedBaseline = null;
    engine._mainWorkspaceRuntime = null;
    engine._mainWorkspaceCutover = null;
    engine._mainWorkspaceRoot = null;
    engine._mainWorkspaceCanonicalRoot = null;
    engine._mainWorkspaceUnavailable = false;
    engine._resourceWatchRegistry = { entries: new Map(), release: vi.fn() };
    engine._resourceEvents = () => eventBus;
    engine.getHomeCwd = () => workspace;
    engine.getResourceIO = () => resourceIO;
    engine._repartitionActiveResourceWatches = vi.fn(async () => undefined);
    let onFileSystemEvent: ((eventType: string, filename: string) => void) | null = null;
    vi.spyOn(fs, "watch").mockImplementation(((_root, _options, listener) => {
      onFileSystemEvent = listener as (eventType: string, filename: string) => void;
      return { close: vi.fn(), on: vi.fn() } as never;
    }) as never);

    await engine._startProductionWorkspaceRuntime();

    const history = engine.getFileHistoryService();
    expect(history).toBeInstanceOf(FileHistoryService);
    await vi.waitFor(async () => {
      await history.waitForIdle();
      expect(history.listFiles()).toEqual([
        expect.objectContaining({ relPath: "Initial.md" }),
      ]);
    });
    expect(history.getHealth()).toBe("HEALTHY");

    const activateMain = vi.spyOn(history, "activateMain");
    await engine._startProductionWorkspaceRuntime();
    expect(activateMain).not.toHaveBeenCalled();

    fs.writeFileSync(path.join(workspace, "Initial.md"), "# Initial\n\nbeta", "utf8");
    onFileSystemEvent?.("change", "Initial.md");
    await vi.waitFor(async () => {
      await history.waitForIdle();
      expect(eventBus.latestSequence()).toBe(1);
      const latest = history.listVersions("Initial.md")[0];
      expect(latest).toBeDefined();
      expect(history.getSnapshotContent(latest!.id).content.toString("utf8")).toContain("beta");
    });

    await engine._stopProductionWorkspaceRuntime();
    expect(history.isAvailable()).toBe(false);
  });

  it("shares one real main coordinator between History and Knowledge", async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-engine-history-knowledge-seam-"));
    const workspace = path.join(workspaceRoot, "workspace");
    const hanakoHome = path.join(workspaceRoot, "hana");
    fs.mkdirSync(workspace, { recursive: true });
    fs.mkdirSync(hanakoHome, { recursive: true });
    fs.writeFileSync(path.join(workspace, "Initial.md"), "# Initial\n\nalpha", "utf8");

    const emitted: unknown[] = [];
    const eventBus = new ResourceEventBus({ emit: (event) => emitted.push(event) });
    const resourceIO = new ResourceIO({
      providers: { local_fs: new LocalFsProvider({ cwd: workspaceRoot }) },
      eventBus,
    });
    const sourceRegistry = await SourceRegistry.create({
      mainRoot: { kind: "local-file", path: workspace },
      resourceIO,
      hanakoHome,
    });
    const engine = Object.create(HanaEngine.prototype);
    engine.hanakoHome = hanakoHome;
    engine._fileHistoryService = new FileHistoryService({
      privateStoreRoot: hanakoHome,
      createStore: () => createMemoryHistoryStore(),
      debounceMs: 0,
      mergeWindowMs: 0,
    });
    engine._fileHistoryStoreKey = null;
    engine._mainFileHistoryBinding = null;
    engine._knowledgeIndexRuntime = null;
    engine._mainWorkspaceSharedBaseline = null;
    engine._mainWorkspaceRuntime = null;
    engine._mainWorkspaceCutover = null;
    engine._mainWorkspaceRoot = null;
    engine._mainWorkspaceCanonicalRoot = null;
    engine._mainWorkspaceUnavailable = false;
    engine._resourceWatchRegistry = { entries: new Map(), release: vi.fn() };
    engine._resourceEvents = () => eventBus;
    engine.getHomeCwd = () => workspace;
    engine.getResourceIO = () => resourceIO;
    engine.getRuntimeContext = () => ({ serverNodeId: "engine-history-knowledge-seam" });
    engine.retainResourceWatch = vi.fn(() => () => undefined);
    engine._repartitionActiveResourceWatches = vi.fn(async () => undefined);

    const openedWatches = vi.fn();
    const closedWatches = vi.fn();
    let onFileSystemEvent: ((eventType: string, filename: string) => void) | null = null;
    vi.spyOn(fs, "watch").mockImplementation(((_root, _options, listener) => {
      openedWatches();
      onFileSystemEvent = listener as (eventType: string, filename: string) => void;
      return { close: closedWatches, on: vi.fn() } as never;
    }) as never);

    await engine._startProductionWorkspaceRuntime();
    const history = engine.getFileHistoryService();
    expect(history).toBeInstanceOf(FileHistoryService);
    await vi.waitFor(async () => {
      await history.waitForIdle();
      expect(history.listFiles()).toEqual([expect.objectContaining({ relPath: "Initial.md" })]);
    });
    expect(openedWatches).toHaveBeenCalledTimes(1);
    expect(engine.getProductionWorkspaceHealth()).toMatchObject({
      state: "HEALTHY",
      overlap: 0,
      coordinator: { watchers: 1, baselines: 1 },
    });

    await engine.bindKnowledgeIndexWorkspace(sourceRegistry);
    await vi.waitFor(async () => {
      expect(engine.getKnowledgeIndexCoordinator()?.health("main")).toMatchObject({ state: "ready" });
      await expect(searchPaths(engine, "alpha")).resolves.toEqual(["Initial.md"]);
    });
    expect(openedWatches).toHaveBeenCalledTimes(1);

    const laterPath = path.join(workspace, "Later.md");
    fs.writeFileSync(laterPath, "# Later\n\nbeta", "utf8");
    onFileSystemEvent?.("rename", "Later.md");
    const laterKey = resourceKeyForRef({ kind: "local-file", path: laterPath });
    await vi.waitFor(async () => {
      await history.waitForIdle();
      expect(eventBus.latestSequence()).toBe(1);
      expect(history.listFiles()).toEqual(expect.arrayContaining([
        expect.objectContaining({ relPath: "Later.md" }),
      ]));
      await expect(searchPaths(engine, "beta")).resolves.toEqual(["Later.md"]);
    });
    expect(emitted.filter((event) => (
      (event as { resourceKey?: unknown }).resourceKey === laterKey
    ))).toHaveLength(1);

    await engine.disposeKnowledgeIndexRuntime();
    await engine._stopProductionWorkspaceRuntime();
    expect(closedWatches).toHaveBeenCalledTimes(1);
    expect(history.isAvailable()).toBe(false);
  });

  it("closes old History before stopping and replacing the main coordinator", async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-engine-history-root-switch-"));
    const rootA = path.join(workspaceRoot, "workspace-a");
    const rootB = path.join(workspaceRoot, "workspace-b");
    const hanakoHome = path.join(workspaceRoot, "hana");
    fs.mkdirSync(rootA, { recursive: true });
    fs.mkdirSync(rootB, { recursive: true });
    fs.mkdirSync(hanakoHome, { recursive: true });
    fs.writeFileSync(path.join(rootA, "Alpha.md"), "# Alpha\n\na", "utf8");
    fs.writeFileSync(path.join(rootB, "Beta.md"), "# Beta\n\nb", "utf8");

    const order: string[] = [];
    let storeCount = 0;
    const eventBus = new ResourceEventBus({ emit: () => undefined });
    const resourceIO = new ResourceIO({
      providers: { local_fs: new LocalFsProvider({ cwd: workspaceRoot }) },
      eventBus,
    });
    let activeRoot = rootA;
    const engine = Object.create(HanaEngine.prototype);
    engine.hanakoHome = hanakoHome;
    engine._fileHistoryService = new FileHistoryService({
      privateStoreRoot: hanakoHome,
      createStore: () => {
        storeCount += 1;
        const storeId = storeCount;
        order.push(`history.store.open:${storeId}`);
        return createMemoryHistoryStore(() => order.push(`history.store.close:${storeId}`));
      },
      debounceMs: 0,
      mergeWindowMs: 0,
    });
    engine._fileHistoryStoreKey = null;
    engine._mainFileHistoryBinding = null;
    engine._mainWorkspaceSharedBaseline = null;
    engine._mainWorkspaceRuntime = null;
    engine._mainWorkspaceCutover = null;
    engine._mainWorkspaceRoot = null;
    engine._mainWorkspaceCanonicalRoot = null;
    engine._mainWorkspaceUnavailable = false;
    engine._resourceWatchRegistry = { entries: new Map(), release: vi.fn() };
    engine._resourceEvents = () => eventBus;
    engine.getHomeCwd = () => activeRoot;
    engine.getResourceIO = () => resourceIO;
    engine._repartitionActiveResourceWatches = vi.fn(async () => undefined);
    const watcher: fs.FSWatcher = Object.assign(new EventEmitter(), {
      close: () => { order.push("watch.close"); },
      ref: () => watcher,
      unref: () => watcher,
    });
    vi.spyOn(fs, "watch").mockImplementation((_root, _listener) => watcher);

    await engine._startProductionWorkspaceRuntime();
    const history = engine.getFileHistoryService();
    await vi.waitFor(async () => {
      await history.waitForIdle();
      expect(history.listFiles()).toEqual([expect.objectContaining({ relPath: "Alpha.md" })]);
    });
    const oldHistoryStoreKey = engine._fileHistoryStoreKey;
    const oldCutover = engine._mainWorkspaceCutover;
    engine._mainWorkspaceCutover = {
      ...oldCutover,
      stop: async () => {
        order.push("old.cutover.stop");
        await oldCutover.stop();
      },
    };

    activeRoot = rootB;
    await engine._startProductionWorkspaceRuntime();
    await vi.waitFor(async () => {
      await history.waitForIdle();
      expect(history.listFiles()).toEqual([expect.objectContaining({ relPath: "Beta.md" })]);
    });

    expect(history.listVersions("Alpha.md")).toEqual([]);
    expect(engine._fileHistoryStoreKey).not.toBe(oldHistoryStoreKey);
    expect(engine._fileHistoryStoreKey).not.toContain(rootA);
    expect(engine._fileHistoryStoreKey).not.toContain(rootB);
    expect(order.indexOf("history.store.close:1")).toBeLessThan(order.indexOf("old.cutover.stop"));
    expect(order.indexOf("old.cutover.stop")).toBeLessThan(order.indexOf("history.store.open:2"));

    await engine._stopProductionWorkspaceRuntime();
  });

  it("retains the History binding when coordinator stop fails and reactivates it on retry", async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-engine-history-stop-retry-"));
    const workspace = path.join(workspaceRoot, "workspace");
    fs.mkdirSync(workspace, { recursive: true });

    const order: string[] = [];
    let available = true;
    const history = {
      close: vi.fn(async () => {
        order.push("history.close");
        available = false;
      }),
      isAvailable: () => available,
      activateMain: vi.fn(async () => {
        order.push("history.activate");
        available = true;
      }),
    };
    const binding = Object.freeze({ historyStoreKey: "main-history-key" });
    let stopFails = true;
    const cutover = {
      start: vi.fn(async () => order.push("cutover.start")),
      stop: vi.fn(async () => {
        order.push("cutover.stop");
        if (stopFails) {
          stopFails = false;
          throw new Error("release proof failed");
        }
      }),
      snapshot: () => ({
        state: "HEALTHY" as const,
        overlap: 0,
        legacy: { watchers: 0, mutations: 0, baselines: 0 },
        coordinator: { watchers: 1, mutations: 0, baselines: 1 },
      }),
    };
    const runtime = {};
    const bindingFactory = vi.fn(() => binding);
    const engine = Object.create(HanaEngine.prototype);
    engine._fileHistoryService = history;
    engine._fileHistoryStoreKey = binding.historyStoreKey;
    engine._mainFileHistoryBinding = bindingFactory;
    engine._mainWorkspaceRuntime = runtime;
    engine._mainWorkspaceCutover = cutover;
    engine._mainWorkspaceRoot = workspace;
    engine._mainWorkspaceCanonicalRoot = workspace;
    engine._mainWorkspaceUnavailable = false;
    engine.getHomeCwd = () => workspace;

    await expect(engine._stopProductionWorkspaceRuntime()).rejects.toThrow("release proof failed");
    expect(order).toEqual(["history.close", "cutover.stop"]);
    expect(engine._mainFileHistoryBinding).toBe(bindingFactory);
    expect(engine._mainWorkspaceRuntime).toBe(runtime);
    expect(engine._mainWorkspaceCutover).toBe(cutover);
    expect(engine._mainWorkspaceRoot).toBe(workspace);

    await engine._startProductionWorkspaceRuntime();
    expect(order).toEqual(["history.close", "cutover.stop", "cutover.start", "history.activate"]);
    expect(history.activateMain).toHaveBeenCalledWith(binding);
    expect(engine._fileHistoryStoreKey).toBe(binding.historyStoreKey);

    await engine._stopProductionWorkspaceRuntime();
  });
});

describe("HanaEngine main Knowledge shared baseline adapter", () => {
  it("delivers a cached main baseline at 5, replays 6 through 7, then accepts one normal EventBus fact at 8", async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-engine-knowledge-seam-"));
    const workspace = path.join(workspaceRoot, "workspace");
    const hanakoHome = path.join(workspaceRoot, "hana");
    fs.mkdirSync(workspace, { recursive: true });
    fs.mkdirSync(hanakoHome, { recursive: true });
    const initialPath = path.join(workspace, "Initial.md");
    fs.writeFileSync(initialPath, "# Initial\n\nalpha", "utf8");
    const canonicalInitialPath = fs.realpathSync(initialPath);

    const emitted: unknown[] = [];
    const eventBus = new ResourceEventBus({ emit: (event) => emitted.push(event) });
    for (let sequence = 1; sequence <= 5; sequence += 1) {
      eventBus.changed({
        changeType: "created",
        resourceKey: `local_fs:/seed/${sequence}.md`,
        resource: { kind: "local-file", path: `/seed/${sequence}.md`, isDirectory: false },
        source: "provider_watch",
        sessionPath: null,
      });
    }
    expect(eventBus.latestSequence()).toBe(5);

    const resourceIO = new ResourceIO({
      providers: { local_fs: new LocalFsProvider({ cwd: workspaceRoot }) },
      eventBus,
    });
    const registry = await SourceRegistry.create({
      mainRoot: { kind: "local-file", path: workspace },
      resourceIO,
      hanakoHome,
    });
    const engine = Object.create(HanaEngine.prototype);
    engine.hanakoHome = hanakoHome;
    engine._knowledgeIndexRuntime = null;
    engine._mainWorkspaceSharedBaseline = null;
    engine._mainWorkspaceRuntime = null;
    engine._mainWorkspaceCutover = null;
    engine._mainWorkspaceRoot = null;
    engine._mainWorkspaceCanonicalRoot = null;
    engine._mainWorkspaceUnavailable = false;
    engine._resourceWatchRegistry = { entries: new Map(), release: vi.fn() };
    engine._resourceEvents = () => eventBus;
    engine.getHomeCwd = () => workspace;
    engine.getResourceIO = () => resourceIO;
    engine.getRuntimeContext = () => ({ serverNodeId: "engine-knowledge-seam" });
    engine.retainResourceWatch = vi.fn(() => () => undefined);
    engine._repartitionActiveResourceWatches = vi.fn(async () => undefined);

    let onFileSystemEvent: ((eventType: string, filename: string) => void) | null = null;
    vi.spyOn(fs, "watch").mockImplementation(((_root, _options, listener) => {
      onFileSystemEvent = listener as (eventType: string, filename: string) => void;
      return { close: vi.fn(), on: vi.fn() } as never;
    }) as never);

    const sharedBaseline = engine._getMainWorkspaceSharedBaseline();
    const sharedDifferences: Array<{ cursor: number; coverage: string }> = [];
    sharedBaseline.port.subscribe((difference) => {
      sharedDifferences.push({ cursor: difference.cursor, coverage: difference.coverage });
    });
    await engine._startProductionWorkspaceRuntime();
    expect(sharedDifferences).toEqual([{ cursor: 5, coverage: "source" }]);

    let releaseInitialRead!: () => void;
    const initialReadReleased = new Promise<void>((resolve) => {
      releaseInitialRead = resolve;
    });
    let holdInitialRead = true;
    let initialReadObserved = false;
    const openRead = resourceIO.openRead.bind(resourceIO);
    vi.spyOn(resourceIO, "openRead").mockImplementation(async (input, readOptions, context) => {
      const candidate = input as { kind?: unknown; path?: unknown };
      if (
        holdInitialRead
        && candidate.kind === "local-file"
        && typeof candidate.path === "string"
        && path.resolve(candidate.path) === canonicalInitialPath
      ) {
        initialReadObserved = true;
        await initialReadReleased;
        holdInitialRead = false;
      }
      return openRead(input, readOptions, context);
    });

    await engine.bindKnowledgeIndexWorkspace(registry);
    expect(engine._knowledgeIndexRuntime).toBeInstanceOf(KnowledgeIndexRuntime);
    await vi.waitFor(() => expect(initialReadObserved).toBe(true));

    for (const [index, [name, token]] of [["ReplaySix.md", "six"], ["ReplaySeven.md", "seven"]].entries()) {
      fs.writeFileSync(path.join(workspace, name), `# ${name}\n\n${token}`, "utf8");
      onFileSystemEvent?.("rename", name);
      await vi.waitFor(() => expect(eventBus.latestSequence()).toBe(6 + index));
    }
    expect(eventBus.latestSequence()).toBe(7);
    expect(eventBus.since(5)).toMatchObject({
      stale: false,
      latestSequence: 7,
      events: [
        expect.objectContaining({ sequence: 6 }),
        expect.objectContaining({ sequence: 7 }),
      ],
    });
    expect(sharedDifferences).toEqual([
      { cursor: 5, coverage: "source" },
      { cursor: 5, coverage: "source" },
    ]);

    releaseInitialRead();
    await vi.waitFor(async () => {
      expect(engine.getKnowledgeIndexCoordinator()?.health("main")).toMatchObject({
        state: "ready",
        sequence: 7,
      });
      await expect(searchPaths(engine, "alpha")).resolves.toEqual(["Initial.md"]);
      await expect(searchPaths(engine, "six")).resolves.toEqual(["ReplaySix.md"]);
      await expect(searchPaths(engine, "seven")).resolves.toEqual(["ReplaySeven.md"]);
    });

    const laterPath = path.join(workspace, "LaterEight.md");
    fs.writeFileSync(laterPath, "# Later Eight\n\neight", "utf8");
    onFileSystemEvent?.("rename", "LaterEight.md");
    await vi.waitFor(async () => {
      expect(eventBus.latestSequence()).toBe(8);
      expect(engine.getKnowledgeIndexCoordinator()?.health("main")).toMatchObject({
        state: "ready",
        sequence: 8,
      });
      await expect(searchPaths(engine, "eight")).resolves.toEqual(["LaterEight.md"]);
    });
    const laterKey = resourceKeyForRef({ kind: "local-file", path: laterPath });
    expect(emitted.filter((event) => (
      (event as { resourceKey?: unknown }).resourceKey === laterKey
    ))).toHaveLength(1);
    expect(eventBus.since(7)).toMatchObject({
      stale: false,
      latestSequence: 8,
      events: [expect.objectContaining({ sequence: 8, resourceKey: laterKey })],
    });

    await engine.disposeKnowledgeIndexRuntime();
    await engine._stopProductionWorkspaceRuntime();
  });

  it("publishes a source baseline with the canonical ResourceEventBus cursor only", () => {
    let resourceEventSequence = 41;
    const runtime = createKnowledgeBaselineRuntime();
    const adapter = new MainWorkspaceKnowledgeSharedBaselineAdapter({
      currentResourceEventSequence: () => resourceEventSequence,
    });
    const received: unknown[] = [];
    adapter.attach(runtime);
    adapter.port.subscribe((difference) => received.push(difference));

    adapter.accept(runtime, {
      type: "workspace.baseline",
      sourceKey: "main",
      relativePath: "notes/first.md",
      entryKind: "file",
      cursor: 900,
      repairCycle: 0,
    });
    adapter.accept(runtime, {
      type: "workspace.baseline",
      sourceKey: "main",
      relativePath: "notes",
      entryKind: "directory",
      cursor: 901,
      repairCycle: 0,
    });
    adapter.accept(runtime, {
      type: "workspace.health",
      sourceKey: "main",
      health: "HEALTHY",
      reason: "initializing",
      cursor: 902,
      repairCycle: 0,
    });

    expect(received).toEqual([{
      type: "shared-baseline-difference",
      sourceKey: "main",
      cursor: 41,
      coverage: "source",
      changes: [{ relativePath: "notes/first.md", changeType: "upsert" }],
    }]);

    resourceEventSequence = 42;
    adapter.accept(runtime, {
      type: "workspace.changed",
      sourceKey: "main",
      relativePath: "notes/first.md",
      changeType: "modified",
      cursor: 999,
      repairCycle: 0,
    });

    expect(received).toHaveLength(1);
    expect(JSON.stringify(received)).not.toMatch(/workspace|absolutePath|scopeToken|root/i);
    expect(runtime.reportGap).not.toHaveBeenCalled();
  });

  it("reuses a completed baseline only for source_bound and repairs a 5-to-7 gap without swallowing event 8", async () => {
    let resourceEventSequence = 4;
    let resolveGap!: () => void;
    const gap = new Promise<WorkspaceSnapshot>((resolve) => {
      resolveGap = () => resolve(workspaceSnapshot());
    });
    const runtime = createKnowledgeBaselineRuntime({ reportGap: vi.fn(() => gap) });
    const adapter = new MainWorkspaceKnowledgeSharedBaselineAdapter({
      currentResourceEventSequence: () => resourceEventSequence,
    });
    const received: unknown[] = [];
    adapter.attach(runtime);
    adapter.port.subscribe((difference) => received.push(difference));
    adapter.accept(runtime, {
      type: "workspace.baseline",
      sourceKey: "main",
      relativePath: "before.md",
      entryKind: "file",
      cursor: 1,
      repairCycle: 0,
    });
    adapter.accept(runtime, {
      type: "workspace.health",
      sourceKey: "main",
      health: "HEALTHY",
      reason: "initializing",
      cursor: 2,
      repairCycle: 0,
    });

    await adapter.port.requestRepair({
      sourceKey: "main",
      afterSequence: 4,
      reason: "source_bound",
    });
    expect(received).toHaveLength(2);
    expect(runtime.reportGap).not.toHaveBeenCalled();

    resourceEventSequence = 7;
    const firstRepair = adapter.port.requestRepair({
      sourceKey: "main",
      afterSequence: 5,
      reason: "sequence_gap",
    });
    const secondRepair = adapter.port.requestRepair({
      sourceKey: "main",
      afterSequence: 5,
      reason: "sequence_gap",
    });
    expect(runtime.reportGap).toHaveBeenCalledTimes(1);

    adapter.accept(runtime, {
      type: "workspace.health",
      sourceKey: "main",
      health: "RECONCILING",
      reason: "event-gap",
      cursor: 3,
      repairCycle: 0,
    });
    adapter.accept(runtime, {
      type: "workspace.baseline",
      sourceKey: "main",
      relativePath: "after.md",
      entryKind: "file",
      cursor: 4,
      repairCycle: 0,
    });
    // This event is newer than the source snapshot and must remain available
    // to Knowledge through ResourceEventBus replay rather than changing the
    // source baseline cursor.
    resourceEventSequence = 8;
    adapter.accept(runtime, {
      type: "workspace.health",
      sourceKey: "main",
      health: "HEALTHY",
      reason: "event-gap",
      cursor: 5,
      repairCycle: 0,
    });
    resolveGap();
    await Promise.all([firstRepair, secondRepair]);

    expect(received.at(-1)).toEqual({
      type: "shared-baseline-difference",
      sourceKey: "main",
      cursor: 7,
      coverage: "source",
      changes: [{ relativePath: "after.md", changeType: "upsert" }],
    });
    await expect(adapter.port.requestRepair({
      sourceKey: "mounted",
      afterSequence: 5,
      reason: "source_bound",
    })).rejects.toThrow(/repair request is invalid/i);
    expect(runtime.retryMain).not.toHaveBeenCalled();
  });

  it("uses the latest repair-start cursor for a stale catch-up baseline", async () => {
    let resourceEventSequence = 12;
    let resolveGap!: () => void;
    const gap = new Promise<WorkspaceSnapshot>((resolve) => {
      resolveGap = () => resolve(workspaceSnapshot());
    });
    const runtime = createKnowledgeBaselineRuntime({ reportGap: vi.fn(() => gap) });
    const adapter = new MainWorkspaceKnowledgeSharedBaselineAdapter({
      currentResourceEventSequence: () => resourceEventSequence,
    });
    const received: unknown[] = [];
    adapter.attach(runtime);
    adapter.port.subscribe((difference) => received.push(difference));

    const repair = adapter.port.requestRepair({
      sourceKey: "main",
      afterSequence: 5,
      reason: "catch_up_stale",
    });
    expect(runtime.reportGap).toHaveBeenCalledOnce();
    adapter.accept(runtime, {
      type: "workspace.health",
      sourceKey: "main",
      health: "RECONCILING",
      reason: "event-gap",
      cursor: 200,
      repairCycle: 0,
    });
    adapter.accept(runtime, {
      type: "workspace.baseline",
      sourceKey: "main",
      relativePath: "catch-up.md",
      entryKind: "file",
      cursor: 201,
      repairCycle: 0,
    });
    adapter.accept(runtime, {
      type: "workspace.health",
      sourceKey: "main",
      health: "HEALTHY",
      reason: "event-gap",
      cursor: 202,
      repairCycle: 0,
    });
    resolveGap();
    await repair;

    expect(received).toEqual([expect.objectContaining({
      cursor: 12,
      coverage: "source",
      changes: [{ relativePath: "catch-up.md", changeType: "upsert" }],
    })]);
  });

  it("fails closed instead of manufacturing a requested ResourceEventBus cursor", async () => {
    let resourceEventSequence = 4;
    const runtime = createKnowledgeBaselineRuntime();
    const adapter = new MainWorkspaceKnowledgeSharedBaselineAdapter({
      currentResourceEventSequence: () => resourceEventSequence,
    });
    adapter.attach(runtime);

    await expect(adapter.port.requestRepair({
      sourceKey: "main",
      afterSequence: 5,
      reason: "sequence_gap",
    })).rejects.toThrow(/cursor is stale/i);
    expect(runtime.reportGap).not.toHaveBeenCalled();

    resourceEventSequence = 5;
    await expect(adapter.port.requestRepair({
      sourceKey: "main",
      afterSequence: 5,
      reason: "catch_up_stale",
    })).rejects.toThrow(/shared baseline is unavailable/i);
    expect(runtime.reportGap).toHaveBeenCalledOnce();
  });

  it("requires a fresh HEALTHY source baseline after retrying a failed coordinator", async () => {
    let resourceEventSequence = 7;
    let completeRetry!: () => void;
    const retry = new Promise<WorkspaceSnapshot>((resolve) => {
      completeRetry = () => resolve(workspaceSnapshot());
    });
    const runtime = createKnowledgeBaselineRuntime({
      health: "FAILED",
      observing: false,
      retryMain: vi.fn(() => retry),
    });
    const adapter = new MainWorkspaceKnowledgeSharedBaselineAdapter({
      currentResourceEventSequence: () => resourceEventSequence,
    });
    const received: unknown[] = [];
    adapter.attach(runtime);
    adapter.port.subscribe((difference) => received.push(difference));

    const repair = adapter.port.requestRepair({
      sourceKey: "main",
      afterSequence: 7,
      reason: "event_hint_unresolvable",
    });
    expect(runtime.retryMain).toHaveBeenCalledOnce();
    adapter.accept(runtime, {
      type: "workspace.health",
      sourceKey: "main",
      health: "RECONCILING",
      reason: "retry",
      cursor: 90,
      repairCycle: 0,
    });
    adapter.accept(runtime, {
      type: "workspace.baseline",
      sourceKey: "main",
      relativePath: "recovered.md",
      entryKind: "file",
      cursor: 91,
      repairCycle: 0,
    });
    adapter.accept(runtime, {
      type: "workspace.health",
      sourceKey: "main",
      health: "HEALTHY",
      reason: "retry",
      cursor: 92,
      repairCycle: 0,
    });
    completeRetry();
    await repair;

    expect(received).toEqual([{
      type: "shared-baseline-difference",
      sourceKey: "main",
      cursor: 7,
      coverage: "source",
      changes: [{ relativePath: "recovered.md", changeType: "upsert" }],
    }]);
    expect(runtime.reportGap).not.toHaveBeenCalled();
  });

  it("keeps a source baseline cursor stable while a later ResourceEvent remains replayable", () => {
    const events = new ResourceEventBus({ emit: () => {} });
    events.changed({
      changeType: "created",
      resourceKey: "local_fs:/workspace/before.md",
      resource: { kind: "local-file", path: "/workspace/before.md" },
      source: "provider_watch",
      sessionPath: null,
    });
    const runtime = createKnowledgeBaselineRuntime();
    const adapter = new MainWorkspaceKnowledgeSharedBaselineAdapter({
      currentResourceEventSequence: () => events.latestSequence(),
    });
    const received: unknown[] = [];
    adapter.attach(runtime);
    adapter.port.subscribe((difference) => received.push(difference));
    adapter.accept(runtime, {
      type: "workspace.health",
      sourceKey: "main",
      health: "RECONCILING",
      reason: "initializing",
      cursor: 900,
      repairCycle: 0,
    });
    adapter.accept(runtime, {
      type: "workspace.baseline",
      sourceKey: "main",
      relativePath: "before.md",
      entryKind: "file",
      cursor: 901,
      repairCycle: 0,
    });

    events.changed({
      changeType: "modified",
      resourceKey: "local_fs:/workspace/later.md",
      resource: { kind: "local-file", path: "/workspace/later.md" },
      source: "provider_watch",
      sessionPath: null,
    });
    adapter.accept(runtime, {
      type: "workspace.health",
      sourceKey: "main",
      health: "HEALTHY",
      reason: "initializing",
      cursor: 902,
      repairCycle: 0,
    });

    expect(received).toEqual([expect.objectContaining({
      cursor: 1,
      coverage: "source",
      changes: [{ relativePath: "before.md", changeType: "upsert" }],
    })]);
    expect(events.since(1)).toMatchObject({
      stale: false,
      latestSequence: 2,
      events: [expect.objectContaining({ sequence: 2 })],
    });
  });

  it("drops a retired root while retaining consumers and emits a fresh zero-cursor baseline after restart", () => {
    let resourceEventSequence = 7;
    const firstRuntime = createKnowledgeBaselineRuntime();
    const secondRuntime = createKnowledgeBaselineRuntime();
    const adapter = new MainWorkspaceKnowledgeSharedBaselineAdapter({
      currentResourceEventSequence: () => resourceEventSequence,
    });
    const received: unknown[] = [];
    adapter.port.subscribe((difference) => received.push(difference));
    adapter.attach(firstRuntime);
    adapter.accept(firstRuntime, {
      type: "workspace.baseline",
      sourceKey: "main",
      relativePath: "old.md",
      entryKind: "file",
      cursor: 1,
      repairCycle: 0,
    });
    adapter.accept(firstRuntime, {
      type: "workspace.health",
      sourceKey: "main",
      health: "HEALTHY",
      reason: "initializing",
      cursor: 1,
      repairCycle: 0,
    });
    adapter.detach(firstRuntime);
    adapter.accept(firstRuntime, {
      type: "workspace.changed",
      sourceKey: "main",
      relativePath: "stale.md",
      changeType: "created",
      cursor: 2,
      repairCycle: 0,
    });

    resourceEventSequence = 0;
    adapter.attach(secondRuntime);
    adapter.accept(secondRuntime, {
      type: "workspace.baseline",
      sourceKey: "main",
      relativePath: "next.md",
      entryKind: "file",
      cursor: 88,
      repairCycle: 0,
    });
    adapter.accept(secondRuntime, {
      type: "workspace.health",
      sourceKey: "main",
      health: "HEALTHY",
      reason: "initializing",
      cursor: 89,
      repairCycle: 0,
    });

    expect(received).toEqual([
      expect.objectContaining({ coverage: "source", cursor: 7, changes: [{ relativePath: "old.md", changeType: "upsert" }] }),
      expect.objectContaining({ coverage: "source", cursor: 0, changes: [{ relativePath: "next.md", changeType: "upsert" }] }),
    ]);
  });
});

describe("production workspace health composition", () => {
  it("returns only sanitized aggregate lifecycle proof", async () => {
    const app = new Hono();
    app.route("/api", createProductionWorkspaceHealthRoute({
      getProductionWorkspaceHealth: () => ({
        state: "HEALTHY",
        overlap: 0,
        legacy: { watchers: 0, mutations: 0, baselines: 0, root: "/private/legacy" },
        coordinator: {
          watchers: 1,
          mutations: 0,
          baselines: 1,
          workspaceId: "workspace-secret",
          root: "/private/main",
        },
      }),
    }));

    const response = await app.request("http://local.test/api/workspace/health");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      state: "HEALTHY",
      overlap: 0,
      legacy: { watchers: 0, mutations: 0, baselines: 0 },
      coordinator: { watchers: 1, mutations: 0, baselines: 1 },
    });
    expect(JSON.stringify(body)).not.toMatch(/private|secret|workspaceId|root/i);
  });

  it("fails closed when health proof throws or contains unproven counts", async () => {
    const engines = [
      {
        getProductionWorkspaceHealth: () => {
          throw new Error("private root inspection failed");
        },
      },
      {
        getProductionWorkspaceHealth: () => ({
          state: "HEALTHY",
          overlap: 0,
          legacy: { watchers: 0, mutations: 0, baselines: 0 },
          coordinator: { watchers: -1, mutations: 0, baselines: 1, root: "/private/main" },
        }),
      },
    ];

    for (const engine of engines) {
      const app = new Hono();
      app.route("/api", createProductionWorkspaceHealthRoute(engine));

      const response = await app.request("http://local.test/api/workspace/health");
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({
        state: "FAILED",
        overlap: null,
        legacy: { watchers: null, mutations: null, baselines: null },
        coordinator: { watchers: null, mutations: null, baselines: null },
      });
      expect(JSON.stringify(body)).not.toMatch(/private|root/i);
    }
  });
});

describe("HanaEngine main resource watch partition", () => {
  function createWatchPartitionFixture() {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-main-resource-watch-"));
    const mainRoot = path.join(workspaceRoot, "main");
    const nextMainRoot = path.join(workspaceRoot, "next-main");
    const mountRoot = path.join(workspaceRoot, "mount");
    const previewRoot = path.join(workspaceRoot, "preview");
    fs.mkdirSync(mainRoot);
    fs.mkdirSync(nextMainRoot);
    fs.mkdirSync(mountRoot);
    fs.mkdirSync(previewRoot);
    const mainFile = path.join(mainRoot, "notes.md");
    const nextMainFile = path.join(nextMainRoot, "notes.md");
    const previewFile = path.join(previewRoot, "preview.md");
    fs.writeFileSync(mainFile, "main");
    fs.writeFileSync(nextMainFile, "next main");
    fs.writeFileSync(previewFile, "preview");

    const physicalSubscriptions = new Map<string, unknown>();
    const physicalEntries = new Map<string, unknown>();
    let nextSubscription = 0;
    const registry = {
      entries: physicalEntries,
      retain: vi.fn((resource) => {
        const key = JSON.stringify(resource);
        physicalEntries.set(key, resource);
        return () => physicalEntries.delete(key);
      }),
      subscribe: vi.fn((input) => {
        const subscriptionId = `physical-${++nextSubscription}`;
        physicalSubscriptions.set(subscriptionId, input);
        return {
          subscriptionId,
          resourceKeys: input.resources.map((resource) => String(resource.path || resource.mountId)),
        };
      }),
      unsubscribe: vi.fn((subscriptionId) => physicalSubscriptions.delete(subscriptionId)),
      diagnostics: () => ({ subscriptions: physicalSubscriptions.size, watches: [...physicalEntries.values()] }),
    };
    const engine = Object.create(HanaEngine.prototype);
    engine._mainWorkspaceCanonicalRoot = fs.realpathSync(mainRoot);
    engine._mainWorkspaceRuntime = {
      snapshot: () => ({ observing: true, health: "HEALTHY" }),
    };
    engine._resourceWatchRegistry = registry;
    engine._resourceWatchSubscriptions = new Map();
    engine._logicalMainResourceWatchRefs = new Map();
    engine.getResourceIO = () => ({
      resolveWatchTarget: (resource) => {
        if (resource.kind === "mount") {
          return {
            ref: resource,
            filePath: mountRoot,
            resourceKey: `mount:${resource.mountId}:${resource.path}`,
          };
        }
        const filePath = fs.realpathSync(resource.path);
        return {
          ref: { kind: "local-file", path: filePath },
          filePath,
          resourceKey: `local_fs:${filePath}`,
        };
      },
    });
    return {
      engine,
      mainRoot,
      mainFile,
      nextMainRoot,
      nextMainFile,
      mountRoot,
      previewFile,
      registry,
    };
  }

  it("keeps active-main subscriptions logical and delivers main changes through the shared event bus", () => {
    const { engine, mainRoot, mainFile, registry } = createWatchPartitionFixture();
    const events: unknown[] = [];
    const eventBus = new ResourceEventBus({ emit: (event) => events.push(event) });
    engine._resourceEvents = () => eventBus;

    const subscription = engine.subscribeResourceWatch({
      purpose: "knowledge-source-watch",
      resources: [{ kind: "local-file", path: mainFile }],
    });

    expect(registry.subscribe).not.toHaveBeenCalled();
    expect([...engine._logicalMainResourceWatchRefs.values()]).toEqual([1]);

    bridgeProductionWorkspaceObservation({
      rootPath: mainRoot,
      observation: {
        type: "workspace.changed",
        sourceKey: "main",
        relativePath: "notes.md",
        changeType: "modified",
        cursor: 0,
        repairCycle: 0,
      },
      resourceEvents: eventBus,
    });
    expect(events).toEqual([
      expect.objectContaining({
        type: "resource.changed",
        resourceKey: `local_fs:${mainFile}`,
        source: "provider_watch",
      }),
    ]);

    expect(engine.unsubscribeResourceWatch(subscription.subscriptionId)).toBe(true);
    expect(engine._logicalMainResourceWatchRefs.size).toBe(0);
  });

  it("retains disjoint mounts and previews through the physical registry", () => {
    const { engine, previewFile, registry } = createWatchPartitionFixture();
    const mountRelease = engine.retainResourceWatch({ kind: "mount", mountId: "docs", path: "notes" });
    const previewRelease = engine.retainResourceWatch({ kind: "local-file", path: previewFile });

    expect(registry.retain).toHaveBeenCalledTimes(2);
    expect(engine._logicalMainResourceWatchRefs.size).toBe(0);
    expect(registry.entries.size).toBe(2);

    mountRelease();
    previewRelease();
    expect(registry.entries.size).toBe(0);
  });

  it.each([
    { label: "degraded", snapshot: { observing: false, health: "DEGRADED" } },
    { label: "reconciling", snapshot: { observing: true, health: "RECONCILING" } },
    { label: "failed", snapshot: { observing: false, health: "FAILED" } },
    { label: "start failure", snapshot: null },
  ])("keeps claimed main watches logical while the coordinator is $label", ({ snapshot }) => {
    const { engine, mainFile, registry } = createWatchPartitionFixture();
    engine._mainWorkspaceRuntime = snapshot ? { snapshot: () => snapshot } : null;

    const releases = [
      engine.retainResourceWatch({ kind: "local-file", path: mainFile }),
      engine.retainResourceWatch({ kind: "local-file", path: mainFile }),
    ];

    expect(registry.retain).not.toHaveBeenCalled();
    expect(engine._logicalMainResourceWatchRefs.size).toBe(1);
    releases.forEach((release) => release());
    expect(engine._logicalMainResourceWatchRefs.size).toBe(0);
  });

  it("balances mixed main, mount, and preview subscriptions on release", () => {
    const { engine, mainFile, previewFile, registry } = createWatchPartitionFixture();
    const subscription = engine.subscribeResourceWatch({
      purpose: "mixed",
      resources: [
        { kind: "local-file", path: mainFile },
        { kind: "mount", mountId: "docs", path: "notes" },
        { kind: "local-file", path: previewFile },
      ],
    });

    expect(registry.subscribe).toHaveBeenCalledWith({
      purpose: "mixed",
      resources: [
        { kind: "mount", mountId: "docs", path: "notes" },
        { kind: "local-file", path: previewFile },
      ],
    });
    expect([...engine._logicalMainResourceWatchRefs.values()]).toEqual([1]);

    expect(engine.unsubscribeResourceWatch(subscription.subscriptionId)).toBe(true);
    expect(registry.unsubscribe).toHaveBeenCalledWith("physical-1");
    expect(engine._logicalMainResourceWatchRefs.size).toBe(0);
    expect(engine.unsubscribeResourceWatch(subscription.subscriptionId)).toBe(false);
  });

  it("repartitions retained and subscribed resources after a main root switch", () => {
    const {
      engine,
      mainFile,
      nextMainRoot,
      nextMainFile,
      previewFile,
      registry,
    } = createWatchPartitionFixture();
    const retainedNextMain = engine.retainResourceWatch({ kind: "local-file", path: nextMainFile });
    const subscription = engine.subscribeResourceWatch({
      purpose: "switch",
      resources: [
        { kind: "local-file", path: mainFile },
        { kind: "local-file", path: nextMainFile },
        { kind: "local-file", path: previewFile },
      ],
    });

    expect(registry.retain).toHaveBeenCalledWith({ kind: "local-file", path: nextMainFile });
    expect(registry.subscribe).toHaveBeenLastCalledWith({
      purpose: "switch",
      resources: [
        { kind: "local-file", path: nextMainFile },
        { kind: "local-file", path: previewFile },
      ],
    });

    engine._mainWorkspaceCanonicalRoot = fs.realpathSync(nextMainRoot);
    engine._repartitionActiveResourceWatches();

    expect(registry.unsubscribe).toHaveBeenCalledWith("physical-1");
    expect(registry.subscribe).toHaveBeenLastCalledWith({
      purpose: "switch",
      resources: [
        { kind: "local-file", path: mainFile },
        { kind: "local-file", path: previewFile },
      ],
    });
    expect([...engine._logicalMainResourceWatchRefs.values()]).toEqual([2]);

    retainedNextMain();
    expect([...engine._logicalMainResourceWatchRefs.values()]).toEqual([1]);
    expect(engine.unsubscribeResourceWatch(subscription.subscriptionId)).toBe(true);
    expect(engine._logicalMainResourceWatchRefs.size).toBe(0);
  });
});

async function searchPaths(engine: HanaEngine, query: string): Promise<string[]> {
  const coordinator = engine.getKnowledgeIndexCoordinator();
  if (!coordinator) return [];
  const result = await searchKnowledgeIndex(coordinator, {
    query,
    scope: { kind: "tag", sourceKey: "main" },
  }, {
    sources: [{ sourceKey: "main", displayName: "Main", availability: "available" }],
  });
  const group = result.groups[0];
  if (!group || group.state !== "ready") return [];
  return group.items.map((item) => item.address.relativePath);
}
