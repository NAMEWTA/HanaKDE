import fs from "node:fs";
import path from "node:path";
import {
  assertKnowledgeOperationId,
  canonicalKnowledgeOperationJson,
  hashKnowledgeOperationRequest,
  isKnowledgeOperationRequestHash,
  parseKnowledgeOperationRequest,
  type KnowledgeOperationRequest,
} from "../../lib/knowledge-workspace/knowledge-operation-plan.ts";
import type {
  KnowledgeResourceAddress,
} from "../../shared/knowledge-workspace-contract.ts";
import type {
  ProviderRootIdentity,
  ResourceVersion,
} from "../../lib/resource-io/types.ts";

export const KNOWLEDGE_OPERATION_STATES = [
  "PLANNED",
  "PREPARING",
  "PREPARED",
  "COMMITTING",
  "COMMITTED",
  "FINALIZED",
  "ROLLING_BACK",
  "ROLLED_BACK",
  "RECOVERY_REQUIRED",
  "FAILED_PERMANENTLY",
] as const;

export type KnowledgeOperationState =
  (typeof KNOWLEDGE_OPERATION_STATES)[number];

export type KnowledgeOperationItemState =
  | "pending"
  | "prepared"
  | "applying"
  | "applied"
  | "rolling-back"
  | "rolled-back"
  | "failed"
  | "recovery-required";

export type KnowledgeOperationOwner = Readonly<{
  principalId: string;
  userId: string | null;
  studioId: string;
  sessionId: string | null;
}>;

export type KnowledgeOperationStep = Readonly<{
  stepId: string;
  kind: "checkpoint" | "primary-rename" | "link-write";
  state: "intent" | "applied" | "rolled-back" | "failed";
  intentAt: string;
  outcomeAt?: string;
  errorCode?: string;
}>;

export type KnowledgeOperationJournalItem = Readonly<{
  itemId: string;
  from: KnowledgeResourceAddress;
  to: KnowledgeResourceAddress;
  expectedVersion: ResourceVersion;
  state: KnowledgeOperationItemState;
  checkpointId?: string;
  appliedVersion?: ResourceVersion;
  errorCode?: string;
  rollbackStatus?: "not-required" | "rolled-back" | "failed";
  steps: readonly KnowledgeOperationStep[];
}>;

export type KnowledgeOperationProjectionState =
  | "pending"
  | "applied"
  | "retrying";

export type KnowledgeOperationJournalRecord = Readonly<{
  schemaVersion: 1;
  operationId: string;
  requestHash: string;
  committedRequestHash?: string;
  kind: KnowledgeOperationRequest["kind"];
  request: KnowledgeOperationRequest;
  owner: KnowledgeOperationOwner;
  requestId: string | null;
  sourceIdentity: ProviderRootIdentity;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  state: KnowledgeOperationState;
  items: readonly KnowledgeOperationJournalItem[];
  projections: Readonly<{
    session: KnowledgeOperationProjectionState;
    event: KnowledgeOperationProjectionState;
    index: KnowledgeOperationProjectionState;
  }>;
  resultWrittenAt?: string;
  recoveryReason?: string;
}>;

export type KnowledgeOperationResultItem = Readonly<{
  from: KnowledgeResourceAddress;
  to: KnowledgeResourceAddress;
  state: KnowledgeOperationItemState;
  checkpointId?: string;
  errorCode?: string;
  rollbackStatus?: "not-required" | "rolled-back" | "failed";
}>;

export type KnowledgeOperationResult = Readonly<{
  schemaVersion: 1;
  operationId: string;
  requestHash: string;
  kind: KnowledgeOperationRequest["kind"];
  state: KnowledgeOperationState;
  completedAt: string;
  items: readonly KnowledgeOperationResultItem[];
  summary: Readonly<{
    succeeded: number;
    failed: number;
    rolledBack: number;
    recoveryRequired: number;
  }>;
  projections: Readonly<{
    session: KnowledgeOperationProjectionState;
    event: KnowledgeOperationProjectionState;
    index: KnowledgeOperationProjectionState;
  }>;
}>;

export class KnowledgeOperationJournalAlreadyExistsError extends Error {
  constructor(operationId: string) {
    super(`knowledge operation journal already exists: ${operationId}`);
    this.name = "KnowledgeOperationJournalAlreadyExistsError";
  }
}

