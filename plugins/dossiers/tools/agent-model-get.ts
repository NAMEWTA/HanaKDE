import { readOnlyPermission, toolExecute, type ToolContextLike, type ToolInput } from "../src/interfaces/agent/tool.ts";

export const name = "model_access_get";
export const description = "Read the global dossier model-content access setting without opening any content resource.";
export const sessionPermission = readOnlyPermission;
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" } }, required: ["workspaceMountId"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, (application) => application.modelAccess()); }
