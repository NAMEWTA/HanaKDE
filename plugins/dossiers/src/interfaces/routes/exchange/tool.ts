import { ExchangeError, exchangeErrorBody } from "../../../application/exchange/errors.ts";
import { exchangeApplication, exchangeResourceRef, isWorkspaceMountId, type ExchangePluginContextLike } from "./context.ts";

export type ToolInput = Record<string, unknown>;
export type ToolContextLike = ExchangePluginContextLike;

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
export async function toolExecute(input: ToolInput, ctx: ToolContextLike, operation: (application: ReturnType<typeof exchangeApplication>) => unknown | Promise<unknown>) {
  try { return result(await operation(exchangeApplication(ctx, input.workspaceMountId))); }
  catch (error) { return { ...result(exchangeErrorBody(error)), isError: true as const }; }
}

export function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ExchangeError("validation", `${field} is required`, { field });
  return value.trim();
}

export { exchangeResourceRef };
