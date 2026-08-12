import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(process.cwd());

const retiredPaths = [
  "core/session-manifest/checkpoint.ts",
  "core/session-manifest/legacy-migration.ts",
  "core/session-manifest/startup-migration.ts",
  "lib/sandbox/win32-legacy-migration.ts",
  "scripts/session-manifest-audit.mjs",
  "scripts/session-manifest-rollback.mjs",
];

const scanRoots = [
  "core",
  "lib",
  "server",
  "scripts",
  "shared",
  "docs/index.md",
  "export-manifest.json",
  "package.json",
  "build/cli-runtime-closure.json",
  "build/persistence-schema-fingerprint.json",
  "build/persistence-startup-receipt.json",
  "build/persistence-store-inventory.json",
];

const prohibitedReferences = [
  "legacy-migration.ts",
  "startup-migration.ts",
  "win32-legacy-migration.ts",
  "session-manifest/checkpoint.ts",
  "session-manifest-audit",
  "session-manifest-rollback",
  "ensureLegacySessionManifestMigration",
  "_runSessionManifestStartupMigration",
  "listSkippedMetaSources",
  "Win32LegacySandboxCleanupQueue",
  "legacyCleanupQueue",
  "startWin32LegacySandboxMaintenance",
  "LEGACY_SESSION_MANIFEST_MIGRATION_KEY",
  "LEGACY_META_SCAN_LEDGER_KEY",
  "migrateLegacySessions",
  "auditLegacySessionManifests",
  "windows-sandbox-migration-state",
  "win32-sandbox-migration-v3.json",
  "win32-sandbox-cleanup-v4.json",
];

function listFiles(relativePath: string): string[] {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath)) return [];
  if (!fs.statSync(absolutePath).isDirectory()) return [relativePath];

  const files: string[] = [];
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

describe("legacy owner retirement", () => {
  it("removes the SessionManifest and Win32 migration production surfaces and receipts", () => {
    for (const retiredPath of retiredPaths) {
      expect(fs.existsSync(path.join(projectRoot, retiredPath)), retiredPath).toBe(false);
    }

    const hits: string[] = [];
    for (const file of scanRoots.flatMap(listFiles)) {
      const contents = fs.readFileSync(path.join(projectRoot, file), "utf8");
      for (const reference of prohibitedReferences) {
        if (contents.includes(reference)) hits.push(`${file}: ${reference}`);
      }
    }

    expect(hits).toEqual([]);
  });
});
