import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CatalogApplication } from "../../src/application/catalog/catalog-application.ts";
import { MigrationApplication } from "../../src/application/migration/migration-application.ts";
import { MigrationError } from "../../src/application/migration/errors.ts";
import { DossiersRuntime } from "../../src/runtime.ts";
import { MemoryResources } from "../foundation/memory-resources.ts";

const root = { kind: "mount" as const, mountId: "workspace", path: "" };
const now = "2026-08-30T00:00:00.000Z";
const dossierId = "dos_01hzmigrationdossier";
const contactId = "con_01hzmigrationcontact";

class FaultResources extends MemoryResources {
  failBackupOnce = false;
  failAuthorityWriteAt = 0;
  failJournalWriteAt = 0;
  #authorityWrites = 0;
  #journalWrites = 0;

  override write(...args: Parameters<MemoryResources["write"]>): ReturnType<MemoryResources["write"]> {
    const [ref] = args;
    if (ref.path.includes("/.system/migrations/") && (ref.path.endsWith("/active.json") || ref.path.endsWith("/journal.json"))) {
      this.#journalWrites += 1;
      if (this.failJournalWriteAt > 0 && this.#journalWrites === this.failJournalWriteAt) {
        this.failJournalWriteAt = 0;
        return Promise.reject(new Error("injected journal failure"));
      }
    }
    if (this.failBackupOnce && ref.path.includes("/.system/migrations/") && ref.path.includes("/backup/")) {
      this.failBackupOnce = false;
      return Promise.reject(new Error("injected backup failure"));
    }
    return super.write(...args);
  }

  override writeExpectedVersion(...args: Parameters<MemoryResources["writeExpectedVersion"]>): ReturnType<MemoryResources["writeExpectedVersion"]> {
    this.#authorityWrites += 1;
    if (this.failAuthorityWriteAt > 0 && this.#authorityWrites === this.failAuthorityWriteAt) {
      this.failAuthorityWriteAt = 0;
      return Promise.reject(new Error("injected authority failure"));
    }
    return super.writeExpectedVersion(...args);
  }
}

function legacyManifest(version = 0): Record<string, unknown> {
  return { kind: "hana.dossiers.library", schemaVersion: version, libraryId: "lib_01hzmigrationlibrary", revision: 3, createdAt: now, updatedAt: now, extensions: { retained: true } };
}

function legacyTypes(version = 0): Record<string, unknown> {
  const type = (id: string, key: string, name: string, fields: unknown[] = []) => ({ kind: "hana.dossiers.dossier-type", schemaVersion: version, id, key, name, builtin: true, fields, revision: 1, createdAt: now, updatedAt: now, extensions: {} });
  return {
    kind: "hana.dossiers.type-catalog", schemaVersion: version, revision: 2,
    types: [
      type("typ_builtin_person", "person", "个人"),
      type("typ_builtin_organization", "organization", "组织", [{ id: "fld_org_registration", key: "registration_number", label: "登记编号", type: "text", order: 0, required: false, extensions: {} }]),
      type("typ_builtin_project", "project", "项目"),
    ],
    createdAt: now, updatedAt: now, extensions: { retained: "types" },
  };
}

function legacyContacts(version = 0): Record<string, unknown> {
  return {
    kind: "hana.dossiers.contact-catalog", schemaVersion: version, revision: 2,
    contacts: [{ kind: "hana.dossiers.contact", schemaVersion: version, id: contactId, name: "张三", organization: "广州数据交易所", emails: [], phones: [], revision: 1, createdAt: now, updatedAt: now, extensions: {} }],
    createdAt: now, updatedAt: now, extensions: {},
  };
}

function legacyDossier(version = 0): Record<string, unknown> {
  return {
    kind: "hana.dossiers.dossier", schemaVersion: version, id: dossierId, name: "广州数据交易所", typeId: "typ_builtin_organization",
    fields: { fld_org_registration: "91440101MA9Y2026X" }, tags: ["数据要素"], contacts: [{ contactId, role: "业务联系人" }],
    documents: [{ kind: "hana.dossiers.document", schemaVersion: version, id: "doc_01hzmigrationdocument", name: "制度.txt", relativePath: "documents/general/制度.txt", categoryId: "general", tags: ["制度"], size: 18, sha256: "a".repeat(64), revision: 1, createdAt: now, updatedAt: now, extensions: {} }],
    revision: 4, createdAt: now, updatedAt: now, extensions: { retained: "dossier" },
  };
}

