import fs from "node:fs";
import path from "node:path";
import type {
  WorkspaceSubscription,
  WorkspaceWatchAdapter,
  WorkspaceWatchListener,
} from "../../../core/workspace-runtime/main-workspace-runtime.ts";
import type { KnowledgeIndexRuntime } from "../../../core/knowledge-workspace/knowledge-index-runtime.ts";
import type { ProductionWorkspaceRuntimeAssembly } from "../../../core/workspace-runtime/production-workspace-runtime.ts";
import type { ResourceEvent } from "../../../lib/resource-io/types.ts";

const RESULT_MARKER = "T23_PRODUCT_WORKSPACE_RESULT=";
const PROBE_TIMEOUT_MS = 15_000;

type WatchPhase = "legacy" | "coordinator";
type WatchTimelineEntry = Readonly<{ action: "open" | "close"; phase: WatchPhase }>;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean | Promise<boolean>, label: string): Promise<void> {
  const deadline = Date.now() + PROBE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(25);
  }
  throw new Error(`[macos-gate] timeout waiting for ${label}`);
}

async function searchPaths(runtime: KnowledgeIndexRuntime, query: string): Promise<string[]> {
  const { searchKnowledgeIndex } = await import("../../../lib/knowledge-workspace/knowledge-search-query.ts");
  const coordinator = runtime.coordinator();
  if (!coordinator) return [];
  const result = await searchKnowledgeIndex(coordinator, {
    query,
    scope: { kind: "tag", sourceKey: "main" },
  }, {
    sources: [{ sourceKey: "main", displayName: "main", availability: "available" }],
  });
  const group = result.groups[0];
  return group?.state === "ready"
    ? group.items.map((item) => item.address.relativePath)
    : [];
}

function hasResourceKey(event: ResourceEvent, resourceKey: string): boolean {
  return event.type !== "resource.renamed" && event.resourceKey === resourceKey;
}

