import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CatalogApplication } from "../../src/application/catalog/catalog-application.ts";
import { DocumentApplication } from "../../src/application/documents/document-application.ts";
import { MetadataIndexApplication } from "../../src/application/index/metadata-index-application.ts";
import { MetadataIndexRepository } from "../../src/infrastructure/index/metadata-index-repository.ts";
import { DossiersRuntime } from "../../src/runtime.ts";
import { MemoryResources } from "../foundation/memory-resources.ts";

type ResourceRef = { kind: "mount"; mountId: string; path: string } | { kind: "local-file"; path: string };

class IndexResources extends MemoryResources {
  readonly reads: string[] = [];

  override async read(ref: ResourceRef) {
    this.reads.push(ref.path.replaceAll("\\", "/"));
    return super.read(ref);
  }

  async copy(from: ResourceRef, to: ResourceRef) {
    return this.write(to, (await this.read(from)).content);
  }

  async move(from: ResourceRef, to: ResourceRef) {
    await this.copy(from, to);
    await this.delete(from);
    return { oldResourceKey: from.path, newResourceKey: to.path, oldResource: from, newResource: to };
  }
}

async function fixture() {
  const resources = new IndexResources();
  const workspaceRoot = { kind: "mount" as const, mountId: "workspace", path: "" };
  const scope = { resources: resources as never, workspaceRoot };
  const runtime = new DossiersRuntime();
  const catalog = new CatalogApplication({ runtime, scope });
  await catalog.initialize();
  const person = (await catalog.listTypes()).items.find((item) => item.key === "person")!;
  const dossier = await catalog.createDossier({ name: "广州数据交易所", typeId: person.id, fields: { fld_person_email: "archive@example.com" }, tags: ["机构"] });
  const contact = await catalog.createContact({ name: "张三", organization: "数据机构", emails: [], phones: [] });
  const linked = await catalog.linkContact(dossier.id, dossier.revision, { contactId: contact.id, role: "联系人" });
  const documents = new DocumentApplication({ runtime, scope });
  resources.seedFile({ kind: "local-file", path: "C:/private/交易规则.txt" }, "BODY_ONLY_SENTINEL confidential content");
  const preview = await documents.previewImport({
    dossierId: dossier.id,
    expectedRevision: linked.revision,
    categoryId: "contracts",
    sources: [{ ref: { kind: "local-file", path: "C:/private/交易规则.txt" } }],
  });
  await documents.commitPreview(preview.previewId, linked.revision);
  const dataDir = mkdtempSync(join(tmpdir(), "hana-dossiers-index-"));
  const application = new MetadataIndexApplication({ resources: resources as never, workspaceRoot, dataDir });
  return { resources, workspaceRoot, catalog, dossier, dataDir, application };
}

test("rebuilds metadata search across names, types, contacts, fields, tags, and document metadata without reading content", async (t) => {
  const { resources, dataDir, application } = await fixture();
  t.after(() => { application.close(); rmSync(dataDir, { recursive: true, force: true }); });
  resources.reads.length = 0;

  const rebuilt = await application.rebuild();
  assert.equal(rebuilt.dossierCount, 1);
  assert.equal(rebuilt.documentCount, 1);
  assert.equal(rebuilt.status, "ready");
  for (const query of ["广州数据交易所", "person", "archive@example.com", "张三", "机构", "交易规则", "contracts"]) {
    const result = await application.search({ query, limit: 20 });
    assert.equal(result.items.length, 1, query);
    assert.equal(result.items[0]?.name, "广州数据交易所");
  }
  assert.equal((await application.search({ query: "BODY_ONLY_SENTINEL", limit: 20 })).items.length, 0);
  assert.equal(resources.reads.some((path) => path.endsWith("/documents/contracts/交易规则.txt")), false);
  assert.doesNotMatch(JSON.stringify(await application.search({ query: "交易", limit: 20 })), /C:\/private|BODY_ONLY_SENTINEL/);
});

