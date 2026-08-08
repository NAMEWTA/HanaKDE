import {
  DurableKnowledgeOperationJournal,
  KnowledgeOperationJournalAlreadyExistsError,
  type KnowledgeOperationItemState,
  type KnowledgeOperationOwner,
  type KnowledgeOperationProjectionState,
  type KnowledgeTrashOperationJournalItem,
  type KnowledgeTrashOperationJournalRecord,
  type KnowledgeTrashOperationKind,
  type KnowledgeTrashOperationRequestItem,
  type KnowledgeTrashOperationResult,
  type KnowledgeTrashOperationStepKind,
} from './durable-operation-journal.ts';
import {
  KnowledgeTrashService,
  type KnowledgeTrashBatchResult,
  type KnowledgeTrashContext,
  type KnowledgeTrashRestoreResult,
} from './knowledge-trash-service.ts';
import { KnowledgeAddressLockManager } from './knowledge-operation-coordinator.ts';
import { createKnowledgeOperationId } from '../../lib/knowledge-workspace/knowledge-operation-plan.ts';
import { isOperationCorrelationId } from '../../shared/knowledge-diagnostics.ts';
import {
  parseKnowledgeResourceAddress,
  type KnowledgeResourceAddress,
  type KnowledgeSourceDto,
} from '../../shared/knowledge-workspace-contract.ts';
import {
  createKnowledgeWorkspaceError,
  normalizeKnowledgeErrorCode,
  type KnowledgeErrorCode,
} from '../../shared/knowledge-workspace-errors.ts';
import type {
  ProviderRootIdentity,
  ResourceOperationContext,
  ResourceRef,
  ResourceStat,
  ResourceVersion,
} from '../../lib/resource-io/types.ts';
import type {
  KnowledgeTrashManifest,
  KnowledgeTrashManifestEntry,
} from '../../lib/knowledge-workspace/knowledge-trash-manifest.ts';

export type KnowledgeTrashOperationPlan = Readonly<{
  schemaVersion: 1;
  operationId: string;
  requestHash: string;
  kind: KnowledgeTrashOperationKind;
  sourceKey: string;
  batchId: string;
  createdAt: string;
  expiresAt: string;
  items: readonly Readonly<{
    entryId: string;
    originalAddress: KnowledgeResourceAddress;
    trashAddress: KnowledgeResourceAddress;
    targetAddress?: KnowledgeResourceAddress;
    resourceKind: 'file' | 'directory';
    expectedVersion: ResourceVersion;
  }>[];
}>;

export type KnowledgeTrashOperationStatus = KnowledgeTrashOperationResult | Readonly<{
  schemaVersion: 1;
  operationId: string;
  requestHash: string;
  kind: KnowledgeTrashOperationKind;
  sourceKey: string;
  batchId: string;
  state: KnowledgeTrashOperationJournalRecord['state'];
  createdAt: string;
  expiresAt: string;
  items: readonly Readonly<KnowledgeTrashOperationPlan['items'][number] & {
    state: KnowledgeOperationItemState;
    errorCode?: string;
  }>[];
  projections: KnowledgeTrashOperationJournalRecord['projections'];
}>;

export type KnowledgeTrashRecoveryReport = Readonly<{
  scanned: number;
  finalized: number;
  rolledBack: number;
  recoveryRequired: number;
}>;

type SourceRegistrySurface = {
  get(sourceKey: string): KnowledgeSourceDto | null;
  revalidate(sourceKey: string): Promise<void>;
  rootIdentity(sourceKey: string): ProviderRootIdentity;
  resolveAddress(address: KnowledgeResourceAddress): Promise<ResourceRef>;
};

type ResourceIoSurface = {
  stat(ref: ResourceRef, context?: ResourceOperationContext): Promise<ResourceStat>;
};

type TrashOperationInput = Readonly<{
  operationId: string;
  record: KnowledgeTrashOperationJournalRecord;
}>;

/**
 * Coordinates every source-trash mutation with the durable operation root.
 * The manifest remains the user-visible source-side recovery data; this
 * coordinator owns intent/outcome ordering and startup gating.
 */
export class KnowledgeTrashOperationCoordinator {
  readonly #sourceRegistry: SourceRegistrySurface;
  readonly #resourceIO: ResourceIoSurface;
  readonly #journal: DurableKnowledgeOperationJournal;
  readonly #service: KnowledgeTrashService;
  readonly #locks: KnowledgeAddressLockManager;
  readonly #now: () => number;
  readonly #randomUUID: () => string;
  readonly #recoveringSources = new Set<string>();
  readonly #operationTails = new Map<string, Promise<unknown>>();
  #recoveryPromise: Promise<KnowledgeTrashRecoveryReport> | null = null;

