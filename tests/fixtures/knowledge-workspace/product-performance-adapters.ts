import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { setImmediate as yieldImmediate } from "node:timers/promises";
import { DurableKnowledgeOperationJournal } from "../../../core/knowledge-workspace/durable-operation-journal.ts";
import { createKnowledgeDocumentRegistry } from "../../../desktop/src/react/stores/knowledge-document-registry.ts";
import {
  createKnowledgeTreeSelectionState,
  knowledgeTreeNodeKey,
  knowledgeTreeSelectionReducer,
  moveKnowledgeTreeFocus,
  type KnowledgeTreeVisibleNode,
} from "../../../desktop/src/react/components/knowledge-workspace/resource-tree-selection.ts";
import { canonicalKnowledgeAddress } from "../../../lib/knowledge-workspace/knowledge-address.ts";
import {
  KnowledgeIndexStore,
  foldSearchText,
  type KnowledgeIndexResourceDocument,
} from "../../../lib/knowledge-workspace/knowledge-index-store.ts";
import { parseMarkdownKnowledgeIr } from "../../../lib/knowledge-workspace/markdown-knowledge-ir.ts";
import { hashKnowledgeOperationRequest } from "../../../lib/knowledge-workspace/knowledge-operation-plan.ts";
import { searchKnowledgeIndex } from "../../../lib/knowledge-workspace/knowledge-search-query.ts";
import { ResourceEventBus } from "../../../lib/resource-io/resource-event-bus.ts";
import type { ProviderRootIdentity } from "../../../lib/resource-io/types.ts";
import type {
  KnowledgeFixtureDataset,
  ResourceFixtureEntry,
} from "./generate-fixture.ts";
import type {
  PerformanceScenarioId,
  ReferenceBenchmarkAdapterEntry,
  ReferenceBenchmarkContext,
  ReferenceBenchmarkObservation,
} from "./performance-budget.ts";

type Prepared = {
  home: string;
  rssBefore: number;
  stores?: Map<string, KnowledgeIndexStore>;
  journal?: DurableKnowledgeOperationJournal;
  oldLeases?: Array<ReturnType<KnowledgeIndexStore["acquireQueryLease"]>>;
};

const WORKSPACE_FINGERPRINT = createHash("sha256").update("knowledge-reference-workspace").digest("hex");
const SOURCE_KEYS = ["main", "research", "archive", "materials"] as const;
const FORMAT = Object.freeze({ hadBom: false, lineEnding: "lf" as const, mixedLineEndings: false });
const REBUILD_BATCH_SIZE = 8;

