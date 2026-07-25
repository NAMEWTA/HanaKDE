import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

import { extractZip } from "../lib/extract-zip.ts";

type ArchiveEntry = {
  content: Buffer;
  method: 0 | 8;
  name: string;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pseudoRandomBytes(size: number, seed: number) {
  const output = Buffer.allocUnsafe(size);
  let state = seed >>> 0;
  for (let index = 0; index < output.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    output[index] = state & 0xff;
  }
  return output;
}

async function buildStandardZip(zipPath: string, entries: ArchiveEntry[]) {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const payload = entry.method === 8
      ? deflateRawSync(entry.content)
      : entry.content;
    const checksum = crc32(entry.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(entry.method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localChunks.push(local, name, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(entry.content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, name);
    offset += local.length + name.length + payload.length;
  }

  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  await fs.promises.writeFile(
    zipPath,
    Buffer.concat([...localChunks, ...centralChunks, end]),
  );
}

function localEntryMetadata(archive: Buffer) {
  const metadata: Array<{ method: number; compressedSize: number; dataStart: number }> = [];
  let offset = 0;
  while (
    offset + 30 <= archive.length
    && archive.readUInt32LE(offset) === 0x04034b50
  ) {
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const compressedSize = archive.readUInt32LE(offset + 18);
    metadata.push({
      method: archive.readUInt16LE(offset + 8),
      compressedSize,
      dataStart: offset + 30 + nameLength + extraLength,
    });
    offset += 30 + nameLength + extraLength + compressedSize;
  }
  return metadata;
}

describe("extractZip Node 24 range reader", () => {
  it(
    "extracts consecutive standard STORE entries with short final chunks and a DEFLATE entry",
    async () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-node24-zip-"));
      const first = pseudoRandomBytes((2 * 64 * 1024) + 101, 0x12345678);
      const second = pseudoRandomBytes((3 * 64 * 1024) + 203, 0x87654321);
      const deflated = pseudoRandomBytes((2 * 64 * 1024) + 333, 0x2468ace0);
      try {
        const zipPath = path.join(tempRoot, "standard.zip");
        const destination = path.join(tempRoot, "out");
        await buildStandardZip(zipPath, [
          { name: "first.bin", content: first, method: 0 },
          { name: "second.bin", content: second, method: 0 },
          { name: "nested/deflated.bin", content: deflated, method: 8 },
        ]);

        const metadata = localEntryMetadata(fs.readFileSync(zipPath));
        expect(metadata.map(entry => entry.method)).toEqual([0, 0, 8]);
        expect(metadata.slice(0, 2).every(
          entry => entry.compressedSize > 64 * 1024
            && entry.compressedSize % (64 * 1024) !== 0,
        )).toBe(true);
        expect(metadata[2].compressedSize).toBeGreaterThan(64 * 1024);
        expect(metadata[2].compressedSize % (64 * 1024)).not.toBe(0);

        await extractZip(zipPath, destination);
        expect(fs.readFileSync(path.join(destination, "first.bin"))).toEqual(first);
        expect(fs.readFileSync(path.join(destination, "second.bin"))).toEqual(second);
        expect(
          fs.readFileSync(path.join(destination, "nested", "deflated.bin")),
        ).toEqual(deflated);
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    },
    10_000,
  );

  it("closes its single archive handle when corrupt metadata rejects", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-corrupt-zip-"));
    const realOpen = fs.promises.open.bind(fs.promises);
    const closeCalls: Array<ReturnType<typeof vi.fn>> = [];
    const openSpy = vi.spyOn(fs.promises, "open").mockImplementation(
      async (...args: Parameters<typeof fs.promises.open>) => {
        const handle = await realOpen(...args);
        const realClose = handle.close.bind(handle);
        const closeSpy = vi.fn(async () => {
          await realClose();
          throw new Error("injected close failure");
        });
        handle.close = closeSpy;
        closeCalls.push(closeSpy);
        return handle;
      },
    );

    try {
      const zipPath = path.join(tempRoot, "corrupt.zip");
      await buildStandardZip(zipPath, [
        { name: "payload.txt", content: Buffer.from("payload"), method: 8 },
      ]);
      const archive = fs.readFileSync(zipPath);
      fs.writeFileSync(zipPath, archive.subarray(0, archive.length - 11));

      const extraction = extractZip(zipPath, path.join(tempRoot, "out"));
      await expect(extraction).rejects.toSatisfy(
        error => error instanceof AggregateError && error.errors.length === 2,
      );
      expect(closeCalls).toHaveLength(1);
      expect(closeCalls[0]).toHaveBeenCalledTimes(1);
    } finally {
      openSpy.mockRestore();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects a close-only failure exactly once without an unhandled rejection", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-close-zip-"));
    const realOpen = fs.promises.open.bind(fs.promises);
    const closeCalls: Array<ReturnType<typeof vi.fn>> = [];
    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown) => unhandled.push(error);
    process.on("unhandledRejection", onUnhandled);
    const openSpy = vi.spyOn(fs.promises, "open").mockImplementation(
      async (...args: Parameters<typeof fs.promises.open>) => {
        const handle = await realOpen(...args);
        const realClose = handle.close.bind(handle);
        const closeSpy = vi.fn(async () => {
          await realClose();
          throw new Error("close-only failure");
        });
        handle.close = closeSpy;
        closeCalls.push(closeSpy);
        return handle;
      },
    );
    try {
      const zipPath = path.join(tempRoot, "valid.zip");
      await buildStandardZip(zipPath, [
        { name: "payload.txt", content: Buffer.from("payload"), method: 0 },
      ]);
      await expect(
        extractZip(zipPath, path.join(tempRoot, "out")),
      ).rejects.toThrow("close-only failure");
      await new Promise(resolve => setImmediate(resolve));
      expect(unhandled).toEqual([]);
      expect(closeCalls).toHaveLength(1);
      expect(closeCalls[0]).toHaveBeenCalledTimes(1);
    } finally {
      process.removeListener("unhandledRejection", onUnhandled);
      openSpy.mockRestore();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("keeps completed entries but publishes no partial file or temp on a later inflate error", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-partial-zip-"));
    try {
      const zipPath = path.join(tempRoot, "partial.zip");
      const first = Buffer.from("complete");
      const second = pseudoRandomBytes(128 * 1024, 0x13579bdf);
      await buildStandardZip(zipPath, [
        { name: "first.txt", content: first, method: 0 },
        { name: "second.bin", content: second, method: 8 },
      ]);
      const archive = fs.readFileSync(zipPath);
      const secondMetadata = localEntryMetadata(archive)[1];
      archive.fill(
        0xff,
        secondMetadata.dataStart,
        Math.min(secondMetadata.dataStart + 32, archive.length),
      );
      fs.writeFileSync(zipPath, archive);
      const destination = path.join(tempRoot, "out");

      await expect(extractZip(zipPath, destination)).rejects.toThrow();
      expect(fs.readFileSync(path.join(destination, "first.txt"))).toEqual(first);
      expect(fs.existsSync(path.join(destination, "second.bin"))).toBe(false);
      expect(fs.readdirSync(destination).some(name => name.endsWith(".tmp"))).toBe(false);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("skips __MACOSX metadata entries", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-macosx-zip-"));
    try {
      const zipPath = path.join(tempRoot, "macosx.zip");
      await buildStandardZip(zipPath, [
        { name: "__MACOSX/._payload.txt", content: Buffer.from("metadata"), method: 0 },
        { name: "payload.txt", content: Buffer.from("content"), method: 0 },
      ]);
      const destination = path.join(tempRoot, "out");
      await extractZip(zipPath, destination);
      expect(fs.existsSync(path.join(destination, "__MACOSX"))).toBe(false);
      expect(fs.readFileSync(path.join(destination, "payload.txt"), "utf8")).toBe("content");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
