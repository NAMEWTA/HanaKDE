import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  assertKnowledgeOperationId,
  canonicalKnowledgeOperationJson,
  isKnowledgeOperationRequestHash,
} from "../../lib/knowledge-workspace/knowledge-operation-plan.ts";
import type {
  ProviderRootIdentity,
  ResourceVersion,
} from "../../lib/resource-io/types.ts";
import {
  parseKnowledgeResourceAddress,
  type KnowledgeResourceAddress,
} from "../../shared/knowledge-workspace-contract.ts";
import type {
  KnowledgeOperationItemState,
  KnowledgeOperationOwner,
  KnowledgeOperationProjectionState,
  KnowledgeOperationState,
} from "./durable-operation-journal.ts";

export const KNOWLEDGE_ATOMIC_OPERATION_KINDS = [
  "create",
  "copy",
  "import",
] as const;

export type KnowledgeAtomicOperationKind =
  (typeof KNOWLEDGE_ATOMIC_OPERATION_KINDS)[number];

export type KnowledgeAtomicOperationDisposition =
  | "apply"
  | "skip"
  | "replace"
  | "merge";

export type KnowledgeAtomicOperationRequestItem = Readonly<{
  itemId: string;
  targetAddress: KnowledgeResourceAddress;
  resourceKind: "file" | "directory";
  disposition: KnowledgeAtomicOperationDisposition;
  expectedTargetVersion: ResourceVersion | null;
  sourceAddress?: KnowledgeResourceAddress;
  sourceToken?: string;
  expectedSourceVersion?: ResourceVersion;
  sourceIdentity?: ProviderRootIdentity;
}>;

export type KnowledgeAtomicOperationRequest = Readonly<{
  kind: KnowledgeAtomicOperationKind;
  sourceKey: string;
  items: readonly KnowledgeAtomicOperationRequestItem[];
}>;

export type KnowledgeAtomicOperationStep = Readonly<{
  stepId: string;
  kind: "resource-create" | "resource-transfer" | "resource-merge" | "resource-replace";
  state: "intent" | "applied" | "failed";
  intentAt: string;
  outcomeAt?: string;
  errorCode?: string;
}>;

export type KnowledgeAtomicOperationJournalItem = KnowledgeAtomicOperationRequestItem & Readonly<{
  state: KnowledgeOperationItemState;
  appliedVersion?: ResourceVersion;
  bytesTransferred?: number;
  errorCode?: string;
  steps: readonly KnowledgeAtomicOperationStep[];
}>;

type AtomicProjections = Readonly<{
  session: KnowledgeOperationProjectionState;
  event: KnowledgeOperationProjectionState;
  index: KnowledgeOperationProjectionState;
}>;

export type KnowledgeAtomicOperationJournalRecord = Readonly<{
  schemaVersion: 1;
  operationId: string;
  requestHash: string;
  kind: KnowledgeAtomicOperationKind;
  request: KnowledgeAtomicOperationRequest;
  owner: KnowledgeOperationOwner;
  requestId: string | null;
  sourceIdentity: ProviderRootIdentity;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  state: KnowledgeOperationState;
  items: readonly KnowledgeAtomicOperationJournalItem[];
  projections: AtomicProjections;
  resultWrittenAt?: string;
  recoveryReason?: string;
}>;

export type KnowledgeAtomicOperationResultItem = Readonly<{
  itemId: string;
  targetAddress: KnowledgeResourceAddress;
  resourceKind: "file" | "directory";
  disposition: KnowledgeAtomicOperationDisposition;
  state: KnowledgeOperationItemState;
  sourceAddress?: KnowledgeResourceAddress;
  bytesTransferred?: number;
  errorCode?: string;
}>;

export type KnowledgeAtomicOperationResult = Readonly<{
  schemaVersion: 1;
  operationId: string;
  requestHash: string;
  kind: KnowledgeAtomicOperationKind;
  sourceKey: string;
  state: KnowledgeOperationState;
  completedAt: string;
  items: readonly KnowledgeAtomicOperationResultItem[];
  summary: Readonly<{
    succeeded: number;
    failed: number;
    rolledBack: number;
    recoveryRequired: number;
  }>;
  projections: AtomicProjections;
}>;

