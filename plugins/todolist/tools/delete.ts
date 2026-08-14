import { getApplication } from "../src/runtime.ts";
export const name = "delete";
export const description = "Move one Todo to Trash; permanent purge requires explicit confirmation.";
export const sessionPermission = { kind: "plugin_output", describeSideEffect: () => ({ kind: "plugin_data_write", summary: "Move one Todo to the todolist Trash.", ruleId: "todolist-trash" }) };
export const parameters = { type: "object", properties: { id: { type: "string" }, expectedVersion: { type: "number" } }, required: ["id", "expectedVersion"] };
export async function execute(input: any, ctx: any) { const result = getApplication(ctx).remove(input.id, input.expectedVersion); return { content: [{ type: "text", text: JSON.stringify(result.todo) }], details: { todo: result.todo, trash: true } }; }
