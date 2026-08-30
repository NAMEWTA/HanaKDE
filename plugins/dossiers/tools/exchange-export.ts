import { requiredText, toolExecute, workspaceWritePermission, type ToolContextLike, type ToolInput } from "../src/interfaces/routes/exchange/tool.ts";

export const name = "dossier_export";
export const description = "Create a deterministic, self-contained dossier ZIP under the selected workspace and return its ResourceRef.";
export const sessionPermission = workspaceWritePermission("Create a self-contained dossier ZIP in the selected workspace.");
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" }, dossierId: { type: "string" } }, required: ["workspaceMountId", "dossierId"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, (application) => application.exportDossier(requiredText(input.dossierId, "dossierId"))); }
