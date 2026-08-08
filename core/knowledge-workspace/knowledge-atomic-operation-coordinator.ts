import {
  assertKnowledgeOperationId,
  createKnowledgeOperationId,
  isKnowledgeOperationRequestHash,
} from "../../lib/knowledge-workspace/knowledge-operation-plan.ts";
import type {
  ProviderRootIdentity,
  ResourceOperationContext,
  ResourceRef,
  ResourceStat,
  ResourceVersion,
} from "../../lib/resource-io/types.ts";
import type {
  KnowledgeResourceAddress,
  KnowledgeSourceDto,
} from "../../shared/knowledge-workspace-contract.ts";
import {
  createKnowledgeWorkspaceError,
  normalizeKnowledgeErrorCode,
} from "../../shared/knowledge-workspace-errors.ts";
import {
  DurableKnowledgeAtomicOperationJournal,
  type KnowledgeAtomicOperationJournalItem,
  type KnowledgeAtomicOperationJournalRecord,
  type KnowledgeAtomicOperationRequest,
  type KnowledgeAtomicOperationRequestItem,
  type KnowledgeAtomicOperationResult,
  type KnowledgeAtomicOperationStep,
} from "./durable-atomic-operation-journal.ts";
import type {
  KnowledgeOperationItemState,
  KnowledgeOperationOwner,
} from "./durable-operation-journal.ts";
import { KnowledgeAddressLockManager } from "./knowledge-operation-coordinator.ts";

type SourceRegistrySurface = {
  get(sourceKey: string): KnowledgeSourceDto | null;
  revalidate(sourceKey: string): Promise<void>;
  resolveAddress(address: KnowledgeResourceAddress): Promise<ResourceRef>;
  rootIdentity(sourceKey: string): ProviderRootIdentity | Promise<ProviderRootIdentity>;
};

type ResourceIoSurface = {
  stat(ref: ResourceRef, context?: ResourceOperationContext): Promise<ResourceStat>;
  recoverTransferPublication?(
    input: Readonly<{
      target: ResourceRef;
      operationId: string;
      expectedTargetVersion: ResourceVersion;
    }>,
    context?: ResourceOperationContext,
  ): Promise<Readonly<{
    outcome: "none" | "committed" | "rolled-back";
    version?: ResourceVersion;
  }>>;
};

export type KnowledgeAtomicOperationExecutionResult = Readonly<{
  version?: ResourceVersion;
  bytesTransferred?: number;
}>;

type AtomicExecutor = (
  item: KnowledgeAtomicOperationRequestItem,
  index: number,
  context: ResourceOperationContext & { signal?: AbortSignal },
) => Promise<KnowledgeAtomicOperationExecutionResult>;

export type KnowledgeAtomicOperationPlan = Readonly<{
  schemaVersion: 1;
  operationId: string;
  requestHash: string;
  kind: KnowledgeAtomicOperationRequest["kind"];
  sourceKey: string;
  createdAt: string;
  expiresAt: string;
  checkpointRequired: false;
  items: readonly KnowledgeAtomicOperationRequestItem[];
  preview: Readonly<{ resourceChanges: number; linkWrites: 0 }>;
}>;

export type KnowledgeAtomicOperationRecoveryReport = Readonly<{
  scanned: number;
  finalized: number;
  rolledBack: number;
  recoveryRequired: number;
}>;

export class KnowledgeAtomicOperationCoordinator {
  readonly #sourceRegistry: SourceRegistrySurface;
  readonly #resourceIO: ResourceIoSurface;
  readonly #journal: DurableKnowledgeAtomicOperationJournal;
  readonly #locks: KnowledgeAddressLockManager;
  readonly #now: () => number;
  readonly #randomUUID: () => string;
  readonly #faultInjector: (point: string, details: Readonly<{ operationId: string; index?: number }>) => void | Promise<void>;
  readonly #executors = new Map<string, AtomicExecutor>();
  readonly #operationTails = new Map<string, Promise<unknown>>();
  readonly #recoveringSources = new Set<string>();
  #recoveryPromise: Promise<KnowledgeAtomicOperationRecoveryReport> | null = null;

