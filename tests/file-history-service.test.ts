import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FileHistoryService,
  FileHistoryStore,
  historyStorePathForKey,
  type FileHistoryRead,
} from "../lib/file-history/file-history-service.ts";
import { MAX_SNAPSHOT_BYTES } from "../lib/file-history/text-file-policy.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

type ObservationListener = (observation: any) => void | Promise<void>;
type EventListener = (event: any) => void | Promise<void>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function makeFixture({
  privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-file-history-private-")),
  createStore,
  allowPrivateStore = true,
}: {
  privateRoot?: string;
  createStore?: (input: any) => FileHistoryStore;
  allowPrivateStore?: boolean;
} = {}) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "hana-file-history-main-"));
  const contents = new Map<string, { content: Buffer; versionToken?: string }>();
  let observationListener: ObservationListener | null = null;
  let eventListener: EventListener | null = null;
  const release = vi.fn(async () => {});
  const subscribe = vi.fn(async (listener: ObservationListener) => {
    observationListener = listener;
    return { release };
  });
  const eventRelease = vi.fn(() => {});
  const subscribeEvents = vi.fn((listener: EventListener) => {
    eventListener = listener;
    return eventRelease;
  });

  const service = new FileHistoryService({
    privateStoreRoot: privateRoot,
    createStore,
    debounceMs: 0,
    mergeWindowMs: 0,
  });
  const binding = {
    sourceKey: "main" as const,
    historyStoreKey: "opaque-main-history-key-01",
    verifyPrivateStorePath: vi.fn(async (candidate: string) => (
      allowPrivateStore && path.resolve(candidate).startsWith(`${path.resolve(privateRoot)}${path.sep}`)
    )),
    subscribe,
    subscribeEvents,
    read: vi.fn(async (relativePath: string): Promise<FileHistoryRead | null> => contents.get(relativePath) ?? null),
  };

  cleanups.push(() => service.close());
  cleanups.push(() => fs.rmSync(workspace, { recursive: true, force: true }));
  cleanups.push(() => fs.rmSync(privateRoot, { recursive: true, force: true }));
  return {
    workspace,
    privateRoot,
    contents,
    service,
    binding,
    subscribe,
    subscribeEvents,
    release,
    eventRelease,
    emitObservation: async (observation: unknown) => observationListener?.(observation),
    emitEvent: async (event: unknown) => eventListener?.(event),
  };
}

function makeCountingStore() {
  let recorded = 0;
  let retentionRuns = 0;
  const store = {
    recordSnapshot: () => ({ status: "inserted" as const, snapshotId: recorded += 1 }),
    enforceRetention: () => { retentionRuns += 1; },
    listFiles: () => [],
    listVersions: () => [],
    getSnapshotContent: () => { throw new Error("not used by this test"); },
    getSnapshotDiff: () => [],
    markDeleted: () => {},
    renamePath: () => false,
    close: () => {},
  } as unknown as FileHistoryStore;
  return {
    store,
    recorded: () => recorded,
    retentionRuns: () => retentionRuns,
  };
}

