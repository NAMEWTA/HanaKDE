import { createHash, randomUUID } from "node:crypto";
import { TodoError } from "./errors.ts";
import { TodoStore } from "./store.ts";
import type { RecurrenceRule, Todo, TodoInput, TodoPage, TodoPatch, TodoQuery, TodoResult, TodoTime } from "./types.ts";

const MAX_PAGE_SIZE = 50;
const CONFIRMATION_TTL_MS = 5 * 60 * 1000;
const MAX_TITLE = 240;
const MAX_NOTES = 10000;

function nowIso() { return new Date().toISOString(); }
function assertTitle(title: unknown) {
  if (typeof title !== "string" || !title.trim() || [...title].length > MAX_TITLE) throw new TodoError("validation", "Todo title is required");
}
function assertDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TodoError("validation", `${field} is invalid`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new TodoError("validation", `${field} is invalid`);
}
function normalizeTags(tags: unknown) {
  if (tags === undefined) return [];
  if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string" || tag.length > 80)) throw new TodoError("validation", "Todo tags are invalid");
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
}
function assertResourceRef(value: string | null | undefined): void {
  if (value === null || value === undefined || value === "") return;
  if (!/^resource:[A-Za-z0-9._:-]+$/.test(value)) throw new TodoError("validation", "workspaceRef must be a scoped ResourceRef");
}
function normalizeTime(value: unknown, field: string): TodoTime | null {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || (value as any).kind === undefined) throw new TodoError("validation", `${field} is invalid`);
  const time = value as any;
  if (time.kind === "date" && typeof time.date === "string") { assertDate(time.date, field); return { kind: "date", date: time.date }; }
  if (time.kind === "exact" && typeof time.instant === "string" && !Number.isNaN(Date.parse(time.instant)) && typeof time.timeZone === "string" && Number.isInteger(time.offsetMinutes) && time.offsetMinutes >= -840 && time.offsetMinutes <= 840) {
    try {
      const date = new Date(time.instant);
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: time.timeZone, timeZoneName: "longOffset" }).formatToParts(date);
      const offset = parts.find((part) => part.type === "timeZoneName")?.value.match(/GMT([+-])(\d{2}):?(\d{2})?/) || null;
      const actual = offset ? (offset[1] === "-" ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3] || 0)) : 0;
      if (actual !== time.offsetMinutes) throw new TodoError("validation", `${field} offset does not match timeZone`);
    }
    catch { throw new TodoError("validation", `${field} timeZone is invalid`); }
    return { kind: "exact", instant: new Date(time.instant).toISOString(), timeZone: time.timeZone, offsetMinutes: time.offsetMinutes };
  }
  throw new TodoError("validation", `${field} is invalid`);
}
function publicTodo(todo: Todo): Todo { return structuredClone(todo); }
function calendarDate(value: TodoTime | null, timeZone = "UTC"): string | null {
  if (!value) return null;
  if (value.kind === "date") return value.date;
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value.instant));
}
function attentionDate(todo: Todo, timeZone = "UTC"): string | null {
  return [calendarDate(todo.plannedFor, timeZone), calendarDate(todo.deadline, timeZone)].filter(Boolean).sort()[0] || null;
}
function triggerInstant(value: TodoTime | null): string | null {
  if (!value) return null;
  if (value.kind === "exact") return value.instant;
  return `${value.date}T09:00:00.000Z`;
}

export class TodoApplication {
  readonly store: TodoStore;
  private readonly clock: () => string;
  private readonly idFactory: () => string;

  constructor(store: TodoStore, clock: () => string = nowIso, idFactory: () => string = randomUUID) {
    this.store = store;
    this.clock = clock;
    this.idFactory = idFactory;
  }

  create(input: TodoInput): TodoResult {
    if (!input || typeof input !== "object") throw new TodoError("validation", "Todo input is required");
    assertTitle(input?.title);
    if (input.notes !== undefined && (typeof input.notes !== "string" || input.notes.length > MAX_NOTES)) throw new TodoError("validation", "Todo notes are invalid");
    const mode = input.mode ?? "manual";
    if (!["manual", "reminder", "agent_execute"].includes(mode)) throw new TodoError("validation", "Todo mode is invalid");
    if (input.priority !== undefined && !["low", "normal", "high"].includes(input.priority)) throw new TodoError("validation", "Todo priority is invalid");
    if (mode === "reminder" && !input.reminderAt) throw new TodoError("validation", "reminder mode requires an explicit reminderAt");
    if (mode === "agent_execute" && (!input.agentId || !input.instructions || !input.permissionMode || !input.workspaceRef || (!input.reminderAt && !input.plannedFor && !input.deadline))) throw new TodoError("validation", "agent_execute requires explicit agent, instructions, permission, workspace and trigger");
    assertResourceRef(input.workspaceRef);
    const createdAt = this.clock();
    if (input.projectId && !this.store.snapshot().projects.some((project) => project.id === input.projectId && !project.deletedAt)) throw new TodoError("reference_conflict", "Project was not found");
    const todo: Todo = {
      id: this.idFactory(), title: input.title.trim(), notes: input.notes?.trim() ?? "", priority: input.priority ?? "normal", status: "pending", mode,
      plannedFor: normalizeTime(input.plannedFor, "plannedFor"), deadline: normalizeTime(input.deadline, "deadline"), reminderAt: normalizeTime(input.reminderAt, "reminderAt"),
      projectId: input.projectId ?? null, tags: normalizeTags(input.tags), agentId: input.agentId ?? null, instructions: input.instructions?.trim() || null, permissionMode: input.permissionMode || null, workspaceRef: input.workspaceRef || null, createdAt, updatedAt: createdAt, completedAt: null, deletedAt: null, version: 1,
    };
    return this.store.transact((draft) => { draft.todos.push(todo); draft.audit.push({ id: this.idFactory(), action: "created", at: createdAt, todoId: todo.id }); return { todo: publicTodo(todo), storeVersion: draft.storeVersion + 1 }; });
  }

