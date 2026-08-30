import { createHash, randomBytes } from "node:crypto";

import type { HanaPluginResources, HanaResourceVersion } from "@hana/plugin-runtime";

import { createStableId, isStableId } from "../../domain/ids.ts";
import { appendResourcePath, normalizeRelativePath, type WorkspaceTreeRef } from "../../infrastructure/workspace/resource-path.ts";
import type { DossiersRequestScope, DossiersRuntime } from "../../runtime.ts";
import { CatalogApplication } from "../catalog/catalog-application.ts";
import { CatalogError } from "../catalog/errors.ts";
import type { ManagedDocumentRecord } from "../documents/models.ts";
import { LifecycleError } from "./errors.ts";
import type { AuditEvent, AuditRetention, LifecycleInvocation, TrashCatalog, TrashRecord } from "./models.ts";

const TRASH_CATALOG_PATH = "Dossiers/.trash/catalog.json";
const TRASH_ITEMS_PATH = "Dossiers/.trash/items";
const AUDIT_PATH = "Dossiers/audit";
const RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const CONFIRMATION_MS = 5 * 60 * 1_000;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_CODE = /^[a-z0-9][a-z0-9_.-]{0,159}$/i;
const SAFE_REASON = /^[a-z][a-z0-9_.-]{0,79}$/;
const MUTATION_TAILS = new Map<string, Promise<void>>();

type LifecycleResources = DossiersRequestScope["resources"] & Pick<HanaPluginResources, "move">;
interface LifecycleScope extends DossiersRequestScope { resources: LifecycleResources }

interface LifecycleApplicationInput {
  runtime: DossiersRuntime;
  scope: LifecycleScope;
  now?: () => string;
  createId?: () => string;
  createToken?: () => string;
}

interface Loaded<T> { value: T; version: HanaResourceVersion }

interface DossierAuthority {
  kind: "hana.dossiers.dossier";
  schemaVersion: number;
  id: string;
  revision: number;
  documents: ManagedDocumentRecord[];
  contacts: Array<{ contactId: string; role: string; extensions: Record<string, unknown> }>;
  updatedAt: string;
  extensions: Record<string, unknown>;
  [key: string]: unknown;
}

function clone<T>(value: T): T { return structuredClone(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function positiveRevision(value: unknown, field = "expectedRevision"): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new LifecycleError("validation", `${field} must be a positive integer`, { field });
  return value as number;
}
function instant(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new LifecycleError("resource_operation_failed", `The ${field} timestamp is invalid`);
  return parsed;
}
function safeCode(value: unknown, field: string, required = false): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) throw new LifecycleError("validation", `${field} is required`, { field });
    return undefined;
  }
  if (typeof value !== "string" || !SAFE_CODE.test(value)) throw new LifecycleError("validation", `${field} must be a bounded metadata code`, { field });
  return value;
}
function safeReason(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !SAFE_REASON.test(value)) throw new LifecycleError("validation", "reason must be a lowercase metadata code", { field: "reason" });
  return value;
}
function principal(value: LifecycleInvocation): LifecycleInvocation {
  if (!isRecord(value) || typeof value.actorId !== "string" || !value.actorId.trim() || value.actorId.length > 160
    || typeof value.sessionId !== "string" || !value.sessionId.trim() || value.sessionId.length > 160) {
    throw new LifecycleError("validation", "A host-owned actor and session identity are required");
  }
  return { actorId: value.actorId.trim(), sessionId: value.sessionId.trim(), source: value.source === "agent-tool" ? "agent-tool" : "user-action" };
}
function isExtensions(value: unknown): value is Record<string, unknown> { return isRecord(value); }

function parseDocument(value: unknown): ManagedDocumentRecord {
  if (!isRecord(value) || value.kind !== "hana.dossiers.document" || value.schemaVersion !== 1 || !isStableId(value.id, "doc") || typeof value.name !== "string" || !value.name || value.name.includes("/") || value.name.includes("\\")
    || typeof value.categoryId !== "string" || !SAFE_CODE.test(value.categoryId) || !Array.isArray(value.tags) || !value.tags.every((tag) => typeof tag === "string" && tag.length <= 120)
    || typeof value.relativePath !== "string" || typeof value.sha256 !== "string" || !SHA256.test(value.sha256)
    || !Number.isInteger(value.size) || (value.size as number) < 0 || !Number.isInteger(value.revision) || (value.revision as number) < 1
    || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string" || !isExtensions(value.extensions)) {
    throw new LifecycleError("resource_operation_failed", "A managed document record is invalid");
  }
  let relativePath: string;
  try { relativePath = normalizeRelativePath(value.relativePath); } catch { throw new LifecycleError("resource_operation_failed", "A managed document path is unsafe"); }
  if (!relativePath.startsWith(`documents/${value.categoryId}/`) || !relativePath.endsWith(`/${value.name}`)) throw new LifecycleError("resource_operation_failed", "A managed document path does not match its metadata");
  return { ...clone(value), relativePath, tags: [...value.tags], extensions: clone(value.extensions) } as unknown as ManagedDocumentRecord;
}

function parseDossier(value: unknown, expectedId: string): DossierAuthority {
  if (!isRecord(value) || value.kind !== "hana.dossiers.dossier" || value.schemaVersion !== 1 || value.id !== expectedId || !isStableId(value.id, "dos")
    || !Number.isInteger(value.revision) || (value.revision as number) < 1 || !Array.isArray(value.documents) || !Array.isArray(value.contacts) || typeof value.updatedAt !== "string" || !isExtensions(value.extensions)) {
    throw new LifecycleError("resource_operation_failed", "The dossier authority is invalid");
  }
  if (Object.hasOwn(value, "relationships")) throw new LifecycleError("resource_operation_failed", "Dossier relationships are not supported");
  const documents = value.documents.map(parseDocument);
  const contacts = value.contacts.map((relation) => {
    if (!isRecord(relation) || !isStableId(relation.contactId, "con") || typeof relation.role !== "string" || !relation.role || relation.role.length > 120 || !isExtensions(relation.extensions)) {
      throw new LifecycleError("resource_operation_failed", "A dossier contact relation is invalid");
    }
    return { contactId: relation.contactId, role: relation.role, extensions: clone(relation.extensions) };
  });
  if (new Set(contacts.map((relation) => relation.contactId)).size !== contacts.length) throw new LifecycleError("resource_operation_failed", "The dossier authority has duplicate contact relations");
  if (new Set(documents.map((item) => item.id)).size !== documents.length || new Set(documents.map((item) => item.relativePath)).size !== documents.length) {
    throw new LifecycleError("resource_operation_failed", "The dossier authority has duplicate document identities or paths");
  }
  return { ...clone(value), documents, contacts, extensions: clone(value.extensions) } as unknown as DossierAuthority;
}

