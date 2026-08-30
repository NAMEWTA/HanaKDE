import { readOnlyPermission, toolExecute, type ToolContextLike, type ToolInput } from "../src/interfaces/agent/tool.ts";

export const name = "context";
export const description = "Return safe dossier metadata and relative ResourceRefs for Agent-controlled on-demand reads; never returns document content.";
export const sessionPermission = readOnlyPermission;
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" }, dossierId: { type: "string" } }, required: ["workspaceMountId", "dossierId"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, (application) => application.context(String(input.dossierId))); }