  constructor(input: {
    hanakoHome: string;
    sourceRegistry: SourceRegistrySurface;
    resourceIO: ResourceIoSurface;
    journal?: DurableKnowledgeOperationJournal;
    service?: KnowledgeTrashService;
    locks?: KnowledgeAddressLockManager;
    now?: () => number;
    randomUUID?: () => string;
  }) {
    this.#sourceRegistry = input.sourceRegistry;
    this.#resourceIO = input.resourceIO;
    this.#journal = input.journal ?? new DurableKnowledgeOperationJournal({
      hanakoHome: input.hanakoHome,
    });
    this.#service = input.service ?? new KnowledgeTrashService({
      sourceRegistry: input.sourceRegistry,
      resourceIO: input.resourceIO as never,
    });
    this.#locks = input.locks ?? new KnowledgeAddressLockManager();
    this.#now = input.now ?? Date.now;
    this.#randomUUID = input.randomUUID ?? createKnowledgeOperationId;
  }

  isSourceRecovering(sourceKey: string): boolean {
    return this.#recoveringSources.has(sourceKey);
  }

  recover(): Promise<KnowledgeTrashRecoveryReport> {
    if (!this.#recoveryPromise) this.#recoveryPromise = this.#runRecovery();
    return this.#recoveryPromise;
  }

  async trash(
    addresses: readonly KnowledgeResourceAddress[],
    context: KnowledgeTrashContext = {},
  ): Promise<KnowledgeTrashBatchResult> {
    const plan = await this.planTrash(addresses, context);
    return this.#serializeOperation(plan.operationId, async () => {
      const record = this.#requireRecord(plan.operationId, context);
      const release = await this.#locks.acquire(operationAddresses(record));
      try {
        return (await this.#commitDelete(record, context)).batch;
      } finally {
        release();
      }
    });
  }

  async planTrash(
    addresses: readonly KnowledgeResourceAddress[],
    context: KnowledgeTrashContext = {},
  ): Promise<KnowledgeTrashOperationPlan> {
    await this.recover();
    const selection = normalizeSelection(addresses);
    const sourceKey = sourceKeyForSelection(selection);
    await this.#assertSourceMutable(sourceKey);
    return this.#allocatePreparedPlan('delete', sourceKey, async (operationId) => ({
      batchId: operationId,
      items: await this.#prepareDeleteItems(selection, operationId, context),
    }), context);
  }

  async restore(
    sourceKey: string,
    batchId: string,
    entryIds: readonly string[] | undefined,
    context: KnowledgeTrashContext = {},
  ): Promise<readonly KnowledgeTrashRestoreResult[]> {
    const plan = await this.planRestore(sourceKey, batchId, entryIds, context);
    return this.#serializeOperation(plan.operationId, async () => {
      const record = this.#requireRecord(plan.operationId, context);
      const release = await this.#locks.acquire(operationAddresses(record));
      try {
        return (await this.#commitRestore(record, context)).restored;
      } finally {
        release();
      }
    });
  }

  async planRestore(
    sourceKey: string,
    batchId: string,
    entryIds: readonly string[] | undefined,
    context: KnowledgeTrashContext = {},
  ): Promise<KnowledgeTrashOperationPlan> {
    await this.recover();
    await this.#assertSourceMutable(sourceKey);
    const items = await this.#prepareBatchItems(
      'restore',
      sourceKey,
      batchId,
      entryIds,
      context,
    );
    return this.#allocatePreparedPlan('restore', sourceKey, async () => ({
      batchId,
      items,
    }), context);
  }

  async planCleanup(
    address: KnowledgeResourceAddress,
    context: KnowledgeTrashContext = {},
  ): Promise<KnowledgeTrashOperationPlan> {
    await this.recover();
    const parsed = parseAddress(address);
    await this.#assertSourceMutable(parsed.sourceKey);
    const match = trashBatchFromAddress(parsed);
    const manifest = await this.#service.readBatch(
      parsed.sourceKey,
      match.batchId,
      context,
    );
    const entry = manifest.entries.find((candidate) => (
      candidate.trashAddress.relativePath === parsed.relativePath
      && candidate.state === 'trashed'
    ));
    if (!entry) {
      throw createKnowledgeWorkspaceError(
        'knowledge_trash_entry_not_found',
        'knowledge trash entry not found',
      );
    }
    const expectedVersion = await this.#versionFor(entry.trashAddress, context);
    return this.#allocatePreparedPlan('cleanup', parsed.sourceKey, async () => ({
      batchId: manifest.batchId,
      items: [requestItem(entry, expectedVersion)],
    }), context);
  }

  owns(operationId: unknown): boolean {
    if (typeof operationId !== 'string' || !isOperationCorrelationId(operationId)) return false;
    return this.#journal.readTrash(operationId) !== null;
  }

  async commit(
    operationIdInput: unknown,
    commitInput: unknown,
    context: KnowledgeTrashContext = {},
  ): Promise<KnowledgeTrashOperationResult> {
    await this.recover();
    const operationId = operationIdString(operationIdInput);
    const requestHash = commitRequestHash(commitInput);
    return this.#serializeOperation(operationId, async () => {
      const record = this.#requireRecord(operationId, context);
      if (record.requestHash !== requestHash) {
        throw createKnowledgeWorkspaceError(
          'operation_id_reused',
          'knowledge operation id was reused with another request',
        );
      }
      const existing = this.#journal.readTrashResult(operationId, requestHash);
      if (existing) return existing;
      if (record.state === 'PREPARED' && this.#now() > Date.parse(record.expiresAt)) {
        this.#cancelPrepared(record, 'knowledge_operation_plan_expired');
        throw createKnowledgeWorkspaceError(
          'knowledge_operation_plan_expired',
          'knowledge operation plan expired',
        );
      }
      if (record.state !== 'PREPARED') {
        throw createKnowledgeWorkspaceError(
          'knowledge_operation_precondition_failed',
          'knowledge trash operation is not committable',
        );
      }
      await this.#assertRecordMutable(record);
      const release = await this.#locks.acquire(operationAddresses(record));
      try {
        if (record.kind === 'delete') {
          return (await this.#commitDelete(record, context)).operation;
        }
        if (record.kind === 'restore') {
          return (await this.#commitRestore(record, context)).operation;
        }
        throw createKnowledgeWorkspaceError(
          'knowledge_operation_precondition_failed',
          'knowledge cleanup commit requires the native system-trash boundary',
        );
      } finally {
        release();
      }
    });
  }

  async cancel(
    operationIdInput: unknown,
    context: KnowledgeTrashContext = {},
  ): Promise<KnowledgeTrashOperationResult> {
    await this.recover();
    const operationId = operationIdString(operationIdInput);
    return this.#serializeOperation(operationId, async () => {
      const record = this.#requireRecord(operationId, context);
      const existing = this.#journal.readTrashResult(record.operationId, record.requestHash);
      if (existing) return existing;
      if (record.state !== 'PREPARED') {
        throw createKnowledgeWorkspaceError(
          'knowledge_operation_precondition_failed',
          'knowledge trash operation can no longer be cancelled',
        );
      }
      return this.#cancelPrepared(record, 'knowledge_operation_precondition_failed');
    });
  }

  async get(
    operationIdInput: unknown,
    context: KnowledgeTrashContext = {},
  ): Promise<KnowledgeTrashOperationStatus> {
    await this.recover();
    const record = this.#requireRecord(operationIdString(operationIdInput), context);
    return this.#journal.readTrashResult(record.operationId, record.requestHash)
      ?? statusFromRecord(record);
  }

  async #commitDelete(
    record: KnowledgeTrashOperationJournalRecord,
    context: KnowledgeTrashContext,
  ): Promise<Readonly<{
    batch: KnowledgeTrashBatchResult;
    operation: KnowledgeTrashOperationResult;
  }>> {
    const intentAt = this.#timestamp();
    const committing = this.#transition(record, {
      state: 'COMMITTING',
      items: record.items.map((item) => appendIntentSteps(
        { ...item, state: 'applying' },
        ['manifest-write', 'resource-move'],
        intentAt,
      )),
    });
    const batch = await this.#service.trashPrepared({
      batchId: record.request.batchId,
      items: committing.items.map((item) => ({
        entryId: item.entryId,
        originalAddress: item.originalAddress,
        trashAddress: item.trashAddress,
        kind: item.resourceKind,
        expectedVersion: item.expectedVersion,
      })),
    }, {
      ...context,
      operationId: record.operationId,
    });
    const finalized = this.#transition(committing, {
      state: 'FINALIZED',
      items: settleDeleteItems(committing.items, batch, this.#timestamp()),
      projections: appliedProjections(),
    });
    return Object.freeze({ batch, operation: this.#persistResult(finalized) });
  }

  async #commitRestore(
    record: KnowledgeTrashOperationJournalRecord,
    context: KnowledgeTrashContext,
  ): Promise<Readonly<{
    restored: readonly KnowledgeTrashRestoreResult[];
    operation: KnowledgeTrashOperationResult;
  }>> {
    const intentAt = this.#timestamp();
    const committing = this.#transition(record, {
      state: 'COMMITTING',
      items: record.items.map((item) => appendIntentSteps(
        { ...item, state: 'applying' },
        ['parent-mkdir', 'manifest-write', 'resource-move', 'link-write'],
        intentAt,
      )),
    });
    const restored = await this.#service.restorePrepared(
      record.request.sourceKey,
      record.request.batchId,
      committing.items.map((item) => ({
        entryId: item.entryId,
        targetAddress: requiredTargetAddress(item),
        expectedVersion: item.expectedVersion,
      })),
      {
        ...context,
        operationId: record.operationId,
      },
    );
    const finalized = this.#transition(committing, {
      state: 'FINALIZED',
      items: settleRestoreItems(committing.items, restored, this.#timestamp()),
      projections: appliedProjections(),
    });
    return Object.freeze({ restored, operation: this.#persistResult(finalized) });
  }

  async #allocatePreparedPlan(
    kind: KnowledgeTrashOperationKind,
    sourceKey: string,
    prepare: (operationId: string) => Promise<Readonly<{
      batchId: string;
      items: readonly KnowledgeTrashOperationRequestItem[];
    }>>,
    context: KnowledgeTrashContext,
  ): Promise<KnowledgeTrashOperationPlan> {
    let lastCollision: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const operationId = this.#randomUUID();
      const prepared = await prepare(operationId);
      try {
        const operation = this.#createPrepared({
          operationId,
          kind,
          sourceKey,
          batchId: prepared.batchId,
          items: prepared.items,
          context,
        });
        return planFromRecord(operation.record);
      } catch (error) {
        if (!(error instanceof KnowledgeOperationJournalAlreadyExistsError)) throw error;
        lastCollision = error;
      }
    }
    throw createKnowledgeWorkspaceError(
      'operation_id_reused',
      'could not allocate a unique knowledge trash operation id',
      lastCollision ? { state: 'uuid_collision' } : undefined,
    );
  }

  #cancelPrepared(
    record: KnowledgeTrashOperationJournalRecord,
    errorCode: KnowledgeErrorCode,
  ): KnowledgeTrashOperationResult {
    const rollingBack = this.#transition(record, {
      state: 'ROLLING_BACK',
      items: record.items.map((item) => ({
        ...item,
        state: 'rolling-back',
        errorCode,
      })),
    });
    const rolledBack = this.#transition(rollingBack, {
      state: 'ROLLED_BACK',
      items: rollingBack.items.map((item) => ({
        ...item,
        state: 'rolled-back',
        errorCode,
      })),
      projections: appliedProjections(),
    });
    return this.#persistResult(rolledBack);
  }

  async beginSystemTrash(
    address: KnowledgeResourceAddress,
    context: KnowledgeTrashContext = {},
  ): Promise<string> {
    return (await this.planCleanup(address, context)).operationId;
  }

  async useSystemTrashPlan(
    operationIdInput: unknown,
    address: KnowledgeResourceAddress,
    context: KnowledgeTrashContext = {},
  ): Promise<string> {
    await this.recover();
    const operationId = operationIdString(operationIdInput);
    const record = this.#requireCleanupRecord(operationId, context);
    if (record.state === 'PREPARED' && this.#now() > Date.parse(record.expiresAt)) {
      this.#cancelPrepared(record, 'knowledge_operation_plan_expired');
      throw createKnowledgeWorkspaceError(
        'knowledge_operation_plan_expired',
        'knowledge cleanup plan expired',
      );
    }
    if (
      record.state !== 'PREPARED'
      || !addressesEqual(record.items[0].trashAddress, parseAddress(address))
    ) {
      throw createKnowledgeWorkspaceError(
        'knowledge_operation_precondition_failed',
        'knowledge cleanup plan does not match the native resource',
      );
    }
    await this.#assertRecordMutable(record);
    return operationId;
  }

  async markSystemTrashGrantIssued(
    operationId: string,
    context: KnowledgeTrashContext = {},
  ): Promise<void> {
    await this.recover();
    const record = this.#requireCleanupRecord(operationId, context);
    await this.#assertRecordMutable(record);
    if (record.items.every((item) => item.steps.some((step) => (
      step.kind === 'native-grant' && step.state === 'applied'
    )))) return;
    this.#transition(record, {
      items: record.items.map((item) => ({
        ...item,
        steps: [...item.steps, operationStep('native-grant', 'applied', this.#timestamp())],
      })),
    });
  }

  async markSystemTrashDispatched(
    operationId: string,
    context: KnowledgeTrashContext = {},
  ): Promise<void> {
    await this.recover();
    const record = this.#requireCleanupRecord(operationId, context);
    await this.#assertRecordMutable(record);
    const committing = this.#transition(record, {
      state: 'COMMITTING',
      items: record.items.map((item) => ({
        ...item,
        state: 'applying',
        steps: [...item.steps, operationStep('native-dispatch', 'intent', this.#timestamp())],
      })),
    });
    await this.#service.beginSystemTrash(committing.items[0].trashAddress, {
      ...context,
      operationId,
    });
  }

  async completeSystemTrash(
    operationId: string,
    ok: boolean,
    context: KnowledgeTrashContext = {},
  ): Promise<void> {
    await this.recover();
    const record = this.#requireCleanupRecord(operationId, context);
    await this.#assertRecordMutable(record);
    const outcomeCode = ok ? undefined : 'knowledge_resource_unavailable';
    const expectedOutcome = ok ? 'applied' : 'failed';
    const existingOutcome = [...record.items[0].steps]
      .reverse()
      .find((step) => step.kind === 'system-trash');
    if (existingOutcome && existingOutcome.state !== expectedOutcome) {
      throw createKnowledgeWorkspaceError(
        'knowledge_operation_precondition_failed',
        'knowledge system trash outcome is inconsistent',
      );
    }
    const settling = existingOutcome
      ? record
      : this.#transition(record, {
        state: 'COMMITTING',
        items: record.items.map((candidate) => ({
          ...candidate,
          state: 'applying',
          steps: [
            ...candidate.steps,
            operationStep(
              'system-trash',
              expectedOutcome,
              this.#timestamp(),
              outcomeCode,
            ),
          ],
        })),
      });
    const item = settling.items[0];
    const address = item.trashAddress;
    if (ok) {
      await this.#service.completeSystemTrash(address, {
        ...context,
        operationId,
      });
      const finalized = this.#transition(settling, {
        state: 'FINALIZED',
        items: settling.items.map((candidate) => ({
          ...candidate,
          state: 'applied',
        })),
        projections: appliedProjections(),
      });
      this.#persistResult(finalized);
      return;
    }
    await this.#service.failSystemTrash(address, 'knowledge_resource_unavailable', {
      ...context,
      operationId,
    });
    const rolledBack = this.#transition(settling, {
      state: 'ROLLED_BACK',
      items: settling.items.map((candidate) => ({
        ...candidate,
        state: 'rolled-back',
        errorCode: 'knowledge_resource_unavailable',
      })),
    });
    this.#persistResult(rolledBack);
  }

  #createPrepared(input: {
    operationId: string;
    kind: KnowledgeTrashOperationKind;
    sourceKey: string;
    batchId: string;
    items: readonly KnowledgeTrashOperationRequestItem[];
    context: ResourceOperationContext;
  }): TrashOperationInput {
    const now = this.#now();
    const timestamp = new Date(now).toISOString();
    const record = this.#journal.createTrashPrepared({
      operationId: input.operationId,
      kind: input.kind,
      sourceKey: input.sourceKey,
      batchId: input.batchId,
      items: input.items,
      owner: ownerFromContext(input.context),
      requestId: stringOrNull(input.context.requestId),
      sourceIdentity: this.#sourceRegistry.rootIdentity(input.sourceKey),
      createdAt: timestamp,
      expiresAt: new Date(now + 15 * 60 * 1_000).toISOString(),
    });
    return Object.freeze({ operationId: input.operationId, record });
  }

  #requireRecord(
    operationId: string,
    context?: KnowledgeTrashContext,
  ): KnowledgeTrashOperationJournalRecord {
    const record = this.#journal.readTrash(operationId);
    if (!record) {
      throw createKnowledgeWorkspaceError(
        'knowledge_operation_precondition_failed',
        'knowledge trash operation is unavailable',
      );
    }
    if (context) assertOwner(record.owner, ownerFromContext(context));
    return record;
  }

  #requireCleanupRecord(
    operationId: string,
    context?: KnowledgeTrashContext,
  ): KnowledgeTrashOperationJournalRecord {
    const record = this.#requireRecord(operationId, context);
    if (!record || record.kind !== 'cleanup' || record.items.length !== 1) {
      throw createKnowledgeWorkspaceError(
        'knowledge_operation_precondition_failed',
        'knowledge system trash operation is invalid',
      );
    }
    return record;
  }

  #transition(
    record: KnowledgeTrashOperationJournalRecord,
    patch: Partial<Pick<KnowledgeTrashOperationJournalRecord, 'state' | 'items' | 'projections' | 'recoveryReason' | 'resultWrittenAt'>>,
  ): KnowledgeTrashOperationJournalRecord {
    const next = {
      ...record,
      ...patch,
      updatedAt: this.#timestamp(),
    } as KnowledgeTrashOperationJournalRecord;
    this.#journal.writeTrash(next);
    return next;
  }

  #persistResult(record: KnowledgeTrashOperationJournalRecord): KnowledgeTrashOperationResult {
    const completedAt = this.#timestamp();
    const result: KnowledgeTrashOperationResult = {
      schemaVersion: 1,
      operationId: record.operationId,
      requestHash: record.requestHash,
      kind: record.kind,
      sourceKey: record.request.sourceKey,
      batchId: record.request.batchId,
      state: record.state,
      completedAt,
      items: record.items.map((item) => ({
        entryId: item.entryId,
        originalAddress: item.originalAddress,
        trashAddress: item.trashAddress,
        ...(item.targetAddress === undefined ? {} : { targetAddress: item.targetAddress }),
        resourceKind: item.resourceKind,
        state: item.state,
        ...(item.errorCode === undefined ? {} : { errorCode: item.errorCode }),
      })),
      summary: summarize(record.items),
      projections: record.projections,
    };
    this.#journal.writeTrashResult(result);
    if (record.resultWrittenAt === undefined) {
      this.#journal.writeTrash({
        ...record,
        resultWrittenAt: completedAt,
        updatedAt: completedAt,
      });
    }
    return Object.freeze(result);
  }

  async #runRecovery(): Promise<KnowledgeTrashRecoveryReport> {
    const report = {
      scanned: 0,
      finalized: 0,
      rolledBack: 0,
      recoveryRequired: 0,
    };
    for (const record of this.#journal.listTrash()) {
      report.scanned += 1;
      if (record.state === 'FINALIZED' || record.state === 'ROLLED_BACK') {
        if (!this.#journal.readTrashResult(record.operationId, record.requestHash)) {
          this.#persistResult(record);
        }
        continue;
      }
      if (record.state === 'PREPARED') {
        if (this.#now() <= Date.parse(record.expiresAt)) continue;
        this.#cancelPrepared(record, 'knowledge_operation_plan_expired');
        report.rolledBack += 1;
        continue;
      }
      if (!this.#recordMatchesCurrentSource(record)) {
        // An old workspace's record remains durable evidence, but must not
        // degrade a different active root that happens to reuse `main`.
        report.recoveryRequired += 1;
        continue;
      }
      try {
        const outcome = await this.#recoverOne(record);
        if (outcome === 'finalized') report.finalized += 1;
        if (outcome === 'rolled-back') report.rolledBack += 1;
        if (outcome === 'recovery-required') report.recoveryRequired += 1;
      } catch (error) {
        this.#markRecoveryRequired(record, publicCode(error));
        report.recoveryRequired += 1;
      }
    }
    return Object.freeze(report);
  }

  async #recoverOne(
    record: KnowledgeTrashOperationJournalRecord,
  ): Promise<'finalized' | 'rolled-back' | 'recovery-required'> {
    const sourceKey = record.request.sourceKey;
    const context: KnowledgeTrashContext = {
      operationId: record.operationId,
      reason: 'knowledge-trash-startup-recovery',
      principal: {
        kind: 'system',
        principalId: record.owner.principalId,
        userId: record.owner.userId,
        studioId: record.owner.studioId,
        sessionId: record.owner.sessionId,
      },
      requestId: record.requestId,
    };
    let manifest: KnowledgeTrashManifest;
    try {
      manifest = await this.#service.recoverBatch(
        sourceKey,
        record.request.batchId,
        context,
      );
    } catch (error) {
      if (
        record.kind === 'delete'
        && (
          record.state === 'PREPARED'
          || await this.#deleteOperationIsUntouched(record, context)
        )
      ) {
        const rolledBack = this.#transition(record, {
          state: 'ROLLED_BACK',
          items: record.items.map((item) => ({
            ...item,
            state: 'rolled-back',
            errorCode: publicCode(error),
          })),
        });
        this.#persistResult(rolledBack);
        return 'rolled-back';
      }
      this.#markRecoveryRequired(record, publicCode(error));
      return 'recovery-required';
    }
    if (record.kind === 'cleanup') {
      return this.#recoverCleanup(record, manifest, context);
    }
    const unresolved = record.items.some((item) => {
      const entry = findManifestEntry(manifest, item);
      return !entry || entry.state === 'pending' || entry.state === 'restoring' || entry.state === 'cleaning';
    });
    if (unresolved) {
      this.#markRecoveryRequired(record, 'knowledge_operation_precondition_failed');
      return 'recovery-required';
    }
    if (record.kind === 'restore') {
      await this.#service.recoverRestoredLinks(
        record.request.sourceKey,
        record.request.batchId,
        record.items.map((item) => ({
          entryId: item.entryId,
          targetAddress: requiredTargetAddress(item),
        })),
        context,
      );
    }
    const finalized = this.#transition(record, {
      state: 'FINALIZED',
      items: record.items.map((item) => ({
        ...settleRecoveredItem(
          item,
          recoveredItemState(record.kind, findManifestEntry(manifest, item)),
          this.#timestamp(),
        ),
      })),
      projections: appliedProjections(),
    });
    this.#persistResult(finalized);
    return 'finalized';
  }

  async #recoverCleanup(
    record: KnowledgeTrashOperationJournalRecord,
    manifest: KnowledgeTrashManifest,
    context: KnowledgeTrashContext,
  ): Promise<'finalized' | 'rolled-back' | 'recovery-required'> {
    const item = record.items[0];
    const entry = item ? findManifestEntry(manifest, item) : undefined;
    if (!item || !entry) {
      this.#markRecoveryRequired(record, 'knowledge_operation_precondition_failed');
      return 'recovery-required';
    }
    const nativeOutcome = [...item.steps].reverse().find((step) => step.kind === 'system-trash');
    if (nativeOutcome?.state === 'applied') {
      if (entry.state !== 'cleaned') {
        await this.#service.completeSystemTrash(entry.trashAddress, context);
      }
      const finalized = this.#transition(record, {
        state: 'FINALIZED',
        items: [{ ...item, state: 'applied' }],
        projections: appliedProjections(),
      });
      this.#persistResult(finalized);
      return 'finalized';
    }
    if (nativeOutcome?.state === 'failed') {
      if (entry.state !== 'trashed') {
        await this.#service.failSystemTrash(
          entry.trashAddress,
          'knowledge_resource_unavailable',
          context,
        );
      }
      const rolledBack = this.#transition(record, {
        state: 'ROLLED_BACK',
        items: [{
          ...item,
          state: 'rolled-back',
          errorCode: nativeOutcome.errorCode ?? 'knowledge_resource_unavailable',
        }],
      });
      this.#persistResult(rolledBack);
      return 'rolled-back';
    }
    if (entry.state === 'cleaned') {
      const finalized = this.#transition(record, {
        state: 'FINALIZED',
        items: [{ ...item, state: 'applied' }],
        projections: appliedProjections(),
      });
      this.#persistResult(finalized);
      return 'finalized';
    }
    if (entry.state === 'trashed') {
      const rolledBack = this.#transition(record, {
        state: 'ROLLED_BACK',
        items: [{ ...item, state: 'rolled-back' }],
      });
      this.#persistResult(rolledBack);
      return 'rolled-back';
    }
    if (entry.state !== 'cleaning') {
      this.#markRecoveryRequired(record, 'knowledge_operation_precondition_failed');
      return 'recovery-required';
    }
    const payload = await this.#resourceIO.stat(
      await this.#sourceRegistry.resolveAddress(entry.trashAddress),
      context,
    );
    if (!payload.exists) {
      // Missing bytes after dispatch cannot prove an OS-trash success. Leave
      // the source gated until an explicit recovery action can establish fact.
      this.#markRecoveryRequired(record, 'knowledge_resource_unavailable');
      return 'recovery-required';
    }
    await this.#service.failSystemTrash(
      entry.trashAddress,
      'knowledge_resource_unavailable',
      context,
    );
    const rolledBack = this.#transition(record, {
      state: 'ROLLED_BACK',
      items: [{
        ...item,
        state: 'rolled-back',
        errorCode: 'knowledge_resource_unavailable',
      }],
    });
    this.#persistResult(rolledBack);
    return 'rolled-back';
  }

  #recordMatchesCurrentSource(record: KnowledgeTrashOperationJournalRecord): boolean {
    try {
      if (!this.#sourceRegistry.get(record.request.sourceKey)) return false;
      return identitiesEqual(
        this.#sourceRegistry.rootIdentity(record.request.sourceKey),
        record.sourceIdentity,
      );
    } catch {
      return false;
    }
  }

  async #assertSourceMutable(sourceKey: string): Promise<void> {
    await this.#sourceRegistry.revalidate(sourceKey);
    if (this.isSourceRecovering(sourceKey)) {
      throw createKnowledgeWorkspaceError(
        'source_recovery_in_progress',
        'knowledge source recovery is in progress',
      );
    }
  }

  async #assertRecordMutable(record: KnowledgeTrashOperationJournalRecord): Promise<void> {
    await this.#assertSourceMutable(record.request.sourceKey);
    if (!this.#recordMatchesCurrentSource(record)) {
      throw createKnowledgeWorkspaceError(
        'knowledge_resource_out_of_scope',
        'knowledge trash operation source identity changed',
      );
    }
  }

  async #deleteOperationIsUntouched(
    record: KnowledgeTrashOperationJournalRecord,
    context: KnowledgeTrashContext,
  ): Promise<boolean> {
    try {
      for (const item of record.items) {
        const [original, trash] = await Promise.all([
          this.#resourceIO.stat(
            await this.#sourceRegistry.resolveAddress(item.originalAddress),
            context,
          ),
          this.#resourceIO.stat(
            await this.#sourceRegistry.resolveAddress(item.trashAddress),
            context,
          ),
        ]);
        if (!original.exists || trash.exists) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  async #prepareDeleteItems(
    selection: readonly KnowledgeResourceAddress[],
    batchId: string,
    context: KnowledgeTrashContext,
  ): Promise<readonly KnowledgeTrashOperationRequestItem[]> {
    const sourceKey = sourceKeyForSelection(selection);
    const items: KnowledgeTrashOperationRequestItem[] = [];
    for (const [ordinal, address] of selection.entries()) {
      const stat = await this.#resourceIO.stat(
        await this.#sourceRegistry.resolveAddress(address),
        context,
      );
      if (!stat.exists || !stat.version) continue;
      const trashAddress = {
        sourceKey,
        relativePath: `.trash/${batchId}/payload/${String(ordinal + 1).padStart(6, '0')}-${basename(address.relativePath)}`,
      };
      items.push({
        entryId: this.#randomUUID(),
        originalAddress: address,
        trashAddress,
        resourceKind: stat.isDirectory ? 'directory' : 'file',
        expectedVersion: stat.version,
      });
    }
    if (items.length === 0) {
      throw createKnowledgeWorkspaceError(
        'knowledge_resource_not_found',
        'knowledge trash selection does not exist',
      );
    }
    return Object.freeze(items.map((item) => Object.freeze(item)));
  }

  async #prepareBatchItems(
    kind: 'restore' | 'cleanup',
    sourceKey: string,
    batchId: string,
    entryIds: readonly string[] | undefined,
    context: KnowledgeTrashContext,
  ): Promise<readonly KnowledgeTrashOperationRequestItem[]> {
    const manifest = await this.#service.readBatch(sourceKey, batchId, context);
    const selected = new Set(entryIds ?? manifest.entries
      .filter((entry) => entry.state === 'trashed')
      .map((entry) => entry.entryId));
    const entries = manifest.entries.filter((entry) => selected.has(entry.entryId));
    if (entries.length === 0 || entries.some((entry) => entry.state !== 'trashed')) {
      throw createKnowledgeWorkspaceError(
        'knowledge_trash_entry_not_found',
        'knowledge trash entry not found',
      );
    }
    return Object.freeze(await Promise.all(entries.map(async (entry) => {
      const expectedVersion = await this.#versionFor(entry.trashAddress, context);
      const targetAddress = kind === 'restore'
        ? await this.#service.resolveRestoreAddress(entry.originalAddress, entry.kind, context)
        : undefined;
      return {
        ...requestItem(entry, expectedVersion),
        ...(targetAddress === undefined ? {} : { targetAddress }),
      };
    })));
  }

  async #versionFor(
    address: KnowledgeResourceAddress,
    context: KnowledgeTrashContext,
  ): Promise<ResourceVersion> {
    const stat = await this.#resourceIO.stat(
      await this.#sourceRegistry.resolveAddress(address),
      context,
    );
    if (!stat.exists || !stat.version) {
      throw createKnowledgeWorkspaceError(
        'knowledge_trash_entry_not_found',
        'knowledge trash payload is unavailable',
      );
    }
    return stat.version;
  }

  #markRecoveryRequired(
    record: KnowledgeTrashOperationJournalRecord,
    errorCode: string,
  ): void {
    const next = this.#transition(record, {
      state: 'RECOVERY_REQUIRED',
      recoveryReason: errorCode,
      items: record.items.map((item) => ({
        ...item,
        state: 'recovery-required',
        errorCode: item.errorCode ?? errorCode,
      })),
    });
    this.#recoveringSources.add(record.request.sourceKey);
    this.#persistResult(next);
  }

  #timestamp(): string {
    return new Date(this.#now()).toISOString();
  }

  async #serializeOperation<T>(
    operationId: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const previous = this.#operationTails.get(operationId) ?? Promise.resolve();
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
}

