import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KnowledgeIndexEventCoordinator,
  type KnowledgeIndexEventDiagnostic,
  type KnowledgeIndexEventSource,
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

  it("coalesces a same-path burst into one disk reread and one incremental transaction", async () => {
    const fixture = createFixture("coalesce");
    await fixture.events.rebuild("main");
    fixture.documents.set("note.txt", document("note.txt", "latest"));

    fixture.events.accept("main", changed(1, "note.txt"));
    fixture.events.accept("main", changed(2, "note.txt", OPERATION_ID));
    expect(fixture.events.inspect("main")).toMatchObject({
      pendingCount: 1,
      lastSequence: 2,
      lastOperationId: OPERATION_ID,
    });
    await fixture.events.flush("main");

    expect(fixture.reread).toHaveBeenCalledTimes(1);
    expect(fixture.index.health("main")).toMatchObject({
      state: "ready",
      sequence: 2,
    });
    const lease = fixture.index.acquireQueryLease("main");
    expect(lease.inspect()).toMatchObject({
      resourceCount: 1,
      nonEmptyBodyFtsCount: 1,
    });
    lease.release();
  });

  it("uses the frozen debounce window before applying a queued hint", async () => {
    const fixture = createFixture("debounce");
    await fixture.events.rebuild("main");
    vi.useFakeTimers();
    fixture.documents.set("note.txt", document("note.txt", "body"));
    fixture.events.accept("main", changed(1, "note.txt"));

    await vi.advanceTimersByTimeAsync(99);
    expect(fixture.reread).not.toHaveBeenCalled();
    expect(fixture.events.inspect("main").pendingCount).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await fixture.events.flush("main");
    expect(fixture.reread).toHaveBeenCalledTimes(1);
    expect(fixture.events.inspect("main").pendingCount).toBe(0);
  });

  it("merges one internal operation without skipping distinct commit-time disk rereads", async () => {
    const fixture = createFixture("operation");
    await fixture.events.rebuild("main");
    fixture.documents.set("a.txt", document("a.txt", "a"));
    fixture.documents.set("b.txt", document("b.txt", "b"));

    fixture.events.accept("main", changed(1, "a.txt", OPERATION_ID));
    fixture.events.accept("main", changed(2, "b.txt", OPERATION_ID));
    await fixture.events.flush("main");

    expect(fixture.reread.mock.calls.map((call) => call[0]).sort()).toEqual([
      "a.txt",
      "b.txt",
    ]);
    expect(fixture.index.health("main")).toMatchObject({ sequence: 2 });
  });

  it("does not advance sequence past an event that arrives during an in-flight reread", async () => {
    const fixture = createFixture("in-flight");
    await fixture.events.rebuild("main");
    fixture.documents.set("first.txt", document("first.txt", "first"));
    fixture.documents.set("second.txt", document("second.txt", "second"));
    let releaseRead!: () => void;
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    let reportRead!: () => void;
    const readStarted = new Promise<void>((resolve) => {
      reportRead = resolve;
    });
    fixture.reread.mockImplementationOnce(async (relativePath) => {
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
    expect(fixture.reread).toHaveBeenCalledTimes(2);
  });

  it("ignores duplicate and stale replay events without rereading disk", async () => {
    const fixture = createFixture("stale");
    await fixture.events.rebuild("main");
    fixture.events.accept("main", changed(1, "note.txt"));
    fixture.events.accept("main", changed(1, "note.txt"));
    fixture.events.accept("main", changed(0, "note.txt"));
    await fixture.events.flush("main");

    expect(fixture.reread).toHaveBeenCalledTimes(1);
    expect(fixture.diagnostics.filter((item) =>
      item.reason === "stale_or_duplicate"
    )).toHaveLength(2);
  });

  it("rereads old and new rename hints and removes the missing old resource", async () => {
    const fixture = createFixture("rename", {
      "old.txt": document("old.txt", "old"),
    });
    await fixture.events.rebuild("main");
    fixture.documents.delete("old.txt");
    fixture.documents.set("new.txt", document("new.txt", "new"));

    fixture.events.accept("main", renamed(1, "old.txt", "new.txt"));
    await fixture.events.flush("main");

    expect(fixture.reread.mock.calls.map((call) => call[0]).sort()).toEqual([
      "new.txt",
      "old.txt",
    ]);
    const lease = fixture.index.acquireQueryLease("main");
    expect(lease.inspect()).toMatchObject({
      resourceCount: 1,
      nonEmptyBodyFtsCount: 1,
    });
    lease.release();
  });

  it("removes indexed facts after a delete is confirmed by disk reread", async () => {
    const fixture = createFixture("delete", {
      "gone.md": document("gone.md", "body", "page"),
    });
    await fixture.events.rebuild("main");
    fixture.documents.delete("gone.md");

    fixture.events.accept("main", deleted(1, "gone.md"));
    await fixture.events.flush("main");

    const lease = fixture.index.acquireQueryLease("main");
    expect(lease.inspect()).toMatchObject({
      resourceCount: 0,
      nonEmptyBodyFtsCount: 0,
      rowCounts: {
        resources: 0,
        pages: 0,
        headings: 0,
        links: 0,
        tags: 0,
        tasks: 0,
        contentFts: 0,
      },
    });
    lease.release();
  });

  it("rebuilds the source for a directory mutation so descendant rows converge", async () => {
    const fixture = createFixture("directory-mutation", {
      "old/a.md": document("old/a.md", "a", "page"),
      "old/b.md": document("old/b.md", "b", "page"),
    });
    await fixture.events.rebuild("main");
    fixture.documents.clear();
    fixture.documents.set("renamed/c.md", document("renamed/c.md", "c", "page"));

    fixture.events.accept(
      "main",
      renamed(1, "old", "renamed", true),
    );
    await fixture.events.flush("main");

    const lease = fixture.index.acquireQueryLease("main");
    expect(lease.inspect()).toMatchObject({
      resourceCount: 1,
      rowCounts: { resources: 1, pages: 1 },
    });
    lease.release();
    expect(fixture.diagnostics).toContainEqual(expect.objectContaining({
      state: "rebuild",
      reason: "directory_event",
      sequence: 1,
    }));
  });

  it("turns a sequence gap into a source rebuild instead of trusting event payload facts", async () => {
    const fixture = createFixture("gap");
    await fixture.events.rebuild("main");
    fixture.documents.set("one.txt", document("one.txt", "one"));
    fixture.events.accept("main", changed(1, "one.txt"));
    await fixture.events.flush("main");
    const firstGeneration = readyGeneration(fixture.index.health("main"));

    fixture.documents.set("two.txt", document("two.txt", "two"));
    fixture.events.accept("main", changed(3, "two.txt"));
    await fixture.events.flush("main");

    expect(readyGeneration(fixture.index.health("main"))).not.toBe(
      firstGeneration,
    );
    expect(fixture.diagnostics).toContainEqual(
      expect.objectContaining({
        state: "rebuild",
        reason: "sequence_gap",
        sequence: 3,
      }),
    );
  });

  it("turns a stale catch-up cursor into a source rebuild", async () => {
    const fixture = createFixture("catch-up", {
      "page.txt": document("page.txt", "one"),
    });
    await fixture.events.rebuild("main");
    const firstGeneration = readyGeneration(fixture.index.health("main"));
    fixture.documents.set("page.txt", document("page.txt", "two"));

    fixture.events.acceptCatchUp("main", {
      stale: true,
      latestSequence: 9,
      events: [],
    });
    await fixture.events.flush("main");

    expect(readyGeneration(fixture.index.health("main"))).not.toBe(
      firstGeneration,
    );
    expect(fixture.index.health("main")).toMatchObject({ sequence: 9 });
  });

  it("escalates an event storm to rebuild at the frozen rate threshold", async () => {
    const fixture = createFixture("burst", {}, {
      burstLimit: 3,
    });
    await fixture.events.rebuild("main");
    fixture.documents.set("a.txt", document("a.txt", "a"));
    fixture.documents.set("b.txt", document("b.txt", "b"));
    fixture.documents.set("c.txt", document("c.txt", "c"));

    fixture.events.accept("main", changed(1, "a.txt"));
    fixture.events.accept("main", changed(2, "b.txt"));
    fixture.events.accept("main", changed(3, "c.txt"));
    await fixture.events.flush("main");

    expect(fixture.diagnostics).toContainEqual(
      expect.objectContaining({
        state: "rebuild",
        reason: "event_burst",
      }),
    );
  });

  it("replays events received during rebuild before publishing the new generation", async () => {
    const fixture = createFixture("replay", {
      "page.txt": document("page.txt", "old"),
    });
    await fixture.events.rebuild("main");
    let releaseScan!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseScan = resolve;
    });
    let reportStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      reportStarted = resolve;
    });
    fixture.source.scan = async function* () {
      reportStarted();
      const snapshot = [...fixture.documents.values()];
      await gate;
      yield* snapshot;
    };
    const rebuilding = fixture.events.rebuild("main");
    await started;
    fixture.documents.set("during.txt", document("during.txt", "during"));
    fixture.events.accept("main", changed(1, "during.txt"));
    releaseScan();
    await rebuilding;

    expect(fixture.reread).toHaveBeenCalledWith(
      "during.txt",
      expect.any(AbortSignal),
    );
    const lease = fixture.index.acquireQueryLease("main");
    expect(lease.inspect().resourceCount).toBe(2);
    lease.release();
  });

  it("does not publish a sequence for an event that arrives after the final replay drain", async () => {
    const fixture = createFixture("late-replay", {
      "page.txt": document("page.txt", "stable"),
    });
    await fixture.events.rebuild("main");
    let revalidateCount = 0;
    Object.assign(fixture.source, {
      revalidate: async () => {
        revalidateCount += 1;
        if (revalidateCount === 2) {
          fixture.documents.set("late.txt", document("late.txt", "late"));
          fixture.events.accept("main", changed(1, "late.txt"));
        }
      },
    });

    await fixture.events.rebuild("main");

    expect(fixture.index.health("main")).toMatchObject({ sequence: 0 });
    let lease = fixture.index.acquireQueryLease("main");
    expect(lease.inspect().resourceCount).toBe(1);
    lease.release();

    await fixture.events.flush("main");
    expect(fixture.index.health("main")).toMatchObject({ sequence: 1 });
    lease = fixture.index.acquireQueryLease("main");
    expect(lease.inspect().resourceCount).toBe(2);
    lease.release();
  });

  it("cancels only an aborted caller while another rebuild waiter remains active", async () => {
    const fixture = createFixture("shared-cancel", {
      "page.txt": document("page.txt", "stable"),
    });
    await fixture.events.rebuild("main");
    let releaseScan!: () => void;
    const scanGate = new Promise<void>((resolve) => {
      releaseScan = resolve;
    });
    let reportStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      reportStarted = resolve;
    });
    fixture.source.scan = async function* () {
      reportStarted();
      await scanGate;
      yield* fixture.documents.values();
    };
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = fixture.events.rebuild("main", {
      signal: firstController.signal,
    });
    await started;
    const second = fixture.events.rebuild("main", {
      signal: secondController.signal,
    });

    firstController.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(fixture.events.inspect("main").rebuilding).toBe(true);
    releaseScan();
    await second;
    expect(fixture.index.health("main")).toMatchObject({ state: "ready" });
  });

  it("degrades on source read failure while keeping the previous generation readable", async () => {
    const fixture = createFixture("degraded", {
      "stable.txt": document("stable.txt", "stable"),
    });
    await fixture.events.rebuild("main");
    const generationId = readyGeneration(fixture.index.health("main"));
    fixture.reread.mockRejectedValueOnce(Object.assign(
      new Error("offline"),
      { code: "source_unavailable" },
    ));
    fixture.events.accept("main", changed(1, "stable.txt"));

    await expect(fixture.events.flush("main")).rejects.toMatchObject({
      code: "source_unavailable",
    });
    expect(fixture.index.health("main")).toEqual({
      state: "degraded",
      generationId,
      reason: "source_unavailable",
    });
    const lease = fixture.index.acquireQueryLease("main");
    expect(lease.inspect().generationId).toBe(generationId);
    lease.release();
  });

  it("rolls back an incremental transaction when manifest publication fails", async () => {
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
        nodeKnowledgeIndexFileSystem.writeFileFsynced(
          filePath,
          content,
          mode,
        );
      },
    };
    const fixture = createFixture("incremental-failure", {
      "stable.txt": document("stable.txt", "stable"),
    }, { fileSystem });
    await fixture.events.rebuild("main");
    const generationId = readyGeneration(fixture.index.health("main"));
    fixture.documents.set("new.txt", document("new.txt", "new"));
    fixture.events.accept("main", changed(1, "new.txt"));
    failNextManifest = true;

    await expect(fixture.events.flush("main")).rejects.toMatchObject({
      code: "knowledge_index_unavailable",
    });
    expect(fixture.index.health("main")).toEqual({
      state: "degraded",
      generationId,
      reason: "knowledge_index_unavailable",
    });
    const lease = fixture.index.acquireQueryLease("main");
    expect(lease.inspect()).toMatchObject({
      generationId,
      resourceCount: 1,
    });
    lease.release();
  });

  it("keeps source queues independent so one unavailable source does not block another", async () => {
    const fixture = createFixture("sources");
    fixture.identities.set(
      "research",
      identity("research-root", "research-scope"),
    );
    const researchDocuments = new Map([
      ["research.txt", document("research.txt", "research")],
    ]);
    const researchSource = sourceFrom(researchDocuments);
    fixture.sources.set("research", researchSource.source);
    await Promise.all([
      fixture.events.rebuild("main"),
      fixture.events.rebuild("research"),
    ]);
    fixture.reread.mockRejectedValueOnce(Object.assign(
      new Error("main offline"),
      { code: "source_unavailable" },
    ));
    researchDocuments.set("new.txt", document("new.txt", "new"));
    fixture.events.accept("main", changed(1, "main.txt"));
    fixture.events.accept("research", changed(1, "new.txt"));

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

  it("keeps diagnostics correlation-only and never exposes event path or body", async () => {
    const fixture = createFixture("diagnostics");
    await fixture.events.rebuild("main");
    fixture.documents.set("private.txt", document("private.txt", "secret body"));
    fixture.events.accept(
      "main",
      changed(1, "private.txt", OPERATION_ID),
    );
    await fixture.events.flush("main");

    const serialized = JSON.stringify(fixture.diagnostics);
    expect(serialized).toContain(OPERATION_ID);
    expect(serialized).not.toContain("private.txt");
    expect(serialized).not.toContain("secret body");
  });

  function createFixture(
    label: string,
    initial: Record<string, KnowledgeIndexResourceDocument> = {},
    eventOptions: {
      burstLimit?: number;
      fileSystem?: KnowledgeIndexFileSystem;
    } = {},
  ) {
    const root = fs.mkdtempSync(path.join(
      os.tmpdir(),
      `hana-index-events-${label}-`,
    ));
    cleanup.add(root);
    const identities = new Map<string, ProviderRootIdentity>([
      ["main", identity("main-root", "main-scope")],
    ]);
    const index = new KnowledgeIndexCoordinator({
      hanakoHome: root,
      workspaceIdentity: identity("workspace-root", "workspace-scope"),
      sourceRegistry: {
        rootIdentity(sourceKey) {
          const value = identities.get(sourceKey);
          if (!value) throw new Error("source unavailable");
          return value;
        },
        async revalidate(sourceKey) {
          if (!identities.has(sourceKey)) throw new Error("source unavailable");
        },
      },
      extractorContractVersion: "knowledge-index-v1",
      hostId: "event-host",
      pid: 42_001,
      fileSystem: eventOptions.fileSystem,
    });
    const documents = new Map(Object.entries(initial));
    const sourceFixture = sourceFrom(documents);
    const sources = new Map<string, KnowledgeIndexEventSource>([
      ["main", sourceFixture.source],
    ]);
    const diagnostics: KnowledgeIndexEventDiagnostic[] = [];
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
      burstLimit: eventOptions.burstLimit,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    return {
      diagnostics,
      documents,
      events,
      identities,
      index,
      reread: sourceFixture.reread,
      source: sourceFixture.source,
      sources,
    };
  }
});

const OPERATION_ID = "123e4567-e89b-42d3-a456-426614174000";

function sourceFrom(
  documents: Map<string, KnowledgeIndexResourceDocument>,
) {
  const reread = vi.fn(async (relativePath: string) =>
    documents.get(relativePath) ?? null
  );
  const source: KnowledgeIndexEventSource & {
    scan: KnowledgeIndexEventSource["scan"];
  } = {
    eventPaths(event) {
      if (event.type === "resource.renamed") {
        return [
          resourcePath(event.oldResource),
          resourcePath(event.newResource),
        ];
      }
      return [resourcePath(event.resource)];
    },
    reread,
    async *scan() {
      for (const entry of [...documents.entries()].sort(
        ([left], [right]) => left.localeCompare(right),
      )) {
        yield entry[1];
      }
    },
  };
  return { reread, source };
}

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

function resourcePath(resource: ResourceDescriptor): string {
  return resource.kind === "local-file" || resource.kind === "mount"
    ? resource.path
    : "";
}
