import { readOnlyPermission, toolExecute, type ToolContextLike, type ToolInput } from "../src/interfaces/documents/tool.ts";

export const name = "documents_query";
export const description = "List bounded document metadata and dossier-relative references without reading managed content.";
export const sessionPermission = readOnlyPermission;
export const parameters = {
  type: "object",
  properties: { workspaceMountId: { type: "string" }, dossierId: { type: "string" } },
  required: ["workspaceMountId", "dossierId"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(input, ctx, (application) => application.getDocuments(String(input.dossierId)));
}
