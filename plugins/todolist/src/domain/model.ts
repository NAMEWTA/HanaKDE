export const STORE_SCHEMA_VERSION = 2 as const;
export const EXCHANGE_SCHEMA_VERSION = 1 as const;
export const PAGE_SIZE_DEFAULT = 50;
export const PAGE_SIZE_MAX = 100;
export const TITLE_MAX_CODEPOINTS = 240;
export const DESCRIPTION_MAX_CODEPOINTS = 12_000;
export const TAG_MAX_CODEPOINTS = 48;
export const MAX_TAGS = 32;

export type Locale = "zh-CN" | "zh-TW" | "ja" | "ko" | "en";
export type TodoStatus = "pending" | "completed";
export type ExecutionMode = "manual" | "reminder" | "agent_execute";
export type Priority = "none" | "low" | "medium" | "high" | "urgent";
export type PermissionMode = "ask" | "read_only" | "workspace_write";
export type ViewName = "today" | "inbox" | "upcoming" | "all" | "calendar" | "completed" | "trash" | "automation" | "review" | "project";

/** JSON-safe opaque reference returned by the Hana Resource picker.
 *
 * The plugin persists the host reference, never a materialized absolute path.
 * ResourceIO is the only component allowed to turn this value into a local path
 * at invocation time.
 */
export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };
export type ResourceRef = { [key: string]: JsonValue };

export interface DateTimeValueDate {
  kind: "date";
  date: string;
}

export interface DateTimeValueExact {
  kind: "exact";
  localDateTime: string;
  timeZone: string;
  offsetMinutes: number;
  instant: string;
}

export type DateTimeValue = DateTimeValueDate | DateTimeValueExact;

export interface TriggerConfig {
  kind: "exact";
  localDateTime: string;
  timeZone: string;
  offsetMinutes: number;
  instant: string;
  enabled: boolean;
}

export interface OccurrenceMeta {
  seriesId: string;
  ruleVersionId: string;
  recurrenceKey: string;
  nominalLocalDate: string;
  overrideId?: string;
}

