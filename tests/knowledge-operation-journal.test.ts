import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DurableKnowledgeOperationJournal,
} from "../core/knowledge-workspace/durable-operation-journal.ts";
import {
  KnowledgeAddressLockManager,
  KnowledgeOperationCoordinator,
} from "../core/knowledge-workspace/knowledge-operation-coordinator.ts";
import {
  hashKnowledgeOperationRequest,
} from "../lib/knowledge-workspace/knowledge-operation-plan.ts";

const OPERATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const OWNER = {
  principal: {
    kind: "api" as const,
    principalId: "owner-1",
    userId: "user-1",
    studioId: "studio-1",
  },
};
const FROM = { sourceKey: "main", relativePath: "a.md" };
const TO = { sourceKey: "main", relativePath: "b.md" };
const VERSION = { mtimeMs: 1, size: 1 };

describe("durable knowledge operation journal", () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("atomically advances journal.json while preserving journal.json.prev", () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-operation-journal-"));
    const journal = new DurableKnowledgeOperationJournal({
      hanakoHome: tempRoot,
    });
    const request = {
      kind: "rename" as const,
      from: FROM,
      to: TO,
      expectedVersion: VERSION,
    };
    const record = journal.createPlanned({
      operationId: OPERATION_ID,
      requestHash: hashKnowledgeOperationRequest(request),
      request,
      owner: {
        principalId: "owner-1",
        userId: "user-1",
        studioId: "studio-1",
        sessionId: null,
      },
      sourceIdentity: {
        providerId: "local_fs",
        identityNamespace: "local_fs",
        opaqueRootId: "root-1",
        scopeToken: "scope-1",
        caseMode: "sensitive",
      },
      createdAt: "2026-07-28T00:00:00.000Z",
      expiresAt: "2026-07-28T00:15:00.000Z",
    });
    const openSync = vi.spyOn(fs, "openSync");
    let fsyncedRecoveryCopyWithReadWriteHandle = false;
    try {
      journal.write({ ...record, state: "PREPARING" });
      fsyncedRecoveryCopyWithReadWriteHandle = openSync.mock.calls.some(
        ([filePath, flags]) => filePath === path.join(
          tempRoot!,
          "knowledge-workspace",
          "operations",
          "v1",
          OPERATION_ID,
          "journal.json.prev.tmp",
        ) && flags === fs.constants.O_RDWR,
      );
    } finally {
      openSync.mockRestore();
    }

    const operationDir = path.join(
      tempRoot,
      "knowledge-workspace",
      "operations",
      "v1",
      OPERATION_ID,
    );
    expect(JSON.parse(fs.readFileSync(
      path.join(operationDir, "journal.json"),
      "utf8",
    )).state).toBe("PREPARING");
    expect(JSON.parse(fs.readFileSync(
      path.join(operationDir, "journal.json.prev"),
      "utf8",
    )).state).toBe("PLANNED");
    expect(fsyncedRecoveryCopyWithReadWriteHandle).toBe(true);
    expect(fs.existsSync(path.join(operationDir, "journal.json.tmp"))).toBe(false);
    const serialized = fs.readFileSync(path.join(operationDir, "journal.json"), "utf8");
    expect(serialized).not.toContain(tempRoot);
    expect(serialized).not.toContain("content");
  });

  it("repairs an unreadable current journal from the previous fsynced copy", () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-operation-journal-repair-"));
    const journal = new DurableKnowledgeOperationJournal({
      hanakoHome: tempRoot,
    });
    const request = {
      kind: "rename" as const,
      from: FROM,
      to: TO,
      expectedVersion: VERSION,
    };
    const record = journal.createPlanned({
      operationId: OPERATION_ID,
      requestHash: hashKnowledgeOperationRequest(request),
      request,
      owner: {
        principalId: "owner-1",
        userId: "user-1",
        studioId: "studio-1",
        sessionId: null,
      },
      sourceIdentity: {
        providerId: "local_fs",
        identityNamespace: "local_fs",
        opaqueRootId: "root-1",
        scopeToken: "scope-1",
        caseMode: "sensitive",
      },
      createdAt: "2026-07-28T00:00:00.000Z",
      expiresAt: "2026-07-28T00:15:00.000Z",
    });
    journal.write({ ...record, state: "PREPARING" });
    const operationDir = path.join(
      tempRoot,
      "knowledge-workspace",
      "operations",
      "v1",
      OPERATION_ID,
    );
    fs.writeFileSync(path.join(operationDir, "journal.json"), "{broken", "utf8");

    expect(journal.read(OPERATION_ID)).toMatchObject({
      state: "RECOVERY_REQUIRED",
      recoveryReason: "journal_current_unreadable",
    });
    expect(JSON.parse(fs.readFileSync(
      path.join(operationDir, "journal.json"),
      "utf8",
    )).state).toBe("RECOVERY_REQUIRED");
    expect(JSON.parse(fs.readFileSync(
      path.join(operationDir, "journal.json.prev"),
      "utf8",
    )).state).toBe("PLANNED");
  });

  it("fails the recovery barrier closed when no valid journal copy remains", () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-operation-journal-corrupt-"));
    const journal = new DurableKnowledgeOperationJournal({
      hanakoHome: tempRoot,
    });
    const operationDir = path.join(
      tempRoot,
      "knowledge-workspace",
      "operations",
      "v1",
      OPERATION_ID,
    );
    fs.mkdirSync(operationDir, { recursive: true });
    fs.writeFileSync(path.join(operationDir, "journal.json"), "{broken", "utf8");
    fs.writeFileSync(path.join(operationDir, "journal.json.prev"), "[]", "utf8");

    expect(() => journal.list()).toThrow(/unreadable/);
  });

  it("rejects a valid result file that is bound to another operation or request hash", () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-operation-result-binding-"));
    const journal = new DurableKnowledgeOperationJournal({
      hanakoHome: tempRoot,
    });
    const operationDir = path.join(
      tempRoot,
      "knowledge-workspace",
      "operations",
      "v1",
      OPERATION_ID,
    );
    fs.mkdirSync(operationDir, { recursive: true });
    fs.writeFileSync(path.join(operationDir, "result.json"), JSON.stringify({
      schemaVersion: 1,
      operationId: "f23e4567-e89b-42d3-a456-426614174000",
      requestHash: "a".repeat(64),
      kind: "rename",
      state: "FINALIZED",
      completedAt: "2026-07-28T00:00:01.000Z",
      items: [{
        from: FROM,
        to: TO,
        state: "applied",
      }],
      summary: {
        succeeded: 1,
        failed: 0,
        rolledBack: 0,
        recoveryRequired: 0,
      },
      projections: {
        session: "applied",
        event: "applied",
        index: "applied",
      },
    }), "utf8");

    expect(journal.readResult(OPERATION_ID)).toBeNull();

    const result = JSON.parse(fs.readFileSync(
      path.join(operationDir, "result.json"),
      "utf8",
    ));
    result.operationId = OPERATION_ID;
    fs.writeFileSync(
      path.join(operationDir, "result.json"),
      JSON.stringify(result),
      "utf8",
    );
    expect(journal.readResult(OPERATION_ID, "b".repeat(64))).toBeNull();
  });

  it("acquires address locks in stable byte order and serializes overlapping operations", async () => {
    const manager = new KnowledgeAddressLockManager();
    const first = await manager.acquire([
      { sourceKey: "main", relativePath: "z.md" },
      { sourceKey: "main", relativePath: "a.md" },
    ]);
    let secondEntered = false;
    const secondPromise = manager.acquire([
      { sourceKey: "main", relativePath: "a.md" },
    ]).then((release) => {
      secondEntered = true;
      return release;
    });
    await Promise.resolve();
    expect(secondEntered).toBe(false);
    first();
    const second = await secondPromise;
    expect(secondEntered).toBe(true);
    second();
  });

  it("rolls the primary resource back and reports every item state when commit fails", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-operation-rollback-"));
    const fixture = createRollbackFixture(tempRoot, false);
    const plan = await fixture.coordinator.plan({
      kind: "rename",
      from: FROM,
      to: TO,
      expectedVersion: VERSION,
    }, OWNER);
    const result = await fixture.coordinator.commit(
      plan.operationId,
      { requestHash: plan.requestHash },
      OWNER,
    );
    expect(result).toMatchObject({
      state: "ROLLED_BACK",
      summary: {
        succeeded: 0,
        failed: 1,
        rolledBack: 1,
        recoveryRequired: 0,
      },
      items: [{
        state: "rolled-back",
        rollbackStatus: "rolled-back",
        errorCode: "knowledge_link_rewrite_failed",
      }],
    });
    expect(fixture.rename).toHaveBeenCalledTimes(2);
    expect(fixture.publishEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: OPERATION_ID,
        from: TO,
        to: FROM,
      }),
      expect.objectContaining({
        operationId: OPERATION_ID,
        reason: "rollback",
      }),
    );
  });

  it("retains evidence and enters RECOVERY_REQUIRED when rollback itself fails", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-operation-recovery-required-"));
    const fixture = createRollbackFixture(tempRoot, true);
    const plan = await fixture.coordinator.plan({
      kind: "rename",
      from: FROM,
      to: TO,
      expectedVersion: VERSION,
    }, OWNER);
    const result = await fixture.coordinator.commit(
      plan.operationId,
      { requestHash: plan.requestHash },
      OWNER,
    );
    expect(result).toMatchObject({
      state: "RECOVERY_REQUIRED",
      summary: {
        succeeded: 0,
        failed: 1,
        rolledBack: 0,
        recoveryRequired: 1,
      },
      items: [{
        state: "recovery-required",
        rollbackStatus: "failed",
      }],
    });
    expect(fs.existsSync(path.join(
      tempRoot,
      "knowledge-workspace",
      "operations",
      "v1",
      OPERATION_ID,
      "journal.json",
    ))).toBe(true);
  });
});