const OPERATIONS_RELATIVE_DIR = path.join("knowledge-workspace", "operations", "v1");
const RECORD_FIELDS = new Set([
  "schemaVersion", "operationId", "requestHash", "kind", "request", "owner",
  "requestId", "sourceIdentity", "createdAt", "expiresAt", "updatedAt", "state",
  "items", "projections", "resultWrittenAt", "recoveryReason",
]);
const REQUEST_FIELDS = new Set(["kind", "sourceKey", "items"]);
const REQUEST_ITEM_FIELDS = new Set([
  "itemId", "targetAddress", "resourceKind", "disposition", "expectedTargetVersion",
  "sourceAddress", "sourceToken", "expectedSourceVersion", "sourceIdentity",
]);
const JOURNAL_ITEM_FIELDS = new Set([
  ...REQUEST_ITEM_FIELDS,
  "state", "appliedVersion", "bytesTransferred", "errorCode", "steps",
]);
const STEP_FIELDS = new Set(["stepId", "kind", "state", "intentAt", "outcomeAt", "errorCode"]);
const OWNER_FIELDS = new Set(["principalId", "userId", "studioId", "sessionId"]);
const IDENTITY_FIELDS = new Set([
  "providerId", "identityNamespace", "opaqueRootId", "scopeToken", "caseMode",
]);
const PROJECTION_FIELDS = new Set(["session", "event", "index"]);
const RESULT_FIELDS = new Set([
  "schemaVersion", "operationId", "requestHash", "kind", "sourceKey", "state",
  "completedAt", "items", "summary", "projections",
]);
const RESULT_ITEM_FIELDS = new Set([
  "itemId", "targetAddress", "resourceKind", "disposition", "state",
  "sourceAddress", "bytesTransferred", "errorCode",
]);
const SUMMARY_FIELDS = new Set(["succeeded", "failed", "rolledBack", "recoveryRequired"]);

export class DurableKnowledgeAtomicOperationJournal {
  readonly #root: string;

  constructor({ hanakoHome }: { hanakoHome: string }) {
    if (typeof hanakoHome !== "string" || !path.isAbsolute(hanakoHome)) {
      throw new TypeError("DurableKnowledgeAtomicOperationJournal requires absolute hanakoHome");
    }
    this.#root = path.join(hanakoHome, OPERATIONS_RELATIVE_DIR);
  }