export interface TodoRecord {
  id: string;
  title: string;
  description: string;
  status: TodoStatus;
  archivedAt?: string;
  completedAt?: string;
  projectId?: string;
  projectHistory?: string[];
  tags: string[];
  priority: Priority;
  plannedFor?: DateTimeValue;
  deadline?: DateTimeValue;
  mode: ExecutionMode;
  reminderTrigger?: TriggerConfig;
  agentTrigger?: TriggerConfig;
  agentId?: string;
  instructions?: string;
  permissionMode?: PermissionMode;
  workspaceRef?: ResourceRef;
  recurrenceSeriesId?: string;
  occurrenceMeta?: OccurrenceMeta;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ProjectRecord {
  id: string;
  name: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface RecurrenceCalendarRule {
  kind: "calendar";
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  anchorDate: string;
  weekDays?: number[];
  dayOfMonth?: number;
  monthOfYear?: number;
  timeZone: string;
  untilDate?: string;
}

export interface RecurrenceAfterCompletionRule {
  kind: "after_completion";
  interval: number;
  unit: "day" | "week" | "month" | "year";
  anchorDate: string;
  timeZone: string;
}

export type RecurrenceRule = RecurrenceCalendarRule | RecurrenceAfterCompletionRule;

export interface RecurrenceSeries {
  id: string;
  sourceTodoId: string;
  currentRuleVersionId: string;
  status: "active" | "paused" | "ended";
  materializedThrough?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface RecurrenceRuleVersion {
  id: string;
  seriesId: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  rule: RecurrenceRule;
  template: Pick<TodoRecord, "title" | "description" | "projectId" | "tags" | "priority" | "mode" | "reminderTrigger" | "agentTrigger" | "agentId" | "instructions" | "permissionMode" | "workspaceRef">;
  createdAt: string;
  version: number;
}

export interface OccurrenceOverride {
  id: string;
  seriesId: string;
  recurrenceKey: string;
  patch: Partial<TodoRecord>;
  createdAt: string;
  version: number;
}

export interface OccurrenceSuppression {
  id: string;
  seriesId: string;
  recurrenceKey: string;
  reason: "skip" | "delete" | "series_end";
  createdAt: string;
}

export type ReminderStatus =
  | "pending_registration"
  | "scheduled"
  | "handoff_claimed"
  | "handed_off"
  | "handoff_failed"
  | "handoff_unknown"
  | "cancel_requested"
  | "cancelled";

export interface ReminderRecord {
  id: string;
  identity: string;
  todoId: string;
  occurrenceKey: string;
  taskId?: string;
  runAt: string;
  status: ReminderStatus;
  attemptCount: number;
  lastError?: string;
  handedOffAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type AutomationRunStatus =
  | "pending_registration"
  | "scheduled"
  | "running"
  | "succeeded"
  | "failed"
  | "needs_action"
  | "cancel_requested"
  | "cancelled";

export type AutomationAttemptStatus = "queued" | "running" | "succeeded" | "failed" | "needs_action" | "cancel_requested" | "cancelled";

export interface AutomationRun {
  id: string;
  identity: string;
  todoId: string;
  occurrenceKey: string;
  taskId?: string;
  runAt: string;
  status: AutomationRunStatus;
  currentAttemptId?: string;
  lastError?: string;
  resultSummary?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface AutomationAttempt {
  id: string;
  runId: string;
  attemptNumber: number;
  status: AutomationAttemptStatus;
  sessionRef?: string;
  resultSummary?: string;
  diagnostic?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type SideEffectIntentKind = "schedule_reminder" | "cancel_reminder" | "schedule_run" | "cancel_run";
export type SideEffectIntentStatus = "pending" | "processing" | "confirmed" | "failed" | "unknown";

export interface SideEffectIntent {
  id: string;
  identity: string;
  kind: SideEffectIntentKind;
  entityId: string;
  payload: Record<string, unknown>;
  status: SideEffectIntentStatus;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IdempotencyRecord {
  commandId: string;
  actorKey: string;
  operation: string;
  result: unknown;
  createdAt: string;
  expiresAt: string;
}

export interface ImportDiagnostic {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
}

export interface ImportPreview {
  id: string;
  actorKey: string;
  sourceDigest: string;
  targetRevision: number;
  document: TodoExchangeDocumentV1;
  diagnostics: ImportDiagnostic[];
  canCommit: boolean;
  createdAt: string;
  expiresAt: string;
  committedCommandId?: string;
  result?: unknown;
}

export interface ConfirmationRecord {
  tokenHash: string;
  actorKey: string;
  sessionKey: string;
  action: string;
  targetId: string;
  targetVersion: number;
  expiresAt: string;
  usedAt?: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorKey: string;
  operation: string;
  entityType: string;
  entityId?: string;
  summary: string;
  correlationId?: string;
}

export interface RuntimeState {
  taskBackend: "initializing" | "ready" | "backend_unavailable";
  lastReadinessError?: string;
  lastReadinessAt?: string;
}

export interface StoreData {
  schemaVersion: typeof STORE_SCHEMA_VERSION;
  revision: number;
  createdAt: string;
  updatedAt: string;
  todos: Record<string, TodoRecord>;
  projects: Record<string, ProjectRecord>;
  recurrenceSeries: Record<string, RecurrenceSeries>;
  recurrenceRuleVersions: Record<string, RecurrenceRuleVersion>;
  occurrenceOverrides: Record<string, OccurrenceOverride>;
  occurrenceSuppressions: Record<string, OccurrenceSuppression>;
  reminders: Record<string, ReminderRecord>;
  runs: Record<string, AutomationRun>;
  attempts: Record<string, AutomationAttempt>;
  intents: Record<string, SideEffectIntent>;
  idempotency: Record<string, IdempotencyRecord>;
  importPreviews: Record<string, ImportPreview>;
  confirmations: Record<string, ConfirmationRecord>;
  audit: AuditEntry[];
  runtime: RuntimeState;
}

export interface TodoExchangeDocumentV1 {
  schema: "hana.todolist.exchange";
  version: typeof EXCHANGE_SCHEMA_VERSION;
  exportedAt: string;
  todos: TodoRecord[];
  projects: ProjectRecord[];
  recurrenceSeries: RecurrenceSeries[];
  recurrenceRuleVersions: RecurrenceRuleVersion[];
  occurrenceOverrides: OccurrenceOverride[];
  occurrenceSuppressions: OccurrenceSuppression[];
  reminders: ReminderRecord[];
  runs: AutomationRun[];
  attempts: AutomationAttempt[];
}

export interface QueryReason {
  type: "plannedFor" | "deadline" | "inbox" | "project" | "completed" | "trash" | "automation" | "review";
  label: string;
  date?: string;
}

export interface TodoProjection extends TodoRecord {
  attentionDate?: string;
  reasons: QueryReason[];
  project?: ProjectRecord;
  activeReminder?: ReminderRecord;
  latestRun?: AutomationRun;
  allowedActions: string[];
}

export interface QueryResult<T> {
  items: T[];
  nextCursor?: string;
  total: number;
  revision: number;
  generatedAt: string;
}
