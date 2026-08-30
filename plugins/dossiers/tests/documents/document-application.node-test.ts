import assert from "node:assert/strict";
import test from "node:test";

import { CatalogApplication } from "../../src/application/catalog/catalog-application.ts";
import { DocumentApplication } from "../../src/application/documents/document-application.ts";
import { DocumentError } from "../../src/application/documents/errors.ts";
import { DossiersRuntime } from "../../src/runtime.ts";
import { MemoryResources } from "../foundation/memory-resources.ts";

type ResourceRef =
  | { kind: "mount"; mountId: string; path: string }
  | { kind: "local-file"; path: string };

class DocumentResources extends MemoryResources {
  readonly documentMutations: string[] = [];
  #failures = new Map<string, number>();

  failDocumentOperation(operation: "copy" | "move", afterSuccessfulCalls = 0): void {
    this.#failures.set(operation, afterSuccessfulCalls + 1);
  }

  #check(operation: "copy" | "move"): void {
    const remaining = this.#failures.get(operation);
    if (remaining === undefined) return;
    if (remaining === 1) {
      this.#failures.delete(operation);
      throw new Error(`injected ${operation} failure`);
    }
    this.#failures.set(operation, remaining - 1);
  }

  async copy(from: ResourceRef, to: ResourceRef) {
    this.#check("copy");
    this.documentMutations.push(`copy:${from.kind}:${from.path}->${to.kind}:${to.path}`);
    return this.write(to, (await this.read(from)).content);
  }

  async move(from: ResourceRef, to: ResourceRef) {
    this.#check("move");
    this.documentMutations.push(`move:${from.kind}:${from.path}->${to.kind}:${to.path}`);
    await this.copy(from, to);
    await this.delete(from);
    return {
      oldResourceKey: `${from.kind}:${from.path}`,
      newResourceKey: `${to.kind}:${to.path}`,
      oldResource: from,
      newResource: to,
    };
  }
}

async function fixture() {
  const resources = new DocumentResources();
  const scope = {
    resources: resources as never,
    workspaceRoot: { kind: "mount" as const, mountId: "workspace", path: "" },
  };
  const runtime = new DossiersRuntime();
  const catalog = new CatalogApplication({ runtime, scope });
  await catalog.initialize();
  const person = (await catalog.listTypes()).items.find((item) => item.key === "person")!;
  const dossier = await catalog.createDossier({ name: "项目资料", typeId: person.id, fields: {} });
  const application = new DocumentApplication({ runtime, scope });
  return { resources, scope, catalog, dossier, application };
}

function local(path: string): ResourceRef {
  return { kind: "local-file", path };
}

function mount(path: string): ResourceRef {
  return { kind: "mount", mountId: "workspace", path };
}

