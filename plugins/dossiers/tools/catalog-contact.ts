import { requiredRevision, toolExecute, workspaceWritePermission, type ToolContextLike, type ToolInput } from "../src/interfaces/catalog/tool.ts";

export const name = "catalog_contact";
export const description = "Link, unlink, or safely delete one reusable contact while preserving dossier-specific relationship roles.";
export const sessionPermission = workspaceWritePermission("Change one dossier contact relation or delete one unreferenced contact.");
export const parameters = {
  type: "object",
  properties: {
    workspaceMountId: { type: "string" }, action: { type: "string", enum: ["link", "update_role", "unlink", "delete"] },
    dossierId: { type: "string" }, contactId: { type: "string" }, role: { type: "string" }, expectedRevision: { type: "number" },
  },
  required: ["workspaceMountId", "action", "contactId", "expectedRevision"],
};

export async function execute(input: ToolInput, ctx: ToolContextLike) {
  return toolExecute(input, ctx, async (application) => {
    if (input.action === "delete") return application.deleteContact(String(input.contactId), requiredRevision(input.expectedRevision));
    if (input.action === "unlink") return { value: await application.unlinkContact(String(input.dossierId), requiredRevision(input.expectedRevision), String(input.contactId)) };
    if (input.action === "update_role") return { value: await application.updateContactRole(String(input.dossierId), requiredRevision(input.expectedRevision), String(input.contactId), String(input.role ?? "")) };
    if (input.action === "link") return { value: await application.linkContact(String(input.dossierId), requiredRevision(input.expectedRevision), { contactId: String(input.contactId), role: String(input.role ?? "") }) };
    throw new Error("Unsupported contact action");
  });
}
