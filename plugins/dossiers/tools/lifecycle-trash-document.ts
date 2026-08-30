import { requiredRevision, toolExecute, workspaceWritePermission, type ToolContextLike, type ToolInput } from "../src/interfaces/routes/lifecycle/tool.ts";

export const name = "trash_document";
export const description = "Move one managed document into 30-day Trash and atomically remove its dossier manifest reference.";
export const sessionPermission = workspaceWritePermission("Move one managed document into the selected workspace Trash.");
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" }, dossierId: { type: "string" }, documentId: { type: "string" }, expectedDossierRevision: { type: "number" }, reason: { type: "string" } }, required: ["workspaceMountId", "dossierId", "documentId", "expectedDossierRevision"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, true, (application, actor) => application.trashDocument(String(input.dossierId), String(input.documentId), requiredRevision(input.expectedDossierRevision, "expectedDossierRevision"), actor!, input.reason as string | undefined)); }
