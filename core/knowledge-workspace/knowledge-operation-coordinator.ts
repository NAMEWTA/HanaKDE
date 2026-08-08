import {
  createKnowledgeOperationId,
  createKnowledgeOperationPlan,
  KNOWLEDGE_OPERATION_RESULT_RETENTION_MS,
  parseKnowledgeOperationCommitRequest,
  parseKnowledgeOperationRequest,
  type KnowledgeOperationCommitRequest,
  type KnowledgeOperationPlan,
  type KnowledgeOperationRequest,
} from "../../lib/knowledge-workspace/knowledge-operation-plan.ts";
import {
  createKnowledgeWorkspaceError,
  normalizeKnowledgeErrorCode,
} from "../../shared/knowledge-workspace-errors.ts";
import type {
  KnowledgeResourceAddress,
  KnowledgeSourceDto,
} from "../../shared/knowledge-workspace-contract.ts";
import type {
  ProviderRootIdentity,
  ResourceMoveResult,
  ResourceOperationContext,
  ResourceRef,
  ResourceStat,
  ResourceVersion,
} from "../../lib/resource-io/types.ts";
import {
  DurableKnowledgeOperationJournal,
  KnowledgeOperationJournalAlreadyExistsError,
  type KnowledgeOperationJournalItem,
  type KnowledgeOperationJournalRecord,
  type KnowledgeOperationOwner,
  type KnowledgeOperationProjectionState,
  type KnowledgeOperationResult,
  type KnowledgeOperationState,
} from "./durable-operation-journal.ts";

export const KNOWLEDGE_OPERATION_FAILURE_POINTS = [
  "after_prepare",
  "after_primary_move",
  "link_write_n",
  "after_committed",
  "session_update_failure",
  "event_publish_failure",
  "index_convergence_timeout",
  "rollback_step_n",
  "system_trash_failure",
  "disk_full",
  "permission_change",
] as const;

export type KnowledgeOperationFailurePoint =
  (typeof KNOWLEDGE_OPERATION_FAILURE_POINTS)[number];

export class SimulatedKnowledgeOperationCrash extends Error {
  readonly point: string;

  constructor(point: string) {
    super(`simulated knowledge operation crash: ${point}`);
    this.name = "SimulatedKnowledgeOperationCrash";
    this.point = point;
  }
}

type SourceRegistrySurface = {
  get(sourceKey: string): KnowledgeSourceDto | null;
  revalidate(sourceKey: string): Promise<void>;
  resolveAddress(address: KnowledgeResourceAddress): Promise<ResourceRef>;
  rootIdentity(sourceKey: string): ProviderRootIdentity | Promise<ProviderRootIdentity>;
};

type ResourceIoSurface = {
  stat(
    ref: ResourceRef,
    context?: ResourceOperationContext,
  ): Promise<ResourceStat>;
  rename(
    from: ResourceRef,
    to: ResourceRef,
    context?: ResourceOperationContext & {
      expectedSourceVersion?: ResourceVersion;
      expectedTargetVersion?: ResourceVersion | null;
    },
  ): Promise<ResourceMoveResult>;
  emitRenamed?(
    result: ResourceMoveResult,
    context: ResourceOperationContext,
  ): void;
};

export type KnowledgeOperationProjection = Readonly<{
  operationId: string;
  from: KnowledgeResourceAddress;
  to: KnowledgeResourceAddress;
  fromRef: ResourceRef;
  toRef: ResourceRef;
}>;

type CoordinatorOptions = {
  hanakoHome: string;
  sourceRegistry: SourceRegistrySurface;
  resourceIO: ResourceIoSurface;
  journal?: DurableKnowledgeOperationJournal;
  locks?: KnowledgeAddressLockManager;
  now?: () => number;
  randomUUID?: () => string;
  createCheckpoint?: (input: Readonly<{
    operationId: string;
    address: KnowledgeResourceAddress;
    resource: ResourceRef;
    reason: "knowledge-operation-rename";
    context: ResourceOperationContext;
  }>) => Promise<string>;
  rewriteLinks?: (input: KnowledgeOperationProjection & Readonly<{
    context: ResourceOperationContext;
  }>) => Promise<void>;
  rebindSessions?: (
    projection: KnowledgeOperationProjection,
    context: ResourceOperationContext,
  ) => Promise<void>;
  publishEvent?: (
    projection: KnowledgeOperationProjection,
    context: ResourceOperationContext,
  ) => Promise<void>;
  invalidateIndex?: (
    projection: KnowledgeOperationProjection,
    context: ResourceOperationContext,
  ) => Promise<void>;
  faultInjector?: (
    point: KnowledgeOperationFailurePoint,
    details?: Readonly<{ index?: number; operationId: string }>,
  ) => void | Promise<void>;
};

export type KnowledgeOperationRecoveryReport = Readonly<{
  scanned: number;
  finalized: number;
  rolledBack: number;
  recoveryRequired: number;
  expired: number;
}>;

export class KnowledgeAddressLockManager {
  readonly #tails = new Map<string, Promise<void>>();

  async acquire(
    addresses: readonly KnowledgeResourceAddress[],
  ): Promise<() => void> {
    const keys = [...new Set(addresses.map(addressLockKey))]
      .sort(compareUtf8Bytes);
    const releases: Array<() => void> = [];
    try {
      for (const key of keys) {
        releases.push(await this.#acquireKey(key));
      }
    } catch (error) {
      for (const release of releases.reverse()) release();
      throw error;
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const release of releases.reverse()) release();
    };
  }

  async #acquireKey(key: string): Promise<() => void> {
    const previous = this.#tails.get(key) ?? Promise.resolve();
    let releaseCurrent!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    this.#tails.set(key, current);
    await previous;
    return () => {
      releaseCurrent();
      if (this.#tails.get(key) === current) this.#tails.delete(key);
    };
  }
}

