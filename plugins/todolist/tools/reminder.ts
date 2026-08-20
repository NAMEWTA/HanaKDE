import {
  externalPermission,
  toolExecute,
  type ToolContextLike,
  type ToolInput,
  type ToolSessionPermission,
} from "../src/interfaces/tool.ts";

export const name = "reminder";
export const description = "Inspect, retry, or cancel Todo Reminders. Wake/handoff is internal to the registered TaskRegistry handler and cannot be forged by an Agent.";

const basePermission = externalPermission(
  "Operate an explicitly identified Todo Reminder through TaskRegistry.",
  "todolist-reminder",
);
export const sessionPermission: ToolSessionPermission = {
  ...basePermission,
  resolveInvocation(input) {
    const action = typeof input.action === "string" ? input.action : "";
    if (action === "list") {
      return { action, kind: "read", capability: "todolist.reminder.list" };
    }
    if (!["retry", "cancel"].includes(action) || typeof input.reminderId !== "string" || !input.reminderId) return null;
    return {
      action,
      kind: "review",
      capability: `todolist.reminder.${action}`,
      target: { type: "notification_route", id: input.reminderId },
      sideEffect: { kind: "notification_route", operation: action },
    };
  },
};

export const parameters = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["list", "retry", "cancel"] },
    reminderId: { type: "string" },
    todoId: { type: "string" },
    status: { type: "string" },
    limit: { type: "number" },
  },
  required: ["action"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(ctx, (runtime, invocation) => {
    switch (input.action) {
      case "list":
        return {
          ok: true,
          ...runtime.application.listReminders({
            todoId: typeof input.todoId === "string" ? input.todoId : undefined,
            status: input.status as never,
            limit: typeof input.limit === "number" ? input.limit : undefined,
          }),
        };
      case "retry":
        return runtime.application.retryReminder(String(input.reminderId), invocation);
      case "cancel":
        return runtime.application.cancelReminder(String(input.reminderId), invocation);
      default:
        throw new Error("Unsupported reminder action");
    }
  });
}
