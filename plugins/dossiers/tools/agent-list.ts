import { readOnlyPermission, toolExecute, type ToolContextLike, type ToolInput } from "../src/interfaces/agent/tool.ts";

export const name = "list";
export const description = "List bounded dossier metadata without reading managed document content.";
export const sessionPermission = readOnlyPermission;
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" }, query: { type: "string" }, limit: { type: "number" }, cursor: { type: "string" } }, required: ["workspaceMountId"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, (application) => application.list({ query: input.query as string | undefined, limit: input.limit as number | undefined, cursor: input.cursor as string | undefined })); }
