import path from "node:path";
import type { SourceRegistry } from "./source-registry.ts";
import {
  KnowledgeIndexCoordinator,
} from "./knowledge-index-coordinator.ts";
import {
  KnowledgeIndexEventCoordinator,
  ResourceIOKnowledgeIndexSourceReader,
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

type RuntimeOptions = Readonly<{
  hanakoHome: string;
  hostId: string;
  resourceIO: ResourceIO;
  resourceEvents: ResourceEventBus;
  retainWatch(resource: ResourceRef): () => void;
  pid?: number;
}>;

type RuntimeBinding = {
  registry: SourceRegistry;
  coordinator: KnowledgeIndexCoordinator;
  events: KnowledgeIndexEventCoordinator;
  readers: Map<string, ResourceIOKnowledgeIndexSourceReader>;
  roots: Map<string, ResourceRef>;
  watchReleases: Map<string, () => void>;
};

export class KnowledgeIndexRuntime {
  readonly #hanakoHome: string;
  readonly #hostId: string;
  readonly #resourceIO: ResourceIO;
  readonly #resourceEvents: ResourceEventBus;
  readonly #retainWatch: (resource: ResourceRef) => () => void;
  readonly #pid?: number;
  readonly #unsubscribe: () => void;
  #binding: RuntimeBinding | null = null;
  #tail: Promise<void> = Promise.resolve();
  #disposed = false;

  constructor(options: RuntimeOptions) {
    if (!path.isAbsolute(options.hanakoHome)) {
      throw new TypeError("KnowledgeIndexRuntime requires absolute hanakoHome");
    }
    if (!options.hostId) {
      throw new TypeError("KnowledgeIndexRuntime requires hostId");
    }
    if (typeof options.retainWatch !== "function") {
      throw new TypeError("KnowledgeIndexRuntime requires ResourceWatchRegistry");
    }
    this.#hanakoHome = options.hanakoHome;
    this.#hostId = options.hostId;
    this.#resourceIO = options.resourceIO;
    this.#resourceEvents = options.resourceEvents;
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
        });
        this.#binding = {
          registry,
          coordinator,
          events,
          readers,
          roots,
          watchReleases,
        };
      }
      await this.#syncSources(this.#binding!);
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
    return this.#runExclusive(async () => {
      const binding = this.#binding;
      this.#binding = null;
      if (binding) await this.#disposeBinding(binding);
    }, true);
  }

  async #syncSources(binding: RuntimeBinding): Promise<void> {
    const activeKeys = new Set(
      binding.registry.list().map((source) => source.sourceKey),
    );
    for (const sourceKey of [...binding.readers.keys()]) {
      if (activeKeys.has(sourceKey)) continue;
      binding.watchReleases.get(sourceKey)?.();
      binding.watchReleases.delete(sourceKey);
      binding.readers.delete(sourceKey);
      binding.roots.delete(sourceKey);
      await binding.events.dispose(sourceKey);
    }
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
      binding.readers.set(sourceKey, new ResourceIOKnowledgeIndexSourceReader({
        resourceIO: this.#resourceIO,
        root,
        resolveAddress: (relativePath) =>
          binding.registry.resolveAddressAfterRevalidation({
            sourceKey,
            relativePath,
          }),
        revalidate: () => binding.registry.revalidate(sourceKey),
      }));
      const source = binding.registry.get(sourceKey);
      if (source?.capabilities.includes("watch")) {
        try {
          binding.watchReleases.set(sourceKey, this.#retainWatch(root));
        } catch (error) {
          binding.readers.delete(sourceKey);
          binding.roots.delete(sourceKey);
          throw error;
        }
      }
      void binding.events.rebuild(sourceKey, {
        reason: "source_bound",
      }).catch(() => {
        // Health carries a sanitized degraded/unavailable state. Background
        // indexing must never block source registration or workspace access.
      });
    }
  }

  async #disposeBinding(binding: RuntimeBinding): Promise<void> {
    for (const release of binding.watchReleases.values()) {
      try {
        release();
      } catch {
        // The binding is already being retired. Continue releasing every
        // source and let coordinator disposal close index work deterministically.
      }
    }
    binding.watchReleases.clear();
    await binding.events.dispose();
  }

  #acceptResourceEvent(event: ResourceEvent): void {
    const binding = this.#binding;
    if (!binding || this.#disposed) return;
    for (const [sourceKey, reader] of binding.readers) {
      try {
        if (
          reader.eventPaths(event).length > 0
          || eventTouchesRoot(event, binding.roots.get(sourceKey))
        ) {
          binding.events.accept(sourceKey, event);
        } else {
          binding.events.observe(sourceKey, event);
        }
      } catch {
        void binding.events.rebuild(sourceKey, {
          reason: "event_dispatch_failed",
        }).catch(() => {});
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

function eventTouchesRoot(event: ResourceEvent, root?: ResourceRef): boolean {
  if (!root) return false;
  const resources = event.type === "resource.renamed"
    ? [event.oldResource, event.newResource]
    : [event.resource];
  return resources.some((resource) => {
    if (root.kind === "local-file" && resource.kind === "local-file") {
      return path.resolve(root.path) === path.resolve(resource.path);
    }
    if (root.kind === "mount" && resource.kind === "mount") {
      return root.mountId === resource.mountId
        && slashPath(root.path) === slashPath(resource.path);
    }
    return false;
  });
}

function slashPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}
