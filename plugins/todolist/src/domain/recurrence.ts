import type { RecurrenceCalendarRule, RecurrenceRule, RecurrenceRuleVersion } from "./model.ts";
import { addCalendar, compareDate, requireDate } from "./time.ts";

function utcDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function dayDiff(a: string, b: string): number {
  return Math.round((utcDate(b).getTime() - utcDate(a).getTime()) / 86_400_000);
}

function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by! - ay!) * 12 + (bm! - am!);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dateFromParts(year: number, month: number, day: number): string {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.toISOString().slice(0, 10);
}

export function recurrenceKey(seriesId: string, ruleVersionId: string, nominalLocalDate: string): string {
  return `${seriesId}:${ruleVersionId}:${nominalLocalDate}`;
}

export function isCalendarOccurrence(rule: RecurrenceCalendarRule, candidate: string): boolean {
  if (compareDate(candidate, rule.anchorDate) < 0) return false;
  if (rule.untilDate && compareDate(candidate, rule.untilDate) > 0) return false;
  const anchor = utcDate(rule.anchorDate);
  const date = utcDate(candidate);
  switch (rule.frequency) {
    case "daily":
      return dayDiff(rule.anchorDate, candidate) % rule.interval === 0;
    case "weekly": {
      const weekIndex = Math.floor(dayDiff(rule.anchorDate, candidate) / 7);
      if (weekIndex % rule.interval !== 0) return false;
      const days = rule.weekDays?.length ? rule.weekDays : [anchor.getUTCDay()];
      return days.includes(date.getUTCDay());
    }
    case "monthly": {
      const diff = monthDiff(rule.anchorDate, candidate);
      if (diff < 0 || diff % rule.interval !== 0) return false;
      const [year, month, day] = candidate.split("-").map(Number);
      const targetDay = Math.min(rule.dayOfMonth ?? anchor.getUTCDate(), daysInMonth(year!, month!));
      return day === targetDay;
    }
    case "yearly": {
      const [year, month, day] = candidate.split("-").map(Number);
      const anchorYear = anchor.getUTCFullYear();
      if ((year! - anchorYear) % rule.interval !== 0) return false;
      const targetMonth = rule.monthOfYear ?? anchor.getUTCMonth() + 1;
      const targetDay = Math.min(rule.dayOfMonth ?? anchor.getUTCDate(), daysInMonth(year!, targetMonth));
      return month === targetMonth && day === targetDay;
    }
  }
}

export function materializeCalendarDates(rule: RecurrenceCalendarRule, fromDate: string, throughDate: string, limit = 500): string[] {
  requireDate(fromDate, "fromDate");
  requireDate(throughDate, "throughDate");
  if (compareDate(fromDate, throughDate) > 0) return [];
  const start = compareDate(fromDate, rule.anchorDate) < 0 ? rule.anchorDate : fromDate;
  const end = rule.untilDate && compareDate(rule.untilDate, throughDate) < 0 ? rule.untilDate : throughDate;
  const result: string[] = [];

  // Iterating a bounded date window keeps semantics simple and deterministic. The caller caps
  // the Upcoming window and this function caps emitted occurrences.
  for (let cursor = start; compareDate(cursor, end) <= 0 && result.length < limit; cursor = addCalendar(cursor, 1, "day")) {
    if (isCalendarOccurrence(rule, cursor)) result.push(cursor);
  }
  return result;
}

export function nextAfterCompletion(rule: Extract<RecurrenceRule, { kind: "after_completion" }>, completedDate: string): string {
  return addCalendar(completedDate, rule.interval, rule.unit);
}

export function activeRuleVersion(versions: RecurrenceRuleVersion[], date: string): RecurrenceRuleVersion | undefined {
  return versions
    .filter((version) => compareDate(version.effectiveFrom, date) <= 0 && (!version.effectiveUntil || compareDate(date, version.effectiveUntil) < 0))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

export function shiftedRule(rule: RecurrenceRule, boundaryDate: string): RecurrenceRule {
  if (rule.kind === "after_completion") return { ...rule, anchorDate: boundaryDate };
  return { ...rule, anchorDate: boundaryDate };
}

export function nominalDateForMonthly(year: number, month: number, requestedDay: number): string {
  return dateFromParts(year, month, Math.min(requestedDay, daysInMonth(year, month)));
}