const OPERATIONS_RELATIVE_DIR = path.join(
  "knowledge-workspace",
  "operations",
  "v1",
);
const JOURNAL_FIELDS = new Set([
  "schemaVersion",
  "operationId",
  "requestHash",
  "committedRequestHash",
  "kind",
  "request",
  "owner",
  "requestId",
  "sourceIdentity",
  "createdAt",
  "expiresAt",
  "updatedAt",
  "state",
  "items",
  "projections",
  "resultWrittenAt",
  "recoveryReason",
]);
const OWNER_FIELDS = new Set([
  "principalId",
  "userId",
  "studioId",
  "sessionId",
]);
const IDENTITY_FIELDS = new Set([
  "providerId",
  "identityNamespace",
  "opaqueRootId",
  "scopeToken",
  "caseMode",
]);
const ITEM_FIELDS = new Set([
  "itemId",
  "from",
  "to",
  "expectedVersion",
  "state",
  "checkpointId",
  "appliedVersion",
  "errorCode",
  "rollbackStatus",
  "steps",
]);
const STEP_FIELDS = new Set([
  "stepId",
  "kind",
  "state",
  "intentAt",
  "outcomeAt",
  "errorCode",
]);
const PROJECTION_FIELDS = new Set(["session", "event", "index"]);
const RESULT_FIELDS = new Set([
  "schemaVersion",
  "operationId",
  "requestHash",
  "kind",
  "state",
  "completedAt",
  "items",
  "summary",
  "projections",
]);
const RESULT_ITEM_FIELDS = new Set([
  "from",
  "to",
  "state",
  "checkpointId",
  "errorCode",
  "rollbackStatus",
]);
const SUMMARY_FIELDS = new Set([
  "succeeded",
  "failed",
  "rolledBack",
  "recoveryRequired",
]);

export class DurableKnowledgeOperationJournal {
  readonly #root: string;

  constructor({ hanakoHome }: { hanakoHome: string }) {
    if (typeof hanakoHome !== "string" || !path.isAbsolute(hanakoHome)) {
      throw new TypeError("DurableKnowledgeOperationJournal requires absolute hanakoHome");
    }
    this.#root = path.join(hanakoHome, OPERATIONS_RELATIVE_DIR);
  }

  get root(): string {
    return this.#root;
  }