  constructor(input: {
    hanakoHome: string;
    sourceRegistry: SourceRegistrySurface;
    resourceIO: ResourceIoSurface;
    journal?: DurableKnowledgeAtomicOperationJournal;
    locks?: KnowledgeAddressLockManager;
    now?: () => number;
    randomUUID?: () => string;
    faultInjector?: (point: string, details: Readonly<{ operationId: string; index?: number }>) => void | Promise<void>;
  }) {
    this.#sourceRegistry = input.sourceRegistry;
    this.#resourceIO = input.resourceIO;
    this.#journal = input.journal ?? new DurableKnowledgeAtomicOperationJournal({ hanakoHome: input.hanakoHome });
    this.#locks = input.locks ?? new KnowledgeAddressLockManager();
    this.#now = input.now ?? Date.now;
    this.#randomUUID = input.randomUUID ?? createKnowledgeOperationId;
    this.#faultInjector = input.faultInjector ?? (() => {});
  }

  owns(operationId: string): boolean {
    try { return this.#journal.read(operationId) !== null; } catch { return false; }
  }

  isSourceRecovering(sourceKey: string): boolean {
    return this.#recoveringSources.has(sourceKey);
  }

  recover(): Promise<KnowledgeAtomicOperationRecoveryReport> {
    if (!this.#recoveryPromise) this.#recoveryPromise = this.#runRecovery();
    return this.#recoveryPromise;
  }

  async plan(
    request: KnowledgeAtomicOperationRequest,
    executor: AtomicExecutor,
    context: ResourceOperationContext = {},
  ): Promise<KnowledgeAtomicOperationPlan> {
    await this.recover();
    await this.#assertSourceMutable(request.sourceKey);
    const createdAt = this.#timestamp();
    let lastCollision: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const operationId = this.#randomUUID();
      try {
        const record = this.#journal.createPrepared({
          operationId,
          request,
          owner: ownerFromContext(context),
          requestId: stringOrNull(context.requestId),
          sourceIdentity: await this.#sourceRegistry.rootIdentity(request.sourceKey),
          createdAt,
          expiresAt: new Date(Date.parse(createdAt) + 15 * 60 * 1_000).toISOString(),
        });
        this.#executors.set(operationId, executor);
        return planFromRecord(record);
      } catch (error) {
        if ((error as Error)?.name !== "KnowledgeOperationJournalAlreadyExistsError") throw error;
        lastCollision = error;
      }
    }
    throw createKnowledgeWorkspaceError(
      "operation_id_reused",
      "could not allocate a unique atomic operation id",
      lastCollision ? { state: "uuid_collision" } : undefined,
    );
  }

  async run(
    request: KnowledgeAtomicOperationRequest,
    executor: AtomicExecutor,
    context: ResourceOperationContext & { signal?: AbortSignal } = {},
  ): Promise<KnowledgeAtomicOperationResult> {
    const plan = await this.plan(request, executor, context);
    return this.commit(plan.operationId, { requestHash: plan.requestHash }, context);
  }

  async commit(
    operationIdInput: unknown,
    commitInput: unknown,
    context: ResourceOperationContext & { signal?: AbortSignal } = {},
  ): Promise<KnowledgeAtomicOperationResult> {
    await this.recover();
    const operationId = operationIdString(operationIdInput);
    const requestHash = commitHash(commitInput);
    return this.#serializeOperation(operationId, async () => {
      let record = this.#requireRecord(operationId, context);
      const existing = this.#journal.readResult(operationId, requestHash);
      if (existing) return existing;
      if (record.requestHash !== requestHash) {
        throw createKnowledgeWorkspaceError("operation_id_reused", "atomic operation request hash mismatch");
      }
      if (record.state !== "PREPARED") {
        throw createKnowledgeWorkspaceError("knowledge_operation_precondition_failed", "atomic operation is not prepared");
      }
      if (this.#now() > Date.parse(record.expiresAt)) {
        return this.#cancelPrepared(record, "knowledge_operation_plan_expired");
      }
      const executor = this.#executors.get(operationId);
      if (!executor) {
        throw createKnowledgeWorkspaceError(
          "knowledge_resource_unavailable",
          "atomic operation input is no longer available",
        );
      }
      await this.#assertRecordMutable(record);
      const release = await this.#locks.acquire(lockAddresses(record.request.items));
      try {
        await this.#assertRecordMutable(record);
        record = this.#transition(record, { state: "COMMITTING" });
        for (let index = 0; index < record.items.length; index += 1) {
          const item = record.items[index];
          if (item.state !== "prepared") continue;
          throwIfAborted(context.signal);
          const intentAt = this.#timestamp();
          const applying = updateAt(record.items, index, {
            ...item,
            state: "applying",
            steps: [...item.steps, stepFor(item, "intent", intentAt)],
          });
          record = this.#transition(record, { items: applying });
          try {
            await this.#revalidateItem(item, context);
            const execution = item.disposition === "skip"
              ? { bytesTransferred: 0 }
              : await executor(item, index, { ...context, operationId });
            await this.#faultInjector("after_atomic_item_effect", { operationId, index });
            const target = item.disposition === "skip"
              ? null
              : await this.#resourceIO.stat(
                  await this.#sourceRegistry.resolveAddress(item.targetAddress),
                  context,
                );
            const appliedVersion = execution.version ?? target?.version;
            if (item.disposition !== "skip" && (!target?.exists || !appliedVersion)) {
              throw createKnowledgeWorkspaceError(
                "knowledge_operation_precondition_failed",
                "atomic operation target outcome is unavailable",
              );
            }
            record = this.#transition(record, {
              items: updateAt(record.items, index, {
                ...record.items[index],
                state: "applied",
                ...(appliedVersion ? { appliedVersion } : {}),
                ...(execution.bytesTransferred === undefined ? {} : { bytesTransferred: execution.bytesTransferred }),
                steps: settleLastStep(record.items[index].steps, "applied", this.#timestamp()),
              }),
            });
          } catch (error) {
            if (isCrash(error) || isAbortError(error)) throw error;
            const errorCode = publicCode(error);
            record = this.#transition(record, {
              items: updateAt(record.items, index, {
                ...record.items[index],
                state: "failed",
                errorCode,
                steps: settleLastStep(record.items[index].steps, "failed", this.#timestamp(), errorCode),
              }),
            });
          }
        }
        const finalized = this.#transition(record, {
          state: "FINALIZED",
          projections: appliedProjections(),
        });
        this.#executors.delete(operationId);
        return this.#persistResult(finalized);
      } finally {
        release();
      }
    });
  }

  async cancel(
    operationIdInput: unknown,
    context: ResourceOperationContext = {},
  ): Promise<KnowledgeAtomicOperationResult> {
    await this.recover();
    const operationId = operationIdString(operationIdInput);
    return this.#serializeOperation(operationId, async () => {
      const record = this.#requireRecord(operationId, context);
      const existing = this.#journal.readResult(operationId, record.requestHash);
      if (existing) return existing;
      if (record.state !== "PREPARED") {
        throw createKnowledgeWorkspaceError("knowledge_operation_precondition_failed", "atomic operation cannot be cancelled");
      }
      this.#executors.delete(operationId);
      return this.#cancelPrepared(record, "knowledge_operation_precondition_failed");
    });
  }

  async get(
    operationIdInput: unknown,
    context: ResourceOperationContext = {},
  ): Promise<KnowledgeAtomicOperationResult | KnowledgeAtomicOperationPlan> {
    await this.recover();
    const record = this.#requireRecord(operationIdString(operationIdInput), context);
    return this.#journal.readResult(record.operationId, record.requestHash) ?? planFromRecord(record);
  }

  async #runRecovery(): Promise<KnowledgeAtomicOperationRecoveryReport> {
    const report = { scanned: 0, finalized: 0, rolledBack: 0, recoveryRequired: 0 };
    for (const initial of this.#journal.list()) {
      report.scanned += 1;
      if (!await this.#recordMatchesCurrentSource(initial)) {
        report.recoveryRequired += 1;
        continue;
      }
      let record = initial;
      if (record.state === "FINALIZED" || record.state === "ROLLED_BACK") {
        if (!this.#journal.readResult(record.operationId, record.requestHash)) this.#persistResult(record);
        continue;
      }
      if (record.state === "RECOVERY_REQUIRED" || record.state === "FAILED_PERMANENTLY") {
        this.#recoveringSources.add(record.request.sourceKey);
        report.recoveryRequired += 1;
        continue;
      }
      if (record.state === "PREPARED") {
        if (this.#now() <= Date.parse(record.expiresAt)) continue;
        this.#cancelPrepared(record, "knowledge_operation_plan_expired");
        report.rolledBack += 1;
        continue;
      }
      if (record.state === "COMMITTED") {
        record = this.#transition(record, { state: "FINALIZED", projections: appliedProjections() });
        this.#persistResult(record);
        report.finalized += 1;
        continue;
      }
      if (record.state !== "COMMITTING") {
        this.#markRecoveryRequired(record, "knowledge_operation_precondition_failed");
        report.recoveryRequired += 1;
        continue;
      }
      const recoveredItems: KnowledgeAtomicOperationJournalItem[] = [];
      let ambiguous = false;
      for (const item of record.items) {
        if (item.state === "applied" || item.state === "failed") {
          recoveredItems.push(item);
          continue;
        }
        if (item.state === "prepared") {
          recoveredItems.push({ ...item, state: "failed", errorCode: "knowledge_operation_precondition_failed" });
          continue;
        }
        if (
          item.disposition === "merge"
          && item.expectedTargetVersion
          && this.#resourceIO.recoverTransferPublication
        ) {
          try {
            const targetRef = await this.#sourceRegistry.resolveAddress(item.targetAddress);
            const publication = await this.#resourceIO.recoverTransferPublication({
              target: targetRef,
              operationId: record.operationId,
              expectedTargetVersion: item.expectedTargetVersion,
            }, operationContext(record));
            if (publication.outcome === "committed") {
              const target = await this.#resourceIO.stat(targetRef, operationContext(record));
              if (target.exists && (publication.version || target.version)) {
                recoveredItems.push({
                  ...item,
                  state: "applied",
                  appliedVersion: publication.version ?? target.version!,
                });
                continue;
              }
            } else if (publication.outcome === "rolled-back") {
              recoveredItems.push({
                ...item,
                state: "failed",
                errorCode: "knowledge_operation_precondition_failed",
              });
              continue;
            }
          } catch {
            ambiguous = true;
            recoveredItems.push({
              ...item,
              state: "recovery-required",
              errorCode: "knowledge_operation_precondition_failed",
            });
            continue;
          }
        }
        const target = await this.#resourceIO.stat(
          await this.#sourceRegistry.resolveAddress(item.targetAddress),
          operationContext(record),
        );
        if (item.expectedTargetVersion === null && !target.exists) {
          recoveredItems.push({ ...item, state: "failed", errorCode: "knowledge_operation_precondition_failed" });
          continue;
        }
        if (
          item.expectedTargetVersion !== null
          && target.exists
          && versionsMatch(target.version, item.expectedTargetVersion)
        ) {
          recoveredItems.push({ ...item, state: "failed", errorCode: "knowledge_operation_precondition_failed" });
          continue;
        }
        if (item.appliedVersion && target.exists && versionsMatch(target.version, item.appliedVersion)) {
          recoveredItems.push({ ...item, state: "applied" });
          continue;
        }
        ambiguous = true;
        recoveredItems.push({ ...item, state: "recovery-required", errorCode: "knowledge_operation_precondition_failed" });
      }
      if (ambiguous) {
        this.#markRecoveryRequired(
          this.#transition(record, { items: recoveredItems }),
          "knowledge_operation_precondition_failed",
        );
        report.recoveryRequired += 1;
      } else {
        record = this.#transition(record, {
          state: "FINALIZED",
          items: recoveredItems,
          projections: appliedProjections(),
        });
        this.#persistResult(record);
        report.finalized += 1;
      }
    }
    return Object.freeze(report);
  }

  async #revalidateItem(
    item: KnowledgeAtomicOperationRequestItem,
    context: ResourceOperationContext,
  ): Promise<void> {
    const target = await this.#resourceIO.stat(
      await this.#sourceRegistry.resolveAddress(item.targetAddress),
      context,
    );
    if (!versionsMatch(target.exists ? target.version : null, item.expectedTargetVersion)) {
      throw createKnowledgeWorkspaceError("knowledge_version_conflict", "atomic operation target changed after planning");
    }
    if (item.sourceAddress && item.expectedSourceVersion && item.sourceIdentity) {
      await this.#sourceRegistry.revalidate(item.sourceAddress.sourceKey);
      const currentIdentity = await this.#sourceRegistry.rootIdentity(item.sourceAddress.sourceKey);
      if (!identitiesEqual(currentIdentity, item.sourceIdentity)) {
        throw createKnowledgeWorkspaceError("source_root_identity_unprovable", "atomic operation source identity changed");
      }
      const source = await this.#resourceIO.stat(
        await this.#sourceRegistry.resolveAddress(item.sourceAddress),
        context,
      );
      if (!source.exists || !versionsMatch(source.version, item.expectedSourceVersion)) {
        throw createKnowledgeWorkspaceError("knowledge_version_conflict", "atomic operation source changed after planning");
      }
    }
  }

  async #assertSourceMutable(sourceKey: string): Promise<void> {
    await this.#sourceRegistry.revalidate(sourceKey);
    if (this.#recoveringSources.has(sourceKey)) {
      throw createKnowledgeWorkspaceError("source_recovery_in_progress", "knowledge source recovery is in progress");
    }
  }

  async #assertRecordMutable(record: KnowledgeAtomicOperationJournalRecord): Promise<void> {
    await this.#assertSourceMutable(record.request.sourceKey);
    if (!await this.#recordMatchesCurrentSource(record)) {
      throw createKnowledgeWorkspaceError("knowledge_resource_out_of_scope", "atomic operation source identity changed");
    }
  }

  async #recordMatchesCurrentSource(record: KnowledgeAtomicOperationJournalRecord): Promise<boolean> {
    try {
      if (!this.#sourceRegistry.get(record.request.sourceKey)) return false;
      return identitiesEqual(
        await this.#sourceRegistry.rootIdentity(record.request.sourceKey),
        record.sourceIdentity,
      );
    } catch {
      return false;
    }
  }

  #requireRecord(operationId: string, context?: ResourceOperationContext): KnowledgeAtomicOperationJournalRecord {
    const record = this.#journal.read(operationId);
    if (!record) throw createKnowledgeWorkspaceError("knowledge_resource_not_found", "atomic operation was not found");
    if (context) assertOwner(record.owner, ownerFromContext(context));
    return record;
  }

  #cancelPrepared(record: KnowledgeAtomicOperationJournalRecord, errorCode: string): KnowledgeAtomicOperationResult {
    const rolledBack = this.#transition(record, {
      state: "ROLLED_BACK",
      items: record.items.map((item) => ({ ...item, state: "rolled-back", errorCode })),
      projections: appliedProjections(),
    });
    return this.#persistResult(rolledBack);
  }

  #markRecoveryRequired(record: KnowledgeAtomicOperationJournalRecord, errorCode: string): void {
    const next = this.#transition(record, {
      state: "RECOVERY_REQUIRED",
      recoveryReason: errorCode,
      items: record.items.map((item) => item.state === "recovery-required"
        ? item
        : { ...item, state: "recovery-required", errorCode: item.errorCode ?? errorCode }),
    });
    this.#recoveringSources.add(record.request.sourceKey);
    this.#persistResult(next);
  }

  #transition(
    record: KnowledgeAtomicOperationJournalRecord,
    patch: Partial<Pick<KnowledgeAtomicOperationJournalRecord, "state" | "items" | "projections" | "resultWrittenAt" | "recoveryReason">>,
  ): KnowledgeAtomicOperationJournalRecord {
    const next = { ...record, ...patch, updatedAt: this.#timestamp() } as KnowledgeAtomicOperationJournalRecord;
    this.#journal.write(next);
    return this.#journal.read(record.operationId)!;
  }

  #persistResult(record: KnowledgeAtomicOperationJournalRecord): KnowledgeAtomicOperationResult {
    const completedAt = this.#timestamp();
    const items = record.items.map((item) => ({
      itemId: item.itemId,
      targetAddress: item.targetAddress,
      resourceKind: item.resourceKind,
      disposition: item.disposition,
      state: item.state,
      ...(item.sourceAddress ? { sourceAddress: item.sourceAddress } : {}),
      ...(item.bytesTransferred === undefined ? {} : { bytesTransferred: item.bytesTransferred }),
      ...(item.errorCode === undefined ? {} : { errorCode: item.errorCode }),
    }));
    const result: KnowledgeAtomicOperationResult = {
      schemaVersion: 1,
      operationId: record.operationId,
      requestHash: record.requestHash,
      kind: record.kind,
      sourceKey: record.request.sourceKey,
      state: record.state,
      completedAt,
      items,
      summary: summaryFor(items),
      projections: record.projections,
    };
    this.#journal.writeResult(result);
    if (!record.resultWrittenAt) {
      this.#journal.write({ ...record, resultWrittenAt: completedAt, updatedAt: completedAt });
    }
    return this.#journal.readResult(record.operationId, record.requestHash) ?? result;
  }

  async #serializeOperation<T>(operationId: string, run: () => Promise<T>): Promise<T> {
    const previous = this.#operationTails.get(operationId) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(run);
    this.#operationTails.set(operationId, current);
    try { return await current; } finally {
      if (this.#operationTails.get(operationId) === current) this.#operationTails.delete(operationId);
    }
  }

  #timestamp(): string {
    const value = this.#now();
    if (!Number.isFinite(value)) throw new TypeError("atomic operation clock must be finite");
    return new Date(value).toISOString();
  }
}

