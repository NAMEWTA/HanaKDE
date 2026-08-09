import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDocumentExtractionService } from "../lib/document-extract/index.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function source(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf-8");
}

describe("document-extract production boundary", () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it("keeps the parser loader owned by the extraction core while File Tool only uses its service seam", () => {
    const parserLoader = source("lib/document-extract/anydoc-loader.ts");
    const fileTool = source("lib/tools/file-tool.ts");
    const core = source("lib/document-extract/index.ts");

    expect(parserLoader).toContain("@firecrawl/anydoc");
    expect(fileTool).not.toContain("@firecrawl/anydoc");
    expect(fileTool).toContain("createDocumentExtractionService");
    expect(core).toContain("withMaterialized");
    expect(core).not.toContain("interface ExtractInput");
  });

  it("does not spawn OCR or write derived Markdown to a workspace", async () => {
    const core = source("lib/document-extract/index.ts");
    expect(core).not.toMatch(/child_process|spawn(?:Sync)?\s*\(|tesseract|ocrmypdf/i);
    expect(core).not.toMatch(/writeFile|copyFile|mkdirSync|mkdir\(/);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-document-boundary-"));
    const workspace = path.join(tmpDir, "workspace");
    const sourceFile = path.join(tmpDir, "source.csv");
    fs.mkdirSync(workspace);
    fs.writeFileSync(sourceFile, "region,total\nnorth,120\n");
    const cleanup = vi.fn();
    const resourceIO = {
      stat: vi.fn(async () => ({
        resourceKey: "resource:source",
        resource: { kind: "resource", resourceId: "source", displayName: "source.csv" },
        exists: true,
        isDirectory: false,
        version: { size: fs.statSync(sourceFile).size },
      })),
      materialize: vi.fn(async () => ({
        resourceKey: "resource:source",
        resource: { kind: "resource", resourceId: "source" },
        filePath: sourceFile,
        cleanup,
      })),
    };
    const extraction = createDocumentExtractionService({
      resourceIO: resourceIO as any,
      loadApi: async () => ({
        formatFromBytes: () => null,
        formatFromExtension: () => "csv",
        toMarkdownBytes: async () => "| region | total |",
      }),
    });

    const result = await extraction.extract({
      resource: { kind: "resource", resourceId: "source" },
    });

    expect(result).toMatchObject({ ok: true, markdown: "| region | total |" });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync(workspace)).toEqual([]);
  });
});