function parseInvocation(value: unknown): LifecycleInvocation {
  if (!isRecord(value) || typeof value.actorId !== "string" || typeof value.sessionId !== "string" || !["agent-tool", "user-action"].includes(String(value.source))) {
    throw new LifecycleError("resource_operation_failed", "A lifecycle actor is invalid");
  }
  return principal(value as unknown as LifecycleInvocation);
}

function parseTrashRecord(value: unknown): TrashRecord {
  if (!isRecord(value) || value.kind !== "hana.dossiers.trash-record" || value.schemaVersion !== 1 || !isStableId(value.id, "op")
    || !["dossier", "document"].includes(String(value.targetType)) || typeof value.targetId !== "string" || !isStableId(value.dossierId, "dos")
    || typeof value.originalRelativePath !== "string" || typeof value.trashRelativePath !== "string" || !["trashing", "trashed", "restoring", "restored", "purging", "purged"].includes(String(value.state))
    || !Number.isInteger(value.revision) || (value.revision as number) < 1 || typeof value.deletedAt !== "string" || typeof value.expiresAt !== "string"
    || typeof value.updatedAt !== "string" || !isExtensions(value.extensions)) throw new LifecycleError("resource_operation_failed", "A trash record is invalid");
  if (value.targetType === "dossier" && (!isStableId(value.targetId, "dos") || value.targetId !== value.dossierId)) throw new LifecycleError("resource_operation_failed", "A dossier trash identity is invalid");
  if (value.targetType === "document" && (!isStableId(value.targetId, "doc") || !Number.isInteger(value.documentIndex) || (value.documentIndex as number) < 0)) throw new LifecycleError("resource_operation_failed", "A document trash identity is invalid");
  let originalRelativePath: string;
  let trashRelativePath: string;
  try { originalRelativePath = normalizeRelativePath(value.originalRelativePath); trashRelativePath = normalizeRelativePath(value.trashRelativePath); }
  catch { throw new LifecycleError("resource_operation_failed", "A trash path is unsafe"); }
  if (!trashRelativePath.startsWith(`Dossiers/.trash/items/${value.id}/`)) throw new LifecycleError("resource_operation_failed", "A trash path escapes its record");
  const actor = parseInvocation(value.actor);
  const transitionActor = value.transitionActor === undefined ? undefined : parseInvocation(value.transitionActor);
  if (value.expectedEntityRevision !== undefined && (!Number.isInteger(value.expectedEntityRevision) || (value.expectedEntityRevision as number) < 1)) throw new LifecycleError("resource_operation_failed", "A trash entity revision is invalid");
  if (value.restoreExpectedDossierRevision !== undefined && (!Number.isInteger(value.restoreExpectedDossierRevision) || (value.restoreExpectedDossierRevision as number) < 1)) throw new LifecycleError("resource_operation_failed", "A restore dossier revision is invalid");
  if (value.transitionAuditId !== undefined && !isStableId(value.transitionAuditId, "op")) throw new LifecycleError("resource_operation_failed", "A transition audit identity is invalid");
  const document = value.document === undefined ? undefined : parseDocument(value.document);
  if ((value.targetType === "document") !== Boolean(document)) throw new LifecycleError("resource_operation_failed", "A document trash snapshot is missing or unexpected");
  let confirmation;
  if (value.confirmation !== undefined) {
    if (!isRecord(value.confirmation) || typeof value.confirmation.tokenHash !== "string" || !SHA256.test(value.confirmation.tokenHash)
      || typeof value.confirmation.actorId !== "string" || typeof value.confirmation.sessionId !== "string" || !Number.isInteger(value.confirmation.targetRevision)
      || typeof value.confirmation.expiresAt !== "string") throw new LifecycleError("resource_operation_failed", "A purge confirmation is invalid");
    confirmation = clone(value.confirmation) as unknown as TrashRecord["confirmation"];
  }
  if (value.purgeAuditId !== undefined && !isStableId(value.purgeAuditId, "op")) throw new LifecycleError("resource_operation_failed", "A purge audit identity is invalid");
  instant(value.deletedAt, "deleted"); instant(value.expiresAt, "expiry"); instant(value.updatedAt, "updated");
  return { ...clone(value), originalRelativePath, trashRelativePath, actor, ...(transitionActor ? { transitionActor } : {}), ...(document ? { document } : {}), ...(confirmation ? { confirmation } : {}), extensions: clone(value.extensions) } as unknown as TrashRecord;
}

function parseTrashCatalog(value: unknown): TrashCatalog {
  if (!isRecord(value) || value.kind !== "hana.dossiers.trash-catalog" || value.schemaVersion !== 1 || !Number.isInteger(value.revision)
    || !Array.isArray(value.records) || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string" || !isExtensions(value.extensions)) {
    throw new LifecycleError("resource_operation_failed", "The trash catalog is invalid");
  }
  const records = value.records.map(parseTrashRecord);
  if (new Set(records.map((record) => record.id)).size !== records.length) throw new LifecycleError("resource_operation_failed", "The trash catalog has duplicate identities");
  return { ...clone(value), records, extensions: clone(value.extensions) } as unknown as TrashCatalog;
}