test("copies an external file and publishes only its dossier-relative reference", async () => {
  const { resources, dossier, application } = await fixture();
  resources.seedFile(local("C:/incoming/合同.pdf"), "contract bytes");

  const preview = await application.previewImport({
    dossierId: dossier.id,
    expectedRevision: dossier.revision,
    categoryId: "contracts",
    sources: [{ ref: local("C:/incoming/合同.pdf") }],
  });
  assert.equal(preview.totalBytes, 14);
  assert.equal(preview.items[0]?.action, "copy");
  assert.equal(resources.mutations.length > 0, true, "fixture initialization is allowed, preview adds no mutations");
  const mutationsBeforeCommit = resources.mutations.length;

  const committed = await application.commitPreview(preview.previewId, dossier.revision);

  assert.equal(committed.documents.length, 1);
  assert.equal(committed.documents[0]?.relativePath, "documents/contracts/合同.pdf");
  assert.equal(resources.text(mount(`Dossiers/dossiers/${dossier.id}/documents/contracts/合同.pdf`)), "contract bytes");
  assert.equal(resources.text(local("C:/incoming/合同.pdf")), "contract bytes");
  assert.equal(resources.mutations.length > mutationsBeforeCommit, true);
  assert.doesNotMatch(JSON.stringify(committed), /C:\/incoming|file:\/\//);
});

test("registers a file already inside the target managed directory without copying it", async () => {
  const { resources, dossier, application } = await fixture();
  const managed = `Dossiers/dossiers/${dossier.id}/documents/reports/季度报告.md`;
  resources.seedFile(mount(managed), "quarterly");
  const copiesBefore = resources.documentMutations.length;

  const preview = await application.previewImport({
    dossierId: dossier.id,
    expectedRevision: dossier.revision,
    categoryId: "contracts",
    sources: [{ ref: mount(managed) }],
  });
  assert.equal(preview.items[0]?.action, "reference");
  assert.equal(preview.items[0]?.categoryId, "reports");
  const result = await application.commitPreview(preview.previewId, dossier.revision);

  assert.equal(result.documents[0]?.relativePath, "documents/reports/季度报告.md");
  assert.equal(resources.documentMutations.length, copiesBefore);
});

test("identifies equal bytes as duplicates and uses a stable hash suffix for name conflicts", async () => {
  const { resources, dossier, application } = await fixture();
  resources.seedFile(local("C:/incoming/report.txt"), "first");
  let preview = await application.previewImport({
    dossierId: dossier.id,
    expectedRevision: dossier.revision,
    categoryId: "reports",
    sources: [{ ref: local("C:/incoming/report.txt") }],
  });
  const result = await application.commitPreview(preview.previewId, dossier.revision);

  resources.seedFile(local("D:/same/report-copy.txt"), "first");
  preview = await application.previewImport({
    dossierId: dossier.id,
    expectedRevision: result.revision,
    categoryId: "reports",
    sources: [{ ref: local("D:/same/report-copy.txt") }],
  });
  assert.equal(preview.items[0]?.action, "duplicate");
  const unchanged = await application.commitPreview(preview.previewId, result.revision);
  assert.equal(unchanged.revision, result.revision);
  assert.equal(unchanged.documents.length, 1);

  resources.seedFile(local("E:/different/report.txt"), "second");
  preview = await application.previewImport({
    dossierId: dossier.id,
    expectedRevision: result.revision,
    categoryId: "reports",
    sources: [{ ref: local("E:/different/report.txt") }],
  });
  assert.match(preview.items[0]?.relativePath ?? "", /^documents\/reports\/report--[a-f0-9]{8}\.txt$/);
  const repeated = await application.previewImport({
    dossierId: dossier.id,
    expectedRevision: result.revision,
    categoryId: "reports",
    sources: [{ ref: local("E:/different/report.txt") }],
  });
  assert.equal(repeated.items[0]?.relativePath, preview.items[0]?.relativePath);

  resources.seedFile(local("F:/batch/one.bin"), "same-batch");
  resources.seedFile(local("F:/batch/two.bin"), "same-batch");
  const batch = await application.previewImport({
    dossierId: dossier.id,
    expectedRevision: result.revision,
    categoryId: "general",
    sources: [{ ref: local("F:/batch/one.bin") }, { ref: local("F:/batch/two.bin") }],
  });
  assert.deepEqual(batch.items.map((item) => item.action), ["copy", "duplicate"]);
  assert.match(batch.items[1]?.duplicateOf ?? "", /^doc_[a-z0-9_-]+$/);
});

test("recursively previews a folder and preserves safe subdirectories", async () => {
  const { resources, dossier, application } = await fixture();
  resources.seedDirectory(local("C:/incoming/folder"));
  resources.seedDirectory(local("C:/incoming/folder/sub"));
  resources.seedFile(local("C:/incoming/folder/one.txt"), "one");
  resources.seedFile(local("C:/incoming/folder/sub/two.txt"), "two");

  const preview = await application.previewImport({
    dossierId: dossier.id,
    expectedRevision: dossier.revision,
    categoryId: "general",
    sources: [{ ref: local("C:/incoming/folder") }],
  });
  assert.deepEqual(preview.items.map((item) => item.relativePath), [
    "documents/general/folder/one.txt",
    "documents/general/folder/sub/two.txt",
  ]);
  const result = await application.commitPreview(preview.previewId, dossier.revision);
  assert.equal(result.documents.length, 2);

  resources.seedDirectory(local("C:/incoming/empty"));
  await assert.rejects(application.previewImport({
    dossierId: dossier.id,
    expectedRevision: result.revision,
    categoryId: "general",
    sources: [{ ref: local("C:/incoming/empty") }],
  }), (error: unknown) => error instanceof DocumentError && error.code === "validation");
});

test("capacity, cancellation, traversal, and a changed source fail before authority publication", async () => {
  const { resources, dossier, application } = await fixture();
  resources.seedFile(local("C:/incoming/large.bin"), "123456");
  await assert.rejects(application.previewImport({
    dossierId: dossier.id,
    expectedRevision: dossier.revision,
    categoryId: "general",
    maxBytes: 5,
    sources: [{ ref: local("C:/incoming/large.bin") }],
  }), (error: unknown) => error instanceof DocumentError && error.code === "capacity_insufficient");
  await assert.rejects(application.previewImport({
    dossierId: dossier.id,
    expectedRevision: dossier.revision,
    categoryId: "general",
    sources: [{ ref: local("C:/incoming/good.txt"), name: "../escape.txt" }],
  }), (error: unknown) => error instanceof DocumentError && error.code === "validation");

  const preview = await application.previewImport({
    dossierId: dossier.id,
    expectedRevision: dossier.revision,
    categoryId: "general",
    sources: [{ ref: local("C:/incoming/large.bin") }],
  });
  assert.equal(application.cancelPreview(preview.previewId).status, "cancelled");
  await assert.rejects(application.commitPreview(preview.previewId, dossier.revision), (error: unknown) => error instanceof DocumentError && error.code === "preview_cancelled");

  const stale = await application.previewImport({
    dossierId: dossier.id,
    expectedRevision: dossier.revision,
    categoryId: "general",
    sources: [{ ref: local("C:/incoming/large.bin") }],
  });
  resources.seedFile(local("C:/incoming/large.bin"), "changed");
  await assert.rejects(application.commitPreview(stale.previewId, dossier.revision), (error: unknown) => error instanceof DocumentError && error.code === "preview_stale");
  assert.equal((await application.getDocuments(dossier.id)).documents.length, 0);
});

test("copy failure cleans staging and leaves the dossier manifest unchanged", async () => {
  const { resources, dossier, application } = await fixture();
  resources.seedFile(local("C:/incoming/one.txt"), "one");
  resources.seedFile(local("C:/incoming/two.txt"), "two");
  const preview = await application.previewImport({
    dossierId: dossier.id,
    expectedRevision: dossier.revision,
    categoryId: "general",
    sources: [{ ref: local("C:/incoming/one.txt") }, { ref: local("C:/incoming/two.txt") }],
  });
  resources.failDocumentOperation("copy", 1);

  await assert.rejects(application.commitPreview(preview.previewId, dossier.revision), (error: unknown) => error instanceof DocumentError && error.code === "resource_operation_failed");
  const current = await application.getDocuments(dossier.id);
  assert.equal(current.documents.length, 0);
  assert.equal(resources.text(mount(`Dossiers/dossiers/${dossier.id}/documents/general/one.txt`)), null);
  const staging = await resources.list(mount("Dossiers/.system/staging"));
  assert.equal(staging.items.some((item) => item.name === preview.previewId), false);
});

test("manifest publication failure removes newly finalized bytes and leaves no half reference", async () => {
  const { resources, dossier, application } = await fixture();
  resources.seedFile(local("C:/incoming/finalize.txt"), "finalize");
  const preview = await application.previewImport({ dossierId: dossier.id, expectedRevision: dossier.revision, categoryId: "general", sources: [{ ref: local("C:/incoming/finalize.txt") }] });
  resources.failNext("writeExpectedVersion", "manifest publication failed");

  await assert.rejects(application.commitPreview(preview.previewId, dossier.revision), (error: unknown) => error instanceof DocumentError && error.code === "resource_operation_failed");
  assert.equal((await application.getDocuments(dossier.id)).documents.length, 0);
  assert.equal(resources.text(mount(`Dossiers/dossiers/${dossier.id}/documents/general/finalize.txt`)), null);
});

test("a dossier revision change makes an otherwise valid preview stale", async () => {
  const { resources, dossier, catalog, application } = await fixture();
  resources.seedFile(local("C:/incoming/stale.txt"), "stale");
  const preview = await application.previewImport({ dossierId: dossier.id, expectedRevision: dossier.revision, categoryId: "general", sources: [{ ref: local("C:/incoming/stale.txt") }] });
  await catalog.updateDossier(dossier.id, dossier.revision, { tags: ["changed"] });

  await assert.rejects(application.commitPreview(preview.previewId, dossier.revision), (error: unknown) => error instanceof DocumentError && error.code === "preview_stale");
});

test("moves a primary category atomically while tag-only updates do not move bytes", async () => {
  const { resources, dossier, application } = await fixture();
  resources.seedFile(local("C:/incoming/plan.md"), "plan");
  const preview = await application.previewImport({
    dossierId: dossier.id,
    expectedRevision: dossier.revision,
    categoryId: "general",
    sources: [{ ref: local("C:/incoming/plan.md") }],
  });
  let result = await application.commitPreview(preview.previewId, dossier.revision);
  const document = result.documents[0]!;
  const beforeTagMoves = resources.documentMutations.filter((item) => item.startsWith("move:")).length;
  result = await application.updateDocument(dossier.id, document.id, result.revision, { tags: ["重要", "2026"] });
  assert.equal(resources.documentMutations.filter((item) => item.startsWith("move:")).length, beforeTagMoves);
  assert.deepEqual(result.documents[0]?.tags, ["重要", "2026"]);

  result = await application.updateDocument(dossier.id, document.id, result.revision, { categoryId: "reports" });
  assert.equal(result.documents[0]?.relativePath, "documents/reports/plan.md");
  assert.equal(resources.text(mount(`Dossiers/dossiers/${dossier.id}/documents/general/plan.md`)), null);
  assert.equal(resources.text(mount(`Dossiers/dossiers/${dossier.id}/documents/reports/plan.md`)), "plan");
});

test("a failed category move preserves both the old path and old manifest", async () => {
  const { resources, dossier, application } = await fixture();
  resources.seedFile(local("C:/incoming/plan.md"), "plan");
  const preview = await application.previewImport({ dossierId: dossier.id, expectedRevision: dossier.revision, categoryId: "general", sources: [{ ref: local("C:/incoming/plan.md") }] });
  const imported = await application.commitPreview(preview.previewId, dossier.revision);
  resources.failDocumentOperation("move");

  await assert.rejects(application.updateDocument(dossier.id, imported.documents[0]!.id, imported.revision, { categoryId: "reports" }), (error: unknown) => error instanceof DocumentError && error.code === "resource_operation_failed");
  const current = await application.getDocuments(dossier.id);
  assert.equal(current.documents[0]?.relativePath, "documents/general/plan.md");
  assert.equal(resources.text(mount(`Dossiers/dossiers/${dossier.id}/documents/general/plan.md`)), "plan");
});

test("creates custom categories in the dossier authority and rejects stale revisions", async () => {
  const { dossier, application } = await fixture();
  const created = await application.createCategory(dossier.id, dossier.revision, { id: "legal-review", name: "法务复核" });
  assert.equal(created.categories.find((item) => item.id === "legal-review")?.name, "法务复核");
  await assert.rejects(application.createCategory(dossier.id, dossier.revision, { id: "finance", name: "财务" }), (error: unknown) => error instanceof DocumentError && error.code === "conflict");
});

test("fails closed on a persisted document with an unsafe relative reference", async () => {
  const { resources, scope, dossier, application } = await fixture();
  const ref = { ...scope.workspaceRoot, path: `Dossiers/dossiers/${dossier.id}/dossier.json` };
  const stored = JSON.parse(resources.text(ref) ?? "null");
  stored.documents = [{
    kind: "hana.dossiers.document", schemaVersion: 1, id: "doc_01hzunsafevalue", name: "escape.txt",
    relativePath: "documents/general/../escape.txt", categoryId: "general", tags: [], size: 1,
    sha256: "0".repeat(64), revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), extensions: {},
  }];
  resources.seedFile(ref, JSON.stringify(stored));

  await assert.rejects(application.getDocuments(dossier.id), (error: unknown) => error instanceof DocumentError && error.code === "resource_operation_failed");
});
