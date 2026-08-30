import { DocumentError, documentErrorBody } from "../../application/documents/errors.ts";
import { documentApplication, isWorkspaceMountId, type DocumentPluginContextLike } from "./context.ts";

export type ToolInput = Record<string, unknown>;
export type ToolContextLike = DocumentPluginContextLike;

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

function toolResult(value: unknown): { content: Array<{ type: "text"; text: string }>; details: unknown } {
  return { content: [{ type: "text", text: JSON.stringify(value) }], details: value };
}

export function requiredRevision(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new DocumentError("validation", "A positive expected revision is required", { field: "expectedRevision" });
  return value as number;
}

export async function toolExecute(
  input: ToolInput,
  ctx: ToolContextLike,
  operation: (application: ReturnType<typeof documentApplication>) => unknown | Promise<unknown>,
): Promise<ReturnType<typeof toolResult> & { isError?: boolean }> {
  try {
    return toolResult(await operation(documentApplication(ctx, input.workspaceMountId)));
  } catch (error) {
    return { ...toolResult(documentErrorBody(error)), isError: true };
  }
}
