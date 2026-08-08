import { describe, expect, it, vi } from "vitest";
import {
  KNOWLEDGE_ERROR_METADATA,
  createKnowledgeWorkspaceError,
  toKnowledgeErrorEnvelope,
} from "../shared/knowledge-workspace-errors.ts";
import {
  exportKnowledgeDiagnosticSummary,
  parseKnowledgeDiagnosticSummary,
} from "../shared/knowledge-diagnostics.ts";
import { ResourceIOError, toKnowledgeResourceIOError } from "../lib/resource-io/errors.ts";
import { ResourceIO } from "../lib/resource-io/resource-io.ts";
import { ResourceEventBus } from "../lib/resource-io/resource-event-bus.ts";
import { toResourceEventWsMessage } from "../server/resource-events-ws.ts";

const operationId = "123e4567-e89b-42d3-a456-426614174000";

describe("Knowledge stable errors", () => {
  it("freezes lowercase metadata independently from display messages", () => {
    expect(Object.keys(KNOWLEDGE_ERROR_METADATA)).toHaveLength(18);
    expect(new Set(Object.keys(KNOWLEDGE_ERROR_METADATA)).size).toBe(18);
    for (const [code, metadata] of Object.entries(KNOWLEDGE_ERROR_METADATA)) {
      expect(code).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(metadata).toEqual(expect.objectContaining({ code, httpStatus: expect.any(Number), retryable: expect.any(Boolean) }));
      expect(Object.isFrozen(metadata)).toBe(true);
    }
    const first = createKnowledgeWorkspaceError("knowledge_resource_conflict", "first");
    const second = createKnowledgeWorkspaceError("knowledge_resource_conflict", "totally different");
    expect(toKnowledgeErrorEnvelope(first)).toEqual(toKnowledgeErrorEnvelope(second));
  });

  it.each([
    ["resource_not_found", "knowledge_resource_not_found", 404],
    ["target_already_exists", "knowledge_resource_conflict", 409],
    ["resource_version_conflict", "knowledge_version_conflict", 409],
    ["resource_changed_during_read", "knowledge_version_conflict", 409],
    ["resource_access_denied", "knowledge_resource_out_of_scope", 403],
    ["symbolic_link_not_allowed", "knowledge_resource_out_of_scope", 403],
    ["not_a_file", "knowledge_operation_precondition_failed", 412],
    ["not_a_directory", "knowledge_operation_precondition_failed", 412],
    ["invalid_read_range", "knowledge_operation_precondition_failed", 412],
    ["unsupported_file_kind", "knowledge_operation_precondition_failed", 412],
    ["provider_not_available", "knowledge_resource_unavailable", 503],
  ])("maps Desktop and Server failures to one code", (legacyCode, expectedCode, status) => {
    const desktop = toKnowledgeResourceIOError(new ResourceIOError("desktop path /Users/alice/secret.md", { code: legacyCode }));
    const server = toKnowledgeErrorEnvelope({ code: legacyCode, message: "server C:\\Users\\alice\\secret.md" });
    expect(desktop?.code).toBe(expectedCode);
    expect(desktop?.status).toBe(status);
    expect(server).toEqual({ code: expectedCode, httpStatus: status, retryable: KNOWLEDGE_ERROR_METADATA[expectedCode].retryable });
  });

  it("fails closed for unknown and forged error shapes", () => {
    expect(toKnowledgeErrorEnvelope({ code: "MADE_UP", status: 200, retryable: true, message: "/etc/passwd" })).toBeUndefined();
    const hostile = new Proxy({}, { getPrototypeOf() { throw new Error("trap"); } });
    expect(toKnowledgeErrorEnvelope(hostile)).toBeUndefined();
    let getRuns = 0;
    const getTrap = new Proxy({ code: "resource_not_found" }, {
      get(target, key, receiver) { getRuns += 1; return Reflect.get(target, key, receiver); },
    });
    expect(toKnowledgeResourceIOError(getTrap)?.code).toBe("knowledge_resource_not_found");
    expect(getRuns).toBe(0);
    expect(toKnowledgeResourceIOError({ code: "unknown_provider_fault" })).toBeUndefined();
  });

  it("exports only explicitly safe scalar details", () => {
    const error = createKnowledgeWorkspaceError(
      "knowledge_transfer_limit_exceeded",
      "contains /Users/alice/private.md but is display-only",
      { field: "entryCount", limit: 100_000, actual: 100_001 },
    );
    expect(toKnowledgeErrorEnvelope(error)).toEqual({
      code: "knowledge_transfer_limit_exceeded",
      httpStatus: 413,
      retryable: false,
      details: { field: "entryCount", limit: 100_000, actual: 100_001 },
    });
    expect(JSON.stringify(toKnowledgeErrorEnvelope(error))).not.toContain("alice");
    expect(() => createKnowledgeWorkspaceError(
      "knowledge_resource_conflict",
      "display",
      { field: "/Users/alice/secret.md" },
    )).toThrow("Unsafe knowledge error details");
    expect(() => createKnowledgeWorkspaceError(
      "knowledge_resource_conflict",
      "display",
      { field: "body\r\nAuthorization" },
    )).toThrow("Unsafe knowledge error details");
  });
});

