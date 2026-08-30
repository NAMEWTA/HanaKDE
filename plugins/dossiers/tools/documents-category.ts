import { requiredRevision, toolExecute, workspaceWritePermission, type ToolContextLike, type ToolInput } from "../src/interfaces/documents/tool.ts";

export const name = "documents_category";
export const description = "Create one custom primary document category in a dossier manifest.";
export const sessionPermission = workspaceWritePermission("Create one custom document category in the selected dossier.");
export const parameters = {
  type: "object",
  properties: { workspaceMountId: { type: "string" }, dossierId: { type: "string" }, expectedRevision: { type: "number" }, id: { type: "string" }, name: { type: "string" } },
  required: ["workspaceMountId", "dossierId", "expectedRevision", "id", "name"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(input, ctx, (application) => application.createCategory(
    String(input.dossierId),
    requiredRevision(input.expectedRevision),
    { id: String(input.id), name: String(input.name) },
  ));
}
