import assert from "node:assert/strict";
import test from "node:test";

import { CatalogApplication, type CatalogIdKind, type DossierInput } from "../../src/application/catalog/catalog-application.ts";
import { CatalogError } from "../../src/application/catalog/errors.ts";
import { DossiersRuntime } from "../../src/runtime.ts";
import { MemoryResources } from "../foundation/memory-resources.ts";

function fixture() {
  const resources = new MemoryResources();
  const scope = {
    resources,
    workspaceRoot: { kind: "mount" as const, mountId: "workspace", path: "" },
  };
  const sequences: Record<CatalogIdKind, number> = {
    dossier: 0,
    type: 0,
    contact: 0,
    operation: 0,
    field: 0,
  };
  const prefixes: Record<CatalogIdKind, string> = {
    dossier: "dos",
    type: "typ",
    contact: "con",
    operation: "op",
    field: "fld",
  };
  const application = new CatalogApplication({
    runtime: new DossiersRuntime({
      now: () => "2026-08-30T00:00:00.000Z",
      createId: () => "lib_01hzcatalogfixture",
    }),
    scope,
    now: () => "2026-08-30T01:00:00.000Z",
    createId(kind) {
      sequences[kind] += 1;
      return `${prefixes[kind]}_01hzcatalog${kind}${String(sequences[kind]).padStart(4, "0")}`;
    },
  });
  return { application, resources, scope };
}

test("creates personal, organization, project, and custom dossiers through one contract", async () => {
  const { application, resources, scope } = fixture();
  const initialized = await application.initialize();
  assert.equal(initialized.state, "ready");
  const builtins = await application.listTypes();
  assert.deepEqual(builtins.items.map((item) => item.key), ["person", "organization", "project"]);
  assert.equal(builtins.items.every((item) => item.builtin), true);

  const custom = await application.createType({
    key: "exchange",
    name: "数据交易所",
    fields: [{ id: "fld_exchange_code", key: "code", label: "机构代码", type: "text", order: 0, required: true }],
  });
  const inputs: DossierInput[] = [
    { name: "张三", typeId: builtins.items[0]!.id, fields: {} },
    { name: "广州数据交易所", typeId: builtins.items[1]!.id, fields: {} },
    { name: "数据空间项目", typeId: builtins.items[2]!.id, fields: {} },
    { name: "广州数据交易所档案", typeId: custom.id, fields: { fld_exchange_code: "GZDE" } },
  ];
  for (const input of inputs) await application.createDossier(input);

  const listed = await application.listDossiers({ limit: 10 });
  assert.equal(listed.items.length, 4);
  assert.equal(new Set(listed.items.map((item) => item.kind)).size, 1);
  assert.equal(listed.items.every((item) => item.kind === "hana.dossiers.dossier"), true);
  for (const dossier of listed.items) {
    assert.equal(resources.text({ ...scope.workspaceRoot, path: `Dossiers/dossiers/${dossier.id}/dossier.json` }) !== null, true);
  }
  const firstPage = await application.listDossiers({ limit: 2 });
  const secondPage = await application.listDossiers({ limit: 2, cursor: firstPage.nextCursor ?? undefined });
  assert.equal(firstPage.nextCursor !== null, true);
  assert.equal(new Set([...firstPage.items, ...secondPage.items].map((item) => item.id)).size, 4);
  assert.deepEqual((await application.listDossiers({ query: "GZDE" })).items.map((item) => item.name), ["广州数据交易所档案"]);
  assert.deepEqual((await application.listDossiers({ query: "organization" })).items.map((item) => item.name), ["广州数据交易所"]);
});

