import { readOnlyPermission, toolExecute, type ToolContextLike, type ToolInput } from "../src/interfaces/catalog/tool.ts";

export const name = "catalog_query";
export const description = "List bounded dossier metadata, reusable contacts, or dossier types without reading managed document content.";
export const sessionPermission = readOnlyPermission;
export const parameters = {
  type: "object",
  properties: {
    workspaceMountId: { type: "string" },
    entity: { type: "string", enum: ["dossier", "contact", "type"] },
    limit: { type: "number" },
    cursor: { type: "string" },
    query: { type: "string" },
    typeId: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["workspaceMountId", "entity"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(input, ctx, (application) => {
    if (input.entity === "type") return application.listTypes();
    if (input.entity === "contact") return application.listContacts(input as never);
    if (input.entity === "dossier") return application.listDossiers(input as never);
    throw new Error("Unsupported catalog entity");
  });
}