function parseAudit(value: unknown): AuditEvent | null {
  if (!isRecord(value) || value.kind !== "hana.dossiers.audit-event" || value.schemaVersion !== 1) return null;
  if (!isStableId(value.id, "op") || typeof value.action !== "string" || !SAFE_CODE.test(value.action)
    || !["dossier", "document", "contact", "audit", "security", "migration"].includes(String(value.targetType))
    || (value.targetId !== undefined && (typeof value.targetId !== "string" || !SAFE_CODE.test(value.targetId)))
    || !["succeeded", "rejected"].includes(String(value.result)) || (value.reason !== undefined && (typeof value.reason !== "string" || !SAFE_CODE.test(value.reason)))
    || !["ordinary", "permanent"].includes(String(value.retention)) || typeof value.occurredAt !== "string" || !isExtensions(value.extensions)) {
    throw new LifecycleError("resource_operation_failed", "A known audit event is invalid");
  }
  instant(value.occurredAt, "audit");
  return { ...clone(value), actor: parseInvocation(value.actor), extensions: clone(value.extensions) } as unknown as AuditEvent;
}

export class LifecycleApplication {
  readonly #runtime: DossiersRuntime;
  readonly #scope: LifecycleScope;
  readonly #catalog: CatalogApplication;
  readonly #now: () => string;
  readonly #createId: () => string;
  readonly #createToken: () => string;

  constructor(input: LifecycleApplicationInput) {
    this.#runtime = input.runtime;
    this.#scope = input.scope;
    this.#catalog = new CatalogApplication({ runtime: input.runtime, scope: input.scope });
    this.#now = input.now ?? (() => new Date().toISOString());
    this.#createId = input.createId ?? (() => createStableId("op"));
    this.#createToken = input.createToken ?? (() => randomBytes(32).toString("base64url"));
  }

