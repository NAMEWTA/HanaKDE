import { randomBytes, randomUUID } from "node:crypto";

import { LIBRARY_KIND, serializeJson } from "../../domain/library-schema.ts";
import { appendResourcePath, normalizeRelativePath, type WorkspaceTreeRef } from "../../infrastructure/workspace/resource-path.ts";
import type { WorkspaceResources } from "../../infrastructure/workspace/resource-port.ts";
import { openWorkspaceLibrary } from "../../infrastructure/workspace/workspace-library.ts";
import {
  ensureDirectoryPath,
  inventoryWorkspace,
  listWorkspaceFiles,
  sha256,
  writeVerifiedCopy,
  type InventoryEntry,
} from "../../infrastructure/migration/workspace-inventory.ts";
import { MigrationError } from "./errors.ts";
import {
  CURRENT_AUTHORITY_SCHEMA_VERSION,
  MIGRATION_SCHEMA_VERSION,
  type CompatibilityReport,
  type MigrationJournal,
  type MigrationJournalState,
  type MigrationPlan,
  type MigrationResult,
  type MigrationTarget,
} from "./models.ts";
import { collectAuthorityVersions, isAuthorityPath, migrateAuthorityText } from "./schema-migration.ts";

const ACTIVE_JOURNAL_PATH = "Dossiers/.system/migrations/active.json";
const MIGRATION_ROOT = "Dossiers/.system/migrations";
const TERMINAL_STATES = new Set<MigrationJournalState>(["ready", "restored"]);
const JOURNAL_STATES = new Set<MigrationJournalState>(["preflight", "backing-up", "backed-up", "migrating", "validating", "ready", "blocked", "restoring", "restored"]);
const TAILS = new Map<string, Promise<void>>();

interface StoredPlan {
  workspaceKey: string;
  previewId: string;
  confirmationToken: string;
  fromVersion: number;
  inventorySha256: string;
  files: InventoryEntry[];
  targets: MigrationTarget[];
}
const PLANS = new Map<string, StoredPlan>();

export interface MigrationApplicationInput {
  resources: WorkspaceResources;
  workspaceRoot: WorkspaceTreeRef;
  now?: () => string;
  createMigrationId?: () => string;
  createPreviewId?: () => string;
  createConfirmationToken?: () => string;
  createLibraryId?: () => string;
  maxFiles?: number;
  maxBytes?: number;
}

function workspaceKey(root: WorkspaceTreeRef): string {
  return root.kind === "mount" ? `mount:${root.mountId}:${root.path}` : `local:${root.path}`;
}

