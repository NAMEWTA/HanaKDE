import { requiredRevision, toolExecute, workspaceWritePermission, type ToolContextLike, type ToolInput } from "../src/interfaces/routes/lifecycle/tool.ts";

export const name = "delete_prepare";
export const description = "Prepare a five-minute permanent-delete token after rechecking the 30-day retention and references.";
export const sessionPermission = workspaceWritePermission("Prepare one actor/session/version-bound permanent deletion.");
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" }, recordId: { type: "string" }, expectedRecordRevision: { type: "number" } }, required: ["workspaceMountId", "recordId", "expectedRecordRevision"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, true, (application, actor) => application.preparePurge(String(input.recordId), requiredRevision(input.expectedRecordRevision, "expectedRecordRevision"), actor!)); }
