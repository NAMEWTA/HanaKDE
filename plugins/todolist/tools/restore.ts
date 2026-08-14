import { getApplication } from "../src/runtime.ts";
export const name = "restore";
export const description = "Restore one Todo from Trash.";
export const sessionPermission = { kind: "plugin_output", describeSideEffect: () => ({ kind: "plugin_data_write", summary: "Restore one Todo from the todolist Trash.", ruleId: "todolist-restore" }) };
export const parameters = { type: "object", properties: { id: { type: "string" }, expectedVersion: { type: "number" } }, required: ["id", "expectedVersion"] };
export async function execute(input: any, ctx: any) { const result = getApplication(ctx).restore(input.id, input.expectedVersion); return { content: [{ type: "text", text: JSON.stringify(result.todo) }], details: { todo: result.todo, restored: true } }; }
