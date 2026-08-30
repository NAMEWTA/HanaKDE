import assert from "node:assert/strict";
import test from "node:test";

import { JournaledJsonRepository } from "../../src/infrastructure/workspace/journaled-json-repository.ts";
import { openWorkspaceLibrary } from "../../src/infrastructure/workspace/workspace-library.ts";
import { MemoryResources } from "./memory-resources.ts";

async function readyResources() {
  const resources = new MemoryResources();
  const workspaceRoot = { kind: "mount" as const, mountId: "workspace", path: "" };
  const opened = await openWorkspaceLibrary({
    resources,
    workspaceRoot,
    now: () => "2026-08-30T00:00:00.000Z",
    createId: () => "lib_01hzjournalfixture",
  });
  assert.equal(opened.state, "ready");
  return { resources, workspaceRoot };
}

test("publishes a new JSON authority through a persistent operation journal", async () => {
  const { resources, workspaceRoot } = await readyResources();
  const repository = new JournaledJsonRepository({ resources, workspaceRoot });

  const result = await repository.write({
    operationId: "op_01hzcreatecontactcatalog",
    targetPath: "Dossiers/contacts/contacts.json",
    value: { schemaVersion: 1, revision: 1, contacts: [] },
    expectedVersion: null,
    now: "2026-08-30T01:00:00.000Z",
  });

  assert.equal(result.status, "committed");
  assert.deepEqual(
    JSON.parse(resources.text({ ...workspaceRoot, path: "Dossiers/contacts/contacts.json" }) ?? "null"),
    { schemaVersion: 1, revision: 1, contacts: [] },
  );
  const journal = JSON.parse(resources.text({
    ...workspaceRoot,
    path: "Dossiers/.system/operations/op_01hzcreatecontactcatalog.json",
  }) ?? "null");
  assert.equal(journal.state, "committed");
  assert.equal(journal.targetPath, "Dossiers/contacts/contacts.json");
  assert.equal(resources.text({
    ...workspaceRoot,
    path: "Dossiers/.system/staging/op_01hzcreatecontactcatalog.json",
  }), null);
});

test("rejects a stale expected version without changing the current authority", async () => {
  const { resources, workspaceRoot } = await readyResources();
  const target = { ...workspaceRoot, path: "Dossiers/types/types.json" };
  resources.seedFile(target, JSON.stringify({ revision: 3, types: ["person"] }));
  const before = resources.text(target);
  const repository = new JournaledJsonRepository({ resources, workspaceRoot });

  const result = await repository.write({
    operationId: "op_01hzstaletypecatalog",
    targetPath: "Dossiers/types/types.json",
    value: { revision: 4, types: ["person", "project"] },
    expectedVersion: { sequence: 1 },
    now: "2026-08-30T02:00:00.000Z",
  });

  assert.equal(result.status, "conflict");
  assert.equal(resources.text(target), before);
  const journal = JSON.parse(resources.text({
    ...workspaceRoot,
    path: "Dossiers/.system/operations/op_01hzstaletypecatalog.json",
  }) ?? "null");
  assert.equal(journal.state, "conflict");
});

test("treats a repeated committed operation id as an idempotent success", async () => {
  const { resources, workspaceRoot } = await readyResources();
  const repository = new JournaledJsonRepository({ resources, workspaceRoot });
  const input = {
    operationId: "op_01hzidempotentcatalog",
    targetPath: "Dossiers/contacts/contacts.json",
    value: { schemaVersion: 1, revision: 1, contacts: [] },
    expectedVersion: null,
    now: "2026-08-30T03:00:00.000Z",
  } as const;

  const first = await repository.write(input);
  const mutationCount = resources.mutations.length;
  const second = await repository.write(input);

  assert.equal(first.status, "committed");
  assert.equal(second.status, "committed");
  assert.equal(resources.mutations.length, mutationCount);
  const journal = JSON.parse(resources.text({
    ...workspaceRoot,
    path: "Dossiers/.system/operations/op_01hzidempotentcatalog.json",
  }) ?? "null");
  assert.equal(journal.state, "committed");
});

test("does not downgrade a committed write when staging cleanup fails", async () => {
  const { resources, workspaceRoot } = await readyResources();
  const repository = new JournaledJsonRepository({ resources, workspaceRoot });
  const input = {
    operationId: "op_01hzcleanuprecovery",
    targetPath: "Dossiers/types/types.json",
    value: { schemaVersion: 1, revision: 1, types: [] },
    expectedVersion: null,
    now: "2026-08-30T04:00:00.000Z",
  } as const;
  resources.failNext("delete", "cleanup interrupted");

  const first = await repository.write(input);

  assert.equal(first.status, "committed");
  assert.equal(JSON.parse(resources.text({
    ...workspaceRoot,
    path: "Dossiers/.system/operations/op_01hzcleanuprecovery.json",
  }) ?? "null").state, "committed");
  assert.ok(resources.text({ ...workspaceRoot, path: "Dossiers/.system/staging/op_01hzcleanuprecovery.json" }));

  const retried = await repository.write(input);
  assert.equal(retried.status, "committed");
  assert.equal(resources.text({ ...workspaceRoot, path: "Dossiers/.system/staging/op_01hzcleanuprecovery.json" }), null);
});

test("recovers a published target when the committed journal update was interrupted", async () => {
  const { resources, workspaceRoot } = await readyResources();
  const repository = new JournaledJsonRepository({ resources, workspaceRoot });
  const input = {
    operationId: "op_01hzjournalrecovery",
    targetPath: "Dossiers/contacts/contacts.json",
    value: { schemaVersion: 1, revision: 1, contacts: [] },
    expectedVersion: null,
    now: "2026-08-30T05:00:00.000Z",
  } as const;
  resources.failAfter("write", 3, "journal commit interrupted");

  const interrupted = await repository.write(input);
  assert.equal(interrupted.status, "failed");
  assert.ok(resources.text({ ...workspaceRoot, path: "Dossiers/contacts/contacts.json" }));

  const recovered = await repository.write(input);

  assert.equal(recovered.status, "committed");
  assert.equal(JSON.parse(resources.text({
    ...workspaceRoot,
    path: "Dossiers/.system/operations/op_01hzjournalrecovery.json",
  }) ?? "null").state, "committed");
  assert.equal(resources.text({ ...workspaceRoot, path: "Dossiers/.system/staging/op_01hzjournalrecovery.json" }), null);
});
