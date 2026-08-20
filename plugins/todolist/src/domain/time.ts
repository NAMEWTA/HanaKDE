import { TodoError } from "../errors.ts";
import type { DateTimeValue, DateTimeValueExact, TriggerConfig } from "./model.ts";
import { enumValue, optionalBoolean, optionalNumber, optionalString, requireRecord, requiredString } from "./utils.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

export function isDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

export function requireDate(value: unknown, field: string): string {
  const date = requiredString(value, field, 10);
  if (!isDateString(date)) throw new TodoError("validation", `${field} must be a valid YYYY-MM-DD date`, { field });
  return date;
}

export function normalizeLocalDateTime(value: string, field: string): string {
  if (!LOCAL_RE.test(value)) throw new TodoError("validation", `${field} must be YYYY-MM-DDTHH:mm or include seconds`, { field });
  const normalized = value.length === 16 ? `${value}:00` : value;
  const [date, time] = normalized.split("T");
  if (!isDateString(date!)) throw new TodoError("validation", `${field} contains an invalid date`, { field });
  const [hour, minute, second] = time!.split(":").map(Number);
  if (hour! > 23 || minute! > 59 || second! > 59) throw new TodoError("validation", `${field} contains an invalid time`, { field });
  return normalized;
}

export function assertTimeZone(timeZone: string, field: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  } catch {
    throw new TodoError("validation", `${field} must be a valid IANA timezone`, { field });
  }
}

function partsForInstant(instant: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const result: Record<string, number> = {};
  for (const part of parts) {
    if (["year", "month", "day", "hour", "minute", "second"].includes(part.type)) result[part.type] = Number(part.value);
  }
  return result;
}

