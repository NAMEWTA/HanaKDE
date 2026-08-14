import { getApplication } from "../src/runtime.ts";

export const name = "create";
export const description = "Create one persistent Todo item.";
export const sessionPermission = { kind: "plugin_output", describeSideEffect: () => ({ kind: "plugin_data_write", summary: "Create one Todo in the todolist private store.", ruleId: "todolist-create" }) };
export const parameters = { type: "object", properties: { title: { type: "string" }, notes: { type: "string" }, priority: { type: "string", enum: ["low", "normal", "high"] }, plannedFor: { type: "object" }, deadline: { type: "object" }, reminderAt: { type: "object" }, mode: { type: "string", enum: ["manual", "reminder", "agent_execute"] }, projectId: { type: ["string", "null"] }, tags: { type: "array", items: { type: "string" } }, agentId: { type: ["string", "null"] }, instructions: { type: ["string", "null"] }, permissionMode: { type: ["string", "null"] }, workspaceRef: { type: ["string", "null"] } }, required: ["title"] };
export async function execute(input: any, ctx: any) {
  const app = getApplication(ctx);
  const result = app.create(input);
  const background = input.mode === "reminder" ? await app.scheduleReminder(result.todo.id, result.todo.reminderAt?.kind === "exact" ? result.todo.reminderAt.instant : `${result.todo.reminderAt?.date}T09:00:00.000Z`, ctx) : input.mode === "agent_execute" ? await app.scheduleAgentRun(result.todo.id, null, ctx) : null;
  return { content: [{ type: "text", text: JSON.stringify(result.todo) }], details: { todo: result.todo, background } };
}
