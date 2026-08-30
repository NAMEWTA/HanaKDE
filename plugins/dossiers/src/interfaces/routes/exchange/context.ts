import type { HanaPluginResources, HanaResourceRef } from "@hana/plugin-runtime";

import { ExchangeApplication } from "../../../application/exchange/exchange-application.ts";
import { ExchangeError } from "../../../application/exchange/errors.ts";
import { DossiersRuntime } from "../../../runtime.ts";

export interface ExchangePluginContextLike {
  resources: HanaPluginResources;
}

const runtime = new DossiersRuntime();
const MOUNT_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

export function isWorkspaceMountId(value: unknown): value is string { return typeof value === "string" && MOUNT_ID.test(value); }

export function exchangeApplication(ctx: ExchangePluginContextLike, workspaceMountId: unknown): ExchangeApplication {
  if (!isWorkspaceMountId(workspaceMountId)) throw new ExchangeError("validation", "A valid workspace mount selection is required", { field: "workspaceMountId" });
  return new ExchangeApplication({ runtime, scope: { resources: ctx.resources, workspaceRoot: { kind: "mount", mountId: workspaceMountId, path: "" } } });
}

export function exchangeResourceRef(value: unknown): Extract<HanaResourceRef, { kind: "mount" | "local-file" }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ExchangeError("validation", "A controlled archive ResourceRef is required", { field: "archiveRef" });
  const ref = value as Record<string, unknown>;
  if (ref.kind === "mount" && typeof ref.mountId === "string" && typeof ref.path === "string") return { kind: "mount", mountId: ref.mountId, path: ref.path };
  if (ref.kind === "local-file" && typeof ref.path === "string") return { kind: "local-file", path: ref.path };
  throw new ExchangeError("validation", "A controlled archive ResourceRef is required", { field: "archiveRef" });
}
