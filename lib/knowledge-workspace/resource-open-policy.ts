import { KNOWLEDGE_MARKDOWN_MAX_BYTES } from "../../shared/knowledge-workspace-contract.ts";

export const KNOWLEDGE_ASSET_MAX_BYTES = KNOWLEDGE_MARKDOWN_MAX_BYTES;

export type ResourceOpenKind =
  | "missing"
  | "file-info"
  | "text"
  | "image"
  | "pdf"
  | "audio"
  | "video";

export type ResourceOpenPolicyReason =
  | "resource_missing"
  | "not_a_file"
  | "content_size_unavailable"
  | "content_too_large"
  | "active_content"
  | "unsupported_type"
  | "unsafe_encoding";

export type ResourceOpenPolicyDecision = Readonly<{
  kind: ResourceOpenKind;
  shouldRead: boolean;
  reason?: ResourceOpenPolicyReason;
  mimeType?: string;
}>;

export type SafeAssetTextEncoding =
  | "utf-8"
  | "utf-16le"
  | "utf-16be"
  | "utf-32le"
  | "utf-32be";

export type SafeAssetTextDecodeResult =
  | Readonly<{
      ok: true;
      content: string;
      encoding: SafeAssetTextEncoding;
      hadBom: boolean;
    }>
  | Readonly<{
      ok: false;
      reason: "unsafe_encoding";
    }>;

const ACTIVE_CONTENT_EXTENSIONS = new Set([
  "desktop",
  "htm",
  "html",
  "lnk",
  "mermaid",
  "mmd",
  "svg",
  "svgz",
  "uri",
  "url",
  "webloc",
  "xhtml",
]);

const UNSUPPORTED_BINARY_EXTENSIONS = new Set([
  "7z",
  "apk",
  "app",
  "bin",
  "bz2",
  "class",
  "db",
  "dll",
  "dmg",
  "doc",
  "docx",
  "dylib",
  "eot",
  "exe",
  "gz",
  "iso",
  "jar",
  "msi",
  "numbers",
  "odp",
  "ods",
  "odt",
  "pages",
  "ppt",
  "pptx",
  "rar",
  "so",
  "sqlite",
  "sqlite3",
  "tar",
  "ttf",
  "wasm",
  "woff",
  "woff2",
  "xls",
  "xlsb",
  "xlsm",
  "xlsx",
  "xz",
  "zip",
]);