test("validates every supported typed field and rejects hidden dossier relationships", async () => {
  const { application } = fixture();
  await application.initialize();
  const type = await application.createType({
    key: "typed",
    name: "完整字段",
    fields: [
      { id: "fld_typed_text", key: "text", label: "文本", type: "text", order: 0, required: true },
      { id: "fld_typed_long", key: "long", label: "长文本", type: "long_text", order: 1, required: false },
      { id: "fld_typed_number", key: "number", label: "数字", type: "number", order: 2, required: false },
      { id: "fld_typed_date", key: "date", label: "日期", type: "date", order: 3, required: false },
      { id: "fld_typed_boolean", key: "boolean", label: "布尔", type: "boolean", order: 4, required: false },
      { id: "fld_typed_enum", key: "enum", label: "枚举", type: "enum", order: 5, required: false, options: ["A", "B"] },
      { id: "fld_typed_url", key: "url", label: "URL", type: "url", order: 6, required: false },
      { id: "fld_typed_email", key: "email", label: "邮箱", type: "email", order: 7, required: false },
      { id: "fld_typed_phone", key: "phone", label: "电话", type: "phone", order: 8, required: false },
    ],
  });
  const created = await application.createDossier({
    name: "字段样例",
    typeId: type.id,
    fields: {
      fld_typed_text: "short",
      fld_typed_long: "long\ntext",
      fld_typed_number: 42,
      fld_typed_date: "2026-08-30",
      fld_typed_boolean: true,
      fld_typed_enum: "A",
      fld_typed_url: "https://example.com/archive",
      fld_typed_email: "owner@example.com",
      fld_typed_phone: "+86 20 1234 5678",
    },
  });
  assert.equal(created.revision, 1);
  await assert.rejects(
    application.createDossier({ name: "错误枚举", typeId: type.id, fields: { fld_typed_text: "x", fld_typed_enum: "C" } }),
    (error: unknown) => error instanceof CatalogError && error.code === "validation",
  );
  await assert.rejects(
    application.createDossier({ name: "隐藏关系", typeId: type.id, fields: { fld_typed_text: "x" }, relationships: [] } as never),
    (error: unknown) => error instanceof CatalogError && error.code === "validation",
  );
  const patched = await application.updateDossier(created.id, created.revision, { fields: { fld_typed_text: "changed" } });
  assert.equal(patched.fields.fld_typed_text, "changed");
  assert.equal(patched.fields.fld_typed_number, 42);
  assert.equal(patched.fields.fld_typed_email, "owner@example.com");
});

test("allocates a stable field id when creating a custom type", async () => {
  const { application } = fixture();
  await application.initialize();
  const created = await application.createType({
    key: "generated_fields",
    name: "自动字段身份",
    fields: [{ key: "code", label: "代码", type: "text", order: 0, required: false }],
  });
  assert.match(created.fields[0]!.id, /^fld_/);
  const updated = await application.updateType(created.id, created.revision, { name: "自动字段身份 2" });
  assert.equal(updated.fields[0]!.id, created.fields[0]!.id);
});

test("previews incompatible template changes without deleting existing values", async () => {
  const { application, resources, scope } = fixture();
  await application.initialize();
  const type = await application.createType({
    key: "licensed",
    name: "许可实体",
    fields: [{ id: "fld_license_code", key: "license", label: "许可证", type: "text", order: 0, required: false }],
  });
  const dossier = await application.createDossier({ name: "实体", typeId: type.id, fields: { fld_license_code: "ABC-001" } });
  const before = resources.text({ ...scope.workspaceRoot, path: `Dossiers/dossiers/${dossier.id}/dossier.json` });

  const preview = await application.previewTypeUpdate(type.id, { fields: [] });
  assert.equal(preview.requiresMigration, true);
  assert.deepEqual(preview.impactedDossierIds, [dossier.id]);
  assert.deepEqual(preview.impactedFieldIds, ["fld_license_code"]);
  await assert.rejects(
    application.updateType(type.id, type.revision, { fields: [] }),
    (error: unknown) => error instanceof CatalogError && error.code === "migration_required",
  );
  assert.equal(resources.text({ ...scope.workspaceRoot, path: `Dossiers/dossiers/${dossier.id}/dossier.json` }), before);
  assert.equal((await application.getDossier(dossier.id)).fields.fld_license_code, "ABC-001");
});

test("treats newly required fields as migration work for existing dossiers", async () => {
  const { application } = fixture();
  await application.initialize();
  const type = await application.createType({ key: "evolving", name: "演进模板", fields: [] });
  const dossier = await application.createDossier({ name: "既有档案", typeId: type.id, fields: {} });
  const fields = [{
    id: "fld_required_later",
    key: "required_later",
    label: "后加必填项",
    type: "text" as const,
    order: 0,
    required: true,
  }];

  const preview = await application.previewTypeUpdate(type.id, { fields });
  assert.equal(preview.requiresMigration, true);
  assert.deepEqual(preview.impactedDossierIds, [dossier.id]);
  assert.deepEqual(preview.impactedFieldIds, ["fld_required_later"]);
  await assert.rejects(
    application.updateType(type.id, type.revision, { fields }),
    (error: unknown) => error instanceof CatalogError && error.code === "migration_required",
  );
});

