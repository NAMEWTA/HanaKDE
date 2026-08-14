import { TodoError } from "../errors.ts";
import {
  EXCHANGE_SCHEMA_VERSION,
  type AutomationAttempt,
  type AutomationRun,
  type ImportDiagnostic,
  type ImportPreview,
  type OccurrenceOverride,
  type OccurrenceSuppression,
  type ProjectRecord,
  type RecurrenceRuleVersion,
  type RecurrenceSeries,
  type ReminderRecord,
  type StoreData,
  type TodoExchangeDocumentV1,
  type TodoRecord,
} from "../domain/model.ts";
import { clone, newId, nowIso, requireRecord, requiredString, sha256, stableJson } from "../domain/utils.ts";
import {
  normalizeDescription,
  normalizeRecurrenceRule,
  normalizeResourceRef,
  normalizeTags,
  normalizeTitle,
  normalizeTodoPatch,
  validateTodoAggregate,
} from "../domain/validation.ts";
import type { InvocationContext } from "../interfaces/context.ts";
import { TodoStore } from "../infrastructure/store.ts";

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_ENTITIES = 10_000;
const PREVIEW_TTL_MS = 15 * 60_000;

type EntityWithId = { id: string };

function sourceValue(source: unknown): unknown {
  if (typeof source !== "string") return source;
  if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) {
    throw new TodoError("validation", "Import source exceeds the 5 MiB limit", { field: "source" });
  }
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new TodoError("validation", "Import source must be valid JSON", { field: "source" });
  }
}

function arrayOf<T extends EntityWithId>(record: Record<string, unknown>, key: string): T[] {
  const value = record[key];
  if (!Array.isArray(value)) throw new TodoError("validation", `${key} must be an array`, { field: key });
  return value.map((item, index) => {
    const entity = requireRecord(item, `${key}[${index}]`);
    requiredString(entity.id, `${key}[${index}].id`, 240);
    return clone(entity as T);
  });
}

function parseDocument(source: unknown): TodoExchangeDocumentV1 {
  const parsed = requireRecord(sourceValue(source), "source");
  if (parsed.schema !== "hana.todolist.exchange") throw new TodoError("validation", "Unsupported import schema", { field: "schema" });
  if (parsed.version !== EXCHANGE_SCHEMA_VERSION) throw new TodoError("validation", `Unsupported exchange version ${String(parsed.version)}`, { field: "version" });
  const document: TodoExchangeDocumentV1 = {
    schema: "hana.todolist.exchange",
    version: EXCHANGE_SCHEMA_VERSION,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : nowIso(),
    todos: arrayOf<TodoRecord>(parsed, "todos"),
    projects: arrayOf<ProjectRecord>(parsed, "projects"),
    recurrenceSeries: arrayOf<RecurrenceSeries>(parsed, "recurrenceSeries"),
    recurrenceRuleVersions: arrayOf<RecurrenceRuleVersion>(parsed, "recurrenceRuleVersions"),
    occurrenceOverrides: arrayOf<OccurrenceOverride>(parsed, "occurrenceOverrides"),
    occurrenceSuppressions: arrayOf<OccurrenceSuppression>(parsed, "occurrenceSuppressions"),
    reminders: arrayOf<ReminderRecord>(parsed, "reminders"),
    runs: arrayOf<AutomationRun>(parsed, "runs"),
    attempts: arrayOf<AutomationAttempt>(parsed, "attempts"),
  };
  const total = Object.entries(document)
    .filter(([, value]) => Array.isArray(value))
    .reduce((sum, [, value]) => sum + (value as unknown[]).length, 0);
  if (total > MAX_ENTITIES) throw new TodoError("validation", `Import contains more than ${MAX_ENTITIES} entities`, { field: "source" });
  return document;
}

function diagnostic(severity: ImportDiagnostic["severity"], code: string, message: string, path?: string): ImportDiagnostic {
  return { severity, code, message, path };
}

function duplicateDiagnostics<T extends EntityWithId>(items: T[], collection: keyof StoreData, target: StoreData): ImportDiagnostic[] {
  const diagnostics: ImportDiagnostic[] = [];
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) diagnostics.push(diagnostic("error", "duplicate_id", `Duplicate id ${item.id} inside import`, `${String(collection)}[${index}].id`));
    seen.add(item.id);
    const targetMap = target[collection];
    if (targetMap && typeof targetMap === "object" && item.id in (targetMap as Record<string, unknown>)) {
      diagnostics.push(diagnostic("error", "target_conflict", `Id ${item.id} already exists`, `${String(collection)}[${index}].id`));
    }
  });
  return diagnostics;
}