export class KnowledgeOperationCoordinator {
  readonly #sourceRegistry: SourceRegistrySurface;
  readonly #resourceIO: ResourceIoSurface;
  readonly #journal: DurableKnowledgeOperationJournal;
  readonly #locks: KnowledgeAddressLockManager;
  readonly #now: () => number;
  readonly #randomUUID: () => string;
  readonly #createCheckpoint: NonNullable<CoordinatorOptions["createCheckpoint"]>;
  readonly #rewriteLinks: NonNullable<CoordinatorOptions["rewriteLinks"]>;
  readonly #rebindSessions: NonNullable<CoordinatorOptions["rebindSessions"]>;
  readonly #publishEvent: NonNullable<CoordinatorOptions["publishEvent"]>;
  readonly #invalidateIndex: NonNullable<CoordinatorOptions["invalidateIndex"]>;
  readonly #faultInjector: NonNullable<CoordinatorOptions["faultInjector"]>;
  readonly #operationTails = new Map<string, Promise<unknown>>();
  readonly #recoveringSources = new Set<string>();
  #recoveryPromise: Promise<KnowledgeOperationRecoveryReport> | null = null;

  constructor(options: CoordinatorOptions) {
    this.#sourceRegistry = options.sourceRegistry;
    this.#resourceIO = options.resourceIO;
    this.#journal = options.journal
      ?? new DurableKnowledgeOperationJournal({
        hanakoHome: options.hanakoHome,
      });
    this.#locks = options.locks ?? new KnowledgeAddressLockManager();
    this.#now = options.now ?? Date.now;
    this.#randomUUID = options.randomUUID ?? createKnowledgeOperationId;
    this.#createCheckpoint = options.createCheckpoint ?? (async () => {
      throw createKnowledgeWorkspaceError(
        "knowledge_operation_precondition_failed",
        "high-risk operation checkpoint service is unavailable",
      );
    });
    this.#rewriteLinks = options.rewriteLinks ?? (async () => {});
    this.#rebindSessions = options.rebindSessions ?? (async () => {});
    this.#publishEvent = options.publishEvent ?? (async (projection, context) => {
      if (typeof this.#resourceIO.emitRenamed !== "function") return;
      this.#resourceIO.emitRenamed({
        oldResourceKey: addressKey(projection.from),
        newResourceKey: addressKey(projection.to),
        oldResource: projection.fromRef,
        newResource: projection.toRef,
      }, context);
    });
    this.#invalidateIndex = options.invalidateIndex ?? (async () => {});
    this.#faultInjector = options.faultInjector ?? (() => {});
  }

  isSourceRecovering(sourceKey: string): boolean {
    return this.#recoveringSources.has(sourceKey);
  }

  recover(): Promise<KnowledgeOperationRecoveryReport> {
    if (!this.#recoveryPromise) {
      this.#recoveryPromise = this.#runRecovery();
    }
    return this.#recoveryPromise;
  }

  async plan(
    input: unknown,
    context: ResourceOperationContext,
  ): Promise<KnowledgeOperationPlan> {
    await this.recover();
    const request = parseKnowledgeOperationRequest(input);
    this.#assertSourceAvailable(request.from.sourceKey);
    const owner = ownerFromContext(context);
    const validation = await this.#validateRequest(request, context);
    let lastCollision: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const operationId = this.#randomUUID();
      const plan = createKnowledgeOperationPlan({
        operationId,
        request,
        now: this.#clock(),
      });
      try {
        this.#journal.createPlanned({
          operationId,
          requestHash: plan.requestHash,
          request,
          owner,
          requestId: stringOrNull(context.requestId),
          sourceIdentity: validation.sourceIdentity,
          createdAt: plan.createdAt,
          expiresAt: plan.expiresAt,
        });
        return plan;
      } catch (error) {
        if (!(error instanceof KnowledgeOperationJournalAlreadyExistsError)) {
          throw error;
        }
        lastCollision = error;
      }
    }
    throw createKnowledgeWorkspaceError(
      "operation_id_reused",
      "could not allocate a unique knowledge operation id",
      lastCollision ? { state: "uuid_collision" } : undefined,
    );
  }

  async commit(
    operationIdInput: unknown,
    commitInput: unknown,
    context: ResourceOperationContext,
  ): Promise<KnowledgeOperationResult> {
    await this.recover();
    const operationId = operationIdString(operationIdInput);
    const commitRequest = parseKnowledgeOperationCommitRequest(commitInput);
    return this.#serializeOperation(operationId, () =>
      this.#commitSerialized(operationId, commitRequest, context)
    );
  }

  async cancel(
    operationIdInput: unknown,
    context: ResourceOperationContext,
  ): Promise<KnowledgeOperationResult> {
    await this.recover();
    const operationId = operationIdString(operationIdInput);
    return this.#serializeOperation(operationId, async () => {
      const record = this.#requiredRecord(operationId);
      assertOwner(record.owner, ownerFromContext(context));
      const existing = this.#journal.readResult(operationId, record.requestHash);
      if (existing) return existing;
      if (!["PLANNED", "PREPARED"].includes(record.state)) {
        throw createKnowledgeWorkspaceError(
          "knowledge_operation_precondition_failed",
          "knowledge operation can no longer be cancelled",
          { state: record.state },
        );
      }
      const next = this.#rollbackWithoutAppliedResource(
        record,
        createKnowledgeWorkspaceError(
          "knowledge_operation_precondition_failed",
          "knowledge operation was cancelled",
        ),
      );
      return this.#persistResult(next);
    });
  }

  async get(
    operationIdInput: unknown,
    context: ResourceOperationContext,
  ): Promise<KnowledgeOperationResult | Readonly<{
    schemaVersion: 1;
    operationId: string;
    requestHash: string;
    kind: KnowledgeOperationRequest["kind"];
    state: KnowledgeOperationState;
    createdAt: string;
    expiresAt: string;
    items: readonly KnowledgeOperationJournalItem[];
    projections: KnowledgeOperationJournalRecord["projections"];
  }>> {
    await this.recover();
    const operationId = operationIdString(operationIdInput);
    const record = this.#requiredRecord(operationId);
    assertOwner(record.owner, ownerFromContext(context));
    const result = this.#journal.readResult(operationId, record.requestHash);
    if (result) return result;
    return Object.freeze({
      schemaVersion: 1,
      operationId: record.operationId,
      requestHash: record.requestHash,
      kind: record.kind,
      state: record.state,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      items: record.items,
      projections: record.projections,
    });
  }

  async cleanupRetainedResults(): Promise<number> {
    await this.recover();
    const cutoff = this.#clock() - KNOWLEDGE_OPERATION_RESULT_RETENTION_MS;
    let removed = 0;
    for (const record of this.#journal.list()) {
      if (
        !["FINALIZED", "ROLLED_BACK"].includes(record.state)
        || Object.values(record.projections).some(
          (value) => value !== "applied",
        )
        || Date.parse(record.updatedAt) >= cutoff
      ) {
        continue;
      }
      this.#journal.remove(record.operationId);
      removed += 1;
    }
    return removed;
  }

  async #commitSerialized(
    operationId: string,
    commitRequest: KnowledgeOperationCommitRequest,
    context: ResourceOperationContext,
  ): Promise<KnowledgeOperationResult> {
    let record = this.#requiredRecord(operationId);
    assertOwner(record.owner, ownerFromContext(context));
    if (record.requestHash !== commitRequest.requestHash) {
      throw createKnowledgeWorkspaceError(
        "operation_id_reused",
        "knowledge operation id was reused with another request",
      );
    }
    if (
      record.committedRequestHash
      && record.committedRequestHash !== commitRequest.requestHash
    ) {
      throw createKnowledgeWorkspaceError(
        "operation_id_reused",
        "knowledge operation id was reused with another commit request",
      );
    }
    if (!record.committedRequestHash) {
      record = this.#writeRecord(record, {
        committedRequestHash: commitRequest.requestHash,
      });
    }
    const existing = this.#journal.readResult(operationId, record.requestHash);
    if (existing) {
      if (
        existing.items.some(
          (item) => item.errorCode === "knowledge_operation_plan_expired",
        )
      ) {
        throw createKnowledgeWorkspaceError(
          "knowledge_operation_plan_expired",
          "knowledge operation plan expired",
        );
      }
      return existing;
    }
    this.#assertSourceAvailable(record.request.from.sourceKey);
    if (
      ["PLANNED", "PREPARED"].includes(record.state)
      && this.#clock() > Date.parse(record.expiresAt)
    ) {
      record = this.#rollbackWithoutAppliedResource(
        record,
        createKnowledgeWorkspaceError(
          "knowledge_operation_plan_expired",
          "knowledge operation plan expired",
        ),
      );
      this.#persistResult(record);
      throw createKnowledgeWorkspaceError(
        "knowledge_operation_plan_expired",
        "knowledge operation plan expired",
      );
    }
    if (record.state === "RECOVERY_REQUIRED") {
      return this.#persistResult(record);
    }
    if (!["PLANNED", "PREPARED"].includes(record.state)) {
      throw createKnowledgeWorkspaceError(
        "knowledge_operation_precondition_failed",
        "knowledge operation is not committable",
        { state: record.state },
      );
    }

    const release = await this.#locks.acquire([
      record.request.from,
      record.request.to,
    ]);
    try {
      record = this.#requiredRecord(operationId);
      const completed = this.#journal.readResult(
        operationId,
        record.requestHash,
      );
      if (completed) return completed;
      if (
        ["PLANNED", "PREPARED"].includes(record.state)
        && this.#clock() > Date.parse(record.expiresAt)
      ) {
        const expired = this.#rollbackWithoutAppliedResource(
          record,
          createKnowledgeWorkspaceError(
            "knowledge_operation_plan_expired",
            "knowledge operation plan expired",
          ),
        );
        this.#persistResult(expired);
        throw createKnowledgeWorkspaceError(
          "knowledge_operation_plan_expired",
          "knowledge operation plan expired",
        );
      }
      if (record.state === "PLANNED") {
        record = await this.#prepare(record, context);
      }
      if (
        record.state === "ROLLED_BACK"
        || record.state === "RECOVERY_REQUIRED"
      ) {
        return this.#persistResult(record);
      }
      if (record.state !== "PREPARED") {
        throw createKnowledgeWorkspaceError(
          "knowledge_operation_precondition_failed",
          "knowledge operation did not reach PREPARED",
          { state: record.state },
        );
      }
      return await this.#applyAndFinalize(record, context);
    } finally {
      release();
    }
  }

  async #prepare(
    record: KnowledgeOperationJournalRecord,
    context: ResourceOperationContext,
  ): Promise<KnowledgeOperationJournalRecord> {
    let preparing = this.#writeRecord(record, {
      state: "PREPARING",
    });
    try {
      const validation = await this.#validateRequest(preparing.request, context);
      if (!identitiesEqual(validation.sourceIdentity, preparing.sourceIdentity)) {
        throw createKnowledgeWorkspaceError(
          "source_root_identity_unprovable",
          "knowledge source identity changed after planning",
        );
      }
      const checkpointIntent = step(
        "checkpoint",
        "checkpoint",
        "intent",
        this.#isoNow(),
      );
      preparing = this.#writeRecord(preparing, {
        items: [updateItem(preparing.items[0], {
          steps: [...preparing.items[0].steps, checkpointIntent],
        })],
      });
      const checkpointId = await this.#createCheckpoint({
        operationId: preparing.operationId,
        address: preparing.request.from,
        resource: validation.fromRef,
        reason: "knowledge-operation-rename",
        context: operationContext(preparing, context),
      });
      if (typeof checkpointId !== "string" || checkpointId.length === 0) {
        throw createKnowledgeWorkspaceError(
          "knowledge_operation_precondition_failed",
          "high-risk operation checkpoint was not created",
        );
      }
      const preparedItem = updateItem(preparing.items[0], {
        state: "prepared",
        checkpointId,
        steps: preparing.items[0].steps.map((entry) =>
          entry.stepId === checkpointIntent.stepId
            ? { ...entry, state: "applied" as const, outcomeAt: this.#isoNow() }
            : entry
        ),
      });
      const prepared = this.#writeRecord(preparing, {
        state: "PREPARED",
        items: [preparedItem],
      });
      await this.#inject("after_prepare", prepared.operationId);
      return prepared;
    } catch (error) {
      if (error instanceof SimulatedKnowledgeOperationCrash) throw error;
      return this.#rollbackWithoutAppliedResource(preparing, error);
    }
  }

  async #applyAndFinalize(
    prepared: KnowledgeOperationJournalRecord,
    context: ResourceOperationContext,
  ): Promise<KnowledgeOperationResult> {
    let record = prepared;
    try {
      const validation = await this.#validateRequest(record.request, context);
      if (!identitiesEqual(validation.sourceIdentity, record.sourceIdentity)) {
        throw createKnowledgeWorkspaceError(
          "source_root_identity_unprovable",
          "knowledge source identity changed before commit",
        );
      }
      const primaryIntent = step(
        "primary-rename",
        "primary-rename",
        "intent",
        this.#isoNow(),
      );
      record = this.#writeRecord(record, {
        state: "COMMITTING",
        items: [updateItem(record.items[0], {
          state: "applying",
          steps: [...record.items[0].steps, primaryIntent],
        })],
      });
      await this.#inject("disk_full", record.operationId);
      await this.#inject("permission_change", record.operationId);
      await this.#resourceIO.rename(
        validation.fromRef,
        validation.toRef,
        {
          ...operationContext(record, context),
          emit: false,
          expectedSourceVersion: record.request.expectedVersion,
          expectedTargetVersion: null,
        },
      );
      const targetStat = await this.#resourceIO.stat(
        validation.toRef,
        operationContext(record, context),
      );
      const appliedVersion = targetStat.version
        ? { ...targetStat.version }
        : { ...record.request.expectedVersion };
      record = this.#writeRecord(record, {
        items: [updateItem(record.items[0], {
          state: "applied",
          appliedVersion,
          steps: record.items[0].steps.map((entry) =>
            entry.stepId === primaryIntent.stepId
              ? { ...entry, state: "applied" as const, outcomeAt: this.#isoNow() }
              : entry
          ),
        })],
      });
      await this.#inject("after_primary_move", record.operationId);
      await this.#inject("link_write_n", record.operationId, 1);
      await this.#rewriteLinks({
        operationId: record.operationId,
        from: record.request.from,
        to: record.request.to,
        fromRef: validation.fromRef,
        toRef: validation.toRef,
        context: operationContext(record, context),
      });
      record = this.#writeRecord(record, { state: "COMMITTED" });
      await this.#inject("after_committed", record.operationId);
      return this.#finalizeProjections(record, context);
    } catch (error) {
      if (error instanceof SimulatedKnowledgeOperationCrash) throw error;
      const current = this.#requiredRecord(record.operationId);
      if (["COMMITTED", "FINALIZED"].includes(current.state)) {
        return this.#finalizeProjections(current, context);
      }
      return this.#rollback(current, error, context);
    }
  }

  async #rollback(
    record: KnowledgeOperationJournalRecord,
    cause: unknown,
    context: ResourceOperationContext,
  ): Promise<KnowledgeOperationResult> {
    const code = operationErrorCode(cause);
    const primaryApplied = record.items[0].steps.some((entry) =>
      entry.kind === "primary-rename" && entry.state === "applied"
    ) || record.items[0].state === "applied";
    if (!primaryApplied) {
      const rolledBack = this.#rollbackWithoutAppliedResource(record, cause);
      return this.#persistResult(rolledBack);
    }
    let rollingBack = this.#writeRecord(record, {
      state: "ROLLING_BACK",
      items: [updateItem(record.items[0], {
        state: "rolling-back",
        errorCode: code,
      })],
    });
    try {
      await this.#inject("rollback_step_n", rollingBack.operationId, 1);
      const fromRef = await this.#sourceRegistry.resolveAddress(
        rollingBack.request.from,
      );
      const toRef = await this.#sourceRegistry.resolveAddress(
        rollingBack.request.to,
      );
      await this.#sourceRegistry.revalidate(rollingBack.request.from.sourceKey);
      const targetStat = await this.#resourceIO.stat(
        toRef,
        operationContext(rollingBack, context),
      );
      if (!targetStat.exists) {
        throw createKnowledgeWorkspaceError(
          "knowledge_operation_precondition_failed",
          "rollback target no longer exists",
        );
      }
      const sourceStat = await this.#resourceIO.stat(
        fromRef,
        operationContext(rollingBack, context),
      );
      if (sourceStat.exists) {
        throw createKnowledgeWorkspaceError(
          "knowledge_resource_conflict",
          "rollback source address is occupied",
        );
      }
      await this.#resourceIO.rename(toRef, fromRef, {
        ...operationContext(rollingBack, context),
        emit: false,
        expectedSourceVersion:
          rollingBack.items[0].appliedVersion ?? targetStat.version,
        expectedTargetVersion: null,
      });
      rollingBack = this.#writeRecord(rollingBack, {
        state: "ROLLED_BACK",
        items: [updateItem(rollingBack.items[0], {
          state: "rolled-back",
          rollbackStatus: "rolled-back",
        })],
      });
      return this.#finalizeRollbackProjections(rollingBack, context);
    } catch (rollbackError) {
      const recoveryRequired = this.#writeRecord(rollingBack, {
        state: "RECOVERY_REQUIRED",
        recoveryReason: operationErrorCode(rollbackError),
        items: [updateItem(rollingBack.items[0], {
          state: "recovery-required",
          rollbackStatus: "failed",
          errorCode: code,
        })],
      });
      this.#recoveringSources.add(recoveryRequired.request.from.sourceKey);
      return this.#persistResult(recoveryRequired);
    }
  }

  #rollbackWithoutAppliedResource(
    record: KnowledgeOperationJournalRecord,
    cause: unknown,
  ): KnowledgeOperationJournalRecord {
    const rollingBack = this.#writeRecord(record, {
      state: "ROLLING_BACK",
      items: [updateItem(record.items[0], {
        state: "rolling-back",
        errorCode: operationErrorCode(cause),
      })],
    });
    return this.#writeRecord(rollingBack, {
      state: "ROLLED_BACK",
      items: [updateItem(rollingBack.items[0], {
        state: "rolled-back",
        errorCode: operationErrorCode(cause),
        rollbackStatus: "not-required",
      })],
      projections: {
        session: "applied",
        event: "applied",
        index: "applied",
      },
    });
  }

  async #finalizeProjections(
    record: KnowledgeOperationJournalRecord,
    context: ResourceOperationContext,
  ): Promise<KnowledgeOperationResult> {
    const fromRef = await this.#sourceRegistry.resolveAddress(record.request.from);
    const toRef = await this.#sourceRegistry.resolveAddress(record.request.to);
    const projection: KnowledgeOperationProjection = Object.freeze({
      operationId: record.operationId,
      from: record.request.from,
      to: record.request.to,
      fromRef,
      toRef,
    });
    const nextProjection = { ...record.projections };
    nextProjection.session = await this.#runProjection(
      "session_update_failure",
      record,
      () => this.#rebindSessions(
        projection,
        operationContext(record, context),
      ),
    );
    nextProjection.event = await this.#runProjection(
      "event_publish_failure",
      record,
      () => this.#publishEvent(
        projection,
        operationContext(record, context),
      ),
    );
    nextProjection.index = await this.#runProjection(
      "index_convergence_timeout",
      record,
      () => this.#invalidateIndex(
        projection,
        operationContext(record, context),
      ),
    );
    const finalized = this.#writeRecord(record, {
      state: "FINALIZED",
      projections: nextProjection,
    });
    return this.#persistResult(finalized);
  }

  async #finalizeRollbackProjections(
    record: KnowledgeOperationJournalRecord,
    context: ResourceOperationContext,
  ): Promise<KnowledgeOperationResult> {
    const restoredRef = await this.#sourceRegistry.resolveAddress(
      record.request.from,
    );
    const abandonedRef = await this.#sourceRegistry.resolveAddress(
      record.request.to,
    );
    const projection: KnowledgeOperationProjection = Object.freeze({
      operationId: record.operationId,
      from: record.request.to,
      to: record.request.from,
      fromRef: abandonedRef,
      toRef: restoredRef,
    });
    const rollbackContext = operationContext(record, {
      ...context,
      reason: "rollback",
    });
    const projections = {
      session: await this.#runProjection(
        "session_update_failure",
        record,
        () => this.#rebindSessions(projection, rollbackContext),
      ),
      event: await this.#runProjection(
        "event_publish_failure",
        record,
        () => this.#publishEvent(projection, rollbackContext),
      ),
      index: await this.#runProjection(
        "index_convergence_timeout",
        record,
        () => this.#invalidateIndex(projection, rollbackContext),
      ),
    };
    const finalized = this.#writeRecord(record, {
      state: "ROLLED_BACK",
      projections,
    });
    return this.#persistResult(finalized);
  }

  async #runProjection(
    point: KnowledgeOperationFailurePoint,
    record: KnowledgeOperationJournalRecord,
    run: () => Promise<void>,
  ): Promise<KnowledgeOperationProjectionState> {
    try {
      await this.#inject(point, record.operationId);
      await run();
      return "applied";
    } catch {
      return "retrying";
    }
  }

  async #runRecovery(): Promise<KnowledgeOperationRecoveryReport> {
    const report = {
      scanned: 0,
      finalized: 0,
      rolledBack: 0,
      recoveryRequired: 0,
      expired: 0,
    };
    const recoveringSources = new Set<string>();
    for (const initial of this.#journal.list()) {
      report.scanned += 1;
      const sourceKey = initial.request.from.sourceKey;
      try {
        const outcome = await this.#recoverOne(initial);
        if (outcome === "finalized") report.finalized += 1;
        if (outcome === "rolled-back") report.rolledBack += 1;
        if (outcome === "recovery-required") report.recoveryRequired += 1;
        if (outcome === "expired") report.expired += 1;
        const current = this.#journal.read(initial.operationId);
        if (
          current
          && ["RECOVERY_REQUIRED", "FAILED_PERMANENTLY"].includes(current.state)
          && await this.#recordMatchesCurrentSource(current)
        ) {
          recoveringSources.add(sourceKey);
        }
      } catch (error) {
        const current = this.#journal.read(initial.operationId) ?? initial;
        this.#markRecoveryRequired(current, error);
        if (await this.#recordMatchesCurrentSource(current)) {
          recoveringSources.add(sourceKey);
        }
        report.recoveryRequired += 1;
      }
    }
    this.#recoveringSources.clear();
    for (const sourceKey of recoveringSources) {
      this.#recoveringSources.add(sourceKey);
    }
    return Object.freeze(report);
  }

  async #recoverOne(
    record: KnowledgeOperationJournalRecord,
  ): Promise<"none" | "finalized" | "rolled-back" | "recovery-required" | "expired"> {
    if (
      record.state === "PLANNED"
      && this.#clock() > Date.parse(record.expiresAt)
    ) {
      const expired = this.#rollbackWithoutAppliedResource(
        record,
        createKnowledgeWorkspaceError(
          "knowledge_operation_plan_expired",
          "knowledge operation plan expired",
        ),
      );
      this.#persistResult(expired);
      return "expired";
    }
    if (record.state === "PREPARING") {
      const rolledBack = this.#rollbackWithoutAppliedResource(
        record,
        createKnowledgeWorkspaceError(
          "knowledge_operation_precondition_failed",
          "startup recovered an incomplete prepare",
        ),
      );
      this.#persistResult(rolledBack);
      return "rolled-back";
    }
    if (record.state === "PLANNED" || record.state === "PREPARED") {
      return "none";
    }
    if (
      record.state === "RECOVERY_REQUIRED"
      || record.state === "FAILED_PERMANENTLY"
    ) {
      return "recovery-required";
    }
    if (
      record.state === "COMMITTED"
      || (
        record.state === "FINALIZED"
        && Object.values(record.projections).some((value) => value !== "applied")
      )
    ) {
      await this.#revalidateStoredIdentity(record);
      await this.#finalizeProjections(
        record,
        operationContext(record),
      );
      return "finalized";
    }
    if (
      record.state === "ROLLED_BACK"
      && Object.values(record.projections).some((value) => value !== "applied")
    ) {
      await this.#revalidateStoredIdentity(record);
      await this.#finalizeRollbackProjections(
        record,
        operationContext(record, { reason: "rollback" }),
      );
      return "rolled-back";
    }
    if (record.state === "FINALIZED" || record.state === "ROLLED_BACK") {
      if (!this.#journal.readResult(record.operationId, record.requestHash)) {
        this.#persistResult(record);
      }
      return "none";
    }

    await this.#revalidateStoredIdentity(record);
    const fromRef = await this.#sourceRegistry.resolveAddress(record.request.from);
    const toRef = await this.#sourceRegistry.resolveAddress(record.request.to);
    const context = operationContext(record);
    const [source, target] = await Promise.all([
      this.#resourceIO.stat(fromRef, context),
      this.#resourceIO.stat(toRef, context),
    ]);
    if (record.state === "COMMITTING") {
      if (!source.exists && target.exists) {
        if (!versionsMatch(
          target.version,
          record.items[0].appliedVersion ?? record.request.expectedVersion,
        )) {
          this.#markRecoveryRequired(
            record,
            new Error("commit target version is ambiguous"),
          );
          return "recovery-required";
        }
        const committed = this.#writeRecord(record, {
          state: "COMMITTED",
          items: [updateItem(record.items[0], {
            state: "applied",
            appliedVersion:
              target.version ?? record.items[0].appliedVersion,
          })],
        });
        await this.#finalizeProjections(committed, context);
        return "finalized";
      }
      if (source.exists && !target.exists) {
        if (!versionsMatch(source.version, record.request.expectedVersion)) {
          this.#markRecoveryRequired(
            record,
            new Error("commit source version is ambiguous"),
          );
          return "recovery-required";
        }
        const rolledBack = this.#rollbackWithoutAppliedResource(
          record,
          createKnowledgeWorkspaceError(
            "knowledge_operation_precondition_failed",
            "startup found no applied primary move",
          ),
        );
        this.#persistResult(rolledBack);
        return "rolled-back";
      }
      this.#markRecoveryRequired(record, new Error("ambiguous commit facts"));
      return "recovery-required";
    }
    if (record.state === "ROLLING_BACK") {
      if (source.exists && !target.exists) {
        if (!versionsMatch(source.version, record.request.expectedVersion)) {
          this.#markRecoveryRequired(
            record,
            new Error("rollback source version is ambiguous"),
          );
          return "recovery-required";
        }
        const rolledBack = this.#writeRecord(record, {
          state: "ROLLED_BACK",
          items: [updateItem(record.items[0], {
            state: "rolled-back",
            rollbackStatus: "rolled-back",
          })],
        });
        await this.#finalizeRollbackProjections(rolledBack, context);
        return "rolled-back";
      }
      if (!source.exists && target.exists) {
        if (!versionsMatch(
          target.version,
          record.items[0].appliedVersion ?? record.request.expectedVersion,
        )) {
          this.#markRecoveryRequired(
            record,
            new Error("rollback target version is ambiguous"),
          );
          return "recovery-required";
        }
        await this.#resourceIO.rename(toRef, fromRef, {
          ...context,
          emit: false,
          expectedSourceVersion: record.items[0].appliedVersion ?? target.version,
          expectedTargetVersion: null,
        });
        const rolledBack = this.#writeRecord(record, {
          state: "ROLLED_BACK",
          items: [updateItem(record.items[0], {
            state: "rolled-back",
            rollbackStatus: "rolled-back",
          })],
        });
        await this.#finalizeRollbackProjections(rolledBack, context);
        return "rolled-back";
      }
      this.#markRecoveryRequired(record, new Error("ambiguous rollback facts"));
      return "recovery-required";
    }
    this.#markRecoveryRequired(record, new Error("unknown recovery state"));
    return "recovery-required";
  }

  #markRecoveryRequired(
    record: KnowledgeOperationJournalRecord,
    cause: unknown,
  ): KnowledgeOperationJournalRecord {
    const next = this.#writeRecord(record, {
      state: "RECOVERY_REQUIRED",
      recoveryReason: operationErrorCode(cause),
      items: [updateItem(record.items[0], {
        state: "recovery-required",
        rollbackStatus: "failed",
        errorCode: record.items[0].errorCode ?? operationErrorCode(cause),
      })],
    });
    this.#persistResult(next);
    return next;
  }

  async #recordMatchesCurrentSource(
    record: KnowledgeOperationJournalRecord,
  ): Promise<boolean> {
    try {
      if (!this.#sourceRegistry.get(record.request.from.sourceKey)) return false;
      const identity = await this.#sourceRegistry.rootIdentity(
        record.request.from.sourceKey,
      );
      return identitiesEqual(identity, record.sourceIdentity);
    } catch {
      return false;
    }
  }

  async #revalidateStoredIdentity(
    record: KnowledgeOperationJournalRecord,
  ): Promise<void> {
    await this.#sourceRegistry.revalidate(record.request.from.sourceKey);
    const current = await this.#sourceRegistry.rootIdentity(
      record.request.from.sourceKey,
    );
    if (!identitiesEqual(current, record.sourceIdentity)) {
      throw createKnowledgeWorkspaceError(
        "source_root_identity_unprovable",
        "knowledge source identity changed during recovery",
      );
    }
  }

  async #validateRequest(
    request: KnowledgeOperationRequest,
    context: ResourceOperationContext,
  ): Promise<{
    sourceIdentity: ProviderRootIdentity;
    fromRef: ResourceRef;
    toRef: ResourceRef;
  }> {
    this.#assertSourceAvailable(request.from.sourceKey);
    const source = this.#sourceRegistry.get(request.from.sourceKey);
    if (
      !source
      || source.availability !== "available"
      || !source.capabilities.includes("stat")
      || !source.capabilities.includes("write")
      || (
        !source.capabilities.includes("rename")
        && !source.capabilities.includes("move")
      )
    ) {
      throw createKnowledgeWorkspaceError(
        "knowledge_resource_unavailable",
        "knowledge source lacks rename capabilities",
      );
    }
    await this.#sourceRegistry.revalidate(request.from.sourceKey);
    const sourceIdentity = await this.#sourceRegistry.rootIdentity(
      request.from.sourceKey,
    );
    const [fromRef, toRef] = await Promise.all([
      this.#sourceRegistry.resolveAddress(request.from),
      this.#sourceRegistry.resolveAddress(request.to),
    ]);
    const [sourceStat, targetStat] = await Promise.all([
      this.#resourceIO.stat(fromRef, context),
      this.#resourceIO.stat(toRef, context),
    ]);
    if (!sourceStat.exists) {
      throw createKnowledgeWorkspaceError(
        "knowledge_resource_not_found",
        "knowledge operation source does not exist",
      );
    }
    if (!versionsMatch(sourceStat.version, request.expectedVersion)) {
      throw createKnowledgeWorkspaceError(
        "knowledge_version_conflict",
        "knowledge operation expected version changed",
      );
    }
    if (targetStat.exists) {
      throw createKnowledgeWorkspaceError(
        "knowledge_resource_conflict",
        "knowledge operation target already exists",
      );
    }
    return { sourceIdentity, fromRef, toRef };
  }

  #assertSourceAvailable(sourceKey: string): void {
    if (this.#recoveringSources.has(sourceKey)) {
      throw createKnowledgeWorkspaceError(
        "source_recovery_in_progress",
        "knowledge source recovery is in progress",
      );
    }
  }

  #requiredRecord(operationId: string): KnowledgeOperationJournalRecord {
    const record = this.#journal.read(operationId);
    if (!record) {
      throw createKnowledgeWorkspaceError(
        "knowledge_resource_not_found",
        "knowledge operation was not found",
      );
    }
    return record;
  }

  #writeRecord(
    record: KnowledgeOperationJournalRecord,
    changes: Partial<KnowledgeOperationJournalRecord>,
  ): KnowledgeOperationJournalRecord {
    const next = {
      ...record,
      ...changes,
      updatedAt: this.#isoNow(),
    } as KnowledgeOperationJournalRecord;
    this.#journal.write(next);
    return this.#requiredRecord(record.operationId);
  }

  #persistResult(
    record: KnowledgeOperationJournalRecord,
  ): KnowledgeOperationResult {
    const result = resultFromRecord(record, this.#isoNow());
    this.#journal.writeResult(result);
    if (record.resultWrittenAt === undefined) {
      this.#journal.write({
        ...record,
        resultWrittenAt: result.completedAt,
        updatedAt: result.completedAt,
      });
    }
    return this.#journal.readResult(
      record.operationId,
      record.requestHash,
    ) ?? result;
  }

  async #serializeOperation<T>(
    operationId: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const previous = this.#operationTails.get(operationId)
      ?? Promise.resolve();
    const current = previous.catch(() => {}).then(run);
    this.#operationTails.set(operationId, current);
    try {
      return await current;
    } finally {
      if (this.#operationTails.get(operationId) === current) {
        this.#operationTails.delete(operationId);
      }
    }
  }

  async #inject(
    point: KnowledgeOperationFailurePoint,
    operationId: string,
    index?: number,
  ): Promise<void> {
    await this.#faultInjector(
      point,
      Object.freeze({
        operationId,
        ...(index === undefined ? {} : { index }),
      }),
    );
  }

  #clock(): number {
    const value = this.#now();
    if (!Number.isFinite(value)) {
      throw new TypeError("knowledge operation clock returned a non-finite value");
    }
    return value;
  }

  #isoNow(): string {
    return new Date(this.#clock()).toISOString();
  }
}

