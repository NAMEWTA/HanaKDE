import { pluginWritePermission, toolExecute, type ToolContextLike, type ToolInput } from "../src/interfaces/tool.ts";

export const name = "restore";
export const description = "Restore one Todo from Trash without silently reactivating old schedules or Agent Runs.";
export const sessionPermission = pluginWritePermission(
  "Restore one Todo from the private Trash.",
  "todolist-restore",
);
export const parameters = {
  type: "object",
  properties: {
    id: { type: "string" },
    expectedVersion: { type: "number" },
    commandId: { type: "string" },
  },
  required: ["id", "expectedVersion"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(ctx, (runtime, invocation) => runtime.application.restoreTodo(
    String(input.id),
    input.expectedVersion,
    invocation,
    typeof input.commandId === "string" ? input.commandId : undefined,
  ));
}