function normalizeSelection(input: readonly KnowledgeResourceAddress[]): KnowledgeResourceAddress[] {
  const values = [...new Map(input.map((value) => {
    const address = parseAddress(value);
    return [`${address.sourceKey}\0${address.relativePath}`, address] as const;
  })).values()]
    .filter((address) => !address.relativePath.startsWith('.trash/'))
    .sort((left, right) => (
      left.sourceKey.localeCompare(right.sourceKey)
      || left.relativePath.localeCompare(right.relativePath)
    ));
  return values.filter((address) => !values.some((parent) => (
    parent.sourceKey === address.sourceKey
    && address.relativePath.startsWith(`${parent.relativePath}/`)
  )));
}

function operationIdString(value: unknown): string {
  if (typeof value !== 'string' || !isOperationCorrelationId(value)) {
    throw createKnowledgeWorkspaceError(
      'knowledge_operation_precondition_failed',
      'knowledge operation id is invalid',
    );
  }
  return value;
}

function commitRequestHash(value: unknown): string {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || Object.keys(value).length !== 1
    || !('requestHash' in value)
    || typeof value.requestHash !== 'string'
    || !/^[0-9a-f]{64}$/u.test(value.requestHash)
  ) {
    throw createKnowledgeWorkspaceError(
      'knowledge_operation_precondition_failed',
      'knowledge operation commit request is invalid',
    );
  }
  return value.requestHash;
}