  has(operationId: string): boolean {
    return fs.existsSync(this.#operationDir(operationId));
  }

  createPlanned({
    operationId,
    requestHash,
    request,
    owner,
    requestId = null,
    sourceIdentity,
    createdAt,
    expiresAt,
  }: {
    operationId: string;
    requestHash: string;
    request: KnowledgeOperationRequest;
    owner: KnowledgeOperationOwner;
    requestId?: string | null;
    sourceIdentity: ProviderRootIdentity;
    createdAt: string;
    expiresAt: string;
  }): KnowledgeOperationJournalRecord {
    assertKnowledgeOperationId(operationId);
    if (!isKnowledgeOperationRequestHash(requestHash)) {
      throw new TypeError("knowledge operation requestHash is invalid");
    }
    const record: KnowledgeOperationJournalRecord = {
      schemaVersion: 1,
      operationId,
      requestHash,
      kind: request.kind,
      request: cloneRequest(request),
      owner: Object.freeze({ ...owner }),
      requestId,
      sourceIdentity: Object.freeze({ ...sourceIdentity }),
      createdAt: validIsoDate(createdAt),
      expiresAt: validIsoDate(expiresAt),
      updatedAt: validIsoDate(createdAt),
      state: "PLANNED",
      items: Object.freeze([Object.freeze({
        itemId: "primary",
        from: Object.freeze({ ...request.from }),
        to: Object.freeze({ ...request.to }),
        expectedVersion: Object.freeze({ ...request.expectedVersion }),
        state: "pending",
        steps: Object.freeze([]),
      })]),
      projections: Object.freeze({
        session: "pending",
        event: "pending",
        index: "pending",
      }),
    };
    const operationDir = this.#operationDir(operationId);
    fs.mkdirSync(this.#root, { recursive: true, mode: 0o700 });
    try {
      fs.mkdirSync(operationDir, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new KnowledgeOperationJournalAlreadyExistsError(operationId);
      }
      throw error;
    }
    try {
      this.write(record);
    } catch (error) {
      try {
        fs.rmSync(operationDir, { recursive: true, force: true });
      } catch {
        // Preserve the journal publication failure.
      }
      throw error;
    }
    return record;
  }

  read(operationId: string): KnowledgeOperationJournalRecord | null {
    const operationDir = this.#operationDir(operationId);
    const currentPath = path.join(operationDir, "journal.json");
    const current = this.#readRecord(currentPath);
    if (current) return current;
    const previous = this.#readRecord(
      path.join(operationDir, "journal.json.prev"),
    );
    if (!previous) return null;
    const previousItem = previous.items[0];
    const recovered = freezeRecord({
      ...previous,
      state: "RECOVERY_REQUIRED",
      recoveryReason: "journal_current_unreadable",
      items: [Object.freeze({
        ...previousItem,
        state: "recovery-required",
        rollbackStatus: "failed",
        errorCode: "knowledge_operation_precondition_failed",
      })],
    });
    // Do not rotate the unreadable current over the known-good previous copy.
    // Repair current in place and preserve journal.json.prev as evidence.
    atomicReplace(currentPath, `${JSON.stringify(recovered, null, 2)}\n`);
    return recovered;
  }

  write(record: KnowledgeOperationJournalRecord): void {
    const validated = validateRecord(record);
    const operationDir = this.#operationDir(validated.operationId);
    fs.mkdirSync(operationDir, { recursive: true, mode: 0o700 });
    const journalPath = path.join(operationDir, "journal.json");
    const previousPath = path.join(operationDir, "journal.json.prev");
    const serialized = `${JSON.stringify(validated, null, 2)}\n`;
    // Validate the complete persisted graph as strict JSON data before the
    // first byte reaches disk. This also rejects accessors/custom prototypes.
    canonicalKnowledgeOperationJson(validated);
    atomicReplaceWithPrevious(
      journalPath,
      previousPath,
      serialized,
    );
  }

  readResult(
    operationId: string,
    expectedRequestHash?: string,
  ): KnowledgeOperationResult | null {
    const resultPath = path.join(this.#operationDir(operationId), "result.json");
    try {
      const result = validateResult(JSON.parse(fs.readFileSync(resultPath, "utf8")));
      if (
        result.operationId !== operationId
        || (
          expectedRequestHash !== undefined
          && result.requestHash !== expectedRequestHash
        )
      ) {
        return null;
      }
      return result;
    } catch {
      return null;
    }
  }

  writeResult(result: KnowledgeOperationResult): void {
    const validated = validateResult(result);
    const operationDir = this.#operationDir(validated.operationId);
    fs.mkdirSync(operationDir, { recursive: true, mode: 0o700 });
    const target = path.join(operationDir, "result.json");
    canonicalKnowledgeOperationJson(validated);
    atomicReplace(target, `${JSON.stringify(validated, null, 2)}\n`);
  }

  list(): KnowledgeOperationJournalRecord[] {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(this.#root, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const records: KnowledgeOperationJournalRecord[] = [];
    for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
      let record: KnowledgeOperationJournalRecord | null;
      try {
        record = this.read(entry.name);
      } catch (error) {
        throw new Error(
          `knowledge operation journal directory is invalid: ${entry.name}`,
          { cause: error },
        );
      }
      if (!record) {
        throw new Error(
          `knowledge operation journal is unreadable: ${entry.name}`,
        );
      }
      records.push(record);
    }
    return records.sort((left, right) =>
      left.operationId.localeCompare(right.operationId)
    );
  }

  remove(operationId: string): void {
    fs.rmSync(this.#operationDir(operationId), {
      recursive: true,
      force: true,
    });
  }

  #operationDir(operationId: string): string {
    return path.join(this.#root, assertKnowledgeOperationId(operationId));
  }

  #readRecord(filePath: string): KnowledgeOperationJournalRecord | null {
    try {
      return validateRecord(JSON.parse(fs.readFileSync(filePath, "utf8")));
    } catch {
      return null;
    }
  }
}

