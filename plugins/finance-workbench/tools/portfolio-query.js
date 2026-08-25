import { defineTool } from "@hana/plugin-runtime";
import { getRuntime } from "../src/runtime.js";

const tool = defineTool({
  name: "portfolio_query",
  description: "Read the local derived portfolio after explicit session review. No broker, order, funds, or position mutation is available.",
  parameters: { type: "object", properties: {} },
  sessionPermission: { kind: "external_side_effect", describeSideEffect: () => ({ kind: "private_data_read", summary: "Read local portfolio fields for this invocation only", ruleId: "finance-private-read" }) },
  async execute(_input, ctx) {
    const result = getRuntime(ctx).portfolio();
    return { content: [{ type: "text", text: JSON.stringify(result.totalsByCurrency, null, 2) }], details: { portfolio: result } };
  },
});
export const { name, description, parameters, sessionPermission, execute } = tool;
