import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DurableKnowledgeAtomicOperationJournal } from "../core/knowledge-workspace/durable-atomic-operation-journal.ts";
import { KnowledgeAtomicOperationCoordinator } from "../core/knowledge-workspace/knowledge-atomic-operation-coordinator.ts";
import type { ResourceOperationContext, ResourceVersion } from "../lib/resource-io/types.ts";

const OWNER: ResourceOperationContext = {
  principal: {
    kind: "api",
    principalId: "owner-1",
    userId: "user-1",
    studioId: "studio-1",
    sessionId: "window-1",
  },
  sessionId: "window-1",
  requestId: "request-1",
};

describe("KnowledgeAtomicOperationCoordinator", () => {
  let tempRoot: string | null = null;
  let counter = 300;

  afterEach(() => {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  function uuid(): string {
    counter += 1;
    return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
  }

  function fixture(options: { crashAfterEffect?: boolean } = {}) {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-atomic-operation-"));
    const hanakoHome = path.join(tempRoot, "hana");
    const nodes = new Map<string, ResourceVersion>();
    const ref = (relativePath: string) => ({ kind: "mount" as const, mountId: "main", path: relativePath });
    const sourceRegistry = {
      get: () => ({
        sourceKey: "main",
        displayName: "Main",
        role: "main" as const,
        availability: "available" as const,
        capabilities: ["stat", "write"] as never[],
      }),
      revalidate: vi.fn(async () => {}),
      resolveAddress: vi.fn(async (address: { relativePath: string }) => ref(address.relativePath)),
      rootIdentity: () => ({
        providerId: "local_fs" as const,
        identityNamespace: "local_fs",
        opaqueRootId: "root-main",
        scopeToken: "scope-main",
        caseMode: "sensitive" as const,
      }),
    };
    const resourceIO = {
      stat: vi.fn(async (resource: ReturnType<typeof ref>) => ({
        exists: nodes.has(resource.path),
        isDirectory: false,
        ...(nodes.has(resource.path) ? { version: nodes.get(resource.path) } : {}),
        resourceKey: resource.path,
        resource,
      })),
    };
    const coordinator = new KnowledgeAtomicOperationCoordinator({
      hanakoHome,
      sourceRegistry,
      resourceIO,
      randomUUID: uuid,
      faultInjector: options.crashAfterEffect
        ? (point) => {
            if (point === "after_atomic_item_effect") {
              throw Object.assign(new Error("simulated process death"), {
                name: "SimulatedKnowledgeOperationCrash",
              });
            }
          }
        : undefined,
    });
    const request = () => ({
      kind: "create" as const,
      sourceKey: "main",
      items: [{
        itemId: uuid(),
        targetAddress: { sourceKey: "main", relativePath: "note.md" },
        resourceKind: "file" as const,
        disposition: "apply" as const,
        expectedTargetVersion: null,
      }],
    });
    return { hanakoHome, nodes, sourceRegistry, resourceIO, coordinator, request };
  }

  it("keeps planning side-effect free and serializes concurrent idempotent commits", async () => {
    const value = fixture();
    const execute = vi.fn(async () => {
      value.nodes.set("note.md", { sequence: 1, size: 0 });
      return { version: { sequence: 1, size: 0 } };
    });
    const plan = await value.coordinator.plan(value.request(), execute, OWNER);

    expect(value.nodes.has("note.md")).toBe(false);
    await expect(value.coordinator.commit(plan.operationId, {
      requestHash: "0".repeat(64),
    }, OWNER)).rejects.toMatchObject({ code: "operation_id_reused" });

    const [first, second] = await Promise.all([
      value.coordinator.commit(plan.operationId, { requestHash: plan.requestHash }, OWNER),
      value.coordinator.commit(plan.operationId, { requestHash: plan.requestHash }, OWNER),
    ]);

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      kind: "create",
      state: "FINALIZED",
      summary: { succeeded: 1, failed: 0 },
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(new DurableKnowledgeAtomicOperationJournal({ hanakoHome: value.hanakoHome }).read(plan.operationId))
      .toMatchObject({
        state: "FINALIZED",
        items: [{ state: "applied", steps: [{ kind: "resource-create", state: "applied" }] }],
      });
  });

  it("preserves an unexpired plan across restart and enforces owner isolation", async () => {
    const value = fixture();
    const plan = await value.coordinator.plan(value.request(), async () => ({}), OWNER);
    const restarted = new KnowledgeAtomicOperationCoordinator({
      hanakoHome: value.hanakoHome,
      sourceRegistry: value.sourceRegistry,
      resourceIO: value.resourceIO,
      randomUUID: uuid,
    });

    await expect(restarted.recover()).resolves.toMatchObject({ scanned: 1, rolledBack: 0 });
    await expect(restarted.get(plan.operationId, OWNER)).resolves.toMatchObject({
      operationId: plan.operationId,
      kind: "create",
    });
    await expect(restarted.cancel(plan.operationId, {
      ...OWNER,
      sessionId: "window-2",
      principal: { ...OWNER.principal!, sessionId: "window-2" },
    })).rejects.toMatchObject({ code: "knowledge_resource_out_of_scope" });
    await expect(restarted.cancel(plan.operationId, OWNER)).resolves.toMatchObject({
      state: "ROLLED_BACK",
      summary: { rolledBack: 1 },
    });
  });

  it("gates the source when a crash leaves a newly visible target without a journal outcome", async () => {
    const value = fixture({ crashAfterEffect: true });
    const plan = await value.coordinator.plan(value.request(), async () => {
      value.nodes.set("note.md", { sequence: 7, size: 0 });
      return { version: { sequence: 7, size: 0 } };
    }, OWNER);

    await expect(value.coordinator.commit(
      plan.operationId,
      { requestHash: plan.requestHash },
      OWNER,
    )).rejects.toMatchObject({ name: "SimulatedKnowledgeOperationCrash" });

    const restarted = new KnowledgeAtomicOperationCoordinator({
      hanakoHome: value.hanakoHome,
      sourceRegistry: value.sourceRegistry,
      resourceIO: value.resourceIO,
      randomUUID: uuid,
    });
    await expect(restarted.recover()).resolves.toMatchObject({ recoveryRequired: 1 });
    expect(restarted.isSourceRecovering("main")).toBe(true);
    expect(new DurableKnowledgeAtomicOperationJournal({ hanakoHome: value.hanakoHome }).read(plan.operationId))
      .toMatchObject({ state: "RECOVERY_REQUIRED", items: [{ state: "recovery-required" }] });
  });

  it("finalizes a crashed directory merge through provider publication recovery", async () => {
    const value = fixture({ crashAfterEffect: true });
    const originalVersion = { sequence: 1, size: 1 };
    const mergedVersion = { sequence: 2, size: 2 };
    value.nodes.set("Folder", originalVersion);
    const request = {
      kind: "import" as const,
      sourceKey: "main",
      items: [{
        itemId: uuid(),
        sourceToken: uuid(),
        targetAddress: { sourceKey: "main", relativePath: "Folder" },
        resourceKind: "directory" as const,
        disposition: "merge" as const,
        expectedSourceVersion: { size: 1 },
        expectedTargetVersion: originalVersion,
      }],
    };
    const plan = await value.coordinator.plan(request, async () => {
      value.nodes.set("Folder", mergedVersion);
      return { version: mergedVersion };
    }, OWNER);

    await expect(value.coordinator.commit(
      plan.operationId,
      { requestHash: plan.requestHash },
      OWNER,
    )).rejects.toMatchObject({ name: "SimulatedKnowledgeOperationCrash" });

    const recoverTransferPublication = vi.fn(async () => ({
      outcome: "committed" as const,
      version: mergedVersion,
    }));
    Object.assign(value.resourceIO, { recoverTransferPublication });
    const restarted = new KnowledgeAtomicOperationCoordinator({
      hanakoHome: value.hanakoHome,
      sourceRegistry: value.sourceRegistry,
      resourceIO: value.resourceIO,
      randomUUID: uuid,
    });

    await expect(restarted.recover()).resolves.toMatchObject({
      finalized: 1,
      recoveryRequired: 0,
    });
    expect(recoverTransferPublication).toHaveBeenCalledWith({
      target: { kind: "mount", mountId: "main", path: "Folder" },
      operationId: plan.operationId,
      expectedTargetVersion: originalVersion,
    }, expect.objectContaining({ reason: "knowledge-atomic-startup-recovery" }));
    await expect(restarted.get(plan.operationId, OWNER)).resolves.toMatchObject({
      state: "FINALIZED",
      items: [{ state: "applied" }],
      summary: { succeeded: 1, recoveryRequired: 0 },
    });
  });
});
