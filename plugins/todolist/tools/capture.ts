import { getApplication } from "../src/runtime.ts";
export const name = "capture";
export const description = "Capture exactly one Todo item with explicit visible context.";
export const sessionPermission = { kind: "plugin_output", describeSideEffect: () => ({ kind: "plugin_data_write", summary: "Capture one Todo in the todolist private store.", ruleId: "todolist-capture" }) };
export const parameters = { type: "object", properties: { title: { type: "string" }, projectId: { type: ["string", "null"] }, tags: { type: "array", items: { type: "string" } } }, required: ["title"] };
export async function execute(input: any, ctx: any) { const result = getApplication(ctx).capture(input.title, { projectId: input.projectId, tags: input.tags }); return { content: [{ type: "text", text: JSON.stringify(result.todo) }], details: { todo: result.todo, capture: { singleItem: true } } }; }
