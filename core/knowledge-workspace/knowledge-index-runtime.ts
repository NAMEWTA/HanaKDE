import path from "node:path";
import type { SourceRegistry } from "./source-registry.ts";
import {
  KnowledgeIndexCoordinator,
} from "./knowledge-index-coordinator.ts";
import {
  KnowledgeIndexEventCoordinator,
  ResourceIOKnowledgeIndexSourceReader,
  type KnowledgeIndexScopedRepairRequest,
  type KnowledgeIndexSharedBaselineDifference,
} from "./knowledge-index-event-coordinator.ts";
import {
  MARKDOWN_INDEX_EXTRACTOR_CONTRACT_VERSION,
} from "../../lib/knowledge-workspace/markdown-index-extractor.ts";
import {
  SAFE_TEXT_INDEX_EXTRACTOR_CONTRACT_VERSION,
} from "../../lib/knowledge-workspace/safe-text-index-extractor.ts";
import type {
  KnowledgeIndexHealth,
} from "../../lib/knowledge-workspace/knowledge-index-store.ts";
import type { ResourceEventBus } from "../../lib/resource-io/resource-event-bus.ts";
import type { ResourceIO } from "../../lib/resource-io/resource-io.ts";
import { normalizeResourceRef } from "../../lib/resource-io/resource-refs.ts";
import type {
  ResourceEvent,
  ResourceRef,
} from "../../lib/resource-io/types.ts";

export const KNOWLEDGE_INDEX_EXTRACTOR_CONTRACT_VERSION =
  `${MARKDOWN_INDEX_EXTRACTOR_CONTRACT_VERSION}+${SAFE_TEXT_INDEX_EXTRACTOR_CONTRACT_VERSION}`;

export type KnowledgeIndexSharedBaselinePort = Readonly<{
  subscribe(
    consumer: (input: KnowledgeIndexSharedBaselineDifference) => void,
  ): () => void;
  requestRepair(request: KnowledgeIndexScopedRepairRequest): unknown;
}>;

export type KnowledgeIndexRuntimeOptions = Readonly<{
  hanakoHome: string;
  hostId: string;
  resourceIO: ResourceIO;
  resourceEvents: ResourceEventBus;
  sharedBaseline?: KnowledgeIndexSharedBaselinePort;
  retainWatch?: (resource: ResourceRef) => () => void;
  pid?: number;
}>;

type RuntimeBinding = {
  registry: SourceRegistry;
  coordinator: KnowledgeIndexCoordinator;
  events: KnowledgeIndexEventCoordinator;
  readers: Map<string, ResourceIOKnowledgeIndexSourceReader>;
  roots: Map<string, ResourceRef>;
  eventRoots: Map<string, readonly ResourceRef[]>;
  unavailableMountedSources: Set<string>;
  watchReleases: Map<string, () => void>;
};

export class KnowledgeIndexRuntime {
  readonly #hanakoHome: string;
  readonly #hostId: string;
  readonly #resourceIO: ResourceIO;
  readonly #resourceEvents: ResourceEventBus;
  readonly #sharedBaseline?: KnowledgeIndexSharedBaselinePort;
  readonly #retainWatch?: (resource: ResourceRef) => () => void;
  readonly #pid?: number;
  readonly #unsubscribe: () => void;
  #releaseSharedBaseline: (() => void) | null = null;
  #binding: RuntimeBinding | null = null;
  #tail: Promise<void> = Promise.resolve();
  #disposed = false;