  createPrepared(input: {
    operationId: string;
    request: KnowledgeAtomicOperationRequest;
    owner: KnowledgeOperationOwner;
    requestId?: string | null;
    sourceIdentity: ProviderRootIdentity;
    createdAt: string;
    expiresAt: string;
  }): KnowledgeAtomicOperationJournalRecord {
    const operationId = assertKnowledgeOperationId(input.operationId);
    const request = validateRequest(input.request);
    const record = validateRecord({
      schemaVersion: 1,
      operationId,
      requestHash: hashKnowledgeAtomicOperationRequest(request),
      kind: request.kind,
      request,
      owner: input.owner,
      requestId: input.requestId ?? null,
      sourceIdentity: input.sourceIdentity,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      updatedAt: input.createdAt,
      state: "PREPARED",
      items: request.items.map((item) => ({ ...item, state: "prepared", steps: [] })),
      projections: { session: "pending", event: "pending", index: "pending" },
    });
    const operationDir = this.#operationDir(operationId);
    fs.mkdirSync(this.#root, { recursive: true, mode: 0o700 });
    try {
      fs.mkdirSync(operationDir, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw Object.assign(new Error("knowledge atomic operation already exists"), {
          name: "KnowledgeOperationJournalAlreadyExistsError",
        });
      }
      throw error;
    }
    try {
      this.write(record);
    } catch (error) {
      try { fs.rmSync(operationDir, { recursive: true, force: true }); } catch {}
      throw error;
    }
    return record;
  }

  read(operationId: string): KnowledgeAtomicOperationJournalRecord | null {
    const operationDir = this.#operationDir(operationId);
    const currentPath = path.join(operationDir, "journal.json");
    const current = readRecord(currentPath);
    if (current) return current;
    const previous = readRecord(path.join(operationDir, "journal.json.prev"));
    if (!previous) return null;
    const recovered = validateRecord({
      ...previous,
      state: "RECOVERY_REQUIRED",
      recoveryReason: "journal_current_unreadable",
      items: previous.items.map((item) => ({
        ...item,
        state: "recovery-required",
        errorCode: item.errorCode ?? "knowledge_operation_precondition_failed",
      })),
    });
    atomicReplace(currentPath, serialize(recovered));
    return recovered;
  }

  write(record: KnowledgeAtomicOperationJournalRecord): void {
    const validated = validateRecord(record);
    const operationDir = this.#operationDir(validated.operationId);
    fs.mkdirSync(operationDir, { recursive: true, mode: 0o700 });
    atomicReplaceWithPrevious(
      path.join(operationDir, "journal.json"),
      path.join(operationDir, "journal.json.prev"),
      serialize(validated),
    );
  }

  list(): KnowledgeAtomicOperationJournalRecord[] {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(this.#root, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const records: KnowledgeAtomicOperationJournalRecord[] = [];
    for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
      if (!isOperationId(entry.name) || !directoryHasAtomicRecord(this.#root, entry.name)) continue;
      const record = this.read(entry.name);
      if (!record) throw new Error(`knowledge atomic operation journal is unreadable: ${entry.name}`);
      records.push(record);
    }
    return records.sort((left, right) => left.operationId.localeCompare(right.operationId));
  }

  readResult(operationId: string, expectedHash?: string): KnowledgeAtomicOperationResult | null {
    try {
      const result = validateResult(JSON.parse(fs.readFileSync(
        path.join(this.#operationDir(operationId), "result.json"),
        "utf8",
      )));
      if (result.operationId !== operationId || (expectedHash && result.requestHash !== expectedHash)) {
        return null;
      }
      return result;
    } catch {
      return null;
    }
  }

  writeResult(result: KnowledgeAtomicOperationResult): void {
    const validated = validateResult(result);
    const operationDir = this.#operationDir(validated.operationId);
    fs.mkdirSync(operationDir, { recursive: true, mode: 0o700 });
    atomicReplace(path.join(operationDir, "result.json"), serialize(validated));
  }

  #operationDir(operationId: string): string {
    return path.join(this.#root, assertKnowledgeOperationId(operationId));
  }
}

export function hashKnowledgeAtomicOperationRequest(value: unknown): string {
  return createHash("sha256")
    .update(canonicalKnowledgeOperationJson(validateRequest(value)), "utf8")
    .digest("hex");
}

function validateRecord(value: unknown): KnowledgeAtomicOperationJournalRecord {
  const record = plainRecord(value);
  rejectUnknown(record, RECORD_FIELDS);
  if (
    record.schemaVersion !== 1
    || typeof record.operationId !== "string"
    || !isKnowledgeOperationRequestHash(record.requestHash)
    || !isAtomicKind(record.kind)
    || !isOperationState(record.state)
    || !Array.isArray(record.items)
  ) throw new TypeError("invalid knowledge atomic operation journal");
  const operationId = assertKnowledgeOperationId(record.operationId);
  const request = validateRequest(record.request);
  if (record.kind !== request.kind || record.requestHash !== hashKnowledgeAtomicOperationRequest(request)) {
    throw new TypeError("knowledge atomic operation request hash mismatch");
  }
  if (record.items.length !== request.items.length) {
    throw new TypeError("knowledge atomic operation item count mismatch");
  }
  const items = record.items.map((item, index) => validateJournalItem(item, request.items[index]));
  assertStateConsistency(record.state, items);
  const createdAt = validIso(record.createdAt);
  const expiresAt = validIso(record.expiresAt);
  const updatedAt = validIso(record.updatedAt);
  if (Date.parse(expiresAt) - Date.parse(createdAt) !== 15 * 60 * 1_000 || Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw new TypeError("invalid knowledge atomic operation timestamps");
  }
  const resultWrittenAt = record.resultWrittenAt === undefined ? undefined : validIso(record.resultWrittenAt);
  const validated: KnowledgeAtomicOperationJournalRecord = {
    schemaVersion: 1,
    operationId,
    requestHash: record.requestHash,
    kind: request.kind,
    request,
    owner: validateOwner(record.owner),
    requestId: nullableString(record.requestId, 256),
    sourceIdentity: validateIdentity(record.sourceIdentity),
    createdAt,
    expiresAt,
    updatedAt,
    state: record.state,
    items: Object.freeze(items),
    projections: validateProjections(record.projections),
    ...(resultWrittenAt ? { resultWrittenAt } : {}),
    ...(record.recoveryReason === undefined ? {} : { recoveryReason: safeCode(record.recoveryReason) }),
  };
  canonicalKnowledgeOperationJson(validated);
  return deepFreeze(structuredClone(validated));
}

function validateRequest(value: unknown): KnowledgeAtomicOperationRequest {
  const request = plainRecord(value);
  rejectUnknown(request, REQUEST_FIELDS);
  if (!isAtomicKind(request.kind) || !Array.isArray(request.items) || request.items.length === 0 || request.items.length > 100_000) {
    throw new TypeError("invalid knowledge atomic operation request");
  }
  const sourceKey = validSourceKey(request.sourceKey);
  const items = request.items.map((item) => validateRequestItem(item, request.kind as KnowledgeAtomicOperationKind, sourceKey));
  if (new Set(items.map((item) => item.itemId)).size !== items.length) {
    throw new TypeError("duplicate knowledge atomic operation item");
  }
  return Object.freeze({ kind: request.kind as KnowledgeAtomicOperationKind, sourceKey, items: Object.freeze(items) });
}

function validateRequestItem(
  value: unknown,
  kind: KnowledgeAtomicOperationKind,
  targetSourceKey: string,
): KnowledgeAtomicOperationRequestItem {
  const item = plainRecord(value);
  rejectUnknown(item, REQUEST_ITEM_FIELDS);
  const itemId = assertKnowledgeOperationId(item.itemId);
  const targetAddress = address(item.targetAddress);
  const resourceKind = item.resourceKind;
  const disposition = item.disposition;
  const sourceAddress = item.sourceAddress === undefined ? undefined : address(item.sourceAddress);
  const sourceToken = item.sourceToken === undefined ? undefined : assertKnowledgeOperationId(item.sourceToken);
  const expectedSourceVersion = item.expectedSourceVersion === undefined ? undefined : version(item.expectedSourceVersion);
  const sourceIdentity = item.sourceIdentity === undefined ? undefined : validateIdentity(item.sourceIdentity);
  const expectedTargetVersion = item.expectedTargetVersion === null ? null : version(item.expectedTargetVersion);
  if (
    targetAddress.sourceKey !== targetSourceKey
    || (resourceKind !== "file" && resourceKind !== "directory")
    || !["apply", "skip", "replace", "merge"].includes(String(disposition))
    || (kind === "create" && (sourceAddress || sourceToken || expectedSourceVersion || sourceIdentity || disposition !== "apply"))
    || (kind === "copy" && (!sourceAddress || sourceToken || !expectedSourceVersion || !sourceIdentity || disposition !== "apply"))
    || (kind === "import" && (sourceAddress || !sourceToken || !expectedSourceVersion))
  ) throw new TypeError("invalid knowledge atomic operation item");
  return Object.freeze({
    itemId,
    targetAddress,
    resourceKind,
    disposition: disposition as KnowledgeAtomicOperationDisposition,
    expectedTargetVersion,
    ...(sourceAddress ? { sourceAddress } : {}),
    ...(sourceToken ? { sourceToken } : {}),
    ...(expectedSourceVersion ? { expectedSourceVersion } : {}),
    ...(sourceIdentity ? { sourceIdentity } : {}),
  });
}

function validateJournalItem(
  value: unknown,
  expected: KnowledgeAtomicOperationRequestItem | undefined,
): KnowledgeAtomicOperationJournalItem {
  if (!expected) throw new TypeError("unexpected knowledge atomic journal item");
  const item = plainRecord(value);
  rejectUnknown(item, JOURNAL_ITEM_FIELDS);
  const base = validateRequestItem(
    Object.fromEntries([...REQUEST_ITEM_FIELDS].filter((key) => key in item).map((key) => [key, item[key]])),
    inferKind(expected),
    expected.targetAddress.sourceKey,
  );
  if (canonicalKnowledgeOperationJson(base) !== canonicalKnowledgeOperationJson(expected)) {
    throw new TypeError("knowledge atomic journal item diverges from request");
  }
  if (!isItemState(item.state) || !Array.isArray(item.steps)) {
    throw new TypeError("invalid knowledge atomic journal item state");
  }
  return Object.freeze({
    ...base,
    state: item.state,
    ...(item.appliedVersion === undefined ? {} : { appliedVersion: version(item.appliedVersion) }),
    ...(item.bytesTransferred === undefined ? {} : { bytesTransferred: nonNegativeInt(item.bytesTransferred) }),
    ...(item.errorCode === undefined ? {} : { errorCode: safeCode(item.errorCode) }),
    steps: Object.freeze(item.steps.map(validateStep)),
  });
}

function inferKind(item: KnowledgeAtomicOperationRequestItem): KnowledgeAtomicOperationKind {
  if (item.sourceAddress) return "copy";
  if (item.sourceToken) return "import";
  return "create";
}

function validateStep(value: unknown): KnowledgeAtomicOperationStep {
  const step = plainRecord(value);
  rejectUnknown(step, STEP_FIELDS);
  if (
    !["resource-create", "resource-transfer", "resource-merge", "resource-replace"].includes(String(step.kind))
    || !["intent", "applied", "failed"].includes(String(step.state))
  ) throw new TypeError("invalid knowledge atomic operation step");
  return Object.freeze({
    stepId: safeString(step.stepId, 128),
    kind: step.kind as KnowledgeAtomicOperationStep["kind"],
    state: step.state as KnowledgeAtomicOperationStep["state"],
    intentAt: validIso(step.intentAt),
    ...(step.outcomeAt === undefined ? {} : { outcomeAt: validIso(step.outcomeAt) }),
    ...(step.errorCode === undefined ? {} : { errorCode: safeCode(step.errorCode) }),
  });
}

function validateResult(value: unknown): KnowledgeAtomicOperationResult {
  const result = plainRecord(value);
  rejectUnknown(result, RESULT_FIELDS);
  if (
    result.schemaVersion !== 1
    || typeof result.operationId !== "string"
    || !isKnowledgeOperationRequestHash(result.requestHash)
    || !isAtomicKind(result.kind)
    || !["FINALIZED", "ROLLED_BACK", "RECOVERY_REQUIRED", "FAILED_PERMANENTLY"].includes(String(result.state))
    || !Array.isArray(result.items)
    || result.items.length === 0
  ) throw new TypeError("invalid knowledge atomic operation result");
  const items = result.items.map(validateResultItem);
  const summary = validateSummary(result.summary);
  const expected = summaryFor(items);
  if (canonicalKnowledgeOperationJson(summary) !== canonicalKnowledgeOperationJson(expected)) {
    throw new TypeError("knowledge atomic operation summary mismatch");
  }
  return deepFreeze({
    schemaVersion: 1,
    operationId: assertKnowledgeOperationId(result.operationId),
    requestHash: result.requestHash,
    kind: result.kind as KnowledgeAtomicOperationKind,
    sourceKey: validSourceKey(result.sourceKey),
    state: result.state as KnowledgeOperationState,
    completedAt: validIso(result.completedAt),
    items: Object.freeze(items),
    summary,
    projections: validateProjections(result.projections),
  });
}

function validateResultItem(value: unknown): KnowledgeAtomicOperationResultItem {
  const item = plainRecord(value);
  rejectUnknown(item, RESULT_ITEM_FIELDS);
  if (
    (item.resourceKind !== "file" && item.resourceKind !== "directory")
    || !["apply", "skip", "replace", "merge"].includes(String(item.disposition))
    || !isItemState(item.state)
  ) throw new TypeError("invalid knowledge atomic operation result item");
  return Object.freeze({
    itemId: assertKnowledgeOperationId(item.itemId),
    targetAddress: address(item.targetAddress),
    resourceKind: item.resourceKind,
    disposition: item.disposition as KnowledgeAtomicOperationDisposition,
    state: item.state,
    ...(item.sourceAddress === undefined ? {} : { sourceAddress: address(item.sourceAddress) }),
    ...(item.bytesTransferred === undefined ? {} : { bytesTransferred: nonNegativeInt(item.bytesTransferred) }),
    ...(item.errorCode === undefined ? {} : { errorCode: safeCode(item.errorCode) }),
  });
}

function summaryFor(items: readonly KnowledgeAtomicOperationResultItem[]) {
  return Object.freeze({
    succeeded: items.filter((item) => item.state === "applied").length,
    failed: items.filter((item) => ["failed", "rolled-back", "recovery-required"].includes(item.state)).length,
    rolledBack: items.filter((item) => item.state === "rolled-back").length,
    recoveryRequired: items.filter((item) => item.state === "recovery-required").length,
  });
}

function validateSummary(value: unknown) {
  const summary = plainRecord(value);
  rejectUnknown(summary, SUMMARY_FIELDS);
  return Object.freeze({
    succeeded: nonNegativeInt(summary.succeeded),
    failed: nonNegativeInt(summary.failed),
    rolledBack: nonNegativeInt(summary.rolledBack),
    recoveryRequired: nonNegativeInt(summary.recoveryRequired),
  });
}

function assertStateConsistency(state: KnowledgeOperationState, items: readonly KnowledgeAtomicOperationJournalItem[]): void {
  const states = items.map((item) => item.state);
  const every = (...allowed: KnowledgeOperationItemState[]) => states.every((item) => allowed.includes(item));
  const valid = state === "PREPARED" ? every("prepared")
    : state === "COMMITTING" ? every("prepared", "applying", "applied", "failed", "recovery-required")
    : state === "COMMITTED" || state === "FINALIZED" ? every("applied", "failed")
    : state === "ROLLING_BACK" ? every("rolling-back", "rolled-back", "failed")
    : state === "ROLLED_BACK" ? every("rolled-back")
    : state === "RECOVERY_REQUIRED" ? states.some((item) => item === "recovery-required")
    : state === "FAILED_PERMANENTLY" ? every("failed", "recovery-required")
    : false;
  if (!valid) throw new TypeError("knowledge atomic operation state/item mismatch");
}

function validateOwner(value: unknown): KnowledgeOperationOwner {
  const owner = plainRecord(value);
  rejectUnknown(owner, OWNER_FIELDS);
  return Object.freeze({
    principalId: safeString(owner.principalId, 256),
    userId: nullableString(owner.userId, 256),
    studioId: safeString(owner.studioId, 256),
    sessionId: nullableString(owner.sessionId, 256),
  });
}

function validateIdentity(value: unknown): ProviderRootIdentity {
  const identity = plainRecord(value);
  rejectUnknown(identity, IDENTITY_FIELDS);
  if (!['sensitive', 'insensitive', 'unknown'].includes(String(identity.caseMode))) {
    throw new TypeError("invalid provider root identity");
  }
  return Object.freeze({
    providerId: safeString(identity.providerId, 128) as ProviderRootIdentity["providerId"],
    identityNamespace: safeString(identity.identityNamespace, 512),
    opaqueRootId: safeString(identity.opaqueRootId, 1_024),
    scopeToken: safeString(identity.scopeToken, 1_024),
    caseMode: identity.caseMode as ProviderRootIdentity["caseMode"],
  });
}

function validateProjections(value: unknown): AtomicProjections {
  const projections = plainRecord(value);
  rejectUnknown(projections, PROJECTION_FIELDS);
  for (const key of PROJECTION_FIELDS) {
    if (!["pending", "applied", "retrying"].includes(String(projections[key]))) {
      throw new TypeError("invalid knowledge atomic operation projection");
    }
  }
  return Object.freeze({
    session: projections.session as KnowledgeOperationProjectionState,
    event: projections.event as KnowledgeOperationProjectionState,
    index: projections.index as KnowledgeOperationProjectionState,
  });
}

function version(value: unknown): ResourceVersion {
  const input = plainRecord(value);
  const allowed = new Set(["etag", "mtimeMs", "size", "sequence", "sha256"]);
  rejectUnknown(input, allowed);
  const output: ResourceVersion = {};
  if (input.etag !== undefined) output.etag = safeString(input.etag, 2_048);
  if (input.sha256 !== undefined) output.sha256 = safeString(input.sha256, 256);
  for (const key of ["mtimeMs", "size", "sequence"] as const) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== "number" || !Number.isFinite(input[key])) throw new TypeError("invalid resource version");
      output[key] = input[key] as number;
    }
  }
  if (Object.keys(output).length === 0) throw new TypeError("empty resource version");
  return Object.freeze(output);
}

function address(value: unknown): KnowledgeResourceAddress {
  const parsed = parseKnowledgeResourceAddress(value);
  if (!parsed.ok) throw new TypeError("invalid knowledge atomic operation address");
  return Object.freeze({ ...parsed.value });
}

function isAtomicKind(value: unknown): value is KnowledgeAtomicOperationKind {
  return typeof value === "string" && (KNOWLEDGE_ATOMIC_OPERATION_KINDS as readonly string[]).includes(value);
}

function isOperationState(value: unknown): value is KnowledgeOperationState {
  return typeof value === "string" && [
    "PLANNED", "PREPARING", "PREPARED", "COMMITTING", "COMMITTED", "FINALIZED",
    "ROLLING_BACK", "ROLLED_BACK", "RECOVERY_REQUIRED", "FAILED_PERMANENTLY",
  ].includes(value);
}

function isItemState(value: unknown): value is KnowledgeOperationItemState {
  return typeof value === "string" && [
    "pending", "prepared", "applying", "applied", "rolling-back", "rolled-back",
    "failed", "recovery-required",
  ].includes(value);
}

function directoryHasAtomicRecord(root: string, operationId: string): boolean {
  for (const name of ["journal.json", "journal.json.prev"]) {
    try {
      const value = JSON.parse(fs.readFileSync(path.join(root, operationId, name), "utf8"));
      if (isAtomicKind(value?.kind)) return true;
    } catch {}
  }
  return false;
}

function readRecord(filePath: string): KnowledgeAtomicOperationJournalRecord | null {
  try { return validateRecord(JSON.parse(fs.readFileSync(filePath, "utf8"))); } catch { return null; }
}

function atomicReplaceWithPrevious(target: string, previous: string, content: string): void {
  const temporary = `${target}.tmp`;
  const previousTemporary = `${previous}.tmp`;
  try {
    writeFsynced(temporary, content);
    if (fs.existsSync(target)) {
      fs.copyFileSync(target, previousTemporary);
      fs.chmodSync(previousTemporary, 0o600);
      fsyncFile(previousTemporary);
      fs.renameSync(previousTemporary, previous);
    }
    fs.renameSync(temporary, target);
    fsyncDirectory(path.dirname(target));
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); fs.rmSync(previousTemporary, { force: true }); } catch {}
    throw error;
  }
}

