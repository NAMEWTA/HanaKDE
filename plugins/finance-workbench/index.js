
import { defineBusHandler, definePlugin, HANA_BUS_SKIP } from "@hana/plugin-runtime";
import { getRuntime, releaseRuntime } from "./src/runtime.js";

const statusHandler = defineBusHandler({
  type: "finance-workbench:status",
  async handle(payload, ctx) {
    if (payload?.pluginId && payload.pluginId !== ctx.pluginId) return HANA_BUS_SKIP;
    return getRuntime(ctx).status();
  },
});

let registeredTypes = [];

export default definePlugin({
  async onload(ctx, { register }) {
    const runtime = getRuntime(ctx);
    if (ctx.bus.handle) {
      register(ctx.bus.handle(statusHandler.type, (payload) => statusHandler.handle(payload, ctx)));
    }
    if (ctx.bus.request) {
      const handlers = [{
        type: "finance-workbench-monitor",
        run: async (schedule) => runtime.observeMonitor(schedule?.payload?.monitorId),
        abort: () => undefined,
      }, {
        type: "finance-workbench-research",
        run: async (schedule) => runtime.runResearchTask(schedule?.payload?.taskId),
        abort: () => undefined,
      }];
      try {
        for (const handler of handlers) {
          await ctx.bus.request("task:register-handler", handler, { timeout: 10_000 });
          registeredTypes.push(handler.type);
        }
        runtime.setTaskBackend("ready");
        await runtime.recoverMonitors();
      } catch (error) {
        await unregisterTaskHandlers(ctx);
        runtime.setTaskBackend("backend_unavailable", error);
        ctx.log?.warn?.(`Finance Workbench loaded in foreground-only mode: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      runtime.setTaskBackend("backend_unavailable", new Error("TaskRegistry request capability is unavailable"));
    }
    ctx.log?.info?.("Finance Workbench loaded; trading capabilities are permanently absent");
  },

  async onunload(ctx) {
    const runtime = getRuntime(ctx);
    await runtime.shutdown();
    await unregisterTaskHandlers(ctx);
    releaseRuntime(ctx);
    ctx.log?.info?.("Finance Workbench unloaded");
  },
});

async function unregisterTaskHandlers(ctx) {
  if (typeof ctx.bus?.request !== "function") {
    registeredTypes = [];
    return;
  }
  for (const type of [...registeredTypes].reverse()) {
    try {
      await ctx.bus.request("task:unregister-handler", { type }, { timeout: 5_000 });
    } catch (error) {
      ctx.log?.warn?.(`Finance Workbench could not unregister ${type}`, error);
    }
  }
  registeredTypes = [];
}