function planFromRecord(record: KnowledgeAtomicOperationJournalRecord): KnowledgeAtomicOperationPlan {
  return Object.freeze({
    schemaVersion: 1,
    operationId: record.operationId,
    requestHash: record.requestHash,
    kind: record.kind,
    sourceKey: record.request.sourceKey,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    checkpointRequired: false,
    items: record.request.items,
    preview: Object.freeze({
      resourceChanges: record.request.items.filter((item) => item.disposition !== "skip").length,
      linkWrites: 0,
    }),
  });
}

function operationIdString(value: unknown): string {
  if (typeof value !== "string") throw createKnowledgeWorkspaceError("knowledge_operation_precondition_failed", "operation id is invalid");
  try { return assertKnowledgeOperationId(value); } catch {
    throw createKnowledgeWorkspaceError("knowledge_operation_precondition_failed", "operation id is invalid");
  }
}

function commitHash(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createKnowledgeWorkspaceError("knowledge_operation_precondition_failed", "atomic commit request is invalid");
  }
  const keys = Object.keys(value);
  const requestHash = (value as { requestHash?: unknown }).requestHash;
  if (keys.length !== 1 || keys[0] !== "requestHash" || !isKnowledgeOperationRequestHash(requestHash)) {
    throw createKnowledgeWorkspaceError("knowledge_operation_precondition_failed", "atomic commit request is invalid");
  }
  return requestHash;
}

