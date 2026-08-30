import { createHash } from "node:crypto";

import type { HanaPluginResources, HanaResourceRef } from "@hana/plugin-runtime";

import { CatalogApplication } from "../catalog/catalog-application.ts";
import {
  normalizedKey,
  normalizedName,
  normalizedStringList,
  validateFieldDefinitions,
  validateFieldValues,
  type ContactRecord,
  type DossierRecord,
  type DossierTypeRecord,
  type FieldDefinition,
} from "../catalog/models.ts";
import type { ManagedDocumentRecord } from "../documents/models.ts";
import { createStableId, isStableId } from "../../domain/ids.ts";
import { serializeJson } from "../../domain/library-schema.ts";
import { appendResourcePath, normalizeRelativePath, type WorkspaceTreeRef } from "../../infrastructure/workspace/resource-path.ts";
import type { DossiersRuntime } from "../../runtime.ts";
import { createZipArchive, readZipArchive, type ArchiveEntry, type ArchiveLimits } from "./archive-codec.ts";
import { ExchangeError } from "./errors.ts";
import {
  EXCHANGE_SCHEMA_VERSION,
  type DossierExchangeManifest,
  type ExportResult,
  type ImportInspection,
  type ImportResult,
} from "./models.ts";

type ExchangeResourceRef = Extract<HanaResourceRef, { kind: "mount" | "local-file" }>;
type ExchangeResources = Pick<HanaPluginResources, "stat" | "read" | "list" | "mkdir" | "write" | "writeExpectedVersion" | "delete" | "move">;

export interface ExchangeScope {
  resources: ExchangeResources;
  workspaceRoot: WorkspaceTreeRef;
}

export interface ExchangeApplicationInput {
  runtime: DossiersRuntime;
  scope: ExchangeScope;
  now?: () => string;
  createId?: (kind: "dossier" | "operation") => string;
  limits?: Partial<ArchiveLimits>;
}

interface ParsedPackage {
  manifest: DossierExchangeManifest;
  dossier: ExchangeDossier;
  type: DossierTypeRecord;
  contacts: ContactRecord[];
  entries: Map<string, Uint8Array>;
  totalBytes: number;
}

type ExchangeDossier = Omit<DossierRecord, "documents"> & { documents: ManagedDocumentRecord[] };

interface StoredPreview extends ImportInspection {
  archiveRef: ExchangeResourceRef;
  archiveSha256: string;
  state: "inspected" | "committing" | "completed";
  result?: ImportResult;
}

const PREVIEWS = new Map<string, StoredPreview>();
const MUTATION_TAILS = new Map<string, Promise<void>>();
const decoder = new TextDecoder();
const DEFAULT_LIMITS: ArchiveLimits = { maxFiles: 2_000, maxTotalBytes: 512 * 1024 * 1024, maxEntryBytes: 128 * 1024 * 1024, maxCompressionRatio: 100 };
const SHA256 = /^[a-f0-9]{64}$/;

