import { defineTool } from "@hana/plugin-runtime";
import { getRuntime } from "../src/runtime.js";

const tool = defineTool({
  name: "research_public",
  description: "Create a deterministic, evidence-bound public-data research draft. This tool never trades and never reads private materials.",
  parameters: { type: "object", required: ["asset", "question"], properties: { asset: { type: "string" }, question: { type: "string" } } },
  sessionPermission: { kind: "plugin_output", describeSideEffect: () => ({ kind: "plugin_data_write", summary: "Persist a deterministic public-evidence research run in plugin-private history", ruleId: "finance-research-public" }) },
  async execute(input, ctx) {
    const result = await getRuntime(ctx).runAgent({ assetId: input.asset, question: input.question, useModel: false });
    return { content: [{ type: "text", text: `Evidence-bound research\n${result.run.output}\nEvidence: ${result.run.evidenceIds.join(", ")}\n${result.run.disclaimer}` }], details: { run: result.run, evidence: result.evidence } };
  },
});
export const { name, description, parameters, sessionPermission, execute } = tool;
