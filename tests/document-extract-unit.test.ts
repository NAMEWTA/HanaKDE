import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXTRACTOR_VERSION,
  createDocumentExtractionService,
} from "../lib/document-extract/index.ts";
import type { ExtractFailure, ExtractResult } from "../lib/document-extract/types.ts";

function expectFailure(result: ExtractResult): ExtractFailure {
  expect(result.ok).toBe(false);
  return result as ExtractFailure;
}

function makeApi(overrides: any = {}) {
  return {
    formatFromBytes: vi.fn(() => null),
    formatFromExtension: vi.fn(() => null),
    toMarkdownBytes: vi.fn(async () => ""),
    ...overrides,
  };
}

describe("document extraction service", () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    vi.restoreAllMocks();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  function writeSource(name: string, contents: string | Buffer) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-document-extract-"));
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, contents);
    return filePath;
  }

  function serviceFor(filePath: string, api: any, cleanup = vi.fn()) {
    const size = fs.statSync(filePath).size;
    const content = fs.readFileSync(filePath);
    const resourceIO = {
      stat: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource" as const, resourceId: "report", displayName: path.basename(filePath) },
        exists: true,
        isDirectory: false,
        version: { size },
      })),
      openRead: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource" as const, resourceId: "report", displayName: path.basename(filePath) },
        body: (async function* () { yield content; })(),
        size,
        mtimeMs: 0,
        version: { size },
      })),
      read: vi.fn(),
      materialize: vi.fn(async () => ({
        resourceKey: "resource:report",
        resource: { kind: "resource" as const, resourceId: "report" },
        filePath,
        cleanup,
      })),
    };
    return {
      cleanup,
      resourceIO,
      service: createDocumentExtractionService({ resourceIO: resourceIO as any, loadApi: async () => api }),
    };
  }

  it("uses an authorized resource display name when bytes carry no signature", async () => {
    const api = makeApi({
      formatFromExtension: vi.fn((ext: string) => (ext === "csv" ? "csv" : null)),
      toMarkdownBytes: vi.fn(async () => "| region | total |\r\n| --- | --- |\r\n| north | 120 |"),
    });
    const source = writeSource("quarterly.csv", "region,total\nnorth,120\n");
    const { cleanup, resourceIO, service } = serviceFor(source, api);

    const result = await service.extract({
      resource: { kind: "resource", resourceId: "report" },
    });

    expect(resourceIO.stat).toHaveBeenCalledTimes(1);
    expect(resourceIO.openRead).toHaveBeenCalledTimes(1);
    expect(resourceIO.read).not.toHaveBeenCalled();
    expect(resourceIO.materialize).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
    expect(api.formatFromExtension).toHaveBeenCalledWith("csv");
    expect(api.toMarkdownBytes.mock.calls[0]).toHaveLength(2);
    expect(result).toMatchObject({ ok: true, format: "csv", extractorVersion: EXTRACTOR_VERSION });
    if (result.ok) {
      expect(result.markdown).toContain("\n");
      expect(result.markdown).not.toContain("\r");
    }
  });

  it("gives byte-detected PDF format precedence over an HTML filename hint", async () => {
    const api = makeApi({
      formatFromBytes: vi.fn((bytes: Buffer) => (
        bytes.subarray(0, 5).toString("utf8") === "%PDF-" ? "pdf" : null
      )),
      toMarkdownBytes: vi.fn(async () => "# PDF content"),
    });
    const htmlConversionRunner = { convertHtml: vi.fn(async () => "# HTML content") };
    const source = writeSource("report.pdf", "%PDF-1.4\ntext layer");
    const { resourceIO } = serviceFor(source, api);
    const service = createDocumentExtractionService({
      resourceIO,
      loadApi: async () => api,
      htmlConversionRunner,
    });

    const result = await service.extract({
      resource: { kind: "resource", resourceId: "report" },
      filenameHint: "spoofed.html",
    });

    expect(result).toMatchObject({ ok: true, format: "pdf", markdown: "# PDF content" });
    expect(api.toMarkdownBytes).toHaveBeenCalledWith(expect.any(Buffer), "pdf");
    expect(htmlConversionRunner.convertHtml).not.toHaveBeenCalled();
  });

  it("reports unsupported without invoking the converter", async () => {
    const api = makeApi();
    const source = writeSource("unknown.bin", Buffer.from([0x00, 0x01, 0x02, 0x03]));
    const { service } = serviceFor(source, api);

    const result = await service.extract({
      resource: { kind: "resource", resourceId: "report" },
    });

    expect(expectFailure(result).reason).toBe("unsupported");
    expect(api.toMarkdownBytes).not.toHaveBeenCalled();
  });

  it("maps scanned PDF parser failures without exposing converter details", async () => {
    const api = makeApi({
      formatFromBytes: vi.fn(() => "pdf"),
      toMarkdownBytes: vi.fn(async () => {
        throw new Error("OCR required for /private/staging/scan.pdf");
      }),
    });
    const source = writeSource("scan.pdf", "%PDF-1.4");
    const { service } = serviceFor(source, api);

    const result = await service.extract({
      resource: { kind: "resource", resourceId: "report" },
    });

    const failure = expectFailure(result);
    expect(failure.reason).toBe("scanned-pdf");
    expect(failure.message).not.toContain("/private");
  });

  it("keeps ordinary parser failures stable and path-free", async () => {
    const api = makeApi({
      formatFromBytes: vi.fn(() => "pdf"),
      toMarkdownBytes: vi.fn(async () => {
        throw new Error("xref table is corrupt at /private/staging/report.pdf");
      }),
    });
    const source = writeSource("broken.pdf", "%PDF-1.4");
    const { service } = serviceFor(source, api);

    const result = await service.extract({
      resource: { kind: "resource", resourceId: "report" },
    });

    const failure = expectFailure(result);
    expect(failure.reason).toBe("parse-failed");
    expect(failure.message).toBe("Document extraction failed.");
  });

  it("rejects raw buffers and paths instead of bypassing ResourceIO", async () => {
    const api = makeApi();
    const source = writeSource("notes.csv", "a,b\n1,2\n");
    const { resourceIO, service } = serviceFor(source, api);

    await expect(service.extract({ filePath: source } as any)).rejects.toThrow(/authorized ResourceRef/i);
    await expect(service.extract({ buffer: Buffer.from("a,b") } as any)).rejects.toThrow(/authorized ResourceRef/i);
    expect(resourceIO.stat).not.toHaveBeenCalled();
  });

  it("cancels before reading and never starts the converter", async () => {
    const api = makeApi({ formatFromBytes: vi.fn(() => "csv") });
    const source = writeSource("notes.csv", "a,b\n1,2\n");
    const { cleanup, resourceIO, service } = serviceFor(source, api);
    const controller = new AbortController();
    controller.abort("caller requested cancellation");

    await expect(service.extract({
      resource: { kind: "resource", resourceId: "report" },
      signal: controller.signal,
    })).rejects.toMatchObject({
      name: "AbortError",
      message: "Document extraction cancelled",
    });

    expect(resourceIO.stat).not.toHaveBeenCalled();
    expect(resourceIO.openRead).not.toHaveBeenCalled();
    expect(resourceIO.read).not.toHaveBeenCalled();
    expect(resourceIO.materialize).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
    expect(api.toMarkdownBytes).not.toHaveBeenCalled();
  });

  it("waits for an in-flight byte conversion before reporting cancellation", async () => {
    let signalConverterStarted!: () => void;
    const converterStarted = new Promise<void>((resolve) => {
      signalConverterStarted = resolve;
    });
    let finishConversion!: (markdown: string) => void;
    const conversion = new Promise<string>((resolve) => {
      finishConversion = resolve;
    });
    const api = makeApi({
      formatFromBytes: vi.fn(() => "csv"),
      toMarkdownBytes: vi.fn(() => {
        signalConverterStarted();
        return conversion;
      }),
    });
    const source = writeSource("notes.csv", "a,b\n1,2\n");
    const { resourceIO, service } = serviceFor(source, api);
    const controller = new AbortController();
    const pending = service.extract({
      resource: { kind: "resource", resourceId: "report" },
      signal: controller.signal,
    });

    await converterStarted;
    controller.abort(new Error("caller requested cancellation"));
    let settled = false;
    void pending.then(
      () => { settled = true; },
      () => { settled = true; },
    );
    await Promise.resolve();
    expect(settled).toBe(false);

    finishConversion("| a | b |");
    await expect(pending).rejects.toMatchObject({
      name: "AbortError",
      message: "caller requested cancellation",
    });
    expect(resourceIO.materialize).not.toHaveBeenCalled();
  });
});
