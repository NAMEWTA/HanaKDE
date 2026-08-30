import { reviewerBoundPermission, toolExecute, type ToolContextLike, type ToolInput } from "../src/interfaces/agent/tool.ts";

export const name = "high_risk_guard";
export const description = "Fail closed for destructive, bulk, or overwrite actions until their owning preview and bound-confirmation workflow is available.";
export const sessionPermission = reviewerBoundPermission("high-risk", "Request a high-risk dossier action through its owning confirmed workflow.", "dossier");
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" }, action: { type: "string", enum: ["delete", "bulk", "overwrite"] }, targetId: { type: "string" } }, required: ["workspaceMountId", "action", "targetId"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, (application) => application.requireOwningConfirmation(input.action)); }
