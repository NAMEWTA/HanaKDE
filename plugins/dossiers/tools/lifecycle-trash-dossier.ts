import { requiredRevision, toolExecute, workspaceWritePermission, type ToolContextLike, type ToolInput } from "../src/interfaces/routes/lifecycle/tool.ts";

export const name = "trash_dossier";
export const description = "Move one revision-bound dossier and all of its managed files into the portable 30-day workspace Trash.";
export const sessionPermission = workspaceWritePermission("Move one dossier into the selected workspace Trash.");
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" }, dossierId: { type: "string" }, expectedRevision: { type: "number" }, reason: { type: "string" } }, required: ["workspaceMountId", "dossierId", "expectedRevision"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, true, (application, actor) => application.trashDossier(String(input.dossierId), requiredRevision(input.expectedRevision, "expectedRevision"), actor!, input.reason as string | undefined)); }
