import { serializeJson } from "../../domain/library-schema.ts";
import { MigrationError } from "./errors.ts";
import { CURRENT_AUTHORITY_SCHEMA_VERSION } from "./models.ts";

const AUTHORITY_PATHS = [
  /^Dossiers\/manifest\.json$/,
  /^Dossiers\/types\/types\.json$/,
  /^Dossiers\/contacts\/contacts\.json$/,
  /^Dossiers\/dossiers\/[^/]+\/dossier\.json$/,
  /^Dossiers\/\.trash\/catalog\.json$/,
  /^Dossiers\/\.trash\/items\/[^/]+\/payload\/dossier\.json$/,
  /^Dossiers\/audit\/[^/]+\.json$/,
  /^Dossiers\/(model-access|suggestions)\.json$/,
] as const;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isAuthorityPath(path: string): boolean {
  return AUTHORITY_PATHS.some((pattern) => pattern.test(path));
}

export function collectAuthorityVersions(value: unknown, versions = new Set<number>()): Set<number> {
  if (Array.isArray(value)) {
    for (const item of value) collectAuthorityVersions(item, versions);
    return versions;
  }
  if (!record(value)) return versions;
  if (typeof value.kind === "string" && value.kind.startsWith("hana.dossiers.") && Number.isInteger(value.schemaVersion)) {
    versions.add(value.schemaVersion as number);
  }
  for (const child of Object.values(value)) collectAuthorityVersions(child, versions);
  return versions;
}

function migrateNode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(migrateNode);
  if (!record(value)) return value;
  const migrated = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, migrateNode(child)]));
  if (typeof migrated.kind === "string" && migrated.kind.startsWith("hana.dossiers.")) {
    if (!Number.isInteger(migrated.schemaVersion)) throw new MigrationError("integrity_failed", "An authority schema version is invalid");
    if ((migrated.schemaVersion as number) > CURRENT_AUTHORITY_SCHEMA_VERSION) throw new MigrationError("future_version", "A future authority schema cannot be downgraded");
    if ((migrated.schemaVersion as number) < 0) throw new MigrationError("integrity_failed", "An authority schema version is invalid");
    migrated.schemaVersion = CURRENT_AUTHORITY_SCHEMA_VERSION;
    if (!record(migrated.extensions)) migrated.extensions = {};
  }
  if (typeof migrated.contactId === "string" && typeof migrated.role === "string" && !record(migrated.extensions)) {
    migrated.extensions = {};
  }
  return migrated;
}

export function migrateAuthorityText(path: string, text: string): string {
  if (!isAuthorityPath(path)) throw new MigrationError("validation", "The migration target is not an authority file");
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new MigrationError("integrity_failed", "An authority file contains invalid JSON"); }
  if (!record(value) || typeof value.kind !== "string" || !value.kind.startsWith("hana.dossiers.")) {
    throw new MigrationError("integrity_failed", "An authority file has an invalid kind");
  }
  return serializeJson(migrateNode(value));
}
