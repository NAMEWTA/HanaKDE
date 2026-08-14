import { getExchange } from "../src/runtime.ts";
export const name = "exchange";
export const description = "Preview, commit, export, or review versioned Todo JSON without workspace writes.";
export const sessionPermission = { kind: "review" };
export const parameters = { type: "object", properties: { action: { type: "string", enum: ["preview", "commit", "export", "review"] }, document: { type: "object" }, commandId: { type: "string" }, previewId: { type: "string" }, includeTrash: { type: "boolean" } }, required: ["action"] };
export async function execute(input: any, ctx: any) {
  const exchange = getExchange(ctx);
  const result = input.action === "preview" ? exchange.preview(input.document, input.commandId) : input.action === "commit" ? exchange.commit(input.previewId) : input.action === "export" ? exchange.export(input.includeTrash === true) : { markdown: exchange.markdownReview() };
  return { content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result) }], details: result };
}