test("deleting or corrupting the derived database never affects authority and rebuilds equivalent results", async (t) => {
  const { dataDir, application } = await fixture();
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  await application.rebuild();
  const before = await application.search({ query: "广州", limit: 20 });
  const indexPath = application.indexPath;
  application.close();
  rmSync(indexPath, { force: true });

  const missing = new MetadataIndexApplication({ resources: application.resources, workspaceRoot: application.workspaceRoot, dataDir });
  assert.equal((await missing.status()).status, "missing");
  await missing.rebuild();
  assert.deepEqual((await missing.search({ query: "广州", limit: 20 })).items, before.items);
  missing.close();

  writeFileSync(indexPath, "not a sqlite database");
  const corrupt = new MetadataIndexApplication({ resources: application.resources, workspaceRoot: application.workspaceRoot, dataDir });
  assert.equal((await corrupt.status()).status, "corrupt");
  assert.equal((await corrupt.search({ query: "广州", limit: 20 })).degraded, true);
  await corrupt.rebuild();
  assert.deepEqual((await corrupt.search({ query: "广州", limit: 20 })).items, before.items);
  corrupt.close();
});

test("stale index rows are hydrated from authority and never fabricate deleted or changed dossiers", async (t) => {
  const { resources, workspaceRoot, dataDir, application } = await fixture();
  t.after(() => { application.close(); rmSync(dataDir, { recursive: true, force: true }); });
  await application.rebuild();
  const dossierRoot = await resources.list({ ...workspaceRoot, path: "Dossiers/dossiers" });
  const dossierId = dossierRoot.items.find((item) => item.isDirectory)!.name;
  const ref = { ...workspaceRoot, path: `Dossiers/dossiers/${dossierId}/dossier.json` };
  const stored = JSON.parse(resources.text(ref) ?? "null");
  stored.name = "更新后的权威名称";
  stored.revision += 1;
  resources.seedFile(ref, JSON.stringify(stored));

  const result = await application.search({ query: "广州", limit: 20 });
  assert.equal(result.items.length, 0);
  assert.equal(result.stale, true);
  assert.equal((await application.search({ query: "更新后的权威名称", limit: 20 })).items[0]?.name, "更新后的权威名称");
});

test("uses parameterized bounded pagination and treats SQL syntax as plain search text", async (t) => {
  const { dataDir, application } = await fixture();
  t.after(() => { application.close(); rmSync(dataDir, { recursive: true, force: true }); });
  await application.rebuild();
  const attack = await application.search({ query: "%' OR 1=1 --", limit: 1 });
  assert.equal(attack.items.length, 0);
  await assert.rejects(application.search({ query: "x", limit: 101 }));
  assert.equal((await application.status()).queryPlan.some((line) => /dossiers/i.test(line)), true);
});