function planFromRecord(
  record: KnowledgeTrashOperationJournalRecord,
): KnowledgeTrashOperationPlan {
  return Object.freeze({
    schemaVersion: 1,
    operationId: record.operationId,
    requestHash: record.requestHash,
    kind: record.kind,
    sourceKey: record.request.sourceKey,
    batchId: record.request.batchId,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    items: publicPlanItems(record.items),
  });
}

function statusFromRecord(
  record: KnowledgeTrashOperationJournalRecord,
): KnowledgeTrashOperationStatus {
  return Object.freeze({
    schemaVersion: 1,
    operationId: record.operationId,
    requestHash: record.requestHash,
    kind: record.kind,
    sourceKey: record.request.sourceKey,
    batchId: record.request.batchId,
    state: record.state,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    items: publicStatusItems(record.items),
    projections: Object.freeze({ ...record.projections }),
  });
}

function publicPlanItems(
  items: readonly KnowledgeTrashOperationJournalItem[],
): KnowledgeTrashOperationPlan['items'] {
  return Object.freeze(items.map((item) => Object.freeze({
    entryId: item.entryId,
    originalAddress: Object.freeze({ ...item.originalAddress }),
    trashAddress: Object.freeze({ ...item.trashAddress }),
    ...(item.targetAddress === undefined
      ? {}
      : { targetAddress: Object.freeze({ ...item.targetAddress }) }),
    resourceKind: item.resourceKind,
    expectedVersion: Object.freeze({ ...item.expectedVersion }),
  })));
}

