import { CatalogError, catalogErrorBody } from "../../application/catalog/errors.ts";
import { catalogApplication, isWorkspaceMountId, type CatalogPluginContextLike } from "./context.ts";

export type ToolInput = Record<string, unknown>;
export type ToolContextLike = CatalogPluginContextLike;

export interface ToolSessionPermission {
  readOnly?: boolean;
  kind?: "read_only" | "workspace_write";
  description?: string;
  describeSideEffect?: (input: ToolInput) => Record<string, unknown> | null;
}

export const readOnlyPermission: ToolSessionPermission = { readOnly: true, kind: "read_only" };

export function workspaceWritePermission(description: string): ToolSessionPermission {
  return {
    kind: "workspace_write",
    description,
    describeSideEffect(input) {
      return isWorkspaceMountId(input.workspaceMountId)
        ? { kind: "workspace_write", workspaceMountId: input.workspaceMountId, summary: description }
        : null;
    },
  };
}

export function toolResult(value: unknown): { content: Array<{ type: "text"; text: string }>; details: unknown } {
  return { content: [{ type: "text", text: JSON.stringify(value) }], details: value };
}

export function requiredRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new CatalogError("validation", "A positive expected revision is required", { field: "expectedRevision" });
  }
  return value;
}

export async function toolExecute(
  input: ToolInput,
  ctx: ToolContextLike,
  operation: (application: ReturnType<typeof catalogApplication>) => unknown | Promise<unknown>,
): Promise<ReturnType<typeof toolResult> & { isError?: boolean }> {
  try {
    const application = catalogApplication(ctx, input.workspaceMountId);
    return toolResult(await operation(application));
  } catch (error) {
    return { ...toolResult(catalogErrorBody(error)), isError: true };
  }
}