function clone<T>(value: T): T { return structuredClone(value); }
function hash(content: Uint8Array): string { return createHash("sha256").update(content).digest("hex"); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function workspaceKey(root: WorkspaceTreeRef): string { return root.kind === "mount" ? `mount:${root.mountId}:${root.path}` : `local:${root.path}`; }
function previewKey(root: WorkspaceTreeRef, id: string): string { return `${workspaceKey(root)}:${id}`; }

function jsonEntry(entries: Map<string, Uint8Array>, path: string): unknown {
  const content = entries.get(path);
  if (!content) throw new ExchangeError("integrity_failed", `The exchange package is missing ${path}`);
  try { return JSON.parse(decoder.decode(content)); }
  catch { throw new ExchangeError("integrity_failed", `The exchange package contains invalid JSON at ${path}`); }
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new ExchangeError("integrity_failed", `${field} is invalid`);
  return [...value] as string[];
}

function parseDocument(value: unknown): ManagedDocumentRecord {
  if (!isRecord(value)
    || value.kind !== "hana.dossiers.document"
    || value.schemaVersion !== 1
    || !isStableId(value.id, "doc")
    || typeof value.name !== "string"
    || typeof value.relativePath !== "string"
    || typeof value.categoryId !== "string"
    || !Number.isInteger(value.size) || (value.size as number) < 0
    || typeof value.sha256 !== "string" || !SHA256.test(value.sha256)
    || !Number.isInteger(value.revision) || (value.revision as number) < 1
    || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string"
    || !isRecord(value.extensions)) {
    throw new ExchangeError("integrity_failed", "A managed document record is invalid");
  }
  let relativePath: string;
  try { relativePath = normalizeRelativePath(value.relativePath); }
  catch { throw new ExchangeError("unsafe_archive", "A managed document path is unsafe"); }
  if (!relativePath.startsWith("documents/")) throw new ExchangeError("unsafe_archive", "A managed document path leaves the managed root");
  return { ...clone(value), relativePath, tags: stringArray(value.tags, "document tags") } as unknown as ManagedDocumentRecord;
}

function parseDossier(value: unknown): ExchangeDossier {
  if (!isRecord(value)
    || value.kind !== "hana.dossiers.dossier"
    || value.schemaVersion !== 1
    || !isStableId(value.id, "dos")
    || typeof value.name !== "string" || !value.name.trim()
    || !isStableId(value.typeId, "typ")
    || !isRecord(value.fields)
    || !Array.isArray(value.contacts)
    || !Array.isArray(value.documents)
    || !Number.isInteger(value.revision) || (value.revision as number) < 1
    || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string"
    || !isRecord(value.extensions)
    || "relationships" in value) throw new ExchangeError("integrity_failed", "The dossier authority is invalid");
  const contacts = value.contacts.map((item) => {
    if (!isRecord(item) || !isStableId(item.contactId, "con") || typeof item.role !== "string" || !item.role.trim() || item.role.length > 120 || !isRecord(item.extensions)) {
      throw new ExchangeError("integrity_failed", "A dossier contact relation is invalid");
    }
    return { contactId: item.contactId, role: item.role.trim(), extensions: clone(item.extensions) };
  });
  if (new Set(contacts.map((relation) => relation.contactId)).size !== contacts.length) throw new ExchangeError("integrity_failed", "The dossier contains duplicate contact relations");
  const documents = value.documents.map(parseDocument);
  if (new Set(documents.map((document) => document.id)).size !== documents.length || new Set(documents.map((document) => document.relativePath)).size !== documents.length) {
    throw new ExchangeError("integrity_failed", "The dossier contains duplicate document identities or paths");
  }
  return { ...clone(value), tags: stringArray(value.tags, "dossier tags"), contacts, documents } as unknown as ExchangeDossier;
}

function parseType(value: unknown): DossierTypeRecord {
  if (!isRecord(value) || value.kind !== "hana.dossiers.dossier-type" || value.schemaVersion !== 1 || !isStableId(value.id, "typ")
    || typeof value.key !== "string" || typeof value.name !== "string" || typeof value.builtin !== "boolean" || !Array.isArray(value.fields)
    || !Number.isInteger(value.revision) || (value.revision as number) < 1
    || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string"
    || !isRecord(value.extensions)) throw new ExchangeError("integrity_failed", "The dossier type snapshot is invalid");
  try {
    const key = normalizedKey(value.key);
    const name = normalizedName(value.name);
    const fields = validateFieldDefinitions(value.fields);
    return { ...clone(value), key, name, fields, extensions: clone(value.extensions) } as unknown as DossierTypeRecord;
  } catch { throw new ExchangeError("integrity_failed", "The dossier type snapshot is invalid"); }
}

function parseContacts(value: unknown): ContactRecord[] {
  if (!Array.isArray(value)) throw new ExchangeError("integrity_failed", "The contact snapshot is invalid");
  const ids = new Set<string>();
  return value.map((item) => {
    if (!isRecord(item) || item.kind !== "hana.dossiers.contact" || item.schemaVersion !== 1 || !isStableId(item.id, "con") || ids.has(item.id)
      || typeof item.name !== "string" || !Array.isArray(item.emails) || !Array.isArray(item.phones)
      || !Number.isInteger(item.revision) || (item.revision as number) < 1
      || typeof item.createdAt !== "string" || typeof item.updatedAt !== "string"
      || !isRecord(item.extensions)) throw new ExchangeError("integrity_failed", "A contact snapshot is invalid");
    ids.add(item.id);
    try {
      const name = normalizedName(item.name);
      const emails = normalizedStringList(item.emails, "emails", 320);
      const phones = normalizedStringList(item.phones, "phones", 64);
      if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || phones.some((phone) => !/^[+()0-9][+()0-9 .-]{2,63}$/.test(phone))) throw new Error("invalid channels");
      const optional = (field: "organization" | "title" | "notes", maxLength: number): string | undefined => {
        const candidate = item[field];
        if (candidate === undefined) return undefined;
        if (typeof candidate !== "string" || candidate.length > maxLength) throw new Error("invalid text");
        return candidate.trim() || undefined;
      };
      return {
        ...clone(item), name, emails, phones,
        organization: optional("organization", 240), title: optional("title", 240), notes: optional("notes", 20_000),
        extensions: clone(item.extensions),
      } as unknown as ContactRecord;
    } catch { throw new ExchangeError("integrity_failed", "A contact snapshot is invalid"); }
  });
}

