import { toolExecute, workspaceWritePermission, type ToolContextLike, type ToolInput } from "../src/interfaces/catalog/tool.ts";

export const name = "catalog_create";
export const description = "Create one dossier, reusable contact, or custom dossier type in an explicitly selected workspace dossier library.";
export const sessionPermission = workspaceWritePermission("Create one catalog entity in the selected workspace Dossiers directory.");
export const parameters = {
  type: "object",
  properties: {
    workspaceMountId: { type: "string" },
    entity: { type: "string", enum: ["dossier", "contact", "type"] },
    name: { type: "string" },
    typeId: { type: "string" },
    typeKey: { type: "string" },
    key: { type: "string" },
    fields: { type: ["object", "array"] },
    tags: { type: "array", items: { type: "string" } },
    emails: { type: "array", items: { type: "string" } },
    phones: { type: "array", items: { type: "string" } },
    organization: { type: "string" },
    title: { type: "string" },
    notes: { type: "string" },
  },
  required: ["workspaceMountId", "entity", "name"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(input, ctx, async (application) => {
    if (input.entity === "type") return { value: await application.createType({ key: input.key, name: input.name, fields: input.fields } as never) };
    if (input.entity === "contact") return { value: await application.createContact({
      name: input.name,
      organization: input.organization,
      title: input.title,
      emails: input.emails,
      phones: input.phones,
      notes: input.notes,
    } as never) };
    if (input.entity === "dossier") {
      let typeId = typeof input.typeId === "string" ? input.typeId : undefined;
      if (!typeId && typeof input.typeKey === "string") typeId = (await application.listTypes()).items.find((item) => item.key === input.typeKey)?.id;
      return { value: await application.createDossier({ name: input.name, typeId, fields: input.fields ?? {}, tags: input.tags } as never) };
    }
    throw new Error("Unsupported catalog entity");
  });
}
