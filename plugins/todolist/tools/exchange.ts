import {
  pluginWritePermission,
  stageJson,
  toolExecute,
  type ToolContextLike,
  type ToolInput,
  type ToolSessionPermission,
} from "../src/interfaces/tool.ts";

export const name = "exchange";
export const description = "Preview, atomically commit, or export the versioned Todo exchange document; also return actionable Review projections.";

const basePermission = pluginWritePermission(
  "Persist an import preview or atomically commit validated Todo data.",
  "todolist-exchange",
);
export const sessionPermission: ToolSessionPermission = {
  ...basePermission,
  resolveInvocation(input) {
    const action = typeof input.action === "string" ? input.action : "";
    if (action === "review") return { action, kind: "read", capability: "todolist.exchange.review" };
    if (action === "export") {
      return {
        action,
        kind: "routine",
        capability: "todolist.exchange.export",
        target: { type: "session_files", id: "hana-todolist-export.json" },
        sideEffect: { kind: "session_file_output" },
      };
    }
    if (action === "preview" || action === "commit") {
      return {
        action,
        kind: "routine",
        capability: `todolist.exchange.${action}`,
        sideEffect: { kind: "plugin_data_write", operation: action },
      };
    }
    return null;
  },
};

export const parameters = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["preview", "commit", "export", "review"] },
    document: {},
    source: {},
    previewId: { type: "string" },
    commandId: { type: "string" },
    includeTrash: { type: "boolean" },
    timeZone: { type: "string" },
    today: { type: "string" },
  },
  required: ["action"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(ctx, async (runtime, invocation) => {
    switch (input.action) {
      case "preview":
        return runtime.exchange.preview(input.document ?? input.source, invocation);
      case "commit":
        return runtime.exchange.commit(String(input.previewId), String(input.commandId), invocation);
      case "export": {
        const document = runtime.exchange.exportDocument({ includeTrash: input.includeTrash === true });
        return { ok: true, document, file: await stageJson(ctx, document) };
      }
      case "review":
        return {
          ok: true,
          review: runtime.application.review(
            typeof input.timeZone === "string" ? input.timeZone : undefined,
            typeof input.today === "string" ? input.today : undefined,
          ),
        };
      default:
        throw new Error("Unsupported exchange action");
    }
  });
}
