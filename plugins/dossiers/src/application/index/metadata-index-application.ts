import { createHash } from "node:crypto";

import type { HanaPluginResources } from "@hana/plugin-runtime";

import type { WorkspaceTreeRef } from "../../infrastructure/workspace/resource-path.ts";
import { IndexAuthorityReader } from "../../infrastructure/index/index-authority-reader.ts";
import { metadataIndexPath, MetadataIndexRepository, type MetadataIndexEntry } from "../../infrastructure/index/metadata-index-repository.ts";

export interface MetadataIndexApplicationInput {
  resources: Pick<HanaPluginResources, "list" | "read">;
  workspaceRoot: WorkspaceTreeRef;
  dataDir: string;
  now?: () => string;
}

export interface MetadataSearchInput { query: string; limit?: number; cursor?: string }

function workspaceCacheKey(root: WorkspaceTreeRef): string {
  const identity = root.kind === "mount" ? `mount:${root.mountId}:${root.path}` : `local:${root.path}`;
  return createHash("sha256").update(identity).digest("hex").slice(0, 24);
}

function boundedLimit(value: unknown): number {
  if (value === undefined) return 50;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 100) throw new Error("limit must be an integer from 1 to 100");
  return value as number;
}

function queryText(value: unknown): string {
  if (typeof value !== "string" || value.length > 240) throw new Error("query must be a string no longer than 240 characters");
  return value.trim().toLocaleLowerCase();
}

function matches(entry: MetadataIndexEntry, query: string, cursor?: string): boolean {
  return (!cursor || entry.dossierId > cursor) && (!query || entry.searchText.includes(query));
}

function projection(entry: MetadataIndexEntry) {
  return {
    dossierId: entry.dossierId,
    revision: entry.revision,
    name: entry.name,
    typeName: entry.typeName,
    tags: [...entry.tags],
    documentCount: entry.documentCount,
    dossierRef: entry.dossierRef,
  };
}

export class MetadataIndexApplication {
  readonly resources: Pick<HanaPluginResources, "list" | "read">;
  readonly workspaceRoot: WorkspaceTreeRef;
  readonly indexPath: string;
  readonly #reader: IndexAuthorityReader;
  readonly #repository: MetadataIndexRepository;
  readonly #now: () => string;

  constructor(input: MetadataIndexApplicationInput) {
    this.resources = input.resources;
    this.workspaceRoot = input.workspaceRoot;
    this.indexPath = metadataIndexPath(input.dataDir, workspaceCacheKey(input.workspaceRoot));
    this.#reader = new IndexAuthorityReader(input.resources, input.workspaceRoot);
    this.#repository = new MetadataIndexRepository(this.indexPath);
    this.#now = input.now ?? (() => new Date().toISOString());
  }

  async status() {
    const status = this.#repository.status();
    return { ...status, queryPlan: this.#repository.queryPlan() };
  }

  async rebuild() {
    const started = performance.now();
    const entries = await this.#reader.all();
    this.#repository.rebuild(entries, this.#now());
    return {
      status: "ready" as const,
      dossierCount: entries.length,
      documentCount: entries.reduce((total, entry) => total + entry.documentCount, 0),
      durationMs: performance.now() - started,
      databaseBytes: this.#repository.databaseBytes(),
      queryPlan: this.#repository.queryPlan(),
    };
  }

  async #fallback(input: { query: string; limit: number; cursor?: string }, stale: boolean) {
    const entries = (await this.#reader.all()).filter((entry) => matches(entry, input.query, input.cursor));
    const selected = entries.slice(0, input.limit);
    return {
      items: selected.map(projection),
      nextCursor: entries.length > input.limit ? selected.at(-1)?.dossierId ?? null : null,
      degraded: true,
      stale,
    };
  }

  async search(input: MetadataSearchInput) {
    const query = queryText(input.query);
    const limit = boundedLimit(input.limit);
    if (input.cursor !== undefined && typeof input.cursor !== "string") throw new Error("cursor must be a string");
    const status = this.#repository.status();
    if (status.status !== "ready") return this.#fallback({ query, limit, cursor: input.cursor }, status.status === "stale" || status.status === "corrupt");
    const rows = this.#repository.search({ query, limit: limit + 1, cursor: input.cursor });
    const hydrated: MetadataIndexEntry[] = [];
    let stale = false;
    for (const row of rows) {
      const authority = await this.#reader.one(row.dossierId);
      if (!authority || authority.revision !== row.revision || authority.searchText !== row.searchText) {
        stale = true;
        break;
      }
      hydrated.push(authority);
    }
    if (stale) {
      this.#repository.markStale("authority_projection_mismatch");
      return this.#fallback({ query, limit, cursor: input.cursor }, true);
    }
    const selected = hydrated.slice(0, limit);
    return {
      items: selected.map(projection),
      nextCursor: hydrated.length > limit ? selected.at(-1)?.dossierId ?? null : null,
      degraded: false,
      stale: false,
    };
  }

  async upsert(dossierId: string): Promise<{ indexed: boolean; stale: boolean }> {
    const entry = await this.#reader.one(dossierId);
    if (!entry) return { indexed: false, stale: this.#repository.status().status !== "ready" };
    try { this.#repository.upsert(entry); return { indexed: true, stale: false }; } catch { this.#repository.markStale("incremental_upsert_failed"); return { indexed: false, stale: true }; }
  }

  delete(dossierId: string): { indexed: boolean; stale: boolean } {
    try { this.#repository.delete(dossierId); return { indexed: true, stale: false }; } catch { this.#repository.markStale("incremental_delete_failed"); return { indexed: false, stale: true }; }
  }

  close(): void {
    this.#repository.close();
  }
}
