import { readOnlyPermission, toolExecute, type ToolContextLike, type ToolInput } from "../src/interfaces/catalog/tool.ts";

export const name = "catalog_get";
export const description = "Read one dossier manifest projection or reusable contact from an explicitly selected workspace library.";
export const sessionPermission = readOnlyPermission;
export const parameters = {
  type: "object",
  properties: { workspaceMountId: { type: "string" }, entity: { type: "string", enum: ["dossier", "contact"] }, id: { type: "string" } },
  required: ["workspaceMountId", "entity", "id"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(input, ctx, async (application) => ({
    value: input.entity === "contact"
      ? await application.getContact(String(input.id))
      : await application.getDossier(String(input.id)),
  }));
}
