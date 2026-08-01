import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  createKnowledgeWorkspaceError,
} from "../../shared/knowledge-workspace-errors.ts";

export const KNOWLEDGE_INDEX_SCHEMA_VERSION = 1;
export const KNOWLEDGE_INDEX_ROOT = path.join(
  "knowledge-workspace",
  "index",
  "v1",
);
export const KNOWLEDGE_INDEX_BUILD_RETENTION_MS = 24 * 60 * 60 * 1_000;
export const KNOWLEDGE_INDEX_WRITER_HEARTBEAT_MS = 10_000;
export const KNOWLEDGE_INDEX_SAME_HOST_STALE_MS = 60_000;

const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const ARTIFACT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MANIFEST_FILE = "current.json";
const WRITER_LOCK_DIRECTORY = "writer.lock";
const META_KEYS = Object.freeze([
  "schema_version",
  "generation_id",
  "source_fingerprint",
  "created_at_ms",
  "last_complete_sequence",
  "extractor_contract_version",
]);

export type KnowledgeIndexHealth =
  | { state: "ready"; generationId: string; sequence: number }
  | {
    state: "building";
    generationId?: string;
    rebuildId: string;
    progress: number;
  }
  | { state: "stale"; generationId: string; reason: string }
  | { state: "degraded"; generationId: string; reason: string }
  | { state: "corrupt"; generationId?: string; reason: string }
  | { state: "locked"; generationId?: string; ownerHint: string }
  | { state: "unavailable"; reason: string };

export type KnowledgeIndexManifest = Readonly<{
  schemaVersion: 1;
  generationId: string;
  sourceFingerprint: string;
  createdAtMs: number;
  lastCompleteSequence: number;
  extractorContractVersion: string;
}>;

export type KnowledgeIndexInspection = Readonly<{
  generationId: string;
  schemaVersion: number;
  sourceFingerprint: string;
  extractorContractVersion: string;
  lastCompleteSequence: number;
  quickCheck: string;
  pragmas: Readonly<{
    foreignKeys: number;
    journalMode: string;
    synchronous: number;
    busyTimeout: number;
    tempStore: number;
  }>;
  tables: readonly string[];
  contentFtsSql: string;
  resourceCount: number;
  nonEmptyBodyFtsCount: number;
  rowCounts: Readonly<{
    resources: number;
    pages: number;
    headings: number;
    links: number;
    tags: number;
    tasks: number;
    contentFts: number;
  }>;
}>;

export type KnowledgeIndexResourceKind =
  | "page"
  | "text"
  | "image"
  | "pdf"
  | "audio"
  | "video"
  | "binary"
  | "link"
  | "unknown";

export type KnowledgeIndexContentState =
  | "indexed"
  | "metadata-only"
  | "rejected"
  | "missing";

export type KnowledgeIndexResourceDocument = Readonly<{
  resource: Readonly<{
    relativePath: string;
    parentPath: string;
    basename: string;
    extension: string;
    kind: KnowledgeIndexResourceKind;
    sizeBytes: number;
    mtimeMs: number;
    versionToken: string;
    contentState: KnowledgeIndexContentState;
    contentReason: string | null;
    indexedAtMs: number;
  }>;
  page: Readonly<{
    title: string;
    frontmatterJson: string | null;
    bodyText: string;
    bodyHash: string;
  }> | null;
  headings: readonly Readonly<{
    ordinal: number;
    level: number;
    text: string;
    slug: string;
    fromOffset: number;
    toOffset: number;
  }>[];
  links: readonly Readonly<{
    ordinal: number;
    linkKind: "wikilink" | "embed" | "markdown" | "content-ref";
    rawTarget: string;
    resolvedRelativePath: string | null;
    fragment: string | null;
    fromOffset: number;
    toOffset: number;
  }>[];
  tags: readonly Readonly<{
    tag: string;
    origin: "frontmatter" | "body";
  }>[];
  tasks: readonly Readonly<{
    ordinal: number;
    checked: boolean;
    text: string;
    fromOffset: number;
    toOffset: number;
  }>[];
  search: Readonly<{
    titleFold: string;
    pathFold: string;
    metadataFold: string;
    bodyFold: string;
  }>;
}>;

export type KnowledgeIndexIncrementalChange =
  | Readonly<{
    kind: "replace";
    document: KnowledgeIndexResourceDocument;
  }>
  | Readonly<{
    kind: "delete";
    relativePath: string;
  }>;

export type KnowledgeIndexTagQueryRow = Readonly<{
  relativePath: string;
  tag: string;
  origin: "frontmatter" | "body";
}>;

export type KnowledgeIndexLinkQueryRow = Readonly<{
  relativePath: string;
  ordinal: number;
  linkKind: "wikilink" | "embed" | "markdown" | "content-ref";
  rawTarget: string;
  resolvedRelativePath: string | null;
  fragment: string | null;
  fromOffset: number;
  toOffset: number;
}>;

export type KnowledgeIndexHeadingQueryRow = Readonly<{
  ordinal: number;
  level: number;
  text: string;
  slug: string;
  fromOffset: number;
  toOffset: number;
}>;

export type KnowledgeIndexSearchQueryRow = Readonly<{
  resourceId: number;
  relativePath: string;
  basename: string;
  kind: KnowledgeIndexResourceKind;
  title: string;
  frontmatterJson: string | null;
  bodyText: string | null;
  titleFold: string;
  pathFold: string;
  metadataFold: string;
  bodyFold: string;
}>;

export interface KnowledgeIndexFileSystem {
  mkdir(directory: string, options?: { recursive?: boolean; mode?: number }): void;
  readFile(filePath: string): Buffer;
  readPrefix(filePath: string, bytes: number): Buffer;
  writeFileFsynced(filePath: string, content: string, mode: number): void;
  rename(from: string, to: string): void;
  remove(target: string, options?: { recursive?: boolean; force?: boolean }): void;
  exists(target: string): boolean;
  stat(target: string): { size: number; mtimeMs: number; isFile(): boolean; isDirectory(): boolean };
  lstat(target: string): {
    size: number;
    mtimeMs: number;
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
  };
  readdir(directory: string): readonly {
    name: string;
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
  }[];
  fsyncFile(filePath: string): void;
  fsyncDirectory(directory: string): void;
}

export const nodeKnowledgeIndexFileSystem: KnowledgeIndexFileSystem =
  Object.freeze({
    mkdir(directory, options = {}) {
      fs.mkdirSync(directory, options);
    },
    readFile(filePath) {
      return fs.readFileSync(filePath);
    },
    readPrefix(filePath, bytes) {
      const handle = fs.openSync(filePath, fs.constants.O_RDONLY);
      try {
        const buffer = Buffer.allocUnsafe(bytes);
        const read = fs.readSync(handle, buffer, 0, bytes, 0);
        return buffer.subarray(0, read);
      } finally {
        fs.closeSync(handle);
      }
    },
    writeFileFsynced(filePath, content, mode) {
      const handle = fs.openSync(
        filePath,
        fs.constants.O_WRONLY
          | fs.constants.O_CREAT
          | fs.constants.O_TRUNC,
        mode,
      );
      try {
        fs.writeFileSync(handle, content, "utf8");
        fs.fsyncSync(handle);
      } finally {
        fs.closeSync(handle);
      }
    },
    rename(from, to) {
      fs.renameSync(from, to);
    },
    remove(target, options = {}) {
      fs.rmSync(target, options);
    },
    exists(target) {
      return fs.existsSync(target);
    },
    stat(target) {
      return fs.statSync(target);
    },
    lstat(target) {
      return fs.lstatSync(target);
    },
    readdir(directory) {
      return fs.readdirSync(directory, { withFileTypes: true });
    },
    fsyncFile(filePath) {
      const handle = fs.openSync(filePath, fs.constants.O_RDONLY);
      try {
        fs.fsyncSync(handle);
      } finally {
        fs.closeSync(handle);
      }
    },
    fsyncDirectory(directory) {
      let handle: number | null = null;
      try {
        handle = fs.openSync(directory, fs.constants.O_RDONLY);
        fs.fsyncSync(handle);
      } catch {
        // Windows and some filesystems reject directory handles. Every file
        // is fsynced before rename; directory fsync is the portable best effort.
      } finally {
        if (handle !== null) fs.closeSync(handle);
      }
    },
  });

type WriterLockOwner = Readonly<{
  pid: number;
  hostId: string;
  startedAt: number;
  heartbeatAt: number;
  sourceFingerprint: string;
}>;

type DatabaseLike = {
  exec(sql: string): unknown;
  pragma(sql: string, options?: { simple?: boolean }): unknown;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };
  close(): void;
  open: boolean;
};

const REBUILD_INTERNALS = new WeakMap<KnowledgeIndexRebuild, {
  database: DatabaseLike;
  writerLock: KnowledgeIndexWriterLock;
}>();
const STORE_PUBLISH = Symbol("knowledge-index-store-publish");
const STORE_CANCEL = Symbol("knowledge-index-store-cancel");
const REBUILD_ASSERT_HEALTHY = Symbol("knowledge-index-rebuild-assert-healthy");
const REBUILD_CLOSE = Symbol("knowledge-index-rebuild-close");
const REBUILD_FINISH = Symbol("knowledge-index-rebuild-finish");
const REBUILD_FINISHED = Symbol("knowledge-index-rebuild-finished");

type StoreOptions = {
  hanakoHome: string;
  workspaceFingerprint: string;
  sourceFingerprint: string;
  extractorContractVersion: string;
  hostId: string;
  pid?: number;
  now?: () => number;
  processIsAlive?: (pid: number) => boolean;
  fileSystem?: KnowledgeIndexFileSystem;
};