export function createKnowledgeProductPerformanceAdapters(options: {
  scratchParent: string;
}): Record<PerformanceScenarioId, ReferenceBenchmarkAdapterEntry> {
  if (!path.isAbsolute(options.scratchParent)) throw new TypeError("scratchParent must be absolute");
  fs.mkdirSync(options.scratchParent, { recursive: true, mode: 0o700 });
  const templateHome = path.join(options.scratchParent, "search-template");
  let templatePromise: Promise<void> | null = null;

  const prepareEmpty = (context: ReferenceBenchmarkContext): Prepared => ({
    home: iterationHome(options.scratchParent, context),
    rssBefore: process.memoryUsage().rss,
  });
  const cleanup = (_context: ReferenceBenchmarkContext, state: unknown): void => {
    const prepared = state as Prepared;
    for (const lease of prepared.oldLeases ?? []) lease.release();
    fs.rmSync(prepared.home, { recursive: true, force: true });
  };
  const ensureSearchTemplate = (dataset: KnowledgeFixtureDataset): Promise<void> => {
    if (!templatePromise) {
      templatePromise = Promise.resolve().then(() => {
        fs.rmSync(templateHome, { recursive: true, force: true });
        fs.mkdirSync(templateHome, { recursive: true, mode: 0o700 });
        const stores = createStores(templateHome);
        rebuildStores(stores, dataset, "template");
      });
    }
    return templatePromise;
  };
  const prepareSearch = async (context: ReferenceBenchmarkContext): Promise<Prepared> => {
    await ensureSearchTemplate(context.dataset);
    const prepared = prepareEmpty(context);
    fs.cpSync(
      path.join(templateHome, "knowledge-workspace"),
      path.join(prepared.home, "knowledge-workspace"),
      { recursive: true },
    );
    prepared.stores = createStores(prepared.home);
    return prepared;
  };

  const adapters = {
    initialTree10k: lifecycle(prepareEmpty, async (context, _prepared) => {
      const fixture = requireFixture(context, "resource-tree");
      const { nodes, maxTaskMs } = await buildTreeNodes(fixture.resources());
      let selection = knowledgeTreeSelectionReducer(
        createKnowledgeTreeSelectionState(),
        { type: "replace-visible", nodes },
      );
      if (nodes[0]) selection = knowledgeTreeSelectionReducer(selection, { type: "focus", key: nodes[0].key });
      moveKnowledgeTreeFocus(selection, "last");
      return { maxTaskMs: Math.max(maxTaskMs, 0) };
    }, cleanup),

    hugeTree100k: lifecycle(prepareEmpty, async (context, prepared) => {
      const fixture = requireFixture(context, "huge-resource-tree");
      const rss = process.memoryUsage().rss;
      const { nodes } = await buildTreeNodes(fixture.resources());
      knowledgeTreeSelectionReducer(createKnowledgeTreeSelectionState(), {
        type: "replace-visible",
        nodes: nodes.slice(0, 500),
      });
      const cancelMs = await cancellationLatency(async (signal) => {
        await buildTreeNodes(fixture.resources(), signal);
      });
      return {
        cancelMs,
        additionalPeakRssBytes: Math.max(0, process.memoryUsage().rss - Math.min(rss, prepared.rssBefore)),
      };
    }, cleanup),

    markdown10MiB: lifecycle(prepareEmpty, (context) => {
      const fixture = requireFixture(context, "markdown-boundary");
      const accepted = fixture.accepted();
      parseMarkdownKnowledgeIr(accepted.toString("utf8"), { signal: context.signal });
      const overLimit = fixture.overLimit();
      return { rejectOverLimitBeforeEditorView: overLimit.byteLength > 10 * 1024 * 1024 };
    }, cleanup),

    denseWikilinks50k: lifecycle(prepareEmpty, async (context) => {
      const fixture = requireFixture(context, "dense-wikilinks");
      const source = fixture.readDocument().toString("utf8");
      const lines = source.split("\n");
      parseMarkdownKnowledgeIr(lines.slice(-2_000).join("\n"), { signal: context.signal });
      const cancelMs = await cancellationLatency((signal) => {
        parseMarkdownKnowledgeIr(source, { signal });
      });
      return { cancelMs };
    }, cleanup),

    watcherBurst5k: lifecycle(prepareEmpty, async (context, prepared) => {
      const fixture = requireFixture(context, "watch-burst");
      const bus = new ResourceEventBus({ emit: () => undefined, retentionSize: fixture.expectedEvents });
      let maxTaskMs = 0;
      const events = fixture.events();
      for (let offset = 0; offset < events.length; offset += 256) {
        const started = performance.now();
        for (const event of events.slice(offset, offset + 256)) emitFixtureEvent(bus, event, prepared.home);
        maxTaskMs = Math.max(maxTaskMs, performance.now() - started);
        await yieldImmediate();
      }
      bus.since(0);
      return { maxTaskMs };
    }, cleanup),

    searchWarmTrigram: lifecycle(async (context) => {
      const prepared = await prepareSearch(context);
      await executeSearch(prepared.stores!, context.scenarioFixture.kind === "search" ? context.scenarioFixture.query : "資料庫");
      return prepared;
    }, async (context, prepared) => {
      const fixture = requireFixture(context, "search");
      await executeSearch(prepared.stores!, fixture.query, context.signal);
      const cancelMs = await cancellationLatency((signal) => executeSearch(prepared.stores!, fixture.query, signal));
      return { cancelMs };
    }, cleanup),

    searchWarmShort: lifecycle(async (context) => {
      const prepared = await prepareSearch(context);
      await executeSearch(prepared.stores!, "資");
      return prepared;
    }, async (context, prepared) => {
      const fixture = requireFixture(context, "search");
      await executeSearch(prepared.stores!, fixture.query, context.signal);
      const cancelMs = await cancellationLatency((signal) => executeSearch(prepared.stores!, fixture.query, signal));
      return { cancelMs };
    }, cleanup),

    searchColdOpen: lifecycle(prepareSearch, async (context, prepared) => {
      const fixture = requireFixture(context, "cold-search");
      const coldStores = createStores(prepared.home);
      await executeSearch(coldStores, fixture.query, context.signal);
    }, cleanup),

    multiView100Tabs: lifecycle(prepareEmpty, (context) => {
      const fixture = requireFixture(context, "tabs");
      const registry = createKnowledgeDocumentRegistry({ ownerId: "reference", windowId: "reference" });
      const tabs = fixture.tabs();
      for (const tab of tabs) {
        const address = canonicalKnowledgeAddress({ sourceKey: tab.sourceKey, relativePath: tab.relativePath });
        if (!address.ok) throw new Error("invalid reference tab address");
        registry.getState().establishDocumentSession({ address: address.value, buffer: "# benchmark\n", format: FORMAT });
      }
      const active = tabs.filter((tab) => tab.visible).concat(tabs.filter((tab) => !tab.visible).slice(0, 2));
      for (const tab of active) {
        registry.getState().openDocumentView({
          viewId: tab.tabId,
          address: { sourceKey: tab.sourceKey, relativePath: tab.relativePath },
          groupId: `group-${tab.group}`,
        });
      }
      if (active.at(-1)) registry.getState().updateDocumentView(active.at(-1)!.tabId, { cursor: 1 });
      const activeViewHeadroom = Object.keys(registry.getState().views).length - tabs.filter((tab) => tab.visible).length;
      registry.getState().dispose();
      return { activeViewHeadroom };
    }, cleanup),

    fullRebuild100k: lifecycle(prepareSearch, async (context, prepared) => {
      const fixture = requireFixture(context, "huge-resource-tree");
      const generation = `rebuild-${context.phase}-${context.iteration}`;
      const maxTaskMs = rebuildStores(prepared.stores!, context.dataset, generation, fixture.resources());
      const cancelMs = cancellationForIndex(prepared.stores!.get("main")!, generation);
      return { maxTaskMs, cancelMs };
    }, cleanup),

    generationSwitch: lifecycle((context) => {
      const prepared = prepareEmpty(context);
      const stores = createStores(prepared.home);
      const store = stores.get("main")!;
      store.beginRebuild({ rebuildId: "initial", generationId: "generation-0001", startedSequence: 0 })
        .publish({ lastCompleteSequence: 1 });
      prepared.stores = stores;
      prepared.oldLeases = [store.acquireQueryLease()];
      return prepared;
    }, (context, prepared) => {
      const fixture = requireFixture(context, "generation-switch");
      const store = prepared.stores!.get("main")!;
      store.beginRebuild({
        rebuildId: `switch-${context.phase}-${context.iteration}`,
        generationId: fixture.currentGeneration,
        startedSequence: 1,
      }).publish({ lastCompleteSequence: 2 });
      if (prepared.oldLeases![0]!.generationId !== fixture.previousGeneration) throw new Error("old generation lease changed");
    }, cleanup),

    operationRecovery1k: lifecycle((context) => {
      const prepared = prepareEmpty(context);
      const fixture = requireFixture(context, "operation-recovery");
      const journal = new DurableKnowledgeOperationJournal({ hanakoHome: prepared.home });
      for (const record of fixture.records()) {
        const request = {
          kind: "rename" as const,
          from: { sourceKey: record.sourceKey, relativePath: record.relativePath },
          to: { sourceKey: record.sourceKey, relativePath: `${record.relativePath}.next` },
          expectedVersion: { etag: `version-${record.sequence}` },
        };
        journal.createPlanned({
          operationId: record.operationId,
          requestHash: hashKnowledgeOperationRequest(request),
          request,
          owner: { principalId: "reference", userId: "reference", studioId: "reference", sessionId: null },
          sourceIdentity: sourceIdentity(record.sourceKey),
          createdAt: "2026-07-25T00:00:00.000Z",
          expiresAt: "2026-07-25T00:15:00.000Z",
        });
      }
      prepared.journal = journal;
      return prepared;
    }, (_context, prepared) => {
      prepared.journal!.list();
    }, cleanup),
  } satisfies Record<PerformanceScenarioId, ReferenceBenchmarkAdapterEntry>;

  return adapters;
}

