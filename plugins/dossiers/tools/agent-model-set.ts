import { reviewerBoundPermission, toolExecute, toolInvocation, type ToolContextLike, type ToolInput } from "../src/interfaces/agent/tool.ts";

export const name = "model_access_set";
export const description = "Enable or disable global dossier content ResourceRefs for Agent-controlled reads without triggering model work.";
export const sessionPermission = reviewerBoundPermission("model-access", "Change the global dossier model-content access setting.", "setting");
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" }, enabled: { type: "boolean" } }, required: ["workspaceMountId", "enabled"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, (application) => application.setModelAccess(input.enabled as boolean, toolInvocation(ctx))); }
