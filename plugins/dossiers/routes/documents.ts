import { documentApplication, type DocumentPluginContextLike } from "../src/interfaces/documents/context.ts";
import { asyncRoute, readJson, requiredRevision, type HonoAppLike } from "../src/interfaces/documents/http.ts";

export default function register(app: HonoAppLike, ctx: DocumentPluginContextLike): void {
  app.get("/documents/:dossierId/items", asyncRoute(async (c) => c.json(await documentApplication(ctx, c.req.query("workspaceMountId")).getDocuments(c.req.param("dossierId")))));

  app.post("/documents/:dossierId/previews", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await documentApplication(ctx, input.workspaceMountId).previewImport({
      dossierId: c.req.param("dossierId"),
      expectedRevision: requiredRevision(input.expectedRevision),
      categoryId: String(input.categoryId ?? ""),
      sources: input.sources as never,
      maxBytes: input.maxBytes as number | undefined,
      maxFiles: input.maxFiles as number | undefined,
    }), 201);
  }));

  app.post("/documents/previews/:previewId/commit", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await documentApplication(ctx, input.workspaceMountId).commitPreview(c.req.param("previewId"), requiredRevision(input.expectedRevision)));
  }));

  app.delete("/documents/previews/:previewId", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(documentApplication(ctx, input.workspaceMountId).cancelPreview(c.req.param("previewId")));
  }));

  app.patch("/documents/:dossierId/items/:documentId", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await documentApplication(ctx, input.workspaceMountId).updateDocument(
      c.req.param("dossierId"),
      c.req.param("documentId"),
      requiredRevision(input.expectedRevision),
      { ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId as string }), ...(input.tags === undefined ? {} : { tags: input.tags as string[] }) },
    ));
  }));

  app.post("/documents/:dossierId/categories", asyncRoute(async (c) => {
    const input = await readJson(c);
    return c.json(await documentApplication(ctx, input.workspaceMountId).createCategory(
      c.req.param("dossierId"),
      requiredRevision(input.expectedRevision),
      { id: String(input.id ?? ""), name: String(input.name ?? "") },
    ), 201);
  }));
}
