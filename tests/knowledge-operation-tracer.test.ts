import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canonicalKnowledgeOperationJson,
  hashKnowledgeOperationRequest,
  KNOWLEDGE_OPERATION_PLAN_TTL_MS,
} from "../lib/knowledge-workspace/knowledge-operation-plan.ts";
import {
  KnowledgeOperationCoordinator,
} from "../core/knowledge-workspace/knowledge-operation-coordinator.ts";
import { SourceRegistry } from "../core/knowledge-workspace/source-registry.ts";
import { ResourceIO } from "../lib/resource-io/resource-io.ts";
import { LocalFsProvider } from "../lib/resource-io/providers/local-fs-provider.ts";

const OPERATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const OWNER = {
  principal: {
    kind: "api" as const,
    principalId: "device:owner",
    userId: "user-1",
    studioId: "studio-1",
    sessionId: "session-1",
  },
  requestId: "request-1",
};
const FROM = { sourceKey: "main", relativePath: "Notes/Old.md" };
const TO = { sourceKey: "main", relativePath: "Notes/New.md" };
const VERSION = { mtimeMs: 12, size: 5 };

describe("knowledge operation tracer", () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("hashes recursively canonical JSON by Unicode code point and rejects non-JSON values", () => {
    expect(canonicalKnowledgeOperationJson({
      z: -0,
      "😀": 1,
      "\uE000": 2,
      nested: { b: true, a: null },
      list: [3, "x"],
    })).toBe(
      "{\"list\":[3,\"x\"],\"nested\":{\"a\":null,\"b\":true},\"z\":0,\"\":2,\"😀\":1}",
    );
    expect(hashKnowledgeOperationRequest({ b: 2, a: 1 })).toBe(
      hashKnowledgeOperationRequest({ a: 1, b: 2 }),
    );
    expect(() => canonicalKnowledgeOperationJson({ bad: undefined })).toThrow();
    expect(() => canonicalKnowledgeOperationJson({ bad: Number.NaN })).toThrow();
    expect(() => canonicalKnowledgeOperationJson(new Date())).toThrow();
    expect(() => canonicalKnowledgeOperationJson(Object.create({ bad: true })))
      .toThrow();
    const sparse = Array<string>(1);
    expect(() => canonicalKnowledgeOperationJson(sparse)).toThrow();
    const accessor = ["safe"];
    Object.defineProperty(accessor, "0", {
      enumerable: true,
      get: () => "unsafe",
    });
    expect(() => canonicalKnowledgeOperationJson(accessor)).toThrow();
  });

  it("creates a server-owned UUIDv4 plan with a fixed 15 minute TTL and commits one rename", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-operation-tracer-"));
    const now = Date.parse("2026-07-28T08:00:00.000Z");
    const fixture = createFixture(tempRoot, now);
    const plan = await fixture.coordinator.plan({
      kind: "rename",
      from: FROM,
      to: TO,
      expectedVersion: VERSION,
    }, OWNER);

    expect(plan).toMatchObject({
      schemaVersion: 1,
      operationId: OPERATION_ID,
      kind: "rename",
      createdAt: "2026-07-28T08:00:00.000Z",
      expiresAt: "2026-07-28T08:15:00.000Z",
      checkpointRequired: true,
      items: [{ from: FROM, to: TO, expectedVersion: VERSION }],
    });
    expect(
      Date.parse(plan.expiresAt) - Date.parse(plan.createdAt),
    ).toBe(KNOWLEDGE_OPERATION_PLAN_TTL_MS);

    const result = await fixture.coordinator.commit(
      plan.operationId,
      { requestHash: plan.requestHash },
      OWNER,
    );
    expect(result).toMatchObject({
      operationId: OPERATION_ID,
      state: "FINALIZED",
      summary: {
        succeeded: 1,
        failed: 0,
        rolledBack: 0,
        recoveryRequired: 0,
      },
      items: [{
        from: FROM,
        to: TO,
        state: "applied",
        checkpointId: "checkpoint-1",
      }],
      projections: {
        session: "applied",
        event: "applied",
        index: "applied",
      },
    });
    expect(fixture.rename).toHaveBeenCalledWith(
      { kind: "local-file", path: "/source/Notes/Old.md" },
      { kind: "local-file", path: "/source/Notes/New.md" },
      expect.objectContaining({
        emit: false,
        operationId: OPERATION_ID,
        expectedSourceVersion: VERSION,
        expectedTargetVersion: null,
      }),
    );
    expect(fixture.createCheckpoint).toHaveBeenCalledOnce();
    expect(fixture.publishEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operationId: OPERATION_ID }),
    );
  });

  it("returns the same result for an idempotent commit and rejects a reused id/hash", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-operation-idempotent-"));
    const fixture = createFixture(tempRoot, Date.now());
    const plan = await fixture.coordinator.plan({
      kind: "rename",
      from: FROM,
      to: TO,
      expectedVersion: VERSION,
    }, OWNER);
    const first = await fixture.coordinator.commit(
      plan.operationId,
      { requestHash: plan.requestHash },
      OWNER,
    );
    const repeated = await fixture.coordinator.commit(
      plan.operationId,
      { requestHash: plan.requestHash },
      OWNER,
    );
    expect(repeated).toEqual(first);
    expect(fixture.rename).toHaveBeenCalledTimes(1);

    await expect(fixture.coordinator.commit(
      plan.operationId,
      { requestHash: "0".repeat(64) },
      OWNER,
    )).rejects.toMatchObject({ code: "operation_id_reused", status: 409 });
  });

  it("rejects an expired plan before any checkpoint or file mutation", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-operation-expired-"));
    let now = Date.parse("2026-07-28T08:00:00.000Z");
    const fixture = createFixture(tempRoot, () => now);
    const plan = await fixture.coordinator.plan({
      kind: "rename",
      from: FROM,
      to: TO,
      expectedVersion: VERSION,
    }, OWNER);
    now += KNOWLEDGE_OPERATION_PLAN_TTL_MS + 1;

    await expect(fixture.coordinator.commit(
      plan.operationId,
      { requestHash: plan.requestHash },
      OWNER,
    )).rejects.toMatchObject({
      code: "knowledge_operation_plan_expired",
      status: 410,
    });
    await expect(fixture.coordinator.commit(
      plan.operationId,
      { requestHash: plan.requestHash },
      OWNER,
    )).rejects.toMatchObject({
      code: "knowledge_operation_plan_expired",
      status: 410,
    });
    expect(fixture.rename).not.toHaveBeenCalled();
    expect(fixture.createCheckpoint).not.toHaveBeenCalled();
  });

  it("rejects forged authority, native locators, version conflicts, and another owner", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-operation-guards-"));
    const fixture = createFixture(tempRoot, Date.now());
    await expect(fixture.coordinator.plan({
      kind: "rename",
      from: {
        ...FROM,
        absolutePath: "/private/secret.md",
      },
      to: TO,
      expectedVersion: VERSION,
      principal: { principalId: "forged" },
    }, OWNER)).rejects.toMatchObject({
      code: "knowledge_operation_precondition_failed",
    });

    fixture.stat.mockImplementation(async (ref) => {
      const isSource = String(ref.path).endsWith("Old.md");
      return {
        resourceKey: isSource ? "old" : "new",
        resource: ref,
        exists: isSource,
        isDirectory: false,
        ...(isSource ? { version: { mtimeMs: 999, size: 5 } } : {}),
      };
    });
    await expect(fixture.coordinator.plan({
      kind: "rename",
      from: FROM,
      to: TO,
      expectedVersion: VERSION,
    }, OWNER)).rejects.toMatchObject({
      code: "knowledge_version_conflict",
      status: 409,
    });

    fixture.stat.mockImplementation(async (ref) => ({
      resourceKey: String(ref.path).endsWith("Old.md") ? "old" : "new",
      resource: ref,
      exists: true,
      isDirectory: false,
      version: VERSION,
    }));
    await expect(fixture.coordinator.plan({
      kind: "rename",
      from: FROM,
      to: TO,
      expectedVersion: VERSION,
    }, OWNER)).rejects.toMatchObject({
      code: "knowledge_resource_conflict",
      status: 409,
    });

    const ownerFixture = createFixture(tempRoot, Date.now());
    const plan = await ownerFixture.coordinator.plan({
      kind: "rename",
      from: FROM,
      to: TO,
      expectedVersion: VERSION,
    }, OWNER);
    await expect(ownerFixture.coordinator.commit(
      plan.operationId,
      { requestHash: plan.requestHash },
      {
        ...OWNER,
        principal: {
          ...OWNER.principal,
          principalId: "device:other",
        },
      },
    )).rejects.toMatchObject({
      code: "knowledge_resource_out_of_scope",
      status: 403,
    });
  });

  it("cancels a planned operation without checkpointing or mutating files", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-operation-cancel-"));
    const fixture = createFixture(tempRoot, Date.now());
    const plan = await fixture.coordinator.plan({
      kind: "rename",
      from: FROM,
      to: TO,
      expectedVersion: VERSION,
    }, OWNER);
    const result = await fixture.coordinator.cancel(plan.operationId, OWNER);
    expect(result).toMatchObject({
      state: "ROLLED_BACK",
      summary: {
        succeeded: 0,
        failed: 1,
        rolledBack: 1,
        recoveryRequired: 0,
      },
    });
    expect(fixture.createCheckpoint).not.toHaveBeenCalled();
    expect(fixture.rename).not.toHaveBeenCalled();
  });

  it("renames a real temporary workspace file through SourceRegistry and ResourceIO", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-operation-real-"));
    const workspace = path.join(tempRoot, "workspace");
    const hanakoHome = path.join(tempRoot, "hana");
    fs.mkdirSync(path.join(workspace, "Notes"), { recursive: true });
    const sourcePath = path.join(workspace, "Notes", "Old.md");
    const targetPath = path.join(workspace, "Notes", "New.md");
    fs.writeFileSync(sourcePath, "# real\n", "utf8");
    const resolvedSourcePath = fs.realpathSync(sourcePath);
    const provider = new LocalFsProvider({ cwd: workspace });
    const resourceIO = new ResourceIO({
      providers: { local_fs: provider },
    });
    const registry = await SourceRegistry.create({
      mainRoot: { kind: "local-file", path: workspace },
      resourceIO,
      hanakoHome,
    });
    const stat = await resourceIO.stat({
      kind: "local-file",
      path: sourcePath,
    });
    const checkpoint = vi.fn(async ({ resource }) => {
      expect(resource).toEqual({
        kind: "local-file",
        path: resolvedSourcePath,
      });
      return "real-checkpoint";
    });
    const coordinator = new KnowledgeOperationCoordinator({
      hanakoHome,
      sourceRegistry: registry,
      resourceIO,
      createCheckpoint: checkpoint,
    });
    const plan = await coordinator.plan({
      kind: "rename",
      from: FROM,
      to: TO,
      expectedVersion: stat.version,
    }, OWNER);
    const result = await coordinator.commit(
      plan.operationId,
      { requestHash: plan.requestHash },
      OWNER,
    );

    expect(result.state).toBe("FINALIZED");
    expect(fs.existsSync(sourcePath)).toBe(false);
    expect(fs.readFileSync(targetPath, "utf8")).toBe("# real\n");
    const journal = fs.readFileSync(path.join(
      hanakoHome,
      "knowledge-workspace",
      "operations",
      "v1",
      plan.operationId,
      "journal.json",
    ), "utf8");
    expect(journal).not.toContain(workspace);
    expect(journal).not.toContain("# real");
  });
});

