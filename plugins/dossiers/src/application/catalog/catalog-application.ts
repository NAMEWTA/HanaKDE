import { randomUUID } from "node:crypto";

import { isStableId } from "../../domain/ids.ts";
import { serializeJson } from "../../domain/library-schema.ts";
import { appendResourcePath } from "../../infrastructure/workspace/resource-path.ts";
import type { HanaResourceVersion } from "../../infrastructure/workspace/resource-port.ts";
import type { DossiersRequestScope, DossiersRuntime } from "../../runtime.ts";
import { CatalogError } from "./errors.ts";
import {
  builtinTypes,
  CATALOG_SCHEMA_VERSION,
  normalizedKey,
  normalizedName,
  normalizedStringList,
  validateFieldDefinitions,
  validateFieldValues,
  type ContactCatalogRecord,
  type ContactRecord,
  type ContactRelation,
  type DossierProjection,
  type DossierRecord,
  type DossierTypeRecord,
  type FieldDefinition,
  type FieldValue,
  type TypeCatalogRecord,
} from "./models.ts";

const TYPES_PATH = "Dossiers/types/types.json";
const CONTACTS_PATH = "Dossiers/contacts/contacts.json";
const DOSSIERS_PATH = "Dossiers/dossiers";
const SAFE_MERGE_KEYS = new Set(["name", "typeId", "fields", "tags", "extensions"]);
const CONTACT_KEYS = new Set(["name", "organization", "title", "emails", "phones", "notes", "extensions"]);
const MUTATION_TAILS = new Map<string, Promise<void>>();

export type CatalogIdKind = "dossier" | "type" | "contact" | "operation" | "field";

export interface CatalogApplicationInput {
  runtime: DossiersRuntime;
  scope: DossiersRequestScope;
  now?: () => string;
  createId?: (kind: CatalogIdKind) => string;
}

export interface TypeInput {
  key: string;
  name: string;
  fields: Array<Omit<FieldDefinition, "id"> & { id?: string }>;
  extensions?: Record<string, unknown>;
}

interface TypeUpdateInput {
  key?: string;
  name?: string;
  fields?: FieldDefinition[];
  extensions?: Record<string, unknown>;
}

export interface DossierInput {
  name: string;
  typeId: string;
  fields: Record<string, FieldValue>;
  tags?: string[];
  extensions?: Record<string, unknown>;
}

export interface ContactInput {
  name: string;
  organization?: string;
  title?: string;
  emails?: string[];
  phones?: string[];
  notes?: string;
  extensions?: Record<string, unknown>;
}

interface Loaded<T> {
  value: T;
  version: HanaResourceVersion;
}

type TypeMigrationRisk =
  | { field: FieldDefinition; mode: "existing-value" }
  | { field: FieldDefinition; mode: "removed-enum-value"; allowed: string[] }
  | { field: FieldDefinition; mode: "missing-required" };

function defaultCreateId(kind: CatalogIdKind): string {
  const prefix: Record<CatalogIdKind, string> = {
    dossier: "dos",
    type: "typ",
    contact: "con",
    operation: "op",
    field: "fld",
  };
  return `${prefix[kind]}_${randomUUID().replaceAll("-", "")}`;
}

function dossierPath(id: string): string {
  return `${DOSSIERS_PATH}/${id}/dossier.json`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CatalogError("resource_operation_failed", message);
  return value as Record<string, unknown>;
}

function assertAllowedKeys(value: object, allowed: Set<string>): void {
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new CatalogError("validation", "The request contains unsupported properties");
  }
}

function asExtensions(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CatalogError("validation", "extensions must be an object");
  return clone(value as Record<string, unknown>);
}

function boundedLimit(value: unknown, fallback = 50): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw new CatalogError("validation", "limit must be a positive integer", { field: "limit" });
  }
  return Math.min(200, value);
}

function optionalText(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > maxLength) throw new CatalogError("validation", `${field} is invalid`, { field });
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeContact(input: ContactInput): Omit<ContactRecord, "kind" | "schemaVersion" | "id" | "revision" | "createdAt" | "updatedAt"> {
  assertAllowedKeys(input, CONTACT_KEYS);
  let name: string;
  try {
    name = normalizedName(input.name);
  } catch {
    throw new CatalogError("validation", "Contact name is invalid", { field: "name" });
  }
  let emails: string[];
  let phones: string[];
  try {
    emails = normalizedStringList(input.emails, "emails", 320);
    phones = normalizedStringList(input.phones, "phones", 64);
  } catch {
    throw new CatalogError("validation", "Contact channels are invalid");
  }
  if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new CatalogError("validation", "Contact email is invalid", { field: "emails" });
  }
  if (phones.some((phone) => !/^[+()0-9][+()0-9 .-]{2,63}$/.test(phone))) {
    throw new CatalogError("validation", "Contact phone is invalid", { field: "phones" });
  }
  return {
    name,
    organization: optionalText(input.organization, "organization", 240),
    title: optionalText(input.title, "title", 240),
    emails,
    phones,
    notes: optionalText(input.notes, "notes", 20_000),
    extensions: asExtensions(input.extensions),
  };
}

