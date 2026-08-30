import { LifecycleError, lifecycleErrorBody } from "../../../application/lifecycle/errors.ts";
import { isWorkspaceMountId, lifecycleApplication, lifecycleInvocation, type LifecyclePluginContextLike } from "./context.ts";

export type ToolInput = Record<string, unknown>;
export type ToolContextLike = LifecyclePluginContextLike;

export interface ToolSessionPermission {
  readOnly?: boolean;
  kind?: "read_only" | "workspace_write";
  auto?: "review";
  description?: string;
  describeSideEffect?: (input: ToolInput) => Record<string, unknown> | null;
}

export const readOnlyPermission: ToolSessionPermission = { readOnly: true, kind: "read_only" };

export function workspaceWritePermission(description: string): ToolSessionPermission {
  return {
    kind: "workspace_write", auto: "review", description,
    describeSideEffect(input) { return isWorkspaceMountId(input.workspaceMountId) ? { kind: "workspace_write", workspaceMountId: input.workspaceMountId, summary: description } : null; },
  };
}

function result(value: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(value) }], details: value }; }

export async function toolExecute(input: ToolInput, ctx: ToolContextLike, write: boolean, operation: (application: ReturnType<typeof lifecycleApplication>, actor: ReturnType<typeof lifecycleInvocation> | null) => unknown | Promise<unknown>): Promise<ReturnType<typeof result> & { isError?: boolean }> {
  try {
    const application = lifecycleApplication(ctx, input.workspaceMountId);
    return result(await operation(application, write ? lifecycleInvocation(ctx, "agent-tool") : null));
  } catch (error) { return { ...result(lifecycleErrorBody(error)), isError: true as const }; }
}

export function requiredRevision(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new LifecycleError("validation", `${field} must be a positive integer`, { field });
  return value as number;
}
