import { createHash, randomBytes } from "node:crypto";

import type { HanaResourceVersion } from "@hana/plugin-runtime";

import { createStableId, isStableId } from "../../domain/ids.ts";
import { serializeJson } from "../../domain/library-schema.ts";
import { appendResourcePath } from "../../infrastructure/workspace/resource-path.ts";
import type { DossiersRequestScope, DossiersRuntime } from "../../runtime.ts";
import { CatalogApplication } from "../catalog/catalog-application.ts";
import { CatalogError } from "../catalog/errors.ts";
import type { DossierProjection } from "../catalog/models.ts";
import { DocumentApplication } from "../documents/document-application.ts";
import { DocumentError } from "../documents/errors.ts";
import { AgentError } from "./errors.ts";
import type { AgentInvocation, ModelAccessRecord, SuggestionCatalog, SuggestionInput, SuggestionRecord } from "./models.ts";

const MODEL_ACCESS_PATH = "Dossiers/model-access.json";
const SUGGESTIONS_PATH = "Dossiers/suggestions.json";
const TOKEN_HASH = /^[a-f0-9]{64}$/;
const MUTATION_TAILS = new Map<string, Promise<void>>();

interface AgentApplicationInput {
  runtime: DossiersRuntime;
  scope: DossiersRequestScope;
  now?: () => string;
  createId?: () => string;
  createToken?: () => string;
}

interface Loaded<T> { value: T; version: HanaResourceVersion }

