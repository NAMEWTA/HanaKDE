export type TodoStatus = "pending" | "completed";
export type TodoMode = "manual" | "reminder" | "agent_execute";
export type RecurrenceRule = {
  id: string;
  todoId: string;
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
  count?: number;
  until?: string;
  afterCompletion?: boolean;
  status: "active" | "paused" | "ended";
  version: number;
};
export type TodoTime =
  | { kind: "date"; date: string }
  | { kind: "exact"; instant: string; timeZone: string; offsetMinutes: number };

export type Todo = {
  id: string;
  title: string;
  notes: string;
  priority?: "low" | "normal" | "high";
  status: TodoStatus;
  mode: TodoMode;
  plannedFor: TodoTime | null;
  deadline: TodoTime | null;
  reminderAt: TodoTime | null;
  projectId: string | null;
  tags: string[];
  agentId?: string | null;
  instructions?: string | null;
  permissionMode?: string | null;
  workspaceRef?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  deletedAt: string | null;
  version: number;
};

export type TodoInput = {
  title: string;
  notes?: string;
  priority?: "low" | "normal" | "high";
  mode?: TodoMode;
  plannedFor?: TodoTime | null;
  deadline?: TodoTime | null;
  reminderAt?: TodoTime | null;
  projectId?: string | null;
  tags?: string[];
  agentId?: string | null;
  instructions?: string | null;
  permissionMode?: string | null;
  workspaceRef?: string | null;
};

export type TodoPatch = Partial<TodoInput> & {
  expectedVersion: number;
};

export type TodoQuery = {
  status?: TodoStatus | "all";
  includeTrash?: boolean;
  projectId?: string | null;
  limit?: number;
  cursor?: string | null;
  view?: "inbox" | "today" | "upcoming" | "completed" | "all" | "calendar";
  timeZone?: string;
  search?: string;
};

export type StoreState = {
  schemaVersion: 1;
  storeVersion: number;
  todos: Todo[];
  projects: Array<{ id: string; name: string; deletedAt: string | null; version: number; createdAt: string; updatedAt: string }>;
  audit: Array<{ id: string; action: string; at: string; todoId?: string; detail?: string }>;
  confirmations: Array<{ id: string; kind: "purge"; todoIds: string[]; expectedVersions: Record<string, number>; sessionKey: string; expiresAt: string; consumedAt: string | null }>;
  recurrenceRules: RecurrenceRule[];
  occurrences: Array<{ id: string; todoId: string; ruleId: string; occurrenceDate: string; status: "active" | "completed" | "skipped"; title: string; createdAt: string; completedAt: string | null }>;
  reminders: Array<{ id: string; todoId: string; occurrenceId: string | null; dueAt: string; status: "scheduled" | "claimed" | "handed_off" | "failed" | "unknown" | "cancelled"; attempts: number; lastError: string | null }>;
  runs: Array<{ id: string; todoId: string; occurrenceId: string | null; mode: "agent_execute"; status: "queued" | "running" | "succeeded" | "failed" | "needs_action" | "cancel_requested" | "cancelled"; sessionRef: { sessionId?: string; sessionPath?: string } | null; summary: string | null; diagnostic: string | null; createdAt: string; updatedAt: string }>;
  attempts: Array<{ id: string; runId: string; number: number; status: string; summary: string | null; createdAt: string; completedAt: string | null }>;
  runtime: { readiness: "initializing" | "ready" | "degraded"; readinessAttempts: number; lastError: string | null };
  exchangeAudit: Array<{ id: string; action: string; at: string; commandId?: string; sourceDigest?: string; detail?: string }>;
};

export type Project = StoreState["projects"][number];

export type TodoResult = { todo: Todo; storeVersion: number };
export type TodoPage = { items: Todo[]; nextCursor: string | null; storeVersion: number };