function createRollbackFixture(hanakoHome: string, failRollback: boolean) {
  let sourceExists = true;
  let targetExists = false;
  const rename = vi.fn(async (from, _to) => {
    const rollingBack = String(from.path).endsWith("b.md");
    if (rollingBack && failRollback) {
      throw Object.assign(new Error("permission changed"), {
        code: "resource_access_denied",
      });
    }
    sourceExists = rollingBack;
    targetExists = !rollingBack;
    return {
      oldResourceKey: rollingBack ? "new" : "old",
      newResourceKey: rollingBack ? "old" : "new",
      oldResource: from,
      newResource: _to,
    };
  });
  const publishEvent = vi.fn(async () => {});
  const coordinator = new KnowledgeOperationCoordinator({
    hanakoHome,
    randomUUID: () => OPERATION_ID,
    sourceRegistry: {
      get: () => ({
        sourceKey: "main",
        displayName: "Main",
        role: "main" as const,
        capabilities: ["stat", "write", "rename"],
        availability: "available" as const,
      }),
      revalidate: vi.fn(async () => {}),
      rootIdentity: () => ({
        providerId: "local_fs",
        identityNamespace: "local_fs",
        opaqueRootId: "root-1",
        scopeToken: "scope-1",
        caseMode: "sensitive" as const,
      }),
      resolveAddress: vi.fn(async (address) => ({
        kind: "local-file" as const,
        path: `/source/${address.relativePath}`,
      })),
    },
    resourceIO: {
      stat: vi.fn(async (ref) => {
        const isSource = String(ref.path).endsWith("a.md");
        const exists = isSource ? sourceExists : targetExists;
        return {
          resourceKey: isSource ? "old" : "new",
          resource: ref,
          exists,
          isDirectory: false,
          ...(exists ? { version: VERSION } : {}),
        };
      }),
      rename,
    },
    createCheckpoint: vi.fn(async () => "checkpoint-1"),
    rewriteLinks: vi.fn(async () => {
      throw Object.assign(new Error("link write failed"), {
        code: "knowledge_link_rewrite_failed",
      });
    }),
    publishEvent,
  });
  return { coordinator, publishEvent, rename };
}
