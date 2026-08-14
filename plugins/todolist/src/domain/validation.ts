import { TodoError } from "../errors.ts";
import type {
  ExecutionMode,
  PermissionMode,
  Priority,
  ProjectRecord,
  RecurrenceRule,
  ResourceRef,
  TodoRecord,
} from "./model.ts";
import {
  DESCRIPTION_MAX_CODEPOINTS,
  MAX_TAGS,
  TAG_MAX_CODEPOINTS,
  TITLE_MAX_CODEPOINTS,
} from "./model.ts";
import { assertTimeZone, normalizeDateTimeValue, normalizeTrigger, requireDate } from "./time.ts";
import { asStringArray, codePointLength, enumValue, optionalNumber, optionalString, requireRecord, requiredString } from "./utils.ts";

export const PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const satisfies readonly Priority[];
export const MODES = ["manual", "reminder", "agent_execute"] as const satisfies readonly ExecutionMode[];
export const PERMISSION_MODES = ["ask", "read_only", "workspace_write"] as const satisfies readonly PermissionMode[];

export function normalizeTitle(value: unknown, field = "title"): string {
  const title = requiredString(value, field, TITLE_MAX_CODEPOINTS).trim();
  if (codePointLength(title) > TITLE_MAX_CODEPOINTS) throw new TodoError("validation", `${field} exceeds ${TITLE_MAX_CODEPOINTS} Unicode code points`, { field });
  if (/\r|\n/.test(title)) throw new TodoError("validation", `${field} must be a single line`, { field });
  return title;
}

export function normalizeDescription(value: unknown, field = "description"): string {
  const description = optionalString(value, field, DESCRIPTION_MAX_CODEPOINTS) ?? "";
  if (codePointLength(description) > DESCRIPTION_MAX_CODEPOINTS) throw new TodoError("validation", `${field} is too long`, { field });
  return description;
}

export function normalizeTags(value: unknown, field = "tags"): string[] {
  return asStringArray(value, field, MAX_TAGS, TAG_MAX_CODEPOINTS).map((tag) => tag.normalize("NFKC").trim()).filter(Boolean);
}

const RESOURCE_REF_MAX_BYTES = 8 * 1024;
const RESOURCE_REF_MAX_DEPTH = 8;
const RESOURCE_REF_MAX_ENTRIES = 96;
const RESOURCE_REF_MAX_STRING = 2_048;
const SECRET_KEY = /(?:token|secret|password|credential|authorization|cookie|api[_-]?key|private[_-]?key)/iu;
const STABLE_REF_KEY = /^(?:id|resourceId|resourceKey|uri|scheme|kind|type|provider|mountId|sessionId|handle)$/iu;
const ABSOLUTE_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\|\/|~[\\/]|file:)/u;

