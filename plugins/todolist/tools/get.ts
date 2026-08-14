import { getApplication } from "../src/runtime.ts";
export const name = "get";
export const description = "Get one persistent Todo item.";
export const sessionPermission = { readOnly: true };
export const parameters = { type: "object", properties: { id: { type: "string" }, includeTrash: { type: "boolean" } }, required: ["id"] };
export async function execute(input: any, ctx: any) { const result = getApplication(ctx).get(input.id, input.includeTrash === true); return { content: [{ type: "text", text: JSON.stringify(result.todo) }], details: { todo: result.todo } }; }
