/**
 * Cross-platform ZIP extraction backed by yauzl metadata parsing and native
 * Node range streams. This avoids fd-slicer@1.1.0's Node 24 short-final-read
 * stall without buffering the complete archive in memory.
 */

import fs from "node:fs";
import fsp, { type FileHandle } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import yauzl, { type Entry, type ZipFile } from "yauzl";

const IFMT = 0o170000;
const IFDIR = 0o040000;
const IFLNK = 0o120000;

class FileHandleRangeStream extends Readable {
  fileHandle: FileHandle;
  position: number;
  end: number;
  reading: boolean;

  constructor(fileHandle: FileHandle, start: number, end: number) {
    super();
    this.fileHandle = fileHandle;
    this.position = start;
    this.end = end;
    this.reading = false;
  }

  _read(size: number) {
    if (this.reading) return;
    const remaining = this.end - this.position;
    if (remaining <= 0) {
      this.push(null);
      return;
    }

    this.reading = true;
    const buffer = Buffer.allocUnsafe(Math.min(size, remaining));
    this.fileHandle.read(buffer, 0, buffer.length, this.position).then(
      ({ bytesRead }) => {
        this.reading = false;
        if (this.destroyed) return;
        if (bytesRead === 0) {
          this.destroy(new Error("unexpected EOF while reading ZIP archive"));
          return;
        }
        this.position += bytesRead;
        this.push(buffer.subarray(0, bytesRead));
      },
      (error) => {
        this.reading = false;
        if (!this.destroyed) {
          this.destroy(error instanceof Error ? error : new Error(String(error)));
        }
      },
    );
  }
}

class FileHandleRandomAccessReader extends yauzl.RandomAccessReader {
  fileHandle: FileHandle;
  closePromise: Promise<void> | null;

  constructor(fileHandle: FileHandle) {
    super();
    this.fileHandle = fileHandle;
    this.closePromise = null;
  }

  _readStreamForRange(start: number, end: number) {
    return new FileHandleRangeStream(this.fileHandle, start, end);
  }

  close(callback: (error: Error | null) => void) {
    this.ensureClosed().then(
      () => callback(null),
      // The public extractZip promise reports close failures. Suppress the
      // reader's delayed EventEmitter error so it cannot become unhandled.
      () => callback(null),
    );
  }

  ensureClosed() {
    this.closePromise ??= this.fileHandle.close();
    return this.closePromise;
  }
}

export function isSymlinkEntry(entry) {
  if (!entry || typeof entry.externalFileAttributes !== "number") return false;
  const mode = (entry.externalFileAttributes >> 16) & 0xFFFF;
  return (mode & IFMT) === IFLNK;
}

function rejectSymlinkEntry(entry: Entry) {
  if (isSymlinkEntry(entry)) {
    const name = entry.fileName || "<unnamed>";
    throw new Error(`extract-zip: symlink entry is not allowed (entry: ${name})`);
  }
}

function isPathInside(rootDir: string, candidate: string) {
  const relative = path.relative(rootDir, candidate);
  return relative === ""
    || (!path.isAbsolute(relative)
      && relative !== ".."
      && !relative.startsWith(`..${path.sep}`));
}

async function assertCanonicalPathInside(rootDir: string, candidateDir: string, entryName: string) {
  const canonicalDir = await fsp.realpath(candidateDir);
  if (!isPathInside(rootDir, canonicalDir)) {
    throw new Error(
      `extract-zip: out of bound path "${canonicalDir}" found while processing ${entryName}`,
    );
  }
}

async function lstatOrNull(candidate: string) {
  return fsp.lstat(candidate).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
}

async function ensureSafeDirectories(
  canonicalRoot: string,
  segments: string[],
  entryName: string,
  finalMode?: number,
) {
  let current = canonicalRoot;
  for (let index = 0; index < segments.length; index += 1) {
    const next = path.join(current, segments[index]);
    let stats = await lstatOrNull(next);
    if (!stats) {
      try {
        await fsp.mkdir(next, {
          recursive: false,
          mode: index === segments.length - 1 ? finalMode : undefined,
        });
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
      stats = await fsp.lstat(next);
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(
        `extract-zip: unsafe parent directory (entry: ${entryName})`,
      );
    }
    await assertCanonicalPathInside(canonicalRoot, next, entryName);
    current = next;
  }
  return current;
}

function extractedMode(entry: Entry, isDirectory: boolean) {
  const archivedMode = (entry.externalFileAttributes >> 16) & 0xFFFF;
  return (archivedMode || (isDirectory ? 0o755 : 0o644)) & 0o777;
}

function entryIsDirectory(entry: Entry) {
  const mode = (entry.externalFileAttributes >> 16) & 0xFFFF;
  if ((mode & IFMT) === IFDIR || entry.fileName.endsWith("/")) return true;
  const madeBy = entry.versionMadeBy >> 8;
  return madeBy === 0 && entry.externalFileAttributes === 16;
}

function openEntryStream(zipFile: ZipFile, entry: Entry) {
  return new Promise<Readable>((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error) reject(error);
      else resolve(stream);
    });
  });
}

