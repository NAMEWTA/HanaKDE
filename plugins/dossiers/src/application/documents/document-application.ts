import { createHash } from "node:crypto";

import type { HanaPluginResources, HanaResourceRef, HanaResourceVersion } from "@hana/plugin-runtime";

import { createStableId, isStableId } from "../../domain/ids.ts";
import { serializeJson } from "../../domain/library-schema.ts";
import { appendResourcePath, type WorkspaceTreeRef } from "../../infrastructure/workspace/resource-path.ts";
import type { WorkspaceResources } from "../../infrastructure/workspace/resource-port.ts";
import { DossiersRuntime } from "../../runtime.ts";
import { DocumentError } from "./errors.ts";
import {
  BUILTIN_DOCUMENT_CATEGORIES,
  DOCUMENT_SCHEMA_VERSION,
  type DocumentCategory,
  type DocumentCollection,
  type DocumentImportPreview,
  type DocumentImportPreviewInput,
  type DocumentPreviewItem,
  type ManagedDocumentRecord,
} from "./models.ts";

type DocumentResources = WorkspaceResources & Pick<HanaPluginResources, "copy" | "move">;

interface DocumentScope {
  resources: DocumentResources;
  workspaceRoot: WorkspaceTreeRef;
}

export interface DocumentApplicationInput {
  runtime: DossiersRuntime;
  scope: DocumentScope;
  now?: () => string;
  createId?: (kind: "document" | "operation") => string;
}