function resultFromRecord(
  record: KnowledgeOperationJournalRecord,
  completedAt: string,
): KnowledgeOperationResult {
  const items = record.items.map((item) => Object.freeze({
    from: Object.freeze({ ...item.from }),
    to: Object.freeze({ ...item.to }),
    state: item.state,
    ...(item.checkpointId ? { checkpointId: item.checkpointId } : {}),
    ...(item.errorCode ? { errorCode: item.errorCode } : {}),
    ...(item.rollbackStatus
      ? { rollbackStatus: item.rollbackStatus }
      : {}),
  }));
  return Object.freeze({
    schemaVersion: 1,
    operationId: record.operationId,
    requestHash: record.requestHash,
    kind: record.kind,
    state: record.state,
    completedAt,
    items: Object.freeze(items),
    summary: Object.freeze({
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
    }),
    projections: Object.freeze({ ...record.projections }),
  });
}

function ownerFromContext(
  context: ResourceOperationContext,
): KnowledgeOperationOwner {
  const principal = context?.principal;
  const principalId = stringOrNull(principal?.principalId);
  const studioId = stringOrNull(principal?.studioId);
  if (!principalId || !studioId) {
    throw createKnowledgeWorkspaceError(
      "knowledge_resource_out_of_scope",
      "knowledge operation requires authenticated owner and Studio",
    );
  }
  return Object.freeze({
    principalId,
    userId: stringOrNull(principal?.userId),
    studioId,
    sessionId:
      stringOrNull(context.sessionId) ?? stringOrNull(principal?.sessionId),
  });
}

