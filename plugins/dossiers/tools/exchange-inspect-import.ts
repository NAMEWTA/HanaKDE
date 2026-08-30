import { exchangeResourceRef, readOnlyPermission, toolExecute, type ToolContextLike, type ToolInput } from "../src/interfaces/routes/exchange/tool.ts";

export const name = "dossier_import_inspect";
export const description = "Read and validate a selected dossier ZIP without authority writes, then return conflicts and a confirmation-bound preview.";
export const sessionPermission = readOnlyPermission;
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" }, archiveRef: { type: "object" } }, required: ["workspaceMountId", "archiveRef"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, (application) => application.inspectImport({ archiveRef: exchangeResourceRef(input.archiveRef) })); }
