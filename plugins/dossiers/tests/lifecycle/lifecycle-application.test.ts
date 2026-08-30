import assert from "node:assert/strict";
import test from "node:test";

import { CatalogApplication } from "../../src/application/catalog/catalog-application.ts";
import { DocumentApplication } from "../../src/application/documents/document-application.ts";
import { LifecycleApplication } from "../../src/application/lifecycle/lifecycle-application.ts";
import { LifecycleError } from "../../src/application/lifecycle/errors.ts";
import { DossiersRuntime } from "../../src/runtime.ts";
import { MemoryResources } from "../foundation/memory-resources.ts";

type ResourceRef = { kind: "mount"; mountId: string; path: string } | { kind: "local-file"; path: string };

function keyOf(ref: ResourceRef): string { return ref.kind === "mount" ? `mount:${ref.mountId}:${ref.path.replaceAll("\\", "/")}` : `local:${ref.path.replaceAll("\\", "/")}`; }

class LifecycleResources extends MemoryResources {
  #moveFailure = false;
  #payloadDeleteFailure = false;
  #auditWriteFailure = false;
  failMoveOnce(): void { this.#moveFailure = true; }
  failPayloadDeleteOnce(): void { this.#payloadDeleteFailure = true; }
  failAuditWriteOnce(): void { this.#auditWriteFailure = true; }

  async write(ref: ResourceRef, content: string | Uint8Array | ArrayBuffer) {
    if (this.#auditWriteFailure && ref.path.startsWith("Dossiers/audit/")) {
      this.#auditWriteFailure = false;
      throw new Error("injected audit publication failure");
    }
    return super.write(ref, content);
  }

  async copy(from: ResourceRef, to: ResourceRef) { return this.write(to, (await this.read(from)).content); }

  async move(from: ResourceRef, to: ResourceRef) {
    if (this.#moveFailure) { this.#moveFailure = false; throw new Error("injected move failure"); }
    const sourceKey = keyOf(from); const destinationKey = keyOf(to);
    const moved = [...this.entries.entries()].filter(([key]) => key === sourceKey || key.startsWith(`${sourceKey}/`));
    if (!moved.length) throw new Error("ENOENT");
    if ([...this.entries.keys()].some((key) => key === destinationKey || key.startsWith(`${destinationKey}/`))) throw new Error("EEXIST");
    for (const [key, entry] of moved) this.entries.set(`${destinationKey}${key.slice(sourceKey.length)}`, entry);
    for (const [key] of moved) this.entries.delete(key);
    this.mutations.push(`move:${sourceKey}->${destinationKey}`);
    return { oldResourceKey: sourceKey, newResourceKey: destinationKey, oldResource: from, newResource: to };
  }

  async delete(ref: ResourceRef) {
    if (this.#payloadDeleteFailure && ref.path.includes("Dossiers/.trash/items/")) {
      this.#payloadDeleteFailure = false;
      throw new Error("injected payload delete failure");
    }
    return super.delete(ref);
  }
}

const actor = { actorId: "local-owner", sessionId: "session-1", source: "user-action" as const };

async function fixture(initialNow = "2026-01-01T00:00:00.000Z") {
  let clock = initialNow;
  const resources = new LifecycleResources();
  const runtime = new DossiersRuntime();
  const scope = { resources: resources as never, workspaceRoot: { kind: "mount" as const, mountId: "workspace", path: "" } };
  const catalog = new CatalogApplication({ runtime, scope });
  await catalog.initialize();
  const type = (await catalog.listTypes()).items.find((item) => item.key === "project")!;
  const dossier = await catalog.createDossier({ name: "可迁移项目", typeId: type.id, fields: {}, tags: ["portable"] });
  const contact = await catalog.createContact({ name: "张三", emails: ["private@example.com"], phones: ["13800000000"], notes: "CONTACT_SECRET" });
  const linked = await catalog.linkContact(dossier.id, dossier.revision, { contactId: contact.id, role: "负责人" });
  resources.seedFile({ kind: "local-file", path: "C:/private/source.txt" }, "DOCUMENT_BODY_SECRET");
  const documents = new DocumentApplication({ runtime, scope: scope as never });
  const preview = await documents.previewImport({ dossierId: dossier.id, expectedRevision: linked.revision, categoryId: "contracts", sources: [{ ref: { kind: "local-file", path: "C:/private/source.txt" } }] });
  const imported = await documents.commitPreview(preview.previewId, linked.revision);
  const application = new LifecycleApplication({ runtime, scope: scope as never, now: () => clock });
  return {
    resources, runtime, scope, catalog, documents, application, dossierId: dossier.id, documentId: imported.documents[0]!.id, contactId: contact.id, contactRevision: contact.revision,
    dossierRevision: imported.revision, setNow(value: string) { clock = value; },
  };
}

test("moves a complete dossier into portable Trash and restores its stable identity with managed bytes", async () => {
  const { application, resources, catalog, dossierId, dossierRevision } = await fixture();
  const trashed = await application.trashDossier(dossierId, dossierRevision, actor, "user_request");
  assert.equal(trashed.state, "trashed");
  assert.equal((await resources.stat({ kind: "mount", mountId: "workspace", path: `Dossiers/dossiers/${dossierId}` })).exists, false);
  assert.equal((await resources.stat({ kind: "mount", mountId: "workspace", path: trashed.trashRelativePath })).isDirectory, true);
  assert.equal((await application.listTrash()).items.length, 1);

  const restored = await application.restore(trashed.id, trashed.revision, actor);
  assert.equal(restored.record.state, "restored");
  assert.equal((await catalog.getDossier(dossierId)).id, dossierId);
  assert.equal(resources.text({ kind: "mount", mountId: "workspace", path: `Dossiers/dossiers/${dossierId}/documents/contracts/source.txt` }), "DOCUMENT_BODY_SECRET");
});

test("trashes one document with its manifest reference and restores both at the original order and path", async () => {
  const { application, resources, documents, dossierId, documentId, dossierRevision } = await fixture();
  const trashed = await application.trashDocument(dossierId, documentId, dossierRevision, actor, "classification_cleanup");
  assert.equal((await documents.getDocuments(dossierId)).documents.length, 0);
  assert.equal((await resources.stat({ kind: "mount", mountId: "workspace", path: `Dossiers/dossiers/${dossierId}/documents/contracts/source.txt` })).exists, false);
  const restored = await application.restore(trashed.record.id, trashed.record.revision, actor, trashed.dossierRevision!);
  const collection = await documents.getDocuments(dossierId);
  assert.equal(restored.dossierRevision, trashed.dossierRevision! + 1);
  assert.equal(collection.documents[0]?.id, documentId);
  assert.equal(resources.text({ kind: "mount", mountId: "workspace", path: `Dossiers/dossiers/${dossierId}/documents/contracts/source.txt` }), "DOCUMENT_BODY_SECRET");
});

test("restore refuses path conflicts and expired records without overwriting either side", async () => {
  const value = await fixture();
  const trashed = await value.application.trashDossier(value.dossierId, value.dossierRevision, actor);
  value.resources.seedDirectory({ kind: "mount", mountId: "workspace", path: `Dossiers/dossiers/${value.dossierId}` });
  await assert.rejects(value.application.restore(trashed.id, trashed.revision, actor), (error: unknown) => error instanceof LifecycleError && error.code === "conflict");
  assert.equal((await value.resources.stat({ kind: "mount", mountId: "workspace", path: trashed.trashRelativePath })).exists, true);
  await value.resources.delete({ kind: "mount", mountId: "workspace", path: `Dossiers/dossiers/${value.dossierId}` });
  value.setNow("2026-01-31T00:00:00.000Z");
  await assert.rejects(value.application.restore(trashed.id, trashed.revision, actor), (error: unknown) => error instanceof LifecycleError && error.code === "conflict");
});

test("move failures preserve the active dossier and publish no Trash record or lifecycle audit", async () => {
  const value = await fixture();
  value.resources.failMoveOnce();
  await assert.rejects(value.application.trashDossier(value.dossierId, value.dossierRevision, actor), (error: unknown) => error instanceof LifecycleError && error.code === "resource_operation_failed");
  assert.equal((await value.catalog.getDossier(value.dossierId)).id, value.dossierId);
  assert.equal((await value.application.listTrash()).items.length, 0);
  assert.equal((await value.application.queryAudit()).items.length, 0);
});

test("an interrupted soft-delete transition is recovered from its persisted intent without duplicate audit", async () => {
  const value = await fixture();
  value.resources.failAuditWriteOnce();
  await assert.rejects(value.application.trashDossier(value.dossierId, value.dossierRevision, actor));
  assert.equal((await value.resources.stat({ kind: "mount", mountId: "workspace", path: `Dossiers/dossiers/${value.dossierId}` })).exists, false);
  const recovered = await value.application.listTrash();
  assert.equal(recovered.items[0]?.state, "trashed");
  const audits = await value.application.queryAudit();
  assert.equal(audits.items.filter((item) => item.action === "dossier.trash").length, 1);
});

test("an interrupted restore transition completes on the next lifecycle call and keeps one restore audit", async () => {
  const value = await fixture();
  const trashed = await value.application.trashDossier(value.dossierId, value.dossierRevision, actor);
  value.resources.failAuditWriteOnce();
  await assert.rejects(value.application.restore(trashed.id, trashed.revision, actor));
  assert.equal((await value.resources.stat({ kind: "mount", mountId: "workspace", path: `Dossiers/dossiers/${value.dossierId}` })).exists, true);
  const recovered = await value.application.listTrash({ includeResolved: true });
  assert.equal(recovered.items.find((item) => item.id === trashed.id)?.state, "restored");
  const audits = await value.application.queryAudit();
  assert.equal(audits.items.filter((item) => item.action === "dossier.restore").length, 1);
});

test("a dossier revision drift during interrupted document deletion rolls the payload back and cancels the intent", async () => {
  const value = await fixture();
  value.resources.failNext("writeExpectedVersion", "interrupt dossier manifest publication");
  await assert.rejects(value.application.trashDocument(value.dossierId, value.documentId, value.dossierRevision, actor));
  const changed = await value.catalog.updateDossier(value.dossierId, value.dossierRevision, { tags: ["concurrent"] });
  await assert.rejects(value.application.listTrash(), (error: unknown) => error instanceof LifecycleError && error.code === "conflict");
  assert.equal((await value.application.listTrash()).items.length, 0);
  assert.equal((await value.documents.getDocuments(value.dossierId)).documents[0]?.id, value.documentId);
  assert.equal((await value.catalog.getDossier(value.dossierId)).revision, changed.revision);
  assert.equal(value.resources.text({ kind: "mount", mountId: "workspace", path: `Dossiers/dossiers/${value.dossierId}/documents/contracts/source.txt` }), "DOCUMENT_BODY_SECRET");
});

test("contact deletion includes restorable Trash dossiers in its reference check", async () => {
  const value = await fixture();
  const trashed = await value.application.trashDossier(value.dossierId, value.dossierRevision, actor);
  await assert.rejects(value.application.deleteContact(value.contactId, value.contactRevision, actor), (error: unknown) => error instanceof LifecycleError && error.code === "conflict" && Array.isArray(error.details.references));
  assert.equal((await value.catalog.getContact(value.contactId)).id, value.contactId);
  value.setNow("2026-02-01T00:00:00.000Z");
  const prepared = await value.application.preparePurge(trashed.id, trashed.revision, actor);
  await value.application.confirmPurge(trashed.id, prepared.confirmationToken, actor);
  await value.application.deleteContact(value.contactId, value.contactRevision, actor);
  await assert.rejects(value.catalog.getContact(value.contactId));
});

test("purge is retention-, actor-, session-, token-, target-, and version-bound and consumes its confirmation", async () => {
  const value = await fixture();
  const trashed = await value.application.trashDossier(value.dossierId, value.dossierRevision, actor);
  await assert.rejects(value.application.preparePurge(trashed.id, trashed.revision, actor), (error: unknown) => error instanceof LifecycleError && error.code === "retention_active");
  value.setNow("2026-01-31T00:00:01.000Z");
  const prepared = await value.application.preparePurge(trashed.id, trashed.revision, actor);
  await assert.rejects(value.application.confirmPurge(trashed.id, prepared.confirmationToken, { ...actor, sessionId: "other" }), (error: unknown) => error instanceof LifecycleError && error.code === "confirmation_invalid");
  await assert.rejects(value.application.confirmPurge(trashed.id, "wrong", actor), (error: unknown) => error instanceof LifecycleError && error.code === "confirmation_invalid");
  const purged = await value.application.confirmPurge(trashed.id, prepared.confirmationToken, actor);
  assert.equal(purged.record.state, "purged");
  assert.equal((await value.resources.stat({ kind: "mount", mountId: "workspace", path: trashed.trashRelativePath })).exists, false);
  await assert.rejects(value.application.confirmPurge(trashed.id, prepared.confirmationToken, actor), (error: unknown) => error instanceof LifecycleError && error.code === "confirmation_invalid");
});

test("an interrupted irreversible purge remains recoverable and is completed idempotently on the next operation", async () => {
  const value = await fixture();
  const trashed = await value.application.trashDossier(value.dossierId, value.dossierRevision, actor);
  value.setNow("2026-02-01T00:00:00.000Z");
  const prepared = await value.application.preparePurge(trashed.id, trashed.revision, actor);
  value.resources.failPayloadDeleteOnce();
  await assert.rejects(value.application.confirmPurge(trashed.id, prepared.confirmationToken, actor));
  const recovered = await value.application.listTrash({ includeResolved: true });
  assert.equal(recovered.items.find((item) => item.id === trashed.id)?.state, "purged");
  const audits = await value.application.queryAudit({ retention: "permanent" });
  assert.equal(audits.items.filter((item) => item.action === "dossier.purge").length, 1);
});

test("ordinary audit retention removes only events older than one year and preserves permanent and future schemas", async () => {
  const value = await fixture("2024-01-01T00:00:00.000Z");
  const old = await value.application.recordActivity({ action: "dossier.view", targetType: "dossier", targetId: value.dossierId }, actor);
  await value.application.recordActivity({ action: "security.denied", targetType: "security", targetId: "security", retention: "permanent", reason: "policy" }, actor);
  value.resources.seedFile({ kind: "mount", mountId: "workspace", path: "Dossiers/audit/future.json" }, JSON.stringify({ kind: "hana.dossiers.audit-event", schemaVersion: 99, payload: "PRESERVE_ME" }));
  value.setNow("2025-01-01T00:00:01.000Z");
  const cleanup = await value.application.cleanupAudit(actor);
  assert.equal(cleanup.removed, 1);
  assert.equal(cleanup.skippedUnknown, 1);
  assert.equal((await value.resources.stat({ kind: "mount", mountId: "workspace", path: `Dossiers/audit/${old.id}.json` })).exists, false);
  assert.match(value.resources.text({ kind: "mount", mountId: "workspace", path: "Dossiers/audit/future.json" }) ?? "", /PRESERVE_ME/);
  const second = await value.application.cleanupAudit(actor);
  assert.equal(second.removed, 0);
  const permanent = await value.application.queryAudit({ retention: "permanent" });
  assert.ok(permanent.items.some((item) => item.action === "security.denied"));
  assert.equal(permanent.skippedUnknown, 1);
});

test("audit accepts only bounded metadata codes and never persists content, contact values, credentials, model input, or absolute paths", async () => {
  const value = await fixture();
  for (const unsafe of ["DOCUMENT_BODY_SECRET", "private@example.com", "13800000000", "token=credential", "C:/private/source.txt", "full model input"]) {
    await assert.rejects(value.application.recordActivity({ action: "dossier.update", targetType: "dossier", targetId: value.dossierId, reason: unsafe }, actor), (error: unknown) => error instanceof LifecycleError && error.code === "validation");
  }
  const trashed = await value.application.trashDossier(value.dossierId, value.dossierRevision, actor, "user_request");
  const audit = await value.application.queryAudit();
  const serialized = JSON.stringify({ trashed, audit });
  assert.doesNotMatch(serialized, /DOCUMENT_BODY_SECRET|private@example\.com|13800000000|credential|C:\/private|full model input/);
});
