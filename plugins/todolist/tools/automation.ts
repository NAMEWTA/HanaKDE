import {
  externalPermission,
  toolExecute,
  type ToolContextLike,
  type ToolInput,
  type ToolSessionPermission,
} from "../src/interfaces/tool.ts";

export const name = "automation";
export const description = "Inspect, explicitly start, retry, or request cancellation of isolated Todo Agent Runs. Internal state transitions are not exposed.";

const basePermission = externalPermission(
  "Operate one explicitly authorized Todo Agent Run and its plugin-private Session.",
  "todolist-automation",
);
export const sessionPermission: ToolSessionPermission = {
  ...basePermission,
  resolveInvocation(input) {
    const action = typeof input.action === "string" ? input.action : "";
    if (action === "list" || action === "get") {
      if (action === "get" && typeof input.runId !== "string") return null;
      return {
        action,
        kind: "read",
        capability: `todolist.automation.${action}`,
        ...(typeof input.runId === "string"
          ? { target: { type: "background_task", id: input.runId } }
          : {}),
      };
    }
    if (!["start", "retry", "cancel"].includes(action) || typeof input.runId !== "string" || !input.runId) return null;
    return {
      action,
      kind: "review",
      capability: `todolist.automation.${action}`,
      target: { type: "background_task", id: input.runId },
      sideEffect: { kind: "agent_run", operation: action },
    };
  },
};

export const parameters = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["list", "get", "start", "retry", "cancel"] },
    runId: { type: "string" },
    todoId: { type: "string" },
    status: { type: "string" },
    runAt: { type: "string" },
    limit: { type: "number" },
  },
  required: ["action"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(ctx, (runtime, invocation) => {
    switch (input.action) {
      case "list":
        return {
          ok: true,
          ...runtime.application.listRuns({
            todoId: typeof input.todoId === "string" ? input.todoId : undefined,
            status: input.status as never,
            limit: typeof input.limit === "number" ? input.limit : undefined,
          }),
        };
      case "get":
        return { ok: true, ...runtime.application.getRunDetails(String(input.runId)) };
      case "start":
        return runtime.application.startRun(String(input.runId), invocation);
      case "retry":
        return runtime.application.retryRun(
          String(input.runId),
          invocation,
          typeof input.runAt === "string" ? input.runAt : undefined,
        );
      case "cancel":
        return runtime.application.cancelRun(String(input.runId), invocation);
      default:
        throw new Error("Unsupported automation action");
    }
  });
}
