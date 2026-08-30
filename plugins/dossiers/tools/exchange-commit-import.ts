import { requiredText, toolExecute, workspaceWritePermission, type ToolContextLike, type ToolInput } from "../src/interfaces/routes/exchange/tool.ts";

export const name = "dossier_import_commit";
export const description = "Commit a previously inspected dossier ZIP using its single-use confirmation token, without overwriting existing dossiers or contacts.";
export const sessionPermission = workspaceWritePermission("Import the confirmed dossier package into a new workspace dossier directory.");
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" }, previewId: { type: "string" }, confirmationToken: { type: "string" } }, required: ["workspaceMountId", "previewId", "confirmationToken"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, (application) => application.commitImport(requiredText(input.previewId, "previewId"), requiredText(input.confirmationToken, "confirmationToken"))); }