interface DossierAuthority {
  kind: "hana.dossiers.dossier";
  schemaVersion: number;
  id: string;
  name: string;
  typeId: string;
  fields: Record<string, unknown>;
  tags: string[];
  contacts: unknown[];
  documents: ManagedDocumentRecord[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  extensions: Record<string, unknown>;
}

interface LoadedDossier {
  value: DossierAuthority;
  version: HanaResourceVersion;
}

type FileRef = Extract<HanaResourceRef, { kind: "mount" | "local-file" | "session-file" | "resource" | "url" }>;

interface PlannedSource extends DocumentPreviewItem {
  sourceRef: FileRef;
  sourceVersion: HanaResourceVersion | null;
  documentId: string;
}

interface SourceFile {
  ref: FileRef;
  logicalPath: string;
  name: string;
  content: Uint8Array;
  version: HanaResourceVersion | null;
}

interface StoredPreview extends DocumentImportPreview {
  workspaceKey: string;
  state: "planned" | "cancelled" | "completed";
  planned: PlannedSource[];
  result?: DocumentCollection;
}

const PREVIEWS = new Map<string, StoredPreview>();
const MUTATION_TAILS = new Map<string, Promise<void>>();
const CATEGORY_ID = /^[a-z][a-z0-9_-]{1,63}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_FILES = 1000;
const DOSSIER_PREFIX = "Dossiers/dossiers";

function workspaceKey(root: WorkspaceTreeRef): string {
  return root.kind === "mount" ? `mount:${root.mountId}:${root.path}` : `local:${root.path}`;
}

function dossierPath(id: string): string {
  return `${DOSSIER_PREFIX}/${id}/dossier.json`;
}

function dossierRoot(id: string): string {
  return `${DOSSIER_PREFIX}/${id}`;
}

function operationPath(id: string): string {
  return `Dossiers/.system/operations/${id}.document.json`;
}

function stagingRoot(id: string): string {
  return `Dossiers/.system/staging/${id}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function containsControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const point = character.codePointAt(0);
    return point !== undefined && (point <= 0x1f || point === 0x7f);
  });
}

function safeSegments(value: string): string[] {
  if (!value || containsControl(value)) throw new DocumentError("validation", "A safe resource path is required");
  const segments = value.replaceAll("\\", "/").split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new DocumentError("validation", "The resource path contains an unsafe segment");
  }
  return segments;
}

function normalizedComparablePath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/\/$/, "");
  const drive = /^[A-Za-z]:\//.exec(normalized)?.[0];
  const rest = drive ? normalized.slice(drive.length) : normalized.replace(/^\//, "");
  const segments = safeSegments(rest);
  return `${drive ?? (normalized.startsWith("/") ? "/" : "")}${segments.join("/")}`;
}

function safeName(value: unknown, field = "name"): string {
  if (typeof value !== "string" || !value.trim() || value.length > 240 || containsControl(value)) {
    throw new DocumentError("validation", `${field} must be a safe file name`);
  }
  const result = value.trim();
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\")) {
    throw new DocumentError("validation", `${field} must be a safe file name`);
  }
  return result;
}

function safeCategoryId(value: unknown): string {
  if (typeof value !== "string" || !CATEGORY_ID.test(value)) {
    throw new DocumentError("validation", "categoryId must be a stable lowercase key", { field: "categoryId" });
  }
  return value;
}

function safeTags(value: unknown): string[] {
  if (!Array.isArray(value)) throw new DocumentError("validation", "tags must be an array", { field: "tags" });
  const tags = value.map((tag) => {
    if (typeof tag !== "string" || !tag.trim() || tag.length > 120 || containsControl(tag)) {
      throw new DocumentError("validation", "tags contain an invalid value", { field: "tags" });
    }
    return tag.trim();
  });
  return [...new Set(tags)];
}

function positiveInteger(value: unknown, fallback: number, field: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) < 1) throw new DocumentError("validation", `${field} must be a positive integer`, { field });
  return value as number;
}

function hash(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function parseDocument(value: unknown): ManagedDocumentRecord {
  if (!isRecord(value)
    || value.kind !== "hana.dossiers.document"
    || value.schemaVersion !== DOCUMENT_SCHEMA_VERSION
    || !isStableId(value.id, "doc")
    || typeof value.name !== "string"
    || typeof value.relativePath !== "string"
    || typeof value.categoryId !== "string"
    || !Array.isArray(value.tags)
    || !Number.isInteger(value.size) || (value.size as number) < 0
    || typeof value.sha256 !== "string" || !SHA256.test(value.sha256)
    || !Number.isInteger(value.revision) || (value.revision as number) < 1
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string"
    || !isRecord(value.extensions)) {
    throw new DocumentError("resource_operation_failed", "The dossier document manifest is invalid");
  }
  let name: string;
  let categoryId: string;
  let segments: string[];
  let tags: string[];
  try {
    name = safeName(value.name);
    categoryId = safeCategoryId(value.categoryId);
    segments = safeSegments(value.relativePath);
    tags = safeTags(value.tags);
  } catch {
    throw new DocumentError("resource_operation_failed", "The dossier document manifest is invalid");
  }
  if (segments.length < 3 || segments[0] !== "documents" || segments[1] !== categoryId || segments.at(-1) !== name) {
    throw new DocumentError("resource_operation_failed", "The dossier document reference is invalid");
  }
  return {
    ...value,
    name,
    relativePath: segments.join("/"),
    categoryId,
    tags,
    extensions: clone(value.extensions),
  } as ManagedDocumentRecord;
}

function customCategories(extensions: Record<string, unknown>): DocumentCategory[] {
  const raw = extensions.documentCategories;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new DocumentError("resource_operation_failed", "The dossier document categories are invalid");
  const ids = new Set<string>();
  return raw.map((value) => {
    if (!isRecord(value) || typeof value.id !== "string" || !CATEGORY_ID.test(value.id) || typeof value.name !== "string") {
      throw new DocumentError("resource_operation_failed", "The dossier document categories are invalid");
    }
    let name: string;
    try {
      name = safeName(value.name, "category name");
    } catch {
      throw new DocumentError("resource_operation_failed", "The dossier document categories are invalid");
    }
    const category = { id: value.id, name, builtin: false };
    if (ids.has(category.id) || BUILTIN_DOCUMENT_CATEGORIES.some((item) => item.id === category.id)) {
      throw new DocumentError("resource_operation_failed", "The dossier document categories contain duplicate identities");
    }
    ids.add(category.id);
    return category;
  });
}

function parseDossier(value: unknown, expectedId: string): DossierAuthority {
  if (!isRecord(value)
    || value.kind !== "hana.dossiers.dossier"
    || value.schemaVersion !== 1
    || value.id !== expectedId
    || !isStableId(value.id, "dos")
    || typeof value.name !== "string"
    || typeof value.typeId !== "string"
    || !isRecord(value.fields)
    || !Array.isArray(value.tags)
    || !Array.isArray(value.contacts)
    || !Array.isArray(value.documents)
    || !Number.isInteger(value.revision) || (value.revision as number) < 1
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string"
    || !isRecord(value.extensions)
    || "relationships" in value) {
    throw new DocumentError("resource_operation_failed", "The dossier manifest is invalid");
  }
  const documents = value.documents.map(parseDocument);
  if (new Set(documents.map((item) => item.id)).size !== documents.length || new Set(documents.map((item) => item.relativePath)).size !== documents.length) {
    throw new DocumentError("resource_operation_failed", "The dossier contains duplicate document identities or paths");
  }
  const categories = [...BUILTIN_DOCUMENT_CATEGORIES, ...customCategories(value.extensions)];
  if (documents.some((document) => !categories.some((category) => category.id === document.categoryId))) {
    throw new DocumentError("resource_operation_failed", "A dossier document references an unknown category");
  }
  return { ...value, documents, extensions: clone(value.extensions) } as DossierAuthority;
}

function normalizeSourceRef(value: unknown): FileRef {
  if (!isRecord(value) || typeof value.kind !== "string") throw new DocumentError("validation", "A ResourceRef is required", { field: "sources" });
  if (value.kind === "mount") {
    if (typeof value.mountId !== "string" || !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(value.mountId) || typeof value.path !== "string") {
      throw new DocumentError("validation", "The mount ResourceRef is invalid", { field: "sources" });
    }
    if (value.path.startsWith("/") || value.path.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(value.path)) {
      throw new DocumentError("validation", "The mount ResourceRef path must be workspace-relative", { field: "sources" });
    }
    normalizedComparablePath(value.path);
    return { kind: "mount", mountId: value.mountId, path: value.path };
  }
  if (value.kind === "local-file") {
    if (typeof value.path !== "string") throw new DocumentError("validation", "The local ResourceRef is invalid", { field: "sources" });
    normalizedComparablePath(value.path);
    return { kind: "local-file", path: value.path };
  }
  if (value.kind === "session-file") {
    if (typeof value.fileId !== "string" || !value.fileId) throw new DocumentError("validation", "The session ResourceRef is invalid", { field: "sources" });
    return { kind: "session-file", fileId: value.fileId, ...(typeof value.sessionId === "string" ? { sessionId: value.sessionId } : {}), ...(typeof value.sessionPath === "string" ? { sessionPath: value.sessionPath } : {}) };
  }
  if (value.kind === "resource" && typeof value.resourceId === "string" && value.resourceId) return { kind: "resource", resourceId: value.resourceId };
  if (value.kind === "url" && typeof value.url === "string" && /^https?:\/\//i.test(value.url)) return { kind: "url", url: value.url };
  throw new DocumentError("validation", "The ResourceRef kind is unsupported", { field: "sources" });
}

function refName(ref: FileRef, override?: string): string {
  if (override !== undefined) return safeName(override);
  if (ref.kind === "mount" || ref.kind === "local-file") {
    return safeName(normalizedComparablePath(ref.path).split("/").at(-1));
  }
  if (ref.kind === "session-file") return safeName(ref.sessionPath?.split(/[\\/]/).at(-1) ?? ref.fileId);
  throw new DocumentError("validation", "A display name is required for this ResourceRef", { field: "sources.name" });
}

function childRef(parent: FileRef, name: string): FileRef {
  const safe = safeName(name);
  if (parent.kind === "mount" || parent.kind === "local-file") return { ...parent, path: `${parent.path.replace(/[\\/]$/, "")}/${safe}` };
  throw new DocumentError("validation", "Directories require a mount or local ResourceRef");
}

function targetRef(scope: DocumentScope, dossierId: string, relativePath: string): WorkspaceTreeRef {
  return appendResourcePath(scope.workspaceRoot, `${dossierRoot(dossierId)}/${relativePath}`);
}

function previewKey(root: WorkspaceTreeRef, previewId: string): string {
  return `${workspaceKey(root)}:${previewId}`;
}

function splitName(name: string): { stem: string; extension: string } {
  const index = name.lastIndexOf(".");
  if (index <= 0) return { stem: name, extension: "" };
  return { stem: name.slice(0, index), extension: name.slice(index) };
}

function versionEqual(left: HanaResourceVersion | null, right: HanaResourceVersion | undefined): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export class DocumentApplication {
  readonly #runtime: DossiersRuntime;
  readonly #scope: DocumentScope;
  readonly #now: () => string;
  readonly #createId: (kind: "document" | "operation") => string;

  constructor(input: DocumentApplicationInput) {
    this.#runtime = input.runtime;
    this.#scope = input.scope;
    this.#now = input.now ?? (() => new Date().toISOString());
    this.#createId = input.createId ?? ((kind) => createStableId(kind === "document" ? "doc" : "op"));
  }

  async #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const key = workspaceKey(this.#scope.workspaceRoot);
    const previous = MUTATION_TAILS.get(key) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => lock);
    MUTATION_TAILS.set(key, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (MUTATION_TAILS.get(key) === tail) MUTATION_TAILS.delete(key);
    }
  }

  async #ready(): Promise<void> {
    const opened = await this.#runtime.openLibrary(this.#scope);
    if (opened.state !== "ready") throw new DocumentError("library_blocked", "The workspace dossier library is not writable", { state: opened.state, reason: opened.reason ?? "unknown" });
  }

  async #dossier(id: string): Promise<LoadedDossier> {
    if (!isStableId(id, "dos")) throw new DocumentError("not_found", "Dossier was not found", { entity: "dossier" });
    const ref = appendResourcePath(this.#scope.workspaceRoot, dossierPath(id));
    let stat;
    try {
      stat = await this.#scope.resources.stat(ref);
    } catch {
      throw new DocumentError("resource_operation_failed", "The dossier authority could not be inspected");
    }
    if (!stat.exists || stat.isDirectory) throw new DocumentError("not_found", "Dossier was not found", { entity: "dossier" });
    let result;
    try { result = await this.#scope.resources.read(ref); } catch { throw new DocumentError("resource_operation_failed", "The dossier authority could not be read"); }
    if (!result.version) throw new DocumentError("resource_operation_failed", "The dossier authority has no version");
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder().decode(result.content));
    } catch {
      throw new DocumentError("resource_operation_failed", "The dossier authority is not valid JSON");
    }
    return { value: parseDossier(value, id), version: result.version };
  }

  #collection(dossier: DossierAuthority): DocumentCollection {
    return {
      dossierId: dossier.id,
      revision: dossier.revision,
      categories: [...BUILTIN_DOCUMENT_CATEGORIES.map(clone), ...customCategories(dossier.extensions)],
      documents: dossier.documents.map(clone),
    };
  }

  async getDocuments(dossierId: string): Promise<DocumentCollection> {
    await this.#ready();
    return this.#collection((await this.#dossier(dossierId)).value);
  }

  async #writeDossier(loaded: LoadedDossier, next: DossierAuthority, operationId?: string): Promise<void> {
    const id = operationId ?? this.#createId("operation");
    if (!isStableId(id, "op")) throw new DocumentError("resource_operation_failed", "The operation identity is invalid");
    const repository = this.#runtime.jsonRepository(this.#scope);
    const input = { operationId: id, targetPath: dossierPath(next.id), value: next, expectedVersion: loaded.version, now: this.#now() };
    let result = await repository.write(input);
    if (result.status === "failed") {
      try {
        const current = await this.#scope.resources.read(appendResourcePath(this.#scope.workspaceRoot, dossierPath(next.id)));
        if (new TextDecoder().decode(current.content) === serializeJson(next)) result = await repository.write(input);
      } catch {
        // The stable failure below is authoritative.
      }
    }
    if (result.status === "conflict") throw new DocumentError("conflict", "The dossier changed; refresh and retry");
    if (result.status === "failed") throw new DocumentError("resource_operation_failed", "The dossier document manifest could not be published");
  }

  #assertRevision(dossier: DossierAuthority, expectedRevision: number): void {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new DocumentError("validation", "A positive expected revision is required", { field: "expectedRevision" });
    if (dossier.revision !== expectedRevision) throw new DocumentError("conflict", "The dossier changed; refresh and retry", { currentRevision: dossier.revision });
  }

  #categories(dossier: DossierAuthority): DocumentCategory[] {
    return [...BUILTIN_DOCUMENT_CATEGORIES, ...customCategories(dossier.extensions)];
  }

  #assertCategory(dossier: DossierAuthority, categoryId: unknown): string {
    const id = safeCategoryId(categoryId);
    if (!this.#categories(dossier).some((item) => item.id === id)) throw new DocumentError("validation", "The document category was not found", { field: "categoryId" });
    return id;
  }

  async #sourceFiles(ref: FileRef, overrideName: string | undefined, maxFiles: number, maxBytes: number): Promise<SourceFile[]> {
    const rootName = refName(ref, overrideName);
    let stat;
    try {
      stat = await this.#scope.resources.stat(ref);
    } catch {
      throw new DocumentError("resource_operation_failed", "The source could not be inspected");
    }
    if (!stat.exists) throw new DocumentError("not_found", "The source was not found", { entity: "source" });
    if (!stat.isDirectory) {
      if (typeof stat.version?.size === "number" && stat.version.size > maxBytes) {
        throw new DocumentError("capacity_insufficient", "The import exceeds the configured byte limit", { maxBytes });
      }
      const read = await this.#scope.resources.read(ref);
      if (read.content.byteLength > maxBytes) throw new DocumentError("capacity_insufficient", "The import exceeds the configured byte limit", { maxBytes });
      return [{ ref, logicalPath: rootName, name: rootName, content: read.content, version: read.version ?? null }];
    }
    if (ref.kind !== "mount" && ref.kind !== "local-file") throw new DocumentError("validation", "This directory ResourceRef cannot be traversed");
    const files: SourceFile[] = [];
    const walk = async (directory: FileRef, logicalDirectory: string): Promise<void> => {
      let listing;
      try {
        listing = await this.#scope.resources.list(directory);
      } catch {
        throw new DocumentError("resource_operation_failed", "The source directory could not be listed");
      }
      for (const item of [...listing.items].sort((left, right) => left.name.localeCompare(right.name))) {
        const name = safeName(item.name);
        const child = childRef(directory, name);
        const logicalPath = `${logicalDirectory}/${name}`;
        if (item.isDirectory) await walk(child, logicalPath);
        else {
          const usedBytes = files.reduce((total, file) => total + file.content.byteLength, 0);
          if (typeof item.size === "number" && usedBytes + item.size > maxBytes) {
            throw new DocumentError("capacity_insufficient", "The import exceeds the configured byte limit", { maxBytes });
          }
          const read = await this.#scope.resources.read(child);
          if (usedBytes + read.content.byteLength > maxBytes) throw new DocumentError("capacity_insufficient", "The import exceeds the configured byte limit", { maxBytes });
          files.push({ ref: child, logicalPath, name, content: read.content, version: read.version ?? null });
          if (files.length > maxFiles) throw new DocumentError("capacity_insufficient", "The import contains too many files", { maxFiles });
        }
      }
    };
    await walk(ref, rootName);
    return files;
  }

  #insideTarget(ref: FileRef, dossierId: string): string | null {
    const root = this.#scope.workspaceRoot;
    if ((ref.kind !== "mount" && ref.kind !== "local-file") || ref.kind !== root.kind) return null;
    if (ref.kind === "mount" && root.kind === "mount" && ref.mountId !== root.mountId) return null;
    const base = normalizedComparablePath(root.path || (root.kind === "local-file" ? root.path : "workspace-root"));
    const target = root.path ? `${base}/${dossierRoot(dossierId)}/` : `${dossierRoot(dossierId)}/`;
    const source = normalizedComparablePath(ref.path);
    if (!source.startsWith(target)) return null;
    const relative = source.slice(target.length);
    const segments = safeSegments(relative);
    if (segments.length < 3 || segments[0] !== "documents") return null;
    return segments.join("/");
  }

  async #availablePath(dossier: DossierAuthority, categoryId: string, logicalPath: string, sha256: string, allowExistingReference = true): Promise<{ relativePath: string; action: "copy" | "reference" }> {
    const safe = safeSegments(logicalPath).map((segment) => safeName(segment));
    const directory = safe.slice(0, -1);
    const originalName = safe.at(-1)!;
    const original = ["documents", categoryId, ...directory, originalName].join("/");
    const candidates = [original];
    const { stem, extension } = splitName(originalName);
    for (const length of [8, 12, 16, 24, 32, 64]) candidates.push(["documents", categoryId, ...directory, `${stem}--${sha256.slice(0, length)}${extension}`].join("/"));
    for (const relativePath of candidates) {
      const known = dossier.documents.find((item) => item.relativePath === relativePath);
      if (known) {
        if (allowExistingReference && known.sha256 === sha256) return { relativePath, action: "reference" };
        continue;
      }
      const stat = await this.#scope.resources.stat(targetRef(this.#scope, dossier.id, relativePath));
      if (!stat.exists) return { relativePath, action: "copy" };
      if (stat.isDirectory) continue;
      try {
        const existing = await this.#scope.resources.read(targetRef(this.#scope, dossier.id, relativePath));
        if (allowExistingReference && hash(existing.content) === sha256) return { relativePath, action: "reference" };
      } catch {
        throw new DocumentError("resource_operation_failed", "A target name conflict could not be inspected");
      }
    }
    throw new DocumentError("conflict", "A stable target name could not be allocated");
  }

  async previewImport(input: DocumentImportPreviewInput): Promise<DocumentImportPreview> {
    await this.#ready();
    if (!Array.isArray(input.sources) || input.sources.length === 0) throw new DocumentError("validation", "At least one source is required", { field: "sources" });
    const maxBytes = positiveInteger(input.maxBytes, DEFAULT_MAX_BYTES, "maxBytes");
    const maxFiles = positiveInteger(input.maxFiles, DEFAULT_MAX_FILES, "maxFiles");
    const loaded = await this.#dossier(input.dossierId);
    this.#assertRevision(loaded.value, input.expectedRevision);
    const requestedCategory = this.#assertCategory(loaded.value, input.categoryId);
    const sourceFiles: SourceFile[] = [];
    for (const source of input.sources) {
      if (!isRecord(source)) throw new DocumentError("validation", "Each source must be an object", { field: "sources" });
      const ref = normalizeSourceRef(source.ref);
      const usedBytes = sourceFiles.reduce((total, file) => total + file.content.byteLength, 0);
      sourceFiles.push(...await this.#sourceFiles(ref, source.name, maxFiles, maxBytes - usedBytes));
      if (sourceFiles.length > maxFiles) throw new DocumentError("capacity_insufficient", "The import contains too many files", { maxFiles });
    }
    if (sourceFiles.length === 0) throw new DocumentError("validation", "The selected sources contain no files", { field: "sources" });
    const totalBytes = sourceFiles.reduce((total, file) => total + file.content.byteLength, 0);
    if (totalBytes > maxBytes) throw new DocumentError("capacity_insufficient", "The import exceeds the configured byte limit", { totalBytes, maxBytes });

    const planned: PlannedSource[] = [];
    const claimedPaths = new Set<string>();
    for (const source of sourceFiles) {
      const sha256 = hash(source.content);
      const persistedDuplicate = loaded.value.documents.find((item) => item.sha256 === sha256);
      const batchDuplicate = planned.find((item) => item.sha256 === sha256 && item.action !== "duplicate");
      const internalPath = this.#insideTarget(source.ref, loaded.value.id);
      let categoryId = requestedCategory;
      let relativePath: string;
      let action: "copy" | "reference" | "duplicate";
      if (persistedDuplicate || batchDuplicate) {
        const duplicate = persistedDuplicate ?? batchDuplicate!;
        categoryId = duplicate.categoryId;
        relativePath = duplicate.relativePath;
        action = "duplicate";
      } else if (internalPath) {
        const segments = safeSegments(internalPath);
        categoryId = this.#assertCategory(loaded.value, segments[1]);
        relativePath = internalPath;
        action = "reference";
      } else {
        const available = await this.#availablePath(loaded.value, categoryId, source.logicalPath, sha256);
        relativePath = available.relativePath;
        action = available.action;
      }
      if (claimedPaths.has(relativePath) && action !== "duplicate") {
        const available = await this.#availablePath({ ...loaded.value, documents: [...loaded.value.documents, ...planned.filter((item) => item.action !== "duplicate").map((item) => ({ relativePath: item.relativePath, sha256: item.sha256 } as ManagedDocumentRecord))] }, categoryId, source.logicalPath, sha256);
        relativePath = available.relativePath;
        action = available.action;
      }
      claimedPaths.add(relativePath);
      const documentId = this.#createId("document");
      const itemId = this.#createId("operation");
      if (!isStableId(documentId, "doc") || !isStableId(itemId, "op")) throw new DocumentError("resource_operation_failed", "A document preview identity is invalid");
      planned.push({
        itemId,
        documentId,
        name: safeName(relativePath.split("/").at(-1)),
        relativePath,
        categoryId,
        action,
        size: source.content.byteLength,
        sha256,
        ...(persistedDuplicate ? { duplicateOf: persistedDuplicate.id } : batchDuplicate ? { duplicateOf: batchDuplicate.documentId } : {}),
        sourceRef: source.ref,
        sourceVersion: source.version,
      });
    }
    const previewId = this.#createId("operation");
    if (!isStableId(previewId, "op")) throw new DocumentError("resource_operation_failed", "The preview identity is invalid");
    const preview: StoredPreview = {
      previewId,
      dossierId: loaded.value.id,
      expectedRevision: loaded.value.revision,
      totalBytes,
      copyBytes: planned.filter((item) => item.action === "copy").reduce((total, item) => total + item.size, 0),
      items: planned.map(({ sourceRef: _sourceRef, sourceVersion: _sourceVersion, documentId: _documentId, ...item }) => clone(item)),
      createdAt: this.#now(),
      workspaceKey: workspaceKey(this.#scope.workspaceRoot),
      state: "planned",
      planned,
    };
    PREVIEWS.set(previewKey(this.#scope.workspaceRoot, previewId), preview);
    return clone({ previewId: preview.previewId, dossierId: preview.dossierId, expectedRevision: preview.expectedRevision, totalBytes: preview.totalBytes, copyBytes: preview.copyBytes, items: preview.items, createdAt: preview.createdAt });
  }

  cancelPreview(previewId: string): { status: "cancelled" } {
    const preview = PREVIEWS.get(previewKey(this.#scope.workspaceRoot, previewId));
    if (!preview) throw new DocumentError("not_found", "The import preview was not found", { entity: "preview" });
    if (preview.state === "completed") throw new DocumentError("conflict", "The import preview was already committed");
    preview.state = "cancelled";
    return { status: "cancelled" };
  }

  async #mkdir(relativePath: string): Promise<void> {
    const segments = safeSegments(relativePath);
    for (let index = 1; index <= segments.length; index += 1) {
      const ref = appendResourcePath(this.#scope.workspaceRoot, segments.slice(0, index).join("/"));
      const stat = await this.#scope.resources.stat(ref);
      if (!stat.exists) await this.#scope.resources.mkdir(ref);
      else if (!stat.isDirectory) throw new DocumentError("resource_operation_failed", "A required target directory is occupied by a file");
    }
  }

  async #cleanup(refs: WorkspaceTreeRef[]): Promise<void> {
    for (const ref of [...refs].reverse()) {
      try {
        const stat = await this.#scope.resources.stat(ref);
        if (stat.exists) await this.#scope.resources.delete(ref);
      } catch {
        // Unpublished staging or orphan files remain recoverable by hash on retry.
      }
    }
  }

  async #cleanupPreviewStaging(previewId: string, refs: WorkspaceTreeRef[]): Promise<void> {
    await this.#cleanup(refs);
    try {
      const root = appendResourcePath(this.#scope.workspaceRoot, stagingRoot(previewId));
      const stat = await this.#scope.resources.stat(root);
      if (stat.exists && stat.isDirectory) await this.#scope.resources.delete(root);
    } catch {
      // An empty staging directory is non-authoritative and safe to retry.
    }
  }

  async #writeOperation(id: string, state: "planned" | "completed" | "failed", targets: string[]): Promise<void> {
    const value = {
      kind: "hana.dossiers.document-operation",
      schemaVersion: 1,
      operationId: id,
      state,
      targetPaths: targets,
      updatedAt: this.#now(),
      extensions: {},
    };
    await this.#scope.resources.write(appendResourcePath(this.#scope.workspaceRoot, operationPath(id)), serializeJson(value));
  }

  async commitPreview(previewId: string, expectedRevision: number): Promise<DocumentCollection> {
    return this.#exclusive(async () => {
      await this.#ready();
      const preview = PREVIEWS.get(previewKey(this.#scope.workspaceRoot, previewId));
      if (!preview) throw new DocumentError("not_found", "The import preview was not found", { entity: "preview" });
      if (preview.state === "cancelled") throw new DocumentError("preview_cancelled", "The import preview was cancelled");
      if (preview.state === "completed" && preview.result) return clone(preview.result);
      const loaded = await this.#dossier(preview.dossierId);
      if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new DocumentError("validation", "A positive expected revision is required", { field: "expectedRevision" });
      if (preview.expectedRevision !== expectedRevision || loaded.value.revision !== preview.expectedRevision) {
        throw new DocumentError("preview_stale", "The import preview no longer matches the dossier revision", { currentRevision: loaded.value.revision });
      }
      for (const item of preview.planned) {
        let stat;
        try {
          stat = await this.#scope.resources.stat(item.sourceRef);
          if (!stat.exists || stat.isDirectory || !versionEqual(item.sourceVersion, stat.version)) throw new Error("changed");
          const current = await this.#scope.resources.read(item.sourceRef);
          if (current.content.byteLength !== item.size || hash(current.content) !== item.sha256) throw new Error("changed");
        } catch {
          throw new DocumentError("preview_stale", "A source changed after preview; preview again");
        }
      }
      const additions = preview.planned.filter((item) => item.action !== "duplicate" && !loaded.value.documents.some((document) => document.sha256 === item.sha256));
      if (additions.length === 0) {
        const unchanged = this.#collection(loaded.value);
        preview.state = "completed";
        preview.result = unchanged;
        return clone(unchanged);
      }

      const staged: WorkspaceTreeRef[] = [];
      const finalized: WorkspaceTreeRef[] = [];
      const targets = additions.map((item) => `${dossierRoot(loaded.value.id)}/${item.relativePath}`);
      try {
        await this.#writeOperation(preview.previewId, "planned", targets);
        for (const item of additions.filter((value) => value.action === "copy")) {
          const stagePath = `${stagingRoot(preview.previewId)}/${item.itemId}`;
          await this.#mkdir(stagePath.split("/").slice(0, -1).join("/"));
          const stage = appendResourcePath(this.#scope.workspaceRoot, stagePath);
          await this.#scope.resources.copy(item.sourceRef, stage);
          staged.push(stage);
          const stagedContent = await this.#scope.resources.read(stage);
          if (stagedContent.content.byteLength !== item.size || hash(stagedContent.content) !== item.sha256) {
            throw new DocumentError("resource_operation_failed", "A staged copy failed byte verification");
          }
        }
        for (const item of additions.filter((value) => value.action === "copy")) {
          const stage = appendResourcePath(this.#scope.workspaceRoot, `${stagingRoot(preview.previewId)}/${item.itemId}`);
          const final = targetRef(this.#scope, loaded.value.id, item.relativePath);
          await this.#mkdir(`${dossierRoot(loaded.value.id)}/${item.relativePath.split("/").slice(0, -1).join("/")}`);
          const finalStat = await this.#scope.resources.stat(final);
          if (finalStat.exists) {
            if (finalStat.isDirectory || hash((await this.#scope.resources.read(final)).content) !== item.sha256) {
              throw new DocumentError("conflict", "The import target changed after preview");
            }
            await this.#scope.resources.delete(stage);
          } else {
            await this.#scope.resources.move(stage, final);
            finalized.push(final);
          }
        }
        const now = this.#now();
        const documents = [...loaded.value.documents];
        for (const item of additions) {
          if (documents.some((document) => document.sha256 === item.sha256)) continue;
          documents.push({
            kind: "hana.dossiers.document",
            schemaVersion: DOCUMENT_SCHEMA_VERSION,
            id: item.documentId,
            name: item.name,
            relativePath: item.relativePath,
            categoryId: item.categoryId,
            tags: [],
            size: item.size,
            sha256: item.sha256,
            revision: 1,
            createdAt: now,
            updatedAt: now,
            extensions: {},
          });
        }
        const next: DossierAuthority = { ...loaded.value, documents, revision: loaded.value.revision + 1, updatedAt: now };
        await this.#writeDossier(loaded, next);
        preview.state = "completed";
        preview.result = this.#collection(next);
        try { await this.#writeOperation(preview.previewId, "completed", targets); } catch { /* committed manifest remains authoritative */ }
        await this.#cleanupPreviewStaging(preview.previewId, staged);
        return clone(preview.result);
      } catch (error) {
        await this.#cleanupPreviewStaging(preview.previewId, [...staged, ...finalized]);
        try { await this.#writeOperation(preview.previewId, "failed", targets); } catch { /* original failure remains authoritative */ }
        if (error instanceof DocumentError) throw error;
        throw new DocumentError("resource_operation_failed", "The document import could not be completed");
      }
    });
  }

  async createCategory(dossierId: string, expectedRevision: number, input: { id: string; name: string }): Promise<DocumentCollection> {
    return this.#exclusive(async () => {
      await this.#ready();
      const loaded = await this.#dossier(dossierId);
      this.#assertRevision(loaded.value, expectedRevision);
      const id = safeCategoryId(input.id);
      const name = safeName(input.name, "category name");
      if (this.#categories(loaded.value).some((item) => item.id === id)) throw new DocumentError("conflict", "The document category already exists");
      const extensions = clone(loaded.value.extensions);
      extensions.documentCategories = [...customCategories(extensions), { id, name, builtin: false }];
      const next = { ...loaded.value, extensions, revision: loaded.value.revision + 1, updatedAt: this.#now() };
      await this.#writeDossier(loaded, next);
      return this.#collection(next);
    });
  }

  async #moveDocument(loaded: LoadedDossier, document: ManagedDocumentRecord, categoryId: string, tags: string[]): Promise<DocumentCollection> {
    const source = targetRef(this.#scope, loaded.value.id, document.relativePath);
    const sourceContent = await this.#scope.resources.read(source);
    if (hash(sourceContent.content) !== document.sha256) throw new DocumentError("resource_operation_failed", "The managed document bytes do not match the manifest");
    const available = await this.#availablePath(loaded.value, categoryId, document.name, document.sha256, false);
    if (available.relativePath === document.relativePath) return this.#updateTagsOnly(loaded, document, tags);
    const target = targetRef(this.#scope, loaded.value.id, available.relativePath);
    await this.#mkdir(`${dossierRoot(loaded.value.id)}/${available.relativePath.split("/").slice(0, -1).join("/")}`);
    try {
      await this.#scope.resources.move(source, target);
    } catch {
      throw new DocumentError("resource_operation_failed", "The managed document could not be moved");
    }
    const updated: ManagedDocumentRecord = {
      ...document,
      name: safeName(available.relativePath.split("/").at(-1)),
      relativePath: available.relativePath,
      categoryId,
      tags,
      revision: document.revision + 1,
      updatedAt: this.#now(),
    };
    const next = {
      ...loaded.value,
      documents: loaded.value.documents.map((item) => item.id === document.id ? updated : item),
      revision: loaded.value.revision + 1,
      updatedAt: updated.updatedAt,
    };
    try {
      await this.#writeDossier(loaded, next);
      return this.#collection(next);
    } catch (error) {
      try { await this.#scope.resources.move(target, source); } catch { throw new DocumentError("resource_operation_failed", "The document move requires recovery before retry"); }
      throw error;
    }
  }

  async #updateTagsOnly(loaded: LoadedDossier, document: ManagedDocumentRecord, tags: string[]): Promise<DocumentCollection> {
    if (JSON.stringify(tags) === JSON.stringify(document.tags)) return this.#collection(loaded.value);
    const updated = { ...document, tags, revision: document.revision + 1, updatedAt: this.#now() };
    const next = {
      ...loaded.value,
      documents: loaded.value.documents.map((item) => item.id === document.id ? updated : item),
      revision: loaded.value.revision + 1,
      updatedAt: updated.updatedAt,
    };
    await this.#writeDossier(loaded, next);
    return this.#collection(next);
  }

  async updateDocument(dossierId: string, documentId: string, expectedRevision: number, patch: { categoryId?: string; tags?: string[] }): Promise<DocumentCollection> {
    return this.#exclusive(async () => {
      await this.#ready();
      if (!isRecord(patch) || Object.keys(patch).some((key) => key !== "categoryId" && key !== "tags")) throw new DocumentError("validation", "The document update is invalid");
      const loaded = await this.#dossier(dossierId);
      this.#assertRevision(loaded.value, expectedRevision);
      const document = loaded.value.documents.find((item) => item.id === documentId);
      if (!document) throw new DocumentError("not_found", "The managed document was not found", { entity: "document" });
      const tags = patch.tags === undefined ? document.tags : safeTags(patch.tags);
      const categoryId = patch.categoryId === undefined ? document.categoryId : this.#assertCategory(loaded.value, patch.categoryId);
      if (categoryId === document.categoryId) return this.#updateTagsOnly(loaded, document, tags);
      return this.#moveDocument(loaded, document, categoryId, tags);
    });
  }
}

export type { DocumentResources, DocumentScope };
