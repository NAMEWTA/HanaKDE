import { readOnlyPermission, requiredRevision, toolExecute, type ToolContextLike, type ToolInput } from "../src/interfaces/documents/tool.ts";

export const name = "documents_preview";
export const description = "Preview managed document copies, same-dossier references, duplicates, names, and bytes without changing authority.";
export const sessionPermission = readOnlyPermission;
export const parameters = {
  type: "object",
  properties: {
    workspaceMountId: { type: "string" }, dossierId: { type: "string" }, expectedRevision: { type: "number" }, categoryId: { type: "string" },
    sources: { type: "array", items: { type: "object" } }, maxBytes: { type: "number" }, maxFiles: { type: "number" },
  },
  required: ["workspaceMountId", "dossierId", "expectedRevision", "categoryId", "sources"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(input, ctx, (application) => application.previewImport({
    dossierId: String(input.dossierId),
    expectedRevision: requiredRevision(input.expectedRevision),
    categoryId: String(input.categoryId),
    sources: input.sources as never,
    maxBytes: input.maxBytes as number | undefined,
    maxFiles: input.maxFiles as number | undefined,
  }));
}
