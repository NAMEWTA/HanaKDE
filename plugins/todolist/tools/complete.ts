import { getApplication } from "../src/runtime.ts";
export const name = "complete";
export const description = "Complete one Todo using optimistic version control.";
export const sessionPermission = { kind: "plugin_output", describeSideEffect: () => ({ kind: "plugin_data_write", summary: "Complete one Todo in the todolist private store.", ruleId: "todolist-complete" }) };
export const parameters = { type: "object", properties: { id: { type: "string" }, expectedVersion: { type: "number" } }, required: ["id", "expectedVersion"] };
export async function execute(input: any, ctx: any) { const result = getApplication(ctx).complete(input.id, input.expectedVersion); return { content: [{ type: "text", text: JSON.stringify(result.todo) }], details: { todo: result.todo } }; }
