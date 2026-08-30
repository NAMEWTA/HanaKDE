import type { HanaPluginResources } from "@hana/plugin-runtime";

import { DocumentApplication } from "../../application/documents/document-application.ts";
import { DocumentError } from "../../application/documents/errors.ts";
import { DossiersRuntime } from "../../runtime.ts";

export interface DocumentPluginContextLike {
  resources: HanaPluginResources;
}

const runtime = new DossiersRuntime();
const MOUNT_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

export function isWorkspaceMountId(value: unknown): value is string {
  return typeof value === "string" && MOUNT_ID.test(value);
}

export function documentApplication(ctx: DocumentPluginContextLike, workspaceMountId: unknown): DocumentApplication {
  if (!isWorkspaceMountId(workspaceMountId)) throw new DocumentError("validation", "A valid workspace mount selection is required", { field: "workspaceMountId" });
  return new DocumentApplication({
    runtime,
    scope: {
      resources: ctx.resources,
      workspaceRoot: { kind: "mount", mountId: workspaceMountId, path: "" },
    },
  });
}
