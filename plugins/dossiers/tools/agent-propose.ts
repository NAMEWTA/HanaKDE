import { reviewerBoundPermission, toolExecute, toolInvocation, type ToolContextLike, type ToolInput } from "../src/interfaces/agent/tool.ts";

export const name = "suggestion_propose";
export const description = "Persist one bounded suggestion without changing dossier, document, or contact authority and return a bound confirmation token.";
export const sessionPermission = reviewerBoundPermission("propose", "Create one proposed dossier change without applying it.", "dossier");
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" }, action: { type: "string", enum: ["update_dossier", "update_document", "link_contact"] }, dossierId: { type: "string" }, documentId: { type: "string" }, contactId: { type: "string" }, role: { type: "string" }, expectedEntityRevision: { type: "number" }, patch: { type: "object" } }, required: ["workspaceMountId", "action", "dossierId", "expectedEntityRevision"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, (application) => application.propose(input as never, toolInvocation(ctx))); }
