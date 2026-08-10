import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KnowledgeIndexEventCoordinator,
  type KnowledgeIndexEventDiagnostic,
  type KnowledgeIndexEventSource,
  type KnowledgeIndexScopedRepairRequest,
} from "../core/knowledge-workspace/knowledge-index-event-coordinator.ts";
import {
  KnowledgeIndexCoordinator,
} from "../core/knowledge-workspace/knowledge-index-coordinator.ts";
import {
  foldSearchText,
  nodeKnowledgeIndexFileSystem,
  type KnowledgeIndexFileSystem,
  type KnowledgeIndexResourceDocument,
} from "../lib/knowledge-workspace/knowledge-index-store.ts";
import type {
  ProviderRootIdentity,
  ResourceDescriptor,
  ResourceEvent,
} from "../lib/resource-io/types.ts";

describe("knowledge index event coordinator", () => {
  const cleanup = new Set<string>();

  afterEach(() => {
    vi.useRealTimers();
    for (const root of cleanup) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    cleanup.clear();
  });

  it("coalesces saved-disk create and modify events into one scoped reread", async () => {
    const fixture = createFixture("coalesce", {
      "note.txt": document("note.txt", "old"),
    });
    await supplySourceDifference(fixture, "main", 0);
    fixture.documents.set("note.txt", document("note.txt", "latest"));

    fixture.events.accept("main", changed(1, "note.txt"));
    fixture.events.accept("main", changed(2, "note.txt", OPERATION_ID));
    await fixture.events.flush("main");

    expect(fixture.reread).toHaveBeenCalledTimes(2);
    expect(fixture.reread.mock.calls.at(-1)?.[0]).toBe("note.txt");
    expect(fixture.index.health("main")).toMatchObject({
      state: "ready",
      sequence: 2,
    });
    const lease = fixture.index.acquireQueryLease("main");
    expect(lease.inspect()).toMatchObject({ resourceCount: 1 });
    lease.release();
  });

  it("uses the frozen debounce window before applying a queued hint", async () => {
    vi.useFakeTimers();
    const fixture = createFixture("debounce", {
      "note.txt": document("note.txt", "before"),
    }, { debounceMs: 100 });
    await supplySourceDifference(fixture, "main", 0);
    fixture.reread.mockClear();
    fixture.documents.set("note.txt", document("note.txt", "after"));

    fixture.events.accept("main", changed(1, "note.txt"));
    await vi.advanceTimersByTimeAsync(99);
    expect(fixture.reread).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.reread).toHaveBeenCalledWith("note.txt", undefined);
    expect(fixture.index.health("main")).toMatchObject({ sequence: 1 });
  });

  it("keeps distinct paths in one operation as distinct saved-disk rereads", async () => {
    const fixture = createFixture("multi-path", {
      "first.txt": document("first.txt", "first"),
      "second.txt": document("second.txt", "second"),
    });
    await supplySourceDifference(fixture, "main", 0);
    fixture.reread.mockClear();
    fixture.documents.set("first.txt", document("first.txt", "first updated"));
    fixture.documents.set("second.txt", document("second.txt", "second updated"));

    fixture.events.accept("main", changed(1, "first.txt", OPERATION_ID));
    fixture.events.accept("main", changed(2, "second.txt", OPERATION_ID));
    await fixture.events.flush("main");

    expect(fixture.reread.mock.calls.map((call) => call[0]).sort()).toEqual([
      "first.txt",
      "second.txt",
    ]);
    expect(fixture.index.health("main")).toMatchObject({ sequence: 2 });
  });

  it("does not advance the durable sequence past an event received during an in-flight reread", async () => {
    const fixture = createFixture("in-flight", {
      "first.txt": document("first.txt", "first"),
      "second.txt": document("second.txt", "second"),
    });
    await supplySourceDifference(fixture, "main", 0);
    fixture.reread.mockClear();
    let releaseRead!: () => void;
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    let reportRead!: () => void;
    const readStarted = new Promise<void>((resolve) => {
      reportRead = resolve;
    });
    fixture.reread.mockImplementationOnce(async (relativePath: string) => {
      reportRead();
      await readGate;
      return fixture.documents.get(relativePath) ?? null;
    });

    fixture.events.accept("main", changed(1, "first.txt"));
    const firstFlush = fixture.events.flush("main");
    await readStarted;
    fixture.events.accept("main", changed(2, "second.txt"));
    releaseRead();
    await firstFlush;

    expect(fixture.index.health("main")).toMatchObject({ sequence: 1 });
    expect(fixture.events.inspect("main").pendingCount).toBe(1);
    await fixture.events.flush("main");
    expect(fixture.index.health("main")).toMatchObject({ sequence: 2 });
  });

  it("ignores duplicate and stale event hints without rereading disk", async () => {
    const fixture = createFixture("stale-events", {
      "note.txt": document("note.txt", "note"),
    });
    await supplySourceDifference(fixture, "main", 0);
    fixture.reread.mockClear();

    fixture.events.accept("main", changed(1, "note.txt"));
    fixture.events.accept("main", changed(1, "note.txt"));
    fixture.events.accept("main", changed(0, "note.txt"));
    await fixture.events.flush("main");

    expect(fixture.reread).toHaveBeenCalledTimes(1);
    expect(fixture.diagnostics.filter((item) =>
      item.reason === "stale_or_duplicate"
    )).toHaveLength(2);
  });

  it("converges rename and delete through resource-scoped saved-disk rereads", async () => {
    const fixture = createFixture("rename-delete", {
      "old.txt": document("old.txt", "old"),
    });
    await supplySourceDifference(fixture, "main", 0);
    fixture.documents.delete("old.txt");
    fixture.documents.set("new.txt", document("new.txt", "new"));

    fixture.events.accept("main", renamed(1, "old.txt", "new.txt"));
    await fixture.events.flush("main");
    fixture.documents.delete("new.txt");
    fixture.events.accept("main", deleted(2, "new.txt"));
    await fixture.events.flush("main");

    const lease = fixture.index.acquireQueryLease("main");
    expect(lease.inspect()).toMatchObject({ resourceCount: 0 });
    lease.release();
  });

  it("requests one shared source repair for a dropped cursor and applies the supplied difference", async () => {
    const fixture = createFixture("gap", {
      "stable.txt": document("stable.txt", "stable"),
    });
    await supplySourceDifference(fixture, "main", 0);
    fixture.documents.set("stable.txt", document("stable.txt", "repaired"));

    fixture.events.accept("main", changed(2, "stable.txt"));
    fixture.events.accept("main", changed(3, "stable.txt"));

    expect(fixture.repairRequests).toEqual([
      expect.objectContaining({
        sourceKey: "main",
        afterSequence: 2,
        reason: "sequence_gap",
      }),
    ]);
    await fixture.events.acceptSharedBaseline({
      type: "shared-baseline-difference",
      sourceKey: "main",
      cursor: 3,
      coverage: "resources",
      changes: [{ relativePath: "stable.txt", changeType: "upsert" }],
    });

    expect(fixture.events.inspect("main")).toMatchObject({
      repairRequested: false,
      lastSequence: 3,
    });
    expect(fixture.index.health("main")).toMatchObject({
      state: "ready",
      sequence: 3,
    });
  });

  it("publishes a current shared source baseline after an older repair cursor and replays only later events", async () => {
    const fixture = createFixture("current-source-baseline", {
      "base.txt": document("base.txt", "base"),
    });
    await supplySourceDifference(fixture, "main", 0);
    fixture.documents.set("missed.txt", document("missed.txt", "missed"));
    fixture.documents.set("six.txt", document("six.txt", "six"));
    fixture.documents.set("seven.txt", document("seven.txt", "seven"));

    fixture.events.accept("main", changed(5, "missed.txt"));
    fixture.events.accept("main", changed(6, "six.txt"));
    fixture.events.accept("main", changed(7, "seven.txt"));
    expect(fixture.repairRequests).toEqual([
      expect.objectContaining({
        sourceKey: "main",
        afterSequence: 5,
        reason: "sequence_gap",
      }),
    ]);

    let releaseRead!: () => void;
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    let reportRead!: () => void;
    const readStarted = new Promise<void>((resolve) => {
      reportRead = resolve;
    });
    fixture.reread.mockImplementation(async (relativePath: string) => {
      if (relativePath === "base.txt") {
        reportRead();
        await readGate;
      }
      return fixture.documents.get(relativePath) ?? null;
    });

    const rebuilding = fixture.events.acceptSharedBaseline({
      type: "shared-baseline-difference",
      sourceKey: "main",
      cursor: 7,
      coverage: "source",
      changes: [
        "base.txt",
        "missed.txt",
        "six.txt",
        "seven.txt",
      ].map((relativePath) => ({ relativePath, changeType: "upsert" as const })),
    });
    await readStarted;
    fixture.documents.set("eight.txt", document("eight.txt", "eight"));
    fixture.events.accept("main", changed(8, "eight.txt"));
    releaseRead();
    await rebuilding;

    expect(fixture.repairRequests).toHaveLength(1);
    expect(fixture.events.inspect("main")).toMatchObject({
      repairRequested: false,
      lastSequence: 8,
    });
    expect(fixture.index.health("main")).toMatchObject({
      state: "ready",
      sequence: 8,
    });
    const lease = fixture.index.acquireQueryLease("main");
    expect(lease.inspect()).toMatchObject({ resourceCount: 5 });
    lease.release();
  });

  it("requests one shared source repair for a stale catch-up cursor", async () => {
    const fixture = createFixture("stale-cursor", {
      "page.txt": document("page.txt", "before"),
    });
    await supplySourceDifference(fixture, "main", 0);
    fixture.documents.set("page.txt", document("page.txt", "after"));

    fixture.events.acceptCatchUp("main", {
      stale: true,
      latestSequence: 9,
      events: [],
    });
    fixture.events.acceptCatchUp("main", {
      stale: true,
      latestSequence: 10,
      events: [],
    });

    expect(fixture.repairRequests).toEqual([
      expect.objectContaining({
        sourceKey: "main",
        afterSequence: 9,
        reason: "catch_up_stale",
      }),
    ]);
    await fixture.events.acceptSharedBaseline({
      type: "shared-baseline-difference",
      sourceKey: "main",
      cursor: 10,
      coverage: "resources",
      changes: [{ relativePath: "page.txt", changeType: "upsert" }],
    });
    expect(fixture.index.health("main")).toMatchObject({ sequence: 10 });
  });

  it("requests a shared source difference for a directory event instead of walking descendants", async () => {
    const fixture = createFixture("directory", {
      "old/a.md": document("old/a.md", "a"),
    });
    await supplySourceDifference(fixture, "main", 0);

    fixture.events.accept("main", renamed(1, "old", "new", true));

    expect(fixture.repairRequests).toEqual([
      expect.objectContaining({ reason: "directory_event", sourceKey: "main" }),
    ]);
    expect(fixture.reread).toHaveBeenCalledTimes(1);
  });

  it("escalates an event burst to one shared repair at the configured threshold", async () => {
    const fixture = createFixture("burst", {}, { burstLimit: 3 });
    await supplySourceDifference(fixture, "main", 0);
    fixture.reread.mockClear();
    fixture.documents.set("a.txt", document("a.txt", "a"));
    fixture.documents.set("b.txt", document("b.txt", "b"));
    fixture.documents.set("c.txt", document("c.txt", "c"));

    fixture.events.accept("main", changed(1, "a.txt"));
    fixture.events.accept("main", changed(2, "b.txt"));
    fixture.events.accept("main", changed(3, "c.txt"));
    fixture.events.accept("main", changed(4, "c.txt"));

    expect(fixture.repairRequests).toEqual([
      expect.objectContaining({ reason: "event_burst", sourceKey: "main" }),
    ]);
    expect(fixture.reread).not.toHaveBeenCalled();
  });

  it("replays events received while a shared source baseline is building before publication", async () => {
    const fixture = createFixture("shared-replay", {
      "page.txt": document("page.txt", "old"),
    });
    await supplySourceDifference(fixture, "main", 0);
    let releaseRead!: () => void;
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    let reportRead!: () => void;
    const readStarted = new Promise<void>((resolve) => {
      reportRead = resolve;
    });
    fixture.reread.mockImplementation(async (relativePath: string) => {
      if (relativePath === "page.txt") {
        reportRead();
        await readGate;
      }
      return fixture.documents.get(relativePath) ?? null;
    });

    const rebuilding = fixture.events.acceptSharedBaseline({
      type: "shared-baseline-difference",
      sourceKey: "main",
      cursor: 0,
      coverage: "source",
      changes: [{ relativePath: "page.txt", changeType: "upsert" }],
    });
    await readStarted;
    fixture.documents.set("during.txt", document("during.txt", "during"));
    fixture.events.accept("main", changed(1, "during.txt"));
    releaseRead();
    await rebuilding;

    expect(fixture.index.health("main")).toMatchObject({ sequence: 1 });
    const lease = fixture.index.acquireQueryLease("main");
    expect(lease.inspect()).toMatchObject({ resourceCount: 2 });
    lease.release();
  });

  it("does not publish a late replay cursor until the event is separately applied", async () => {
    const fixture = createFixture("late-shared-replay", {
      "page.txt": document("page.txt", "stable"),
    });
    await supplySourceDifference(fixture, "main", 0);
    let revalidations = 0;
    Object.assign(fixture.sources.get("main")!, {
      revalidate: async () => {
        revalidations += 1;
        if (revalidations === 2) {
          fixture.documents.set("late.txt", document("late.txt", "late"));
          fixture.events.accept("main", changed(1, "late.txt"));
        }
      },
    });

    await fixture.events.acceptSharedBaseline({
      type: "shared-baseline-difference",
      sourceKey: "main",
      cursor: 0,
      coverage: "source",
      changes: [{ relativePath: "page.txt", changeType: "upsert" }],
    });

    expect(fixture.index.health("main")).toMatchObject({ sequence: 0 });
    await fixture.events.flush("main");
    expect(fixture.index.health("main")).toMatchObject({ sequence: 1 });
    const lease = fixture.index.acquireQueryLease("main");
    expect(lease.inspect()).toMatchObject({ resourceCount: 2 });
    lease.release();
  });

  it("cancels only one shared repair caller while another waiter remains active", async () => {
    const fixture = createFixture("shared-cancel", {
      "page.txt": document("page.txt", "stable"),
    });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = fixture.events.rebuild("main", {
      signal: firstController.signal,
    });
    const second = fixture.events.rebuild("main", {
      signal: secondController.signal,
    });

    firstController.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(fixture.repairRequests).toHaveLength(1);
    await fixture.events.acceptSharedBaseline({
      type: "shared-baseline-difference",
      sourceKey: "main",
      cursor: 0,
      coverage: "source",
      changes: [{ relativePath: "page.txt", changeType: "upsert" }],
    });
    await second;
    expect(fixture.index.health("main")).toMatchObject({ state: "ready" });
  });

  it("keeps the last committed generation readable when a shared repair read fails and retries", async () => {
    const fixture = createFixture("reader-retry", {
      "stable.txt": document("stable.txt", "stable"),
    });
    await supplySourceDifference(fixture, "main", 0);
    const generationId = readyGeneration(fixture.index.health("main"));
    fixture.documents.set("stable.txt", document("stable.txt", "repaired"));
    fixture.reread.mockRejectedValueOnce(Object.assign(
      new Error("offline"),
      { code: "source_unavailable" },
    ));
    const difference = {
      type: "shared-baseline-difference" as const,
      sourceKey: "main",
      cursor: 1,
      coverage: "resources" as const,
      changes: [{ relativePath: "stable.txt", changeType: "upsert" as const }],
    };

    await expect(fixture.events.acceptSharedBaseline(difference)).rejects
      .toMatchObject({ code: "source_unavailable" });
    expect(fixture.index.health("main")).toEqual({
      state: "degraded",
      generationId,
      reason: "source_unavailable",
    });
    await fixture.events.acceptSharedBaseline(difference);
    expect(fixture.index.health("main")).toMatchObject({
      state: "ready",
      sequence: 1,
    });
  });

  it("keeps a failed shared repair barrier active until a replacement baseline publishes", async () => {
    const fixture = createFixture("failed-barrier", {
      "stable.txt": document("stable.txt", "stable"),
    });
    await supplySourceDifference(fixture, "main", 0);
    const generationId = readyGeneration(fixture.index.health("main"));
    fixture.reread.mockClear();
    fixture.reread.mockRejectedValueOnce(Object.assign(
      new Error("offline"),
      { code: "source_unavailable" },
    ));

    await expect(fixture.events.acceptSharedBaseline({
      type: "shared-baseline-difference",
      sourceKey: "main",
      cursor: 1,
      coverage: "resources",
      changes: [{ relativePath: "stable.txt", changeType: "upsert" }],
    })).rejects.toMatchObject({ code: "source_unavailable" });
    fixture.documents.set("stable.txt", document("stable.txt", "recovered"));
    fixture.events.accept("main", changed(2, "stable.txt"));
    await fixture.events.flush("main");

    expect(fixture.events.inspect("main")).toMatchObject({
      repairRequested: true,
      replayCount: 1,
    });
    expect(fixture.index.health("main")).toEqual({
      state: "degraded",
      generationId,
      reason: "source_unavailable",
    });
    expect(fixture.reread).toHaveBeenCalledTimes(1);

    const retry = fixture.events.rebuild("main");
    expect(fixture.repairRequests).toEqual([
      expect.objectContaining({ sourceKey: "main", reason: "requested" }),
    ]);
    await fixture.events.acceptSharedBaseline({
      type: "shared-baseline-difference",
      sourceKey: "main",
      cursor: 2,
      coverage: "source",
      changes: [{ relativePath: "stable.txt", changeType: "upsert" }],
    });
    await retry;
    expect(fixture.index.health("main")).toMatchObject({
      state: "ready",
      sequence: 2,
    });
  });

  it("ignores a stale shared baseline below the last accepted cursor", async () => {
    const fixture = createFixture("stale-shared", {
      "stable.txt": document("stable.txt", "stable"),
    });
    await supplySourceDifference(fixture, "main", 0);
    fixture.reread.mockClear();
    fixture.documents.set("stable.txt", document("stable.txt", "new"));
    await fixture.events.acceptSharedBaseline({
      type: "shared-baseline-difference",
      sourceKey: "main",
      cursor: 5,
      coverage: "resources",
      changes: [{ relativePath: "stable.txt", changeType: "upsert" }],
    });
    fixture.reread.mockClear();

    await fixture.events.acceptSharedBaseline({
      type: "shared-baseline-difference",
      sourceKey: "main",
      cursor: 4,
      coverage: "resources",
      changes: [{ relativePath: "stable.txt", changeType: "upsert" }],
    });

    expect(fixture.reread).not.toHaveBeenCalled();
    expect(fixture.index.health("main")).toMatchObject({ sequence: 5 });
    expect(fixture.diagnostics).toContainEqual(expect.objectContaining({
      state: "ignored",
      reason: "stale_shared_baseline",
    }));
  });

  it("rolls back a failed scoped index commit and retries the retained event", async () => {
    let failNextManifest = false;
    const fileSystem: KnowledgeIndexFileSystem = {
      ...nodeKnowledgeIndexFileSystem,
      writeFileFsynced(filePath, content, mode) {
        if (
          failNextManifest
          && path.basename(filePath) === "current.json.tmp"
        ) {
          failNextManifest = false;
          throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
        }
        nodeKnowledgeIndexFileSystem.writeFileFsynced(filePath, content, mode);
      },
    };
    const fixture = createFixture("index-retry", {
      "stable.txt": document("stable.txt", "stable"),
    }, { fileSystem });
    await supplySourceDifference(fixture, "main", 0);
    const generationId = readyGeneration(fixture.index.health("main"));
    fixture.documents.set("stable.txt", document("stable.txt", "changed"));
    fixture.events.accept("main", changed(1, "stable.txt"));
    failNextManifest = true;

    await expect(fixture.events.flush("main")).rejects.toMatchObject({
      code: "knowledge_index_unavailable",
    });
    expect(fixture.index.health("main")).toEqual({
      state: "degraded",
      generationId,
      reason: "knowledge_index_unavailable",
    });
    await fixture.events.flush("main");
    expect(fixture.index.health("main")).toMatchObject({
      state: "ready",
      sequence: 1,
    });
  });

  it("keeps a failed source repair isolated from another source", async () => {
    const fixture = createFixture("independent", {
      "main.txt": document("main.txt", "main"),
    });
    fixture.identities.set("research", providerIdentity("research-root", "research-scope"));
    const researchDocuments = new Map<string, KnowledgeIndexResourceDocument>([
      ["research.txt", document("research.txt", "research")],
    ]);
    fixture.addSource("research", researchDocuments);
    await Promise.all([
      supplySourceDifference(fixture, "main", 0),
      supplySourceDifference(fixture, "research", 0),
    ]);
    fixture.reread.mockRejectedValueOnce(Object.assign(
      new Error("main unavailable"),
      { code: "source_unavailable" },
    ));
    researchDocuments.set("research.txt", document("research.txt", "updated"));
    fixture.events.accept("main", changed(1, "main.txt"));
    fixture.events.accept("research", changed(1, "research.txt"));

    const results = await Promise.allSettled([
      fixture.events.flush("main"),
      fixture.events.flush("research"),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      "rejected",
      "fulfilled",
    ]);
    expect(fixture.index.health("research")).toMatchObject({
      state: "ready",
      sequence: 1,
    });
  });

  it("keeps diagnostics correlation-only when applying shared differences", async () => {
    const fixture = createFixture("diagnostics", {
      "private.txt": document("private.txt", "secret body"),
    });
    await supplySourceDifference(fixture, "main", 0);
    fixture.documents.set("private.txt", document("private.txt", "new secret body"));
    fixture.events.accept("main", changed(1, "private.txt", OPERATION_ID));
    await fixture.events.flush("main");

    const serialized = JSON.stringify(fixture.diagnostics);
    expect(serialized).toContain(OPERATION_ID);
    expect(serialized).not.toContain("private.txt");
    expect(serialized).not.toContain("secret body");
  });

  function createFixture(
    label: string,
    initial: Record<string, KnowledgeIndexResourceDocument> = {},
    options: {
      burstLimit?: number;
      debounceMs?: number;
      maxDebounceMs?: number;
      fileSystem?: KnowledgeIndexFileSystem;
    } = {},
  ) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `hana-index-events-${label}-`));
    cleanup.add(root);
    const identities = new Map<string, ProviderRootIdentity>([
      ["main", providerIdentity("main-root", "main-scope")],
    ]);
    const index = new KnowledgeIndexCoordinator({
      hanakoHome: root,
      workspaceIdentity: providerIdentity("workspace-root", "workspace-scope"),
      sourceRegistry: {
        rootIdentity(sourceKey) {
          const identity = identities.get(sourceKey);
          if (!identity) throw new Error("source unavailable");
          return identity;
        },
        async revalidate(sourceKey) {
          if (!identities.has(sourceKey)) throw new Error("source unavailable");
        },
      },
      extractorContractVersion: "knowledge-index-v1",
      hostId: "event-host",
      pid: 42_001,
      fileSystem: options.fileSystem,
    });
    const documents = new Map(Object.entries(initial));
    const sources = new Map<string, KnowledgeIndexEventSource>();
    const rereads = new Map<string, ReturnType<typeof vi.fn>>();
    const addSource = (
      sourceKey: string,
      entries: Map<string, KnowledgeIndexResourceDocument>,
    ) => {
      const reread = vi.fn(async (relativePath: string) =>
        entries.get(relativePath) ?? null
      );
      rereads.set(sourceKey, reread);
      sources.set(sourceKey, {
        eventPaths(event) {
          if (event.type === "resource.renamed") {
            return [resourcePath(event.oldResource), resourcePath(event.newResource)];
          }
          return [resourcePath(event.resource)];
        },
        reread,
        async *scanMountedSource() {
          for (const document of [...entries.values()].sort((left, right) =>
            left.resource.relativePath.localeCompare(right.resource.relativePath)
          )) {
            yield document;
          }
        },
      });
    };
    addSource("main", documents);
    const diagnostics: KnowledgeIndexEventDiagnostic[] = [];
    const repairRequests: KnowledgeIndexScopedRepairRequest[] = [];
    let nextId = 0;
    const events = new KnowledgeIndexEventCoordinator({
      indexCoordinator: index,
      sourceFor(sourceKey) {
        const source = sources.get(sourceKey);
        if (!source) throw new Error("source unavailable");
        return source;
      },
      createId: () => `event-${++nextId}`,
      yieldNow: async () => {},
      burstLimit: options.burstLimit,
      debounceMs: options.debounceMs,
      maxDebounceMs: options.maxDebounceMs,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      onScopedRepairRequested: (request) => repairRequests.push(request),
    });
    return {
      addSource,
      diagnostics,
      documents,
      events,
      identities,
      index,
      repairRequests,
      reread: rereads.get("main")!,
      rereads,
      sources,
    };
  }
});

