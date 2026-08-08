import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HanaEngine } from "../core/engine.ts";
import { SourceRegistry } from "../core/knowledge-workspace/source-registry.ts";
import { searchKnowledgeIndex } from "../lib/knowledge-workspace/knowledge-search-query.ts";
import { LocalFsProvider } from "../lib/resource-io/providers/local-fs-provider.ts";
import { ResourceEventBus } from "../lib/resource-io/resource-event-bus.ts";
import { ResourceIO } from "../lib/resource-io/resource-io.ts";
import { ResourceWatchRegistry } from "../lib/resource-io/resource-watch-registry.ts";

describe("production knowledge index runtime", () => {
  const cleanup = new Set<string>();

  afterEach(() => {
    vi.useRealTimers();
    for (const directory of cleanup) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
    cleanup.clear();
  });

  it("builds the initial saved-disk index and converges an external filesystem write through the retained source watcher", async () => {
    const fixture = await createFixture("initial");
    fs.writeFileSync(path.join(fixture.workspace, "Initial.md"), "# Initial\n\nalpha", "utf8");

    await fixture.engine.bindKnowledgeIndexWorkspace(fixture.registry);
    await waitForReady(fixture.engine, "main");
    await expect(searchPaths(fixture.engine, "initial")).resolves.toEqual([
      "Initial.md",
    ]);

    fs.writeFileSync(
      path.join(fixture.workspace, "Later.md"),
      "# Later\n\nbeta",
      "utf8",
    );
    await vi.waitFor(() => {
      expect(fixture.engine.getKnowledgeIndexCoordinator()?.health("main"))
        .toMatchObject({ state: "ready", sequence: 1 });
    }, { timeout: 5_000, interval: 25 });
    await vi.waitFor(async () => {
      expect(await searchPaths(fixture.engine, "beta")).toEqual(["Later.md"]);
    }, { timeout: 5_000, interval: 25 });

    await fixture.engine.disposeKnowledgeIndexRuntime();
    expect(fixture.watchRegistry.diagnostics().watches).toHaveLength(0);
  });

  it("rebuilds after external directory rename and deletion so descendant rows do not remain stale", async () => {
    const fixture = await createFixture("directory-mutations");
    const oldDirectory = path.join(fixture.workspace, "old");
    fs.mkdirSync(oldDirectory, { recursive: true });
    fs.writeFileSync(path.join(oldDirectory, "A.md"), "# A\n\nfolder-token", "utf8");
    fs.writeFileSync(path.join(oldDirectory, "B.md"), "# B\n\nfolder-token", "utf8");

    await fixture.engine.bindKnowledgeIndexWorkspace(fixture.registry);
    await waitForReady(fixture.engine, "main");
    await expect(searchPaths(fixture.engine, "folder-token")).resolves.toEqual([
      "old/A.md",
      "old/B.md",
    ]);

    const renamedDirectory = path.join(fixture.workspace, "renamed");
    fs.renameSync(oldDirectory, renamedDirectory);
    await vi.waitFor(async () => {
      expect(await searchPaths(fixture.engine, "folder-token")).toEqual([
        "renamed/A.md",
        "renamed/B.md",
      ]);
    }, { timeout: 10_000, interval: 50 });

    fs.rmSync(renamedDirectory, { recursive: true });
    await vi.waitFor(async () => {
      expect(await searchPaths(fixture.engine, "folder-token")).toEqual([]);
    }, { timeout: 10_000, interval: 50 });

    await fixture.engine.disposeKnowledgeIndexRuntime();
  });

  it("fails closed when an externally added source symlink resolves outside the registered root", async (context) => {
    const fixture = await createFixture("symlink-scope");
    fs.writeFileSync(path.join(fixture.workspace, "Stable.md"), "# Stable\ninside", "utf8");
    await fixture.engine.bindKnowledgeIndexWorkspace(fixture.registry);
    await waitForReady(fixture.engine, "main");
    const outside = path.join(fixture.root, "Outside.md");
    fs.writeFileSync(outside, "# Outside\nleak-token", "utf8");
    try {
      fs.symlinkSync(outside, path.join(fixture.workspace, "Leak.md"), "file");
    } catch (error) {
      if (["EPERM", "EACCES"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )) {
        context.skip();
        return;
      }
      throw error;
    }

    await vi.waitFor(() => {
      expect(fixture.engine.getKnowledgeIndexCoordinator()?.health("main"))
        .toMatchObject({ state: "degraded" });
    }, { timeout: 10_000, interval: 50 });
    await expect(searchPaths(fixture.engine, "leak-token")).resolves.toEqual([]);

    await fixture.engine.disposeKnowledgeIndexRuntime();
  });

  it("starts newly registered sources and stops the old workspace before rebinding", async () => {
    const first = await createFixture("switch-first");
    const research = path.join(first.root, "research");
    fs.mkdirSync(research, { recursive: true });
    fs.writeFileSync(path.join(research, "Research.md"), "# Research\n\ngamma", "utf8");
    await first.registry.register({
      sourceKey: "research",
      displayName: "Research",
      root: { kind: "local-file", path: research },
    });

    await first.engine.bindKnowledgeIndexWorkspace(first.registry);
    await waitForReady(first.engine, "research");
    await expect(searchPaths(first.engine, "gamma", "research")).resolves.toEqual([
      "Research.md",
    ]);

    const oldCoordinator = first.engine.getKnowledgeIndexCoordinator();
    const oldHealth = oldCoordinator?.health("main");
    const secondWorkspace = path.join(first.root, "second-workspace");
    fs.mkdirSync(secondWorkspace, { recursive: true });
    fs.writeFileSync(path.join(secondWorkspace, "Second.md"), "# Second\n\ndelta", "utf8");
    const secondRegistry = await SourceRegistry.create({
      mainRoot: { kind: "local-file", path: secondWorkspace },
      resourceIO: first.resourceIO,
      hanakoHome: first.hanakoHome,
    });

    await first.engine.bindKnowledgeIndexWorkspace(secondRegistry);
    await waitForReady(first.engine, "main");
    await expect(searchPaths(first.engine, "delta")).resolves.toEqual([
      "Second.md",
    ]);

    await first.resourceIO.write(
      { kind: "local-file", path: path.join(first.workspace, "Old.md") },
      "# Old\n\nshould-not-converge",
      { reason: "runtime-switch-test" },
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(oldCoordinator?.health("main")).toEqual(oldHealth);
    await expect(searchPaths(first.engine, "should-not-converge")).resolves.toEqual([]);

    await first.engine.disposeKnowledgeIndexRuntime();
  });

  async function createFixture(label: string) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `hana-index-runtime-${label}-`));
    cleanup.add(root);
    const hanakoHome = path.join(root, "hana");
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(hanakoHome, { recursive: true });
    fs.mkdirSync(workspace, { recursive: true });
    const eventBus = new ResourceEventBus({ emit: () => {} });
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
    const watchRegistry = new ResourceWatchRegistry({
      eventBus,
      debounceMs: 10,
      resolveWatchTarget: (resource) => resourceIO.resolveWatchTarget(resource),
    });
    const engine = Object.create(HanaEngine.prototype) as HanaEngine;
    Object.assign(engine, {
      hanakoHome,
      _knowledgeIndexRuntime: null,
      _resourceEventBus: eventBus,
      _resourceIO: resourceIO,
      _resourceWatchRegistry: watchRegistry,
      _runtimeContext: {
        serverId: "server-runtime-test",
        serverNodeId: "node-runtime-test",
        studioId: "studio-runtime-test",
      },
    });
    return {
      engine,
      eventBus,
      hanakoHome,
      registry,
      resourceIO,
      root,
      watchRegistry,
      workspace,
    };
  }
});

async function waitForReady(engine: HanaEngine, sourceKey: string): Promise<void> {
  await vi.waitFor(() => {
    expect(engine.getKnowledgeIndexCoordinator()?.health(sourceKey)).toMatchObject({
      state: "ready",
    });
  }, { timeout: 10_000, interval: 25 });
}

async function searchPaths(
  engine: HanaEngine,
  query: string,
  sourceKey = "main",
): Promise<string[]> {
  const coordinator = engine.getKnowledgeIndexCoordinator();
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
