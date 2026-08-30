import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";

import registerCatalogRoutes from "../../routes/catalog.ts";
import * as createTool from "../../tools/catalog-create.ts";
import * as queryTool from "../../tools/catalog-query.ts";
import { MemoryResources } from "../foundation/memory-resources.ts";

async function json(response: Response): Promise<Record<string, unknown>> {
  const value = await response.json() as Record<string, unknown>;
  assert.equal(response.ok, true, JSON.stringify(value));
  return value;
}

test("catalog HTTP routes operate on the explicitly selected workspace mount", async () => {
  const resources = new MemoryResources();
  const app = new Hono();
  registerCatalogRoutes(app, { resources } as never);
  const body = (value: unknown) => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceMountId: "workspace", ...value as object }),
  });

  const opened = await json(await app.request("/catalog/open", body({})));
  assert.equal(opened.state, "ready");
  const types = await json(await app.request("/catalog/types?workspaceMountId=workspace"));
  const organization = (types.items as Array<Record<string, unknown>>).find((item) => item.key === "organization")!;
  const created = await json(await app.request("/catalog/dossiers", body({
    name: "广州数据交易所",
    typeId: organization.id,
    fields: {},
  })));
  const dossier = created.value as Record<string, unknown>;
  const fetched = await json(await app.request(`/catalog/dossiers/${dossier.id as string}?workspaceMountId=workspace`));
  assert.equal((fetched.value as Record<string, unknown>).name, "广州数据交易所");
  assert.equal(resources.text({ kind: "mount", mountId: "another-workspace", path: "Dossiers/manifest.json" }), null);
});

test("static catalog tools publish workspace permissions and return bounded JSON details", async () => {
  const resources = new MemoryResources();
  const ctx = { resources } as never;
  assert.equal(createTool.name, "catalog_create");
  assert.equal(createTool.sessionPermission.kind, "workspace_write");
  assert.equal(queryTool.sessionPermission.readOnly, true);

  const created = await createTool.execute({
    workspaceMountId: "workspace",
    entity: "dossier",
    name: "项目档案",
    typeKey: "project",
    fields: {},
  }, ctx);
  assert.equal(created.isError, undefined);
  const details = created.details as Record<string, unknown>;
  assert.equal((details.value as Record<string, unknown>).name, "项目档案");

  const queried = await queryTool.execute({
    workspaceMountId: "workspace",
    entity: "dossier",
    limit: 20,
  }, ctx);
  assert.equal(queried.isError, undefined);
  assert.equal((queried.details as { items: unknown[] }).items.length, 1);
  assert.doesNotMatch(JSON.stringify(queried.details), /[A-Za-z]:[\\/]|file:\/\//);

  const contact = await createTool.execute({
    workspaceMountId: "workspace",
    entity: "contact",
    name: "工具联系人",
    emails: ["tool@example.com"],
    phones: [],
  }, ctx);
  assert.equal(contact.isError, undefined);
  assert.equal(((contact.details as Record<string, unknown>).value as Record<string, unknown>).name, "工具联系人");
});

test("route and tool workspace selection fail closed on raw or missing paths", async () => {
  const resources = new MemoryResources();
  const app = new Hono();
  registerCatalogRoutes(app, { resources } as never);
  const missing = await app.request("/catalog/types");
  assert.equal(missing.status, 400);
  const raw = await createTool.execute({
    workspaceMountId: "C:/secret/workspace",
    entity: "contact",
    name: "不应创建",
  }, { resources } as never);
  assert.equal(raw.isError, true);
  assert.equal(createTool.sessionPermission.describeSideEffect?.({ workspaceMountId: "C:/secret/workspace" }), null);
  assert.equal(resources.mutations.length, 0);
  assert.doesNotMatch(JSON.stringify(raw.details), /C:\/|secret/);
});

test("HTTP mutations require an explicit positive expected revision", async () => {
  const resources = new MemoryResources();
  const app = new Hono();
  registerCatalogRoutes(app, { resources } as never);
  await app.request("/catalog/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceMountId: "workspace" }),
  });
  const response = await app.request("/catalog/types/typ_builtin_person", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceMountId: "workspace", name: "个人档案" }),
  });
  assert.equal(response.status, 400);
  const value = await response.json() as { error: { code: string } };
  assert.equal(value.error.code, "validation");

  const toolResponse = await createTool.execute({
    workspaceMountId: "workspace",
    entity: "dossier",
    name: "仍可创建",
    typeKey: "person",
    fields: {},
  }, { resources } as never);
  const dossier = (toolResponse.details as { value: { id: string } }).value;
  const updateTool = await import("../../tools/catalog-update.ts");
  const missingRevision = await updateTool.execute({
    workspaceMountId: "workspace",
    entity: "dossier",
    id: dossier.id,
    patch: { name: "不应更新" },
  }, { resources } as never);
  assert.equal(missingRevision.isError, true);
  assert.equal(((missingRevision.details as { error: { code: string } }).error).code, "validation");
});
