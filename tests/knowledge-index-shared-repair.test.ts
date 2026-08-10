import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KnowledgeIndexEventCoordinator,
  type KnowledgeIndexEventSource,
  type KnowledgeIndexSharedBaselineDifference,
} from "../core/knowledge-workspace/knowledge-index-event-coordinator.ts";
import {
  CoordinatedKnowledgeIndexRebuild,
  KnowledgeIndexCoordinator,
} from "../core/knowledge-workspace/knowledge-index-coordinator.ts";
import {
  KnowledgeIndexRuntime,
} from "../core/knowledge-workspace/knowledge-index-runtime.ts";
import { SourceRegistry } from "../core/knowledge-workspace/source-registry.ts";
import {
  foldSearchText,
  type KnowledgeIndexResourceDocument,
} from "../lib/knowledge-workspace/knowledge-index-store.ts";
import { LocalFsProvider } from "../lib/resource-io/providers/local-fs-provider.ts";
import { ResourceEventBus } from "../lib/resource-io/resource-event-bus.ts";
import { ResourceIO } from "../lib/resource-io/resource-io.ts";
import { resourceKeyForRef } from "../lib/resource-io/resource-refs.ts";
import { ResourceWatchRegistry } from "../lib/resource-io/resource-watch-registry.ts";
import type { ProviderRootIdentity } from "../lib/resource-io/types.ts";

