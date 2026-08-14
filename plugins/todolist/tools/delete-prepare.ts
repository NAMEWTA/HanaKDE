import { pluginWritePermission, toolExecute, type ToolContextLike, type ToolInput } from "../src/interfaces/tool.ts";

export const name = "delete_prepare";
export const description = "Prepare a short-lived permanent purge confirmation bound to actor, session, Todo id, and Todo version.";
export const sessionPermission = pluginWritePermission(
  "Create one short-lived, actor/session-bound purge confirmation.",
  "todolist-purge-prepare",
);
export const parameters = {
  type: "object",
  properties: {
    id: { type: "string" },
    expectedVersion: { type: "number" },
  },
  required: ["id", "expectedVersion"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(ctx, (runtime, invocation) => runtime.application.preparePurge(
    String(input.id),
    input.expectedVersion,
    invocation,
  ));
}
