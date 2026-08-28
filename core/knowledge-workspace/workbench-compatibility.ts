import type { ResourceRef } from "../../lib/resource-io/types.ts";

export type WorkbenchCompatibilityMain = {
  sourceKey: "main";
  displayName: string;
  role: "main";
  root: ResourceRef;
  sessionPath: string | null;
};

export type WorkbenchCompatibilitySelector = {
  directory?: string | null;
  mountId?: string | null;
  displayName?: string | null;
};

type WorkbenchCompatibilityEngine = {
  currentSessionPath?: string | null;
  getSessionWorkspaceMount?: (sessionPath: string) => {
    mountId?: string | null;
    label?: string | null;
  } | null;
  getSessionFolderScope?: (sessionPath: string) => {
    cwd?: string | null;
  } | null;
  defaultDeskCwd?: string | null;
  homeCwd?: string | null;
  deskCwd?: string | null;
};

/**
 * Resolve the active workspace root shared by Knowledge, Desk, and Workbench.
 * Agent selection is intentionally not an input: it may constrain
 * authorization, but it must never select a different logical main.
 */
export function resolveWorkbenchCompatibilityMain(
  engine: WorkbenchCompatibilityEngine,
  selector: WorkbenchCompatibilitySelector = {},
): WorkbenchCompatibilityMain {
  const selectedMountId = firstNonEmptyString(selector.mountId);
  const selectedDirectory = firstNonEmptyString(selector.directory);
  const selectedDisplayName = firstNonEmptyString(selector.displayName);
  if (selectedMountId) {
    return {
      sourceKey: "main",
      displayName: selectedDisplayName || "Main",
      role: "main",
      root: { kind: "mount", mountId: selectedMountId, path: "" },
      sessionPath: null,
    };
  }
  if (selectedDirectory) {
    return {
      sourceKey: "main",
      displayName: selectedDisplayName || "Main",
      role: "main",
      root: { kind: "local-file", path: selectedDirectory },
      sessionPath: null,
    };
  }
  const sessionPath = typeof engine?.currentSessionPath === "string"
    && engine.currentSessionPath
    ? engine.currentSessionPath
    : null;
  const sessionMount = sessionPath
    && typeof engine?.getSessionWorkspaceMount === "function"
    ? engine.getSessionWorkspaceMount(sessionPath)
    : null;
  const mountId = typeof sessionMount?.mountId === "string"
    && sessionMount.mountId.trim()
    ? sessionMount.mountId.trim()
    : null;
  if (mountId) {
    return {
      sourceKey: "main",
      displayName: typeof sessionMount?.label === "string"
        && sessionMount.label.trim()
        ? sessionMount.label.trim()
        : "Main",
      role: "main",
      root: { kind: "mount", mountId, path: "" },
      sessionPath,
    };
  }

  const sessionScope = sessionPath
    && typeof engine?.getSessionFolderScope === "function"
    ? engine.getSessionFolderScope(sessionPath)
    : null;
  const rootPath = firstNonEmptyString(
    sessionScope?.cwd,
    engine?.defaultDeskCwd,
    engine?.homeCwd,
    engine?.deskCwd,
  );
  return {
    sourceKey: "main",
    displayName: "Main",
    role: "main",
    root: { kind: "local-file", path: rootPath || "" },
    sessionPath,
  };
}

export function workbenchCompatibilityServiceOptions(
  engine: WorkbenchCompatibilityEngine,
): {
  defaultRoot: string | null;
  defaultRootRef: ResourceRef;
} {
  const main = resolveWorkbenchCompatibilityMain(engine);
  return {
    defaultRoot: main.root.kind === "local-file"
      ? main.root.path
      : firstNonEmptyString(
        engine?.defaultDeskCwd,
        engine?.homeCwd,
        engine?.deskCwd,
      ),
    defaultRootRef: main.root,
  };
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}