  query(query: TodoQuery = {}): TodoPage {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), MAX_PAGE_SIZE);
    const offset = Math.max(Number.parseInt(query.cursor || "0", 10) || 0, 0);
    let items = this.store.snapshot().todos.filter((todo) => query.includeTrash ? !!todo.deletedAt : !todo.deletedAt);
    if (query.search?.trim()) { const needle = query.search.trim().normalize("NFKC").toLocaleLowerCase(); const projectNames = new Map(this.store.snapshot().projects.map((project) => [project.id, project.name.normalize("NFKC").toLocaleLowerCase()])); items = items.filter((todo) => [todo.title, todo.notes, ...(todo.tags || []), todo.projectId ? projectNames.get(todo.projectId) || "" : ""].join("\u0000").normalize("NFKC").toLocaleLowerCase().includes(needle)); }
    if (query.status && query.status !== "all") items = items.filter((todo) => todo.status === query.status);
    if (query.projectId !== undefined) items = items.filter((todo) => todo.projectId === query.projectId);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: query.timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(this.clock()));
    const activeProjectIds = new Set(this.store.snapshot().projects.filter((project) => !project.deletedAt).map((project) => project.id));
    if (query.view === "inbox") items = items.filter((todo) => (!todo.projectId || !activeProjectIds.has(todo.projectId)) && todo.status === "pending");
    if (query.view === "today") items = items.filter((todo) => { const date = attentionDate(todo, query.timeZone); return !!date && date <= today && todo.status === "pending"; });
    if (query.view === "upcoming") items = items.filter((todo) => { const date = attentionDate(todo, query.timeZone); return !!date && date > today && todo.status === "pending"; });
    if (query.view === "completed") items = items.filter((todo) => todo.status === "completed");
    if (query.view === "all") items = items.filter((todo) => todo.status === "pending");
    if (query.view === "calendar") items = items.filter((todo) => !!attentionDate(todo, query.timeZone));
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    const page = items.slice(offset, offset + limit).map((todo) => ({ ...publicTodo(todo), attentionDate: attentionDate(todo, query.timeZone) } as Todo));
    return { items: page, nextCursor: offset + limit < items.length ? String(offset + limit) : null, storeVersion: this.store.snapshot().storeVersion };
  }

  capture(title: string, context: { projectId?: string | null; tags?: string[] } = {}): TodoResult {
    if (typeof title !== "string" || title.includes("\n") || title.includes("\r") || !title.trim()) throw new TodoError("validation", "Capture accepts one visible Todo item");
    return this.create({ title, projectId: context.projectId ?? null, tags: context.tags ?? [] });
  }

  createProject(name: string) {
    if (typeof name !== "string" || !name.trim() || name.length > 160) throw new TodoError("validation", "Project name is required");
    const at = this.clock();
    const project = { id: this.idFactory(), name: name.trim(), deletedAt: null, version: 1, createdAt: at, updatedAt: at };
    return this.store.transact((draft) => { draft.projects.push(project); draft.audit.push({ id: this.idFactory(), action: "project_created", at, detail: project.id }); return { project, storeVersion: draft.storeVersion + 1 }; });
  }

  queryProjects(includeTrash = false) {
    return this.store.snapshot().projects.filter((project) => includeTrash ? !!project.deletedAt : !project.deletedAt).map((project) => structuredClone(project));
  }

  updateProject(id: string, name: string, expectedVersion: number) {
    if (!Number.isInteger(expectedVersion) || typeof name !== "string" || !name.trim()) throw new TodoError("validation", "Project update is invalid");
    const at = this.clock();
    return this.store.transact((draft) => {
      const project = draft.projects.find((item) => item.id === id && !item.deletedAt);
      if (!project) throw new TodoError("not_found", "Project was not found");
      if (project.version !== expectedVersion) throw new TodoError("conflict", "Project version is stale");
      project.name = name.trim(); project.updatedAt = at; project.version += 1;
      draft.audit.push({ id: this.idFactory(), action: "project_updated", at, detail: id });
      return { project: structuredClone(project), storeVersion: draft.storeVersion + 1 };
    });
  }

  removeProject(id: string, expectedVersion: number) {
    if (!Number.isInteger(expectedVersion)) throw new TodoError("validation", "expectedVersion is required");
    const at = this.clock();
    return this.store.transact((draft) => {
      const project = draft.projects.find((item) => item.id === id && !item.deletedAt);
      if (!project) throw new TodoError("not_found", "Project was not found");
      if (project.version !== expectedVersion) throw new TodoError("conflict", "Project version is stale");
      project.deletedAt = at; project.updatedAt = at; project.version += 1;
      draft.audit.push({ id: this.idFactory(), action: "project_trashed", at, detail: id });
      return { project: structuredClone(project), storeVersion: draft.storeVersion + 1 };
    });
  }

  restoreProject(id: string, expectedVersion: number) {
    if (!Number.isInteger(expectedVersion)) throw new TodoError("validation", "expectedVersion is required");
    const at = this.clock();
    return this.store.transact((draft) => {
      const project = draft.projects.find((item) => item.id === id && !!item.deletedAt);
      if (!project) throw new TodoError("not_found", "Project was not found in Trash");
      if (project.version !== expectedVersion) throw new TodoError("conflict", "Project version is stale");
      project.deletedAt = null; project.updatedAt = at; project.version += 1;
      draft.audit.push({ id: this.idFactory(), action: "project_restored", at, detail: id });
      return { project: structuredClone(project), storeVersion: draft.storeVersion + 1 };
    });
  }

  async scheduleReminder(todoId: string, dueAt: string, ctx: any) {
    const todo = this.get(todoId).todo;
    if (todo.mode !== "reminder") throw new TodoError("validation", "Todo is not in reminder mode");
    if (Number.isNaN(Date.parse(dueAt))) throw new TodoError("validation", "Reminder dueAt is invalid");
    const id = `${todo.id}:${dueAt}`;
    const scheduled = this.store.transact((draft) => {
      const active = draft.reminders.find((item) => item.todoId === todoId && ["scheduled", "claimed", "unknown"].includes(item.status) && item.id !== id);
      if (active) throw new TodoError("conflict", "Todo already has an active reminder");
      const existing = draft.reminders.find((item) => item.id === id);
      if (existing) return existing;
      const reminder = { id, todoId, occurrenceId: null, dueAt: new Date(dueAt).toISOString(), status: "scheduled" as const, attempts: 0, lastError: null };
      draft.reminders.push(reminder); draft.audit.push({ id: this.idFactory(), action: "reminder_scheduled", at: this.clock(), todoId }); return reminder;
    });
    if (typeof ctx?.bus?.request === "function") {
      try {
        const result = await ctx.bus.request("task:schedule", { scheduleId: `todolist-reminder:${id}`, type: "todolist.reminder", dueAt: scheduled.dueAt, pluginId: ctx.pluginId, meta: { reminderId: id, todoId } });
        return { reminder: scheduled, schedule: result };
      } catch (error) {
        this.store.transact((draft) => { const item = draft.reminders.find((candidate) => candidate.id === id); if (item) { item.status = "failed"; item.lastError = "task registry unavailable"; } return null; });
        return { reminder: this.store.snapshot().reminders.find((candidate) => candidate.id === id)!, schedule: null, backgroundStatus: "failed" as const, diagnostic: "TaskRegistry reminder handoff is unavailable" };
      }
    }
    return { reminder: scheduled, schedule: null };
  }

  async scheduleAgentRun(todoId: string, occurrenceId: string | null, ctx: any) {
    const todo = this.get(todoId).todo;
    if (todo.mode !== "agent_execute") throw new TodoError("validation", "Todo is not authorized for agent execution");
    const dueAt = triggerInstant(todo.reminderAt || todo.plannedFor || todo.deadline);
    if (!dueAt) throw new TodoError("validation", "Agent execution requires an explicit trigger");
    const created = this.createRun(todoId, occurrenceId);
    if (typeof ctx?.bus?.request !== "function") return { ...created, schedule: null };
    try {
      const schedule = await ctx.bus.request("task:schedule", { scheduleId: `todolist-agent:${created.run.id}`, type: "todolist.agent_execute", dueAt, pluginId: ctx.pluginId, meta: { runId: created.run.id, todoId, occurrenceId } });
      return { ...created, schedule };
    } catch {
      this.setRunState(created.run.id, "needs_action", { diagnostic: "TaskRegistry agent schedule unavailable" });
      return { ...created, schedule: null, backgroundStatus: "needs_action" as const, diagnostic: "TaskRegistry agent schedule is unavailable" };
    }
  }

  async cancelReminder(reminderId: string, ctx: any) {
    const result = this.store.transact((draft) => {
      const reminder = draft.reminders.find((item) => item.id === reminderId);
      if (!reminder) throw new TodoError("not_found", "Reminder was not found");
      if (reminder.status === "handed_off" || reminder.status === "cancelled") return structuredClone(reminder);
      reminder.status = "cancelled"; reminder.lastError = null;
      return structuredClone(reminder);
    });
    if (typeof ctx?.bus?.request === "function") {
      try { await ctx.bus.request("task:unschedule", { scheduleId: `todolist-reminder:${reminderId}` }); } catch { /* state remains visible and retryable */ }
    }
    return { reminder: result };
  }

  async cancelBackgroundForTodo(todoId: string, ctx: any) {
    const state = this.store.snapshot();
    const reminders = state.reminders.filter((item) => item.todoId === todoId && ["scheduled", "claimed", "unknown", "cancelled"].includes(item.status));
    const cancelledReminders = [];
    for (const reminder of reminders) cancelledReminders.push((await this.cancelReminder(reminder.id, ctx)).reminder);
    const cancelledRuns = [];
    for (const run of state.runs.filter((item) => item.todoId === todoId && ["queued", "running", "cancel_requested", "cancelled"].includes(item.status))) {
      const next = run.status === "queued" ? this.setRunState(run.id, "cancelled").run : run.status === "running" ? this.setRunState(run.id, "cancel_requested").run : run;
      cancelledRuns.push(next);
      if (["queued", "running", "cancel_requested", "cancelled"].includes(run.status) && typeof ctx?.bus?.request === "function") {
        try { await ctx.bus.request("task:cancel", { taskId: run.id, pluginId: ctx.pluginId }); } catch { /* host cancellation remains visible */ }
      }
    }
    return { reminders: cancelledReminders, runs: cancelledRuns };
  }

  async handoffReminder(reminderId: string, ctx: any) {
    const claimed = this.store.transact((draft) => {
      const reminder = draft.reminders.find((item) => item.id === reminderId);
      if (!reminder) throw new TodoError("not_found", "Reminder was not found");
      if (!["scheduled", "failed", "unknown"].includes(reminder.status)) return reminder;
      reminder.status = "claimed"; reminder.attempts += 1; return structuredClone(reminder);
    });
    if (claimed.status !== "claimed") return { reminder: claimed, delivered: false };
    try {
      if (typeof ctx?.bus?.emit !== "function") throw new Error("notification event unavailable");
      ctx.bus.emit({ type: "notification", notification: { kind: "todolist.reminder", reminderId, todoId: claimed.todoId, title: this.get(claimed.todoId).todo.title } });
      const result = this.store.transact((draft) => { const reminder = draft.reminders.find((item) => item.id === reminderId)!; reminder.status = "handed_off"; reminder.lastError = null; return structuredClone(reminder); });
      return { reminder: result, delivered: false };
    } catch (error) {
      const result = this.store.transact((draft) => { const reminder = draft.reminders.find((item) => item.id === reminderId)!; reminder.status = "unknown"; reminder.lastError = "notification handoff unavailable"; return structuredClone(reminder); });
      return { reminder: result, delivered: false, diagnostic: "notification handoff unavailable" };
    }
  }

  async startRun(runId: string, ctx: any) {
    const run = this.store.snapshot().runs.find((candidate) => candidate.id === runId);
    if (!run) throw new TodoError("not_found", "Automation Run was not found");
    const todo = this.get(run.todoId).todo;
    if (todo.mode !== "agent_execute" || !todo.agentId || !todo.instructions || !todo.permissionMode || !todo.workspaceRef) return this.setRunState(runId, "needs_action", { diagnostic: "Agent configuration is incomplete" });
    if (typeof ctx?.bus?.request !== "function") return this.setRunState(runId, "needs_action", { diagnostic: "Agent capability is unavailable" });
    try {
      const session = await ctx.bus.request("session:create", { agentId: todo.agentId, ownerPluginId: ctx.pluginId, permissionMode: todo.permissionMode, visibility: "plugin_private", kind: "todolist" });
      const sessionRef = session?.sessionRef || (session?.sessionId ? { sessionId: session.sessionId } : null);
      if (!sessionRef) return this.setRunState(runId, "needs_action", { diagnostic: "Session identity was unavailable" });
      const running = this.setRunState(runId, "running", { sessionRef });
      await ctx.bus.request("session:send", { ...sessionRef, text: todo.instructions, context: { metadata: { ownerPluginId: ctx.pluginId, todoId: todo.id, runId } } });
      return { run: running.run, accepted: true };
    } catch { return this.setRunState(runId, "needs_action", { diagnostic: "Agent Session capability is unavailable" }); }
  }

  createRun(todoId: string, occurrenceId: string | null = null) {
    const todo = this.get(todoId).todo;
    if (todo.mode !== "agent_execute") throw new TodoError("validation", "Todo is not authorized for agent execution");
    const id = `${todoId}:${occurrenceId || "default"}`;
    return this.store.transact((draft) => {
      const existing = draft.runs.find((run) => run.id === id);
      if (existing) return { run: structuredClone(existing), storeVersion: draft.storeVersion + 1 };
      const at = this.clock(); const run = { id, todoId, occurrenceId, mode: "agent_execute" as const, status: "queued" as const, sessionRef: null, summary: null, diagnostic: null, createdAt: at, updatedAt: at };
      draft.runs.push(run); draft.attempts.push({ id: `${id}:attempt:1`, runId: id, number: 1, status: "queued", summary: null, createdAt: at, completedAt: null });
      return { run: structuredClone(run), storeVersion: draft.storeVersion + 1 };
    });
  }

  listRuns(status?: string) {
    return this.store.snapshot().runs.filter((run) => !status || run.status === status).map((run) => structuredClone(run));
  }

  setRunState(runId: string, status: any, patch: Record<string, unknown> = {}) {
    const allowed = ["queued", "running", "succeeded", "failed", "needs_action", "cancel_requested", "cancelled"];
    if (!allowed.includes(status)) throw new TodoError("validation", "Run status is invalid");
    return this.store.transact((draft) => {
      const run = draft.runs.find((candidate) => candidate.id === runId);
      if (!run) throw new TodoError("not_found", "Automation Run was not found");
      if (status === "cancelled" && run.status !== "cancel_requested") throw new TodoError("conflict", "Run cancellation requires host confirmation");
      Object.assign(run, patch, { status, updatedAt: this.clock() });
      return { run: structuredClone(run), storeVersion: draft.storeVersion + 1 };
    });
  }

  retryRun(runId: string) {
    return this.store.transact((draft) => {
      const run = draft.runs.find((candidate) => candidate.id === runId);
      if (!run) throw new TodoError("not_found", "Automation Run was not found");
      if (!["failed", "needs_action"].includes(run.status)) throw new TodoError("conflict", "Run cannot be retried in its current state");
      const number = draft.attempts.filter((attempt) => attempt.runId === runId).length + 1;
      const at = this.clock(); run.status = "queued"; run.sessionRef = null; run.summary = null; run.diagnostic = null; run.updatedAt = at;
      draft.attempts.push({ id: `${runId}:attempt:${number}`, runId, number, status: "queued", summary: null, createdAt: at, completedAt: null });
      return { run: structuredClone(run), attemptNumber: number, storeVersion: draft.storeVersion + 1 };
    });
  }

  review() {
    const snapshot = this.store.snapshot();
    return { inbox: this.query({ view: "inbox" }).items, overdue: snapshot.todos.filter((todo) => !todo.deletedAt && todo.status === "pending" && attentionDate(todo) && attentionDate(todo)! < this.clock().slice(0, 10)), upcoming: this.query({ view: "upcoming" }).items, undated: snapshot.todos.filter((todo) => !todo.deletedAt && !attentionDate(todo)), recentlyCompleted: snapshot.todos.filter((todo) => todo.status === "completed").slice(0, 50), automation: this.listRuns().filter((run) => ["failed", "needs_action", "cancel_requested"].includes(run.status)) };
  }

  get(id: string, includeTrash = false): TodoResult {
    const todo = this.store.snapshot().todos.find((item) => item.id === id && (includeTrash || !item.deletedAt));
    if (!todo) throw new TodoError("not_found", "Todo was not found");
    return { todo: publicTodo(todo), storeVersion: this.store.snapshot().storeVersion };
  }

  update(id: string, patch: TodoPatch): TodoResult {
    if (!Number.isInteger(patch?.expectedVersion)) throw new TodoError("validation", "expectedVersion is required");
    if (patch.title !== undefined) assertTitle(patch.title);
    const updatedAt = this.clock();
    return this.store.transact((draft) => {
      const todo = draft.todos.find((item) => item.id === id && !item.deletedAt);
      if (!todo) throw new TodoError("not_found", "Todo was not found");
      if (todo.version !== patch.expectedVersion) throw new TodoError("conflict", "Todo version is stale", { expectedVersion: patch.expectedVersion, actualVersion: todo.version });
      if (patch.notes !== undefined && (typeof patch.notes !== "string" || patch.notes.length > MAX_NOTES)) throw new TodoError("validation", "Todo notes are invalid");
      if (patch.workspaceRef !== undefined) assertResourceRef(patch.workspaceRef);
      for (const field of ["plannedFor", "deadline", "reminderAt"] as const) if (field in patch) (todo as any)[field] = normalizeTime((patch as any)[field], field);
      if (patch.title !== undefined) todo.title = patch.title.trim();
      if (patch.notes !== undefined) todo.notes = patch.notes.trim();
      if (patch.mode !== undefined) {
        if (!["manual", "reminder", "agent_execute"].includes(patch.mode)) throw new TodoError("validation", "Todo mode is invalid");
        if (patch.mode === "reminder" && !todo.reminderAt) throw new TodoError("validation", "reminder mode requires an explicit reminderAt");
        if (patch.mode === "agent_execute" && (!patch.agentId && !todo.agentId || !patch.instructions && !todo.instructions || !patch.permissionMode && !todo.permissionMode || !patch.workspaceRef && !todo.workspaceRef || !patch.reminderAt && !patch.plannedFor && !patch.deadline && !todo.reminderAt && !todo.plannedFor && !todo.deadline)) throw new TodoError("validation", "agent_execute requires explicit agent, instructions, permission, workspace and trigger");
        todo.mode = patch.mode;
      }
      if (patch.priority !== undefined) todo.priority = patch.priority;
      if (patch.agentId !== undefined) todo.agentId = patch.agentId;
      if (patch.instructions !== undefined) todo.instructions = patch.instructions?.trim() || null;
      if (patch.permissionMode !== undefined) todo.permissionMode = patch.permissionMode;
      if (patch.workspaceRef !== undefined) todo.workspaceRef = patch.workspaceRef;
      if (patch.projectId !== undefined) {
        if (patch.projectId && !draft.projects.some((project) => project.id === patch.projectId && !project.deletedAt)) throw new TodoError("reference_conflict", "Project was not found");
        todo.projectId = patch.projectId ?? null;
      }
      if (patch.tags !== undefined) todo.tags = normalizeTags(patch.tags);
      todo.version += 1; todo.updatedAt = updatedAt;
      draft.audit.push({ id: this.idFactory(), action: "updated", at: updatedAt, todoId: id });
      return { todo: publicTodo(todo), storeVersion: draft.storeVersion + 1 };
    });
  }

  remove(id: string, expectedVersion: number): TodoResult {
    if (!Number.isInteger(expectedVersion)) throw new TodoError("validation", "expectedVersion is required");
    const updatedAt = this.clock();
    return this.store.transact((draft) => {
      const todo = draft.todos.find((item) => item.id === id && !item.deletedAt);
      if (!todo) throw new TodoError("not_found", "Todo was not found");
      if (todo.version !== expectedVersion) throw new TodoError("conflict", "Todo version is stale");
      todo.deletedAt = updatedAt;
      todo.updatedAt = updatedAt;
      todo.version += 1;
      for (const reminder of draft.reminders.filter((item) => item.todoId === id && ["scheduled", "claimed", "unknown"].includes(item.status))) reminder.status = "cancelled";
      for (const run of draft.runs.filter((item) => item.todoId === id && ["queued", "running"].includes(item.status))) run.status = run.status === "running" ? "cancel_requested" : "cancelled";
      draft.audit.push({ id: this.idFactory(), action: "trashed", at: updatedAt, todoId: id });
      return { todo: publicTodo(todo), storeVersion: draft.storeVersion + 1 };
    });
  }

  restore(id: string, expectedVersion: number): TodoResult {
    if (!Number.isInteger(expectedVersion)) throw new TodoError("validation", "expectedVersion is required");
    const updatedAt = this.clock();
    return this.store.transact((draft) => {
      const todo = draft.todos.find((item) => item.id === id && !!item.deletedAt);
      if (!todo) throw new TodoError("not_found", "Todo was not found in Trash");
      if (todo.version !== expectedVersion) throw new TodoError("conflict", "Todo version is stale");
      todo.deletedAt = null;
      todo.updatedAt = updatedAt;
      todo.version += 1;
      draft.audit.push({ id: this.idFactory(), action: "restored", at: updatedAt, todoId: id });
      return { todo: publicTodo(todo), storeVersion: draft.storeVersion + 1 };
    });
  }

  preparePurge(todoIds: string[], sessionKey: string, now = Date.parse(this.clock())) {
    if (!sessionKey || !Array.isArray(todoIds) || todoIds.length === 0 || todoIds.length > 200) throw new TodoError("validation", "Purge targets are invalid");
    const state = this.store.snapshot();
    const ids = [...new Set(todoIds)].sort();
    const todos = ids.map((id) => state.todos.find((todo) => todo.id === id && !!todo.deletedAt));
    if (todos.some((todo) => !todo)) throw new TodoError("not_found", "Every purge target must be in Trash");
    const expectedVersions = Object.fromEntries(todos.map((todo) => [todo!.id, todo!.version]));
    const expiresAt = new Date(now + CONFIRMATION_TTL_MS).toISOString();
    const raw = `${sessionKey}:${expiresAt}:${ids.join(",")}:${JSON.stringify(expectedVersions)}`;
    const token = createHash("sha256").update(raw).digest("hex");
    this.store.transact((draft) => { draft.confirmations = draft.confirmations.filter((item) => item.expiresAt > this.clock()); draft.confirmations.push({ id: token, kind: "purge", todoIds: ids, expectedVersions, sessionKey, expiresAt, consumedAt: null }); return null; });
    return { confirmationId: token, expiresAt, todoIds: ids, count: ids.length };
  }

  confirmPurge(confirmationId: string, sessionKey: string, now = Date.parse(this.clock())) {
    if (!confirmationId || !sessionKey) throw new TodoError("validation", "Confirmation is required");
    const updatedAt = this.clock();
    return this.store.transact((draft) => {
      const confirmation = draft.confirmations.find((item) => item.id === confirmationId);
      if (!confirmation) throw new TodoError("not_found", "Confirmation was not found");
      if (confirmation.consumedAt) throw new TodoError("conflict", "Confirmation was already consumed");
      if (confirmation.sessionKey !== sessionKey) throw new TodoError("forbidden", "Confirmation session mismatch");
      if (Date.parse(confirmation.expiresAt) <= now) throw new TodoError("conflict", "Confirmation expired");
      for (const id of confirmation.todoIds) {
        const todo = draft.todos.find((item) => item.id === id && !!item.deletedAt);
        if (!todo || todo.version !== confirmation.expectedVersions[id]) throw new TodoError("conflict", "Purge target changed");
        if (draft.reminders.some((item) => item.todoId === id && ["scheduled", "claimed", "unknown"].includes(item.status)) || draft.runs.some((item) => item.todoId === id && ["queued", "running", "cancel_requested"].includes(item.status))) throw new TodoError("conflict", "Purge requires external side effects to be settled");
      }
      for (const id of confirmation.todoIds) draft.todos = draft.todos.filter((todo) => todo.id !== id);
      confirmation.consumedAt = updatedAt;
      draft.audit.push({ id: this.idFactory(), action: "purged", at: updatedAt, detail: `${confirmation.todoIds.length} trash records` });
      return { purged: confirmation.todoIds, storeVersion: draft.storeVersion + 1 };
    });
  }

  complete(id: string, expectedVersion: number): TodoResult { return this.setStatus(id, expectedVersion, "completed"); }
  reopen(id: string, expectedVersion: number): TodoResult { return this.setStatus(id, expectedVersion, "pending"); }

  private setStatus(id: string, expectedVersion: number, status: Todo["status"]): TodoResult {
    if (!Number.isInteger(expectedVersion)) throw new TodoError("validation", "expectedVersion is required");
    const updatedAt = this.clock();
    return this.store.transact((draft) => {
      const todo = draft.todos.find((item) => item.id === id && !item.deletedAt);
      if (!todo) throw new TodoError("not_found", "Todo was not found");
      if (todo.version !== expectedVersion) throw new TodoError("conflict", "Todo version is stale");
      todo.status = status; todo.completedAt = status === "completed" ? updatedAt : null; todo.updatedAt = updatedAt; todo.version += 1;
      if (status === "completed") for (const run of draft.runs) if (run.todoId === id && ["queued", "running"].includes(run.status)) run.status = run.status === "running" ? "cancel_requested" : "cancelled";
      draft.audit.push({ id: this.idFactory(), action: status, at: updatedAt, todoId: id });
      return { todo: publicTodo(todo), storeVersion: draft.storeVersion + 1 };
    });
  }

  createRecurrence(todoId: string, ruleInput: Omit<RecurrenceRule, "id" | "version" | "todoId" | "status"> & { status?: RecurrenceRule["status"] }) {
    const todo = this.get(todoId).todo;
    if (!todo) throw new TodoError("not_found", "Todo was not found");
    if (!["daily", "weekly", "monthly"].includes(ruleInput.frequency) || !Number.isInteger(ruleInput.interval) || ruleInput.interval < 1 || ruleInput.interval > 365) throw new TodoError("validation", "Recurrence rule is invalid");
    const rule: RecurrenceRule = { ...ruleInput, status: ruleInput.status || "active", todoId, id: this.idFactory(), version: 1 };
    return this.store.transact((draft) => { draft.recurrenceRules.push({ ...rule }); draft.audit.push({ id: this.idFactory(), action: "recurrence_created", at: this.clock(), todoId }); return { rule: structuredClone(rule), storeVersion: draft.storeVersion + 1 }; });
  }

  materialize(todoId: string, fromDate: string, days = 30) {
    const state = this.store.snapshot();
    const rule = state.recurrenceRules.find((candidate) => candidate.todoId === todoId);
    if (!rule || rule.status !== "active") return { occurrences: [], storeVersion: state.storeVersion };
    const todo = state.todos.find((candidate) => candidate.id === todoId);
    if (!todo) throw new TodoError("not_found", "Todo was not found");
    const start = new Date(`${fromDate}T00:00:00Z`);
    return this.store.transact((draft) => {
      const occurrences = [];
      for (let index = 0; index < Math.min(days, 366); index += 1) {
        const date = new Date(start.getTime() + index * 86400000);
        if (rule.frequency === "daily" && index % rule.interval !== 0) continue;
        if (rule.frequency === "weekly" && index % (rule.interval * 7) !== 0) continue;
        if (rule.frequency === "monthly" && date.getUTCDate() !== start.getUTCDate()) continue;
        const occurrenceDate = date.toISOString().slice(0, 10);
        if (rule.until && occurrenceDate > rule.until) continue;
        const id = `${rule.id}:${occurrenceDate}`;
        if (draft.occurrences.some((item) => item.id === id)) continue;
        const occurrence = { id, todoId, ruleId: rule.id, occurrenceDate, status: "active" as const, title: todo.title, createdAt: this.clock(), completedAt: null };
        draft.occurrences.push(occurrence); occurrences.push(structuredClone(occurrence));
        if (rule.count && draft.occurrences.filter((item) => item.ruleId === rule.id).length >= rule.count) break;
      }
      return { occurrences, storeVersion: draft.storeVersion + 1 };
    });
  }

  completeOccurrence(occurrenceId: string) {
    const completedAt = this.clock();
    return this.store.transact((draft) => {
      const occurrence = draft.occurrences.find((item) => item.id === occurrenceId);
      if (!occurrence) throw new TodoError("not_found", "Occurrence was not found");
      if (occurrence.status === "completed") return { occurrence: structuredClone(occurrence), created: [], storeVersion: draft.storeVersion + 1 };
      if (occurrence.status !== "active") throw new TodoError("conflict", "Occurrence is not active");
      occurrence.status = "completed";
      occurrence.completedAt = completedAt;
      const todo = draft.todos.find((item) => item.id === occurrence.todoId);
      const rule = draft.recurrenceRules.find((item) => item.id === occurrence.ruleId && item.afterCompletion);
      const created = [] as typeof draft.occurrences;
      if (todo && rule) {
        const nextDate = new Date(`${occurrence.occurrenceDate}T00:00:00Z`);
        nextDate.setUTCDate(nextDate.getUTCDate() + rule.interval);
        const occurrenceDate = nextDate.toISOString().slice(0, 10);
        if (!rule.until || occurrenceDate <= rule.until) {
          const id = `${rule.id}:${occurrenceDate}`;
          if (!draft.occurrences.some((item) => item.id === id)) {
            const next = { id, todoId: todo.id, ruleId: rule.id, occurrenceDate, status: "active" as const, title: todo.title, createdAt: completedAt, completedAt: null };
            draft.occurrences.push(next);
            created.push(structuredClone(next));
          }
        }
      }
      draft.audit.push({ id: this.idFactory(), action: "occurrence_completed", at: completedAt, todoId: occurrence.todoId, detail: occurrence.id });
      return { occurrence: structuredClone(occurrence), created, storeVersion: draft.storeVersion + 1 };
    });
  }

  skipOccurrence(occurrenceId: string) {
    const skippedAt = this.clock();
    return this.store.transact((draft) => {
      const occurrence = draft.occurrences.find((item) => item.id === occurrenceId);
      if (!occurrence) throw new TodoError("not_found", "Occurrence was not found");
      if (occurrence.status !== "active") throw new TodoError("conflict", "Occurrence is not active");
      occurrence.status = "skipped";
      occurrence.completedAt = skippedAt;
      draft.audit.push({ id: this.idFactory(), action: "occurrence_skipped", at: skippedAt, todoId: occurrence.todoId, detail: occurrence.id });
      return { occurrence: structuredClone(occurrence), storeVersion: draft.storeVersion + 1 };
    });
  }

  updateRecurrence(ruleId: string, expectedVersion: number, patch: Partial<Pick<RecurrenceRule, "frequency" | "interval" | "count" | "until" | "afterCompletion" | "status">>) {
    if (!Number.isInteger(expectedVersion)) throw new TodoError("validation", "expectedVersion is required");
    if (patch.interval !== undefined && (!Number.isInteger(patch.interval) || patch.interval < 1 || patch.interval > 365)) throw new TodoError("validation", "Recurrence interval is invalid");
    return this.store.transact((draft) => {
      const rule = draft.recurrenceRules.find((item) => item.id === ruleId);
      if (!rule) throw new TodoError("not_found", "Recurrence rule was not found");
      if (rule.version !== expectedVersion) throw new TodoError("conflict", "Recurrence rule version is stale");
      Object.assign(rule, patch, { version: rule.version + 1 });
      draft.audit.push({ id: this.idFactory(), action: "recurrence_updated", at: this.clock(), todoId: rule.todoId, detail: rule.id });
      return { rule: structuredClone(rule), storeVersion: draft.storeVersion + 1 };
    });
  }

  queryOccurrences(todoId?: string) {
    return this.store.snapshot().occurrences.filter((occurrence) => !todoId || occurrence.todoId === todoId).map((occurrence) => structuredClone(occurrence));
  }

}