function assertOwner(
  expected: KnowledgeOperationOwner,
  actual: KnowledgeOperationOwner,
): void {
  if (
    expected.principalId !== actual.principalId
    || expected.userId !== actual.userId
    || expected.studioId !== actual.studioId
    || expected.sessionId !== actual.sessionId
  ) {
    throw createKnowledgeWorkspaceError(
      "knowledge_resource_out_of_scope",
      "knowledge operation belongs to another authenticated owner",
    );
  }
}

function operationContext(
  record: KnowledgeOperationJournalRecord,
  fallback: ResourceOperationContext = {},
): ResourceOperationContext {
  return {
    source: "api",
    reason: fallback.reason ?? "knowledge-operation",
    requestId: record.requestId ?? fallback.requestId ?? null,
    sessionId: record.owner.sessionId,
    sessionPath: fallback.sessionPath ?? null,
    operationId: record.operationId,
    principal: {
      kind: "api",
      principalId: record.owner.principalId,
      userId: record.owner.userId,
      studioId: record.owner.studioId,
      sessionId: record.owner.sessionId,
      requestId: record.requestId ?? null,
      scopes: fallback.principal?.scopes ?? [],
      connectionKind: fallback.principal?.connectionKind ?? null,
      credentialKind: fallback.principal?.credentialKind ?? null,
    },
  };
}

