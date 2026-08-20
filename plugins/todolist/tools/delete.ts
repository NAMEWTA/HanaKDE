import { pluginWritePermission, toolExecute, type ToolContextLike, type ToolInput } from "../src/interfaces/tool.ts";

export const name = "delete";
export const description = "Move one Todo to Trash. Permanent purge uses a separate actor/session/version-bound confirmation.";
export const sessionPermission = pluginWritePermission(
  "Move one Todo to the todolist Trash.",
  "todolist-trash",
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
  return toolExecute(ctx, (runtime, invocation) => runtime.application.trashTodo(
    String(input.id),
    input.expectedVersion,
    invocation,
    typeof input.commandId === "string" ? input.commandId : undefined,
  ));
}