function validateDocument(document: TodoExchangeDocumentV1, target: StoreData): ImportDiagnostic[] {
  const diagnostics: ImportDiagnostic[] = [];
  diagnostics.push(...duplicateDiagnostics(document.todos, "todos", target));
  diagnostics.push(...duplicateDiagnostics(document.projects, "projects", target));
  diagnostics.push(...duplicateDiagnostics(document.recurrenceSeries, "recurrenceSeries", target));
  diagnostics.push(...duplicateDiagnostics(document.recurrenceRuleVersions, "recurrenceRuleVersions", target));
  diagnostics.push(...duplicateDiagnostics(document.occurrenceOverrides, "occurrenceOverrides", target));
  diagnostics.push(...duplicateDiagnostics(document.occurrenceSuppressions, "occurrenceSuppressions", target));
  diagnostics.push(...duplicateDiagnostics(document.reminders, "reminders", target));
  diagnostics.push(...duplicateDiagnostics(document.runs, "runs", target));
  diagnostics.push(...duplicateDiagnostics(document.attempts, "attempts", target));

  const projects = { ...target.projects, ...Object.fromEntries(document.projects.map((item) => [item.id, item])) };
  const todoIds = new Set([...Object.keys(target.todos), ...document.todos.map((item) => item.id)]);
  const seriesIds = new Set([...Object.keys(target.recurrenceSeries), ...document.recurrenceSeries.map((item) => item.id)]);
  const versionIds = new Set([...Object.keys(target.recurrenceRuleVersions), ...document.recurrenceRuleVersions.map((item) => item.id)]);
  const runIds = new Set([...Object.keys(target.runs), ...document.runs.map((item) => item.id)]);

  document.projects.forEach((project, index) => {
    try {
      project.name = normalizeTitle(project.name, `projects[${index}].name`);
      if (!Number.isInteger(project.version) || project.version < 1) throw new TodoError("validation", "Project version must be a positive integer");
    } catch (error) {
      diagnostics.push(diagnostic("error", "invalid_project", error instanceof Error ? error.message : "Invalid project", `projects[${index}]`));
    }
  });

  document.todos.forEach((todo, index) => {
    try {
      todo.title = normalizeTitle(todo.title, `todos[${index}].title`);
      todo.description = normalizeDescription(todo.description, `todos[${index}].description`);
      todo.tags = normalizeTags(todo.tags, `todos[${index}].tags`);
      validateTodoAggregate(todo, projects);
      if (!Number.isInteger(todo.version) || todo.version < 1) throw new TodoError("validation", "Todo version must be a positive integer");
      if (todo.occurrenceMeta) {
        if (!seriesIds.has(todo.occurrenceMeta.seriesId)) throw new TodoError("reference_conflict", "Occurrence series is missing");
        if (!versionIds.has(todo.occurrenceMeta.ruleVersionId)) throw new TodoError("reference_conflict", "Occurrence rule version is missing");
      }
    } catch (error) {
      diagnostics.push(diagnostic("error", "invalid_todo", error instanceof Error ? error.message : "Invalid Todo", `todos[${index}]`));
    }
  });

  document.recurrenceSeries.forEach((series, index) => {
    if (!todoIds.has(series.sourceTodoId)) diagnostics.push(diagnostic("error", "dangling_source_todo", `Series ${series.id} references a missing source Todo`, `recurrenceSeries[${index}].sourceTodoId`));
    if (!versionIds.has(series.currentRuleVersionId)) diagnostics.push(diagnostic("error", "dangling_rule_version", `Series ${series.id} references a missing RuleVersion`, `recurrenceSeries[${index}].currentRuleVersionId`));
  });
  document.recurrenceRuleVersions.forEach((version, index) => {
    if (!seriesIds.has(version.seriesId)) diagnostics.push(diagnostic("error", "dangling_series", `RuleVersion ${version.id} references a missing series`, `recurrenceRuleVersions[${index}].seriesId`));
    try {
      version.rule = normalizeRecurrenceRule(version.rule);
      version.template.title = normalizeTitle(version.template.title, `recurrenceRuleVersions[${index}].template.title`);
      version.template.description = normalizeDescription(version.template.description, `recurrenceRuleVersions[${index}].template.description`);
      version.template.tags = normalizeTags(version.template.tags, `recurrenceRuleVersions[${index}].template.tags`);
      version.template.workspaceRef = normalizeResourceRef(version.template.workspaceRef, `recurrenceRuleVersions[${index}].template.workspaceRef`);
      validateTodoAggregate({
        id: `exchange-template-${index}`,
        ...version.template,
        status: "pending",
        projectHistory: version.template.projectId ? [version.template.projectId] : [],
        createdAt: version.createdAt,
        updatedAt: version.createdAt,
        version: 1,
      }, projects);
      if (!Number.isInteger(version.version) || version.version < 1) throw new TodoError("validation", "RuleVersion version must be a positive integer");
    } catch (error) {
      diagnostics.push(diagnostic("error", "invalid_rule_version", error instanceof Error ? error.message : "Invalid RuleVersion", `recurrenceRuleVersions[${index}]`));
    }
  });
  document.occurrenceOverrides.forEach((override, index) => {
    if (!seriesIds.has(override.seriesId)) diagnostics.push(diagnostic("error", "dangling_series", `Override ${override.id} references a missing series`, `occurrenceOverrides[${index}].seriesId`));
    try {
      override.patch = normalizeTodoPatch(override.patch);
      if (!Number.isInteger(override.version) || override.version < 1) throw new TodoError("validation", "Override version must be a positive integer");
    } catch (error) {
      diagnostics.push(diagnostic("error", "invalid_override", error instanceof Error ? error.message : "Invalid occurrence override", `occurrenceOverrides[${index}]`));
    }
  });
  document.occurrenceSuppressions.forEach((suppression, index) => {
    if (!seriesIds.has(suppression.seriesId)) diagnostics.push(diagnostic("error", "dangling_series", `Suppression ${suppression.id} references a missing series`, `occurrenceSuppressions[${index}].seriesId`));
  });
  document.reminders.forEach((reminder, index) => {
    if (!todoIds.has(reminder.todoId)) diagnostics.push(diagnostic("error", "dangling_todo", `Reminder ${reminder.id} references a missing Todo`, `reminders[${index}].todoId`));
  });
  document.runs.forEach((run, index) => {
    if (!todoIds.has(run.todoId)) diagnostics.push(diagnostic("error", "dangling_todo", `Run ${run.id} references a missing Todo`, `runs[${index}].todoId`));
  });
  document.attempts.forEach((attempt, index) => {
    if (!runIds.has(attempt.runId)) diagnostics.push(diagnostic("error", "dangling_run", `Attempt ${attempt.id} references a missing Run`, `attempts[${index}].runId`));
  });
  return diagnostics;
}