function updateItem(
  item: KnowledgeOperationJournalItem,
  changes: Partial<KnowledgeOperationJournalItem>,
): KnowledgeOperationJournalItem {
  return Object.freeze({
    ...item,
    ...changes,
    from: Object.freeze({ ...item.from }),
    to: Object.freeze({ ...item.to }),
    expectedVersion: Object.freeze({ ...item.expectedVersion }),
    ...(changes.appliedVersion
      ? { appliedVersion: Object.freeze({ ...changes.appliedVersion }) }
      : item.appliedVersion
      ? { appliedVersion: Object.freeze({ ...item.appliedVersion }) }
      : {}),
    steps: Object.freeze([...(changes.steps ?? item.steps)]),
  });
}

function step(
  stepId: string,
  kind: "checkpoint" | "primary-rename" | "link-write",
  state: "intent" | "applied" | "rolled-back" | "failed",
  intentAt: string,
) {
  return Object.freeze({ stepId, kind, state, intentAt });
}

function versionsMatch(
  current: ResourceVersion | undefined,
  expected: ResourceVersion,
): boolean {
  if (!current) return false;
  for (const field of [
    "mtimeMs",
    "size",
    "sha256",
    "etag",
    "sequence",
  ] as const) {
    if (field in expected && current[field] !== expected[field]) return false;
  }
  return true;
}

