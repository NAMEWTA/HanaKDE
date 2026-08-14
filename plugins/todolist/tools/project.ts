import { getApplication } from "../src/runtime.ts";
export const name = "project";
export const description = "List or create one-level Todo projects.";
export const sessionPermission = { kind: "plugin_output", describeSideEffect: () => ({ kind: "plugin_data_write", summary: "Manage Todo projects in the private store.", ruleId: "todolist-project" }) };
export const parameters = { type: "object", properties: { action: { type: "string", enum: ["list", "create", "update", "trash", "restore"] }, id: { type: "string" }, name: { type: "string" }, expectedVersion: { type: "number" }, includeTrash: { type: "boolean" } }, required: ["action"] };
export async function execute(input: any, ctx: any) {
  const app = getApplication(ctx);
  if (input.action === "list") return { content: [{ type: "text", text: JSON.stringify(app.queryProjects(input.includeTrash === true)) }], details: { projects: app.queryProjects(input.includeTrash === true) } };
  const result = input.action === "create" ? app.createProject(input.name) : input.action === "update" ? app.updateProject(input.id, input.name, input.expectedVersion) : input.action === "trash" ? app.removeProject(input.id, input.expectedVersion) : app.restoreProject(input.id, input.expectedVersion);
  return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
}