function safeForImport(document: TodoExchangeDocumentV1): TodoExchangeDocumentV1 {
  const next = clone(document);
  next.reminders = next.reminders.map((item) => {
    if (["pending_registration", "scheduled", "handoff_claimed", "cancel_requested"].includes(item.status)) {
      return { ...item, taskId: undefined, status: "handoff_unknown", lastError: "Imported without reactivating the source TaskRegistry schedule", updatedAt: nowIso(), version: item.version + 1 };
    }
    return { ...item, taskId: undefined };
  });
  next.runs = next.runs.map((item) => {
    if (["pending_registration", "scheduled", "running", "cancel_requested"].includes(item.status)) {
      return { ...item, taskId: undefined, status: "needs_action", lastError: "Imported without reusing the source Session or TaskRegistry schedule", updatedAt: nowIso(), version: item.version + 1 };
    }
    return { ...item, taskId: undefined };
  });
  next.attempts = next.attempts.map((item) => {
    if (["queued", "running", "cancel_requested"].includes(item.status)) {
      return { ...item, sessionRef: undefined, status: "needs_action", diagnostic: "Imported without reusing the source Session", finishedAt: nowIso(), updatedAt: nowIso(), version: item.version + 1 };
    }
    return { ...item, sessionRef: undefined };
  });
  return next;
}

function insert<T extends EntityWithId>(target: Record<string, T>, items: T[]): void {
  for (const item of items) target[item.id] = clone(item);
}

export class TodoExchange {
  private readonly store: TodoStore;

  constructor(store: TodoStore) {
    this.store = store;
  }

  exportDocument(options: { includeTrash?: boolean } = {}): TodoExchangeDocumentV1 {
    const data = this.store.snapshot();
    const todos = Object.values(data.todos).filter((todo) => options.includeTrash || !todo.archivedAt);
    const todoIds = new Set(todos.map((todo) => todo.id));
    const reminders = Object.values(data.reminders).filter((item) => todoIds.has(item.todoId));
    const runs = Object.values(data.runs).filter((item) => todoIds.has(item.todoId));
    const runIds = new Set(runs.map((item) => item.id));
    const seriesIds = new Set(
      todos.flatMap((todo) => [todo.recurrenceSeriesId, todo.occurrenceMeta?.seriesId])
        .filter((value): value is string => Boolean(value)),
    );
    const portableTodos = todos.map((todo) => ({
      ...clone(todo),
      workspaceRef: normalizeResourceRef(todo.workspaceRef, `todos.${todo.id}.workspaceRef`),
    }));
    const portableRuleVersions = Object.values(data.recurrenceRuleVersions)
      .filter((item) => seriesIds.has(item.seriesId))
      .map((item) => ({
        ...clone(item),
        template: {
          ...clone(item.template),
          workspaceRef: normalizeResourceRef(item.template.workspaceRef, `recurrenceRuleVersions.${item.id}.template.workspaceRef`),
        },
      }));
    const portableOverrides = Object.values(data.occurrenceOverrides)
      .filter((item) => seriesIds.has(item.seriesId))
      .map((item) => ({ ...clone(item), patch: normalizeTodoPatch(item.patch) }));
    return {
      schema: "hana.todolist.exchange",
      version: EXCHANGE_SCHEMA_VERSION,
      exportedAt: nowIso(),
      todos: portableTodos,
      projects: clone(Object.values(data.projects)),
      recurrenceSeries: clone(Object.values(data.recurrenceSeries).filter((item) => seriesIds.has(item.id))),
      recurrenceRuleVersions: portableRuleVersions,
      occurrenceOverrides: portableOverrides,
      occurrenceSuppressions: clone(Object.values(data.occurrenceSuppressions).filter((item) => seriesIds.has(item.seriesId))),
      reminders: clone(reminders),
      runs: clone(runs),
      attempts: clone(Object.values(data.attempts).filter((item) => runIds.has(item.runId))),
    };
  }

