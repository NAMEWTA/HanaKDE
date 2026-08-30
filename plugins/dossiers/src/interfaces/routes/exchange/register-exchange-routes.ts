import { exchangeApplication, exchangeResourceRef, type ExchangePluginContextLike } from "./context.ts";
import { asyncRoute, readJson, type HonoAppLike } from "./http.ts";

export function registerExchangeRoutes(app: HonoAppLike, ctx: ExchangePluginContextLike): void {
  app.get("/exchange/library/detect", asyncRoute(async (c) => c.json(await exchangeApplication(ctx, c.req.query("workspaceMountId")).detectLibrary())));
  app.post("/exchange/dossiers/:dossierId/export", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await exchangeApplication(ctx, input.workspaceMountId).exportDossier(c.req.param("dossierId")));
  }));
  app.post("/exchange/import/inspect", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await exchangeApplication(ctx, input.workspaceMountId).inspectImport({ archiveRef: exchangeResourceRef(input.archiveRef) }));
  }));
  app.post("/exchange/import/commit", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await exchangeApplication(ctx, input.workspaceMountId).commitImport(String(input.previewId ?? ""), String(input.confirmationToken ?? "")));
  }));
}

export default registerExchangeRoutes;
