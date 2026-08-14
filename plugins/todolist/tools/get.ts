import { readOnlyPermission, toolExecute, type ToolContextLike, type ToolInput } from "../src/interfaces/tool.ts";

export const name = "get";
export const description = "Get one persistent Todo with its project, Reminder, Run, reasons, and allowed actions.";
export const sessionPermission = readOnlyPermission;
export const parameters = {
  type: "object",
  properties: { id: { type: "string" } },
  required: ["id"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(ctx, (runtime) => ({
    ok: true,
    todo: runtime.application.getTodo(String(input.id)),
  }));
}
