import { crc32 } from "node:zlib";

import yauzl, { type Entry, type ZipFile } from "yauzl";

import { ExchangeError } from "./errors.ts";

export interface ArchiveEntry {
  path: string;
  content: Uint8Array;
}

export interface ArchiveLimits {
  maxFiles: number;
  maxTotalBytes: number;
  maxEntryBytes: number;
  maxCompressionRatio?: number;
}

const encoder = new TextEncoder();
const DRIVE_PATH = /^[A-Za-z]:[\\/]/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function unsafePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.startsWith("\\") || DRIVE_PATH.test(path) || path.includes("\\") || path.includes("\ufffd")) return true;
  const segments = path.split("/");
  return segments.some((segment) => !segment
    || segment === "."
    || segment === ".."
    || segment.endsWith(".")
    || segment.endsWith(" ")
    || /[:*?"<>|]/.test(segment)
    || WINDOWS_RESERVED.test(segment)
    || Array.from(segment).some((character) => {
      const code = character.codePointAt(0);
      return code !== undefined && (code <= 0x1f || code === 0x7f);
    }));
}

function u16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function join(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

export function createZipArchive(entries: ArchiveEntry[], options: { unsafeTestPaths?: boolean } = {}): Uint8Array {
  const ordered = [...entries].sort((left, right) => left.path.localeCompare(right.path, "en"));
  if (new Set(ordered.map((entry) => entry.path)).size !== ordered.length) throw new ExchangeError("validation", "Archive entry paths must be unique");
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const entry of ordered) {
    if (!options.unsafeTestPaths && unsafePath(entry.path)) throw new ExchangeError("validation", "Archive entry path is unsafe");
    const name = encoder.encode(entry.path);
    const checksum = crc32(entry.content);
    const local = join([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(33), u32(checksum),
      u32(entry.content.byteLength), u32(entry.content.byteLength), u16(name.byteLength), u16(0), name, entry.content,
    ]);
    localParts.push(local);
    centralParts.push(join([
      u32(0x02014b50), u16(0x0314), u16(20), u16(0x0800), u16(0), u16(0), u16(33), u32(checksum),
      u32(entry.content.byteLength), u32(entry.content.byteLength), u16(name.byteLength), u16(0), u16(0), u16(0),
      u16(0), u32(0o100644 << 16), u32(offset), name,
    ]));
    offset += local.byteLength;
  }
  const central = join(centralParts);
  return join([
    ...localParts,
    central,
    u32(0x06054b50), u16(0), u16(0), u16(ordered.length), u16(ordered.length), u32(central.byteLength), u32(offset), u16(0),
  ]);
}

function isSymlink(entry: Entry): boolean {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (unixMode & 0xf000) === 0xa000;
}

function openArchive(bytes: Uint8Array): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(Buffer.from(bytes), { lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: false }, (error, zip) => {
      if (error || !zip) reject(new ExchangeError("unsafe_archive", "The ZIP archive could not be parsed"));
      else resolve(zip);
    });
  });
}

function readEntry(zip: ZipFile, entry: Entry, maxEntryBytes: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(new ExchangeError("unsafe_archive", "An archive entry could not be read"));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      stream.on("data", (chunk: Buffer) => {
        total += chunk.byteLength;
        if (total > maxEntryBytes) stream.destroy(new ExchangeError("archive_limit_exceeded", "An archive entry exceeds the byte limit"));
        else chunks.push(chunk);
      });
      stream.once("error", (streamError) => reject(streamError instanceof ExchangeError ? streamError : new ExchangeError("integrity_failed", "An archive entry failed integrity verification")));
      stream.once("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    });
  });
}

export async function readZipArchive(bytes: Uint8Array, limits: ArchiveLimits): Promise<Map<string, Uint8Array>> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new ExchangeError("unsafe_archive", "A non-empty ZIP archive is required");
  const zip = await openArchive(bytes);
  const entries = new Map<string, Uint8Array>();
  const canonicalPaths = new Set<string>();
  let declaredBytes = 0;
  const ratioLimit = limits.maxCompressionRatio ?? 100;
  try {
    return await new Promise<Map<string, Uint8Array>>((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        zip.close();
        reject(error instanceof ExchangeError ? error : new ExchangeError("unsafe_archive", "The ZIP archive is invalid"));
      };
      zip.once("error", fail);
      zip.once("end", () => {
        if (!settled) {
          settled = true;
          resolve(entries);
        }
      });
      zip.on("entry", (entry: Entry) => {
        void (async () => {
          const path = entry.fileName;
          if (path.endsWith("/")) {
            if (unsafePath(path.slice(0, -1)) || isSymlink(entry)) throw new ExchangeError("unsafe_archive", "The archive contains an unsafe directory entry");
            zip.readEntry();
            return;
          }
          if (unsafePath(path) || isSymlink(entry) || entry.isEncrypted()) throw new ExchangeError("unsafe_archive", "The archive contains an unsafe entry");
          if (entries.has(path)) throw new ExchangeError("unsafe_archive", "The archive contains duplicate entry paths");
          const canonicalPath = path.normalize("NFC").toLocaleLowerCase("en-US");
          if (canonicalPaths.has(canonicalPath)) throw new ExchangeError("unsafe_archive", "The archive contains colliding entry paths");
          canonicalPaths.add(canonicalPath);
          if (entries.size + 1 > limits.maxFiles) throw new ExchangeError("archive_limit_exceeded", "The archive contains too many files");
          if (entry.uncompressedSize > limits.maxEntryBytes) throw new ExchangeError("archive_limit_exceeded", "An archive entry exceeds the byte limit");
          declaredBytes += entry.uncompressedSize;
          if (declaredBytes > limits.maxTotalBytes) throw new ExchangeError("archive_limit_exceeded", "The archive exceeds the total byte limit");
          if (entry.uncompressedSize > 0 && entry.compressedSize === 0) throw new ExchangeError("archive_limit_exceeded", "The archive has an unsafe compression ratio");
          if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > ratioLimit) throw new ExchangeError("archive_limit_exceeded", "The archive has an unsafe compression ratio");
          entries.set(path, await readEntry(zip, entry, limits.maxEntryBytes));
          zip.readEntry();
        })().catch(fail);
      });
      zip.readEntry();
    });
  } finally {
    try { zip.close(); } catch { /* yauzl may already be closed */ }
  }
}
