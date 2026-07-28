import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_ASSET_MAX_BYTES,
  decodeSafeAssetText,
  evaluateResourceOpenPolicy,
} from "../lib/knowledge-workspace/resource-open-policy.ts";

describe("resource open policy", () => {
  it("requires a usable stat and rejects oversized content before read", () => {
    expect(evaluateResourceOpenPolicy({
      fileName: "boundary.txt",
      exists: true,
      isDirectory: false,
      sizeBytes: KNOWLEDGE_ASSET_MAX_BYTES,
    })).toMatchObject({
      kind: "text",
      shouldRead: true,
    });

    expect(evaluateResourceOpenPolicy({
      fileName: "large.txt",
      exists: true,
      isDirectory: false,
      sizeBytes: KNOWLEDGE_ASSET_MAX_BYTES + 1,
    })).toMatchObject({
      kind: "file-info",
      shouldRead: false,
      reason: "content_too_large",
    });

    expect(evaluateResourceOpenPolicy({
      fileName: "unknown.txt",
      exists: true,
      isDirectory: false,
      sizeBytes: null,
    })).toMatchObject({
      kind: "file-info",
      shouldRead: false,
      reason: "content_size_unavailable",
    });
  });

  it.each([
    ["page.html", "active_content"],
    ["drawing.svg", "active_content"],
    ["diagram.mmd", "active_content"],
    ["shortcut.url", "active_content"],
    ["archive.zip", "unsupported_type"],
  ])("fails closed for %s without reading", (fileName, reason) => {
    expect(evaluateResourceOpenPolicy({
      fileName,
      exists: true,
      isDirectory: false,
      sizeBytes: 128,
    })).toMatchObject({
      kind: "file-info",
      shouldRead: false,
      reason,
    });
  });

  it.each([
    ["photo.png", "image"],
    ["report.pdf", "pdf"],
    ["voice.mp3", "audio"],
    ["clip.webm", "video"],
    ["notes.txt", "text"],
    ["README.unknown", "text"],
  ])("classifies %s as a bounded %s preview", (fileName, kind) => {
    expect(evaluateResourceOpenPolicy({
      fileName,
      exists: true,
      isDirectory: false,
      sizeBytes: 128,
    })).toMatchObject({ kind, shouldRead: true });
  });

  it("strictly decodes only the deterministic supported text encodings", () => {
    const utf8 = new TextEncoder().encode("你好 UTF-8");
    expect(decodeSafeAssetText(utf8)).toEqual({
      ok: true,
      content: "你好 UTF-8",
      encoding: "utf-8",
      hadBom: false,
    });

    expect(decodeSafeAssetText(Uint8Array.from([
      0xff, 0xfe,
      0x60, 0x4f,
      0x7d, 0x59,
    ]))).toEqual({
      ok: true,
      content: "你好",
      encoding: "utf-16le",
      hadBom: true,
    });

    expect(decodeSafeAssetText(Uint8Array.from([
      0x00, 0x00, 0xfe, 0xff,
      0x00, 0x01, 0xf6, 0x42,
    ]))).toEqual({
      ok: true,
      content: "🙂",
      encoding: "utf-32be",
      hadBom: true,
    });

    expect(decodeSafeAssetText(Uint8Array.from([0xc3, 0x28]))).toEqual({
      ok: false,
      reason: "unsafe_encoding",
    });
    expect(decodeSafeAssetText(Uint8Array.from([
      0xff, 0xfe, 0x00, 0x00,
      0x00, 0xd8, 0x00, 0x00,
    ]))).toEqual({
      ok: false,
      reason: "unsafe_encoding",
    });
  });
});
