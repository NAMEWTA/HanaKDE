import { requiredRevision, toolExecute, workspaceWritePermission, type ToolContextLike, type ToolInput } from "../src/interfaces/routes/lifecycle/tool.ts";

export const name = "contact_delete";
export const description = "Delete one contact only after checking active and restorable dossier references.";
export const sessionPermission = workspaceWritePermission("Delete one contact after active and Trash reference checks.");
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" }, contactId: { type: "string" }, expectedRevision: { type: "number" } }, required: ["workspaceMountId", "contactId", "expectedRevision"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, true, (application, actor) => application.deleteContact(String(input.contactId), requiredRevision(input.expectedRevision, "expectedRevision"), actor!)); }