function atomicReplaceWithPrevious(
  target: string,
  previous: string,
  content: string,
): void {
  const temporary = `${target}.tmp`;
  const previousTemporary = `${previous}.tmp`;
  try {
    writeFsyncedFile(temporary, content);
    if (fs.existsSync(target)) {
      fs.copyFileSync(target, previousTemporary);
      fs.chmodSync(previousTemporary, 0o600);
      fsyncFile(previousTemporary);
      fs.renameSync(previousTemporary, previous);
    }
    fs.renameSync(temporary, target);
    fsyncDirectory(path.dirname(target));
  } catch (error) {
    try {
      fs.rmSync(temporary, { force: true });
      fs.rmSync(previousTemporary, { force: true });
    } catch {
      // Retain the original error. Published journal files remain untouched.
    }
    throw error;
  }
}

function atomicReplace(target: string, content: string): void {
  const temporary = `${target}.tmp`;
  try {
    writeFsyncedFile(temporary, content);
    fs.renameSync(temporary, target);
    fsyncDirectory(path.dirname(target));
  } catch (error) {
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      // Retain the original error.
    }
    throw error;
  }
}

function writeFsyncedFile(filePath: string, content: string): void {
  const handle = fs.openSync(
    filePath,
    fs.constants.O_WRONLY
      | fs.constants.O_CREAT
      | fs.constants.O_TRUNC,
    0o600,
  );
  try {
    fs.writeFileSync(handle, content, "utf8");
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
}

function fsyncFile(filePath: string): void {
  const handle = fs.openSync(filePath, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
}

function fsyncDirectory(directory: string): void {
  let handle: number | null = null;
  try {
    handle = fs.openSync(directory, fs.constants.O_RDONLY);
    fs.fsyncSync(handle);
  } catch {
    // Some Windows/filesystem combinations reject directory fsync. The file
    // itself was fsynced before rename, so preserve portability as best effort.
  } finally {
    if (handle !== null) fs.closeSync(handle);
  }
}

function validateRecord(value: unknown): KnowledgeOperationJournalRecord {
  const record = plainRecord(value);
  rejectUnknownFields(record, JOURNAL_FIELDS);
  if (
    record.schemaVersion !== 1
    || typeof record.operationId !== "string"
    || !isKnowledgeOperationRequestHash(record.requestHash)
    || record.kind !== "rename"
    || !isOperationState(record.state)
    || !Array.isArray(record.items)
    || record.items.length !== 1
  ) {
    throw new TypeError("invalid knowledge operation journal");
  }
  assertKnowledgeOperationId(record.operationId);
  const request = parseKnowledgeOperationRequest(record.request);
  if (
    record.requestHash !== hashKnowledgeOperationRequest(request)
    || (
      record.committedRequestHash !== undefined
      && (
        !isKnowledgeOperationRequestHash(record.committedRequestHash)
        || record.committedRequestHash !== record.requestHash
      )
    )
  ) {
    throw new TypeError("knowledge operation request hash mismatch");
  }
  const owner = validateOwner(record.owner);
  const sourceIdentity = validateIdentity(record.sourceIdentity);
  const item = validateJournalItem(record.items[0], request);
  assertJournalStateConsistency(record.state, item.state);
  const projections = validateProjections(record.projections);
  const createdAt = validIsoDate(record.createdAt);
  const expiresAt = validIsoDate(record.expiresAt);
  const updatedAt = validIsoDate(record.updatedAt);
  if (
    Date.parse(expiresAt) - Date.parse(createdAt) !== 15 * 60 * 1_000
    || Date.parse(updatedAt) < Date.parse(createdAt)
  ) {
    throw new TypeError("invalid knowledge operation journal timestamps");
  }
  const requestId = nullableSafeString(record.requestId, 256);
  const resultWrittenAt = record.resultWrittenAt === undefined
    ? undefined
    : validIsoDate(record.resultWrittenAt);
  if (
    resultWrittenAt !== undefined
    && Date.parse(resultWrittenAt) < Date.parse(createdAt)
  ) {
    throw new TypeError("invalid knowledge operation result timestamp");
  }
  const recoveryReason = record.recoveryReason === undefined
    ? undefined
    : safeCode(record.recoveryReason);
  const committedRequestHash = record.committedRequestHash === undefined
    ? undefined
    : String(record.committedRequestHash);
  const validated: KnowledgeOperationJournalRecord = {
    schemaVersion: 1,
    operationId: record.operationId,
    requestHash: record.requestHash,
    ...(committedRequestHash
      ? { committedRequestHash }
      : {}),
    kind: "rename",
    request,
    owner,
    requestId,
    sourceIdentity,
    createdAt,
    expiresAt,
    updatedAt,
    state: record.state,
    items: Object.freeze([item]),
    projections,
    ...(resultWrittenAt ? { resultWrittenAt } : {}),
    ...(recoveryReason ? { recoveryReason } : {}),
  };
  canonicalKnowledgeOperationJson(validated);
  return freezeRecord(validated);
}

function validateResult(value: unknown): KnowledgeOperationResult {
  const result = plainRecord(value);
  rejectUnknownFields(result, RESULT_FIELDS);
  if (
    result.schemaVersion !== 1
    || typeof result.operationId !== "string"
    || !isKnowledgeOperationRequestHash(result.requestHash)
    || result.kind !== "rename"
    || !isOperationState(result.state)
    || !Array.isArray(result.items)
    || result.items.length !== 1
    || ![
      "FINALIZED",
      "ROLLED_BACK",
      "RECOVERY_REQUIRED",
      "FAILED_PERMANENTLY",
    ].includes(result.state)
  ) {
    throw new TypeError("invalid knowledge operation result");
  }
  assertKnowledgeOperationId(result.operationId);
  const items = result.items.map(validateResultItem);
  assertJournalStateConsistency(result.state, items[0].state);
  const summary = validateSummary(result.summary);
  const expectedSummary = {
    succeeded: items.filter((item) => item.state === "applied").length,
    failed: items.filter((item) =>
      item.state === "failed"
      || item.state === "rolled-back"
      || item.state === "recovery-required"
    ).length,
    rolledBack: items.filter((item) => item.state === "rolled-back").length,
    recoveryRequired: items.filter((item) =>
      item.state === "recovery-required"
    ).length,
  };
  if (
    summary.succeeded !== expectedSummary.succeeded
    || summary.failed !== expectedSummary.failed
    || summary.rolledBack !== expectedSummary.rolledBack
    || summary.recoveryRequired !== expectedSummary.recoveryRequired
  ) {
    throw new TypeError("knowledge operation result summary mismatch");
  }
  const projections = validateProjections(result.projections);
  const validated: KnowledgeOperationResult = {
    schemaVersion: 1,
    operationId: result.operationId,
    requestHash: result.requestHash,
    kind: "rename",
    state: result.state,
    completedAt: validIsoDate(result.completedAt),
    items: Object.freeze(items),
    summary,
    projections,
  };
  canonicalKnowledgeOperationJson(validated);
  return deepFreeze(validated);
}

function freezeRecord(
  record: KnowledgeOperationJournalRecord,
): KnowledgeOperationJournalRecord {
  return deepFreeze(structuredClone(record));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}

function cloneRequest(
  request: KnowledgeOperationRequest,
): KnowledgeOperationRequest {
  return Object.freeze({
    kind: request.kind,
    from: Object.freeze({ ...request.from }),
    to: Object.freeze({ ...request.to }),
    expectedVersion: Object.freeze({ ...request.expectedVersion }),
  });
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || (
      Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null
    )
  ) {
    throw new TypeError("expected plain JSON object");
  }
  return value as Record<string, unknown>;
}

function validateOwner(value: unknown): KnowledgeOperationOwner {
  const owner = plainRecord(value);
  rejectUnknownFields(owner, OWNER_FIELDS);
  return Object.freeze({
    principalId: safeString(owner.principalId, 256),
    userId: nullableSafeString(owner.userId, 256),
    studioId: safeString(owner.studioId, 256),
    sessionId: nullableSafeString(owner.sessionId, 256),
  });
}

function validateIdentity(value: unknown): ProviderRootIdentity {
  const identity = plainRecord(value);
  rejectUnknownFields(identity, IDENTITY_FIELDS);
  if (
    identity.caseMode !== "sensitive"
    && identity.caseMode !== "insensitive"
    && identity.caseMode !== "unknown"
  ) {
    throw new TypeError("invalid provider root case mode");
  }
  return Object.freeze({
    providerId: safeString(identity.providerId, 128) as ProviderRootIdentity["providerId"],
    identityNamespace: safeString(identity.identityNamespace, 512),
    opaqueRootId: safeString(identity.opaqueRootId, 1_024),
    scopeToken: safeString(identity.scopeToken, 1_024),
    caseMode: identity.caseMode,
  });
}

function validateJournalItem(
  value: unknown,
  request: KnowledgeOperationRequest,
): KnowledgeOperationJournalItem {
  const item = plainRecord(value);
  rejectUnknownFields(item, ITEM_FIELDS);
  if (
    item.itemId !== "primary"
    || !isItemState(item.state)
    || !Array.isArray(item.steps)
  ) {
    throw new TypeError("invalid knowledge operation journal item");
  }
  const candidateRequest = parseKnowledgeOperationRequest({
    kind: request.kind,
    from: item.from,
    to: item.to,
    expectedVersion: item.expectedVersion,
  });
  if (
    canonicalKnowledgeOperationJson(candidateRequest)
    !== canonicalKnowledgeOperationJson(request)
  ) {
    throw new TypeError("knowledge operation item diverges from request");
  }
  const checkpointId = item.checkpointId === undefined
    ? undefined
    : safeString(item.checkpointId, 256);
  const errorCode = item.errorCode === undefined
    ? undefined
    : safeCode(item.errorCode);
  const rollbackStatus = item.rollbackStatus === undefined
    ? undefined
    : validateRollbackStatus(item.rollbackStatus);
  return Object.freeze({
    itemId: "primary",
    from: request.from,
    to: request.to,
    expectedVersion: request.expectedVersion,
    state: item.state,
    ...(checkpointId ? { checkpointId } : {}),
    ...(item.appliedVersion === undefined
      ? {}
      : { appliedVersion: validateVersion(item.appliedVersion) }),
    ...(errorCode ? { errorCode } : {}),
    ...(rollbackStatus ? { rollbackStatus } : {}),
    steps: Object.freeze(item.steps.map(validateStep)),
  });
}

function validateStep(value: unknown): KnowledgeOperationStep {
  const entry = plainRecord(value);
  rejectUnknownFields(entry, STEP_FIELDS);
  if (
    !["checkpoint", "primary-rename", "link-write"].includes(
      String(entry.kind),
    )
    || !["intent", "applied", "rolled-back", "failed"].includes(
      String(entry.state),
    )
  ) {
    throw new TypeError("invalid knowledge operation step");
  }
  return Object.freeze({
    stepId: safeString(entry.stepId, 128),
    kind: entry.kind as KnowledgeOperationStep["kind"],
    state: entry.state as KnowledgeOperationStep["state"],
    intentAt: validIsoDate(entry.intentAt),
    ...(entry.outcomeAt === undefined
      ? {}
      : { outcomeAt: validIsoDate(entry.outcomeAt) }),
    ...(entry.errorCode === undefined
      ? {}
      : { errorCode: safeCode(entry.errorCode) }),
  });
}

function validateResultItem(value: unknown): KnowledgeOperationResultItem {
  const item = plainRecord(value);
  rejectUnknownFields(item, RESULT_ITEM_FIELDS);
  const fromRequest = parseKnowledgeOperationRequest({
    kind: "rename",
    from: item.from,
    to: item.to,
    expectedVersion: { sequence: 0 },
  });
  if (!isItemState(item.state)) {
    throw new TypeError("invalid knowledge operation result item state");
  }
  return Object.freeze({
    from: fromRequest.from,
    to: fromRequest.to,
    state: item.state,
    ...(item.checkpointId === undefined
      ? {}
      : { checkpointId: safeString(item.checkpointId, 256) }),
    ...(item.errorCode === undefined
      ? {}
      : { errorCode: safeCode(item.errorCode) }),
    ...(item.rollbackStatus === undefined
      ? {}
      : { rollbackStatus: validateRollbackStatus(item.rollbackStatus) }),
  });
}

function validateSummary(value: unknown): KnowledgeOperationResult["summary"] {
  const summary = plainRecord(value);
  rejectUnknownFields(summary, SUMMARY_FIELDS);
  return Object.freeze({
    succeeded: nonNegativeInteger(summary.succeeded),
    failed: nonNegativeInteger(summary.failed),
    rolledBack: nonNegativeInteger(summary.rolledBack),
    recoveryRequired: nonNegativeInteger(summary.recoveryRequired),
  });
}

function validateProjections(
  value: unknown,
): KnowledgeOperationJournalRecord["projections"] {
  const projections = plainRecord(value);
  rejectUnknownFields(projections, PROJECTION_FIELDS);
  return Object.freeze({
    session: projectionState(projections.session),
    event: projectionState(projections.event),
    index: projectionState(projections.index),
  });
}

function validateVersion(value: unknown): ResourceVersion {
  const version = plainRecord(value);
  const allowed = new Set(["mtimeMs", "size", "sha256", "etag", "sequence"]);
  rejectUnknownFields(version, allowed);
  const output: ResourceVersion = {};
  if (version.mtimeMs !== undefined) {
    if (
      typeof version.mtimeMs !== "number"
      || !Number.isFinite(version.mtimeMs)
      || version.mtimeMs < 0
    ) {
      throw new TypeError("invalid resource version");
    }
    output.mtimeMs = version.mtimeMs;
  }
  if (version.sequence !== undefined) {
    if (
      !Number.isSafeInteger(version.sequence)
      || (version.sequence as number) < 0
    ) {
      throw new TypeError("invalid resource version");
    }
    output.sequence = version.sequence as number;
  }
  if (version.size !== undefined) {
    if (
      version.size !== null
      && (
        !Number.isSafeInteger(version.size)
        || (version.size as number) < 0
      )
    ) {
      throw new TypeError("invalid resource version");
    }
    output.size = version.size as number | null;
  }
  for (const field of ["sha256", "etag"] as const) {
    if (version[field] !== undefined) {
      output[field] = safeString(version[field], 1_024);
    }
  }
  if (Object.keys(output).length === 0) {
    throw new TypeError("empty resource version");
  }
  return Object.freeze(output);
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): void {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      throw new TypeError(`unexpected journal field: ${field}`);
    }
  }
}

