import { getApplication } from "../src/runtime.ts";
export const name = "automation";
export const description = "Inspect and operate isolated Todo Agent Runs.";
export const sessionPermission = { kind: "external_side_effect", describeSideEffect: () => ({ kind: "agent", summary: "Operate one explicitly authorized Todo Agent Run.", ruleId: "todolist-automation" }) };
export const parameters = { type: "object", properties: { action: { type: "string", enum: ["list", "create", "schedule", "start", "retry", "cancel", "confirm_cancel", "set_state"] }, todoId: { type: "string" }, occurrenceId: { type: "string" }, runId: { type: "string" }, status: { type: "string" }, sessionRef: { type: "object" }, summary: { type: "string" }, diagnostic: { type: "string" } }, required: ["action"] };
export async function execute(input: any, ctx: any) {
  const app = getApplication(ctx);
  const result = input.action === "list" ? { runs: app.listRuns(input.status) } : input.action === "create" ? app.createRun(input.todoId, input.occurrenceId || null) : input.action === "schedule" ? await app.scheduleAgentRun(input.todoId, input.occurrenceId || null, ctx) : input.action === "start" ? await app.startRun(input.runId, ctx) : input.action === "retry" ? app.retryRun(input.runId) : input.action === "cancel" ? app.setRunState(input.runId, "cancel_requested") : input.action === "confirm_cancel" ? app.setRunState(input.runId, "cancelled") : app.setRunState(input.runId, input.status, { sessionRef: input.sessionRef || null, summary: input.summary || null, diagnostic: input.diagnostic || null });
  return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
}
