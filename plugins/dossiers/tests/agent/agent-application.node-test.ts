import assert from "node:assert/strict";
import test from "node:test";

import { AgentApplication } from "../../src/application/agent/agent-application.ts";
import { AgentError } from "../../src/application/agent/errors.ts";
import { CatalogApplication } from "../../src/application/catalog/catalog-application.ts";
import { DocumentApplication } from "../../src/application/documents/document-application.ts";
import { DossiersRuntime } from "../../src/runtime.ts";
import { MemoryResources } from "../foundation/memory-resources.ts";

type ResourceRef = { kind: "mount"; mountId: string; path: string } | { kind: "local-file"; path: string };

class AgentResources extends MemoryResources {
  async copy(from: ResourceRef, to: ResourceRef) { return this.write(to, (await this.read(from)).content); }
  async move(from: ResourceRef, to: ResourceRef) {
    await this.copy(from, to); await this.delete(from);
    return { oldResourceKey: from.path, newResourceKey: to.path, oldResource: from, newResource: to };
  }
}

const invocation = { actorId: "local-owner", sessionId: "session-1", source: "agent-tool" as const };

async function fixture() {
  const resources = new AgentResources();
  const runtime = new DossiersRuntime();
  const scope = { resources: resources as never, workspaceRoot: { kind: "mount" as const, mountId: "workspace", path: "" } };
  const catalog = new CatalogApplication({ runtime, scope });
  await catalog.initialize();
  const type = (await catalog.listTypes()).items.find((item) => item.key === "organization")!;
  const dossier = await catalog.createDossier({ name: "广州数据交易所", typeId: type.id, fields: {}, tags: ["机构"] });
  const contact = await catalog.createContact({ name: "张三", emails: ["private@example.com"], phones: ["13800000000"] });
  const suggestedContact = await catalog.createContact({ name: "李四", emails: ["second-private@example.com"], phones: ["13900000000"] });
  const linked = await catalog.linkContact(dossier.id, dossier.revision, { contactId: contact.id, role: "联系人" });
  const documents = new DocumentApplication({ runtime, scope });
  resources.seedFile({ kind: "local-file", path: "C:/private/rules.txt" }, "BODY_SENTINEL full private text");
  const preview = await documents.previewImport({ dossierId: dossier.id, expectedRevision: linked.revision, categoryId: "contracts", sources: [{ ref: { kind: "local-file", path: "C:/private/rules.txt" } }] });
  const imported = await documents.commitPreview(preview.previewId, linked.revision);
  const application = new AgentApplication({ runtime, scope });
  return { resources, runtime, scope, catalog, dossierId: dossier.id, currentRevision: imported.revision, documentId: imported.documents[0]!.id, contactId: suggestedContact.id, application };
}

