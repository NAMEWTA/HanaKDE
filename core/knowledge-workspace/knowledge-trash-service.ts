import type { KnowledgeResourceAddress, KnowledgeSourceDto } from '../../shared/knowledge-workspace-contract.ts';
import { createKnowledgeWorkspaceError, normalizeKnowledgeErrorCode, type KnowledgeErrorCode } from '../../shared/knowledge-workspace-errors.ts';
import { createKnowledgeOperationId } from '../../lib/knowledge-workspace/knowledge-operation-plan.ts';
import { rewriteKnowledgeMarkdownLinks } from '../../lib/knowledge-workspace/markdown-link-rewriter.ts';
import { isOperationCorrelationId } from '../../shared/knowledge-diagnostics.ts';
import {
  isKnowledgeTrashEntryExpired,
  parseKnowledgeTrashManifest,
  serializeKnowledgeTrashManifest,
  type KnowledgeTrashManifest,
  type KnowledgeTrashManifestEntry,
} from '../../lib/knowledge-workspace/knowledge-trash-manifest.ts';
import type {
  ResourceListResult,
  ResourceMoveResult,
  ResourceMutationResult,
  ResourceOperationContext,
  ResourceReadResult,
  ResourceRef,
  ResourceStat,
  ResourceWriteExpectedVersionResult,
} from '../../lib/resource-io/types.ts';

export type KnowledgeTrashContext = ResourceOperationContext & { signal?: AbortSignal };
export type KnowledgeTrashItemResult = Readonly<{
  entryId: string;
  originalAddress: KnowledgeResourceAddress;
  ok: boolean;
  errorCode?: KnowledgeErrorCode;
}>;
export type KnowledgeTrashBatchResult = Readonly<{
  batchId: string;
  sourceKey: string;
  items: readonly KnowledgeTrashItemResult[];
}>;
export type KnowledgeTrashRestoreResult = Readonly<{
  entryId: string;
  ok: boolean;
  restoredAddress?: KnowledgeResourceAddress;
  errorCode?: KnowledgeErrorCode;
}>;
export type KnowledgeTrashPreparedDeleteItem = Readonly<{
  entryId: string;
  originalAddress: KnowledgeResourceAddress;
  trashAddress: KnowledgeResourceAddress;
  kind: 'file' | 'directory';
  expectedVersion: ResourceStat['version'];
}>;
export type KnowledgeTrashPreparedRestoreItem = Readonly<{
  entryId: string;
  targetAddress: KnowledgeResourceAddress;
  expectedVersion: ResourceStat['version'];
}>;

type SourceRegistrySurface = {
  get(sourceKey: string): KnowledgeSourceDto | null;
  revalidate(sourceKey: string): Promise<void>;
  resolveAddress(address: KnowledgeResourceAddress): Promise<ResourceRef>;
};
type ResourceIoSurface = {
  stat(ref: ResourceRef, context?: ResourceOperationContext): Promise<ResourceStat>;
  read(ref: ResourceRef, context?: ResourceOperationContext): Promise<ResourceReadResult>;
  list(ref: ResourceRef, context?: ResourceOperationContext): Promise<ResourceListResult>;
  mkdir(ref: ResourceRef, context?: ResourceOperationContext & { expectedVersion?: null }): Promise<ResourceMutationResult>;
  move(from: ResourceRef, to: ResourceRef, context?: ResourceOperationContext & {
    expectedSourceVersion?: ResourceStat['version']; expectedTargetVersion?: null;
  }): Promise<ResourceMoveResult>;
  writeExpectedVersion(ref: ResourceRef, content: string | Buffer, expectedVersion: ResourceStat['version'] | null, context?: ResourceOperationContext): Promise<ResourceWriteExpectedVersionResult>;
};

export class KnowledgeTrashService {
  readonly #sourceRegistry: SourceRegistrySurface;
  readonly #resourceIO: ResourceIoSurface;
  readonly #randomUUID: () => string;
  readonly #now: () => Date;

  constructor(input: {
    sourceRegistry: SourceRegistrySurface;
    resourceIO: ResourceIoSurface;
    randomUUID?: () => string;
    now?: () => Date;
  }) {
    this.#sourceRegistry = input.sourceRegistry;
    this.#resourceIO = input.resourceIO;
    this.#randomUUID = input.randomUUID ?? createKnowledgeOperationId;
    this.#now = input.now ?? (() => new Date());
  }