function ownerFromContext(context: ResourceOperationContext): KnowledgeOperationOwner {
  const principalId = stringOrNull(context.principal?.principalId);
  const studioId = stringOrNull(context.principal?.studioId);
  if (!principalId || !studioId) {
    throw createKnowledgeWorkspaceError("knowledge_resource_out_of_scope", "atomic operation owner is unavailable");
  }
  return Object.freeze({
    principalId,
    userId: stringOrNull(context.principal?.userId),
    studioId,
    sessionId: stringOrNull(context.sessionId ?? context.principal?.sessionId),
  });
}

function assertOwner(expected: KnowledgeOperationOwner, actual: KnowledgeOperationOwner): void {
  if (
    expected.principalId !== actual.principalId
    || expected.userId !== actual.userId
    || expected.studioId !== actual.studioId
    || expected.sessionId !== actual.sessionId
  ) throw createKnowledgeWorkspaceError("knowledge_resource_out_of_scope", "atomic operation belongs to another owner");
}

function operationContext(record: KnowledgeAtomicOperationJournalRecord): ResourceOperationContext {
  return {
    operationId: record.operationId,
    requestId: record.requestId,
    reason: "knowledge-atomic-startup-recovery",
    principal: {
      kind: "system",
      principalId: record.owner.principalId,
      userId: record.owner.userId,
      studioId: record.owner.studioId,
      sessionId: record.owner.sessionId,
    },
  };
}

