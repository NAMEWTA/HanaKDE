import { toolExecute, workspaceWritePermission, type ToolContextLike, type ToolInput } from "../src/interfaces/routes/lifecycle/tool.ts";

export const name = "delete_confirm";
export const description = "Consume one actor/session/version-bound token and permanently delete an expired unreferenced Trash payload.";
export const sessionPermission = workspaceWritePermission("Permanently delete one reviewed expired Trash payload.");
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" }, recordId: { type: "string" }, confirmationToken: { type: "string" } }, required: ["workspaceMountId", "recordId", "confirmationToken"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, true, (application, actor) => application.confirmPurge(String(input.recordId), String(input.confirmationToken), actor!)); }
