import { reviewerBoundPermission, toolExecute, toolInvocation, type ToolContextLike, type ToolInput } from "../src/interfaces/agent/tool.ts";

export const name = "create";
export const description = "Create one dossier with actor/session provenance through the catalog authority contract.";
export const sessionPermission = reviewerBoundPermission("create", "Create one dossier in the selected workspace.", "dossier");
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" }, name: { type: "string" }, typeId: { type: "string" }, fields: { type: "object" }, tags: { type: "array" } }, required: ["workspaceMountId", "name", "typeId", "fields"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, (application) => application.createDossier({ name: input.name, typeId: input.typeId, fields: input.fields, tags: input.tags }, toolInvocation(ctx))); }