export function offsetMinutesAt(instantIso: string, timeZone: string): number {
  assertTimeZone(timeZone, "timeZone");
  const instant = new Date(instantIso);
  if (!Number.isFinite(instant.getTime())) throw new TodoError("validation", "instant must be a valid ISO timestamp", { field: "instant" });
  const p = partsForInstant(instant, timeZone);
  const representedUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return Math.round((representedUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

export function localDateTimeAt(instantIso: string, timeZone: string): string {
  const p = partsForInstant(new Date(instantIso), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month!)}-${pad(p.day!)}T${pad(p.hour!)}:${pad(p.minute!)}:${pad(p.second!)}`;
}

function nominalUtcMs(localDateTime: string): number {
  const normalized = normalizeLocalDateTime(localDateTime, "localDateTime");
  const [date, time] = normalized.split("T");
  const [y, m, d] = date!.split("-").map(Number);
  const [h, min, s] = time!.split(":").map(Number);
  return Date.UTC(y!, m! - 1, d!, h!, min!, s!);
}

export function resolveExactLocal(input: {
  localDateTime: string;
  timeZone: string;
  offsetMinutes?: number;
  instant?: string;
}, field: string): DateTimeValueExact {
  const localDateTime = normalizeLocalDateTime(input.localDateTime, `${field}.localDateTime`);
  const timeZone = requiredString(input.timeZone, `${field}.timeZone`, 120);
  assertTimeZone(timeZone, `${field}.timeZone`);

  if (input.instant) {
    const date = new Date(input.instant);
    if (!Number.isFinite(date.getTime())) throw new TodoError("validation", `${field}.instant must be ISO`, { field: `${field}.instant` });
    const instant = date.toISOString();
    const actualLocal = localDateTimeAt(instant, timeZone);
    if (actualLocal !== localDateTime) {
      throw new TodoError("validation", `${field} local value does not match instant in timezone (DST gap or mismatch)`, { field });
    }
    const actualOffset = offsetMinutesAt(instant, timeZone);
    if (input.offsetMinutes !== undefined && actualOffset !== input.offsetMinutes) {
      throw new TodoError("validation", `${field}.offsetMinutes does not match timezone at instant`, { field: `${field}.offsetMinutes` });
    }
    return { kind: "exact", localDateTime, timeZone, offsetMinutes: actualOffset, instant };
  }

  const wantedOffset = input.offsetMinutes;
  const candidates: DateTimeValueExact[] = [];
  const nominal = nominalUtcMs(localDateTime);
  // IANA UTC offsets are bounded to +/-14 hours. Scanning one-minute offsets is deterministic
  // and only runs on explicit user input, not as a scheduler.
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const instant = new Date(nominal - offset * 60_000).toISOString();
    if (localDateTimeAt(instant, timeZone) === localDateTime && offsetMinutesAt(instant, timeZone) === offset) {
      candidates.push({ kind: "exact", localDateTime, timeZone, offsetMinutes: offset, instant });
    }
  }
  if (candidates.length === 0) {
    throw new TodoError("validation", `${field} falls in a daylight-saving gap`, { field, nextAction: "choose_another_time" });
  }
  if (wantedOffset !== undefined) {
    const selected = candidates.find((candidate) => candidate.offsetMinutes === wantedOffset);
    if (!selected) throw new TodoError("validation", `${field}.offsetMinutes is not valid for this local time`, { field: `${field}.offsetMinutes` });
    return selected;
  }
  if (candidates.length > 1) {
    throw new TodoError("validation", `${field} is ambiguous during a daylight-saving overlap; choose offsetMinutes`, { field: `${field}.offsetMinutes`, nextAction: "choose_offset" });
  }
  return candidates[0]!;
}

export function normalizeDateTimeValue(value: unknown, field: string): DateTimeValue | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string") return { kind: "date", date: requireDate(value, field) };
  const record = requireRecord(value, field);
  const kind = enumValue(record.kind, ["date", "exact"] as const, `${field}.kind`);
  if (kind === "date") return { kind, date: requireDate(record.date, `${field}.date`) };
  return resolveExactLocal({
    localDateTime: requiredString(record.localDateTime, `${field}.localDateTime`, 32),
    timeZone: requiredString(record.timeZone, `${field}.timeZone`, 120),
    offsetMinutes: optionalNumber(record.offsetMinutes, `${field}.offsetMinutes`),
    instant: optionalString(record.instant, `${field}.instant`, 80),
  }, field);
}

export function normalizeTrigger(value: unknown, field: string): TriggerConfig | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const record = requireRecord(value, field);
  const exact = resolveExactLocal({
    localDateTime: requiredString(record.localDateTime, `${field}.localDateTime`, 32),
    timeZone: requiredString(record.timeZone, `${field}.timeZone`, 120),
    offsetMinutes: optionalNumber(record.offsetMinutes, `${field}.offsetMinutes`),
    instant: optionalString(record.instant, `${field}.instant`, 80),
  }, field);
  return { ...exact, kind: "exact", enabled: optionalBoolean(record.enabled, `${field}.enabled`) ?? true };
}

export function datePart(value?: DateTimeValue): string | undefined {
  if (!value) return undefined;
  return value.kind === "date" ? value.date : value.localDateTime.slice(0, 10);
}

export function attentionDate(plannedFor?: DateTimeValue, deadline?: DateTimeValue): string | undefined {
  const values = [datePart(plannedFor), datePart(deadline)].filter((item): item is string => Boolean(item)).sort();
  return values[0];
}

export function localToday(timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", clock = new Date()): string {
  assertTimeZone(timeZone, "timeZone");
  const p = partsForInstant(clock, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month!)}-${pad(p.day!)}`;
}

export function addCalendar(date: string, amount: number, unit: "day" | "week" | "month" | "year"): string {
  requireDate(date, "date");
  const [y, m, d] = date.split("-").map(Number);
  if (unit === "day" || unit === "week") {
    const value = new Date(Date.UTC(y!, m! - 1, d! + amount * (unit === "week" ? 7 : 1)));
    return value.toISOString().slice(0, 10);
  }
  if (unit === "month") {
    const monthIndex = m! - 1 + amount;
    const targetYear = y! + Math.floor(monthIndex / 12);
    const targetMonth = ((monthIndex % 12) + 12) % 12;
    const maxDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    return new Date(Date.UTC(targetYear, targetMonth, Math.min(d!, maxDay))).toISOString().slice(0, 10);
  }
  const maxDay = new Date(Date.UTC(y! + amount, m!, 0)).getUTCDate();
  return new Date(Date.UTC(y! + amount, m! - 1, Math.min(d!, maxDay))).toISOString().slice(0, 10);
}

export function compareDate(a: string, b: string): number {
  return a.localeCompare(b);
}
