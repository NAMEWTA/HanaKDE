import { migrationApplication, type MigrationPluginContextLike } from "./context.ts";
import { asyncRoute, readJson, type HonoAppLike } from "./http.ts";

export function registerMigrationRoutes(app: HonoAppLike, ctx: MigrationPluginContextLike): void {
  app.get("/migration/status", asyncRoute(async (c) => c.json(await migrationApplication(ctx, c.req.query("workspaceMountId")).detect())));
  app.post("/migration/plan", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await migrationApplication(ctx, input.workspaceMountId).plan());
  }));
  app.post("/migration/execute", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await migrationApplication(ctx, input.workspaceMountId).execute(String(input.previewId ?? ""), String(input.confirmationToken ?? "")));
  }));
  app.post("/migration/recover", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await migrationApplication(ctx, input.workspaceMountId).recover(input.action));
  }));
}

export default registerMigrationRoutes;
