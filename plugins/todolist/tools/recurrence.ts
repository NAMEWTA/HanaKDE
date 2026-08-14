import {
  pluginWritePermission,
  toolExecute,
  type ToolContextLike,
  type ToolInput,
  type ToolSessionPermission,
} from "../src/interfaces/tool.ts";

export const name = "recurrence";
export const description = "Create, inspect, materialize, scope-edit, pause/end, or skip recurrence whose occurrences are independent Todos linked to immutable RuleVersions.";

const basePermission = pluginWritePermission(
  "Manage recurrence rules and occurrence history in the todolist private store.",
  "todolist-recurrence",
);
export const sessionPermission: ToolSessionPermission = {
  ...basePermission,
  resolveInvocation(input) {
    const action = typeof input.action === "string" ? input.action : "";
    if (action === "list") return { action, kind: "read", capability: "todolist.recurrence.list" };
    if (!["create", "materialize", "update", "status", "skip"].includes(action)) return null;
    const targetId = typeof input.seriesId === "string"
      ? input.seriesId
      : typeof input.occurrenceId === "string"
        ? input.occurrenceId
        : typeof input.todoId === "string"
          ? input.todoId
          : undefined;
    if (!targetId) return null;
    return {
      action,
      kind: "routine",
      capability: `todolist.recurrence.${action}`,
      target: { type: "background_task", id: targetId },
      sideEffect: { kind: "plugin_data_write", operation: action },
    };
  },
};

export const parameters = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["list", "create", "materialize", "update", "status", "skip"] },
    todoId: { type: "string" },
    seriesId: { type: "string" },
    occurrenceId: { type: "string" },
    fromDate: { type: "string" },
    throughDate: { type: "string" },
    rule: { type: "object" },
    scope: { type: "string", enum: ["only_this", "this_and_future"] },
    status: { type: "string", enum: ["active", "paused", "ended"] },
    expectedVersion: { type: "number" },
    patch: { type: "object" },
  },
  required: ["action"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(ctx, (runtime, invocation) => {
    switch (input.action) {
      case "list":
        return { ok: true, ...runtime.application.listRecurrence() };
      case "create":
        return runtime.application.createRecurrenceSeries(
          String(input.todoId),
          input.rule,
          input.expectedVersion,
          invocation,
          typeof input.throughDate === "string" ? input.throughDate : undefined,
        );
      case "materialize":
        return runtime.application.materializeRecurrence(
          String(input.seriesId),
          String(input.fromDate),
          String(input.throughDate),
          invocation,
        );
      case "update":
        return runtime.application.updateRecurrence(
          String(input.occurrenceId),
          input.scope === "this_and_future" ? "this_and_future" : "only_this",
          { patch: input.patch, rule: input.rule, expectedVersion: input.expectedVersion },
          invocation,
        );
      case "status":
        return runtime.application.setRecurrenceStatus(
          String(input.seriesId),
          input.status as never,
          input.expectedVersion,
          invocation,
        );
      case "skip":
        return runtime.application.skipOccurrence(String(input.occurrenceId), input.expectedVersion, invocation);
      default:
        throw new Error("Unsupported recurrence action");
    }
  });
}
