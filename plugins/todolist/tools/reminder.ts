import { getApplication } from "../src/runtime.ts";
export const name = "reminder";
export const description = "Schedule or hand off one Todo reminder through existing host capabilities.";
export const sessionPermission = { kind: "external_side_effect", describeSideEffect: () => ({ kind: "notification_route", summary: "Hand off a Todo reminder to the existing Hana notification event.", ruleId: "todolist-reminder" }) };
export const parameters = { type: "object", properties: { action: { type: "string", enum: ["schedule", "wake", "cancel"] }, todoId: { type: "string" }, dueAt: { type: "string" }, reminderId: { type: "string" } }, required: ["action"] };
export async function execute(input: any, ctx: any) { const app = getApplication(ctx); const result = input.action === "schedule" ? await app.scheduleReminder(input.todoId, input.dueAt, ctx) : input.action === "cancel" ? await app.cancelReminder(input.reminderId, ctx) : await app.handoffReminder(input.reminderId, ctx); return { content: [{ type: "text", text: JSON.stringify(result) }], details: result }; }