function parseTypeCatalog(value: unknown): TypeCatalogRecord {
  const parsed = record(value, "The type catalog is invalid");
  if (
    parsed.kind !== "hana.dossiers.type-catalog"
    || parsed.schemaVersion !== CATALOG_SCHEMA_VERSION
    || !Number.isInteger(parsed.revision)
    || (parsed.revision as number) < 1
    || !Array.isArray(parsed.types)
  ) throw new CatalogError("resource_operation_failed", "The type catalog is invalid");
  const ids = new Set<string>();
  const keys = new Set<string>();
  const types = parsed.types.map((value) => {
    const type = record(value, "The type catalog is invalid");
    let fields: FieldDefinition[];
    try {
      fields = validateFieldDefinitions(type.fields);
    } catch {
      throw new CatalogError("resource_operation_failed", "The type catalog is invalid");
    }
    if (
      type.kind !== "hana.dossiers.dossier-type"
      || type.schemaVersion !== CATALOG_SCHEMA_VERSION
      || !isStableId(type.id, "typ")
      || typeof type.key !== "string"
      || typeof type.name !== "string"
      || typeof type.builtin !== "boolean"
      || !Number.isInteger(type.revision)
      || (type.revision as number) < 1
      || typeof type.createdAt !== "string"
      || typeof type.updatedAt !== "string"
      || !type.extensions || typeof type.extensions !== "object" || Array.isArray(type.extensions)
    ) throw new CatalogError("resource_operation_failed", "The type catalog is invalid");
    try {
      normalizedKey(type.key);
      normalizedName(type.name);
    } catch {
      throw new CatalogError("resource_operation_failed", "The type catalog is invalid");
    }
    if (ids.has(type.id) || keys.has(type.key)) throw new CatalogError("resource_operation_failed", "The type catalog contains duplicate identities");
    ids.add(type.id);
    keys.add(type.key);
    return { ...type, fields, extensions: clone(type.extensions as Record<string, unknown>) } as unknown as DossierTypeRecord;
  });
  if (
    typeof parsed.createdAt !== "string"
    || typeof parsed.updatedAt !== "string"
    || !parsed.extensions || typeof parsed.extensions !== "object" || Array.isArray(parsed.extensions)
  ) throw new CatalogError("resource_operation_failed", "The type catalog is invalid");
  for (const key of ["person", "organization", "project"]) {
    if (!types.some((type) => type.key === key && type.builtin)) {
      throw new CatalogError("resource_operation_failed", "The type catalog is missing a built-in type");
    }
  }
  return { ...parsed, types, extensions: clone(parsed.extensions as Record<string, unknown>) } as unknown as TypeCatalogRecord;
}

function parseContactCatalog(value: unknown): ContactCatalogRecord {
  const parsed = record(value, "The contact catalog is invalid");
  if (
    parsed.kind !== "hana.dossiers.contact-catalog"
    || parsed.schemaVersion !== CATALOG_SCHEMA_VERSION
    || !Number.isInteger(parsed.revision)
    || (parsed.revision as number) < 1
    || !Array.isArray(parsed.contacts)
  ) throw new CatalogError("resource_operation_failed", "The contact catalog is invalid");
  const ids = new Set<string>();
  const contacts = parsed.contacts.map((value) => {
    const contact = record(value, "The contact catalog is invalid");
    if (
      contact.kind !== "hana.dossiers.contact"
      || contact.schemaVersion !== CATALOG_SCHEMA_VERSION
      || !isStableId(contact.id, "con")
      || !Number.isInteger(contact.revision)
      || (contact.revision as number) < 1
      || typeof contact.createdAt !== "string"
      || typeof contact.updatedAt !== "string"
      || !Array.isArray(contact.emails)
      || !Array.isArray(contact.phones)
      || !contact.extensions || typeof contact.extensions !== "object" || Array.isArray(contact.extensions)
    ) throw new CatalogError("resource_operation_failed", "The contact catalog is invalid");
    let normalized;
    try {
      normalized = normalizeContact({
        name: contact.name as string,
        emails: contact.emails as string[],
        phones: contact.phones as string[],
        extensions: contact.extensions as Record<string, unknown>,
        ...(contact.organization === undefined ? {} : { organization: contact.organization as string }),
        ...(contact.title === undefined ? {} : { title: contact.title as string }),
        ...(contact.notes === undefined ? {} : { notes: contact.notes as string }),
      });
    } catch {
      throw new CatalogError("resource_operation_failed", "The contact catalog is invalid");
    }
    if (ids.has(contact.id)) throw new CatalogError("resource_operation_failed", "The contact catalog contains duplicate identities");
    ids.add(contact.id);
    return { ...contact, ...normalized } as unknown as ContactRecord;
  });
  if (
    typeof parsed.createdAt !== "string"
    || typeof parsed.updatedAt !== "string"
    || !parsed.extensions || typeof parsed.extensions !== "object" || Array.isArray(parsed.extensions)
  ) throw new CatalogError("resource_operation_failed", "The contact catalog is invalid");
  return { ...parsed, contacts, extensions: clone(parsed.extensions as Record<string, unknown>) } as unknown as ContactCatalogRecord;
}