function parseManifest(value: unknown): DossierExchangeManifest {
  if (!isRecord(value) || value.kind !== "hana.dossiers.exchange" || !Number.isInteger(value.schemaVersion)) throw new ExchangeError("integrity_failed", "The exchange manifest is invalid");
  if (value.schemaVersion !== EXCHANGE_SCHEMA_VERSION) throw new ExchangeError("unsupported_schema", "The exchange schema version is not supported", { schemaVersion: value.schemaVersion });
  if (!isStableId(value.dossierId, "dos") || typeof value.exportedAt !== "string" || !Array.isArray(value.files) || !isRecord(value.extensions)) throw new ExchangeError("integrity_failed", "The exchange manifest is invalid");
  const seen = new Set<string>();
  const files = value.files.map((item) => {
    if (!isRecord(item) || typeof item.path !== "string" || typeof item.sha256 !== "string" || !SHA256.test(item.sha256)
      || !Number.isInteger(item.size) || (item.size as number) < 0 || seen.has(item.path)) throw new ExchangeError("integrity_failed", "An exchange file manifest is invalid");
    try { normalizeRelativePath(item.path); } catch { throw new ExchangeError("unsafe_archive", "An exchange manifest path is unsafe"); }
    seen.add(item.path);
    return { path: item.path, size: item.size as number, sha256: item.sha256 };
  });
  return { kind: "hana.dossiers.exchange", schemaVersion: EXCHANGE_SCHEMA_VERSION, dossierId: value.dossierId, exportedAt: value.exportedAt, files, extensions: clone(value.extensions) };
}

function comparableType(type: DossierTypeRecord): unknown { return { key: type.key, name: type.name, fields: type.fields, extensions: type.extensions }; }
function comparableContact(contact: ContactRecord): unknown {
  return { name: contact.name, organization: contact.organization, title: contact.title, emails: contact.emails, phones: contact.phones, notes: contact.notes, extensions: contact.extensions };
}
function equal(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }

export class ExchangeApplication {
  readonly #runtime: DossiersRuntime;
  readonly #scope: ExchangeScope;
  readonly #now: () => string;
  readonly #createId: (kind: "dossier" | "operation") => string;
  readonly #limits: ArchiveLimits;

  constructor(input: ExchangeApplicationInput) {
    this.#runtime = input.runtime;
    this.#scope = input.scope;
    this.#now = input.now ?? (() => new Date().toISOString());
    this.#createId = input.createId ?? ((kind) => createStableId(kind === "dossier" ? "dos" : "op"));
    this.#limits = { ...DEFAULT_LIMITS, ...input.limits };
  }

