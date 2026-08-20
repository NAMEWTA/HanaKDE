import { TodoError } from "../errors.ts";
import type {
  ExecutionMode,
  Priority,
  ProjectRecord,
  QueryReason,
  QueryResult,
  StoreData,
  TodoProjection,
  TodoRecord,
  ViewName,
} from "../domain/model.ts";
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from "../domain/model.ts";
import { attentionDate, datePart, localToday } from "../domain/time.ts";
import { base64UrlDecode, base64UrlEncode, normalizeSearch } from "../domain/utils.ts";

export interface QueryOptions {
  view?: ViewName;
  projectId?: string;
  search?: string;
  tags?: string[];
  priorities?: Priority[];
  modes?: ExecutionMode[];
  limit?: number;
  cursor?: string;
  timeZone?: string;
  today?: string;
  includeTrash?: boolean;
}

interface CursorValue {
  sort: string;
  id: string;
}

function parseCursor(value?: string): CursorValue | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(base64UrlDecode(value));
    if (parsed && typeof parsed.sort === "string" && typeof parsed.id === "string") return parsed;
  } catch { /* invalid below */ }
  throw new TodoError("validation", "cursor is invalid", { field: "cursor" });
}

function projectFor(data: StoreData, todo: TodoRecord): ProjectRecord | undefined {
  if (!todo.projectId) return undefined;
  const project = data.projects[todo.projectId];
  return project && !project.archivedAt ? project : undefined;
}

