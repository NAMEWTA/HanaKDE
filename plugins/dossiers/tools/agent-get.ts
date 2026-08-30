import { readOnlyPermission, toolExecute, type ToolContextLike, type ToolInput } from "../src/interfaces/agent/tool.ts";

export const name = "get";
export const description = "Get one safe dossier metadata projection without contact sensitive values or document content.";
export const sessionPermission = readOnlyPermission;
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" }, dossierId: { type: "string" } }, required: ["workspaceMountId", "dossierId"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, (application) => application.get(String(input.dossierId))); }
