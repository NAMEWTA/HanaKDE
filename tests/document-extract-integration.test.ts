import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { createDocumentExtractionService } from "../lib/document-extract/index.ts";
import { LocalFsProvider } from "../lib/resource-io/providers/local-fs-provider.ts";
import { ResourceIO } from "../lib/resource-io/resource-io.ts";
import type { ExtractFailure } from "../lib/document-extract/types.ts";

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "document-extract");

function fixture(name: string) {
  return path.join(fixtureDir, name);
}

function extractFixture(name: string) {
  const resourceIO = new ResourceIO({
    providers: {
      local_fs: new LocalFsProvider({
        cwd: fixtureDir,
        guard: { check: () => ({ allowed: true }) },
      }),
    },
  });
  return createDocumentExtractionService({ resourceIO }).extract({
    resource: { kind: "local-file", path: fixture(name) },
  });
}

describe("document extraction against authorized real files", () => {
  it("turns a docx into markdown headings, bold text and a table", async () => {
    const result = await extractFixture("sample.docx");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("docx");
    expect(result.markdown).toMatch(/^#+\s+Quarterly Notes/m);
    expect(result.markdown).toContain("**bold**");
    expect(result.markdown).toContain("|");
    expect(result.markdown).toContain("Region");
    expect(result.markdown).toContain("120");
  });

  it("turns an xlsx sheet into markdown carrying the cell values", async () => {
    const result = await extractFixture("sample.xlsx");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("xlsx");
    expect(result.markdown).toContain("Region");
    expect(result.markdown).toContain("North");
    expect(result.markdown).toContain("120");
  });

  it("turns a csv into markdown carrying the cell values", async () => {
    const result = await extractFixture("sample.csv");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("csv");
    expect(result.markdown).toContain("Region");
    expect(result.markdown).toContain("South");
    expect(result.markdown).toContain("95");
  });

  it("turns an HTML document into canonical markdown through the shared HTML reader", async () => {
    const result = await extractFixture("sample.html");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("html");
    expect(result.markdown).toContain("Quarterly HTML Report");
    expect(result.markdown).toContain("North region closed 120 orders.");
  });

  it("reads the text layer out of a text PDF", async () => {
    const result = await extractFixture("sample-text.pdf");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("pdf");
    expect(result.markdown).toContain("Hello from PDF");
    expect(result.markdown).toContain("Second line of text");
  });

  it("reports a PDF that only contains an image as scanned without starting OCR", async () => {
    const result = await extractFixture("sample-scanned.pdf");

    expect(result.ok).toBe(false);
    expect((result as ExtractFailure).reason).toBe("scanned-pdf");
  });
});