function normalizeResourceValue(
  value: unknown,
  field: string,
  depth: number,
  budget: { entries: number; stable: boolean },
): import("./model.ts").JsonValue {
  if (depth > RESOURCE_REF_MAX_DEPTH) {
    throw new TodoError("validation", `${field} exceeds the maximum nesting depth`, { field });
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TodoError("validation", `${field} must contain finite JSON numbers`, { field });
    return value;
  }
  if (typeof value === "string") {
    if (value.includes("\0")) throw new TodoError("validation", `${field} contains an invalid character`, { field });
    if (value.length > RESOURCE_REF_MAX_STRING) throw new TodoError("validation", `${field} is too long`, { field });
    if (ABSOLUTE_PATH.test(value.trim())) {
      throw new TodoError("validation", `${field} must be a host ResourceRef, not an absolute path`, { field, nextAction: "pick_workspace" });
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > RESOURCE_REF_MAX_ENTRIES) throw new TodoError("validation", `${field} has too many entries`, { field });
    return value.map((item, index) => normalizeResourceValue(item, `${field}[${index}]`, depth + 1, budget));
  }
  if (!value || typeof value !== "object") {
    throw new TodoError("validation", `${field} must contain JSON-only ResourceRef data`, { field });
  }
  const record = value as Record<string, unknown>;
  const entries = Object.entries(record);
  if (!entries.length) throw new TodoError("validation", `${field} must not be empty`, { field });
  if (entries.length > RESOURCE_REF_MAX_ENTRIES) throw new TodoError("validation", `${field} has too many fields`, { field });
  const normalized: Record<string, import("./model.ts").JsonValue> = {};
  for (const [key, child] of entries) {
    budget.entries += 1;
    if (budget.entries > RESOURCE_REF_MAX_ENTRIES) throw new TodoError("validation", `${field} is too complex`, { field });
    if (!key || key.length > 120) throw new TodoError("validation", `${field} contains an invalid field name`, { field });
    if (SECRET_KEY.test(key)) throw new TodoError("validation", `${field}.${key} must not persist credentials or secrets`, { field: `${field}.${key}` });
    if (STABLE_REF_KEY.test(key) && (typeof child === "string" || typeof child === "number") && String(child).trim()) budget.stable = true;
    normalized[key] = normalizeResourceValue(child, `${field}.${key}`, depth + 1, budget);
  }
  return normalized;
}

export function normalizeResourceRef(value: unknown, field = "workspaceRef"): ResourceRef | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const record = requireRecord(value, field);
  const budget = { entries: 0, stable: false };
  const normalized = normalizeResourceValue(record, field, 0, budget) as ResourceRef;
  if (!budget.stable) {
    throw new TodoError("validation", `${field} does not contain a stable host resource identifier`, { field, nextAction: "pick_workspace" });
  }
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > RESOURCE_REF_MAX_BYTES) {
    throw new TodoError("validation", `${field} exceeds the 8 KiB limit`, { field });
  }
  return normalized;
}

export function validateTodoAggregate(todo: TodoRecord, projects: Record<string, ProjectRecord>): void {
  normalizeTitle(todo.title);
  normalizeDescription(todo.description);
  todo.tags = normalizeTags(todo.tags);
  enumValue(todo.priority, PRIORITIES, "priority");
  enumValue(todo.mode, MODES, "mode");
  if (todo.projectId) {
    const project = projects[todo.projectId];
    if (!project || project.archivedAt) throw new TodoError("reference_conflict", "Project is unavailable", { field: "projectId", nextAction: "choose_project" });
  }
  if (todo.mode === "manual") {
    if (todo.reminderTrigger?.enabled || todo.agentTrigger?.enabled) {
      throw new TodoError("validation", "Manual Todo cannot keep an enabled background trigger", { field: "mode" });
    }
  }
  if (todo.mode === "reminder") {
    if (!todo.reminderTrigger?.enabled) throw new TodoError("validation", "Reminder mode requires an exact reminder trigger", { field: "reminderTrigger" });
    if (todo.agentTrigger?.enabled) throw new TodoError("validation", "Reminder mode cannot enable an Agent trigger", { field: "agentTrigger" });
  }
  if (todo.mode === "agent_execute") {
    const missing = [
      !todo.agentTrigger?.enabled && "agentTrigger",
      !todo.agentId && "agentId",
      !todo.instructions?.trim() && "instructions",
      !todo.permissionMode && "permissionMode",
      !todo.workspaceRef && "workspaceRef",
    ].filter(Boolean);
    if (missing.length) throw new TodoError("validation", `Agent execution requires ${missing.join(", ")}`, { field: String(missing[0]), nextAction: "complete_automation_configuration" });
  }
  if (todo.archivedAt && todo.status === "completed" && !todo.completedAt) {
    throw new TodoError("validation", "Completed Todo must retain completedAt", { field: "completedAt" });
  }
}

