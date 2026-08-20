import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { TodoError, redactText } from "../errors.ts";
import {
  STORE_SCHEMA_VERSION,
  type AutomationAttempt,
  type AutomationRun,
  type DateTimeValue,
  type ProjectRecord,
  type RecurrenceRuleVersion,
  type RecurrenceSeries,
  type ReminderRecord,
  type StoreData,
  type TodoRecord,
  type TriggerConfig,
} from "../domain/model.ts";
import { clone, newId, nowIso, stableJson } from "../domain/utils.ts";

const FILE_NAME = "store.v2.json";
const LEGACY_FILE_NAME = "store.v1.json";

export interface StoreTransactionResult<T> {
  result: T;
  revision: number;
  changed: boolean;
}

export interface StoreHealth {
  writable: boolean;
  storage: "plugin_private";
  schemaVersion: typeof STORE_SCHEMA_VERSION;
  error?: string;
}

export function emptyStore(clock = nowIso()): StoreData {
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    revision: 0,
    createdAt: clock,
    updatedAt: clock,
    todos: {},
    projects: {},
    recurrenceSeries: {},
    recurrenceRuleVersions: {},
    occurrenceOverrides: {},
    occurrenceSuppressions: {},
    reminders: {},
    runs: {},
    attempts: {},
    intents: {},
    idempotency: {},
    importPreviews: {},
    confirmations: {},
    audit: [],
    runtime: { taskBackend: "initializing" },
  };
}

function asObjectMap<T extends { id: string }>(items: unknown): Record<string, T> {
  if (Array.isArray(items)) return Object.fromEntries(items.filter((item): item is T => Boolean(item && typeof item === "object" && typeof (item as T).id === "string")).map((item) => [item.id, item]));
  if (items && typeof items === "object" && !Array.isArray(items)) return items as Record<string, T>;
  return {};
}

function asRecord<T>(items: unknown): Record<string, T> {
  if (items && typeof items === "object" && !Array.isArray(items)) return items as Record<string, T>;
  return {};
}

function normalizeV2(parsed: Record<string, unknown>): StoreData {
  const createdAt = typeof parsed.createdAt === "string" ? parsed.createdAt : nowIso();
  return {
    ...emptyStore(createdAt),
    ...parsed,
    schemaVersion: STORE_SCHEMA_VERSION,
    revision: Number.isInteger(parsed.revision) ? Number(parsed.revision) : 0,
    createdAt,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : createdAt,
    todos: asObjectMap<TodoRecord>(parsed.todos),
    projects: asObjectMap<ProjectRecord>(parsed.projects),
    recurrenceSeries: asObjectMap<RecurrenceSeries>(parsed.recurrenceSeries),
    recurrenceRuleVersions: asObjectMap<RecurrenceRuleVersion>(parsed.recurrenceRuleVersions),
    occurrenceOverrides: asObjectMap(parsed.occurrenceOverrides),
    occurrenceSuppressions: asObjectMap(parsed.occurrenceSuppressions),
    reminders: asObjectMap<ReminderRecord>(parsed.reminders),
    runs: asObjectMap<AutomationRun>(parsed.runs),
    attempts: asObjectMap<AutomationAttempt>(parsed.attempts),
    intents: asObjectMap(parsed.intents),
    idempotency: asRecord(parsed.idempotency),
    importPreviews: asObjectMap(parsed.importPreviews),
    confirmations: asRecord(parsed.confirmations),
    audit: Array.isArray(parsed.audit) ? parsed.audit as StoreData["audit"] : [],
    runtime: parsed.runtime && typeof parsed.runtime === "object"
      ? { ...(parsed.runtime as StoreData["runtime"]), taskBackend: (parsed.runtime as StoreData["runtime"]).taskBackend ?? "initializing" }
      : { taskBackend: "initializing" },
  };
}

function legacyTime(value: unknown): DateTimeValue | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.kind === "date" && typeof record.date === "string") return { kind: "date", date: record.date };
  if (record.kind === "exact" && typeof record.instant === "string" && typeof record.timeZone === "string" && typeof record.offsetMinutes === "number") {
    const localDateTime = typeof record.localDateTime === "string" ? record.localDateTime : new Date(record.instant).toISOString().slice(0, 19);
    return { kind: "exact", instant: record.instant, timeZone: record.timeZone, offsetMinutes: record.offsetMinutes, localDateTime };
  }
  return undefined;
}