async function supplySourceDifference(
  fixture: {
    documents: Map<string, KnowledgeIndexResourceDocument>;
    events: KnowledgeIndexEventCoordinator;
    sources: Map<string, KnowledgeIndexEventSource>;
  },
  sourceKey: string,
  cursor: number,
): Promise<void> {
  const source = fixture.sources.get(sourceKey);
  if (!source) throw new Error("source fixture is unavailable");
  const entries = sourceKey === "main"
    ? fixture.documents
    : undefined;
  const paths = entries
    ? [...entries.keys()]
    : [];
  await fixture.events.acceptSharedBaseline({
    type: "shared-baseline-difference",
    sourceKey,
    cursor,
    coverage: "source",
    changes: paths.map((relativePath) => ({ relativePath, changeType: "upsert" })),
  });
}

const OPERATION_ID = "123e4567-e89b-42d3-a456-426614174000";

function document(
  relativePath: string,
  body: string,
  kind: "text" | "page" = "text",
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
      kind,
      sizeBytes: Buffer.byteLength(body),
      mtimeMs: 1,
      versionToken: `version:${body}`,
      contentState: "indexed",
      contentReason: null,
      indexedAtMs: 1,
    },
    page: kind === "page"
      ? {
        title: basename.slice(0, -extension.length),
        frontmatterJson: null,
        bodyText: body,
        bodyHash: "a".repeat(64),
      }
      : null,
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