function lockAddresses(items: readonly KnowledgeAtomicOperationRequestItem[]): KnowledgeResourceAddress[] {
  return items.flatMap((item) => item.sourceAddress
    ? [item.sourceAddress, item.targetAddress]
    : [item.targetAddress]);
}

function stepFor(
  item: KnowledgeAtomicOperationRequestItem,
  state: "intent",
  timestamp: string,
): KnowledgeAtomicOperationStep {
  const kind = item.disposition === "merge" ? "resource-merge"
    : item.disposition === "replace" ? "resource-replace"
    : item.sourceAddress || item.sourceToken ? "resource-transfer"
    : "resource-create";
  return Object.freeze({
    stepId: `${kind}:${item.itemId}`,
    kind,
    state,
    intentAt: timestamp,
  });
}

function settleLastStep(
  steps: readonly KnowledgeAtomicOperationStep[],
  state: "applied" | "failed",
  timestamp: string,
  errorCode?: string,
): readonly KnowledgeAtomicOperationStep[] {
  if (steps.length === 0) return steps;
  return steps.map((step, index) => index === steps.length - 1
    ? Object.freeze({ ...step, state, outcomeAt: timestamp, ...(errorCode ? { errorCode } : {}) })
    : step);
}

function updateAt<T>(values: readonly T[], index: number, value: T): T[] {
  return values.map((current, currentIndex) => currentIndex === index ? value : current);
}

