import { lifecycleApplication, lifecycleInvocation, type LifecyclePluginContextLike } from "./context.ts";
import { asyncRoute, readJson, revision, type HonoAppLike } from "./http.ts";

export function registerLifecycleRoutes(app: HonoAppLike, ctx: LifecyclePluginContextLike): void {
  app.get("/lifecycle/trash", asyncRoute(async (c) => c.json(await lifecycleApplication(ctx, c.req.query("workspaceMountId")).listTrash({
    includeResolved: c.req.query("includeResolved") === "true",
    ...(c.req.query("limit") ? { limit: revision(c.req.query("limit"), "limit") } : {}),
  }))));

  app.post("/lifecycle/dossiers/:dossierId/trash", asyncRoute(async (c) => {
    const input = await readJson(c); const application = lifecycleApplication(ctx, input.workspaceMountId);
    return c.json(await application.trashDossier(c.req.param("dossierId"), revision(input.expectedRevision, "expectedRevision"), lifecycleInvocation(ctx, "user-action"), input.reason as string | undefined));
  }));

  app.post("/lifecycle/dossiers/:dossierId/documents/:documentId/trash", asyncRoute(async (c) => {
    const input = await readJson(c); const application = lifecycleApplication(ctx, input.workspaceMountId);
    return c.json(await application.trashDocument(c.req.param("dossierId"), c.req.param("documentId"), revision(input.expectedDossierRevision, "expectedDossierRevision"), lifecycleInvocation(ctx, "user-action"), input.reason as string | undefined));
  }));

  app.post("/lifecycle/trash/:recordId/restore", asyncRoute(async (c) => {
    const input = await readJson(c); const application = lifecycleApplication(ctx, input.workspaceMountId);
    return c.json(await application.restore(c.req.param("recordId"), revision(input.expectedRecordRevision, "expectedRecordRevision"), lifecycleInvocation(ctx, "user-action"), input.expectedDossierRevision === undefined ? undefined : revision(input.expectedDossierRevision, "expectedDossierRevision")));
  }));

  app.post("/lifecycle/trash/:recordId/purge/prepare", asyncRoute(async (c) => {
    const input = await readJson(c); const application = lifecycleApplication(ctx, input.workspaceMountId);
    return c.json(await application.preparePurge(c.req.param("recordId"), revision(input.expectedRecordRevision, "expectedRecordRevision"), lifecycleInvocation(ctx, "user-action")));
  }));

  app.post("/lifecycle/trash/:recordId/purge/confirm", asyncRoute(async (c) => {
    const input = await readJson(c); const application = lifecycleApplication(ctx, input.workspaceMountId);
    return c.json(await application.confirmPurge(c.req.param("recordId"), String(input.confirmationToken ?? ""), lifecycleInvocation(ctx, "user-action")));
  }));

  app.get("/lifecycle/audit", asyncRoute(async (c) => c.json(await lifecycleApplication(ctx, c.req.query("workspaceMountId")).queryAudit({
    ...(c.req.query("retention") ? { retention: c.req.query("retention") as "ordinary" | "permanent" } : {}),
    ...(c.req.query("limit") ? { limit: revision(c.req.query("limit"), "limit") } : {}),
  }))));

  app.post("/lifecycle/audit/cleanup", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await lifecycleApplication(ctx, input.workspaceMountId).cleanupAudit(lifecycleInvocation(ctx, "user-action")));
  }));
}

export default registerLifecycleRoutes;
