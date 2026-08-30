import { randomBytes, randomUUID } from "node:crypto";
import type { HanaPluginResources } from "@hana/plugin-runtime";

import { AgentApplication } from "../src/application/agent/agent-application.ts";
import { CatalogApplication } from "../src/application/catalog/catalog-application.ts";
import { DocumentApplication } from "../src/application/documents/document-application.ts";
import { ExchangeApplication } from "../src/application/exchange/exchange-application.ts";
import { MetadataIndexApplication } from "../src/application/index/metadata-index-application.ts";
import { LifecycleApplication } from "../src/application/lifecycle/lifecycle-application.ts";
import type { LifecycleInvocation } from "../src/application/lifecycle/models.ts";
import { MigrationApplication } from "../src/application/migration/migration-application.ts";
import { appendResourcePath, type WorkspaceTreeRef } from "../src/infrastructure/workspace/resource-path.ts";
import { DossiersRuntime } from "../src/runtime.ts";

interface RequestLike {
  json(): Promise<unknown>;
  query(name: string): string | undefined;
}

interface RouteContextLike {
  req: RequestLike;
  get?(name: string): unknown;
  header?(name: string, value: string): void;
  html(value: string, status?: number): unknown;
  json(value: unknown, status?: number): unknown;
}

type Handler = (context: RouteContextLike) => unknown | Promise<unknown>;

interface AppLike {
  get(path: string, handler: Handler): void;
  post(path: string, handler: Handler): void;
}

interface PluginContextLike {
  resources: HanaPluginResources;
  dataDir: string;
}

interface DispatchRequest {
  operation: string;
  workspace: WorkspaceTreeRef;
  payload: Record<string, unknown>;
}

interface ClassificationGrant {
  workspaceKey: string;
  dossierId: string;
  documentId: string;
  categoryId: string;
  expectedRevision: number;
  tokenHash: string;
  expiresAt: number;
}

const runtime = new DossiersRuntime();
const classificationGrants = new Map<string, ClassificationGrant>();
const MAX_CLASSIFICATION_GRANTS = 128;
const CLASSIFICATION_TTL_MS = 5 * 60_000;
const MOUNT_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function safeCssUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const decoded = decodeURIComponent(value);
    return decoded.startsWith("/") && !decoded.startsWith("//") && !/[\r\n"'<>]/.test(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function locale(value: string | undefined): string {
  return ["zh-CN", "zh-TW", "en"].includes(value ?? "") ? value! : "zh-CN";
}

function renderPage(context: RouteContextLike): string {
  const lang = locale(context.req.query("locale") ?? context.req.query("lang"));
  const theme = escapeHtml(context.req.query("hana-theme") ?? "inherit");
  const hostCss = safeCssUrl(context.req.query("hana-css"));
  const styles = [
    hostCss ? `<link rel="stylesheet" href="${escapeHtml(hostCss)}">` : "",
    '<link rel="stylesheet" href="/api/plugins/dossiers/assets/page.css">'
  ].filter(Boolean).join("\n    ");
  return `<!doctype html>
<html lang="${escapeHtml(lang)}" data-hana-theme="${theme}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'">
  <title>Hana Dossiers</title>
  ${styles}
</head>
<body>
  <main id="root"></main>
  <noscript>Hana Dossiers requires JavaScript.</noscript>
  <script type="module" src="/api/plugins/dossiers/assets/page.js"></script>
</body>
</html>`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function workspaceRoot(value: unknown): WorkspaceTreeRef {
  if (!isRecord(value)) throw requestError("validation", "A workspace selection is required");
  if (value.kind === "mount" && typeof value.mountId === "string" && MOUNT_ID.test(value.mountId) && typeof value.path === "string") {
    return { kind: "mount", mountId: value.mountId, path: value.path };
  }
  if (value.kind === "local-file" && typeof value.path === "string" && value.path.length > 0 && value.path.length <= 2_048 && !value.path.includes("\0")) {
    return { kind: "local-file", path: value.path };
  }
  throw requestError("validation", "The selected workspace resource is not supported");
}

function workspaceKey(root: WorkspaceTreeRef): string {
  return root.kind === "mount" ? `mount:${root.mountId}:${root.path}` : `local:${root.path}`;
}

function requestError(code: string, message: string, details: Record<string, unknown> = {}): Error & { code: string; status: number; details: Record<string, unknown> } {
  return Object.assign(new Error(message), { code, status: code === "validation" ? 400 : code === "not_found" ? 404 : code === "conflict" || code === "confirmation_invalid" ? 409 : 503, details });
}

function number(value: unknown, field: string, allowZero = false): number {
  if (!Number.isInteger(value) || (allowZero ? (value as number) < 0 : (value as number) < 1)) throw requestError("validation", `${field} must be a valid revision`);
  return value as number;
}

function text(value: unknown, field: string, max = 240): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw requestError("validation", `${field} is required`);
  return value.trim();
}

function bodyRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw requestError("validation", "Request body must be an object");
  return value;
}

async function readDispatch(context: RouteContextLike): Promise<DispatchRequest> {
  const input = bodyRecord(await context.req.json());
  return {
    operation: text(input.operation, "operation", 120),
    workspace: workspaceRoot(input.workspace),
    payload: input.payload === undefined ? {} : bodyRecord(input.payload)
  };
}

function invocation(context: RouteContextLike): LifecycleInvocation {
  const requestContext = context.get?.("pluginRequestContext");
  const principal = isRecord(requestContext) && isRecord(requestContext.principal) ? requestContext.principal : null;
  const actorId = principal && typeof principal.principalId === "string" ? principal.principalId : null;
  const sessionId = principal && typeof principal.credentialId === "string" ? principal.credentialId : null;
  if (!actorId || !sessionId) throw requestError("invocation_required", "A host-owned Page identity is required for this action");
  return { actorId, sessionId, source: "user-action" };
}

function applications(ctx: PluginContextLike, root: WorkspaceTreeRef) {
  const scope = { resources: ctx.resources, workspaceRoot: root };
  return {
    catalog: new CatalogApplication({ runtime, scope }),
    documents: new DocumentApplication({ runtime, scope }),
    agent: new AgentApplication({ runtime, scope }),
    exchange: new ExchangeApplication({ runtime, scope }),
    lifecycle: new LifecycleApplication({ runtime, scope }),
    migration: new MigrationApplication({ resources: ctx.resources, workspaceRoot: root })
  };
}

function createIndex(ctx: PluginContextLike, root: WorkspaceTreeRef): MetadataIndexApplication {
  return new MetadataIndexApplication({ resources: ctx.resources, workspaceRoot: root, dataDir: ctx.dataDir });
}

async function assertWorkspaceDirectory(ctx: PluginContextLike, root: WorkspaceTreeRef): Promise<void> {
  const stat = await ctx.resources.stat(root);
  if (!stat.exists || !stat.isDirectory) throw requestError("validation", "The selected workspace directory is unavailable");
}

async function openWorkspace(ctx: PluginContextLike, root: WorkspaceTreeRef) {
  await assertWorkspaceDirectory(ctx, root);
  const apps = applications(ctx, root);
  const dossiers = await ctx.resources.stat(appendResourcePath(root, "Dossiers"));
  if (!dossiers.exists) {
    await apps.catalog.initialize();
  }
  const compatibility = await apps.migration.detect();
  if (compatibility.state === "ready") await apps.catalog.initialize();
  return { compatibility, workspaceKey: workspaceKey(root) };
}

async function requireReady(ctx: PluginContextLike, root: WorkspaceTreeRef): Promise<ReturnType<typeof applications>> {
  await assertWorkspaceDirectory(ctx, root);
  const apps = applications(ctx, root);
  const compatibility = await apps.migration.detect();
  if (compatibility.state !== "ready") {
    throw requestError("recovery_required", "The dossier library requires migration or recovery before this action", { state: compatibility.state, reason: compatibility.reason });
  }
  return apps;
}

function dossierProjection(value: Awaited<ReturnType<CatalogApplication["getDossier"]>>) {
  return { ...value, documentCount: value.documents.length };
}

function publicError(error: unknown): { status: number; body: { error: { code: string; message: string; details: Record<string, unknown> } } } {
  const value = error as { code?: unknown; status?: unknown; message?: unknown; details?: unknown };
  const code = typeof value?.code === "string" ? value.code : "unavailable";
  const status = typeof value?.status === "number" ? value.status : code === "validation" ? 400 : code === "not_found" ? 404 : code === "conflict" ? 409 : 503;
  const message = typeof value?.message === "string" && value.message ? value.message : "The dossier operation could not be completed";
  return { status, body: { error: { code, message, details: isRecord(value?.details) ? value.details : {} } } };
}

function cleanupClassificationGrants(): void {
  const now = Date.now();
  for (const [id, grant] of classificationGrants) if (grant.expiresAt <= now) classificationGrants.delete(id);
  while (classificationGrants.size >= MAX_CLASSIFICATION_GRANTS) classificationGrants.delete(classificationGrants.keys().next().value!);
}