function parseDossier(value: unknown, expectedId: string): DossierRecord {
  const parsed = record(value, "The dossier manifest is invalid");
  if (
    parsed.kind !== "hana.dossiers.dossier"
    || parsed.schemaVersion !== CATALOG_SCHEMA_VERSION
    || parsed.id !== expectedId
    || !isStableId(parsed.id, "dos")
    || !isStableId(parsed.typeId, "typ")
    || typeof parsed.name !== "string"
    || !parsed.fields || typeof parsed.fields !== "object" || Array.isArray(parsed.fields)
    || !Array.isArray(parsed.tags)
    || !Array.isArray(parsed.contacts)
    || !Array.isArray(parsed.documents)
    || !Number.isInteger(parsed.revision)
    || (parsed.revision as number) < 1
    || typeof parsed.createdAt !== "string"
    || typeof parsed.updatedAt !== "string"
    || !parsed.extensions || typeof parsed.extensions !== "object" || Array.isArray(parsed.extensions)
    || "relationships" in parsed
  ) throw new CatalogError("resource_operation_failed", "The dossier manifest is invalid");
  if (
    Object.values(parsed.fields as Record<string, unknown>).some((field) => field !== null && !["string", "number", "boolean"].includes(typeof field))
    || (parsed.tags as unknown[]).some((tag) => typeof tag !== "string")
  ) throw new CatalogError("resource_operation_failed", "The dossier manifest is invalid");
  const contacts = (parsed.contacts as unknown[]).map((value) => {
    const relation = record(value, "The dossier contact relation is invalid");
    if (
      !isStableId(relation.contactId, "con")
      || typeof relation.role !== "string"
      || !relation.role.trim()
      || relation.role.length > 120
      || !relation.extensions || typeof relation.extensions !== "object" || Array.isArray(relation.extensions)
    ) throw new CatalogError("resource_operation_failed", "The dossier contact relation is invalid");
    return { ...relation, role: relation.role.trim(), extensions: clone(relation.extensions as Record<string, unknown>) } as unknown as ContactRelation;
  });
  if (new Set(contacts.map((relation) => relation.contactId)).size !== contacts.length) {
    throw new CatalogError("resource_operation_failed", "The dossier contains duplicate contact relations");
  }
  return {
    ...parsed,
    contacts,
    extensions: clone(parsed.extensions as Record<string, unknown>),
  } as unknown as DossierRecord;
}

function typeById(catalog: TypeCatalogRecord, id: string): DossierTypeRecord {
  const value = catalog.types.find((item) => item.id === id);
  if (!value) throw new CatalogError("not_found", "Dossier type was not found", { entity: "type" });
  return value;
}

function contactById(catalog: ContactCatalogRecord, id: string): ContactRecord {
  const value = catalog.contacts.find((item) => item.id === id);
  if (!value) throw new CatalogError("not_found", "Contact was not found", { entity: "contact" });
  return value;
}

export class CatalogApplication {
  readonly #runtime: DossiersRuntime;
  readonly #scope: DossiersRequestScope;
  readonly #now: () => string;
  readonly #createId: (kind: CatalogIdKind) => string;

  constructor(input: CatalogApplicationInput) {
    this.#runtime = input.runtime;
    this.#scope = input.scope;
    this.#now = input.now ?? (() => new Date().toISOString());
    this.#createId = input.createId ?? defaultCreateId;
  }

  async #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const root = this.#scope.workspaceRoot;
    const key = root.kind === "mount" ? `mount:${root.mountId}:${root.path}` : `local:${root.path}`;
    const previous = MUTATION_TAILS.get(key) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
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