export function normalizeTodoPatch(input: unknown): Partial<TodoRecord> {
  const record = requireRecord(input, "patch");
  const patch: Partial<TodoRecord> = {};
  if ("title" in record) patch.title = normalizeTitle(record.title);
  if ("description" in record) patch.description = normalizeDescription(record.description);
  if ("projectId" in record) patch.projectId = optionalString(record.projectId, "projectId", 240);
  if ("tags" in record) patch.tags = normalizeTags(record.tags);
  if ("priority" in record) patch.priority = enumValue(record.priority, PRIORITIES, "priority");
  if ("plannedFor" in record) patch.plannedFor = normalizeDateTimeValue(record.plannedFor, "plannedFor");
  if ("deadline" in record) patch.deadline = normalizeDateTimeValue(record.deadline, "deadline");
  if ("mode" in record) patch.mode = enumValue(record.mode, MODES, "mode");
  if ("reminderTrigger" in record) patch.reminderTrigger = normalizeTrigger(record.reminderTrigger, "reminderTrigger");
  if ("agentTrigger" in record) patch.agentTrigger = normalizeTrigger(record.agentTrigger, "agentTrigger");
  if ("agentId" in record) patch.agentId = optionalString(record.agentId, "agentId", 240);
  if ("instructions" in record) patch.instructions = optionalString(record.instructions, "instructions", 12_000);
  if ("permissionMode" in record) patch.permissionMode = record.permissionMode === null || record.permissionMode === "" ? undefined : enumValue(record.permissionMode, PERMISSION_MODES, "permissionMode");
  if ("workspaceRef" in record) patch.workspaceRef = normalizeResourceRef(record.workspaceRef, "workspaceRef");
  return patch;
}

export function normalizeRecurrenceRule(value: unknown): RecurrenceRule {
  const record = requireRecord(value, "rule");
  const kind = enumValue(record.kind, ["calendar", "after_completion"] as const, "rule.kind");
  const interval = optionalNumber(record.interval, "rule.interval") ?? 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 999) throw new TodoError("validation", "rule.interval must be an integer between 1 and 999", { field: "rule.interval" });
  const anchorDate = requireDate(record.anchorDate, "rule.anchorDate");
  const timeZone = requiredString(record.timeZone, "rule.timeZone", 120);
  assertTimeZone(timeZone, "rule.timeZone");
  if (kind === "after_completion") {
    return {
      kind,
      interval,
      unit: enumValue(record.unit, ["day", "week", "month", "year"] as const, "rule.unit"),
      anchorDate,
      timeZone,
    };
  }
  const frequency = enumValue(record.frequency, ["daily", "weekly", "monthly", "yearly"] as const, "rule.frequency");
  const untilDate = record.untilDate ? requireDate(record.untilDate, "rule.untilDate") : undefined;
  let weekDays: number[] | undefined;
  if (record.weekDays !== undefined) {
    if (!Array.isArray(record.weekDays)) throw new TodoError("validation", "rule.weekDays must be an array", { field: "rule.weekDays" });
    weekDays = [...new Set(record.weekDays.map((value, index) => {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 6) throw new TodoError("validation", `rule.weekDays[${index}] must be 0..6`, { field: `rule.weekDays[${index}]` });
      return value;
    }))].sort();
  }
  const dayOfMonth = optionalNumber(record.dayOfMonth, "rule.dayOfMonth");
  if (dayOfMonth !== undefined && (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31)) throw new TodoError("validation", "rule.dayOfMonth must be 1..31", { field: "rule.dayOfMonth" });
  const monthOfYear = optionalNumber(record.monthOfYear, "rule.monthOfYear");
  if (monthOfYear !== undefined && (!Number.isInteger(monthOfYear) || monthOfYear < 1 || monthOfYear > 12)) throw new TodoError("validation", "rule.monthOfYear must be 1..12", { field: "rule.monthOfYear" });
  return { kind, interval, frequency, anchorDate, timeZone, weekDays, dayOfMonth, monthOfYear, untilDate };
}
