import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KnowledgeOperationCoordinator,
  SimulatedKnowledgeOperationCrash,
} from "../core/knowledge-workspace/knowledge-operation-coordinator.ts";
import {
  prepareKnowledgeOperationRecovery,
} from "../server/routes/knowledge-workspace.ts";

const OPERATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const OWNER = {
  principal: {
    kind: "api" as const,
    principalId: "owner-1",
    userId: "user-1",
    studioId: "studio-1",
  },
};
const FROM = { sourceKey: "main", relativePath: "old.md" };
const TO = { sourceKey: "main", relativePath: "new.md" };
const VERSION = { mtimeMs: 1, size: 1 };

describe("knowledge operation recovery", () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("recovers a crash after the primary move by probing disk facts and finalizing projections", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-operation-crash-"));
    const state = { sourceExists: true, targetExists: false };
    const first = createFixture(tempRoot, state, {
      inject: (point) => {
        if (point === "after_primary_move") {
          throw new SimulatedKnowledgeOperationCrash(point);
        }
      },
    });
    const plan = await first.coordinator.plan({
      kind: "rename",
      from: FROM,
      to: TO,
      expectedVersion: VERSION,
    }, OWNER);
    await expect(first.coordinator.commit(
      plan.operationId,
      { requestHash: plan.requestHash },
      OWNER,
    )).rejects.toBeInstanceOf(SimulatedKnowledgeOperationCrash);
    expect(state).toEqual({ sourceExists: false, targetExists: true });

    const recovered = createFixture(tempRoot, state);
    const report = await recovered.coordinator.recover();
    expect(report).toEqual({
      scanned: 1,
      finalized: 1,
      rolledBack: 0,
      recoveryRequired: 0,
      expired: 0,
    });
    const result = await recovered.coordinator.get(OPERATION_ID, OWNER);
    expect(result).toMatchObject({
      state: "FINALIZED",
      items: [{ state: "applied" }],
    });
    expect(recovered.publishEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operationId: OPERATION_ID }),
    );
  });

  it("does not roll back committed disk facts when a post-commit projection fails", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-operation-post-commit-"));
    const state = { sourceExists: true, targetExists: false };
    const first = createFixture(tempRoot, state, {
      publishEvent: vi.fn(async () => {
        throw new Error("event transport unavailable");
      }),
    });
    const plan = await first.coordinator.plan({
      kind: "rename",
      from: FROM,
      to: TO,
      expectedVersion: VERSION,
    }, OWNER);
    const result = await first.coordinator.commit(
      plan.operationId,
      { requestHash: plan.requestHash },
      OWNER,
    );
    expect(result).toMatchObject({
      state: "FINALIZED",
      projections: { event: "retrying" },
    });
    expect(state).toEqual({ sourceExists: false, targetExists: true });
    expect(first.rename).toHaveBeenCalledTimes(1);

    const retry = createFixture(tempRoot, state);
    await retry.coordinator.recover();
    expect(retry.rename).not.toHaveBeenCalled();
    expect(retry.publishEvent).toHaveBeenCalledOnce();
    expect(await retry.coordinator.get(OPERATION_ID, OWNER)).toMatchObject({
      state: "FINALIZED",
      projections: { event: "applied" },
    });
  });

  it("rebuilds a missing public result from a terminal journal", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-operation-result-rebuild-"));
    const state = { sourceExists: true, targetExists: false };
    const first = createFixture(tempRoot, state);
    const plan = await first.coordinator.plan({
      kind: "rename",
      from: FROM,
      to: TO,
      expectedVersion: VERSION,
    }, OWNER);
    await first.coordinator.commit(
      plan.operationId,
      { requestHash: plan.requestHash },
      OWNER,
    );
    const resultPath = path.join(
      tempRoot,
      "knowledge-workspace",
      "operations",
      "v1",
      plan.operationId,
      "result.json",
    );
    fs.rmSync(resultPath);

    const recovered = createFixture(tempRoot, state);
    await recovered.coordinator.recover();

    expect(fs.existsSync(resultPath)).toBe(true);
    expect(await recovered.coordinator.get(plan.operationId, OWNER))
      .toMatchObject({ state: "FINALIZED", summary: { succeeded: 1 } });
  });

  it("marks ambiguous disk facts RECOVERY_REQUIRED and keeps the source degraded", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-operation-ambiguous-"));
    const state = { sourceExists: true, targetExists: false };
    const first = createFixture(tempRoot, state, {
      inject: (point) => {
        if (point === "after_primary_move") {
          throw new SimulatedKnowledgeOperationCrash(point);
        }
      },
    });
    const plan = await first.coordinator.plan({
      kind: "rename",
      from: FROM,
      to: TO,
      expectedVersion: VERSION,
    }, OWNER);
    await expect(first.coordinator.commit(
      plan.operationId,
      { requestHash: plan.requestHash },
      OWNER,
    )).rejects.toBeInstanceOf(SimulatedKnowledgeOperationCrash);

    state.sourceExists = true;
    state.targetExists = true;
    const recovered = createFixture(tempRoot, state);
    const report = await recovered.coordinator.recover();
    expect(report.recoveryRequired).toBe(1);
    expect(recovered.coordinator.isSourceRecovering("main")).toBe(true);
    await expect(recovered.coordinator.plan({
      kind: "rename",
      from: FROM,
      to: { sourceKey: "main", relativePath: "later.md" },
      expectedVersion: VERSION,
    }, OWNER)).rejects.toMatchObject({
      code: "source_recovery_in_progress",
      status: 503,
    });
  });

  it("does not clear a degraded source when a later journal for the same source is healthy", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-operation-multi-recovery-"));
    const state = { sourceExists: true, targetExists: false };
    const healthy = createFixture(tempRoot, state, {
      operationId: "f23e4567-e89b-42d3-a456-426614174000",
    });
    const healthyPlan = await healthy.coordinator.plan({
      kind: "rename",
      from: FROM,
      to: TO,
      expectedVersion: VERSION,
    }, OWNER);
    await healthy.coordinator.commit(
      healthyPlan.operationId,
      { requestHash: healthyPlan.requestHash },
      OWNER,
    );

    state.sourceExists = true;
    state.targetExists = false;
    const crashing = createFixture(tempRoot, state, {
      operationId: OPERATION_ID,
      inject: (point) => {
        if (point === "after_primary_move") {
          throw new SimulatedKnowledgeOperationCrash(point);
        }
      },
    });
    const crashingPlan = await crashing.coordinator.plan({
      kind: "rename",
      from: FROM,
      to: TO,
      expectedVersion: VERSION,
    }, OWNER);
    await expect(crashing.coordinator.commit(
      crashingPlan.operationId,
      { requestHash: crashingPlan.requestHash },
      OWNER,
    )).rejects.toBeInstanceOf(SimulatedKnowledgeOperationCrash);

    state.sourceExists = true;
    state.targetExists = true;
    const recovered = createFixture(tempRoot, state);
    expect((await recovered.coordinator.recover()).recoveryRequired).toBe(1);
    expect(recovered.coordinator.isSourceRecovering("main")).toBe(true);
  });

  it("fails closed when the post-crash target version does not match the planned file fact", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-operation-version-fact-"));
    const state = { sourceExists: true, targetExists: false };
    const first = createFixture(tempRoot, state, {
      inject: (point) => {
        if (point === "after_primary_move") {
          throw new SimulatedKnowledgeOperationCrash(point);
        }
      },
    });
    const plan = await first.coordinator.plan({
      kind: "rename",
      from: FROM,
      to: TO,
      expectedVersion: VERSION,
    }, OWNER);
    await expect(first.coordinator.commit(
      plan.operationId,
      { requestHash: plan.requestHash },
      OWNER,
    )).rejects.toBeInstanceOf(SimulatedKnowledgeOperationCrash);

    const recovered = createFixture(tempRoot, state, {
      targetVersion: { mtimeMs: 99, size: 1 },
    });
    expect((await recovered.coordinator.recover()).recoveryRequired).toBe(1);
    expect(recovered.rename).not.toHaveBeenCalled();
    expect(recovered.coordinator.isSourceRecovering("main")).toBe(true);
  });

  it("runs the production recovery seam before route registration can continue", async () => {
    const recover = vi.fn(async () => ({
      scanned: 0,
      finalized: 0,
      rolledBack: 0,
      recoveryRequired: 0,
      expired: 0,
    }));
    const coordinator = { recover };
    await expect(prepareKnowledgeOperationRecovery({
      knowledgeOperationCoordinator: coordinator,
      getRuntimeContext: () => ({
        userId: "user-1",
        studioId: "studio-1",
      }),
      defaultDeskCwd: "/workspace",
      homeCwd: "/workspace",
      deskCwd: "/workspace",
      hanakoHome: "/hana",
    })).resolves.toBe(coordinator);
    expect(recover).toHaveBeenCalledOnce();

    const openRootSource = fs.readFileSync(
      path.join(process.cwd(), "server/composition/open-root.ts"),
      "utf8",
    );
    expect(openRootSource.indexOf("await prepareKnowledgeOperationRecovery(engine)"))
      .toBeLessThan(openRootSource.indexOf("createKnowledgeWorkspaceRoute(engine)"));
  });

  it("retains an orphaned old-workspace recovery without degrading a different current root", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-operation-old-root-"));
    const state = { sourceExists: true, targetExists: false };
    const first = createFixture(tempRoot, state, {
      rootId: "old-root",
      inject: (point) => {
        if (point === "after_primary_move") {
          throw new SimulatedKnowledgeOperationCrash(point);
        }
      },
    });
    const plan = await first.coordinator.plan({
      kind: "rename",
      from: FROM,
      to: TO,
      expectedVersion: VERSION,
    }, OWNER);
    await expect(first.coordinator.commit(
      plan.operationId,
      { requestHash: plan.requestHash },
      OWNER,
    )).rejects.toBeInstanceOf(SimulatedKnowledgeOperationCrash);

    const currentWorkspace = createFixture(tempRoot, state, {
      rootId: "new-root",
    });
    expect((await currentWorkspace.coordinator.recover()).recoveryRequired)
      .toBe(1);
    expect(currentWorkspace.coordinator.isSourceRecovering("main")).toBe(false);
  });
});