async function extractEntry(
  zipFile: ZipFile,
  entry: Entry,
  canonicalRoot: string,
) {
  rejectSymlinkEntry(entry);

  const segments = entry.fileName.split("/").filter(Boolean);
  const isDirectory = entryIsDirectory(entry);
  if (isDirectory) {
    await ensureSafeDirectories(
      canonicalRoot,
      segments,
      entry.fileName,
      extractedMode(entry, true),
    );
    return;
  }

  const fileName = segments.pop();
  if (!fileName) throw new Error(`extract-zip: invalid entry path: ${entry.fileName}`);
  const destinationDir = await ensureSafeDirectories(
    canonicalRoot,
    segments,
    entry.fileName,
  );
  const destination = path.join(destinationDir, fileName);
  const existing = await lstatOrNull(destination);
  if (existing?.isSymbolicLink()) {
    throw new Error(
      `extract-zip: destination symlink is not allowed (entry: ${entry.fileName})`,
    );
  }

  const readStream = await openEntryStream(zipFile, entry);
  const tempPath = path.join(destinationDir, `.${fileName}.${randomUUID()}.tmp`);
  try {
    await pipeline(
      readStream,
      fs.createWriteStream(tempPath, {
        flags: "wx",
        mode: extractedMode(entry, false),
      }),
    );
    await assertCanonicalPathInside(canonicalRoot, destinationDir, entry.fileName);
    const currentTarget = await lstatOrNull(destination);
    if (currentTarget?.isSymbolicLink()) {
      throw new Error(
        `extract-zip: destination symlink is not allowed (entry: ${entry.fileName})`,
      );
    }
    await fsp.rename(tempPath, destination);
  } finally {
    await fsp.rm(tempPath, { force: true }).catch(() => {});
  }
}

async function openZip(zipPath: string) {
  const fileHandle = await fsp.open(zipPath, "r");
  const reader = new FileHandleRandomAccessReader(fileHandle);
  try {
    const stats = await fileHandle.stat();
    const zipFile = await new Promise<ZipFile>((resolve, reject) => {
      yauzl.fromRandomAccessReader(
        reader,
        stats.size,
        {
          autoClose: false,
          lazyEntries: true,
          decodeStrings: true,
          validateEntrySizes: true,
          strictFileNames: false,
        },
        (error, openedZip) => {
          if (error) reject(error);
          else resolve(openedZip);
        },
      );
    });
    return { reader, zipFile };
  } catch (error) {
    let closeError;
    try {
      await reader.ensureClosed();
    } catch (caught) {
      closeError = caught;
    }
    if (closeError && closeError !== error) {
      throw new AggregateError([error, closeError], "failed to open and close ZIP archive");
    }
    throw error;
  }
}

async function extractEntries(zipFile: ZipFile, canonicalRoot: string) {
  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      zipFile.removeListener("error", fail);
      zipFile.removeListener("end", complete);
      if (error) reject(error);
      else resolve();
    };
    const fail = (error: unknown) => finish(error);
    const complete = () => finish();

    zipFile.on("error", fail);
    zipFile.on("end", complete);
    zipFile.on("entry", (entry: Entry) => {
      if (entry.fileName.startsWith("__MACOSX/")) {
        zipFile.readEntry();
        return;
      }
      extractEntry(zipFile, entry, canonicalRoot).then(
        () => zipFile.readEntry(),
        fail,
      );
    });
    zipFile.readEntry();
  });
}

export async function extractZip(zipPath, destDir) {
  if (!path.isAbsolute(destDir)) {
    throw new Error("Target directory is expected to be absolute");
  }

  await fsp.mkdir(destDir, { recursive: true });
  const canonicalRoot = await fsp.realpath(destDir);
  const { reader, zipFile } = await openZip(zipPath);
  const errors: unknown[] = [];
  const seenErrors = new Set<unknown>();
  const rememberError = (error: unknown) => {
    if (!seenErrors.has(error)) {
      seenErrors.add(error);
      errors.push(error);
    }
  };
  const onLifecycleError = (error: unknown) => rememberError(error);
  zipFile.on("error", onLifecycleError);
  try {
    await extractEntries(zipFile, canonicalRoot);
  } catch (error) {
    rememberError(error);
  } finally {
    try {
      zipFile.close();
    } catch (error) {
      rememberError(error);
    }
    try {
      await reader.ensureClosed();
    } catch (error) {
      rememberError(error);
    }
    zipFile.removeListener("error", onLifecycleError);
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, "ZIP extraction and cleanup failed");
  }
}
