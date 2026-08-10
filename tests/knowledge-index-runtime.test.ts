import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KnowledgeIndexRuntime,
} from "../core/knowledge-workspace/knowledge-index-runtime.ts";
import type {
  KnowledgeIndexScopedRepairRequest,
  KnowledgeIndexSharedBaselineDifference,
} from "../core/knowledge-workspace/knowledge-index-event-coordinator.ts";
import { SourceRegistry } from "../core/knowledge-workspace/source-registry.ts";
import { searchKnowledgeIndex } from "../lib/knowledge-workspace/knowledge-search-query.ts";
import { LocalFsProvider } from "../lib/resource-io/providers/local-fs-provider.ts";
import { ResourceEventBus } from "../lib/resource-io/resource-event-bus.ts";
import { ResourceIO } from "../lib/resource-io/resource-io.ts";
import { resourceKeyForRef } from "../lib/resource-io/resource-refs.ts";
import { ResourceWatchRegistry } from "../lib/resource-io/resource-watch-registry.ts";

describe("knowledge index runtime", () => {
  const cleanup = new Set<string>();

  afterEach(() => {
    for (const directory of cleanup) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
    cleanup.clear();
  });

  it("accepts an already-cached source baseline, then applies a normal ResourceEventBus change through the registered root alias", async (context) => {
    const fixture = await createFixture("cached-main");
    fs.writeFileSync(path.join(fixture.workspace, "Initial.md"), "# Initial\n\nalpha", "utf8");
    const workspaceAlias = path.join(fixture.root, "workspace-alias");
    try {
      fs.symlinkSync(fixture.workspace, workspaceAlias, "dir");
    } catch (error) {
      if (["EPERM", "EACCES"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )) {
        context.skip();
        return;
      }
      throw error;
    }
    const registry = await SourceRegistry.create({
      mainRoot: { kind: "local-file", path: workspaceAlias },
      resourceIO: fixture.resourceIO,
      hanakoHome: fixture.hanakoHome,
    });
    const repairRequests: KnowledgeIndexScopedRepairRequest[] = [];
    const runtime = new KnowledgeIndexRuntime({
      hanakoHome: fixture.hanakoHome,
      hostId: "runtime-cached-main",
      resourceIO: fixture.resourceIO,
      resourceEvents: fixture.eventBus,
      retainWatch: fixture.retainWatch,
      sharedBaseline: {
        subscribe(consumer) {
          consumer(sourceBaseline(0, ["Initial.md"]));
          return () => undefined;
        },
        requestRepair(request) {
          repairRequests.push(request);
        },
      },
    });

    await runtime.bindWorkspace(registry);
    await waitForReady(runtime, "main");
    await expect(searchPaths(runtime, "alpha")).resolves.toEqual(["Initial.md"]);
    expect(repairRequests).toEqual([]);
    expect(fixture.watchRegistry.diagnostics().watches).toHaveLength(0);
    expect(mainWasListed(fixture.list.mock.calls, fixture.workspace)).toBe(false);

    const later = path.join(workspaceAlias, "Later.md");
    fs.writeFileSync(later, "# Later\n\nbeta", "utf8");
    fixture.eventBus.changed({
      changeType: "created",
      resourceKey: resourceKeyForRef({ kind: "local-file", path: later }),
      resource: { kind: "local-file", path: later, isDirectory: false },
      source: "provider_watch",
      sessionPath: null,
    });

    await vi.waitFor(async () => {
      expect(runtime.coordinator()?.health("main")).toMatchObject({
        state: "ready",
        sequence: 1,
      });
      expect(await searchPaths(runtime, "beta")).toEqual(["Later.md"]);
    });
    expect(repairRequests).toEqual([]);
    await runtime.dispose();
  });

  it("requests a shared source repair for directory rename and deletion", async () => {
    const fixture = await createFixture("directory-repair");
    const oldDirectory = path.join(fixture.workspace, "old");
    fs.mkdirSync(oldDirectory, { recursive: true });
    fs.writeFileSync(path.join(oldDirectory, "A.md"), "# A\n\nfolder-token", "utf8");
    fs.writeFileSync(path.join(oldDirectory, "B.md"), "# B\n\nfolder-token", "utf8");
    const repairRequests: KnowledgeIndexScopedRepairRequest[] = [];
    let receiveSharedBaseline: ((input: KnowledgeIndexSharedBaselineDifference) => void) | null = null;
    const runtime = new KnowledgeIndexRuntime({
      hanakoHome: fixture.hanakoHome,
      hostId: "runtime-directory-repair",
      resourceIO: fixture.resourceIO,
      resourceEvents: fixture.eventBus,
      retainWatch: fixture.retainWatch,
      sharedBaseline: {
        subscribe(consumer) {
          receiveSharedBaseline = consumer;
          consumer(sourceBaseline(0, ["old/A.md", "old/B.md"]));
          return () => undefined;
        },
        requestRepair(request) {
          repairRequests.push(request);
        },
      },
    });

    await runtime.bindWorkspace(fixture.registry);
    await waitForReady(runtime, "main");
    await expect(searchPaths(runtime, "folder-token")).resolves.toEqual([
      "old/A.md",
      "old/B.md",
    ]);

    const renamedDirectory = path.join(fixture.workspace, "renamed");
    fs.renameSync(oldDirectory, renamedDirectory);
    fixture.eventBus.renamed({
      oldResourceKey: resourceKeyForRef({ kind: "local-file", path: oldDirectory }),
      newResourceKey: resourceKeyForRef({ kind: "local-file", path: renamedDirectory }),
      oldResource: { kind: "local-file", path: oldDirectory, isDirectory: true },
      newResource: { kind: "local-file", path: renamedDirectory, isDirectory: true },
      source: "provider_watch",
      sessionPath: null,
    });
    await vi.waitFor(() => {
      expect(repairRequests).toEqual([
        expect.objectContaining({
          sourceKey: "main",
          afterSequence: 1,
          reason: "directory_event",
        }),
      ]);
    });
    if (!receiveSharedBaseline) throw new Error("shared baseline subscriber was not retained");
    receiveSharedBaseline(sourceBaseline(1, ["renamed/A.md", "renamed/B.md"]));
    await vi.waitFor(async () => {
      expect(await searchPaths(runtime, "folder-token")).toEqual([
        "renamed/A.md",
        "renamed/B.md",
      ]);
    });

    fs.rmSync(renamedDirectory, { recursive: true });
    fixture.eventBus.deleted({
      resourceKey: resourceKeyForRef({ kind: "local-file", path: renamedDirectory }),
      resource: { kind: "local-file", path: renamedDirectory, isDirectory: true },
      source: "provider_watch",
      sessionPath: null,
    });
    await vi.waitFor(() => {
      expect(repairRequests).toHaveLength(2);
      expect(repairRequests[1]).toMatchObject({
        sourceKey: "main",
        afterSequence: 2,
        reason: "directory_event",
      });
    });
    receiveSharedBaseline(sourceBaseline(2, []));
    await vi.waitFor(async () => {
      expect(await searchPaths(runtime, "folder-token")).toEqual([]);
    });
    expect(mainWasListed(fixture.list.mock.calls, fixture.workspace)).toBe(false);
    await runtime.dispose();
  });

  it("fails closed when a file event resolves through a symlink outside main", async (context) => {
    const fixture = await createFixture("symlink-scope");
    const stable = path.join(fixture.workspace, "Stable.md");
    fs.writeFileSync(stable, "# Stable\ninside", "utf8");
    const runtime = new KnowledgeIndexRuntime({
      hanakoHome: fixture.hanakoHome,
      hostId: "runtime-symlink-scope",
      resourceIO: fixture.resourceIO,
      resourceEvents: fixture.eventBus,
      retainWatch: fixture.retainWatch,
      sharedBaseline: {
        subscribe(consumer) {
          consumer(sourceBaseline(0, ["Stable.md"]));
          return () => undefined;
        },
        requestRepair() {},
      },
    });
    await runtime.bindWorkspace(fixture.registry);
    await waitForReady(runtime, "main");
    const outside = path.join(fixture.root, "Outside.md");
    fs.writeFileSync(outside, "# Outside\nleak-token", "utf8");
    const leak = path.join(fixture.workspace, "Leak.md");
    try {
      fs.symlinkSync(outside, leak, "file");
    } catch (error) {
      if (["EPERM", "EACCES"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )) {
        context.skip();
        return;
      }
      throw error;
    }
    fixture.eventBus.changed({
      changeType: "created",
      resourceKey: resourceKeyForRef({ kind: "local-file", path: leak }),
      resource: { kind: "local-file", path: leak, isDirectory: false },
      source: "provider_watch",
      sessionPath: null,
    });

    await vi.waitFor(() => {
      expect(runtime.coordinator()?.health("main")).toMatchObject({
        state: "degraded",
      });
    });
    await expect(searchPaths(runtime, "leak-token")).resolves.toEqual([]);
    await runtime.dispose();
  });

  it("indexes mounted sources through the canonical lease and replaces the main binding without stale projection", async () => {
    const fixture = await createFixture("switch-first");
    const research = path.join(fixture.root, "research");
    fs.mkdirSync(research, { recursive: true });
    fs.writeFileSync(path.join(research, "Research.md"), "# Research\n\ngamma", "utf8");
    await fixture.registry.register({
      sourceKey: "research",
      displayName: "Research",
      root: { kind: "local-file", path: research },
    });
    let currentBaseline = sourceBaseline(0, []);
    let receiveSharedBaseline: ((input: KnowledgeIndexSharedBaselineDifference) => void) | null = null;
    const runtime = new KnowledgeIndexRuntime({
      hanakoHome: fixture.hanakoHome,
      hostId: "runtime-switch-test",
      resourceIO: fixture.resourceIO,
      resourceEvents: fixture.eventBus,
      retainWatch: fixture.retainWatch,
      sharedBaseline: {
        subscribe(consumer) {
          receiveSharedBaseline = consumer;
          return () => undefined;
        },
        requestRepair() {
          receiveSharedBaseline?.(currentBaseline);
        },
      },
    });
    currentBaseline = sourceBaseline(0, []);
    fs.writeFileSync(path.join(fixture.workspace, "First.md"), "# First\n\nalpha", "utf8");
    currentBaseline = sourceBaseline(0, ["First.md"]);

    await runtime.bindWorkspace(fixture.registry);
    await waitForReady(runtime, "main");
    await waitForReady(runtime, "research");
    await expect(searchPaths(runtime, "gamma", "research")).resolves.toEqual([
      "Research.md",
    ]);
    expect(fixture.watchRegistry.diagnostics().watches).toHaveLength(1);

    const secondWorkspace = path.join(fixture.root, "second-workspace");
    fs.mkdirSync(secondWorkspace, { recursive: true });
    fs.writeFileSync(path.join(secondWorkspace, "Second.md"), "# Second\n\ndelta", "utf8");
    const secondRegistry = await SourceRegistry.create({
      mainRoot: { kind: "local-file", path: secondWorkspace },
      resourceIO: fixture.resourceIO,
      hanakoHome: fixture.hanakoHome,
    });
    currentBaseline = sourceBaseline(fixture.eventBus.latestSequence(), ["Second.md"]);

    await runtime.bindWorkspace(secondRegistry);
    await waitForReady(runtime, "main");
    await expect(searchPaths(runtime, "delta")).resolves.toEqual(["Second.md"]);

    const oldPath = path.join(fixture.workspace, "Old.md");
    fs.writeFileSync(oldPath, "# Old\n\nshould-not-converge", "utf8");
    fixture.eventBus.changed({
      changeType: "created",
      resourceKey: resourceKeyForRef({ kind: "local-file", path: oldPath }),
      resource: { kind: "local-file", path: oldPath, isDirectory: false },
      source: "provider_watch",
      sessionPath: null,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    await expect(searchPaths(runtime, "should-not-converge")).resolves.toEqual([]);

    await runtime.dispose();
    expect(fixture.watchRegistry.diagnostics().watches).toHaveLength(0);
  });

  async function createFixture(label: string) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `hana-index-runtime-${label}-`));
    cleanup.add(root);
    const hanakoHome = path.join(root, "hana");
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(hanakoHome, { recursive: true });
    fs.mkdirSync(workspace, { recursive: true });
    const eventBus = new ResourceEventBus({ emit: () => undefined });
    const resourceIO = new ResourceIO({
      providers: {
        local_fs: new LocalFsProvider({ cwd: root }),
      },
      eventBus,
    });
    const registry = await SourceRegistry.create({
      mainRoot: { kind: "local-file", path: workspace },
      resourceIO,
      hanakoHome,
    });
    const list = vi.spyOn(resourceIO, "list");
    const watchRegistry = new ResourceWatchRegistry({
      eventBus,
      debounceMs: 0,
      resolveWatchTarget: (resource) => resourceIO.resolveWatchTarget(resource),
      watchPath: () => ({ close: () => undefined }),
    });
    return {
      eventBus,
      hanakoHome,
      list,
      registry,
      resourceIO,
      retainWatch: (resource: Parameters<ResourceWatchRegistry["retain"]>[0]) =>
        watchRegistry.retain(resource),
      root,
      watchRegistry,
      workspace,
    };
  }
});

