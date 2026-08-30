import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ExchangeError } from "../../src/application/exchange/errors.ts";
import { createZipArchive, readZipArchive } from "../../src/application/exchange/archive-codec.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe("dossier exchange archive codec", () => {
  it("creates deterministic archives and reads their bounded entries", async () => {
    const entries = [
      { path: "dossier/files/readme.txt", content: encoder.encode("portable") },
      { path: "dossier-exchange.json", content: encoder.encode("{}\n") },
    ];

    const first = createZipArchive(entries);
    const second = createZipArchive([...entries].reverse());
    assert.deepEqual(first, second);

    const unpacked = await readZipArchive(first, { maxFiles: 4, maxTotalBytes: 1024, maxEntryBytes: 512 });
    assert.deepEqual([...unpacked.keys()], ["dossier-exchange.json", "dossier/files/readme.txt"]);
    assert.equal(decoder.decode(unpacked.get("dossier/files/readme.txt")), "portable");
  });

  it("rejects unsafe paths before returning any archive entries", async () => {
    const archive = createZipArchive([{ path: "../escape.txt", content: encoder.encode("blocked") }], { unsafeTestPaths: true });

    await assert.rejects(readZipArchive(archive, { maxFiles: 4, maxTotalBytes: 1024, maxEntryBytes: 512 }),
      (error: unknown) => error instanceof ExchangeError && error.code === "unsafe_archive");
  });

  it("rejects archives that exceed declared resource limits", async () => {
    const archive = createZipArchive([{ path: "large.bin", content: new Uint8Array(32) }]);

    await assert.rejects(readZipArchive(archive, { maxFiles: 4, maxTotalBytes: 16, maxEntryBytes: 16 }),
      (error: unknown) => error instanceof ExchangeError && error.code === "archive_limit_exceeded");
  });

  it("rejects absolute paths and Unix symlink entries", async () => {
    const absolute = createZipArchive([{ path: "C:/escape.txt", content: encoder.encode("blocked") }], { unsafeTestPaths: true });
    await assert.rejects(readZipArchive(absolute, { maxFiles: 4, maxTotalBytes: 1024, maxEntryBytes: 512 }),
      (error: unknown) => error instanceof ExchangeError && error.code === "unsafe_archive");

    const symlink = createZipArchive([{ path: "link", content: encoder.encode("target") }]);
    const view = new DataView(symlink.buffer, symlink.byteOffset, symlink.byteLength);
    let centralOffset = -1;
    for (let index = 0; index <= symlink.byteLength - 4; index += 1) {
      if (view.getUint32(index, true) === 0x02014b50) { centralOffset = index; break; }
    }
    assert.ok(centralOffset >= 0);
    view.setUint32(centralOffset + 38, 0xa1ff << 16, true);
    await assert.rejects(readZipArchive(symlink, { maxFiles: 4, maxTotalBytes: 1024, maxEntryBytes: 512 }),
      (error: unknown) => error instanceof ExchangeError && error.code === "unsafe_archive");
  });

  it("rejects cross-platform path collisions and Windows-unsafe names", async () => {
    const collision = createZipArchive([
      { path: "Folder/File.txt", content: encoder.encode("one") },
      { path: "folder/file.txt", content: encoder.encode("two") },
    ]);
    await assert.rejects(readZipArchive(collision, { maxFiles: 4, maxTotalBytes: 1024, maxEntryBytes: 512 }),
      (error: unknown) => error instanceof ExchangeError && error.code === "unsafe_archive");
    assert.throws(() => createZipArchive([{ path: "dossier/files/CON.txt", content: encoder.encode("blocked") }]),
      (error: unknown) => error instanceof ExchangeError && error.code === "validation");
    assert.throws(() => createZipArchive([{ path: "dossier/files/report.txt:stream", content: encoder.encode("blocked") }]),
      (error: unknown) => error instanceof ExchangeError && error.code === "validation");
  });
});
