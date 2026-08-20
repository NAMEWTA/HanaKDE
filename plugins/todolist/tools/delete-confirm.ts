import { pluginWritePermission, toolExecute, type ToolContextLike, type ToolInput } from "../src/interfaces/tool.ts";

export const name = "delete_confirm";
export const description = "Confirm a previously prepared permanent purge. The token is single-use and actor/session/version-bound.";
export const sessionPermission = pluginWritePermission(
  "Permanently remove one confirmed Trash item and plugin-private linked records.",
  "todolist-purge",
);
export const parameters = {
  type: "object",
  properties: {
    id: { type: "string" },
    token: { type: "string" },
  },
  required: ["id", "token"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(ctx, (runtime, invocation) => runtime.application.confirmPurge(
    String(input.id),
    String(input.token),
    invocation,
  ));
}