  async trash(addresses: readonly KnowledgeResourceAddress[], context: KnowledgeTrashContext = {}): Promise<KnowledgeTrashBatchResult> {
    throwIfAborted(context.signal);
    const normalized = normalizeSelection(addresses);
    if (normalized.length === 0) throw precondition('knowledge trash selection is empty');
    const sourceKey = normalized[0].sourceKey;
    if (normalized.some(address => address.sourceKey !== sourceKey)) throw precondition('knowledge trash selection spans sources');
    await this.#requireSource(sourceKey);
    // A durable coordinator supplies its operation id so the source manifest
    // and HANA_HOME journal share one opaque recovery key. Direct callers keep
    // the existing independently generated batch id behavior.
    const batchId = isOperationCorrelationId(context.operationId)
      ? context.operationId
      : this.#randomUUID();
    const deletedAt = this.#now().toISOString();
    const candidates: KnowledgeTrashPreparedDeleteItem[] = [];
    for (const [ordinal, originalAddress] of normalized.entries()) {
      const stat = await this.#resourceIO.stat(await this.#sourceRegistry.resolveAddress(originalAddress), context);
      if (!stat.exists || !stat.version) continue;
      const entryId = this.#randomUUID();
      candidates.push(Object.freeze({
        entryId,
        originalAddress: Object.freeze({ ...originalAddress }),
        trashAddress: Object.freeze({
          sourceKey,
          relativePath: `.trash/${batchId}/payload/${String(ordinal + 1).padStart(6, '0')}-${basename(originalAddress.relativePath)}`,
        }),
        kind: stat.isDirectory ? 'directory' : 'file',
        expectedVersion: stat.version,
      }));
    }
    if (candidates.length === 0) throw createKnowledgeWorkspaceError('knowledge_resource_not_found', 'knowledge trash selection does not exist');
    return this.#trashPrepared(batchId, candidates, deletedAt, context);
  }

  async trashPrepared(
    input: Readonly<{
      batchId: string;
      items: readonly KnowledgeTrashPreparedDeleteItem[];
    }>,
    context: KnowledgeTrashContext = {},
  ): Promise<KnowledgeTrashBatchResult> {
    throwIfAborted(context.signal);
    if (!isOperationCorrelationId(input.batchId) || input.items.length === 0) {
      throw precondition('knowledge prepared trash request is invalid');
    }
    const items = validatePreparedDeleteItems(input.batchId, input.items);
    await this.#requireSource(items[0].originalAddress.sourceKey);
    return this.#trashPrepared(input.batchId, items, this.#now().toISOString(), context);
  }