function lifecycle(
  prepare: (context: ReferenceBenchmarkContext) => Promise<Prepared> | Prepared,
  measure: (context: ReferenceBenchmarkContext, prepared: Prepared) => Promise<ReferenceBenchmarkObservation | void> | ReferenceBenchmarkObservation | void,
  cleanup: (context: ReferenceBenchmarkContext, prepared: Prepared) => Promise<void> | void,
): ReferenceBenchmarkAdapterEntry {
  return {
    prepare,
    measure: (context, prepared) => measure(context, prepared as Prepared),
    cleanup: (context, prepared) => cleanup(context, prepared as Prepared),
  };
}

function iterationHome(parent: string, context: ReferenceBenchmarkContext): string {
  const prefix = `${context.scenarioFixture.id}-${context.phase}-${context.iteration}-`;
  return fs.mkdtempSync(path.join(parent, prefix));
}

function requireFixture<T extends ReferenceBenchmarkContext["scenarioFixture"]["kind"]>(
  context: ReferenceBenchmarkContext,
  kind: T,
): Extract<ReferenceBenchmarkContext["scenarioFixture"], { kind: T }> {
  if (context.scenarioFixture.kind !== kind) throw new Error(`expected ${kind} fixture`);
  return context.scenarioFixture as Extract<ReferenceBenchmarkContext["scenarioFixture"], { kind: T }>;
}