function sourceBaseline(
  cursor: number,
  relativePaths: readonly string[],
): KnowledgeIndexSharedBaselineDifference {
  return {
    type: "shared-baseline-difference",
    sourceKey: "main",
    cursor,
    coverage: "source",
    changes: relativePaths.map((relativePath) => ({
      relativePath,
      changeType: "upsert" as const,
    })),
  };
}

async function waitForReady(
  runtime: KnowledgeIndexRuntime,
  sourceKey: string,
): Promise<void> {
  await vi.waitFor(() => {
    expect(runtime.coordinator()?.health(sourceKey)).toMatchObject({
      state: "ready",
    });
  }, { timeout: 10_000, interval: 25 });
}

async function searchPaths(
  runtime: KnowledgeIndexRuntime,
  query: string,
  sourceKey = "main",
): Promise<string[]> {
  const coordinator = runtime.coordinator();
  if (!coordinator) throw new Error("knowledge index coordinator unavailable");
  const result = await searchKnowledgeIndex(coordinator, {
    query,
    scope: { kind: "tag", sourceKey },
  }, {
    sources: [{ sourceKey, displayName: sourceKey, availability: "available" }],
  });
  const group = result.groups[0];
  if (!group || group.state !== "ready") return [];
  return group.items.map((item) => item.address.relativePath);
}

function mainWasListed(
  calls: readonly (readonly unknown[])[],
  workspace: string,
): boolean {
  return calls.some(([resource]) => {
    const listedResource = resource as { kind?: unknown; path?: unknown };
    return listedResource.kind === "local-file"
      && typeof listedResource.path === "string"
      && path.resolve(listedResource.path) === path.resolve(workspace);
  });
}
