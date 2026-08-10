import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import {
  FILE_HISTORY_SCHEMA_ID,
  FileHistoryStore,
} from "../lib/file-history/history-store.ts";
import { MAX_SNAPSHOT_BYTES } from "../lib/file-history/text-file-policy.ts";

const tmpDirs: string[] = [];

function makeStore(overrides: Record<string, unknown> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-file-history-private-"));
  tmpDirs.push(dir);
  return new FileHistoryStore({ dbPath: path.join(dir, "history.sqlite"), ...overrides });
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("FileHistoryStore", () => {
  it("creates only the new main-history schema and records opaque versions", () => {
    const store = makeStore();
    const snapshot = store.recordSnapshot({
      relPath: "notes/a.md",
      content: Buffer.from("hello"),
      origin: "event",
      versionToken: "v-1",
      capturedAt: 1_000,
    });

    expect(store.schemaId()).toBe(FILE_HISTORY_SCHEMA_ID);
    expect(store.getSnapshotContent(snapshot.snapshotId).content.toString()).toBe("hello");
    expect(store.listVersions("notes/a.md")[0]).toMatchObject({ versionToken: "v-1" });
    store.close();
  });

  it("dedupes a repeated content hash or opaque resource version", () => {
    const store = makeStore({ mergeWindowMs: 0 });
    store.recordSnapshot({ relPath: "a.md", content: Buffer.from("one"), origin: "event", versionToken: "v-1", capturedAt: 1_000 });

    expect(store.recordSnapshot({
      relPath: "a.md", content: Buffer.from("one"), origin: "event", versionToken: "v-2", capturedAt: 2_000,
    }).status).toBe("unchanged");
    expect(store.recordSnapshot({
      relPath: "a.md", content: Buffer.from("inconsistent-repeat"), origin: "event", versionToken: "v-1", capturedAt: 3_000,
    }).status).toBe("unchanged");
    expect(store.listVersions("a.md")).toHaveLength(1);
    store.close();
  });

  it("rejects content beyond the file-history snapshot budget at the store boundary", () => {
    const store = makeStore();

    expect(() => store.recordSnapshot({
      relPath: "large.md",
      content: Buffer.alloc(MAX_SNAPSHOT_BYTES + 1),
      origin: "event",
    })).toThrow(/snapshot|size|large/i);

    store.close();
  });

  it("merges changes inside the fixed 60-second window but preserves a restore boundary", () => {
    const store = makeStore({ mergeWindowMs: 60_000 });
    store.recordSnapshot({ relPath: "a.md", content: Buffer.from("v1"), origin: "event", capturedAt: 1_000 });
    expect(store.recordSnapshot({ relPath: "a.md", content: Buffer.from("v2"), origin: "event", capturedAt: 60_999 }).status).toBe("merged");
    expect(store.recordSnapshot({ relPath: "a.md", content: Buffer.from("v3"), origin: "restore", capturedAt: 61_000 }).status).toBe("inserted");
    expect(store.recordSnapshot({ relPath: "a.md", content: Buffer.from("v4"), origin: "event", capturedAt: 61_001 }).status).toBe("inserted");
    expect(store.listVersions("a.md")).toHaveLength(3);
    store.close();
  });

  it("retains one timeline across an in-main rename and turns move-out into a deletion", () => {
    const store = makeStore();
    store.recordSnapshot({ relPath: "old.md", content: Buffer.from("v1"), origin: "event", capturedAt: 1_000 });
    expect(store.renamePath("old.md", "renamed.md")).toBe(true);
    store.recordSnapshot({ relPath: "renamed.md", content: Buffer.from("v2"), origin: "event", capturedAt: 80_000 });
    store.markDeleted("renamed.md", 90_000);

    expect(store.listVersions("old.md")).toHaveLength(0);
    expect(store.listVersions("renamed.md")).toHaveLength(2);
    expect(store.listFiles().find(file => file.relPath === "renamed.md")?.deletedAt).toBe(90_000);
    store.close();
  });

  it("enforces 30-day retention and the supplied byte quota deterministically", () => {
    const store = makeStore({ mergeWindowMs: 0 });
    const day = 24 * 60 * 60 * 1_000;
    store.recordSnapshot({ relPath: "a.md", content: Buffer.from("old"), origin: "event", capturedAt: 0 });
    store.recordSnapshot({ relPath: "a.md", content: Buffer.from("new"), origin: "event", capturedAt: 31 * day });
    store.enforceRetention({ maxAgeMs: 30 * day, maxTotalBytes: 500 * 1024 * 1024, now: 31 * day });
    expect(store.listVersions("a.md")).toHaveLength(1);

    store.recordSnapshot({ relPath: "b.md", content: Buffer.from(Array.from({ length: 4_000 }, (_, index) => index % 251)), origin: "event", capturedAt: 31 * day + 1 });
    store.recordSnapshot({ relPath: "c.md", content: Buffer.from(Array.from({ length: 4_000 }, (_, index) => (index + 17) % 251)), origin: "event", capturedAt: 31 * day + 2 });
    store.enforceRetention({ maxAgeMs: 365 * day, maxTotalBytes: 1_000, now: 31 * day + 3 });
    expect(store.totalStoredBytes()).toBeLessThanOrEqual(1_000);
    store.close();
  });

  it("removes only the minimum oldest snapshots needed to meet a quota", () => {
    const store = makeStore({ mergeWindowMs: 0 });
    store.recordSnapshot({ relPath: "oldest.md", content: Buffer.from("first payload"), origin: "event", capturedAt: 1 });
    store.recordSnapshot({ relPath: "middle.md", content: Buffer.from("second payload"), origin: "event", capturedAt: 2 });
    store.recordSnapshot({ relPath: "newest.md", content: Buffer.from("third payload"), origin: "event", capturedAt: 3 });
    const quota = store.totalStoredBytes() - 1;

    store.enforceRetention({ maxAgeMs: Number.MAX_SAFE_INTEGER, maxTotalBytes: quota, now: 3 });

    expect(store.totalStoredBytes()).toBeLessThanOrEqual(quota);
    expect(store.listFiles().map(file => file.relPath).sort()).toEqual(["middle.md", "newest.md"]);
    store.close();
  });

  it("returns line-level snapshot diffs without a filesystem read", () => {
    const store = makeStore({ mergeWindowMs: 0 });
    const oldSnapshot = store.recordSnapshot({ relPath: "a.md", content: Buffer.from("one\ntwo\n"), origin: "event", capturedAt: 1_000 });
    const newSnapshot = store.recordSnapshot({ relPath: "a.md", content: Buffer.from("one\nthree\n"), origin: "event", capturedAt: 70_000 });

    expect(store.getSnapshotDiff(newSnapshot.snapshotId, oldSnapshot.snapshotId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "removed", text: "two\n" }),
      expect.objectContaining({ kind: "added", text: "three\n" }),
    ]));
    store.close();
  });

  it("rejects an existing non-baseline database instead of migrating or discovering legacy state", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-file-history-private-"));
    tmpDirs.push(dir);
    const dbPath = path.join(dir, "history.sqlite");
    const requireHere = createRequire(import.meta.url);
    const DatabaseMod = requireHere("better-sqlite3");
    const Database = DatabaseMod?.default || DatabaseMod;
    const raw = new Database(dbPath);
    raw.exec("CREATE TABLE legacy_profile(id INTEGER PRIMARY KEY)");
    raw.close();

    expect(() => new FileHistoryStore({ dbPath })).toThrow(/baseline|schema/i);
  });

  it("rejects an incomplete old schema instead of adding fields or indexes", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-file-history-private-"));
    tmpDirs.push(dir);
    const dbPath = path.join(dir, "history.sqlite");
    const requireHere = createRequire(import.meta.url);
    const DatabaseMod = requireHere("better-sqlite3");
    const Database = DatabaseMod?.default || DatabaseMod;
    const raw = new Database(dbPath);
    raw.exec(`
      CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE files(id INTEGER PRIMARY KEY AUTOINCREMENT, rel_path TEXT NOT NULL UNIQUE, deleted_at INTEGER);
      CREATE TABLE snapshots(id INTEGER PRIMARY KEY AUTOINCREMENT, file_id INTEGER NOT NULL, content_hash TEXT NOT NULL, content BLOB NOT NULL, raw_size INTEGER NOT NULL, stored_size INTEGER NOT NULL, captured_at INTEGER NOT NULL, origin TEXT NOT NULL, op_context TEXT);
    `);
    raw.close();

    expect(() => new FileHistoryStore({ dbPath })).toThrow(/baseline|schema/i);
  });
});
