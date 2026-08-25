import { defineTool } from "@hana/plugin-runtime";
import { getRuntime } from "../src/runtime.js";

const tool = defineTool({
  name: "backtest_run",
  description: "Run a deterministic rule-aware research backtest after explicit quality-gate confirmation. It cannot trade.",
  parameters: { type: "object", required: ["immutableId", "assumptions", "confirmed"], properties: { immutableId: { type: "string" }, assumptions: { type: "object" }, allowExperimental: { type: "boolean" }, confirmed: { type: "boolean" }, runBudget: { type: "number", minimum: 1 } } },
  sessionPermission: {
    kind: "plugin_output",
    auto: "review",
    describeSideEffect: (input) => ({ kind: "plugin_data_write", summary: `Persist a deterministic research backtest with budget ${input.runBudget ?? "default"}`, ruleId: "finance-backtest-run" }),
    resolveInvocation: (input) => ({ action: "run", kind: "review", capability: "finance.backtest.run", target: { type: "plugin_data", id: String(input.immutableId ?? "strategy"), label: "Finance research backtest" }, sideEffect: { kind: "plugin_data_write", runBudget: input.runBudget ?? 10_000 } }),
  },
  async execute(input, ctx) {
    const result = getRuntime(ctx).runBacktest(input);
    return { content: [{ type: "text", text: `Backtest ${result.result.runId}: net return ${(result.result.metrics.netReturn * 100).toFixed(2)}%. Research result, not investment advice.` }], details: result };
  },
});
export const { name, description, parameters, sessionPermission, execute } = tool;