function publicStatusItems(
  items: readonly KnowledgeTrashOperationJournalItem[],
): Exclude<KnowledgeTrashOperationStatus, KnowledgeTrashOperationResult>['items'] {
  return Object.freeze(items.map((item) => Object.freeze({
    entryId: item.entryId,
    originalAddress: Object.freeze({ ...item.originalAddress }),
    trashAddress: Object.freeze({ ...item.trashAddress }),
    ...(item.targetAddress === undefined
      ? {}
      : { targetAddress: Object.freeze({ ...item.targetAddress }) }),
    resourceKind: item.resourceKind,
    expectedVersion: Object.freeze({ ...item.expectedVersion }),
    state: item.state,
    ...(item.errorCode === undefined ? {} : { errorCode: item.errorCode }),
  })));
}

function operationAddresses(
  record: KnowledgeTrashOperationJournalRecord,
): KnowledgeResourceAddress[] {
  return record.items.flatMap((item) => [
    item.originalAddress,
    item.trashAddress,
    ...(item.targetAddress ? [item.targetAddress] : []),
  ]);
}

function sourceKeyForSelection(selection: readonly KnowledgeResourceAddress[]): string {
  if (selection.length === 0) {
    throw createKnowledgeWorkspaceError(
      'knowledge_operation_precondition_failed',
      'knowledge trash selection is empty',
    );
  }
  const sourceKey = selection[0].sourceKey;
  if (selection.some((address) => address.sourceKey !== sourceKey)) {
    throw createKnowledgeWorkspaceError(
      'knowledge_operation_precondition_failed',
      'knowledge trash selection spans sources',
    );
  }
  return sourceKey;
}

