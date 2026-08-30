import { reviewerBoundPermission, revision, toolExecute, toolInvocation, type ToolContextLike, type ToolInput } from "../src/interfaces/agent/tool.ts";

export const name = "update";
export const description = "Update one dossier with optimistic revision and actor/session provenance.";
export const sessionPermission = reviewerBoundPermission("update", "Update one dossier in the selected workspace.", "dossier");
export const parameters = { type: "object", properties: { workspaceMountId: { type: "string" }, dossierId: { type: "string" }, expectedRevision: { type: "number" }, patch: { type: "object" } }, required: ["workspaceMountId", "dossierId", "expectedRevision", "patch"] };
export async function execute(input: ToolInput, ctx: ToolContextLike) { return toolExecute(input, ctx, (application) => application.updateDossier(String(input.dossierId), revision(input.expectedRevision), input.patch as Record<string, unknown>, toolInvocation(ctx))); }
