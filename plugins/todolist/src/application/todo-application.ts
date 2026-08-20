import { randomBytes } from "node:crypto";
import { TodoError, asTodoError, redactText } from "../errors.ts";
import type {
  AuditEntry,
  AutomationAttempt,
  AutomationRun,
  ConfirmationRecord,
  ExecutionMode,
  IdempotencyRecord,
  OccurrenceOverride,
  OccurrenceSuppression,
  Priority,
  ProjectRecord,
  RecurrenceRule,
  RecurrenceRuleVersion,
  RecurrenceSeries,
  ReminderRecord,
  StoreData,
  TodoProjection,
  TodoRecord,
  TriggerConfig,
} from "../domain/model.ts";
import { attentionDate, addCalendar, localToday, resolveExactLocal } from "../domain/time.ts";
import { activeRuleVersion, materializeCalendarDates, nextAfterCompletion, recurrenceKey, shiftedRule } from "../domain/recurrence.ts";
import {
  MODES,
  PRIORITIES,
  normalizeDescription,
  normalizeRecurrenceRule,
  normalizeResourceRef,
  normalizeTags,
  normalizeTitle,
  normalizeTodoPatch,
  validateTodoAggregate,
} from "../domain/validation.ts";
import { clone, enumValue, newId, nowIso, optionalString, requireRecord, requiredString, sha256 } from "../domain/utils.ts";
import type { InvocationContext } from "../interfaces/context.ts";
import { TodoStore } from "../infrastructure/store.ts";
import {
  abortAutomationSession,
  classifySessionTerminal,
  createAutomationSession,
  handoffNotification,
  materializeWorkspace,
  scheduleAutomation,
  scheduleReminder,
  sendAutomationMessage,
  subscribeToSession,
  unschedule,
} from "../infrastructure/host.ts";
import type { CreateTodoInput, NormalizedCreateTodoInput, QueryTodoInput } from "./dto.ts";
import { reconcileTodoEffects, requestAllTodoEffectsCancelled, retryReminderIntent, retryRunIntent } from "./effects.ts";
import { projectTodos, reviewProjection, type ReviewProjection } from "./projections.ts";

export interface MutationResult<T> {
  ok: true;
  value: T;
  revision: number;
  effects: Array<{ intentId: string; status: string; error?: string }>;
}

function audit(
  draft: StoreData,
  invocation: InvocationContext,
  operation: string,
  entityType: string,
  entityId: string | undefined,
  summary: string,
): AuditEntry {
  const entry: AuditEntry = {
    id: newId("audit"),
    at: nowIso(),
    actorKey: invocation.actorKey,
    operation,
    entityType,
    entityId,
    summary,
    correlationId: invocation.correlationId,
  };
  draft.audit.push(entry);
  return entry;
}

function getTodo(data: StoreData, id: string): TodoRecord {
  const todo = data.todos[id];
  if (!todo) throw new TodoError("not_found", "Todo was not found", { field: "id" });
  return todo;
}

function getProject(data: StoreData, id: string): ProjectRecord {
  const project = data.projects[id];
  if (!project) throw new TodoError("not_found", "Project was not found", { field: "projectId" });
  return project;
}

function getReminder(data: StoreData, id: string): ReminderRecord {
  const reminder = data.reminders[id];
  if (!reminder) throw new TodoError("not_found", "Reminder was not found", { field: "reminderId" });
  return reminder;
}

function getRun(data: StoreData, id: string): AutomationRun {
  const run = data.runs[id];
  if (!run) throw new TodoError("not_found", "Automation Run was not found", { field: "runId" });
  return run;
}

function expectedVersion(value: unknown, field = "expectedVersion"): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw new TodoError("validation", `${field} must be a positive integer`, { field });
  return value;
}

function normalizeCreateInput(input: CreateTodoInput): NormalizedCreateTodoInput {
  const record = requireRecord(input, "input");
  const mode = enumValue(record.mode, MODES, "mode", "manual");
  return {
    title: normalizeTitle(record.title),
    description: normalizeDescription(record.description),
    projectId: optionalString(record.projectId, "projectId", 240),
    tags: normalizeTags(record.tags),
    priority: enumValue(record.priority, PRIORITIES, "priority", "none"),
    plannedFor: "plannedFor" in record ? (awaitlessNormalizeDateTime(record.plannedFor, "plannedFor")) : undefined,
    deadline: "deadline" in record ? (awaitlessNormalizeDateTime(record.deadline, "deadline")) : undefined,
    mode,
    reminderTrigger: "reminderTrigger" in record ? awaitlessNormalizeTrigger(record.reminderTrigger, "reminderTrigger") : undefined,
    agentTrigger: "agentTrigger" in record ? awaitlessNormalizeTrigger(record.agentTrigger, "agentTrigger") : undefined,
    agentId: optionalString(record.agentId, "agentId", 240),
    instructions: optionalString(record.instructions, "instructions", 12_000),
    permissionMode: record.permissionMode === undefined || record.permissionMode === null || record.permissionMode === ""
      ? undefined
      : enumValue(record.permissionMode, ["ask", "read_only", "workspace_write"] as const, "permissionMode"),
    workspaceRef: normalizeResourceRef(record.workspaceRef, "workspaceRef"),
    commandId: optionalString(record.commandId, "commandId", 240),
  };
}

// Kept as wrappers so command normalization remains side-effect free and easy to characterize.
function awaitlessNormalizeDateTime(value: unknown, field: string) {
  const { normalizeDateTimeValue } = timeModule;
  return normalizeDateTimeValue(value, field);
}
function awaitlessNormalizeTrigger(value: unknown, field: string) {
  const { normalizeTrigger } = timeModule;
  return normalizeTrigger(value, field);
}
import * as timeModule from "../domain/time.ts";

function idempotencyKey(invocation: InvocationContext, commandId: string): string {
  return `${invocation.actorKey}:${commandId}`;
}

function readIdempotent<T>(draft: StoreData, invocation: InvocationContext, commandId: string | undefined, operation: string): T | undefined {
  if (!commandId) return undefined;
  const record = draft.idempotency[idempotencyKey(invocation, commandId)];
  if (!record) return undefined;
  if (record.operation !== operation) throw new TodoError("conflict", "commandId was already used for a different operation", { field: "commandId" });
  return clone(record.result as T);
}

