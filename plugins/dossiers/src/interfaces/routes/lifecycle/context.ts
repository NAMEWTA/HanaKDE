import type { HanaPluginResources } from "@hana/plugin-runtime";

import { LifecycleApplication } from "../../../application/lifecycle/lifecycle-application.ts";
import { LifecycleError } from "../../../application/lifecycle/errors.ts";
import type { LifecycleInvocation } from "../../../application/lifecycle/models.ts";
import { DossiersRuntime } from "../../../runtime.ts";

export interface LifecyclePluginContextLike {
  resources: HanaPluginResources;
  userId?: string;
  sessionId?: string | null;
  sessionRef?: { sessionId?: string | null } | null;
  principal?: { userId?: string; id?: string };
}

const runtime = new DossiersRuntime();
const MOUNT_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

export function isWorkspaceMountId(value: unknown): value is string { return typeof value === "string" && MOUNT_ID.test(value); }

export function lifecycleApplication(ctx: LifecyclePluginContextLike, workspaceMountId: unknown): LifecycleApplication {
  if (!isWorkspaceMountId(workspaceMountId)) throw new LifecycleError("validation", "A valid workspace mount selection is required", { field: "workspaceMountId" });
  return new LifecycleApplication({ runtime, scope: { resources: ctx.resources, workspaceRoot: { kind: "mount", mountId: workspaceMountId, path: "" } } });
}

export function lifecycleInvocation(ctx: LifecyclePluginContextLike, source: LifecycleInvocation["source"]): LifecycleInvocation {
  const actorId = ctx.userId ?? ctx.principal?.userId ?? ctx.principal?.id;
  const sessionId = ctx.sessionId ?? ctx.sessionRef?.sessionId;
  if (typeof actorId !== "string" || !actorId.trim() || typeof sessionId !== "string" || !sessionId.trim()) {
    throw new LifecycleError("validation", "A host-owned actor and session identity are required");
  }
  return { actorId: actorId.trim(), sessionId: sessionId.trim(), source };
}
