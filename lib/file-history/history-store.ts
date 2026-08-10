import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { isSafeHistoryRelativePath } from "./text-file-policy.ts";

const require = createRequire(import.meta.url);
let BetterSqliteDatabase: any = null;

function loadDatabase() {
  if (!BetterSqliteDatabase) {
    const module = require("better-sqlite3");
    BetterSqliteDatabase = module?.default || module;
  }
  return BetterSqliteDatabase;
}

export const FILE_HISTORY_SCHEMA_ID = "hana.file-history.main.v1";
export const FILE_HISTORY_SCHEMA_VERSION = 1;

export type SnapshotOrigin = "baseline" | "event" | "restore";

export type RecordSnapshotInput = Readonly<{
  relPath: string;
  content: Buffer;
  origin: SnapshotOrigin;
  opContext?: string | null;
  versionToken?: string | null;
  capturedAt?: number;
}>;

export type RecordSnapshotResult = Readonly<{
  status: "inserted" | "merged" | "unchanged";
  snapshotId: number;
}>;

export type FileHistoryVersion = Readonly<{
  id: number;
  capturedAt: number;
  origin: SnapshotOrigin;
  opContext: string | null;
  rawSize: number;
  versionToken: string | null;
}>;

export type FileHistoryDiffLine = Readonly<{
  kind: "added" | "removed" | "unchanged";
  text: string;
}>;

const BASELINE_TABLES = new Set(["meta", "files", "snapshots"]);
const BASELINE_INDEXES = new Set(["idx_snapshots_file_time", "idx_snapshots_time"]);

export class FileHistoryStore {
  declare _db: any;
  declare _mergeWindowMs: number;
  declare _now: () => number;
  declare _closed: boolean;

  constructor({
    dbPath,
    mergeWindowMs = 60_000,
    now = () => Date.now(),
  }: {
    dbPath: string;
    mergeWindowMs?: number;
    now?: () => number;
  }) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const Database = loadDatabase();
    let db: any = null;
    try {
      db = new Database(dbPath);
      const existingTables = new Set<string>(db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      `).all().map((row: { name: string }) => row.name));
      const existingIndexes = new Set<string>(db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
      `).all().map((row: { name: string }) => row.name));
      const newDatabase = existingTables.size === 0 && existingIndexes.size === 0;
      if (!newDatabase && (!sameTables(existingTables, BASELINE_TABLES) || !sameTables(existingIndexes, BASELINE_INDEXES))) {
        throw new Error("file-history database is not the main-only baseline schema");
      }
      if (!newDatabase) {
        const metadata = new Map<string, string>(db.prepare("SELECT key, value FROM meta").all().map((row: { key: string; value: string }) => [row.key, row.value]));
        if (
          metadata.size !== 2
          || metadata.get("schema_id") !== FILE_HISTORY_SCHEMA_ID
          || Number(metadata.get("schema_version")) !== FILE_HISTORY_SCHEMA_VERSION
        ) {
          throw new Error("file-history database does not match the new main-only baseline schema");
        }
      }

      db.pragma("auto_vacuum = INCREMENTAL");
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");
      if (newDatabase) {
        db.exec(`
          CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
          CREATE TABLE files(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rel_path TEXT NOT NULL UNIQUE,
            deleted_at INTEGER
          );
          CREATE TABLE snapshots(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            content_hash TEXT NOT NULL,
            version_token TEXT,
            content BLOB NOT NULL,
            raw_size INTEGER NOT NULL,
            stored_size INTEGER NOT NULL,
            captured_at INTEGER NOT NULL,
            origin TEXT NOT NULL,
            op_context TEXT
          );
          CREATE INDEX idx_snapshots_file_time ON snapshots(file_id, captured_at DESC, id DESC);
          CREATE INDEX idx_snapshots_time ON snapshots(captured_at, id);
        `);
        db.prepare("INSERT INTO meta(key, value) VALUES('schema_id', ?)").run(FILE_HISTORY_SCHEMA_ID);
        db.prepare("INSERT INTO meta(key, value) VALUES('schema_version', ?)").run(String(FILE_HISTORY_SCHEMA_VERSION));
      }

