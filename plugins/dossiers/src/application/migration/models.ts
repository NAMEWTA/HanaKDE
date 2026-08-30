export const MIGRATION_SCHEMA_VERSION = 1 as const;
export const CURRENT_AUTHORITY_SCHEMA_VERSION = 1 as const;

export type CompatibilityState = "ready" | "needs-migration" | "recoverable" | "future-version" | "blocked";
export type MigrationJournalState = "preflight" | "backing-up" | "backed-up" | "migrating" | "validating" | "ready" | "blocked" | "restoring" | "restored";

export interface CompatibilityReport {
  state: CompatibilityState;
  currentVersion: number | null;
  targetVersion: typeof CURRENT_AUTHORITY_SCHEMA_VERSION;
  writeAllowed: boolean;
  exportAllowed: boolean;
  reason?: string;
  migrationId?: string;
}

export interface MigrationPlan {
  previewId: string;
  confirmationToken: string;
  fromVersion: number;
  toVersion: typeof CURRENT_AUTHORITY_SCHEMA_VERSION;
  fileCount: number;
  authorityFileCount: number;
  totalBytes: number;
  requiredBackupBytes: number;
  inventorySha256: string;
}

export interface MigrationInventoryEntry {
  path: string;
  size: number;
  sha256: string;
}

export interface MigrationTarget {
  path: string;
  beforeSha256: string;
  afterSha256: string;
}

export interface MigrationJournal {
  kind: "hana.dossiers.migration";
  schemaVersion: typeof MIGRATION_SCHEMA_VERSION;
  migrationId: string;
  state: MigrationJournalState;
  fromVersion: number;
  toVersion: typeof CURRENT_AUTHORITY_SCHEMA_VERSION;
  inventorySha256: string;
  inventory: MigrationInventoryEntry[];
  targets: MigrationTarget[];
  completedTargets: string[];
  createdAt: string;
  updatedAt: string;
  errorCode?: string;
  extensions: Record<string, unknown>;
}

export interface MigrationResult {
  migrationId: string;
  state: "ready" | "restored" | "recoverable";
  migratedFiles: number;
  backupRetained: boolean;
  reindexRequired: boolean;
}