test("protects built-in and referenced types while deleting an unused custom type", async () => {
  const { application } = fixture();
  await application.initialize();
  const builtIn = (await application.listTypes()).items[0]!;
  await assert.rejects(
    application.deleteType(builtIn.id, builtIn.revision),
    (error: unknown) => error instanceof CatalogError && error.code === "validation",
  );

  const referenced = await application.createType({ key: "referenced", name: "被引用类型", fields: [] });
  const dossier = await application.createDossier({ name: "引用者", typeId: referenced.id, fields: {} });
  await assert.rejects(
    application.deleteType(referenced.id, referenced.revision),
    (error: unknown) => error instanceof CatalogError
      && error.code === "reference_conflict"
      && (error.details.references as string[])[0] === dossier.id,
  );

  const unused = await application.createType({ key: "unused", name: "未引用类型", fields: [] });
  await application.deleteType(unused.id, unused.revision);
  assert.equal((await application.listTypes()).items.some((item) => item.id === unused.id), false);
});

test("retains allowed extension fields across catalog and dossier updates", async () => {
  const { application } = fixture();
  await application.initialize();
  const type = await application.createType({
    key: "extended",
    name: "扩展类型",
    fields: [],
    extensions: { source: "fixture", nested: { retained: true } },
  });
  const dossier = await application.createDossier({
    name: "扩展档案",
    typeId: type.id,
    fields: {},
    extensions: { importedBy: "fixture", future: 7 },
  });
  const updatedType = await application.updateType(type.id, type.revision, { name: "扩展类型 2" });
  const updatedDossier = await application.updateDossier(dossier.id, dossier.revision, { name: "扩展档案 2" });
  assert.deepEqual(updatedType.extensions, { source: "fixture", nested: { retained: true } });
  assert.deepEqual(updatedDossier.extensions, { importedBy: "fixture", future: 7 });
});

test("shares one contact across dossiers while keeping relationship roles independent", async () => {
  const { application } = fixture();
  await application.initialize();
  const organization = (await application.listTypes()).items.find((item) => item.key === "organization")!;
  const first = await application.createDossier({ name: "公司 A", typeId: organization.id, fields: {} });
  const second = await application.createDossier({ name: "项目 B", typeId: organization.id, fields: {} });
  const contact = await application.createContact({ name: "李四", emails: ["old@example.com"], phones: [] });

  const firstLinked = await application.linkContact(first.id, first.revision, { contactId: contact.id, role: "法定代表人" });
  await application.linkContact(second.id, second.revision, { contactId: contact.id, role: "项目经理" });
  await application.updateContactRole(first.id, firstLinked.revision, contact.id, "董事长");
  const updated = await application.updateContact(contact.id, contact.revision, { emails: ["new@example.com"] });
  const firstProjection = await application.getDossier(first.id);
  const secondProjection = await application.getDossier(second.id);
  assert.equal(firstProjection.contacts[0]?.role, "董事长");
  assert.equal(secondProjection.contacts[0]?.role, "项目经理");
  assert.equal(firstProjection.contacts[0]?.contact.revision, updated.revision);
  assert.deepEqual(firstProjection.contacts[0]?.contact.emails, ["new@example.com"]);
  assert.deepEqual(secondProjection.contacts[0]?.contact.emails, ["new@example.com"]);
});

test("unlinking preserves contacts and referenced deletion fails without partial writes", async () => {
  const { application, resources, scope } = fixture();
  await application.initialize();
  const person = (await application.listTypes()).items.find((item) => item.key === "person")!;
  const first = await application.createDossier({ name: "A", typeId: person.id, fields: {} });
  const second = await application.createDossier({ name: "B", typeId: person.id, fields: {} });
  const contact = await application.createContact({ name: "共享联系人", emails: [], phones: ["10086"] });
  const linkedFirst = await application.linkContact(first.id, first.revision, { contactId: contact.id, role: "本人" });
  const linkedSecond = await application.linkContact(second.id, second.revision, { contactId: contact.id, role: "顾问" });

  await application.unlinkContact(first.id, linkedFirst.revision, contact.id);
  assert.equal((await application.getContact(contact.id)).name, "共享联系人");
  const beforeCatalog = resources.text({ ...scope.workspaceRoot, path: "Dossiers/contacts/contacts.json" });
  await assert.rejects(
    application.deleteContact(contact.id, contact.revision),
    (error: unknown) => error instanceof CatalogError
      && error.code === "reference_conflict"
      && Array.isArray(error.details.references)
      && error.details.references.length === 1,
  );
  assert.equal(resources.text({ ...scope.workspaceRoot, path: "Dossiers/contacts/contacts.json" }), beforeCatalog);
  const unlinkedSecond = await application.unlinkContact(second.id, linkedSecond.revision, contact.id);
  assert.equal(unlinkedSecond.contacts.length, 0);
  await application.deleteContact(contact.id, contact.revision);
  await assert.rejects(application.getContact(contact.id), (error: unknown) => error instanceof CatalogError && error.code === "not_found");
});

