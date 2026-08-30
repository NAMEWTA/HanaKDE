import { requiredRevision, toolExecute, workspaceWritePermission, type ToolContextLike, type ToolInput } from "../src/interfaces/catalog/tool.ts";

export const name = "catalog_type";
export const description = "Preview, update, or safely delete a dossier type; built-in, referenced, or value-destructive changes fail closed.";
export const sessionPermission = workspaceWritePermission("Preview, update, or delete one dossier type without silently deleting values.");
export const parameters = {
  type: "object",
  properties: {
    workspaceMountId: { type: "string" }, action: { type: "string", enum: ["preview", "update", "delete"] }, id: { type: "string" },
    expectedRevision: { type: "number" }, patch: { type: "object" },
  },
  required: ["workspaceMountId", "action", "id"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(input, ctx, async (application) => {
    if (input.action === "preview") return application.previewTypeUpdate(String(input.id), (input.patch ?? {}) as never);
    if (input.action === "delete") return application.deleteType(String(input.id), requiredRevision(input.expectedRevision));
    return { value: await application.updateType(String(input.id), requiredRevision(input.expectedRevision), (input.patch ?? {}) as never) };
  });
}
