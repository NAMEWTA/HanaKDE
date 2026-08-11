import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  extractDocumentIndexFacts,
} from "../lib/knowledge-workspace/document-index-extractor.ts";
import {
  ResourceIOKnowledgeIndexSourceReader,
} from "../core/knowledge-workspace/knowledge-index-event-coordinator.ts";
import type { ResourceRef, ResourceStat } from "../lib/resource-io/types.ts";
import type { ExtractResult } from "../lib/document-extract/types.ts";
import {
  KnowledgeIndexStore,
} from "../lib/knowledge-workspace/knowledge-index-store.ts";

const resource: ResourceRef = {
  kind: "mount",
  mountId: "docs",
  path: "reports/quarterly.docx",
};

function stat(version = { size: 42, mtimeMs: 100, sequence: 7 }): ResourceStat {
  return {
    resourceKey: "mount:docs/reports/quarterly.docx",
    resource,
    exists: true,
    isDirectory: false,
    version,
  };
}

function extraction(markdown = "# Quarterly\nRevenue grew #finance") {
  return {
    extract: vi.fn(async (): Promise<ExtractResult> => ({
      ok: true as const,
      markdown,
      format: "docx",
      warnings: [],
      extractorVersion: "anydoc@test",
    })),
  };
}

describe("Office Knowledge ingestion", () => {
  it("projects canonical extracted Markdown into the original Office resource", async () => {
    const extract = extraction();
    const resourceIO = { stat: vi.fn(async () => stat()) };
    const document = await extractDocumentIndexFacts({
      resourceIO,
      extraction: extract,
      resource,
      relativePath: "reports/quarterly.docx",
      indexedAtMs: 500,
    });

    expect(document).toMatchObject({
      resource: {
        relativePath: "reports/quarterly.docx",
        kind: "binary",
        contentState: "indexed",
        indexedAtMs: 500,
      },
      page: { title: "quarterly", bodyText: "# Quarterly\nRevenue grew #finance" },
    });
    expect(document?.search.bodyFold).toContain("revenue");
    expect(document?.resource.versionToken).toContain("anydoc@test");
    expect(extract.extract).toHaveBeenCalledWith(expect.objectContaining({
      resource,
      filenameHint: "quarterly.docx",
    }));
  });

  it("accepts an extracted Office document through the incremental index path", async () => {
    const document = await extractDocumentIndexFacts({
      resourceIO: { stat: vi.fn(async () => stat()) },
      extraction: extraction(),
      resource,
      relativePath: "reports/quarterly.docx",
      indexedAtMs: 500,
    });
    expect(document).not.toBeNull();

    const hanakoHome = fs.mkdtempSync(path.join(os.tmpdir(), "hana-office-index-"));
    try {
      const store = new KnowledgeIndexStore({
        hanakoHome,
        workspaceFingerprint: "a".repeat(64),
        sourceFingerprint: "b".repeat(64),
        extractorContractVersion: "office-test-v1",
        hostId: "office-test",
        pid: process.pid,
      });
      store.beginRebuild({
        rebuildId: "initial",
        generationId: "generation-1",
        startedSequence: 0,
      }).publish({ lastCompleteSequence: 0 });

      store.applyIncremental({
        lastCompleteSequence: 1,
        changes: [{ kind: "replace", document: document! }],
      });

      expect(store.health()).toEqual({
        state: "ready",
        generationId: "generation-1",
        sequence: 1,
      });
      const lease = store.acquireQueryLease();
      expect(lease.inspect().rowCounts).toMatchObject({
        resources: 1,
        pages: 1,
        headings: 1,
      });
      lease.release();

      expect(() => store.applyIncremental({
        lastCompleteSequence: 2,
        changes: [{
          kind: "replace",
          document: { ...document!, page: null },
        }],
      })).toThrow(/knowledge index incremental update failed/);
    } finally {
      fs.rmSync(hanakoHome, { recursive: true, force: true });
    }
  });

  it("re-extracts when the ResourceIO version changes and fails closed for scanned PDFs", async () => {
    let current = stat({ size: 11, mtimeMs: 100, sequence: 1 });
    const resourceIO = { stat: vi.fn(async () => current) };
    const extract = extraction("# First");
    const first = await extractDocumentIndexFacts({
      resourceIO,
      extraction: extract,
      resource,
      relativePath: "reports/quarterly.docx",
      indexedAtMs: 500,
    });
    current = stat({ size: 12, mtimeMs: 101, sequence: 2 });
    extract.extract.mockResolvedValueOnce({
      ok: false,
      reason: "scanned-pdf",
      message: "PDF appears to contain no extractable text.",
    });
    const second = await extractDocumentIndexFacts({
      resourceIO,
      extraction: extract,
      resource: { ...resource, path: "reports/quarterly.pdf" },
      relativePath: "reports/quarterly.pdf",
      indexedAtMs: 501,
    });

    expect(first?.resource.versionToken).not.toBe(second?.resource.versionToken);
    expect(second).toMatchObject({
      resource: {
        kind: "pdf",
        contentState: "rejected",
        contentReason: "document_scanned_pdf",
      },
      page: null,
    });
  });

  it("rejects a ResourceIO version race instead of publishing stale derived Markdown", async () => {
    let calls = 0;
    const resourceIO = {
      stat: vi.fn(async () => {
        calls += 1;
        return stat({ size: 42, mtimeMs: 100 + (calls > 1 ? 1 : 0), sequence: calls > 1 ? 8 : 7 });
      }),
    };
    await expect(extractDocumentIndexFacts({
      resourceIO,
      extraction: extraction(),
      resource,
      relativePath: "reports/quarterly.docx",
      indexedAtMs: 500,
    })).rejects.toMatchObject({ code: "resource_version_conflict" });
  });

  it("routes Office rereads through the injected extraction port without writing a derived file", async () => {
    const extract = extraction("# Mounted\nbody");
    const resourceIO = {
      stat: vi.fn(async () => stat()),
      list: vi.fn(),
      openRead: vi.fn(),
    };
    const reader = new ResourceIOKnowledgeIndexSourceReader({
      resourceIO,
      documentExtraction: extract,
      root: { kind: "mount", mountId: "docs", path: "" },
      resolveAddress: (relativePath) => ({
        kind: "mount",
        mountId: "docs",
        path: relativePath,
      }),
      revalidate: vi.fn(),
      now: () => 600,
    });
    const document = await reader.reread("reports/quarterly.docx");

    expect(document?.page?.bodyText).toBe("# Mounted\nbody");
    expect(extract.extract).toHaveBeenCalledTimes(1);
    expect(resourceIO.openRead).not.toHaveBeenCalled();
  });
});