function parseAddress(input: unknown): KnowledgeResourceAddress {
  const parsed = parseKnowledgeResourceAddress(input);
  if (!parsed.ok) {
    throw createKnowledgeWorkspaceError(
      'knowledge_operation_precondition_failed',
      'knowledge trash address is invalid',
    );
  }
  return Object.freeze({ ...parsed.value });
}

function requestItem(
  entry: KnowledgeTrashManifestEntry,
  expectedVersion: ResourceVersion,
): KnowledgeTrashOperationRequestItem {
  return Object.freeze({
    entryId: entry.entryId,
    originalAddress: entry.originalAddress,
    trashAddress: entry.trashAddress,
    resourceKind: entry.kind,
    expectedVersion,
  });
}

function settleDeleteItems(
  items: readonly KnowledgeTrashOperationJournalItem[],
  result: KnowledgeTrashBatchResult,
  outcomeAt: string,
): readonly KnowledgeTrashOperationJournalItem[] {
  const outcomes = new Map(result.items.map((item) => [
    addressKey(item.originalAddress),
    item,
  ]));
  return Object.freeze(items.map((item) => {
    const outcome = outcomes.get(addressKey(item.originalAddress));
    const state: KnowledgeOperationItemState = outcome?.ok ? 'applied' : 'failed';
    return settleRecoveredItem(item, state, outcomeAt, outcome?.errorCode);
  }));
}