describe("Knowledge diagnostics", () => {
  it("exports deterministic structured summaries with operation, address, watch and rebuild correlation", () => {
    const input = {
      rebuildReason: "watch_gap",
      sequence: 42,
      address: { relativePath: "文档/秘密.md", sourceKey: "main" },
      operationId,
      errorCode: "knowledge_index_unavailable",
    };
    const parsed = parseKnowledgeDiagnosticSummary(input);
    expect(parsed).toEqual({ ok: true, value: {
      errorCode: "knowledge_index_unavailable",
      operationId,
      address: { sourceKey: "main", relativePath: "文档/秘密.md" },
      sequence: 42,
      rebuildReason: "watch_gap",
    } });
    expect(exportKnowledgeDiagnosticSummary(input)).toBe(
      `{"schemaVersion":1,"errorCode":"knowledge_index_unavailable","operationId":"${operationId}","address":{"sourceKey":"main","relativePath":"[redacted]"},"sequence":42,"rebuildReason":"watch_gap"}\n`,
    );
    expect(exportKnowledgeDiagnosticSummary(input)).not.toContain("秘密.md");
  });

  it.each([
    { errorCode: "knowledge_resource_conflict", operationId: "cancelled" },
    { errorCode: "knowledge_resource_conflict", sequence: -1 },
    { errorCode: "knowledge_resource_conflict", rebuildReason: "arbitrary" },
    { errorCode: "knowledge_resource_conflict", message: "secret body" },
    { errorCode: "knowledge_resource_conflict", token: "bearer-secret" },
    { errorCode: "knowledge_resource_conflict", address: { sourceKey: "main", relativePath: "/etc/passwd" } },
    { errorCode: "knowledge_resource_conflict", address: { sourceKey: "main", relativePath: "C:\\Users\\alice\\x.md" } },
    { errorCode: "knowledge_resource_conflict", address: { sourceKey: "main", relativePath: "\\\\server\\share\\x.md" } },
    { errorCode: "knowledge_resource_conflict", address: { sourceKey: "main", relativePath: "file:///tmp/x.md" } },
    { errorCode: "knowledge_resource_conflict", nested: { authorization: "Bearer x", body: "private", path: "/tmp/x" } },
    { errorCode: "knowledge_resource_conflict\nforged" },
  ])("rejects unsafe or unknown diagnostic input %#", (input) => {
    expect(parseKnowledgeDiagnosticSummary(input).ok).toBe(false);
    expect(() => exportKnowledgeDiagnosticSummary(input)).toThrow();
  });

  it.each([
    "knowledge_operation_plan_expired",
    "knowledge_operation_precondition_failed",
    "knowledge_resource_conflict",
    "knowledge_resource_out_of_scope",
    "knowledge_index_unavailable",
  ])("covers cancellation/conflict/permission/unavailable diagnostics: %s", (errorCode) => {
    expect(parseKnowledgeDiagnosticSummary({ errorCode, operationId }).ok).toBe(true);
  });

  it("adds only validated operation correlation to websocket events", () => {
    const event = { type: "resource.deleted", resourceKey: "safe", resource: { kind: "resource", resourceId: "r" }, source: "api", sequence: 2, occurredAt: "2026-01-01T00:00:00.000Z" };
    expect(toResourceEventWsMessage({ ...event, operationId }, null, operationId)).toEqual({
      type: "resource.resync_required", stale: true, resync: "resource-stat-required", source: "api", sequence: 2,
      occurredAt: "2026-01-01T00:00:00.000Z", operationId,
    });
    expect(toResourceEventWsMessage(event, null, "forged\n/tmp/secret")).toBeNull();
    expect(toResourceEventWsMessage({ ...event, operationId: "forged\nBearer secret" }, null)).toEqual({
      type: "resource.resync_required", stale: true, resync: "resource-stat-required", source: "api", sequence: 2,
      occurredAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("correlates real ResourceIO mutation events and omits missing or malicious ids", async () => {
    const emit = vi.fn();
    const eventBus = new ResourceEventBus({ emit });
    const record = vi.fn();
    const resourceIO = new ResourceIO({
      providers: {
        resource: {
          id: "resource",
          capabilities: () => ({ write: true }),
          write: async (ref) => ({
            changeType: "modified",
            resourceKey: "resource:r",
            resource: ref,
          }),
        },
      },
      eventBus,
      audit: { record },
    });

    await resourceIO.write({ kind: "resource", resourceId: "r" }, "safe", { operationId });
    await resourceIO.write({ kind: "resource", resourceId: "r" }, "safe");
    await resourceIO.write(
      { kind: "resource", resourceId: "r" },
      "safe",
      { operationId: "forged\r\nAuthorization: Bearer secret" },
    );

    expect(emit.mock.calls[0]?.[0]).toMatchObject({ operationId });
    expect(toResourceEventWsMessage(emit.mock.calls[0]?.[0], null)).toEqual({
      type: "resource.resync_required",
      stale: true,
      resync: "resource-stat-required",
      source: "api",
      sequence: 1,
      occurredAt: expect.any(String),
      operationId,
    });
    expect(emit.mock.calls[1]?.[0]).not.toHaveProperty("operationId");
    expect(emit.mock.calls[2]?.[0]).not.toHaveProperty("operationId");
    expect(record.mock.calls[0]?.[0]).toMatchObject({ operationId });
    expect(record.mock.calls[1]?.[0]).not.toHaveProperty("operationId");
    expect(record.mock.calls[2]?.[0]).not.toHaveProperty("operationId");
  });
});