describe("knowledge shared baseline repair", () => {
  const cleanup = new Set<string>();

  afterEach(() => {
    for (const root of cleanup) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    cleanup.clear();
  });

  it("publishes an atomic initial generation from a supplied shared source difference", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-shared-repair-"));
    cleanup.add(root);
    const documents = new Map<string, KnowledgeIndexResourceDocument>([
      ["Notes/one.md", document("Notes/one.md", "one")],
    ]);
    const identity = providerIdentity("main-root", "main-scope");
    const index = new KnowledgeIndexCoordinator({
      hanakoHome: root,
      workspaceIdentity: providerIdentity("workspace-root", "workspace-scope"),
      sourceRegistry: {
        rootIdentity() {
          return identity;
        },
        async revalidate() {},
      },
      extractorContractVersion: "knowledge-index-v1",
      hostId: "shared-repair-test",
      pid: 43_001,
    });
    const source: KnowledgeIndexEventSource = {
      eventPaths: () => [],
      reread: vi.fn(async (relativePath: string) =>
        documents.get(relativePath) ?? null
      ),
    };
    const events = new KnowledgeIndexEventCoordinator({
      indexCoordinator: index,
      sourceFor: () => source,
      createId: (() => {
        let next = 0;
        return () => `shared-${++next}`;
      })(),
      yieldNow: async () => {},
    });

    await (events as unknown as {
      acceptSharedBaseline(input: unknown): Promise<void>;
    }).acceptSharedBaseline({
      type: "shared-baseline-difference",
      sourceKey: "main",
      cursor: 4,
      coverage: "source",
      changes: [{ relativePath: "Notes/one.md", changeType: "upsert" }],
    });

    expect(index.health("main")).toMatchObject({ state: "ready", sequence: 4 });
    const lease = index.acquireQueryLease("main");
    expect(lease.inspect()).toMatchObject({ resourceCount: 1 });
    lease.release();
  });

  it("replays a cached shared baseline after binding without retaining a private watcher", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-shared-runtime-"));
    cleanup.add(root);
    const workspace = path.join(root, "workspace");
    const hanakoHome = path.join(root, "hana");
    fs.mkdirSync(workspace, { recursive: true });
    fs.mkdirSync(hanakoHome, { recursive: true });
    fs.writeFileSync(path.join(workspace, "Initial.md"), "# Initial\n\nalpha", "utf8");
    const eventBus = new ResourceEventBus({ emit: () => undefined });
    const resourceIO = new ResourceIO({
      providers: { local_fs: new LocalFsProvider({ cwd: root }) },
      eventBus,
    });
    const registry = await SourceRegistry.create({
      mainRoot: { kind: "local-file", path: workspace },
      resourceIO,
      hanakoHome,
    });
    const requestRepair = vi.fn();
    const retainWatch = vi.fn(() => vi.fn());
    let receiveSharedBaseline: ((input: unknown) => void) | undefined;
    const runtime = new (KnowledgeIndexRuntime as unknown as {
      new(options: unknown): KnowledgeIndexRuntime;
    })({
      hanakoHome,
      hostId: "shared-runtime-test",
      resourceIO,
      resourceEvents: eventBus,
      retainWatch,
      sharedBaseline: {
        subscribe(consumer: (input: unknown) => void) {
          receiveSharedBaseline = consumer;
          consumer({
            type: "shared-baseline-difference",
            sourceKey: "main",
            cursor: 0,
            coverage: "source",
            changes: [{ relativePath: "Initial.md", changeType: "upsert" }],
          });
          return () => undefined;
        },
        requestRepair,
      },
    });

    await runtime.bindWorkspace(registry);

    expect(receiveSharedBaseline).toEqual(expect.any(Function));
    expect(requestRepair).not.toHaveBeenCalled();
    expect(retainWatch).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(runtime.coordinator()?.health("main")).toMatchObject({
        state: "ready",
        sequence: 0,
      });
    });
    const lease = runtime.coordinator()?.acquireQueryLease("main");
    expect(lease?.inspect()).toMatchObject({ resourceCount: 1 });
    lease?.release();
    await runtime.dispose();
  });

  it("fails closed when main has no shared baseline owner", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-shared-missing-port-"));
    cleanup.add(root);
    const workspace = path.join(root, "workspace");
    const hanakoHome = path.join(root, "hana");
    fs.mkdirSync(workspace, { recursive: true });
    fs.mkdirSync(hanakoHome, { recursive: true });
    const eventBus = new ResourceEventBus({ emit: () => undefined });
    const resourceIO = new ResourceIO({
      providers: { local_fs: new LocalFsProvider({ cwd: root }) },
      eventBus,
    });
    const list = vi.spyOn(resourceIO, "list");
    const registry = await SourceRegistry.create({
      mainRoot: { kind: "local-file", path: workspace },
      resourceIO,
      hanakoHome,
    });
    const retainWatch = vi.fn(() => vi.fn());
    const runtime = new KnowledgeIndexRuntime({
      hanakoHome,
      hostId: "shared-missing-port-test",
      resourceIO,
      resourceEvents: eventBus,
      retainWatch,
    });

    await runtime.bindWorkspace(registry);

    expect(runtime.coordinator()?.health("main")).toMatchObject({
      state: "unavailable",
    });
    expect(list).not.toHaveBeenCalled();
    await expect(runtime.rebuild("main")).rejects.toMatchObject({
      code: "knowledge_shared_baseline_unavailable",
    });
    expect(runtime.coordinator()?.health("main")).toMatchObject({
      state: "unavailable",
    });
    expect(retainWatch).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    await runtime.dispose();
  });

  it("persists empty shared-difference cursors and empty rereads across restart", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-shared-empty-"));
    cleanup.add(root);
    const identity = providerIdentity("main-root", "main-scope");
    const createCoordinator = () => new KnowledgeIndexCoordinator({
      hanakoHome: root,
      workspaceIdentity: providerIdentity("workspace-root", "workspace-scope"),
      sourceRegistry: {
        rootIdentity() {
          return identity;
        },
        async revalidate() {},
      },
      extractorContractVersion: "knowledge-index-v1",
      hostId: "shared-empty-test",
      pid: 43_002,
    });
    const index = createCoordinator();
    const source: KnowledgeIndexEventSource = {
      eventPaths: () => [],
      reread: vi.fn(async () => null),
    };
    const events = new KnowledgeIndexEventCoordinator({
      indexCoordinator: index,
      sourceFor: () => source,
      createId: (() => {
        let next = 0;
        return () => `empty-${++next}`;
      })(),
    });

    await events.acceptSharedBaseline({
      type: "shared-baseline-difference",
      sourceKey: "main",
      cursor: 0,
      coverage: "source",
      changes: [],
    });
    await events.acceptSharedBaseline({
      type: "shared-baseline-difference",
      sourceKey: "main",
      cursor: 7,
      coverage: "resources",
      changes: [],
    });
    await events.acceptSharedBaseline({
      type: "shared-baseline-difference",
      sourceKey: "main",
      cursor: 8,
      coverage: "resources",
      changes: [{ relativePath: "missing.txt", changeType: "upsert" }],
    });

    expect(index.health("main")).toMatchObject({ state: "ready", sequence: 8 });
    expect(createCoordinator().health("main")).toMatchObject({
      state: "ready",
      sequence: 8,
    });
  });

  it("rebuilds from a fresh bus cursor after process restart before applying later events", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-shared-bus-restart-"));
    cleanup.add(root);
    const identity = providerIdentity("main-root", "main-scope");
    const documents = new Map<string, KnowledgeIndexResourceDocument>([
      ["Notes/one.md", document("Notes/one.md", "old")],
    ]);
    const createCoordinator = () => new KnowledgeIndexCoordinator({
      hanakoHome: root,
      workspaceIdentity: providerIdentity("workspace-root", "workspace-scope"),
      sourceRegistry: {
        rootIdentity() {
          return identity;
        },
        async revalidate() {},
      },
      extractorContractVersion: "knowledge-index-v1",
      hostId: "shared-bus-restart-test",
      pid: 43_004,
    });
    const source: KnowledgeIndexEventSource = {
      eventPaths: () => ["Notes/one.md"],
      reread: vi.fn(async (relativePath: string) =>
        documents.get(relativePath) ?? null
      ),
    };
    const firstIndex = createCoordinator();
    const firstEvents = new KnowledgeIndexEventCoordinator({
      indexCoordinator: firstIndex,
      sourceFor: () => source,
      createId: (() => {
        let next = 0;
        return () => `first-${++next}`;
      })(),
    });
    await firstEvents.acceptSharedBaseline({
      type: "shared-baseline-difference",
      sourceKey: "main",
      cursor: 8,
      coverage: "source",
      changes: [{ relativePath: "Notes/one.md", changeType: "upsert" }],
    });
    const oldGeneration = readyGeneration(firstIndex.health("main"));

    const restartedIndex = createCoordinator();
    const restartedEvents = new KnowledgeIndexEventCoordinator({
      indexCoordinator: restartedIndex,
      sourceFor: () => source,
      initialSequenceFor: () => 0,
      createId: (() => {
        let next = 0;
        return () => `restart-${++next}`;
      })(),
    });
    await restartedEvents.acceptSharedBaseline({
      type: "shared-baseline-difference",
      sourceKey: "main",
      cursor: 0,
      coverage: "source",
      changes: [{ relativePath: "Notes/one.md", changeType: "upsert" }],
    });
    expect(restartedIndex.health("main")).toMatchObject({
      state: "ready",
      sequence: 0,
    });
    expect(readyGeneration(restartedIndex.health("main"))).not.toBe(oldGeneration);

    documents.set("Notes/one.md", document("Notes/one.md", "new"));
    restartedEvents.accept("main", {
      type: "resource.changed",
      changeType: "modified",
      resourceKey: "mount:main:Notes/one.md",
      resource: {
        kind: "mount",
        mountId: "main",
        path: "Notes/one.md",
        isDirectory: false,
      },
      version: { sequence: 1 },
      source: "provider_watch",
      sequence: 1,
      occurredAt: new Date(1).toISOString(),
    });
    await restartedEvents.flush("main");

    expect(restartedIndex.health("main")).toMatchObject({
      state: "ready",
      sequence: 1,
    });
  });

  it("publishes a large shared source difference in bounded document batches", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-shared-batch-"));
    cleanup.add(root);
    const documents = new Map<string, KnowledgeIndexResourceDocument>();
    for (let index = 0; index < 257; index += 1) {
      const relativePath = `Notes/${String(index).padStart(3, "0")}.md`;
      documents.set(relativePath, document(relativePath, `body ${index}`));
    }
    const identity = providerIdentity("main-root", "main-scope");
    const coordinator = new KnowledgeIndexCoordinator({
      hanakoHome: root,
      workspaceIdentity: providerIdentity("workspace-root", "workspace-scope"),
      sourceRegistry: {
        rootIdentity() {
          return identity;
        },
        async revalidate() {},
      },
      extractorContractVersion: "knowledge-index-v1",
      hostId: "shared-batch-test",
      pid: 43_003,
    });
    const yieldNow = vi.fn(async () => {});
    const events = new KnowledgeIndexEventCoordinator({
      indexCoordinator: coordinator,
      sourceFor: () => ({
        eventPaths: () => [],
        reread: async (relativePath) => documents.get(relativePath) ?? null,
      }),
      createId: (() => {
        let next = 0;
        return () => `batch-${++next}`;
      })(),
      yieldNow,
    });
    const replaceResources = vi.spyOn(
      CoordinatedKnowledgeIndexRebuild.prototype,
      "replaceResources",
    );
    let batchSizes: number[] = [];
    try {
      await events.acceptSharedBaseline({
        type: "shared-baseline-difference",
        sourceKey: "main",
        cursor: 9,
        coverage: "source",
        changes: [...documents.keys()].map((relativePath) => ({
          relativePath,
          changeType: "upsert" as const,
        })),
      });
    } finally {
      batchSizes = replaceResources.mock.calls.map(([batch]) => batch.length);
      replaceResources.mockRestore();
    }

    expect(batchSizes.length).toBeGreaterThan(1);
    expect(batchSizes.every((size) => size <= 8)).toBe(true);
    expect(yieldNow).toHaveBeenCalled();
    expect(coordinator.health("main")).toMatchObject({ sequence: 9 });
  });

  it("keeps main shared-only while a mounted source uses the canonical watch registry", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-shared-mount-"));
    cleanup.add(root);
    const main = path.join(root, "main");
    const research = path.join(root, "research");
    const hanakoHome = path.join(root, "hana");
    fs.mkdirSync(main, { recursive: true });
    fs.mkdirSync(research, { recursive: true });
    fs.mkdirSync(hanakoHome, { recursive: true });
    fs.writeFileSync(path.join(main, "Main.md"), "# Main\nshared", "utf8");
    fs.writeFileSync(path.join(research, "Research.md"), "# Research\ninitial", "utf8");
    const eventBus = new ResourceEventBus({ emit: () => undefined });
    const resourceIO = new ResourceIO({
      providers: { local_fs: new LocalFsProvider({ cwd: root }) },
      eventBus,
    });
    const registry = await SourceRegistry.create({
      mainRoot: { kind: "local-file", path: main },
      resourceIO,
      hanakoHome,
    });
    await registry.register({
      sourceKey: "research",
      displayName: "Research",
      root: { kind: "local-file", path: research },
    });
    const list = vi.spyOn(resourceIO, "list");
    const watchHandlers = new Map<string, (changedPath?: unknown) => void>();
    const watchRegistry = new ResourceWatchRegistry({
      eventBus,
      debounceMs: 0,
      resolveWatchTarget: (resource) => resourceIO.resolveWatchTarget(resource),
      watchPath: (targetPath, handler) => {
        watchHandlers.set(path.resolve(targetPath), handler as (changedPath?: unknown) => void);
        return { close: () => watchHandlers.delete(path.resolve(targetPath)) };
      },
    });
    const requestRepair = vi.fn();
    let receiveSharedBaseline: ((input: KnowledgeIndexSharedBaselineDifference) => void) | undefined;
    const runtime = new KnowledgeIndexRuntime({
      hanakoHome,
      hostId: "shared-mount-test",
      resourceIO,
      resourceEvents: eventBus,
      retainWatch: (resource) => watchRegistry.retain(resource),
      sharedBaseline: {
        subscribe(consumer) {
          receiveSharedBaseline = consumer;
          return () => undefined;
        },
        requestRepair,
      },
    });

    await runtime.bindWorkspace(registry);
    if (!receiveSharedBaseline) throw new Error("shared baseline subscriber was not retained");
    receiveSharedBaseline({
      type: "shared-baseline-difference",
      sourceKey: "main",
      cursor: 0,
      coverage: "source",
      changes: [{ relativePath: "Main.md", changeType: "upsert" }],
    });
    await vi.waitFor(() => {
      expect(runtime.coordinator()?.health("main")).toMatchObject({ state: "ready" });
      expect(runtime.coordinator()?.health("research")).toMatchObject({ state: "ready" });
    });

    expect(requestRepair).toHaveBeenCalledWith(expect.objectContaining({
      sourceKey: "main",
      reason: "source_bound",
    }));
    expect(watchRegistry.diagnostics().watches).toHaveLength(1);
    expect(list.mock.calls.some(([resource]) => {
      const listedResource = resource as { kind?: unknown; path?: unknown };
      return listedResource.kind === "local-file"
        && typeof listedResource.path === "string"
        && path.resolve(listedResource.path) === main;
    })).toBe(false);

    fs.writeFileSync(path.join(research, "Research.md"), "# Research\nexternal", "utf8");
    const researchWatch = [...watchHandlers.values()][0];
    if (!researchWatch) throw new Error("research watch was not retained");
    researchWatch("Research.md");
    await vi.waitFor(() => {
      expect(runtime.coordinator()?.health("research")).toMatchObject({
        state: "ready",
        sequence: 1,
      });
    });
    await runtime.dispose();
  });

  it("keeps a mounted source unavailable without a canonical watch lease", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-shared-mount-no-lease-"));
    cleanup.add(root);
    const main = path.join(root, "main");
    const research = path.join(root, "research");
    const hanakoHome = path.join(root, "hana");
    fs.mkdirSync(main, { recursive: true });
    fs.mkdirSync(research, { recursive: true });
    fs.mkdirSync(hanakoHome, { recursive: true });
    fs.writeFileSync(path.join(research, "Research.md"), "# Research\nprivate", "utf8");
    const eventBus = new ResourceEventBus({ emit: () => undefined });
    const resourceIO = new ResourceIO({
      providers: { local_fs: new LocalFsProvider({ cwd: root }) },
      eventBus,
    });
    const list = vi.spyOn(resourceIO, "list");
    const registry = await SourceRegistry.create({
      mainRoot: { kind: "local-file", path: main },
      resourceIO,
      hanakoHome,
    });
    await registry.register({
      sourceKey: "research",
      displayName: "Research",
      root: { kind: "local-file", path: research },
    });
    const runtime = new KnowledgeIndexRuntime({
      hanakoHome,
      hostId: "shared-mount-no-lease-test",
      resourceIO,
      resourceEvents: eventBus,
      sharedBaseline: {
        subscribe(consumer) {
          consumer({
            type: "shared-baseline-difference",
            sourceKey: "main",
            cursor: 0,
            coverage: "source",
            changes: [],
          });
          return () => undefined;
        },
        requestRepair() {},
      },
    });

    await runtime.bindWorkspace(registry);
    await vi.waitFor(() => {
      expect(runtime.coordinator()?.health("main")).toMatchObject({
        state: "ready",
      });
      expect(runtime.coordinator()?.health("research")).toMatchObject({
        state: "unavailable",
      });
    });
    await expect(runtime.rebuild("research")).rejects.toMatchObject({
      code: "knowledge_index_mounted_watch_unavailable",
    });
    expect(list).not.toHaveBeenCalled();

    const researchFile = path.join(research, "Research.md");
    eventBus.changed({
      changeType: "modified",
      resourceKey: resourceKeyForRef({ kind: "local-file", path: researchFile }),
      resource: { kind: "local-file", path: researchFile, isDirectory: false },
      source: "provider_watch",
      sessionPath: null,
    });

    expect(runtime.coordinator()?.health("research")).toMatchObject({
      state: "unavailable",
    });
    expect(list).not.toHaveBeenCalled();
    await runtime.dispose();
  });
});