function settleRestoreItems(
  items: readonly KnowledgeTrashOperationJournalItem[],
  result: readonly KnowledgeTrashRestoreResult[],
  outcomeAt: string,
): readonly KnowledgeTrashOperationJournalItem[] {
  const outcomes = new Map(result.map((item) => [item.entryId, item]));
  return Object.freeze(items.map((item) => {
    const outcome = outcomes.get(item.entryId);
    const state: KnowledgeOperationItemState = outcome?.ok
        && addressesEqual(outcome.restoredAddress, item.targetAddress)
      ? 'applied'
      : 'failed';
    return settleRecoveredItem(item, state, outcomeAt, outcome?.errorCode);
  }));
}

function findManifestEntry(
  manifest: KnowledgeTrashManifest,
  item: KnowledgeTrashOperationJournalItem,
): KnowledgeTrashManifestEntry | undefined {
  return manifest.entries.find((entry) => (
    entry.entryId === item.entryId
    || entry.trashAddress.relativePath === item.trashAddress.relativePath
  ));
}

function recoveredItemState(
  kind: KnowledgeTrashOperationKind,
  entry: KnowledgeTrashManifestEntry | undefined,
): KnowledgeOperationItemState {
  if (!entry) return 'recovery-required';
  if (kind === 'restore') return entry.state === 'restored' ? 'applied' : 'failed';
  return entry.state === 'trashed' ? 'applied' : 'failed';
}