function writeIdempotent(draft: StoreData, invocation: InvocationContext, commandId: string | undefined, operation: string, result: unknown): void {
  if (!commandId) return;
  const record: IdempotencyRecord = {
    commandId,
    actorKey: invocation.actorKey,
    operation,
    result: clone(result),
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
  draft.idempotency[idempotencyKey(invocation, commandId)] = record;
}

function parseSessionRef(value?: string): { sessionId?: string; sessionPath?: string } | undefined {
  if (!value) return undefined;
  try {
    const record = JSON.parse(value) as Record<string, unknown>;
    const sessionId = typeof record.sessionId === "string" ? record.sessionId : undefined;
    const sessionPath = typeof record.sessionPath === "string" ? record.sessionPath : undefined;
    return sessionId || sessionPath ? { sessionId, sessionPath } : undefined;
  } catch {
    return { sessionPath: value };
  }
}

function triggerForDate(trigger: TriggerConfig | undefined, date: string): TriggerConfig | undefined {
  if (!trigger) return undefined;
  const time = trigger.localDateTime.slice(10);
  const exact = resolveExactLocal({
    localDateTime: `${date}${time}`,
    timeZone: trigger.timeZone,
  }, "recurrence.trigger");
  return { ...exact, enabled: trigger.enabled };
}

function todoTemplate(todo: TodoRecord): RecurrenceRuleVersion["template"] {
  return {
    title: todo.title,
    description: todo.description,
    projectId: todo.projectId,
    tags: [...todo.tags],
    priority: todo.priority,
    mode: todo.mode,
    reminderTrigger: todo.reminderTrigger,
    agentTrigger: todo.agentTrigger,
    agentId: todo.agentId,
    instructions: todo.instructions,
    permissionMode: todo.permissionMode,
    workspaceRef: todo.workspaceRef,
  };
}

export class TodoApplication {
  readonly store: TodoStore;
  private readonly subscriptions = new Map<string, () => void>();
  private disposed = false;

  constructor(store: TodoStore) {
    this.store = store;
  }

  dispose(): void {
    this.disposed = true;
    for (const unsubscribe of this.subscriptions.values()) {
      try { unsubscribe(); } catch { /* best effort */ }
    }
    this.subscriptions.clear();
  }

  status(): { store: ReturnType<TodoStore["health"]>; runtime: StoreData["runtime"]; revision?: number } {
    const health = this.store.health();
    if (!health.writable) return { store: health, runtime: { taskBackend: "backend_unavailable", lastReadinessError: health.error } };
    const snapshot = this.store.snapshot();
    return { store: health, runtime: snapshot.runtime, revision: snapshot.revision };
  }

  getTodo(id: string): TodoProjection {
    const data = this.store.snapshot();
    const todo = getTodo(data, id);
    const projected = projectTodos(data, { view: todo.archivedAt ? "trash" : todo.status === "completed" ? "completed" : "all", includeTrash: true, limit: 100 }).items.find((item) => item.id === id);
    if (projected) return projected;
    return { ...todo, attentionDate: attentionDate(todo.plannedFor, todo.deadline), reasons: [], allowedActions: todo.archivedAt ? ["restore"] : ["edit", "trash"] };
  }

  query(input: QueryTodoInput = {}) {
    return projectTodos(this.store.snapshot(), input);
  }

  review(timeZone?: string, today?: string): ReviewProjection {
    return reviewProjection(this.store.snapshot(), timeZone, today);
  }

  async createTodo(input: CreateTodoInput, invocation: InvocationContext): Promise<MutationResult<TodoRecord>> {
    const normalized = normalizeCreateInput(input);
    const outcome = await this.store.transact((draft) => {
      const replay = readIdempotent<TodoRecord>(draft, invocation, normalized.commandId, "todo.create");
      if (replay) return replay;
      const at = nowIso();
      const todo: TodoRecord = {
        id: newId("todo"),
        title: normalized.title,
        description: normalized.description,
        status: "pending",
        projectId: normalized.projectId,
        projectHistory: normalized.projectId ? [normalized.projectId] : [],
        tags: normalized.tags,
        priority: normalized.priority,
        plannedFor: normalized.plannedFor,
        deadline: normalized.deadline,
        mode: normalized.mode,
        reminderTrigger: normalized.reminderTrigger,
        agentTrigger: normalized.agentTrigger,
        agentId: normalized.agentId,
        instructions: normalized.instructions,
        permissionMode: normalized.permissionMode,
        workspaceRef: normalized.workspaceRef,
        createdAt: at,
        updatedAt: at,
        version: 1,
      };
      validateTodoAggregate(todo, draft.projects);
      draft.todos[todo.id] = todo;
      reconcileTodoEffects(draft, todo, { createMissing: true, reason: "todo_created" });
      audit(draft, invocation, "todo.create", "todo", todo.id, `Created Todo ${todo.id}`);
      writeIdempotent(draft, invocation, normalized.commandId, "todo.create", todo);
      return clone(todo);
    });
    const effects = await this.flushPendingIntents(invocation);
    return { ok: true, value: outcome.result, revision: this.store.snapshot().revision, effects };
  }

  async updateTodo(
    id: string,
    patchInput: unknown,
    expectedVersionInput: unknown,
    invocation: InvocationContext,
    mutationId?: string,
  ): Promise<MutationResult<TodoRecord>> {
    const patch = normalizeTodoPatch(patchInput);
    const version = expectedVersion(expectedVersionInput);
    const operation = "todo.update";
    const effectFields = new Set(["mode", "reminderTrigger", "agentTrigger", "agentId", "instructions", "permissionMode", "workspaceRef"]);
    const createMissing = Object.keys(patch).some((key) => effectFields.has(key));
    const outcome = await this.store.transact((draft) => {
      const replay = readIdempotent<TodoRecord>(draft, invocation, mutationId, operation);
      if (replay) return replay;
      const existing = getTodo(draft, id);
      if (existing.version !== version) throw new TodoError("conflict", "Todo changed since editing began", { field: "expectedVersion", nextAction: "reload_and_merge" });
      if (existing.archivedAt) throw new TodoError("conflict", "Todo in Trash cannot be edited", { nextAction: "restore" });
      const next: TodoRecord = {
        ...existing,
        ...patch,
        projectHistory: patch.projectId && patch.projectId !== existing.projectId
          ? [...new Set([...(existing.projectHistory ?? []), patch.projectId])]
          : existing.projectHistory,
        updatedAt: nowIso(),
        version: existing.version + 1,
      };
      validateTodoAggregate(next, draft.projects);
      draft.todos[id] = next;
      reconcileTodoEffects(draft, next, { createMissing, reason: "todo_updated" });
      audit(draft, invocation, operation, "todo", id, `Updated fields: ${Object.keys(patch).sort().join(", ") || "none"}`);
      writeIdempotent(draft, invocation, mutationId, operation, next);
      return clone(next);
    });
    const effects = await this.flushPendingIntents(invocation);
    return { ok: true, value: outcome.result, revision: this.store.snapshot().revision, effects };
  }

  async completeTodo(id: string, versionInput: unknown, invocation: InvocationContext, commandId?: string): Promise<MutationResult<TodoRecord>> {
    const version = expectedVersion(versionInput);
    const outcome = await this.store.transact((draft) => {
      const replay = readIdempotent<TodoRecord>(draft, invocation, commandId, "todo.complete");
      if (replay) return replay;
      const todo = getTodo(draft, id);
      if (todo.version !== version) throw new TodoError("conflict", "Todo changed before completion", { nextAction: "reload" });
      if (todo.archivedAt) throw new TodoError("conflict", "Todo in Trash cannot be completed", { nextAction: "restore" });
      if (todo.status === "completed") {
        writeIdempotent(draft, invocation, commandId, "todo.complete", todo);
        return clone(todo);
      }
      todo.status = "completed";
      todo.completedAt = nowIso();
      todo.updatedAt = todo.completedAt;
      todo.version += 1;
      requestAllTodoEffectsCancelled(draft, todo.id);
      this.spawnAfterCompletionOccurrence(draft, todo, invocation);
      audit(draft, invocation, "todo.complete", "todo", id, "Completed Todo; active side effects entered cancellation flow");
      writeIdempotent(draft, invocation, commandId, "todo.complete", todo);
      return clone(todo);
    });
    const effects = await this.flushPendingIntents(invocation);
    return { ok: true, value: outcome.result, revision: this.store.snapshot().revision, effects };
  }

  async reopenTodo(id: string, versionInput: unknown, invocation: InvocationContext, commandId?: string): Promise<MutationResult<TodoRecord>> {
    const version = expectedVersion(versionInput);
    const outcome = await this.store.transact((draft) => {
      const replay = readIdempotent<TodoRecord>(draft, invocation, commandId, "todo.reopen");
      if (replay) return replay;
      const todo = getTodo(draft, id);
      if (todo.version !== version) throw new TodoError("conflict", "Todo changed before reopening", { nextAction: "reload" });
      if (todo.archivedAt) throw new TodoError("conflict", "Todo in Trash must be restored first", { nextAction: "restore" });
      todo.status = "pending";
      todo.completedAt = undefined;
      todo.updatedAt = nowIso();
      todo.version += 1;
      // Reopening deliberately does not revive old reminders, schedules or Automation Runs.
      audit(draft, invocation, "todo.reopen", "todo", id, "Reopened Todo without reactivating external side effects");
      writeIdempotent(draft, invocation, commandId, "todo.reopen", todo);
      return clone(todo);
    });
    return { ok: true, value: outcome.result, revision: outcome.revision, effects: [] };
  }

  async trashTodo(id: string, versionInput: unknown, invocation: InvocationContext, commandId?: string): Promise<MutationResult<TodoRecord>> {
    const version = expectedVersion(versionInput);
    const outcome = await this.store.transact((draft) => {
      const replay = readIdempotent<TodoRecord>(draft, invocation, commandId, "todo.trash");
      if (replay) return replay;
      const todo = getTodo(draft, id);
      if (todo.version !== version) throw new TodoError("conflict", "Todo changed before moving to Trash", { nextAction: "reload" });
      if (!todo.archivedAt) {
        todo.archivedAt = nowIso();
        todo.updatedAt = todo.archivedAt;
        todo.version += 1;
        requestAllTodoEffectsCancelled(draft, todo.id);
        if (todo.occurrenceMeta) {
          const suppression: OccurrenceSuppression = {
            id: newId("suppression"),
            seriesId: todo.occurrenceMeta.seriesId,
            recurrenceKey: todo.occurrenceMeta.recurrenceKey,
            reason: "delete",
            createdAt: nowIso(),
          };
          draft.occurrenceSuppressions[suppression.id] = suppression;
        }
      }
      audit(draft, invocation, "todo.trash", "todo", id, "Moved Todo to Trash");
      writeIdempotent(draft, invocation, commandId, "todo.trash", todo);
      return clone(todo);
    });
    const effects = await this.flushPendingIntents(invocation);
    return { ok: true, value: outcome.result, revision: this.store.snapshot().revision, effects };
  }

  async restoreTodo(id: string, versionInput: unknown, invocation: InvocationContext, commandId?: string): Promise<MutationResult<TodoRecord>> {
    const version = expectedVersion(versionInput);
    const outcome = await this.store.transact((draft) => {
      const replay = readIdempotent<TodoRecord>(draft, invocation, commandId, "todo.restore");
      if (replay) return replay;
      const todo = getTodo(draft, id);
      if (todo.version !== version) throw new TodoError("conflict", "Todo changed before restore", { nextAction: "reload" });
      if (!todo.archivedAt) return clone(todo);
      todo.archivedAt = undefined;
      todo.updatedAt = nowIso();
      todo.version += 1;
      if (todo.projectId && (!draft.projects[todo.projectId] || draft.projects[todo.projectId]?.archivedAt)) todo.projectId = undefined;
      // Restoring data is intentionally separate from re-enabling a trigger.
      audit(draft, invocation, "todo.restore", "todo", id, "Restored Todo without reactivating schedules or Runs");
      writeIdempotent(draft, invocation, commandId, "todo.restore", todo);
      return clone(todo);
    });
    return { ok: true, value: outcome.result, revision: outcome.revision, effects: [] };
  }

  async preparePurge(id: string, versionInput: unknown, invocation: InvocationContext): Promise<{ token: string; expiresAt: string; todoId: string; expectedVersion: number }> {
    const version = expectedVersion(versionInput);
    const secret = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    await this.store.transact((draft) => {
      const todo = getTodo(draft, id);
      if (!todo.archivedAt) throw new TodoError("confirmation_required", "Only a Todo in Trash can be permanently deleted", { nextAction: "trash_first" });
      if (todo.version !== version) throw new TodoError("conflict", "Todo changed before purge preview", { nextAction: "reload" });
      const confirmation: ConfirmationRecord = {
        tokenHash: sha256(secret),
        actorKey: invocation.actorKey,
        sessionKey: invocation.sessionKey,
        action: "todo.purge",
        targetId: id,
        targetVersion: version,
        expiresAt,
      };
      draft.confirmations[confirmation.tokenHash] = confirmation;
      audit(draft, invocation, "todo.purge.prepare", "todo", id, "Prepared bound purge confirmation");
    });
    return { token: secret, expiresAt, todoId: id, expectedVersion: version };
  }

  async confirmPurge(id: string, token: string, invocation: InvocationContext): Promise<{ ok: true; todoId: string; revision: number }> {
    const tokenHash = sha256(requiredString(token, "token", 500));
    const outcome = await this.store.transact((draft) => {
      const confirmation = draft.confirmations[tokenHash];
      if (!confirmation) throw new TodoError("confirmation_invalid", "Purge confirmation is invalid or expired", { nextAction: "prepare_again" });
      if (Date.parse(confirmation.expiresAt) <= Date.now() || confirmation.usedAt) throw new TodoError("confirmation_invalid", "Purge confirmation expired", { nextAction: "prepare_again" });
      if (confirmation.actorKey !== invocation.actorKey || confirmation.sessionKey !== invocation.sessionKey || confirmation.action !== "todo.purge" || confirmation.targetId !== id) {
        throw new TodoError("confirmation_invalid", "Purge confirmation is bound to another actor, session, or target", { recoverable: false });
      }
      const todo = getTodo(draft, id);
      if (!todo.archivedAt || todo.version !== confirmation.targetVersion) throw new TodoError("conflict", "Todo changed after purge preview", { nextAction: "prepare_again" });
      const unsafeReminder = Object.values(draft.reminders).find((item) => item.todoId === id && ["pending_registration", "scheduled", "handoff_claimed", "cancel_requested"].includes(item.status));
      const unsafeRun = Object.values(draft.runs).find((item) => item.todoId === id && ["pending_registration", "scheduled", "running", "cancel_requested"].includes(item.status));
      if (unsafeReminder || unsafeRun) throw new TodoError("conflict", "Todo still has an unresolved external side effect", { nextAction: "resolve_cancellation" });
      confirmation.usedAt = nowIso();
      const reminderIds = Object.values(draft.reminders).filter((item) => item.todoId === id).map((item) => item.id);
      const runIds = Object.values(draft.runs).filter((item) => item.todoId === id).map((item) => item.id);
      for (const reminderId of reminderIds) delete draft.reminders[reminderId];
      for (const [key, item] of Object.entries(draft.attempts)) if (runIds.includes(item.runId)) delete draft.attempts[key];
      for (const runId of runIds) delete draft.runs[runId];
      for (const [key, item] of Object.entries(draft.intents)) {
        if (reminderIds.includes(item.entityId) || runIds.includes(item.entityId) || item.payload.todoId === id) delete draft.intents[key];
      }

      if (todo.occurrenceMeta?.overrideId) delete draft.occurrenceOverrides[todo.occurrenceMeta.overrideId];
      const seriesIds = new Set([todo.recurrenceSeriesId, todo.occurrenceMeta?.seriesId].filter((value): value is string => Boolean(value)));
      delete draft.todos[id];
      for (const seriesId of seriesIds) {
        const series = draft.recurrenceSeries[seriesId];
        if (!series || series.sourceTodoId !== id) continue;
        const replacement = Object.values(draft.todos)
          .filter((item) => item.recurrenceSeriesId === seriesId || item.occurrenceMeta?.seriesId === seriesId)
          .sort((a, b) => (a.occurrenceMeta?.nominalLocalDate ?? a.createdAt).localeCompare(b.occurrenceMeta?.nominalLocalDate ?? b.createdAt))[0];
        if (replacement) {
          series.sourceTodoId = replacement.id;
          series.updatedAt = nowIso();
          series.version += 1;
        } else {
          delete draft.recurrenceSeries[seriesId];
          for (const [key, item] of Object.entries(draft.recurrenceRuleVersions)) if (item.seriesId === seriesId) delete draft.recurrenceRuleVersions[key];
          for (const [key, item] of Object.entries(draft.occurrenceOverrides)) if (item.seriesId === seriesId) delete draft.occurrenceOverrides[key];
          for (const [key, item] of Object.entries(draft.occurrenceSuppressions)) if (item.seriesId === seriesId) delete draft.occurrenceSuppressions[key];
        }
      }
      audit(draft, invocation, "todo.purge", "todo", id, "Permanently removed Todo data and dependent plugin-private records; host Sessions were not deleted");
      return id;
    });
    return { ok: true, todoId: outcome.result, revision: outcome.revision };
  }

  listProjects(options: { includeTrash?: boolean } = {}): { items: ProjectRecord[]; revision: number } {
    const data = this.store.snapshot();
    return {
      items: Object.values(data.projects).filter((project) => options.includeTrash || !project.archivedAt).sort((a, b) => a.name.localeCompare(b.name)),
      revision: data.revision,
    };
  }

  async createProject(nameInput: unknown, invocation: InvocationContext, commandId?: string): Promise<MutationResult<ProjectRecord>> {
    const name = requiredString(nameInput, "name", 120);
    const outcome = await this.store.transact((draft) => {
      const replay = readIdempotent<ProjectRecord>(draft, invocation, commandId, "project.create");
      if (replay) return replay;
      if (Object.values(draft.projects).some((project) => !project.archivedAt && project.name.normalize("NFKC").toLocaleLowerCase() === name.normalize("NFKC").toLocaleLowerCase())) {
        throw new TodoError("conflict", "An active Project already has this name", { field: "name" });
      }
      const at = nowIso();
      const project: ProjectRecord = { id: newId("project"), name, createdAt: at, updatedAt: at, version: 1 };
      draft.projects[project.id] = project;
      audit(draft, invocation, "project.create", "project", project.id, `Created Project ${name}`);
      writeIdempotent(draft, invocation, commandId, "project.create", project);
      return clone(project);
    });
    return { ok: true, value: outcome.result, revision: outcome.revision, effects: [] };
  }

  async updateProject(id: string, nameInput: unknown, versionInput: unknown, invocation: InvocationContext): Promise<MutationResult<ProjectRecord>> {
    const name = requiredString(nameInput, "name", 120);
    const version = expectedVersion(versionInput);
    const outcome = await this.store.transact((draft) => {
      const project = getProject(draft, id);
      if (project.version !== version) throw new TodoError("conflict", "Project changed before update", { nextAction: "reload" });
      if (project.archivedAt) throw new TodoError("conflict", "Project in Trash cannot be renamed", { nextAction: "restore" });
      if (Object.values(draft.projects).some((other) => other.id !== id && !other.archivedAt && other.name.normalize("NFKC").toLocaleLowerCase() === name.normalize("NFKC").toLocaleLowerCase())) {
        throw new TodoError("conflict", "An active Project already has this name", { field: "name" });
      }
      project.name = name;
      project.updatedAt = nowIso();
      project.version += 1;
      audit(draft, invocation, "project.update", "project", id, `Renamed Project to ${name}`);
      return clone(project);
    });
    return { ok: true, value: outcome.result, revision: outcome.revision, effects: [] };
  }

  async trashProject(id: string, versionInput: unknown, invocation: InvocationContext): Promise<MutationResult<ProjectRecord>> {
    const version = expectedVersion(versionInput);
    const outcome = await this.store.transact((draft) => {
      const project = getProject(draft, id);
      if (project.version !== version) throw new TodoError("conflict", "Project changed before delete", { nextAction: "reload" });
      if (!project.archivedAt) {
        project.archivedAt = nowIso();
        project.updatedAt = project.archivedAt;
        project.version += 1;
        for (const todo of Object.values(draft.todos).filter((item) => item.projectId === id)) {
          todo.projectHistory = [...new Set([...(todo.projectHistory ?? []), id])];
          todo.projectId = undefined;
          todo.updatedAt = nowIso();
          todo.version += 1;
        }
      }
      audit(draft, invocation, "project.trash", "project", id, "Moved Project to Trash; Todos moved to Inbox while retaining projectHistory");
      return clone(project);
    });
    return { ok: true, value: outcome.result, revision: outcome.revision, effects: [] };
  }

  async restoreProject(id: string, versionInput: unknown, invocation: InvocationContext): Promise<MutationResult<ProjectRecord>> {
    const version = expectedVersion(versionInput);
    const outcome = await this.store.transact((draft) => {
      const project = getProject(draft, id);
      if (project.version !== version) throw new TodoError("conflict", "Project changed before restore", { nextAction: "reload" });
      project.archivedAt = undefined;
      project.updatedAt = nowIso();
      project.version += 1;
      audit(draft, invocation, "project.restore", "project", id, "Restored Project without reassigning Todos automatically");
      return clone(project);
    });
    return { ok: true, value: outcome.result, revision: outcome.revision, effects: [] };
  }

  async batchMutate(input: unknown, invocation: InvocationContext): Promise<{ ok: true; revision: number; items: TodoRecord[]; effects: Array<{ intentId: string; status: string; error?: string }> }> {
    const record = requireRecord(input, "input");
    if (!Array.isArray(record.todoIds) || record.todoIds.length === 0 || record.todoIds.length > 100) throw new TodoError("validation", "todoIds must contain 1..100 ids", { field: "todoIds" });
    const todoIds = [...new Set(record.todoIds.map((value, index) => requiredString(value, `todoIds[${index}]`, 240)))];
    const versions = requireRecord(record.expectedVersions, "expectedVersions");
    const operation = enumValue(record.operation, ["complete", "trash", "move_project", "set_priority", "set_tags"] as const, "operation");
    const commandId = optionalString(record.commandId, "commandId", 240);
    const outcome = await this.store.transact((draft) => {
      const replay = readIdempotent<TodoRecord[]>(draft, invocation, commandId, `todo.batch.${operation}`);
      if (replay) return replay;
      const todos = todoIds.map((id) => getTodo(draft, id));
      for (const todo of todos) {
        const version = versions[todo.id];
        if (typeof version !== "number" || !Number.isInteger(version) || todo.version !== version) {
          throw new TodoError("conflict", `Todo ${todo.id} changed before batch mutation`, { field: `expectedVersions.${todo.id}`, nextAction: "reload" });
        }
        if (todo.archivedAt && operation !== "trash") throw new TodoError("conflict", `Todo ${todo.id} is in Trash`, { nextAction: "restore" });
      }
      for (const todo of todos) {
        if (operation === "complete") {
          todo.status = "completed";
          todo.completedAt = nowIso();
          requestAllTodoEffectsCancelled(draft, todo.id);
        } else if (operation === "trash") {
          todo.archivedAt = nowIso();
          requestAllTodoEffectsCancelled(draft, todo.id);
        } else if (operation === "move_project") {
          const projectId = optionalString(record.value, "value", 240);
          if (projectId) {
            const project = getProject(draft, projectId);
            if (project.archivedAt) throw new TodoError("reference_conflict", "Target Project is in Trash", { field: "value" });
            todo.projectHistory = [...new Set([...(todo.projectHistory ?? []), projectId])];
          }
          todo.projectId = projectId;
        } else if (operation === "set_priority") {
          todo.priority = enumValue(record.value, PRIORITIES, "value");
        } else {
          todo.tags = normalizeTags(record.value, "value");
        }
        todo.updatedAt = nowIso();
        todo.version += 1;
        validateTodoAggregate(todo, draft.projects);
      }
      audit(draft, invocation, `todo.batch.${operation}`, "todo", undefined, `Applied ${operation} to ${todos.length} Todos atomically`);
      const result = todos.map(clone);
      writeIdempotent(draft, invocation, commandId, `todo.batch.${operation}`, result);
      return result;
    });
    const effects = await this.flushPendingIntents(invocation);
    return { ok: true, revision: this.store.snapshot().revision, items: outcome.result, effects };
  }

  listRecurrence(): { series: RecurrenceSeries[]; ruleVersions: RecurrenceRuleVersion[]; revision: number } {
    const data = this.store.snapshot();
    return {
      series: Object.values(data.recurrenceSeries).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      ruleVersions: Object.values(data.recurrenceRuleVersions).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
      revision: data.revision,
    };
  }

  async createRecurrenceSeries(todoId: string, ruleInput: unknown, versionInput: unknown, invocation: InvocationContext, throughDate?: string): Promise<{ ok: true; series: RecurrenceSeries; source: TodoRecord; materialized: TodoRecord[]; revision: number; effects: Array<{ intentId: string; status: string; error?: string }> }> {
    const rule = normalizeRecurrenceRule(ruleInput);
    const version = expectedVersion(versionInput);
    const outcome = await this.store.transact((draft) => {
      const source = getTodo(draft, todoId);
      if (source.version !== version) throw new TodoError("conflict", "Todo changed before recurrence was created", { nextAction: "reload" });
      if (source.archivedAt || source.status !== "pending") throw new TodoError("conflict", "Only an active pending Todo can become recurring", { nextAction: "reopen_or_restore" });
      if (source.recurrenceSeriesId) throw new TodoError("conflict", "Todo already belongs to a recurrence series");
      const at = nowIso();
      const seriesId = newId("series");
      const ruleVersionId = newId("rulever");
      const series: RecurrenceSeries = {
        id: seriesId,
        sourceTodoId: source.id,
        currentRuleVersionId: ruleVersionId,
        status: "active",
        createdAt: at,
        updatedAt: at,
        version: 1,
      };
      const ruleVersion: RecurrenceRuleVersion = {
        id: ruleVersionId,
        seriesId,
        effectiveFrom: rule.anchorDate,
        rule,
        template: todoTemplate(source),
        createdAt: at,
        version: 1,
      };
      const key = recurrenceKey(seriesId, ruleVersionId, rule.anchorDate);
      source.recurrenceSeriesId = seriesId;
      source.occurrenceMeta = { seriesId, ruleVersionId, recurrenceKey: key, nominalLocalDate: rule.anchorDate };
      source.plannedFor = { kind: "date", date: rule.anchorDate };
      source.updatedAt = at;
      source.version += 1;
      draft.recurrenceSeries[seriesId] = series;
      draft.recurrenceRuleVersions[ruleVersionId] = ruleVersion;
      audit(draft, invocation, "recurrence.create", "recurrence_series", seriesId, `Created ${rule.kind} recurrence series from Todo ${todoId}`);
      return { series: clone(series), source: clone(source) };
    });
    let materialized: TodoRecord[] = [];
    if (rule.kind === "calendar") {
      const through = throughDate ?? addCalendar(rule.anchorDate, 90, "day");
      materialized = (await this.materializeRecurrence(outcome.result.series.id, rule.anchorDate, through, invocation)).items;
    }
    const effects = await this.flushPendingIntents(invocation);
    return { ok: true, series: outcome.result.series, source: outcome.result.source, materialized, revision: this.store.snapshot().revision, effects };
  }

  async materializeRecurrence(seriesId: string, fromDate: string, throughDate: string, invocation: InvocationContext): Promise<{ ok: true; items: TodoRecord[]; revision: number }> {
    timeModule.requireDate(fromDate, "fromDate");
    timeModule.requireDate(throughDate, "throughDate");
    if (fromDate > throughDate) throw new TodoError("validation", "fromDate must be on or before throughDate", { field: "fromDate" });
    const outcome = await this.store.transact((draft) => {
      const series = draft.recurrenceSeries[seriesId];
      if (!series) throw new TodoError("not_found", "Recurrence series was not found", { field: "seriesId" });
      if (series.status !== "active") return [] as TodoRecord[];
      const versions = Object.values(draft.recurrenceRuleVersions).filter((version) => version.seriesId === seriesId).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
      const created: TodoRecord[] = [];
      for (const version of versions) {
        if (version.rule.kind !== "calendar") continue;
        const start = fromDate > version.effectiveFrom ? fromDate : version.effectiveFrom;
        let end = throughDate;
        if (version.effectiveUntil && version.effectiveUntil <= end) end = addCalendar(version.effectiveUntil, -1, "day");
        if (start > end) continue;
        for (const date of materializeCalendarDates(version.rule, start, end, 500 - created.length)) {
          const key = recurrenceKey(seriesId, version.id, date);
          const suppressed = Object.values(draft.occurrenceSuppressions).some((item) => item.seriesId === seriesId && item.recurrenceKey === key);
          const existing = Object.values(draft.todos).some((todo) => todo.occurrenceMeta?.recurrenceKey === key);
          if (suppressed || existing) continue;
          const override = Object.values(draft.occurrenceOverrides).find((item) => item.seriesId === seriesId && item.recurrenceKey === key);
          const at = nowIso();
          const todo: TodoRecord = {
            id: newId("todo"),
            title: version.template.title,
            description: version.template.description,
            status: "pending",
            projectId: version.template.projectId,
            projectHistory: version.template.projectId ? [version.template.projectId] : [],
            tags: [...version.template.tags],
            priority: version.template.priority,
            plannedFor: { kind: "date", date },
            mode: version.template.mode,
            reminderTrigger: triggerForDate(version.template.reminderTrigger, date),
            agentTrigger: triggerForDate(version.template.agentTrigger, date),
            agentId: version.template.agentId,
            instructions: version.template.instructions,
            permissionMode: version.template.permissionMode,
            workspaceRef: version.template.workspaceRef,
            recurrenceSeriesId: seriesId,
            occurrenceMeta: { seriesId, ruleVersionId: version.id, recurrenceKey: key, nominalLocalDate: date, overrideId: override?.id },
            createdAt: at,
            updatedAt: at,
            version: 1,
          };
          if (override) Object.assign(todo, clone(override.patch), { id: todo.id, occurrenceMeta: todo.occurrenceMeta, recurrenceSeriesId: seriesId, createdAt: at, updatedAt: at, version: 1 });
          validateTodoAggregate(todo, draft.projects);
          draft.todos[todo.id] = todo;
          reconcileTodoEffects(draft, todo, { createMissing: true, reason: "recurrence_materialized" });
          created.push(clone(todo));
        }
      }
      const advanced = !series.materializedThrough || throughDate > series.materializedThrough;
      if (advanced) series.materializedThrough = throughDate;
      if (created.length || advanced) {
        series.updatedAt = nowIso();
        series.version += 1;
      }
      if (created.length) audit(draft, invocation, "recurrence.materialize", "recurrence_series", seriesId, `Materialized ${created.length} independent Todo occurrences through ${throughDate}`);
      return created;
    });
    await this.flushPendingIntents(invocation);
    return { ok: true, items: outcome.result, revision: this.store.snapshot().revision };
  }

  async updateRecurrence(
    todoId: string,
    scope: "only_this" | "this_and_future",
    input: { patch?: unknown; rule?: unknown; expectedVersion: unknown },
    invocation: InvocationContext,
  ): Promise<{ ok: true; todo: TodoRecord; series: RecurrenceSeries; revision: number; effects: Array<{ intentId: string; status: string; error?: string }> }> {
    const version = expectedVersion(input.expectedVersion);
    const patch = input.patch === undefined ? {} : normalizeTodoPatch(input.patch);
    const nextRule = input.rule === undefined ? undefined : normalizeRecurrenceRule(input.rule);
    const outcome = await this.store.transact((draft) => {
      const todo = getTodo(draft, todoId);
      if (todo.version !== version) throw new TodoError("conflict", "Occurrence changed before recurrence edit", { nextAction: "reload" });
      const meta = todo.occurrenceMeta;
      if (!meta) throw new TodoError("conflict", "Todo is not a recurrence occurrence");
      const series = draft.recurrenceSeries[meta.seriesId];
      if (!series) throw new TodoError("reference_conflict", "Recurrence series is missing");
      const currentVersion = draft.recurrenceRuleVersions[meta.ruleVersionId];
      if (!currentVersion) throw new TodoError("reference_conflict", "Recurrence rule version is missing");
      if (scope === "only_this") {
        const next: TodoRecord = { ...todo, ...patch, updatedAt: nowIso(), version: todo.version + 1 };
        validateTodoAggregate(next, draft.projects);
        const override: OccurrenceOverride = {
          id: newId("override"),
          seriesId: series.id,
          recurrenceKey: meta.recurrenceKey,
          patch: clone(patch),
          createdAt: nowIso(),
          version: 1,
        };
        next.occurrenceMeta = { ...meta, overrideId: override.id };
        draft.occurrenceOverrides[override.id] = override;
        draft.todos[todo.id] = next;
        reconcileTodoEffects(draft, next, { createMissing: Object.keys(patch).some((key) => ["mode", "reminderTrigger", "agentTrigger"].includes(key)), reason: "recurrence_only_this" });
        audit(draft, invocation, "recurrence.update.only_this", "todo", todo.id, "Created immutable occurrence override");
        return { todo: clone(next), series: clone(series) };
      }
      const boundary = meta.nominalLocalDate;
      const rule = nextRule ?? shiftedRule(currentVersion.rule, boundary);
      currentVersion.effectiveUntil = boundary;
      currentVersion.version += 1;
      const newRuleVersion: RecurrenceRuleVersion = {
        id: newId("rulever"),
        seriesId: series.id,
        effectiveFrom: boundary,
        rule: { ...rule, anchorDate: boundary },
        template: { ...currentVersion.template, ...clone(patch) },
        createdAt: nowIso(),
        version: 1,
      };
      draft.recurrenceRuleVersions[newRuleVersion.id] = newRuleVersion;
      series.currentRuleVersionId = newRuleVersion.id;
      series.materializedThrough = boundary;
      series.updatedAt = nowIso();
      series.version += 1;
      const nextTodo: TodoRecord = {
        ...todo,
        ...patch,
        occurrenceMeta: {
          ...meta,
          ruleVersionId: newRuleVersion.id,
          recurrenceKey: recurrenceKey(series.id, newRuleVersion.id, boundary),
        },
        updatedAt: nowIso(),
        version: todo.version + 1,
      };
      validateTodoAggregate(nextTodo, draft.projects);
      draft.todos[todo.id] = nextTodo;
      for (const future of Object.values(draft.todos).filter((item) => item.id !== todo.id && item.occurrenceMeta?.seriesId === series.id && item.occurrenceMeta.nominalLocalDate >= boundary && item.status === "pending" && !item.archivedAt)) {
        future.archivedAt = nowIso();
        future.updatedAt = future.archivedAt;
        future.version += 1;
        requestAllTodoEffectsCancelled(draft, future.id);
        const suppression: OccurrenceSuppression = {
          id: newId("suppression"),
          seriesId: series.id,
          recurrenceKey: future.occurrenceMeta!.recurrenceKey,
          reason: "series_end",
          createdAt: nowIso(),
        };
        draft.occurrenceSuppressions[suppression.id] = suppression;
      }
      reconcileTodoEffects(draft, nextTodo, { createMissing: true, reason: "recurrence_this_and_future" });
      audit(draft, invocation, "recurrence.update.this_and_future", "recurrence_series", series.id, `Created rule boundary at ${boundary}; history remains linked to prior RuleVersion`);
      return { todo: clone(nextTodo), series: clone(series) };
    });
    if (outcome.result.series.status === "active") {
      const through = addCalendar(outcome.result.todo.occurrenceMeta!.nominalLocalDate, 90, "day");
      await this.materializeRecurrence(outcome.result.series.id, outcome.result.todo.occurrenceMeta!.nominalLocalDate, through, invocation);
    }
    const effects = await this.flushPendingIntents(invocation);
    return { ok: true, ...outcome.result, revision: this.store.snapshot().revision, effects };
  }

  async setRecurrenceStatus(seriesId: string, status: "active" | "paused" | "ended", versionInput: unknown, invocation: InvocationContext): Promise<{ ok: true; series: RecurrenceSeries; revision: number }> {
    const version = expectedVersion(versionInput);
    const outcome = await this.store.transact((draft) => {
      const series = draft.recurrenceSeries[seriesId];
      if (!series) throw new TodoError("not_found", "Recurrence series was not found", { field: "seriesId" });
      if (series.version !== version) throw new TodoError("conflict", "Recurrence series changed", { nextAction: "reload" });
      series.status = status;
      series.updatedAt = nowIso();
      series.version += 1;
      if (status !== "active") {
        for (const todo of Object.values(draft.todos).filter((item) => item.occurrenceMeta?.seriesId === seriesId && item.status === "pending" && !item.archivedAt)) {
          requestAllTodoEffectsCancelled(draft, todo.id);
        }
      }
      audit(draft, invocation, `recurrence.${status}`, "recurrence_series", seriesId, `Set recurrence series to ${status}`);
      return clone(series);
    });
    await this.flushPendingIntents(invocation);
    return { ok: true, series: outcome.result, revision: this.store.snapshot().revision };
  }

  async skipOccurrence(todoId: string, versionInput: unknown, invocation: InvocationContext): Promise<MutationResult<TodoRecord>> {
    const version = expectedVersion(versionInput);
    const outcome = await this.store.transact((draft) => {
      const todo = getTodo(draft, todoId);
      if (todo.version !== version) throw new TodoError("conflict", "Occurrence changed before skip", { nextAction: "reload" });
      if (!todo.occurrenceMeta) throw new TodoError("conflict", "Todo is not a recurrence occurrence");
      todo.archivedAt = nowIso();
      todo.updatedAt = todo.archivedAt;
      todo.version += 1;
      requestAllTodoEffectsCancelled(draft, todo.id);
      const suppression: OccurrenceSuppression = {
        id: newId("suppression"),
        seriesId: todo.occurrenceMeta.seriesId,
        recurrenceKey: todo.occurrenceMeta.recurrenceKey,
        reason: "skip",
        createdAt: nowIso(),
      };
      draft.occurrenceSuppressions[suppression.id] = suppression;
      audit(draft, invocation, "recurrence.skip", "todo", todo.id, "Skipped occurrence and created stable suppression");
      return clone(todo);
    });
    const effects = await this.flushPendingIntents(invocation);
    return { ok: true, value: outcome.result, revision: this.store.snapshot().revision, effects };
  }

  listReminders(options: { todoId?: string; status?: ReminderRecord["status"]; limit?: number } = {}): { items: ReminderRecord[]; revision: number } {
    const data = this.store.snapshot();
    const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 50)));
    return {
      items: Object.values(data.reminders)
        .filter((item) => !options.todoId || item.todoId === options.todoId)
        .filter((item) => !options.status || item.status === options.status)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit),
      revision: data.revision,
    };
  }

  async retryReminder(reminderId: string, invocation: InvocationContext): Promise<{ ok: true; reminder: ReminderRecord; revision: number; effects: Array<{ intentId: string; status: string; error?: string }> }> {
    const outcome = await this.store.transact((draft) => {
      const reminder = getReminder(draft, reminderId);
      if (!["handoff_failed", "handoff_unknown"].includes(reminder.status)) throw new TodoError("conflict", "Only a failed or unknown Reminder can be retried", { nextAction: "inspect" });
      reminder.attemptCount += 1;
      retryReminderIntent(draft, reminder);
      audit(draft, invocation, "reminder.retry", "reminder", reminderId, "Explicitly retried Reminder with a new persisted registration intent");
      return clone(reminder);
    });
    const effects = await this.flushPendingIntents(invocation);
    return { ok: true, reminder: outcome.result, revision: this.store.snapshot().revision, effects };
  }

  async cancelReminder(reminderId: string, invocation: InvocationContext): Promise<{ ok: true; reminder: ReminderRecord; revision: number; effects: Array<{ intentId: string; status: string; error?: string }> }> {
    await this.store.transact((draft) => {
      const reminder = getReminder(draft, reminderId);
      if (["handed_off", "cancelled"].includes(reminder.status)) return;
      reminder.status = "cancel_requested";
      reminder.updatedAt = nowIso();
      reminder.version += 1;
      const existing = Object.values(draft.intents).find((intent) => intent.entityId === reminder.id && intent.kind === "cancel_reminder" && ["pending", "processing"].includes(intent.status));
      if (!existing) {
        const intentId = newId("intent");
        draft.intents[intentId] = {
          id: intentId,
          identity: `cancel:${reminder.identity}:${reminder.version}`,
          kind: "cancel_reminder",
          entityId: reminder.id,
          payload: { reminderId: reminder.id, taskId: reminder.taskId },
          status: "pending",
          attempts: 0,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
      }
      audit(draft, invocation, "reminder.cancel.request", "reminder", reminder.id, "Requested Reminder cancellation; local cancelled state awaits host confirmation");
    });
    const effects = await this.flushPendingIntents(invocation);
    return { ok: true, reminder: getReminder(this.store.snapshot(), reminderId), revision: this.store.snapshot().revision, effects };
  }

  async handoffReminder(reminderId: string, invocation: InvocationContext): Promise<{ ok: true; state: ReminderRecord["status"]; duplicate: boolean }> {
    const claim = await this.store.transact((draft) => {
      const reminder = getReminder(draft, reminderId);
      if (reminder.status === "handed_off") return { reminder: clone(reminder), duplicate: true, shouldEmit: false };
      if (reminder.status === "handoff_claimed") {
        // A previous process may have emitted before crashing. Fail closed: never resend automatically.
        reminder.status = "handoff_unknown";
        reminder.lastError = "Recovered a claimed Reminder after restart; delivery is unknown and requires explicit retry";
        reminder.updatedAt = nowIso();
        reminder.version += 1;
        return { reminder: clone(reminder), duplicate: true, shouldEmit: false };
      }
      if (["cancel_requested", "cancelled"].includes(reminder.status)) return { reminder: clone(reminder), duplicate: true, shouldEmit: false };
      if (!["scheduled", "pending_registration", "handoff_failed", "handoff_unknown"].includes(reminder.status)) return { reminder: clone(reminder), duplicate: true, shouldEmit: false };
      const todo = getTodo(draft, reminder.todoId);
      if (todo.archivedAt || todo.status !== "pending" || todo.mode !== "reminder") {
        reminder.status = "cancelled";
        reminder.lastError = "Reminder became ineligible before handoff";
        reminder.updatedAt = nowIso();
        reminder.version += 1;
        return { reminder: clone(reminder), duplicate: true, shouldEmit: false };
      }
      reminder.status = "handoff_claimed";
      reminder.attemptCount += 1;
      reminder.updatedAt = nowIso();
      reminder.version += 1;
      audit(draft, invocation, "reminder.claim", "reminder", reminder.id, "Atomically claimed Reminder before notification handoff");
      return { reminder: clone(reminder), todo: clone(todo), duplicate: false, shouldEmit: true };
    });
    if (!claim.result.shouldEmit || !claim.result.todo) return { ok: true, state: claim.result.reminder.status, duplicate: claim.result.duplicate };
    try {
      handoffNotification(invocation, claim.result.todo, claim.result.reminder);
      await this.store.transact((draft) => {
        const reminder = getReminder(draft, reminderId);
        if (reminder.status !== "handoff_claimed") return;
        reminder.status = "handed_off";
        reminder.handedOffAt = nowIso();
        reminder.lastError = undefined;
        reminder.updatedAt = reminder.handedOffAt;
        reminder.version += 1;
        audit(draft, invocation, "reminder.handoff", "reminder", reminder.id, "Handed Reminder to the existing global notification event; delivery receipt is not claimed");
      });
      return { ok: true, state: "handed_off", duplicate: false };
    } catch (error) {
      const normalized = asTodoError(error);
      await this.store.transact((draft) => {
        const reminder = getReminder(draft, reminderId);
        reminder.status = normalized.code === "backend_unavailable" ? "handoff_unknown" : "handoff_failed";
        reminder.lastError = normalized.message;
        reminder.updatedAt = nowIso();
        reminder.version += 1;
        audit(draft, invocation, "reminder.handoff.failed", "reminder", reminder.id, normalized.message);
      });
      return { ok: true, state: normalized.code === "backend_unavailable" ? "handoff_unknown" : "handoff_failed", duplicate: false };
    }
  }

  listRuns(options: { todoId?: string; status?: AutomationRun["status"]; limit?: number } = {}): { items: AutomationRun[]; revision: number } {
    const data = this.store.snapshot();
    const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 50)));
    return {
      items: Object.values(data.runs)
        .filter((item) => !options.todoId || item.todoId === options.todoId)
        .filter((item) => !options.status || item.status === options.status)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit),
      revision: data.revision,
    };
  }

  getRunDetails(runId: string): { run: AutomationRun; attempts: AutomationAttempt[]; todo: TodoRecord; revision: number } {
    const data = this.store.snapshot();
    const run = getRun(data, runId);
    const todo = getTodo(data, run.todoId);
    const attempts = Object.values(data.attempts)
      .filter((item) => item.runId === runId)
      .sort((a, b) => a.attemptNumber - b.attemptNumber);
    return { run: clone(run), attempts: clone(attempts), todo: clone(todo), revision: data.revision };
  }

  async retryRun(runId: string, invocation: InvocationContext, runAt = nowIso()): Promise<{ ok: true; run: AutomationRun; revision: number; effects: Array<{ intentId: string; status: string; error?: string }> }> {
    const parsedRunAt = new Date(runAt);
    if (!Number.isFinite(parsedRunAt.getTime())) throw new TodoError("validation", "runAt must be a valid ISO timestamp", { field: "runAt" });
    const outcome = await this.store.transact((draft) => {
      const run = getRun(draft, runId);
      if (!["failed", "needs_action", "cancelled"].includes(run.status)) {
        throw new TodoError("conflict", "Only a failed, needs-action, or cancelled Run can be retried", { nextAction: "inspect" });
      }
      const todo = getTodo(draft, run.todoId);
      if (todo.archivedAt || todo.status !== "pending" || todo.mode !== "agent_execute") {
        throw new TodoError("conflict", "The Todo is not eligible for Agent execution", { nextAction: "restore_or_reconfigure" });
      }
      validateTodoAggregate(todo, draft.projects);
      retryRunIntent(draft, run, parsedRunAt.toISOString());
      audit(draft, invocation, "automation.retry", "automation_run", run.id, "Created a new persisted TaskRegistry registration intent; no prior Session was reused");
      return clone(run);
    });
    const effects = await this.flushPendingIntents(invocation);
    return { ok: true, run: outcome.result, revision: this.store.snapshot().revision, effects };
  }

  async cancelRun(runId: string, invocation: InvocationContext): Promise<{ ok: true; run: AutomationRun; revision: number; effects: Array<{ intentId: string; status: string; error?: string }> }> {
    await this.store.transact((draft) => {
      const run = getRun(draft, runId);
      if (["succeeded", "failed", "needs_action", "cancelled"].includes(run.status)) return;
      run.status = "cancel_requested";
      run.updatedAt = nowIso();
      run.version += 1;
      const attempt = run.currentAttemptId ? draft.attempts[run.currentAttemptId] : undefined;
      if (attempt && !["succeeded", "failed", "needs_action", "cancelled"].includes(attempt.status)) {
        attempt.status = "cancel_requested";
        attempt.updatedAt = nowIso();
        attempt.version += 1;
      }
      const existing = Object.values(draft.intents).find((intent) => intent.entityId === run.id && intent.kind === "cancel_run" && ["pending", "processing"].includes(intent.status));
      if (!existing) {
        const id = newId("intent");
        draft.intents[id] = {
          id,
          identity: `cancel:${run.identity}:${run.currentAttemptId ?? "schedule"}:${run.version}`,
          kind: "cancel_run",
          entityId: run.id,
          payload: { runId: run.id, taskId: run.taskId, attemptId: run.currentAttemptId },
          status: "pending",
          attempts: 0,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
      }
      audit(draft, invocation, "automation.cancel.request", "automation_run", run.id, "Requested cancellation; cancelled state awaits host confirmation");
    });
    const effects = await this.flushPendingIntents(invocation);
    return { ok: true, run: clone(getRun(this.store.snapshot(), runId)), revision: this.store.snapshot().revision, effects };
  }

  async startRun(runId: string, invocation: InvocationContext): Promise<{ ok: true; run: AutomationRun; attempt?: AutomationAttempt; duplicate: boolean; accepted: boolean }> {
    if (this.disposed) throw new TodoError("backend_unavailable", "Todo runtime is disposed", { recoverable: true });
    const claim = await this.store.transact((draft) => {
      const run = getRun(draft, runId);
      const todo = getTodo(draft, run.todoId);
      if (["succeeded", "failed", "needs_action", "cancelled"].includes(run.status)) {
        return { run: clone(run), todo: clone(todo), attempt: run.currentAttemptId ? clone(draft.attempts[run.currentAttemptId]) : undefined, duplicate: true, start: false };
      }
      if (run.status === "cancel_requested") {
        return { run: clone(run), todo: clone(todo), attempt: run.currentAttemptId ? clone(draft.attempts[run.currentAttemptId]) : undefined, duplicate: true, start: false };
      }
      if (run.status === "running" && run.currentAttemptId) {
        const attempt = draft.attempts[run.currentAttemptId];
        return { run: clone(run), todo: clone(todo), attempt: attempt ? clone(attempt) : undefined, duplicate: true, start: false };
      }
      if (todo.archivedAt || todo.status !== "pending" || todo.mode !== "agent_execute") {
        run.status = "needs_action";
        run.lastError = "Todo became ineligible before Agent execution";
        run.updatedAt = nowIso();
        run.version += 1;
        audit(draft, invocation, "automation.ineligible", "automation_run", run.id, run.lastError);
        return { run: clone(run), todo: clone(todo), attempt: undefined, duplicate: false, start: false };
      }
      validateTodoAggregate(todo, draft.projects);
      const previous = Object.values(draft.attempts).filter((item) => item.runId === run.id);
      const at = nowIso();
      const attempt: AutomationAttempt = {
        id: newId("attempt"),
        runId: run.id,
        attemptNumber: previous.reduce((max, item) => Math.max(max, item.attemptNumber), 0) + 1,
        status: "running",
        startedAt: at,
        createdAt: at,
        updatedAt: at,
        version: 1,
      };
      draft.attempts[attempt.id] = attempt;
      run.status = "running";
      run.currentAttemptId = attempt.id;
      run.lastError = undefined;
      run.resultSummary = undefined;
      run.updatedAt = at;
      run.version += 1;
      audit(draft, invocation, "automation.claim", "automation_run", run.id, `Claimed Run and created Attempt ${attempt.attemptNumber}`);
      return { run: clone(run), todo: clone(todo), attempt: clone(attempt), duplicate: false, start: true };
    });

    if (!claim.result.start || !claim.result.attempt) {
      const existingAttempt = claim.result.attempt;
      if (existingAttempt?.sessionRef && existingAttempt.status === "running" && !this.subscriptions.has(existingAttempt.id)) {
        this.installSessionSubscription(runId, existingAttempt.id, existingAttempt.sessionRef, invocation);
      }
      return { ok: true, run: claim.result.run, attempt: existingAttempt, duplicate: claim.result.duplicate, accepted: false };
    }

    const attemptId = claim.result.attempt.id;
    let sessionRef: string | undefined;
    try {
      const workspacePath = await materializeWorkspace(invocation, claim.result.todo);
      const created = await createAutomationSession(invocation, claim.result.todo, workspacePath);
      sessionRef = created.sessionRef;
      await this.store.transact((draft) => {
        const run = getRun(draft, runId);
        const attempt = draft.attempts[attemptId];
        if (!attempt) throw new TodoError("reference_conflict", "Automation Attempt disappeared before Session attachment");
        if (run.currentAttemptId !== attempt.id || run.status !== "running") return;
        attempt.sessionRef = created.sessionRef;
        attempt.updatedAt = nowIso();
        attempt.version += 1;
        audit(draft, invocation, "automation.session.created", "automation_attempt", attempt.id, "Attached a plugin-private Session reference; no completion was claimed");
      });
      this.installSessionSubscription(runId, attemptId, created.sessionRef, invocation);
      const current = this.store.snapshot();
      await sendAutomationMessage(invocation, created.sessionRef, getTodo(current, claim.result.todo.id), getRun(current, runId), current.attempts[attemptId]!);
      return { ok: true, run: clone(getRun(this.store.snapshot(), runId)), attempt: clone(this.store.snapshot().attempts[attemptId]), duplicate: false, accepted: true };
    } catch (error) {
      const normalized = asTodoError(error);
      const unsubscribe = this.subscriptions.get(attemptId);
      if (unsubscribe) {
        try { unsubscribe(); } catch { /* best effort */ }
        this.subscriptions.delete(attemptId);
      }
      await this.store.transact((draft) => {
        const run = getRun(draft, runId);
        const attempt = draft.attempts[attemptId];
        if (!attempt || ["succeeded", "cancelled"].includes(attempt.status)) return;
        const needsAction = normalized.code === "capability" || normalized.code === "backend_unavailable";
        attempt.status = needsAction ? "needs_action" : "failed";
        attempt.diagnostic = redactText(normalized.message);
        attempt.finishedAt = nowIso();
        attempt.updatedAt = attempt.finishedAt;
        attempt.version += 1;
        if (run.currentAttemptId === attempt.id) {
          run.status = needsAction ? "needs_action" : "failed";
          run.lastError = attempt.diagnostic;
          run.updatedAt = attempt.updatedAt;
          run.version += 1;
        }
        audit(draft, invocation, "automation.start.failed", "automation_attempt", attempt.id, attempt.diagnostic ?? "Automation start failed");
      });
      if (sessionRef) {
        // A created Session is never deleted; best-effort abort prevents accidental background work.
        try { await abortAutomationSession(invocation, sessionRef); } catch { /* captured by diagnostic above */ }
      }
      return { ok: true, run: clone(getRun(this.store.snapshot(), runId)), attempt: clone(this.store.snapshot().attempts[attemptId]), duplicate: false, accepted: false };
    }
  }

  async recordSessionTerminal(runId: string, attemptId: string, event: unknown, invocation: InvocationContext): Promise<boolean> {
    const terminal = classifySessionTerminal(event);
    if (!terminal) return false;
    const changed = await this.store.transact((draft) => {
      const run = draft.runs[runId];
      const attempt = draft.attempts[attemptId];
      if (!run || !attempt || attempt.runId !== run.id) return false;
      if (["succeeded", "failed", "needs_action", "cancelled"].includes(attempt.status)) return false;
      const at = nowIso();
      attempt.status = terminal.state;
      attempt.finishedAt = at;
      attempt.updatedAt = at;
      attempt.version += 1;
      if (terminal.state === "succeeded") attempt.resultSummary = redactText(terminal.summary ?? "Agent Session completed");
      else attempt.diagnostic = redactText(terminal.diagnostic ?? `Agent Session ended with ${terminal.state}`);
      if (run.currentAttemptId === attempt.id) {
        run.status = terminal.state;
        run.resultSummary = terminal.state === "succeeded" ? attempt.resultSummary : undefined;
        run.lastError = terminal.state === "succeeded" ? undefined : attempt.diagnostic;
        run.updatedAt = at;
        run.version += 1;
      }
      audit(draft, invocation, `automation.${terminal.state}`, "automation_attempt", attempt.id, terminal.state === "succeeded" ? "Host Session emitted a terminal success event" : `Host Session emitted ${terminal.state}`);
      return true;
    });
    if (changed.result) {
      const unsubscribe = this.subscriptions.get(attemptId);
      if (unsubscribe) {
        try { unsubscribe(); } catch { /* best effort */ }
        this.subscriptions.delete(attemptId);
      }
    }
    return changed.result;
  }

  async setTaskBackend(state: StoreData["runtime"]["taskBackend"], invocation: InvocationContext, error?: string): Promise<void> {
    await this.store.transact((draft) => {
      draft.runtime.taskBackend = state;
      draft.runtime.lastReadinessAt = nowIso();
      draft.runtime.lastReadinessError = error ? redactText(error) : undefined;
      audit(draft, invocation, "runtime.task_backend", "runtime", undefined, error ? `${state}: ${redactText(error)}` : state);
    });
  }

  async recoverPendingIntents(invocation: InvocationContext): Promise<Array<{ intentId: string; status: string; error?: string }>> {
    await this.store.transact((draft) => {
      for (const intent of Object.values(draft.intents)) {
        if (intent.status === "processing") {
          intent.status = "pending";
          intent.lastError = "Recovered an interrupted side-effect attempt";
          intent.updatedAt = nowIso();
        }
      }
      for (const reminder of Object.values(draft.reminders)) {
        if (reminder.status === "handoff_claimed") {
          reminder.status = "handoff_unknown";
          reminder.lastError = "Recovered after an interrupted notification handoff; explicit retry is required";
          reminder.updatedAt = nowIso();
          reminder.version += 1;
        }
      }
      for (const run of Object.values(draft.runs)) {
        if (run.status !== "running" || !run.currentAttemptId) continue;
        const attempt = draft.attempts[run.currentAttemptId];
        if (!attempt || !attempt.sessionRef) {
          run.status = "needs_action";
          run.lastError = "Recovered a running Run without a durable Session reference";
          run.updatedAt = nowIso();
          run.version += 1;
          if (attempt) {
            attempt.status = "needs_action";
            attempt.diagnostic = run.lastError;
            attempt.finishedAt = nowIso();
            attempt.updatedAt = attempt.finishedAt;
            attempt.version += 1;
          }
        }
      }
      audit(draft, invocation, "runtime.recover", "runtime", undefined, "Recovered interrupted intents and fail-closed state transitions");
    });
    const snapshot = this.store.snapshot();
    for (const run of Object.values(snapshot.runs)) {
      if (run.status !== "running" || !run.currentAttemptId) continue;
      const attempt = snapshot.attempts[run.currentAttemptId];
      if (attempt?.sessionRef && !this.subscriptions.has(attempt.id)) this.installSessionSubscription(run.id, attempt.id, attempt.sessionRef, invocation);
    }
    return this.flushPendingIntents(invocation);
  }

  async flushPendingIntents(invocation: InvocationContext, options: { includeFailed?: boolean; limit?: number } = {}): Promise<Array<{ intentId: string; status: string; error?: string }>> {
    const results: Array<{ intentId: string; status: string; error?: string }> = [];
    const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 100)));
    for (let index = 0; index < limit; index += 1) {
      const pending = this.store.snapshot();
      const next = Object.values(pending.intents)
        .filter((intent) => intent.status === "pending" || (options.includeFailed && intent.status === "failed"))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!next) break;
      const claimed = await this.store.transact((draft) => {
        const intent = draft.intents[next.id];
        if (!intent || !(intent.status === "pending" || (options.includeFailed && intent.status === "failed"))) return false;
        intent.status = "processing";
        intent.attempts += 1;
        intent.updatedAt = nowIso();
        intent.lastError = undefined;
        return true;
      });
      if (!claimed.result) continue;
      try {
        const snapshot = this.store.snapshot();
        const intent = snapshot.intents[next.id];
        if (!intent) continue;
        switch (intent.kind) {
          case "schedule_reminder": {
            const reminder = getReminder(snapshot, intent.entityId);
            if (reminder.status === "cancel_requested" || reminder.status === "cancelled") break;
            const taskId = await scheduleReminder(invocation, reminder);
            await this.store.transact((draft) => {
              const currentIntent = draft.intents[intent.id];
              const current = draft.reminders[reminder.id];
              if (current && current.status === "pending_registration") {
                current.taskId = taskId;
                current.status = "scheduled";
                current.lastError = undefined;
                current.updatedAt = nowIso();
                current.version += 1;
              }
              if (currentIntent) {
                currentIntent.status = "confirmed";
                currentIntent.updatedAt = nowIso();
              }
              audit(draft, invocation, "reminder.schedule.confirmed", "reminder", reminder.id, `TaskRegistry confirmed schedule ${taskId}`);
            });
            break;
          }
          case "cancel_reminder": {
            const reminder = getReminder(snapshot, intent.entityId);
            if (reminder.taskId) {
              const removed = await unschedule(invocation, reminder.taskId);
              if (!removed) {
                throw new TodoError("capability", "TaskRegistry did not confirm Reminder cancellation", {
                  recoverable: true,
                  nextAction: "retry",
                });
              }
            }
            await this.store.transact((draft) => {
              const currentIntent = draft.intents[intent.id];
              const current = draft.reminders[reminder.id];
              if (current) {
                current.status = "cancelled";
                current.lastError = undefined;
                current.updatedAt = nowIso();
                current.version += 1;
              }
              if (currentIntent) {
                currentIntent.status = "confirmed";
                currentIntent.updatedAt = nowIso();
              }
              audit(draft, invocation, "reminder.cancel.confirmed", "reminder", reminder.id, "TaskRegistry confirmed Reminder cancellation");
            });
            break;
          }
          case "schedule_run": {
            const run = getRun(snapshot, intent.entityId);
            const todo = getTodo(snapshot, run.todoId);
            if (run.status === "cancel_requested" || run.status === "cancelled") break;
            const taskId = await scheduleAutomation(invocation, run, todo);
            await this.store.transact((draft) => {
              const currentIntent = draft.intents[intent.id];
              const current = draft.runs[run.id];
              if (current && current.status === "pending_registration") {
                current.taskId = taskId;
                current.status = "scheduled";
                current.lastError = undefined;
                current.updatedAt = nowIso();
                current.version += 1;
              }
              if (currentIntent) {
                currentIntent.status = "confirmed";
                currentIntent.updatedAt = nowIso();
              }
              audit(draft, invocation, "automation.schedule.confirmed", "automation_run", run.id, `TaskRegistry confirmed schedule ${taskId}`);
            });
            break;
          }
          case "cancel_run": {
            const run = getRun(snapshot, intent.entityId);
            const attempt = run.currentAttemptId ? snapshot.attempts[run.currentAttemptId] : undefined;
            let sessionConfirmed = false;
            if (attempt?.sessionRef) {
              const aborted = await abortAutomationSession(invocation, attempt.sessionRef);
              if (!aborted) throw new TodoError("capability", "Session host did not confirm cancellation", { recoverable: true, nextAction: "retry" });
              sessionConfirmed = true;
            }
            if (run.taskId) {
              const removed = await unschedule(invocation, run.taskId);
              if (!removed && !sessionConfirmed) {
                throw new TodoError("capability", "TaskRegistry did not confirm Automation cancellation", {
                  recoverable: true,
                  nextAction: "retry",
                });
              }
            }
            await this.store.transact((draft) => {
              const currentIntent = draft.intents[intent.id];
              const current = draft.runs[run.id];
              if (current) {
                current.status = "cancelled";
                current.lastError = undefined;
                current.updatedAt = nowIso();
                current.version += 1;
                const currentAttempt = current.currentAttemptId ? draft.attempts[current.currentAttemptId] : undefined;
                if (currentAttempt && !["succeeded", "failed", "needs_action", "cancelled"].includes(currentAttempt.status)) {
                  currentAttempt.status = "cancelled";
                  currentAttempt.finishedAt = nowIso();
                  currentAttempt.updatedAt = currentAttempt.finishedAt;
                  currentAttempt.version += 1;
                }
              }
              if (currentIntent) {
                currentIntent.status = "confirmed";
                currentIntent.updatedAt = nowIso();
              }
              audit(draft, invocation, "automation.cancel.confirmed", "automation_run", run.id, "TaskRegistry/Session host confirmed cancellation");
            });
            break;
          }
        }
        const finalIntent = this.store.snapshot().intents[next.id];
        if (finalIntent?.status === "processing") {
          // An obsolete scheduling intent can become a no-op after a concurrent cancel.
          await this.store.transact((draft) => {
            const current = draft.intents[next.id];
            if (current?.status === "processing") {
              current.status = "confirmed";
              current.updatedAt = nowIso();
            }
          });
        }
        results.push({ intentId: next.id, status: this.store.snapshot().intents[next.id]?.status ?? "confirmed" });
      } catch (error) {
        const normalized = asTodoError(error);
        await this.store.transact((draft) => {
          const intent = draft.intents[next.id];
          if (!intent) return;
          intent.status = "failed";
          intent.lastError = redactText(normalized.message);
          intent.updatedAt = nowIso();
          const reminder = intent.kind.includes("reminder") ? draft.reminders[intent.entityId] : undefined;
          if (reminder) {
            reminder.lastError = intent.lastError;
            reminder.updatedAt = nowIso();
            reminder.version += 1;
          }
          const run = intent.kind.includes("run") ? draft.runs[intent.entityId] : undefined;
          if (run) {
            run.lastError = intent.lastError;
            run.updatedAt = nowIso();
            run.version += 1;
          }
          audit(draft, invocation, `${intent.kind}.failed`, intent.kind.includes("run") ? "automation_run" : "reminder", intent.entityId, intent.lastError ?? "Host side effect failed");
        });
        results.push({ intentId: next.id, status: "failed", error: redactText(normalized.message) });
      }
    }
    return results;
  }

  private installSessionSubscription(runId: string, attemptId: string, sessionRef: string, invocation: InvocationContext): void {
    if (this.subscriptions.has(attemptId)) return;
    try {
      const unsubscribe = subscribeToSession(invocation, sessionRef, (event) => {
        if (!classifySessionTerminal(event)) return;
        void this.recordSessionTerminal(runId, attemptId, event, invocation).catch((error) => invocation.log?.error?.("todolist session terminal update failed", error));
      });
      this.subscriptions.set(attemptId, unsubscribe);
    } catch (error) {
      invocation.log?.warn?.("todolist could not subscribe to Session events", asTodoError(error).message);
    }
  }

  private spawnAfterCompletionOccurrence(draft: StoreData, completed: TodoRecord, invocation: InvocationContext): TodoRecord | undefined {
    const meta = completed.occurrenceMeta;
    if (!meta || !completed.completedAt) return undefined;
    const series = draft.recurrenceSeries[meta.seriesId];
    if (!series || series.status !== "active") return undefined;
    const version = draft.recurrenceRuleVersions[meta.ruleVersionId] ?? activeRuleVersion(Object.values(draft.recurrenceRuleVersions).filter((item) => item.seriesId === series.id), meta.nominalLocalDate);
    if (!version || version.rule.kind !== "after_completion") return undefined;
    const completedDate = localToday(version.rule.timeZone, new Date(completed.completedAt));
    const nextDate = nextAfterCompletion(version.rule, completedDate);
    const key = recurrenceKey(series.id, version.id, nextDate);
    if (Object.values(draft.todos).some((todo) => todo.occurrenceMeta?.recurrenceKey === key)) return undefined;
    if (Object.values(draft.occurrenceSuppressions).some((item) => item.seriesId === series.id && item.recurrenceKey === key)) return undefined;
    const at = nowIso();
    const todo: TodoRecord = {
      id: newId("todo"),
      title: version.template.title,
      description: version.template.description,
      status: "pending",
      projectId: version.template.projectId,
      projectHistory: version.template.projectId ? [version.template.projectId] : [],
      tags: [...version.template.tags],
      priority: version.template.priority,
      plannedFor: { kind: "date", date: nextDate },
      mode: version.template.mode,
      reminderTrigger: triggerForDate(version.template.reminderTrigger, nextDate),
      agentTrigger: triggerForDate(version.template.agentTrigger, nextDate),
      agentId: version.template.agentId,
      instructions: version.template.instructions,
      permissionMode: version.template.permissionMode,
      workspaceRef: version.template.workspaceRef,
      recurrenceSeriesId: series.id,
      occurrenceMeta: { seriesId: series.id, ruleVersionId: version.id, recurrenceKey: key, nominalLocalDate: nextDate },
      createdAt: at,
      updatedAt: at,
      version: 1,
    };
    validateTodoAggregate(todo, draft.projects);
    draft.todos[todo.id] = todo;
    reconcileTodoEffects(draft, todo, { createMissing: true, reason: "recurrence_after_completion" });
    series.materializedThrough = nextDate;
    series.updatedAt = at;
    series.version += 1;
    audit(draft, invocation, "recurrence.after_completion", "todo", todo.id, `Created independent occurrence ${key}`);
    return clone(todo);
  }
}
