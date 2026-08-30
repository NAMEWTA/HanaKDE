import { toolExecute, workspaceWritePermission, type ToolContextLike, type ToolInput } from "../src/interfaces/routes/lifecycle/tool.ts";

export const name = "audit_cleanup";
export const description = "Explicitly remove known ordinary audit events older than one year while preserving permanent and unknown events.";
export const sessionPermission = workspaceWritePermission("Apply the one-year ordinary audit retention policy in the selected workspace.");
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" } }, required: ["workspaceMountId"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, true, (application, actor) => application.cleanupAudit(actor!)); }
