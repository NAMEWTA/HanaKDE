import { pluginWritePermission, toolExecute, type ToolContextLike, type ToolInput } from "../src/interfaces/tool.ts";

export const name = "reopen";
export const description = "Reopen one completed Todo without silently reviving old schedules or Agent Runs.";
export const sessionPermission = pluginWritePermission(
  "Reopen one Todo in the private store.",
  "todolist-reopen",
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
  return toolExecute(ctx, (runtime, invocation) => runtime.application.reopenTodo(
    String(input.id),
    input.expectedVersion,
    invocation,
    typeof input.commandId === "string" ? input.commandId : undefined,
  ));
}
