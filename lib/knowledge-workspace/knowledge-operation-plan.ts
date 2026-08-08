import { createHash, randomUUID } from "node:crypto";
import {
  parseKnowledgeResourceAddress,
  type KnowledgeResourceAddress,
} from "../../shared/knowledge-workspace-contract.ts";
import {
  createKnowledgeWorkspaceError,
} from "../../shared/knowledge-workspace-errors.ts";
import { isOperationCorrelationId } from "../../shared/knowledge-diagnostics.ts";
import type { ResourceVersion } from "../resource-io/types.ts";

export const KNOWLEDGE_OPERATION_PLAN_SCHEMA_VERSION = 1 as const;
export const KNOWLEDGE_OPERATION_PLAN_TTL_MS = 15 * 60 * 1_000;
export const KNOWLEDGE_OPERATION_RESULT_RETENTION_MS =
  7 * 24 * 60 * 60 * 1_000;

export type KnowledgeRenameOperationRequest = Readonly<{
  kind: "rename";
  from: KnowledgeResourceAddress;
  to: KnowledgeResourceAddress;
  expectedVersion: ResourceVersion;
}>;

export type KnowledgeMoveOperationRequest = Readonly<{
  kind: "move";
  from: KnowledgeResourceAddress;
  to: KnowledgeResourceAddress;
  expectedVersion: ResourceVersion;
}>;

export type KnowledgeOperationRequest =
  | KnowledgeRenameOperationRequest
  | KnowledgeMoveOperationRequest;

export type KnowledgeOperationCommitRequest = Readonly<{
  requestHash: string;
}>;

export type KnowledgeOperationPlanItem = Readonly<{
  from: KnowledgeResourceAddress;
  to: KnowledgeResourceAddress;
  expectedVersion: ResourceVersion;
}>;

export type KnowledgeOperationPlan = Readonly<{
  schemaVersion: typeof KNOWLEDGE_OPERATION_PLAN_SCHEMA_VERSION;
  operationId: string;
  requestHash: string;
  kind: KnowledgeOperationRequest["kind"];
  createdAt: string;
  expiresAt: string;
  checkpointRequired: true;
  items: readonly KnowledgeOperationPlanItem[];
  preview: Readonly<{
    resourceChanges: number;
    linkWrites: number;
  }>;
}>;

const REQUEST_FIELDS = new Set([
  "kind",
  "from",
  "to",
  "expectedVersion",
]);
const COMMIT_FIELDS = new Set(["requestHash"]);
const VERSION_FIELDS = new Set([
  "mtimeMs",
  "size",
  "sha256",
  "etag",
  "sequence",
]);
const REQUEST_HASH_PATTERN = /^[a-f0-9]{64}$/;

export function canonicalKnowledgeOperationJson(value: unknown): string {
  return canonicalJson(value, new Set<object>());
}

export function hashKnowledgeOperationRequest(value: unknown): string {
  return createHash("sha256")
    .update(canonicalKnowledgeOperationJson(value), "utf8")
    .digest("hex");
}

export function parseKnowledgeOperationRequest(
  input: unknown,
): KnowledgeOperationRequest {
  const value = plainRecord(input, "operation request");
  rejectUnknownFields(value, REQUEST_FIELDS);
  if (value.kind !== "rename" && value.kind !== "move") {
    throw precondition("operation kind must be rename or move", "kind");
  }
  const from = parseAddress(value.from, "from");
  const to = parseAddress(value.to, "to");
  if (from.sourceKey !== to.sourceKey) {
    throw precondition("operation must stay within one source", "to");
  }
  if (from.relativePath === to.relativePath) {
    throw precondition("operation target must differ from source", "to");
  }
  return Object.freeze({
    kind: value.kind,
    from: Object.freeze(from),
    to: Object.freeze(to),
    expectedVersion: Object.freeze(parseResourceVersion(
      value.expectedVersion,
    )),
  });
}

export function parseKnowledgeOperationCommitRequest(
  input: unknown,
): KnowledgeOperationCommitRequest {
  const value = plainRecord(input, "operation commit request");
  rejectUnknownFields(value, COMMIT_FIELDS);
  if (
    typeof value.requestHash !== "string"
    || !REQUEST_HASH_PATTERN.test(value.requestHash)
  ) {
    throw precondition("requestHash must be a lowercase SHA-256 digest", "requestHash");
  }
  return Object.freeze({ requestHash: value.requestHash });
}

export function assertKnowledgeOperationId(value: unknown): string {
  if (!isOperationCorrelationId(value)) {
    throw precondition("operationId must be a UUIDv4", "operationId");
  }
  return value;
}

export function createKnowledgeOperationId(): string {
  return randomUUID();
}

export function createKnowledgeOperationPlan({
  operationId,
  request,
  now,
  linkWrites = 0,
}: {
  operationId: string;
  request: KnowledgeOperationRequest;
  now: number;
  linkWrites?: number;
}): KnowledgeOperationPlan {
  assertKnowledgeOperationId(operationId);
  if (!Number.isFinite(now)) {
    throw new TypeError("knowledge operation clock must be finite");
  }
  if (!Number.isSafeInteger(linkWrites) || linkWrites < 0) {
    throw new TypeError("knowledge operation linkWrites must be non-negative");
  }
  const requestHash = hashKnowledgeOperationRequest(request);
  return Object.freeze({
    schemaVersion: KNOWLEDGE_OPERATION_PLAN_SCHEMA_VERSION,
    operationId,
    requestHash,
    kind: request.kind,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + KNOWLEDGE_OPERATION_PLAN_TTL_MS).toISOString(),
    checkpointRequired: true,
    items: Object.freeze([Object.freeze({
      from: Object.freeze({ ...request.from }),
      to: Object.freeze({ ...request.to }),
      expectedVersion: Object.freeze({ ...request.expectedVersion }),
    })]),
    preview: Object.freeze({
      resourceChanges: 1,
      linkWrites,
    }),
  });
}

