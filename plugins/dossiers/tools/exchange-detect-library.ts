import { toolExecute, workspaceWritePermission, type ToolContextLike, type ToolInput } from "../src/interfaces/routes/exchange/tool.ts";

export const name = "dossier_library_detect";
export const description = "Detect or safely initialize the portable Dossiers library and report whether its metadata index should be rebuilt.";
export const sessionPermission = workspaceWritePermission("Detect or initialize the selected workspace Dossiers library.");
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" } }, required: ["workspaceMountId"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, (application) => application.detectLibrary()); }
