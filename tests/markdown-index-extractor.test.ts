import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MARKDOWN_INDEX_MAX_BYTES,
  MarkdownIndexVersionConflictError,
  extractSavedMarkdownIndexFacts,
} from "../lib/knowledge-workspace/markdown-index-extractor.ts";
import {
  KnowledgeIndexStore,
  type KnowledgeIndexResourceDocument,
} from "../lib/knowledge-workspace/knowledge-index-store.ts";

const temporaryDirectories: string[] = [];

function temporaryHome(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hana-markdown-index-"));
  temporaryDirectories.push(directory);
  return directory;
}

function savedInput(
  source: string,
  overrides: Partial<Parameters<typeof extractSavedMarkdownIndexFacts>[0]> = {},
): Parameters<typeof extractSavedMarkdownIndexFacts>[0] {
  const bytes = Buffer.from(source);
  return {
    relativePath: "Notes/Project.md",
    sizeBytes: bytes.byteLength,
    mtimeMs: 1234,
    versionToken: "v1",
    indexedAtMs: 5678,
    readSavedContent: vi.fn(async () => bytes),
    ...overrides,
  };
}

function createStore(): KnowledgeIndexStore {
  return new KnowledgeIndexStore({
    hanakoHome: temporaryHome(),
    workspaceFingerprint: "a".repeat(64),
    sourceFingerprint: "b".repeat(64),
    extractorContractVersion: "markdown-index-v1",
    hostId: "test-host",
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("saved Markdown index extraction", () => {
  it("projects title, properties, headings, links, tags, tasks, and folded search fields", async () => {
    const source = [
      "\ufeff---",
      "title: Frontmatter must not rename the page",
      "tags: [\"Café\", \"项目\"]",
      "status: Active",
      "---",
      "# Café 😀",
      "## Café 😀",
      "[ ] not a task",
      "- [ ] open task",
      "> 1. [X] quoted task",
      "[[Reference.md#Exact]] [[Reference.md|excerpt]]",
      "![[Assets/Image.png]] [child](../Docs/Child.md#Part)",
      "[outside](../../escape.md) [web](https://example.test)",
      "#项目 #Body",
    ].join("\n");

    const result = await extractSavedMarkdownIndexFacts(savedInput(source));

    expect(result.resource).toMatchObject({
      relativePath: "Notes/Project.md",
      parentPath: "Notes",
      basename: "Project.md",
      extension: ".md",
      kind: "page",
      contentState: "indexed",
      contentReason: null,
    });
    expect(result.page).toMatchObject({
      title: "Project",
      frontmatterJson: JSON.stringify({
        title: "Frontmatter must not rename the page",
        tags: ["Café", "项目"],
        status: "Active",
      }),
    });
    expect(result.page?.bodyText.startsWith("\ufeff")).toBe(false);
    expect(result.page?.bodyText).not.toContain("title: Frontmatter");
    expect(result.headings.map((heading) => ({
      level: heading.level,
      text: heading.text,
      slug: heading.slug,
    }))).toEqual([
      { level: 1, text: "Café 😀", slug: "cafe" },
      { level: 2, text: "Café 😀", slug: "cafe-1" },
    ]);
    expect(result.links.map((link) => ({
      kind: link.linkKind,
      raw: link.rawTarget,
      resolved: link.resolvedRelativePath,
      fragment: link.fragment,
    }))).toEqual([
      { kind: "wikilink", raw: "Reference.md", resolved: "Reference.md", fragment: "Exact" },
      { kind: "content-ref", raw: "Reference.md", resolved: "Reference.md", fragment: null },
      { kind: "embed", raw: "Assets/Image.png", resolved: "Assets/Image.png", fragment: null },
      { kind: "markdown", raw: "../Docs/Child.md#Part", resolved: "Docs/Child.md", fragment: "Part" },
      { kind: "markdown", raw: "../../escape.md", resolved: null, fragment: null },
      { kind: "markdown", raw: "https://example.test", resolved: null, fragment: null },
    ]);
    expect(result.tags).toEqual([
      { tag: "Café", origin: "frontmatter" },
      { tag: "项目", origin: "frontmatter" },
      { tag: "项目", origin: "body" },
      { tag: "Body", origin: "body" },
    ]);
    expect(result.tasks.map((task) => ({
      checked: task.checked,
      text: task.text,
    }))).toEqual([
      { checked: false, text: "open task" },
      { checked: true, text: "quoted task" },
    ]);
    expect(result.search).toEqual({
      titleFold: "project",
      pathFold: "notes/project.md",
      metadataFold: expect.stringContaining("café"),
      bodyFold: expect.stringContaining("café 😀"),
    });
  });

  it("uses the shared IR exclusions and records embeds without duplicating embedded content", async () => {
    const source = [
      "`[[inline.md]] #inline`",
      "```md",
      "[[fenced.md]] #fenced",
      "- [x] fenced task",
      "```",
      "<div>[[html.md]] #html</div>",
      "",
      "![[Real.md]] #real",
    ].join("\n");

    const result = await extractSavedMarkdownIndexFacts(savedInput(source));

    expect(result.links).toEqual([
      expect.objectContaining({
        linkKind: "embed",
        rawTarget: "Real.md",
        resolvedRelativePath: "Real.md",
      }),
    ]);
    expect(result.tags).toEqual([{ tag: "real", origin: "body" }]);
    expect(result.tasks).toEqual([]);
    expect(result.page?.bodyText).toContain("![[Real.md]]");
    expect(result.page?.bodyText).not.toContain("embedded page body");
  });

  it("rejects oversized pages before reading any content", async () => {
    const readSavedContent = vi.fn(async () => {
      throw new Error("must not read");
    });

    const result = await extractSavedMarkdownIndexFacts(savedInput("", {
      sizeBytes: MARKDOWN_INDEX_MAX_BYTES + 1,
      readSavedContent,
    }));

    expect(readSavedContent).not.toHaveBeenCalled();
    expect(result.resource).toMatchObject({
      kind: "page",
      contentState: "rejected",
      contentReason: "too_large",
    });
    expect(result.page).toBeNull();
    expect(result.headings).toEqual([]);
    expect(result.links).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.tasks).toEqual([]);
    expect(result.search.bodyFold).toBe("");
  });

  it("requires complete strict UTF-8, strips only a leading BOM, and never returns partial facts", async () => {
    const invalid = Uint8Array.from([0x23, 0x20, 0x6f, 0x6b, 0x0a, 0xc3, 0x28]);
    const result = await extractSavedMarkdownIndexFacts(savedInput("", {
      sizeBytes: invalid.byteLength,
      readSavedContent: async () => invalid,
    }));

    expect(result.resource.contentState).toBe("rejected");
    expect(result.resource.contentReason).toBe("invalid_utf8");
    expect(result.page).toBeNull();
    expect(result.search.bodyFold).toBe("");

    const bom = Buffer.from("\ufeff# Kept");
    const accepted = await extractSavedMarkdownIndexFacts(savedInput("", {
      sizeBytes: bom.byteLength,
      readSavedContent: async () => bom,
    }));
    expect(accepted.page?.bodyText).toBe("# Kept");
  });

  it("reads the expected saved version and has no Renderer-buffer input path", async () => {
    const disk = Buffer.from("# Saved disk fact");
    const readSavedContent = vi.fn(async (expectedVersionToken: string) => {
      expect(expectedVersionToken).toBe("disk-v3");
      return disk;
    });
    const rendererBuffer = "# Unsaved renderer edit";

    const result = await extractSavedMarkdownIndexFacts(savedInput(
      rendererBuffer,
      {
        sizeBytes: disk.byteLength,
        versionToken: "disk-v3",
        readSavedContent,
      },
    ));

    expect(readSavedContent).toHaveBeenCalledOnce();
    expect(result.page?.bodyText).toBe("# Saved disk fact");
    expect(result.page?.bodyText).not.toContain("Unsaved renderer");
  });

  it("turns missing and unavailable saved content into metadata-only replacement facts", async () => {
    const missingRead = vi.fn();
    const permissionRead = vi.fn();
    const unavailableRead = vi.fn();
    const missing = await extractSavedMarkdownIndexFacts(savedInput("", {
      contentAvailability: "missing",
      readSavedContent: missingRead,
    }));
    const permissionDenied = await extractSavedMarkdownIndexFacts(savedInput("", {
      contentAvailability: "permission-denied",
      readSavedContent: permissionRead,
    }));
    const unavailable = await extractSavedMarkdownIndexFacts(savedInput("", {
      contentAvailability: "source-unavailable",
      readSavedContent: unavailableRead,
    }));

    expect(missing.resource).toMatchObject({
      contentState: "missing",
      contentReason: "missing",
    });
    expect(permissionDenied.resource).toMatchObject({
      contentState: "rejected",
      contentReason: "permission_denied",
    });
    expect(unavailable.resource).toMatchObject({
      contentState: "rejected",
      contentReason: "source_unavailable",
    });
    expect(missing.page).toBeNull();
    expect(permissionDenied.page).toBeNull();
    expect(unavailable.page).toBeNull();
    expect(missingRead).not.toHaveBeenCalled();
    expect(permissionRead).not.toHaveBeenCalled();
    expect(unavailableRead).not.toHaveBeenCalled();
  });

  it("propagates cancellation and byte/version conflicts without producing replacement facts", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(extractSavedMarkdownIndexFacts(
      savedInput("# stale", { signal: controller.signal }),
    )).rejects.toMatchObject({ name: "AbortError" });

    await expect(extractSavedMarkdownIndexFacts(savedInput("# changed", {
      sizeBytes: 999,
    }))).rejects.toBeInstanceOf(MarkdownIndexVersionConflictError);
  });

  it("validates source-relative Markdown identity without guessing paths or sources", async () => {
    await expect(extractSavedMarkdownIndexFacts(savedInput("# nope", {
      relativePath: "../escape.md",
    }))).rejects.toThrow("relativePath");
    await expect(extractSavedMarkdownIndexFacts(savedInput("# nope", {
      relativePath: "Notes/not-markdown.txt",
    }))).rejects.toThrow(".md");
  });
});

describe("Markdown fact replacement in an index generation", () => {
  it("atomically removes old body and structure rows when a page crosses a content gate", async () => {
    const store = createStore();
    const rebuild = store.beginRebuild({
      rebuildId: "replace-gates",
      generationId: "generation-1",
      startedSequence: 1,
    });
    const indexed = await extractSavedMarkdownIndexFacts(savedInput([
      "# Heading",
      "- [ ] task",
      "[[Target.md]] #tag",
    ].join("\n")));
    rebuild.replaceResource(indexed);
    rebuild.replaceResource(await extractSavedMarkdownIndexFacts(savedInput("", {
      sizeBytes: MARKDOWN_INDEX_MAX_BYTES + 1,
      readSavedContent: vi.fn(),
      versionToken: "v2",
    })));
    rebuild.publish({ lastCompleteSequence: 2 });

    const lease = store.acquireQueryLease();
    expect(lease.inspect().rowCounts).toEqual({
      resources: 1,
      pages: 0,
      headings: 0,
      links: 0,
      tags: 0,
      tasks: 0,
      contentFts: 1,
    });
    lease.release();
  });

  it("rolls back the entire replacement transaction on a derived-row failure", async () => {
    const store = createStore();
    const rebuild = store.beginRebuild({
      rebuildId: "rollback-write",
      generationId: "generation-1",
      startedSequence: 1,
    });
    const indexed = await extractSavedMarkdownIndexFacts(savedInput("# First"));
    rebuild.replaceResource(indexed);
    const invalid: KnowledgeIndexResourceDocument = {
      ...indexed,
      headings: [
        indexed.headings[0],
        { ...indexed.headings[0], text: "duplicate ordinal" },
      ],
    };

    expect(() => rebuild.replaceResource(invalid)).toThrow();
    rebuild.publish({ lastCompleteSequence: 1 });

    const lease = store.acquireQueryLease();
    expect(lease.inspect().rowCounts).toMatchObject({
      resources: 1,
      pages: 1,
      headings: 1,
      contentFts: 1,
    });
    lease.release();
  });
});
