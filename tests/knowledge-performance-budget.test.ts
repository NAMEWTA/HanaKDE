import fs from "node:fs";
import { getEventListeners } from "node:events";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  PERFORMANCE_BUDGETS,
  REFERENCE_SCENARIO_IDS,
  buildPerformanceEvidencePath,
  compareWithBaseline,
  createReferenceBenchmarkPlan,
  evaluateAbsoluteBudget,
  nearestRankPercentile,
  runReferenceBenchmark,
  runMeasuredScenario,
  summarizeSamples,
  validatePerformanceEvidence,
  writePerformanceEvidenceAtomically,
  type PerformanceScenarioId,
  type ReferenceBenchmarkAdapter,
} from "./fixtures/knowledge-workspace/performance-budget.js";

const REFERENCE_MACHINE = {
  cpu: "8 logical CPU",
  logicalCpuCount: 8,
  memoryBytes: 16 * 1024 ** 3,
  os: "darwin",
  filesystem: "apfs",
  storage: "ssd" as const,
  node: "v24.16.0",
};

const REFERENCE_ENVIRONMENT = {
  productionBuild: true as const,
  devtools: false as const,
  debugLogging: false as const,
};

function completeMeasurementFor(id: PerformanceScenarioId): Record<string, number | boolean | null> {
  const measurement: Record<string, number | boolean | null> = {
    p50Ms: 5,
    p95Ms: 10,
    minMs: 1,
    maxMs: 10,
    peakRssBytes: 1_000,
    cancelMs: null,
    maxTaskMs: null,
    firstPageP95Ms: null,
    incrementalP95Ms: null,
    switchP95Ms: null,
    additionalPeakRssBytes: null,
    activeViewHeadroom: null,
    rejectOverLimitBeforeEditorView: null,
  };
  for (const key of Object.keys(PERFORMANCE_BUDGETS[id])) {
    if (measurement[key] === null) {
      measurement[key] = key === "rejectOverLimitBeforeEditorView" ? true : 1;
    }
  }
  return measurement;
}

function createValidEvidence(mode: "establish" | "compare" = "establish"): Record<string, unknown> {
  return {
    schemaVersion: 1,
    fixtureSeed: 20260725,
    fixtureHash: "a".repeat(64),
    commit: "abc123",
    platform: "darwin-arm64",
    environment: REFERENCE_ENVIRONMENT,
    machine: REFERENCE_MACHINE,
    scenarios: REFERENCE_SCENARIO_IDS.map((id) => ({
      id,
      warmupCount: 3,
      samplesMs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      rssSamplesBytes: Array.from({ length: 10 }, () => 1_000),
      measurement: completeMeasurementFor(id),
      pass: true,
      absoluteFailures: [],
      baselineDisposition:
        mode === "establish"
          ? { mode: "established" }
          : {
              mode: "compared",
              baseline: {
                commit: "baseline123",
                fixtureHash: "a".repeat(64),
                status: "passed",
                selection: "latest-passing-same-runner",
                p95Ms: 10,
                peakRssBytes: 1_000,
              },
              p95RegressionRatio: 0,
              rssRegressionRatio: 0,
              failures: [],
              pass: true,
            },
    })),
    pass: true,
    baselineMode: mode,
  };
}

