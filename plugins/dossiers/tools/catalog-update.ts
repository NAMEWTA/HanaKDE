import { requiredRevision, toolExecute, workspaceWritePermission, type ToolContextLike, type ToolInput } from "../src/interfaces/catalog/tool.ts";

export const name = "catalog_update";
export const description = "Update one dossier or reusable contact with an explicit optimistic revision in the selected workspace.";
export const sessionPermission = workspaceWritePermission("Update one catalog entity using its current revision.");
export const parameters = {
  type: "object",
  properties: {
    workspaceMountId: { type: "string" }, entity: { type: "string", enum: ["dossier", "contact"] }, id: { type: "string" },
    expectedRevision: { type: "number" }, patch: { type: "object" },
  },
  required: ["workspaceMountId", "entity", "id", "expectedRevision", "patch"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(input, ctx, async (application) => ({
    value: input.entity === "contact"
      ? await application.updateContact(String(input.id), requiredRevision(input.expectedRevision), input.patch as never)
      : await application.updateDossier(String(input.id), requiredRevision(input.expectedRevision), input.patch as never),
  }));
}