function seedLegacy(resources: MemoryResources, version = 0): void {
  for (const path of ["Dossiers", "Dossiers/.system", "Dossiers/.system/operations", "Dossiers/.system/staging", "Dossiers/types", "Dossiers/contacts", "Dossiers/dossiers", `Dossiers/dossiers/${dossierId}`, `Dossiers/dossiers/${dossierId}/documents`, `Dossiers/dossiers/${dossierId}/documents/general`, "Dossiers/audit", "Dossiers/.trash"]) {
    resources.seedDirectory({ ...root, path });
  }
  resources.seedFile({ ...root, path: "Dossiers/manifest.json" }, JSON.stringify(legacyManifest(version)));
  resources.seedFile({ ...root, path: "Dossiers/types/types.json" }, JSON.stringify(legacyTypes(version)));
  resources.seedFile({ ...root, path: "Dossiers/contacts/contacts.json" }, JSON.stringify(legacyContacts(version)));
  resources.seedFile({ ...root, path: `Dossiers/dossiers/${dossierId}/dossier.json` }, JSON.stringify(legacyDossier(version)));
  resources.seedFile({ ...root, path: "Dossiers/audit/op_01hzmigrationaudit.json" }, JSON.stringify({ kind: "hana.dossiers.audit-event", schemaVersion: version, id: "op_01hzmigrationaudit", action: "migration.fixture", targetType: "migration", result: "succeeded", retention: "permanent", actor: { actorId: "owner", sessionId: "fixture", source: "user-action" }, occurredAt: now, extensions: {} }));
  resources.seedFile({ ...root, path: `Dossiers/dossiers/${dossierId}/documents/general/制度.txt` }, "secret-body-bytes");
  resources.seedFile({ ...root, path: `Dossiers/dossiers/${dossierId}/documents/general/user.json` }, JSON.stringify({ kind: "hana.dossiers.document", schemaVersion: 0, body: "ordinary managed content" }));
}

function application(resources: MemoryResources): MigrationApplication {
  return new MigrationApplication({
    resources: resources as never,
    workspaceRoot: root,
    now: () => now,
    createMigrationId: () => "mig_01hzmigrationrun",
    createPreviewId: () => "mpr_01hzmigrationplan",
    createConfirmationToken: () => "confirmation-token",
  });
}

async function copyDirectory(source: MemoryResources, target: MemoryResources, sourcePath: string, targetPath: string): Promise<void> {
  target.seedDirectory({ ...root, path: targetPath });
  const listing = await source.list({ ...root, path: sourcePath });
  for (const item of listing.items) {
    const from = `${sourcePath}/${item.name}`;
    const to = `${targetPath}/${item.name}`;
    if (item.isDirectory) await copyDirectory(source, target, from, to);
    else await target.write({ ...root, path: to }, new Uint8Array((await source.read({ ...root, path: from })).content));
  }
}

