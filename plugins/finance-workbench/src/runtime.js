import { FinanceApplication } from "./application.js";

const runtimes = new Map();

export function getRuntime(ctx) {
  const key = `${ctx.pluginId}:${ctx.dataDir}`;
  let runtime = runtimes.get(key);
  if (!runtime) {
    runtime = new FinanceApplication(ctx);
    runtimes.set(key, runtime);
  }
  return runtime;
}

export function releaseRuntime(ctx) {
  runtimes.delete(`${ctx.pluginId}:${ctx.dataDir}`);
}
