import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KnowledgeIndexStore,
} from "../lib/knowledge-workspace/knowledge-index-store.ts";
import { ResourceIO } from "../lib/resource-io/resource-io.ts";
import type {
  ResourceOpenReadResult,
  ResourceProvider,
  ResourceRef,
  ResourceStat,
  ResourceVersion,
} from "../lib/resource-io/types.ts";
import {
  SAFE_TEXT_INDEX_MAX_BYTES,
  SafeTextIndexVersionConflictError,
  extractSafeTextIndexFacts,
} from "../lib/knowledge-workspace/safe-text-index-extractor.ts";

const temporaryDirectories: string[] = [];
const resource: ResourceRef = { kind: "resource", resourceId: "asset-1" };

type ProviderHarness = {
  resourceIO: ResourceIO;
  stat: ReturnType<typeof vi.fn>;
  openRead: ReturnType<typeof vi.fn>;
  setBody(bytes: Uint8Array, version?: ResourceVersion): void;
  setMissing(): void;
};

function createProviderHarness(
  initialBytes: Uint8Array,
  initialVersion: ResourceVersion = {
    size: initialBytes.byteLength,
    mtimeMs: 100,
    sequence: 1,
  },
): ProviderHarness {
  let bytes = initialBytes;
  let version = initialVersion;
  let exists = true;
  const stat = vi.fn(async (): Promise<ResourceStat> => ({
    resourceKey: "resource:asset-1",
    resource,
    exists,
    isDirectory: false,
    ...(exists ? { version } : {}),
  }));
  const openRead = vi.fn(async (
    _ref: ResourceRef,
    options: { expectedVersion?: ResourceVersion } = {},
  ): Promise<ResourceOpenReadResult> => {
    expect(options.expectedVersion).toEqual(version);
    return {
      resourceKey: "resource:asset-1",
      resource,
      size: bytes.byteLength,
      mtimeMs: Number(version.mtimeMs ?? 0),
      version,
      body: (async function* () {
        yield bytes;
      })(),
    };
  });
  const provider: ResourceProvider = {
    id: "resource",
    capabilities: () => ({ stat: true, openRead: true }),
    stat,
    openRead,
  };
  return {
    resourceIO: new ResourceIO({ providers: { resource: provider } }),
    stat,
    openRead,
    setBody(nextBytes, nextVersion = {
      size: nextBytes.byteLength,
      mtimeMs: Number(version.mtimeMs ?? 0) + 1,
      sequence: Number(version.sequence ?? 0) + 1,
    }) {
      bytes = nextBytes;
      version = nextVersion;
      exists = true;
    },
    setMissing() {
      exists = false;
    },
  };
}

function extract(
  harness: ProviderHarness,
  relativePath = "Assets/notes.txt",
  signal?: AbortSignal,
) {
  return extractSafeTextIndexFacts({
    resourceIO: harness.resourceIO,
    resource,
    relativePath,
    indexedAtMs: 500,
    signal,
  });
}

