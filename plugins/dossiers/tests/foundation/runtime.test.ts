import assert from "node:assert/strict";
import test from "node:test";

import { DossiersRuntime } from "../../src/runtime.ts";
import { MemoryResources } from "./memory-resources.ts";

test("keeps ResourceIO and workspace refs request scoped", async () => {
  const runtime = new DossiersRuntime({
    now: () => "2026-08-30T00:00:00.000Z",
    createId: () => "lib_01hzrequestscoped",
  });
  const first = new MemoryResources();
  const second = new MemoryResources();

  const firstResult = await runtime.openLibrary({
    resources: first,
    workspaceRoot: { kind: "mount", mountId: "workspace-a", path: "" },
  });
  const secondResult = await runtime.openLibrary({
    resources: second,
    workspaceRoot: { kind: "mount", mountId: "workspace-b", path: "" },
  });

  assert.equal(firstResult.state, "ready");
  assert.equal(secondResult.state, "ready");
  assert.ok(first.text({ kind: "mount", mountId: "workspace-a", path: "Dossiers/manifest.json" }));
  assert.equal(first.text({ kind: "mount", mountId: "workspace-b", path: "Dossiers/manifest.json" }), null);
  assert.ok(second.text({ kind: "mount", mountId: "workspace-b", path: "Dossiers/manifest.json" }));
  assert.equal(second.text({ kind: "mount", mountId: "workspace-a", path: "Dossiers/manifest.json" }), null);
});

test("serializes concurrent first opens so one workspace receives one library identity", async () => {
  const ids = ["lib_01hzconcurrentfirst", "lib_01hzconcurrentsecond"];
  const runtime = new DossiersRuntime({
    now: () => "2026-08-30T00:00:00.000Z",
    createId: () => ids.shift() ?? "lib_01hzunexpectedthird",
  });
  const resources = new MemoryResources();
  const scope = {
    resources,
    workspaceRoot: { kind: "mount" as const, mountId: "workspace", path: "" },
  };

  const [first, second] = await Promise.all([
    runtime.openLibrary(scope),
    runtime.openLibrary(scope),
  ]);
  const stored = JSON.parse(resources.text({
    kind: "mount",
    mountId: "workspace",
    path: "Dossiers/manifest.json",
  }) ?? "null");

  assert.equal(first.state, "ready");
  assert.equal(second.state, "ready");
  assert.equal(first.manifest?.libraryId, stored.libraryId);
  assert.equal(second.manifest?.libraryId, stored.libraryId);
  assert.deepEqual(ids, ["lib_01hzconcurrentsecond"]);
});
