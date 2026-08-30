import { requiredRevision, toolExecute, workspaceWritePermission, type ToolContextLike, type ToolInput } from "../src/interfaces/documents/tool.ts";

export const name = "documents_commit";
export const description = "Commit one reviewed import preview by copying verified bytes before publishing relative dossier references.";
export const sessionPermission = workspaceWritePermission("Copy the reviewed sources into one dossier and publish their relative references.");
export const parameters = {
  type: "object",
  properties: { workspaceMountId: { type: "string" }, previewId: { type: "string" }, expectedRevision: { type: "number" } },
  required: ["workspaceMountId", "previewId", "expectedRevision"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(input, ctx, (application) => application.commitPreview(String(input.previewId), requiredRevision(input.expectedRevision)));
}