  #createFields(value: TypeInput["fields"]): FieldDefinition[] {
    if (!Array.isArray(value)) throw new CatalogError("validation", "The dossier type definition is invalid");
    const prepared = value.map((field) => ({
      ...field,
      id: typeof field.id === "string" ? field.id : this.#createId("field"),
    }));
    try {
      return validateFieldDefinitions(prepared);
    } catch {
      throw new CatalogError("validation", "The dossier type definition is invalid");
    }
  }

  async initialize() {
    const library = await this.#runtime.openLibrary(this.#scope);
    if (library.state !== "ready") return library;
    await Promise.all([this.#types(), this.#contacts()]);
    return library;
  }

  async #ready(): Promise<void> {
    const opened = await this.initialize();
    if (opened.state !== "ready") {
      throw new CatalogError("library_blocked", "The workspace dossier library is not writable", {
        state: opened.state,
        reason: opened.reason ?? "unknown",
      });
    }
  }

  async #read<T>(path: string, parse: (value: unknown) => T): Promise<Loaded<T>> {
    const target = appendResourcePath(this.#scope.workspaceRoot, path);
    let result;
    try {
      result = await this.#scope.resources.read(target);
    } catch {
      throw new CatalogError("resource_operation_failed", "The catalog authority could not be read");
    }
    if (!result.version) throw new CatalogError("resource_operation_failed", "The catalog authority has no version");
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder().decode(result.content));
    } catch {
      throw new CatalogError("resource_operation_failed", "The catalog authority is not valid JSON");
    }
    return { value: parse(value), version: result.version };
  }

  async #write(path: string, value: unknown, expectedVersion: HanaResourceVersion | null): Promise<void> {
    const operationId = this.#createId("operation");
    if (!isStableId(operationId, "op")) throw new CatalogError("resource_operation_failed", "The operation identity is invalid");
    const repository = this.#runtime.jsonRepository(this.#scope);
    const input = {
      operationId,
      targetPath: path,
      value,
      expectedVersion,
      now: this.#now(),
    };
    let result = await repository.write(input);
    if (result.status === "failed") {
      try {
        const target = appendResourcePath(this.#scope.workspaceRoot, path);
        const stat = await this.#scope.resources.stat(target);
        if (stat.exists && !stat.isDirectory) {
          const current = new TextDecoder().decode((await this.#scope.resources.read(target)).content);
          if (current === serializeJson(value)) result = await repository.write(input);
        }
      } catch {
        // The stable error below is authoritative when recovery inspection fails.
      }
    }
    if (result.status === "conflict") throw new CatalogError("conflict", "The catalog changed; refresh and retry");
    if (result.status === "failed") throw new CatalogError("resource_operation_failed", "The catalog write could not be published");
  }

  async #types(): Promise<Loaded<TypeCatalogRecord>> {
    const target = appendResourcePath(this.#scope.workspaceRoot, TYPES_PATH);
    let stat;
    try {
      stat = await this.#scope.resources.stat(target);
    } catch {
      throw new CatalogError("resource_operation_failed", "The type catalog could not be inspected");
    }
    if (stat.exists) return this.#read(TYPES_PATH, parseTypeCatalog);
    const now = this.#now();
    const value: TypeCatalogRecord = {
      kind: "hana.dossiers.type-catalog",
      schemaVersion: CATALOG_SCHEMA_VERSION,
      revision: 1,
      types: builtinTypes(now),
      createdAt: now,
      updatedAt: now,
      extensions: {},
    };
    try {
      await this.#write(TYPES_PATH, value, null);
    } catch (error) {
      if (!(error instanceof CatalogError) || error.code !== "conflict") throw error;
    }
    return this.#read(TYPES_PATH, parseTypeCatalog);
  }

  async #contacts(): Promise<Loaded<ContactCatalogRecord>> {
    const target = appendResourcePath(this.#scope.workspaceRoot, CONTACTS_PATH);
    let stat;
    try {
      stat = await this.#scope.resources.stat(target);
    } catch {
      throw new CatalogError("resource_operation_failed", "The contact catalog could not be inspected");
    }
    if (stat.exists) return this.#read(CONTACTS_PATH, parseContactCatalog);
    const now = this.#now();
    const value: ContactCatalogRecord = {
      kind: "hana.dossiers.contact-catalog",
      schemaVersion: CATALOG_SCHEMA_VERSION,
      revision: 1,
      contacts: [],
      createdAt: now,
      updatedAt: now,
      extensions: {},
    };
    try {
      await this.#write(CONTACTS_PATH, value, null);
    } catch (error) {
      if (!(error instanceof CatalogError) || error.code !== "conflict") throw error;
    }
    return this.#read(CONTACTS_PATH, parseContactCatalog);
  }

  async listTypes(): Promise<{ items: DossierTypeRecord[] }> {
    await this.#ready();
    return { items: clone((await this.#types()).value.types) };
  }

  async createType(input: TypeInput): Promise<DossierTypeRecord> {
    return this.#exclusive(() => this.#createType(input));
  }

  async #createType(input: TypeInput): Promise<DossierTypeRecord> {
    await this.#ready();
    assertAllowedKeys(input, new Set(["key", "name", "fields", "extensions"]));
    let key: string;
    let name: string;
    let fields: FieldDefinition[];
    try {
      key = normalizedKey(input.key);
      name = normalizedName(input.name);
      fields = this.#createFields(input.fields);
    } catch {
      throw new CatalogError("validation", "The dossier type definition is invalid");
    }
    const loaded = await this.#types();
    if (loaded.value.types.some((item) => item.key === key)) throw new CatalogError("conflict", "The dossier type key already exists", { field: "key" });
    const id = this.#createId("type");
    if (!isStableId(id, "typ")) throw new CatalogError("resource_operation_failed", "The type identity is invalid");
    const now = this.#now();
    const created: DossierTypeRecord = {
      kind: "hana.dossiers.dossier-type",
      schemaVersion: CATALOG_SCHEMA_VERSION,
      id,
      key,
      name,
      builtin: false,
      fields,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      extensions: asExtensions(input.extensions),
    };
    const next = clone(loaded.value);
    next.types.push(created);
    next.revision += 1;
    next.updatedAt = now;
    await this.#write(TYPES_PATH, next, loaded.version);
    return clone(created);
  }

  async previewTypeUpdate(id: string, patch: TypeUpdateInput): Promise<{
    requiresMigration: boolean;
    impactedDossierIds: string[];
    impactedFieldIds: string[];
  }> {
    await this.#ready();
    const loaded = await this.#types();
    const current = typeById(loaded.value, id);
    let proposedFields = current.fields;
    if (patch.fields !== undefined) {
      try {
        proposedFields = validateFieldDefinitions(patch.fields);
      } catch {
        throw new CatalogError("validation", "The proposed field definition is invalid");
      }
    }
    const existing = new Map(current.fields.map((field) => [field.id, field]));
    const proposed = new Map(proposedFields.map((field) => [field.id, field]));
    const risky: TypeMigrationRisk[] = [];
    for (const field of current.fields) {
      const next = proposed.get(field.id);
      if (!next || next.type !== field.type) risky.push({ field, mode: "existing-value" });
      else if (field.type === "enum" && (field.options?.some((option) => !next.options?.includes(option)) ?? false)) {
        risky.push({ field, mode: "removed-enum-value", allowed: next.options ?? [] });
      } else if (!field.required && next.required) risky.push({ field: next, mode: "missing-required" });
    }
    for (const field of proposedFields) {
      if (!existing.has(field.id) && field.required) risky.push({ field, mode: "missing-required" });
    }
    if (risky.length === 0) return { requiresMigration: false, impactedDossierIds: [], impactedFieldIds: [] };
    const dossiers = await this.#dossierRecords();
    const isImpacted = (dossier: DossierRecord, risk: typeof risky[number]): boolean => {
      const value = dossier.fields[risk.field.id];
      if (risk.mode === "missing-required") return value === undefined || value === null;
      if (risk.mode === "removed-enum-value") return typeof value === "string" && !risk.allowed.includes(value);
      return value !== undefined && value !== null;
    };
    const impactedDossierIds = dossiers
      .filter((dossier) => dossier.typeId === id && risky.some((risk) => isImpacted(dossier, risk)))
      .map((dossier) => dossier.id)
      .sort();
    const impactedFieldIds = risky
      .filter((risk) => dossiers.some((dossier) => dossier.typeId === id && isImpacted(dossier, risk)))
      .map((risk) => risk.field.id)
      .sort();
    return { requiresMigration: impactedDossierIds.length > 0, impactedDossierIds, impactedFieldIds };
  }

  async updateType(id: string, expectedRevision: number, patch: TypeUpdateInput): Promise<DossierTypeRecord> {
    return this.#exclusive(() => this.#updateType(id, expectedRevision, patch));
  }

  async #updateType(id: string, expectedRevision: number, patch: TypeUpdateInput): Promise<DossierTypeRecord> {
    await this.#ready();
    assertAllowedKeys(patch, new Set(["key", "name", "fields", "extensions"]));
    const loaded = await this.#types();
    const index = loaded.value.types.findIndex((item) => item.id === id);
    if (index < 0) throw new CatalogError("not_found", "Dossier type was not found", { entity: "type" });
    const current = loaded.value.types[index]!;
    if (current.revision !== expectedRevision) throw new CatalogError("conflict", "The dossier type changed; refresh and retry", { currentRevision: current.revision });
    if (current.builtin && patch.key !== undefined && patch.key !== current.key) {
      throw new CatalogError("validation", "Built-in dossier type keys cannot be changed");
    }
    const preview = await this.previewTypeUpdate(id, patch);
    if (preview.requiresMigration) {
      throw new CatalogError("migration_required", "The type change requires a controlled migration", preview);
    }
    let key = current.key;
    let name = current.name;
    let fields = current.fields;
    try {
      if (patch.key !== undefined) key = normalizedKey(patch.key);
      if (patch.name !== undefined) name = normalizedName(patch.name);
      if (patch.fields !== undefined) fields = validateFieldDefinitions(patch.fields);
    } catch {
      throw new CatalogError("validation", "The dossier type update is invalid");
    }
    if (loaded.value.types.some((item) => item.id !== id && item.key === key)) throw new CatalogError("conflict", "The dossier type key already exists", { field: "key" });
    const now = this.#now();
    const updated: DossierTypeRecord = {
      ...current,
      key,
      name,
      fields,
      revision: current.revision + 1,
      updatedAt: now,
      extensions: patch.extensions === undefined ? current.extensions : asExtensions(patch.extensions),
    };
    const next = clone(loaded.value);
    next.types[index] = updated;
    next.revision += 1;
    next.updatedAt = now;
    await this.#write(TYPES_PATH, next, loaded.version);
    return clone(updated);
  }

  async deleteType(id: string, expectedRevision: number): Promise<{ deleted: true; id: string }> {
    return this.#exclusive(() => this.#deleteType(id, expectedRevision));
  }

  async #deleteType(id: string, expectedRevision: number): Promise<{ deleted: true; id: string }> {
    await this.#ready();
    const loaded = await this.#types();
    const index = loaded.value.types.findIndex((item) => item.id === id);
    if (index < 0) throw new CatalogError("not_found", "Dossier type was not found", { entity: "type" });
    const current = loaded.value.types[index]!;
    if (current.revision !== expectedRevision) throw new CatalogError("conflict", "The dossier type changed; refresh and retry", { currentRevision: current.revision });
    if (current.builtin) throw new CatalogError("validation", "Built-in dossier types cannot be deleted");
    const references = (await this.#dossierRecords()).filter((dossier) => dossier.typeId === id).map((dossier) => dossier.id).sort();
    if (references.length) throw new CatalogError("reference_conflict", "The dossier type is still in use", { references });
    const next = clone(loaded.value);
    next.types.splice(index, 1);
    next.revision += 1;
    next.updatedAt = this.#now();
    await this.#write(TYPES_PATH, next, loaded.version);
    return { deleted: true, id };
  }

  async createDossier(input: DossierInput): Promise<DossierProjection> {
    return this.#exclusive(() => this.#createDossier(input));
  }

  async #createDossier(input: DossierInput): Promise<DossierProjection> {
    await this.#ready();
    assertAllowedKeys(input, SAFE_MERGE_KEYS);
    const types = (await this.#types()).value;
    const type = typeById(types, input.typeId);
    let name: string;
    let fields: Record<string, FieldValue>;
    let tags: string[];
    try {
      name = normalizedName(input.name);
      fields = validateFieldValues(type, input.fields);
      tags = normalizedStringList(input.tags, "tags", 120);
    } catch {
      throw new CatalogError("validation", "The dossier input is invalid");
    }
    const id = this.#createId("dossier");
    if (!isStableId(id, "dos")) throw new CatalogError("resource_operation_failed", "The dossier identity is invalid");
    const directory = appendResourcePath(this.#scope.workspaceRoot, `${DOSSIERS_PATH}/${id}`);
    const stat = await this.#scope.resources.stat(directory);
    if (stat.exists) throw new CatalogError("conflict", "The dossier identity already exists");
    try {
      await this.#scope.resources.mkdir(directory);
    } catch {
      throw new CatalogError("resource_operation_failed", "The dossier directory could not be created");
    }
    const now = this.#now();
    const created: DossierRecord = {
      kind: "hana.dossiers.dossier",
      schemaVersion: CATALOG_SCHEMA_VERSION,
      id,
      name,
      typeId: type.id,
      fields,
      tags,
      contacts: [],
      documents: [],
      revision: 1,
      createdAt: now,
      updatedAt: now,
      extensions: asExtensions(input.extensions),
    };
    try {
      await this.#write(dossierPath(id), created, null);
    } catch (error) {
      try {
        const listing = await this.#scope.resources.list(directory);
        if (listing.items.length === 0) await this.#scope.resources.delete(directory);
      } catch {
        // An empty, non-authoritative directory is safe to retry or clean later.
      }
      throw error;
    }
    return this.#project(created, types, (await this.#contacts()).value);
  }

  async #dossier(id: string): Promise<Loaded<DossierRecord>> {
    if (!isStableId(id, "dos")) throw new CatalogError("not_found", "Dossier was not found", { entity: "dossier" });
    const target = appendResourcePath(this.#scope.workspaceRoot, dossierPath(id));
    let stat;
    try {
      stat = await this.#scope.resources.stat(target);
    } catch {
      throw new CatalogError("resource_operation_failed", "The dossier could not be inspected");
    }
    if (!stat.exists || stat.isDirectory) throw new CatalogError("not_found", "Dossier was not found", { entity: "dossier" });
    return this.#read(dossierPath(id), (value) => parseDossier(value, id));
  }

  async #dossierRecords(): Promise<DossierRecord[]> {
    const root = appendResourcePath(this.#scope.workspaceRoot, DOSSIERS_PATH);
    let listing;
    try {
      listing = await this.#scope.resources.list(root);
    } catch {
      throw new CatalogError("resource_operation_failed", "Dossiers could not be listed");
    }
    const ids = listing.items.filter((item) => item.isDirectory && isStableId(item.name, "dos")).map((item) => item.name).sort();
    const records: DossierRecord[] = [];
    for (const id of ids) {
      try {
        records.push((await this.#dossier(id)).value);
      } catch (error) {
        if (!(error instanceof CatalogError) || error.code !== "not_found") throw error;
      }
    }
    return records;
  }

  #project(dossier: DossierRecord, types: TypeCatalogRecord, contacts: ContactCatalogRecord): DossierProjection {
    const type = typeById(types, dossier.typeId);
    return {
      ...clone(dossier),
      type: clone(type),
      contacts: dossier.contacts.map((relation) => ({ ...clone(relation), contact: clone(contactById(contacts, relation.contactId)) })),
      dossierRef: dossierPath(dossier.id),
    };
  }

  async getDossier(id: string): Promise<DossierProjection> {
    await this.#ready();
    const [dossier, types, contacts] = await Promise.all([this.#dossier(id), this.#types(), this.#contacts()]);
    return this.#project(dossier.value, types.value, contacts.value);
  }

  async listDossiers(input: { limit?: number; cursor?: string; typeId?: string; query?: string; tags?: string[] } = {}): Promise<{
    items: DossierProjection[];
    nextCursor: string | null;
  }> {
    await this.#ready();
    const limit = boundedLimit(input.limit);
    if (input.cursor !== undefined && typeof input.cursor !== "string") throw new CatalogError("validation", "cursor must be a string", { field: "cursor" });
    if (input.query !== undefined && typeof input.query !== "string") throw new CatalogError("validation", "query must be a string", { field: "query" });
    const [records, types, contacts] = await Promise.all([this.#dossierRecords(), this.#types(), this.#contacts()]);
    const query = input.query?.trim().toLocaleLowerCase();
    const tags = new Set(input.tags ?? []);
    const filtered = records.filter((item) => {
      if (input.cursor && item.id <= input.cursor) return false;
      if (input.typeId && item.typeId !== input.typeId) return false;
      if (tags.size && ![...tags].every((tag) => item.tags.includes(tag))) return false;
      if (!query) return true;
      const contactNames = item.contacts.map((relation) => contacts.value.contacts.find((contact) => contact.id === relation.contactId)?.name ?? "");
      const dossierType = types.value.types.find((type) => type.id === item.typeId);
      const haystack = [item.name, dossierType?.key, dossierType?.name, ...item.tags, ...Object.values(item.fields).map(String), ...contactNames]
        .filter(Boolean)
        .join("\n")
        .toLocaleLowerCase();
      return haystack.includes(query);
    });
    const selected = filtered.slice(0, limit);
    return {
      items: selected.map((item) => this.#project(item, types.value, contacts.value)),
      nextCursor: filtered.length > limit ? selected.at(-1)?.id ?? null : null,
    };
  }

  async updateDossier(id: string, expectedRevision: number, patch: Partial<DossierInput>): Promise<DossierProjection> {
    return this.#exclusive(() => this.#updateDossier(id, expectedRevision, patch));
  }

  async #updateDossier(id: string, expectedRevision: number, patch: Partial<DossierInput>): Promise<DossierProjection> {
    await this.#ready();
    assertAllowedKeys(patch, SAFE_MERGE_KEYS);
    const [loaded, types, contacts] = await Promise.all([this.#dossier(id), this.#types(), this.#contacts()]);
    if (loaded.value.revision !== expectedRevision) {
      throw new CatalogError("conflict", "The dossier changed; refresh and retry", { currentRevision: loaded.value.revision });
    }
    const type = typeById(types.value, patch.typeId ?? loaded.value.typeId);
    let name = loaded.value.name;
    let fields = loaded.value.fields;
    let tags = loaded.value.tags;
    try {
      if (patch.name !== undefined) name = normalizedName(patch.name);
      fields = validateFieldValues(type, patch.fields === undefined ? fields : { ...fields, ...patch.fields });
      if (patch.tags !== undefined) tags = normalizedStringList(patch.tags, "tags", 120);
    } catch {
      throw new CatalogError("validation", "The dossier update is invalid");
    }
    const updated: DossierRecord = {
      ...loaded.value,
      name,
      typeId: type.id,
      fields,
      tags,
      revision: loaded.value.revision + 1,
      updatedAt: this.#now(),
      extensions: patch.extensions === undefined ? loaded.value.extensions : asExtensions(patch.extensions),
    };
    try {
      await this.#write(dossierPath(id), updated, loaded.version);
    } catch (error) {
      if (error instanceof CatalogError && error.code === "conflict") {
        const current = await this.#dossier(id);
        throw new CatalogError("conflict", "The dossier changed; refresh and retry", { currentRevision: current.value.revision });
      }
      throw error;
    }
    return this.#project(updated, types.value, contacts.value);
  }

  async listContacts(input: { limit?: number; cursor?: string; query?: string } = {}): Promise<{ items: ContactRecord[]; nextCursor: string | null }> {
    await this.#ready();
    const limit = boundedLimit(input.limit);
    if (input.cursor !== undefined && typeof input.cursor !== "string") throw new CatalogError("validation", "cursor must be a string", { field: "cursor" });
    if (input.query !== undefined && typeof input.query !== "string") throw new CatalogError("validation", "query must be a string", { field: "query" });
    const query = input.query?.trim().toLocaleLowerCase();
    const contacts = (await this.#contacts()).value.contacts
      .filter((item) => !input.cursor || item.id > input.cursor)
      .filter((item) => !query || [item.name, item.organization, item.title, ...item.emails, ...item.phones].filter(Boolean).join("\n").toLocaleLowerCase().includes(query))
      .sort((a, b) => a.id.localeCompare(b.id));
    const items = contacts.slice(0, limit);
    return { items: clone(items), nextCursor: contacts.length > limit ? items.at(-1)?.id ?? null : null };
  }

  async getContact(id: string): Promise<ContactRecord> {
    await this.#ready();
    return clone(contactById((await this.#contacts()).value, id));
  }

  async createContact(input: ContactInput): Promise<ContactRecord> {
    return this.#exclusive(() => this.#createContact(input));
  }

  async #createContact(input: ContactInput): Promise<ContactRecord> {
    await this.#ready();
    const normalized = normalizeContact(input);
    const loaded = await this.#contacts();
    const id = this.#createId("contact");
    if (!isStableId(id, "con")) throw new CatalogError("resource_operation_failed", "The contact identity is invalid");
    const now = this.#now();
    const created: ContactRecord = {
      kind: "hana.dossiers.contact",
      schemaVersion: CATALOG_SCHEMA_VERSION,
      id,
      ...normalized,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    const next = clone(loaded.value);
    next.contacts.push(created);
    next.revision += 1;
    next.updatedAt = now;
    await this.#write(CONTACTS_PATH, next, loaded.version);
    return clone(created);
  }

  async updateContact(id: string, expectedRevision: number, patch: Partial<ContactInput>): Promise<ContactRecord> {
    return this.#exclusive(() => this.#updateContact(id, expectedRevision, patch));
  }

  async #updateContact(id: string, expectedRevision: number, patch: Partial<ContactInput>): Promise<ContactRecord> {
    await this.#ready();
    assertAllowedKeys(patch, CONTACT_KEYS);
    const loaded = await this.#contacts();
    const index = loaded.value.contacts.findIndex((item) => item.id === id);
    if (index < 0) throw new CatalogError("not_found", "Contact was not found", { entity: "contact" });
    const current = loaded.value.contacts[index]!;
    if (current.revision !== expectedRevision) throw new CatalogError("conflict", "The contact changed; refresh and retry", { currentRevision: current.revision });
    const merged: ContactInput = {
      name: patch.name ?? current.name,
      emails: patch.emails ?? current.emails,
      phones: patch.phones ?? current.phones,
      extensions: patch.extensions ?? current.extensions,
      ...(Object.hasOwn(patch, "organization")
        ? { organization: patch.organization }
        : current.organization !== undefined ? { organization: current.organization } : {}),
      ...(Object.hasOwn(patch, "title")
        ? { title: patch.title }
        : current.title !== undefined ? { title: current.title } : {}),
      ...(Object.hasOwn(patch, "notes")
        ? { notes: patch.notes }
        : current.notes !== undefined ? { notes: current.notes } : {}),
    };
    const normalized = normalizeContact(merged);
    const updated: ContactRecord = { ...current, ...normalized, revision: current.revision + 1, updatedAt: this.#now() };
    const next = clone(loaded.value);
    next.contacts[index] = updated;
    next.revision += 1;
    next.updatedAt = updated.updatedAt;
    try {
      await this.#write(CONTACTS_PATH, next, loaded.version);
    } catch (error) {
      if (error instanceof CatalogError && error.code === "conflict") {
        const latest = (await this.#contacts()).value.contacts.find((item) => item.id === id);
        throw new CatalogError("conflict", "The contact changed; refresh and retry", { currentRevision: latest?.revision });
      }
      throw error;
    }
    return clone(updated);
  }

  async #contactReferences(contactId: string): Promise<string[]> {
    return (await this.#dossierRecords())
      .filter((dossier) => dossier.contacts.some((relation) => relation.contactId === contactId))
      .map((dossier) => dossier.id)
      .sort();
  }

  async deleteContact(id: string, expectedRevision: number): Promise<{ deleted: true; id: string }> {
    return this.#exclusive(() => this.#deleteContact(id, expectedRevision));
  }

  async #deleteContact(id: string, expectedRevision: number): Promise<{ deleted: true; id: string }> {
    await this.#ready();
    const loaded = await this.#contacts();
    const index = loaded.value.contacts.findIndex((item) => item.id === id);
    if (index < 0) throw new CatalogError("not_found", "Contact was not found", { entity: "contact" });
    const current = loaded.value.contacts[index]!;
    if (current.revision !== expectedRevision) throw new CatalogError("conflict", "The contact changed; refresh and retry", { currentRevision: current.revision });
    const references = await this.#contactReferences(id);
    if (references.length) throw new CatalogError("reference_conflict", "The contact is still linked to dossiers", { references });
    const next = clone(loaded.value);
    next.contacts.splice(index, 1);
    next.revision += 1;
    next.updatedAt = this.#now();
    await this.#write(CONTACTS_PATH, next, loaded.version);
    return { deleted: true, id };
  }

  async linkContact(id: string, expectedRevision: number, relation: { contactId: string; role: string; extensions?: Record<string, unknown> }): Promise<DossierProjection> {
    return this.#exclusive(() => this.#linkContact(id, expectedRevision, relation));
  }

  async #linkContact(id: string, expectedRevision: number, relation: { contactId: string; role: string; extensions?: Record<string, unknown> }): Promise<DossierProjection> {
    await this.#ready();
    const contact = await this.getContact(relation.contactId);
    const role = optionalText(relation.role, "role", 120);
    if (!role) throw new CatalogError("validation", "Contact role is required", { field: "role" });
    const loaded = await this.#dossier(id);
    if (loaded.value.revision !== expectedRevision) throw new CatalogError("conflict", "The dossier changed; refresh and retry", { currentRevision: loaded.value.revision });
    if (loaded.value.contacts.some((item) => item.contactId === contact.id)) throw new CatalogError("conflict", "The contact is already linked to this dossier");
    const updated: DossierRecord = {
      ...loaded.value,
      contacts: [...loaded.value.contacts, { contactId: contact.id, role, extensions: asExtensions(relation.extensions) }],
      revision: loaded.value.revision + 1,
      updatedAt: this.#now(),
    };
    await this.#write(dossierPath(id), updated, loaded.version);
    return this.#project(updated, (await this.#types()).value, (await this.#contacts()).value);
  }

  async updateContactRole(id: string, expectedRevision: number, contactId: string, roleValue: string): Promise<DossierProjection> {
    return this.#exclusive(() => this.#updateContactRole(id, expectedRevision, contactId, roleValue));
  }

  async #updateContactRole(id: string, expectedRevision: number, contactId: string, roleValue: string): Promise<DossierProjection> {
    await this.#ready();
    const role = optionalText(roleValue, "role", 120);
    if (!role) throw new CatalogError("validation", "Contact role is required", { field: "role" });
    const loaded = await this.#dossier(id);
    if (loaded.value.revision !== expectedRevision) throw new CatalogError("conflict", "The dossier changed; refresh and retry", { currentRevision: loaded.value.revision });
    const index = loaded.value.contacts.findIndex((item) => item.contactId === contactId);
    if (index < 0) throw new CatalogError("not_found", "Contact relation was not found", { entity: "contact-relation" });
    const contacts = clone(loaded.value.contacts);
    contacts[index] = { ...contacts[index]!, role };
    const updated: DossierRecord = {
      ...loaded.value,
      contacts,
      revision: loaded.value.revision + 1,
      updatedAt: this.#now(),
    };
    await this.#write(dossierPath(id), updated, loaded.version);
    return this.#project(updated, (await this.#types()).value, (await this.#contacts()).value);
  }

  async unlinkContact(id: string, expectedRevision: number, contactId: string): Promise<DossierProjection> {
    return this.#exclusive(() => this.#unlinkContact(id, expectedRevision, contactId));
  }

  async #unlinkContact(id: string, expectedRevision: number, contactId: string): Promise<DossierProjection> {
    await this.#ready();
    const loaded = await this.#dossier(id);
    if (loaded.value.revision !== expectedRevision) throw new CatalogError("conflict", "The dossier changed; refresh and retry", { currentRevision: loaded.value.revision });
    if (!loaded.value.contacts.some((item) => item.contactId === contactId)) throw new CatalogError("not_found", "Contact relation was not found", { entity: "contact-relation" });
    const updated: DossierRecord = {
      ...loaded.value,
      contacts: loaded.value.contacts.filter((item) => item.contactId !== contactId),
      revision: loaded.value.revision + 1,
      updatedAt: this.#now(),
    };
    await this.#write(dossierPath(id), updated, loaded.version);
    return this.#project(updated, (await this.#types()).value, (await this.#contacts()).value);
  }
}

export type {
  ContactRecord,
  DossierProjection,
  DossierRecord,
  DossierTypeRecord,
  FieldDefinition,
  FieldType,
  FieldValue,
} from "./models.ts";
