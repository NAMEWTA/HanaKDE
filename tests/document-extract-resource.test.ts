import fs from "fs";
import os from "os";
import path from "path";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_INPUT_BYTES,
  createDocumentExtractionService,
} from "../lib/document-extract/index.ts";
import {
  AnydocProcessRunner,
  HtmlProcessRunner,
} from "../lib/document-extract/anydoc-process-runner.ts";
import { ResourceIO } from "../lib/resource-io/resource-io.ts";
import type { ExtractFailure, ExtractResult } from "../lib/document-extract/types.ts";

function expectFailure(result: ExtractResult): ExtractFailure {
  expect(result.ok).toBe(false);
  return result as ExtractFailure;
}

const hangingChildScript = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "document-extract",
  "hanging-anydoc-child.cjs",
);
const successfulChildScript = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "document-extract",
  "successful-anydoc-child.cjs",
);
const malformedChildScript = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "document-extract",
  "malformed-anydoc-child.cjs",
);
const hangingHtmlChildScript = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "document-extract",
  "hanging-html-child.cjs",
);
const oversizedAnydocModule = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "document-extract",
  "oversized-anydoc-module.cjs",
);
const oversizedResponseChildScript = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "document-extract",
  "oversized-response-anydoc-child.cjs",
);
const duplicateStartedChildScript = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "document-extract",
  "duplicate-started-anydoc-child.cjs",
);
const duplicateResultChildScript = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "document-extract",
  "duplicate-result-anydoc-child.cjs",
);
const disconnectingChildScript = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "document-extract",
  "disconnecting-anydoc-child.cjs",
);
const exitingChildScript = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "document-extract",
  "exiting-anydoc-child.cjs",
);
const sampleHtml = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "document-extract",
  "sample.html",
);

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

