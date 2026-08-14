import { clearApplication, getApplication } from "./src/runtime.ts";

export default class TodoListPlugin {
  ctx: any;
  app: any = null;

  async onload() {
    this.app = getApplication(this.ctx);
    if (typeof this.ctx?.bus?.request === "function") {
      let registered = false;
      for (let attempt = 1; attempt <= 3 && !registered; attempt += 1) {
        try {
          const handler = async (schedule: any) => {
            const reminderId = schedule?.meta?.reminderId;
            if (!reminderId) throw new Error("reminder identity missing");
            return this.app.handoffReminder(reminderId, this.ctx);
          };
          const agentHandler = async (schedule: any) => {
            const runId = schedule?.meta?.runId;
            if (!runId) throw new Error("run identity missing");
            return this.app.startRun(runId, this.ctx);
          };
          await this.ctx.bus.request("task:register-handler", { type: "todolist.reminder", abort: () => {}, run: handler });
          await this.ctx.bus.request("task:register-handler", { type: "todolist.agent_execute", abort: () => {}, run: agentHandler });
          registered = true;
        } catch (error) {
          if (attempt === 3) this.ctx.log.warn(`todolist reminder handler unavailable after ${attempt} readiness attempts; CRUD remains available`);
          else await Promise.resolve();
        }
      }
      if (registered) this.ctx.log.info("todolist reminder handler ready");
    }
    this.ctx.log.info("todolist plugin loaded");
  }

  async onunload() {
    try { await this.ctx?.bus?.request?.("task:unregister-handler", { type: "todolist.reminder" }); } catch {}
    try { await this.ctx?.bus?.request?.("task:unregister-handler", { type: "todolist.agent_execute" }); } catch {}
    clearApplication(this.ctx);
    this.app = null;
  }
}
