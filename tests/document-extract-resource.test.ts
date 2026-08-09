import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_INPUT_BYTES,
  createDocumentExtractionService,
} from "../lib/document-extract/index.ts";
import type { ExtractFailure, ExtractResult } from "../lib/document-extract/types.ts";

function expectFailure(result: ExtractResult): ExtractFailure {
  expect(result.ok).toBe(false);
  return result as ExtractFailure;
}

describe("document extraction ResourceIO boundary", () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  function sourceFile(name = "report.pdf", contents = "%PDF-1.4") {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-document-resource-"));
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, contents);
    return filePath;
  }

  function resourceIoFor(filePath: string, cleanup: () => void | Promise<void>) {
    return {
      stat: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource", resourceId: "report", displayName: path.basename(filePath) },
        exists: true,
        isDirectory: false,
        version: { size: fs.statSync(filePath).size },
      })),
      materialize: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource", resourceId: "report" },
        filePath,
        cleanup,
      })),
    };
  }

  it("rejects an oversized authorized ResourceRef before it opens, materializes, or converts", async () => {
    const resourceIO = {
      stat: vi.fn(async () => ({
        resourceKey: "resource:large-report",
        resource: { kind: "resource", resourceId: "large-report", displayName: "large.pdf" },
        exists: true,
        isDirectory: false,
        version: { size: MAX_INPUT_BYTES + 1 },
      })),
      openRead: vi.fn(),
      materialize: vi.fn(),
    };
    const converter = {
      formatFromBytes: vi.fn(() => "pdf"),
      formatFromExtension: vi.fn(() => "pdf"),
      toMarkdownBytes: vi.fn(),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIO as any,
      loadApi: async () => converter,
    });

    const result = await extraction.extract({
      resource: { kind: "resource", resourceId: "large-report" },
    });

    expect(expectFailure(result).reason).toBe("too-large");
    expect(resourceIO.openRead).not.toHaveBeenCalled();
    expect(resourceIO.materialize).not.toHaveBeenCalled();
    expect(converter.toMarkdownBytes).not.toHaveBeenCalled();
  });

  it("fails closed when ResourceIO denies access and never reaches the converter", async () => {
    const resourceIO = {
      stat: vi.fn(async () => {
        const error: any = new Error("read denied for /private/unapproved.pdf");
        error.code = "resource_access_denied";
        throw error;
      }),
      materialize: vi.fn(),
    };
    const converter = {
      formatFromBytes: vi.fn(),
      formatFromExtension: vi.fn(),
      toMarkdownBytes: vi.fn(),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIO as any,
      loadApi: async () => converter,
    });

    await expect(extraction.extract({
      resource: { kind: "resource", resourceId: "unapproved" },
    })).rejects.toMatchObject({
      code: "resource_access_denied",
      message: "Document extraction could not read the authorized resource.",
    });

    expect(resourceIO.materialize).not.toHaveBeenCalled();
    expect(converter.toMarkdownBytes).not.toHaveBeenCalled();
  });

  it("runs a path-only converter inside Materialize and cleans staging after parser failure", async () => {
    const source = sourceFile();
    const calls: string[] = [];
    const cleanup = vi.fn(() => { calls.push("cleanup"); });
    const resourceIO = resourceIoFor(source, cleanup);
    const converter = {
      formatFromBytes: vi.fn(),
      formatFromExtension: vi.fn(),
      formatFromPath: vi.fn(() => "pdf"),
      toMarkdown: vi.fn(async (filePath: string) => {
        calls.push("convert");
        expect(filePath).toBe(source);
        throw new Error("corrupt document at /private/staging/report.pdf");
      }),
      toMarkdownBytes: vi.fn(),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIO as any,
      loadApi: async () => converter,
    });

    const result = await extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
    });

    expect(expectFailure(result).reason).toBe("parse-failed");
    expect(calls).toEqual(["convert", "cleanup"]);
    expect(converter.toMarkdownBytes).not.toHaveBeenCalled();
  });

  it("cleans Materialize staging when cancellation arrives during a path-only conversion", async () => {
    const source = sourceFile();
    const calls: string[] = [];
    const cleanup = vi.fn(() => { calls.push("cleanup"); });
    const resourceIO = resourceIoFor(source, cleanup);
    const controller = new AbortController();
    const converter = {
      formatFromBytes: vi.fn(),
      formatFromExtension: vi.fn(),
      formatFromPath: vi.fn(() => "pdf"),
      toMarkdown: vi.fn(async () => {
        calls.push("convert");
        controller.abort();
        return "partial markdown";
      }),
      toMarkdownBytes: vi.fn(),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIO as any,
      loadApi: async () => converter,
    });

    await expect(extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
      signal: controller.signal,
    })).rejects.toMatchObject({ name: "AbortError" });

    expect(calls).toEqual(["convert", "cleanup"]);
  });

  it("does not leak the staging path when cleanup itself fails", async () => {
    const source = sourceFile();
    const resourceIO = resourceIoFor(source, () => {
      throw new Error("cleanup failed at /private/staging/report.pdf");
    });
    const converter = {
      formatFromBytes: vi.fn(),
      formatFromExtension: vi.fn(),
      formatFromPath: vi.fn(() => "pdf"),
      toMarkdown: vi.fn(async () => "converted"),
      toMarkdownBytes: vi.fn(),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIO as any,
      loadApi: async () => converter,
    });

    await expect(extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
    })).rejects.toMatchObject({
      message: "Document extraction could not read the authorized resource.",
    });
  });
});