test("serializes contact deletion against relation creation without leaving a dangling reference", async () => {
  const { application } = fixture();
  await application.initialize();
  const person = (await application.listTypes()).items.find((item) => item.key === "person")!;
  const dossier = await application.createDossier({ name: "并发档案", typeId: person.id, fields: {} });
  const contact = await application.createContact({ name: "并发联系人", emails: [], phones: [] });

  const outcomes = await Promise.allSettled([
    application.deleteContact(contact.id, contact.revision),
    application.linkContact(dossier.id, dossier.revision, { contactId: contact.id, role: "联系人" }),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  const currentDossier = await application.getDossier(dossier.id);
  if (currentDossier.contacts.length === 1) {
    assert.equal((await application.getContact(contact.id)).id, contact.id);
  } else {
    await assert.rejects(application.getContact(contact.id), (error: unknown) => error instanceof CatalogError && error.code === "not_found");
  }
});

test("stale revisions and injected writes preserve the previous authority", async () => {
  const { application, resources, scope } = fixture();
  await application.initialize();
  const person = (await application.listTypes()).items.find((item) => item.key === "person")!;
  const dossier = await application.createDossier({ name: "原名称", typeId: person.id, fields: {} });
  const updated = await application.updateDossier(dossier.id, dossier.revision, { name: "新名称" });
  await assert.rejects(
    application.updateDossier(dossier.id, dossier.revision, { name: "陈旧覆盖" }),
    (error: unknown) => error instanceof CatalogError && error.code === "conflict" && error.details.currentRevision === updated.revision,
  );
  assert.equal((await application.getDossier(dossier.id)).name, "新名称");

  const target = { ...scope.workspaceRoot, path: `Dossiers/dossiers/${dossier.id}/dossier.json` };
  const before = resources.text(target);
  resources.failNext("writeExpectedVersion", "injected update failure");
  await assert.rejects(
    application.updateDossier(dossier.id, updated.revision, { name: "不能发布" }),
    (error: unknown) => error instanceof CatalogError && error.code === "resource_operation_failed",
  );
  assert.equal(resources.text(target), before);
});

test("recovers an authority published before its committed journal state", async () => {
  const { application, resources } = fixture();
  await application.initialize();
  const person = (await application.listTypes()).items.find((item) => item.key === "person")!;
  const dossier = await application.createDossier({ name: "恢复前", typeId: person.id, fields: {} });
  resources.failAfter("write", 3, "committed journal write interrupted");

  const recovered = await application.updateDossier(dossier.id, dossier.revision, { name: "恢复后" });

  assert.equal(recovered.name, "恢复后");
  assert.equal(recovered.revision, dossier.revision + 1);
  assert.equal((await application.getDossier(dossier.id)).name, "恢复后");
});

test("cleans a newly allocated empty dossier directory when publication fails", async () => {
  const { application, resources, scope } = fixture();
  await application.initialize();
  const person = (await application.listTypes()).items.find((item) => item.key === "person")!;
  resources.failNext("write", "injected create failure");

  await assert.rejects(
    application.createDossier({ name: "不能发布", typeId: person.id, fields: {} }),
    (error: unknown) => error instanceof CatalogError && error.code === "resource_operation_failed",
  );
  const listing = await resources.list({ ...scope.workspaceRoot, path: "Dossiers/dossiers" });
  assert.deepEqual(listing.items, []);
});

test("fails closed when a persisted dossier attempts to introduce dossier relationships", async () => {
  const { application, resources, scope } = fixture();
  await application.initialize();
  const person = (await application.listTypes()).items.find((item) => item.key === "person")!;
  const dossier = await application.createDossier({ name: "受保护档案", typeId: person.id, fields: {} });
  const target = { ...scope.workspaceRoot, path: `Dossiers/dossiers/${dossier.id}/dossier.json` };
  const stored = JSON.parse(resources.text(target) ?? "null");
  resources.seedFile(target, JSON.stringify({ ...stored, relationships: [{ dossierId: "dos_01hzforbiddenrelation" }] }));

  await assert.rejects(
    application.getDossier(dossier.id),
    (error: unknown) => error instanceof CatalogError && error.code === "resource_operation_failed",
  );
});