function temporaryHome(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hana-safe-index-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("safe non-Markdown text index extraction", () => {
  it("stats before reading and indexes the exact saved UTF-8 body with resource identity", async () => {
    const harness = createProviderHarness(Buffer.from("Hello Café 项目"));
    const result = await extract(harness);

    expect(harness.stat).toHaveBeenCalledOnce();
    expect(harness.openRead).toHaveBeenCalledOnce();
    expect(harness.stat.mock.invocationCallOrder[0])
      .toBeLessThan(harness.openRead.mock.invocationCallOrder[0]);
    expect(result.resource).toMatchObject({
      relativePath: "Assets/notes.txt",
      parentPath: "Assets",
      basename: "notes.txt",
      extension: ".txt",
      kind: "text",
      sizeBytes: Buffer.byteLength("Hello Café 项目"),
      mtimeMs: 100,
      contentState: "indexed",
      contentReason: null,
    });
    expect(result.page).toBeNull();
    expect(result.search).toEqual({
      titleFold: "notes.txt",
      pathFold: "assets/notes.txt",
      metadataFold: "",
      bodyFold: "hello café 项目",
    });
  });

  it.each([
    ["utf-8-bom", Uint8Array.from([0xef, 0xbb, 0xbf, 0x68, 0x69]), "hi"],
    ["utf-16le", Uint8Array.from([0xff, 0xfe, 0x60, 0x4f, 0x7d, 0x59]), "你好"],
    ["utf-16be", Uint8Array.from([0xfe, 0xff, 0x4f, 0x60, 0x59, 0x7d]), "你好"],
    ["utf-32le", Uint8Array.from([0xff, 0xfe, 0x00, 0x00, 0x42, 0xf6, 0x01, 0x00]), "🙂"],
    ["utf-32be", Uint8Array.from([0x00, 0x00, 0xfe, 0xff, 0x00, 0x01, 0xf6, 0x42]), "🙂"],
  ])("indexes deterministic %s only when its required BOM is present", async (
    _encoding,
    bytes,
    expected,
  ) => {
    const result = await extract(createProviderHarness(bytes));
    expect(result.resource.contentState).toBe("indexed");
    expect(result.search.bodyFold).toBe(expected);
  });

  it("rejects 10 MiB + 1 byte from stat without opening or reading the body", async () => {
    const harness = createProviderHarness(new Uint8Array(0), {
      size: SAFE_TEXT_INDEX_MAX_BYTES + 1,
      mtimeMs: 100,
      sequence: 1,
    });
    const result = await extract(harness);

    expect(harness.stat).toHaveBeenCalledOnce();
    expect(harness.openRead).not.toHaveBeenCalled();
    expect(result.resource).toMatchObject({
      contentState: "rejected",
      contentReason: "content_too_large",
    });
    expect(result.search.bodyFold).toBe("");
  });

  it.each([
    ["report.pdf", "pdf"],
    ["photo.png", "image"],
    ["voice.mp3", "audio"],
    ["clip.webm", "video"],
    ["archive.zip", "binary"],
  ])("keeps %s metadata-only as %s without reading content", async (
    fileName,
    kind,
  ) => {
    const harness = createProviderHarness(Buffer.from("searchable secret"));
    const result = await extract(harness, `Assets/${fileName}`);

    expect(harness.openRead).not.toHaveBeenCalled();
    expect(result.resource).toMatchObject({
      kind,
      contentState: "metadata-only",
    });
    expect(result.search.bodyFold).toBe("");
  });

  it.each([
    ["page.html", "text"],
    ["drawing.svg", "image"],
    ["shortcut.url", "link"],
    ["diagram.mmd", "text"],
  ])("does not read or execute active content in %s", async (fileName, kind) => {
    const execute = vi.fn();
    const harness = createProviderHarness(Buffer.from(
      `<script>${execute.name}()</script>`,
    ));
    const result = await extract(harness, `Assets/${fileName}`);

    expect(harness.openRead).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(result.resource).toMatchObject({
      kind,
      contentState: "rejected",
      contentReason: "active_content",
    });
  });

  it("rejects unsafe or BOM-less legacy encodings without replacement characters or partial body", async () => {
    const harness = createProviderHarness(Uint8Array.from([0xc3, 0x28]));
    const result = await extract(harness, "Assets/legacy.unknown");

    expect(result.resource).toMatchObject({
      kind: "text",
      contentState: "rejected",
      contentReason: "unsafe_encoding",
    });
    expect(result.search.bodyFold).toBe("");
  });

  it("uses expected-version openRead and rejects size/version drift without facts", async () => {
    const harness = createProviderHarness(Buffer.from("old"));
    harness.openRead.mockImplementationOnce(async (): Promise<ResourceOpenReadResult> => ({
      resourceKey: "resource:asset-1",
      resource,
      size: 7,
      mtimeMs: 101,
      version: { size: 7, mtimeMs: 101, sequence: 2 },
      body: (async function* () {
        yield Buffer.from("changed");
      })(),
    }));

    await expect(extract(harness)).rejects
      .toBeInstanceOf(SafeTextIndexVersionConflictError);
  });

  it("returns missing metadata without read and propagates stat permission/source failures", async () => {
    const missing = createProviderHarness(Buffer.from("old"));
    missing.setMissing();
    const result = await extract(missing);
    expect(result.resource).toMatchObject({
      contentState: "missing",
      contentReason: "resource_missing",
    });
    expect(missing.openRead).not.toHaveBeenCalled();

    const denied = createProviderHarness(Buffer.from("secret"));
    denied.stat.mockRejectedValueOnce(Object.assign(new Error("denied"), {
      code: "resource_access_denied",
    }));
    await expect(extract(denied)).rejects.toMatchObject({
      code: "resource_access_denied",
    });
    expect(denied.openRead).not.toHaveBeenCalled();
  });

  it("cancels a streaming read without returning a partial body", async () => {
    const harness = createProviderHarness(Buffer.from("abcdef"));
    const controller = new AbortController();
    harness.openRead.mockImplementationOnce(async (): Promise<ResourceOpenReadResult> => ({
      resourceKey: "resource:asset-1",
      resource,
      size: 6,
      mtimeMs: 100,
      version: { size: 6, mtimeMs: 100, sequence: 1 },
      body: (async function* () {
        yield Buffer.from("abc");
        controller.abort();
        yield Buffer.from("def");
      })(),
    }));

    await expect(extract(harness, "Assets/log.txt", controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
  });

  it("removes an old safe body when the same asset crosses the size gate", async () => {
    const store = new KnowledgeIndexStore({
      hanakoHome: temporaryHome(),
      workspaceFingerprint: "c".repeat(64),
      sourceFingerprint: "d".repeat(64),
      extractorContractVersion: "safe-text-index-v1",
      hostId: "test-host",
    });
    const rebuild = store.beginRebuild({
      rebuildId: "safe-text-replace",
      generationId: "generation-1",
      startedSequence: 1,
    });
    const harness = createProviderHarness(Buffer.from("old searchable body"));
    rebuild.replaceResource(await extract(harness));
    harness.setBody(new Uint8Array(0), {
      size: SAFE_TEXT_INDEX_MAX_BYTES + 1,
      mtimeMs: 101,
      sequence: 2,
    });
    rebuild.replaceResource(await extract(harness));
    rebuild.publish({ lastCompleteSequence: 2 });

    const lease = store.acquireQueryLease();
    expect(lease.inspect()).toMatchObject({
      resourceCount: 1,
      nonEmptyBodyFtsCount: 0,
    });
    lease.release();
  });

  it("refuses Markdown so Page extraction cannot silently fork", async () => {
    await expect(extract(
      createProviderHarness(Buffer.from("# page")),
      "Pages/Page.md",
    )).rejects.toThrow("Markdown");
  });
});
