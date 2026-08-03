import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  KNOWLEDGE_INDEX_SCHEMA_VERSION,
  KnowledgeIndexStore,
  knowledgeIndexCompactPartitionPath,
  foldSearchText,
  nodeKnowledgeIndexFileSystem,
  type KnowledgeIndexFileSystem,
} from "../lib/knowledge-workspace/knowledge-index-store.ts";
import {
  KnowledgeIndexCoordinator,
  fingerprintProviderRootIdentity,
} from "../core/knowledge-workspace/knowledge-index-coordinator.ts";
import type { ProviderRootIdentity } from "../lib/resource-io/types.ts";

const WORKSPACE_FINGERPRINT = "a".repeat(64);
const SOURCE_FINGERPRINT = "b".repeat(64);
const OTHER_SOURCE_FINGERPRINT = "c".repeat(64);

describe("knowledge index store", () => {
  const cleanup = new Set<string>();

  afterEach(() => {
    for (const root of cleanup) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    cleanup.clear();
  });

  function temporaryHome(label = "store"): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `hana-index-${label}-`));
    cleanup.add(root);
    return root;
  }

  function createStore(
    hanakoHome: string,
    sourceFingerprint = SOURCE_FINGERPRINT,
    options: {
      hostId?: string;
      pid?: number;
      now?: () => number;
      fileSystem?: KnowledgeIndexFileSystem;
      processIsAlive?: (pid: number) => boolean;
      extractorContractVersion?: string;
    } = {},
  ): KnowledgeIndexStore {
    return new KnowledgeIndexStore({
      hanakoHome,
      workspaceFingerprint: WORKSPACE_FINGERPRINT,
      sourceFingerprint,
      hostId: options.hostId ?? "host-a",
      pid: options.pid ?? 101,
      now: options.now,
      fileSystem: options.fileSystem,
      processIsAlive: options.processIsAlive,
      extractorContractVersion: options.extractorContractVersion ?? "extractor-v1",
    });
  }

  it("publishes a source generation with the frozen schema, pragmas, and folded trigram FTS", () => {
    const hanakoHome = temporaryHome();
    const store = createStore(hanakoHome);
    const rebuild = store.beginRebuild({
      rebuildId: "rebuild-1",
      generationId: "generation-1",
      startedSequence: 7,
    });

    expect(store.health()).toEqual({
      state: "building",
      rebuildId: "rebuild-1",
      progress: 0,
    });
    rebuild.publish({ lastCompleteSequence: 12 });

    expect(store.health()).toEqual({
      state: "ready",
      generationId: "generation-1",
      sequence: 12,
    });
    const lease = store.acquireQueryLease();
    const snapshot = lease.inspect();
    expect(snapshot.generationId).toBe("generation-1");
    expect(snapshot.schemaVersion).toBe(KNOWLEDGE_INDEX_SCHEMA_VERSION);
    expect(snapshot.extractorContractVersion).toBe("extractor-v1");
    expect(snapshot.lastCompleteSequence).toBe(12);
    expect(snapshot.quickCheck).toBe("ok");
    expect(snapshot.pragmas).toEqual({
      foreignKeys: 1,
      journalMode: "wal",
      synchronous: 2,
      busyTimeout: 5000,
      tempStore: 2,
    });
    expect(snapshot.tables).toEqual([
      "content_fts",
      "content_fts_config",
      "content_fts_content",
      "content_fts_data",
      "content_fts_docsize",
      "content_fts_idx",
      "headings",
      "links",
      "meta",
      "pages",
      "resources",
      "tags",
      "tasks",
    ]);
    expect(snapshot.contentFtsSql).toContain("tokenize = 'trigram case_sensitive 1'");
    expect(snapshot.sourceFingerprint).toBe(SOURCE_FINGERPRINT);
    expect(JSON.stringify(snapshot)).not.toContain(hanakoHome);
    lease.release();

    expect(foldSearchText("ÉCOLE/资料/İ")).toBe("école/资料/i̇");
  });

  it("keeps the prior generation queryable when a rebuild is cancelled or publication fails", () => {
    const hanakoHome = temporaryHome("failure");
    const store = createStore(hanakoHome);
    store.beginRebuild({
      rebuildId: "initial",
      generationId: "generation-1",
      startedSequence: 0,
    }).publish({ lastCompleteSequence: 1 });

    const oldLease = store.acquireQueryLease();
    const cancelled = store.beginRebuild({
      rebuildId: "cancelled",
      generationId: "generation-2",
      startedSequence: 1,
    });
    cancelled.cancel();
    expect(store.health()).toEqual({
      state: "ready",
      generationId: "generation-1",
      sequence: 1,
    });
    expect(oldLease.inspect().generationId).toBe("generation-1");
    expect(fs.existsSync(path.join(
      partitionPath(hanakoHome, SOURCE_FINGERPRINT),
      "build-cancelled.sqlite",
    ))).toBe(false);

    const failingFileSystem: KnowledgeIndexFileSystem = {
      ...nodeKnowledgeIndexFileSystem,
      rename(from, to) {
        if (path.basename(from) === "current.json.tmp") {
          throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
        }
        nodeKnowledgeIndexFileSystem.rename(from, to);
      },
    };
    const failingStore = createStore(hanakoHome, SOURCE_FINGERPRINT, {
      fileSystem: failingFileSystem,
    });
    const failed = failingStore.beginRebuild({
      rebuildId: "disk-full",
      generationId: "generation-3",
      startedSequence: 1,
    });
    expect(() => failed.publish({ lastCompleteSequence: 2 })).toThrow(
      /knowledge index rebuild publication failed/,
    );
    expect(createStore(hanakoHome).health()).toEqual({
      state: "ready",
      generationId: "generation-1",
      sequence: 1,
    });
    expect(oldLease.inspect().generationId).toBe("generation-1");
    oldLease.release();
  });

  it("continues to read a valid legacy partition while fresh partitions use the compact path", () => {
    const hanakoHome = temporaryHome("legacy-path");
    const created = createStore(hanakoHome);
    created.beginRebuild({
      rebuildId: "compact",
      generationId: "generation-1",
      startedSequence: 0,
    }).publish({ lastCompleteSequence: 1 });
    const compactPath = partitionPath(hanakoHome, SOURCE_FINGERPRINT);
    const legacyPath = path.join(
      hanakoHome,
      "knowledge-workspace",
      "index",
      "v1",
      WORKSPACE_FINGERPRINT,
      SOURCE_FINGERPRINT,
    );
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.cpSync(compactPath, legacyPath, { recursive: true });
    fs.rmSync(compactPath, { recursive: true, force: true });

    expect(createStore(hanakoHome).health()).toEqual({
      state: "ready",
      generationId: "generation-1",
      sequence: 1,
    });
  });

  it("turns AbortSignal and staging rename failure into non-destructive rebuild outcomes", () => {
    const hanakoHome = temporaryHome("abort");
    const store = createStore(hanakoHome);
    store.beginRebuild({
      rebuildId: "initial",
      generationId: "generation-1",
      startedSequence: 0,
    }).publish({ lastCompleteSequence: 1 });

    const controller = new AbortController();
    const aborted = store.beginRebuild({
      rebuildId: "aborted",
      generationId: "generation-2",
      startedSequence: 1,
      signal: controller.signal,
    });
    controller.abort();
    expect(() => aborted.publish({ lastCompleteSequence: 2 })).toThrow(
      expect.objectContaining({ name: "AbortError", code: "ABORT_ERR" }),
    );
    expect(store.health()).toEqual({
      state: "ready",
      generationId: "generation-1",
      sequence: 1,
    });

    const failingFileSystem: KnowledgeIndexFileSystem = {
      ...nodeKnowledgeIndexFileSystem,
      rename(from, to) {
        if (
          path.basename(from) === "build-rename-failure.sqlite"
          && path.basename(to) === "generation-generation-3.sqlite"
        ) {
          throw Object.assign(new Error("rename denied"), { code: "EACCES" });
        }
        nodeKnowledgeIndexFileSystem.rename(from, to);
      },
    };
    const failing = createStore(hanakoHome, SOURCE_FINGERPRINT, {
      fileSystem: failingFileSystem,
    });
    expect(() => failing.beginRebuild({
      rebuildId: "rename-failure",
      generationId: "generation-3",
      startedSequence: 1,
    }).publish({ lastCompleteSequence: 3 })).toThrow(
      expect.objectContaining({ code: "knowledge_index_unavailable" }),
    );
    expect(createStore(hanakoHome).health()).toEqual({
      state: "ready",
      generationId: "generation-1",
      sequence: 1,
    });
  });

  it("refuses checkpoint-busy staging content instead of publishing a main file without its WAL", () => {
    const hanakoHome = temporaryHome("checkpoint");
    const store = createStore(hanakoHome);
    const rebuild = store.beginRebuild({
      rebuildId: "busy",
      generationId: "generation-busy",
      startedSequence: 0,
    });
    const buildPath = path.join(
      partitionPath(hanakoHome, SOURCE_FINGERPRINT),
      "build-busy.sqlite",
    );
    const reader = new Database(buildPath, { readonly: true });
    reader.exec("BEGIN");
    reader.prepare("SELECT value FROM meta WHERE key = 'generation_id'").get();

    expect(() => rebuild.publish({ lastCompleteSequence: 1 })).toThrow(
      expect.objectContaining({
        code: "knowledge_index_unavailable",
        details: { state: "checkpoint_busy" },
      }),
    );
    expect(store.health()).toMatchObject({ state: "unavailable" });
    expect(fs.existsSync(path.join(
      partitionPath(hanakoHome, SOURCE_FINGERPRINT),
      "current.json",
    ))).toBe(false);
    reader.exec("ROLLBACK");
    reader.close();
    rebuild.cancel();
  });

  it("serializes writers with a recoverable same-host lock and never steals another host lock", () => {
    const hanakoHome = temporaryHome("lock");
    let now = Date.parse("2026-07-30T00:00:00.000Z");
    const active = createStore(hanakoHome, SOURCE_FINGERPRINT, {
      hostId: "host-a",
      pid: 500,
      now: () => now,
      processIsAlive: (pid) => pid === 500,
    });
    const first = active.beginRebuild({
      rebuildId: "first",
      generationId: "generation-1",
      startedSequence: 0,
    });
    const contender = createStore(hanakoHome, SOURCE_FINGERPRINT, {
      hostId: "host-a",
      pid: 501,
      now: () => now,
      processIsAlive: (pid) => pid === 500,
    });
    expect(() => contender.beginRebuild({
      rebuildId: "blocked",
      generationId: "generation-2",
      startedSequence: 0,
    })).toThrow(/writer lock is held/);
    expect(contender.health()).toEqual({
      state: "locked",
      ownerHint: "same-host-active",
    });
    first.cancel();

    const staleOwner = active.beginRebuild({
      rebuildId: "stale-owner",
      generationId: "generation-3",
      startedSequence: 0,
    });
    now += 61_000;
    const recovery = createStore(hanakoHome, SOURCE_FINGERPRINT, {
      hostId: "host-a",
      pid: 501,
      now: () => now,
      processIsAlive: () => false,
    });
    const recovered = recovery.beginRebuild({
      rebuildId: "recovered",
      generationId: "generation-4",
      startedSequence: 0,
    });
    recovered.cancel();
    staleOwner.cancel();

    const remoteOwner = createStore(hanakoHome, SOURCE_FINGERPRINT, {
      hostId: "host-remote",
      pid: 700,
      now: () => now,
      processIsAlive: () => false,
    });
    const remote = remoteOwner.beginRebuild({
      rebuildId: "remote",
      generationId: "generation-5",
      startedSequence: 0,
    });
    now += 10 * 60_000;
    const local = createStore(hanakoHome, SOURCE_FINGERPRINT, {
      hostId: "host-local",
      pid: 800,
      now: () => now,
      processIsAlive: () => false,
    });
    expect(() => local.beginRebuild({
      rebuildId: "must-not-steal",
      generationId: "generation-6",
      startedSequence: 0,
    })).toThrow(/writer lock is held/);
    expect(local.health()).toEqual({
      state: "locked",
      ownerHint: "another-host",
    });
    remote.cancel();
  });

  it("keeps a published generation when writer-lock cleanup fails and reports degraded health", () => {
    const hanakoHome = temporaryHome("lock-release");
    const failingFileSystem: KnowledgeIndexFileSystem = {
      ...nodeKnowledgeIndexFileSystem,
      remove(target, options) {
        if (path.basename(target) === "writer.lock") {
          throw Object.assign(new Error("handle busy"), { code: "EBUSY" });
        }
        nodeKnowledgeIndexFileSystem.remove(target, options);
      },
    };
    const store = createStore(hanakoHome, SOURCE_FINGERPRINT, {
      fileSystem: failingFileSystem,
    });
    store.beginRebuild({
      rebuildId: "published",
      generationId: "generation-1",
      startedSequence: 0,
    }).publish({ lastCompleteSequence: 4 });

    expect(store.health()).toEqual({
      state: "degraded",
      generationId: "generation-1",
      reason: "writer_lock_release_failed",
    });
    expect(createStore(hanakoHome).health()).toEqual({
      state: "locked",
      generationId: "generation-1",
      ownerHint: "same-host-active",
    });
  });

  it("publishes when an empty Windows-style SHM sidecar is transiently locked", () => {
    const hanakoHome = temporaryHome("locked-sidecar");
    let sidecarRemovalAttempts = 0;
    const transientSidecarFileSystem: KnowledgeIndexFileSystem = {
      ...nodeKnowledgeIndexFileSystem,
      exists(target) {
        if (target.endsWith("build-sidecar.sqlite-shm")) return true;
        return nodeKnowledgeIndexFileSystem.exists(target);
      },
      remove(target, options) {
        if (target.endsWith("build-sidecar.sqlite-shm")) {
          sidecarRemovalAttempts += 1;
          throw Object.assign(new Error("sharing violation"), { code: "EPERM" });
        }
        nodeKnowledgeIndexFileSystem.remove(target, options);
      },
    };
    const store = createStore(hanakoHome, SOURCE_FINGERPRINT, {
      fileSystem: transientSidecarFileSystem,
    });

    store.beginRebuild({
      rebuildId: "sidecar",
      generationId: "generation-sidecar",
      startedSequence: 0,
    }).publish({ lastCompleteSequence: 1 });

    expect(sidecarRemovalAttempts).toBeGreaterThan(0);
    expect(store.health()).toEqual({
      state: "ready",
      generationId: "generation-sidecar",
      sequence: 1,
    });
  });

  it.skipIf(process.platform === "win32")(
    "refuses a symlinked internal index directory or manifest",
    () => {
      const hanakoHome = temporaryHome("symlink");
      const outside = temporaryHome("symlink-outside");
      fs.mkdirSync(path.join(hanakoHome, "kw", "i"), {
        recursive: true,
      });
      fs.symlinkSync(
        outside,
        path.join(hanakoHome, "kw", "i", "v1"),
        "dir",
      );
      expect(() => createStore(hanakoHome)).toThrow(
        expect.objectContaining({ code: "knowledge_index_unavailable" }),
      );

      fs.rmSync(path.join(hanakoHome, "kw", "i", "v1"), {
        force: true,
      });
      const store = createStore(hanakoHome);
      fs.writeFileSync(path.join(outside, "manifest.json"), "{}");
      fs.symlinkSync(
        path.join(outside, "manifest.json"),
        path.join(
          partitionPath(hanakoHome, SOURCE_FINGERPRINT),
          "current.json",
        ),
      );
      expect(store.health()).toEqual({
        state: "corrupt",
        reason: "manifest_invalid",
      });
    },
  );

  it("isolates source partitions through the coordinator and binds fingerprints to root identity", async () => {
    const hanakoHome = temporaryHome("coordinator");
    const workspaceIdentity = identity("workspace-root", "workspace-scope");
    const identities = new Map<string, ProviderRootIdentity>([
      ["main", identity("main-root", "main-scope")],
      ["research", identity("research-root", "research-scope")],
    ]);
    const registry = {
      rootIdentity(sourceKey: string) {
        const value = identities.get(sourceKey);
        if (!value) throw new Error("missing source");
        return value;
      },
      async revalidate(sourceKey: string) {
        if (!identities.has(sourceKey)) throw new Error("missing source");
      },
    };
    const coordinator = new KnowledgeIndexCoordinator({
      hanakoHome,
      workspaceIdentity,
      sourceRegistry: registry,
      extractorContractVersion: "extractor-v1",
      hostId: "host-a",
      pid: 900,
    });

    const main = await coordinator.beginRebuild("main", {
      rebuildId: "main-build",
      generationId: "main-generation",
      startedSequence: 0,
    });
    await main.publish({ lastCompleteSequence: 3 });
    const research = await coordinator.beginRebuild("research", {
      rebuildId: "research-build",
      generationId: "research-generation",
      startedSequence: 0,
    });
    await research.publish({ lastCompleteSequence: 9 });

    expect(coordinator.health("main")).toEqual({
      state: "ready",
      generationId: "main-generation",
      sequence: 3,
    });
    expect(coordinator.health("research")).toEqual({
      state: "ready",
      generationId: "research-generation",
      sequence: 9,
    });
    expect(fingerprintProviderRootIdentity(workspaceIdentity)).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprintProviderRootIdentity(identities.get("main")!)).not.toBe(
      fingerprintProviderRootIdentity(identities.get("research")!),
    );

    const changed = await coordinator.beginRebuild("research", {
      rebuildId: "scope-change",
      generationId: "must-not-publish",
      startedSequence: 9,
    });
    identities.set("research", identity("replacement-root", "replacement-scope"));
    await expect(changed.publish({ lastCompleteSequence: 10 })).rejects.toThrow(
      /source identity changed/,
    );
    identities.set("research", identity("research-root", "research-scope"));
    expect(coordinator.health("research")).toEqual({
      state: "ready",
      generationId: "research-generation",
      sequence: 9,
    });
  });

  it("keeps source corruption isolated and retains a leased Windows-safe prior generation", () => {
    const hanakoHome = temporaryHome("isolation");
    let now = Date.now();
    const main = createStore(hanakoHome, SOURCE_FINGERPRINT, {
      now: () => now,
    });
    const other = createStore(hanakoHome, OTHER_SOURCE_FINGERPRINT, {
      now: () => now,
    });
    main.beginRebuild({
      rebuildId: "main-1",
      generationId: "main-1",
      startedSequence: 0,
    }).publish({ lastCompleteSequence: 1 });
    other.beginRebuild({
      rebuildId: "other-1",
      generationId: "other-1",
      startedSequence: 0,
    }).publish({ lastCompleteSequence: 2 });

    const oldLease = main.acquireQueryLease();
    now += 25 * 60 * 60 * 1_000;
    main.beginRebuild({
      rebuildId: "main-2",
      generationId: "main-2",
      startedSequence: 1,
    }).publish({ lastCompleteSequence: 2 });
    main.beginRebuild({
      rebuildId: "main-3",
      generationId: "main-3",
      startedSequence: 2,
    }).publish({ lastCompleteSequence: 3 });
    const firstGeneration = path.join(
      partitionPath(hanakoHome, SOURCE_FINGERPRINT),
      "generation-main-1.sqlite",
    );
    expect(fs.existsSync(firstGeneration)).toBe(true);
    expect(oldLease.inspect().generationId).toBe("main-1");
    oldLease.release();
    expect(main.cleanupObsoleteGenerations()).toEqual(["main-1"]);
    expect(fs.existsSync(firstGeneration)).toBe(false);
    expect(fs.existsSync(path.join(
      partitionPath(hanakoHome, SOURCE_FINGERPRINT),
      "generation-main-2.sqlite",
    ))).toBe(true);

    fs.writeFileSync(
      path.join(
        partitionPath(hanakoHome, OTHER_SOURCE_FINGERPRINT),
        "generation-other-1.sqlite",
      ),
      "corrupt",
    );
    expect(other.health()).toEqual({
      state: "corrupt",
      generationId: "other-1",
      reason: "generation_integrity_failed",
    });
    expect(main.health()).toEqual({
      state: "ready",
      generationId: "main-3",
      sequence: 3,
    });
  });
});

function identity(
  opaqueRootId: string,
  scopeToken: string,
): ProviderRootIdentity {
  return {
    providerId: "local_fs",
    identityNamespace: "local_fs",
    opaqueRootId,
    scopeToken,
    caseMode: "sensitive",
  };
}

function partitionPath(
  hanakoHome: string,
  sourceFingerprint: string,
): string {
  return knowledgeIndexCompactPartitionPath(
    hanakoHome,
    WORKSPACE_FINGERPRINT,
    sourceFingerprint,
  );
}