async function runProbe(rootPathInput: string): Promise<Record<string, unknown>> {
  const rootPath = path.resolve(rootPathInput);
  const hanakoHome = `${rootPath}.hanako-home`;
  fs.mkdirSync(rootPath, { recursive: true });
  fs.mkdirSync(hanakoHome, { recursive: true });
  fs.writeFileSync(path.join(rootPath, "Initial.md"), "# Initial\n\nalpha", "utf8");

  const timeline: WatchTimelineEntry[] = [];
  let activeFsWatchers = 0;
  let maxActiveFsWatchers = 0;
  const trackWatcherLease = (
    handle: Readonly<{ close: () => void }>,
    openedPhase: WatchPhase,
  ): Readonly<{ close: () => void }> => {
    activeFsWatchers += 1;
    maxActiveFsWatchers = Math.max(maxActiveFsWatchers, activeFsWatchers);
    timeline.push({ action: "open", phase: openedPhase });
    let closed = false;
    return Object.freeze({
      close: () => {
        if (closed) return;
        handle.close();
        closed = true;
        activeFsWatchers -= 1;
        timeline.push({ action: "close", phase: openedPhase });
      },
    });
  };

  const [
    { KnowledgeIndexRuntime },
    { SourceRegistry },
    { createProductionWorkspaceRuntime, createProductionWorkspaceWatchAdapter },
    { createResourceMainRootAuthority },
    { LocalFsProvider },
    { ResourceEventBus },
    { ResourceIO },
    { resourceKeyForRef },
    { ResourceWatchRegistry },
  ] = await Promise.all([
    import("../../../core/knowledge-workspace/knowledge-index-runtime.ts"),
    import("../../../core/knowledge-workspace/source-registry.ts"),
    import("../../../core/workspace-runtime/production-workspace-runtime.ts"),
    import("../../../core/workspace-runtime/resource-main-root-authority.ts"),
    import("../../../lib/resource-io/providers/local-fs-provider.ts"),
    import("../../../lib/resource-io/resource-event-bus.ts"),
    import("../../../lib/resource-io/resource-io.ts"),
    import("../../../lib/resource-io/resource-refs.ts"),
    import("../../../lib/resource-io/resource-watch-registry.ts"),
  ]);

  const mainRef = Object.freeze({ kind: "local-file" as const, path: rootPath });
  const eventBus = new ResourceEventBus({ emit: () => undefined });
  const resourceIO = new ResourceIO({
    providers: { local_fs: new LocalFsProvider({ cwd: rootPath }) },
    eventBus,
  });
  const rootAuthority = createResourceMainRootAuthority({ resourceIO });
  const legacyWatchRegistry = new ResourceWatchRegistry({
    eventBus,
    debounceMs: 0,
    resolveWatchTarget: (resource) => resourceIO.resolveWatchTarget(resource),
    watchPath: (targetPath, handler) => {
      const watcher = fs.watch(targetPath, { persistent: false, recursive: true }, (_eventType, filename) => {
        if (!filename) {
          handler({ kind: "rescan", path: targetPath, reason: "filename_unavailable" });
          return;
        }
        handler(String(filename));
      });
      return trackWatcherLease(watcher, "legacy");
    },
  });
  const releaseLegacy = legacyWatchRegistry.retain(mainRef);

  const productionAdapter = createProductionWorkspaceWatchAdapter();
  let currentListener: WorkspaceWatchListener | null = null;
  let baselineRuns = 0;
  let lostNativeCallbackSuppressed = false;
  let suppressLostCallback = true;
  const watchAdapter: WorkspaceWatchAdapter = Object.freeze({
    open: (proof, listener) => {
      currentListener = listener;
      const handle = productionAdapter.open(proof, {
        onChange: (change) => {
          if (suppressLostCallback && change.relativePath === "Lost.md") {
            lostNativeCallbackSuppressed = true;
            return;
          }
          listener.onChange(change);
        },
        onGap: () => listener.onGap(),
        onError: () => listener.onError(),
      });
      return trackWatcherLease(handle, "coordinator");
    },
    baseline: async function* (proof) {
      baselineRuns += 1;
      yield* productionAdapter.baseline(proof);
    },
  });

  let assembly: ProductionWorkspaceRuntimeAssembly | null = null;
  let knowledge: KnowledgeIndexRuntime | null = null;
  let firstConsumer: WorkspaceSubscription | null = null;
  let secondConsumer: WorkspaceSubscription | null = null;
  let unsubscribeEvents: (() => void) | null = null;
  const healthTransitions: string[] = [];
  const resourceEvents: ResourceEvent[] = [];

  try {
    assembly = createProductionWorkspaceRuntime({
      rootPath,
      rootAuthority,
      watchAdapter,
      resourceEvents: eventBus,
      legacyWatchRegistry,
      isolatedProof: async () => undefined,
      beforeCoordinatorStart: async () => undefined,
      historyResourceIO: resourceIO,
    });
    const cutover = await assembly.cutover.start();
    firstConsumer = await assembly.runtime.subscribe((observation) => {
      if (
        observation.type === "workspace.health"
        && healthTransitions.at(-1) !== observation.health
      ) {
        healthTransitions.push(observation.health);
      }
    });
    secondConsumer = await assembly.runtime.subscribe(() => undefined);
    unsubscribeEvents = eventBus.subscribe((event) => resourceEvents.push(event));

    const registry = await SourceRegistry.create({
      mainRoot: mainRef,
      resourceIO,
      hanakoHome,
    });
    knowledge = new KnowledgeIndexRuntime({
      hanakoHome,
      hostId: "t23-macos-product-probe",
      resourceIO,
      resourceEvents: eventBus,
      sharedBaseline: assembly.sharedBaseline.port,
    });
    await knowledge.bindWorkspace(registry);
    await waitFor(async () => (await searchPaths(knowledge!, "alpha")).includes("Initial.md"), "initial knowledge baseline");

    const lostPath = path.join(rootPath, "Lost.md");
    const lostResourceKey = resourceKeyForRef({ kind: "local-file", path: lostPath });
    fs.writeFileSync(lostPath, "# Lost\n\nlost-token", "utf8");
    await waitFor(() => lostNativeCallbackSuppressed, "suppressed native Lost.md callback");
    const gapListener = currentListener;
    if (!gapListener) throw new Error("[macos-gate] product workspace listener was not installed");
    gapListener.onGap();
    await waitFor(() => (
      baselineRuns === 2
      && assembly?.runtime.snapshot()?.health === "HEALTHY"
      && healthTransitions.at(-1) === "HEALTHY"
    ), "shared gap reconciliation");
    await waitFor(async () => (await searchPaths(knowledge!, "lost-token")).includes("Lost.md"), "Lost.md reconciliation indexing");
    const lostAbsentFromEventBus = !resourceEvents.some((event) => hasResourceKey(event, lostResourceKey));

    suppressLostCallback = false;
    const observedPath = path.join(rootPath, "Observed.md");
    const observedResourceKey = resourceKeyForRef({ kind: "local-file", path: observedPath });
    fs.writeFileSync(observedPath, "# Observed\n\nobserved-token", "utf8");
    await waitFor(
      () => resourceEvents.some((event) => hasResourceKey(event, observedResourceKey)),
      "post-reconciliation ResourceEventBus change",
    );
    await waitFor(
      async () => (await searchPaths(knowledge!, "observed-token")).includes("Observed.md"),
      "post-reconciliation knowledge indexing",
    );

    const legacyCloseIndex = timeline.findIndex((entry) => entry.action === "close" && entry.phase === "legacy");
    const coordinatorOpenIndex = timeline.findIndex((entry) => entry.action === "open" && entry.phase === "coordinator");
    const legacyCloseBeforeCoordinatorOpen = legacyCloseIndex >= 0
      && coordinatorOpenIndex >= 0
      && legacyCloseIndex < coordinatorOpenIndex;
    const cutoverOverlap = cutover.overlap;

    await knowledge.dispose();
    knowledge = null;
    await firstConsumer.release();
    firstConsumer = null;
    await secondConsumer.release();
    secondConsumer = null;
    await assembly.cutover.stop();
    assembly = null;
    releaseLegacy();

    const expectedHealthTransitions = ["HEALTHY", "DEGRADED", "RECONCILING", "HEALTHY"];
    if (
      !legacyCloseBeforeCoordinatorOpen
      || maxActiveFsWatchers !== 1
      || activeFsWatchers !== 0
      || cutoverOverlap !== 0
      || baselineRuns !== 2
      || !lostNativeCallbackSuppressed
      || !lostAbsentFromEventBus
      || healthTransitions.join(",") !== expectedHealthTransitions.join(",")
    ) {
      throw new Error("[macos-gate] product workspace ownership or reconciliation proof failed");
    }

    return {
      logicalConsumers: 2,
      legacyCloseBeforeCoordinatorOpen,
      maxActiveFsWatchers,
      activeFsWatchersAfterStop: activeFsWatchers,
      cutoverOverlap,
      baselineRuns,
      lostNativeCallbackSuppressed,
      lostAbsentFromEventBus,
      lostIndexedAfterReconcile: true,
      observedEventAfterReconcile: true,
      observedIndexedAfterReconcile: true,
      healthTransitions,
    };
  } finally {
    unsubscribeEvents?.();
    await knowledge?.dispose();
    await firstConsumer?.release();
    await secondConsumer?.release();
    await assembly?.cutover.stop();
    releaseLegacy();
  }
}

const rootPath = process.argv[2];
if (!rootPath || !path.isAbsolute(rootPath)) {
  throw new Error("[macos-gate] product workspace probe requires an absolute root");
}

const result = await runProbe(rootPath);
process.stdout.write(`${RESULT_MARKER}${JSON.stringify(result)}\n`);
