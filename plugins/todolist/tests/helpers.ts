import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { EventBusLike, InvocationContext, PluginContextLike } from "../src/interfaces/context.ts";

export interface BusRequestRecord {
  type: string;
  payload: unknown;
  options?: Record<string, unknown>;
}

export class FakeBus implements EventBusLike {
  readonly requests: BusRequestRecord[] = [];
  readonly emitted: Array<{ event: Record<string, unknown>; sessionPath?: string | null }> = [];
  readonly registered = new Map<string, Record<string, unknown>>();
  private readonly subscribers = new Set<{ callback: (event: unknown, sessionPath?: string | null) => void; filter?: Record<string, unknown> }>();
  failSchedule = false;
  failUnschedule = false;
  failSessionCreate = false;
  failSessionSend = false;
  abortResult = true;
  unscheduleRemoved = true;
  sessionPathAvailable = true;
  scheduleCounter = 0;
  sessionCounter = 0;

  async request<T = unknown>(type: string, payload?: unknown, options?: Record<string, unknown>): Promise<T> {
    this.requests.push({ type, payload, options });
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    switch (type) {
      case "task:schedule": {
        if (this.failSchedule) throw new Error("TaskRegistry unavailable");
        this.scheduleCounter += 1;
        const scheduleId = typeof record.scheduleId === "string" ? record.scheduleId : `schedule-${this.scheduleCounter}`;
        return { ok: true, schedule: { ...record, scheduleId } } as T;
      }
      case "task:unschedule":
        if (this.failUnschedule) throw new Error("TaskRegistry unschedule rejected");
        return { removed: this.unscheduleRemoved } as T;
      case "task:register-handler": {
        const handlerType = typeof record.type === "string" ? record.type : "unknown";
        this.registered.set(handlerType, record);
        return { ok: true } as T;
      }
      case "task:unregister-handler":
        if (typeof record.type === "string") this.registered.delete(record.type);
        return { ok: true } as T;
      case "session:create": {
        if (this.failSessionCreate) throw new Error("Session create unavailable");
        this.sessionCounter += 1;
        const sessionId = `session-${this.sessionCounter}`;
        return this.sessionPathAvailable
          ? { sessionId, sessionPath: `/sessions/${sessionId}` } as T
          : { sessionId } as T;
      }
      case "session:send":
        if (this.failSessionSend) throw new Error("Session send unavailable");
        return { ok: true, accepted: true } as T;
      case "session:abort":
        return { aborted: this.abortResult } as T;
      case "agent:list":
        return { agents: [{ id: "agent-one", name: "Agent One" }] } as T;
      default:
        return { ok: true } as T;
    }
  }

  emit(event: Record<string, unknown>, sessionPath?: string | null): void {
    this.emitted.push({ event, sessionPath });
    for (const subscriber of [...this.subscribers]) {
      if (!matchesSession(subscriber.filter, event, sessionPath)) continue;
      subscriber.callback(event, sessionPath);
    }
  }

  subscribe(callback: (event: unknown, sessionPath?: string | null) => void, filter?: Record<string, unknown>): () => void {
    const subscription = { callback, filter };
    this.subscribers.add(subscription);
    return () => this.subscribers.delete(subscription);
  }

  emitSession(event: Record<string, unknown>, sessionPath: string): void {
    this.emit({ ...event, sessionPath }, sessionPath);
  }

  lastRequest(type: string): BusRequestRecord | undefined {
    return [...this.requests].reverse().find((item) => item.type === type);
  }

  countRequests(type: string): number {
    return this.requests.filter((item) => item.type === type).length;
  }
}

function matchesSession(filter: Record<string, unknown> | undefined, event: Record<string, unknown>, sessionPath?: string | null): boolean {
  if (!filter) return true;
  const wantedPath = typeof filter.sessionPath === "string" ? filter.sessionPath : undefined;
  const wantedId = typeof filter.sessionId === "string" ? filter.sessionId : undefined;
  if (wantedPath && wantedPath !== sessionPath && wantedPath !== event.sessionPath) return false;
  if (wantedId && wantedId !== event.sessionId && !String(sessionPath ?? "").endsWith(wantedId)) return false;
  return true;
}

export function tempDir(label = "todolist-test"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
}

export function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export function makeInvocation(bus = new FakeBus(), overrides: Partial<InvocationContext> = {}): InvocationContext {
  const workspace = tempDir("todo-workspace");
  return {
    pluginId: "todolist",
    actorKey: "actor:alice",
    sessionKey: "session:one",
    correlationId: `corr-${Date.now()}-${Math.random()}`,
    bus,
    resources: { materialize: async () => ({ path: workspace }) },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    ...overrides,
  };
}

export function makePluginContext(dataDir: string, bus = new FakeBus(), overrides: Partial<PluginContextLike> = {}): PluginContextLike {
  return {
    pluginId: "todolist",
    dataDir,
    userId: "alice",
    sessionId: "session-one",
    bus,
    resources: { materialize: async (ref) => ({ path: typeof ref === "object" && ref && "path" in ref ? String(ref.path) : dataDir }) },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    ...overrides,
  };
}

export async function waitFor(predicate: () => boolean, timeoutMs = 1_500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition");
}