function document(
  relativePath: string,
  body: string,
): KnowledgeIndexResourceDocument {
  const basename = path.posix.basename(relativePath);
  const extension = path.posix.extname(basename);
  const parentPath = path.posix.dirname(relativePath) === "."
    ? ""
    : path.posix.dirname(relativePath);
  return {
    resource: {
      relativePath,
      parentPath,
      basename,
      extension,
      kind: "page",
      sizeBytes: Buffer.byteLength(body),
      mtimeMs: 1,
      versionToken: `version:${body}`,
      contentState: "indexed",
      contentReason: null,
      indexedAtMs: 1,
    },
    page: {
      title: basename.slice(0, -extension.length),
      frontmatterJson: null,
      bodyText: body,
      bodyHash: "a".repeat(64),
    },
    headings: [],
    links: [],
    tags: [],
    tasks: [],
    search: {
      titleFold: foldSearchText(basename),
      pathFold: foldSearchText(relativePath),
      metadataFold: "",
      bodyFold: foldSearchText(body),
    },
  };
}

function providerIdentity(
  opaqueRootId: string,
  scopeToken: string,
): ProviderRootIdentity {
  return {
    providerId: "local_fs",
    identityNamespace: "test",
    opaqueRootId,
    scopeToken,
    caseMode: "sensitive",
  };
}

function readyGeneration(
  health: ReturnType<KnowledgeIndexCoordinator["health"]>,
): string {
  if (health.state !== "ready") throw new Error("expected ready index");
  return health.generationId;
}