  async #trashPrepared(
    batchId: string,
    prepared: readonly KnowledgeTrashPreparedDeleteItem[],
    deletedAt: string,
    context: KnowledgeTrashContext,
  ): Promise<KnowledgeTrashBatchResult> {
    const sourceKey = prepared[0].originalAddress.sourceKey;
    const expectedVersions = new Map(prepared.map(item => [item.entryId, item.expectedVersion]));
    const candidates: KnowledgeTrashManifestEntry[] = prepared.map(item => Object.freeze({
      entryId: item.entryId,
      originalAddress: Object.freeze({ ...item.originalAddress }),
      trashAddress: Object.freeze({ ...item.trashAddress }),
      kind: item.kind,
      deletedAt,
      state: 'pending' as const,
    }));
    await this.#ensureDirectory(sourceKey, '.trash', context);
    await this.#ensureDirectory(sourceKey, `.trash/${batchId}`, context);
    await this.#ensureDirectory(sourceKey, `.trash/${batchId}/payload`, context);
    let manifest: KnowledgeTrashManifest = Object.freeze({ schemaVersion: 1, batchId, sourceKey, deletedAt, entries: Object.freeze(candidates) });
    let manifestVersion = await this.#writeManifest(manifest, null, context);
    const items: KnowledgeTrashItemResult[] = [];
    for (const entry of manifest.entries) {
      throwIfAborted(context.signal);
      try {
        await this.#sourceRegistry.revalidate(sourceKey);
        const fromRef = await this.#sourceRegistry.resolveAddress(entry.originalAddress);
        const toRef = await this.#sourceRegistry.resolveAddress(entry.trashAddress);
        const sourceStat = await this.#resourceIO.stat(fromRef, context);
        if (!sourceStat.exists || !sourceStat.version) throw createKnowledgeWorkspaceError('knowledge_resource_not_found', 'knowledge trash entry vanished');
        const expectedVersion = expectedVersions.get(entry.entryId);
        if (!expectedVersion || !sameResourceVersion(sourceStat.version, expectedVersion)) {
          throw createKnowledgeWorkspaceError('knowledge_version_conflict', 'knowledge trash entry changed after prepare');
        }
        const targetStat = await this.#resourceIO.stat(toRef, context);
        if (targetStat.exists) throw createKnowledgeWorkspaceError('knowledge_resource_conflict', 'knowledge trash target exists');
        await this.#resourceIO.move(fromRef, toRef, {
          ...context,
          operationId: operationIdForContext(context, batchId),
          emit: false,
          expectedSourceVersion: expectedVersion,
          expectedTargetVersion: null,
        });
        manifest = updateEntry(manifest, entry.entryId, { state: 'trashed' });
        manifestVersion = await this.#writeManifest(manifest, manifestVersion, context);
        items.push(Object.freeze({ entryId: entry.entryId, originalAddress: entry.originalAddress, ok: true }));
      } catch (error) {
        const errorCode = publicCode(error);
        manifest = updateEntry(manifest, entry.entryId, { state: 'failed', errorCode });
        manifestVersion = await this.#writeManifest(manifest, manifestVersion, context);
        items.push(Object.freeze({ entryId: entry.entryId, originalAddress: entry.originalAddress, ok: false, errorCode }));
      }
    }
    return Object.freeze({ batchId, sourceKey, items: Object.freeze(items) });
  }

  async list(sourceKey: string, context: KnowledgeTrashContext = {}): Promise<readonly KnowledgeTrashManifest[]> {
    await this.#requireSource(sourceKey, false);
    const root = await this.#sourceRegistry.resolveAddress({ sourceKey, relativePath: '.trash' });
    const stat = await this.#resourceIO.stat(root, context);
    if (!stat.exists) return Object.freeze([]);
    if (!stat.isDirectory) throw createKnowledgeWorkspaceError('knowledge_resource_out_of_scope', 'knowledge trash root is not a directory');
    const listed = await this.#resourceIO.list(root, context);
    const batches: KnowledgeTrashManifest[] = [];
    for (const item of [...listed.items].sort((a, b) => a.name.localeCompare(b.name))) {
      if (!item.isDirectory) continue;
      try {
        const manifest = await this.#readManifest(sourceKey, item.name, context);
        if (manifest.entries.some(entry => entry.state === 'trashed')) batches.push(manifest);
      } catch {
        // A damaged batch is isolated and never exposed as a normal resource.
      }
    }
    return Object.freeze(batches);
  }

  async readBatch(
    sourceKey: string,
    batchId: string,
    context: KnowledgeTrashContext = {},
  ): Promise<KnowledgeTrashManifest> {
    await this.#requireSource(sourceKey, false);
    return this.#readManifest(sourceKey, batchId, context);
  }

  async recoverBatch(sourceKey: string, batchId: string, context: KnowledgeTrashContext = {}): Promise<KnowledgeTrashManifest> {
    let manifest = await this.#readManifest(sourceKey, batchId, context);
    let changed = false;
    for (const entry of manifest.entries) {
      if (entry.state === 'pending') {
        const [origin, trash] = await Promise.all([
          this.#resourceIO.stat(await this.#sourceRegistry.resolveAddress(entry.originalAddress), context),
          this.#resourceIO.stat(await this.#sourceRegistry.resolveAddress(entry.trashAddress), context),
        ]);
        const state = trash.exists && !origin.exists ? 'trashed' : 'failed';
        manifest = updateEntry(manifest, entry.entryId, {
          state,
          restoreAddress: undefined,
        });
        changed = true;
        continue;
      }
      if (entry.state !== 'restoring' || !entry.restoreAddress) continue;
      const [restored, trash] = await Promise.all([
        this.#resourceIO.stat(await this.#sourceRegistry.resolveAddress(entry.restoreAddress), context),
        this.#resourceIO.stat(await this.#sourceRegistry.resolveAddress(entry.trashAddress), context),
      ]);
      if (!trash.exists && restored.exists) {
        manifest = updateEntry(manifest, entry.entryId, {
          state: 'restored',
          restoreAddress: undefined,
          errorCode: undefined,
        });
        changed = true;
      } else if (trash.exists && !restored.exists) {
        manifest = updateEntry(manifest, entry.entryId, {
          state: 'trashed',
          restoreAddress: undefined,
        });
        changed = true;
      }
    }
    if (changed) {
      const manifestRef = await this.#manifestRef(sourceKey, batchId);
      const stat = await this.#resourceIO.stat(manifestRef, context);
      await this.#writeManifest(manifest, stat.version ?? null, context);
    }
    return manifest;
  }

  async resolveRestoreAddress(
    originalAddress: KnowledgeResourceAddress,
    kind: 'file' | 'directory',
    context: KnowledgeTrashContext = {},
  ): Promise<KnowledgeResourceAddress> {
    await this.#requireSource(originalAddress.sourceKey);
    return this.#availableRestoreAddress(originalAddress, kind, context);
  }

  async restore(sourceKey: string, batchId: string, entryIds?: readonly string[], context: KnowledgeTrashContext = {}): Promise<readonly KnowledgeTrashRestoreResult[]> {
    return this.#restore(sourceKey, batchId, entryIds, context);
  }

  async restorePrepared(
    sourceKey: string,
    batchId: string,
    items: readonly KnowledgeTrashPreparedRestoreItem[],
    context: KnowledgeTrashContext = {},
  ): Promise<readonly KnowledgeTrashRestoreResult[]> {
    const prepared = validatePreparedRestoreItems(sourceKey, items);
    return this.#restore(
      sourceKey,
      batchId,
      prepared.map(item => item.entryId),
      context,
      new Map(prepared.map(item => [item.entryId, item])),
    );
  }

  async recoverRestoredLinks(
    sourceKey: string,
    batchId: string,
    items: readonly Readonly<{
      entryId: string;
      targetAddress: KnowledgeResourceAddress;
    }>[],
    context: KnowledgeTrashContext = {},
  ): Promise<void> {
    const manifest = await this.#readManifest(sourceKey, batchId, context);
    const restored = items.flatMap((item) => {
      const entry = manifest.entries.find((candidate) => (
        candidate.entryId === item.entryId
        && candidate.state === 'restored'
      ));
      return entry ? [{ entry, restoredAddress: item.targetAddress }] : [];
    });
    await this.#rewriteRestoredLinks(restored, context);
  }

  async #restore(
    sourceKey: string,
    batchId: string,
    entryIds: readonly string[] | undefined,
    context: KnowledgeTrashContext,
    preparedTargets?: ReadonlyMap<string, KnowledgeTrashPreparedRestoreItem>,
  ): Promise<readonly KnowledgeTrashRestoreResult[]> {
    let manifest = await this.recoverBatch(sourceKey, batchId, context);
    const selected = new Set(entryIds ?? manifest.entries.filter(entry => entry.state === 'trashed').map(entry => entry.entryId));
    const unknown = [...selected].some(id => !manifest.entries.some(entry => entry.entryId === id && entry.state === 'trashed'));
    if (unknown) throw createKnowledgeWorkspaceError('knowledge_trash_entry_not_found', 'knowledge trash entry not found');
    const manifestRef = await this.#manifestRef(sourceKey, batchId);
    let manifestVersion = (await this.#resourceIO.stat(manifestRef, context)).version ?? null;
    const results: KnowledgeTrashRestoreResult[] = [];
    const restored: Array<{ entry: KnowledgeTrashManifestEntry; restoredAddress: KnowledgeResourceAddress }> = [];
    for (const entry of manifest.entries.filter(candidate => selected.has(candidate.entryId))) {
      throwIfAborted(context.signal);
      let restoreStarted = false;
      let moved = false;
      try {
        const prepared = preparedTargets?.get(entry.entryId);
        const restoredAddress = prepared?.targetAddress
          ?? await this.#availableRestoreAddress(entry.originalAddress, entry.kind, context);
        await this.#ensureParents(restoredAddress, context);
        const targetStat = await this.#resourceIO.stat(
          await this.#sourceRegistry.resolveAddress(restoredAddress),
          context,
        );
        if (targetStat.exists) {
          throw createKnowledgeWorkspaceError('knowledge_resource_conflict', 'knowledge trash restore target exists');
        }
        const trashRef = await this.#sourceRegistry.resolveAddress(entry.trashAddress);
        const stat = await this.#resourceIO.stat(trashRef, context);
        if (!stat.exists || !stat.version) throw createKnowledgeWorkspaceError('knowledge_trash_entry_not_found', 'knowledge trash payload is unavailable');
        if (prepared && !sameResourceVersion(stat.version, prepared.expectedVersion)) {
          throw createKnowledgeWorkspaceError('knowledge_version_conflict', 'knowledge trash payload changed after prepare');
        }
        // Persist the resolved suffix target before moving payload bytes. A
        // restart can then prove whether this restore completed or remained
        // untouched without guessing from a user-visible name.
        manifest = updateEntry(manifest, entry.entryId, {
          state: 'restoring',
          restoreAddress: restoredAddress,
          errorCode: undefined,
        });
        manifestVersion = await this.#writeManifest(manifest, manifestVersion, context);
        restoreStarted = true;
        await this.#resourceIO.move(trashRef, await this.#sourceRegistry.resolveAddress(restoredAddress), {
          ...context,
          operationId: operationIdForContext(context, batchId),
          emit: false,
          expectedSourceVersion: prepared?.expectedVersion ?? stat.version,
          expectedTargetVersion: null,
        });
        moved = true;
        manifest = updateEntry(manifest, entry.entryId, {
          state: 'restored',
          restoreAddress: undefined,
          errorCode: undefined,
        });
        manifestVersion = await this.#writeManifest(manifest, manifestVersion, context);
        restored.push({ entry, restoredAddress });
        results.push(Object.freeze({ entryId: entry.entryId, ok: true, restoredAddress }));
      } catch (error) {
        if (moved) throw error;
        if (restoreStarted) {
          manifest = updateEntry(manifest, entry.entryId, {
            state: 'trashed',
            restoreAddress: undefined,
            errorCode: publicCode(error),
          });
          manifestVersion = await this.#writeManifest(manifest, manifestVersion, context);
        }
        results.push(Object.freeze({ entryId: entry.entryId, ok: false, errorCode: publicCode(error) }));
      }
    }
    await this.#rewriteRestoredLinks(restored, context);
    return Object.freeze(results);
  }

  async cleanup(input: Readonly<{
    sourceKey: string;
    batchId?: string;
    entryIds?: readonly string[];
    expiredOnly?: boolean;
    moveToSystemTrash(address: KnowledgeResourceAddress): Promise<boolean>;
  }>, context: KnowledgeTrashContext = {}): Promise<readonly KnowledgeTrashItemResult[]> {
    const batches = input.batchId ? [await this.#readManifest(input.sourceKey, input.batchId, context)] : await this.list(input.sourceKey, context);
    const selected = input.entryIds ? new Set(input.entryIds) : null;
    const results: KnowledgeTrashItemResult[] = [];
    for (let manifest of batches) {
      const manifestRef = await this.#manifestRef(manifest.sourceKey, manifest.batchId);
      let version = (await this.#resourceIO.stat(manifestRef, context)).version ?? null;
      for (const entry of manifest.entries) {
        if (entry.state !== 'trashed' || (selected && !selected.has(entry.entryId)) || (input.expiredOnly && !isKnowledgeTrashEntryExpired(entry, this.#now().getTime()))) continue;
        let cleaningStarted = false;
        try {
          throwIfAborted(context.signal);
          manifest = updateEntry(manifest, entry.entryId, {
            state: 'cleaning',
            errorCode: undefined,
          });
          version = await this.#writeManifest(manifest, version, context);
          cleaningStarted = true;
          const accepted = await input.moveToSystemTrash(entry.trashAddress);
          if (!accepted) throw createKnowledgeWorkspaceError('knowledge_native_capability_unavailable', 'system trash did not accept the resource');
          manifest = updateEntry(manifest, entry.entryId, { state: 'cleaned', errorCode: undefined });
          version = await this.#writeManifest(manifest, version, context);
          results.push(Object.freeze({ entryId: entry.entryId, originalAddress: entry.originalAddress, ok: true }));
        } catch (error) {
          const errorCode = publicCode(error);
          if (cleaningStarted) {
            manifest = updateEntry(manifest, entry.entryId, { state: 'trashed', errorCode });
            version = await this.#writeManifest(manifest, version, context);
          }
          results.push(Object.freeze({ entryId: entry.entryId, originalAddress: entry.originalAddress, ok: false, errorCode }));
        }
      }
    }
    return Object.freeze(results);
  }

  async completeSystemTrash(address: KnowledgeResourceAddress, context: KnowledgeTrashContext = {}): Promise<void> {
    await this.#updateSystemTrashEntry(
      address,
      { state: 'cleaned', errorCode: undefined },
      context,
      ['cleaning', 'trashed'],
    );
  }

  async beginSystemTrash(address: KnowledgeResourceAddress, context: KnowledgeTrashContext = {}): Promise<void> {
    await this.#updateSystemTrashEntry(
      address,
      { state: 'cleaning', errorCode: undefined },
      context,
      ['trashed'],
    );
  }

  async failSystemTrash(
    address: KnowledgeResourceAddress,
    errorCode: KnowledgeErrorCode,
    context: KnowledgeTrashContext = {},
  ): Promise<void> {
    await this.#updateSystemTrashEntry(
      address,
      { state: 'trashed', errorCode },
      context,
      ['cleaning', 'trashed'],
    );
  }

  /**
   * A native shell action is outside ResourceIO's transaction.  Its terminal
   * receipt therefore needs its own bounded compare-and-swap loop: a watcher
   * or another cleanup request may update the same manifest between read and
   * write, but a failed system-trash action must never silently lose its
   * retained-payload error marker.
   */
  async #updateSystemTrashEntry(
    address: KnowledgeResourceAddress,
    patch: Pick<KnowledgeTrashManifestEntry, 'state' | 'errorCode'>,
    context: KnowledgeTrashContext,
    allowedStates: readonly KnowledgeTrashManifestEntry['state'][],
  ): Promise<void> {
    const match = /^\.trash\/([0-9a-f-]+)\/payload\//iu.exec(address.relativePath);
    if (!match) throw precondition('knowledge system trash address is invalid');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.#sourceRegistry.revalidate(address.sourceKey);
      let manifest = await this.#readManifest(address.sourceKey, match[1], context);
      const entry = manifest.entries.find(candidate => (
        candidate.trashAddress.relativePath === address.relativePath
        && allowedStates.includes(candidate.state)
      ));
      if (!entry) {
        throw createKnowledgeWorkspaceError(
          'knowledge_trash_entry_not_found',
          'knowledge trash entry not found',
        );
      }
      const manifestRef = await this.#manifestRef(address.sourceKey, manifest.batchId);
      const version = (await this.#resourceIO.stat(manifestRef, context)).version ?? null;
      manifest = updateEntry(manifest, entry.entryId, patch);
      try {
        await this.#writeManifest(manifest, version, context);
        const confirmed = await this.#readManifest(address.sourceKey, manifest.batchId, context);
        const confirmedEntry = confirmed.entries.find(candidate => candidate.entryId === entry.entryId);
        if (
          confirmedEntry?.state === patch.state
          && confirmedEntry.errorCode === patch.errorCode
        ) {
          return;
        }
      } catch (error) {
        if (!isKnowledgeVersionConflict(error) || attempt === 2) throw error;
      }
    }
    throw createKnowledgeWorkspaceError(
      'knowledge_version_conflict',
      'knowledge system trash receipt could not be confirmed',
    );
  }

  async #requireSource(sourceKey: string, mutation = true): Promise<KnowledgeSourceDto> {
    await this.#sourceRegistry.revalidate(sourceKey);
    const source = this.#sourceRegistry.get(sourceKey);
    const required = mutation ? ['stat', 'read', 'write', 'list', 'mkdir', 'move', 'trash'] : ['stat', 'read', 'list'];
    if (!source || source.availability !== 'available' || required.some(capability => !source.capabilities.includes(capability as never))) {
      throw createKnowledgeWorkspaceError('knowledge_resource_unavailable', 'knowledge trash source is unavailable');
    }
    return source;
  }
  async #ensureDirectory(sourceKey: string, relativePath: string, context: KnowledgeTrashContext): Promise<void> {
    const ref = await this.#sourceRegistry.resolveAddress({ sourceKey, relativePath });
    const stat = await this.#resourceIO.stat(ref, context);
    if (stat.exists) {
      if (!stat.isDirectory) throw createKnowledgeWorkspaceError('knowledge_resource_out_of_scope', 'knowledge trash boundary is not a directory');
      return;
    }
    await this.#resourceIO.mkdir(ref, { ...context, expectedVersion: null });
  }
  async #ensureParents(address: KnowledgeResourceAddress, context: KnowledgeTrashContext): Promise<void> {
    const parts = address.relativePath.split('/').slice(0, -1);
    for (let index = 1; index <= parts.length; index += 1) {
      const relativePath = parts.slice(0, index).join('/');
      const ref = await this.#sourceRegistry.resolveAddress({ sourceKey: address.sourceKey, relativePath });
      const stat = await this.#resourceIO.stat(ref, context);
      if (stat.exists && !stat.isDirectory) throw createKnowledgeWorkspaceError('knowledge_trash_parent_blocked', 'knowledge trash restore parent is blocked');
      if (!stat.exists) await this.#resourceIO.mkdir(ref, { ...context, expectedVersion: null });
    }
  }
  async #availableRestoreAddress(original: KnowledgeResourceAddress, kind: 'file' | 'directory', context: KnowledgeTrashContext): Promise<KnowledgeResourceAddress> {
    for (let attempt = 1; attempt <= 10_000; attempt += 1) {
      const candidate = attempt === 1 ? original : { ...original, relativePath: suffixPath(original.relativePath, attempt, kind) };
      const stat = await this.#resourceIO.stat(await this.#sourceRegistry.resolveAddress(candidate), context);
      if (!stat.exists) return Object.freeze(candidate);
    }
    throw createKnowledgeWorkspaceError('knowledge_resource_conflict', 'knowledge trash restore suffix space exhausted');
  }
  async #rewriteRestoredLinks(
    restored: readonly Readonly<{ entry: KnowledgeTrashManifestEntry; restoredAddress: KnowledgeResourceAddress }>[],
    context: KnowledgeTrashContext,
  ): Promise<void> {
    if (restored.length < 2) return;
    for (const item of restored) {
      const pages = await this.#restoredMarkdownPages(item.entry.originalAddress, item.restoredAddress, context);
      for (const page of pages) {
        const ref = await this.#sourceRegistry.resolveAddress(page.current);
        const read = await this.#resourceIO.read(ref, context);
        if (!read.version) throw createKnowledgeWorkspaceError('knowledge_link_rewrite_failed', 'restored page version is unavailable');
        const before = read.content.toString('utf8');
        if (!Buffer.from(before, 'utf8').equals(read.content)) {
          throw createKnowledgeWorkspaceError('knowledge_link_rewrite_failed', 'restored page is not UTF-8');
        }
        let source = before;
        for (const target of restored) {
          source = rewriteKnowledgeMarkdownLinks({
            source,
            pageAddress: page.original,
            formatPageAddress: page.current,
            from: target.entry.originalAddress,
            to: target.restoredAddress,
            signal: context.signal,
          }).source;
        }
        if (source === before) continue;
        const write = await this.#resourceIO.writeExpectedVersion(ref, source, read.version, { ...context, emit: false });
        if ('conflict' in write && write.conflict) {
          throw createKnowledgeWorkspaceError('knowledge_link_rewrite_failed', 'restored page changed during link rewrite');
        }
      }
    }
  }
  async #restoredMarkdownPages(
    original: KnowledgeResourceAddress,
    current: KnowledgeResourceAddress,
    context: KnowledgeTrashContext,
  ): Promise<Array<{ original: KnowledgeResourceAddress; current: KnowledgeResourceAddress }>> {
    const result: Array<{ original: KnowledgeResourceAddress; current: KnowledgeResourceAddress }> = [];
    const visit = async (originalAddress: KnowledgeResourceAddress, currentAddress: KnowledgeResourceAddress): Promise<void> => {
      const ref = await this.#sourceRegistry.resolveAddress(currentAddress);
      const stat = await this.#resourceIO.stat(ref, context);
      if (!stat.exists) return;
      if (!stat.isDirectory) {
        if (currentAddress.relativePath.toLocaleLowerCase().endsWith('.md')) result.push({ original: originalAddress, current: currentAddress });
        return;
      }
      const listing = await this.#resourceIO.list(ref, context);
      for (const child of listing.items) {
        await visit(
          { ...originalAddress, relativePath: `${originalAddress.relativePath}/${child.name}` },
          { ...currentAddress, relativePath: `${currentAddress.relativePath}/${child.name}` },
        );
      }
    };
    await visit(original, current);
    return result;
  }
  async #manifestRef(sourceKey: string, batchId: string): Promise<ResourceRef> {
    return this.#sourceRegistry.resolveAddress({ sourceKey, relativePath: `.trash/${batchId}/manifest.json` });
  }
  async #readManifest(sourceKey: string, batchId: string, context: KnowledgeTrashContext): Promise<KnowledgeTrashManifest> {
    const read = await this.#resourceIO.read(await this.#manifestRef(sourceKey, batchId), context);
    return parseKnowledgeTrashManifest(read.content.toString('utf8'));
  }
  async #writeManifest(manifest: KnowledgeTrashManifest, expectedVersion: ResourceStat['version'] | null, context: KnowledgeTrashContext): Promise<ResourceStat['version']> {
    const result = await this.#resourceIO.writeExpectedVersion(
      await this.#manifestRef(manifest.sourceKey, manifest.batchId),
      serializeKnowledgeTrashManifest(manifest),
      expectedVersion,
      {
        ...context,
        emit: false,
        operationId: operationIdForContext(context, manifest.batchId),
      },
    );
    if ('conflict' in result && result.conflict) throw createKnowledgeWorkspaceError('knowledge_version_conflict', 'knowledge trash manifest changed');
    return result.version;
  }
}

