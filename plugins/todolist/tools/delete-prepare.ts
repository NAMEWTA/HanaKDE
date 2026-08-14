import { getApplication, sessionKey } from "../src/runtime.ts";
export const name = "delete_prepare";
export const description = "Prepare a confirmed permanent purge of Trash items.";
export const sessionPermission = { kind: "review" };
export const parameters = { type: "object", properties: { todoIds: { type: "array", items: { type: "string" } } }, required: ["todoIds"] };
export async function execute(input: any, ctx: any) { const result = getApplication(ctx).preparePurge(input.todoIds, sessionKey(ctx)); return { content: [{ type: "text", text: JSON.stringify({ count: result.count, expiresAt: result.expiresAt }) }], details: { confirmation: result } }; }
