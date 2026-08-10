import crypto from "node:crypto";
import {
  KnowledgeIndexStore,
  type KnowledgeIndexFileSystem,
  type KnowledgeIndexHealth,
  type KnowledgeIndexIncrementalChange,
  type KnowledgeIndexRebuild,
  type KnowledgeIndexResourceDocument,
} from "../../lib/knowledge-workspace/knowledge-index-store.ts";
import type {
  ProviderRootIdentity,
} from "../../lib/resource-io/types.ts";
import {
  createKnowledgeWorkspaceError,
} from "../../shared/knowledge-workspace-errors.ts";

type IndexSourceRegistry = {
  rootIdentity(sourceKey: string): ProviderRootIdentity;
  revalidate(sourceKey: string): Promise<void>;
};

type CoordinatorOptions = {
  hanakoHome: string;
  workspaceIdentity: ProviderRootIdentity;
  sourceRegistry: IndexSourceRegistry;
  extractorContractVersion: string;
  hostId: string;
  pid?: number;
  now?: () => number;
  processIsAlive?: (pid: number) => boolean;
  fileSystem?: KnowledgeIndexFileSystem;
};

type StoreBinding = {
  sourceFingerprint: string;
  store: KnowledgeIndexStore;
};

export class KnowledgeIndexCoordinator {
  readonly #hanakoHome: string;
  readonly #workspaceFingerprint: string;
  readonly #sourceRegistry: IndexSourceRegistry;
  readonly #extractorContractVersion: string;
  readonly #hostId: string;
  readonly #pid?: number;
  readonly #now?: () => number;
  readonly #processIsAlive?: (pid: number) => boolean;
  readonly #fileSystem?: KnowledgeIndexFileSystem;
  readonly #stores = new Map<string, StoreBinding>();

