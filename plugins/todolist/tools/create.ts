import {
  normalizeLegacyTodoInput,
  pluginWritePermission,
  toolExecute,
  type ToolContextLike,
  type ToolInput,
  type ToolSessionPermission,
} from "../src/interfaces/tool.ts";

export const name = "create";
export const description = "Create one persistent Todo. Manual is the default; Reminder and Agent execution require complete explicit trigger configuration.";

const basePermission = pluginWritePermission(
  "Create one Todo in the todolist private store.",
  "todolist-create",
);
export const sessionPermission: ToolSessionPermission = {
  ...basePermission,
  resolveInvocation(input) {
    if (typeof input.title !== "string" || !input.title.trim()) return null;
    const mode = input.mode === "reminder" || input.mode === "agent_execute" ? input.mode : "manual";
    const external = mode !== "manual";
    return {
      action: `create_${mode}`,
      kind: external ? "review" : "routine",
      capability: `todolist.create.${mode}`,
      sideEffect: external
        ? { kind: mode === "reminder" ? "notification_route" : "agent_run", mode }
        : { kind: "plugin_data_write" },
    };
  },
};

export const parameters = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    notes: { type: "string" },
    priority: { type: "string", enum: ["none", "low", "medium", "normal", "high", "urgent"] },
    plannedFor: { type: "object" },
    deadline: { type: "object" },
    mode: { type: "string", enum: ["manual", "reminder", "agent_execute"] },
    reminderTrigger: { type: "object" },
    agentTrigger: { type: "object" },
    projectId: { type: ["string", "null"] },
    tags: { type: "array", items: { type: "string" } },
    agentId: { type: ["string", "null"] },
    instructions: { type: ["string", "null"] },
    permissionMode: { type: ["string", "null"] },
    workspaceRef: { type: ["object", "null"], description: "Opaque ResourceRef returned by the Hana resource picker; raw local paths are rejected." },
    commandId: { type: "string" },
  },
  required: ["title"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(ctx, (runtime, invocation) => runtime.application.createTodo(
    normalizeLegacyTodoInput(input) as never,
    invocation,
  ));
}
