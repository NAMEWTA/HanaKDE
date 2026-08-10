import path from "path";
import fs from "fs";
import os from "os";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HanaEngine,
  MainWorkspaceKnowledgeSharedBaselineAdapter,
} from "../core/engine.ts";
import { bridgeProductionWorkspaceObservation } from "../core/workspace-runtime/production-workspace-runtime.ts";
import { ResourceEventBus } from "../lib/resource-io/resource-event-bus.ts";
import { createProductionWorkspaceHealthRoute } from "../server/composition/production-workspace-health.ts";

let workspaceRoot: string | null = null;

afterEach(() => {
  if (workspaceRoot) fs.rmSync(workspaceRoot, { recursive: true, force: true });
  workspaceRoot = null;
  vi.restoreAllMocks();
});

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
    const events = { latestSequence: () => 0, changed: vi.fn(), deleted: vi.fn() };

    bridgeProductionWorkspaceObservation({
      rootPath: "/workspace",
      observation: {
        type: "workspace.changed",
        sourceKey: "main",
        relativePath: "notes/deleted.md",
        changeType: "deleted",
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
    const events = { latestSequence: () => 0, changed: vi.fn(), deleted: vi.fn() };

    bridgeProductionWorkspaceObservation({
      rootPath: workspaceRoot,
      observation: {
        type: "workspace.changed",
        sourceKey: "main",
        relativePath: "notes",
        changeType: "created",
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
    const events = { changed: vi.fn(), deleted: vi.fn() };
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
    engine._resourceEvents = () => ({ changed: vi.fn(), deleted: vi.fn() });
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
    engine._resourceEvents = () => ({ changed: vi.fn(), deleted: vi.fn() });
    engine.getResourceIO = () => ({
      getRootIdentity: async (root) => ({
        providerId: "local_fs",
        identityNamespace: "local_fs",
        opaqueRootId: `root-proof:${root.path}`,
        scopeToken: `scope-proof:${root.path}`,
        caseMode: "sensitive",
      }),
      resolveWatchTarget: (root) => ({ ref: root, filePath: root.path, isDirectory: true }),
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
    const order: string[] = [];
    const activeAgent = { config: { desk: { home_folder: rootA } } };
    engine._agentMgr = { activeAgentId: "active", agent: activeAgent };
    engine.getHomeCwd = vi.fn(() => homeRoot);
    engine._mainWorkspaceRuntime = null;
    engine._mainWorkspaceCutover = null;
    engine._mainWorkspaceRoot = null;
    engine._resourceWatchRegistry = { entries: new Map(), release: vi.fn() };
    engine._resourceEvents = () => ({ changed: vi.fn(), deleted: vi.fn() });
    engine.getResourceIO = () => ({
      getRootIdentity: async (root) => ({
        providerId: "local_fs",
        identityNamespace: "local_fs",
        opaqueRootId: `root-proof:${root.path}`,
        scopeToken: `scope-proof:${root.path}`,
        caseMode: "sensitive",
      }),
      resolveWatchTarget: (root) => ({ ref: root, filePath: root.path, isDirectory: true }),
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
});

describe("HanaEngine main Knowledge shared baseline adapter", () => {
  it("publishes a source baseline with the canonical ResourceEventBus cursor only", () => {
    let resourceEventSequence = 41;
    const runtime = {
      snapshot: vi.fn(() => ({ health: "HEALTHY", observing: true })),
      reportGap: vi.fn(async () => undefined),
      retryMain: vi.fn(async () => undefined),
    };
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
    });
    adapter.accept(runtime, {
      type: "workspace.baseline",
      sourceKey: "main",
      relativePath: "notes",
      entryKind: "directory",
      cursor: 901,
    });
    adapter.accept(runtime, {
      type: "workspace.health",
      sourceKey: "main",
      health: "HEALTHY",
      reason: "initializing",
      cursor: 902,
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
    });

    expect(received).toHaveLength(1);
    expect(JSON.stringify(received)).not.toMatch(/workspace|absolutePath|scopeToken|root/i);
    expect(runtime.reportGap).not.toHaveBeenCalled();
  });

  it("reuses a completed baseline only for source_bound and repairs a 5-to-7 gap without swallowing event 8", async () => {
    let resourceEventSequence = 4;
    let resolveGap!: () => void;
    const gap = new Promise<void>((resolve) => {
      resolveGap = resolve;
    });
    const runtime = {
      snapshot: vi.fn(() => ({ health: "HEALTHY", observing: true })),
      reportGap: vi.fn(() => gap),
      retryMain: vi.fn(async () => undefined),
    };
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
    });
    adapter.accept(runtime, {
      type: "workspace.health",
      sourceKey: "main",
      health: "HEALTHY",
      reason: "initializing",
      cursor: 2,
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
    });
    adapter.accept(runtime, {
      type: "workspace.baseline",
      sourceKey: "main",
      relativePath: "after.md",
      entryKind: "file",
      cursor: 4,
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
    const gap = new Promise<void>((resolve) => {
      resolveGap = resolve;
    });
    const runtime = {
      snapshot: vi.fn(() => ({ health: "HEALTHY", observing: true })),
      reportGap: vi.fn(() => gap),
      retryMain: vi.fn(async () => undefined),
    };
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
    });
    adapter.accept(runtime, {
      type: "workspace.baseline",
      sourceKey: "main",
      relativePath: "catch-up.md",
      entryKind: "file",
      cursor: 201,
    });
    adapter.accept(runtime, {
      type: "workspace.health",
      sourceKey: "main",
      health: "HEALTHY",
      reason: "event-gap",
      cursor: 202,
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
    const runtime = {
      snapshot: vi.fn(() => ({ health: "HEALTHY", observing: true })),
      reportGap: vi.fn(async () => undefined),
      retryMain: vi.fn(async () => undefined),
    };
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
    const retry = new Promise<void>((resolve) => {
      completeRetry = resolve;
    });
    const runtime = {
      snapshot: vi.fn(() => ({ health: "FAILED", observing: false })),
      reportGap: vi.fn(async () => undefined),
      retryMain: vi.fn(() => retry),
    };
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
    });
    adapter.accept(runtime, {
      type: "workspace.baseline",
      sourceKey: "main",
      relativePath: "recovered.md",
      entryKind: "file",
      cursor: 91,
    });
    adapter.accept(runtime, {
      type: "workspace.health",
      sourceKey: "main",
      health: "HEALTHY",
      reason: "retry",
      cursor: 92,
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
    const runtime = {
      snapshot: vi.fn(() => ({ health: "HEALTHY", observing: true })),
      reportGap: vi.fn(async () => undefined),
      retryMain: vi.fn(async () => undefined),
    };
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
    });
    adapter.accept(runtime, {
      type: "workspace.baseline",
      sourceKey: "main",
      relativePath: "before.md",
      entryKind: "file",
      cursor: 901,
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
    const firstRuntime = {
      snapshot: vi.fn(() => ({ health: "HEALTHY", observing: true })),
      reportGap: vi.fn(async () => undefined),
      retryMain: vi.fn(async () => undefined),
    };
    const secondRuntime = {
      snapshot: vi.fn(() => ({ health: "HEALTHY", observing: true })),
      reportGap: vi.fn(async () => undefined),
      retryMain: vi.fn(async () => undefined),
    };
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
    });
    adapter.accept(firstRuntime, {
      type: "workspace.health",
      sourceKey: "main",
      health: "HEALTHY",
      reason: "initializing",
      cursor: 1,
    });
    adapter.detach(firstRuntime);
    adapter.accept(firstRuntime, {
      type: "workspace.changed",
      sourceKey: "main",
      relativePath: "stale.md",
      changeType: "created",
      cursor: 2,
    });

    resourceEventSequence = 0;
    adapter.attach(secondRuntime);
    adapter.accept(secondRuntime, {
      type: "workspace.baseline",
      sourceKey: "main",
      relativePath: "next.md",
      entryKind: "file",
      cursor: 88,
    });
    adapter.accept(secondRuntime, {
      type: "workspace.health",
      sourceKey: "main",
      health: "HEALTHY",
      reason: "initializing",
      cursor: 89,
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
