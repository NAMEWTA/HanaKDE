import { readOnlyPermission, toolExecute, type ToolContextLike, type ToolInput } from "../src/interfaces/routes/lifecycle/tool.ts";

export const name = "audit_query";
export const description = "Query bounded metadata-only lifecycle audit events; unknown future event schemas are skipped and preserved.";
export const sessionPermission = readOnlyPermission;
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" }, retention: { type: "string", enum: ["ordinary", "permanent"] }, limit: { type: "number" } }, required: ["workspaceMountId"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, false, (application) => application.queryAudit({ retention: input.retention as "ordinary" | "permanent" | undefined, limit: input.limit as number | undefined })); }