function legacyTrigger(value: unknown): TriggerConfig | undefined {
  const time = legacyTime(value);
  if (!time || time.kind !== "exact") return undefined;
  return { ...time, kind: "exact", enabled: false };
}

function migrateV1(parsed: Record<string, unknown>): StoreData {
  const migrated = emptyStore();
  migrated.revision = Number.isInteger(parsed.storeVersion) ? Number(parsed.storeVersion) : 0;
  const legacyTodos = Array.isArray(parsed.todos) ? parsed.todos : [];
  for (const item of legacyTodos) {
    if (!item || typeof item !== "object") continue;
    const todo = item as Record<string, unknown>;
    if (typeof todo.id !== "string" || typeof todo.title !== "string") continue;
    const createdAt = typeof todo.createdAt === "string" ? todo.createdAt : nowIso();
    const updatedAt = typeof todo.updatedAt === "string" ? todo.updatedAt : createdAt;
    const projectId = typeof todo.projectId === "string" ? todo.projectId : undefined;
    const priority = todo.priority === "high" ? "high" : todo.priority === "low" ? "low" : "medium";
    migrated.todos[todo.id] = {
      id: todo.id,
      title: todo.title,
      description: typeof todo.notes === "string" ? todo.notes : typeof todo.description === "string" ? todo.description : "",
      status: todo.status === "completed" ? "completed" : "pending",
      archivedAt: typeof todo.deletedAt === "string" ? todo.deletedAt : undefined,
      completedAt: typeof todo.completedAt === "string" ? todo.completedAt : undefined,
      projectId,
      projectHistory: projectId ? [projectId] : [],
      tags: Array.isArray(todo.tags) ? todo.tags.filter((tag): tag is string => typeof tag === "string") : [],
      priority,
      plannedFor: legacyTime(todo.plannedFor),
      deadline: legacyTime(todo.deadline),
      mode: "manual",
      reminderTrigger: legacyTrigger(todo.reminderAt),
      agentId: typeof todo.agentId === "string" ? todo.agentId : undefined,
      instructions: typeof todo.instructions === "string" ? todo.instructions : undefined,
      permissionMode: todo.permissionMode === "read_only" || todo.permissionMode === "workspace_write" || todo.permissionMode === "ask" ? todo.permissionMode : undefined,
      // Legacy workspace strings are intentionally not migrated: absolute paths are not a ResourceRef.
      createdAt,
      updatedAt,
      version: Number.isInteger(todo.version) ? Number(todo.version) : 1,
    };
  }
  const legacyProjects = Array.isArray(parsed.projects) ? parsed.projects : [];
  for (const item of legacyProjects) {
    if (!item || typeof item !== "object") continue;
    const project = item as Record<string, unknown>;
    if (typeof project.id !== "string" || typeof project.name !== "string") continue;
    const createdAt = typeof project.createdAt === "string" ? project.createdAt : nowIso();
    migrated.projects[project.id] = {
      id: project.id,
      name: project.name,
      archivedAt: typeof project.deletedAt === "string" ? project.deletedAt : undefined,
      createdAt,
      updatedAt: typeof project.updatedAt === "string" ? project.updatedAt : createdAt,
      version: Number.isInteger(project.version) ? Number(project.version) : 1,
    };
  }

  // Preserve legacy runtime facts without reactivating side effects.
  const legacyReminders = Array.isArray(parsed.reminders) ? parsed.reminders : [];
  for (const item of legacyReminders) {
    if (!item || typeof item !== "object") continue;
    const reminder = item as Record<string, unknown>;
    if (typeof reminder.id !== "string" || typeof reminder.todoId !== "string" || typeof reminder.dueAt !== "string") continue;
    const at = nowIso();
    migrated.reminders[reminder.id] = {
      id: reminder.id,
      identity: `legacy:${reminder.id}`,
      todoId: reminder.todoId,
      occurrenceKey: typeof reminder.occurrenceId === "string" ? reminder.occurrenceId : "root",
      runAt: reminder.dueAt,
      status: reminder.status === "handed_off" ? "handed_off" : reminder.status === "cancelled" ? "cancelled" : "handoff_unknown",
      attemptCount: typeof reminder.attempts === "number" ? reminder.attempts : 0,
      lastError: "Migrated from v1 without reactivating the old schedule",
      createdAt: at,
      updatedAt: at,
      version: 1,
    };
  }
  const legacyRuns = Array.isArray(parsed.runs) ? parsed.runs : [];
  for (const item of legacyRuns) {
    if (!item || typeof item !== "object") continue;
    const run = item as Record<string, unknown>;
    if (typeof run.id !== "string" || typeof run.todoId !== "string") continue;
    const createdAt = typeof run.createdAt === "string" ? run.createdAt : nowIso();
    const status = ["succeeded", "failed", "cancelled"].includes(String(run.status)) ? run.status as AutomationRun["status"] : "needs_action";
    migrated.runs[run.id] = {
      id: run.id,
      identity: `legacy:${run.id}`,
      todoId: run.todoId,
      occurrenceKey: typeof run.occurrenceId === "string" ? run.occurrenceId : "root",
      runAt: createdAt,
      status,
      resultSummary: typeof run.summary === "string" ? run.summary : undefined,
      lastError: status === "needs_action" ? "Migrated from v1; explicitly retry to create a new Session" : undefined,
      createdAt,
      updatedAt: typeof run.updatedAt === "string" ? run.updatedAt : createdAt,
      version: 1,
    };
  }
  const legacyAttempts = Array.isArray(parsed.attempts) ? parsed.attempts : [];
  for (const item of legacyAttempts) {
    if (!item || typeof item !== "object") continue;
    const attempt = item as Record<string, unknown>;
    if (typeof attempt.id !== "string" || typeof attempt.runId !== "string") continue;
    const createdAt = typeof attempt.createdAt === "string" ? attempt.createdAt : nowIso();
    migrated.attempts[attempt.id] = {
      id: attempt.id,
      runId: attempt.runId,
      attemptNumber: Number.isInteger(attempt.number) ? Number(attempt.number) : 1,
      status: ["succeeded", "failed", "cancelled"].includes(String(attempt.status)) ? attempt.status as AutomationAttempt["status"] : "needs_action",
      resultSummary: typeof attempt.summary === "string" ? attempt.summary : undefined,
      diagnostic: "Migrated from v1",
      createdAt,
      updatedAt: typeof attempt.completedAt === "string" ? attempt.completedAt : createdAt,
      finishedAt: typeof attempt.completedAt === "string" ? attempt.completedAt : undefined,
      version: 1,
    };
  }
  migrated.audit.push({
    id: newId("audit"),
    at: nowIso(),
    actorKey: "system:migration",
    operation: "migrate_store",
    entityType: "store",
    summary: "Migrated schema v1 to v2; legacy schedules were not reactivated",
  });
  return migrated;
}

