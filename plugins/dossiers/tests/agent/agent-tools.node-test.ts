import assert from "node:assert/strict";
import test from "node:test";

import * as contextTool from "../../tools/agent-context.ts";
import * as createTool from "../../tools/agent-create.ts";
import * as decideTool from "../../tools/agent-decide.ts";
import * as getTool from "../../tools/agent-get.ts";
import * as listTool from "../../tools/agent-list.ts";
import * as modelGetTool from "../../tools/agent-model-get.ts";
import * as modelSetTool from "../../tools/agent-model-set.ts";
import * as proposeTool from "../../tools/agent-propose.ts";
import * as riskTool from "../../tools/agent-risk.ts";
import * as updateTool from "../../tools/agent-update.ts";
import { MemoryResources } from "../foundation/memory-resources.ts";

test("Agent tools publish read-only or reviewer-bound invocation descriptors and reject unsafe mounts", async () => {
  assert.deepEqual(
    [listTool.name, getTool.name, contextTool.name, createTool.name, updateTool.name, modelGetTool.name, modelSetTool.name, proposeTool.name, decideTool.name, riskTool.name],
    ["list", "get", "context", "create", "update", "model_access_get", "model_access_set", "suggestion_propose", "suggestion_decide", "high_risk_guard"],
  );
  assert.equal(contextTool.sessionPermission.readOnly, true);
  for (const tool of [decideTool, modelSetTool, proposeTool, riskTool]) {
    assert.equal(tool.sessionPermission.auto, "review");
    assert.equal(tool.sessionPermission.describeSideEffect?.({ workspaceMountId: "C:/secret" }), null);
  }
  const resources = new MemoryResources();
  const result = await contextTool.execute({ workspaceMountId: "C:/secret", dossierId: "dos_01hzinvalidtest" }, { resources, userId: "owner", sessionId: "session" } as never);
  assert.equal(result.isError, true);
  assert.equal(resources.mutations.length, 0);
  assert.doesNotMatch(JSON.stringify(result.details), /C:\/|secret/);

  let modelCalls = 0;
  let networkCalls = 0;
  await contextTool.execute(
    { workspaceMountId: "workspace", dossierId: "dos_01hzinvalidtest" },
    { resources, userId: "owner", sessionId: "session", model: () => { modelCalls += 1; }, network: () => { networkCalls += 1; } } as never,
  );
  assert.deepEqual({ modelCalls, networkCalls }, { modelCalls: 0, networkCalls: 0 });
});

test("unimplemented destructive, bulk, and overwrite Agent actions always require their owning confirmed workflow", async () => {
  for (const action of ["delete", "bulk", "overwrite"] as const) {
    const result = await riskTool.execute({ workspaceMountId: "workspace", action, targetId: "target" }, { resources: new MemoryResources(), userId: "owner", sessionId: "session" } as never);
    assert.equal(result.isError, true);
    assert.equal((result.details as { error: { code: string } }).error.code, "confirmation_required");
  }
});
