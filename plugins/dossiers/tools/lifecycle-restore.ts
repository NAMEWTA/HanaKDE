import { requiredRevision, toolExecute, workspaceWritePermission, type ToolContextLike, type ToolInput } from "../src/interfaces/routes/lifecycle/tool.ts";

export const name = "restore";
export const description = "Restore one unexpired Trash record without overwriting an existing identity, path, or manifest reference.";
export const sessionPermission = workspaceWritePermission("Restore one item from the selected workspace Trash.");
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" }, recordId: { type: "string" }, expectedRecordRevision: { type: "number" }, expectedDossierRevision: { type: "number" } }, required: ["workspaceMountId", "recordId", "expectedRecordRevision"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, true, (application, actor) => application.restore(String(input.recordId), requiredRevision(input.expectedRecordRevision, "expectedRecordRevision"), actor!, input.expectedDossierRevision === undefined ? undefined : requiredRevision(input.expectedDossierRevision, "expectedDossierRevision"))); }