function updateEntry(manifest: KnowledgeTrashManifest, entryId: string, patch: Partial<KnowledgeTrashManifestEntry>): KnowledgeTrashManifest {
  return Object.freeze({ ...manifest, entries: Object.freeze(manifest.entries.map(entry => entry.entryId === entryId ? Object.freeze({ ...entry, ...patch }) : entry)) });
}
function normalizeSelection(input: readonly KnowledgeResourceAddress[]): KnowledgeResourceAddress[] {
  const values = [...new Map(input.map(address => [`${address.sourceKey}\0${address.relativePath}`, address])).values()]
    .filter(address => address.relativePath && !address.relativePath.startsWith('.trash/'))
    .sort((a, b) => a.sourceKey.localeCompare(b.sourceKey) || a.relativePath.localeCompare(b.relativePath));
  return values.filter(address => !values.some(parent => parent.sourceKey === address.sourceKey && address.relativePath.startsWith(`${parent.relativePath}/`)));
}
function suffixPath(relativePath: string, attempt: number, kind: 'file' | 'directory'): string {
  const slash = relativePath.lastIndexOf('/');
  const parent = slash < 0 ? '' : relativePath.slice(0, slash + 1);
  const name = slash < 0 ? relativePath : relativePath.slice(slash + 1);
  if (kind === 'directory') return `${parent}${name}_${attempt}`;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${parent}${name.slice(0, dot)}_${attempt}${name.slice(dot)}` : `${parent}${name}_${attempt}`;
}
function basename(relativePath: string): string { return relativePath.slice(relativePath.lastIndexOf('/') + 1); }
function validatePreparedDeleteItems(
  batchId: string,
  input: readonly KnowledgeTrashPreparedDeleteItem[],
): readonly KnowledgeTrashPreparedDeleteItem[] {
  const entryIds = new Set<string>();
  const addressKeys = new Set<string>();
  const sourceKey = input[0]?.originalAddress.sourceKey;
  const items = input.map((item) => {
    const trashPrefix = `.trash/${batchId}/payload/`;
    const addressKey = `${item.originalAddress.sourceKey}\0${item.originalAddress.relativePath}`;
    if (
      !isOperationCorrelationId(item.entryId)
      || entryIds.has(item.entryId)
      || addressKeys.has(addressKey)
      || item.originalAddress.sourceKey !== sourceKey
      || item.trashAddress.sourceKey !== sourceKey
      || item.originalAddress.relativePath.startsWith('.trash/')
      || !item.trashAddress.relativePath.startsWith(trashPrefix)
      || (item.kind !== 'file' && item.kind !== 'directory')
      || !item.expectedVersion
    ) {
      throw precondition('knowledge prepared trash request is invalid');
    }
    entryIds.add(item.entryId);
    addressKeys.add(addressKey);
    return Object.freeze({
      ...item,
      originalAddress: Object.freeze({ ...item.originalAddress }),
      trashAddress: Object.freeze({ ...item.trashAddress }),
      expectedVersion: Object.freeze({ ...item.expectedVersion }),
    });
  });
  return Object.freeze(items);
}
function validatePreparedRestoreItems(
  sourceKey: string,
  input: readonly KnowledgeTrashPreparedRestoreItem[],
): readonly KnowledgeTrashPreparedRestoreItem[] {
  if (input.length === 0) throw precondition('knowledge prepared restore request is invalid');
  const entryIds = new Set<string>();
  const targets = new Set<string>();
  const items = input.map((item) => {
    const targetKey = `${item.targetAddress.sourceKey}\0${item.targetAddress.relativePath}`;
    if (
      !isOperationCorrelationId(item.entryId)
      || entryIds.has(item.entryId)
      || targets.has(targetKey)
      || item.targetAddress.sourceKey !== sourceKey
      || item.targetAddress.relativePath.startsWith('.trash/')
      || !item.expectedVersion
    ) {
      throw precondition('knowledge prepared restore request is invalid');
    }
    entryIds.add(item.entryId);
    targets.add(targetKey);
    return Object.freeze({
      ...item,
      targetAddress: Object.freeze({ ...item.targetAddress }),
      expectedVersion: Object.freeze({ ...item.expectedVersion }),
    });
  });
  return Object.freeze(items);
}
function operationIdForContext(context: KnowledgeTrashContext, fallback: string): string {
  return isOperationCorrelationId(context.operationId) ? context.operationId : fallback;
}
function sameResourceVersion(left: ResourceStat['version'], right: ResourceStat['version']): boolean {
  if (!left || !right) return false;
  const fields = ['mtimeMs', 'size', 'sha256', 'etag', 'sequence'] as const;
  return fields.every(field => left[field] === right[field]);
}
function precondition(message: string) { return createKnowledgeWorkspaceError('knowledge_operation_precondition_failed', message); }
function publicCode(error: unknown): KnowledgeErrorCode {
  return normalizeKnowledgeErrorCode((error as { code?: unknown })?.code) ?? 'knowledge_resource_unavailable';
}
function isKnowledgeVersionConflict(error: unknown): boolean {
  return (error as { code?: unknown })?.code === 'knowledge_version_conflict';
}
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw Object.assign(new Error('knowledge trash operation aborted'), { name: 'AbortError' });
}
