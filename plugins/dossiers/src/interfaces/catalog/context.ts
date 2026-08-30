import type { HanaPluginResources } from "@hana/plugin-runtime";

import { CatalogApplication } from "../../application/catalog/catalog-application.ts";
import { CatalogError } from "../../application/catalog/errors.ts";
import { DossiersRuntime } from "../../runtime.ts";

export interface CatalogPluginContextLike {
  resources: HanaPluginResources;
}

const runtime = new DossiersRuntime();
const MOUNT_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

export function isWorkspaceMountId(value: unknown): value is string {
  return typeof value === "string" && MOUNT_ID.test(value);
}

export function catalogApplication(ctx: CatalogPluginContextLike, workspaceMountId: unknown): CatalogApplication {
  if (!isWorkspaceMountId(workspaceMountId)) {
    throw new CatalogError("validation", "A valid workspace mount selection is required", { field: "workspaceMountId" });
  }
  return new CatalogApplication({
    runtime,
    scope: {
      resources: ctx.resources,
      workspaceRoot: { kind: "mount", mountId: workspaceMountId, path: "" },
    },
  });
}