function atomicReplace(target: string, content: string): void {
  const temporary = `${target}.tmp`;
  try {
    writeFsynced(temporary, content);
    fs.renameSync(temporary, target);
    fsyncDirectory(path.dirname(target));
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch {}
    throw error;
  }
}

function writeFsynced(filePath: string, content: string): void {
  const handle = fs.openSync(filePath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC, 0o600);
  try { fs.writeFileSync(handle, content, "utf8"); fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
}

function fsyncFile(filePath: string): void {
  const handle = fs.openSync(filePath, fs.constants.O_RDWR);
  try { fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
}

function fsyncDirectory(directory: string): void {
  let handle: number | null = null;
  try { handle = fs.openSync(directory, fs.constants.O_RDONLY); fs.fsyncSync(handle); } catch {} finally {
    if (handle !== null) fs.closeSync(handle);
  }
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("expected plain object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError("expected plain object");
  return value as Record<string, unknown>;
}

function rejectUnknown(value: Record<string, unknown>, allowed: Set<string>): void {
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new TypeError("unknown knowledge atomic operation field");
}

function safeString(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || /\p{Cc}/u.test(value)) {
    throw new TypeError("invalid knowledge atomic operation string");
  }
  return value;
}

function nullableString(value: unknown, max: number): string | null {
  return value === null ? null : safeString(value, max);
}

function safeCode(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,127}$/u.test(value)) throw new TypeError("invalid error code");
  return value;
}

function validSourceKey(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,31}$/u.test(value)) throw new TypeError("invalid source key");
  return value;
}

function validIso(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new TypeError("invalid ISO timestamp");
  }
  return value;
}

function nonNegativeInt(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new TypeError("invalid non-negative integer");
  return Number(value);
}

function isOperationId(value: string): boolean {
  try { assertKnowledgeOperationId(value); return true; } catch { return false; }
}

function serialize(value: unknown): string {
  canonicalKnowledgeOperationJson(value);
  return `${JSON.stringify(value, null, 2)}\n`;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}
