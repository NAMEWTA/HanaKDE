import { readOnlyPermission, toolExecute, type ToolContextLike, type ToolInput } from "../src/interfaces/tool.ts";

export const name = "query";
export const description = "Query persistent Todos with stable bounded pagination and reason-bearing Today/Upcoming/Review projections.";
export const sessionPermission = readOnlyPermission;
export const parameters = {
  type: "object",
  properties: {
    view: { type: "string", enum: ["today", "inbox", "upcoming", "all", "calendar", "completed", "trash", "automation", "review", "project"] },
    includeTrash: { type: "boolean" },
    projectId: { type: ["string", "null"] },
    timeZone: { type: "string" },
    today: { type: "string" },
    search: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    priorities: { type: "array", items: { type: "string" } },
    modes: { type: "array", items: { type: "string" } },
    limit: { type: "number" },
    cursor: { type: "string" },
  },
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(ctx, (runtime) => runtime.application.query(input as never));
}
