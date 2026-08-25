import { defineTool } from "@hana/plugin-runtime";
import { getRuntime } from "../src/runtime.js";

const tool = defineTool({
  name: "monitor_create",
  description: "Create a confirmed research monitor through TaskRegistry. Stale observations are suppressed and delivery is not guaranteed.",
  parameters: { type: "object", required: ["assetId", "condition", "threshold", "confirmed"], properties: { assetId: { type: "string" }, condition: { enum: ["above", "below"] }, threshold: { type: "number" }, intervalSeconds: { type: "number" }, confirmed: { type: "boolean" } } },
  sessionPermission: { kind: "external_side_effect", describeSideEffect: (input) => ({ kind: "scheduled_task", summary: `Create a recurring monitor for ${input.assetId ?? "an asset"}`, ruleId: "finance-monitor-create" }) },
  async execute(input, ctx) {
    const result = await getRuntime(ctx).createMonitor(input, ctx);
    return { content: [{ type: "text", text: `Monitor ${result.monitor.id} active via TaskRegistry.` }], details: result };
  },
});
export const { name, description, parameters, sessionPermission, execute } = tool;