  async #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const root = this.#scope.workspaceRoot;
    const key = root.kind === "mount" ? `mount:${root.mountId}:${root.path}` : `local:${root.path}`;
    const previous = MUTATION_TAILS.get(key) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => lock);
    MUTATION_TAILS.set(key, tail);
    await previous;
    try { return await operation(); } finally { release(); if (MUTATION_TAILS.get(key) === tail) MUTATION_TAILS.delete(key); }
  }

  #ref(path: string): WorkspaceTreeRef { return appendResourcePath(this.#scope.workspaceRoot, path); }

  async #ready(): Promise<void> {
    const state = await this.#runtime.openLibrary(this.#scope);
    if (state.state !== "ready") throw new LifecycleError("library_blocked", "The dossier library is not ready", { reason: state.reason });
  }

  async #read<T>(path: string, parser: (value: unknown) => T): Promise<Loaded<T> | null> {
    const ref = this.#ref(path);
    const stat = await this.#scope.resources.stat(ref);
    if (!stat.exists) return null;
    if (stat.isDirectory) throw new LifecycleError("resource_operation_failed", "A lifecycle authority path is occupied by a directory");
    try {
      const read = await this.#scope.resources.read(ref);
      if (!read.version) throw new Error("missing version");
      return { value: parser(JSON.parse(new TextDecoder().decode(read.content)) as unknown), version: read.version };
    } catch (error) {
      if (error instanceof LifecycleError) throw error;
      throw new LifecycleError("resource_operation_failed", "A lifecycle authority could not be read");
    }
  }

  async #write(path: string, value: unknown, expectedVersion: HanaResourceVersion | null, operationId = createStableId("op")): Promise<void> {
    const result = await this.#runtime.jsonRepository(this.#scope).write({ operationId, targetPath: path, value, expectedVersion, now: this.#now() });
    if (result.status === "conflict") throw new LifecycleError("conflict", "The lifecycle authority changed; refresh and retry");
    if (result.status === "failed") throw new LifecycleError("resource_operation_failed", "The lifecycle authority could not be published");
  }

  async #catalogState(): Promise<Loaded<TrashCatalog> | null> { return this.#read(TRASH_CATALOG_PATH, parseTrashCatalog); }

  #emptyCatalog(now: string): TrashCatalog {
    return { kind: "hana.dossiers.trash-catalog", schemaVersion: 1, revision: 0, records: [], createdAt: now, updatedAt: now, extensions: {} };
  }

  async #publishCatalog(loaded: Loaded<TrashCatalog> | null, records: TrashRecord[], now: string): Promise<TrashCatalog> {
    const current = loaded?.value ?? this.#emptyCatalog(now);
    const next: TrashCatalog = { ...current, revision: current.revision + 1, records: records.map(clone), updatedAt: now };
    await this.#write(TRASH_CATALOG_PATH, next, loaded?.version ?? null);
    return next;
  }

  async #ensureDirectory(path: string): Promise<void> {
    const ref = this.#ref(path);
    const stat = await this.#scope.resources.stat(ref);
    if (stat.exists) {
      if (!stat.isDirectory) throw new LifecycleError("conflict", "A required lifecycle directory path is occupied");
      return;
    }
    await this.#scope.resources.mkdir(ref);
  }

  async #ensureItemDirectory(recordId: string): Promise<void> {
    await this.#ensureDirectory(TRASH_ITEMS_PATH);
    await this.#ensureDirectory(`${TRASH_ITEMS_PATH}/${recordId}`);
  }

  async #move(fromPath: string, toPath: string): Promise<void> {
    const from = this.#ref(fromPath);
    const to = this.#ref(toPath);
    const [source, destination] = await Promise.all([this.#scope.resources.stat(from), this.#scope.resources.stat(to)]);
    if (!source.exists) throw new LifecycleError("not_found", "The lifecycle source was not found");
    if (destination.exists) throw new LifecycleError("conflict", "The lifecycle destination already exists");
    try { await this.#scope.resources.move(from, to); }
    catch { throw new LifecycleError("resource_operation_failed", "The lifecycle resource could not be moved"); }
  }

  async #deleteTree(ref: WorkspaceTreeRef): Promise<void> {
    const stat = await this.#scope.resources.stat(ref);
    if (!stat.exists) return;
    if (stat.isDirectory) {
      const listing = await this.#scope.resources.list(ref);
      for (const item of listing.items) await this.#deleteTree(appendResourcePath(ref, item.name));
    }
    await this.#scope.resources.delete(ref);
  }

  async #removeIfExists(path: string): Promise<void> {
    try { await this.#deleteTree(this.#ref(path)); } catch { /* rollback cleanup is best effort */ }
  }

  async #readDossier(id: string): Promise<Loaded<DossierAuthority>> {
    if (!isStableId(id, "dos")) throw new LifecycleError("not_found", "The dossier was not found");
    const loaded = await this.#read(`Dossiers/dossiers/${id}/dossier.json`, (value) => parseDossier(value, id));
    if (!loaded) throw new LifecycleError("not_found", "The dossier was not found");
    return loaded;
  }

  #event(input: { id?: string; action: string; targetType: AuditEvent["targetType"]; targetId?: string; result?: AuditEvent["result"]; reason?: string; retention: AuditRetention; actor: LifecycleInvocation; occurredAt?: string }): AuditEvent {
    const id = input.id ?? this.#createId();
    if (!isStableId(id, "op")) throw new LifecycleError("resource_operation_failed", "The audit identity is invalid");
    const action = safeCode(input.action, "action", true)!;
    if (!["dossier", "document", "contact", "audit", "security", "migration"].includes(input.targetType)) throw new LifecycleError("validation", "targetType is invalid", { field: "targetType" });
    if (input.result !== undefined && !["succeeded", "rejected"].includes(input.result)) throw new LifecycleError("validation", "result is invalid", { field: "result" });
    if (!["ordinary", "permanent"].includes(input.retention)) throw new LifecycleError("validation", "retention is invalid", { field: "retention" });
    const targetId = safeCode(input.targetId, "targetId");
    const reason = safeReason(input.reason);
    const occurredAt = input.occurredAt ?? this.#now();
    instant(occurredAt, "audit");
    return {
      kind: "hana.dossiers.audit-event", schemaVersion: 1, id, action, targetType: input.targetType,
      ...(targetId ? { targetId } : {}), result: input.result ?? "succeeded", ...(reason ? { reason } : {}),
      retention: input.retention, actor: principal(input.actor), occurredAt, extensions: {},
    };
  }

  async #appendAudit(event: AuditEvent): Promise<string> {
    const path = `${AUDIT_PATH}/${event.id}.json`;
    const existing = await this.#read(path, parseAudit);
    if (existing) {
      if (JSON.stringify(existing.value) !== JSON.stringify(event)) throw new LifecycleError("conflict", "The audit identity already exists");
      return path;
    }
    await this.#write(path, event, null, event.id);
    return path;
  }

  async #rollbackAudit(path: string | null): Promise<void> { if (path) await this.#removeIfExists(path); }

  #recordProjection(record: TrashRecord) {
    return { ...clone(record), expired: instant(this.#now(), "current") >= instant(record.expiresAt, "expiry"), confirmation: undefined };
  }

  async #recordById(id: string): Promise<{ loaded: Loaded<TrashCatalog>; index: number; record: TrashRecord }> {
    const loaded = await this.#catalogState();
    if (!loaded) throw new LifecycleError("not_found", "The trash record was not found");
    const index = loaded.value.records.findIndex((record) => record.id === id);
    if (index < 0) throw new LifecycleError("not_found", "The trash record was not found");
    return { loaded, index, record: loaded.value.records[index]! };
  }

  async #replaceRecord(record: TrashRecord, expectedState: TrashRecord["state"], expectedRevision: number): Promise<TrashRecord> {
    const { loaded, index, record: current } = await this.#recordById(record.id);
    if (current.state !== expectedState || current.revision !== expectedRevision) throw new LifecycleError("conflict", "The lifecycle transition changed during recovery");
    const updated = clone(record);
    await this.#publishCatalog(loaded, loaded.value.records.map((item, itemIndex) => itemIndex === index ? updated : item), updated.updatedAt);
    return updated;
  }

  async #removeIntent(record: TrashRecord): Promise<void> {
    const loaded = await this.#catalogState();
    if (!loaded) return;
    const current = loaded.value.records.find((item) => item.id === record.id);
    if (!current || current.state !== "trashing") return;
    await this.#publishCatalog(loaded, loaded.value.records.filter((item) => item.id !== record.id), this.#now());
  }

  async #cancelRestore(record: TrashRecord): Promise<void> {
    const [trash, target] = await Promise.all([
      this.#scope.resources.stat(this.#ref(record.trashRelativePath)),
      this.#scope.resources.stat(this.#ref(record.originalRelativePath)),
    ]);
    if (!trash.exists && target.exists) await this.#move(record.originalRelativePath, record.trashRelativePath);
    else if (!trash.exists || !target.exists) {
      if (!(trash.exists && !target.exists)) throw new LifecycleError("conflict", "The restore transition cannot be safely cancelled");
    }
    const stable: TrashRecord = {
      ...record, state: "trashed", revision: record.revision + 1, updatedAt: this.#now(),
      transitionActor: undefined, transitionAuditId: undefined, restoreExpectedDossierRevision: undefined,
    };
    await this.#replaceRecord(stable, "restoring", record.revision);
  }

  async #finishTrashing(recordValue: TrashRecord) {
    const { record } = await this.#recordById(recordValue.id);
    if (record.state === "trashed") return { record: this.#recordProjection(record) };
    if (record.state !== "trashing") throw new LifecycleError("conflict", "The Trash transition is no longer active");
    const [source, destination] = await Promise.all([
      this.#scope.resources.stat(this.#ref(record.originalRelativePath)),
      this.#scope.resources.stat(this.#ref(record.trashRelativePath)),
    ]);
    if (source.exists === destination.exists) throw new LifecycleError("conflict", "The Trash transition has an ambiguous source/destination state");
    if (source.exists) await this.#move(record.originalRelativePath, record.trashRelativePath);
    let dossierRevision: number | undefined;
    if (record.targetType === "document") {
      const dossier = await this.#readDossier(record.dossierId);
      const present = dossier.value.documents.some((item) => item.id === record.targetId);
      if (present) {
        if (dossier.value.revision !== record.expectedEntityRevision) {
          const moved = await this.#scope.resources.stat(this.#ref(record.trashRelativePath));
          const original = await this.#scope.resources.stat(this.#ref(record.originalRelativePath));
          if (moved.exists && !original.exists) await this.#move(record.trashRelativePath, record.originalRelativePath);
          await this.#removeIntent(record);
          await this.#removeIfExists(`${TRASH_ITEMS_PATH}/${record.id}`);
          throw new LifecycleError("conflict", "The dossier changed during document deletion", { currentRevision: dossier.value.revision });
        }
        const next: DossierAuthority = { ...dossier.value, documents: dossier.value.documents.filter((item) => item.id !== record.targetId), revision: dossier.value.revision + 1, updatedAt: this.#now() };
        await this.#write(`Dossiers/dossiers/${record.dossierId}/dossier.json`, next, dossier.version);
        dossierRevision = next.revision;
      } else dossierRevision = dossier.value.revision;
    }
    await this.#appendAudit(this.#event({ id: record.transitionAuditId, action: `${record.targetType}.trash`, targetType: record.targetType, targetId: record.targetId, reason: record.reason, retention: "permanent", actor: record.actor, occurredAt: record.deletedAt }));
    const updated: TrashRecord = { ...record, state: "trashed", revision: record.revision + 1, updatedAt: this.#now(), transitionAuditId: undefined };
    await this.#replaceRecord(updated, "trashing", record.revision);
    return { record: this.#recordProjection(updated), ...(dossierRevision ? { dossierRevision } : {}) };
  }

  async #finishRestoring(recordValue: TrashRecord) {
    const { record } = await this.#recordById(recordValue.id);
    if (record.state === "restored") return { record: this.#recordProjection(record) };
    if (record.state !== "restoring" || !record.transitionActor || !record.transitionAuditId) throw new LifecycleError("conflict", "The restore transition is invalid");
    const [trash, target] = await Promise.all([
      this.#scope.resources.stat(this.#ref(record.trashRelativePath)),
      this.#scope.resources.stat(this.#ref(record.originalRelativePath)),
    ]);
    if (trash.exists === target.exists) {
      if (trash.exists) await this.#cancelRestore(record);
      throw new LifecycleError("conflict", "The restore transition has an ambiguous source/destination state");
    }
    let dossierRevision: number | undefined;
    if (record.targetType === "document") {
      const dossier = await this.#readDossier(record.dossierId);
      const present = dossier.value.documents.some((item) => item.id === record.targetId || item.relativePath === record.document!.relativePath);
      if (!present) {
        if (dossier.value.revision !== record.restoreExpectedDossierRevision) {
          await this.#cancelRestore(record);
          throw new LifecycleError("conflict", "The dossier changed during document restore", { currentRevision: dossier.value.revision });
        }
        if (trash.exists) await this.#move(record.trashRelativePath, record.originalRelativePath);
        const documents = [...dossier.value.documents];
        documents.splice(Math.min(record.documentIndex!, documents.length), 0, clone(record.document!));
        const next: DossierAuthority = { ...dossier.value, documents, revision: dossier.value.revision + 1, updatedAt: this.#now() };
        await this.#write(`Dossiers/dossiers/${record.dossierId}/dossier.json`, next, dossier.version);
        dossierRevision = next.revision;
      } else {
        if (trash.exists || !target.exists) throw new LifecycleError("conflict", "The restored document manifest and payload disagree");
        dossierRevision = dossier.value.revision;
      }
    } else if (trash.exists) await this.#move(record.trashRelativePath, record.originalRelativePath);
    await this.#appendAudit(this.#event({ id: record.transitionAuditId, action: `${record.targetType}.restore`, targetType: record.targetType, targetId: record.targetId, retention: "permanent", actor: record.transitionActor, occurredAt: record.updatedAt }));
    const updated: TrashRecord = {
      ...record, state: "restored", revision: record.revision + 1, updatedAt: this.#now(), actor: record.transitionActor,
      transitionActor: undefined, transitionAuditId: undefined, restoreExpectedDossierRevision: undefined, confirmation: undefined,
    };
    await this.#replaceRecord(updated, "restoring", record.revision);
    return { record: this.#recordProjection(updated), ...(dossierRevision ? { dossierRevision } : {}) };
  }

  async listTrash(input: { includeResolved?: boolean; limit?: number } = {}) {
    return this.#exclusive(async () => {
      await this.#ready();
      await this.#recoverTransitions();
      const loaded = await this.#catalogState();
      const limit = input.limit === undefined ? 100 : Math.min(200, positiveRevision(input.limit, "limit"));
      const records = (loaded?.value.records ?? []).filter((record) => input.includeResolved || record.state === "trashed").sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)).slice(0, limit);
      return { items: records.map((record) => this.#recordProjection(record)), revision: loaded?.value.revision ?? 0 };
    });
  }

  async trashDossier(dossierId: string, expectedRevision: number, actorValue: LifecycleInvocation, reasonValue?: string) {
    return this.#exclusive(async () => {
      await this.#ready(); await this.#recoverTransitions();
      const actor = principal(actorValue); const reason = safeReason(reasonValue); const now = this.#now();
      let current;
      try { current = await this.#catalog.getDossier(dossierId); } catch (error) { throw this.#mapError(error); }
      if (current.revision !== positiveRevision(expectedRevision)) throw new LifecycleError("conflict", "The dossier changed before deletion", { currentRevision: current.revision });
      const loaded = await this.#catalogState();
      if (loaded?.value.records.some((record) => record.targetType === "dossier" && record.targetId === dossierId && !["restored", "purged"].includes(record.state))) {
        throw new LifecycleError("conflict", "The dossier already has an active trash record");
      }
      const id = this.#createId();
      if (!isStableId(id, "op")) throw new LifecycleError("resource_operation_failed", "The trash identity is invalid");
      const trashRelativePath = `${TRASH_ITEMS_PATH}/${id}/payload`;
      const record: TrashRecord = {
        kind: "hana.dossiers.trash-record", schemaVersion: 1, id, targetType: "dossier", targetId: dossierId, dossierId,
        originalRelativePath: `Dossiers/dossiers/${dossierId}`, trashRelativePath, state: "trashing", revision: 1,
        deletedAt: now, expiresAt: new Date(instant(now, "current") + RETENTION_MS).toISOString(), updatedAt: now, actor, expectedEntityRevision: current.revision,
        transitionAuditId: this.#createId(), ...(reason ? { reason } : {}), extensions: {},
      };
      if (!isStableId(record.transitionAuditId, "op")) throw new LifecycleError("resource_operation_failed", "The transition audit identity is invalid");
      await this.#ensureItemDirectory(id);
      await this.#publishCatalog(loaded, [...(loaded?.value.records ?? []), record], now);
      try {
        return (await this.#finishTrashing(record)).record;
      } catch (error) {
        const source = await this.#scope.resources.stat(this.#ref(record.originalRelativePath));
        const destination = await this.#scope.resources.stat(this.#ref(record.trashRelativePath));
        if (source.exists && !destination.exists) { try { await this.#removeIntent(record); await this.#removeIfExists(`${TRASH_ITEMS_PATH}/${id}`); } catch { /* persisted intent remains recoverable */ } }
        throw this.#mapError(error);
      }
    });
  }

  async trashDocument(dossierId: string, documentId: string, expectedDossierRevision: number, actorValue: LifecycleInvocation, reasonValue?: string) {
    return this.#exclusive(async () => {
      await this.#ready(); await this.#recoverTransitions();
      const actor = principal(actorValue); const reason = safeReason(reasonValue); const now = this.#now();
      const dossier = await this.#readDossier(dossierId);
      if (dossier.value.revision !== positiveRevision(expectedDossierRevision, "expectedDossierRevision")) throw new LifecycleError("conflict", "The dossier changed before document deletion", { currentRevision: dossier.value.revision });
      const documentIndex = dossier.value.documents.findIndex((item) => item.id === documentId);
      if (documentIndex < 0) throw new LifecycleError("not_found", "The managed document was not found");
      const document = dossier.value.documents[documentIndex]!;
      const loaded = await this.#catalogState();
      if (loaded?.value.records.some((record) => record.targetType === "document" && record.targetId === documentId && !["restored", "purged"].includes(record.state))) {
        throw new LifecycleError("conflict", "The document already has an active trash record");
      }
      const id = this.#createId();
      if (!isStableId(id, "op")) throw new LifecycleError("resource_operation_failed", "The trash identity is invalid");
      const record: TrashRecord = {
        kind: "hana.dossiers.trash-record", schemaVersion: 1, id, targetType: "document", targetId: document.id, dossierId,
        originalRelativePath: `Dossiers/dossiers/${dossierId}/${document.relativePath}`, trashRelativePath: `${TRASH_ITEMS_PATH}/${id}/payload/${document.name}`,
        document: clone(document), documentIndex, state: "trashing", revision: 1, deletedAt: now, expectedEntityRevision: dossier.value.revision,
        expiresAt: new Date(instant(now, "current") + RETENTION_MS).toISOString(), updatedAt: now, actor, transitionAuditId: this.#createId(), ...(reason ? { reason } : {}), extensions: {},
      };
      if (!isStableId(record.transitionAuditId, "op")) throw new LifecycleError("resource_operation_failed", "The transition audit identity is invalid");
      await this.#ensureItemDirectory(id); await this.#ensureDirectory(`${TRASH_ITEMS_PATH}/${id}/payload`);
      await this.#publishCatalog(loaded, [...(loaded?.value.records ?? []), record], now);
      try {
        return await this.#finishTrashing(record);
      } catch (error) {
        const source = await this.#scope.resources.stat(this.#ref(record.originalRelativePath));
        const destination = await this.#scope.resources.stat(this.#ref(record.trashRelativePath));
        if (source.exists && !destination.exists) { try { await this.#removeIntent(record); await this.#removeIfExists(`${TRASH_ITEMS_PATH}/${id}`); } catch { /* persisted intent remains recoverable */ } }
        throw this.#mapError(error);
      }
    });
  }

  async restore(recordId: string, expectedRecordRevision: number, actorValue: LifecycleInvocation, expectedDossierRevision?: number) {
    return this.#exclusive(async () => {
      await this.#ready(); await this.#recoverTransitions();
      const actor = principal(actorValue); const now = this.#now();
      const loaded = await this.#catalogState();
      if (!loaded) throw new LifecycleError("not_found", "The trash record was not found");
      const index = loaded.value.records.findIndex((record) => record.id === recordId);
      if (index < 0) throw new LifecycleError("not_found", "The trash record was not found");
      const record = loaded.value.records[index]!;
      if (record.state !== "trashed") throw new LifecycleError("conflict", "The trash record is not restorable");
      if (record.revision !== positiveRevision(expectedRecordRevision, "expectedRecordRevision")) throw new LifecycleError("conflict", "The trash record changed", { currentRevision: record.revision });
      if (instant(now, "current") >= instant(record.expiresAt, "expiry")) throw new LifecycleError("conflict", "The 30-day restore window has expired");
      const targetStat = await this.#scope.resources.stat(this.#ref(record.originalRelativePath));
      if (targetStat.exists) throw new LifecycleError("conflict", "The restore target already exists; nothing was overwritten");
      if (record.targetType === "document") {
        const dossier = await this.#readDossier(record.dossierId);
        if (dossier.value.revision !== positiveRevision(expectedDossierRevision, "expectedDossierRevision")) throw new LifecycleError("conflict", "The dossier changed before document restore", { currentRevision: dossier.value.revision });
        if (dossier.value.documents.some((item) => item.id === record.targetId || item.relativePath === record.document!.relativePath)) throw new LifecycleError("conflict", "The dossier already contains the document identity or path");
      }
      const restoring: TrashRecord = {
        ...record, state: "restoring", revision: record.revision + 1, updatedAt: now, transitionActor: actor, transitionAuditId: this.#createId(),
        ...(record.targetType === "document" ? { restoreExpectedDossierRevision: expectedDossierRevision } : {}),
      };
      if (!isStableId(restoring.transitionAuditId, "op")) throw new LifecycleError("resource_operation_failed", "The transition audit identity is invalid");
      await this.#publishCatalog(loaded, loaded.value.records.map((item, itemIndex) => itemIndex === index ? restoring : item), now);
      return this.#finishRestoring(restoring);
    });
  }

  async deleteContact(contactId: string, expectedRevision: number, actorValue: LifecycleInvocation) {
    return this.#exclusive(async () => {
      await this.#ready(); await this.#recoverTransitions();
      if (!isStableId(contactId, "con")) throw new LifecycleError("not_found", "The contact was not found");
      const actor = principal(actorValue); const loaded = await this.#catalogState();
      const references: Array<{ trashRecordId: string; dossierId: string }> = [];
      for (const record of loaded?.value.records ?? []) {
        if (record.targetType !== "dossier" || !["trashed", "purging"].includes(record.state)) continue;
        const authority = await this.#read(`${record.trashRelativePath}/dossier.json`, (value) => parseDossier(value, record.dossierId));
        if (authority?.value.contacts.some((relation) => relation.contactId === contactId)) references.push({ trashRecordId: record.id, dossierId: record.dossierId });
      }
      if (references.length) throw new LifecycleError("conflict", "The contact is still referenced by a restorable dossier", { references });
      const now = this.#now();
      const audit = this.#event({ action: "contact.delete", targetType: "contact", targetId: contactId, retention: "permanent", actor, occurredAt: now });
      const auditPath = await this.#appendAudit(audit);
      try { return await this.#catalog.deleteContact(contactId, positiveRevision(expectedRevision)); }
      catch (error) { await this.#rollbackAudit(auditPath); throw this.#mapError(error); }
    });
  }

  async preparePurge(recordId: string, expectedRecordRevision: number, actorValue: LifecycleInvocation) {
    return this.#exclusive(async () => {
      await this.#ready(); await this.#recoverTransitions();
      const actor = principal(actorValue); const now = this.#now(); const nowMs = instant(now, "current");
      const loaded = await this.#catalogState();
      if (!loaded) throw new LifecycleError("not_found", "The trash record was not found");
      const index = loaded.value.records.findIndex((record) => record.id === recordId);
      if (index < 0) throw new LifecycleError("not_found", "The trash record was not found");
      const record = loaded.value.records[index]!;
      if (record.state !== "trashed") throw new LifecycleError("confirmation_required", "Only an active Trash item can be purged");
      if (record.revision !== positiveRevision(expectedRecordRevision, "expectedRecordRevision")) throw new LifecycleError("conflict", "The trash record changed", { currentRevision: record.revision });
      if (nowMs < instant(record.expiresAt, "expiry")) throw new LifecycleError("retention_active", "The 30-day Trash retention period is still active", { expiresAt: record.expiresAt });
      await this.#assertUnreferenced(record);
      const token = this.#createToken();
      const nextRevision = record.revision + 1;
      const updated: TrashRecord = {
        ...record, revision: nextRevision, updatedAt: now,
        confirmation: { tokenHash: hash(token), actorId: actor.actorId, sessionId: actor.sessionId, targetRevision: nextRevision, expiresAt: new Date(nowMs + CONFIRMATION_MS).toISOString() },
      };
      const auditPath = await this.#appendAudit(this.#event({ action: `${record.targetType}.purge.prepare`, targetType: record.targetType, targetId: record.targetId, retention: "permanent", actor, occurredAt: now }));
      try {
        await this.#publishCatalog(loaded, loaded.value.records.map((item, itemIndex) => itemIndex === index ? updated : item), now);
        return { recordId, targetType: record.targetType, targetId: record.targetId, expectedRecordRevision: nextRevision, expiresAt: updated.confirmation!.expiresAt, confirmationToken: token };
      } catch (error) { await this.#rollbackAudit(auditPath); throw this.#mapError(error); }
    });
  }

  async confirmPurge(recordId: string, tokenValue: string, actorValue: LifecycleInvocation) {
    return this.#exclusive(async () => {
      await this.#ready(); await this.#recoverTransitions();
      const actor = principal(actorValue); const now = this.#now(); const nowMs = instant(now, "current");
      if (typeof tokenValue !== "string" || !tokenValue || tokenValue.length > 500) throw new LifecycleError("confirmation_invalid", "The purge confirmation is invalid or expired");
      const loaded = await this.#catalogState();
      const index = loaded?.value.records.findIndex((record) => record.id === recordId) ?? -1;
      if (!loaded || index < 0) throw new LifecycleError("not_found", "The trash record was not found");
      const record = loaded.value.records[index]!; const confirmation = record.confirmation;
      if (record.state !== "trashed" || !confirmation || confirmation.tokenHash !== hash(tokenValue) || confirmation.actorId !== actor.actorId || confirmation.sessionId !== actor.sessionId
        || confirmation.targetRevision !== record.revision || nowMs >= instant(confirmation.expiresAt, "confirmation expiry")) {
        throw new LifecycleError("confirmation_invalid", "The purge confirmation is invalid, expired, used, or belongs to another invocation");
      }
      if (nowMs < instant(record.expiresAt, "expiry")) throw new LifecycleError("retention_active", "The 30-day Trash retention period is still active");
      await this.#assertUnreferenced(record);
      const purging: TrashRecord = { ...record, state: "purging", revision: record.revision + 1, updatedAt: now, actor, confirmation: undefined, purgeAuditId: this.#createId() };
      if (!isStableId(purging.purgeAuditId, "op")) throw new LifecycleError("resource_operation_failed", "The purge audit identity is invalid");
      await this.#publishCatalog(loaded, loaded.value.records.map((item, itemIndex) => itemIndex === index ? purging : item), now);
      return this.#finishPurge(purging);
    });
  }

  async #assertUnreferenced(record: TrashRecord): Promise<void> {
    if (record.targetType === "dossier") {
      const active = await this.#scope.resources.stat(this.#ref(record.originalRelativePath));
      if (active.exists) throw new LifecycleError("conflict", "An active dossier now occupies the original identity or path");
      return;
    }
    try {
      const dossier = await this.#readDossier(record.dossierId);
      if (dossier.value.documents.some((item) => item.id === record.targetId || item.relativePath === record.document!.relativePath)) {
        throw new LifecycleError("conflict", "The managed document is referenced by the active dossier");
      }
    } catch (error) {
      if (error instanceof LifecycleError && error.code === "not_found") return;
      throw error;
    }
  }

  async #finishPurge(record: TrashRecord) {
    await this.#deleteTree(this.#ref(record.trashRelativePath));
    const audit = this.#event({ id: record.purgeAuditId, action: `${record.targetType}.purge`, targetType: record.targetType, targetId: record.targetId, retention: "permanent", actor: record.actor, occurredAt: record.updatedAt });
    await this.#appendAudit(audit);
    const loaded = await this.#catalogState();
    if (!loaded) throw new LifecycleError("resource_operation_failed", "The trash catalog disappeared during purge recovery");
    const index = loaded.value.records.findIndex((item) => item.id === record.id);
    if (index < 0) throw new LifecycleError("resource_operation_failed", "The purging record disappeared");
    const current = loaded.value.records[index]!;
    if (current.state === "purged") return { record: this.#recordProjection(current), purged: true as const };
    if (current.state !== "purging") throw new LifecycleError("conflict", "The purge state changed unexpectedly");
    const now = this.#now();
    const purged: TrashRecord = { ...current, state: "purged", revision: current.revision + 1, updatedAt: now };
    await this.#publishCatalog(loaded, loaded.value.records.map((item, itemIndex) => itemIndex === index ? purged : item), now);
    await this.#removeIfExists(`${TRASH_ITEMS_PATH}/${record.id}`);
    return { record: this.#recordProjection(purged), purged: true as const };
  }

  async #recoverTransitions(): Promise<void> {
    const loaded = await this.#catalogState();
    for (const record of loaded?.value.records ?? []) {
      if (record.state === "trashing") await this.#finishTrashing(record);
      else if (record.state === "restoring") await this.#finishRestoring(record);
      else if (record.state === "purging") await this.#finishPurge(record);
    }
  }

  async recordActivity(input: { action: string; targetType: AuditEvent["targetType"]; targetId?: string; result?: AuditEvent["result"]; reason?: string; retention?: AuditRetention }, actorValue: LifecycleInvocation) {
    return this.#exclusive(async () => {
      await this.#ready(); await this.#recoverTransitions();
      const event = this.#event({ ...input, retention: input.retention ?? "ordinary", actor: principal(actorValue) });
      await this.#appendAudit(event);
      return clone(event);
    });
  }

  async queryAudit(input: { retention?: AuditRetention; limit?: number } = {}) {
    await this.#ready();
    if (input.retention !== undefined && !["ordinary", "permanent"].includes(input.retention)) throw new LifecycleError("validation", "retention is invalid", { field: "retention" });
    const limit = input.limit === undefined ? 100 : Math.min(500, positiveRevision(input.limit, "limit"));
    const listing = await this.#scope.resources.list(this.#ref(AUDIT_PATH));
    const events: AuditEvent[] = [];
    let skippedUnknown = 0;
    for (const item of listing.items) {
      if (item.isDirectory || !item.name.endsWith(".json")) continue;
      try {
        const raw = await this.#scope.resources.read(appendResourcePath(this.#ref(AUDIT_PATH), item.name));
        const event = parseAudit(JSON.parse(new TextDecoder().decode(raw.content)) as unknown);
        if (!event) { skippedUnknown += 1; continue; }
        if (!input.retention || event.retention === input.retention) events.push(event);
      } catch (error) {
        if (error instanceof LifecycleError) throw error;
        throw new LifecycleError("resource_operation_failed", "A known audit file could not be read");
      }
    }
    events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id));
    return { items: events.slice(0, limit).map(clone), skippedUnknown, totalKnown: events.length };
  }

  async cleanupAudit(actorValue: LifecycleInvocation) {
    return this.#exclusive(async () => {
      await this.#ready(); await this.#recoverTransitions();
      const actor = principal(actorValue); const now = this.#now(); const cutoffDate = new Date(instant(now, "current"));
      cutoffDate.setUTCFullYear(cutoffDate.getUTCFullYear() - 1);
      const cutoff = cutoffDate.valueOf();
      const listing = await this.#scope.resources.list(this.#ref(AUDIT_PATH));
      let removed = 0; let skippedUnknown = 0;
      for (const item of listing.items) {
        if (item.isDirectory || !item.name.endsWith(".json")) continue;
        const ref = appendResourcePath(this.#ref(AUDIT_PATH), item.name);
        const raw = await this.#scope.resources.read(ref);
        let event: AuditEvent | null;
        try { event = parseAudit(JSON.parse(new TextDecoder().decode(raw.content)) as unknown); }
        catch (error) { if (error instanceof LifecycleError) throw error; throw new LifecycleError("resource_operation_failed", "A known audit file could not be read"); }
        if (!event) { skippedUnknown += 1; continue; }
        if (event.retention === "ordinary" && instant(event.occurredAt, "audit") < cutoff) { await this.#scope.resources.delete(ref); removed += 1; }
      }
      const cleanup = this.#event({ action: "audit.retention_cleanup", targetType: "audit", targetId: "audit", reason: "retention_policy", retention: "permanent", actor, occurredAt: now });
      await this.#appendAudit(cleanup);
      return { removed, skippedUnknown, cutoff: new Date(cutoff).toISOString(), auditEventId: cleanup.id };
    });
  }

  #mapError(error: unknown): LifecycleError {
    if (error instanceof LifecycleError) return error;
    if (error instanceof CatalogError) {
      if (error.code === "not_found") return new LifecycleError("not_found", "The lifecycle target was not found", error.details);
      if (error.code === "conflict" || error.code === "reference_conflict") return new LifecycleError("conflict", "The lifecycle target changed or remains referenced", error.details);
      if (error.code === "validation") return new LifecycleError("validation", "The lifecycle input is invalid", error.details);
      if (error.code === "library_blocked") return new LifecycleError("library_blocked", "The dossier library is blocked", error.details);
    }
    return new LifecycleError("resource_operation_failed", "The lifecycle operation could not be completed");
  }
}
