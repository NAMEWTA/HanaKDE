import { REMINDER_TASK_TYPE, AUTOMATION_TASK_TYPE } from "./src/infrastructure/host.ts";
import { acquireRuntime, releaseRuntime, type TodoRuntime } from "./src/runtime.ts";
import { invocationFromPluginContext, type PluginContextLike } from "./src/interfaces/context.ts";
import { TodoError, asTodoError } from "./src/errors.ts";

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason ?? new Error("aborted"));
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("aborted"));
    }, { once: true });
  });
}

function entityId(schedule: unknown, key: "reminderId" | "runId"): string {
  if (!schedule || typeof schedule !== "object") throw new TodoError("validation", `Task schedule is missing ${key}`);
  const record = schedule as Record<string, unknown>;
  const meta = record.meta && typeof record.meta === "object" ? record.meta as Record<string, unknown> : undefined;
  const payload = record.payload && typeof record.payload === "object" ? record.payload as Record<string, unknown> : undefined;
  const value = meta?.[key] ?? payload?.[key] ?? record[key];
  if (typeof value !== "string" || !value) throw new TodoError("validation", `Task schedule is missing ${key}`);
  return value;
}

export default class TodoListPlugin {
  ctx!: PluginContextLike;
  private runtime?: TodoRuntime;
  private readonly lifecycleAbort = new AbortController();
  private registeredTypes: string[] = [];

  async onload(): Promise<void> {
    this.runtime = acquireRuntime(this.ctx);
    const invocation = invocationFromPluginContext(this.ctx, { actorKey: "system:todolist-lifecycle", sessionKey: "plugin-lifecycle" });
    if (typeof this.ctx.bus?.request !== "function") {
      await this.runtime.application.setTaskBackend("backend_unavailable", invocation, "TaskRegistry request capability is unavailable");
      this.ctx.log?.warn?.("todolist loaded in foreground-only mode: TaskRegistry unavailable");
      return;
    }

    try {
      await this.registerTaskHandlers(invocation);
      await this.runtime.application.setTaskBackend("ready", invocation);
      await this.runtime.application.recoverPendingIntents(invocation);
      this.ctx.log?.info?.("todolist plugin loaded; TaskRegistry handlers ready");
    } catch (error) {
      const normalized = asTodoError(error);
      await this.unregisterRegisteredHandlers();
      await this.runtime.application.setTaskBackend("backend_unavailable", invocation, normalized.message);
      this.ctx.log?.warn?.(`todolist TaskRegistry unavailable; foreground CRUD remains available: ${normalized.message}`);
    }
  }

  async onunload(): Promise<void> {
    this.lifecycleAbort.abort(new Error("todolist unloading"));
    await this.unregisterRegisteredHandlers();
    if (this.runtime) {
      releaseRuntime(this.ctx);
      this.runtime = undefined;
    }
    this.ctx.log?.info?.("todolist plugin unloaded");
  }

  private async registerTaskHandlers(invocation: ReturnType<typeof invocationFromPluginContext>): Promise<void> {
    const runtime = this.runtime;
    if (!runtime || !this.ctx.bus?.request) throw new TodoError("backend_unavailable", "Todo runtime is unavailable");
    const handlers = [
      {
        type: REMINDER_TASK_TYPE,
        run: async (schedule: unknown) => runtime.application.handoffReminder(entityId(schedule, "reminderId"), invocation),
        // Scheduled reminders are cancelled through task:unschedule from the
        // application command. TaskRegistry abort receives a task id, not this
        // schedule payload, so it must not forge a Reminder state transition.
        abort: (_taskId: string) => undefined,
      },
      {
        type: AUTOMATION_TASK_TYPE,
        run: async (schedule: unknown) => runtime.application.startRun(entityId(schedule, "runId"), invocation),
        // Session/Run cancellation is host-confirmed by cancelRun; a registry
        // task abort alone is not evidence that the Agent Session stopped.
        abort: (_taskId: string) => undefined,
      },
    ];

    for (const handler of handlers) {
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await this.ctx.bus.request("task:register-handler", handler, { timeout: 10_000 });
          this.registeredTypes.push(handler.type);
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < 3) await sleep(200 * 2 ** (attempt - 1), this.lifecycleAbort.signal);
        }
      }
      if (lastError) throw new TodoError("backend_unavailable", `Could not register ${handler.type}: ${asTodoError(lastError).message}`, { cause: lastError, recoverable: true });
    }
  }

  private async unregisterRegisteredHandlers(): Promise<void> {
    const request = this.ctx.bus?.request;
    if (!request) {
      this.registeredTypes = [];
      return;
    }
    for (const type of [...this.registeredTypes].reverse()) {
      try {
        await request.call(this.ctx.bus, "task:unregister-handler", { type }, { timeout: 5_000 });
      } catch (error) {
        this.ctx.log?.warn?.(`todolist could not unregister ${type}`, error);
      }
    }
    this.registeredTypes = [];
  }
}