function createFixture(
  hanakoHome: string,
  state: { sourceExists: boolean; targetExists: boolean },
  options: {
    inject?: (point: string) => void;
    publishEvent?: (
      projection: unknown,
      context: unknown,
    ) => Promise<void>;
    rootId?: string;
    operationId?: string;
    targetVersion?: typeof VERSION;
  } = {},
) {
  const rename = vi.fn(async (from, to) => {
    const rollingBack = String(from.path).endsWith("new.md");
    state.sourceExists = rollingBack;
    state.targetExists = !rollingBack;
    return {
      oldResourceKey: rollingBack ? "new" : "old",
      newResourceKey: rollingBack ? "old" : "new",
      oldResource: from,
      newResource: to,
    };
  });
  const publishEvent = options.publishEvent ?? vi.fn(async () => {});
  const coordinator = new KnowledgeOperationCoordinator({
    hanakoHome,
    randomUUID: () => options.operationId ?? OPERATION_ID,
    faultInjector: options.inject,
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
        opaqueRootId: options.rootId ?? "root-1",
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
        const isSource = String(ref.path).endsWith("old.md");
        const exists = isSource ? state.sourceExists : state.targetExists;
        return {
          resourceKey: isSource ? "old" : "new",
          resource: ref,
          exists,
          isDirectory: false,
          ...(exists
            ? {
                version: isSource
                  ? VERSION
                  : options.targetVersion ?? VERSION,
              }
            : {}),
        };
      }),
      rename,
    },
    createCheckpoint: vi.fn(async () => "checkpoint-1"),
    publishEvent,
    rebindSessions: vi.fn(async () => {}),
    invalidateIndex: vi.fn(async () => {}),
  });
  return { coordinator, publishEvent, rename };
}
