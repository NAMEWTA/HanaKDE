import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";

export const INDEX_SCHEMA_VERSION = 1 as const;

export interface MetadataIndexEntry {
  dossierId: string;
  revision: number;
  name: string;
  typeName: string;
  tags: string[];
  documentCount: number;
  dossierRef: string;
  searchText: string;
}

export interface MetadataIndexStatus {
  status: "missing" | "ready" | "stale" | "corrupt";
  schemaVersion: number | null;
  dossierCount: number;
  documentCount: number;
  rebuiltAt: string | null;
  staleReason: string | null;
}

interface Statement {
  run(...params: unknown[]): { changes: number };
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Array<Record<string, unknown>>;
}

interface Database {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  pragma(sql: string): unknown;
  transaction<TArgs extends unknown[], TResult>(operation: (...args: TArgs) => TResult): (...args: TArgs) => TResult;
  close(): void;
}

type DatabaseConstructor = new (path: string, options?: Record<string, unknown>) => Database;

const require = createRequire(import.meta.url);
const DatabaseClass = require("better-sqlite3") as DatabaseConstructor;

export function metadataIndexPath(dataDir: string, workspaceCacheKey: string): string {
  return join(dataDir, "index", workspaceCacheKey, "catalog.sqlite");
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function rowNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export class MetadataIndexRepository {
  readonly path: string;
  #database: Database | null = null;
  #detectedStatus: "missing" | "ready" | "stale" | "corrupt";

  constructor(path: string) {
    this.path = path;
    this.#detectedStatus = existsSync(path) ? this.#inspectExisting() : "missing";
  }

  #inspectExisting(): "ready" | "stale" | "corrupt" {
    try {
      this.#database = new DatabaseClass(this.path);
      const integrity = this.#database.pragma("integrity_check") as Array<Record<string, unknown>>;
      if (!Array.isArray(integrity) || integrity.some((row) => !Object.values(row).includes("ok"))) throw new Error("integrity check failed");
      const metadata = this.#database.prepare("SELECT schema_version, status FROM index_metadata WHERE singleton = 1").get();
      if (!metadata || metadata.schema_version !== INDEX_SCHEMA_VERSION) return "stale";
      return metadata.status === "ready" ? "ready" : "stale";
    } catch {
      try { this.#database?.close(); } catch { /* invalid handles are discarded */ }
      this.#database = null;
      return "corrupt";
    }
  }

  #readyDatabase(): Database {
    if (this.#detectedStatus !== "ready" || !this.#database) throw new Error("metadata index is not ready");
    return this.#database;
  }

  #createSchema(database: Database, rebuiltAt: string): void {
    database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE index_metadata (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        schema_version INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ready', 'stale')),
        rebuilt_at TEXT,
        stale_reason TEXT
      );
      CREATE TABLE dossiers (
        dossier_id TEXT PRIMARY KEY,
        revision INTEGER NOT NULL,
        name TEXT NOT NULL,
        type_name TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        document_count INTEGER NOT NULL,
        dossier_ref TEXT NOT NULL,
        search_text TEXT NOT NULL
      );
      CREATE INDEX dossiers_name_idx ON dossiers(name COLLATE NOCASE, dossier_id);
    `);
    database.prepare("INSERT INTO index_metadata(singleton, schema_version, status, rebuilt_at, stale_reason) VALUES (1, ?, 'ready', ?, NULL)")
      .run(INDEX_SCHEMA_VERSION, rebuiltAt);
  }

  status(): MetadataIndexStatus {
    if (this.#detectedStatus === "missing" || this.#detectedStatus === "corrupt") {
      return { status: this.#detectedStatus, schemaVersion: null, dossierCount: 0, documentCount: 0, rebuiltAt: null, staleReason: this.#detectedStatus === "corrupt" ? "integrity_check_failed" : null };
    }
    try {
      const database = this.#database!;
      const metadata = database.prepare("SELECT schema_version, status, rebuilt_at, stale_reason FROM index_metadata WHERE singleton = 1").get()!;
      const counts = database.prepare("SELECT COUNT(*) AS dossier_count, COALESCE(SUM(document_count), 0) AS document_count FROM dossiers").get()!;
      return {
        status: metadata.status === "ready" ? "ready" : "stale",
        schemaVersion: rowNumber(metadata.schema_version),
        dossierCount: rowNumber(counts.dossier_count),
        documentCount: rowNumber(counts.document_count),
        rebuiltAt: typeof metadata.rebuilt_at === "string" ? metadata.rebuilt_at : null,
        staleReason: typeof metadata.stale_reason === "string" ? metadata.stale_reason : null,
      };
    } catch {
      this.#detectedStatus = "corrupt";
      return { status: "corrupt", schemaVersion: null, dossierCount: 0, documentCount: 0, rebuiltAt: null, staleReason: "metadata_read_failed" };
    }
  }

  rebuild(entries: MetadataIndexEntry[], rebuiltAt: string): void {
    this.close();
    mkdirSync(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.rebuild-${process.pid}-${Date.now()}`;
    const previousPath = `${this.path}.previous`;
    for (const suffix of ["", "-wal", "-shm"]) rmSync(`${temporaryPath}${suffix}`, { force: true });
    const database = new DatabaseClass(temporaryPath);
    try {
      this.#createSchema(database, rebuiltAt);
      const insert = database.prepare(`
        INSERT INTO dossiers(dossier_id, revision, name, type_name, tags_json, document_count, dossier_ref, search_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const replace = database.transaction((values: MetadataIndexEntry[]) => {
        for (const entry of values) insert.run(entry.dossierId, entry.revision, entry.name, entry.typeName, JSON.stringify(entry.tags), entry.documentCount, entry.dossierRef, entry.searchText);
      });
      replace(entries);
      const integrity = database.pragma("integrity_check") as Array<Record<string, unknown>>;
      if (!Array.isArray(integrity) || integrity.some((row) => !Object.values(row).includes("ok"))) throw new Error("rebuilt index integrity check failed");
      database.close();
    } catch (error) {
      try { database.close(); } catch { /* original error wins */ }
      for (const suffix of ["", "-wal", "-shm"]) rmSync(`${temporaryPath}${suffix}`, { force: true });
      this.#detectedStatus = existsSync(this.path) ? this.#inspectExisting() : "missing";
      throw error;
    }
    try {
      rmSync(previousPath, { force: true });
      for (const suffix of ["-wal", "-shm"]) rmSync(`${this.path}${suffix}`, { force: true });
      if (existsSync(this.path)) renameSync(this.path, previousPath);
      renameSync(temporaryPath, this.path);
      rmSync(previousPath, { force: true });
      this.#database = new DatabaseClass(this.path);
      this.#detectedStatus = "ready";
    } catch (error) {
      if (!existsSync(this.path) && existsSync(previousPath)) renameSync(previousPath, this.path);
      for (const suffix of ["", "-wal", "-shm"]) rmSync(`${temporaryPath}${suffix}`, { force: true });
      this.#detectedStatus = existsSync(this.path) ? this.#inspectExisting() : "corrupt";
      throw error;
    }
  }

  upsert(entry: MetadataIndexEntry): void {
    this.#readyDatabase().prepare(`
      INSERT INTO dossiers(dossier_id, revision, name, type_name, tags_json, document_count, dossier_ref, search_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(dossier_id) DO UPDATE SET
        revision = excluded.revision, name = excluded.name, type_name = excluded.type_name,
        tags_json = excluded.tags_json, document_count = excluded.document_count,
        dossier_ref = excluded.dossier_ref, search_text = excluded.search_text
    `).run(entry.dossierId, entry.revision, entry.name, entry.typeName, JSON.stringify(entry.tags), entry.documentCount, entry.dossierRef, entry.searchText);
  }

  delete(dossierId: string): void {
    this.#readyDatabase().prepare("DELETE FROM dossiers WHERE dossier_id = ?").run(dossierId);
  }

  markStale(reason: string): void {
    try {
      this.#readyDatabase().prepare("UPDATE index_metadata SET status = 'stale', stale_reason = ? WHERE singleton = 1").run(reason.slice(0, 120));
      this.#detectedStatus = "stale";
    } catch {
      this.#detectedStatus = "corrupt";
    }
  }

  search(input: { query: string; limit: number; cursor?: string }): MetadataIndexEntry[] {
    const database = this.#readyDatabase();
    const query = normalizeQuery(input.query);
    const pattern = `%${escapeLike(query)}%`;
    const rows = database.prepare(`
      SELECT dossier_id, revision, name, type_name, tags_json, document_count, dossier_ref, search_text
      FROM dossiers
      WHERE dossier_id > ? AND (? = '' OR search_text LIKE ? ESCAPE '\\')
      ORDER BY dossier_id ASC
      LIMIT ?
    `).all(input.cursor ?? "", query, pattern, input.limit);
    return rows.map((row) => ({
      dossierId: String(row.dossier_id), revision: rowNumber(row.revision), name: String(row.name), typeName: String(row.type_name),
      tags: JSON.parse(String(row.tags_json)) as string[], documentCount: rowNumber(row.document_count), dossierRef: String(row.dossier_ref), searchText: String(row.search_text),
    }));
  }

  queryPlan(): string[] {
    if (this.#detectedStatus !== "ready" || !this.#database) return [];
    return this.#database.prepare("EXPLAIN QUERY PLAN SELECT dossier_id FROM dossiers WHERE dossier_id > ? AND search_text LIKE ? ORDER BY dossier_id LIMIT ?")
      .all("", "%example%", 20)
      .map((row) => String(row.detail ?? ""));
  }

  databaseBytes(): number {
    try { return statSync(this.path).size; } catch { return 0; }
  }

  close(): void {
    try { this.#database?.close(); } finally { this.#database = null; }
  }
}