function activeReminder(data: StoreData, todoId: string) {
  return Object.values(data.reminders)
    .filter((item) => item.todoId === todoId && !["cancelled"].includes(item.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

function latestRun(data: StoreData, todoId: string) {
  return Object.values(data.runs)
    .filter((item) => item.todoId === todoId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

function allowedActions(todo: TodoRecord, data: StoreData): string[] {
  const result: string[] = [];
  if (todo.archivedAt) {
    result.push("restore");
    const active = Object.values(data.runs).some((run) => run.todoId === todo.id && ["pending_registration", "scheduled", "running", "cancel_requested"].includes(run.status))
      || Object.values(data.reminders).some((reminder) => reminder.todoId === todo.id && ["pending_registration", "scheduled", "handoff_claimed", "cancel_requested"].includes(reminder.status));
    if (!active) result.push("purge_prepare");
    return result;
  }
  result.push(todo.status === "pending" ? "complete" : "reopen", "edit", "trash");
  const reminder = activeReminder(data, todo.id);
  if (reminder && ["handoff_failed", "handoff_unknown"].includes(reminder.status)) result.push("retry_reminder");
  const run = latestRun(data, todo.id);
  if (run && ["failed", "needs_action", "cancelled"].includes(run.status)) result.push("retry_automation");
  if (run && ["pending_registration", "scheduled", "running", "cancel_requested"].includes(run.status)) result.push("cancel_automation");
  return result;
}

function reasonsFor(todo: TodoRecord, view: ViewName, today: string, project?: ProjectRecord): QueryReason[] {
  const reasons: QueryReason[] = [];
  const planned = datePart(todo.plannedFor);
  const deadline = datePart(todo.deadline);
  if (planned && (view === "today" || view === "upcoming" || view === "calendar" || view === "all")) reasons.push({ type: "plannedFor", label: planned < today ? "overdue planned date" : "planned date", date: planned });
  if (deadline && (view === "today" || view === "upcoming" || view === "calendar" || view === "all")) reasons.push({ type: "deadline", label: deadline < today ? "overdue deadline" : "deadline", date: deadline });
  if (view === "inbox" || (!project && !todo.projectId)) reasons.push({ type: "inbox", label: "no active project" });
  if (project) reasons.push({ type: "project", label: project.name });
  if (todo.status === "completed") reasons.push({ type: "completed", label: "completed" });
  if (todo.archivedAt) reasons.push({ type: "trash", label: "trash" });
  return reasons;
}

function matchesSearch(todo: TodoRecord, project: ProjectRecord | undefined, search?: string): boolean {
  if (!search?.trim()) return true;
  const needle = normalizeSearch(search.trim());
  return [todo.title, todo.description, project?.name ?? "", ...todo.tags].some((value) => normalizeSearch(value).includes(needle));
}

function matchesView(todo: TodoRecord, view: ViewName, today: string, projectId?: string): boolean {
  if (view === "trash") return Boolean(todo.archivedAt);
  if (todo.archivedAt) return false;
  if (view === "completed") return todo.status === "completed";
  if (view === "automation") return todo.mode === "agent_execute";
  if (todo.status !== "pending") return false;
  const attention = attentionDate(todo.plannedFor, todo.deadline);
  switch (view) {
    case "today": return Boolean(attention && attention <= today);
    case "inbox": return !todo.projectId;
    case "upcoming": return Boolean(attention && attention > today);
    case "project": return Boolean(projectId && todo.projectId === projectId);
    case "calendar": return Boolean(attention);
    case "review": return true;
    case "all": return true;
    default: return true;
  }
}

function sortValue(todo: TodoRecord, view: ViewName): string {
  if (view === "completed") return `${todo.completedAt ?? todo.updatedAt}|${todo.updatedAt}`;
  if (view === "trash") return `${todo.archivedAt ?? todo.updatedAt}|${todo.updatedAt}`;
  return `${attentionDate(todo.plannedFor, todo.deadline) ?? "9999-12-31"}|${String(9 - ["none", "low", "medium", "high", "urgent"].indexOf(todo.priority)).padStart(2, "0")}|${todo.updatedAt}`;
}

export function projectTodos(data: StoreData, options: QueryOptions = {}): QueryResult<TodoProjection> {
  const view = options.view ?? "inbox";
  const today = options.today ?? localToday(options.timeZone);
  const limit = Math.max(1, Math.min(PAGE_SIZE_MAX, Math.floor(options.limit ?? PAGE_SIZE_DEFAULT)));
  const cursor = parseCursor(options.cursor);
  const tagSet = options.tags?.length ? new Set(options.tags.map(normalizeSearch)) : undefined;
  const prioritySet = options.priorities?.length ? new Set(options.priorities) : undefined;
  const modeSet = options.modes?.length ? new Set(options.modes) : undefined;

  const all = Object.values(data.todos)
    .filter((todo) => matchesView(todo, view, today, options.projectId))
    .filter((todo) => options.includeTrash || view === "trash" || !todo.archivedAt)
    .filter((todo) => !tagSet || todo.tags.some((tag) => tagSet.has(normalizeSearch(tag))))
    .filter((todo) => !prioritySet || prioritySet.has(todo.priority))
    .filter((todo) => !modeSet || modeSet.has(todo.mode))
    .filter((todo) => matchesSearch(todo, projectFor(data, todo), options.search))
    .map((todo) => ({ todo, sort: sortValue(todo, view) }))
    .sort((a, b) => a.sort.localeCompare(b.sort) || a.todo.id.localeCompare(b.todo.id));

  const startIndex = cursor ? all.findIndex((item) => item.sort > cursor.sort || (item.sort === cursor.sort && item.todo.id > cursor.id)) : 0;
  const normalizedStart = startIndex < 0 ? all.length : startIndex;
  const page = all.slice(normalizedStart, normalizedStart + limit);
  const items = page.map(({ todo }) => {
    const project = projectFor(data, todo);
    return {
      ...todo,
      attentionDate: attentionDate(todo.plannedFor, todo.deadline),
      reasons: reasonsFor(todo, view, today, project),
      project,
      activeReminder: activeReminder(data, todo.id),
      latestRun: latestRun(data, todo.id),
      allowedActions: allowedActions(todo, data),
    } satisfies TodoProjection;
  });
  const tail = page.at(-1);
  const nextCursor = normalizedStart + page.length < all.length && tail
    ? base64UrlEncode(JSON.stringify({ sort: tail.sort, id: tail.todo.id }))
    : undefined;
  return { items, nextCursor, total: all.length, revision: data.revision, generatedAt: new Date().toISOString() };
}

export interface ReviewProjection {
  weekOf: string;
  inbox: TodoProjection[];
  overdue: TodoProjection[];
  nextSevenDays: TodoProjection[];
  unscheduled: TodoProjection[];
  exceptions: Array<{ type: "reminder" | "automation"; entityId: string; todoId: string; state: string; diagnostic?: string; allowedActions: string[] }>;
  recentlyCompleted: TodoProjection[];
  revision: number;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

export function reviewProjection(data: StoreData, timeZone?: string, todayInput?: string): ReviewProjection {
  const today = todayInput ?? localToday(timeZone);
  const base = projectTodos(data, { view: "all", limit: PAGE_SIZE_MAX, today, timeZone }).items;
  const completed = projectTodos(data, { view: "completed", limit: PAGE_SIZE_MAX, today, timeZone }).items;
  const nextWeek = addDays(today, 7);
  return {
    weekOf: today,
    inbox: base.filter((todo) => !todo.projectId),
    overdue: base.filter((todo) => Boolean(todo.attentionDate && todo.attentionDate < today)),
    nextSevenDays: base.filter((todo) => Boolean(todo.attentionDate && todo.attentionDate >= today && todo.attentionDate <= nextWeek)),
    unscheduled: base.filter((todo) => !todo.attentionDate),
    exceptions: [
      ...Object.values(data.reminders).filter((item) => ["handoff_failed", "handoff_unknown"].includes(item.status)).map((item) => ({ type: "reminder" as const, entityId: item.id, todoId: item.todoId, state: item.status, diagnostic: item.lastError, allowedActions: ["retry"] })),
      ...Object.values(data.runs).filter((item) => ["failed", "needs_action", "cancel_requested"].includes(item.status)).map((item) => ({ type: "automation" as const, entityId: item.id, todoId: item.todoId, state: item.status, diagnostic: item.lastError, allowedActions: item.status === "cancel_requested" ? ["inspect"] : ["retry", "inspect"] })),
    ],
    recentlyCompleted: completed.filter((todo) => Boolean(todo.completedAt && todo.completedAt.slice(0, 10) >= addDays(today, -7))),
    revision: data.revision,
  };
}