  #catalog(): CatalogApplication { return new CatalogApplication({ runtime: this.#runtime, scope: this.#scope, now: this.#now }); }
  #ref(path: string): WorkspaceTreeRef { return appendResourcePath(this.#scope.workspaceRoot, path); }

  async #ready(): Promise<void> {
    const opened = await this.#runtime.openLibrary(this.#scope);
    if (opened.state !== "ready") throw new ExchangeError("library_blocked", "The workspace dossier library is not writable", { state: opened.state, reason: opened.reason ?? "unknown" });
  }

  async #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const key = workspaceKey(this.#scope.workspaceRoot);
    const previous = MUTATION_TAILS.get(key) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => lock);
    MUTATION_TAILS.set(key, tail);
    await previous;
    try { return await operation(); }
    finally {
      release();
      if (MUTATION_TAILS.get(key) === tail) MUTATION_TAILS.delete(key);
    }
  }

  async #mkdir(path: string): Promise<void> {
    const segments = normalizeRelativePath(path).split("/");
    for (let index = 1; index <= segments.length; index += 1) {
      const ref = this.#ref(segments.slice(0, index).join("/"));
      const stat = await this.#scope.resources.stat(ref);
      if (!stat.exists) await this.#scope.resources.mkdir(ref);
      else if (!stat.isDirectory) throw new ExchangeError("conflict", "An exchange directory is occupied by a file");
    }
  }

  async exportDossier(dossierId: string): Promise<ExportResult> {
    await this.#ready();
    let projection;
    try { projection = await this.#catalog().getDossier(dossierId); }
    catch { throw new ExchangeError("not_found", "The dossier could not be exported", { entity: "dossier" }); }
    const contacts = projection.contacts.map(({ contact, ...relation }) => ({ relation, contact }));
    const rawDossier = { ...projection, contacts: contacts.map((item) => item.relation), documents: projection.documents } as Record<string, unknown>;
    delete rawDossier.type;
    delete rawDossier.dossierRef;
    const dossier = parseDossier(rawDossier);
    const entries: ArchiveEntry[] = [
      { path: "dossier/dossier.json", content: new TextEncoder().encode(serializeJson(dossier)) },
      { path: "dossier/type.json", content: new TextEncoder().encode(serializeJson(projection.type)) },
      { path: "dossier/contacts.json", content: new TextEncoder().encode(serializeJson(contacts.map((item) => item.contact))) },
    ];
    for (const document of dossier.documents) {
      const content = (await this.#scope.resources.read(this.#ref(`Dossiers/dossiers/${dossier.id}/${document.relativePath}`))).content;
      if (content.byteLength !== document.size || hash(content) !== document.sha256) throw new ExchangeError("integrity_failed", "A managed document does not match its authority record", { documentId: document.id });
      entries.push({ path: `dossier/files/${document.relativePath}`, content });
    }
    const files = entries.map((entry) => ({ path: entry.path, size: entry.content.byteLength, sha256: hash(entry.content) })).sort((a, b) => a.path.localeCompare(b.path, "en"));
    const manifest: DossierExchangeManifest = { kind: "hana.dossiers.exchange", schemaVersion: EXCHANGE_SCHEMA_VERSION, dossierId: dossier.id, exportedAt: dossier.updatedAt, files, extensions: {} };
    const archive = createZipArchive([{ path: "dossier-exchange.json", content: new TextEncoder().encode(serializeJson(manifest)) }, ...entries]);
    const archiveHash = hash(archive);
    const exportPath = `Dossiers/exchange/exports/${dossier.id}-${archiveHash.slice(0, 12)}.zip`;
    await this.#mkdir("Dossiers/exchange/exports");
    const archiveRef = this.#ref(exportPath);
    const existing = await this.#scope.resources.stat(archiveRef);
    if (existing.exists) {
      if (existing.isDirectory || hash((await this.#scope.resources.read(archiveRef)).content) !== archiveHash) throw new ExchangeError("conflict", "The deterministic export target is occupied");
    } else await this.#scope.resources.write(archiveRef, archive);
    return { dossierId: dossier.id, archiveRef, fileCount: files.length, totalBytes: files.reduce((sum, file) => sum + file.size, 0), sha256: archiveHash };
  }

  async #parseArchive(content: Uint8Array): Promise<ParsedPackage> {
    const entries = await readZipArchive(content, this.#limits);
    const manifest = parseManifest(jsonEntry(entries, "dossier-exchange.json"));
    const expectedPaths = new Set(["dossier-exchange.json", ...manifest.files.map((file) => file.path)]);
    if (entries.size !== expectedPaths.size || [...entries.keys()].some((path) => !expectedPaths.has(path))) throw new ExchangeError("integrity_failed", "The archive entries do not exactly match the exchange manifest");
    for (const file of manifest.files) {
      const bytes = entries.get(file.path);
      if (!bytes || bytes.byteLength !== file.size || hash(bytes) !== file.sha256) throw new ExchangeError("integrity_failed", "An exchange file failed hash verification");
    }
    const dossier = parseDossier(jsonEntry(entries, "dossier/dossier.json"));
    const type = parseType(jsonEntry(entries, "dossier/type.json"));
    const contacts = parseContacts(jsonEntry(entries, "dossier/contacts.json"));
    if (manifest.dossierId !== dossier.id || dossier.typeId !== type.id) throw new ExchangeError("integrity_failed", "The exchange identities are inconsistent");
    try { validateFieldValues(type, dossier.fields); }
    catch { throw new ExchangeError("integrity_failed", "The dossier fields do not match the type snapshot"); }
    const requiredFiles = new Set([
      "dossier/dossier.json",
      "dossier/type.json",
      "dossier/contacts.json",
      ...dossier.documents.map((document) => `dossier/files/${document.relativePath}`),
    ]);
    if (manifest.files.length !== requiredFiles.size || manifest.files.some((file) => !requiredFiles.has(file.path))) {
      throw new ExchangeError("integrity_failed", "The exchange manifest declares unsupported or missing files");
    }
    const contactIds = new Set(contacts.map((contact) => contact.id));
    if (dossier.contacts.some((relation) => !contactIds.has(relation.contactId))) throw new ExchangeError("integrity_failed", "A dossier relation has no contact snapshot");
    for (const document of dossier.documents) {
      const bytes = entries.get(`dossier/files/${document.relativePath}`);
      if (!bytes || bytes.byteLength !== document.size || hash(bytes) !== document.sha256) throw new ExchangeError("integrity_failed", "A managed document snapshot is inconsistent");
    }
    return { manifest, dossier, type, contacts, entries, totalBytes: manifest.files.reduce((sum, file) => sum + file.size, 0) };
  }

  async #allContacts(catalog: CatalogApplication): Promise<ContactRecord[]> {
    const contacts: ContactRecord[] = [];
    let cursor: string | undefined;
    do {
      const page = await catalog.listContacts({ limit: 200, ...(cursor ? { cursor } : {}) });
      contacts.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return contacts;
  }

  async #targetId(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const id = this.#createId("dossier");
      if (!isStableId(id, "dos")) throw new ExchangeError("resource_operation_failed", "The import dossier identity is invalid");
      if (!(await this.#scope.resources.stat(this.#ref(`Dossiers/dossiers/${id}`))).exists) return id;
    }
    throw new ExchangeError("conflict", "A unique import dossier identity could not be allocated");
  }

  async inspectImport(input: { archiveRef: ExchangeResourceRef }): Promise<ImportInspection> {
    const manifest = await this.#scope.resources.stat(this.#ref("Dossiers/manifest.json"));
    if (!manifest.exists || manifest.isDirectory) throw new ExchangeError("library_blocked", "Initialize the dossier library before inspecting an import");
    await this.#ready();
    if (!isRecord(input) || !isRecord(input.archiveRef) || (input.archiveRef.kind !== "mount" && input.archiveRef.kind !== "local-file")) throw new ExchangeError("validation", "A controlled archive ResourceRef is required");
    let content: Uint8Array;
    try { content = (await this.#scope.resources.read(input.archiveRef)).content; }
    catch { throw new ExchangeError("not_found", "The selected exchange archive could not be read"); }
    const parsed = await this.#parseArchive(content);
    const catalog = this.#catalog();
    const [types, currentContacts] = await Promise.all([catalog.listTypes(), this.#allContacts(catalog)]);
    const sameKey = types.items.find((type) => type.key === parsed.type.key);
    const contactConflicts = parsed.contacts.filter((contact) => {
      const sameId = currentContacts.find((current) => current.id === contact.id);
      return Boolean(sameId && !equal(comparableContact(sameId), comparableContact(contact)));
    }).length;
    const previewId = this.#createId("operation");
    const confirmationToken = this.#createId("operation");
    if (!isStableId(previewId, "op") || !isStableId(confirmationToken, "op")) throw new ExchangeError("resource_operation_failed", "The import preview identity is invalid");
    const preview: StoredPreview = {
      previewId,
      confirmationToken,
      sourceDossierId: parsed.dossier.id,
      targetDossierId: await this.#targetId(),
      name: parsed.dossier.name,
      contacts: parsed.contacts.length,
      documents: parsed.dossier.documents.length,
      totalBytes: parsed.totalBytes,
      contactConflicts,
      typeConflict: Boolean(sameKey && !equal(comparableType(sameKey), comparableType(parsed.type))),
      archiveRef: clone(input.archiveRef),
      archiveSha256: hash(content),
      state: "inspected",
    };
    PREVIEWS.set(previewKey(this.#scope.workspaceRoot, previewId), preview);
    return clone({
      previewId: preview.previewId,
      confirmationToken: preview.confirmationToken,
      sourceDossierId: preview.sourceDossierId,
      targetDossierId: preview.targetDossierId,
      name: preview.name,
      contacts: preview.contacts,
      documents: preview.documents,
      totalBytes: preview.totalBytes,
      contactConflicts: preview.contactConflicts,
      typeConflict: preview.typeConflict,
    });
  }

  async #resolveType(catalog: CatalogApplication, imported: DossierTypeRecord): Promise<{ value: DossierTypeRecord; created: boolean }> {
    const types = (await catalog.listTypes()).items;
    const exact = types.find((type) => equal(comparableType(type), comparableType(imported)));
    if (exact) return { value: exact, created: false };
    const keyConflict = types.some((type) => type.key === imported.key);
    const key = keyConflict ? `${imported.key.slice(0, 48)}-${hash(new TextEncoder().encode(JSON.stringify(comparableType(imported)))).slice(0, 8)}` : imported.key;
    return { value: await catalog.createType({ key, name: imported.name, fields: imported.fields as FieldDefinition[], extensions: imported.extensions }), created: true };
  }

  async commitImport(previewId: string, confirmationToken: string): Promise<ImportResult> {
    return this.#exclusive(() => this.#commitImport(previewId, confirmationToken));
  }

  async #commitImport(previewId: string, confirmationToken: string): Promise<ImportResult> {
    await this.#ready();
    const stored = PREVIEWS.get(previewKey(this.#scope.workspaceRoot, previewId));
    if (!stored) throw new ExchangeError("not_found", "The import preview was not found", { entity: "preview" });
    if (stored.state === "completed" && stored.result) return clone(stored.result);
    if (stored.confirmationToken !== confirmationToken || !confirmationToken) throw new ExchangeError("confirmation_invalid", "The import confirmation does not match the preview");
    let content: Uint8Array;
    try { content = (await this.#scope.resources.read(stored.archiveRef)).content; }
    catch { throw new ExchangeError("not_found", "The selected exchange archive could not be read"); }
    if (hash(content) !== stored.archiveSha256) throw new ExchangeError("confirmation_invalid", "The exchange archive changed after inspection");
    const parsed = await this.#parseArchive(content);
    stored.state = "committing";
    const catalog = this.#catalog();
    let targetType: { value: DossierTypeRecord; created: boolean } | undefined;
    let currentContacts: ContactRecord[] = [];
    const createdContacts: ContactRecord[] = [];
    const contactMap = new Map<string, string>();
    let importedContacts = 0;
    let reusedContacts = 0;
    let dossier: ExchangeDossier;
    const stageRoot = `Dossiers/.system/staging/exchange/${previewId}/${stored.targetDossierId}`;
    const finalRoot = `Dossiers/dossiers/${stored.targetDossierId}`;
    try {
      targetType = await this.#resolveType(catalog, parsed.type);
      currentContacts = await this.#allContacts(catalog);
      for (const contact of parsed.contacts) {
        const reusable = currentContacts.find((current) => equal(comparableContact(current), comparableContact(contact)));
        if (reusable) {
          contactMap.set(contact.id, reusable.id);
          reusedContacts += 1;
        } else {
          const created = await catalog.createContact({
            name: contact.name, organization: contact.organization, title: contact.title, emails: contact.emails,
            phones: contact.phones, notes: contact.notes, extensions: contact.extensions,
          });
          currentContacts.push(created);
          createdContacts.push(created);
          contactMap.set(contact.id, created.id);
          importedContacts += 1;
        }
      }
      const now = this.#now();
      dossier = {
        ...parsed.dossier,
        id: stored.targetDossierId,
        typeId: targetType.value.id,
        contacts: parsed.dossier.contacts.map((relation) => ({ ...relation, contactId: contactMap.get(relation.contactId)! })),
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
      if ((await this.#scope.resources.stat(this.#ref(finalRoot))).exists) throw new ExchangeError("conflict", "The import target already exists");
      await this.#mkdir(stageRoot);
      await this.#scope.resources.write(this.#ref(`${stageRoot}/dossier.json`), serializeJson(dossier));
      for (const document of dossier.documents) {
        const parent = document.relativePath.split("/").slice(0, -1).join("/");
        await this.#mkdir(`${stageRoot}/${parent}`);
        await this.#scope.resources.write(this.#ref(`${stageRoot}/${document.relativePath}`), parsed.entries.get(`dossier/files/${document.relativePath}`)!);
      }
      await this.#scope.resources.move(this.#ref(stageRoot), this.#ref(finalRoot));
    } catch (error) {
      try {
        const stage = this.#ref(stageRoot);
        if ((await this.#scope.resources.stat(stage)).exists) await this.#scope.resources.delete(stage);
      } catch { /* staging is non-authoritative and recoverable on retry */ }
      for (const contact of [...createdContacts].reverse()) {
        try { await catalog.deleteContact(contact.id, contact.revision); } catch { /* retry will reuse a surviving semantic match */ }
      }
      if (targetType?.created) {
        try { await catalog.deleteType(targetType.value.id, targetType.value.revision); } catch { /* retry will reuse a surviving semantic match */ }
      }
      stored.state = "inspected";
      if (error instanceof ExchangeError) throw error;
      throw new ExchangeError("resource_operation_failed", "The imported dossier could not be atomically published");
    }
    const result: ImportResult = { previewId, dossierId: dossier.id, importedContacts, reusedContacts, documents: dossier.documents.length, reindexRequired: true };
    stored.state = "completed";
    stored.result = result;
    stored.confirmationToken = "consumed";
    return clone(result);
  }

  async detectLibrary(): Promise<{ state: string; reason?: string; reindexRequired: boolean }> {
    const opened = await this.#runtime.openLibrary(this.#scope);
    return { state: opened.state, ...(opened.reason ? { reason: opened.reason } : {}), reindexRequired: opened.state === "ready" };
  }
}

export type { ExchangeResources, ExchangeResourceRef };