function appliedProjections(): Readonly<Record<'session' | 'event' | 'index', KnowledgeOperationProjectionState>> {
  return Object.freeze({ session: 'applied', event: 'applied', index: 'applied' });
}

function summarize(items: readonly KnowledgeTrashOperationJournalItem[]): {
  succeeded: number;
  failed: number;
  rolledBack: number;
  recoveryRequired: number;
} {
  return {
    succeeded: items.filter((item) => item.state === 'applied').length,
    failed: items.filter((item) => (
      item.state === 'failed'
      || item.state === 'rolled-back'
      || item.state === 'recovery-required'
    )).length,
    rolledBack: items.filter((item) => item.state === 'rolled-back').length,
    recoveryRequired: items.filter((item) => item.state === 'recovery-required').length,
  };
}

function operationStep(
  kind: 'native-grant' | 'native-dispatch' | 'system-trash',
  state: 'intent' | 'applied' | 'failed',
  at: string,
  errorCode?: string,
) {
  return Object.freeze({
    stepId: `${kind}-${at}`,
    kind,
    state,
    intentAt: at,
    ...(state === 'intent' ? {} : { outcomeAt: at }),
    ...(errorCode === undefined ? {} : { errorCode }),
  });
}

function appendIntentSteps(
  item: KnowledgeTrashOperationJournalItem,
  kinds: readonly KnowledgeTrashOperationStepKind[],
  at: string,
): KnowledgeTrashOperationJournalItem {
  return {
    ...item,
    steps: [
      ...item.steps,
      ...kinds.map((kind, index) => Object.freeze({
        stepId: `${kind}-${at}-${index}`,
        kind,
        state: 'intent' as const,
        intentAt: at,
      })),
    ],
  };
}

function settleRecoveredItem(
  item: KnowledgeTrashOperationJournalItem,
  state: KnowledgeOperationItemState,
  at: string,
  errorCode?: KnowledgeErrorCode,
): KnowledgeTrashOperationJournalItem {
  const stepState = state === 'applied' ? 'applied' as const : 'failed' as const;
  return {
    ...item,
    state,
    ...(errorCode === undefined ? {} : { errorCode }),
    steps: item.steps.map((step) => step.state === 'intent'
      ? {
          ...step,
          state: stepState,
          outcomeAt: at,
          ...(errorCode === undefined ? {} : { errorCode }),
        }
      : step),
  };
}

function trashBatchFromAddress(address: KnowledgeResourceAddress): { batchId: string } {
  const match = /^\.trash\/([0-9a-f-]+)\/payload\//iu.exec(address.relativePath);
  if (!match) {
    throw createKnowledgeWorkspaceError(
      'knowledge_operation_precondition_failed',
      'knowledge system trash address is invalid',
    );
  }
  return { batchId: match[1] };
}

function identitiesEqual(left: ProviderRootIdentity, right: ProviderRootIdentity): boolean {
  return left.providerId === right.providerId
    && left.identityNamespace === right.identityNamespace
    && left.opaqueRootId === right.opaqueRootId
    && left.scopeToken === right.scopeToken
    && left.caseMode === right.caseMode;
}

function ownerFromContext(context: ResourceOperationContext): KnowledgeOperationOwner {
  const principal = context.principal;
  const principalId = stringOrNull(principal?.principalId);
  const studioId = stringOrNull(principal?.studioId);
  if (!principalId || !studioId) {
    throw createKnowledgeWorkspaceError(
      'knowledge_resource_out_of_scope',
      'knowledge trash operation requires authenticated owner and Studio',
    );
  }
  return Object.freeze({
    principalId,
    userId: stringOrNull(principal?.userId),
    studioId,
    sessionId: stringOrNull(context.sessionId ?? principal?.sessionId),
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
      'knowledge_resource_out_of_scope',
      'knowledge trash operation belongs to another owner or session',
    );
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function publicCode(error: unknown): KnowledgeErrorCode {
  return normalizeKnowledgeErrorCode((error as { code?: unknown })?.code)
    ?? 'knowledge_resource_unavailable';
}

function addressKey(address: KnowledgeResourceAddress): string {
  return `${address.sourceKey}\0${address.relativePath}`;
}

function requiredTargetAddress(
  item: KnowledgeTrashOperationJournalItem,
): KnowledgeResourceAddress {
  if (!item.targetAddress) {
    throw createKnowledgeWorkspaceError(
      'knowledge_operation_precondition_failed',
      'knowledge restore target is unavailable',
    );
  }
  return item.targetAddress;
}

function addressesEqual(
  left: KnowledgeResourceAddress | undefined,
  right: KnowledgeResourceAddress | undefined,
): boolean {
  return Boolean(left && right)
    && left?.sourceKey === right?.sourceKey
    && left?.relativePath === right?.relativePath;
}

function basename(relativePath: string): string {
  return relativePath.slice(relativePath.lastIndexOf('/') + 1);
}