function cleanupExpired(draft: StoreData, now = Date.now()): void {
  for (const [key, record] of Object.entries(draft.idempotency)) {
    if (Date.parse(record.expiresAt) <= now) delete draft.idempotency[key];
  }
  for (const [key, preview] of Object.entries(draft.importPreviews)) {
    if (Date.parse(preview.expiresAt) <= now && !preview.committedCommandId) delete draft.importPreviews[key];
  }
  for (const [key, confirmation] of Object.entries(draft.confirmations)) {
    if (Date.parse(confirmation.expiresAt) <= now || confirmation.usedAt) delete draft.confirmations[key];
  }
  if (draft.audit.length > 5_000) draft.audit = draft.audit.slice(-5_000);
}

export class TodoStore {
  readonly dataDir: string;
  readonly filePath: string;
  readonly backupPath: string;
  private blockedError?: TodoError;
  private queue: Promise<unknown> = Promise.resolve();
  private injectedFailure?: "before_write" | "after_write" | "before_rename";

  constructor(dataDir: string) {
    this.dataDir = path.resolve(dataDir);
    this.filePath = path.join(this.dataDir, FILE_NAME);
    this.backupPath = `${this.filePath}.bak`;
    this.initialize();
  }

  health(): StoreHealth {
    return {
      writable: !this.blockedError,
      storage: "plugin_private",
      schemaVersion: STORE_SCHEMA_VERSION,
      error: this.blockedError?.message ? redactText(this.blockedError.message) : undefined,
    };
  }

  injectFailure(stage: "before_write" | "after_write" | "before_rename"): void {
    this.injectedFailure = stage;
  }

  snapshot(): StoreData {
    this.assertWritableOrReadable();
    return clone(this.readCurrent());
  }