async function dispatch(context: RouteContextLike, ctx: PluginContextLike, request: DispatchRequest): Promise<unknown> {
  const { operation, workspace: root, payload } = request;
  if (operation === "workspace.open") return openWorkspace(ctx, root);
  const directApps = applications(ctx, root);
  if (operation === "migration.status") {
    await assertWorkspaceDirectory(ctx, root);
    return directApps.migration.detect();
  }
  if (operation === "migration.plan") return directApps.migration.plan();
  if (operation === "migration.execute") return directApps.migration.execute(text(payload.previewId, "previewId"), text(payload.confirmationToken, "confirmationToken", 512));
  if (operation === "migration.recover") return directApps.migration.recover(payload.action);

  const apps = await requireReady(ctx, root);
  switch (operation) {
    case "catalog.types": return apps.catalog.listTypes();
    case "catalog.search": {
      const result = await apps.catalog.listDossiers({
        query: typeof payload.query === "string" ? payload.query : "",
        typeId: typeof payload.typeId === "string" && payload.typeId ? payload.typeId : undefined,
        cursor: typeof payload.cursor === "string" && payload.cursor ? payload.cursor : undefined,
        limit: number(payload.limit ?? 50, "limit")
      });
      const index = createIndex(ctx, root);
      try {
        const status = await index.status();
        return {
          items: result.items.map((item) => ({ dossierId: item.id, name: item.name, typeId: item.typeId, typeName: item.type.name, tags: item.tags, documentCount: item.documents.length, revision: item.revision })),
          nextCursor: result.nextCursor,
          stale: status.status === "stale" || status.status === "corrupt",
          degraded: status.status !== "ready"
        };
      } finally { index.close(); }
    }
    case "catalog.get": return dossierProjection(await apps.catalog.getDossier(text(payload.id, "id")));
    case "catalog.create": {
      const created = await apps.catalog.createDossier(payload as never);
      const index = createIndex(ctx, root);
      try { await index.upsert(created.id); } finally { index.close(); }
      return dossierProjection(created);
    }
    case "catalog.update": {
      const updated = await apps.catalog.updateDossier(text(payload.id, "id"), number(payload.expectedRevision, "expectedRevision"), bodyRecord(payload.patch));
      const index = createIndex(ctx, root);
      try { await index.upsert(updated.id); } finally { index.close(); }
      return dossierProjection(updated);
    }
    case "catalog.rebuild": {
      const index = createIndex(ctx, root);
      try { return await index.rebuild(); } finally { index.close(); }
    }
    case "operations.load": {
      const dossierId = text(payload.dossierId, "dossierId");
      const [dossier, documents, modelAccess] = await Promise.all([
        apps.catalog.getDossier(dossierId),
        apps.documents.getDocuments(dossierId),
        apps.agent.modelAccess()
      ]);
      return {
        dossierId,
        dossierName: dossier.name,
        revision: dossier.revision,
        categories: documents.categories,
        documents: documents.documents,
        contacts: dossier.contacts,
        suggestions: [],
        modelAccess: { enabled: modelAccess.enabled, revision: modelAccess.revision }
      };
    }
    case "documents.preview": return apps.documents.previewImport({
      dossierId: text(payload.dossierId, "dossierId"),
      expectedRevision: number(payload.expectedRevision, "expectedRevision"),
      categoryId: text(payload.categoryId, "categoryId"),
      sources: Array.isArray(payload.sources) ? payload.sources as never : [],
      maxBytes: typeof payload.maxBytes === "number" ? payload.maxBytes : undefined,
      maxFiles: typeof payload.maxFiles === "number" ? payload.maxFiles : undefined
    });
    case "documents.commit": {
      const value = await apps.documents.commitPreview(text(payload.previewId, "previewId"), number(payload.expectedRevision, "expectedRevision"));
      return { revision: value.revision };
    }
    case "documents.classification.preview": {
      cleanupClassificationGrants();
      const dossierId = text(payload.dossierId, "dossierId");
      const documentId = text(payload.documentId, "documentId");
      const categoryId = text(payload.categoryId, "categoryId");
      const expectedRevision = number(payload.expectedRevision, "expectedRevision");
      const collection = await apps.documents.getDocuments(dossierId);
      if (collection.revision !== expectedRevision) throw requestError("conflict", "The dossier changed; refresh and retry");
      const document = collection.documents.find((item) => item.id === documentId);
      if (!document) throw requestError("not_found", "The document was not found");
      if (!collection.categories.some((item) => item.id === categoryId)) throw requestError("validation", "The category was not found");
      const previewId = randomUUID();
      const confirmationToken = randomBytes(32).toString("base64url");
      classificationGrants.set(previewId, { workspaceKey: workspaceKey(root), dossierId, documentId, categoryId, expectedRevision, tokenHash: confirmationToken, expiresAt: Date.now() + CLASSIFICATION_TTL_MS });
      return { previewId, confirmationToken, documentId, documentName: document.name, fromCategoryId: document.categoryId, toCategoryId: categoryId, movesManagedBytes: document.categoryId !== categoryId, expectedRevision };
    }
    case "documents.classification.commit": {
      cleanupClassificationGrants();
      const previewId = text(payload.previewId, "previewId");
      const grant = classificationGrants.get(previewId);
      if (!grant || grant.workspaceKey !== workspaceKey(root) || grant.tokenHash !== payload.confirmationToken) throw requestError("confirmation_invalid", "The classification confirmation is invalid or expired");
      classificationGrants.delete(previewId);
      const value = await apps.documents.updateDocument(grant.dossierId, grant.documentId, grant.expectedRevision, { categoryId: grant.categoryId });
      return { revision: value.revision };
    }
    case "lifecycle.trash.document": {
      const result = await apps.lifecycle.trashDocument(text(payload.dossierId, "dossierId"), text(payload.documentId, "documentId"), number(payload.expectedRevision, "expectedRevision"), invocation(context));
      return { state: result.record.state };
    }
    case "contacts.search": {
      const result = await apps.catalog.listContacts({ query: typeof payload.query === "string" ? payload.query : "", limit: 50 });
      return result.items;
    }
    case "contacts.link": {
      const value = await apps.catalog.linkContact(text(payload.dossierId, "dossierId"), number(payload.expectedRevision, "expectedRevision"), { contactId: text(payload.contactId, "contactId"), role: text(payload.role, "role", 120) });
      return { revision: value.revision };
    }
    case "contacts.create-link": {
      const contact = await apps.catalog.createContact({ name: payload.name, organization: payload.organization, title: payload.title } as never);
      try {
        const value = await apps.catalog.linkContact(text(payload.dossierId, "dossierId"), number(payload.expectedRevision, "expectedRevision"), { contactId: contact.id, role: text(payload.role, "role", 120) });
        return { revision: value.revision };
      } catch (error) {
        try { await apps.catalog.deleteContact(contact.id, contact.revision); } catch { /* the linking error remains authoritative */ }
        throw error;
      }
    }
    case "model.set": {
      const current = await apps.agent.modelAccess();
      if (current.revision !== number(payload.expectedRevision, "expectedRevision", true)) throw requestError("conflict", "The model access setting changed; refresh and retry");
      const value = await apps.agent.setModelAccess(payload.enabled === true, invocation(context));
      return { enabled: value.enabled, revision: value.revision };
    }
    case "lifecycle.list": {
      const value = await apps.lifecycle.listTrash();
      return value.items.map((item) => ({
        id: item.id,
        targetType: item.targetType,
        targetId: item.targetId,
        label: item.document?.name ?? `档案 ${item.targetId}`,
        state: item.state,
        deletedAt: item.deletedAt,
        expiresAt: item.expiresAt,
        revision: item.revision,
        purgeEligible: item.state === "trashed" && Date.now() >= Date.parse(item.expiresAt),
        reason: item.reason
      }));
    }
    case "lifecycle.restore": {
      const value = await apps.lifecycle.restore(text(payload.trashId, "trashId"), number(payload.expectedRevision, "expectedRevision"), invocation(context));
      return { state: value.record.state };
    }
    case "lifecycle.purge.prepare": {
      const value = await apps.lifecycle.preparePurge(text(payload.trashId, "trashId"), number(payload.expectedRevision, "expectedRevision"), invocation(context));
      return { trashId: value.recordId, confirmationToken: value.confirmationToken, targetLabel: value.targetId, expectedRevision: value.expectedRecordRevision, expiresAt: value.expiresAt };
    }
    case "lifecycle.purge.confirm": {
      const value = await apps.lifecycle.confirmPurge(text(payload.trashId, "trashId"), text(payload.confirmationToken, "confirmationToken", 512), invocation(context));
      return { state: value.record.state };
    }
    case "exchange.export": {
      const value = await apps.exchange.exportDossier(text(payload.dossierId, "dossierId"));
      const path = value.archiveRef.path;
      return { dossierId: value.dossierId, fileCount: value.fileCount, totalBytes: value.totalBytes, deliveryName: path.split(/[\\/]/).at(-1) ?? "dossier.zip", archiveRef: value.archiveRef };
    }
    case "exchange.inspect": return apps.exchange.inspectImport({ archiveRef: workspaceRoot(payload.archiveRef) as never });
    case "exchange.commit": return apps.exchange.commitImport(text(payload.previewId, "previewId"), text(payload.confirmationToken, "confirmationToken", 512));
    default: throw requestError("validation", `Unsupported dossier Page operation: ${operation}`);
  }
}

export default function register(app: AppLike, ctx: PluginContextLike): void {
  app.get("/page", (context) => {
    context.header?.("Cache-Control", "no-store");
    context.header?.("X-Content-Type-Options", "nosniff");
    context.header?.("Referrer-Policy", "no-referrer");
    return context.html(renderPage(context));
  });
  app.post("/ui/dispatch", async (context) => {
    try {
      return context.json(await dispatch(context, ctx, await readDispatch(context)));
    } catch (error) {
      const result = publicError(error);
      return context.json(result.body, result.status);
    }
  });
}

export { renderPage };