function createFixture(
  hanakoHome: string,
  clock: number | (() => number),
) {
  const now = typeof clock === "function" ? clock : () => clock;
  let sourceExists = true;
  let targetExists = false;
  const rename = vi.fn(async (_from, _to) => {
    sourceExists = false;
    targetExists = true;
    return {
      oldResourceKey: "old",
      newResourceKey: "new",
      oldResource: { kind: "local-file" as const, path: "/source/Notes/Old.md" },
      newResource: { kind: "local-file" as const, path: "/source/Notes/New.md" },
    };
  });
  const createCheckpoint = vi.fn(async () => "checkpoint-1");
  const publishEvent = vi.fn(async () => {});
  const stat = vi.fn(async (ref) => {
    const isSource = String(ref.path).endsWith("Old.md");
    const exists = isSource ? sourceExists : targetExists;
    return {
      resourceKey: isSource ? "old" : "new",
      resource: ref,
      exists,
      isDirectory: false,
      ...(exists ? { version: VERSION } : {}),
    };
  });
  const coordinator = new KnowledgeOperationCoordinator({
    hanakoHome,
    now,
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
      stat,
      rename,
    },
    createCheckpoint,
    rebindSessions: vi.fn(async () => {}),
    publishEvent,
    invalidateIndex: vi.fn(async () => {}),
  });
  return { coordinator, createCheckpoint, publishEvent, rename, stat };
}