      this._db = db;
      this._mergeWindowMs = mergeWindowMs;
      this._now = now;
      this._closed = false;
    } catch (error) {
      try { db?.close(); } catch {}
      throw error;
    }
  }

  schemaId(): string {
    return this._db.prepare("SELECT value FROM meta WHERE key = 'schema_id'").get()?.value || "";
  }

  recordSnapshot({
    relPath,
    content,
    origin,
    opContext = null,
    versionToken = null,
    capturedAt = this._now(),
  }: RecordSnapshotInput): RecordSnapshotResult {
    this._assertOpen();
    if (!isSafeHistoryRelativePath(relPath)) throw new Error("file-history snapshot path must be relative");
    if (!Buffer.isBuffer(content)) throw new TypeError("file-history snapshot content must be a Buffer");
    if (versionToken != null && (typeof versionToken !== "string" || versionToken.length > 4_096)) {
      throw new TypeError("file-history version token is invalid");
    }

    const hash = createHash("sha256").update(content).digest("hex");
    const file = this._ensureFile(relPath);
    const latest = this._db.prepare(`
      SELECT id, content_hash, version_token, captured_at, origin
      FROM snapshots WHERE file_id = ? ORDER BY captured_at DESC, id DESC LIMIT 1
    `).get(file.id);

    if (latest && (latest.content_hash === hash || (versionToken && latest.version_token === versionToken))) {
      this._clearDeleted(file.id);
      return { status: "unchanged", snapshotId: latest.id };
    }

    const compressed = gzipSync(content);
    const withinWindow = Boolean(latest)
      && capturedAt - latest.captured_at < this._mergeWindowMs
      && capturedAt - latest.captured_at >= 0
      && latest.origin !== "restore"
      && origin !== "restore";

    if (withinWindow) {
      this._db.prepare(`
        UPDATE snapshots
        SET content_hash = ?, version_token = ?, content = ?, raw_size = ?, stored_size = ?,
            captured_at = ?, origin = ?, op_context = ?
        WHERE id = ?
      `).run(hash, versionToken, compressed, content.length, compressed.length, capturedAt, origin, opContext, latest.id);
      this._clearDeleted(file.id);
      return { status: "merged", snapshotId: latest.id };
    }

    const info = this._db.prepare(`
      INSERT INTO snapshots(file_id, content_hash, version_token, content, raw_size, stored_size, captured_at, origin, op_context)
      VALUES(?,?,?,?,?,?,?,?,?)
    `).run(file.id, hash, versionToken, compressed, content.length, compressed.length, capturedAt, origin, opContext);
    this._clearDeleted(file.id);
    return { status: "inserted", snapshotId: Number(info.lastInsertRowid) };
  }

  markDeleted(relPath: string, at: number = this._now()): void {
    this._assertOpen();
    if (!isSafeHistoryRelativePath(relPath)) return;
    this._db.prepare("UPDATE files SET deleted_at = ? WHERE rel_path = ?").run(at, relPath);
  }

  renamePath(oldRelPath: string, newRelPath: string): boolean {
    this._assertOpen();
    if (!isSafeHistoryRelativePath(oldRelPath) || !isSafeHistoryRelativePath(newRelPath)) return false;
    const oldRow = this._db.prepare("SELECT id FROM files WHERE rel_path = ?").get(oldRelPath);
    if (!oldRow) return false;
    const newRow = this._db.prepare("SELECT id FROM files WHERE rel_path = ?").get(newRelPath);
    if (newRow) {
      this._db.prepare("UPDATE snapshots SET file_id = ? WHERE file_id = ?").run(newRow.id, oldRow.id);
      this._db.prepare("DELETE FROM files WHERE id = ?").run(oldRow.id);
      this._clearDeleted(newRow.id);
      return true;
    }
    this._db.prepare("UPDATE files SET rel_path = ?, deleted_at = NULL WHERE id = ?").run(newRelPath, oldRow.id);
    return true;
  }

  listFiles(): Array<{ relPath: string; deletedAt: number | null; lastCapturedAt: number; snapshotCount: number }> {
    this._assertOpen();
    return this._db.prepare(`
      SELECT f.rel_path AS relPath, f.deleted_at AS deletedAt,
             MAX(s.captured_at) AS lastCapturedAt, COUNT(s.id) AS snapshotCount
      FROM files f JOIN snapshots s ON s.file_id = f.id
      GROUP BY f.id ORDER BY lastCapturedAt DESC, f.rel_path ASC
    `).all();
  }

  listVersions(relPath: string): FileHistoryVersion[] {
    this._assertOpen();
    if (!isSafeHistoryRelativePath(relPath)) return [];
    return this._db.prepare(`
      SELECT s.id AS id, s.captured_at AS capturedAt, s.origin AS origin,
             s.op_context AS opContext, s.raw_size AS rawSize, s.version_token AS versionToken
      FROM snapshots s JOIN files f ON f.id = s.file_id
      WHERE f.rel_path = ? ORDER BY s.captured_at DESC, s.id DESC
    `).all(relPath);
  }

  getSnapshotContent(snapshotId: number): { relPath: string; content: Buffer; capturedAt: number; origin: SnapshotOrigin } {
    this._assertOpen();
    const row = this._snapshotRow(snapshotId);
    return {
      relPath: row.relPath,
      content: gunzipSync(row.content),
      capturedAt: row.capturedAt,
      origin: row.origin,
    };
  }

  getSnapshotDiff(snapshotId: number, baseSnapshotId?: number): FileHistoryDiffLine[] {
    this._assertOpen();
    const target = this._snapshotRow(snapshotId);
    const base = baseSnapshotId == null ? this._previousSnapshot(target) : this._snapshotRow(baseSnapshotId);
    if (base && base.fileId !== target.fileId) throw new Error("file-history snapshots belong to different files");

    const before = base ? gunzipSync(base.content).toString("utf-8") : "";
    const after = gunzipSync(target.content).toString("utf-8");
    return lineDiff(before, after);
  }

  totalStoredBytes(): number {
    this._assertOpen();
    return Number(this._db.prepare("SELECT COALESCE(SUM(stored_size), 0) AS total FROM snapshots").get()?.total || 0);
  }

  enforceRetention({ maxAgeMs, maxTotalBytes, now = this._now() }: {
    maxAgeMs: number;
    maxTotalBytes: number;
    now?: number;
  }): void {
    this._assertOpen();
    this._db.prepare("DELETE FROM snapshots WHERE captured_at < ?").run(now - maxAgeMs);
    this._trimToQuota(maxTotalBytes);
    this._db.prepare("DELETE FROM files WHERE id NOT IN (SELECT DISTINCT file_id FROM snapshots)").run();
    this._db.pragma("incremental_vacuum");
  }

  close(): void {
    if (this._closed) return;
    this._closed = true;
    this._db.close();
  }

  _ensureFile(relPath: string): { id: number } {
    const existing = this._db.prepare("SELECT id FROM files WHERE rel_path = ?").get(relPath);
    if (existing) return existing;
    const info = this._db.prepare("INSERT INTO files(rel_path) VALUES(?)").run(relPath);
    return { id: Number(info.lastInsertRowid) };
  }

  _clearDeleted(fileId: number): void {
    this._db.prepare("UPDATE files SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL").run(fileId);
  }

  _snapshotRow(snapshotId: number): any {
    if (!Number.isInteger(snapshotId) || snapshotId <= 0) throw new Error("file-history snapshot id is invalid");
    const row = this._db.prepare(`
      SELECT s.id AS id, s.file_id AS fileId, s.content AS content, s.captured_at AS capturedAt,
             s.origin AS origin, f.rel_path AS relPath
      FROM snapshots s JOIN files f ON f.id = s.file_id WHERE s.id = ?
    `).get(snapshotId);
    if (!row) throw new Error(`file-history snapshot ${snapshotId} not found`);
    return row;
  }

  _previousSnapshot(target: any): any | null {
    return this._db.prepare(`
      SELECT id, file_id AS fileId, content, captured_at AS capturedAt, origin
      FROM snapshots
      WHERE file_id = ? AND (captured_at < ? OR (captured_at = ? AND id < ?))
      ORDER BY captured_at DESC, id DESC LIMIT 1
    `).get(target.fileId, target.capturedAt, target.capturedAt, target.id) || null;
  }

  _trimToQuota(maxTotalBytes: number): void {
    const trim = this._db.transaction(() => {
      let total = this.totalStoredBytes();
      if (total <= maxTotalBytes) return;
      const snapshots = this._db.prepare(`
        SELECT id, stored_size AS storedSize FROM snapshots ORDER BY captured_at ASC, id ASC
      `).all();
      const remove = this._db.prepare("DELETE FROM snapshots WHERE id = ?");
      for (const snapshot of snapshots) {
        if (total <= maxTotalBytes) break;
        remove.run(snapshot.id);
        total -= Number(snapshot.storedSize);
      }
    });
    trim();
  }

  _assertOpen(): void {
    if (this._closed) throw new Error("file-history store is closed");
  }
}

function sameTables(actual: Set<string>, expected: Set<string>): boolean {
  if (actual.size !== expected.size) return false;
  for (const table of expected) if (!actual.has(table)) return false;
  return true;
}

function splitLines(value: string): string[] {
  return value.match(/[^\n]*\n|[^\n]+$/g) || [];
}

function lineDiff(before: string, after: string): FileHistoryDiffLine[] {
  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);
  let prefix = 0;
  while (prefix < beforeLines.length && beforeLines[prefix] === afterLines[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix
    && suffix < afterLines.length - prefix
    && beforeLines[beforeLines.length - suffix - 1] === afterLines[afterLines.length - suffix - 1]
  ) suffix += 1;

  return [
    ...beforeLines.slice(0, prefix).map(text => ({ kind: "unchanged" as const, text })),
    ...beforeLines.slice(prefix, beforeLines.length - suffix).map(text => ({ kind: "removed" as const, text })),
    ...afterLines.slice(prefix, afterLines.length - suffix).map(text => ({ kind: "added" as const, text })),
    ...beforeLines.slice(beforeLines.length - suffix).map(text => ({ kind: "unchanged" as const, text })),
  ];
}
