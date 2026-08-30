import assert from "node:assert/strict";
import test from "node:test";

import { CatalogApplication } from "../../src/application/catalog/catalog-application.ts";
import { DocumentApplication } from "../../src/application/documents/document-application.ts";
import { createZipArchive } from "../../src/application/exchange/archive-codec.ts";
import { ExchangeApplication } from "../../src/application/exchange/exchange-application.ts";
import { ExchangeError } from "../../src/application/exchange/errors.ts";
import { DossiersRuntime } from "../../src/runtime.ts";
import { MemoryResources } from "../foundation/memory-resources.ts";

type ResourceRef =
  | { kind: "mount"; mountId: string; path: string }
  | { kind: "local-file"; path: string };

function keyOf(ref: ResourceRef): string {
  return ref.kind === "mount" ? `mount:${ref.mountId}:${ref.path.replaceAll("\\", "/")}` : `local:${ref.path.replaceAll("\\", "/")}`;
}

class ExchangeResources extends MemoryResources {
  failMove = false;

  async copy(from: ResourceRef, to: ResourceRef) {
    return this.write(to, (await this.read(from)).content);
  }

  async move(from: ResourceRef, to: ResourceRef) {
    if (this.failMove) {
      this.failMove = false;
      throw new Error("injected move failure");
    }
    const sourceKey = keyOf(from);
    const targetKey = keyOf(to);
    const matched = [...this.entries.entries()].filter(([key]) => key === sourceKey || key.startsWith(`${sourceKey}/`));
    if (matched.length === 0) throw new Error("ENOENT");
    for (const [key, entry] of matched) this.entries.set(`${targetKey}${key.slice(sourceKey.length)}`, entry);
    for (const [key] of matched) this.entries.delete(key);
    return { oldResourceKey: sourceKey, newResourceKey: targetKey, oldResource: from, newResource: to };
  }
}

const NOW = "2026-08-30T06:00:00.000Z";

function scope(resources: ExchangeResources, mountId: string) {
  return { resources: resources as never, workspaceRoot: { kind: "mount" as const, mountId, path: "" } };
}

test("exports and imports a self-contained dossier without overwriting on repeat", async () => {
  const resources = new ExchangeResources();
  const runtime = new DossiersRuntime({ now: () => NOW, createId: () => "lib_01hzportablelib" });
  const sourceScope = scope(resources, "source");
  const sourceCatalog = new CatalogApplication({ runtime, scope: sourceScope, now: () => NOW });
  await sourceCatalog.initialize();
  const organization = (await sourceCatalog.listTypes()).items.find((item) => item.key === "organization")!;
  const dossier = await sourceCatalog.createDossier({
    name: "广州数据交易所",
    typeId: organization.id,
    fields: { fld_org_address: "广州" },
    tags: ["数据要素"],
  });
  const contact = await sourceCatalog.createContact({ name: "张三", organization: "广州数据交易所", emails: ["zhang@example.com"] });
  const linked = await sourceCatalog.linkContact(dossier.id, dossier.revision, { contactId: contact.id, role: "项目联系人" });
  resources.seedFile({ kind: "local-file", path: "C:/incoming/规则.txt" }, "exchange rules");
  const documents = new DocumentApplication({ runtime, scope: sourceScope, now: () => NOW });
  const documentPreview = await documents.previewImport({
    dossierId: dossier.id,
    expectedRevision: linked.revision,
    categoryId: "reports",
    sources: [{ ref: { kind: "local-file", path: "C:/incoming/规则.txt" } }],
  });
  await documents.commitPreview(documentPreview.previewId, linked.revision);

  const sourceExchange = new ExchangeApplication({ runtime, scope: sourceScope, now: () => NOW });
  const exported = await sourceExchange.exportDossier(dossier.id);
  assert.equal(exported.fileCount, 4);
  assert.match(exported.archiveRef.path, /^Dossiers\/exchange\/exports\/dos_.+\.zip$/);

  const targetScope = scope(resources, "target");
  const targetCatalog = new CatalogApplication({ runtime, scope: targetScope, now: () => NOW });
  await targetCatalog.initialize();
  const targetExchange = new ExchangeApplication({ runtime, scope: targetScope, now: () => NOW });
  const inspected = await targetExchange.inspectImport({ archiveRef: exported.archiveRef });
  assert.equal(inspected.name, "广州数据交易所");
  assert.equal(inspected.documents, 1);
  assert.equal(inspected.contacts, 1);
  assert.notEqual(inspected.targetDossierId, dossier.id);

  const originalArchive = (await resources.read(exported.archiveRef)).content;
  await resources.write(exported.archiveRef, new Uint8Array([...originalArchive, 0]));
  await assert.rejects(
    targetExchange.commitImport(inspected.previewId, inspected.confirmationToken),
    (error: unknown) => error instanceof ExchangeError && error.code === "confirmation_invalid",
  );
  await resources.write(exported.archiveRef, originalArchive);
  const confirmed = await targetExchange.inspectImport({ archiveRef: exported.archiveRef });
  const committed = await targetExchange.commitImport(confirmed.previewId, confirmed.confirmationToken);
  const imported = await targetCatalog.getDossier(committed.dossierId);
  assert.equal(imported.name, "广州数据交易所");
  assert.deepEqual(imported.tags, ["数据要素"]);
  assert.equal(imported.contacts[0]?.role, "项目联系人");
  assert.equal(resources.text({ kind: "mount", mountId: "target", path: `Dossiers/dossiers/${committed.dossierId}/documents/reports/规则.txt` }), "exchange rules");

  const repeated = await targetExchange.inspectImport({ archiveRef: exported.archiveRef });
  const [second, concurrentReplay] = await Promise.all([
    targetExchange.commitImport(repeated.previewId, repeated.confirmationToken),
    targetExchange.commitImport(repeated.previewId, repeated.confirmationToken),
  ]);
  assert.notEqual(second.dossierId, committed.dossierId);
  assert.equal(concurrentReplay.dossierId, second.dossierId);
});

