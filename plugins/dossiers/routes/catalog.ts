import { catalogApplication, type CatalogPluginContextLike } from "../src/interfaces/catalog/context.ts";
import {
  asyncRoute,
  inputWithoutWorkspace,
  positiveNumber,
  readJson,
  type HonoAppLike,
} from "../src/interfaces/catalog/http.ts";
import { lifecycleApplication, lifecycleInvocation, type LifecyclePluginContextLike } from "../src/interfaces/routes/lifecycle/context.ts";
import { asyncRoute as lifecycleAsyncRoute, readJson as readLifecycleJson, revision as lifecycleRevision } from "../src/interfaces/routes/lifecycle/http.ts";

function queryWorkspace(context: { req: { query(name: string): string | undefined } }): string | undefined {
  return context.req.query("workspaceMountId");
}

export default function register(app: HonoAppLike, ctx: CatalogPluginContextLike & LifecyclePluginContextLike): void {
  app.post("/catalog/open", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await catalogApplication(ctx, input.workspaceMountId).initialize());
  }));

  app.get("/catalog/types", asyncRoute(async (c) => c.json(await catalogApplication(ctx, queryWorkspace(c)).listTypes())));
  app.post("/catalog/types", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json({ value: await catalogApplication(ctx, input.workspaceMountId).createType(inputWithoutWorkspace(input) as never) }, 201);
  }));
  app.post("/catalog/types/:id/preview", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await catalogApplication(ctx, input.workspaceMountId).previewTypeUpdate(c.req.param("id"), inputWithoutWorkspace(input) as never));
  }));
  app.patch("/catalog/types/:id", asyncRoute(async (c) => {
    const input = await readJson(c);
    const { expectedRevision, ...patch } = inputWithoutWorkspace(input);
    return c.json({ value: await catalogApplication(ctx, input.workspaceMountId).updateType(c.req.param("id"), positiveNumber(expectedRevision), patch as never) });
  }));
  app.delete("/catalog/types/:id", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await catalogApplication(ctx, input.workspaceMountId).deleteType(c.req.param("id"), positiveNumber(input.expectedRevision)));
  }));

  app.get("/catalog/dossiers", asyncRoute(async (c) => c.json(await catalogApplication(ctx, queryWorkspace(c)).listDossiers({
    limit: positiveNumber(c.req.query("limit"), 50),
    cursor: c.req.query("cursor"),
    typeId: c.req.query("typeId"),
    query: c.req.query("query"),
    tags: c.req.query("tags")?.split(",").map((tag) => tag.trim()).filter(Boolean),
  }))));
  app.post("/catalog/dossiers", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json({ value: await catalogApplication(ctx, input.workspaceMountId).createDossier(inputWithoutWorkspace(input) as never) }, 201);
  }));
  app.get("/catalog/dossiers/:id", asyncRoute(async (c) => c.json({ value: await catalogApplication(ctx, queryWorkspace(c)).getDossier(c.req.param("id")) })));
  app.patch("/catalog/dossiers/:id", asyncRoute(async (c) => {
    const input = await readJson(c);
    const { expectedRevision, ...patch } = inputWithoutWorkspace(input);
    return c.json({ value: await catalogApplication(ctx, input.workspaceMountId).updateDossier(c.req.param("id"), positiveNumber(expectedRevision), patch as never) });
  }));
  app.post("/catalog/dossiers/:id/contacts", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json({ value: await catalogApplication(ctx, input.workspaceMountId).linkContact(
      c.req.param("id"),
      positiveNumber(input.expectedRevision),
      { contactId: String(input.contactId ?? ""), role: String(input.role ?? ""), extensions: input.extensions as never },
    ) });
  }));
  app.delete("/catalog/dossiers/:id/contacts/:contactId", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json({ value: await catalogApplication(ctx, input.workspaceMountId).unlinkContact(
      c.req.param("id"),
      positiveNumber(input.expectedRevision),
      c.req.param("contactId"),
    ) });
  }));
  app.patch("/catalog/dossiers/:id/contacts/:contactId", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json({ value: await catalogApplication(ctx, input.workspaceMountId).updateContactRole(
      c.req.param("id"),
      positiveNumber(input.expectedRevision),
      c.req.param("contactId"),
      String(input.role ?? ""),
    ) });
  }));

  app.get("/catalog/contacts", asyncRoute(async (c) => c.json(await catalogApplication(ctx, queryWorkspace(c)).listContacts({
    limit: positiveNumber(c.req.query("limit"), 50),
    cursor: c.req.query("cursor"),
    query: c.req.query("query"),
  }))));
  app.post("/catalog/contacts", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json({ value: await catalogApplication(ctx, input.workspaceMountId).createContact(inputWithoutWorkspace(input) as never) }, 201);
  }));
  app.get("/catalog/contacts/:id", asyncRoute(async (c) => c.json({ value: await catalogApplication(ctx, queryWorkspace(c)).getContact(c.req.param("id")) })));
  app.patch("/catalog/contacts/:id", asyncRoute(async (c) => {
    const input = await readJson(c);
    const { expectedRevision, ...patch } = inputWithoutWorkspace(input);
    return c.json({ value: await catalogApplication(ctx, input.workspaceMountId).updateContact(c.req.param("id"), positiveNumber(expectedRevision), patch as never) });
  }));
  app.delete("/catalog/contacts/:id", lifecycleAsyncRoute(async (c) => {
    const input = await readLifecycleJson(c);
    return c.json(await lifecycleApplication(ctx, input.workspaceMountId).deleteContact(c.req.param("id"), lifecycleRevision(input.expectedRevision, "expectedRevision"), lifecycleInvocation(ctx, "user-action")));
  }));
}
