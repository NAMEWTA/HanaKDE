import { createMediaDetails, defineTool } from "@hana/plugin-runtime";
import { getRuntime } from "../src/runtime.js";

const tool = defineTool({
  name: "export_report",
  description: "Prepare or confirm a two-step export of selected derived research sections as a SessionFile.",
  parameters: { type: "object", required: ["action"], properties: { action: { enum: ["prepare", "confirm"] }, format: { enum: ["json", "csv", "markdown"] }, sections: { type: "array", items: { type: "string" } }, previewId: { type: "string" }, confirmToken: { type: "string" }, digest: { type: "string" }, revision: { type: "number" }, confirmed: { type: "boolean" } } },
  sessionPermission: {
    kind: "plugin_output",
    auto: "review",
    describeSideEffect: (input) => input.action === "confirm" ? ({ kind: "session_file_output", summary: `Export ${Array.isArray(input.sections) ? input.sections.join(", ") : "previously previewed sections"}; privacy scope is bound to the preview digest`, ruleId: "finance-export-confirm" }) : null,
    resolveInvocation(input) {
      if (input.action === "prepare") return { action: "prepare", kind: "read", capability: "finance.export.prepare" };
      if (input.action === "confirm" && typeof input.previewId === "string") return { action: "confirm", kind: "review", capability: "finance.export.confirm", target: { type: "session_files", id: input.previewId, label: Array.isArray(input.sections) ? input.sections.join(", ") : "Finance export" }, sideEffect: { kind: "session_file_output", privacy: "preview-bound", sections: Array.isArray(input.sections) ? input.sections : [] } };
      return null;
    },
  },
  async execute(input, ctx) {
    const runtime = getRuntime(ctx);
    if (input.action === "prepare") {
      const result = runtime.previewExport(input);
      return { content: [{ type: "text", text: `Export preview prepared for ${result.preview.sections.join(", ")}. Review privacy=${result.preview.privacy}, digest=${result.preview.digest}, then call confirm with its token and revision.` }], details: result };
    }
    const result = await runtime.writeExport(input, ctx);
    const media = result.file.staged ? createMediaDetails([result.file.staged]) : undefined;
    return { content: [{ type: "text", text: `Exported ${result.file.label}` }], details: { ...result, ...(media ?? {}) } };
  },
});
export const { name, description, parameters, sessionPermission, execute } = tool;