function identitiesEqual(
  left: ProviderRootIdentity,
  right: ProviderRootIdentity,
): boolean {
  return left.providerId === right.providerId
    && left.identityNamespace === right.identityNamespace
    && left.opaqueRootId === right.opaqueRootId
    && left.scopeToken === right.scopeToken
    && left.caseMode === right.caseMode;
}

function operationErrorCode(error: unknown): string {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
  ) {
    return normalizeKnowledgeErrorCode(error.code)
      ?? (typeof error.code === "string"
        ? safeErrorCode(error.code)
        : "knowledge_operation_precondition_failed");
  }
  return "knowledge_operation_precondition_failed";
}

function safeErrorCode(value: string): string {
  return /^[a-z][a-z0-9_]{0,63}$/.test(value)
    ? value
    : "knowledge_operation_precondition_failed";
}

function operationIdString(value: unknown): string {
  if (typeof value !== "string") {
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "operationId must be a UUIDv4",
      { field: "operationId" },
    );
  }
  // The journal path resolver applies the shared UUIDv4 validator.
  return value;
}

function addressLockKey(address: KnowledgeResourceAddress): string {
  return `${address.sourceKey}\0${address.relativePath}`;
}

function addressKey(address: KnowledgeResourceAddress): string {
  return `${address.sourceKey}:${address.relativePath}`;
}

function compareUtf8Bytes(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
