import type { HanaPluginSdk } from "@hana/plugin-sdk";

import { CatalogUiError, type CatalogClient, type CatalogDossier, type CatalogSearchResult, type CatalogType } from "./catalog/types.ts";
import { OperationsUiError, type OperationsClient, type PickedArchive, type PickedDocumentSource, type TrashSummary } from "./operations/types.ts";

export type WorkspaceRef =
  | { kind: "mount"; mountId: string; path: string; name?: string }
  | { kind: "local-file"; path: string; name?: string; isDirectory?: boolean };

interface ApiFailure {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeWorkspaceRef(value: unknown): WorkspaceRef | null {
  if (!isRecord(value)) return null;
  if (value.kind === "mount" && typeof value.mountId === "string" && value.mountId && typeof value.path === "string") {
    return { kind: "mount", mountId: value.mountId, path: value.path, ...(typeof value.name === "string" ? { name: value.name } : {}) };
  }
  if (value.kind === "local-file" && typeof value.path === "string" && value.path) {
    return { kind: "local-file", path: value.path, ...(typeof value.name === "string" ? { name: value.name } : {}), ...(value.isDirectory === true ? { isDirectory: true } : {}) };
  }
  return null;
}

export function workspaceLabel(ref: WorkspaceRef): string {
  if (ref.name?.trim()) return ref.name.trim();
  const value = ref.kind === "mount" ? ref.mountId : ref.path.replace(/[\\/]+$/u, "").split(/[\\/]/u).at(-1);
  return value || "工作区";
}

function sourceLabel(value: Record<string, unknown>): string {
  if (typeof value.name === "string" && value.name.trim()) return value.name.trim();
  if (typeof value.displayName === "string" && value.displayName.trim()) return value.displayName.trim();
  if (typeof value.path === "string") return value.path.split(/[\\/]/u).at(-1) || "资料";
  return "资料";
}

function apiFailure(value: unknown, status: number): ApiFailure {
  const error = isRecord(value) && isRecord(value.error) ? value.error : {};
  return {
    code: typeof error.code === "string" ? error.code : status === 409 ? "conflict" : "unavailable",
    message: typeof error.message === "string" ? error.message : `Dossier request failed (${status})`,
    details: isRecord(error.details) ? error.details : {}
  };
}

function catalogError(error: unknown): CatalogUiError {
  const value = error as ApiFailure;
  const code = value.code === "validation" || value.code === "conflict" || value.code === "index_unavailable" ? value.code : "unavailable";
  const fields = isRecord(value.details?.fieldErrors) ? Object.fromEntries(Object.entries(value.details.fieldErrors).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : {};
  return new CatalogUiError(code, value.message || "Dossier service unavailable", fields);
}

function operationsError(error: unknown): OperationsUiError {
  const value = error as ApiFailure;
  const codes = new Set(["validation", "conflict", "cancelled", "unavailable", "unsafe_archive", "recovery_required"]);
  const code = codes.has(value.code) ? value.code as ConstructorParameters<typeof OperationsUiError>[0] : "unavailable";
  return new OperationsUiError(code, value.message || "Dossier operation unavailable");
}

export class DossiersBrowserApi {
  readonly #hana: HanaPluginSdk;
  readonly #workspace: WorkspaceRef;
  readonly #documentSources = new Map<string, Record<string, unknown>>();
  readonly #archiveSources = new Map<string, Record<string, unknown>>();
  readonly #trashRevisions = new Map<string, number>();
  readonly #onDossier?: (dossier: CatalogDossier) => void;

  constructor(hana: HanaPluginSdk, workspace: WorkspaceRef, onDossier?: (dossier: CatalogDossier) => void) {
    this.#hana = hana;
    this.#workspace = workspace;
    this.#onDossier = onDossier;
  }

  async #request<T>(operation: string, payload: Record<string, unknown> = {}): Promise<T> {
    const response = await this.#hana.api.fetch("ui/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation, workspace: this.#workspace, payload })
    });
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) throw apiFailure(value, response.status);
    return value as T;
  }

  openWorkspace(): Promise<{ compatibility: { state: string; reason?: string } }> {
    return this.#request("workspace.open");
  }

  catalogClient(): CatalogClient {
    return {
      listTypes: async () => this.#request<{ items: CatalogType[] }>("catalog.types").catch((error) => { throw catalogError(error); }),
      search: async (input) => this.#request<CatalogSearchResult>("catalog.search", input).catch((error) => { throw catalogError(error); }),
      getDossier: async (id) => {
        const dossier = await this.#request<CatalogDossier>("catalog.get", { id }).catch((error) => { throw catalogError(error); });
        this.#onDossier?.(dossier);
        return dossier;
      },
      createDossier: async (input) => {
        const dossier = await this.#request<CatalogDossier>("catalog.create", input).catch((error) => { throw catalogError(error); });
        this.#onDossier?.(dossier);
        return dossier;
      },
      updateDossier: async (id, expectedRevision, patch) => {
        const dossier = await this.#request<CatalogDossier>("catalog.update", { id, expectedRevision, patch }).catch((error) => { throw catalogError(error); });
        this.#onDossier?.(dossier);
        return dossier;
      },
      rebuildIndex: async () => this.#request<{ status: string }>("catalog.rebuild").catch((error) => { throw catalogError(error); })
    };
  }

  operationsClient(): OperationsClient {
    const call = async <T>(operation: string, payload: Record<string, unknown> = {}): Promise<T> => this.#request<T>(operation, payload).catch((error) => { throw operationsError(error); });
    return {
      loadDossierOperations: (dossierId) => call("operations.load", { dossierId }),
      pickDocumentSources: () => this.#pickDocumentSources(),
      previewDocumentImport: (input) => {
        const sources = input.sourceIds.map((sourceId) => {
          const ref = this.#documentSources.get(sourceId);
          if (!ref) throw new OperationsUiError("cancelled", "The selected source is no longer available");
          return { ref };
        });
        return call("documents.preview", { dossierId: input.dossierId, expectedRevision: input.expectedRevision, categoryId: input.categoryId, sources });
      },
      commitDocumentImport: (previewId, expectedRevision) => call("documents.commit", { previewId, expectedRevision }),
      previewClassification: (input) => call("documents.classification.preview", input),
      commitClassification: (previewId, confirmationToken) => call("documents.classification.commit", { previewId, confirmationToken }),
      trashDocument: (input) => call("lifecycle.trash.document", input),
      searchContacts: (query) => call("contacts.search", { query }),
      linkContact: (input) => call("contacts.link", input),
      createAndLinkContact: (input) => call("contacts.create-link", input),
      setModelAccess: (enabled, expectedRevision) => call("model.set", { enabled, expectedRevision }),
      requestSuggestionConfirmation: () => Promise.reject(new OperationsUiError("unavailable", "Agent suggestions are confirmed by their owning Agent invocation")),
      acceptSuggestion: () => Promise.reject(new OperationsUiError("unavailable", "Agent suggestions are confirmed by their owning Agent invocation")),
      rejectSuggestion: () => Promise.reject(new OperationsUiError("unavailable", "Agent suggestions are confirmed by their owning Agent invocation")),
      listTrash: async () => {
        let items: TrashSummary[];
        try { items = await call<TrashSummary[]>("lifecycle.list"); }
        catch (error) {
          if (error instanceof OperationsUiError && error.code === "recovery_required") items = [];
          else throw error;
        }
        this.#trashRevisions.clear();
        for (const item of items) this.#trashRevisions.set(item.id, item.revision);
        return items;
      },
      restoreTrash: (trashId, expectedRevision) => call("lifecycle.restore", { trashId, expectedRevision }),
      requestPurgeConfirmation: (trashId) => call("lifecycle.purge.prepare", { trashId, expectedRevision: this.#trashRevisions.get(trashId) ?? 0 }),
      purgeTrash: (trashId, confirmationToken, expectedRevision) => call("lifecycle.purge.confirm", { trashId, confirmationToken, expectedRevision }),
      exportDossier: (dossierId) => call("exchange.export", { dossierId }),
      pickImportArchive: () => this.#pickImportArchive(),
      inspectImport: (sourceId) => {
        const archiveRef = this.#archiveSources.get(sourceId);
        if (!archiveRef) return Promise.reject(new OperationsUiError("cancelled", "The selected archive is no longer available"));
        return call("exchange.inspect", { archiveRef });
      },
      commitImport: (previewId, confirmationToken) => call("exchange.commit", { previewId, confirmationToken }),
      compatibilityStatus: () => call("migration.status"),
      planMigration: () => call("migration.plan"),
      executeMigration: (previewId, confirmationToken) => call("migration.execute", { previewId, confirmationToken }),
      recoverMigration: (action) => call("migration.recover", { action })
    };
  }

  async #pickDocumentSources(): Promise<PickedDocumentSource[]> {
    const result = await this.#hana.resources.pick({ mode: "file", multiple: true, capability: "resource.read" });
    const picked: PickedDocumentSource[] = [];
    for (const value of result.resources) {
      if (!isRecord(value)) continue;
      const sourceId = crypto.randomUUID();
      this.#documentSources.set(sourceId, structuredClone(value));
      picked.push({ sourceId, displayName: sourceLabel(value), size: 0 });
    }
    return picked;
  }

  async #pickImportArchive(): Promise<PickedArchive | null> {
    const result = await this.#hana.resources.pick({ mode: "file", multiple: false, capability: "resource.read" });
    const value = result.resources[0];
    if (!isRecord(value)) return null;
    const sourceId = crypto.randomUUID();
    this.#archiveSources.set(sourceId, structuredClone(value));
    return { sourceId, displayName: sourceLabel(value) };
  }
}