test("returns only safe metadata and workspace-relative read references in initial Agent context", async () => {
  const { application, dossierId } = await fixture();
  const context = await application.context(dossierId);

  assert.equal(context.modelContentAccess, "enabled");
  assert.equal(context.dossier.name, "广州数据交易所");
  assert.deepEqual(context.dossier.contacts, [{ id: context.dossier.contacts[0]!.id, name: "张三", role: "联系人" }]);
  assert.equal(context.contentResources.length, 2);
  assert.equal(context.contentResources[0]?.ref.kind, "mount");
  assert.match(context.contentResources[0]?.ref.path ?? "", /^Dossiers\/dossiers\/dos_[^/]+\/documents$/);
  assert.match(context.contentResources[1]?.ref.path ?? "", /documents\/contracts\/rules\.txt$/);
  const serialized = JSON.stringify(context);
  assert.doesNotMatch(serialized, /BODY_SENTINEL|private@example\.com|13800000000|C:\/private|file:\/\//);
});

test("model access defaults on, can be disabled without hiding metadata, and never initiates model or network calls", async () => {
  const { application, dossierId } = await fixture();
  assert.equal((await application.modelAccess()).enabled, true);
  const disabled = await application.setModelAccess(false, invocation);
  assert.equal(disabled.enabled, false);
  const context = await application.context(dossierId);
  assert.equal(context.modelContentAccess, "disabled");
  assert.deepEqual(context.contentResources, []);
  assert.equal(context.dossier.name, "广州数据交易所");
  assert.equal((await application.list({ query: "广州", limit: 20 })).items.length, 1);
});

test("a proposed dossier update does not mutate authority and acceptance is actor/session/token/version bound", async () => {
  const { application, catalog, dossierId, currentRevision } = await fixture();
  const before = await catalog.getDossier(dossierId);
  const proposed = await application.propose({
    action: "update_dossier",
    dossierId,
    expectedEntityRevision: currentRevision,
    patch: { name: "建议名称" },
  }, invocation);
  assert.equal(proposed.suggestion.state, "proposed");
  assert.equal((await catalog.getDossier(dossierId)).name, before.name);

  await assert.rejects(application.decide(proposed.suggestion.id, proposed.confirmationToken, "accept", { ...invocation, sessionId: "other-session" }), (error: unknown) => error instanceof AgentError && error.code === "confirmation_invalid");
  await assert.rejects(application.decide(proposed.suggestion.id, "wrong-token", "accept", invocation), (error: unknown) => error instanceof AgentError && error.code === "confirmation_invalid");
  const accepted = await application.decide(proposed.suggestion.id, proposed.confirmationToken, "accept", invocation);
  assert.equal(accepted.suggestion.state, "accepted");
  assert.equal((await catalog.getDossier(dossierId)).name, "建议名称");
  await assert.rejects(application.decide(proposed.suggestion.id, proposed.confirmationToken, "accept", invocation), (error: unknown) => error instanceof AgentError && error.code === "confirmation_invalid");
});

test("document classification suggestions and rejection preserve explicit confirmation semantics", async () => {
  const { application, dossierId, currentRevision, documentId } = await fixture();
  let proposed = await application.propose({
    action: "update_document", dossierId, documentId, expectedEntityRevision: currentRevision, patch: { categoryId: "reports", tags: ["reviewed"] },
  }, invocation);
  const accepted = await application.decide(proposed.suggestion.id, proposed.confirmationToken, "accept", invocation);
  assert.equal(accepted.suggestion.state, "accepted");
  assert.equal((accepted.result as { documents: Array<{ categoryId: string }> }).documents[0]?.categoryId, "reports");

  proposed = await application.propose({ action: "update_dossier", dossierId, expectedEntityRevision: accepted.suggestion.resultRevision!, patch: { name: "不采用" } }, invocation);
  const rejected = await application.decide(proposed.suggestion.id, proposed.confirmationToken, "reject", invocation);
  assert.equal(rejected.suggestion.state, "rejected");
  assert.equal((await application.get(dossierId)).name, "广州数据交易所");
});

test("accepted contact suggestions return a safe projection without contact sensitive values", async () => {
  const { application, dossierId, contactId, currentRevision } = await fixture();
  const proposed = await application.propose({
    action: "link_contact", dossierId, contactId, role: "项目顾问", expectedEntityRevision: currentRevision,
  }, invocation);
  const accepted = await application.decide(proposed.suggestion.id, proposed.confirmationToken, "accept", invocation);
  const serialized = JSON.stringify(accepted);
  assert.match(serialized, /李四|项目顾问/);
  assert.doesNotMatch(serialized, /second-private@example\.com|13900000000/);
});

test("stale proposals and missing invocation identity fail closed", async () => {
  const { application, catalog, dossierId, currentRevision } = await fixture();
  const proposed = await application.propose({ action: "update_dossier", dossierId, expectedEntityRevision: currentRevision, patch: { tags: ["suggested"] } }, invocation);
  await catalog.updateDossier(dossierId, currentRevision, { tags: ["changed"] });
  await assert.rejects(application.decide(proposed.suggestion.id, proposed.confirmationToken, "accept", invocation), (error: unknown) => error instanceof AgentError && error.code === "conflict");
  await assert.rejects(application.setModelAccess(false, { actorId: "local-owner", sessionId: "", source: "agent-tool" }), (error: unknown) => error instanceof AgentError && error.code === "invocation_required");
});

test("direct Agent writes require optimistic revisions and record bounded provenance", async () => {
  const { application, dossierId, currentRevision } = await fixture();
  const updated = await application.updateDossier(dossierId, currentRevision, { tags: ["agent-updated"] }, invocation);
  assert.deepEqual(updated.tags, ["agent-updated"]);
  assert.deepEqual(updated.extensions.agentLastWrite, { actorId: "local-owner", sessionId: "session-1", source: "agent-tool" });
  await assert.rejects(application.updateDossier(dossierId, currentRevision, { tags: ["stale"] }, invocation), (error: unknown) => error instanceof AgentError && error.code === "conflict");
});