test("a failed final directory move leaves no visible half dossier", async () => {
  const resources = new ExchangeResources();
  const runtime = new DossiersRuntime({ now: () => NOW, createId: () => "lib_01hzportablelib" });
  const sourceScope = scope(resources, "source-failure");
  const catalog = new CatalogApplication({ runtime, scope: sourceScope, now: () => NOW });
  await catalog.initialize();
  const person = (await catalog.listTypes()).items.find((item) => item.key === "person")!;
  const dossier = await catalog.createDossier({ name: "Failure", typeId: person.id, fields: {} });
  const contact = await catalog.createContact({ name: "Rollback Contact", emails: ["rollback@example.com"] });
  await catalog.linkContact(dossier.id, dossier.revision, { contactId: contact.id, role: "owner" });
  const exchange = new ExchangeApplication({ runtime, scope: sourceScope, now: () => NOW });
  const exported = await exchange.exportDossier(dossier.id);

  const targetScope = scope(resources, "target-failure");
  const targetCatalog = new CatalogApplication({ runtime, scope: targetScope, now: () => NOW });
  await targetCatalog.initialize();
  const target = new ExchangeApplication({ runtime, scope: targetScope, now: () => NOW });
  const inspected = await target.inspectImport({ archiveRef: exported.archiveRef });
  resources.failMove = true;
  await assert.rejects(target.commitImport(inspected.previewId, inspected.confirmationToken));
  const listing = await resources.list({ kind: "mount", mountId: "target-failure", path: "Dossiers/dossiers" });
  assert.deepEqual(listing.items, []);
  assert.deepEqual((await targetCatalog.listContacts()).items, []);
});

test("unknown schemas and bad hashes are rejected without target authority mutations", async () => {
  const resources = new ExchangeResources();
  const runtime = new DossiersRuntime({ now: () => NOW, createId: () => "lib_01hzportablelib" });
  const targetScope = scope(resources, "hostile-target");
  await new CatalogApplication({ runtime, scope: targetScope, now: () => NOW }).initialize();
  const application = new ExchangeApplication({ runtime, scope: targetScope, now: () => NOW });
  const mutationsBefore = resources.mutations.length;
  const encoder = new TextEncoder();

  const futureRef = { kind: "local-file" as const, path: "C:/incoming/future.zip" };
  const futureManifest = { kind: "hana.dossiers.exchange", schemaVersion: 99, dossierId: "dos_01hzfuturevalue", exportedAt: NOW, files: [], extensions: {} };
  await resources.write(futureRef, createZipArchive([{ path: "dossier-exchange.json", content: encoder.encode(`${JSON.stringify(futureManifest)}\n`) }]));
  const afterExternalSeed = resources.mutations.length;
  await assert.rejects(application.inspectImport({ archiveRef: futureRef }), (error: unknown) => error instanceof ExchangeError && error.code === "unsupported_schema");
  assert.equal(resources.mutations.length, afterExternalSeed);

  const badHashRef = { kind: "local-file" as const, path: "C:/incoming/bad-hash.zip" };
  const payload = encoder.encode("{}\n");
  const badHashManifest = {
    kind: "hana.dossiers.exchange", schemaVersion: 1, dossierId: "dos_01hzbad_hash", exportedAt: NOW,
    files: [{ path: "dossier/dossier.json", size: payload.byteLength, sha256: "0".repeat(64) }], extensions: {},
  };
  await resources.write(badHashRef, createZipArchive([
    { path: "dossier-exchange.json", content: encoder.encode(`${JSON.stringify(badHashManifest)}\n`) },
    { path: "dossier/dossier.json", content: payload },
  ]));
  const afterSecondExternalSeed = resources.mutations.length;
  await assert.rejects(application.inspectImport({ archiveRef: badHashRef }), (error: unknown) => error instanceof ExchangeError && error.code === "integrity_failed");
  assert.equal(resources.mutations.length, afterSecondExternalSeed);
  assert.ok(resources.mutations.length >= mutationsBefore);
});
