import {
  pluginWritePermission,
  toolExecute,
  type ToolContextLike,
  type ToolInput,
  type ToolSessionPermission,
} from "../src/interfaces/tool.ts";

export const name = "project";
export const description = "List, create, update, trash, or restore one-level Todo projects.";

const basePermission = pluginWritePermission(
  "Manage Todo projects in the private store.",
  "todolist-project",
);
export const sessionPermission: ToolSessionPermission = {
  ...basePermission,
  resolveInvocation(input) {
    const action = typeof input.action === "string" ? input.action : "";
    if (action === "list") return { action, kind: "read", capability: "todolist.project.list" };
    if (!["create", "update", "trash", "restore"].includes(action)) return null;
    if (action !== "create" && (typeof input.id !== "string" || !input.id)) return null;
    return {
      action,
      kind: "routine",
      capability: `todolist.project.${action}`,
      ...(typeof input.id === "string"
        ? { target: { type: "setting", id: `project:${input.id}` } }
        : {}),
      sideEffect: { kind: "plugin_data_write", operation: action },
    };
  },
};

export const parameters = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["list", "create", "update", "trash", "restore"] },
    id: { type: "string" },
    name: { type: "string" },
    expectedVersion: { type: "number" },
    includeTrash: { type: "boolean" },
    commandId: { type: "string" },
  },
  required: ["action"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(ctx, (runtime, invocation) => {
    switch (input.action) {
      case "list":
        return { ok: true, ...runtime.application.listProjects({ includeTrash: input.includeTrash === true }) };
      case "create":
        return runtime.application.createProject(
          input.name,
          invocation,
          typeof input.commandId === "string" ? input.commandId : undefined,
        );
      case "update":
        return runtime.application.updateProject(String(input.id), input.name, input.expectedVersion, invocation);
      case "trash":
        return runtime.application.trashProject(String(input.id), input.expectedVersion, invocation);
      case "restore":
        return runtime.application.restoreProject(String(input.id), input.expectedVersion, invocation);
      default:
        throw new Error("Unsupported project action");
    }
  });
}