export function isKnowledgeOperationRequestHash(value: unknown): value is string {
  return typeof value === "string" && REQUEST_HASH_PATTERN.test(value);
}

function canonicalJson(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("canonical JSON rejects non-finite numbers");
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (
    typeof value === "undefined"
    || typeof value === "bigint"
    || typeof value === "symbol"
    || typeof value === "function"
  ) {
    throw new TypeError(`canonical JSON rejects ${typeof value}`);
  }
  if (typeof value !== "object") {
    throw new TypeError("canonical JSON rejects non-JSON values");
  }
  if (ancestors.has(value)) {
    throw new TypeError("canonical JSON rejects cyclic values");
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new TypeError("canonical JSON requires plain arrays");
      }
      const keys = Reflect.ownKeys(value);
      const expectedKeys = new Set([
        ...Array.from({ length: value.length }, (_, index) => String(index)),
        "length",
      ]);
      if (
        keys.length !== expectedKeys.size
        || keys.some((key) => typeof key !== "string" || !expectedKeys.has(key))
      ) {
        throw new TypeError("canonical JSON requires dense plain arrays");
      }
      const entries: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (
          !descriptor
          || !descriptor.enumerable
          || !("value" in descriptor)
        ) {
          throw new TypeError("canonical JSON requires array data properties");
        }
        entries.push(canonicalJson(descriptor.value, ancestors));
      }
      return `[${entries.join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("canonical JSON requires a plain object");
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) {
      throw new TypeError("canonical JSON rejects symbol keys");
    }
    const stringKeys = keys as string[];
    for (const key of stringKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor
        || !descriptor.enumerable
        || !("value" in descriptor)
      ) {
        throw new TypeError("canonical JSON requires enumerable data properties");
      }
    }
    stringKeys.sort(compareUnicodeCodePoints);
    return `{${stringKeys.map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      return `${JSON.stringify(key)}:${canonicalJson(descriptor.value, ancestors)}`;
    }).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function compareUnicodeCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (entry) => entry.codePointAt(0)!);
  const rightPoints = Array.from(right, (entry) => entry.codePointAt(0)!);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) {
      return leftPoints[index] - rightPoints[index];
    }
  }
  return leftPoints.length - rightPoints.length;
}

function parseAddress(
  value: unknown,
  field: string,
): KnowledgeResourceAddress {
  const parsed = parseKnowledgeResourceAddress(value);
  if (parsed.ok === false) {
    throw precondition("invalid knowledge operation address", field);
  }
  return { ...parsed.value };
}

function parseResourceVersion(value: unknown): ResourceVersion {
  const record = plainRecord(value, "expectedVersion");
  rejectUnknownFields(record, VERSION_FIELDS);
  const output: ResourceVersion = {};
  if (record.mtimeMs !== undefined) {
    if (
      typeof record.mtimeMs !== "number"
      || !Number.isFinite(record.mtimeMs)
      || record.mtimeMs < 0
    ) {
      throw precondition(
        "invalid expected version",
        "expectedVersion.mtimeMs",
      );
    }
    output.mtimeMs = record.mtimeMs;
  }
  if (record.sequence !== undefined) {
    if (
      !Number.isSafeInteger(record.sequence)
      || (record.sequence as number) < 0
    ) {
      throw precondition(
        "invalid expected version",
        "expectedVersion.sequence",
      );
    }
    output.sequence = record.sequence as number;
  }
  if (record.size !== undefined) {
    if (
      record.size !== null
      && (
        !Number.isSafeInteger(record.size)
        || (record.size as number) < 0
      )
    ) {
      throw precondition("invalid expected version", "expectedVersion.size");
    }
    output.size = record.size as number | null;
  }
  for (const field of ["sha256", "etag"] as const) {
    const candidate = record[field];
    if (candidate !== undefined) {
      if (typeof candidate !== "string" || candidate.length === 0) {
        throw precondition("invalid expected version", `expectedVersion.${field}`);
      }
      output[field] = candidate;
    }
  }
  if (Object.keys(output).length === 0) {
    throw precondition("expectedVersion must not be empty", "expectedVersion");
  }
  return output;
}

function plainRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || (
      Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null
    )
  ) {
    throw precondition(`${label} must be a plain JSON object`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) {
    throw precondition(`${label} contains invalid keys`);
  }
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw precondition(`${label} contains invalid properties`);
    }
  }
  return value as Record<string, unknown>;
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  fields: ReadonlySet<string>,
): void {
  for (const field of Object.keys(value)) {
    if (!fields.has(field)) {
      throw precondition("unexpected knowledge operation field", field);
    }
  }
}

function precondition(message: string, field?: string) {
  return createKnowledgeWorkspaceError(
    "knowledge_operation_precondition_failed",
    message,
    field ? { field } : undefined,
  );
}