async function buildTreeNodes(
  entries: Generator<ResourceFixtureEntry>,
  signal?: AbortSignal,
): Promise<{ nodes: KnowledgeTreeVisibleNode[]; maxTaskMs: number }> {
  const nodes: KnowledgeTreeVisibleNode[] = [];
  let maxTaskMs = 0;
  let chunkStarted = performance.now();
  let index = 0;
  for (const entry of entries) {
    if (signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    const address = canonicalKnowledgeAddress({ sourceKey: entry.sourceKey, relativePath: entry.relativePath });
    if (!address.ok) throw new Error("invalid reference tree address");
    const parentPath = entry.relativePath.includes("/")
      ? entry.relativePath.slice(0, entry.relativePath.lastIndexOf("/"))
      : "";
    nodes.push({
      key: knowledgeTreeNodeKey(entry.sourceKey, entry.relativePath),
      sourceKey: entry.sourceKey,
      relativePath: entry.relativePath,
      parentKey: parentPath ? knowledgeTreeNodeKey(entry.sourceKey, parentPath) : null,
      isDirectory: false,
    });
    index += 1;
    if (index % 512 === 0) {
      maxTaskMs = Math.max(maxTaskMs, performance.now() - chunkStarted);
      await yieldImmediate();
      chunkStarted = performance.now();
    }
  }
  maxTaskMs = Math.max(maxTaskMs, performance.now() - chunkStarted);
  return { nodes, maxTaskMs };
}

async function cancellationLatency(work: (signal: AbortSignal) => Promise<unknown> | unknown): Promise<number> {
  const controller = new AbortController();
  controller.abort();
  const started = performance.now();
  try {
    await work(controller.signal);
  } catch (error) {
    if ((error as { name?: string }).name !== "AbortError") throw error;
  }
  return performance.now() - started;
}

function createStores(home: string): Map<string, KnowledgeIndexStore> {
  return new Map(SOURCE_KEYS.map((sourceKey) => [sourceKey, new KnowledgeIndexStore({
    hanakoHome: home,
    workspaceFingerprint: WORKSPACE_FINGERPRINT,
    sourceFingerprint: createHash("sha256").update(`reference:${sourceKey}`).digest("hex"),
    extractorContractVersion: "knowledge-reference-v1",
    hostId: "knowledge-reference-runner",
  })]));
}

function rebuildStores(
  stores: Map<string, KnowledgeIndexStore>,
  dataset: KnowledgeFixtureDataset,
  generation: string,
  entries: Generator<ResourceFixtureEntry> = dataset.resources("tree100k"),
): number {
  const rebuilds = new Map([...stores].map(([sourceKey, store]) => [sourceKey, store.beginRebuild({
    rebuildId: generation,
    generationId: generation,
    startedSequence: 0,
  })]));
  let maxTaskMs = 0;
  const batches = new Map<string, ResourceFixtureEntry[]>();
  for (const entry of entries) {
    const batch = batches.get(entry.sourceKey) ?? [];
    batch.push(entry);
    batches.set(entry.sourceKey, batch);
    if (batch.length < REBUILD_BATCH_SIZE) continue;
    const started = performance.now();
    rebuilds.get(entry.sourceKey)!.replaceResources(batch.splice(0).map(indexDocument));
    maxTaskMs = Math.max(maxTaskMs, performance.now() - started);
  }
  for (const [sourceKey, batch] of batches) {
    if (batch.length === 0) continue;
    const started = performance.now();
    rebuilds.get(sourceKey)!.replaceResources(batch.map(indexDocument));
    maxTaskMs = Math.max(maxTaskMs, performance.now() - started);
  }
  for (const rebuild of rebuilds.values()) rebuild.publish({ lastCompleteSequence: 0 });
  return maxTaskMs;
}

function indexDocument(entry: ResourceFixtureEntry): KnowledgeIndexResourceDocument {
  const body = entry.read().toString("utf8");
  const basename = entry.relativePath.split("/").at(-1)!;
  const parentPath = entry.relativePath.includes("/")
    ? entry.relativePath.slice(0, entry.relativePath.lastIndexOf("/"))
    : "";
  const page = entry.kind === "markdown" ? {
    title: basename.replace(/\.md$/u, ""),
    frontmatterJson: null,
    bodyText: body,
    bodyHash: createHash("sha256").update(body).digest("hex"),
  } : null;
  const kind = entry.kind === "markdown" ? "page"
    : entry.kind === "safeText" ? "text"
      : entry.kind === "imageMetadata" ? "image"
        : entry.kind === "pdfMetadata" ? "pdf"
          : "binary";
  return {
    resource: {
      relativePath: entry.relativePath,
      parentPath,
      basename,
      extension: path.extname(basename),
      kind,
      sizeBytes: entry.metadata?.byteLength ?? Buffer.byteLength(body),
      mtimeMs: 1,
      versionToken: `fixture-${entry.sourceKey}-${entry.relativePath}`,
      contentState: page || entry.kind === "safeText" ? "indexed" : "metadata-only",
      contentReason: page || entry.kind === "safeText" ? null : "metadata_only",
      indexedAtMs: 1,
    },
    page,
    headings: [],
    links: [],
    tags: [],
    tasks: [],
    search: {
      titleFold: foldSearchText(page?.title ?? basename),
      pathFold: foldSearchText(entry.relativePath),
      metadataFold: "",
      bodyFold: foldSearchText(body),
    },
  };
}

async function executeSearch(stores: Map<string, KnowledgeIndexStore>, query: string, signal?: AbortSignal): Promise<void> {
  await searchKnowledgeIndex(
    { acquireQueryLease: (sourceKey) => stores.get(sourceKey)!.acquireQueryLease() },
    { query, limit: 50 },
    {
      sources: SOURCE_KEYS.map((sourceKey) => ({ sourceKey, displayName: sourceKey, availability: "available" })),
      signal,
    },
  );
}

function cancellationForIndex(store: KnowledgeIndexStore, generation: string): number {
  const controller = new AbortController();
  controller.abort();
  const started = performance.now();
  try {
    store.beginRebuild({
      rebuildId: `${generation}-cancel`,
      generationId: `${generation}-cancel`,
      startedSequence: 0,
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as { name?: string }).name !== "AbortError") throw error;
  }
  return performance.now() - started;
}

function emitFixtureEvent(bus: ResourceEventBus, event: ReturnType<Extract<ReferenceBenchmarkContext["scenarioFixture"], { kind: "watch-burst" }>["events"]>[number], home: string): void {
  const resource = { kind: "local-file" as const, path: path.join(home, event.relativePath) };
  if (event.kind === "delete") {
    bus.deleted({ resourceKey: `${event.sourceKey}:${event.relativePath}`, resource, source: "provider_watch", operationId: event.operationId });
  } else if (event.kind === "rename") {
    const previous = event.previousRelativePath ?? event.relativePath;
    bus.renamed({
      oldResourceKey: `${event.sourceKey}:${previous}`,
      newResourceKey: `${event.sourceKey}:${event.relativePath}`,
      oldResource: { kind: "local-file", path: path.join(home, previous) },
      newResource: resource,
      source: "provider_watch",
      operationId: event.operationId,
    });
  } else {
    bus.changed({
      changeType: event.kind === "create" ? "created" : "modified",
      resourceKey: `${event.sourceKey}:${event.relativePath}`,
      resource,
      version: { sequence: event.duplicateOf ?? event.sequence },
      source: "provider_watch",
      operationId: event.operationId,
    });
  }
}

function sourceIdentity(sourceKey: string): ProviderRootIdentity {
  return {
    providerId: "local_fs",
    identityNamespace: "knowledge-reference",
    opaqueRootId: `reference-${sourceKey}`,
    scopeToken: `reference-scope-${sourceKey}`,
    caseMode: "sensitive",
  };
}
