import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { upsertStudioMount } from "../core/studio-mounts.ts";
import { LocalFsProvider } from "../lib/resource-io/providers/local-fs-provider.ts";
import { MountProvider } from "../lib/resource-io/providers/mount-provider.ts";
import { ResourceIO } from "../lib/resource-io/resource-io.ts";
import {
  TRANSFER_MAX_BUFFERED_BYTES,
  TRANSFER_MAX_CHUNK_BYTES,
  TRANSFER_MAX_CONCURRENT_FILE_STREAMS,
  TRANSFER_MAX_AGGREGATE_BYTES,
  TRANSFER_MAX_DEPTH,
  TRANSFER_MAX_ENTRIES,
  TransferBudget,
  TransferPlanTracker,
  encodeResourceTransferVersion,
  processTransferBudget,
  transferEntryUnsupported,
} from "../lib/resource-io/transfer.ts";
import type { ResourceExportEntry, ResourceProvider, ResourceRef } from "../lib/resource-io/types.ts";

const OPERATION_ID = "6f0d2f1a-4d5e-4a5b-9b6a-1f2e3d4c5b6a";

describe("ResourceIO transfer", () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  function makeSandbox() {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-resource-transfer-"));
    const sourceRoot = path.join(tempRoot, "source-root");
    const targetRoot = path.join(tempRoot, "target-root");
    fs.mkdirSync(sourceRoot, { recursive: true });
    fs.mkdirSync(targetRoot, { recursive: true });
    return {
      sandbox: tempRoot,
      sourceRoot: fs.realpathSync(sourceRoot),
      targetRoot: fs.realpathSync(targetRoot),
    };
  }

  function makeLocalResourceIO(sandbox: string) {
    const events: Array<Record<string, unknown>> = [];
    const resourceIO = new ResourceIO({
      providers: { local_fs: new LocalFsProvider({ cwd: sandbox }) },
      eventBus: {
        changed: (event: Record<string, unknown>) => { events.push(event); return event; },
        deleted: (event: Record<string, unknown>) => { events.push(event); return event; },
        renamed: (event: Record<string, unknown>) => { events.push(event); return event; },
      } as never,
    });
    return { resourceIO, events };
  }

  function listStagingArtifacts(dirPath: string): string[] {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath).filter((name) => name.includes(".hana-transfer-"));
  }

  it("transfers a single file between local directories with staged atomic publish", async () => {
    const { sandbox, sourceRoot, targetRoot } = makeSandbox();
    const { resourceIO, events } = makeLocalResourceIO(sandbox);
    const sourceFile = path.join(sourceRoot, "note.md");
    fs.writeFileSync(sourceFile, "hello");

    const result = await resourceIO.transfer({
      source: { kind: "local-file", path: sourceFile },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "copy.md",
      operationId: OPERATION_ID,
    }, { source: "api" });

    const targetFile = path.join(targetRoot, "copy.md");
    expect(fs.readFileSync(targetFile, "utf-8")).toBe("hello");
    expect(fs.readFileSync(sourceFile, "utf-8")).toBe("hello");
    expect(result).toEqual({
      target: { kind: "local-file", path: targetFile },
      version: encodeResourceTransferVersion({
        mtimeMs: fs.statSync(targetFile).mtime.getTime(),
        size: 5,
      }),
      bytesTransferred: 5,
    });
    expect(listStagingArtifacts(targetRoot)).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      changeType: "created",
      resourceKey: `local_fs:${targetFile.replace(/\\/g, "/")}`,
      operationId: OPERATION_ID,
      source: "api",
    });
  });

  it("resolves replace-existing state inside the target provider operation", async () => {
    const { sandbox, sourceRoot, targetRoot } = makeSandbox();
    const { resourceIO } = makeLocalResourceIO(sandbox);
    const sourceFile = path.join(sourceRoot, "note.md");
    const targetFile = path.join(targetRoot, "copy.md");
    fs.writeFileSync(sourceFile, "new body");
    fs.writeFileSync(targetFile, "old body");

    const result = await resourceIO.transfer({
      source: { kind: "local-file", path: sourceFile },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "copy.md",
      replaceExisting: true,
      operationId: OPERATION_ID,
    }, { source: "api" });

    expect(result.bytesTransferred).toBe(Buffer.byteLength("new body"));
    expect(fs.readFileSync(targetFile, "utf-8")).toBe("new body");
  });

  it("does not write native paths or local resource keys into transfer audit records", async () => {
    const { sandbox, sourceRoot, targetRoot } = makeSandbox();
    const records: Array<Record<string, unknown>> = [];
    const resourceIO = new ResourceIO({
      providers: { local_fs: new LocalFsProvider({ cwd: sandbox }) },
      audit: {
        record(event) {
          records.push(event);
        },
      },
    });
    const sourceFile = path.join(sourceRoot, "note.md");
    fs.writeFileSync(sourceFile, "hello");

    await resourceIO.transfer({
      source: { kind: "local-file", path: sourceFile },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "copy.md",
      operationId: OPERATION_ID,
    }, {
      source: "api",
      sessionPath: path.join(sandbox, "private-session.jsonl"),
      principal: {
        kind: "api",
        principalId: "owner",
        sessionPath: path.join(sandbox, "principal-session.jsonl"),
      },
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      outcome: "allowed",
      operation: "transfer",
      providerId: "local_fs",
      operationId: OPERATION_ID,
    });
    expect(records[0]).not.toHaveProperty("resource");
    expect(records[0]).not.toHaveProperty("resourceKey");
    expect(records[0]).toMatchObject({
      sessionPath: null,
      principal: {
        principalId: "owner",
        sessionPath: undefined,
      },
    });
    expect(JSON.stringify(records[0])).not.toContain(sandbox);
  });

  it("rejects an unexpected existing target with knowledge_resource_conflict and no side effects", async () => {
    const { sandbox, sourceRoot, targetRoot } = makeSandbox();
    const { resourceIO, events } = makeLocalResourceIO(sandbox);
    const sourceFile = path.join(sourceRoot, "note.md");
    fs.writeFileSync(sourceFile, "hello");
    const targetFile = path.join(targetRoot, "copy.md");
    fs.writeFileSync(targetFile, "occupied");

    await expect(resourceIO.transfer({
      source: { kind: "local-file", path: sourceFile },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "copy.md",
      operationId: OPERATION_ID,
    }, { source: "api" })).rejects.toMatchObject({
      code: "knowledge_resource_conflict",
      httpStatus: 409,
      retryable: false,
    });

    expect(fs.readFileSync(targetFile, "utf-8")).toBe("occupied");
    expect(listStagingArtifacts(targetRoot)).toEqual([]);
    expect(events).toHaveLength(0);
  });

  it("transfers a directory and a file larger than the 1 MiB chunk limit without changing bytes", async () => {
    const { sandbox, sourceRoot, targetRoot } = makeSandbox();
    const { resourceIO } = makeLocalResourceIO(sandbox);
    const sourceDirectory = path.join(sourceRoot, "tree");
    const nestedDirectory = path.join(sourceDirectory, "nested");
    fs.mkdirSync(nestedDirectory, { recursive: true });
    // Cross the frozen 1 MiB boundary with a tail. A second full chunk adds no
    // protocol coverage, but made this release-gate fixture contend with the
    // other large I/O suites on shared CI workers.
    const payload = Buffer.alloc(TRANSFER_MAX_CHUNK_BYTES + 17, 0x5a);
    fs.writeFileSync(path.join(nestedDirectory, "large.bin"), payload);
    fs.writeFileSync(path.join(sourceDirectory, "note.md"), "# unchanged\n");

    const result = await resourceIO.transfer({
      source: { kind: "local-file", path: sourceDirectory },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "copied-tree",
      operationId: OPERATION_ID,
    }, { source: "api" });

    expect(result.bytesTransferred).toBe(payload.byteLength + 12);
    expect(fs.readFileSync(path.join(targetRoot, "copied-tree", "nested", "large.bin")))
      .toEqual(payload);
    expect(fs.readFileSync(path.join(targetRoot, "copied-tree", "note.md"), "utf-8"))
      .toBe("# unchanged\n");
    expect(listStagingArtifacts(targetRoot)).toEqual([]);
  });

  it("replaces only the exact expected target version", async () => {
    const { sandbox, sourceRoot, targetRoot } = makeSandbox();
    const { resourceIO } = makeLocalResourceIO(sandbox);
    const sourceFile = path.join(sourceRoot, "replacement.md");
    const targetFile = path.join(targetRoot, "existing.md");
    fs.writeFileSync(sourceFile, "new");
    fs.writeFileSync(targetFile, "old");
    const expectedTargetVersion = encodeResourceTransferVersion({
      mtimeMs: fs.lstatSync(targetFile).mtime.getTime(),
      size: 3,
    });

    const result = await resourceIO.transfer({
      source: { kind: "local-file", path: sourceFile },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "existing.md",
      expectedTargetVersion,
      operationId: OPERATION_ID,
    }, { source: "api" });

    expect(fs.readFileSync(targetFile, "utf-8")).toBe("new");
    expect(result.bytesTransferred).toBe(3);
    expect(listStagingArtifacts(targetRoot)).toEqual([]);
  });

  it("rejects a stale expected target version and preserves the current target", async () => {
    const { sandbox, sourceRoot, targetRoot } = makeSandbox();
    const { resourceIO } = makeLocalResourceIO(sandbox);
    const sourceFile = path.join(sourceRoot, "replacement.md");
    const targetFile = path.join(targetRoot, "existing.md");
    fs.writeFileSync(sourceFile, "new");
    fs.writeFileSync(targetFile, "current");

    await expect(resourceIO.transfer({
      source: { kind: "local-file", path: sourceFile },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "existing.md",
      expectedTargetVersion: "v1:0:3",
      operationId: OPERATION_ID,
    }, { source: "api" })).rejects.toMatchObject({
      code: "knowledge_version_conflict",
      httpStatus: 409,
      retryable: true,
    });

    expect(fs.readFileSync(targetFile, "utf-8")).toBe("current");
    expect(listStagingArtifacts(targetRoot)).toEqual([]);
  });

  it("does not follow symbolic links while exporting", async () => {
    if (process.platform === "win32") return;
    const { sandbox, sourceRoot, targetRoot } = makeSandbox();
    const { resourceIO } = makeLocalResourceIO(sandbox);
    const outside = path.join(sandbox, "outside-secret.txt");
    const sourceLink = path.join(sourceRoot, "linked.txt");
    fs.writeFileSync(outside, "secret");
    fs.symlinkSync(outside, sourceLink);

    await resourceIO.transfer({
      source: { kind: "local-file", path: sourceLink },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "linked-copy.txt",
      operationId: OPERATION_ID,
    }, { source: "api" });

    const copiedLink = path.join(targetRoot, "linked-copy.txt");
    expect(fs.lstatSync(copiedLink).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(copiedLink)).toBe(outside);
  });

  it("fails the whole top-level resource when the target provider cannot create a symbolic link", async () => {
    if (process.platform === "win32") return;
    const { sandbox, sourceRoot } = makeSandbox();
    const outside = path.join(sandbox, "outside.txt");
    const sourceLink = path.join(sourceRoot, "linked.txt");
    fs.writeFileSync(outside, "outside");
    fs.symlinkSync(outside, sourceLink);
    const targetProvider = {
      id: "mount",
      capabilities: () => ({ importTree: true }),
      async importTreeAtomically(
        _targetDirectory: ResourceRef,
        _targetName: string,
        entries: AsyncIterable<ResourceExportEntry>,
      ) {
        for await (const entry of entries) {
          if (entry.kind === "symbolic_link") {
            throw transferEntryUnsupported("symbolic_link_creation_unsupported");
          }
        }
        throw new Error("expected a symbolic link entry");
      },
    } satisfies Partial<ResourceProvider>;
    const resourceIO = new ResourceIO({
      providers: {
        local_fs: new LocalFsProvider({ cwd: sandbox }),
        mount: targetProvider as ResourceProvider,
      },
    });

    await expect(resourceIO.transfer({
      source: { kind: "local-file", path: sourceLink },
      targetDirectory: { kind: "mount", mountId: "target", path: "" },
      targetName: "linked-copy.txt",
      operationId: OPERATION_ID,
    }, { source: "api" })).rejects.toMatchObject({
      code: "knowledge_transfer_entry_unsupported",
      details: { state: "symbolic_link_creation_unsupported" },
    });
  });

  it("rejects a real special filesystem entry before staging", async () => {
    if (process.platform === "win32") return;
    const { sandbox, sourceRoot, targetRoot } = makeSandbox();
    const fifoPath = path.join(sourceRoot, "named-pipe");
    execFileSync("mkfifo", [fifoPath]);
    const { resourceIO } = makeLocalResourceIO(sandbox);

    await expect(resourceIO.transfer({
      source: { kind: "local-file", path: fifoPath },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "named-pipe-copy",
      operationId: OPERATION_ID,
    }, { source: "api" })).rejects.toMatchObject({
      code: "knowledge_transfer_entry_unsupported",
      details: { state: "special_file_kind" },
    });
    expect(fs.existsSync(path.join(targetRoot, "named-pipe-copy"))).toBe(false);
    expect(listStagingArtifacts(targetRoot)).toEqual([]);
  });

  it("fails closed before staging when target write permission is unavailable", async () => {
    const { sandbox, targetRoot } = makeSandbox();
    const sourceProvider = {
      id: "resource",
      capabilities: () => ({ exportTree: true }),
      async *exportTree() {
        yield {
          kind: "file",
          path: [],
          sizeBytes: 1,
          version: { size: 1 },
          body: (async function* () { yield Uint8Array.of(1); })(),
        } satisfies ResourceExportEntry;
      },
    } satisfies Partial<ResourceProvider>;
    const resourceIO = new ResourceIO({
      providers: {
        resource: sourceProvider as ResourceProvider,
        local_fs: new LocalFsProvider({
          cwd: sandbox,
          guard: {
            check: (_filePath, operation) => ({
              allowed: operation === "read",
              reason: "fixture write denied",
            }),
          },
        }),
      },
    });

    await expect(resourceIO.transfer({
      source: { kind: "resource", resourceId: "source" },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "denied.bin",
      operationId: OPERATION_ID,
    }, { source: "api" })).rejects.toMatchObject({
      code: "resource_access_denied",
      status: 403,
    });
    expect(fs.existsSync(path.join(targetRoot, "denied.bin"))).toBe(false);
    expect(listStagingArtifacts(targetRoot)).toEqual([]);
  });

  it("cleans staging and leaves no formal target when cancellation interrupts a file body", async () => {
    const { sandbox, targetRoot } = makeSandbox();
    const controller = new AbortController();
    const sourceProvider = {
      id: "resource",
      capabilities: () => ({ exportTree: true }),
      async *exportTree() {
        yield {
          kind: "file",
          path: [],
          sizeBytes: 2,
          version: { size: 2 },
          body: (async function* () {
            yield Uint8Array.of(1);
            controller.abort();
            yield Uint8Array.of(2);
          })(),
        } satisfies ResourceExportEntry;
      },
    } satisfies Partial<ResourceProvider>;
    const resourceIO = new ResourceIO({
      providers: {
        resource: sourceProvider as ResourceProvider,
        local_fs: new LocalFsProvider({ cwd: sandbox }),
      },
    });

    await expect(resourceIO.transfer({
      source: { kind: "resource", resourceId: "source" },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "cancelled.bin",
      signal: controller.signal,
      operationId: OPERATION_ID,
    }, { source: "api" })).rejects.toMatchObject({ name: "AbortError" });

    expect(fs.existsSync(path.join(targetRoot, "cancelled.bin"))).toBe(false);
    expect(listStagingArtifacts(targetRoot)).toEqual([]);
  });

  it("revalidates a mount read scope after planning and before every lazy body read", async () => {
    const { sandbox, sourceRoot, targetRoot } = makeSandbox();
    const hanakoHome = path.join(sandbox, "hana-home");
    const studioId = "studio-revocation";
    const mountId = "revocable-source";
    const sourceFile = path.join(sourceRoot, "secret.txt");
    fs.writeFileSync(sourceFile, "secret");
    const mount = {
      mountId,
      hostStudioId: studioId,
      sourceKind: "storage",
      provider: "local_fs",
      label: mountId,
      presentation: "folder",
      capabilities: ["list", "read", "write", "watch", "materialize"],
      rootLocator: { path: sourceRoot },
    };
    upsertStudioMount(hanakoHome, mount);
    const localFsProviderFactory = ({ cwd, guard }: any) =>
      new LocalFsProvider({ cwd, guard });
    const targetLocal = new LocalFsProvider({ cwd: sandbox });
    const targetProvider = {
      id: "local_fs",
      capabilities: () => ({ importTree: true }),
      async importTreeAtomically(
        targetDirectory: ResourceRef,
        targetName: string,
        entries: AsyncIterable<ResourceExportEntry>,
        options: any,
      ) {
        const revokeAfterPlan = (async function* () {
          for await (const entry of entries) {
            upsertStudioMount(hanakoHome, {
              ...mount,
              capabilities: ["list", "write", "watch", "materialize"],
            });
            yield entry;
          }
        })();
        return targetLocal.importTreeAtomically(
          targetDirectory,
          targetName,
          revokeAfterPlan,
          options,
        );
      },
    } satisfies Partial<ResourceProvider>;
    const resourceIO = new ResourceIO({
      providers: {
        mount: new MountProvider({
          hanakoHome,
          studioId,
          localFsProviderFactory,
        }),
        local_fs: targetProvider as ResourceProvider,
      },
    });

    await expect(resourceIO.transfer({
      source: { kind: "mount", mountId, path: "secret.txt" },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "copy.txt",
      operationId: OPERATION_ID,
    }, { source: "api" })).rejects.toMatchObject({
      code: "resource_access_denied",
      status: 403,
    });
    expect(fs.existsSync(path.join(targetRoot, "copy.txt"))).toBe(false);
    expect(listStagingArtifacts(targetRoot)).toEqual([]);
  });

  it("rejects a mount root replaced at the same path after transfer planning", async () => {
    const { sandbox, sourceRoot, targetRoot } = makeSandbox();
    const hanakoHome = path.join(sandbox, "hana-home");
    const studioId = "studio-root-replacement";
    const mountId = "replaceable-source";
    const sourceFile = path.join(sourceRoot, "secret.txt");
    fs.writeFileSync(sourceFile, "original");
    const mount = {
      mountId,
      hostStudioId: studioId,
      sourceKind: "storage",
      provider: "local_fs",
      label: mountId,
      presentation: "folder",
      capabilities: ["list", "read", "write", "watch", "materialize"],
      rootLocator: { path: sourceRoot },
    };
    upsertStudioMount(hanakoHome, mount);
    const localFsProviderFactory = ({ cwd, guard }: any) =>
      new LocalFsProvider({ cwd, guard });
    const targetLocal = new LocalFsProvider({ cwd: sandbox });
    const movedSourceRoot = path.join(sandbox, "old-source-root");
    const targetProvider = {
      id: "local_fs",
      capabilities: () => ({ importTree: true }),
      async importTreeAtomically(
        targetDirectory: ResourceRef,
        targetName: string,
        entries: AsyncIterable<ResourceExportEntry>,
        options: any,
      ) {
        const replaceRootAfterPlan = (async function* () {
          for await (const entry of entries) {
            fs.renameSync(sourceRoot, movedSourceRoot);
            fs.mkdirSync(sourceRoot);
            fs.writeFileSync(path.join(sourceRoot, "secret.txt"), "attacker");
            yield entry;
          }
        })();
        return targetLocal.importTreeAtomically(
          targetDirectory,
          targetName,
          replaceRootAfterPlan,
          options,
        );
      },
    } satisfies Partial<ResourceProvider>;
    const resourceIO = new ResourceIO({
      providers: {
        mount: new MountProvider({
          hanakoHome,
          studioId,
          localFsProviderFactory,
        }),
        local_fs: targetProvider as ResourceProvider,
      },
    });

    await expect(resourceIO.transfer({
      source: { kind: "mount", mountId, path: "secret.txt" },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "copy.txt",
      operationId: OPERATION_ID,
    }, { source: "api" })).rejects.toMatchObject({
      code: "resource_access_denied",
    });
    expect(fs.existsSync(path.join(targetRoot, "copy.txt"))).toBe(false);
    expect(listStagingArtifacts(targetRoot)).toEqual([]);
  });

  it("revalidates source scope immediately before publishing an empty directory", async () => {
    const { sandbox, sourceRoot, targetRoot } = makeSandbox();
    const emptySource = path.join(sourceRoot, "empty");
    fs.mkdirSync(emptySource);
    let sourceReadAllowed = true;
    const sourceLocal = new LocalFsProvider({
      cwd: sandbox,
      guard: {
        check(filePath, operation) {
          if (
            operation === "read"
            && filePath.startsWith(sourceRoot)
            && !sourceReadAllowed
          ) {
            return { allowed: false, reason: "source scope revoked" };
          }
          return { allowed: true };
        },
      },
    });
    const targetLocal = new LocalFsProvider({ cwd: sandbox });
    const provider = {
      id: "local_fs",
      capabilities: () => ({ exportTree: true, importTree: true }),
      async *exportTree(
        ref: ResourceRef,
        options: any,
      ): AsyncIterable<ResourceExportEntry> {
        yield* sourceLocal.exportTree(ref, options);
      },
      async importTreeAtomically(
        targetDirectory: ResourceRef,
        targetName: string,
        entries: AsyncIterable<ResourceExportEntry>,
        options: any,
      ) {
        const revokeAfterPlan = (async function* () {
          for await (const entry of entries) {
            sourceReadAllowed = false;
            yield entry;
          }
        })();
        return targetLocal.importTreeAtomically(
          targetDirectory,
          targetName,
          revokeAfterPlan,
          options,
        );
      },
    } satisfies Partial<ResourceProvider>;
    const resourceIO = new ResourceIO({
      providers: { local_fs: provider as ResourceProvider },
    });

    await expect(resourceIO.transfer({
      source: { kind: "local-file", path: emptySource },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "empty-copy",
      operationId: OPERATION_ID,
    }, { source: "api" })).rejects.toMatchObject({
      code: "resource_access_denied",
    });
    expect(fs.existsSync(path.join(targetRoot, "empty-copy"))).toBe(false);
    expect(listStagingArtifacts(targetRoot)).toEqual([]);
  });

  it("finds and cleans sibling staging when the target directory moves to another parent", async () => {
    const { sandbox, targetRoot } = makeSandbox();
    const movedParent = path.join(sandbox, "relocated");
    const movedTargetRoot = path.join(movedParent, "target-root-moved");
    fs.mkdirSync(movedParent);
    const sourceProvider = {
      id: "resource",
      capabilities: () => ({ exportTree: true }),
      async *exportTree() {
        yield {
          kind: "file",
          path: [],
          sizeBytes: 2,
          version: { size: 2 },
          body: (async function* () {
            yield Uint8Array.of(1);
            fs.renameSync(targetRoot, movedTargetRoot);
            yield Uint8Array.of(2);
          })(),
        } satisfies ResourceExportEntry;
      },
    } satisfies Partial<ResourceProvider>;
    const resourceIO = new ResourceIO({
      providers: {
        resource: sourceProvider as ResourceProvider,
        local_fs: new LocalFsProvider({ cwd: sandbox }),
      },
    });

    await expect(resourceIO.transfer({
      source: { kind: "resource", resourceId: "moving-target" },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "copy.bin",
      operationId: OPERATION_ID,
    }, { source: "api" })).rejects.toMatchObject({
      code: "resource_access_denied",
    });
    expect(fs.existsSync(path.join(movedTargetRoot, "copy.bin"))).toBe(false);
    expect(listStagingArtifacts(movedTargetRoot)).toEqual([]);
  });

  it("normalizes raw provider access errors before a transfer response is exposed", async () => {
    const { sandbox, targetRoot } = makeSandbox();
    const sourceProvider = {
      id: "resource",
      capabilities: () => ({ exportTree: true }),
      async *exportTree() {
        yield { kind: "directory", path: [] };
        throw Object.assign(new Error("EPERM: denied <provider-private-path>"), {
          code: "EPERM",
        });
      },
    } satisfies Partial<ResourceProvider>;
    const resourceIO = new ResourceIO({
      providers: {
        resource: sourceProvider as ResourceProvider,
        local_fs: new LocalFsProvider({ cwd: sandbox }),
      },
    });

    await expect(resourceIO.transfer({
      source: { kind: "resource", resourceId: "denied-source" },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "copy.bin",
      operationId: OPERATION_ID,
    }, { source: "api" })).rejects.toMatchObject({
      code: "resource_access_denied",
      status: 403,
    });
  });

  it("rejects an upstream chunk larger than 1 MiB instead of slicing it after allocation", async () => {
    const { sandbox, targetRoot } = makeSandbox();
    const sourceProvider = {
      id: "resource",
      capabilities: () => ({ exportTree: true }),
      async *exportTree() {
        yield {
          kind: "file",
          path: [],
          sizeBytes: TRANSFER_MAX_CHUNK_BYTES + 1,
          version: { size: TRANSFER_MAX_CHUNK_BYTES + 1 },
          body: (async function* () {
            yield new Uint8Array(TRANSFER_MAX_CHUNK_BYTES + 1);
          })(),
        } satisfies ResourceExportEntry;
      },
    } satisfies Partial<ResourceProvider>;
    const resourceIO = new ResourceIO({
      providers: {
        resource: sourceProvider as ResourceProvider,
        local_fs: new LocalFsProvider({ cwd: sandbox }),
      },
    });

    await expect(resourceIO.transfer({
      source: { kind: "resource", resourceId: "oversized-chunk" },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "oversized.bin",
      operationId: OPERATION_ID,
    }, { source: "api" })).rejects.toMatchObject({
      code: "knowledge_transfer_entry_unsupported",
      details: { state: "file_chunk_exceeds_limit" },
    });
    expect(fs.existsSync(path.join(targetRoot, "oversized.bin"))).toBe(false);
    expect(listStagingArtifacts(targetRoot)).toEqual([]);
  });

  it("cancels sibling streams immediately after one concurrent file fails", async () => {
    const { sandbox, targetRoot } = makeSandbox();
    let siblingChunksRead = 0;
    const sourceProvider = {
      id: "resource",
      capabilities: () => ({ exportTree: true }),
      async *exportTree() {
        yield { kind: "directory", path: [] } satisfies ResourceExportEntry;
        yield {
          kind: "file",
          path: ["broken.bin"],
          sizeBytes: 1,
          version: { size: 1 },
          body: (async function* () {
            yield Uint8Array.of(1, 2);
          })(),
        } satisfies ResourceExportEntry;
        yield {
          kind: "file",
          path: ["sibling.bin"],
          sizeBytes: 256,
          version: { size: 256 },
          body: (async function* () {
            for (let index = 0; index < 256; index += 1) {
              siblingChunksRead += 1;
              await new Promise((resolve) => setImmediate(resolve));
              yield Uint8Array.of(index);
            }
          })(),
        } satisfies ResourceExportEntry;
      },
    } satisfies Partial<ResourceProvider>;
    const resourceIO = new ResourceIO({
      providers: {
        resource: sourceProvider as ResourceProvider,
        local_fs: new LocalFsProvider({ cwd: sandbox }),
      },
    });

    await expect(resourceIO.transfer({
      source: { kind: "resource", resourceId: "failing-siblings" },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "failed-tree",
      operationId: OPERATION_ID,
    }, { source: "api" })).rejects.toMatchObject({
      code: "knowledge_version_conflict",
    });

    expect(siblingChunksRead).toBeLessThan(256);
    expect(fs.existsSync(path.join(targetRoot, "failed-tree"))).toBe(false);
    expect(listStagingArtifacts(targetRoot)).toEqual([]);
  });

  it("validates the complete transfer plan before the target provider creates staging", async () => {
    const { sandbox, targetRoot } = makeSandbox();
    const sourceProvider = {
      id: "resource",
      capabilities: () => ({ exportTree: true }),
      async *exportTree() {
        yield { kind: "directory", path: [] } satisfies ResourceExportEntry;
        yield { kind: "file", path: ["missing-parent", "bad.txt"], sizeBytes: 0, version: { size: 0 }, body: emptyBody() } satisfies ResourceExportEntry;
      },
    } satisfies Partial<ResourceProvider>;
    const resourceIO = new ResourceIO({
      providers: {
        resource: sourceProvider as ResourceProvider,
        local_fs: new LocalFsProvider({ cwd: sandbox }),
      },
    });

    await expect(resourceIO.transfer({
      source: { kind: "resource", resourceId: "invalid-tree" },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "invalid",
      operationId: OPERATION_ID,
    }, { source: "api" })).rejects.toMatchObject({
      code: "knowledge_transfer_entry_unsupported",
      details: { state: "entry_before_parent_directory" },
    });

    expect(fs.existsSync(path.join(targetRoot, "invalid"))).toBe(false);
    expect(listStagingArtifacts(targetRoot)).toEqual([]);
  });

  it("enforces depth and aggregate-size plan limits without reading file bodies", () => {
    const tooDeep = new TransferPlanTracker();
    expect(() => tooDeep.admit({
      kind: "directory",
      path: Array.from({ length: TRANSFER_MAX_DEPTH }, (_, index) => `d${index}`),
    })).toThrow(expect.objectContaining({
      code: "knowledge_transfer_limit_exceeded",
    }));

    const tooLarge = new TransferPlanTracker();
    let bodyRead = false;
    expect(() => tooLarge.admit({
      kind: "file",
      path: [],
      sizeBytes: TRANSFER_MAX_AGGREGATE_BYTES + 1,
      version: { size: TRANSFER_MAX_AGGREGATE_BYTES + 1 },
      body: (async function* () {
        bodyRead = true;
        yield Uint8Array.of(1);
      })(),
    })).toThrow(expect.objectContaining({
      code: "knowledge_transfer_limit_exceeded",
    }));
    expect(bodyRead).toBe(false);

    const tooMany = new TransferPlanTracker();
    tooMany.admit({ kind: "directory", path: [] });
    for (let index = 1; index < TRANSFER_MAX_ENTRIES; index += 1) {
      tooMany.admit({ kind: "directory", path: [`d${index}`] });
    }
    expect(() => tooMany.admit({
      kind: "directory",
      path: ["one-entry-too-many"],
    })).toThrow(expect.objectContaining({
      code: "knowledge_transfer_limit_exceeded",
    }));
  });

  it("limits concurrent local target file streams to four", async () => {
    const { sandbox, targetRoot } = makeSandbox();
    let activeStreams = 0;
    let peakStreams = 0;
    const sourceProvider = {
      id: "resource",
      capabilities: () => ({ exportTree: true }),
      async *exportTree() {
        yield { kind: "directory", path: [] } satisfies ResourceExportEntry;
        for (let index = 0; index < 8; index += 1) {
          yield {
            kind: "file",
            path: [`${index}.bin`],
            sizeBytes: 1,
            version: { size: 1 },
            body: (async function* () {
              activeStreams += 1;
              peakStreams = Math.max(peakStreams, activeStreams);
              await new Promise((resolve) => setTimeout(resolve, 5));
              yield Uint8Array.of(index);
              activeStreams -= 1;
            })(),
          } satisfies ResourceExportEntry;
        }
      },
    } satisfies Partial<ResourceProvider>;
    const resourceIO = new ResourceIO({
      providers: {
        resource: sourceProvider as ResourceProvider,
        local_fs: new LocalFsProvider({ cwd: sandbox }),
      },
    });

    await resourceIO.transfer({
      source: { kind: "resource", resourceId: "parallel-tree" },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "parallel",
      operationId: OPERATION_ID,
    }, { source: "api" });

    expect(peakStreams).toBe(TRANSFER_MAX_CONCURRENT_FILE_STREAMS);
    expect(activeStreams).toBe(0);
  });

  it("keeps the shared transfer budget within 8 MiB and does not double-count waiters", async () => {
    const budget = new TransferBudget(TRANSFER_MAX_BUFFERED_BYTES);
    await budget.acquire(TRANSFER_MAX_BUFFERED_BYTES);
    let acquired = false;
    const waiting = budget.acquire(1).then(() => {
      acquired = true;
    });
    await Promise.resolve();
    expect(acquired).toBe(false);

    budget.release(TRANSFER_MAX_BUFFERED_BYTES);
    await waiting;
    expect(budget.usedBytes).toBe(1);
    expect(budget.peakBytes).toBe(TRANSFER_MAX_BUFFERED_BYTES);
    budget.release(1);
    expect(budget.usedBytes).toBe(0);
  });

  it("reserves process budget before pulling chunks across concurrent ResourceIO transfers", async () => {
    let produced = 0;
    let releaseConsumers!: () => void;
    const consumersReleased = new Promise<void>((resolve) => {
      releaseConsumers = resolve;
    });
    const sourceProvider = {
      id: "resource",
      capabilities: () => ({ exportTree: true }),
      async *exportTree() {
        yield {
          kind: "file",
          path: [],
          sizeBytes: TRANSFER_MAX_CHUNK_BYTES,
          version: { size: TRANSFER_MAX_CHUNK_BYTES },
          body: (async function* () {
            produced += 1;
            yield new Uint8Array(TRANSFER_MAX_CHUNK_BYTES);
          })(),
        } satisfies ResourceExportEntry;
      },
    } satisfies Partial<ResourceProvider>;
    const targetProvider = {
      id: "mount",
      capabilities: () => ({ importTree: true }),
      async importTreeAtomically(
        targetDirectory: ResourceRef,
        targetName: string,
        entries: AsyncIterable<ResourceExportEntry>,
      ) {
        for await (const entry of entries) {
          if (entry.kind !== "file") continue;
          const iterator = entry.body[Symbol.asyncIterator]();
          await iterator.next();
          await consumersReleased;
          await iterator.next();
        }
        return {
          changeType: "created" as const,
          resourceKey: `mount:target:${targetName}`,
          resource: {
            kind: "mount" as const,
            mountId: "target",
            path: targetName,
            provider: "mount" as const,
          },
          version: { size: TRANSFER_MAX_CHUNK_BYTES },
          bytesTransferred: TRANSFER_MAX_CHUNK_BYTES,
        };
      },
    } satisfies Partial<ResourceProvider>;
    const resourceIO = new ResourceIO({
      providers: {
        resource: sourceProvider as ResourceProvider,
        mount: targetProvider as ResourceProvider,
      },
    });
    const transfers = Array.from({ length: 9 }, (_, index) =>
      resourceIO.transfer({
        source: { kind: "resource", resourceId: `source-${index}` },
        targetDirectory: { kind: "mount", mountId: "target", path: "" },
        targetName: `copy-${index}.bin`,
        operationId: OPERATION_ID,
      }, { source: "api" }));

    for (let attempt = 0; attempt < 100 && produced < 8; attempt += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(produced).toBe(8);
    expect(processTransferBudget.usedBytes).toBe(TRANSFER_MAX_BUFFERED_BYTES);
    expect(processTransferBudget.peakBytes).toBeLessThanOrEqual(
      TRANSFER_MAX_BUFFERED_BYTES,
    );

    releaseConsumers();
    await Promise.all(transfers);
    expect(produced).toBe(9);
    expect(processTransferBudget.usedBytes).toBe(0);
  });

  it("encodes provider-neutral version fields without collapsing etag-only versions", () => {
    expect(encodeResourceTransferVersion({ etag: "first" }))
      .not.toBe(encodeResourceTransferVersion({ etag: "second" }));
    expect(encodeResourceTransferVersion({ sha256: "abc", sequence: 7 }))
      .not.toBe(encodeResourceTransferVersion({ sha256: "abc", sequence: 8 }));
  });

  it("supports the local_fs and mount provider-pair matrix without exposing native paths in results", async () => {
    const { sandbox, sourceRoot, targetRoot } = makeSandbox();
    const hanakoHome = path.join(sandbox, "hana-home");
    const studioId = "studio-transfer";
    const mountSourceId = "mount-source";
    const mountTargetId = "mount-target";
    for (const [mountId, rootPath] of [
      [mountSourceId, sourceRoot],
      [mountTargetId, targetRoot],
    ]) {
      upsertStudioMount(hanakoHome, {
        mountId,
        hostStudioId: studioId,
        sourceKind: "storage",
        provider: "local_fs",
        label: mountId,
        presentation: "folder",
        capabilities: ["list", "read", "write", "watch", "materialize"],
        rootLocator: { path: rootPath },
      });
    }
    const localProviderFactory = ({
      cwd,
      guard,
    }: {
      cwd: string;
      guard: {
        check: (
          filePath: string,
          operation: "read" | "write" | "delete",
        ) => { allowed: boolean; reason?: string };
      };
    }) =>
      new LocalFsProvider({ cwd, guard });
    const resourceIO = new ResourceIO({
      providers: {
        local_fs: new LocalFsProvider({ cwd: sandbox }),
        mount: new MountProvider({
          hanakoHome,
          studioId,
          localFsProviderFactory: localProviderFactory,
        }),
      },
    });
    fs.writeFileSync(path.join(sourceRoot, "matrix.txt"), "matrix");

    const cases: Array<{
      source: ResourceRef;
      targetDirectory: ResourceRef;
      targetName: string;
      expectedTarget: ResourceRef;
    }> = [
      {
        source: { kind: "local-file", path: path.join(sourceRoot, "matrix.txt") },
        targetDirectory: { kind: "local-file", path: targetRoot },
        targetName: "local-to-local.txt",
        expectedTarget: { kind: "local-file", path: path.join(targetRoot, "local-to-local.txt") },
      },
      {
        source: { kind: "local-file", path: path.join(sourceRoot, "matrix.txt") },
        targetDirectory: { kind: "mount", mountId: mountTargetId, path: "" },
        targetName: "local-to-mount.txt",
        expectedTarget: { kind: "mount", mountId: mountTargetId, path: "local-to-mount.txt" },
      },
      {
        source: { kind: "mount", mountId: mountSourceId, path: "matrix.txt" },
        targetDirectory: { kind: "local-file", path: targetRoot },
        targetName: "mount-to-local.txt",
        expectedTarget: { kind: "local-file", path: path.join(targetRoot, "mount-to-local.txt") },
      },
      {
        source: { kind: "mount", mountId: mountSourceId, path: "matrix.txt" },
        targetDirectory: { kind: "mount", mountId: mountTargetId, path: "" },
        targetName: "mount-to-mount.txt",
        expectedTarget: { kind: "mount", mountId: mountTargetId, path: "mount-to-mount.txt" },
      },
    ];

    for (const entry of cases) {
      const result = await resourceIO.transfer({
        ...entry,
        operationId: OPERATION_ID,
      }, { source: "api" });
      expect(result.target).toEqual(entry.expectedTarget);
      expect(result.target).not.toHaveProperty("filePath");
      expect(fs.readFileSync(path.join(targetRoot, entry.targetName), "utf-8")).toBe("matrix");
    }
  });

  it("fails closed when either provider does not implement its transfer SPI capability", async () => {
    const resourceIO = new ResourceIO({
      providers: {
        resource: {
          id: "resource",
          capabilities: () => ({ exportTree: false }),
        },
        local_fs: {
          id: "local_fs",
          capabilities: () => ({ importTree: false }),
        },
      },
    });

    await expect(resourceIO.transfer({
      source: { kind: "resource", resourceId: "source" },
      targetDirectory: { kind: "local-file", path: "/not-used" },
      targetName: "denied",
      operationId: OPERATION_ID,
    }, { source: "api" })).rejects.toMatchObject({
      code: "capability_denied",
      status: 403,
    });
  });

  it("refuses non-atomic directory replacement and preserves the existing tree", async () => {
    const { sandbox, sourceRoot, targetRoot } = makeSandbox();
    const { resourceIO } = makeLocalResourceIO(sandbox);
    const sourceDirectory = path.join(sourceRoot, "new-tree");
    const targetDirectory = path.join(targetRoot, "existing-tree");
    fs.mkdirSync(sourceDirectory);
    fs.mkdirSync(targetDirectory);
    fs.writeFileSync(path.join(sourceDirectory, "new.txt"), "new");
    fs.writeFileSync(path.join(targetDirectory, "old.txt"), "old");
    const expectedTargetVersion = encodeResourceTransferVersion({
      mtimeMs: fs.lstatSync(targetDirectory).mtime.getTime(),
      size: null,
    });

    await expect(resourceIO.transfer({
      source: { kind: "local-file", path: sourceDirectory },
      targetDirectory: { kind: "local-file", path: targetRoot },
      targetName: "existing-tree",
      expectedTargetVersion,
      operationId: OPERATION_ID,
    }, { source: "api" })).rejects.toMatchObject({
      code: "knowledge_transfer_entry_unsupported",
      details: { state: "atomic_directory_replacement_unsupported" },
    });

    expect(fs.readFileSync(path.join(targetDirectory, "old.txt"), "utf-8")).toBe("old");
    expect(fs.existsSync(path.join(targetDirectory, "new.txt"))).toBe(false);
    expect(listStagingArtifacts(targetRoot)).toEqual([]);
  });
});

async function* emptyBody(): AsyncIterable<Uint8Array> {}
