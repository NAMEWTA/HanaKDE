export const MAIN_WORKSPACE_SOURCE_KEY = "main" as const;

export const WORKSPACE_HEALTH_STATES = [
  "HEALTHY",
  "DEGRADED",
  "RECONCILING",
  "FAILED",
] as const;

export type WorkspaceHealth = (typeof WORKSPACE_HEALTH_STATES)[number];

export type WorkspaceHealthReason =
  | "initializing"
  | "watch-error"
  | "event-gap"
  | "baseline-failed"
  | "root-unavailable"
  | "root-replaced"
  | "retry";

export type WorkspaceSnapshot = Readonly<{
  sourceKey: typeof MAIN_WORKSPACE_SOURCE_KEY;
  health: WorkspaceHealth;
  cursor: number;
  repairCycle: number;
  consumerCount: number;
  observing: boolean;
}>;

export type WorkspaceBaselineObservation = Readonly<{
  type: "workspace.baseline";
  sourceKey: typeof MAIN_WORKSPACE_SOURCE_KEY;
  relativePath: string;
  entryKind: "file" | "directory";
  cursor: number;
  repairCycle: number;
}>;

export type WorkspaceChangeObservation = Readonly<{
  type: "workspace.changed";
  sourceKey: typeof MAIN_WORKSPACE_SOURCE_KEY;
  relativePath: string;
  changeType: "created" | "modified" | "deleted";
  cursor: number;
  repairCycle: number;
}>;

export type WorkspaceHealthObservation = Readonly<{
  type: "workspace.health";
  sourceKey: typeof MAIN_WORKSPACE_SOURCE_KEY;
  health: WorkspaceHealth;
  reason: WorkspaceHealthReason;
  cursor: number;
  repairCycle: number;
}>;

export type WorkspaceObservation =
  | WorkspaceBaselineObservation
  | WorkspaceChangeObservation
  | WorkspaceHealthObservation;

// T-12 consumes this proof-only handoff. It intentionally names no active
// production owner, so importing it cannot perform a cutover.
export const MAIN_WORKSPACE_CUTOVER_DESCRIPTOR = Object.freeze({
  schemaVersion: 1,
  phase: "isolated-proof",
  sourceKey: MAIN_WORKSPACE_SOURCE_KEY,
  requiredOrder: Object.freeze([
    "stop-old-owner",
    "prove-old-owner-released",
    "start-new-owner",
  ]),
  invariants: Object.freeze([
    "physical-watchers<=1",
    "baseline-walks<=1-per-repair-cycle",
    "no-dual-run",
  ]),
  handoff: Object.freeze({
    legacyOwner: "desktop/workspace-watch-registry.cjs",
    candidateOwner: "core/workspace-runtime/WorkspaceWatchCoordinator",
    releaseEvidence: Object.freeze([
      "legacy-physical-watcher-count=0",
      "legacy-baseline-owner-released",
    ]),
    startupEvidence: Object.freeze([
      "new-physical-watcher-count<=1",
      "new-baseline-walk-count=1",
    ]),
  }),
  productionOwner: null,
  cutoverTicket: "T-12",
});
