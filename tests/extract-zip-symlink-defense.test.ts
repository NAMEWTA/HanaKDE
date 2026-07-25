import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";

import { extractZip } from "../lib/extract-zip.ts";

type ZipFixtureOptions = {
  symlinkName?: string;
  symlinkTarget?: string;
  fileEntries?: Array<{ content: string | Buffer; name: string }>;
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

async function buildZipWithSymlink(
  zipPath: string,
  { symlinkName, symlinkTarget, fileEntries = [] }: ZipFixtureOptions,
) {
  const entries = [
    ...(symlinkName && symlinkTarget
      ? [{
        content: Buffer.from(symlinkTarget),
        externalAttributes: (0o120777 << 16) >>> 0,
        name: symlinkName,
        versionMadeBy: 0x0314,
      }]
      : []),
    ...fileEntries.map(entry => ({
      content: Buffer.isBuffer(entry.content)
        ? entry.content
        : Buffer.from(entry.content),
      externalAttributes: 0,
      name: entry.name,
      versionMadeBy: 20,
    })),
  ];
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const checksum = crc32(entry.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.content.length, 18);
    local.writeUInt32LE(entry.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localChunks.push(local, name, entry.content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(entry.versionMadeBy, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.content.length, 20);
    central.writeUInt32LE(entry.content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(entry.externalAttributes, 38);
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, name);
    offset += local.length + name.length + entry.content.length;
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

describe("lib/extract-zip", () => {
  it("rejects archives that contain a symlink entry", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-extract-zip-symlink-"));
    try {
      const zipPath = path.join(tempRoot, "evil.zip");
      const targetCanary = path.join(tempRoot, "outside-canary.txt");
      fs.writeFileSync(targetCanary, "original", "utf-8");

      await buildZipWithSymlink(zipPath, {
        symlinkName: "payload",
        symlinkTarget: targetCanary,
        fileEntries: [{ name: "payload", content: "overwrite-bytes" }],
      });

      const destDir = path.join(tempRoot, "dest");
      fs.mkdirSync(destDir, { recursive: true });

      await expect(extractZip(zipPath, destDir)).rejects.toThrow(/symlink/i);

      // 关键：canary 未被覆写
      expect(fs.readFileSync(targetCanary, "utf-8")).toBe("original");
      // dest 内不应残留 symlink
      const destEntry = path.join(destDir, "payload");
      if (fs.existsSync(destEntry)) {
        const lstat = fs.lstatSync(destEntry);
        expect(lstat.isSymbolicLink()).toBe(false);
      }
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("extracts a plain zip without symlink entries", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-extract-zip-plain-"));
    try {
      const zipPath = path.join(tempRoot, "good.zip");
      await buildZipWithSymlink(zipPath, {
        fileEntries: [
          { name: "README.md", content: "hello" },
          { name: "nested/inner.txt", content: "inner" },
        ],
      });

      const destDir = path.join(tempRoot, "dest");
      fs.mkdirSync(destDir, { recursive: true });

      await extractZip(zipPath, destDir);

      expect(fs.readFileSync(path.join(destDir, "README.md"), "utf-8")).toBe("hello");
      expect(fs.readFileSync(path.join(destDir, "nested", "inner.txt"), "utf-8")).toBe("inner");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects parent traversal before writing outside the destination", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-extract-zip-slip-"));
    try {
      const zipPath = path.join(tempRoot, "traversal.zip");
      await buildZipWithSymlink(zipPath, {
        fileEntries: [{ name: "aa/escape.txt", content: "escaped" }],
      });
      const archive = fs.readFileSync(zipPath);
      const safeName = Buffer.from("aa/escape.txt");
      const traversalName = Buffer.from("../escape.txt");
      let replacementCount = 0;
      for (
        let offset = archive.indexOf(safeName);
        offset !== -1;
        offset = archive.indexOf(safeName, offset + traversalName.length)
      ) {
        traversalName.copy(archive, offset);
        replacementCount += 1;
      }
      expect(replacementCount).toBe(2);
      fs.writeFileSync(zipPath, archive);

      const destination = path.join(tempRoot, "dest");
      await expect(extractZip(zipPath, destination)).rejects.toThrow(
        /invalid relative path|out of bound/i,
      );
      expect(fs.existsSync(path.join(tempRoot, "escape.txt"))).toBe(false);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects a pre-existing parent symlink before creating external children", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-parent-symlink-"));
    try {
      const outside = path.join(tempRoot, "outside");
      const destination = path.join(tempRoot, "dest");
      fs.mkdirSync(outside);
      fs.mkdirSync(destination);
      fs.writeFileSync(path.join(outside, "canary.txt"), "unchanged");
      fs.symlinkSync(outside, path.join(destination, "linked"), "dir");
      const zipPath = path.join(tempRoot, "parent-symlink.zip");
      await buildZipWithSymlink(zipPath, {
        fileEntries: [{ name: "linked/new-child/payload.txt", content: "escape" }],
      });

      await expect(extractZip(zipPath, destination)).rejects.toThrow(
        /unsafe parent/i,
      );
      expect(fs.readFileSync(path.join(outside, "canary.txt"), "utf8")).toBe("unchanged");
      expect(fs.existsSync(path.join(outside, "new-child"))).toBe(false);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("never follows a pre-existing destination symlink", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-target-symlink-"));
    try {
      const destination = path.join(tempRoot, "dest");
      const canary = path.join(tempRoot, "canary.txt");
      fs.mkdirSync(destination);
      fs.writeFileSync(canary, "unchanged");
      fs.symlinkSync(canary, path.join(destination, "payload.txt"));
      const zipPath = path.join(tempRoot, "target-symlink.zip");
      await buildZipWithSymlink(zipPath, {
        fileEntries: [{ name: "payload.txt", content: "replacement" }],
      });

      await expect(extractZip(zipPath, destination)).rejects.toThrow(
        /destination symlink/i,
      );
      expect(fs.readFileSync(canary, "utf8")).toBe("unchanged");
      expect(fs.lstatSync(path.join(destination, "payload.txt")).isSymbolicLink()).toBe(true);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("atomically replaces a pre-existing regular destination file", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-target-replace-"));
    try {
      const destination = path.join(tempRoot, "dest");
      fs.mkdirSync(destination);
      fs.writeFileSync(path.join(destination, "payload.txt"), "old");
      const zipPath = path.join(tempRoot, "replace.zip");
      await buildZipWithSymlink(zipPath, {
        fileEntries: [{ name: "payload.txt", content: "replacement" }],
      });

      await extractZip(zipPath, destination);
      expect(fs.readFileSync(path.join(destination, "payload.txt"), "utf8")).toBe(
        "replacement",
      );
      expect(fs.readdirSync(destination).some(name => name.endsWith(".tmp"))).toBe(false);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("keeps search tool zip downloads on the hardened wrapper", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "lib", "pi-sdk", "search-tools.ts"),
      "utf-8",
    );

    expect(source).toContain('import { extractZip } from "../extract-zip.ts";');
    expect(source).not.toContain('from "extract-zip"');
    expect(source).toContain("await extractZip(archivePath, extractDir);");
  });
});
