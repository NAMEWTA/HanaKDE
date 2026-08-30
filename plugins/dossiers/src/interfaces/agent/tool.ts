import type { HanaPluginResources } from "@hana/plugin-runtime";

import { AgentApplication } from "../../application/agent/agent-application.ts";
import { AgentError, agentErrorBody } from "../../application/agent/errors.ts";
import type { AgentInvocation } from "../../application/agent/models.ts";
import { DossiersRuntime } from "../../runtime.ts";

export type ToolInput = Record<string, unknown>;
export interface ToolContextLike {
  resources: HanaPluginResources;
  userId?: string;
  sessionId?: string | null;
  sessionRef?: { sessionId?: string | null } | null;
  principal?: { userId?: string; id?: string };
  [key: string]: unknown;
}

export interface ToolSessionPermission {
  readOnly?: boolean;
  kind?: string;
  auto?: "allow" | "review";
  description?: string;
  describeSideEffect?: (input: ToolInput) => Record<string, unknown> | null;
  resolveInvocation?: (input: ToolInput) => Record<string, unknown> | null;
}

const runtime = new DossiersRuntime();
const MOUNT_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

export const readOnlyPermission: ToolSessionPermission = { readOnly: true, kind: "read_only" };

export function reviewerBoundPermission(action: string, summary: string, targetType: string): ToolSessionPermission {
  return {
    kind: "workspace_write",
    auto: "review",
    description: summary,
    describeSideEffect(input) {
      return isWorkspaceMountId(input.workspaceMountId) ? { kind: "workspace_write", workspaceMountId: input.workspaceMountId, summary } : null;
    },
    resolveInvocation(input) {
      if (!isWorkspaceMountId(input.workspaceMountId)) return null;
      const targetId = typeof input.dossierId === "string" ? input.dossierId : typeof input.suggestionId === "string" ? input.suggestionId : typeof input.targetId === "string" ? input.targetId : "global";
      if (!targetId || targetId.length > 160) return null;
      return { action, kind: "review", capability: `dossiers.${action}`, target: { type: targetType, id: targetId }, sideEffect: { workspaceMountId: input.workspaceMountId, summary } };
    },
  };
}

export function isWorkspaceMountId(value: unknown): value is string { return typeof value === "string" && MOUNT_ID.test(value); }

function application(input: ToolInput, ctx: ToolContextLike): AgentApplication {
  if (!isWorkspaceMountId(input.workspaceMountId)) throw new AgentError("validation", "A valid workspace mount selection is required", { field: "workspaceMountId" });
  return new AgentApplication({ runtime, scope: { resources: ctx.resources, workspaceRoot: { kind: "mount", mountId: input.workspaceMountId, path: "" } } });
}

export function toolInvocation(ctx: ToolContextLike): AgentInvocation {
  const actorId = ctx.userId ?? ctx.principal?.userId ?? ctx.principal?.id;
  const sessionId = ctx.sessionId ?? ctx.sessionRef?.sessionId;
  if (typeof actorId !== "string" || !actorId.trim() || typeof sessionId !== "string" || !sessionId.trim()) {
    throw new AgentError("invocation_required", "A host-owned actor and session identity are required");
  }
  return { actorId: actorId.trim(), sessionId: sessionId.trim(), source: "agent-tool" };
}

function result(value: unknown): { content: Array<{ type: "text"; text: string }>; details: unknown } { return { content: [{ type: "text", text: JSON.stringify(value) }], details: value }; }

export async function toolExecute(input: ToolInput, ctx: ToolContextLike, operation: (app: AgentApplication) => unknown | Promise<unknown>): Promise<ReturnType<typeof result> & { isError?: boolean }> {
  try { return result(await operation(application(input, ctx))); }
  catch (error) { return { ...result(agentErrorBody(error)), isError: true as const }; }
}

export function revision(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new AgentError("validation", "A positive expected revision is required", { field: "expectedRevision" });
  return value as number;
}
