import type { HanaPluginResources } from "@hana/plugin-runtime";

import { MigrationApplication } from "../../../application/migration/migration-application.ts";
import { MigrationError } from "../../../application/migration/errors.ts";

export interface MigrationPluginContextLike { resources: HanaPluginResources }

const MOUNT_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

export function migrationApplication(ctx: MigrationPluginContextLike, workspaceMountId: unknown): MigrationApplication {
  if (typeof workspaceMountId !== "string" || !MOUNT_ID.test(workspaceMountId)) {
    throw new MigrationError("validation", "A valid workspace mount selection is required", { field: "workspaceMountId" });
  }
  return new MigrationApplication({ resources: ctx.resources, workspaceRoot: { kind: "mount", mountId: workspaceMountId, path: "" } });
}