  async transact<T>(mutator: (draft: StoreData) => T | Promise<T>): Promise<StoreTransactionResult<T>> {
    const execute = async (): Promise<StoreTransactionResult<T>> => {
      this.assertWritable();
      const current = this.readCurrent();
      const draft = clone(current);
      cleanupExpired(draft);
      let result: T;
      try {
        result = await mutator(draft);
      } catch (error) {
        throw error instanceof TodoError ? error : new TodoError("transaction_failed", "Todo change was rolled back", { cause: error, nextAction: "retry" });
      }
      const before = stableJson({ ...current, revision: 0, updatedAt: "" });
      const after = stableJson({ ...draft, revision: 0, updatedAt: "" });
      if (before === after) return { result, revision: current.revision, changed: false };
      draft.revision = current.revision + 1;
      draft.updatedAt = nowIso();
      this.commit(draft);
      return { result, revision: draft.revision, changed: true };
    };
    const scheduled = this.queue.then(execute, execute);
    this.queue = scheduled.then(() => undefined, () => undefined);
    return scheduled;
  }

  async replace(expectedRevision: number, next: StoreData): Promise<number> {
    const outcome = await this.transact((draft) => {
      if (draft.revision !== expectedRevision) throw new TodoError("conflict", "Store changed since the operation began", { nextAction: "reload" });
      for (const key of Object.keys(draft) as Array<keyof StoreData>) delete (draft as unknown as Record<string, unknown>)[key];
      Object.assign(draft, clone(next), { revision: expectedRevision });
    });
    return outcome.revision;
  }

  private initialize(): void {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
      if (fs.existsSync(this.filePath)) {
        this.readCurrent();
        return;
      }
      const legacyPath = path.join(this.dataDir, LEGACY_FILE_NAME);
      if (fs.existsSync(legacyPath)) {
        const raw = fs.readFileSync(legacyPath, "utf8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed.schemaVersion !== 1) throw new TodoError("migration_failed", "Legacy Todo store schema is unsupported");
        const migrated = migrateV1(parsed);
        fs.copyFileSync(legacyPath, `${legacyPath}.pre-v2.bak`);
        this.commit(migrated, false);
        return;
      }
      this.commit(emptyStore(), false);
    } catch (error) {
      this.blockedError = error instanceof TodoError
        ? error
        : new TodoError("migration_failed", `Todo store could not be initialized: ${redactText(error instanceof Error ? error.message : String(error))}`, { cause: error, recoverable: true, nextAction: "restore_backup" });
    }
  }

  private readCurrent(): StoreData {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Record<string, unknown>;
      if (parsed.schemaVersion !== STORE_SCHEMA_VERSION) throw new TodoError("migration_failed", "Todo store schema is unsupported", { recoverable: false });
      return normalizeV2(parsed);
    } catch (error) {
      if (error instanceof TodoError) throw error;
      throw new TodoError("store", `Todo store cannot be opened: ${redactText(error instanceof Error ? error.message : String(error))}`, { cause: error, recoverable: true, nextAction: "restore_backup" });
    }
  }

  private commit(data: StoreData, backup = true): void {
    this.assertWritable(false);
    const tempPath = path.join(this.dataDir, `.${FILE_NAME}.${process.pid}.${randomUUID()}.tmp`);
    try {
      if (this.injectedFailure === "before_write") throw new Error("injected before_write failure");
      const fd = fs.openSync(tempPath, "wx", 0o600);
      try {
        fs.writeFileSync(fd, `${JSON.stringify(data, null, 2)}\n`, "utf8");
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      if (this.injectedFailure === "after_write") throw new Error("injected after_write failure");
      if (backup && fs.existsSync(this.filePath)) fs.copyFileSync(this.filePath, this.backupPath);
      if (this.injectedFailure === "before_rename") throw new Error("injected before_rename failure");
      fs.renameSync(tempPath, this.filePath);
      try {
        const dirFd = fs.openSync(this.dataDir, "r");
        try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
      } catch {
        // Directory fsync is not supported on every platform; atomic rename remains authoritative.
      }
    } catch (error) {
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { /* best effort */ }
      throw error instanceof TodoError
        ? error
        : new TodoError("transaction_failed", `Todo transaction was not committed: ${redactText(error instanceof Error ? error.message : String(error))}`, { cause: error, recoverable: true, nextAction: "retry_after_reload" });
    } finally {
      this.injectedFailure = undefined;
    }
  }

  private assertWritable(throwBlocked = true): void {
    if (this.blockedError && throwBlocked) throw this.blockedError;
  }

  private assertWritableOrReadable(): void {
    if (this.blockedError) throw this.blockedError;
  }
}