test("rebuilds a 1,000 dossier and 10,000 document metadata fixture within the recorded scale gate", async (t) => {
  const resources = new IndexResources();
  const workspaceRoot = { kind: "mount" as const, mountId: "scale", path: "" };
  const scope = { resources: resources as never, workspaceRoot };
  const catalog = new CatalogApplication({ runtime: new DossiersRuntime(), scope });
  await catalog.initialize();
  const now = new Date().toISOString();
  for (let dossierIndex = 0; dossierIndex < 1000; dossierIndex += 1) {
    const dossierId = `dos_${dossierIndex.toString(36).padStart(8, "0")}`;
    resources.seedDirectory({ ...workspaceRoot, path: `Dossiers/dossiers/${dossierId}` });
    const documents = Array.from({ length: 10 }, (_, documentIndex) => {
      const serial = dossierIndex * 10 + documentIndex;
      return {
        kind: "hana.dossiers.document", schemaVersion: 1, id: `doc_${serial.toString(36).padStart(8, "0")}`,
        name: `document-${serial}.txt`, relativePath: `documents/general/document-${serial}.txt`, categoryId: "general",
        tags: [`batch-${dossierIndex % 10}`], size: 10, sha256: serial.toString(16).padStart(64, "0"), revision: 1,
        createdAt: now, updatedAt: now, extensions: {},
      };
    });
    resources.seedFile({ ...workspaceRoot, path: `Dossiers/dossiers/${dossierId}/dossier.json` }, JSON.stringify({
      kind: "hana.dossiers.dossier", schemaVersion: 1, id: dossierId, name: `Scale Dossier ${dossierIndex}`,
      typeId: "typ_builtin_project", fields: {}, tags: [`group-${dossierIndex % 20}`], contacts: [], documents,
      revision: 1, createdAt: now, updatedAt: now, extensions: {},
    }));
  }
  const dataDir = mkdtempSync(join(tmpdir(), "hana-dossiers-scale-"));
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  const application = new MetadataIndexApplication({ resources: resources as never, workspaceRoot, dataDir });
  const maxRssBeforeKb = process.resourceUsage().maxRSS;
  const rebuilt = await application.rebuild();

  assert.equal(rebuilt.dossierCount, 1000);
  assert.equal(rebuilt.documentCount, 10000);
  assert.equal(rebuilt.durationMs < 10_000, true, `rebuild took ${rebuilt.durationMs}ms`);
  const queryStarted = performance.now();
  const result = await application.search({ query: "document-9999", limit: 20 });
  const queryDurationMs = performance.now() - queryStarted;
  assert.equal(result.items.length, 1);
  assert.equal(queryDurationMs < 1_000, true, `query took ${queryDurationMs}ms`);
  assert.equal(rebuilt.databaseBytes > 0, true);
  t.diagnostic(JSON.stringify({
    fixture: { dossiers: 1000, documents: 10000 },
    rebuildDurationMs: Number(rebuilt.durationMs.toFixed(3)),
    queryDurationMs: Number(queryDurationMs.toFixed(3)),
    databaseBytes: rebuilt.databaseBytes,
    maxRssDeltaKb: Math.max(0, process.resourceUsage().maxRSS - maxRssBeforeKb),
    queryPlan: rebuilt.queryPlan,
  }));
  application.close();
});

test("index repository failure is isolated from workspace authority", async (t) => {
  const { resources, workspaceRoot, dataDir, application } = await fixture();
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  await application.rebuild();
  const authorityBefore = [...resources.entries.entries()].filter(([key]) => key.startsWith("mount:workspace:Dossiers/")).map(([key, value]) => [key, value.kind, value.version]);
  application.close();
  writeFileSync(application.indexPath, "broken");
  const repository = new MetadataIndexRepository(application.indexPath);
  assert.equal(repository.status().status, "corrupt");
  assert.throws(() => repository.upsert({ dossierId: "dos_01hzfailuretest", revision: 1, name: "x", typeName: "x", tags: [], documentCount: 0, dossierRef: "Dossiers/dossiers/dos_01hzfailuretest/dossier.json", searchText: "x" }));
  const authorityAfter = [...resources.entries.entries()].filter(([key]) => key.startsWith("mount:workspace:Dossiers/")).map(([key, value]) => [key, value.kind, value.version]);
  assert.deepEqual(authorityAfter, authorityBefore);
  assert.equal(workspaceRoot.mountId, "workspace");
});

test("a failed temporary rebuild preserves the previously ready derived index", (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), "hana-dossiers-atomic-index-"));
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  const path = join(dataDir, "catalog.sqlite");
  const repository = new MetadataIndexRepository(path);
  const entry = {
    dossierId: "dos_01hzatomicvalue", revision: 1, name: "Atomic", typeName: "Project", tags: [], documentCount: 0,
    dossierRef: "Dossiers/dossiers/dos_01hzatomicvalue/dossier.json", searchText: "atomic project",
  };
  repository.rebuild([entry], new Date().toISOString());

  assert.throws(() => repository.rebuild([entry, entry], new Date().toISOString()));
  assert.equal(repository.status().status, "ready");
  assert.equal(repository.search({ query: "atomic", limit: 20 }).length, 1);
  repository.close();
});