const IMAGE_MIME_TYPES = new Map([
  ["avif", "image/avif"],
  ["bmp", "image/bmp"],
  ["gif", "image/gif"],
  ["ico", "image/x-icon"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
]);

const AUDIO_MIME_TYPES = new Map([
  ["aac", "audio/aac"],
  ["flac", "audio/flac"],
  ["m4a", "audio/mp4"],
  ["mp3", "audio/mpeg"],
  ["oga", "audio/ogg"],
  ["ogg", "audio/ogg"],
  ["wav", "audio/wav"],
  ["weba", "audio/webm"],
]);

const VIDEO_MIME_TYPES = new Map([
  ["m4v", "video/mp4"],
  ["mov", "video/quicktime"],
  ["mp4", "video/mp4"],
  ["ogv", "video/ogg"],
  ["webm", "video/webm"],
]);

function fileExtension(fileName: string): string {
  const leaf = fileName.split("/").at(-1) ?? fileName;
  const dot = leaf.lastIndexOf(".");
  return dot < 0 || dot === leaf.length - 1
    ? ""
    : leaf.slice(dot + 1).toLowerCase();
}

export function evaluateResourceOpenPolicy(input: {
  fileName: string;
  exists: boolean;
  isDirectory: boolean;
  sizeBytes?: number | null;
}): ResourceOpenPolicyDecision {
  if (!input.exists) {
    return {
      kind: "missing",
      shouldRead: false,
      reason: "resource_missing",
    };
  }
  if (input.isDirectory) {
    return {
      kind: "file-info",
      shouldRead: false,
      reason: "not_a_file",
    };
  }
  if (
    !Number.isSafeInteger(input.sizeBytes)
    || Number(input.sizeBytes) < 0
  ) {
    return {
      kind: "file-info",
      shouldRead: false,
      reason: "content_size_unavailable",
    };
  }
  if (Number(input.sizeBytes) > KNOWLEDGE_ASSET_MAX_BYTES) {
    return {
      kind: "file-info",
      shouldRead: false,
      reason: "content_too_large",
    };
  }

  const extension = fileExtension(input.fileName);
  if (ACTIVE_CONTENT_EXTENSIONS.has(extension)) {
    return {
      kind: "file-info",
      shouldRead: false,
      reason: "active_content",
    };
  }
  if (UNSUPPORTED_BINARY_EXTENSIONS.has(extension)) {
    return {
      kind: "file-info",
      shouldRead: false,
      reason: "unsupported_type",
    };
  }

  const imageMimeType = IMAGE_MIME_TYPES.get(extension);
  if (imageMimeType) {
    return {
      kind: "image",
      shouldRead: true,
      mimeType: imageMimeType,
    };
  }
  if (extension === "pdf") {
    return {
      kind: "pdf",
      shouldRead: true,
      mimeType: "application/pdf",
    };
  }
  const audioMimeType = AUDIO_MIME_TYPES.get(extension);
  if (audioMimeType) {
    return {
      kind: "audio",
      shouldRead: true,
      mimeType: audioMimeType,
    };
  }
  const videoMimeType = VIDEO_MIME_TYPES.get(extension);
  if (videoMimeType) {
    return {
      kind: "video",
      shouldRead: true,
      mimeType: videoMimeType,
    };
  }

  // Unknown suffixes remain text candidates. The bounded body is decoded
  // strictly below; a binary or traditional encoding becomes file-info.
  return {
    kind: "text",
    shouldRead: true,
    mimeType: "text/plain;charset=utf-8",
  };
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function decodeWithTextDecoder(
  bytes: Uint8Array,
  encoding: "utf-8" | "utf-16le" | "utf-16be",
): string | null {
  try {
    return new TextDecoder(encoding, {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
  } catch {
    return null;
  }
}

function decodeUtf32(
  bytes: Uint8Array,
  littleEndian: boolean,
): string | null {
  if (bytes.byteLength % 4 !== 0) return null;
  const chunks: string[] = [];
  let current = "";
  for (let offset = 0; offset < bytes.byteLength; offset += 4) {
    const codePoint = littleEndian
      ? (
          bytes[offset]
          | (bytes[offset + 1] << 8)
          | (bytes[offset + 2] << 16)
          | (bytes[offset + 3] << 24)
        ) >>> 0
      : (
          (bytes[offset] << 24)
          | (bytes[offset + 1] << 16)
          | (bytes[offset + 2] << 8)
          | bytes[offset + 3]
        ) >>> 0;
    if (
      codePoint > 0x10ffff
      || (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      return null;
    }
    current += String.fromCodePoint(codePoint);
    if (current.length >= 8_192) {
      chunks.push(current);
      current = "";
    }
  }
  chunks.push(current);
  return chunks.join("");
}

export function decodeSafeAssetText(
  bytes: Uint8Array,
): SafeAssetTextDecodeResult {
  let encoding: SafeAssetTextEncoding = "utf-8";
  let hadBom = false;
  let body = bytes;
  let content: string | null;

  if (startsWith(bytes, [0xff, 0xfe, 0x00, 0x00])) {
    encoding = "utf-32le";
    hadBom = true;
    body = bytes.subarray(4);
    content = decodeUtf32(body, true);
  } else if (startsWith(bytes, [0x00, 0x00, 0xfe, 0xff])) {
    encoding = "utf-32be";
    hadBom = true;
    body = bytes.subarray(4);
    content = decodeUtf32(body, false);
  } else if (startsWith(bytes, [0xef, 0xbb, 0xbf])) {
    hadBom = true;
    body = bytes.subarray(3);
    content = decodeWithTextDecoder(body, "utf-8");
  } else if (startsWith(bytes, [0xff, 0xfe])) {
    encoding = "utf-16le";
    hadBom = true;
    body = bytes.subarray(2);
    content = body.byteLength % 2 === 0
      ? decodeWithTextDecoder(body, "utf-16le")
      : null;
  } else if (startsWith(bytes, [0xfe, 0xff])) {
    encoding = "utf-16be";
    hadBom = true;
    body = bytes.subarray(2);
    content = body.byteLength % 2 === 0
      ? decodeWithTextDecoder(body, "utf-16be")
      : null;
  } else {
    content = decodeWithTextDecoder(body, "utf-8");
  }

  if (content === null) {
    return { ok: false, reason: "unsafe_encoding" };
  }
  return {
    ok: true,
    content,
    encoding,
    hadBom,
  };
}
