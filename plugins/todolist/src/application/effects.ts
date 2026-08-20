import type {
  AutomationRun,
  ReminderRecord,
  SideEffectIntent,
  SideEffectIntentKind,
  StoreData,
  TodoRecord,
} from "../domain/model.ts";
import { newId, nowIso } from "../domain/utils.ts";

const ACTIVE_REMINDERS = new Set(["pending_registration", "scheduled", "handoff_claimed", "cancel_requested"]);
const ACTIVE_RUNS = new Set(["pending_registration", "scheduled", "running", "cancel_requested"]);

function occurrenceKey(todo: TodoRecord): string {
  return todo.occurrenceMeta?.recurrenceKey ?? "root";
}

function enqueueIntent(
  draft: StoreData,
  kind: SideEffectIntentKind,
  entityId: string,
  identity: string,
  payload: Record<string, unknown>,
): SideEffectIntent {
  const existing = Object.values(draft.intents).find((intent) => intent.identity === identity && intent.kind === kind && ["pending", "processing"].includes(intent.status));
  if (existing) return existing;
  const at = nowIso();
  const intent: SideEffectIntent = {
    id: newId("intent"),
    identity,
    kind,
    entityId,
    payload,
    status: "pending",
    attempts: 0,
    createdAt: at,
    updatedAt: at,
  };
  draft.intents[intent.id] = intent;
  return intent;
}

function requestReminderCancel(draft: StoreData, reminder: ReminderRecord): void {
  if (["handed_off", "handoff_failed", "handoff_unknown", "cancelled"].includes(reminder.status)) return;
  reminder.status = "cancel_requested";
  reminder.updatedAt = nowIso();
  reminder.version += 1;
  enqueueIntent(draft, "cancel_reminder", reminder.id, `cancel:${reminder.identity}`, { reminderId: reminder.id, taskId: reminder.taskId });
}

function requestRunCancel(draft: StoreData, run: AutomationRun): void {
  if (["succeeded", "failed", "needs_action", "cancelled"].includes(run.status)) return;
  run.status = "cancel_requested";
  run.updatedAt = nowIso();
  run.version += 1;
  enqueueIntent(draft, "cancel_run", run.id, `cancel:${run.identity}:${run.currentAttemptId ?? "schedule"}`, { runId: run.id, taskId: run.taskId, attemptId: run.currentAttemptId });
}

export interface ReconcileOptions {
  createMissing: boolean;
  reason: string;
}

export function reconcileTodoEffects(draft: StoreData, todo: TodoRecord, options: ReconcileOptions): void {
  const key = occurrenceKey(todo);
  const eligible = todo.status === "pending" && !todo.archivedAt;
  const reminderRecords = Object.values(draft.reminders).filter((item) => item.todoId === todo.id && item.occurrenceKey === key);
  const runRecords = Object.values(draft.runs).filter((item) => item.todoId === todo.id && item.occurrenceKey === key);

  const wantsReminder = eligible && todo.mode === "reminder" && Boolean(todo.reminderTrigger?.enabled);
  if (!wantsReminder) {
    for (const reminder of reminderRecords.filter((item) => ACTIVE_REMINDERS.has(item.status))) requestReminderCancel(draft, reminder);
  } else if (options.createMissing) {
    const trigger = todo.reminderTrigger!;
    const identity = `reminder:${todo.id}:${key}:${trigger.instant}:v${todo.version}`;
    const existing = reminderRecords.find((item) => item.identity === identity);
    for (const reminder of reminderRecords.filter((item) => item.identity !== identity && ACTIVE_REMINDERS.has(item.status))) requestReminderCancel(draft, reminder);
    if (!existing) {
      const at = nowIso();
      const reminder: ReminderRecord = {
        id: newId("reminder"),
        identity,
        todoId: todo.id,
        occurrenceKey: key,
        runAt: trigger.instant,
        status: "pending_registration",
        attemptCount: 0,
        createdAt: at,
        updatedAt: at,
        version: 1,
      };
      draft.reminders[reminder.id] = reminder;
      enqueueIntent(draft, "schedule_reminder", reminder.id, `schedule:${identity}`, { reminderId: reminder.id, reason: options.reason });
    }
  }

  const wantsRun = eligible && todo.mode === "agent_execute" && Boolean(todo.agentTrigger?.enabled);
  if (!wantsRun) {
    for (const run of runRecords.filter((item) => ACTIVE_RUNS.has(item.status))) requestRunCancel(draft, run);
  } else if (options.createMissing) {
    const trigger = todo.agentTrigger!;
    const identity = `run:${todo.id}:${key}:${trigger.instant}`;
    const existing = runRecords.find((item) => item.identity === identity);
    for (const run of runRecords.filter((item) => item.identity !== identity && ACTIVE_RUNS.has(item.status))) requestRunCancel(draft, run);
    if (!existing) {
      const at = nowIso();
      const run: AutomationRun = {
        id: newId("run"),
        identity,
        todoId: todo.id,
        occurrenceKey: key,
        runAt: trigger.instant,
        status: "pending_registration",
        createdAt: at,
        updatedAt: at,
        version: 1,
      };
      draft.runs[run.id] = run;
      enqueueIntent(draft, "schedule_run", run.id, `schedule:${identity}`, { runId: run.id, reason: options.reason });
    }
  }
}

export function requestAllTodoEffectsCancelled(draft: StoreData, todoId: string): void {
  for (const reminder of Object.values(draft.reminders).filter((item) => item.todoId === todoId)) requestReminderCancel(draft, reminder);
  for (const run of Object.values(draft.runs).filter((item) => item.todoId === todoId)) requestRunCancel(draft, run);
}

export function retryReminderIntent(draft: StoreData, reminder: ReminderRecord): SideEffectIntent {
  const at = nowIso();
  reminder.status = "pending_registration";
  reminder.lastError = undefined;
  reminder.updatedAt = at;
  reminder.version += 1;
  return enqueueIntent(draft, "schedule_reminder", reminder.id, `retry:${reminder.identity}:${reminder.attemptCount + 1}`, { reminderId: reminder.id, explicitRetry: true });
}

export function retryRunIntent(draft: StoreData, run: AutomationRun, runAt: string): SideEffectIntent {
  run.status = "pending_registration";
  run.runAt = runAt;
  run.lastError = undefined;
  run.resultSummary = undefined;
  run.currentAttemptId = undefined;
  run.updatedAt = nowIso();
  run.version += 1;
  return enqueueIntent(draft, "schedule_run", run.id, `retry:${run.identity}:${run.version}`, { runId: run.id, explicitRetry: true });
}