export class KnowledgeIndexStore {
  readonly #partitionPath: string;
  readonly #sourceFingerprint: string;
  readonly #extractorContractVersion: string;
  readonly #hostId: string;
  readonly #pid: number;
  readonly #now: () => number;
  readonly #processIsAlive: (pid: number) => boolean;
  readonly #fileSystem: KnowledgeIndexFileSystem;
  readonly #searchCandidateCache = new Map<string, readonly KnowledgeIndexSearchQueryRow[]>();
  #queryManifestCache: { manifest: KnowledgeIndexManifest; cachedAtMs: number } | null = null;
  readonly #leaseCounts = new Map<string, number>();
  #activeRebuild: KnowledgeIndexRebuild | null = null;
  #lockedOwnerHint: string | null = null;
  #degradedReason: string | null = null;

  constructor(options: StoreOptions) {
    if (!path.isAbsolute(options.hanakoHome)) {
      throw new TypeError("KnowledgeIndexStore requires absolute hanakoHome");
    }
    const workspaceFingerprint = validFingerprint(
      options.workspaceFingerprint,
      "workspaceFingerprint",
    );
    this.#sourceFingerprint = validFingerprint(
      options.sourceFingerprint,
      "sourceFingerprint",
    );
    if (
      typeof options.extractorContractVersion !== "string"
      || options.extractorContractVersion.length === 0
      || options.extractorContractVersion.length > 128
    ) {
      throw new TypeError("KnowledgeIndexStore requires extractorContractVersion");
    }
    if (
      typeof options.hostId !== "string"
      || options.hostId.length === 0
      || options.hostId.length > 128
    ) {
      throw new TypeError("KnowledgeIndexStore requires hostId");
    }
    this.#extractorContractVersion = options.extractorContractVersion;
    this.#hostId = options.hostId;
    this.#pid = options.pid ?? process.pid;
    this.#now = options.now ?? Date.now;
    this.#processIsAlive = options.processIsAlive ?? processIsAlive;
    this.#fileSystem = options.fileSystem ?? nodeKnowledgeIndexFileSystem;
    this.#partitionPath = path.join(
      options.hanakoHome,
      KNOWLEDGE_INDEX_ROOT,
      workspaceFingerprint,
      this.#sourceFingerprint,
    );
    ensureManagedDirectory(
      options.hanakoHome,
      path.relative(options.hanakoHome, this.#partitionPath),
      this.#fileSystem,
    );
    this.#cleanupAbandonedBuilds();
  }

  health(): KnowledgeIndexHealth {
    const current = this.#readCurrent();
    if (this.#activeRebuild) {
      return Object.freeze({
        state: "building" as const,
        ...(current.manifest
          ? { generationId: current.manifest.generationId }
          : {}),
        rebuildId: this.#activeRebuild.rebuildId,
        progress: this.#activeRebuild.progress,
      });
    }
    if (this.#degradedReason && current.manifest) {
      return Object.freeze({
        state: "degraded" as const,
        generationId: current.manifest.generationId,
        reason: this.#degradedReason,
      });
    }
    if (this.#lockedOwnerHint) {
      return Object.freeze({
        state: "locked" as const,
        ...(current.manifest
          ? { generationId: current.manifest.generationId }
          : {}),
        ownerHint: this.#lockedOwnerHint,
      });
    }
    const externalLockHint = this.#externalLockHint();
    if (externalLockHint) {
      return Object.freeze({
        state: "locked" as const,
        ...(current.manifest
          ? { generationId: current.manifest.generationId }
          : {}),
        ownerHint: externalLockHint,
      });
    }
    return current.health;
  }

  beginRebuild(input: {
    rebuildId: string;
    generationId: string;
    startedSequence: number;
    signal?: AbortSignal;
  }): KnowledgeIndexRebuild {
    if (this.#activeRebuild) {
      throw indexUnavailable("knowledge index rebuild is already active");
    }
    const rebuildId = validArtifactId(input.rebuildId, "rebuildId");
    const generationId = validArtifactId(input.generationId, "generationId");
    const startedSequence = validSequence(
      input.startedSequence,
      "startedSequence",
    );
    if (input.signal?.aborted) {
      throw abortError();
    }
    const writerLock = this.#acquireWriterLock();
    const buildPath = this.#buildPath(rebuildId);
    this.#safeRemove(buildPath);
    this.#safeRemove(`${buildPath}-wal`);
    this.#safeRemove(`${buildPath}-shm`);

    let database: DatabaseLike | null = null;
    try {
      database = new Database(buildPath) as unknown as DatabaseLike;
      configureDatabase(database);
      // An unpublished build is disposable on crash; NORMAL keeps each bulk
      // indexing slice responsive. Publication restores FULL before metadata
      // and checkpoint durability are asserted.
      database.pragma("synchronous = NORMAL");
      createSchema(database);
      const createdAtMs = this.#now();
      writeMeta(database, {
        schema_version: String(KNOWLEDGE_INDEX_SCHEMA_VERSION),
        generation_id: generationId,
        source_fingerprint: this.#sourceFingerprint,
        created_at_ms: String(createdAtMs),
        last_complete_sequence: String(startedSequence),
        extractor_contract_version: this.#extractorContractVersion,
      });
      const rebuild = new KnowledgeIndexRebuild({
        store: this,
        rebuildId,
        generationId,
        startedSequence,
        createdAtMs,
        database,
        writerLock,
        signal: input.signal,
      });
      this.#activeRebuild = rebuild;
      this.#lockedOwnerHint = null;
      this.#degradedReason = null;
      return rebuild;
    } catch (error) {
      try {
        database?.close();
      } catch {
        // Preserve the construction failure.
      }
      this.#safeRemove(buildPath);
      try {
        writerLock.release();
      } catch {
        this.#lockedOwnerHint = "same-host-active";
      }
      throw error;
    }
  }

  acquireQueryLease(): KnowledgeIndexQueryLease {
    const cached = this.#queryManifestCache;
    const current = cached && this.#now() - cached.cachedAtMs < 1_000
      ? { manifest: cached.manifest, databaseReadable: true }
      : this.#readCurrent();
    if (!current.manifest || !current.databaseReadable) {
      throw indexUnavailable("knowledge index generation is unavailable");
    }
    this.#queryManifestCache = {
      manifest: current.manifest,
      cachedAtMs: this.#now(),
    };
    const generationId = current.manifest.generationId;
    const generationPath = this.#generationPath(generationId);
    let database: DatabaseLike;
    try {
      database = new Database(generationPath, {
        readonly: true,
        fileMustExist: true,
      }) as unknown as DatabaseLike;
      configureDatabase(database);
    } catch {
      throw indexUnavailable("knowledge index generation is unavailable");
    }
    this.#leaseCounts.set(
      generationId,
      (this.#leaseCounts.get(generationId) ?? 0) + 1,
    );
    return new KnowledgeIndexQueryLease({
      database,
      manifest: current.manifest,
      searchCandidateCache: this.#searchCandidateCache,
      release: () => {
        const remaining = (this.#leaseCounts.get(generationId) ?? 1) - 1;
        if (remaining > 0) this.#leaseCounts.set(generationId, remaining);
        else this.#leaseCounts.delete(generationId);
      },
    });
  }

  applyIncremental(input: {
    lastCompleteSequence: number;
    changes: readonly KnowledgeIndexIncrementalChange[];
  }): void {
    this.#queryManifestCache = null;
    this.#searchCandidateCache.clear();
    if (this.#activeRebuild) {
      throw indexUnavailable(
        "knowledge index incremental update waits for active rebuild",
      );
    }
    const sequence = validSequence(
      input.lastCompleteSequence,
      "lastCompleteSequence",
    );
    if (!Array.isArray(input.changes) || input.changes.length === 0) {
      throw new TypeError("knowledge index incremental changes are required");
    }
    const beforeLock = this.#readCurrent();
    if (!beforeLock.manifest || !beforeLock.databaseReadable) {
      throw indexUnavailable("knowledge index generation is unavailable");
    }
    if (
      beforeLock.health.state !== "ready"
      && beforeLock.health.state !== "degraded"
    ) {
      throw indexUnavailable("knowledge index generation requires rebuild");
    }
    if (sequence <= beforeLock.manifest.lastCompleteSequence) return;

    const writerLock = this.#acquireWriterLock();
    let database: DatabaseLike | null = null;
    let manifestWriteAttempted = false;
    try {
      const current = this.#readCurrent();
      if (
        !current.manifest
        || !current.databaseReadable
        || current.manifest.generationId
          !== beforeLock.manifest.generationId
      ) {
        throw new Error("knowledge index generation changed before update");
      }
      if (sequence <= current.manifest.lastCompleteSequence) return;
      const generationPath = this.#generationPath(
        current.manifest.generationId,
      );
      database = new Database(generationPath, {
        fileMustExist: true,
      }) as unknown as DatabaseLike;
      configureDatabase(database);
      validateCompleteGeneration(database, this.#sourceFingerprint);
      database.exec("BEGIN IMMEDIATE");
      try {
        for (const change of input.changes) {
          applyIncrementalChange(database, change);
        }
        writeMetaValue(
          database,
          "last_complete_sequence",
          String(sequence),
        );
        const nextManifest: KnowledgeIndexManifest = Object.freeze({
          ...current.manifest,
          lastCompleteSequence: sequence,
        });
        manifestWriteAttempted = true;
        this.#writeManifest(nextManifest);
        database.exec("COMMIT");
      } catch (error) {
        try {
          database.exec("ROLLBACK");
        } catch {
          // Preserve the incremental failure.
        }
        if (manifestWriteAttempted) {
          try {
            this.#writeManifest(current.manifest);
          } catch {
            this.#degradedReason = "incremental_manifest_restore_failed";
          }
        }
        throw error;
      }
      this.#degradedReason = null;
      this.#lockedOwnerHint = null;
    } catch (error) {
      if (beforeLock.manifest) {
        this.#degradedReason = this.#degradedReason
          ?? "incremental_update_failed";
      }
      throw Object.assign(
        indexUnavailable("knowledge index incremental update failed"),
        { cause: error },
      );
    } finally {
      try {
        database?.close();
      } catch {
        this.#degradedReason = "incremental_close_failed";
      }
      try {
        writerLock.release();
      } catch {
        this.#degradedReason = "writer_lock_release_failed";
      }
    }
  }

  markDegraded(reason: string): void {
    if (
      typeof reason !== "string"
      || reason.length === 0
      || reason.length > 128
      || !/^[a-z0-9_]+$/.test(reason)
    ) {
      throw new TypeError("knowledge index degraded reason is invalid");
    }
    this.#degradedReason = reason;
  }

  clearDegraded(): void {
    this.#degradedReason = null;
  }

  cleanupObsoleteGenerations(): readonly string[] {
    const current = this.#readCurrent().manifest?.generationId;
    const candidates = this.#generationArtifacts()
      .filter((artifact) => artifact.generationId !== current)
      .sort((left, right) => right.mtimeMs - left.mtimeMs);
    const removed: string[] = [];
    for (const [index, artifact] of candidates.entries()) {
      if (
        index === 0
        || this.#now() - artifact.mtimeMs < KNOWLEDGE_INDEX_BUILD_RETENTION_MS
        || (this.#leaseCounts.get(artifact.generationId) ?? 0) > 0
      ) {
        continue;
      }
      this.#safeRemove(artifact.filePath);
      this.#safeRemove(`${artifact.filePath}-wal`);
      this.#safeRemove(`${artifact.filePath}-shm`);
      removed.push(artifact.generationId);
    }
    return Object.freeze(removed);
  }

  [STORE_PUBLISH](
    rebuild: KnowledgeIndexRebuild,
    lastCompleteSequence: number,
  ): void {
    this.#queryManifestCache = null;
    this.#searchCandidateCache.clear();
    this.#assertActive(rebuild);
    const sequence = validSequence(
      lastCompleteSequence,
      "lastCompleteSequence",
    );
    if (sequence < rebuild.startedSequence) {
      throw new TypeError("lastCompleteSequence precedes rebuild start");
    }
    rebuild[REBUILD_ASSERT_HEALTHY]();
    let publishedGenerationPath: string | null = null;
    try {
      rebuildInternals(rebuild).database.pragma("synchronous = FULL");
      writeMetaValue(
        rebuildInternals(rebuild).database,
        "last_complete_sequence",
        String(sequence),
      );
      validateCompleteGeneration(
        rebuildInternals(rebuild).database,
        this.#sourceFingerprint,
      );
      const checkpoint = checkpointTruncate(rebuildInternals(rebuild).database);
      if (checkpoint.busy !== 0 || checkpoint.log !== checkpoint.checkpointed) {
        throw new Error("knowledge index checkpoint remained busy");
      }
      validateCompleteGeneration(
        rebuildInternals(rebuild).database,
        this.#sourceFingerprint,
      );
      rebuildInternals(rebuild).database.close();
      const buildPath = this.#buildPath(rebuild.rebuildId);
      rejectRequiredSidecar(buildPath, this.#fileSystem);

      const generationPath = this.#generationPath(rebuild.generationId);
      if (this.#fileSystem.exists(generationPath)) {
        throw new Error("knowledge index generation already exists");
      }
      this.#fileSystem.rename(buildPath, generationPath);
      publishedGenerationPath = generationPath;
      this.#fileSystem.fsyncFile(generationPath);
      this.#fileSystem.fsyncDirectory(this.#partitionPath);

      const manifest: KnowledgeIndexManifest = Object.freeze({
        schemaVersion: KNOWLEDGE_INDEX_SCHEMA_VERSION,
        generationId: rebuild.generationId,
        sourceFingerprint: this.#sourceFingerprint,
        createdAtMs: rebuild.createdAtMs,
        lastCompleteSequence: sequence,
        extractorContractVersion: this.#extractorContractVersion,
      });
      this.#writeManifest(manifest);
    } catch (error) {
      rebuild[REBUILD_CLOSE]();
      if (publishedGenerationPath) this.#safeRemove(publishedGenerationPath);
      const buildPath = this.#buildPath(rebuild.rebuildId);
      this.#safeRemove(buildPath);
      this.#safeRemove(`${buildPath}-wal`);
      this.#safeRemove(`${buildPath}-shm`);
      rebuild[REBUILD_FINISH]();
      this.#activeRebuild = null;
      try {
        rebuildInternals(rebuild).writerLock.release();
      } catch {
        this.#lockedOwnerHint = "same-host-active";
      }
      throw Object.assign(
        indexUnavailable(
          "knowledge index rebuild publication failed",
          publicationFailureState(error),
        ),
        { cause: error },
      );
    }
    rebuild[REBUILD_FINISH]();
    this.#activeRebuild = null;
    this.#lockedOwnerHint = null;
    try {
      rebuildInternals(rebuild).writerLock.release();
    } catch {
      this.#degradedReason = "writer_lock_release_failed";
    }
    this.cleanupObsoleteGenerations();
  }

  [STORE_CANCEL](rebuild: KnowledgeIndexRebuild): void {
    if (rebuild[REBUILD_FINISHED]()) return;
    rebuild[REBUILD_CLOSE]();
    const buildPath = this.#buildPath(rebuild.rebuildId);
    this.#safeRemove(buildPath);
    this.#safeRemove(`${buildPath}-wal`);
    this.#safeRemove(`${buildPath}-shm`);
    rebuild[REBUILD_FINISH]();
    if (this.#activeRebuild === rebuild) this.#activeRebuild = null;
    try {
      rebuildInternals(rebuild).writerLock.release();
    } catch {
      this.#lockedOwnerHint = "same-host-active";
    }
  }

  #assertActive(rebuild: KnowledgeIndexRebuild): void {
    if (rebuild[REBUILD_FINISHED]() || this.#activeRebuild !== rebuild) {
      throw new Error("knowledge index rebuild is not active");
    }
  }

  #readCurrent(): {
    manifest: KnowledgeIndexManifest | null;
    databaseReadable: boolean;
    health: KnowledgeIndexHealth;
  } {
    const manifestPath = path.join(this.#partitionPath, MANIFEST_FILE);
    if (!this.#fileSystem.exists(manifestPath)) {
      return {
        manifest: null,
        databaseReadable: false,
        health: Object.freeze({
          state: "unavailable",
          reason: "no_ready_generation",
        }),
      };
    }
    let manifest: KnowledgeIndexManifest;
    try {
      const manifestStat = this.#fileSystem.lstat(manifestPath);
      if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
        throw new TypeError("manifest is not a regular file");
      }
      manifest = parseManifest(
        JSON.parse(this.#fileSystem.readFile(manifestPath).toString("utf8")),
        this.#sourceFingerprint,
      );
    } catch {
      return {
        manifest: null,
        databaseReadable: false,
        health: Object.freeze({
          state: "corrupt",
          reason: "manifest_invalid",
        }),
      };
    }
    const generationPath = this.#generationPath(manifest.generationId);
    let database: DatabaseLike | null = null;
    try {
      const generationStat = this.#fileSystem.lstat(generationPath);
      if (!generationStat.isFile() || generationStat.isSymbolicLink()) {
        throw new Error("generation is not a regular file");
      }
      validateWalSidecar(generationPath, this.#fileSystem);
      database = new Database(generationPath, {
        readonly: true,
        fileMustExist: true,
      }) as unknown as DatabaseLike;
      configureDatabase(database);
      const quickCheck = String(
        database.pragma("quick_check", { simple: true }),
      );
      if (quickCheck !== "ok") throw new Error("quick check failed");
      const meta = readMeta(database);
      if (
        meta.source_fingerprint !== this.#sourceFingerprint
        || meta.generation_id !== manifest.generationId
        || Number(meta.created_at_ms) !== manifest.createdAtMs
        || Number(meta.last_complete_sequence) !== manifest.lastCompleteSequence
      ) {
        throw new Error("generation identity mismatch");
      }
      const schemaVersion = Number(meta.schema_version);
      if (
        schemaVersion !== KNOWLEDGE_INDEX_SCHEMA_VERSION
        || manifest.schemaVersion !== KNOWLEDGE_INDEX_SCHEMA_VERSION
      ) {
        return {
          manifest,
          databaseReadable: true,
          health: Object.freeze({
            state: "stale",
            generationId: manifest.generationId,
            reason: "schema_version_mismatch",
          }),
        };
      }
      try {
        validateSchema(database);
      } catch {
        return {
          manifest,
          databaseReadable: true,
          health: Object.freeze({
            state: "stale",
            generationId: manifest.generationId,
            reason: "schema_contract_mismatch",
          }),
        };
      }
      if (
        meta.extractor_contract_version !== this.#extractorContractVersion
        || manifest.extractorContractVersion !== this.#extractorContractVersion
      ) {
        return {
          manifest,
          databaseReadable: true,
          health: Object.freeze({
            state: "stale",
            generationId: manifest.generationId,
            reason: "extractor_contract_mismatch",
          }),
        };
      }
      return {
        manifest,
        databaseReadable: true,
        health: Object.freeze({
          state: "ready",
          generationId: manifest.generationId,
          sequence: Number(meta.last_complete_sequence),
        }),
      };
    } catch {
      return {
        manifest,
        databaseReadable: false,
        health: Object.freeze({
          state: "corrupt",
          generationId: manifest.generationId,
          reason: "generation_integrity_failed",
        }),
      };
    } finally {
      try {
        database?.close();
      } catch {
        // Health reports a stable state without surfacing raw SQLite details.
      }
    }
  }

  #writeManifest(manifest: KnowledgeIndexManifest): void {
    const temporary = path.join(this.#partitionPath, "current.json.tmp");
    const target = path.join(this.#partitionPath, MANIFEST_FILE);
    try {
      this.#safeRemove(temporary);
      this.#fileSystem.writeFileFsynced(
        temporary,
        `${JSON.stringify(manifest, null, 2)}\n`,
        0o600,
      );
      this.#fileSystem.rename(temporary, target);
      this.#fileSystem.fsyncDirectory(this.#partitionPath);
    } catch (error) {
      this.#safeRemove(temporary);
      throw error;
    }
  }

  #acquireWriterLock(): KnowledgeIndexWriterLock {
    const lockPath = path.join(this.#partitionPath, WRITER_LOCK_DIRECTORY);
    const ownerPath = path.join(lockPath, "owner.json");
    const now = this.#now();
    const owner: WriterLockOwner = Object.freeze({
      pid: this.#pid,
      hostId: this.#hostId,
      startedAt: now,
      heartbeatAt: now,
      sourceFingerprint: this.#sourceFingerprint,
    });
    const create = () => {
      this.#fileSystem.mkdir(lockPath, { mode: 0o700 });
      try {
        this.#fileSystem.writeFileFsynced(
          ownerPath,
          `${JSON.stringify(owner, null, 2)}\n`,
          0o600,
        );
        this.#fileSystem.fsyncDirectory(lockPath);
        this.#fileSystem.fsyncDirectory(this.#partitionPath);
      } catch (error) {
        this.#safeRemove(lockPath, true);
        throw error;
      }
      return new KnowledgeIndexWriterLock({
        lockPath,
        owner,
        now: this.#now,
        fileSystem: this.#fileSystem,
      });
    };
    try {
      const lock = create();
      this.#lockedOwnerHint = null;
      return lock;
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
    }

    let lockStat: ReturnType<KnowledgeIndexFileSystem["lstat"]>;
    try {
      lockStat = this.#fileSystem.lstat(lockPath);
    } catch {
      this.#lockedOwnerHint = "another-host";
      throw indexUnavailable("knowledge index writer lock is held");
    }
    if (!lockStat.isDirectory() || lockStat.isSymbolicLink()) {
      this.#lockedOwnerHint = "another-host";
      throw indexUnavailable("knowledge index writer lock is held");
    }
    const existing = readLockOwner(ownerPath, this.#fileSystem);
    const sameHost = existing?.hostId === this.#hostId;
    const activeSameHost = sameHost
      && this.#processIsAlive(existing.pid);
    const staleSameHost = sameHost
      && !activeSameHost
      && now - existing.heartbeatAt > KNOWLEDGE_INDEX_SAME_HOST_STALE_MS;
    if (staleSameHost) {
      this.#safeRemove(lockPath, true);
      try {
        const lock = create();
        this.#lockedOwnerHint = null;
        return lock;
      } catch {
        // Another process won the recovery race.
      }
    }
    this.#lockedOwnerHint = sameHost
      ? "same-host-active"
      : "another-host";
    throw indexUnavailable("knowledge index writer lock is held");
  }

  #cleanupAbandonedBuilds(): void {
    try {
      const lockStat = this.#fileSystem.lstat(
        path.join(this.#partitionPath, WRITER_LOCK_DIRECTORY),
      );
      if (lockStat.isDirectory() && !lockStat.isSymbolicLink()) return;
    } catch (error) {
      if (errorCode(error) !== "ENOENT") return;
    }
    let entries: readonly {
      name: string;
      isFile(): boolean;
      isDirectory(): boolean;
      isSymbolicLink(): boolean;
    }[];
    try {
      entries = this.#fileSystem.readdir(this.#partitionPath);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (
        entry.isSymbolicLink()
        || !entry.isFile()
        || !/^build-[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.sqlite(?:-wal|-shm)?$/.test(
          entry.name,
        )
      ) {
        continue;
      }
      const artifactPath = path.join(this.#partitionPath, entry.name);
      try {
        if (
          this.#now() - this.#fileSystem.stat(artifactPath).mtimeMs
          > KNOWLEDGE_INDEX_BUILD_RETENTION_MS
        ) {
          this.#safeRemove(artifactPath);
        }
      } catch {
        // Cleanup is opportunistic and cannot prevent an old generation read.
      }
    }
  }

  #externalLockHint(): string | null {
    const lockPath = path.join(this.#partitionPath, WRITER_LOCK_DIRECTORY);
    try {
      const lockStat = this.#fileSystem.lstat(lockPath);
      if (!lockStat.isDirectory() || lockStat.isSymbolicLink()) {
        return "another-host";
      }
      const owner = readLockOwner(
        path.join(lockPath, "owner.json"),
        this.#fileSystem,
      );
      if (!owner) return "another-host";
      return owner.hostId === this.#hostId
        ? "same-host-active"
        : "another-host";
    } catch (error) {
      if (errorCode(error) === "ENOENT") return null;
      return "another-host";
    }
  }

  #generationArtifacts(): {
    generationId: string;
    filePath: string;
    mtimeMs: number;
  }[] {
    try {
      return this.#fileSystem.readdir(this.#partitionPath)
        .filter((entry) =>
          entry.isFile()
          && !entry.isSymbolicLink()
          && /^generation-[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.sqlite$/.test(
            entry.name,
          )
        )
        .map((entry) => {
          const filePath = path.join(this.#partitionPath, entry.name);
          return {
            generationId: entry.name.slice(
              "generation-".length,
              -".sqlite".length,
            ),
            filePath,
            mtimeMs: this.#fileSystem.stat(filePath).mtimeMs,
          };
        });
    } catch {
      return [];
    }
  }

  #buildPath(rebuildId: string): string {
    return path.join(this.#partitionPath, `build-${rebuildId}.sqlite`);
  }

  #generationPath(generationId: string): string {
    return path.join(
      this.#partitionPath,
      `generation-${validArtifactId(generationId, "generationId")}.sqlite`,
    );
  }

  #safeRemove(target: string, recursive = false): void {
    try {
      this.#fileSystem.remove(target, { recursive, force: true });
    } catch {
      // Cleanup never replaces the operation's primary result.
    }
  }
}

export class KnowledgeIndexRebuild {
  readonly rebuildId: string;
  readonly generationId: string;
  readonly startedSequence: number;
  readonly createdAtMs: number;
  readonly #store: KnowledgeIndexStore;
  readonly #signal?: AbortSignal;
  #progress = 0;
  #finished = false;

  constructor(options: {
    store: KnowledgeIndexStore;
    rebuildId: string;
    generationId: string;
    startedSequence: number;
    createdAtMs: number;
    database: DatabaseLike;
    writerLock: KnowledgeIndexWriterLock;
    signal?: AbortSignal;
  }) {
    this.#store = options.store;
    this.rebuildId = options.rebuildId;
    this.generationId = options.generationId;
    this.startedSequence = options.startedSequence;
    this.createdAtMs = options.createdAtMs;
    REBUILD_INTERNALS.set(this, {
      database: options.database,
      writerLock: options.writerLock,
    });
    this.#signal = options.signal;
  }

  get progress(): number {
    return this.#progress;
  }

  replaceResource(document: KnowledgeIndexResourceDocument): void {
    this.replaceResources([document]);
  }

  replaceResources(documents: readonly KnowledgeIndexResourceDocument[]): void {
    this[REBUILD_ASSERT_HEALTHY]();
    if (documents.length === 0) return;
    const database = rebuildInternals(this).database;
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const document of documents) {
        this[REBUILD_ASSERT_HEALTHY]();
        replaceResourceDocumentRows(database, document);
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  deleteResource(relativePath: string): void {
    this[REBUILD_ASSERT_HEALTHY]();
    const database = rebuildInternals(this).database;
    database.exec("BEGIN IMMEDIATE");
    try {
      applyIncrementalChange(database, {
        kind: "delete",
        relativePath,
      });
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  publish({ lastCompleteSequence }: {
    lastCompleteSequence: number;
  }): void {
    try {
      this[REBUILD_ASSERT_HEALTHY]();
      this.#store[STORE_PUBLISH](this, lastCompleteSequence);
    } catch (error) {
      if (errorCode(error) === "ABORT_ERR") {
        this.#store[STORE_CANCEL](this);
      }
      throw error;
    }
  }

  cancel(): void {
    this.#store[STORE_CANCEL](this);
  }

  setProgress(progress: number): void {
    if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
      throw new TypeError("knowledge index rebuild progress must be 0..1");
    }
    this.#progress = progress;
    rebuildInternals(this).writerLock.heartbeat();
  }

  [REBUILD_ASSERT_HEALTHY](): void {
    if (this.#finished) {
      throw new Error("knowledge index rebuild is already finished");
    }
    if (this.#signal?.aborted) throw abortError();
    rebuildInternals(this).writerLock.assertHealthy();
  }

  [REBUILD_CLOSE](): void {
    try {
      const database = rebuildInternals(this).database;
      if (database.open) database.close();
    } catch {
      // Preserve the publication/cancellation result.
    }
  }

  [REBUILD_FINISH](): void {
    this.#finished = true;
    this.#progress = 1;
  }

  [REBUILD_FINISHED](): boolean {
    return this.#finished;
  }
}

export class KnowledgeIndexQueryLease {
  readonly generationId: string;
  readonly #database: DatabaseLike;
  readonly #manifest: KnowledgeIndexManifest;
  readonly #release: () => void;
  readonly #searchCandidateCache: Map<string, readonly KnowledgeIndexSearchQueryRow[]> | null;
  #released = false;

  constructor(options: {
    database: DatabaseLike;
    manifest: KnowledgeIndexManifest;
    release: () => void;
    searchCandidateCache?: Map<string, readonly KnowledgeIndexSearchQueryRow[]>;
  }) {
    this.generationId = options.manifest.generationId;
    this.#database = options.database;
    this.#manifest = options.manifest;
    this.#release = options.release;
    this.#searchCandidateCache = options.searchCandidateCache ?? null;
  }

  inspect(): KnowledgeIndexInspection {
    this.#assertActive();
    const meta = readMeta(this.#database);
    const tables = this.#database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    ).all().map((row) => String((row as { name: unknown }).name));
    const fts = this.#database.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'content_fts'",
    ).get() as { sql?: unknown } | undefined;
    const rowCount = (table: string): number => Number((this.#database.prepare(
      `SELECT count(*) AS count FROM ${table}`,
    ).get() as { count: number }).count);
    const rowCounts = Object.freeze({
      resources: rowCount("resources"),
      pages: rowCount("pages"),
      headings: rowCount("headings"),
      links: rowCount("links"),
      tags: rowCount("tags"),
      tasks: rowCount("tasks"),
      contentFts: rowCount("content_fts"),
    });
    return Object.freeze({
      generationId: this.#manifest.generationId,
      schemaVersion: Number(meta.schema_version),
      sourceFingerprint: meta.source_fingerprint,
      extractorContractVersion: meta.extractor_contract_version,
      lastCompleteSequence: Number(meta.last_complete_sequence),
      quickCheck: String(
        this.#database.pragma("quick_check", { simple: true }),
      ),
      pragmas: Object.freeze(readPragmas(this.#database)),
      tables: Object.freeze(tables),
      contentFtsSql: typeof fts?.sql === "string" ? fts.sql : "",
      resourceCount: rowCounts.resources,
      nonEmptyBodyFtsCount: Number((
        this.#database.prepare(
          "SELECT count(*) AS count FROM content_fts WHERE body_fold != ''",
        ).get() as { count: number }
      ).count),
      rowCounts,
    });
  }

  queryTags(input: {
    relativePath?: string;
    tag?: string;
    limit: number;
  }): readonly KnowledgeIndexTagQueryRow[] {
    this.#assertActive();
    const rows = this.#database.prepare(`
      SELECT resources.relative_path, tags.tag, tags.origin
      FROM tags
      JOIN resources ON resources.resource_id = tags.resource_id
      WHERE (? IS NULL OR resources.relative_path = ?)
        AND (? IS NULL OR tags.tag = ?)
      ORDER BY tags.tag COLLATE BINARY, resources.relative_path, tags.origin
      LIMIT ?
    `).all(
      input.relativePath ?? null,
      input.relativePath ?? null,
      input.tag ?? null,
      input.tag ?? null,
      input.limit,
    ) as Array<Record<string, unknown>>;
    return Object.freeze(rows.map((row) => Object.freeze({
      relativePath: String(row.relative_path),
      tag: String(row.tag),
      origin: row.origin === "frontmatter" ? "frontmatter" : "body",
    })));
  }

  queryOutbound(
    relativePath: string,
    limit: number,
  ): readonly KnowledgeIndexLinkQueryRow[] {
    this.#assertActive();
    return this.#queryLinks(`
      SELECT resources.relative_path, links.ordinal, links.link_kind,
        links.raw_target, links.resolved_relative_path, links.fragment,
        links.from_offset, links.to_offset
      FROM links
      JOIN resources ON resources.resource_id = links.source_resource_id
      WHERE resources.relative_path = ?
      ORDER BY links.ordinal
      LIMIT ?
    `, relativePath, limit);
  }

  queryBacklinks(
    relativePath: string,
    limit: number,
    offset = 0,
  ): readonly KnowledgeIndexLinkQueryRow[] {
    this.#assertActive();
    return this.#queryLinks(`
      SELECT resources.relative_path, links.ordinal, links.link_kind,
        links.raw_target, links.resolved_relative_path, links.fragment,
        links.from_offset, links.to_offset
      FROM links
      JOIN resources ON resources.resource_id = links.source_resource_id
      WHERE links.resolved_relative_path = ?
      ORDER BY resources.relative_path, links.ordinal
      LIMIT ? OFFSET ?
    `, relativePath, limit, offset);
  }

  queryOutline(
    relativePath: string,
    limit: number,
  ): readonly KnowledgeIndexHeadingQueryRow[] {
    this.#assertActive();
    const rows = this.#database.prepare(`
      SELECT headings.ordinal, headings.level, headings.text, headings.slug,
        headings.from_offset, headings.to_offset
      FROM headings
      JOIN resources ON resources.resource_id = headings.resource_id
      WHERE resources.relative_path = ?
      ORDER BY headings.ordinal
      LIMIT ?
    `).all(relativePath, limit) as Array<Record<string, unknown>>;
    return Object.freeze(rows.map((row) => Object.freeze({
      ordinal: Number(row.ordinal),
      level: Number(row.level),
      text: String(row.text),
      slug: String(row.slug),
      fromOffset: Number(row.from_offset),
      toOffset: Number(row.to_offset),
    })));
  }

  querySearchCandidates(input: {
    ftsQuery: string | null;
    offset: number;
    limit: number;
    includeDisplayText?: boolean;
  }): readonly KnowledgeIndexSearchQueryRow[] {
    this.#assertActive();
    const includeDisplayText = input.includeDisplayText !== false;
    const cacheKey = includeDisplayText
      ? null
      : `${this.generationId}:${input.ftsQuery ?? "<all>"}:${input.offset}:${input.limit}`;
    if (cacheKey && this.#searchCandidateCache?.has(cacheKey)) {
      return this.#searchCandidateCache.get(cacheKey)!;
    }
    const where = input.ftsQuery === null
      ? ""
      : "WHERE content_fts MATCH ?";
    const sql = `
      SELECT resources.resource_id, resources.relative_path,
        resources.basename, resources.kind, pages.title,
        ${includeDisplayText ? "pages.frontmatter_json, pages.body_text" : "NULL AS frontmatter_json, NULL AS body_text"},
        content_fts.title_fold, content_fts.path_fold,
        content_fts.metadata_fold, content_fts.body_fold
      FROM content_fts
      JOIN resources ON resources.resource_id = content_fts.resource_id
      LEFT JOIN pages ON pages.resource_id = resources.resource_id
      ${where}
      ORDER BY resources.resource_id
      LIMIT ? OFFSET ?
    `;
    const params = input.ftsQuery === null
      ? [input.limit, input.offset]
      : [input.ftsQuery, input.limit, input.offset];
    const rows = this.#database.prepare(sql).all(
      ...params,
    ) as Array<Record<string, unknown>>;
    const result = Object.freeze(rows.map((row) => Object.freeze({
      resourceId: Number(row.resource_id),
      relativePath: String(row.relative_path),
      basename: String(row.basename),
      kind: resourceKindFromDatabase(row.kind),
      title: row.title === null ? String(row.basename) : String(row.title),
      frontmatterJson: row.frontmatter_json === null
        ? null
        : String(row.frontmatter_json),
      bodyText: row.body_text === null ? null : String(row.body_text),
      titleFold: String(row.title_fold),
      pathFold: String(row.path_fold),
      metadataFold: String(row.metadata_fold),
      bodyFold: String(row.body_fold),
    })));
    if (cacheKey && this.#searchCandidateCache) {
      this.#searchCandidateCache.set(cacheKey, result);
      while (this.#searchCandidateCache.size > 64) {
        const oldest = this.#searchCandidateCache.keys().next().value;
        if (typeof oldest !== "string") break;
        this.#searchCandidateCache.delete(oldest);
      }
    }
    return result;
  }

  querySearchDisplayText(resourceIds: readonly number[]): ReadonlyMap<number, {
    frontmatterJson: string | null;
    bodyText: string | null;
  }> {
    this.#assertActive();
    if (resourceIds.length === 0) return new Map();
    const placeholders = resourceIds.map(() => "?").join(",");
    const rows = this.#database.prepare(`
      SELECT resource_id, frontmatter_json, body_text
      FROM pages
      WHERE resource_id IN (${placeholders})
    `).all(...resourceIds) as Array<Record<string, unknown>>;
    return new Map(rows.map((row) => [
      Number(row.resource_id),
      Object.freeze({
        frontmatterJson: row.frontmatter_json === null ? null : String(row.frontmatter_json),
        bodyText: row.body_text === null ? null : String(row.body_text),
      }),
    ]));
  }

  release(): void {
    if (this.#released) return;
    this.#released = true;
    try {
      this.#database.close();
    } finally {
      this.#release();
    }
  }

  #queryLinks(
    sql: string,
    relativePath: string,
    limit: number,
    offset?: number,
  ): readonly KnowledgeIndexLinkQueryRow[] {
    const statement = this.#database.prepare(sql);
    const rows = (offset === undefined
      ? statement.all(relativePath, limit)
      : statement.all(relativePath, limit, offset)) as Array<Record<string, unknown>>;
    return Object.freeze(rows.map((row) => Object.freeze({
      relativePath: String(row.relative_path),
      ordinal: Number(row.ordinal),
      linkKind: linkKindFromDatabase(row.link_kind),
      rawTarget: String(row.raw_target),
      resolvedRelativePath: row.resolved_relative_path === null
        ? null
        : String(row.resolved_relative_path),
      fragment: row.fragment === null ? null : String(row.fragment),
      fromOffset: Number(row.from_offset),
      toOffset: Number(row.to_offset),
    })));
  }

  #assertActive(): void {
    if (this.#released) {
      throw new Error("knowledge index query lease is released");
    }
  }
}

function linkKindFromDatabase(
  value: unknown,
): KnowledgeIndexLinkQueryRow["linkKind"] {
  if (
    value === "wikilink"
    || value === "embed"
    || value === "markdown"
    || value === "content-ref"
  ) {
    return value;
  }
  throw new Error("knowledge index link kind is invalid");
}

function resourceKindFromDatabase(
  value: unknown,
): KnowledgeIndexResourceKind {
  if (
    value === "page"
    || value === "text"
    || value === "image"
    || value === "pdf"
    || value === "audio"
    || value === "video"
    || value === "binary"
    || value === "link"
    || value === "unknown"
  ) {
    return value;
  }
  throw new Error("knowledge index resource kind is invalid");
}

function rebuildInternals(rebuild: KnowledgeIndexRebuild): {
  database: DatabaseLike;
  writerLock: KnowledgeIndexWriterLock;
} {
  const internals = REBUILD_INTERNALS.get(rebuild);
  if (!internals) {
    throw new Error("knowledge index rebuild internals are unavailable");
  }
  return internals;
}

class KnowledgeIndexWriterLock {
  readonly #lockPath: string;
  readonly #owner: WriterLockOwner;
  readonly #now: () => number;
  readonly #fileSystem: KnowledgeIndexFileSystem;
  readonly #timer: ReturnType<typeof setInterval>;
  #released = false;
  #failure: unknown = null;

  constructor(options: {
    lockPath: string;
    owner: WriterLockOwner;
    now: () => number;
    fileSystem: KnowledgeIndexFileSystem;
  }) {
    this.#lockPath = options.lockPath;
    this.#owner = options.owner;
    this.#now = options.now;
    this.#fileSystem = options.fileSystem;
    this.#timer = setInterval(() => {
      try {
        this.heartbeat();
      } catch (error) {
        this.#failure = error;
        clearInterval(this.#timer);
      }
    }, KNOWLEDGE_INDEX_WRITER_HEARTBEAT_MS);
    this.#timer.unref?.();
  }

  heartbeat(): void {
    if (this.#released) return;
    this.assertHealthy();
    const current = readLockOwner(
      path.join(this.#lockPath, "owner.json"),
      this.#fileSystem,
    );
    if (
      !current
      || current.pid !== this.#owner.pid
      || current.hostId !== this.#owner.hostId
      || current.startedAt !== this.#owner.startedAt
    ) {
      this.#failure = new Error("knowledge index writer lock ownership changed");
      clearInterval(this.#timer);
      this.assertHealthy();
    }
    const temporary = path.join(this.#lockPath, "owner.json.tmp");
    try {
      this.#fileSystem.remove(temporary, { force: true });
    } catch {
      // A missing temporary heartbeat is the normal path.
    }
    this.#fileSystem.writeFileFsynced(
      temporary,
      `${JSON.stringify({
        ...this.#owner,
        heartbeatAt: this.#now(),
      }, null, 2)}\n`,
      0o600,
    );
    this.#fileSystem.rename(
      temporary,
      path.join(this.#lockPath, "owner.json"),
    );
    this.#fileSystem.fsyncDirectory(this.#lockPath);
  }

  assertHealthy(): void {
    if (this.#failure) {
      throw Object.assign(
        indexUnavailable(
          "knowledge index writer heartbeat failed",
          "writer_lock_heartbeat_failed",
        ),
        { cause: this.#failure },
      );
    }
  }

  release(): void {
    if (this.#released) return;
    this.#released = true;
    clearInterval(this.#timer);
    const current = readLockOwner(
      path.join(this.#lockPath, "owner.json"),
      this.#fileSystem,
    );
    if (
      current
      && current.pid === this.#owner.pid
      && current.hostId === this.#owner.hostId
      && current.startedAt === this.#owner.startedAt
    ) {
      this.#fileSystem.remove(this.#lockPath, {
        recursive: true,
        force: true,
      });
    }
  }
}

export function foldSearchText(value: string): string {
  if (typeof value !== "string") {
    throw new TypeError("foldSearchText requires a string");
  }
  return value.normalize("NFC").toLocaleLowerCase("und");
}

function applyIncrementalChange(
  database: DatabaseLike,
  change: KnowledgeIndexIncrementalChange,
): void {
  if (!change || typeof change !== "object") {
    throw new TypeError("knowledge index incremental change is invalid");
  }
  if (change.kind === "replace") {
    validateResourceDocument(change.document);
    replaceResourceDocumentRows(database, change.document);
    return;
  }
  if (change.kind === "delete") {
    const relativePath = validateIncrementalRelativePath(change.relativePath);
    const existing = database.prepare(
      "SELECT resource_id AS resourceId FROM resources WHERE relative_path = ?",
    ).get(relativePath) as { resourceId: number } | undefined;
    if (!existing) return;
    const resourceId = Number(existing.resourceId);
    database.prepare("DELETE FROM content_fts WHERE rowid = ?").run(resourceId);
    database.prepare("DELETE FROM resources WHERE resource_id = ?").run(
      resourceId,
    );
    return;
  }
  throw new TypeError("knowledge index incremental change kind is invalid");
}

function replaceResourceDocumentRows(
  database: DatabaseLike,
  document: KnowledgeIndexResourceDocument,
): void {
  const { resource } = document;
  const existing = database.prepare(
    "SELECT resource_id AS resourceId FROM resources WHERE relative_path = ?",
  ).get(resource.relativePath) as { resourceId: number } | undefined;
  let resourceId: number;
  if (existing) {
    resourceId = Number(existing.resourceId);
    database.prepare("DELETE FROM content_fts WHERE rowid = ?").run(resourceId);
    database.prepare("DELETE FROM headings WHERE resource_id = ?").run(resourceId);
    database.prepare("DELETE FROM links WHERE source_resource_id = ?").run(resourceId);
    database.prepare("DELETE FROM tags WHERE resource_id = ?").run(resourceId);
    database.prepare("DELETE FROM tasks WHERE resource_id = ?").run(resourceId);
    database.prepare("DELETE FROM pages WHERE resource_id = ?").run(resourceId);
    database.prepare(`
        UPDATE resources
           SET parent_path = ?,
               basename = ?,
               extension = ?,
               kind = ?,
               size_bytes = ?,
               mtime_ms = ?,
               version_token = ?,
               content_state = ?,
               content_reason = ?,
               indexed_at_ms = ?
         WHERE resource_id = ?
    `).run(
      resource.parentPath,
      resource.basename,
      resource.extension,
      resource.kind,
      resource.sizeBytes,
      resource.mtimeMs,
      resource.versionToken,
      resource.contentState,
      resource.contentReason,
      resource.indexedAtMs,
      resourceId,
    );
  } else {
    const inserted = database.prepare(`
        INSERT INTO resources (
          relative_path,
          parent_path,
          basename,
          extension,
          kind,
          size_bytes,
          mtime_ms,
          version_token,
          content_state,
          content_reason,
          indexed_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      resource.relativePath,
      resource.parentPath,
      resource.basename,
      resource.extension,
      resource.kind,
      resource.sizeBytes,
      resource.mtimeMs,
      resource.versionToken,
      resource.contentState,
      resource.contentReason,
      resource.indexedAtMs,
    ) as { lastInsertRowid?: number | bigint };
    resourceId = Number(inserted.lastInsertRowid);
  }

  if (document.page) {
    database.prepare(`
        INSERT INTO pages (
          resource_id, title, frontmatter_json, body_text, body_hash
        ) VALUES (?, ?, ?, ?, ?)
    `).run(
      resourceId,
      document.page.title,
      document.page.frontmatterJson,
      document.page.bodyText,
      document.page.bodyHash,
    );
  }
  const insertHeading = database.prepare(`
      INSERT INTO headings (
        resource_id, ordinal, level, text, slug, from_offset, to_offset
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
  for (const heading of document.headings) {
    insertHeading.run(
      resourceId,
      heading.ordinal,
      heading.level,
      heading.text,
      heading.slug,
      heading.fromOffset,
      heading.toOffset,
    );
  }
  const insertLink = database.prepare(`
      INSERT INTO links (
        source_resource_id,
        ordinal,
        link_kind,
        raw_target,
        resolved_relative_path,
        fragment,
        from_offset,
        to_offset
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const link of document.links) {
    insertLink.run(
      resourceId,
      link.ordinal,
      link.linkKind,
      link.rawTarget,
      link.resolvedRelativePath,
      link.fragment,
      link.fromOffset,
      link.toOffset,
    );
  }
  const insertTag = database.prepare(`
      INSERT INTO tags (resource_id, tag, origin) VALUES (?, ?, ?)
    `);
  for (const tag of document.tags) {
    insertTag.run(resourceId, tag.tag, tag.origin);
  }
  const insertTask = database.prepare(`
      INSERT INTO tasks (
        resource_id, ordinal, checked, text, from_offset, to_offset
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
  for (const task of document.tasks) {
    insertTask.run(
      resourceId,
      task.ordinal,
      task.checked ? 1 : 0,
      task.text,
      task.fromOffset,
      task.toOffset,
    );
  }
  database.prepare(`
      INSERT INTO content_fts (
        rowid, resource_id, title_fold, path_fold, metadata_fold, body_fold
      ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    resourceId,
    resourceId,
    document.search.titleFold,
    document.search.pathFold,
    document.search.metadataFold,
    document.search.bodyFold,
  );
}

function validateIncrementalRelativePath(relativePath: string): string {
  if (
    typeof relativePath !== "string"
    || relativePath.length === 0
    || relativePath.length > 4_096
    || relativePath.includes("\\")
    || relativePath.startsWith("/")
    || relativePath.split("/").some((segment) =>
      segment.length === 0 || segment === "." || segment === ".."
    )
    || /[\p{Cc}]/u.test(relativePath)
  ) {
    throw new TypeError("knowledge index incremental relativePath is invalid");
  }
  return relativePath.normalize("NFC");
}

function validateResourceDocument(
  document: KnowledgeIndexResourceDocument,
): void {
  if (!document || typeof document !== "object") {
    throw new TypeError("knowledge index resource document is required");
  }
  const { resource } = document;
  if (
    !resource
    || typeof resource.relativePath !== "string"
    || resource.relativePath.length === 0
    || typeof resource.parentPath !== "string"
    || typeof resource.basename !== "string"
    || resource.basename.length === 0
    || typeof resource.extension !== "string"
    || typeof resource.versionToken !== "string"
    || resource.versionToken.length === 0
    || !Number.isSafeInteger(resource.sizeBytes)
    || resource.sizeBytes < 0
    || !Number.isFinite(resource.mtimeMs)
    || !Number.isSafeInteger(resource.indexedAtMs)
  ) {
    throw new TypeError("knowledge index resource metadata is invalid");
  }
  if (
    !Array.isArray(document.headings)
    || !Array.isArray(document.links)
    || !Array.isArray(document.tags)
    || !Array.isArray(document.tasks)
    || !document.search
    || Object.values(document.search).some((value) => typeof value !== "string")
  ) {
    throw new TypeError("knowledge index derived facts are invalid");
  }
  const pageContentInvalid = resource.kind === "page"
    ? resource.contentState === "indexed"
      ? document.page === null
      : document.page !== null
    : document.page !== null;
  const metadataOnlyHasDerivedContent =
    resource.contentState !== "indexed"
    && (
      document.headings.length > 0
      || document.links.length > 0
      || document.tags.length > 0
      || document.tasks.length > 0
      || document.search.bodyFold.length > 0
    );
  const nonPageHasStructure =
    resource.kind !== "page"
    && (
      document.headings.length > 0
      || document.links.length > 0
      || document.tags.length > 0
      || document.tasks.length > 0
    );
  if (pageContentInvalid || metadataOnlyHasDerivedContent || nonPageHasStructure) {
    throw new TypeError("knowledge index content state is inconsistent");
  }
}

function configureDatabase(database: DatabaseLike): void {
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = FULL");
  database.pragma("busy_timeout = 5000");
  database.pragma("temp_store = MEMORY");
  const pragmas = readPragmas(database);
  if (
    pragmas.foreignKeys !== 1
    || pragmas.journalMode !== "wal"
    || pragmas.synchronous !== 2
    || pragmas.busyTimeout !== 5000
    || pragmas.tempStore !== 2
  ) {
    throw new Error("knowledge index SQLite pragma verification failed");
  }
}

function readPragmas(database: DatabaseLike): {
  foreignKeys: number;
  journalMode: string;
  synchronous: number;
  busyTimeout: number;
  tempStore: number;
} {
  return {
    foreignKeys: Number(database.pragma("foreign_keys", { simple: true })),
    journalMode: String(database.pragma("journal_mode", { simple: true })),
    synchronous: Number(database.pragma("synchronous", { simple: true })),
    busyTimeout: Number(database.pragma("busy_timeout", { simple: true })),
    tempStore: Number(database.pragma("temp_store", { simple: true })),
  };
}

function createSchema(database: DatabaseLike): void {
  database.exec(`
    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;

    CREATE TABLE resources (
      resource_id INTEGER PRIMARY KEY,
      relative_path TEXT NOT NULL UNIQUE,
      parent_path TEXT NOT NULL,
      basename TEXT NOT NULL,
      extension TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('page','text','image','pdf','audio','video','binary','link','unknown')),
      size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
      mtime_ms INTEGER NOT NULL,
      version_token TEXT NOT NULL,
      content_state TEXT NOT NULL CHECK (content_state IN ('indexed','metadata-only','rejected','missing')),
      content_reason TEXT,
      indexed_at_ms INTEGER NOT NULL
    ) STRICT;

    CREATE INDEX resources_parent_idx ON resources(parent_path, basename);
    CREATE INDEX resources_kind_idx ON resources(kind, relative_path);

    CREATE TABLE pages (
      resource_id INTEGER PRIMARY KEY REFERENCES resources(resource_id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      frontmatter_json TEXT,
      body_text TEXT NOT NULL,
      body_hash TEXT NOT NULL
    ) STRICT;

    CREATE TABLE headings (
      resource_id INTEGER NOT NULL REFERENCES resources(resource_id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 6),
      text TEXT NOT NULL,
      slug TEXT NOT NULL,
      from_offset INTEGER NOT NULL,
      to_offset INTEGER NOT NULL,
      PRIMARY KEY (resource_id, ordinal)
    ) STRICT;

    CREATE TABLE links (
      source_resource_id INTEGER NOT NULL REFERENCES resources(resource_id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      link_kind TEXT NOT NULL CHECK (link_kind IN ('wikilink','embed','markdown','content-ref')),
      raw_target TEXT NOT NULL,
      resolved_relative_path TEXT,
      fragment TEXT,
      from_offset INTEGER NOT NULL,
      to_offset INTEGER NOT NULL,
      PRIMARY KEY (source_resource_id, ordinal)
    ) STRICT;
    CREATE INDEX links_target_idx ON links(resolved_relative_path, source_resource_id);

    CREATE TABLE tags (
      resource_id INTEGER NOT NULL REFERENCES resources(resource_id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      origin TEXT NOT NULL CHECK (origin IN ('frontmatter','body')),
      PRIMARY KEY (resource_id, tag, origin)
    ) STRICT;
    CREATE INDEX tags_value_idx ON tags(tag, resource_id);

    CREATE TABLE tasks (
      resource_id INTEGER NOT NULL REFERENCES resources(resource_id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      checked INTEGER NOT NULL CHECK (checked IN (0,1)),
      text TEXT NOT NULL,
      from_offset INTEGER NOT NULL,
      to_offset INTEGER NOT NULL,
      PRIMARY KEY (resource_id, ordinal)
    ) STRICT;

    CREATE VIRTUAL TABLE content_fts USING fts5(
      resource_id UNINDEXED,
      title_fold,
      path_fold,
      metadata_fold,
      body_fold,
      tokenize = 'trigram case_sensitive 1'
    );
  `);
}

function writeMeta(
  database: DatabaseLike,
  values: Record<(typeof META_KEYS)[number], string>,
): void {
  const insert = database.prepare(
    "INSERT INTO meta(key, value) VALUES (?, ?)",
  );
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const key of META_KEYS) insert.run(key, values[key]);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function writeMetaValue(
  database: DatabaseLike,
  key: string,
  value: string,
): void {
  const result = database.prepare(
    "UPDATE meta SET value = ? WHERE key = ?",
  ).run(value, key) as { changes?: number };
  if (result.changes !== 1) {
    throw new Error("knowledge index metadata row is missing");
  }
}

function readMeta(database: DatabaseLike): Record<string, string> {
  const rows = database.prepare(
    "SELECT key, value FROM meta ORDER BY key",
  ).all() as { key: unknown; value: unknown }[];
  const meta: Record<string, string> = Object.create(null);
  for (const row of rows) {
    if (typeof row.key !== "string" || typeof row.value !== "string") {
      throw new Error("knowledge index metadata is invalid");
    }
    meta[row.key] = row.value;
  }
  if (
    META_KEYS.some((key) => typeof meta[key] !== "string")
    || Object.keys(meta).some((key) => !META_KEYS.includes(
      key as (typeof META_KEYS)[number],
    ))
  ) {
    throw new Error("knowledge index metadata is incomplete");
  }
  return meta;
}

function validateCompleteGeneration(
  database: DatabaseLike,
  sourceFingerprint: string,
): void {
  const quickCheck = String(database.pragma("quick_check", { simple: true }));
  if (quickCheck !== "ok") {
    throw new Error("knowledge index quick check failed");
  }
  const meta = readMeta(database);
  if (
    Number(meta.schema_version) !== KNOWLEDGE_INDEX_SCHEMA_VERSION
    || meta.source_fingerprint !== sourceFingerprint
  ) {
    throw new Error("knowledge index generation metadata mismatch");
  }
  validateSchema(database);
  const resources = Number((
    database.prepare("SELECT count(*) AS count FROM resources").get() as {
      count: number;
    }
  ).count);
  const fts = Number((
    database.prepare("SELECT count(*) AS count FROM content_fts").get() as {
      count: number;
    }
  ).count);
  if (resources !== fts) {
    throw new Error("knowledge index FTS/resource row count mismatch");
  }
}

function validateSchema(database: DatabaseLike): void {
  const expectedTables = [
    "content_fts",
    "content_fts_config",
    "content_fts_content",
    "content_fts_data",
    "content_fts_docsize",
    "content_fts_idx",
    "headings",
    "links",
    "meta",
    "pages",
    "resources",
    "tags",
    "tasks",
  ];
  const expectedIndexes = [
    "links_target_idx",
    "resources_kind_idx",
    "resources_parent_idx",
    "tags_value_idx",
  ];
  const objects = database.prepare(
    `SELECT type, name, sql
       FROM sqlite_master
      WHERE name NOT LIKE 'sqlite_%'
      ORDER BY type, name`,
  ).all() as { type: unknown; name: unknown; sql: unknown }[];
  const tables = objects
    .filter((entry) => entry.type === "table")
    .map((entry) => String(entry.name))
    .sort();
  const indexes = objects
    .filter((entry) => entry.type === "index")
    .map((entry) => String(entry.name))
    .sort();
  if (
    JSON.stringify(tables) !== JSON.stringify(expectedTables)
    || JSON.stringify(indexes) !== JSON.stringify(expectedIndexes)
  ) {
    throw new Error("knowledge index schema objects mismatch");
  }

  const expectedColumns: Readonly<Record<string, readonly string[]>> = {
    meta: ["key", "value"],
    resources: [
      "resource_id",
      "relative_path",
      "parent_path",
      "basename",
      "extension",
      "kind",
      "size_bytes",
      "mtime_ms",
      "version_token",
      "content_state",
      "content_reason",
      "indexed_at_ms",
    ],
    pages: [
      "resource_id",
      "title",
      "frontmatter_json",
      "body_text",
      "body_hash",
    ],
    headings: [
      "resource_id",
      "ordinal",
      "level",
      "text",
      "slug",
      "from_offset",
      "to_offset",
    ],
    links: [
      "source_resource_id",
      "ordinal",
      "link_kind",
      "raw_target",
      "resolved_relative_path",
      "fragment",
      "from_offset",
      "to_offset",
    ],
    tags: ["resource_id", "tag", "origin"],
    tasks: [
      "resource_id",
      "ordinal",
      "checked",
      "text",
      "from_offset",
      "to_offset",
    ],
    content_fts: [
      "resource_id",
      "title_fold",
      "path_fold",
      "metadata_fold",
      "body_fold",
    ],
  };
  for (const [table, columns] of Object.entries(expectedColumns)) {
    const actual = (database.pragma(`table_info('${table}')`) as {
      name?: unknown;
    }[]).map((column) => String(column.name));
    if (JSON.stringify(actual) !== JSON.stringify(columns)) {
      throw new Error("knowledge index schema columns mismatch");
    }
  }

  const tableList = database.pragma("table_list") as {
    name?: unknown;
    strict?: unknown;
  }[];
  for (const table of [
    "meta",
    "resources",
    "pages",
    "headings",
    "links",
    "tags",
    "tasks",
  ]) {
    const definition = tableList.find((entry) => entry.name === table);
    if (Number(definition?.strict) !== 1) {
      throw new Error("knowledge index base table is not STRICT");
    }
  }

  const sqlByName = new Map(
    objects.map((entry) => [
      String(entry.name),
      typeof entry.sql === "string"
        ? entry.sql.replace(/\s+/g, " ").toLowerCase()
        : "",
    ]),
  );
  const requiredSqlFragments: Readonly<Record<string, readonly string[]>> = {
    resources: [
      "check (kind in ('page','text','image','pdf','audio','video','binary','link','unknown'))",
      "check (size_bytes >= 0)",
      "check (content_state in ('indexed','metadata-only','rejected','missing'))",
    ],
    headings: ["check (level between 1 and 6)"],
    links: [
      "check (link_kind in ('wikilink','embed','markdown','content-ref'))",
    ],
    tags: ["check (origin in ('frontmatter','body'))"],
    tasks: ["check (checked in (0,1))"],
    content_fts: ["tokenize = 'trigram case_sensitive 1'"],
  };
  for (const [name, fragments] of Object.entries(requiredSqlFragments)) {
    const sql = sqlByName.get(name) ?? "";
    if (fragments.some((fragment) => !sql.includes(fragment))) {
      throw new Error("knowledge index schema constraint mismatch");
    }
  }
}

function checkpointTruncate(database: DatabaseLike): {
  busy: number;
  log: number;
  checkpointed: number;
} {
  const rows = database.pragma("wal_checkpoint(TRUNCATE)") as {
    busy?: unknown;
    log?: unknown;
    checkpointed?: unknown;
  }[];
  const row = rows?.[0] ?? {};
  return {
    busy: Number(row.busy),
    log: Number(row.log),
    checkpointed: Number(row.checkpointed),
  };
}

function rejectRequiredSidecar(
  databasePath: string,
  fileSystem: KnowledgeIndexFileSystem,
): void {
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${databasePath}${suffix}`;
    if (!fileSystem.exists(sidecar)) continue;
    if (suffix === "-wal" && fileSystem.stat(sidecar).size > 0) {
      throw new Error("knowledge index WAL still contains publishable content");
    }
    fileSystem.remove(sidecar, { force: true });
  }
}

function validateWalSidecar(
  databasePath: string,
  fileSystem: KnowledgeIndexFileSystem,
): void {
  const walPath = `${databasePath}-wal`;
  if (!fileSystem.exists(walPath)) return;
  const walStat = fileSystem.lstat(walPath);
  if (!walStat.isFile() || walStat.isSymbolicLink()) {
    throw new Error("knowledge index WAL is not a regular file");
  }
  if (walStat.size === 0) return;
  if (walStat.size < 32) {
    throw new Error("knowledge index WAL header is incomplete");
  }
  const header = fileSystem.readPrefix(walPath, 32);
  if (header.byteLength !== 32) {
    throw new Error("knowledge index WAL header is incomplete");
  }
  const magic = header.readUInt32BE(0);
  if (magic !== 0x377f0682 && magic !== 0x377f0683) {
    throw new Error("knowledge index WAL header is invalid");
  }
  const encodedPageSize = header.readUInt32BE(8);
  const pageSize = encodedPageSize === 1 ? 65_536 : encodedPageSize;
  if (
    pageSize < 512
    || pageSize > 65_536
    || (pageSize & (pageSize - 1)) !== 0
    || (walStat.size - 32) % (pageSize + 24) !== 0
  ) {
    throw new Error("knowledge index WAL frame layout is invalid");
  }
}

function parseManifest(
  input: unknown,
  sourceFingerprint: string,
): KnowledgeIndexManifest {
  if (!isRecord(input)) throw new TypeError("invalid manifest");
  const keys = Object.keys(input).sort();
  const expected = [
    "createdAtMs",
    "extractorContractVersion",
    "generationId",
    "lastCompleteSequence",
    "schemaVersion",
    "sourceFingerprint",
  ];
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new TypeError("invalid manifest fields");
  }
  if (
    input.schemaVersion !== KNOWLEDGE_INDEX_SCHEMA_VERSION
    || validArtifactId(input.generationId, "generationId")
      !== input.generationId
    || input.sourceFingerprint !== sourceFingerprint
    || !Number.isSafeInteger(input.createdAtMs)
    || (input.createdAtMs as number) < 0
    || validSequence(input.lastCompleteSequence, "lastCompleteSequence")
      !== input.lastCompleteSequence
    || typeof input.extractorContractVersion !== "string"
    || input.extractorContractVersion.length === 0
    || input.extractorContractVersion.length > 128
  ) {
    throw new TypeError("invalid manifest values");
  }
  return Object.freeze({
    schemaVersion: KNOWLEDGE_INDEX_SCHEMA_VERSION,
    generationId: input.generationId as string,
    sourceFingerprint,
    createdAtMs: input.createdAtMs as number,
    lastCompleteSequence: input.lastCompleteSequence as number,
    extractorContractVersion: input.extractorContractVersion,
  });
}

function readLockOwner(
  ownerPath: string,
  fileSystem: KnowledgeIndexFileSystem,
): WriterLockOwner | null {
  try {
    const input: unknown = JSON.parse(
      fileSystem.readFile(ownerPath).toString("utf8"),
    );
    if (
      !isRecord(input)
      || !Number.isSafeInteger(input.pid)
      || (input.pid as number) <= 0
      || typeof input.hostId !== "string"
      || input.hostId.length === 0
      || !Number.isSafeInteger(input.startedAt)
      || !Number.isSafeInteger(input.heartbeatAt)
      || !FINGERPRINT_PATTERN.test(String(input.sourceFingerprint))
    ) {
      return null;
    }
    return Object.freeze({
      pid: input.pid as number,
      hostId: input.hostId,
      startedAt: input.startedAt as number,
      heartbeatAt: input.heartbeatAt as number,
      sourceFingerprint: input.sourceFingerprint as string,
    });
  } catch {
    return null;
  }
}

function ensureManagedDirectory(
  hanakoHome: string,
  relativeDirectory: string,
  fileSystem: KnowledgeIndexFileSystem,
): void {
  fileSystem.mkdir(hanakoHome, { recursive: true, mode: 0o700 });
  const segments = relativeDirectory.split(path.sep).filter(Boolean);
  let current = hanakoHome;
  for (const segment of segments) {
    if (
      segment === "."
      || segment === ".."
      || segment.includes("/")
      || segment.includes("\\")
    ) {
      throw new TypeError("knowledge index managed directory is invalid");
    }
    current = path.join(current, segment);
    try {
      const entry = fileSystem.lstat(current);
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw indexUnavailable(
          "knowledge index managed directory is unavailable",
        );
      }
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
      try {
        fileSystem.mkdir(current, { mode: 0o700 });
      } catch (mkdirError) {
        if (errorCode(mkdirError) !== "EEXIST") throw mkdirError;
      }
      const created = fileSystem.lstat(current);
      if (!created.isDirectory() || created.isSymbolicLink()) {
        throw indexUnavailable(
          "knowledge index managed directory is unavailable",
        );
      }
    }
  }
}

function validFingerprint(value: unknown, field: string): string {
  if (typeof value !== "string" || !FINGERPRINT_PATTERN.test(value)) {
    throw new TypeError(`KnowledgeIndexStore ${field} is invalid`);
  }
  return value;
}

function validArtifactId(value: unknown, field: string): string {
  if (typeof value !== "string" || !ARTIFACT_ID_PATTERN.test(value)) {
    throw new TypeError(`knowledge index ${field} is invalid`);
  }
  return value;
}

function validSequence(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`knowledge index ${field} is invalid`);
  }
  return value as number;
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === "EPERM";
  }
}

function indexUnavailable(message: string, state?: string): Error {
  return createKnowledgeWorkspaceError(
    "knowledge_index_unavailable",
    message,
    state === undefined ? undefined : { state },
  );
}

function publicationFailureState(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("checkpoint remained busy")) return "checkpoint_busy";
  if (message.includes("WAL still contains")) return "wal_sidecar_present";
  if (errorCode(error) === "ENOSPC") return "disk_full";
  return "publication_failed";
}

function abortError(): Error {
  return Object.assign(new Error("knowledge index rebuild aborted"), {
    name: "AbortError",
    code: "ABORT_ERR",
  });
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === "string"
    ? error.code
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
