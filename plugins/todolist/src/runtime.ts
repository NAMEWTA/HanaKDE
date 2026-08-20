import path from "node:path";
import { TodoApplication } from "./application/todo-application.ts";
import { TodoExchange } from "./application/exchange.ts";
import { TodoStore } from "./infrastructure/store.ts";
import type { PluginContextLike } from "./interfaces/context.ts";

export interface TodoRuntime {
  readonly key: string;
  readonly store: TodoStore;
  readonly application: TodoApplication;
  readonly exchange: TodoExchange;
  references: number;
  dispose(): void;
}

const runtimes = new Map<string, TodoRuntime>();

function runtimeKey(ctx: PluginContextLike): string {
  return path.resolve(ctx.dataDir);
}

export function getRuntime(ctx: PluginContextLike): TodoRuntime {
  const key = runtimeKey(ctx);
  const existing = runtimes.get(key);
  if (existing) {
    // Request principal/session/capability context is passed to every command and
    // is deliberately never cached in the process-wide runtime.
    return existing;
  }
  const store = new TodoStore(key);
  const application = new TodoApplication(store);
  const runtime: TodoRuntime = {
    key,
    store,
    application,
    exchange: new TodoExchange(store),
    references: 0,
    dispose() {
      application.dispose();
      runtimes.delete(key);
    },
  };
  runtimes.set(key, runtime);
  return runtime;
}

export function acquireRuntime(ctx: PluginContextLike): TodoRuntime {
  const runtime = getRuntime(ctx);
  runtime.references += 1;
  return runtime;
}

export function releaseRuntime(ctx: PluginContextLike): void {
  const runtime = runtimes.get(runtimeKey(ctx));
  if (!runtime) return;
  runtime.references = Math.max(0, runtime.references - 1);
  if (runtime.references === 0) runtime.dispose();
}

export function disposeRuntime(ctx: PluginContextLike): void {
  runtimes.get(runtimeKey(ctx))?.dispose();
}

export function runtimeCountForTests(): number {
  return runtimes.size;
}
