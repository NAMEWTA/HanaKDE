import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FileHistoryService,
  FileHistoryStore,
  historyStorePathForKey,
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
    read: vi.fn(async (relativePath: string) => contents.get(relativePath) ?? null),
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
    emitObservation: async (observation: unknown) => observationListener?.(observation),
    emitEvent: async (event: unknown) => eventListener?.(event),
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
    expect(fixture.binding.read).toHaveBeenCalledWith("large.md");
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

  it("has no private watcher or baseline sweep entrypoint", () => {
    const source = fs.readFileSync(path.join(ROOT, "lib/file-history/file-history-service.ts"), "utf-8");
    const fixture = makeFixture();
    expect(source).not.toContain("workspace-watcher");
    expect(source).not.toContain("createWorkspaceWatcher");
    expect(source).not.toContain("_sweep");
    expect((fixture.service as any).syncWorkspaces).toBeUndefined();
  });
});
