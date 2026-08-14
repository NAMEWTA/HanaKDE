import path from "node:path";
import { TodoError, redactText } from "../errors.ts";
import type { AutomationAttempt, AutomationRun, ReminderRecord, TodoRecord } from "../domain/model.ts";
import type { InvocationContext } from "../interfaces/context.ts";

export const REMINDER_TASK_TYPE = "todolist.reminder";
export const AUTOMATION_TASK_TYPE = "todolist.agent_execute";

function capabilityError(action: string, error: unknown): TodoError {
  const message = error instanceof Error ? error.message : String(error);
  const unavailable = /NO_HANDLER|no handler|unavailable|not available/i.test(message);
  return new TodoError(unavailable ? "backend_unavailable" : "capability", `${action} failed: ${redactText(message)}`, {
    cause: error,
    recoverable: true,
    nextAction: "retry",
  });
}

async function request<T>(invocation: InvocationContext, type: string, payload: Record<string, unknown>, timeout = 30_000): Promise<T> {
  if (!invocation.bus?.request) throw new TodoError("backend_unavailable", `${type} is unavailable`, { recoverable: true, nextAction: "retry_when_backend_ready" });
  try {
    return await invocation.bus.request<T>(type, payload, { timeout });
  } catch (error) {
    throw capabilityError(type, error);
  }
}

export function extractScheduleId(result: unknown, fallback: string): string {
  if (!result || typeof result !== "object") return fallback;
  const record = result as Record<string, unknown>;
  const schedule = record.schedule && typeof record.schedule === "object" ? record.schedule as Record<string, unknown> : undefined;
  return String(schedule?.scheduleId ?? record.scheduleId ?? fallback);
}

export async function scheduleReminder(invocation: InvocationContext, reminder: ReminderRecord): Promise<string> {
  const scheduleId = reminder.taskId ?? `todolist:reminder:${reminder.identity}`;
  const result = await request<unknown>(invocation, "task:schedule", {
    scheduleId,
    type: REMINDER_TASK_TYPE,
    pluginId: invocation.pluginId,
    runAt: reminder.runAt,
    enabled: true,
    payload: { reminderId: reminder.id, identity: reminder.identity },
    meta: { reminderId: reminder.id, identity: reminder.identity, todoId: reminder.todoId },
  });
  return extractScheduleId(result, scheduleId);
}

export async function scheduleAutomation(invocation: InvocationContext, run: AutomationRun, todo: TodoRecord): Promise<string> {
  const scheduleId = run.taskId ?? `todolist:automation:${run.identity}`;
  const result = await request<unknown>(invocation, "task:schedule", {
    scheduleId,
    type: AUTOMATION_TASK_TYPE,
    pluginId: invocation.pluginId,
    agentId: todo.agentId,
    runAt: run.runAt,
    enabled: true,
    payload: { runId: run.id, identity: run.identity },
    meta: { runId: run.id, identity: run.identity, todoId: run.todoId },
  });
  return extractScheduleId(result, scheduleId);
}

export async function unschedule(invocation: InvocationContext, scheduleId: string): Promise<boolean> {
  const result = await request<unknown>(invocation, "task:unschedule", { scheduleId });
  if (!result || typeof result !== "object" || typeof (result as Record<string, unknown>).removed !== "boolean") {
    throw new TodoError("capability", "TaskRegistry returned an invalid cancellation confirmation", {
      recoverable: true,
      nextAction: "retry",
    });
  }
  return (result as Record<string, unknown>).removed as boolean;
}

export function handoffNotification(invocation: InvocationContext, todo: TodoRecord, reminder: ReminderRecord): void {
  if (!invocation.bus?.emit) throw new TodoError("backend_unavailable", "Global notification event is unavailable", { recoverable: true, nextAction: "retry" });
  try {
    const notification = {
      kind: "todolist.reminder",
      id: reminder.identity,
      title: todo.title,
      body: todo.description || "Hana Todo reminder",
      pluginId: invocation.pluginId,
      source: "todolist",
      todoId: todo.id,
      reminderId: reminder.id,
      createdAt: new Date().toISOString(),
    };
    // Keep the host's established notification envelope while exposing the same
    // correlation fields at top level for observability-only consumers.
    invocation.bus.emit({ type: "notification", notification, ...notification }, null);
  } catch (error) {
    throw capabilityError("notification handoff", error);
  }
}

