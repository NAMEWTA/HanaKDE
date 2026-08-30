import type {
  HanaPluginResources,
  HanaResourceRef,
  HanaResourceVersion,
  HanaResourceWriteExpectedVersionResult,
} from "@hana/plugin-runtime";

export type WorkspaceResources = Pick<
  HanaPluginResources,
  "stat" | "read" | "list" | "mkdir" | "write" | "writeExpectedVersion" | "delete"
>;

export type { HanaResourceRef, HanaResourceVersion, HanaResourceWriteExpectedVersionResult };
