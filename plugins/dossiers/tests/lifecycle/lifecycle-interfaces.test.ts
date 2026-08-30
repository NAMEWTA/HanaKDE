import assert from "node:assert/strict";
import test from "node:test";

import * as catalogContactTool from "../../tools/catalog-contact.ts";
import * as auditCleanupTool from "../../tools/lifecycle-audit-cleanup.ts";
import * as auditTool from "../../tools/lifecycle-audit.ts";
import * as deleteContactTool from "../../tools/lifecycle-delete-contact.ts";
import * as listTool from "../../tools/lifecycle-list.ts";
import * as purgeConfirmTool from "../../tools/lifecycle-purge-confirm.ts";
import * as purgePrepareTool from "../../tools/lifecycle-purge-prepare.ts";
import * as restoreTool from "../../tools/lifecycle-restore.ts";
import * as trashDocumentTool from "../../tools/lifecycle-trash-document.ts";
import * as trashDossierTool from "../../tools/lifecycle-trash-dossier.ts";
import registerLifecycleRoutes from "../../src/interfaces/routes/lifecycle/register-lifecycle-routes.ts";
import { MemoryResources } from "../foundation/memory-resources.ts";

type Handler = (context: { req: { json(): Promise<unknown>; query(name: string): string | undefined; param(name: string): string }; json(value: unknown, status?: number): unknown }) => unknown | Promise<unknown>;

class FakeApp {
  readonly handlers = new Map<string, Handler>();
  get(path: string, handler: Handler): void { this.handlers.set(`GET ${path}`, handler); }
  post(path: string, handler: Handler): void { this.handlers.set(`POST ${path}`, handler); }
}

function request(input: { body?: unknown; query?: Record<string, string>; params?: Record<string, string> }) {
  return {
    req: {
      async json() { return input.body; },
      query(name: string) { return input.query?.[name]; },
      param(name: string) { return input.params?.[name] ?? ""; },
    },
    json(value: unknown, status = 200) { return { status, body: value }; },
  };
}

test("lifecycle tools expose stable names and keep every workspace mutation reviewer-bound", async () => {
  assert.deepEqual(
    [listTool.name, trashDossierTool.name, trashDocumentTool.name, restoreTool.name, purgePrepareTool.name, purgeConfirmTool.name, deleteContactTool.name, auditTool.name, auditCleanupTool.name],
    ["trash_list", "trash_dossier", "trash_document", "restore", "delete_prepare", "delete_confirm", "contact_delete", "audit_query", "audit_cleanup"],
  );
  assert.equal(listTool.sessionPermission.readOnly, true);
  assert.equal(auditTool.sessionPermission.readOnly, true);
  assert.equal(catalogContactTool.sessionPermission.auto, "review");
  for (const tool of [trashDossierTool, trashDocumentTool, restoreTool, purgePrepareTool, purgeConfirmTool, deleteContactTool, auditCleanupTool]) {
    assert.equal(tool.sessionPermission.auto, "review");
    assert.equal(tool.sessionPermission.describeSideEffect?.({ workspaceMountId: "C:/secret" }), null);
  }
  const resources = new MemoryResources();
  const result = await trashDossierTool.execute({ workspaceMountId: "C:/secret", dossierId: "dos_invalid", expectedRevision: 1 }, { resources, userId: "owner", sessionId: "session" } as never);
  assert.equal(result.isError, true);
  assert.equal(resources.mutations.length, 0);
  assert.doesNotMatch(JSON.stringify(result.details), /C:\/|secret/);
});

test("lifecycle routes register the complete behavior surface and fail closed on unsafe workspace selection", async () => {
  const app = new FakeApp(); const resources = new MemoryResources();
  registerLifecycleRoutes(app as never, { resources: resources as never, userId: "owner", sessionId: "page-session" });
  assert.deepEqual([...app.handlers.keys()].sort(), [
    "GET /lifecycle/audit",
    "GET /lifecycle/trash",
    "POST /lifecycle/audit/cleanup",
    "POST /lifecycle/dossiers/:dossierId/documents/:documentId/trash",
    "POST /lifecycle/dossiers/:dossierId/trash",
    "POST /lifecycle/trash/:recordId/purge/confirm",
    "POST /lifecycle/trash/:recordId/purge/prepare",
    "POST /lifecycle/trash/:recordId/restore",
  ]);
  const handler = app.handlers.get("POST /lifecycle/dossiers/:dossierId/trash")!;
  const response = await handler(request({ body: { workspaceMountId: "C:/secret", expectedRevision: 1 }, params: { dossierId: "dos_invalid" } })) as { status: number; body: unknown };
  assert.equal(response.status, 400);
  assert.equal(resources.mutations.length, 0);
  assert.doesNotMatch(JSON.stringify(response.body), /C:\/|secret/);
});

test("write tools and routes require host-owned actor/session identity before lifecycle mutation", async () => {
  const resources = new MemoryResources();
  const result = await trashDossierTool.execute({ workspaceMountId: "workspace", dossierId: "dos_invalid", expectedRevision: 1 }, { resources, userId: "owner" } as never);
  assert.equal(result.isError, true);
  assert.equal((result.details as { error: { code: string } }).error.code, "validation");
  assert.equal(resources.mutations.length, 0);
});