  constructor(options: KnowledgeIndexRuntimeOptions) {
    if (!path.isAbsolute(options.hanakoHome)) {
      throw new TypeError("KnowledgeIndexRuntime requires absolute hanakoHome");
    }
    if (!options.hostId) {
      throw new TypeError("KnowledgeIndexRuntime requires hostId");
    }
    if (
      options.sharedBaseline !== undefined
      && (
        typeof options.sharedBaseline.subscribe !== "function"
        || typeof options.sharedBaseline.requestRepair !== "function"
      )
    ) {
      throw new TypeError("KnowledgeIndexRuntime shared baseline port is invalid");
    }
    if (
      options.retainWatch !== undefined
      && typeof options.retainWatch !== "function"
    ) {
      throw new TypeError("KnowledgeIndexRuntime retainWatch is invalid");
    }
    this.#hanakoHome = options.hanakoHome;
    this.#hostId = options.hostId;
    this.#resourceIO = options.resourceIO;
    this.#resourceEvents = options.resourceEvents;
    this.#sharedBaseline = options.sharedBaseline;
    this.#retainWatch = options.retainWatch;
    this.#pid = options.pid;
    this.#unsubscribe = this.#resourceEvents.subscribe((event) => {
      this.#acceptResourceEvent(event);
    });
  }

  coordinator(): KnowledgeIndexCoordinator | null {
    return this.#binding?.coordinator ?? null;
  }

  bindWorkspace(registry: SourceRegistry): Promise<KnowledgeIndexCoordinator> {
    return this.#runExclusive(async () => {
      if (this.#binding?.registry !== registry) {
        const previous = this.#binding;
        this.#binding = null;
        if (previous) await this.#disposeBinding(previous);
        const readers = new Map<string, ResourceIOKnowledgeIndexSourceReader>();
        const roots = new Map<string, ResourceRef>();
        const eventRoots = new Map<string, readonly ResourceRef[]>();
        const unavailableMountedSources = new Set<string>();
        const watchReleases = new Map<string, () => void>();
        const coordinator = new KnowledgeIndexCoordinator({
          hanakoHome: this.#hanakoHome,
          workspaceIdentity: registry.rootIdentity("main"),
          sourceRegistry: registry,
          extractorContractVersion: KNOWLEDGE_INDEX_EXTRACTOR_CONTRACT_VERSION,
          hostId: this.#hostId,
          ...(this.#pid === undefined ? {} : { pid: this.#pid }),
        });
        const events = new KnowledgeIndexEventCoordinator({
          indexCoordinator: coordinator,
          sourceFor(sourceKey) {
            const reader = readers.get(sourceKey);
            if (!reader) throw new Error("knowledge_index_source_unavailable");
            return reader;
          },
          initialSequenceFor: () => this.#resourceEvents.latestSequence(),
          onScopedRepairRequested: this.#sharedBaseline
            ? (request) => this.#requestSharedRepair(request)
            : undefined,
          repairModeFor: (sourceKey) =>
            registry.get(sourceKey)?.role === "mounted" ? "mounted" : "shared",
        });
        this.#binding = {
          registry,
          coordinator,
          events,
          readers,
          roots,
          eventRoots,
          unavailableMountedSources,
          watchReleases,
        };
      }
      const addedSourceKeys = await this.#syncSources(this.#binding!);
      this.#subscribeSharedBaseline();
      for (const sourceKey of addedSourceKeys) {
        this.#activateSource(this.#binding!, sourceKey);
      }
      return this.#binding!.coordinator;
    });
  }

  async rebuild(
    sourceKey: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<KnowledgeIndexHealth> {
    await this.#tail;
    this.#assertActive();
    const binding = this.#binding;
    if (!binding || !binding.registry.get(sourceKey)) {
      throw new Error("knowledge_index_source_unavailable");
    }
    if (binding.unavailableMountedSources.has(sourceKey)) {
      throw mountedWatchUnavailable();
    }
    await binding.events.rebuild(sourceKey, {
      signal: options.signal,
      reason: "requested",
    });
    return binding.coordinator.health(sourceKey);
  }

  dispose(): Promise<void> {
    if (this.#disposed) return this.#tail;
    this.#disposed = true;
    this.#unsubscribe();
    this.#releaseSharedBaseline?.();
    this.#releaseSharedBaseline = null;
    return this.#runExclusive(async () => {
      const binding = this.#binding;
      this.#binding = null;
      if (binding) await this.#disposeBinding(binding);
    }, true);
  }

  async #syncSources(binding: RuntimeBinding): Promise<readonly string[]> {
    const activeKeys = new Set(
      binding.registry.list().map((source) => source.sourceKey),
    );
    for (const sourceKey of [...binding.readers.keys()]) {
      if (activeKeys.has(sourceKey)) continue;
      binding.watchReleases.get(sourceKey)?.();
      binding.watchReleases.delete(sourceKey);
      binding.readers.delete(sourceKey);
      binding.roots.delete(sourceKey);
      binding.eventRoots.delete(sourceKey);
      binding.unavailableMountedSources.delete(sourceKey);
      await binding.events.dispose(sourceKey);
    }
    const addedSourceKeys: string[] = [];
    for (const sourceKey of activeKeys) {
      if (binding.readers.has(sourceKey)) continue;
      const registeredRoot = binding.registry.rootRef(sourceKey);
      let root = registeredRoot;
      try {
        const rootStat = await this.#resourceIO.stat(registeredRoot, {
          auditRead: true,
          reason: "knowledge-index-source-bind",
        });
        if (
          registeredRoot.kind === "local-file"
          && rootStat.exists
          && rootStat.isDirectory
        ) {
          root = normalizeResourceRef(rootStat.resource);
        }
      } catch {
        // The background rebuild reports source availability. Binding remains
        // usable so source listing and an older generation can still work.
      }
      binding.roots.set(sourceKey, root);
      const sourceEventRoots = Object.freeze([registeredRoot, root]);
      binding.eventRoots.set(sourceKey, sourceEventRoots);
      binding.readers.set(sourceKey, new ResourceIOKnowledgeIndexSourceReader({
        resourceIO: this.#resourceIO,
        root,
        eventRoots: sourceEventRoots,
        resolveAddress: (relativePath) =>
          binding.registry.resolveAddressAfterRevalidation({
            sourceKey,
            relativePath,
          }),
        revalidate: () => binding.registry.revalidate(sourceKey),
      }));
      addedSourceKeys.push(sourceKey);
    }
    return Object.freeze(addedSourceKeys);
  }

  #activateSource(binding: RuntimeBinding, sourceKey: string): void {
    const source = binding.registry.get(sourceKey);
    const root = binding.roots.get(sourceKey);
    if (!source || !root || !binding.readers.has(sourceKey)) return;
    if (source.role === "mounted") {
      if (!source.capabilities.includes("watch") || !this.#retainWatch) {
        binding.unavailableMountedSources.add(sourceKey);
        binding.coordinator.markDegraded(
          sourceKey,
          "knowledge_index_mounted_watch_unavailable",
        );
        return;
      }
      try {
        binding.watchReleases.set(sourceKey, this.#retainWatch(root));
      } catch (error) {
        binding.readers.delete(sourceKey);
        binding.roots.delete(sourceKey);
        binding.eventRoots.delete(sourceKey);
        throw error;
      }
      void binding.events.rebuild(sourceKey, {
        reason: "source_bound",
      }).catch(() => {
        // Mount indexing is a derived projection and must not block source use.
      });
      return;
    }
    binding.events.requestRepair(sourceKey, "source_bound");
  }

  async #disposeBinding(binding: RuntimeBinding): Promise<void> {
    for (const release of binding.watchReleases.values()) {
      try {
        release();
      } catch {
        // Continue retiring every lease when a watcher adapter is already down.
      }
    }
    binding.watchReleases.clear();
    await binding.events.dispose();
  }

  #requestSharedRepair(request: KnowledgeIndexScopedRepairRequest): unknown {
    return this.#sharedBaseline?.requestRepair(request);
  }

  #subscribeSharedBaseline(): void {
    if (!this.#sharedBaseline || this.#releaseSharedBaseline) return;
    this.#releaseSharedBaseline = this.#sharedBaseline.subscribe((input) => {
      this.#acceptSharedBaseline(input);
    });
  }

  #acceptSharedBaseline(input: KnowledgeIndexSharedBaselineDifference): void {
    const binding = this.#binding;
    const source = binding?.registry.get(input.sourceKey);
    if (!binding || this.#disposed || source?.role !== "main") {
      return;
    }
    void binding.events.acceptSharedBaseline(input).catch(() => {
      // A failed derived projection must not fail the shared observation owner.
    });
  }

  #acceptResourceEvent(event: ResourceEvent): void {
    const binding = this.#binding;
    if (!binding || this.#disposed) return;
    for (const [sourceKey, reader] of binding.readers) {
      if (binding.unavailableMountedSources.has(sourceKey)) continue;
      try {
        if (
          reader.eventPaths(event).length > 0
          || eventTouchesRoot(event, binding.eventRoots.get(sourceKey))
        ) {
          binding.events.accept(sourceKey, event);
        } else {
          binding.events.observe(sourceKey, event);
        }
      } catch {
        binding.events.requestRepair(sourceKey, "event_dispatch_failed");
      }
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("knowledge index runtime is disposed");
  }

  #runExclusive<T>(task: () => Promise<T>, allowDisposed = false): Promise<T> {
    const run = this.#tail.then(async () => {
      if (!allowDisposed) this.#assertActive();
      return task();
    }, async () => {
      if (!allowDisposed) this.#assertActive();
      return task();
    });
    this.#tail = run.then(() => {}, () => {});
    return run;
  }
}

function eventTouchesRoot(
  event: ResourceEvent,
  roots?: readonly ResourceRef[],
): boolean {
  if (!roots?.length) return false;
  const resources = event.type === "resource.renamed"
    ? [event.oldResource, event.newResource]
    : [event.resource];
  return resources.some((resource) => roots.some((root) => {
    if (root.kind === "local-file" && resource.kind === "local-file") {
      return path.resolve(root.path) === path.resolve(resource.path);
    }
    if (root.kind === "mount" && resource.kind === "mount") {
      return root.mountId === resource.mountId
        && slashPath(root.path) === slashPath(resource.path);
    }
    return false;
  }));
}

function slashPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function mountedWatchUnavailable(): Error {
  return Object.assign(
    new Error("knowledge index mounted source requires canonical watch"),
    { code: "knowledge_index_mounted_watch_unavailable" },
  );
}
