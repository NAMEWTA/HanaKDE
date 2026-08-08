import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KnowledgeCopyService,
} from "../core/knowledge-workspace/knowledge-copy-service.ts";
import { LocalFsProvider } from "../lib/resource-io/providers/local-fs-provider.ts";
import { ResourceIO } from "../lib/resource-io/resource-io.ts";
import {
  RequestBodyResourceProvider,
} from "../lib/resource-io/providers/request-body-provider.ts";
import type {
  KnowledgeResourceAddress,
  KnowledgeSourceDto,
} from "../shared/knowledge-workspace-contract.ts";

const IDS = [
  "6f0d2f1a-4d5e-4a5b-9b6a-1f2e3d4c5b6a",
  "7f0d2f1a-4d5e-4a5b-9b6a-1f2e3d4c5b6b",
  "8f0d2f1a-4d5e-4a5b-9b6a-1f2e3d4c5b6c",
  "9f0d2f1a-4d5e-4a5b-9b6a-1f2e3d4c5b6d",
] as const;

describe("KnowledgeCopyService", () => {
  let sandbox: string | null = null;

  afterEach(() => {
    if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true });
    sandbox = null;
    vi.restoreAllMocks();
  });

  function setup() {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "hana-knowledge-copy-"));
    const roots = {
      main: path.join(sandbox, "main"),
      research: path.join(sandbox, "research"),
    };
    fs.mkdirSync(path.join(roots.main, "Notes"), { recursive: true });
    fs.mkdirSync(path.join(roots.research, "Pages"), { recursive: true });
    fs.mkdirSync(path.join(roots.research, "Media"), { recursive: true });
    fs.writeFileSync(path.join(roots.main, "Notes", "Host.md"), "# Host\n");
    const resourceIO = new ResourceIO({
      providers: {
        local_fs: new LocalFsProvider({ cwd: sandbox }),
      },
    });
    const sources = new Map<string, KnowledgeSourceDto>([
      ["main", source("main")],
      ["research", source("research", "Research")],
    ]);
    const sourceRegistry = {
      get(sourceKey: string) {
        return sources.get(sourceKey) ?? null;
      },
      async revalidate(sourceKey: string) {
        if (!sources.has(sourceKey)) throw new Error("source unavailable");
      },
      async resolveAddress(address: KnowledgeResourceAddress) {
        const root = roots[address.sourceKey as keyof typeof roots];
        if (!root) throw new Error("source unavailable");
        return {
          kind: "local-file" as const,
          path: path.join(root, ...address.relativePath.split("/").filter(Boolean)),
        };
      },
    };
    let id = 0;
    const service = new KnowledgeCopyService({
      sourceRegistry,
      resourceIO,
      randomUUID: () => IDS[id++ % IDS.length],
    });
    return { roots, resourceIO, service, sourceRegistry, sources };
  }

  it("copies a cross-source Page beside the host and preserves its complete body", async () => {
    const { roots, service } = setup();
    const original = "# Source\n\n[[Missing.md]]\r\n";
    fs.writeFileSync(
      path.join(roots.research, "Pages", "Source.md"),
      original,
    );

    const result = await service.copyForEditor({
      sourceAddress: address("research", "Pages/Source.md"),
      pageAddress: address("main", "Notes/Host.md"),
      kind: "page",
    });

    expect(result).toEqual({
      copied: true,
      targetAddress: address("main", "Notes/Source.md"),
      bytesTransferred: Buffer.byteLength(original),
      embed: false,
      originalName: "Source.md",
    });
    expect(fs.readFileSync(
      path.join(roots.main, "Notes", "Source.md"),
      "utf8",
    )).toBe(original);
    expect(fs.readFileSync(
      path.join(roots.research, "Pages", "Source.md"),
      "utf8",
    )).toBe(original);
  });

  it("uses deterministic keep-both suffixes without rewriting copied Markdown", async () => {
    const { roots, service } = setup();
    fs.writeFileSync(path.join(roots.research, "Pages", "Source.md"), "[[A]]");
    fs.writeFileSync(path.join(roots.main, "Notes", "Source.md"), "existing");

    const first = await service.copyForEditor({
      sourceAddress: address("research", "Pages/Source.md"),
      pageAddress: address("main", "Notes/Host.md"),
      kind: "page",
    });
    const second = await service.copyForEditor({
      sourceAddress: address("research", "Pages/Source.md"),
      pageAddress: address("main", "Notes/Host.md"),
      kind: "page",
    });

    expect(first.targetAddress.relativePath).toBe("Notes/Source_2.md");
    expect(second.targetAddress.relativePath).toBe("Notes/Source_3.md");
    expect(fs.readFileSync(
      path.join(roots.main, "Notes", "Source_2.md"),
      "utf8",
    )).toBe("[[A]]");
    expect(fs.readFileSync(
      path.join(roots.main, "Notes", "Source_3.md"),
      "utf8",
    )).toBe("[[A]]");
  });

  it("creates sibling assets and applies local-date plus collision suffix naming", async () => {
    const { roots, service } = setup();
    const bytes = Buffer.from([0, 1, 2, 255, 13, 10]);
    fs.writeFileSync(path.join(roots.research, "Media", "photo.PNG"), bytes);

    const first = await service.copyForEditor({
      sourceAddress: address("research", "Media/photo.PNG"),
      pageAddress: address("main", "Notes/Host.md"),
      kind: "attachment",
      localDate: "2026-07-30",
    });
    const second = await service.copyForEditor({
      sourceAddress: address("research", "Media/photo.PNG"),
      pageAddress: address("main", "Notes/Host.md"),
      kind: "attachment",
      localDate: "2026-07-30",
    });

    expect(first).toMatchObject({
      copied: true,
      targetAddress: address(
        "main",
        "Notes/assets/2026-07-30-photo.PNG",
      ),
      embed: true,
    });
    expect(second.targetAddress.relativePath).toBe(
      "Notes/assets/2026-07-30-photo_2.PNG",
    );
    expect(fs.readFileSync(
      path.join(roots.main, "Notes", "assets", "2026-07-30-photo.PNG"),
    )).toEqual(bytes);
    expect(stagingFiles(path.join(roots.main, "Notes", "assets"))).toEqual([]);
  });

  it("plans a fixed editor target without creating assets and rejects a changed page before mkdir", async () => {
    const { roots, service } = setup();
    fs.writeFileSync(path.join(roots.research, "Media", "planned.png"), "bytes");

    const plan = await service.planCopyForEditor({
      sourceAddress: address("research", "Media/planned.png"),
      pageAddress: address("main", "Notes/Host.md"),
      kind: "attachment",
      localDate: "2026-07-30",
    });

    expect(plan).toMatchObject({
      disposition: "copy",
      prepared: {
        targetDirectoryAddress: address("main", "Notes/assets"),
        targetAddress: address("main", "Notes/assets/2026-07-30-planned.png"),
      },
    });
    expect(fs.existsSync(path.join(roots.main, "Notes", "assets"))).toBe(false);
    if (plan.disposition !== "copy") throw new Error("copy plan was not prepared");
    fs.writeFileSync(path.join(roots.main, "Notes", "Host.md"), "# changed page\n");
    await expect(service.copyPreparedForEditor(plan.prepared)).rejects.toMatchObject({
      code: "knowledge_version_conflict",
    });
    expect(fs.existsSync(path.join(roots.main, "Notes", "assets"))).toBe(false);
  });

  it("accepts unchanged source and page versions even when a provider changes version key order", async () => {
    const { roots, resourceIO, service } = setup();
    fs.writeFileSync(path.join(roots.research, "Media", "planned.png"), "bytes");

    const plan = await service.planCopyForEditor({
      sourceAddress: address("research", "Media/planned.png"),
      pageAddress: address("main", "Notes/Host.md"),
      kind: "attachment",
      localDate: "2026-07-30",
    });
    if (plan.disposition !== "copy") throw new Error("copy plan was not prepared");

    const stat = resourceIO.stat.bind(resourceIO);
    vi.spyOn(resourceIO, "stat").mockImplementation(async (resource, context) => {
      const current = await stat(resource, context);
      if (!current.version) return current;
      return {
        ...current,
        version: {
          size: current.version.size,
          mtimeMs: current.version.mtimeMs,
          sha256: current.version.sha256,
          etag: current.version.etag,
          sequence: current.version.sequence,
        },
      };
    });

    await expect(service.copyPreparedForEditor(plan.prepared)).resolves.toMatchObject({
      copied: true,
      targetAddress: address("main", "Notes/assets/2026-07-30-planned.png"),
    });
  });

  it("allocates distinct keep-both names for concurrent copies", async () => {
    const { roots, service } = setup();
    fs.writeFileSync(path.join(roots.research, "Media", "photo.png"), "bytes");

    const results = await Promise.all([
      service.copyForEditor({
        sourceAddress: address("research", "Media/photo.png"),
        pageAddress: address("main", "Notes/Host.md"),
        kind: "attachment",
        localDate: "2026-07-30",
      }),
      service.copyForEditor({
        sourceAddress: address("research", "Media/photo.png"),
        pageAddress: address("main", "Notes/Host.md"),
        kind: "attachment",
        localDate: "2026-07-30",
      }),
    ]);

    expect(results.map(result => result.targetAddress.relativePath).sort())
      .toEqual([
        "Notes/assets/2026-07-30-photo.png",
        "Notes/assets/2026-07-30-photo_2.png",
      ]);
  });

  it("fails when assets is occupied by a file and does not use a fallback directory", async () => {
    const { roots, service } = setup();
    fs.writeFileSync(path.join(roots.research, "Media", "photo.png"), "bytes");
    fs.writeFileSync(path.join(roots.main, "Notes", "assets"), "occupied");

    await expect(service.copyForEditor({
      sourceAddress: address("research", "Media/photo.png"),
      pageAddress: address("main", "Notes/Host.md"),
      kind: "attachment",
      localDate: "2026-07-30",
    })).rejects.toMatchObject({
      code: "knowledge_operation_precondition_failed",
    });
    expect(fs.readdirSync(path.join(roots.main, "Notes")).sort()).toEqual([
      "Host.md",
      "assets",
    ]);
    expect(fs.readFileSync(
      path.join(roots.main, "Notes", "assets"),
      "utf8",
    )).toBe("occupied");
  });

  it("streams a system File body into assets without a Renderer byte buffer", async () => {
    const { roots, sourceRegistry } = setup();
    const first = new Uint8Array(900_000).fill(0x61);
    const second = new Uint8Array(700_000).fill(0x62);
    const fileId = "external-upload-1";
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(first);
        controller.enqueue(second);
        controller.close();
      },
    });
    const resourceIO = new ResourceIO({
      providers: {
        local_fs: new LocalFsProvider({ cwd: sandbox! }),
        session_file: new RequestBodyResourceProvider({
          fileId,
          body,
          sizeBytes: first.byteLength + second.byteLength,
        }),
      },
    });
    const service = new KnowledgeCopyService({
      sourceRegistry,
      resourceIO,
      randomUUID: () => IDS[0],
    });

    const result = await service.copyExternalForEditor({
      source: { kind: "session-file", fileId },
      sourceSizeBytes: first.byteLength + second.byteLength,
      originalName: "capture.webp",
      mimeType: "image/webp",
      pageAddress: address("main", "Notes/Host.md"),
      localDate: "2026-07-30",
    });

    expect(result).toMatchObject({
      targetAddress: address(
        "main",
        "Notes/assets/2026-07-30-capture.webp",
      ),
      bytesTransferred: 1_600_000,
      embed: true,
    });
    const copied = fs.readFileSync(path.join(
      roots.main,
      "Notes",
      "assets",
      "2026-07-30-capture.webp",
    ));
    expect(copied.subarray(0, first.byteLength)).toEqual(Buffer.from(first));
    expect(copied.subarray(first.byteLength)).toEqual(Buffer.from(second));
  });

  it("removes staging and final files when an external body size is wrong", async () => {
    const { roots, sourceRegistry } = setup();
    const fileId = "external-upload-short";
    const resourceIO = new ResourceIO({
      providers: {
        local_fs: new LocalFsProvider({ cwd: sandbox! }),
        session_file: new RequestBodyResourceProvider({
          fileId,
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("short"));
              controller.close();
            },
          }),
          sizeBytes: 10,
        }),
      },
    });
    const service = new KnowledgeCopyService({
      sourceRegistry,
      resourceIO,
      randomUUID: () => IDS[0],
    });

    await expect(service.copyExternalForEditor({
      source: { kind: "session-file", fileId },
      sourceSizeBytes: 10,
      originalName: "capture.png",
      mimeType: "image/png",
      pageAddress: address("main", "Notes/Host.md"),
      localDate: "2026-07-30",
    })).rejects.toMatchObject({
      code: "knowledge_transfer_entry_unsupported",
    });
    const assets = path.join(roots.main, "Notes", "assets");
    expect(fs.existsSync(path.join(
      assets,
      "2026-07-30-capture.png",
    ))).toBe(false);
    expect(stagingFiles(assets)).toEqual([]);
  });

  it("directly references same-source resources without copying or renaming them", async () => {
    const { roots, service } = setup();
    fs.writeFileSync(path.join(roots.main, "Notes", "diagram.svg"), "<svg/>");

    const result = await service.copyForEditor({
      sourceAddress: address("main", "Notes/diagram.svg"),
      pageAddress: address("main", "Notes/Host.md"),
      kind: "attachment",
      localDate: "2026-07-30",
    });

    expect(result).toEqual({
      copied: false,
      targetAddress: address("main", "Notes/diagram.svg"),
      bytesTransferred: 0,
      embed: false,
      originalName: "diagram.svg",
    });
    expect(fs.existsSync(path.join(roots.main, "Notes", "assets"))).toBe(false);
  });

  it("keeps successful batch items and leaves no final or staging file for failures", async () => {
    const { roots, resourceIO, service } = setup();
    fs.writeFileSync(path.join(roots.research, "Media", "ok.png"), "ok");
    fs.writeFileSync(path.join(roots.research, "Media", "bad.png"), "bad");
    const originalTransfer = resourceIO.transfer.bind(resourceIO);
    const transfer = vi.spyOn(resourceIO, "transfer");
    transfer.mockImplementationOnce(originalTransfer)
      .mockRejectedValueOnce(Object.assign(new Error("EACCES"), {
      code: "capability_denied",
    }));

    const results = await service.copyBatchForEditor({
      items: [
        {
          sourceAddress: address("research", "Media/ok.png"),
          kind: "attachment",
        },
        {
          sourceAddress: address("research", "Media/bad.png"),
          kind: "attachment",
        },
      ],
      pageAddress: address("main", "Notes/Host.md"),
      localDate: "2026-07-30",
    });

    expect(results[0]).toMatchObject({
      ok: true,
      result: {
        targetAddress: address(
          "main",
          "Notes/assets/2026-07-30-ok.png",
        ),
      },
    });
    expect(results[1]).toEqual({
      ok: false,
      errorCode: "knowledge_resource_out_of_scope",
    });
    expect(fs.existsSync(path.join(
      roots.main,
      "Notes",
      "assets",
      "2026-07-30-bad.png",
    ))).toBe(false);
    expect(stagingFiles(path.join(roots.main, "Notes", "assets"))).toEqual([]);
  });

  it("rejects unavailable, read-only, missing, directory, mismatched Page and cancelled inputs", async () => {
    const { roots, service, sources } = setup();
    fs.writeFileSync(path.join(roots.research, "Media", "asset.bin"), "data");
    fs.mkdirSync(path.join(roots.research, "Media", "folder"));
    sources.set("main", {
      ...source("main"),
      capabilities: ["stat", "read", "list"],
    });
    await expect(service.copyForEditor({
      sourceAddress: address("research", "Media/asset.bin"),
      pageAddress: address("main", "Notes/Host.md"),
      kind: "attachment",
      localDate: "2026-07-30",
    })).rejects.toMatchObject({ code: "knowledge_resource_out_of_scope" });

    sources.set("main", source("main"));
    sources.set("research", {
      ...source("research", "Research"),
      availability: "unavailable",
    });
    await expect(service.copyForEditor({
      sourceAddress: address("research", "Media/asset.bin"),
      pageAddress: address("main", "Notes/Host.md"),
      kind: "attachment",
      localDate: "2026-07-30",
    })).rejects.toMatchObject({ code: "knowledge_resource_unavailable" });

    sources.set("research", source("research", "Research"));
    await expect(service.copyForEditor({
      sourceAddress: address("research", "Media/missing.bin"),
      pageAddress: address("main", "Notes/Host.md"),
      kind: "attachment",
      localDate: "2026-07-30",
    })).rejects.toMatchObject({ code: "knowledge_resource_not_found" });
    await expect(service.copyForEditor({
      sourceAddress: address("research", "Media/folder"),
      pageAddress: address("main", "Notes/Host.md"),
      kind: "attachment",
      localDate: "2026-07-30",
    })).rejects.toMatchObject({
      code: "knowledge_operation_precondition_failed",
    });
    await expect(service.copyForEditor({
      sourceAddress: address("research", "Media/asset.bin"),
      pageAddress: address("main", "Notes/Host.md"),
      kind: "page",
    })).rejects.toMatchObject({
      code: "knowledge_operation_precondition_failed",
    });

    const controller = new AbortController();
    controller.abort();
    await expect(service.copyForEditor({
      sourceAddress: address("research", "Media/asset.bin"),
      pageAddress: address("main", "Notes/Host.md"),
      kind: "attachment",
      localDate: "2026-07-30",
    }, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });

    await expect(service.copyForEditor({
      sourceAddress: address("research", "Media/asset.bin"),
      pageAddress: address("main", "Notes/Host.md"),
      kind: "attachment",
      localDate: "2026-07-30",
      filePath: "/Users/example/private.bin",
    } as never)).rejects.toMatchObject({
      code: "knowledge_operation_precondition_failed",
    });

    await expect(service.copyExternalForEditor({
      source: {
        kind: "session-file",
        fileId: "upload-1",
        absolutePath: "/Users/example/private.bin",
      } as never,
      sourceSizeBytes: 1,
      originalName: "private.bin",
      mimeType: "application/octet-stream",
      pageAddress: address("main", "Notes/Host.md"),
      localDate: "2026-07-30",
    })).rejects.toMatchObject({
      code: "knowledge_operation_precondition_failed",
    });
  });
});

function source(
  sourceKey: string,
  displayName = "Main",
): KnowledgeSourceDto {
  return {
    sourceKey,
    displayName,
    role: sourceKey === "main" ? "main" : "mounted",
    capabilities: [
      "stat",
      "read",
      "write",
      "list",
      "mkdir",
      "transfer",
    ],
    availability: "available",
  };
}

function address(
  sourceKey: string,
  relativePath: string,
): KnowledgeResourceAddress {
  return { sourceKey, relativePath };
}

function stagingFiles(directory: string): string[] {
  return fs.existsSync(directory)
    ? fs.readdirSync(directory).filter(name => name.includes(".hana-transfer-"))
    : [];
}