  constructor(options: CoordinatorOptions) {
    this.#hanakoHome = options.hanakoHome;
    this.#workspaceFingerprint = fingerprintProviderRootIdentity(
      options.workspaceIdentity,
    );
    this.#sourceRegistry = options.sourceRegistry;
    this.#extractorContractVersion = options.extractorContractVersion;
    this.#hostId = options.hostId;
    this.#pid = options.pid;
    this.#now = options.now;
    this.#processIsAlive = options.processIsAlive;
    this.#fileSystem = options.fileSystem;
  }

  health(sourceKey: string): KnowledgeIndexHealth {
    return this.#storeForCurrentIdentity(sourceKey).health();
  }

  acquireQueryLease(sourceKey: string) {
    return this.#storeForCurrentIdentity(sourceKey).acquireQueryLease();
  }

  async applyIncremental(
    sourceKey: string,
    input: {
      lastCompleteSequence: number;
      changes: readonly KnowledgeIndexIncrementalChange[];
    },
  ): Promise<void> {
    await this.#sourceRegistry.revalidate(sourceKey);
    const identity = this.#sourceRegistry.rootIdentity(sourceKey);
    const sourceFingerprint = fingerprintProviderRootIdentity(identity);
    const store = this.#storeForIdentity(sourceKey, sourceFingerprint);
    store.applyIncremental(input);
  }

  async advanceSequence(
    sourceKey: string,
    lastCompleteSequence: number,
  ): Promise<void> {
    await this.#sourceRegistry.revalidate(sourceKey);
    const identity = this.#sourceRegistry.rootIdentity(sourceKey);
    const sourceFingerprint = fingerprintProviderRootIdentity(identity);
    const store = this.#storeForIdentity(sourceKey, sourceFingerprint);
    store.advanceSequence(lastCompleteSequence);
  }

  markDegraded(sourceKey: string, reason: string): void {
    const existing = this.#stores.get(sourceKey);
    if (existing) {
      existing.store.markDegraded(reason);
      return;
    }
    this.#storeForCurrentIdentity(sourceKey).markDegraded(reason);
  }

  clearDegraded(sourceKey: string): void {
    const existing = this.#stores.get(sourceKey);
    if (existing) {
      existing.store.clearDegraded();
      return;
    }
    this.#storeForCurrentIdentity(sourceKey).clearDegraded();
  }

  async beginRebuild(
    sourceKey: string,
    input: {
      rebuildId: string;
      generationId: string;
      startedSequence: number;
      signal?: AbortSignal;
    },
  ): Promise<CoordinatedKnowledgeIndexRebuild> {
    await this.#sourceRegistry.revalidate(sourceKey);
    const identity = this.#sourceRegistry.rootIdentity(sourceKey);
    const sourceFingerprint = fingerprintProviderRootIdentity(identity);
    const store = this.#storeForIdentity(sourceKey, sourceFingerprint);
    const rebuild = store.beginRebuild(input);
    return new CoordinatedKnowledgeIndexRebuild({
      sourceKey,
      sourceFingerprint,
      sourceRegistry: this.#sourceRegistry,
      rebuild,
    });
  }

  #storeForCurrentIdentity(sourceKey: string): KnowledgeIndexStore {
    const identity = this.#sourceRegistry.rootIdentity(sourceKey);
    return this.#storeForIdentity(
      sourceKey,
      fingerprintProviderRootIdentity(identity),
    );
  }

  #storeForIdentity(
    sourceKey: string,
    sourceFingerprint: string,
  ): KnowledgeIndexStore {
    const existing = this.#stores.get(sourceKey);
    if (existing) {
      if (existing.sourceFingerprint !== sourceFingerprint) {
        throw createKnowledgeWorkspaceError(
          "source_root_identity_unprovable",
          "knowledge index source identity changed",
        );
      }
      return existing.store;
    }
    const store = new KnowledgeIndexStore({
      hanakoHome: this.#hanakoHome,
      workspaceFingerprint: this.#workspaceFingerprint,
      sourceFingerprint,
      extractorContractVersion: this.#extractorContractVersion,
      hostId: this.#hostId,
      ...(this.#pid === undefined ? {} : { pid: this.#pid }),
      ...(this.#now === undefined ? {} : { now: this.#now }),
      ...(this.#processIsAlive === undefined
        ? {}
        : { processIsAlive: this.#processIsAlive }),
      ...(this.#fileSystem === undefined
        ? {}
        : { fileSystem: this.#fileSystem }),
    });
    this.#stores.set(sourceKey, { sourceFingerprint, store });
    return store;
  }
}

export class CoordinatedKnowledgeIndexRebuild {
  readonly #sourceKey: string;
  readonly #sourceFingerprint: string;
  readonly #sourceRegistry: IndexSourceRegistry;
  readonly #rebuild: KnowledgeIndexRebuild;

  constructor(options: {
    sourceKey: string;
    sourceFingerprint: string;
    sourceRegistry: IndexSourceRegistry;
    rebuild: KnowledgeIndexRebuild;
  }) {
    this.#sourceKey = options.sourceKey;
    this.#sourceFingerprint = options.sourceFingerprint;
    this.#sourceRegistry = options.sourceRegistry;
    this.#rebuild = options.rebuild;
  }

  setProgress(progress: number): void {
    this.#rebuild.setProgress(progress);
  }

  replaceResource(document: KnowledgeIndexResourceDocument): void {
    this.#rebuild.replaceResource(document);
  }

  replaceResources(documents: readonly KnowledgeIndexResourceDocument[]): void {
    this.#rebuild.replaceResources(documents);
  }

  deleteResource(relativePath: string): void {
    this.#rebuild.deleteResource(relativePath);
  }

  async publish({ lastCompleteSequence }: {
    lastCompleteSequence: number;
  }): Promise<void> {
    try {
      await this.#sourceRegistry.revalidate(this.#sourceKey);
      const current = fingerprintProviderRootIdentity(
        this.#sourceRegistry.rootIdentity(this.#sourceKey),
      );
      if (current !== this.#sourceFingerprint) {
        throw createKnowledgeWorkspaceError(
          "source_root_identity_unprovable",
          "knowledge index source identity changed",
        );
      }
      this.#rebuild.publish({ lastCompleteSequence });
    } catch (error) {
      this.#rebuild.cancel();
      throw error;
    }
  }

  cancel(): void {
    this.#rebuild.cancel();
  }
}

export function fingerprintProviderRootIdentity(
  identity: ProviderRootIdentity,
): string {
  if (
    !identity
    || typeof identity !== "object"
    || typeof identity.providerId !== "string"
    || typeof identity.identityNamespace !== "string"
    || typeof identity.opaqueRootId !== "string"
    || typeof identity.scopeToken !== "string"
    || !["sensitive", "insensitive", "unknown"].includes(identity.caseMode)
  ) {
    throw new TypeError("provider root identity is invalid");
  }
  const canonical = JSON.stringify([
    identity.providerId,
    identity.identityNamespace,
    identity.opaqueRootId,
    identity.scopeToken,
    identity.caseMode,
  ]);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}
