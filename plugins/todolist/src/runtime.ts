import { TodoApplication } from "./service.ts";
import { TodoStore } from "./store.ts";
import { TodoExchange } from "./exchange.ts";

const applications = new WeakMap<object, TodoApplication>();
const exchanges = new WeakMap<object, TodoExchange>();

export function getApplication(ctx: any): TodoApplication {
  if (!ctx || typeof ctx !== "object") throw new Error("todolist plugin context is required");
  let app = applications.get(ctx);
  if (!app) {
    app = new TodoApplication(new TodoStore(ctx.dataDir));
    applications.set(ctx, app);
  }
  return app;
}

export function sessionKey(ctx: any): string {
  return String(ctx?.sessionId || ctx?.sessionRef || ctx?.sessionPath || "anonymous");
}

export function clearApplication(ctx: any): void {
  if (ctx && typeof ctx === "object") { applications.delete(ctx); exchanges.delete(ctx); }
}

export function getExchange(ctx: any): TodoExchange {
  let exchange = exchanges.get(ctx);
  if (!exchange) { exchange = new TodoExchange(getApplication(ctx)); exchanges.set(ctx, exchange); }
  return exchange;
}
