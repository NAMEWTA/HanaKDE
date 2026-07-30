import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  KnowledgeIndexEventCoordinator,
  ResourceIOKnowledgeIndexSourceReader,
  type KnowledgeIndexEventSource,
} from "../core/knowledge-workspace/knowledge-index-event-coordinator.ts";
import {
  KnowledgeIndexCoordinator,
} from "../core/knowledge-workspace/knowledge-index-coordinator.ts";
import { ResourceIO } from "../lib/resource-io/resource-io.ts";
import { LocalFsProvider } from "../lib/resource-io/providers/local-fs-provider.ts";
import type {
  ProviderRootIdentity,
} from "../lib/resource-io/types.ts";

describe("knowledge index rebuild", () => {
  const cleanup = new Set<string>();

  afterEach(() => {
    for (const root of cleanup) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    cleanup.clear();
  });

  it("scans saved ResourceIO facts and excludes source trash", async () => {
    const fixture = createFixture("scan");
    fs.mkdirSync(path.join(fixture.workspace, "notes"), { recursive: true });
    fs.mkdirSync(path.join(fixture.workspace, ".trash"), { recursive: true });
    fs.writeFileSync(
      path.join(fixture.workspace, "notes", "page.md"),
      "# Page\nbody #tag\n",
    );
    fs.writeFileSync(path.join(fixture.workspace, "plain.txt"), "plain body");
    fs.writeFileSync(path.join(fixture.workspace, "manual.pdf"), "%PDF-1.7");
    fs.writeFileSync(path.join(fixture.workspace, ".trash", "gone.md"), "# Gone");

    await fixture.events.rebuild("main");

    expect(fixture.index.health("main")).toMatchObject({
      state: "ready",
      sequence: 0,
    });
    const lease = fixture.index.acquireQueryLease("main");
    expect(lease.inspect()).toMatchObject({
      resourceCount: 3,
      nonEmptyBodyFtsCount: 2,
      rowCounts: {
        resources: 3,
        pages: 1,
        headings: 1,
        tags: 1,
      },
    });
    lease.release();
  });

  it("keeps the old generation queryable while a new source generation builds", async () => {
    const fixture = createFixture("old-generation");
    fs.writeFileSync(path.join(fixture.workspace, "page.md"), "# One");
    await fixture.events.rebuild("main");
    const oldGeneration = readyGeneration(fixture.index.health("main"));

    let releaseScan!: () => void;
    const scanGate = new Promise<void>((resolve) => {
      releaseScan = resolve;
    });
    let reportStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      reportStarted = resolve;
    });
    const gated: KnowledgeIndexEventSource = {
      eventPaths: (event) => fixture.reader.eventPaths(event),
      reread: (relativePath, signal) =>
        fixture.reader.reread(relativePath, signal),
      async *scan(signal) {
        reportStarted();
        await scanGate;
        yield* fixture.reader.scan(signal);
      },
    };
    fixture.sources.set("main", gated);
    fs.writeFileSync(path.join(fixture.workspace, "page.md"), "# Two");

    const rebuilding = fixture.events.rebuild("main");
    await started;
    expect(fixture.index.health("main")).toEqual({
      state: "building",
      generationId: oldGeneration,
      rebuildId: "id-3",
      progress: 0,
    });
    const oldLease = fixture.index.acquireQueryLease("main");
    expect(oldLease.inspect().generationId).toBe(oldGeneration);
    releaseScan();
    await rebuilding;
    expect(readyGeneration(fixture.index.health("main"))).not.toBe(
      oldGeneration,
    );
    expect(oldLease.inspect().generationId).toBe(oldGeneration);
    oldLease.release();
  });

  it("cancels a full rebuild without replacing the old generation", async () => {
    const fixture = createFixture("cancel");
    fs.writeFileSync(path.join(fixture.workspace, "page.md"), "# Stable");
    await fixture.events.rebuild("main");
    const oldGeneration = readyGeneration(fixture.index.health("main"));
    const controller = new AbortController();
    controller.abort();

    await expect(fixture.events.rebuild("main", {
      signal: controller.signal,
    })).rejects.toMatchObject({
      name: "AbortError",
      code: "ABORT_ERR",
    });
    expect(fixture.index.health("main")).toEqual({
      state: "ready",
      generationId: oldGeneration,
      sequence: 0,
    });
  });

  it("rejects a scope-token change at publish and preserves the prior generation", async () => {
    const fixture = createFixture("scope");
    fs.writeFileSync(path.join(fixture.workspace, "page.md"), "# Stable");
    await fixture.events.rebuild("main");
    const oldGeneration = readyGeneration(fixture.index.health("main"));
    let revalidations = 0;
    fixture.sources.set("main", {
      eventPaths: (event) => fixture.reader.eventPaths(event),
      reread: (relativePath, signal) =>
        fixture.reader.reread(relativePath, signal),
      scan: (signal) => fixture.reader.scan(signal),
      async revalidate() {
        revalidations += 1;
        if (revalidations === 2) {
          fixture.identities.set(
            "main",
            identity("replacement-root", "replacement-scope"),
          );
        }
      },
    });

    await expect(fixture.events.rebuild("main")).rejects.toThrow(
      /source identity changed/,
    );
    fixture.identities.set("main", identity("main-root", "main-scope"));
    expect(fixture.index.health("main")).toEqual({
      state: "degraded",
      generationId: oldGeneration,
      reason: "source_root_identity_unprovable",
    });
    const lease = fixture.index.acquireQueryLease("main");
    expect(lease.inspect().generationId).toBe(oldGeneration);
    lease.release();
  });

  it("reports unavailable when initial source scanning fails without an old generation", async () => {
    const fixture = createFixture("unavailable");
    fixture.sources.set("main", {
      eventPaths: () => [],
      reread: async () => null,
      async *scan() {
        yield* [];
        throw Object.assign(new Error("offline"), {
          code: "source_unavailable",
        });
      },
    });

    await expect(fixture.events.rebuild("main")).rejects.toMatchObject({
      code: "source_unavailable",
    });
    expect(fixture.index.health("main")).toEqual({
      state: "unavailable",
      reason: "no_ready_generation",
    });
  });

  it("surfaces stale extractor health while the old generation remains readable", async () => {
    const fixture = createFixture("stale");
    fs.writeFileSync(path.join(fixture.workspace, "page.md"), "# Stable");
    await fixture.events.rebuild("main");
    const oldGeneration = readyGeneration(fixture.index.health("main"));
    const upgraded = createSiblingIndex(fixture, {
      extractorContractVersion: "knowledge-index-v2",
      hostId: "upgrade-host",
      pid: 41_002,
    });

    expect(upgraded.health("main")).toEqual({
      state: "stale",
      generationId: oldGeneration,
      reason: "extractor_contract_mismatch",
    });
    const lease = upgraded.acquireQueryLease("main");
    expect(lease.inspect()).toMatchObject({
      generationId: oldGeneration,
      extractorContractVersion: "knowledge-index-v1",
    });
    lease.release();
  });

  it("surfaces a writer lock without hiding the old generation", async () => {
    const fixture = createFixture("locked");
    fs.writeFileSync(path.join(fixture.workspace, "page.md"), "# Stable");
    await fixture.events.rebuild("main");
    const oldGeneration = readyGeneration(fixture.index.health("main"));
    const active = await fixture.index.beginRebuild("main", {
      rebuildId: "held",
      generationId: "held-generation",
      startedSequence: 0,
    });
    const competing = createSiblingIndex(fixture, {
      extractorContractVersion: "knowledge-index-v1",
      hostId: "other-host",
      pid: 41_003,
    });

    expect(competing.health("main")).toEqual({
      state: "locked",
      generationId: oldGeneration,
      ownerHint: "another-host",
    });
    const lease = competing.acquireQueryLease("main");
    expect(lease.inspect().generationId).toBe(oldGeneration);
    lease.release();
    active.cancel();
  });

  it("surfaces source-local corruption without leaking paths or raw SQLite errors", async () => {
    const fixture = createFixture("corrupt");
    fs.writeFileSync(path.join(fixture.workspace, "page.md"), "# Stable");
    await fixture.events.rebuild("main");
    const generationId = readyGeneration(fixture.index.health("main"));
    const generationFile = findGenerationFile(fixture.hanakoHome);
    fs.writeFileSync(generationFile, "not a sqlite database");

    const health = fixture.index.health("main");
    expect(health).toEqual({
      state: "corrupt",
      generationId,
      reason: "generation_integrity_failed",
    });
    expect(JSON.stringify(health)).not.toContain(fixture.hanakoHome);
    expect(JSON.stringify(health)).not.toMatch(/SQLITE_/);
  });

  function createFixture(label: string) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `hana-index-${label}-`));
    cleanup.add(root);
    const hanakoHome = path.join(root, "home");
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(hanakoHome, { recursive: true });
    fs.mkdirSync(workspace, { recursive: true });
    const resourceIO = new ResourceIO({
      providers: {
        local_fs: new LocalFsProvider({ cwd: workspace }),
      },
    });
    const reader = new ResourceIOKnowledgeIndexSourceReader({
      resourceIO,
      root: { kind: "local-file", path: workspace },
      now: () => 1_000,
    });
    const identities = new Map<string, ProviderRootIdentity>([
      ["main", identity("main-root", "main-scope")],
    ]);
    const index = new KnowledgeIndexCoordinator({
      hanakoHome,
      workspaceIdentity: identity("workspace-root", "workspace-scope"),
      sourceRegistry: {
        rootIdentity(sourceKey) {
          const value = identities.get(sourceKey);
          if (!value) throw Object.assign(new Error("offline"), {
            code: "source_unavailable",
          });
          return value;
        },
        async revalidate(sourceKey) {
          if (!identities.has(sourceKey)) {
            throw Object.assign(new Error("offline"), {
              code: "source_unavailable",
            });
          }
        },
      },
      extractorContractVersion: "knowledge-index-v1",
      hostId: "test-host",
      pid: 41_001,
    });
    const sources = new Map<string, KnowledgeIndexEventSource>([
      ["main", reader],
    ]);
    let nextId = 0;
    const events = new KnowledgeIndexEventCoordinator({
      indexCoordinator: index,
      sourceFor(sourceKey) {
        const source = sources.get(sourceKey);
        if (!source) throw new Error("source_unavailable");
        return source;
      },
      createId: () => `id-${++nextId}`,
      yieldNow: async () => {},
    });
    return {
      events,
      hanakoHome,
      identities,
      index,
      reader,
      resourceIO,
      root,
      sources,
      workspaceIdentity: identity("workspace-root", "workspace-scope"),
      workspace,
    };
  }
});

function identity(
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

function createSiblingIndex(
  fixture: {
    hanakoHome: string;
    workspaceIdentity: ProviderRootIdentity;
    identities: Map<string, ProviderRootIdentity>;
  },
  options: {
    extractorContractVersion: string;
    hostId: string;
    pid: number;
  },
): KnowledgeIndexCoordinator {
  return new KnowledgeIndexCoordinator({
    hanakoHome: fixture.hanakoHome,
    workspaceIdentity: fixture.workspaceIdentity,
    sourceRegistry: {
      rootIdentity(sourceKey) {
        const value = fixture.identities.get(sourceKey);
        if (!value) throw new Error("source unavailable");
        return value;
      },
      async revalidate(sourceKey) {
        if (!fixture.identities.has(sourceKey)) {
          throw new Error("source unavailable");
        }
      },
    },
    ...options,
  });
}

function findGenerationFile(root: string): string {
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(candidate);
      if (
        entry.isFile()
        && /^generation-.+\.sqlite$/.test(entry.name)
      ) {
        return candidate;
      }
    }
  }
  throw new Error("generation file not found");
}