describe("FileHistoryService", () => {
  it("captures only shared main baseline facts into a private opaque-key store", async () => {
    const fixture = makeFixture();
    fixture.contents.set("notes/a.md", { content: Buffer.from("hello"), versionToken: "v1" });

    await fixture.service.activateMain(fixture.binding);
    await fixture.emitObservation({
      type: "workspace.baseline",
      sourceKey: "main",
      relativePath: "notes/a.md",
      entryKind: "file",
      cursor: 1,
      repairCycle: 1,
    });
    await fixture.service.waitForIdle();

    expect(fixture.service.listFiles()).toMatchObject([{ relPath: "notes/a.md", deletedAt: null }]);
    expect(fixture.service.listVersions("notes/a.md")[0]).toMatchObject({ origin: "baseline", versionToken: "v1" });
    const dbPath = historyStorePathForKey(fixture.privateRoot, fixture.binding.historyStoreKey);
    expect(dbPath).toContain(path.join(fixture.privateRoot, "file-history"));
    expect(dbPath).not.toContain(fixture.workspace);
    expect(fixture.binding.verifyPrivateStorePath).toHaveBeenCalledWith(dbPath);
  });

  it("uses projected main events for rename continuity and move-out deletion", async () => {
    const fixture = makeFixture();
    fixture.contents.set("old.md", { content: Buffer.from("before"), versionToken: "v1" });
    await fixture.service.activateMain(fixture.binding);
    await fixture.emitObservation({ type: "workspace.baseline", sourceKey: "main", relativePath: "old.md", entryKind: "file", cursor: 1, repairCycle: 1 });
    await fixture.service.waitForIdle();

    fixture.contents.delete("old.md");
    fixture.contents.set("renamed.md", { content: Buffer.from("after"), versionToken: "v2" });
    await fixture.emitEvent({
      type: "main.resource.renamed",
      sourceKey: "main",
      oldRelativePath: "old.md",
      newRelativePath: "renamed.md",
      versionToken: "v2",
      operationContext: "agent_tool",
    });
    await fixture.service.waitForIdle();
    expect(fixture.service.listVersions("old.md")).toHaveLength(0);
    expect(fixture.service.listVersions("renamed.md")).toHaveLength(2);

    await fixture.emitEvent({
      type: "main.resource.renamed",
      sourceKey: "main",
      oldRelativePath: "renamed.md",
      newRelativePath: null,
    });
    expect(fixture.service.listFiles().find(file => file.relPath === "renamed.md")?.deletedAt).not.toBeNull();
  });

  it("rejects mount and remote bindings before subscribing or creating a store", async () => {
    for (const sourceKey of ["mount", "remote"]) {
      const fixture = makeFixture();
      await expect(fixture.service.activateMain({ ...fixture.binding, sourceKey } as any)).rejects.toThrow(/main/i);
      expect(fixture.subscribe).not.toHaveBeenCalled();
      expect(fs.existsSync(path.join(fixture.privateRoot, "file-history"))).toBe(false);
    }
  });

  it("rejects a workspace-local store before store initialization", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "hana-file-history-main-"));
    const fixture = makeFixture({ privateRoot: workspace, allowPrivateStore: false });
    await expect(fixture.service.activateMain(fixture.binding)).rejects.toThrow(/private/i);
    expect(fixture.subscribe).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(workspace, "file-history"))).toBe(false);
  });

  it("rejects unsafe opaque private-store keys before path derivation", () => {
    const privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-file-history-private-"));
    cleanups.push(() => fs.rmSync(privateRoot, { recursive: true, force: true }));

    for (const key of [
      "C:/workspace-key",
      "C:workspace-key",
      "opaque\u0000key",
      "opaque\u001fkey",
      "opaque\u0085key",
    ]) {
      expect(() => historyStorePathForKey(privateRoot, key)).toThrow(/opaque|key/i);
    }
  });

  it("requests a 5 MiB bounded read before an oversized source can allocate full content", async () => {
    const fixture = makeFixture();
    let unboundedReadAttempts = 0;
    fixture.binding.read.mockImplementation(async (_relativePath: string, request?: { maxBytes?: number }) => {
      if (request?.maxBytes !== MAX_SNAPSHOT_BYTES) {
        unboundedReadAttempts += 1;
        throw new Error("unbounded-source-read");
      }
      return { content: Buffer.alloc(0), truncated: true };
    });
    await fixture.service.activateMain(fixture.binding);

    await fixture.emitObservation({
      type: "workspace.changed",
      sourceKey: "main",
      relativePath: "oversized.md",
      changeType: "modified",
      cursor: 1,
      repairCycle: 1,
    });
    await fixture.service.waitForIdle();

    expect(unboundedReadAttempts).toBe(0);
    expect(fixture.binding.read).toHaveBeenCalledWith("oversized.md", { maxBytes: MAX_SNAPSHOT_BYTES });
    expect(fixture.service.listFiles()).toEqual([]);
  });

  it("does not capture mount-tagged events, noise, or oversized snapshots", async () => {
    const fixture = makeFixture();
    fixture.contents.set("node_modules/noise.ts", { content: Buffer.from("ignored") });
    fixture.contents.set("large.md", { content: Buffer.alloc(MAX_SNAPSHOT_BYTES + 1, 1) });
    fixture.contents.set("mount.md", { content: Buffer.from("must-not-capture") });
    await fixture.service.activateMain(fixture.binding);

    await fixture.emitObservation({ type: "workspace.changed", sourceKey: "main", relativePath: "node_modules/noise.ts", changeType: "modified", cursor: 1, repairCycle: 1 });
    await fixture.emitObservation({ type: "workspace.changed", sourceKey: "main", relativePath: "large.md", changeType: "modified", cursor: 2, repairCycle: 1 });
    await fixture.emitEvent({ type: "main.resource.changed", sourceKey: "mount", relativePath: "mount.md" } as any);
    await fixture.service.waitForIdle();

    expect(fixture.service.listFiles()).toEqual([]);
    expect(fixture.binding.read).toHaveBeenCalledTimes(1);
    expect(fixture.binding.read).toHaveBeenCalledWith("large.md", { maxBytes: MAX_SNAPSHOT_BYTES });
  });

  it("coalesces a 50k shared baseline into bounded capture batches and one retention boundary", async () => {
    const counting = makeCountingStore();
    const fixture = makeFixture({ createStore: () => counting.store });
    fixture.binding.read.mockImplementation(async () => ({ content: Buffer.from("baseline") }));
    await fixture.service.activateMain(fixture.binding);

    const timers = vi.spyOn(global, "setTimeout");
    const timerCountBeforeBaseline = timers.mock.calls.length;
    for (let index = 0; index < 50_000; index += 1) {
      void fixture.emitObservation({
        type: "workspace.baseline",
        sourceKey: "main",
        relativePath: `notes/${index}.md`,
        entryKind: "file",
        cursor: index + 1,
        repairCycle: 1,
      });
    }

    expect(timers.mock.calls.length - timerCountBeforeBaseline).toBe(1);
    await fixture.service.waitForIdle();
    timers.mockRestore();

    expect(counting.recorded()).toBe(50_000);
    expect(counting.retentionRuns()).toBe(2);
  });

  it("caps concurrent bounded source reads while draining a shared baseline batch", async () => {
    const counting = makeCountingStore();
    const fixture = makeFixture({ createStore: () => counting.store });
    const resolvers: Array<() => void> = [];
    let activeReads = 0;
    let maxActiveReads = 0;
    fixture.binding.read.mockImplementation(() => new Promise((resolve) => {
      activeReads += 1;
      maxActiveReads = Math.max(maxActiveReads, activeReads);
      resolvers.push(() => {
        activeReads -= 1;
        resolve({ content: Buffer.from("bounded") });
      });
    }));
    await fixture.service.activateMain(fixture.binding);

    for (let index = 0; index < 9; index += 1) {
      void fixture.emitObservation({
        type: "workspace.baseline",
        sourceKey: "main",
        relativePath: `notes/concurrency-${index}.md`,
        entryKind: "file",
        cursor: index + 1,
        repairCycle: 1,
      });
    }

    for (let group = 0; group < 3; group += 1) {
      await vi.waitFor(() => expect(resolvers.length).toBe(group === 2 ? 1 : 4));
      const current = resolvers.splice(0);
      current.forEach(resolve => resolve());
    }
    await fixture.service.waitForIdle();

    expect(maxActiveReads).toBe(4);
    expect(counting.recorded()).toBe(9);
  });

  it("keeps capture and shared-observation health degraded until every failure cycle resolves", async () => {
    const fixture = makeFixture();
    fixture.contents.set("retry.md", { content: Buffer.from("retry") });
    fixture.contents.set("other.md", { content: Buffer.from("other") });
    await fixture.service.activateMain(fixture.binding);

    fixture.binding.read.mockRejectedValueOnce(new Error("first-capture-failure"));
    await fixture.emitObservation({ type: "workspace.changed", sourceKey: "main", relativePath: "retry.md", changeType: "modified", cursor: 1, repairCycle: 1 });
    await fixture.service.waitForIdle();
    expect(fixture.service.getHealth()).toBe("DEGRADED");

    await fixture.emitObservation({ type: "workspace.changed", sourceKey: "main", relativePath: "other.md", changeType: "modified", cursor: 2, repairCycle: 1 });
    await fixture.service.waitForIdle();
    expect(fixture.service.getHealth()).toBe("DEGRADED");

    await fixture.emitObservation({ type: "workspace.health", sourceKey: "main", health: "DEGRADED", reason: "event-gap", cursor: 3, repairCycle: 2 });
    await fixture.emitObservation({ type: "workspace.changed", sourceKey: "main", relativePath: "other.md", changeType: "modified", cursor: 4, repairCycle: 2 });
    await fixture.service.waitForIdle();
    expect(fixture.service.getHealth()).toBe("DEGRADED");

    await fixture.service.retryMainHistory();
    expect(fixture.service.getHealth()).toBe("DEGRADED");

    await fixture.emitObservation({ type: "workspace.health", sourceKey: "main", health: "RECONCILING", reason: "retry", cursor: 5, repairCycle: 3 });
    await fixture.emitObservation({ type: "workspace.health", sourceKey: "main", health: "HEALTHY", reason: "retry", cursor: 6, repairCycle: 3 });
    expect(fixture.service.getHealth()).toBe("HEALTHY");
  });

  it("keeps a failed delete degraded until retry applies the store mutation", async () => {
    let store: FileHistoryStore | null = null;
    const fixture = makeFixture({
      createStore: (input) => {
        store = new FileHistoryStore(input);
        vi.spyOn(store, "markDeleted").mockImplementationOnce(() => {
          throw new Error("delete-store-failed");
        });
        return store;
      },
    });
    fixture.contents.set("old.md", { content: Buffer.from("before") });
    await fixture.service.activateMain(fixture.binding);
    await fixture.emitObservation({ type: "workspace.baseline", sourceKey: "main", relativePath: "old.md", entryKind: "file", cursor: 1, repairCycle: 1 });
    await fixture.service.waitForIdle();

    await fixture.emitEvent({ type: "main.resource.deleted", sourceKey: "main", relativePath: "old.md" });
    expect(fixture.service.getHealth()).toBe("DEGRADED");

    await fixture.service.retryMainHistory();
    expect(fixture.service.getHealth()).toBe("HEALTHY");
    expect(fixture.service.listFiles().find(file => file.relPath === "old.md")?.deletedAt).not.toBeNull();
  });

  it("keeps a failed rename degraded until retry preserves the timeline", async () => {
    let store: FileHistoryStore | null = null;
    const fixture = makeFixture({
      createStore: (input) => {
        store = new FileHistoryStore(input);
        vi.spyOn(store, "renamePath").mockImplementationOnce(() => {
          throw new Error("rename-store-failed");
        });
        return store;
      },
    });
    fixture.contents.set("old.md", { content: Buffer.from("before") });
    await fixture.service.activateMain(fixture.binding);
    await fixture.emitObservation({ type: "workspace.baseline", sourceKey: "main", relativePath: "old.md", entryKind: "file", cursor: 1, repairCycle: 1 });
    await fixture.service.waitForIdle();

    fixture.contents.delete("old.md");
    fixture.contents.set("renamed.md", { content: Buffer.from("after") });
    await fixture.emitEvent({ type: "main.resource.renamed", sourceKey: "main", oldRelativePath: "old.md", newRelativePath: "renamed.md" });
    await fixture.service.waitForIdle();
    expect(fixture.service.getHealth()).toBe("DEGRADED");

    await fixture.service.retryMainHistory();
    expect(fixture.service.getHealth()).toBe("HEALTHY");
    expect(fixture.service.listVersions("renamed.md")).toHaveLength(2);
  });

  it("preserves a failed rename while later captures update its new path", async () => {
    const fixture = makeFixture({
      createStore: (input) => {
        const store = new FileHistoryStore(input);
        vi.spyOn(store, "renamePath").mockImplementationOnce(() => {
          throw new Error("rename-store-failed");
        });
        return store;
      },
    });
    fixture.contents.set("old.md", { content: Buffer.from("before") });
    await fixture.service.activateMain(fixture.binding);
    await fixture.emitObservation({ type: "workspace.baseline", sourceKey: "main", relativePath: "old.md", entryKind: "file", cursor: 1, repairCycle: 1 });
    await fixture.service.waitForIdle();

    fixture.contents.delete("old.md");
    fixture.contents.set("renamed.md", { content: Buffer.from("after") });
    await fixture.emitEvent({ type: "main.resource.renamed", sourceKey: "main", oldRelativePath: "old.md", newRelativePath: "renamed.md" });
    await fixture.service.waitForIdle();

    fixture.contents.set("renamed.md", { content: Buffer.from("later") });
    await fixture.emitEvent({ type: "main.resource.changed", sourceKey: "main", relativePath: "renamed.md" });
    await fixture.service.waitForIdle();
    expect(fixture.service.getHealth()).toBe("DEGRADED");

    await fixture.service.retryMainHistory();
    expect(fixture.service.getHealth()).toBe("HEALTHY");
    expect(fixture.service.listVersions("old.md")).toEqual([]);
    const bodies = fixture.service.listVersions("renamed.md")
      .map(version => fixture.service.getSnapshotContent(version.id).content.toString());
    expect(bodies).toContain("before");
    expect(bodies).toContain("later");
  });

  it("replays a failed rename before a later deletion of its new path", async () => {
    const fixture = makeFixture({
      createStore: (input) => {
        const store = new FileHistoryStore(input);
        vi.spyOn(store, "renamePath").mockImplementationOnce(() => {
          throw new Error("rename-store-failed");
        });
        return store;
      },
    });
    fixture.contents.set("old.md", { content: Buffer.from("before") });
    await fixture.service.activateMain(fixture.binding);
    await fixture.emitObservation({ type: "workspace.baseline", sourceKey: "main", relativePath: "old.md", entryKind: "file", cursor: 1, repairCycle: 1 });
    await fixture.service.waitForIdle();

    fixture.contents.delete("old.md");
    fixture.contents.set("renamed.md", { content: Buffer.from("after") });
    await fixture.emitEvent({ type: "main.resource.renamed", sourceKey: "main", oldRelativePath: "old.md", newRelativePath: "renamed.md" });
    await fixture.service.waitForIdle();
    await fixture.emitEvent({ type: "main.resource.deleted", sourceKey: "main", relativePath: "renamed.md" });
    expect(fixture.service.getHealth()).toBe("DEGRADED");
    expect(fixture.service.listFiles().find(file => file.relPath === "renamed.md")?.deletedAt).toBeNull();

    await fixture.service.retryMainHistory();
    expect(fixture.service.getHealth()).toBe("HEALTHY");
    const renamed = fixture.service.listFiles().find(file => file.relPath === "renamed.md");
    expect(renamed?.deletedAt).not.toBeNull();
    const bodies = fixture.service.listVersions("renamed.md")
      .map(version => fixture.service.getSnapshotContent(version.id).content.toString());
    expect(bodies).toContain("before");
  });

  it("replays a failed rename chain in observation order", async () => {
    const fixture = makeFixture({
      createStore: (input) => {
        const store = new FileHistoryStore(input);
        vi.spyOn(store, "renamePath").mockImplementationOnce(() => {
          throw new Error("rename-store-failed");
        });
        return store;
      },
    });
    fixture.contents.set("old.md", { content: Buffer.from("before") });
    await fixture.service.activateMain(fixture.binding);
    await fixture.emitObservation({ type: "workspace.baseline", sourceKey: "main", relativePath: "old.md", entryKind: "file", cursor: 1, repairCycle: 1 });
    await fixture.service.waitForIdle();

    fixture.contents.delete("old.md");
    fixture.contents.set("renamed.md", { content: Buffer.from("after") });
    await fixture.emitEvent({ type: "main.resource.renamed", sourceKey: "main", oldRelativePath: "old.md", newRelativePath: "renamed.md" });
    await fixture.service.waitForIdle();
    fixture.contents.delete("renamed.md");
    fixture.contents.set("third.md", { content: Buffer.from("third") });
    await fixture.emitEvent({ type: "main.resource.renamed", sourceKey: "main", oldRelativePath: "renamed.md", newRelativePath: "third.md" });
    await fixture.service.waitForIdle();
    expect(fixture.service.getHealth()).toBe("DEGRADED");
    expect(fixture.service.listVersions("renamed.md")).toHaveLength(1);

    await fixture.service.retryMainHistory();
    expect(fixture.service.getHealth()).toBe("HEALTHY");
    expect(fixture.service.listVersions("old.md")).toEqual([]);
    const bodies = fixture.service.listVersions("third.md")
      .map(version => fixture.service.getSnapshotContent(version.id).content.toString());
    expect(bodies).toContain("before");
    expect(bodies).toContain("third");
  });

  it("clears a failed capture after retry receives a terminal bounded read result", async () => {
    for (const retryResult of [null, { truncated: true }]) {
      const fixture = makeFixture();
      fixture.binding.read.mockRejectedValueOnce(new Error("first-read-failed"));
      fixture.binding.read.mockResolvedValueOnce(retryResult);
      await fixture.service.activateMain(fixture.binding);

      await fixture.emitObservation({ type: "workspace.changed", sourceKey: "main", relativePath: "retry.md", changeType: "modified", cursor: 1, repairCycle: 1 });
      await fixture.service.waitForIdle();
      expect(fixture.service.getHealth()).toBe("DEGRADED");

      await fixture.service.retryMainHistory();
      expect(fixture.service.getHealth()).toBe("HEALTHY");
    }
  });

  it("cancels pending and failed captures when a main path is deleted", async () => {
    const fixture = makeFixture();
    fixture.contents.set("old.md", { content: Buffer.from("before") });
    await fixture.service.activateMain(fixture.binding);
    await fixture.emitObservation({ type: "workspace.baseline", sourceKey: "main", relativePath: "old.md", entryKind: "file", cursor: 1, repairCycle: 1 });
    await fixture.service.waitForIdle();

    const readsBeforeDeletion = fixture.binding.read.mock.calls.length;
    await fixture.emitEvent({ type: "main.resource.changed", sourceKey: "main", relativePath: "old.md" });
    await fixture.emitEvent({ type: "main.resource.deleted", sourceKey: "main", relativePath: "old.md" });
    await fixture.service.waitForIdle();
    expect(fixture.binding.read).toHaveBeenCalledTimes(readsBeforeDeletion);
    expect(fixture.service.listFiles().find(file => file.relPath === "old.md")?.deletedAt).not.toBeNull();

    fixture.binding.read.mockRejectedValueOnce(new Error("old-path-read-failed"));
    await fixture.emitEvent({ type: "main.resource.changed", sourceKey: "main", relativePath: "old.md" });
    await fixture.service.waitForIdle();
    expect(fixture.service.getHealth()).toBe("DEGRADED");
    const readsAfterFailure = fixture.binding.read.mock.calls.length;

    await fixture.emitEvent({ type: "main.resource.deleted", sourceKey: "main", relativePath: "old.md" });
    await fixture.service.retryMainHistory();
    expect(fixture.binding.read).toHaveBeenCalledTimes(readsAfterFailure);
    expect(fixture.service.getHealth()).toBe("HEALTHY");
  });

  it("does not recreate a deleted timeline when an old in-flight read resolves late", async () => {
    const fixture = makeFixture();
    fixture.contents.set("old.md", { content: Buffer.from("before") });
    await fixture.service.activateMain(fixture.binding);
    await fixture.emitObservation({ type: "workspace.baseline", sourceKey: "main", relativePath: "old.md", entryKind: "file", cursor: 1, repairCycle: 1 });
    await fixture.service.waitForIdle();

    const lateRead = deferred<{ content: Buffer }>();
    fixture.binding.read.mockImplementation(async () => lateRead.promise);
    await fixture.emitEvent({ type: "main.resource.changed", sourceKey: "main", relativePath: "old.md" });
    await vi.waitFor(() => expect(fixture.binding.read).toHaveBeenCalledTimes(2));
    await fixture.emitEvent({ type: "main.resource.deleted", sourceKey: "main", relativePath: "old.md" });
    lateRead.resolve({ content: Buffer.from("late-old-content") });
    await fixture.service.waitForIdle();

    expect(fixture.service.listVersions("old.md")).toHaveLength(1);
    expect(fixture.service.listFiles().find(file => file.relPath === "old.md")?.deletedAt).not.toBeNull();
  });

  it("invalidates the old in-flight read before preserving a valid rename timeline", async () => {
    const fixture = makeFixture();
    fixture.contents.set("old.md", { content: Buffer.from("before") });
    await fixture.service.activateMain(fixture.binding);
    await fixture.emitObservation({ type: "workspace.baseline", sourceKey: "main", relativePath: "old.md", entryKind: "file", cursor: 1, repairCycle: 1 });
    await fixture.service.waitForIdle();

    const lateRead = deferred<{ content: Buffer }>();
    fixture.binding.read.mockImplementation(async (relativePath: string) => (
      relativePath === "old.md" ? lateRead.promise : fixture.contents.get(relativePath) ?? null
    ));
    await fixture.emitEvent({ type: "main.resource.changed", sourceKey: "main", relativePath: "old.md" });
    await vi.waitFor(() => expect(fixture.binding.read).toHaveBeenCalledTimes(2));

    fixture.contents.delete("old.md");
    fixture.contents.set("renamed.md", { content: Buffer.from("after") });
    await fixture.emitEvent({
      type: "main.resource.renamed",
      sourceKey: "main",
      oldRelativePath: "old.md",
      newRelativePath: "renamed.md",
    });
    lateRead.resolve({ content: Buffer.from("late-old-content") });
    await fixture.service.waitForIdle();

    expect(fixture.service.listVersions("old.md")).toHaveLength(0);
    const versions = fixture.service.listVersions("renamed.md");
    expect(versions).toHaveLength(2);
    const snapshotBodies = versions.map(version => fixture.service.getSnapshotContent(version.id).content.toString());
    expect(snapshotBodies).toEqual(expect.arrayContaining(["before", "after"]));
    expect(snapshotBodies).not.toContain("late-old-content");
  });

  it("reconciles a missing shared-baseline file only after that repair cycle is healthy", async () => {
    const fixture = makeFixture();
    fixture.contents.set("baseline.md", { content: Buffer.from("before") });
    await fixture.service.activateMain(fixture.binding);
    await fixture.emitObservation({ type: "workspace.health", sourceKey: "main", health: "RECONCILING", reason: "initializing", cursor: 0, repairCycle: 1 });
    await fixture.emitObservation({ type: "workspace.baseline", sourceKey: "main", relativePath: "baseline.md", entryKind: "file", cursor: 1, repairCycle: 1 });
    await fixture.emitObservation({ type: "workspace.health", sourceKey: "main", health: "HEALTHY", reason: "initializing", cursor: 1, repairCycle: 1 });
    await fixture.service.waitForIdle();
    expect(fixture.service.listFiles().find(file => file.relPath === "baseline.md")?.deletedAt).toBeNull();

    const lateRead = deferred<{ content: Buffer }>();
    fixture.binding.read.mockImplementation(async () => lateRead.promise);
    await fixture.emitObservation({ type: "workspace.health", sourceKey: "main", health: "RECONCILING", reason: "retry", cursor: 2, repairCycle: 2 });
    await fixture.emitObservation({ type: "workspace.changed", sourceKey: "main", relativePath: "baseline.md", changeType: "modified", cursor: 3, repairCycle: 2 });
    await vi.waitFor(() => expect(fixture.binding.read).toHaveBeenCalledTimes(2));

    expect(fixture.service.listFiles().find(file => file.relPath === "baseline.md")?.deletedAt).toBeNull();
    await fixture.emitObservation({ type: "workspace.health", sourceKey: "main", health: "HEALTHY", reason: "retry", cursor: 3, repairCycle: 2 });
    lateRead.resolve({ content: Buffer.from("late-baseline-content") });
    await fixture.service.waitForIdle();

    expect(fixture.service.listVersions("baseline.md")).toHaveLength(1);
    expect(fixture.service.listFiles().find(file => file.relPath === "baseline.md")?.deletedAt).not.toBeNull();
  });

  it("tombstones prior files when a late subscriber receives only a healthy empty baseline cycle", async () => {
    const fixture = makeFixture();
    fixture.contents.set("old.md", { content: Buffer.from("before") });
    await fixture.service.activateMain(fixture.binding);
    await fixture.emitObservation({ type: "workspace.baseline", sourceKey: "main", relativePath: "old.md", entryKind: "file", cursor: 1, repairCycle: 1 });
    await fixture.service.waitForIdle();
    expect(fixture.service.listFiles().find(file => file.relPath === "old.md")?.deletedAt).toBeNull();

    await fixture.service.close();
    fixture.contents.delete("old.md");
    await fixture.service.activateMain(fixture.binding);
    await fixture.emitObservation({ type: "workspace.health", sourceKey: "main", health: "HEALTHY", reason: "initializing", cursor: 2, repairCycle: 2 });
    await fixture.service.waitForIdle();

    expect(fixture.service.listFiles().find(file => file.relPath === "old.md")?.deletedAt).not.toBeNull();
  });

  it("retries a failed late empty-baseline reconciliation before reporting healthy", async () => {
    let openedStores = 0;
    const fixture = makeFixture({
      createStore: (input) => {
        const store = new FileHistoryStore(input);
        openedStores += 1;
        if (openedStores === 2) {
          vi.spyOn(store, "listFiles").mockImplementationOnce(() => {
            throw new Error("reconciliation-list-failed");
          });
        }
        return store;
      },
    });
    fixture.contents.set("old.md", { content: Buffer.from("before") });
    await fixture.service.activateMain(fixture.binding);
    await fixture.emitObservation({ type: "workspace.baseline", sourceKey: "main", relativePath: "old.md", entryKind: "file", cursor: 1, repairCycle: 1 });
    await fixture.emitObservation({ type: "workspace.health", sourceKey: "main", health: "HEALTHY", reason: "initializing", cursor: 1, repairCycle: 1 });
    await fixture.service.waitForIdle();
    await fixture.service.close();

    fixture.contents.delete("old.md");
    await fixture.service.activateMain(fixture.binding);
    await fixture.emitObservation({ type: "workspace.health", sourceKey: "main", health: "HEALTHY", reason: "initializing", cursor: 2, repairCycle: 2 });
    expect(fixture.service.getHealth()).toBe("DEGRADED");

    await fixture.service.retryMainHistory();
    expect(fixture.service.getHealth()).toBe("HEALTHY");
    expect(fixture.service.listFiles().find(file => file.relPath === "old.md")?.deletedAt).not.toBeNull();
  });

  it("ignores a stale healthy cycle while a newer repair cycle remains pending", async () => {
    const fixture = makeFixture();
    fixture.contents.set("old.md", { content: Buffer.from("before") });
    await fixture.service.activateMain(fixture.binding);
    await fixture.emitObservation({ type: "workspace.baseline", sourceKey: "main", relativePath: "old.md", entryKind: "file", cursor: 1, repairCycle: 1 });
    await fixture.service.waitForIdle();

    await fixture.emitObservation({ type: "workspace.health", sourceKey: "main", health: "RECONCILING", reason: "retry", cursor: 2, repairCycle: 3 });
    await fixture.emitObservation({ type: "workspace.health", sourceKey: "main", health: "HEALTHY", reason: "initializing", cursor: 1, repairCycle: 2 });

    expect(fixture.service.listFiles().find(file => file.relPath === "old.md")?.deletedAt).toBeNull();
    expect(fixture.service.getHealth()).toBe("RECONCILING");
  });

  it("ignores a stale baseline after a newer empty cycle has completed", async () => {
    const fixture = makeFixture();
    fixture.contents.set("stale.md", { content: Buffer.from("stale") });
    await fixture.service.activateMain(fixture.binding);

    await fixture.emitObservation({ type: "workspace.health", sourceKey: "main", health: "HEALTHY", reason: "initializing", cursor: 2, repairCycle: 2 });
    await fixture.emitObservation({ type: "workspace.baseline", sourceKey: "main", relativePath: "stale.md", entryKind: "file", cursor: 1, repairCycle: 1 });
    await fixture.service.waitForIdle();

    expect(fixture.binding.read).not.toHaveBeenCalled();
    expect(fixture.service.listFiles()).toEqual([]);
  });

  it("invalidates unfinished baseline and event captures when the next completed cycle omits them", async () => {
    const fixture = makeFixture();
    const lateRead = deferred<{ content: Buffer }>();
    fixture.binding.read.mockImplementation(async () => lateRead.promise);
    await fixture.service.activateMain(fixture.binding);

    await fixture.emitObservation({ type: "workspace.health", sourceKey: "main", health: "RECONCILING", reason: "initializing", cursor: 0, repairCycle: 1 });
    await fixture.emitObservation({ type: "workspace.baseline", sourceKey: "main", relativePath: "pending-baseline.md", entryKind: "file", cursor: 1, repairCycle: 1 });
    await fixture.emitObservation({ type: "workspace.health", sourceKey: "main", health: "HEALTHY", reason: "initializing", cursor: 1, repairCycle: 1 });
    await vi.waitFor(() => expect(fixture.binding.read).toHaveBeenCalledTimes(1));

    await fixture.emitObservation({ type: "workspace.health", sourceKey: "main", health: "RECONCILING", reason: "retry", cursor: 2, repairCycle: 2 });
    await fixture.emitObservation({ type: "workspace.health", sourceKey: "main", health: "HEALTHY", reason: "retry", cursor: 2, repairCycle: 2 });
    lateRead.resolve({ content: Buffer.from("stale-baseline-content") });
    await fixture.service.waitForIdle();

    expect(fixture.service.listFiles()).toEqual([]);
    const eventFixture = makeFixture();
    const eventLateRead = deferred<{ content: Buffer }>();
    eventFixture.binding.read.mockImplementation(async () => eventLateRead.promise);
    await eventFixture.service.activateMain(eventFixture.binding);

    await eventFixture.emitObservation({ type: "workspace.changed", sourceKey: "main", relativePath: "pending-event.md", changeType: "created", cursor: 1, repairCycle: 1 });
    await vi.waitFor(() => expect(eventFixture.binding.read).toHaveBeenCalledTimes(1));
    await eventFixture.emitObservation({ type: "workspace.health", sourceKey: "main", health: "RECONCILING", reason: "retry", cursor: 2, repairCycle: 2 });
    await eventFixture.emitObservation({ type: "workspace.health", sourceKey: "main", health: "HEALTHY", reason: "retry", cursor: 2, repairCycle: 2 });
    eventLateRead.resolve({ content: Buffer.from("stale-event-content") });
    await eventFixture.service.waitForIdle();

    expect(eventFixture.service.listFiles()).toEqual([]);
  });

  it("isolates store initialization and capture failures, then retries without touching the workspace lifecycle", async () => {
    let failStore = true;
    const fixture = makeFixture({
      createStore: (input) => {
        if (failStore) {
          failStore = false;
          throw new Error("private-store-unavailable");
        }
        return new FileHistoryStore(input);
      },
    });

    await expect(fixture.service.activateMain(fixture.binding)).resolves.toBe("FAILED");
    expect(fixture.service.getHealth()).toBe("FAILED");
    expect(fixture.subscribe).not.toHaveBeenCalled();

    await expect(fixture.service.retryMainHistory()).resolves.toBe("HEALTHY");
    expect(fixture.subscribe).toHaveBeenCalledTimes(1);
    fixture.contents.set("retry.md", { content: Buffer.from("retry") });
    fixture.binding.read.mockRejectedValueOnce(new Error("transient-read-failure"));
    await fixture.emitObservation({ type: "workspace.changed", sourceKey: "main", relativePath: "retry.md", changeType: "modified", cursor: 2, repairCycle: 1 });
    await fixture.service.waitForIdle();
    expect(fixture.service.getHealth()).toBe("DEGRADED");
    await expect(fixture.service.retryMainHistory()).resolves.toBe("HEALTHY");
    expect(fixture.binding.read).toHaveBeenCalledTimes(2);
    expect(fixture.service.listFiles()).toMatchObject([{ relPath: "retry.md" }]);
  });

  it("does not write a retired main store after an in-flight read resolves", async () => {
    const fixture = makeFixture();
    const slowRead = deferred<{ content: Buffer }>();
    fixture.binding.read.mockImplementationOnce(async () => slowRead.promise);
    const recordSnapshot = vi.spyOn(FileHistoryStore.prototype, "recordSnapshot");
    await fixture.service.activateMain(fixture.binding);
    await fixture.emitObservation({ type: "workspace.changed", sourceKey: "main", relativePath: "slow.md", changeType: "modified", cursor: 1, repairCycle: 1 });
    await vi.waitFor(() => expect(fixture.binding.read).toHaveBeenCalledTimes(1));

    const nextBinding = {
      ...fixture.binding,
      historyStoreKey: "opaque-main-history-key-02",
      read: vi.fn(async () => null),
    };
    const switchPromise = fixture.service.activateMain(nextBinding);
    await expect(Promise.race([
      switchPromise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("main switch waited for retired read")), 50)),
    ])).resolves.toBe("HEALTHY");

    slowRead.resolve({ content: Buffer.from("old-main-content") });
    await switchPromise;
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(recordSnapshot).not.toHaveBeenCalled();
    recordSnapshot.mockRestore();
  });

  it("serializes concurrent activation, retry, and close without a stale subscription or store", async () => {
    const fixture = makeFixture();
    const subscriptionGate = deferred<{ release: typeof fixture.release }>();
    let staleObservationListener: ObservationListener | null = null;
    fixture.binding.subscribe.mockImplementation(async (listener: ObservationListener) => {
      staleObservationListener = listener;
      return subscriptionGate.promise;
    });

    const activation = fixture.service.activateMain(fixture.binding);
    await vi.waitFor(() => expect(fixture.subscribe).toHaveBeenCalledTimes(1));
    const retry = fixture.service.retryMainHistory();
    const closing = fixture.service.close();
    subscriptionGate.resolve({ release: fixture.release });

    await expect(activation).resolves.toBe("HEALTHY");
    await expect(retry).resolves.toBe("HEALTHY");
    await expect(closing).resolves.toBeUndefined();
    expect(fixture.release).toHaveBeenCalledTimes(1);
    expect(fixture.eventRelease).toHaveBeenCalledTimes(1);
    expect(fixture.service.getHealth()).toBeNull();
    expect((fixture.service as any)._entry).toBeNull();
    expect((fixture.service as any)._pendingMain).toBeNull();

    await staleObservationListener?.({
      type: "workspace.changed",
      sourceKey: "main",
      relativePath: "stale.md",
      changeType: "modified",
      cursor: 1,
      repairCycle: 1,
    });
    expect(fixture.binding.read).not.toHaveBeenCalled();
  });

  it("has no private watcher or baseline sweep entrypoint", () => {
    const source = fs.readFileSync(path.join(ROOT, "lib/file-history/file-history-service.ts"), "utf-8");
    const fixture = makeFixture();
    expect(source).not.toContain("workspace-watcher");
    expect(source).not.toContain("createWorkspaceWatcher");
    expect(source).not.toContain("_sweep");
    expect((fixture.service as any).syncWorkspaces).toBeUndefined();
  });
});
