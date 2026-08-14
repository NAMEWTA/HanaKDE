import { getApplication, sessionKey } from "../src/runtime.ts";
export const name = "delete_confirm";
export const description = "Confirm a previously prepared permanent Trash purge.";
export const sessionPermission = { kind: "review" };
export const parameters = { type: "object", properties: { confirmationId: { type: "string" } }, required: ["confirmationId"] };
export async function execute(input: any, ctx: any) { const result = getApplication(ctx).confirmPurge(input.confirmationId, sessionKey(ctx)); return { content: [{ type: "text", text: JSON.stringify(result) }], details: { purge: result } }; }