function clone<T>(value: T): T { return structuredClone(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function positiveRevision(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new AgentError("validation", `${field} must be a positive integer`, { field });
  return value as number;
}
function requiredText(value: unknown, field: string, max = 240): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new AgentError("validation", `${field} is required`, { field });
  return value.trim();
}
function invocation(value: AgentInvocation): AgentInvocation {
  if (typeof value.actorId !== "string" || !value.actorId.trim() || typeof value.sessionId !== "string" || !value.sessionId.trim()) {
    throw new AgentError("invocation_required", "A host-owned actor and session identity are required");
  }
  return {
    actorId: requiredText(value.actorId, "actorId", 160),
    sessionId: requiredText(value.sessionId, "sessionId", 160),
    source: value.source === "user-action" ? "user-action" : "agent-tool",
  };
}

function parseModelAccess(value: unknown): ModelAccessRecord {
  if (!isRecord(value) || value.kind !== "hana.dossiers.model-access" || value.schemaVersion !== 1 || !Number.isInteger(value.revision) || typeof value.enabled !== "boolean" || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string" || !isRecord(value.extensions)) {
    throw new AgentError("resource_operation_failed", "The model access authority is invalid");
  }
  return clone(value) as unknown as ModelAccessRecord;
}

function parseSuggestion(value: unknown): SuggestionRecord {
  if (!isRecord(value) || !isStableId(value.id, "op") || !["update_dossier", "update_document", "link_contact"].includes(String(value.action))
    || !isStableId(value.dossierId, "dos") || !Number.isInteger(value.expectedEntityRevision) || !Number.isInteger(value.revision)
    || typeof value.actorId !== "string" || typeof value.sessionId !== "string" || typeof value.tokenHash !== "string" || !TOKEN_HASH.test(value.tokenHash)
    || !["proposed", "applying", "accepted", "rejected", "failed"].includes(String(value.state))
    || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string" || !isRecord(value.extensions)) {
    throw new AgentError("resource_operation_failed", "The suggestion authority is invalid");
  }
  if (value.action === "update_document" && !isStableId(value.documentId, "doc")) throw new AgentError("resource_operation_failed", "The suggestion document identity is invalid");
  if (value.action === "link_contact" && (!isStableId(value.contactId, "con") || typeof value.role !== "string")) throw new AgentError("resource_operation_failed", "The suggestion contact relation is invalid");
  if ((value.action === "update_dossier" || value.action === "update_document") && !isRecord(value.patch)) throw new AgentError("resource_operation_failed", "The suggestion patch is invalid");
  return clone(value) as unknown as SuggestionRecord;
}

function parseSuggestions(value: unknown): SuggestionCatalog {
  if (!isRecord(value) || value.kind !== "hana.dossiers.suggestion-catalog" || value.schemaVersion !== 1 || !Number.isInteger(value.revision) || !Array.isArray(value.suggestions)
    || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string" || !isRecord(value.extensions)) {
    throw new AgentError("resource_operation_failed", "The suggestion catalog authority is invalid");
  }
  const suggestions = value.suggestions.map(parseSuggestion);
  if (new Set(suggestions.map((item) => item.id)).size !== suggestions.length) throw new AgentError("resource_operation_failed", "The suggestion catalog has duplicate identities");
  return { ...value, suggestions, extensions: clone(value.extensions) } as unknown as SuggestionCatalog;
}

function safeDossier(value: DossierProjection) {
  const documents = (value.documents as Array<Record<string, unknown>>).map((document) => ({
    id: document.id, name: document.name, categoryId: document.categoryId, tags: clone(document.tags ?? []), size: document.size,
    sha256: document.sha256, relativePath: document.relativePath,
  }));
  return {
    id: value.id, revision: value.revision, name: value.name, type: { id: value.type.id, key: value.type.key, name: value.type.name },
    fields: clone(value.fields), tags: clone(value.tags),
    contacts: value.contacts.map((relation) => ({ id: relation.contact.id, name: relation.contact.name, role: relation.role })),
    documents, dossierRef: value.dossierRef, extensions: clone(value.extensions),
  };
}

export class AgentApplication {
  readonly #runtime: DossiersRuntime;
  readonly #scope: DossiersRequestScope;
  readonly #catalog: CatalogApplication;
  readonly #documents: DocumentApplication;
  readonly #now: () => string;
  readonly #createId: () => string;
  readonly #createToken: () => string;

  constructor(input: AgentApplicationInput) {
    this.#runtime = input.runtime;
    this.#scope = input.scope;
    this.#catalog = new CatalogApplication({ runtime: input.runtime, scope: input.scope });
    this.#documents = new DocumentApplication({ runtime: input.runtime, scope: input.scope as never });
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

  async #read<T>(path: string, parser: (value: unknown) => T): Promise<Loaded<T> | null> {
    const ref = appendResourcePath(this.#scope.workspaceRoot, path);
    const stat = await this.#scope.resources.stat(ref);
    if (!stat.exists) return null;
    if (stat.isDirectory) throw new AgentError("resource_operation_failed", "An Agent authority path is occupied by a directory");
    const result = await this.#scope.resources.read(ref);
    if (!result.version) throw new AgentError("resource_operation_failed", "The Agent authority has no version");
    try { return { value: parser(JSON.parse(new TextDecoder().decode(result.content)) as unknown), version: result.version }; }
    catch (error) { if (error instanceof AgentError) throw error; throw new AgentError("resource_operation_failed", "The Agent authority is invalid JSON"); }
  }

  async #write(path: string, value: unknown, expectedVersion: HanaResourceVersion | null): Promise<void> {
    const operationId = createStableId("op");
    const input = { operationId, targetPath: path, value, expectedVersion, now: this.#now() };
    const repository = this.#runtime.jsonRepository(this.#scope);
    let result = await repository.write(input);
    if (result.status === "failed") {
      try {
        const current = await this.#scope.resources.read(appendResourcePath(this.#scope.workspaceRoot, path));
        if (new TextDecoder().decode(current.content) === serializeJson(value)) result = await repository.write(input);
      } catch { /* stable failure below */ }
    }
    if (result.status === "conflict") throw new AgentError("conflict", "The Agent authority changed; refresh and retry");
    if (result.status === "failed") throw new AgentError("resource_operation_failed", "The Agent authority could not be published");
  }

  async modelAccess(): Promise<ModelAccessRecord> {
    await this.#catalog.initialize();
    const loaded = await this.#read(MODEL_ACCESS_PATH, parseModelAccess);
    if (loaded) return clone(loaded.value);
    const now = this.#now();
    return { kind: "hana.dossiers.model-access", schemaVersion: 1, revision: 0, enabled: true, createdAt: now, updatedAt: now, extensions: {} };
  }

  async setModelAccess(enabled: boolean, actor: AgentInvocation): Promise<ModelAccessRecord> {
    return this.#exclusive(async () => {
      const principal = invocation(actor);
      if (typeof enabled !== "boolean") throw new AgentError("validation", "enabled must be boolean");
      await this.#catalog.initialize();
      const loaded = await this.#read(MODEL_ACCESS_PATH, parseModelAccess);
      const now = this.#now();
      const next: ModelAccessRecord = {
        kind: "hana.dossiers.model-access", schemaVersion: 1, revision: (loaded?.value.revision ?? 0) + 1, enabled,
        updatedBy: principal, createdAt: loaded?.value.createdAt ?? now, updatedAt: now, extensions: loaded?.value.extensions ?? {},
      };
      await this.#write(MODEL_ACCESS_PATH, next, loaded?.version ?? null);
      return clone(next);
    });
  }

  async get(dossierId: string) { return safeDossier(await this.#catalog.getDossier(dossierId)); }
  async list(input: { query?: string; limit?: number; cursor?: string } = {}) {
    const result = await this.#catalog.listDossiers(input);
    return { items: result.items.map(safeDossier), nextCursor: result.nextCursor };
  }

  async context(dossierId: string) {
    const [dossier, setting] = await Promise.all([this.get(dossierId), this.modelAccess()]);
    const rootPath = `Dossiers/dossiers/${dossier.id}`;
    const mount = this.#scope.workspaceRoot;
    const ref = (path: string) => mount.kind === "mount" ? { kind: "mount" as const, mountId: mount.mountId, path } : { kind: "local-file" as const, path: `${mount.path.replace(/[\\/]$/, "")}/${path}` };
    return {
      modelContentAccess: setting.enabled ? "enabled" as const : "disabled" as const,
      dossier,
      dossierManifestRef: ref(`${rootPath}/dossier.json`),
      contentResources: setting.enabled ? [
        { kind: "directory" as const, ref: ref(`${rootPath}/documents`) },
        ...dossier.documents.map((document) => ({ kind: "document" as const, documentId: document.id, name: document.name, ref: ref(`${rootPath}/${String(document.relativePath)}`) })),
      ] : [],
    };
  }

  async updateDossier(dossierId: string, expectedRevision: number, patch: Record<string, unknown>, actor: AgentInvocation) {
    const principal = invocation(actor);
    const current = await this.#catalog.getDossier(dossierId);
    const extensions = { ...current.extensions, agentLastWrite: principal };
    try { return safeDossier(await this.#catalog.updateDossier(dossierId, positiveRevision(expectedRevision, "expectedRevision"), { ...patch, extensions } as never)); }
    catch (error) { throw this.#mapError(error); }
  }

  async createDossier(input: Record<string, unknown>, actor: AgentInvocation) {
    const principal = invocation(actor);
    try { return safeDossier(await this.#catalog.createDossier({ ...input, extensions: { ...(isRecord(input.extensions) ? input.extensions : {}), agentLastWrite: principal } } as never)); }
    catch (error) { throw this.#mapError(error); }
  }

  async #suggestions(): Promise<Loaded<SuggestionCatalog> | null> { return this.#read(SUGGESTIONS_PATH, parseSuggestions); }
  #publicSuggestion(value: SuggestionRecord): Omit<SuggestionRecord, "tokenHash"> {
    const safe = clone(value);
    Reflect.deleteProperty(safe, "tokenHash");
    return safe;
  }

  async propose(input: SuggestionInput, actor: AgentInvocation) {
    return this.#exclusive(async () => {
      const principal = invocation(actor);
      if (!isRecord(input) || !["update_dossier", "update_document", "link_contact"].includes(String(input.action))) throw new AgentError("validation", "The suggestion action is invalid");
      if (!isStableId(input.dossierId, "dos")) throw new AgentError("validation", "The dossier identity is invalid");
      positiveRevision(input.expectedEntityRevision, "expectedEntityRevision");
      if ((input.action === "update_dossier" || input.action === "update_document") && !isRecord(input.patch)) throw new AgentError("validation", "The suggestion patch is invalid");
      if (input.action === "update_document" && !isStableId(input.documentId, "doc")) throw new AgentError("validation", "The document identity is invalid");
      if (input.action === "link_contact" && (!isStableId(input.contactId, "con") || !input.role.trim())) throw new AgentError("validation", "The contact suggestion is invalid");
      await this.#catalog.getDossier(input.dossierId);
      const loaded = await this.#suggestions();
      const now = this.#now();
      const token = this.#createToken();
      const suggestion: SuggestionRecord = {
        id: this.#createId(), action: input.action, dossierId: input.dossierId,
        ...(input.action === "update_document" ? { documentId: input.documentId, patch: clone(input.patch) } : {}),
        ...(input.action === "update_dossier" ? { patch: clone(input.patch) } : {}),
        ...(input.action === "link_contact" ? { contactId: input.contactId, role: input.role.trim() } : {}),
        expectedEntityRevision: input.expectedEntityRevision, actorId: principal.actorId, sessionId: principal.sessionId,
        tokenHash: sha256(token), state: "proposed", revision: 1, createdAt: now, updatedAt: now, extensions: {},
      };
      if (!isStableId(suggestion.id, "op")) throw new AgentError("resource_operation_failed", "The suggestion identity is invalid");
      const next: SuggestionCatalog = loaded ? { ...loaded.value, revision: loaded.value.revision + 1, suggestions: [...loaded.value.suggestions, suggestion], updatedAt: now }
        : { kind: "hana.dossiers.suggestion-catalog", schemaVersion: 1, revision: 1, suggestions: [suggestion], createdAt: now, updatedAt: now, extensions: {} };
      await this.#write(SUGGESTIONS_PATH, next, loaded?.version ?? null);
      return { suggestion: this.#publicSuggestion(suggestion), confirmationToken: token };
    });
  }

  async #updateSuggestion(id: string, mutate: (value: SuggestionRecord) => SuggestionRecord): Promise<SuggestionRecord> {
    const loaded = await this.#suggestions();
    if (!loaded) throw new AgentError("not_found", "The suggestion was not found");
    const index = loaded.value.suggestions.findIndex((item) => item.id === id);
    if (index < 0) throw new AgentError("not_found", "The suggestion was not found");
    const updated = mutate(loaded.value.suggestions[index]!);
    const next = { ...loaded.value, revision: loaded.value.revision + 1, updatedAt: this.#now(), suggestions: loaded.value.suggestions.map((item, itemIndex) => itemIndex === index ? updated : item) };
    await this.#write(SUGGESTIONS_PATH, next, loaded.version);
    return updated;
  }

  async decide(id: string, token: string, decision: "accept" | "reject", actor: AgentInvocation) {
    return this.#exclusive(async () => {
      const principal = invocation(actor);
      const loaded = await this.#suggestions();
      const suggestion = loaded?.value.suggestions.find((item) => item.id === id);
      if (!suggestion || suggestion.state !== "proposed" || suggestion.actorId !== principal.actorId || suggestion.sessionId !== principal.sessionId || sha256(token) !== suggestion.tokenHash) {
        throw new AgentError("confirmation_invalid", "The suggestion confirmation is invalid, used, or belongs to another invocation");
      }
      if (decision === "reject") {
        const rejected = await this.#updateSuggestion(id, (value) => ({ ...value, state: "rejected", revision: value.revision + 1, updatedAt: this.#now() }));
        return { suggestion: this.#publicSuggestion(rejected), result: null };
      }
      if (decision !== "accept") throw new AgentError("validation", "The suggestion decision is invalid");
      await this.#updateSuggestion(id, (value) => ({ ...value, state: "applying", revision: value.revision + 1, updatedAt: this.#now() }));
      let result: unknown;
      try {
        if (suggestion.action === "update_dossier") result = await this.updateDossier(suggestion.dossierId, suggestion.expectedEntityRevision, suggestion.patch ?? {}, principal);
        else if (suggestion.action === "update_document") result = await this.#documents.updateDocument(suggestion.dossierId, suggestion.documentId!, suggestion.expectedEntityRevision, suggestion.patch as never);
        else result = safeDossier(await this.#catalog.linkContact(suggestion.dossierId, suggestion.expectedEntityRevision, { contactId: suggestion.contactId!, role: suggestion.role! }));
      } catch (error) {
        try { await this.#updateSuggestion(id, (value) => ({ ...value, state: "failed", revision: value.revision + 1, updatedAt: this.#now() })); } catch { /* entity error remains authoritative */ }
        throw this.#mapError(error);
      }
      const resultRevision = isRecord(result) && typeof result.revision === "number" ? result.revision : undefined;
      const accepted = await this.#updateSuggestion(id, (value) => ({ ...value, state: "accepted", revision: value.revision + 1, ...(resultRevision ? { resultRevision } : {}), updatedAt: this.#now() }));
      return { suggestion: this.#publicSuggestion(accepted), result };
    });
  }

  requireOwningConfirmation(action: unknown): never {
    if (!["delete", "bulk", "overwrite"].includes(String(action))) throw new AgentError("validation", "The high-risk action is invalid");
    throw new AgentError("confirmation_required", "This high-risk action requires its owning preview and actor/session-bound confirmation workflow", { action });
  }

  #mapError(error: unknown): AgentError {
    if (error instanceof AgentError) return error;
    if (error instanceof CatalogError || error instanceof DocumentError) {
      if (error.code === "conflict") return new AgentError("conflict", "The target changed; refresh and propose again", error.details);
      if (error.code === "not_found") return new AgentError("not_found", "The Agent target was not found", error.details);
      if (error.code === "validation") return new AgentError("validation", "The Agent operation input is invalid", error.details);
    }
    return new AgentError("resource_operation_failed", "The Agent operation could not be completed");
  }
}