describe("authority schema migration", () => {
  it("initializes an empty workspace once and then reports a writable current library", async () => {
    const resources = new MemoryResources();
    const migration = application(resources);
    const first = await migration.detect();
    assert.equal(first.state, "ready");
    assert.equal(first.writeAllowed, true);
    const mutations = resources.mutations.length;
    assert.equal((await migration.detect()).state, "ready");
    assert.equal(resources.mutations.length, mutations);
  });

  it("plans without workspace writes, backs up the complete library, and preserves facts", async () => {
    const resources = new MemoryResources();
    seedLegacy(resources);
    const migration = application(resources);
    const beforeMutations = resources.mutations.length;

    assert.deepEqual(await migration.detect(), { state: "needs-migration", currentVersion: 0, targetVersion: 1, writeAllowed: false, exportAllowed: true, reason: "older-schema" });
    const plan = await migration.plan();
    assert.equal(resources.mutations.length, beforeMutations);
    assert.equal(plan.fileCount, 7);
    assert.equal(plan.authorityFileCount, 5);
    assert.equal(plan.requiredBackupBytes, plan.totalBytes);

    const result = await migration.execute(plan.previewId, plan.confirmationToken);
    assert.deepEqual(result, { migrationId: "mig_01hzmigrationrun", state: "ready", migratedFiles: 5, backupRetained: true, reindexRequired: true });
    assert.equal((JSON.parse(resources.text({ ...root, path: "Dossiers/manifest.json" })!) as { schemaVersion: number }).schemaVersion, 1);
    const dossier = JSON.parse(resources.text({ ...root, path: `Dossiers/dossiers/${dossierId}/dossier.json` })!) as Record<string, unknown>;
    assert.equal(dossier.name, "广州数据交易所");
    assert.deepEqual(dossier.fields, { fld_org_registration: "91440101MA9Y2026X" });
    assert.deepEqual(dossier.tags, ["数据要素"]);
    assert.deepEqual((dossier.contacts as Array<Record<string, unknown>>)[0]?.extensions, {});
    assert.equal((dossier.documents as Array<Record<string, unknown>>)[0]?.schemaVersion, 1);
    assert.equal(resources.text({ ...root, path: `Dossiers/dossiers/${dossierId}/documents/general/制度.txt` }), "secret-body-bytes");
    assert.match(resources.text({ ...root, path: `Dossiers/.system/migrations/mig_01hzmigrationrun/backup/dossiers/${dossierId}/documents/general/制度.txt` })!, /secret-body-bytes/);
    assert.equal(resources.text({ ...root, path: `Dossiers/dossiers/${dossierId}/documents/general/user.json` }), JSON.stringify({ kind: "hana.dossiers.document", schemaVersion: 0, body: "ordinary managed content" }));
    assert.doesNotMatch(resources.text({ ...root, path: "Dossiers/.system/migrations/active.json" })!, /secret-body-bytes|ordinary managed content/);
  });

  it("opens a copied complete library with catalog facts and managed bytes intact", async () => {
    const source = new MemoryResources();
    seedLegacy(source);
    const binary = new Uint8Array([0, 255, 1, 128, 13, 10]);
    await source.write({ ...root, path: `Dossiers/dossiers/${dossierId}/documents/general/制度.txt` }, binary);
    const plan = await application(source).plan();
    await application(source).execute(plan.previewId, plan.confirmationToken);
    const copied = new MemoryResources();
    await copyDirectory(source, copied, "Dossiers", "Dossiers");

    assert.equal((await application(copied).detect()).state, "ready");
    const catalog = new CatalogApplication({ runtime: new DossiersRuntime(), scope: { resources: copied as never, workspaceRoot: root } });
    const loaded = await catalog.getDossier(dossierId);
    assert.equal(loaded.name, "广州数据交易所");
    assert.equal(loaded.contacts[0]?.contact.name, "张三");
    assert.deepEqual(new Uint8Array((await copied.read({ ...root, path: `Dossiers/dossiers/${dossierId}/documents/general/制度.txt` })).content), binary);
  });

  it("fails closed on future and unjournaled mixed schemas without writes", async () => {
    const future = new MemoryResources();
    seedLegacy(future, 2);
    const before = future.mutations.length;
    const report = await application(future).detect();
    assert.equal(report.state, "future-version");
    assert.equal(report.writeAllowed, false);
    await assert.rejects(application(future).plan(), (error: unknown) => error instanceof MigrationError && error.code === "future_version");
    assert.equal(future.mutations.length, before);

    const mixed = new MemoryResources();
    seedLegacy(mixed, 0);
    mixed.seedFile({ ...root, path: "Dossiers/manifest.json" }, JSON.stringify(legacyManifest(1)));
    const mixedReport = await application(mixed).detect();
    assert.equal(mixedReport.state, "blocked");
    assert.equal(mixedReport.reason, "mixed-schema-without-recovery-journal");
    assert.equal(mixedReport.writeAllowed, false);
  });

  it("keeps old authority intact when backup fails and resumes after restart", async () => {
    const resources = new FaultResources();
    seedLegacy(resources);
    const migration = application(resources);
    const plan = await migration.plan();
    resources.failBackupOnce = true;
    await assert.rejects(migration.execute(plan.previewId, plan.confirmationToken), (error: unknown) => error instanceof MigrationError && error.code === "resource_operation_failed");
    assert.equal((JSON.parse(resources.text({ ...root, path: "Dossiers/manifest.json" })!) as { schemaVersion: number }).schemaVersion, 0);
    assert.equal((await application(resources).detect()).state, "recoverable");

    const recovered = await application(resources).recover("continue");
    assert.equal(recovered.state, "ready");
    assert.equal((await application(resources).detect()).writeAllowed, true);
  });

  it("restores every authority file after an interrupted mixed-version migration", async () => {
    const resources = new FaultResources();
    seedLegacy(resources);
    const migration = application(resources);
    const plan = await migration.plan();
    resources.failAuthorityWriteAt = 2;
    await assert.rejects(migration.execute(plan.previewId, plan.confirmationToken));
    assert.equal((await application(resources).detect()).state, "recoverable");

    const restored = await application(resources).recover("restore");
    assert.equal(restored.state, "restored");
    assert.equal((await application(resources).detect()).state, "needs-migration");
    assert.equal((JSON.parse(resources.text({ ...root, path: "Dossiers/manifest.json" })!) as { schemaVersion: number }).schemaVersion, 0);
    assert.equal((JSON.parse(resources.text({ ...root, path: "Dossiers/types/types.json" })!) as { schemaVersion: number }).schemaVersion, 0);
  });

  it("rejects missing confirmation and a changed inventory before journal publication", async () => {
    const resources = new MemoryResources();
    seedLegacy(resources);
    const migration = application(resources);
    const plan = await migration.plan();
    const before = resources.mutations.length;
    await assert.rejects(migration.execute(plan.previewId, "wrong"), (error: unknown) => error instanceof MigrationError && error.code === "confirmation_required");
    assert.equal(resources.mutations.length, before);
    resources.seedFile({ ...root, path: `Dossiers/dossiers/${dossierId}/documents/general/制度.txt` }, "changed-after-plan");
    await assert.rejects(migration.execute(plan.previewId, plan.confirmationToken), (error: unknown) => error instanceof MigrationError && error.code === "integrity_failed");
    assert.equal(resources.text({ ...root, path: "Dossiers/.system/migrations/active.json" }), null);
  });

  it("stops an oversized preflight before creating migration state", async () => {
    const resources = new MemoryResources();
    seedLegacy(resources);
    const migration = new MigrationApplication({ resources: resources as never, workspaceRoot: root, maxBytes: 1 });
    const before = resources.mutations.length;
    await assert.rejects(migration.plan(), (error: unknown) => error instanceof MigrationError && error.code === "resource_operation_failed");
    assert.equal(resources.mutations.length, before);
    assert.equal(resources.text({ ...root, path: "Dossiers/.system/migrations/active.json" }), null);
  });

  it("recovers after an interruption at every durable journal publication point", async () => {
    for (let journalWrite = 1; journalWrite <= 22; journalWrite += 1) {
      const resources = new FaultResources();
      seedLegacy(resources);
      const migration = application(resources);
      const plan = await migration.plan();
      resources.failJournalWriteAt = journalWrite;
      await assert.rejects(migration.execute(plan.previewId, plan.confirmationToken));
      assert.equal((await application(resources).detect()).state, "recoverable", `journal write ${journalWrite}`);
      assert.equal((await application(resources).recover("continue")).state, "ready", `journal write ${journalWrite}`);
      assert.equal((await application(resources).detect()).writeAllowed, true, `journal write ${journalWrite}`);
    }
  });

  it("rejects a tampered backup and an unsafe journal without further authority writes", async () => {
    const resources = new FaultResources();
    seedLegacy(resources);
    const plan = await application(resources).plan();
    resources.failAuthorityWriteAt = 2;
    await assert.rejects(application(resources).execute(plan.previewId, plan.confirmationToken));
    const backupPath = "Dossiers/.system/migrations/mig_01hzmigrationrun/backup/manifest.json";
    resources.seedFile({ ...root, path: backupPath }, "tampered");
    await assert.rejects(application(resources).recover("continue"), (error: unknown) => error instanceof MigrationError && error.code === "integrity_failed");

    const journalPath = "Dossiers/.system/migrations/active.json";
    const journal = JSON.parse(resources.text({ ...root, path: journalPath })!) as { inventory: Array<{ path: string }> };
    journal.inventory[0]!.path = journalPath;
    resources.seedFile({ ...root, path: journalPath }, JSON.stringify(journal));
    const before = resources.mutations.length;
    await assert.rejects(application(resources).recover("continue"), (error: unknown) => error instanceof MigrationError && error.code === "integrity_failed");
    assert.equal(resources.mutations.length, before);
  });

  it("does not trust a recovery journal inside an incompatible Dossiers root", async () => {
    const resources = new FaultResources();
    seedLegacy(resources);
    const plan = await application(resources).plan();
    resources.failAuthorityWriteAt = 2;
    await assert.rejects(application(resources).execute(plan.previewId, plan.confirmationToken));
    resources.seedFile({ ...root, path: "Dossiers/manifest.json" }, JSON.stringify({ kind: "ordinary.folder", schemaVersion: 0 }));
    const before = resources.mutations.length;
    const report = await application(resources).detect();
    assert.equal(report.state, "blocked");
    assert.equal(report.reason, "invalid-manifest");
    await assert.rejects(application(resources).recover("continue"), (error: unknown) => error instanceof MigrationError && error.code === "incompatible_library");
    assert.equal(resources.mutations.length, before);
  });
});
