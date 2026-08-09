import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFileTool } from "../lib/tools/file-tool.ts";

describe("file tool document extraction", () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it("extracts an authorized ResourceRef without creating a derived workspace file", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-file-tool-extract-"));
    const workspace = path.join(tmpDir, "workspace");
    const source = path.join(tmpDir, "source.csv");
    fs.mkdirSync(workspace);
    fs.writeFileSync(source, "region,total\nnorth,120\n");
    const content = fs.readFileSync(source);
    const resourceIO = {
      stat: vi.fn(async () => ({
        resourceKey: "resource:quarterly",
        resource: { kind: "resource", resourceId: "quarterly", displayName: "quarterly.csv" },
        exists: true,
        isDirectory: false,
        version: { size: fs.statSync(source).size },
      })),
      openRead: vi.fn(async () => ({
        resourceKey: "resource:quarterly",
        resource: { kind: "resource", resourceId: "quarterly", displayName: "quarterly.csv" },
        body: (async function* () { yield content; })(),
        size: content.byteLength,
        mtimeMs: 0,
        version: { size: content.byteLength },
      })),
      read: vi.fn(),
    };
    const tool = createFileTool({
      getCwd: () => workspace,
      getResourceIO: () => resourceIO,
      documentExtractionOptions: {
        loadApi: async () => ({
          formatFromBytes: () => null,
          formatFromExtension: () => "csv",
          toMarkdownBytes: async () => "| region | total |\n| north | 120 |",
        }),
      },
    });

    const result = await tool.execute("file-1", {
      action: "extract",
      resource: { kind: "resource", resourceId: "quarterly" },
    });

    expect(result.content[0].text).toContain("north");
    expect((result.details as any).extraction).toMatchObject({ ok: true, format: "csv" });
    expect(resourceIO.stat).toHaveBeenCalledWith(
      { kind: "resource", resourceId: "quarterly" },
      expect.objectContaining({ source: "agent_tool", auditRead: true }),
    );
    expect(resourceIO.openRead).toHaveBeenCalledWith(
      { kind: "resource", resourceId: "quarterly" },
      expect.objectContaining({
        end: content.byteLength - 1,
        expectedVersion: { size: content.byteLength },
      }),
      expect.objectContaining({ source: "agent_tool", auditRead: true }),
    );
    expect(resourceIO.read).not.toHaveBeenCalled();
    expect(resourceIO).not.toHaveProperty("materialize");
    expect(fs.readdirSync(workspace)).toEqual([]);
  });

  it("does not let the extract action turn a raw path shorthand into a ResourceRef", async () => {
    const resourceIO = { stat: vi.fn(), materialize: vi.fn() };
    const tool = createFileTool({ getResourceIO: () => resourceIO });

    const result = await tool.execute("file-1", {
      action: "extract",
      path: "/private/document.pdf",
    });

    expect(result.content[0].text).toBe("Document extraction could not read the authorized resource.");
    expect(resourceIO.stat).not.toHaveBeenCalled();
  });
});
