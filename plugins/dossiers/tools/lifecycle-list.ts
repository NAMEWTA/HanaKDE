import { readOnlyPermission, toolExecute, type ToolContextLike, type ToolInput } from "../src/interfaces/routes/lifecycle/tool.ts";

export const name = "trash_list";
export const description = "List bounded workspace Trash metadata and retention state without reading managed content.";
export const sessionPermission = readOnlyPermission;
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" }, includeResolved: { type: "boolean" }, limit: { type: "number" } }, required: ["workspaceMountId"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, false, (application) => application.listTrash({ includeResolved: input.includeResolved === true, limit: input.limit as number | undefined })); }
