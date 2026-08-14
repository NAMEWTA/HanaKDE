import fs from "node:fs";
import path from "node:path";
import { errorResponse } from "../errors.ts";
import { newId } from "../domain/utils.ts";
import { getRuntime } from "../runtime.ts";
import { invocationFromToolContext, type PluginContextLike } from "./context.ts";

export type ToolInput = Record<string, unknown>;
export type ToolContextLike = PluginContextLike;

export interface ToolInvocationDescriptor {
  action: string;
  kind: "read" | "routine" | "review";
  capability: string;
  target?: {
    type: "agent" | "background_task" | "notification_route" | "session_files" | "setting" | string;
    id: string;
    label?: string;
  };
  sideEffect?: Record<string, unknown>;
}

export interface ToolSessionPermission<Input = ToolInput> {
  readOnly?: boolean;
  kind?: "read" | "read_only" | "plugin_output" | "session_file_output" | "workspace_write" | "external_side_effect" | "review" | string;
  auto?: "allow" | "review";
  description?: string;
  sideEffect?: Record<string, unknown>;
  describeSideEffect?: (input: Input) => Record<string, unknown> | null | undefined;
  resolveInvocation?: (input: Input) => ToolInvocationDescriptor | null;
}

export const readOnlyPermission: ToolSessionPermission = { readOnly: true, kind: "read_only" };

export function pluginWritePermission(summary: string, ruleId: string): ToolSessionPermission {
  return {
    kind: "plugin_output",
    description: summary,
    describeSideEffect: () => ({ kind: "plugin_data_write", summary, ruleId }),
  };
}

export function externalPermission(summary: string, ruleId: string): ToolSessionPermission {
  return {
    kind: "external_side_effect",
    auto: "review",
    description: summary,
    describeSideEffect: () => ({ kind: "agent", summary, ruleId }),
  };
}

export function toolResult(value: unknown, text?: string): { content: Array<{ type: "text"; text: string }>; details: unknown } {
  return { content: [{ type: "text", text: text ?? JSON.stringify(value) }], details: value };
}

export async function toolExecute(
  ctx: ToolContextLike,
  operation: (
    runtime: ReturnType<typeof getRuntime>,
    invocation: ReturnType<typeof invocationFromToolContext>,
  ) => unknown | Promise<unknown>,
): Promise<ReturnType<typeof toolResult> & { isError?: boolean }> {
  try {
    const runtime = getRuntime(ctx);
    const invocation = invocationFromToolContext(ctx);
    return toolResult(await operation(runtime, invocation));
  } catch (error) {
    const body = errorResponse(error);
    return { ...toolResult(body), isError: true };
  }
}

/** Normalize the public v0.1 tool aliases without leaking them into the domain. */
export function normalizeLegacyTodoInput(input: ToolInput): ToolInput {
  const priority = input.priority === "normal" ? "medium" : input.priority;
  const reminderAt = input.reminderAt;
  const reminderTrigger = input.reminderTrigger ?? (
    reminderAt
    && typeof reminderAt === "object"
    && (reminderAt as Record<string, unknown>).kind === "exact"
      ? { ...(reminderAt as Record<string, unknown>), enabled: true }
      : undefined
  );
  // v0.1 sometimes accepted a raw workspace path. Deliberately do not
  // translate that string into a persisted path: callers must provide the
  // opaque ResourceRef returned by the Hana resource picker.
  const workspaceRef = input.workspaceRef;
  return {
    ...input,
    description: input.description ?? input.notes,
    priority,
    reminderTrigger,
    workspaceRef,
  };
}

/** Stage an export through Hana SessionFile when available; retain only 20 local fallbacks. */
export async function stageJson(
  ctx: ToolContextLike,
  value: unknown,
  label = "hana-todolist-export.json",
): Promise<unknown> {
  const exportsDir = path.join(ctx.dataDir, "exports");
  fs.mkdirSync(exportsDir, { recursive: true, mode: 0o700 });
  const filePath = path.join(exportsDir, `${newId("export")}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

  const files = fs.readdirSync(exportsDir)
    .map((name) => ({
      name,
      path: path.join(exportsDir, name),
      mtime: fs.statSync(path.join(exportsDir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const stale of files.slice(20)) {
    try { fs.unlinkSync(stale.path); } catch { /* best effort */ }
  }

  if (typeof ctx.stageFile !== "function") {
    try { fs.unlinkSync(filePath); } catch { /* best effort */ }
    return {
      staged: false,
      fileName: label,
      mediaType: "application/json",
      document: value,
      note: "Hana SessionFile staging is unavailable; returning the JSON document inline without exposing a local path.",
    };
  }
  return Promise.resolve(ctx.stageFile({ filePath, label }));
}
