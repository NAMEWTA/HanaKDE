/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import {
  createKnowledgeAttachmentPolicy,
  KNOWLEDGE_ATTACHMENT_RESOURCE_MIME,
  readKnowledgeAttachmentItems,
  type KnowledgeAttachmentItem,
} from "../../editor/knowledge-attachment-policy";

const PAGE = { sourceKey: "main", relativePath: "Notes/Host.md" };

describe("knowledge attachment policy", () => {
  it("processes items in source order and emits one source-root Wikilink per success", async () => {
    const items: KnowledgeAttachmentItem[] = [
      {
        sourceAddress: {
          sourceKey: "research",
          relativePath: "Pages/A.md",
        },
        kind: "page",
      },
      {
        sourceAddress: {
          sourceKey: "research",
          relativePath: "Media/photo.png",
        },
        kind: "attachment",
      },
      {
        sourceAddress: {
          sourceKey: "research",
          relativePath: "Media/archive.zip",
        },
        kind: "attachment",
      },
    ];
    const order: string[] = [];
    const copyForEditor = vi.fn(async (item: KnowledgeAttachmentItem) => {
      if (!("sourceAddress" in item)) throw new Error("unexpected external");
      order.push(item.sourceAddress.relativePath);
      if (item.kind === "page") {
        return result("Notes/A.md", false);
      }
      return item.sourceAddress.relativePath.endsWith(".png")
        ? result("Notes/assets/2026-07-30-photo.png", true)
        : result("Notes/assets/2026-07-30-archive.zip", false);
    });
    const dataTransfer = {} as DataTransfer;
    const policy = createKnowledgeAttachmentPolicy({
      pageAddress: PAGE,
      readItems: input => input === dataTransfer ? items : [],
      copyForEditor,
      localDate: () => "2026-07-30",
    });

    expect(policy.accepts?.(dataTransfer)).toBe(true);
    const inserted = await policy.insert?.(dataTransfer);

    expect(order).toEqual([
      "Pages/A.md",
      "Media/photo.png",
      "Media/archive.zip",
    ]);
    expect(inserted).toMatchObject({
      markdown: [
        "[[Notes/A.md]]",
        "![[Notes/assets/2026-07-30-photo.png]]",
        "[[Notes/assets/2026-07-30-archive.zip]]",
      ].join("\n"),
    });
    expect(copyForEditor).toHaveBeenNthCalledWith(1, items[0], {
      pageAddress: PAGE,
      localDate: "2026-07-30",
      signal: expect.any(AbortSignal),
    });
  });

  it("keeps successful copies, reports each failed item, and inserts no placeholder", async () => {
    const onItemError = vi.fn();
    const items: KnowledgeAttachmentItem[] = [
      {
        sourceAddress: {
          sourceKey: "research",
          relativePath: "Media/good.png",
        },
        kind: "attachment",
      },
      {
        sourceAddress: {
          sourceKey: "research",
          relativePath: "Media/bad.png",
        },
        kind: "attachment",
      },
    ];
    const policy = createKnowledgeAttachmentPolicy({
      pageAddress: PAGE,
      readItems: () => items,
      copyForEditor: vi.fn()
        .mockResolvedValueOnce(
          result("Notes/assets/2026-07-30-good.png", true),
        )
        .mockRejectedValueOnce(new Error("copy unavailable")),
      onItemError,
      localDate: () => "2026-07-30",
    });

    const inserted = await policy.insert?.({} as DataTransfer);

    expect(inserted).toMatchObject({
      markdown: "![[Notes/assets/2026-07-30-good.png]]",
    });
    expect(onItemError).toHaveBeenCalledWith(
      items[1],
      expect.objectContaining({ message: "copy unavailable" }),
    );
    expect(JSON.stringify(inserted)).not.toContain("bad.png");
  });

  it("returns no policy for read-only pages and rejects empty or unsafe batches", async () => {
    expect(createKnowledgeAttachmentPolicy({
      pageAddress: PAGE,
      writable: false,
      readItems: () => [],
      copyForEditor: vi.fn(),
    })).toBeNull();

    const empty = createKnowledgeAttachmentPolicy({
      pageAddress: PAGE,
      readItems: () => [],
      copyForEditor: vi.fn(),
    });
    expect(empty.accepts?.({} as DataTransfer)).toBe(false);

    const unsafe = createKnowledgeAttachmentPolicy({
      pageAddress: PAGE,
      readItems: () => [{
        sourceAddress: {
          sourceKey: "research",
          relativePath: "../escape.png",
        },
        kind: "attachment",
      }],
      copyForEditor: vi.fn(),
    });
    expect(unsafe.accepts?.({} as DataTransfer)).toBe(false);
    await expect(unsafe.insert?.({} as DataTransfer)).resolves.toEqual({
      markdown: "",
    });
  });

  it("redo repeats the original copy batch and uses the new final names", async () => {
    const item: KnowledgeAttachmentItem = {
      sourceAddress: {
        sourceKey: "research",
        relativePath: "Media/photo.png",
      },
      kind: "attachment",
    };
    const copyForEditor = vi.fn()
      .mockResolvedValueOnce(
        result("Notes/assets/2026-07-30-photo.png", true),
      )
      .mockResolvedValueOnce(
        result("Notes/assets/2026-07-30-photo_2.png", true),
      );
    const policy = createKnowledgeAttachmentPolicy({
      pageAddress: PAGE,
      readItems: () => [item],
      copyForEditor,
      localDate: () => "2026-07-30",
    });

    const first = await policy.insert?.({} as DataTransfer);
    const redone = await first?.redo?.();

    expect(first?.markdown).toBe(
      "![[Notes/assets/2026-07-30-photo.png]]",
    );
    expect(redone?.markdown).toBe(
      "![[Notes/assets/2026-07-30-photo_2.png]]",
    );
    expect(copyForEditor).toHaveBeenCalledTimes(2);
  });

  it("streams system File items through the external copy seam", async () => {
    const file = new File(["bytes"], "capture.webp", {
      type: "image/webp",
    });
    const dataTransfer = {
      getData: () => "",
      files: [file],
    } as unknown as DataTransfer;
    const copyExternalForEditor = vi.fn(async () => (
      result("Notes/assets/2026-07-30-capture.webp", true)
    ));
    const policy = createKnowledgeAttachmentPolicy({
      pageAddress: PAGE,
      readItems: readKnowledgeAttachmentItems,
      copyForEditor: vi.fn(),
      copyExternalForEditor,
      localDate: () => "2026-07-30",
    });

    expect(policy.accepts?.(dataTransfer)).toBe(true);
    await expect(policy.insert(dataTransfer)).resolves.toMatchObject({
      markdown: "![[Notes/assets/2026-07-30-capture.webp]]",
    });
    expect(copyExternalForEditor).toHaveBeenCalledWith(
      { file, kind: "attachment" },
      {
        pageAddress: PAGE,
        localDate: "2026-07-30",
        signal: expect.any(AbortSignal),
      },
    );
  });

  it("parses only bounded source-address resource payloads", () => {
    const safe = {
      getData(type: string) {
        return type === KNOWLEDGE_ATTACHMENT_RESOURCE_MIME
          ? JSON.stringify([{
              sourceAddress: {
                sourceKey: "research",
                relativePath: "Media/photo.png",
              },
              kind: "attachment",
            }])
          : "";
      },
      files: [],
    } as unknown as DataTransfer;
    expect(readKnowledgeAttachmentItems(safe)).toEqual([{
      sourceAddress: {
        sourceKey: "research",
        relativePath: "Media/photo.png",
      },
      kind: "attachment",
    }]);

    const unsafe = {
      getData: () => JSON.stringify([{
        sourceAddress: {
          sourceKey: "research",
          relativePath: "/Users/alice/Secret.png",
        },
        kind: "attachment",
      }]),
      files: [],
    } as unknown as DataTransfer;
    expect(readKnowledgeAttachmentItems(unsafe)).toEqual([]);
  });

  it("aborts between items and does not start later copies", async () => {
    const controller = new AbortController();
    const items: KnowledgeAttachmentItem[] = [
      {
        sourceAddress: {
          sourceKey: "research",
          relativePath: "Media/a.png",
        },
        kind: "attachment",
      },
      {
        sourceAddress: {
          sourceKey: "research",
          relativePath: "Media/b.png",
        },
        kind: "attachment",
      },
    ];
    const copyForEditor = vi.fn(async () => {
      controller.abort();
      return result("Notes/assets/2026-07-30-a.png", true);
    });
    const policy = createKnowledgeAttachmentPolicy({
      pageAddress: PAGE,
      readItems: () => items,
      copyForEditor,
      signal: controller.signal,
    });

    const inserted = await policy.insert?.({} as DataTransfer);

    expect(inserted?.markdown).toBe(
      "![[Notes/assets/2026-07-30-a.png]]",
    );
    expect(copyForEditor).toHaveBeenCalledTimes(1);
  });
});

function result(relativePath: string, embed: boolean) {
  return {
    copied: true,
    targetAddress: {
      sourceKey: "main",
      relativePath,
    },
    bytesTransferred: 1,
    embed,
    originalName: relativePath.split("/").at(-1) ?? relativePath,
  };
}