function safeString(value: unknown, maxLength: number): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maxLength
    || /\p{Cc}/u.test(value)
  ) {
    throw new TypeError("invalid journal string");
  }
  return value;
}

function nullableSafeString(
  value: unknown,
  maxLength: number,
): string | null {
  return value === null ? null : safeString(value, maxLength);
}

function safeCode(value: unknown): string {
  if (
    typeof value !== "string"
    || !/^[a-z][a-z0-9_]{0,63}$/.test(value)
  ) {
    throw new TypeError("invalid journal error code");
  }
  return value;
}

function nonNegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError("invalid result count");
  }
  return value as number;
}

function projectionState(value: unknown): KnowledgeOperationProjectionState {
  if (!["pending", "applied", "retrying"].includes(String(value))) {
    throw new TypeError("invalid projection state");
  }
  return value as KnowledgeOperationProjectionState;
}

function validateRollbackStatus(
  value: unknown,
): "not-required" | "rolled-back" | "failed" {
  if (!["not-required", "rolled-back", "failed"].includes(String(value))) {
    throw new TypeError("invalid rollback status");
  }
  return value as "not-required" | "rolled-back" | "failed";
}

function isItemState(value: unknown): value is KnowledgeOperationItemState {
  return [
    "pending",
    "prepared",
    "applying",
    "applied",
    "rolling-back",
    "rolled-back",
    "failed",
    "recovery-required",
  ].includes(String(value));
}

function assertJournalStateConsistency(
  state: KnowledgeOperationState,
  itemState: KnowledgeOperationItemState,
): void {
  const allowed: Record<
    KnowledgeOperationState,
    readonly KnowledgeOperationItemState[]
  > = {
    PLANNED: ["pending"],
    PREPARING: ["pending"],
    PREPARED: ["prepared"],
    COMMITTING: ["applying", "applied"],
    COMMITTED: ["applied"],
    FINALIZED: ["applied"],
    ROLLING_BACK: ["rolling-back"],
    ROLLED_BACK: ["rolled-back"],
    RECOVERY_REQUIRED: ["recovery-required"],
    FAILED_PERMANENTLY: ["failed", "recovery-required"],
  };
  if (!allowed[state].includes(itemState)) {
    throw new TypeError(
      `knowledge operation state/item mismatch: ${state}/${itemState}`,
    );
  }
}

function validIsoDate(value: unknown): string {
  if (
    typeof value !== "string"
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value
  ) {
    throw new TypeError("invalid ISO timestamp");
  }
  return value;
}

function isOperationState(value: unknown): value is KnowledgeOperationState {
  return typeof value === "string"
    && (KNOWLEDGE_OPERATION_STATES as readonly string[]).includes(value);
}
