import {
  pluginWritePermission,
  toolExecute,
  type ToolContextLike,
  type ToolInput,
} from "../src/interfaces/tool.ts";

export const name = "capture";
export const description = "Capture exactly one manual Todo with explicit visible context.";
export const sessionPermission = pluginWritePermission(
  "Capture one manual Todo in the todolist private store.",
  "todolist-capture",
);
export const parameters = {
  type: "object",
  properties: {
    title: { type: "string" },
    projectId: { type: ["string", "null"] },
    tags: { type: "array", items: { type: "string" } },
    commandId: { type: "string" },
  },
  required: ["title"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(ctx, (runtime, invocation) => runtime.application.createTodo({
    title: input.title,
    projectId: input.projectId,
    tags: input.tags,
    mode: "manual",
    commandId: input.commandId,
  } as never, invocation));
}
