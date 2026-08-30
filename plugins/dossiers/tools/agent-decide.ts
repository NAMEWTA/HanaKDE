import { reviewerBoundPermission, toolExecute, toolInvocation, type ToolContextLike, type ToolInput } from "../src/interfaces/agent/tool.ts";

export const name = "suggestion_decide";
export const description = "Accept or reject one actor/session/version-bound suggestion using its single-use confirmation token.";
export const sessionPermission = reviewerBoundPermission("decide", "Accept or reject one previously proposed dossier change.", "suggestion");
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" }, suggestionId: { type: "string" }, confirmationToken: { type: "string" }, decision: { type: "string", enum: ["accept", "reject"] } }, required: ["workspaceMountId", "suggestionId", "confirmationToken", "decision"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, (application) => application.decide(String(input.suggestionId), String(input.confirmationToken), input.decision as "accept" | "reject", toolInvocation(ctx))); }
