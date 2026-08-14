import { getApplication } from "../src/runtime.ts";

export const name = "query";
export const description = "Query persistent Todo items with bounded pagination.";
export const sessionPermission = { readOnly: true };
export const parameters = { type: "object", properties: { status: { type: "string", enum: ["pending", "completed", "all"] }, includeTrash: { type: "boolean" }, projectId: { type: ["string", "null"] }, view: { type: "string", enum: ["inbox", "today", "upcoming", "completed", "all", "calendar"] }, timeZone: { type: "string" }, search: { type: "string" }, limit: { type: "number" }, cursor: { type: "string" } } };
export async function execute(input: any, ctx: any) { const result = getApplication(ctx).query(input); return { content: [{ type: "text", text: JSON.stringify(result) }], details: { todos: result } }; }