function backupPath(migrationId: string, authorityPath: string): string {
  return `${MIGRATION_ROOT}/${migrationId}/backup/${authorityPath.slice("Dossiers/".length)}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isNormalizedJournalPath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { return normalizeRelativePath(value) === value; } catch { return false; }
}

function parseJournal(text: string): MigrationJournal {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new MigrationError("integrity_failed", "The migration journal is invalid"); }
  const journal = asRecord(value);
  if (!journal || journal.kind !== "hana.dossiers.migration" || journal.schemaVersion !== MIGRATION_SCHEMA_VERSION
    || typeof journal.migrationId !== "string" || !/^mig_[a-z0-9]{8,64}$/i.test(journal.migrationId)
    || !JOURNAL_STATES.has(journal.state as MigrationJournalState)
    || !Number.isInteger(journal.fromVersion) || journal.toVersion !== CURRENT_AUTHORITY_SCHEMA_VERSION
    || typeof journal.inventorySha256 !== "string" || !Array.isArray(journal.inventory) || !Array.isArray(journal.targets)
    || !Array.isArray(journal.completedTargets) || typeof journal.createdAt !== "string" || typeof journal.updatedAt !== "string"
    || !asRecord(journal.extensions)) {
    throw new MigrationError("integrity_failed", "The migration journal is invalid");
  }
  const inventoryPaths = new Set<string>();
  for (const item of journal.inventory) {
    const entry = asRecord(item);
    if (!entry || !isNormalizedJournalPath(entry.path) || !entry.path.startsWith("Dossiers/")
      || entry.path === MIGRATION_ROOT || entry.path.startsWith(`${MIGRATION_ROOT}/`) || inventoryPaths.has(entry.path)
      || !Number.isInteger(entry.size) || (entry.size as number) < 0 || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new MigrationError("integrity_failed", "The migration journal inventory is invalid");
    }
    inventoryPaths.add(entry.path);
  }
  if (inventoryFingerprint(journal.inventory as Array<{ path: string; size: number; sha256: string }>) !== journal.inventorySha256) {
    throw new MigrationError("integrity_failed", "The migration journal fingerprint is invalid");
  }
  const targetPaths = new Set<string>();
  for (const item of journal.targets) {
    const target = asRecord(item);
    if (!target || typeof target.path !== "string" || !isAuthorityPath(target.path) || targetPaths.has(target.path) || !inventoryPaths.has(target.path)
      || typeof target.beforeSha256 !== "string" || !/^[a-f0-9]{64}$/.test(target.beforeSha256)
      || typeof target.afterSha256 !== "string" || !/^[a-f0-9]{64}$/.test(target.afterSha256) || target.beforeSha256 === target.afterSha256) {
      throw new MigrationError("integrity_failed", "The migration journal targets are invalid");
    }
    const inventoryEntry = (journal.inventory as Array<Record<string, unknown>>).find((entry) => entry.path === target.path);
    if (inventoryEntry?.sha256 !== target.beforeSha256) throw new MigrationError("integrity_failed", "The migration target does not match its inventory entry");
    targetPaths.add(target.path);
  }
  if ((journal.completedTargets as unknown[]).some((path) => typeof path !== "string" || !targetPaths.has(path))
    || new Set(journal.completedTargets as string[]).size !== journal.completedTargets.length) {
    throw new MigrationError("integrity_failed", "The completed migration targets are invalid");
  }
  return structuredClone(journal) as unknown as MigrationJournal;
}

function inventoryFingerprint(files: Array<{ path: string; size: number; sha256: string }>): string {
  return sha256(serializeJson(files.map(({ path, size, sha256: digest }) => ({ path, size, sha256: digest }))));
}

async function withWorkspaceLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = TAILS.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  TAILS.set(key, tail);
  await previous;
  try { return await operation(); }
  finally {
    release();
    if (TAILS.get(key) === tail) TAILS.delete(key);
  }
}

export class MigrationApplication {
  readonly #resources: WorkspaceResources;
  readonly #workspaceRoot: WorkspaceTreeRef;
  readonly #workspaceKey: string;
  readonly #now: () => string;
  readonly #createMigrationId: () => string;
  readonly #createPreviewId: () => string;
  readonly #createConfirmationToken: () => string;
  readonly #createLibraryId?: () => string;
  readonly #maxFiles: number;
  readonly #maxBytes: number;

  constructor(input: MigrationApplicationInput) {
    this.#resources = input.resources;
    this.#workspaceRoot = input.workspaceRoot;
    this.#workspaceKey = workspaceKey(input.workspaceRoot);
    this.#now = input.now ?? (() => new Date().toISOString());
    this.#createMigrationId = input.createMigrationId ?? (() => `mig_${randomUUID().replaceAll("-", "")}`);
    this.#createPreviewId = input.createPreviewId ?? (() => `mpr_${randomUUID().replaceAll("-", "")}`);
    this.#createConfirmationToken = input.createConfirmationToken ?? (() => randomBytes(24).toString("hex"));
    this.#createLibraryId = input.createLibraryId;
    this.#maxFiles = input.maxFiles ?? 50_000;
    this.#maxBytes = input.maxBytes ?? 20 * 1024 * 1024 * 1024;
  }

  #ref(path: string): WorkspaceTreeRef { return appendResourcePath(this.#workspaceRoot, path); }

  async #readText(path: string): Promise<string> {
    return new TextDecoder().decode((await this.#resources.read(this.#ref(path))).content);
  }

  async #activeJournal(): Promise<MigrationJournal | null> {
    const stat = await this.#resources.stat(this.#ref(ACTIVE_JOURNAL_PATH));
    if (!stat.exists) return null;
    if (stat.isDirectory) throw new MigrationError("integrity_failed", "The migration journal path is invalid");
    return parseJournal(await this.#readText(ACTIVE_JOURNAL_PATH));
  }

  async #writeJournal(journal: MigrationJournal): Promise<void> {
    await ensureDirectoryPath(this.#resources, this.#workspaceRoot, MIGRATION_ROOT);
    journal.updatedAt = this.#now();
    await this.#resources.write(this.#ref(ACTIVE_JOURNAL_PATH), serializeJson(journal));
    const historyPath = `${MIGRATION_ROOT}/${journal.migrationId}/journal.json`;
    await ensureDirectoryPath(this.#resources, this.#workspaceRoot, historyPath.slice(0, historyPath.lastIndexOf("/")));
    await this.#resources.write(this.#ref(historyPath), serializeJson(journal));
  }

  async detect(): Promise<CompatibilityReport> {
    try {
      const rootStat = await this.#resources.stat(this.#ref("Dossiers"));
      if (!rootStat.exists) {
        const initialized = await openWorkspaceLibrary({ resources: this.#resources, workspaceRoot: this.#workspaceRoot, createId: this.#createLibraryId });
        return initialized.state === "ready"
          ? { state: "ready", currentVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, targetVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, writeAllowed: true, exportAllowed: true }
          : { state: "blocked", currentVersion: null, targetVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, writeAllowed: false, exportAllowed: false, reason: initialized.reason ?? "initialization-failed" };
      }
      if (!rootStat.isDirectory) return { state: "blocked", currentVersion: null, targetVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, writeAllowed: false, exportAllowed: false, reason: "root-not-directory" };
      const rootItems = await this.#resources.list(this.#ref("Dossiers"));
      if (rootItems.items.length === 0) {
        const initialized = await openWorkspaceLibrary({ resources: this.#resources, workspaceRoot: this.#workspaceRoot, createId: this.#createLibraryId });
        return initialized.state === "ready"
          ? { state: "ready", currentVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, targetVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, writeAllowed: true, exportAllowed: true }
          : { state: "blocked", currentVersion: null, targetVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, writeAllowed: false, exportAllowed: false, reason: initialized.reason ?? "initialization-failed" };
      }

      const manifestStat = await this.#resources.stat(this.#ref("Dossiers/manifest.json"));
      if (!manifestStat.exists || manifestStat.isDirectory) return { state: "blocked", currentVersion: null, targetVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, writeAllowed: false, exportAllowed: false, reason: "manifest-missing" };
      let manifestValue: unknown;
      try { manifestValue = JSON.parse(await this.#readText("Dossiers/manifest.json")); }
      catch { return { state: "blocked", currentVersion: null, targetVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, writeAllowed: false, exportAllowed: false, reason: "invalid-manifest" }; }
      const manifest = asRecord(manifestValue);
      if (!manifest || manifest.kind !== LIBRARY_KIND || !Number.isInteger(manifest.schemaVersion)) {
        return { state: "blocked", currentVersion: null, targetVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, writeAllowed: false, exportAllowed: false, reason: "invalid-manifest" };
      }
      const rootVersion = manifest.schemaVersion as number;
      if (rootVersion > CURRENT_AUTHORITY_SCHEMA_VERSION) return { state: "future-version", currentVersion: rootVersion, targetVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, writeAllowed: false, exportAllowed: true, reason: "unsupported-future-schema" };
      if (rootVersion < 0) return { state: "blocked", currentVersion: rootVersion, targetVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, writeAllowed: false, exportAllowed: false, reason: "invalid-schema" };

      const active = await this.#activeJournal();
      if (active && !TERMINAL_STATES.has(active.state)) {
        if (rootVersion !== active.fromVersion && rootVersion !== active.toVersion) {
          return { state: "blocked", currentVersion: rootVersion, targetVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, writeAllowed: false, exportAllowed: false, reason: "migration-journal-version-mismatch" };
        }
        return { state: "recoverable", currentVersion: active.fromVersion, targetVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, writeAllowed: false, exportAllowed: true, migrationId: active.migrationId, reason: active.errorCode ?? "migration-incomplete" };
      }

      const paths = await listWorkspaceFiles({ resources: this.#resources, workspaceRoot: this.#workspaceRoot, excludePrefix: MIGRATION_ROOT });
      const versions = new Set<number>([rootVersion]);
      for (const file of paths.filter((item) => isAuthorityPath(item.path))) {
        let value: unknown;
        try { value = JSON.parse(await this.#readText(file.path)); }
        catch { return { state: "blocked", currentVersion: rootVersion, targetVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, writeAllowed: false, exportAllowed: false, reason: "invalid-authority-json" }; }
        const found = collectAuthorityVersions(value);
        if (found.size === 0) return { state: "blocked", currentVersion: rootVersion, targetVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, writeAllowed: false, exportAllowed: false, reason: "invalid-authority-schema" };
        for (const version of found) versions.add(version);
      }
      if ([...versions].some((version) => version > CURRENT_AUTHORITY_SCHEMA_VERSION)) {
        return { state: "future-version", currentVersion: Math.max(...versions), targetVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, writeAllowed: false, exportAllowed: true, reason: "unsupported-future-schema" };
      }
      if (versions.size > 1) return { state: "blocked", currentVersion: rootVersion, targetVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, writeAllowed: false, exportAllowed: true, reason: "mixed-schema-without-recovery-journal" };
      if (rootVersion < CURRENT_AUTHORITY_SCHEMA_VERSION) return { state: "needs-migration", currentVersion: rootVersion, targetVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, writeAllowed: false, exportAllowed: true, reason: "older-schema" };
      return { state: "ready", currentVersion: rootVersion, targetVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, writeAllowed: true, exportAllowed: true };
    } catch (error) {
      if (error instanceof MigrationError) throw error;
      return { state: "blocked", currentVersion: null, targetVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, writeAllowed: false, exportAllowed: false, reason: "resource-access-failed" };
    }
  }

  async plan(): Promise<MigrationPlan> {
    const report = await this.detect();
    if (report.state === "future-version") throw new MigrationError("future_version", "A future library schema cannot be migrated");
    if (report.state === "recoverable") throw new MigrationError("recovery_required", "An incomplete migration must be recovered first", { migrationId: report.migrationId ?? null });
    if (report.state !== "needs-migration" || report.currentVersion === null) throw new MigrationError(report.state === "ready" ? "not_required" : "incompatible_library", "The library cannot be planned for migration");
    let files: InventoryEntry[];
    try {
      files = await inventoryWorkspace({ resources: this.#resources, workspaceRoot: this.#workspaceRoot, excludePrefix: MIGRATION_ROOT, maxFiles: this.#maxFiles, maxBytes: this.#maxBytes });
    } catch {
      throw new MigrationError("resource_operation_failed", "The migration inventory could not be created");
    }
    const targets: MigrationTarget[] = [];
    for (const file of files.filter((item) => isAuthorityPath(item.path))) {
      const original = new Uint8Array((await this.#resources.read(this.#ref(file.path))).content);
      if (sha256(original) !== file.sha256) throw new MigrationError("integrity_failed", "An authority file changed while planning migration", { target: file.path });
      const migrated = new TextEncoder().encode(migrateAuthorityText(file.path, new TextDecoder().decode(original)));
      const afterSha256 = sha256(migrated);
      if (afterSha256 !== file.sha256) targets.push({ path: file.path, beforeSha256: file.sha256, afterSha256 });
    }
    targets.sort((left, right) => left.path === "Dossiers/manifest.json" ? -1 : right.path === "Dossiers/manifest.json" ? 1 : left.path.localeCompare(right.path));
    if (targets.length === 0) throw new MigrationError("integrity_failed", "The old library has no migratable authority files");
    const previewId = this.#createPreviewId();
    const confirmationToken = this.#createConfirmationToken();
    const fingerprint = inventoryFingerprint(files);
    for (const [id, stored] of PLANS) {
      if (stored.workspaceKey === this.#workspaceKey) PLANS.delete(id);
    }
    PLANS.set(previewId, { workspaceKey: this.#workspaceKey, previewId, confirmationToken, fromVersion: report.currentVersion, inventorySha256: fingerprint, files, targets });
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    return { previewId, confirmationToken, fromVersion: report.currentVersion, toVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, fileCount: files.length, authorityFileCount: targets.length, totalBytes, requiredBackupBytes: totalBytes, inventorySha256: fingerprint };
  }

  async #writeTarget(target: MigrationTarget, content: Uint8Array): Promise<void> {
    const ref = this.#ref(target.path);
    const loaded = await this.#resources.read(ref);
    const currentSha = sha256(new Uint8Array(loaded.content));
    if (currentSha === target.afterSha256) return;
    if (currentSha !== target.beforeSha256 || !loaded.version) throw new MigrationError("integrity_failed", "An authority file changed after migration planning", { target: target.path });
    const written = await this.#resources.writeExpectedVersion(ref, content, loaded.version);
    if ("conflict" in written && written.conflict) throw new MigrationError("integrity_failed", "An authority file changed during migration", { target: target.path });
    const verified = new Uint8Array((await this.#resources.read(ref)).content);
    if (sha256(verified) !== target.afterSha256) throw new MigrationError("integrity_failed", "A migrated authority file failed verification", { target: target.path });
  }

  async #verifyInventory(journal: MigrationJournal, mode: "before" | "after"): Promise<void> {
    const targets = new Map(journal.targets.map((target) => [target.path, target]));
    for (const item of journal.inventory) {
      const target = targets.get(item.path);
      const expected = mode === "after" && target ? target.afterSha256 : item.sha256;
      const loaded = new Uint8Array((await this.#resources.read(this.#ref(item.path))).content);
      if (sha256(loaded) !== expected) throw new MigrationError("integrity_failed", "The library inventory failed verification", { target: item.path });
    }
  }

  async #ensureBackups(journal: MigrationJournal): Promise<void> {
    for (const item of journal.inventory) {
      const path = backupPath(journal.migrationId, item.path);
      const backupStat = await this.#resources.stat(this.#ref(path));
      if (backupStat.exists && !backupStat.isDirectory) {
        const backup = new Uint8Array((await this.#resources.read(this.#ref(path))).content);
        if (sha256(backup) !== item.sha256) throw new MigrationError("integrity_failed", "A migration backup failed verification", { target: item.path });
        continue;
      }
      const content = new Uint8Array((await this.#resources.read(this.#ref(item.path))).content);
      if (sha256(content) !== item.sha256) throw new MigrationError("integrity_failed", "The original file changed before backup completed", { target: item.path });
      await writeVerifiedCopy({ resources: this.#resources, workspaceRoot: this.#workspaceRoot, path, content, expectedSha256: item.sha256 });
    }
  }

  async #complete(journal: MigrationJournal): Promise<MigrationResult> {
    journal.state = "validating";
    await this.#writeJournal(journal);
    await this.#verifyInventory(journal, "after");
    journal.state = "ready";
    delete journal.errorCode;
    await this.#writeJournal(journal);
    return { migrationId: journal.migrationId, state: "ready", migratedFiles: journal.targets.length, backupRetained: true, reindexRequired: true };
  }

  async execute(previewId: string, confirmationToken: string): Promise<MigrationResult> {
    return withWorkspaceLock(this.#workspaceKey, async () => {
      const plan = PLANS.get(previewId);
      if (!plan || plan.workspaceKey !== this.#workspaceKey) throw new MigrationError("plan_expired", "The migration plan is unavailable");
      if (!confirmationToken || confirmationToken !== plan.confirmationToken) throw new MigrationError("confirmation_required", "Migration requires the current confirmation token");
      const active = await this.#activeJournal();
      if (active && !TERMINAL_STATES.has(active.state)) throw new MigrationError("recovery_required", "An incomplete migration must be recovered first", { migrationId: active.migrationId });
      const current = await inventoryWorkspace({ resources: this.#resources, workspaceRoot: this.#workspaceRoot, excludePrefix: MIGRATION_ROOT, maxFiles: this.#maxFiles, maxBytes: this.#maxBytes });
      if (inventoryFingerprint(current) !== plan.inventorySha256) throw new MigrationError("integrity_failed", "The library changed after migration planning");
      const now = this.#now();
      const migrationId = this.#createMigrationId();
      if (!/^mig_[a-z0-9]{8,64}$/i.test(migrationId)) throw new MigrationError("resource_operation_failed", "A migration identity could not be allocated");
      const journal: MigrationJournal = {
        kind: "hana.dossiers.migration", schemaVersion: MIGRATION_SCHEMA_VERSION, migrationId, state: "preflight",
        fromVersion: plan.fromVersion, toVersion: CURRENT_AUTHORITY_SCHEMA_VERSION, inventorySha256: plan.inventorySha256,
        inventory: plan.files.map(({ path, size, sha256: digest }) => ({ path, size, sha256: digest })),
        targets: plan.targets.map(({ path, beforeSha256, afterSha256 }) => ({ path, beforeSha256, afterSha256 })),
        completedTargets: [], createdAt: now, updatedAt: now, extensions: {},
      };
      try {
        await this.#writeJournal(journal);
        journal.state = "backing-up";
        await this.#writeJournal(journal);
        await this.#ensureBackups(journal);
        journal.state = "backed-up";
        await this.#writeJournal(journal);
        journal.state = "migrating";
        await this.#writeJournal(journal);
        for (const target of plan.targets) {
          const original = new TextDecoder().decode((await this.#resources.read(this.#ref(target.path))).content);
          const migrated = new TextEncoder().encode(migrateAuthorityText(target.path, original));
          if (sha256(migrated) !== target.afterSha256) throw new MigrationError("integrity_failed", "The migration registry changed after planning", { target: target.path });
          await this.#writeTarget(target, migrated);
          if (!journal.completedTargets.includes(target.path)) journal.completedTargets.push(target.path);
          await this.#writeJournal(journal);
        }
        const result = await this.#complete(journal);
        PLANS.delete(previewId);
        return result;
      } catch (error) {
        journal.state = "blocked";
        journal.errorCode = error instanceof MigrationError ? error.code : "resource-operation-failed";
        try { await this.#writeJournal(journal); } catch { /* The last durable state remains recoverable. */ }
        if (error instanceof MigrationError) throw error;
        throw new MigrationError("resource_operation_failed", "Migration stopped and requires recovery", { migrationId: journal.migrationId });
      }
    });
  }

  async recover(action: unknown): Promise<MigrationResult> {
    if (action !== "continue" && action !== "restore") throw new MigrationError("validation", "A valid recovery action is required");
    return withWorkspaceLock(this.#workspaceKey, async () => {
      const journal = await this.#activeJournal();
      if (!journal || TERMINAL_STATES.has(journal.state)) throw new MigrationError("not_required", "No incomplete migration requires recovery");
      let manifestValue: unknown;
      try { manifestValue = JSON.parse(await this.#readText("Dossiers/manifest.json")); }
      catch { throw new MigrationError("incompatible_library", "The workspace root does not match the recovery journal"); }
      const manifest = asRecord(manifestValue);
      if (!manifest || manifest.kind !== LIBRARY_KIND || (manifest.schemaVersion !== journal.fromVersion && manifest.schemaVersion !== journal.toVersion)) {
        throw new MigrationError("incompatible_library", "The workspace root does not match the recovery journal");
      }
      try {
        await this.#ensureBackups(journal);
        if (action === "restore") {
          journal.state = "restoring";
          await this.#writeJournal(journal);
          const targets = new Map(journal.targets.map((target) => [target.path, target]));
          for (const item of journal.inventory) {
            const backup = new Uint8Array((await this.#resources.read(this.#ref(backupPath(journal.migrationId, item.path)))).content);
            if (sha256(backup) !== item.sha256) throw new MigrationError("integrity_failed", "A migration backup failed verification", { target: item.path });
            const current = await this.#resources.read(this.#ref(item.path));
            const currentSha = sha256(new Uint8Array(current.content));
            const target = targets.get(item.path);
            if (currentSha !== item.sha256 && currentSha !== target?.afterSha256) throw new MigrationError("integrity_failed", "An authority file changed outside migration recovery", { target: item.path });
            if (currentSha !== item.sha256) {
              if (!current.version) throw new MigrationError("resource_operation_failed", "A resource version is required for recovery");
              const written = await this.#resources.writeExpectedVersion(this.#ref(item.path), backup, current.version);
              if ("conflict" in written && written.conflict) throw new MigrationError("integrity_failed", "An authority file changed during recovery", { target: item.path });
            }
          }
          await this.#verifyInventory(journal, "before");
          journal.state = "restored";
          delete journal.errorCode;
          await this.#writeJournal(journal);
          return { migrationId: journal.migrationId, state: "restored", migratedFiles: journal.completedTargets.length, backupRetained: true, reindexRequired: false };
        }

        journal.state = "migrating";
        await this.#writeJournal(journal);
        for (const target of journal.targets) {
          const original = new TextDecoder().decode((await this.#resources.read(this.#ref(backupPath(journal.migrationId, target.path)))).content);
          const migrated = new TextEncoder().encode(migrateAuthorityText(target.path, original));
          if (sha256(migrated) !== target.afterSha256) throw new MigrationError("integrity_failed", "The migration registry no longer matches the durable plan", { target: target.path });
          await this.#writeTarget(target, migrated);
          if (!journal.completedTargets.includes(target.path)) journal.completedTargets.push(target.path);
          await this.#writeJournal(journal);
        }
        return await this.#complete(journal);
      } catch (error) {
        journal.state = "blocked";
        journal.errorCode = error instanceof MigrationError ? error.code : "resource-operation-failed";
        try { await this.#writeJournal(journal); } catch { /* The previous durable state remains recoverable. */ }
        if (error instanceof MigrationError) throw error;
        throw new MigrationError("resource_operation_failed", "Migration recovery stopped safely", { migrationId: journal.migrationId });
      }
    });
  }
}
