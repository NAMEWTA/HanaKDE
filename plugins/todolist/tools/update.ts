import {
  normalizeLegacyTodoInput,
  pluginWritePermission,
  toolExecute,
  type ToolContextLike,
  type ToolInput,
} from "../src/interfaces/tool.ts";

export const name = "update";
export const description = "Update one Todo using optimistic version control; final aggregate invariants are validated after applying the patch.";
export const sessionPermission = pluginWritePermission(
  "Update one Todo and reconcile its host trigger intent.",
  "todolist-update",
);
export const parameters = {
  type: "object",
  properties: {
    id: { type: "string" },
    expectedVersion: { type: "number" },
    mutationId: { type: "string" },
    patch: { type: "object" },
    title: { type: "string" },
    description: { type: "string" },
    notes: { type: "string" },
    priority: { type: "string" },
    mode: { type: "string" },
    plannedFor: { type: ["object", "null"] },
    deadline: { type: ["object", "null"] },
    reminderTrigger: { type: ["object", "null"] },
    agentTrigger: { type: ["object", "null"] },
    projectId: { type: ["string", "null"] },
    tags: { type: "array", items: { type: "string" } },
    agentId: { type: ["string", "null"] },
    instructions: { type: ["string", "null"] },
    permissionMode: { type: ["string", "null"] },
    workspaceRef: { type: ["object", "null"], description: "Opaque ResourceRef returned by the Hana resource picker; raw local paths are rejected." },
  },
  required: ["id", "expectedVersion"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(ctx, (runtime, invocation) => {
    const { id, expectedVersion, mutationId, patch, ...inline } = input;
    const requestedPatch = patch && typeof patch === "object" ? patch : inline;
    return runtime.application.updateTodo(
      String(id),
      normalizeLegacyTodoInput(requestedPatch as ToolInput),
      expectedVersion,
      invocation,
      typeof mutationId === "string" ? mutationId : undefined,
    );
  });
}
