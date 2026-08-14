import { pluginWritePermission, toolExecute, type ToolContextLike, type ToolInput } from "../src/interfaces/tool.ts";

export const name = "complete";
export const description = "Complete one Todo with optimistic locking; external effects enter host-confirmed cancellation rather than false completion.";
export const sessionPermission = pluginWritePermission(
  "Complete one Todo and request cancellation of its active host work.",
  "todolist-complete",
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
  return toolExecute(ctx, (runtime, invocation) => runtime.application.completeTodo(
    String(input.id),
    input.expectedVersion,
    invocation,
    typeof input.commandId === "string" ? input.commandId : undefined,
  ));
}