  async preview(source: unknown, invocation: InvocationContext): Promise<{ ok: true; preview: Omit<ImportPreview, "document">; revision: number }> {
    const parsed = safeForImport(parseDocument(source));
    const digest = sha256(stableJson(parsed));
    const current = this.store.snapshot();
    const diagnostics = validateDocument(parsed, current);
    const id = newId("preview");
    const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();
    const outcome = await this.store.transact((draft) => {
      const preview: ImportPreview = {
        id,
        actorKey: invocation.actorKey,
        sourceDigest: digest,
        targetRevision: draft.revision + 1,
        document: parsed,
        diagnostics,
        canCommit: !diagnostics.some((item) => item.severity === "error"),
        createdAt: nowIso(),
        expiresAt,
      };
      draft.importPreviews[id] = preview;
      return clone(preview);
    });
    const { document: _document, ...publicPreview } = outcome.result;
    return { ok: true, preview: publicPreview, revision: outcome.revision };
  }

  async commit(previewId: string, commandId: string, invocation: InvocationContext): Promise<{ ok: true; imported: Record<string, number>; revision: number; replayed: boolean }> {
    if (!commandId.trim()) throw new TodoError("validation", "commandId is required", { field: "commandId" });
    const outcome = await this.store.transact((draft) => {
      const preview = draft.importPreviews[previewId];
      if (!preview) throw new TodoError("not_found", "Import preview was not found", { field: "previewId" });
      if (preview.actorKey !== invocation.actorKey) throw new TodoError("confirmation_invalid", "Import preview belongs to another actor");
      if (preview.committedCommandId) {
        if (preview.committedCommandId !== commandId) throw new TodoError("conflict", "Import preview was already committed with another commandId");
        return { imported: clone(preview.result as Record<string, number>), replayed: true };
      }
      if (Date.parse(preview.expiresAt) <= Date.now()) throw new TodoError("preview_stale", "Import preview expired", { nextAction: "preview_again" });
      if (!preview.canCommit || preview.diagnostics.some((item) => item.severity === "error")) throw new TodoError("conflict", "Import preview contains blocking diagnostics", { nextAction: "fix_source" });
      if (draft.revision !== preview.targetRevision) throw new TodoError("preview_stale", "Todo data changed after preview", { nextAction: "preview_again" });
      if (sha256(stableJson(preview.document)) !== preview.sourceDigest) throw new TodoError("preview_stale", "Import preview digest changed", { nextAction: "preview_again" });
      const diagnostics = validateDocument(preview.document, draft);
      if (diagnostics.some((item) => item.severity === "error")) throw new TodoError("preview_stale", "Import target changed and now conflicts", { nextAction: "preview_again" });

      insert(draft.projects, preview.document.projects);
      insert(draft.todos, preview.document.todos);
      insert(draft.recurrenceSeries, preview.document.recurrenceSeries);
      insert(draft.recurrenceRuleVersions, preview.document.recurrenceRuleVersions);
      insert(draft.occurrenceOverrides, preview.document.occurrenceOverrides);
      insert(draft.occurrenceSuppressions, preview.document.occurrenceSuppressions);
      insert(draft.reminders, preview.document.reminders);
      insert(draft.runs, preview.document.runs);
      insert(draft.attempts, preview.document.attempts);
      const imported = {
        todos: preview.document.todos.length,
        projects: preview.document.projects.length,
        recurrenceSeries: preview.document.recurrenceSeries.length,
        reminders: preview.document.reminders.length,
        runs: preview.document.runs.length,
        attempts: preview.document.attempts.length,
      };
      preview.committedCommandId = commandId;
      preview.result = imported;
      return { imported, replayed: false };
    });
    return { ok: true, imported: outcome.result.imported, revision: outcome.revision, replayed: outcome.result.replayed };
  }
}
