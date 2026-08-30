import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";

import registerDocumentRoutes from "../../routes/documents.ts";
import { CatalogApplication } from "../../src/application/catalog/catalog-application.ts";
import { DossiersRuntime } from "../../src/runtime.ts";
import * as commitTool from "../../tools/documents-commit.ts";
import * as previewTool from "../../tools/documents-preview.ts";
import * as queryTool from "../../tools/documents-query.ts";
import { MemoryResources } from "../foundation/memory-resources.ts";

type ResourceRef = { kind: "mount"; mountId: string; path: string } | { kind: "local-file"; path: string };

class InterfaceResources extends MemoryResources {
  async copy(from: ResourceRef, to: ResourceRef) {
    return this.write(to, (await this.read(from)).content);
  }

  async move(from: ResourceRef, to: ResourceRef) {
    await this.copy(from, to);
    await this.delete(from);
    return { oldResourceKey: from.path, newResourceKey: to.path, oldResource: from, newResource: to };
  }
}

test("document HTTP preview/commit and query tool expose only managed relative metadata", async () => {
  const resources = new InterfaceResources();
  const scope = { resources: resources as never, workspaceRoot: { kind: "mount" as const, mountId: "workspace", path: "" } };
  const catalog = new CatalogApplication({ runtime: new DossiersRuntime(), scope });
  await catalog.initialize();
  const type = (await catalog.listTypes()).items.find((item) => item.key === "project")!;
  const dossier = await catalog.createDossier({ name: "接口项目", typeId: type.id, fields: {} });
  resources.seedFile({ kind: "local-file", path: "C:/private/brief.txt" }, "brief");
  const app = new Hono();
  registerDocumentRoutes(app, { resources } as never);
  const post = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const previewResponse = await app.request(`/documents/${dossier.id}/previews`, post({
    workspaceMountId: "workspace", expectedRevision: dossier.revision, categoryId: "general",
    sources: [{ ref: { kind: "local-file", path: "C:/private/brief.txt" } }],
  }));
  assert.equal(previewResponse.status, 201);
  const preview = await previewResponse.json() as { previewId: string };
  const commitResponse = await app.request(`/documents/previews/${preview.previewId}/commit`, post({ workspaceMountId: "workspace", expectedRevision: dossier.revision }));
  assert.equal(commitResponse.status, 200);

  const queried = await queryTool.execute({ workspaceMountId: "workspace", dossierId: dossier.id }, { resources } as never);
  assert.equal(queried.isError, undefined);
  const serialized = JSON.stringify(queried.details);
  assert.match(serialized, /documents\/general\/brief\.txt/);
  assert.doesNotMatch(serialized, /C:\/private|file:\/\//);
});

test("document routes and tools fail closed without a safe workspace mount", async () => {
  const resources = new MemoryResources();
  const app = new Hono();
  registerDocumentRoutes(app, { resources } as never);
  assert.equal((await app.request("/documents/dos_01hzvaliddossier/items")).status, 400);

  const tool = await previewTool.execute({
    workspaceMountId: "C:/secret",
    dossierId: "dos_01hzvaliddossier",
    expectedRevision: 1,
    categoryId: "general",
    sources: [],
  }, { resources } as never);
  assert.equal(tool.isError, true);
  assert.equal(previewTool.sessionPermission.readOnly, true);
  assert.equal(commitTool.sessionPermission.kind, "workspace_write");
  assert.equal(commitTool.sessionPermission.describeSideEffect?.({ workspaceMountId: "C:/secret" }), null);
  assert.doesNotMatch(JSON.stringify(tool.details), /C:\/|secret/);
  assert.equal(resources.mutations.length, 0);
});