function changed(
  sequence: number,
  relativePath: string,
  operationId?: string,
): ResourceEvent {
  return {
    type: "resource.changed",
    changeType: "modified",
    resourceKey: `mount:main:${relativePath}`,
    resource: {
      kind: "mount",
      mountId: "main",
      path: relativePath,
      isDirectory: false,
    },
    version: { sequence },
    source: "provider_watch",
    sequence,
    occurredAt: new Date(sequence).toISOString(),
    ...(operationId ? { operationId } : {}),
  };
}

function deleted(sequence: number, relativePath: string): ResourceEvent {
  return {
    type: "resource.deleted",
    resourceKey: `mount:main:${relativePath}`,
    resource: {
      kind: "mount",
      mountId: "main",
      path: relativePath,
      isDirectory: false,
    },
    source: "provider_watch",
    sequence,
    occurredAt: new Date(sequence).toISOString(),
  };
}

function renamed(
  sequence: number,
  oldPath: string,
  newPath: string,
  isDirectory = false,
): ResourceEvent {
  return {
    type: "resource.renamed",
    oldResourceKey: `mount:main:${oldPath}`,
    newResourceKey: `mount:main:${newPath}`,
    oldResource: {
      kind: "mount",
      mountId: "main",
      path: oldPath,
      isDirectory,
    },
    newResource: {
      kind: "mount",
      mountId: "main",
      path: newPath,
      isDirectory,
    },
    source: "provider_watch",
    sequence,
    occurredAt: new Date(sequence).toISOString(),
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

function resourcePath(resource: ResourceDescriptor): string {
  return resource.kind === "local-file" || resource.kind === "mount"
    ? resource.path
    : "";
}