function summaryFor(items: readonly Readonly<{ state: KnowledgeOperationItemState }>[]) {
  return Object.freeze({
    succeeded: items.filter((item) => item.state === "applied").length,
    failed: items.filter((item) => ["failed", "rolled-back", "recovery-required"].includes(item.state)).length,
    rolledBack: items.filter((item) => item.state === "rolled-back").length,
    recoveryRequired: items.filter((item) => item.state === "recovery-required").length,
  });
}

function appliedProjections() {
  return Object.freeze({ session: "applied" as const, event: "applied" as const, index: "applied" as const });
}

function versionsMatch(current: ResourceVersion | null | undefined, expected: ResourceVersion | null): boolean {
  if (current == null || expected == null) return current == null && expected == null;
  for (const field of ["mtimeMs", "size", "sha256", "etag", "sequence"] as const) {
    if (field in expected && current[field] !== expected[field]) return false;
  }
  return true;
}

function identitiesEqual(left: ProviderRootIdentity, right: ProviderRootIdentity): boolean {
  return left.providerId === right.providerId
    && left.identityNamespace === right.identityNamespace
    && left.opaqueRootId === right.opaqueRootId
    && left.scopeToken === right.scopeToken
    && left.caseMode === right.caseMode;
}

function publicCode(error: unknown): string {
  return normalizeKnowledgeErrorCode((error as { code?: unknown })?.code)
    ?? "knowledge_resource_unavailable";
}

function isCrash(error: unknown): boolean {
  return (error as Error)?.name === "SimulatedKnowledgeOperationCrash";
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: unknown })?.name === "AbortError";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw Object.assign(new Error("atomic operation aborted"), { name: "AbortError" });
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
