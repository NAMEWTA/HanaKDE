import { getApplication } from "../src/runtime.ts";

export const name = "recurrence";
export const description = "Create, inspect, materialize, complete, skip, or update Todo recurrence history.";
export const sessionPermission = { kind: "plugin_output", describeSideEffect: () => ({ kind: "plugin_data_write", summary: "Manage recurrence rules and occurrence history in the todolist private store.", ruleId: "todolist-recurrence" }) };
export const parameters = { type: "object", properties: { action: { type: "string", enum: ["create", "list", "materialize", "complete", "skip", "update"] }, todoId: { type: "string" }, occurrenceId: { type: "string" }, ruleId: { type: "string" }, fromDate: { type: "string" }, days: { type: "number" }, rule: { type: "object" }, expectedVersion: { type: "number" }, patch: { type: "object" } }, required: ["action"] };

export async function execute(input: any, ctx: any) {
  const app = getApplication(ctx);
  const result = input.action === "create" ? app.createRecurrence(input.todoId, input.rule) : input.action === "list" ? { occurrences: app.queryOccurrences(input.todoId) } : input.action === "materialize" ? app.materialize(input.todoId, input.fromDate, input.days) : input.action === "complete" ? app.completeOccurrence(input.occurrenceId) : input.action === "skip" ? app.skipOccurrence(input.occurrenceId) : app.updateRecurrence(input.ruleId, input.expectedVersion, input.patch);
  return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
}
