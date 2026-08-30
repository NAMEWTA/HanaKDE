import { requiredRevision, toolExecute, workspaceWritePermission, type ToolContextLike, type ToolInput } from "../src/interfaces/documents/tool.ts";

export const name = "documents_update";
export const description = "Move one managed document primary category or update logical tags using an optimistic dossier revision.";
export const sessionPermission = workspaceWritePermission("Move one managed file category or update its tags in the selected dossier.");
export const parameters = {
  type: "object",
  properties: {
    workspaceMountId: { type: "string" }, dossierId: { type: "string" }, documentId: { type: "string" }, expectedRevision: { type: "number" },
    categoryId: { type: "string" }, tags: { type: "array", items: { type: "string" } },
  },
  required: ["workspaceMountId", "dossierId", "documentId", "expectedRevision"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(input, ctx, (application) => application.updateDocument(
    String(input.dossierId),
    String(input.documentId),
    requiredRevision(input.expectedRevision),
    { ...(input.categoryId === undefined ? {} : { categoryId: String(input.categoryId) }), ...(input.tags === undefined ? {} : { tags: input.tags as string[] }) },
  ));
}