describe("knowledge performance budget contract", () => {
  it("uses nearest-rank p50 and p95 and records min, max and peak RSS", () => {
    expect(nearestRankPercentile([10, 2, 8, 4, 6], 50)).toBe(6);
    expect(nearestRankPercentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 95)).toBe(
      19,
    );
    expect(summarizeSamples([8, 2, 5, 11, 3, 7, 6, 4, 10, 9], [100, 110, 105])).toEqual({
      minMs: 2,
      maxMs: 11,
      p50Ms: 6,
      p95Ms: 11,
      peakRssBytes: 110,
    });
  });

  it("requires three warmups and ten measurements through a controllable clock", async () => {
    let nowValue = 0;
    let calls = 0;
    const result = await runMeasuredScenario({
      now: () => nowValue,
      readRssBytes: () => 1_000 + calls,
      measure: async () => {
        calls += 1;
        nowValue += calls;
      },
    });

    expect(calls).toBe(13);
    expect(result.warmupCount).toBe(3);
    expect(result.samplesMs).toHaveLength(10);
    expect(result.summary.peakRssBytes).toBe(1_013);
  });

  it("rejects invalid sample contracts and percentile requests", async () => {
    expect(() => nearestRankPercentile([], 95)).toThrow(/sample/i);
    expect(() => nearestRankPercentile([1], 0)).toThrow(/percentile/i);
    await expect(
      runMeasuredScenario({
        warmupCount: 2,
        measure: async () => undefined,
      }),
    ).rejects.toThrow(/three warmups/i);
    await expect(
      runMeasuredScenario({
        sampleCount: 9,
        measure: async () => undefined,
      }),
    ).rejects.toThrow(/ten measurements/i);
  });

  it("fails relative regressions above p95 15 percent or RSS 20 percent", () => {
    expect(compareWithBaseline({ p95Ms: 115, peakRssBytes: 120 }, { p95Ms: 100, peakRssBytes: 100 })).toEqual({
      pass: true,
      p95RegressionRatio: 0.15,
      rssRegressionRatio: 0.2,
      failures: [],
    });
    expect(compareWithBaseline({ p95Ms: 116, peakRssBytes: 121 }, { p95Ms: 100, peakRssBytes: 100 })).toEqual(
      expect.objectContaining({
        pass: false,
        failures: ["relative_p95_regression", "relative_rss_regression"],
      }),
    );
  });

  it("freezes every absolute budget including cancellation upper bounds", () => {
    expect(PERFORMANCE_BUDGETS).toEqual(
      expect.objectContaining({
        initialTree10k: expect.objectContaining({ p95Ms: 1_500, maxTaskMs: 50 }),
        hugeTree100k: expect.objectContaining({ cancelMs: 100, additionalPeakRssBytes: 300 * 1024 * 1024 }),
        markdown10MiB: expect.objectContaining({ p95Ms: 2_000, rejectOverLimitBeforeEditorView: true }),
        denseWikilinks50k: expect.objectContaining({ incrementalP95Ms: 250 }),
        watcherBurst5k: expect.objectContaining({ maxTaskMs: 50 }),
        searchWarmTrigram: expect.objectContaining({ p50Ms: 150, p95Ms: 500, cancelMs: 100 }),
        searchWarmShort: expect.objectContaining({ firstPageP95Ms: 1_200, cancelMs: 100 }),
        multiView100Tabs: expect.objectContaining({ switchP95Ms: 150, activeViewHeadroom: 2 }),
        fullRebuild100k: expect.objectContaining({ cancelMs: 100, maxTaskMs: 50 }),
        operationRecovery1k: expect.objectContaining({ p95Ms: 1_000 }),
      }),
    );
    expect(
      evaluateAbsoluteBudget({ p95Ms: 501, p50Ms: 151, cancelMs: 101 }, PERFORMANCE_BUDGETS.searchWarmTrigram),
    ).toEqual({
      pass: false,
      failures: ["absolute_p50_budget", "absolute_p95_budget", "cancellation_budget"],
    });
  });

  it("exposes an independently callable full reference plan without executing product benchmarks", () => {
    const plan = createReferenceBenchmarkPlan();

    expect(plan.profile).toBe("full");
    expect(plan.seed).toBe(20260725);
    expect(plan.warmupCount).toBe(3);
    expect(plan.sampleCount).toBe(10);
    expect(plan.scenarios).toEqual(REFERENCE_SCENARIO_IDS);
    expect(plan.requirements).toEqual({
      logicalCpuCount: 8,
      memoryBytes: 16 * 1024 ** 3,
      storage: "ssd",
      productionBuild: true,
      debugLogging: false,
      devtools: false,
    });
  });

  it("honors AbortSignal without consuming further samples and enforces a controlled cancellation bound", async () => {
    const controller = new AbortController();
    let nowValue = 0;
    let calls = 0;

    await expect(
      runMeasuredScenario({
        now: () => nowValue,
        signal: controller.signal,
        measure: async () => {
          calls += 1;
          nowValue += 25;
          if (calls === 5) controller.abort();
        },
      }),
    ).rejects.toMatchObject({
      name: "AbortError",
      cancellationLatencyMs: 0,
    });
    expect(calls).toBe(5);
  });

  it("reports a cancellation budget failure when the injected clock exceeds the upper bound", async () => {
    const controller = new AbortController();
    let nowValue = 0;

    await expect(
      runMeasuredScenario({
        now: () => nowValue,
        signal: controller.signal,
        cancellationLimitMs: 100,
        measure: async () => {
          controller.abort();
          nowValue = 101;
        },
      }),
    ).rejects.toMatchObject({
      name: "CancellationBudgetError",
      cancellationLatencyMs: 101,
    });
  });

  it("aborts a never-resolving non-cooperative adapter without an external timeout or leaked listener", async () => {
    const controller = new AbortController();
    const pending = runMeasuredScenario({
      now: () => 50,
      signal: controller.signal,
      measure: () => new Promise<void>(() => undefined),
    });

    queueMicrotask(() => controller.abort());
    await expect(pending).rejects.toMatchObject({ name: "AbortError", cancellationLatencyMs: 0 });
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });

  it("validates the evidence schema and uses the frozen HANA_HOME-relative path contract", () => {
    const hanaHome = path.join(os.tmpdir(), "isolated-hana-home");
    const evidencePath = buildPerformanceEvidencePath(hanaHome, "abc123", "darwin-arm64");
    const evidence = createValidEvidence();

    expect(evidencePath).toBe(
      path.join(hanaHome, "knowledge-workspace", "evidence", "performance", "abc123", "darwin-arm64.json"),
    );
    expect(validatePerformanceEvidence(evidence)).toEqual({ ok: true });
    expect(validatePerformanceEvidence(createValidEvidence("compare"))).toEqual({ ok: true });
    expect(validatePerformanceEvidence({ ...evidence, scenarios: [] })).toEqual(
      expect.objectContaining({ ok: false }),
    );
    expect(
      validatePerformanceEvidence({
        ...evidence,
        machine: { ...REFERENCE_MACHINE, filesystem: "/Users/developer/workspace" },
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(validatePerformanceEvidence({ ...evidence, unexpected: true })).toEqual(
      expect.objectContaining({ ok: false }),
    );
    const scenarios = evidence.scenarios as Array<Record<string, unknown>>;
    expect(
      validatePerformanceEvidence({
        ...evidence,
        scenarios: [
          { ...scenarios[0], measurement: { ...(scenarios[0]!.measurement as object), cancelMs: Number.NaN } },
          ...scenarios.slice(1),
        ],
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(
      validatePerformanceEvidence({
        ...evidence,
        scenarios: [
          scenarios[0],
          { ...scenarios[0] },
          ...scenarios.slice(2),
        ],
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(
      validatePerformanceEvidence({
        ...evidence,
        scenarios: [
          {
            ...scenarios[0],
            measurement: {
              ...(scenarios[0]!.measurement as object),
              maxTaskMs: null,
            },
          },
          ...scenarios.slice(1),
        ],
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(
      validatePerformanceEvidence({
        ...evidence,
        machine: { ...REFERENCE_MACHINE, cpu: "x".repeat(4_097) },
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(validatePerformanceEvidence(new Proxy(evidence, {}))).toEqual(expect.objectContaining({ ok: false }));
    let getterCalls = 0;
    const accessor = Object.defineProperty({}, "schemaVersion", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 1;
      },
    });
    expect(validatePerformanceEvidence(accessor)).toEqual(expect.objectContaining({ ok: false }));
    expect(getterCalls).toBe(0);
    expect(() => buildPerformanceEvidencePath(hanaHome, "../escape", "darwin")).toThrow(/commit/i);
    expect(JSON.stringify(evidence)).not.toContain(hanaHome);
  });

  it("rejects an incomplete reference adapter set before creating evidence output", async () => {
    const hanaHome = fs.mkdtempSync(path.join(os.tmpdir(), "hana-kw-reference-missing-"));
    try {
      await expect(
        runReferenceBenchmark({
          hanaHome,
          commit: "abc123",
          platform: "darwin-arm64",
          machine: REFERENCE_MACHINE,
          environment: REFERENCE_ENVIRONMENT,
          baseline: { mode: "establish" },
          adapters: {},
        }),
      ).rejects.toThrow(/missing reference benchmark adapters/i);
      expect(fs.existsSync(path.join(hanaHome, "knowledge-workspace"))).toBe(false);
    } finally {
      fs.rmSync(hanaHome, { recursive: true, force: true });
    }
  });

  it("rejects an under-provisioned reference runner before invoking adapters", async () => {
    const hanaHome = fs.mkdtempSync(path.join(os.tmpdir(), "hana-kw-reference-small-"));
    const adapters = Object.fromEntries(
      REFERENCE_SCENARIO_IDS.map((scenario) => [scenario, vi.fn()]),
    );
    try {
      await expect(
        runReferenceBenchmark({
          hanaHome,
          commit: "abc123",
          platform: "darwin-arm64",
          machine: {
            cpu: "4 logical CPU",
            logicalCpuCount: 4,
            memoryBytes: 8 * 1024 ** 3,
            os: "darwin",
            filesystem: "apfs",
            storage: "ssd",
            node: "v24.16.0",
          },
          environment: REFERENCE_ENVIRONMENT,
          baseline: { mode: "establish" },
          adapters,
        }),
      ).rejects.toThrow(/minimum/i);
      await expect(
        runReferenceBenchmark({
          hanaHome,
          commit: "abc123",
          platform: "darwin-arm64",
          machine: { ...REFERENCE_MACHINE, node: "v22.22.0" },
          environment: REFERENCE_ENVIRONMENT,
          baseline: { mode: "establish" },
          adapters,
        }),
      ).rejects.toThrow(/Node 24/i);
      expect(Object.values(adapters).every((adapter) => adapter.mock.calls.length === 0)).toBe(true);
      expect(fs.existsSync(path.join(hanaHome, "knowledge-workspace"))).toBe(false);
    } finally {
      fs.rmSync(hanaHome, { recursive: true, force: true });
    }
  });

  it("rejects a non-production environment and incomplete compare baseline before measurements", async () => {
    const hanaHome = fs.mkdtempSync(path.join(os.tmpdir(), "hana-kw-reference-contract-"));
    const adapters = Object.fromEntries(
      REFERENCE_SCENARIO_IDS.map((scenario) => [scenario, vi.fn()]),
    );
    const values = Object.fromEntries(
      REFERENCE_SCENARIO_IDS.slice(1).map((scenario) => [
        scenario,
        { p95Ms: 10, peakRssBytes: 1_000 },
      ]),
    ) as Record<PerformanceScenarioId, { p95Ms: number; peakRssBytes: number }>;
    const completeValues = Object.fromEntries(
      REFERENCE_SCENARIO_IDS.map((scenario) => [
        scenario,
        { p95Ms: 10, peakRssBytes: 1_000 },
      ]),
    ) as Record<PerformanceScenarioId, { p95Ms: number; peakRssBytes: number }>;
    try {
      await expect(
        runReferenceBenchmark({
          hanaHome,
          commit: "abc123",
          platform: "darwin-arm64",
          machine: REFERENCE_MACHINE,
          environment: { ...REFERENCE_ENVIRONMENT, devtools: true },
          baseline: { mode: "establish" },
          adapters,
        }),
      ).rejects.toThrow(/production measurement contract/i);
      await expect(
        runReferenceBenchmark({
          hanaHome,
          commit: "abc123",
          platform: "darwin-arm64",
          machine: REFERENCE_MACHINE,
          environment: REFERENCE_ENVIRONMENT,
          baseline: {
            mode: "compare",
            commit: "baseline123",
            fixtureHash: "b".repeat(64),
            machine: REFERENCE_MACHINE,
            status: "passed",
            selection: "latest-passing-same-runner",
            values,
          },
          adapters,
        }),
      ).rejects.toThrow(/latest passing same-runner baseline|complete same-runner baseline|fixture identity/i);
      await expect(
        runReferenceBenchmark({
          hanaHome,
          commit: "abc123",
          platform: "darwin-arm64",
          machine: REFERENCE_MACHINE,
          environment: REFERENCE_ENVIRONMENT,
          baseline: {
            mode: "compare",
            commit: "baseline123",
            fixtureHash: "b".repeat(64),
            machine: REFERENCE_MACHINE,
            status: "passed",
            selection: "latest-passing-same-runner",
            values: completeValues,
          },
          adapters,
        }),
      ).rejects.toThrow(/fixture identity/i);
      expect(Object.values(adapters).every((adapter) => adapter.mock.calls.length === 0)).toBe(true);
    } finally {
      fs.rmSync(hanaHome, { recursive: true, force: true });
    }
  });

  it("passes the full lazy dataset and scenario fixture to every independently supplied adapter", async () => {
    const hanaHome = fs.mkdtempSync(path.join(os.tmpdir(), "hana-kw-reference-context-"));
    const observations = {
      cancelMs: 1,
      maxTaskMs: 1,
      additionalPeakRssBytes: 1,
      activeViewHeadroom: 1,
      rejectOverLimitBeforeEditorView: true,
    };
    const adapters = Object.fromEntries(
      REFERENCE_SCENARIO_IDS.map((scenario) => {
        const adapter = vi.fn((context: Parameters<ReferenceBenchmarkAdapter>[0]) => {
          expect(context.manifest.profile).toBe("full");
          expect(context.dataset.manifest.seed).toBe(20260725);
          expect(context.scenarioFixture.id).toBe(scenario);
          expect(context.dataset.resources("tree100k").next().value?.read().byteLength).toBeGreaterThan(0);
          const fixture = context.scenarioFixture;
          switch (fixture.kind) {
            case "resource-tree":
            case "huge-resource-tree":
            case "search":
            case "cold-search":
              expect(fixture.resources().next().value?.read().byteLength).toBeGreaterThan(0);
              break;
            case "markdown-boundary":
              expect(fixture.accepted().byteLength).toBe(10 * 1024 * 1024);
              expect(fixture.overLimit().byteLength).toBe(10 * 1024 * 1024 + 1);
              break;
            case "dense-wikilinks":
              expect(fixture.readDocument().byteLength).toBeGreaterThan(0);
              break;
            case "watch-burst":
              expect(fixture.events()).toHaveLength(fixture.expectedEvents);
              break;
            case "tabs":
              expect(fixture.tabs()).toHaveLength(fixture.expectedTabs);
              break;
            case "generation-switch":
              expect(fixture.previousGeneration).not.toBe(fixture.currentGeneration);
              break;
            case "operation-recovery":
              expect(fixture.records().next().value).toBeDefined();
              break;
          }
          return observations;
        });
        return [scenario, adapter];
      }),
    );
    let clock = 0;
    try {
      const result = await runReferenceBenchmark({
        hanaHome,
        commit: "abc123",
        platform: "darwin-arm64",
        machine: REFERENCE_MACHINE,
        environment: REFERENCE_ENVIRONMENT,
        baseline: { mode: "establish" },
        adapters,
        now: () => clock++,
        readRssBytes: () => 1_000,
      });

      expect(Object.values(adapters).every((adapter) => adapter.mock.calls.length === 13)).toBe(true);
      expect(result.evidence.baselineMode).toBe("establish");
      expect(validatePerformanceEvidence(result.evidence)).toEqual({ ok: true });
      expect(fs.existsSync(result.evidencePath)).toBe(true);
      expect(JSON.stringify(result.evidence)).not.toContain(hanaHome);
    } finally {
      fs.rmSync(hanaHome, { recursive: true, force: true });
    }
  });

  it.each(["mkdir", "write", "rename"] as const)(
    "cleans temporary evidence after injected %s failure",
    (stage) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), `hana-kw-evidence-${stage}-`));
      const evidencePath = path.join(root, "nested", "evidence.json");
      const temporaryPath = `${evidencePath}.tmp`;
      const io = {
        mkdir: (directory: string) => {
          if (stage === "mkdir") throw new Error("injected mkdir failure");
          fs.mkdirSync(directory, { recursive: true });
        },
        write: (filePath: string, content: string) => {
          fs.writeFileSync(filePath, content, "utf8");
          if (stage === "write") throw new Error("injected write failure");
        },
        rename: (from: string, to: string) => {
          if (stage === "rename") throw new Error("injected rename failure");
          fs.renameSync(from, to);
        },
        unlink: (filePath: string) => fs.unlinkSync(filePath),
      };
      try {
        expect(() => writePerformanceEvidenceAtomically(evidencePath, createValidEvidence(), io)).toThrow(
          new RegExp(`injected ${stage} failure`),
        );
        expect(fs.existsSync(temporaryPath)).toBe(false);
        expect(fs.existsSync(evidencePath)).toBe(false);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it("does not depend on wall-clock timers", async () => {
    vi.useFakeTimers();
    const measure = vi.fn(async () => undefined);
    await runMeasuredScenario({ measure, now: () => measure.mock.calls.length });
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