type ControlledChildProcess = ChildProcess & {
  send: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
};

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

  function pathOnlyConverter() {
    return {
      formatFromBytes: vi.fn(),
      formatFromExtension: vi.fn(),
      formatFromPath: vi.fn(() => "pdf"),
      toMarkdown: vi.fn(),
      toMarkdownBytes: vi.fn(),
    };
  }

  async function expectProcessProtocolFailure(childScript: string) {
    const source = sourceFile();
    let childPid = 0;
    const runner = new AnydocProcessRunner({
      childScript,
      getModulePath: () => "test-only-anydoc-module",
      onChildStarted: (pid) => { childPid = pid; },
    });
    const cleanup = vi.fn(() => {
      expect(childPid).toBeGreaterThan(0);
      expect(processIsAlive(childPid)).toBe(false);
    });
    const converter = pathOnlyConverter();
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIoFor(source, cleanup) as any,
      loadApi: async () => converter,
      conversionRunner: runner,
    });

    const result = await extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
    });

    expect(expectFailure(result)).toMatchObject({
      reason: "parse-failed",
      message: "Document extraction failed.",
    });
    expect(JSON.stringify(result)).not.toContain(source);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(processIsAlive(childPid)).toBe(false);
    expect(converter.toMarkdown).not.toHaveBeenCalled();
  }

  function fakeTaskkill(): ChildProcess & { kill: ReturnType<typeof vi.fn> } {
    return Object.assign(new EventEmitter(), {
      kill: vi.fn(() => true),
    }) as unknown as ChildProcess & { kill: ReturnType<typeof vi.fn> };
  }

  function fakeTransportChild(kind: "error" | "send-failure"): ControlledChildProcess {
    const child = new EventEmitter() as unknown as ControlledChildProcess;
    Object.assign(child, {
      pid: 42_001,
      exitCode: null,
      signalCode: null,
      send: vi.fn((_message: unknown, callback?: (error?: Error | null) => void) => {
        queueMicrotask(() => {
          if (kind === "error") {
            child.emit("error", new Error("simulated child transport error"));
          } else {
            callback?.(new Error("simulated initial IPC send failure"));
          }
        });
        return true;
      }),
      kill: vi.fn(() => {
        (child as any).signalCode = "SIGKILL";
        queueMicrotask(() => child.emit("exit", null, "SIGKILL"));
        return true;
      }),
    });
    return child;
  }

  async function expectTransportFailure(kind: "error" | "send-failure") {
    const source = sourceFile();
    const child = fakeTransportChild(kind);
    const taskkill = fakeTaskkill();
    const forkChild = vi.fn(() => child);
    const spawnTaskkill = vi.fn(() => {
      queueMicrotask(() => taskkill.emit("close", 1, null));
      return taskkill;
    });
    const cleanup = vi.fn(() => {
      expect(child.signalCode).toBe("SIGKILL");
    });
    const converter = pathOnlyConverter();
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIoFor(source, cleanup) as any,
      loadApi: async () => converter,
      conversionRunner: new AnydocProcessRunner({
        getModulePath: () => "test-only-anydoc-module",
        processControl: {
          platform: "win32",
          forkChild,
          spawnTaskkill,
        },
      }),
    });

    const result = await extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
    });

    expect(expectFailure(result)).toMatchObject({
      reason: "parse-failed",
      message: "Document extraction failed.",
    });
    expect(forkChild).toHaveBeenCalledTimes(1);
    expect(child.send).toHaveBeenCalledTimes(1);
    expect(spawnTaskkill).toHaveBeenCalledWith(child.pid);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(taskkill.kill).not.toHaveBeenCalled();
  }

  async function abortWindowsRunner({
    onTaskkill,
    windowsTaskkillTimeoutMs = 50,
  }: {
    onTaskkill?: (taskkill: ChildProcess & { kill: ReturnType<typeof vi.fn> }) => void;
    windowsTaskkillTimeoutMs?: number;
  }) {
    const source = sourceFile();
    const controller = new AbortController();
    let childPid = 0;
    let signalChildStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalChildStarted = resolve;
    });
    const taskkill = fakeTaskkill();
    const spawnTaskkill = vi.fn((pid: number) => {
      expect(pid).toBe(childPid);
      onTaskkill?.(taskkill);
      return taskkill;
    });
    const runner = new AnydocProcessRunner({
      childScript: hangingChildScript,
      getModulePath: () => "test-only-anydoc-module",
      onChildStarted: (pid) => {
        childPid = pid;
        signalChildStarted();
      },
      processControl: {
        platform: "win32",
        spawnTaskkill,
        windowsTaskkillTimeoutMs,
      },
    });
    const cleanup = vi.fn(() => {
      expect(childPid).toBeGreaterThan(0);
      expect(processIsAlive(childPid)).toBe(false);
    });
    const converter = pathOnlyConverter();
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIoFor(source, cleanup) as any,
      loadApi: async () => converter,
      conversionRunner: runner,
    });

    const pending = extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
      signal: controller.signal,
    });
    await started;
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(spawnTaskkill).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(processIsAlive(childPid)).toBe(false);

    return { taskkill };
  }

  it("rejects a ResourceIO surface that only exposes unbounded read", () => {
    const resourceIO = {
      stat: vi.fn(),
      read: vi.fn(),
    };

    expect(() => createDocumentExtractionService({
      resourceIO: resourceIO as any,
    })).toThrow(/openRead or materialization authority/i);
    expect(resourceIO.read).not.toHaveBeenCalled();
  });

  it("returns a stable failure when a direct-only openRead capability is denied", async () => {
    const denied = Object.assign(new Error("open read is unavailable"), {
      code: "capability_denied",
    });
    const resourceIO = {
      stat: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource", resourceId: "report", displayName: "report.csv" },
        exists: true,
        isDirectory: false,
        version: { size: 4 },
      })),
      openRead: vi.fn(async () => { throw denied; }),
      read: vi.fn(async () => { throw new Error("legacy full read must not run"); }),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIO as any,
      loadApi: async () => ({
        formatFromBytes: () => "csv",
        formatFromExtension: () => "csv",
        toMarkdownBytes: async () => "| report |",
      }),
    });

    const result = await extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
    });

    expect(expectFailure(result)).toMatchObject({ reason: "parse-failed" });
    expect(resourceIO.openRead).toHaveBeenCalledTimes(1);
    expect(resourceIO.read).not.toHaveBeenCalled();
  });

  it("converts HTML through the default isolated HTML process runner", async () => {
    const markdown = await new HtmlProcessRunner().convertHtml(fs.readFileSync(sampleHtml));

    expect(markdown).toContain("Quarterly HTML Report");
    expect(markdown).toContain("North region closed 120 orders.");
  });

  it("routes detected HTML through the isolated HTML runner instead of Anydoc", async () => {
    const content = Buffer.from("<h1>Report</h1>");
    const resourceIO = {
      stat: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource", resourceId: "report", displayName: "report.html" },
        exists: true,
        isDirectory: false,
        version: { size: content.byteLength },
      })),
      openRead: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource", resourceId: "report", displayName: "report.html" },
        body: (async function* () { yield content; })(),
        size: content.byteLength,
        mtimeMs: 0,
        version: { size: content.byteLength },
      })),
    };
    const htmlConversionRunner = {
      convertHtml: vi.fn(async () => "# Report"),
    };
    const converter = {
      formatFromBytes: vi.fn(() => "html"),
      formatFromExtension: vi.fn(() => "html"),
      toMarkdownBytes: vi.fn(),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIO as Parameters<typeof createDocumentExtractionService>[0]["resourceIO"],
      loadApi: async () => converter,
      htmlConversionRunner,
    });

    const result = await extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
    });

    expect(result).toMatchObject({ ok: true, format: "html", markdown: "# Report" });
    expect(htmlConversionRunner.convertHtml).toHaveBeenCalledWith(content, undefined);
    expect(converter.toMarkdownBytes).not.toHaveBeenCalled();
  });

  it("keeps a byte-detected PDF on Anydoc when its display name ends in .html", async () => {
    const content = Buffer.from("%PDF-1.4");
    const resourceIO = {
      stat: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource", resourceId: "report", displayName: "report.html" },
        exists: true,
        isDirectory: false,
        version: { size: content.byteLength },
      })),
      openRead: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource", resourceId: "report", displayName: "report.html" },
        body: (async function* () { yield content; })(),
        size: content.byteLength,
        mtimeMs: 0,
        version: { size: content.byteLength },
      })),
    };
    const htmlConversionRunner = {
      convertHtml: vi.fn(async () => "# HTML"),
    };
    const converter = {
      formatFromBytes: vi.fn(() => "pdf"),
      formatFromExtension: vi.fn(() => "html"),
      toMarkdownBytes: vi.fn(async () => "# PDF"),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIO as Parameters<typeof createDocumentExtractionService>[0]["resourceIO"],
      loadApi: async () => converter,
      htmlConversionRunner,
    });

    const result = await extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
    });

    expect(result).toMatchObject({ ok: true, format: "pdf", markdown: "# PDF" });
    expect(converter.toMarkdownBytes).toHaveBeenCalledWith(content, "pdf");
    expect(htmlConversionRunner.convertHtml).not.toHaveBeenCalled();
  });

  it("prefers bounded openRead and never materializes a directly readable resource", async () => {
    const content = Buffer.from("region,total\nnorth,120\n");
    const resourceIO = {
      stat: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource", resourceId: "report", displayName: "report.csv" },
        exists: true,
        isDirectory: false,
        version: { size: content.byteLength },
      })),
      openRead: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource", resourceId: "report", displayName: "report.csv" },
        body: (async function* () { yield content; })(),
        size: content.byteLength,
        mtimeMs: 0,
        version: { size: content.byteLength },
      })),
      read: vi.fn(),
      materialize: vi.fn(),
    };
    const converter = {
      formatFromBytes: vi.fn(() => "csv"),
      formatFromExtension: vi.fn(() => "csv"),
      toMarkdownBytes: vi.fn(async () => "| region | total |"),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIO as any,
      loadApi: async () => converter,
    });

    const result = await extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
    });

    expect(result).toMatchObject({ ok: true, format: "csv" });
    expect(resourceIO.openRead).toHaveBeenCalledWith(
      { kind: "resource", resourceId: "report" },
      expect.objectContaining({
        end: content.byteLength - 1,
        expectedVersion: { size: content.byteLength },
      }),
      expect.objectContaining({ auditRead: true }),
    );
    expect(resourceIO.read).not.toHaveBeenCalled();
    expect(resourceIO.materialize).not.toHaveBeenCalled();
  });

  it("releases an already oversized openRead body before returning too-large", async () => {
    const released = vi.fn();
    async function* body() {
      try {
        yield Buffer.from("stream started for cleanup");
      } finally {
        released();
      }
    }
    const resourceIO = {
      stat: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource", resourceId: "report", displayName: "report.pdf" },
        exists: true,
        isDirectory: false,
      })),
      openRead: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource", resourceId: "report", displayName: "report.pdf" },
        body: body(),
        size: MAX_INPUT_BYTES + 1,
        mtimeMs: 0,
        version: { size: MAX_INPUT_BYTES + 1 },
      })),
      read: vi.fn(async () => { throw new Error("legacy full read must not run"); }),
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

    const result = await extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
    });

    expect(expectFailure(result)).toMatchObject({ reason: "too-large" });
    expect(released).toHaveBeenCalledTimes(1);
    expect(resourceIO.read).not.toHaveBeenCalled();
    expect(converter.formatFromBytes).not.toHaveBeenCalled();
  });

  it("releases an oversized direct chunk before copying its bytes", async () => {
    const released = vi.fn();
    const oversizedChunk = {
      byteLength: MAX_INPUT_BYTES + 1,
      get buffer(): never { throw new Error("oversized chunk must not be copied"); },
      get byteOffset(): never { throw new Error("oversized chunk must not be copied"); },
    } as unknown as Uint8Array;
    async function* body() {
      try {
        yield oversizedChunk;
      } finally {
        released();
      }
    }
    const resourceIO = {
      stat: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource", resourceId: "report", displayName: "report.pdf" },
        exists: true,
        isDirectory: false,
        version: { size: 1 },
      })),
      openRead: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource", resourceId: "report", displayName: "report.pdf" },
        body: body(),
        size: 1,
        mtimeMs: 0,
        version: { size: 1 },
      })),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIO as any,
      loadApi: async () => ({
        formatFromBytes: () => "pdf",
        formatFromExtension: () => "pdf",
        toMarkdownBytes: async () => "# PDF",
      }),
    });

    const result = await extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
    });

    expect(expectFailure(result)).toMatchObject({ reason: "too-large" });
    expect(released).toHaveBeenCalledTimes(1);
  });

  it("falls back from denied openRead to Materialize without invoking legacy read", async () => {
    const source = sourceFile("report.csv", "region,total\nnorth,120\n");
    const content = fs.readFileSync(source);
    const denied = Object.assign(new Error("open read is unavailable"), {
      code: "capability_denied",
    });
    const resourceIO = {
      stat: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource", resourceId: "report", displayName: "report.csv" },
        exists: true,
        isDirectory: false,
        version: { size: content.byteLength },
      })),
      openRead: vi.fn(async () => { throw denied; }),
      read: vi.fn(async () => { throw new Error("legacy full read must not run"); }),
      materialize: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource" as const, resourceId: "report", displayName: "report.csv" },
        filePath: source,
        cleanup: vi.fn(),
      })),
    };
    const converter = {
      formatFromBytes: vi.fn(() => "csv"),
      formatFromExtension: vi.fn(() => "csv"),
      toMarkdownBytes: vi.fn(async () => "| region | total |"),
      toMarkdown: vi.fn(async (filePath: string) => {
        expect(filePath).toBe(source);
        return "| region | total |";
      }),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIO as any,
      loadApi: async () => converter,
    });

    const result = await extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
    });

    expect(result).toMatchObject({ ok: true, format: "csv" });
    expect(resourceIO.openRead).toHaveBeenCalledTimes(1);
    expect(resourceIO.read).not.toHaveBeenCalled();
    expect(resourceIO.materialize).toHaveBeenCalledTimes(1);
    expect(converter.toMarkdownBytes).not.toHaveBeenCalled();
  });

  it("falls back to Materialize when real ResourceIO denies openRead without using read", async () => {
    const source = sourceFile("report.pdf");
    const cleanup = vi.fn();
    const materialize = vi.fn(async () => ({
      resourceKey: "resource:report",
      resource: { kind: "resource" as const, resourceId: "report", displayName: "report.pdf" },
      filePath: source,
      cleanup,
    }));
    const provider = {
      id: "resource" as const,
      capabilities: () => ({ stat: true, read: true, openRead: false, materialize: true }),
      stat: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource" as const, resourceId: "report", displayName: "report.pdf" },
        exists: true,
        isDirectory: false,
        version: { size: fs.statSync(source).size },
      })),
      materialize,
      read: vi.fn(async () => { throw new Error("legacy full read must not run"); }),
    };
    const resourceIO = new ResourceIO({ providers: { resource: provider } });
    const openRead = vi.spyOn(resourceIO, "openRead");
    const read = vi.spyOn(resourceIO, "read");
    const converter = {
      formatFromBytes: vi.fn(() => "pdf"),
      formatFromExtension: vi.fn(),
      formatFromPath: vi.fn(() => "pdf"),
      toMarkdown: vi.fn(async () => "# materialized report"),
      toMarkdownBytes: vi.fn(),
    };
    const extraction = createDocumentExtractionService({
      resourceIO,
      loadApi: async () => converter,
    });

    const result = await extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
    });

    expect(result).toMatchObject({ ok: true, format: "pdf", markdown: "# materialized report" });
    expect(openRead).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    expect(materialize).toHaveBeenCalledTimes(1);
    expect(converter.toMarkdown).toHaveBeenCalledWith(source);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("uses materialized PDF bytes before an HTML staging path and filename hint", async () => {
    const source = sourceFile("staged.html", "%PDF-1.4\ntext layer");
    const cleanup = vi.fn();
    const htmlConversionRunner = { convertHtml: vi.fn(async () => "# HTML") };
    const converter = {
      formatFromBytes: vi.fn((bytes: Buffer) => (
        bytes.subarray(0, 5).toString("utf8") === "%PDF-" ? "pdf" : null
      )),
      formatFromExtension: vi.fn(() => "html"),
      formatFromPath: vi.fn(() => "html"),
      toMarkdown: vi.fn(async (filePath: string) => {
        expect(filePath).toBe(source);
        return "# PDF";
      }),
      toMarkdownBytes: vi.fn(),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIoFor(source, cleanup) as any,
      loadApi: async () => converter,
      htmlConversionRunner,
    });

    const result = await extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
      filenameHint: "spoofed.html",
    });

    expect(result).toMatchObject({ ok: true, format: "pdf", markdown: "# PDF" });
    expect(converter.formatFromBytes).toHaveBeenCalledWith(expect.any(Buffer));
    expect(converter.formatFromExtension).not.toHaveBeenCalled();
    expect(converter.formatFromPath).not.toHaveBeenCalled();
    expect(converter.toMarkdown).toHaveBeenCalledWith(source);
    expect(htmlConversionRunner.convertHtml).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("classifies a materialized scanned PDF from bytes despite an HTML staging path", async () => {
    const source = sourceFile("staged.html", "%PDF-1.4\nimage only");
    const cleanup = vi.fn();
    const htmlConversionRunner = { convertHtml: vi.fn(async () => "# HTML") };
    const converter = {
      formatFromBytes: vi.fn(() => "pdf"),
      formatFromExtension: vi.fn(() => "html"),
      formatFromPath: vi.fn(() => "html"),
      toMarkdown: vi.fn(async () => {
        throw new Error("OCR required for /private/staging/scan.pdf");
      }),
      toMarkdownBytes: vi.fn(),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIoFor(source, cleanup) as any,
      loadApi: async () => converter,
      htmlConversionRunner,
    });

    const result = await extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
      filenameHint: "spoofed.html",
    });

    expect(expectFailure(result)).toMatchObject({ reason: "scanned-pdf" });
    expect(converter.formatFromBytes).toHaveBeenCalledWith(expect.any(Buffer));
    expect(converter.formatFromPath).not.toHaveBeenCalled();
    expect(htmlConversionRunner.convertHtml).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

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

  it("rejects a materialized artifact that outgrows its stale stat without unbounded read", async () => {
    const source = sourceFile("stale.pdf", "x");
    fs.truncateSync(source, MAX_INPUT_BYTES + 1);
    const cleanup = vi.fn();
    const readFile = vi.spyOn(fs.promises, "readFile");
    const resourceIO = {
      stat: vi.fn(async () => ({
        resourceKey: "resource:stale",
        resource: { kind: "resource", resourceId: "stale", displayName: "stale.pdf" },
        exists: true,
        isDirectory: false,
        version: { size: 1 },
      })),
      read: vi.fn(async () => { throw new Error("legacy full read must not run"); }),
      materialize: vi.fn(async () => ({
        resourceKey: "resource:stale",
        resource: { kind: "resource" as const, resourceId: "stale", displayName: "stale.pdf" },
        filePath: source,
        cleanup,
      })),
    };
    const converter = {
      formatFromBytes: vi.fn(),
      formatFromExtension: vi.fn(),
      formatFromPath: vi.fn(),
      toMarkdown: vi.fn(),
      toMarkdownBytes: vi.fn(),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIO as any,
      loadApi: async () => converter,
    });

    const result = await extraction.extract({
      resource: { kind: "resource", resourceId: "stale" },
    });

    expect(expectFailure(result)).toMatchObject({ reason: "too-large" });
    expect(resourceIO.read).not.toHaveBeenCalled();
    expect(resourceIO.materialize).toHaveBeenCalledTimes(1);
    expect(readFile).not.toHaveBeenCalled();
    expect(converter.formatFromBytes).not.toHaveBeenCalled();
    expect(converter.toMarkdown).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
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

  it("reaps a successful path converter before Materialize cleanup", async () => {
    const source = sourceFile();
    let childPid = 0;
    const runner = new AnydocProcessRunner({
      childScript: successfulChildScript,
      getModulePath: () => "test-only-anydoc-module",
      onChildStarted: (pid) => { childPid = pid; },
    });
    const cleanup = vi.fn(() => {
      expect(childPid).toBeGreaterThan(0);
      expect(processIsAlive(childPid)).toBe(false);
    });
    const converter = {
      formatFromBytes: vi.fn(),
      formatFromExtension: vi.fn(),
      formatFromPath: vi.fn(() => "pdf"),
      toMarkdown: vi.fn(),
      toMarkdownBytes: vi.fn(),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIoFor(source, cleanup) as any,
      loadApi: async () => converter,
      conversionRunner: runner,
    });

    const result = await extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
    });

    expect(result).toMatchObject({ ok: true, format: "pdf", markdown: "# converted in child" });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(processIsAlive(childPid)).toBe(false);
    expect(converter.toMarkdown).not.toHaveBeenCalled();
  });

  it("reaps a malformed child response before returning a stable parser failure", async () => {
    await expectProcessProtocolFailure(malformedChildScript);
  });

  it("reaps a duplicate started response before returning a stable parser failure", async () => {
    await expectProcessProtocolFailure(duplicateStartedChildScript);
  });

  it("reaps a duplicate result response before returning a stable parser failure", async () => {
    await expectProcessProtocolFailure(duplicateResultChildScript);
  });

  it("reaps a pre-result IPC disconnect before returning a stable parser failure", async () => {
    await expectProcessProtocolFailure(disconnectingChildScript);
  });

  it("reaps a child that exits after started without a result", async () => {
    await expectProcessProtocolFailure(exitingChildScript);
  });

  it("reaps a parent-side ChildProcess error before returning a stable parser failure", async () => {
    await expectTransportFailure("error");
  });

  it("reaps a failed initial IPC send before returning a stable parser failure", async () => {
    await expectTransportFailure("send-failure");
  });

  it("enforces the derived Markdown bound inside the child before IPC", async () => {
    const source = sourceFile();
    const runner = new AnydocProcessRunner({
      getModulePath: () => oversizedAnydocModule,
      maxOutputBytes: 64,
    });
    const converter = {
      formatFromBytes: vi.fn(),
      formatFromExtension: vi.fn(),
      formatFromPath: vi.fn(() => "pdf"),
      toMarkdown: vi.fn(),
      toMarkdownBytes: vi.fn(),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIoFor(source, vi.fn()) as any,
      loadApi: async () => converter,
      conversionRunner: runner,
    });

    const result = await extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
    });

    expect(expectFailure(result)).toMatchObject({
      reason: "parse-failed",
      message: "Document extraction failed.",
    });
    expect(JSON.stringify(result)).not.toContain("output exceeds");
  });

  it("rejects an oversized child IPC response before exposing derived Markdown", async () => {
    const source = sourceFile();
    const runner = new AnydocProcessRunner({
      childScript: oversizedResponseChildScript,
      getModulePath: () => "test-only-anydoc-module",
      maxOutputBytes: 64,
    });
    const converter = {
      formatFromBytes: vi.fn(),
      formatFromExtension: vi.fn(),
      formatFromPath: vi.fn(() => "pdf"),
      toMarkdown: vi.fn(),
      toMarkdownBytes: vi.fn(),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIoFor(source, vi.fn()) as any,
      loadApi: async () => converter,
      conversionRunner: runner,
    });

    const result = await extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
    });

    expect(expectFailure(result)).toMatchObject({
      reason: "parse-failed",
      message: "Document extraction failed.",
    });
    expect(JSON.stringify(result)).not.toContain("x".repeat(65));
  });

  it("enforces the shared derived Markdown bound for injected converters", async () => {
    const content = Buffer.from("region,total\nnorth,120\n");
    const resourceIO = {
      stat: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource", resourceId: "report", displayName: "report.csv" },
        exists: true,
        isDirectory: false,
        version: { size: content.byteLength },
      })),
      openRead: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource", resourceId: "report", displayName: "report.csv" },
        body: (async function* () { yield content; })(),
        size: content.byteLength,
        mtimeMs: 0,
        version: { size: content.byteLength },
      })),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIO as any,
      loadApi: async () => ({
        formatFromBytes: () => "csv",
        formatFromExtension: () => "csv",
        toMarkdownBytes: async () => "x".repeat(65),
      }),
      maxDerivedMarkdownBytes: 64,
    });

    const result = await extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
    });

    expect(expectFailure(result)).toMatchObject({
      reason: "parse-failed",
      message: "Document extraction failed.",
    });
    expect(JSON.stringify(result)).not.toContain("x".repeat(65));
  });

  it("kills and reaps an uncooperative path converter before Materialize cleanup", async () => {
    const source = sourceFile();
    const calls: string[] = [];
    const controller = new AbortController();
    let childPid = 0;
    let signalChildStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalChildStarted = resolve;
    });
    const runner = new AnydocProcessRunner({
      childScript: hangingChildScript,
      getModulePath: () => "test-only-anydoc-module",
      onChildStarted: (pid) => {
        childPid = pid;
        signalChildStarted();
      },
    });
    const cleanup = vi.fn(() => {
      calls.push("cleanup");
      expect(processIsAlive(childPid)).toBe(false);
    });
    const resourceIO = resourceIoFor(source, cleanup);
    const converter = {
      formatFromBytes: vi.fn(),
      formatFromExtension: vi.fn(),
      formatFromPath: vi.fn(() => "pdf"),
      toMarkdown: vi.fn(),
      toMarkdownBytes: vi.fn(),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIO as any,
      loadApi: async () => converter,
      conversionRunner: runner,
    });

    const pending = extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
      signal: controller.signal,
    });
    await started;
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });

    expect(childPid).toBeGreaterThan(0);
    expect(processIsAlive(childPid)).toBe(false);
    expect(calls).toEqual(["cleanup"]);
    expect(converter.toMarkdown).not.toHaveBeenCalled();
  });

  it("falls back to direct child termination when Windows taskkill emits an error", async () => {
    const { taskkill } = await abortWindowsRunner({
      onTaskkill: (process) => queueMicrotask(() => process.emit("error", new Error("taskkill unavailable"))),
    });

    expect(taskkill.kill).not.toHaveBeenCalled();
  });

  it("falls back to direct child termination when Windows taskkill closes", async () => {
    const { taskkill } = await abortWindowsRunner({
      onTaskkill: (process) => queueMicrotask(() => process.emit("close", 1, null)),
    });

    expect(taskkill.kill).not.toHaveBeenCalled();
  });

  it("terminates a stalled Windows taskkill helper before reaping the converter", async () => {
    const { taskkill } = await abortWindowsRunner({ windowsTaskkillTimeoutMs: 10 });

    expect(taskkill.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("kills and reaps an uncooperative HTML converter before reporting cancellation", async () => {
    const content = Buffer.from("<h1>Report</h1>");
    const controller = new AbortController();
    let childPid = 0;
    let signalChildStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalChildStarted = resolve;
    });
    const htmlConversionRunner = new HtmlProcessRunner({
      childScript: hangingHtmlChildScript,
      onChildStarted: (pid) => {
        childPid = pid;
        signalChildStarted();
      },
    });
    const resourceIO = {
      stat: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource", resourceId: "report", displayName: "report.html" },
        exists: true,
        isDirectory: false,
        version: { size: content.byteLength },
      })),
      openRead: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource", resourceId: "report", displayName: "report.html" },
        body: (async function* () { yield content; })(),
        size: content.byteLength,
        mtimeMs: 0,
        version: { size: content.byteLength },
      })),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIO as any,
      loadApi: async () => ({
        formatFromBytes: () => null,
        formatFromExtension: () => null,
        toMarkdownBytes: async () => "",
      }),
      htmlConversionRunner,
    });

    const pending = extraction.extract({
      resource: { kind: "resource", resourceId: "report" },
      signal: controller.signal,
    });
    await started;
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(childPid).toBeGreaterThan(0);
    expect(processIsAlive(childPid)).toBe(false);
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
