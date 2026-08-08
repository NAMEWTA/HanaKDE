import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
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
import {
  parseKnowledgeResourceAddress,
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

export const KNOWLEDGE_TRASH_OPERATION_KINDS = [
  "delete",
  "restore",
  "cleanup",
] as const;

export type KnowledgeTrashOperationKind =
  (typeof KNOWLEDGE_TRASH_OPERATION_KINDS)[number];

export type KnowledgeTrashOperationStepKind =
  | "manifest-write"
  | "resource-move"
  | "parent-mkdir"
  | "link-write"
  | "native-grant"
  | "native-dispatch"
  | "system-trash";

export type KnowledgeTrashOperationStep = Readonly<{
  stepId: string;
  kind: KnowledgeTrashOperationStepKind;
  state: "intent" | "applied" | "rolled-back" | "failed";
  intentAt: string;
  outcomeAt?: string;
  errorCode?: string;
}>;

export type KnowledgeTrashOperationRequestItem = Readonly<{
  entryId: string;
  originalAddress: KnowledgeResourceAddress;
  trashAddress: KnowledgeResourceAddress;
  /**
   * Delete records target the trash address; restore records target the
   * resolved original/suffixed address. Cleanup deliberately has no target.
   */
  targetAddress?: KnowledgeResourceAddress;
  resourceKind: "file" | "directory";
  expectedVersion: ResourceVersion;
}>;

export type KnowledgeTrashOperationRequest = Readonly<{
  kind: KnowledgeTrashOperationKind;
  sourceKey: string;
  batchId: string;
  items: readonly KnowledgeTrashOperationRequestItem[];
}>;

export type KnowledgeTrashOperationJournalItem = Readonly<{
  entryId: string;
  originalAddress: KnowledgeResourceAddress;
  trashAddress: KnowledgeResourceAddress;
  targetAddress?: KnowledgeResourceAddress;
  resourceKind: "file" | "directory";
  expectedVersion: ResourceVersion;
  state: KnowledgeOperationItemState;
  appliedVersion?: ResourceVersion;
  errorCode?: string;
  steps: readonly KnowledgeTrashOperationStep[];
}>;

export type KnowledgeTrashOperationJournalRecord = Readonly<{
  schemaVersion: 1;
  operationId: string;
  requestHash: string;
  kind: KnowledgeTrashOperationKind;
  batchId: string;
  request: KnowledgeTrashOperationRequest;
  owner: KnowledgeOperationOwner;
  requestId: string | null;
  sourceIdentity: ProviderRootIdentity;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  state: KnowledgeOperationState;
  items: readonly KnowledgeTrashOperationJournalItem[];
  projections: Readonly<{
    session: KnowledgeOperationProjectionState;
    event: KnowledgeOperationProjectionState;
    index: KnowledgeOperationProjectionState;
  }>;
  resultWrittenAt?: string;
  recoveryReason?: string;
}>;

export type KnowledgeTrashOperationResultItem = Readonly<{
  entryId: string;
  originalAddress: KnowledgeResourceAddress;
  trashAddress: KnowledgeResourceAddress;
  targetAddress?: KnowledgeResourceAddress;
  resourceKind: "file" | "directory";
  state: KnowledgeOperationItemState;
  errorCode?: string;
}>;

export type KnowledgeTrashOperationResult = Readonly<{
  schemaVersion: 1;
  operationId: string;
  requestHash: string;
  kind: KnowledgeTrashOperationKind;
  sourceKey: string;
  batchId: string;
  state: KnowledgeOperationState;
  completedAt: string;
  items: readonly KnowledgeTrashOperationResultItem[];
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

type PersistedKnowledgeOperationRecord =
  | KnowledgeOperationJournalRecord
  | KnowledgeTrashOperationJournalRecord;

type PersistedKnowledgeOperationResult =
  | KnowledgeOperationResult
  | KnowledgeTrashOperationResult;

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
const TRASH_JOURNAL_FIELDS = new Set([
  "schemaVersion",
  "operationId",
  "requestHash",
  "kind",
  "batchId",
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
const TRASH_REQUEST_FIELDS = new Set([
  "kind",
  "sourceKey",
  "batchId",
  "items",
]);
const TRASH_REQUEST_ITEM_FIELDS = new Set([
  "entryId",
  "originalAddress",
  "trashAddress",
  "targetAddress",
  "resourceKind",
  "expectedVersion",
]);
const TRASH_JOURNAL_ITEM_FIELDS = new Set([
  "entryId",
  "originalAddress",
  "trashAddress",
  "targetAddress",
  "resourceKind",
  "expectedVersion",
  "state",
  "appliedVersion",
  "errorCode",
  "steps",
]);
const TRASH_STEP_FIELDS = new Set([
  "stepId",
  "kind",
  "state",
  "intentAt",
  "outcomeAt",
  "errorCode",
]);
const TRASH_RESULT_FIELDS = new Set([
  "schemaVersion",
  "operationId",
  "requestHash",
  "kind",
  "sourceKey",
  "batchId",
  "state",
  "completedAt",
  "items",
  "summary",
  "projections",
]);
const TRASH_RESULT_ITEM_FIELDS = new Set([
  "entryId",
  "originalAddress",
  "trashAddress",
  "targetAddress",
  "resourceKind",
  "state",
  "errorCode",
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

  createTrashPrepared({
    operationId,
    kind,
    sourceKey,
    batchId,
    items,
    owner,
    requestId = null,
    sourceIdentity,
    createdAt,
    expiresAt,
  }: {
    operationId: string;
    kind: KnowledgeTrashOperationKind;
    sourceKey: string;
    batchId: string;
    items: readonly KnowledgeTrashOperationRequestItem[];
    owner: KnowledgeOperationOwner;
    requestId?: string | null;
    sourceIdentity: ProviderRootIdentity;
    createdAt: string;
    expiresAt: string;
  }): KnowledgeTrashOperationJournalRecord {
    assertKnowledgeOperationId(operationId);
    const request = validateTrashRequest({
      kind,
      sourceKey,
      batchId,
      items: items.map((item) => ({
        entryId: item.entryId,
        originalAddress: item.originalAddress,
        trashAddress: item.trashAddress,
        ...(
          kind === "delete" && item.targetAddress === undefined
            ? { targetAddress: item.trashAddress }
            : item.targetAddress === undefined
            ? {}
            : { targetAddress: item.targetAddress }
        ),
        resourceKind: item.resourceKind,
        expectedVersion: item.expectedVersion,
      })),
    });
    const record = validateTrashRecord({
      schemaVersion: 1,
      operationId,
      requestHash: hashKnowledgeTrashOperationRequest(request),
      kind: request.kind,
      batchId: request.batchId,
      request,
      owner,
      requestId,
      sourceIdentity,
      createdAt,
      expiresAt,
      updatedAt: createdAt,
      state: "PREPARED",
      items: request.items.map((item) => ({
        entryId: item.entryId,
        originalAddress: item.originalAddress,
        trashAddress: item.trashAddress,
        ...(item.targetAddress === undefined
          ? {}
          : { targetAddress: item.targetAddress }),
        resourceKind: item.resourceKind,
        expectedVersion: item.expectedVersion,
        state: "prepared",
        steps: [],
      })),
      projections: {
        session: "pending",
        event: "pending",
        index: "pending",
      },
    });
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
      this.writeTrash(record);
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
    const record = this.#readAny(operationId);
    return isKnowledgeOperationJournalRecord(record) ? record : null;
  }

  readTrash(operationId: string): KnowledgeTrashOperationJournalRecord | null {
    const record = this.#readAny(operationId);
    return isKnowledgeTrashOperationJournalRecord(record) ? record : null;
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

  writeTrash(record: KnowledgeTrashOperationJournalRecord): void {
    const validated = validateTrashRecord(record);
    const operationDir = this.#operationDir(validated.operationId);
    fs.mkdirSync(operationDir, { recursive: true, mode: 0o700 });
    const journalPath = path.join(operationDir, "journal.json");
    const previousPath = path.join(operationDir, "journal.json.prev");
    const serialized = `${JSON.stringify(validated, null, 2)}\n`;
    canonicalKnowledgeOperationJson(validated);
    atomicReplaceWithPrevious(journalPath, previousPath, serialized);
  }

  readResult(
    operationId: string,
    expectedRequestHash?: string,
  ): KnowledgeOperationResult | null {
    const resultPath = path.join(this.#operationDir(operationId), "result.json");
    try {
      const result = validateAnyResult(JSON.parse(fs.readFileSync(resultPath, "utf8")));
      if (
        !isKnowledgeOperationResult(result)
        ||
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

  readTrashResult(
    operationId: string,
    expectedRequestHash?: string,
  ): KnowledgeTrashOperationResult | null {
    const resultPath = path.join(this.#operationDir(operationId), "result.json");
    try {
      const result = validateAnyResult(JSON.parse(fs.readFileSync(resultPath, "utf8")));
      if (
        !isKnowledgeTrashOperationResult(result)
        || result.operationId !== operationId
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

  writeTrashResult(result: KnowledgeTrashOperationResult): void {
    const validated = validateTrashResult(result);
    const operationDir = this.#operationDir(validated.operationId);
    fs.mkdirSync(operationDir, { recursive: true, mode: 0o700 });
    const target = path.join(operationDir, "result.json");
    canonicalKnowledgeOperationJson(validated);
    atomicReplace(target, `${JSON.stringify(validated, null, 2)}\n`);
  }

  list(): KnowledgeOperationJournalRecord[] {
    return this.#listFamily("operation") as KnowledgeOperationJournalRecord[];
  }

  listTrash(): KnowledgeTrashOperationJournalRecord[] {
    return this.#listFamily("trash") as KnowledgeTrashOperationJournalRecord[];
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

  #readAny(operationId: string): PersistedKnowledgeOperationRecord | null {
    const operationDir = this.#operationDir(operationId);
    const currentPath = path.join(operationDir, "journal.json");
    const current = this.#readAnyRecord(currentPath);
    if (current) return current;
    const previous = this.#readAnyRecord(
      path.join(operationDir, "journal.json.prev"),
    );
    if (!previous) return null;
    const recovered = isKnowledgeTrashOperationJournalRecord(previous)
      ? unreadableTrashRecoveryRecord(previous)
      : unreadableOperationRecoveryRecord(previous);
    // Do not rotate the unreadable current over the known-good previous copy.
    // Repair current in place and preserve journal.json.prev as evidence.
    atomicReplace(currentPath, `${JSON.stringify(recovered, null, 2)}\n`);
    return recovered;
  }

  #listFamily(
    target: "operation" | "trash",
  ): PersistedKnowledgeOperationRecord[] {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(this.#root, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const records: PersistedKnowledgeOperationRecord[] = [];
    for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
      const family = this.#recordFamily(entry.name);
      if (family !== null && family !== target) continue;
      let record: PersistedKnowledgeOperationRecord | null;
      try {
        record = target === "trash"
          ? this.readTrash(entry.name)
          : this.read(entry.name);
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

  #recordFamily(operationId: string): "operation" | "trash" | "atomic" | null {
    const operationDir = this.#operationDir(operationId);
    for (const fileName of ["journal.json", "journal.json.prev"]) {
      try {
        const value = JSON.parse(fs.readFileSync(
          path.join(operationDir, fileName),
          "utf8",
        ));
        const family = persistedRecordFamily(value);
        if (family !== null) return family;
      } catch {
        // A valid previous journal can still identify the record family.
      }
    }
    return null;
  }

  #readAnyRecord(filePath: string): PersistedKnowledgeOperationRecord | null {
    try {
      return validateAnyRecord(JSON.parse(fs.readFileSync(filePath, "utf8")));
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
  // The recovery copy is created with mode 0600 immediately above.  Opening
  // it read/write keeps the required fsync valid on hosted NTFS, where Node
  // can reject fsync on an otherwise readable handle with EPERM.
  const handle = fs.openSync(filePath, fs.constants.O_RDWR);
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

export function hashKnowledgeTrashOperationRequest(value: unknown): string {
  const request = validateTrashRequest(value);
  return createHash("sha256")
    .update(canonicalKnowledgeOperationJson(request), "utf8")
    .digest("hex");
}

function validateAnyRecord(value: unknown): PersistedKnowledgeOperationRecord {
  const record = plainRecord(value);
  return isKnowledgeTrashOperationKind(record.kind)
    ? validateTrashRecord(record)
    : validateRecord(record);
}

function validateAnyResult(value: unknown): PersistedKnowledgeOperationResult {
  const result = plainRecord(value);
  return isKnowledgeTrashOperationKind(result.kind)
    ? validateTrashResult(result)
    : validateResult(result);
}

function persistedRecordFamily(
  value: unknown,
): "operation" | "trash" | "atomic" | null {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || !("kind" in value)
  ) {
    return null;
  }
  const kind = (value as { kind?: unknown }).kind;
  if (isKnowledgeTrashOperationKind(kind)) return "trash";
  if (kind === "create" || kind === "copy" || kind === "import") return "atomic";
  return kind === "rename" || kind === "move" ? "operation" : null;
}

function isKnowledgeOperationJournalRecord(
  value: PersistedKnowledgeOperationRecord | null,
): value is KnowledgeOperationJournalRecord {
  return value !== null && !isKnowledgeTrashOperationKind(value.kind);
}

function isKnowledgeTrashOperationJournalRecord(
  value: PersistedKnowledgeOperationRecord | null,
): value is KnowledgeTrashOperationJournalRecord {
  return value !== null && isKnowledgeTrashOperationKind(value.kind);
}

function isKnowledgeOperationResult(
  value: PersistedKnowledgeOperationResult,
): value is KnowledgeOperationResult {
  return !isKnowledgeTrashOperationKind(value.kind);
}

function isKnowledgeTrashOperationResult(
  value: PersistedKnowledgeOperationResult,
): value is KnowledgeTrashOperationResult {
  return isKnowledgeTrashOperationKind(value.kind);
}

function unreadableOperationRecoveryRecord(
  previous: KnowledgeOperationJournalRecord,
): KnowledgeOperationJournalRecord {
  const previousItem = previous.items[0];
  return freezeRecord({
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
}

function unreadableTrashRecoveryRecord(
  previous: KnowledgeTrashOperationJournalRecord,
): KnowledgeTrashOperationJournalRecord {
  return freezeTrashRecord({
    ...previous,
    state: "RECOVERY_REQUIRED",
    recoveryReason: "journal_current_unreadable",
    items: previous.items.map((item) => Object.freeze({
      ...item,
      state: "recovery-required" as const,
      errorCode: item.errorCode ?? "knowledge_operation_precondition_failed",
    })),
  });
}

function validateTrashRecord(
  value: unknown,
): KnowledgeTrashOperationJournalRecord {
  const record = plainRecord(value);
  rejectUnknownFields(record, TRASH_JOURNAL_FIELDS);
  if (
    record.schemaVersion !== 1
    || typeof record.operationId !== "string"
    || !isKnowledgeOperationRequestHash(record.requestHash)
    || !isKnowledgeTrashOperationKind(record.kind)
    || typeof record.batchId !== "string"
    || !isOperationState(record.state)
    || !Array.isArray(record.items)
  ) {
    throw new TypeError("invalid knowledge trash operation journal");
  }
  assertKnowledgeOperationId(record.operationId);
  const request = validateTrashRequest(record.request);
  if (
    record.kind !== request.kind
    || record.batchId !== request.batchId
    || record.requestHash !== hashKnowledgeTrashOperationRequest(request)
  ) {
    throw new TypeError("knowledge trash operation request hash mismatch");
  }
  if (record.items.length !== request.items.length) {
    throw new TypeError("knowledge trash journal item count mismatch");
  }
  const items = record.items.map((item, index) =>
    validateTrashJournalItem(item, request.items[index], request)
  );
  assertTrashStateConsistency(record.state, items);
  const owner = validateOwner(record.owner);
  const sourceIdentity = validateIdentity(record.sourceIdentity);
  const projections = validateProjections(record.projections);
  const createdAt = validIsoDate(record.createdAt);
  const expiresAt = validIsoDate(record.expiresAt);
  const updatedAt = validIsoDate(record.updatedAt);
  if (
    Date.parse(expiresAt) - Date.parse(createdAt) !== 15 * 60 * 1_000
    || Date.parse(updatedAt) < Date.parse(createdAt)
  ) {
    throw new TypeError("invalid knowledge trash operation journal timestamps");
  }
  const requestId = nullableSafeString(record.requestId, 256);
  const resultWrittenAt = record.resultWrittenAt === undefined
    ? undefined
    : validIsoDate(record.resultWrittenAt);
  if (
    resultWrittenAt !== undefined
    && Date.parse(resultWrittenAt) < Date.parse(createdAt)
  ) {
    throw new TypeError("invalid knowledge trash operation result timestamp");
  }
  const recoveryReason = record.recoveryReason === undefined
    ? undefined
    : safeCode(record.recoveryReason);
  const validated: KnowledgeTrashOperationJournalRecord = {
    schemaVersion: 1,
    operationId: record.operationId,
    requestHash: record.requestHash,
    kind: request.kind,
    batchId: request.batchId,
    request,
    owner,
    requestId,
    sourceIdentity,
    createdAt,
    expiresAt,
    updatedAt,
    state: record.state,
    items: Object.freeze(items),
    projections,
    ...(resultWrittenAt ? { resultWrittenAt } : {}),
    ...(recoveryReason ? { recoveryReason } : {}),
  };
  canonicalKnowledgeOperationJson(validated);
  return freezeTrashRecord(validated);
}

function validateTrashRequest(value: unknown): KnowledgeTrashOperationRequest {
  const request = plainRecord(value);
  rejectUnknownFields(request, TRASH_REQUEST_FIELDS);
  if (
    !isKnowledgeTrashOperationKind(request.kind)
    || !Array.isArray(request.items)
    || request.items.length === 0
    || request.items.length > 10_000
  ) {
    throw new TypeError("invalid knowledge trash operation request");
  }
  const sourceKey = validSourceKey(request.sourceKey);
  const batchId = assertKnowledgeOperationId(request.batchId);
  const kind = request.kind as KnowledgeTrashOperationKind;
  const entryIds = new Set<string>();
  const items = request.items.map((item) => {
    const parsed = validateTrashRequestItem(
      item,
      kind,
      batchId,
      sourceKey,
    );
    if (entryIds.has(parsed.entryId)) {
      throw new TypeError("duplicate knowledge trash operation entry");
    }
    entryIds.add(parsed.entryId);
    return parsed;
  });
  return Object.freeze({
    kind,
    sourceKey,
    batchId,
    items: Object.freeze(items),
  });
}

function validateTrashRequestItem(
  value: unknown,
  kind: KnowledgeTrashOperationKind,
  batchId: string,
  sourceKey: string,
): KnowledgeTrashOperationRequestItem {
  const item = plainRecord(value);
  rejectUnknownFields(item, TRASH_REQUEST_ITEM_FIELDS);
  const entryId = assertKnowledgeOperationId(item.entryId);
  const originalAddress = validateJournalAddress(item.originalAddress);
  const trashAddress = validateJournalAddress(item.trashAddress);
  const hasTargetAddress = hasOwn(item, "targetAddress");
  const targetAddress = hasTargetAddress
    ? validateJournalAddress(item.targetAddress)
    : undefined;
  if (
    originalAddress.sourceKey !== sourceKey
    || trashAddress.sourceKey !== sourceKey
    || (targetAddress && targetAddress.sourceKey !== sourceKey)
    || isTrashRelativePath(originalAddress.relativePath)
    || !trashAddress.relativePath.startsWith(`.trash/${batchId}/payload/`)
  ) {
    throw new TypeError("invalid knowledge trash operation addresses");
  }
  if (item.resourceKind !== "file" && item.resourceKind !== "directory") {
    throw new TypeError("invalid knowledge trash operation resource kind");
  }
  const expectedVersion = validateVersion(item.expectedVersion);
  if (
    (kind === "delete" && (
      !targetAddress || !addressesEqual(targetAddress, trashAddress)
    ))
    || (kind === "restore" && (
      !targetAddress || isTrashRelativePath(targetAddress.relativePath)
    ))
    || (kind === "cleanup" && hasTargetAddress)
  ) {
    throw new TypeError("invalid knowledge trash operation target");
  }
  return Object.freeze({
    entryId,
    originalAddress,
    trashAddress,
    ...(targetAddress === undefined ? {} : { targetAddress }),
    resourceKind: item.resourceKind,
    expectedVersion,
  });
}

function validateTrashJournalItem(
  value: unknown,
  expected: KnowledgeTrashOperationRequestItem | undefined,
  request: KnowledgeTrashOperationRequest,
): KnowledgeTrashOperationJournalItem {
  if (!expected) throw new TypeError("knowledge trash journal item is unexpected");
  const item = plainRecord(value);
  rejectUnknownFields(item, TRASH_JOURNAL_ITEM_FIELDS);
  const base = validateTrashRequestItem({
    entryId: item.entryId,
    originalAddress: item.originalAddress,
    trashAddress: item.trashAddress,
    ...(hasOwn(item, "targetAddress")
      ? { targetAddress: item.targetAddress }
      : {}),
    resourceKind: item.resourceKind,
    expectedVersion: item.expectedVersion,
  }, request.kind, request.batchId, request.sourceKey);
  if (
    canonicalKnowledgeOperationJson(base)
    !== canonicalKnowledgeOperationJson(expected)
  ) {
    throw new TypeError("knowledge trash journal item diverges from request");
  }
  if (!isItemState(item.state) || !Array.isArray(item.steps)) {
    throw new TypeError("invalid knowledge trash journal item");
  }
  const steps = item.steps.map(validateTrashStep);
  if (new Set(steps.map((step) => step.stepId)).size !== steps.length) {
    throw new TypeError("duplicate knowledge trash journal step");
  }
  const appliedVersion = item.appliedVersion === undefined
    ? undefined
    : validateVersion(item.appliedVersion);
  const errorCode = item.errorCode === undefined
    ? undefined
    : safeCode(item.errorCode);
  return Object.freeze({
    ...base,
    state: item.state,
    ...(appliedVersion ? { appliedVersion } : {}),
    ...(errorCode ? { errorCode } : {}),
    steps: Object.freeze(steps),
  });
}

function validateTrashStep(value: unknown): KnowledgeTrashOperationStep {
  const step = plainRecord(value);
  rejectUnknownFields(step, TRASH_STEP_FIELDS);
  if (
    ![
      "manifest-write",
      "resource-move",
      "parent-mkdir",
      "link-write",
      "native-grant",
      "native-dispatch",
      "system-trash",
    ].includes(String(step.kind))
    || !["intent", "applied", "rolled-back", "failed"].includes(
      String(step.state),
    )
  ) {
    throw new TypeError("invalid knowledge trash journal step");
  }
  const errorCode = step.errorCode === undefined
    ? undefined
    : safeCode(step.errorCode);
  return Object.freeze({
    stepId: safeString(step.stepId, 128),
    kind: step.kind as KnowledgeTrashOperationStepKind,
    state: step.state as KnowledgeTrashOperationStep["state"],
    intentAt: validIsoDate(step.intentAt),
    ...(step.outcomeAt === undefined
      ? {}
      : { outcomeAt: validIsoDate(step.outcomeAt) }),
    ...(errorCode ? { errorCode } : {}),
  });
}

function validateTrashResult(value: unknown): KnowledgeTrashOperationResult {
  const result = plainRecord(value);
  rejectUnknownFields(result, TRASH_RESULT_FIELDS);
  if (
    result.schemaVersion !== 1
    || typeof result.operationId !== "string"
    || !isKnowledgeOperationRequestHash(result.requestHash)
    || !isKnowledgeTrashOperationKind(result.kind)
    || !isOperationState(result.state)
    || !Array.isArray(result.items)
    || result.items.length === 0
    || ![
      "FINALIZED",
      "ROLLED_BACK",
      "RECOVERY_REQUIRED",
      "FAILED_PERMANENTLY",
    ].includes(result.state)
  ) {
    throw new TypeError("invalid knowledge trash operation result");
  }
  assertKnowledgeOperationId(result.operationId);
  const sourceKey = validSourceKey(result.sourceKey);
  const batchId = assertKnowledgeOperationId(result.batchId);
  const kind = result.kind as KnowledgeTrashOperationKind;
  const entryIds = new Set<string>();
  const items = result.items.map((item) => {
    const parsed = validateTrashResultItem(
      item,
      kind,
      batchId,
      sourceKey,
    );
    if (entryIds.has(parsed.entryId)) {
      throw new TypeError("duplicate knowledge trash result entry");
    }
    entryIds.add(parsed.entryId);
    return parsed;
  });
  assertTrashStateConsistency(result.state, items);
  const summary = validateSummary(result.summary);
  const expectedSummary = summaryForItems(items);
  if (
    summary.succeeded !== expectedSummary.succeeded
    || summary.failed !== expectedSummary.failed
    || summary.rolledBack !== expectedSummary.rolledBack
    || summary.recoveryRequired !== expectedSummary.recoveryRequired
  ) {
    throw new TypeError("knowledge trash operation result summary mismatch");
  }
  const validated: KnowledgeTrashOperationResult = {
    schemaVersion: 1,
    operationId: result.operationId,
    requestHash: result.requestHash,
    kind,
    sourceKey,
    batchId,
    state: result.state,
    completedAt: validIsoDate(result.completedAt),
    items: Object.freeze(items),
    summary,
    projections: validateProjections(result.projections),
  };
  canonicalKnowledgeOperationJson(validated);
  return freezeTrashResult(validated);
}

function validateTrashResultItem(
  value: unknown,
  kind: KnowledgeTrashOperationKind,
  batchId: string,
  sourceKey: string,
): KnowledgeTrashOperationResultItem {
  const item = plainRecord(value);
  rejectUnknownFields(item, TRASH_RESULT_ITEM_FIELDS);
  const entryId = assertKnowledgeOperationId(item.entryId);
  const originalAddress = validateJournalAddress(item.originalAddress);
  const trashAddress = validateJournalAddress(item.trashAddress);
  const hasTargetAddress = hasOwn(item, "targetAddress");
  const targetAddress = hasTargetAddress
    ? validateJournalAddress(item.targetAddress)
    : undefined;
  if (
    originalAddress.sourceKey !== sourceKey
    || trashAddress.sourceKey !== sourceKey
    || (targetAddress && targetAddress.sourceKey !== sourceKey)
    || isTrashRelativePath(originalAddress.relativePath)
    || !trashAddress.relativePath.startsWith(`.trash/${batchId}/payload/`)
    || (kind === "delete" && (
      !targetAddress || !addressesEqual(targetAddress, trashAddress)
    ))
    || (kind === "restore" && (
      !targetAddress || isTrashRelativePath(targetAddress.relativePath)
    ))
    || (kind === "cleanup" && hasTargetAddress)
    || (item.resourceKind !== "file" && item.resourceKind !== "directory")
    || !isItemState(item.state)
  ) {
    throw new TypeError("invalid knowledge trash result item");
  }
  const errorCode = item.errorCode === undefined
    ? undefined
    : safeCode(item.errorCode);
  return Object.freeze({
    entryId,
    originalAddress,
    trashAddress,
    ...(targetAddress === undefined ? {} : { targetAddress }),
    resourceKind: item.resourceKind,
    state: item.state,
    ...(errorCode ? { errorCode } : {}),
  });
}

function assertTrashStateConsistency(
  state: KnowledgeOperationState,
  items: readonly Readonly<{ state: KnowledgeOperationItemState }>[],
): void {
  const itemStates = items.map((item) => item.state);
  const every = (...allowed: KnowledgeOperationItemState[]) =>
    itemStates.every((itemState) => allowed.includes(itemState));
  const some = (...allowed: KnowledgeOperationItemState[]) =>
    itemStates.some((itemState) => allowed.includes(itemState));
  const valid = state === "PLANNED" || state === "PREPARING"
    ? every("pending")
    : state === "PREPARED"
    ? every("prepared")
    : state === "COMMITTING"
    ? every("prepared", "applying", "applied", "failed")
    : state === "COMMITTED" || state === "FINALIZED"
    ? every("applied", "failed")
    : state === "ROLLING_BACK"
    ? every("rolling-back", "rolled-back", "failed")
    : state === "ROLLED_BACK"
    ? every("rolled-back")
    : state === "RECOVERY_REQUIRED"
    ? some("recovery-required")
      && every("prepared", "applying", "applied", "failed", "recovery-required")
    : state === "FAILED_PERMANENTLY"
    ? every("failed", "recovery-required")
    : false;
  if (!valid) {
    throw new TypeError("knowledge trash operation state/item mismatch");
  }
}

function summaryForItems(
  items: readonly Readonly<{ state: KnowledgeOperationItemState }>[],
): KnowledgeTrashOperationResult["summary"] {
  return Object.freeze({
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
  });
}

function validateJournalAddress(value: unknown): KnowledgeResourceAddress {
  const parsed = parseKnowledgeResourceAddress(value);
  if (parsed.ok === false) {
    throw new TypeError("invalid knowledge trash journal address");
  }
  return Object.freeze({ ...parsed.value });
}

function validSourceKey(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,31}$/.test(value)) {
    throw new TypeError("invalid knowledge trash journal source key");
  }
  return value;
}

function isKnowledgeTrashOperationKind(
  value: unknown,
): value is KnowledgeTrashOperationKind {
  return typeof value === "string"
    && (KNOWLEDGE_TRASH_OPERATION_KINDS as readonly string[]).includes(value);
}

function isTrashRelativePath(relativePath: string): boolean {
  return relativePath === ".trash" || relativePath.startsWith(".trash/");
}

function addressesEqual(
  left: KnowledgeResourceAddress,
  right: KnowledgeResourceAddress,
): boolean {
  return left.sourceKey === right.sourceKey
    && left.relativePath === right.relativePath;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function validateRecord(value: unknown): KnowledgeOperationJournalRecord {
  const record = plainRecord(value);
  rejectUnknownFields(record, JOURNAL_FIELDS);
  if (
    record.schemaVersion !== 1
    || typeof record.operationId !== "string"
    || !isKnowledgeOperationRequestHash(record.requestHash)
    || (record.kind !== "rename" && record.kind !== "move")
    || !isOperationState(record.state)
    || !Array.isArray(record.items)
    || record.items.length !== 1
  ) {
    throw new TypeError("invalid knowledge operation journal");
  }
  assertKnowledgeOperationId(record.operationId);
  const request = parseKnowledgeOperationRequest(record.request);
  if (
    record.kind !== request.kind
    || record.requestHash !== hashKnowledgeOperationRequest(request)
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
    kind: request.kind,
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
    || (result.kind !== "rename" && result.kind !== "move")
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
  const kind = result.kind as KnowledgeOperationRequest["kind"];
  assertKnowledgeOperationId(result.operationId);
  const items = result.items.map(item => validateResultItem(item, kind));
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
    kind,
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

function freezeTrashRecord(
  record: KnowledgeTrashOperationJournalRecord,
): KnowledgeTrashOperationJournalRecord {
  return deepFreeze(structuredClone(record));
}

function freezeTrashResult(
  result: KnowledgeTrashOperationResult,
): KnowledgeTrashOperationResult {
  return deepFreeze(structuredClone(result));
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

function validateResultItem(
  value: unknown,
  kind: KnowledgeOperationRequest["kind"],
): KnowledgeOperationResultItem {
  const item = plainRecord(value);
  rejectUnknownFields(item, RESULT_ITEM_FIELDS);
  const fromRequest = parseKnowledgeOperationRequest({
    kind,
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