function materializedPath(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const record = result as Record<string, unknown>;
  for (const key of ["path", "filePath", "realPath", "localPath"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  const descriptor = record.descriptor;
  if (descriptor && typeof descriptor === "object") return materializedPath(descriptor);
  return undefined;
}

export async function materializeWorkspace(invocation: InvocationContext, todo: TodoRecord): Promise<string> {
  if (!todo.workspaceRef) throw new TodoError("validation", "workspaceRef is required", { field: "workspaceRef" });
  if (!invocation.resources?.materialize) throw new TodoError("backend_unavailable", "ResourceIO materialize is unavailable", { recoverable: true, nextAction: "choose_available_workspace" });
  try {
    const result = await invocation.resources.materialize(todo.workspaceRef);
    const localPath = materializedPath(result);
    if (!localPath) throw new Error("ResourceIO did not return a materialized path");
    return path.resolve(localPath);
  } catch (error) {
    throw capabilityError("workspace materialization", error);
  }
}

export interface CreatedSession {
  sessionId?: string;
  sessionPath?: string;
  sessionRef: string;
}

export function parseCreatedSession(result: unknown): CreatedSession {
  if (!result || typeof result !== "object") throw new TodoError("capability", "Session create returned an invalid result", { recoverable: true });
  const record = result as Record<string, unknown>;
  const nested = record.session && typeof record.session === "object" ? record.session as Record<string, unknown> : undefined;
  const nestedRef = record.sessionRef && typeof record.sessionRef === "object" ? record.sessionRef as Record<string, unknown> : undefined;
  const sessionId = [record.sessionId, nested?.sessionId, nestedRef?.sessionId].find((value): value is string => typeof value === "string" && Boolean(value));
  const sessionPath = [record.sessionPath, nested?.sessionPath, nested?.path, nestedRef?.sessionPath].find((value): value is string => typeof value === "string" && Boolean(value));
  if (!sessionId && !sessionPath) throw new TodoError("capability", "Session create did not return a stable reference", { recoverable: true });
  return { sessionId, sessionPath, sessionRef: JSON.stringify({ ...(sessionId ? { sessionId } : {}), ...(sessionPath ? { sessionPath } : {}) }) };
}

export async function createAutomationSession(invocation: InvocationContext, todo: TodoRecord, workspacePath: string): Promise<CreatedSession> {
  const result = await request<unknown>(invocation, "session:create", {
    agentId: todo.agentId,
    cwd: workspacePath,
    workspaceFolders: [workspacePath],
    authorizedFolders: [workspacePath],
    permissionMode: todo.permissionMode,
    memoryEnabled: false,
    ownerPluginId: invocation.pluginId,
    kind: "todo_automation",
    sessionKind: "todo_automation",
    visibility: "plugin_private",
  });
  return parseCreatedSession(result);
}

function parseSessionRef(sessionRef: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(sessionRef);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch { /* handled below */ }
  return { sessionPath: sessionRef };
}

export async function sendAutomationMessage(invocation: InvocationContext, sessionRef: string, todo: TodoRecord, run: AutomationRun, attempt: AutomationAttempt): Promise<unknown> {
  return request(invocation, "session:send", {
    ...parseSessionRef(sessionRef),
    text: todo.instructions,
    context: {
      system: "Execute only this Todo within the authorized workspace and permission boundary. Do not claim completion unless the requested work has actually completed.",
      metadata: {
        pluginId: invocation.pluginId,
        todoId: todo.id,
        runId: run.id,
        attemptId: attempt.id,
        occurrenceKey: run.occurrenceKey,
      },
    },
  }, 60_000);
}

export async function abortAutomationSession(invocation: InvocationContext, sessionRef: string): Promise<boolean> {
  const parsed = parseSessionRef(sessionRef);
  const sessionPath = typeof parsed.sessionPath === "string" && parsed.sessionPath.trim()
    ? parsed.sessionPath.trim()
    : undefined;
  if (!sessionPath) {
    throw new TodoError("backend_unavailable", "Session cancellation requires a host sessionPath", {
      recoverable: true,
      nextAction: "open_session_and_cancel",
    });
  }
  const result = await request<unknown>(invocation, "session:abort", { sessionPath });
  if (!result || typeof result !== "object") {
    throw new TodoError("capability", "Session host returned an invalid cancellation confirmation", {
      recoverable: true,
      nextAction: "retry",
    });
  }
  const record = result as Record<string, unknown>;
  if (typeof record.aborted === "boolean") return record.aborted;
  if (typeof record.ok === "boolean") return record.ok;
  throw new TodoError("capability", "Session host returned an invalid cancellation confirmation", {
    recoverable: true,
    nextAction: "retry",
  });
}

export type SessionTerminal =
  | { state: "succeeded"; summary?: string }
  | { state: "failed"; diagnostic?: string }
  | { state: "needs_action"; diagnostic?: string }
  | { state: "cancelled"; diagnostic?: string }
  | null;

function eventText(record: Record<string, unknown>): string | undefined {
  for (const key of ["summary", "result", "text", "message", "error", "reason"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.slice(0, 2_000);
  }
  return undefined;
}

export function classifySessionTerminal(event: unknown): SessionTerminal {
  if (!event || typeof event !== "object") return null;
  const record = event as Record<string, unknown>;
  const type = String(record.type ?? record.event ?? record.kind ?? "").toLocaleLowerCase();
  const status = String(record.status ?? "").toLocaleLowerCase();
  const combined = `${type}:${status}`;
  const text = eventText(record);
  if (/permission|approval|required_action|needs_action|blocked/.test(combined)) return { state: "needs_action", diagnostic: text };
  if (/abort|cancel/.test(combined)) return { state: "cancelled", diagnostic: text };
  if (/error|failed|failure/.test(combined)) return { state: "failed", diagnostic: text };
  if (/agent_end|turn_complete|session_complete|completed|succeeded|success|final/.test(combined)) return { state: "succeeded", summary: text };
  return null;
}

function sessionIdentity(event: unknown, deliveredSessionPath?: string | null): { sessionId?: string; sessionPath?: string } {
  if (!event || typeof event !== "object") return deliveredSessionPath ? { sessionPath: deliveredSessionPath } : {};
  const record = event as Record<string, unknown>;
  const nested = record.session && typeof record.session === "object" ? record.session as Record<string, unknown> : undefined;
  const nestedRef = record.sessionRef && typeof record.sessionRef === "object" ? record.sessionRef as Record<string, unknown> : undefined;
  const sessionId = [record.sessionId, nested?.sessionId, nestedRef?.sessionId]
    .find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const sessionPath = [deliveredSessionPath, record.sessionPath, nested?.sessionPath, nested?.path, nestedRef?.sessionPath]
    .find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  return { sessionId, sessionPath };
}

function normalizeSessionPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

function sameSession(target: Record<string, unknown>, event: unknown, deliveredSessionPath?: string | null): boolean {
  const targetId = typeof target.sessionId === "string" ? target.sessionId : undefined;
  const targetPath = typeof target.sessionPath === "string" ? target.sessionPath : undefined;
  const actual = sessionIdentity(event, deliveredSessionPath);
  if (targetPath && actual.sessionPath) return normalizeSessionPath(actual.sessionPath) === normalizeSessionPath(targetPath);
  if (targetId && actual.sessionId) return targetId === actual.sessionId;
  if (targetId && actual.sessionPath) return normalizeSessionPath(actual.sessionPath).endsWith(`/${targetId}`);
  // Never accept an unidentifiable global event for a run-specific subscription.
  return false;
}

export function subscribeToSession(invocation: InvocationContext, sessionRef: string, handler: (event: unknown) => void): () => void {
  if (!invocation.bus?.subscribe) throw new TodoError("backend_unavailable", "Session event subscription is unavailable", { recoverable: true });
  const target = parseSessionRef(sessionRef);
  const sessionPath = typeof target.sessionPath === "string" ? target.sessionPath : undefined;
  return invocation.bus.subscribe((event, deliveredSessionPath) => {
    if (sameSession(target, event, deliveredSessionPath)) handler(event);
  }, sessionPath ? { sessionPath } : undefined);
}

export interface AgentOption {
  id: string;
  name: string;
  description?: string;
}

export async function listAgents(invocation: InvocationContext): Promise<AgentOption[]> {
  const result = await request<unknown>(invocation, "agent:list", { includePluginPrivate: false });
  const record = result && typeof result === "object" ? result as Record<string, unknown> : undefined;
  const items = Array.isArray(result) ? result : Array.isArray(record?.agents) ? record!.agents as unknown[] : Array.isArray(record?.items) ? record!.items as unknown[] : [];
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const agent = item as Record<string, unknown>;
    const id = [agent.id, agent.agentId].find((value): value is string => typeof value === "string" && Boolean(value.trim()));
    if (!id) return [];
    const name = [agent.name, agent.displayName, agent.title].find((value): value is string => typeof value === "string" && Boolean(value.trim())) ?? id;
    const description = typeof agent.description === "string" ? agent.description.slice(0, 500) : undefined;
    return [{ id, name, description }];
  });
}
