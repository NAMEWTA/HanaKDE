import fs from "node:fs";
import path from "node:path";
import { types as utilTypes } from "node:util";
import {
  FIXTURE_SEED,
  createKnowledgeFixtureDataset,
  resolveFixtureProfile,
  type FixtureManifest,
  type KnowledgeFixtureDataset,
} from "./generate-fixture.ts";

type NumericBudget = {
  readonly p50Ms?: number;
  readonly p95Ms?: number;
  readonly cancelMs?: number;
  readonly maxTaskMs?: number;
  readonly firstPageP95Ms?: number;
  readonly incrementalP95Ms?: number;
  readonly switchP95Ms?: number;
  readonly additionalPeakRssBytes?: number;
  readonly activeViewHeadroom?: number;
  readonly rejectOverLimitBeforeEditorView?: boolean;
};

export const PERFORMANCE_BUDGETS = {
  initialTree10k: { p95Ms: 1_500, maxTaskMs: 50 },
  hugeTree100k: { cancelMs: 100, additionalPeakRssBytes: 300 * 1024 * 1024 },
  markdown10MiB: { p95Ms: 2_000, rejectOverLimitBeforeEditorView: true },
  denseWikilinks50k: { incrementalP95Ms: 250, cancelMs: 100 },
  watcherBurst5k: { maxTaskMs: 50 },
  searchWarmTrigram: { p50Ms: 150, p95Ms: 500, cancelMs: 100 },
  searchWarmShort: { firstPageP95Ms: 1_200, cancelMs: 100 },
  searchColdOpen: { p95Ms: 1_200 },
  multiView100Tabs: { switchP95Ms: 150, activeViewHeadroom: 2 },
  fullRebuild100k: { cancelMs: 100, maxTaskMs: 50 },
  generationSwitch: { p95Ms: 100 },
  operationRecovery1k: { p95Ms: 1_000 },
} as const satisfies Record<string, NumericBudget>;

export type PerformanceScenarioId = keyof typeof PERFORMANCE_BUDGETS;

export const REFERENCE_SCENARIO_IDS = Object.freeze(
  Object.keys(PERFORMANCE_BUDGETS) as PerformanceScenarioId[],
);

export function createReferenceBenchmarkPlan(): {
  readonly profile: "full";
  readonly seed: number;
  readonly warmupCount: 3;
  readonly sampleCount: 10;
  readonly scenarios: readonly PerformanceScenarioId[];
  readonly requirements: {
    readonly logicalCpuCount: 8;
    readonly memoryBytes: number;
    readonly storage: "ssd";
    readonly productionBuild: true;
    readonly debugLogging: false;
    readonly devtools: false;
  };
} {
  return {
    profile: "full",
    seed: FIXTURE_SEED,
    warmupCount: 3,
    sampleCount: 10,
    scenarios: REFERENCE_SCENARIO_IDS,
    requirements: {
      logicalCpuCount: 8,
      memoryBytes: 16 * 1024 ** 3,
      storage: "ssd",
      productionBuild: true,
      debugLogging: false,
      devtools: false,
    },
  };
}

export interface SampleSummary {
  readonly minMs: number;
  readonly maxMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly peakRssBytes: number;
}

export function nearestRankPercentile(samples: readonly number[], percentile: number): number {
  if (samples.length === 0 || samples.some((sample) => !Number.isFinite(sample) || sample < 0)) {
    throw new RangeError("At least one finite non-negative sample is required");
  }
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 100) {
    throw new RangeError("Percentile must be greater than zero and at most 100");
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const rank = Math.ceil((percentile / 100) * sorted.length);
  return sorted[rank - 1]!;
}

export function summarizeSamples(samplesMs: readonly number[], rssSamplesBytes: readonly number[]): SampleSummary {
  if (rssSamplesBytes.length === 0 || rssSamplesBytes.some((sample) => !Number.isFinite(sample) || sample < 0)) {
    throw new RangeError("At least one finite non-negative RSS sample is required");
  }
  return {
    minMs: Math.min(...samplesMs),
    maxMs: Math.max(...samplesMs),
    p50Ms: nearestRankPercentile(samplesMs, 50),
    p95Ms: nearestRankPercentile(samplesMs, 95),
    peakRssBytes: Math.max(...rssSamplesBytes),
  };
}

function roundedRatio(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function compareWithBaseline(
  current: { readonly p95Ms: number; readonly peakRssBytes: number },
  baseline: { readonly p95Ms: number; readonly peakRssBytes: number },
): {
  readonly pass: boolean;
  readonly p95RegressionRatio: number;
  readonly rssRegressionRatio: number;
  readonly failures: string[];
} {
  if (baseline.p95Ms <= 0 || baseline.peakRssBytes <= 0) {
    throw new RangeError("Baseline values must be greater than zero");
  }
  const p95RegressionRatio = roundedRatio(current.p95Ms / baseline.p95Ms - 1);
  const rssRegressionRatio = roundedRatio(current.peakRssBytes / baseline.peakRssBytes - 1);
  const failures: string[] = [];
  if (p95RegressionRatio > 0.15) failures.push("relative_p95_regression");
  if (rssRegressionRatio > 0.2) failures.push("relative_rss_regression");
  return { pass: failures.length === 0, p95RegressionRatio, rssRegressionRatio, failures };
}

export function evaluateAbsoluteBudget(
  measurement: {
    readonly p50Ms?: number;
    readonly p95Ms?: number;
    readonly cancelMs?: number;
    readonly maxTaskMs?: number;
    readonly firstPageP95Ms?: number;
    readonly incrementalP95Ms?: number;
    readonly switchP95Ms?: number;
    readonly additionalPeakRssBytes?: number;
    readonly activeViewHeadroom?: number;
    readonly rejectOverLimitBeforeEditorView?: boolean;
  },
  budget: NumericBudget,
): { readonly pass: boolean; readonly failures: string[] } {
  const failures: string[] = [];
  const checks: ReadonlyArray<[keyof typeof measurement, keyof NumericBudget, string]> = [
    ["p50Ms", "p50Ms", "absolute_p50_budget"],
    ["p95Ms", "p95Ms", "absolute_p95_budget"],
    ["cancelMs", "cancelMs", "cancellation_budget"],
    ["maxTaskMs", "maxTaskMs", "event_loop_task_budget"],
    ["firstPageP95Ms", "firstPageP95Ms", "first_page_p95_budget"],
    ["incrementalP95Ms", "incrementalP95Ms", "incremental_p95_budget"],
    ["switchP95Ms", "switchP95Ms", "switch_p95_budget"],
    ["additionalPeakRssBytes", "additionalPeakRssBytes", "absolute_rss_budget"],
    ["activeViewHeadroom", "activeViewHeadroom", "active_view_headroom_budget"],
  ];
  for (const [measurementKey, budgetKey, failure] of checks) {
    const actual = measurement[measurementKey];
    const limit = budget[budgetKey];
    if (typeof actual === "number" && typeof limit === "number" && actual > limit) failures.push(failure);
  }
  if (
    budget.rejectOverLimitBeforeEditorView === true &&
    measurement.rejectOverLimitBeforeEditorView !== true
  ) {
    failures.push("over_limit_editor_view_gate");
  }
  return { pass: failures.length === 0, failures };
}

class PerformanceAbortError extends Error {
  readonly cancellationLatencyMs: number;

  constructor(name: "AbortError" | "CancellationBudgetError", latencyMs: number) {
    super(name === "AbortError" ? "Performance measurement aborted" : "Cancellation exceeded its budget");
    this.name = name;
    this.cancellationLatencyMs = latencyMs;
  }
}

export async function runMeasuredScenario(options: {
  readonly measure: (phase: "warmup" | "sample", iteration: number) => Promise<void> | void;
  readonly beforeEach?: (phase: "warmup" | "sample", iteration: number) => Promise<void> | void;
  readonly afterEach?: (phase: "warmup" | "sample", iteration: number) => Promise<void> | void;
  readonly now?: () => number;
  readonly readRssBytes?: () => number;
  readonly signal?: AbortSignal;
  readonly warmupCount?: number;
  readonly sampleCount?: number;
  readonly cancellationLimitMs?: number;
}): Promise<{
  readonly warmupCount: number;
  readonly samplesMs: number[];
  readonly rssSamplesBytes: number[];
  readonly summary: SampleSummary;
}> {
  const warmupCount = options.warmupCount ?? 3;
  const sampleCount = options.sampleCount ?? 10;
  if (warmupCount !== 3) throw new Error("Performance contract requires three warmups");
  if (sampleCount !== 10) throw new Error("Performance contract requires ten measurements");
  const now = options.now ?? performance.now.bind(performance);
  const readRssBytes = options.readRssBytes ?? (() => process.memoryUsage().rss);
  const cancellationLimitMs = options.cancellationLimitMs ?? 100;
  const samplesMs: number[] = [];
  const rssSamplesBytes: number[] = [];

  const execute = async (phase: "warmup" | "sample", iteration: number): Promise<number> => {
    if (options.signal?.aborted) throw new PerformanceAbortError("AbortError", 0);
    await options.beforeEach?.(phase, iteration);
    const startedAt = now();
    const measurement = Promise.resolve().then(() => options.measure(phase, iteration));
    measurement.catch(() => undefined);
    if (options.signal === undefined) {
      try {
        await measurement;
        return now() - startedAt;
      } finally {
        await options.afterEach?.(phase, iteration);
      }
    }
    let removeAbortListener = (): void => undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      const rejectForAbort = (): void => {
        const cancellationStartedAt = now();
        queueMicrotask(() => {
          const latency = Math.max(0, now() - cancellationStartedAt);
          reject(
            new PerformanceAbortError(
              latency > cancellationLimitMs ? "CancellationBudgetError" : "AbortError",
              latency,
            ),
          );
        });
      };
      removeAbortListener = () => options.signal?.removeEventListener("abort", rejectForAbort);
      options.signal?.addEventListener("abort", rejectForAbort, { once: true });
      if (options.signal?.aborted) rejectForAbort();
    });
    try {
      await Promise.race([measurement, aborted]);
      return now() - startedAt;
    } finally {
      removeAbortListener();
      await options.afterEach?.(phase, iteration);
    }
  };

  for (let index = 0; index < warmupCount; index += 1) {
    await execute("warmup", index);
  }
  for (let index = 0; index < sampleCount; index += 1) {
    samplesMs.push(await execute("sample", index));
    rssSamplesBytes.push(readRssBytes());
  }
  return {
    warmupCount,
    samplesMs,
    rssSamplesBytes,
    summary: summarizeSamples(samplesMs, rssSamplesBytes),
  };
}

const SAFE_PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function buildPerformanceEvidencePath(hanaHome: string, commit: string, platform: string): string {
  if (!SAFE_PATH_SEGMENT.test(commit)) throw new Error("Invalid evidence commit");
  if (!SAFE_PATH_SEGMENT.test(platform)) throw new Error("Invalid evidence platform");
  return path.join(
    hanaHome,
    "knowledge-workspace",
    "evidence",
    "performance",
    commit,
    `${platform}.json`,
  );
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function containsDevelopmentPath(value: unknown): boolean {
  if (typeof value === "string") {
    return /(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/)/.test(value);
  }
  if (Array.isArray(value)) return value.some(containsDevelopmentPath);
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(containsDevelopmentPath);
  }
  return false;
}

type SafeEvidenceData =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: string };

function readSafeEvidenceData(input: unknown): SafeEvidenceData {
  const seen = new Set<object>();
  const visit = (value: unknown, depth: number): unknown => {
    if (depth > 16) throw new Error("input nesting exceeds limit");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value.length > 4_096) throw new Error("input string exceeds limit");
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("input number must be finite");
      return value;
    }
    if (typeof value !== "object") throw new Error("input contains an unsupported value");
    if (utilTypes.isProxy(value)) throw new Error("proxy input is not allowed");
    if (seen.has(value)) throw new Error("cyclic input is not allowed");
    seen.add(value);
    try {
      if (Array.isArray(value)) {
        if (value.length > 256) throw new Error("input array exceeds limit");
        const descriptors = Object.getOwnPropertyDescriptors(value);
        const keys = Object.keys(descriptors).filter((key) => key !== "length");
        if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
          throw new Error("sparse or decorated arrays are not allowed");
        }
        return keys.map((key) => {
          const descriptor = descriptors[key]!;
          if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
            throw new Error("accessor input is not allowed");
          }
          return visit(descriptor.value, depth + 1);
        });
      }
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) throw new Error("non-plain input is not allowed");
      if (Object.getOwnPropertySymbols(value).length > 0) throw new Error("symbol fields are not allowed");
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const keys = Object.keys(descriptors);
      if (keys.length > 64) throw new Error("input object has too many fields");
      const output: Record<string, unknown> = {};
      for (const key of keys) {
        if (key.length > 128) throw new Error("input field name exceeds limit");
        const descriptor = descriptors[key]!;
        if (!descriptor.enumerable || !("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
          throw new Error("accessor or hidden input is not allowed");
        }
        output[key] = visit(descriptor.value, depth + 1);
      }
      return output;
    } finally {
      seen.delete(value);
    }
  };
  try {
    return { ok: true, value: visit(input, 0) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "invalid input" };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const MEASUREMENT_KEYS = [
  "p50Ms",
  "p95Ms",
  "minMs",
  "maxMs",
  "peakRssBytes",
  "cancelMs",
  "maxTaskMs",
  "firstPageP95Ms",
  "incrementalP95Ms",
  "switchP95Ms",
  "additionalPeakRssBytes",
  "activeViewHeadroom",
  "rejectOverLimitBeforeEditorView",
] as const;

export function validatePerformanceEvidence(input: unknown): { ok: true } | { ok: false; errors: string[] } {
  const safe = readSafeEvidenceData(input);
  if ("error" in safe) return { ok: false, errors: [safe.error] };
  if (!isRecord(safe.value)) return { ok: false, errors: ["evidence must be an object"] };
  const evidence = safe.value;
  const errors: string[] = [];
  if (
    !hasExactKeys(evidence, [
      "schemaVersion",
      "fixtureSeed",
      "fixtureHash",
      "commit",
      "platform",
      "environment",
      "machine",
      "scenarios",
      "pass",
      "baselineMode",
    ])
  ) {
    errors.push("evidence fields do not match the closed schema");
  }
  if (evidence.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (evidence.fixtureSeed !== FIXTURE_SEED) errors.push(`fixtureSeed must be ${FIXTURE_SEED}`);
  if (typeof evidence.fixtureHash !== "string" || !/^[a-f0-9]{64}$/.test(evidence.fixtureHash)) {
    errors.push("fixtureHash must be sha256");
  }
  if (typeof evidence.commit !== "string" || !SAFE_PATH_SEGMENT.test(evidence.commit)) errors.push("commit is invalid");
  if (typeof evidence.platform !== "string" || !SAFE_PATH_SEGMENT.test(evidence.platform)) {
    errors.push("platform is invalid");
  }
  if (!isRecord(evidence.environment)) {
    errors.push("environment is required");
  } else {
    const environment = evidence.environment;
    if (!hasExactKeys(environment, ["productionBuild", "devtools", "debugLogging"])) {
      errors.push("environment fields do not match the closed schema");
    }
    if (environment.productionBuild !== true) errors.push("environment.productionBuild must be true");
    if (environment.devtools !== false) errors.push("environment.devtools must be false");
    if (environment.debugLogging !== false) errors.push("environment.debugLogging must be false");
  }
  if (!isRecord(evidence.machine)) {
    errors.push("machine is required");
  } else {
    const machine = evidence.machine;
    if (
      !hasExactKeys(machine, [
        "cpu",
        "logicalCpuCount",
        "memoryBytes",
        "os",
        "filesystem",
        "storage",
        "node",
      ])
    ) {
      errors.push("machine fields do not match the closed schema");
    }
    for (const key of ["cpu", "os", "filesystem", "node"]) {
      if (typeof machine[key] !== "string" || machine[key] === "") errors.push(`machine.${key} is required`);
      else if (containsDevelopmentPath(machine[key])) errors.push(`machine.${key} contains a development path`);
    }
    if (!Number.isSafeInteger(machine.logicalCpuCount) || Number(machine.logicalCpuCount) < 1) {
      errors.push("machine.logicalCpuCount is invalid");
    }
    if (!isFiniteNonNegative(machine.memoryBytes) || machine.memoryBytes === 0) {
      errors.push("machine.memoryBytes is invalid");
    }
    if (machine.storage !== "ssd") errors.push("machine.storage must be ssd");
  }
  if (!Array.isArray(evidence.scenarios) || evidence.scenarios.length !== REFERENCE_SCENARIO_IDS.length) {
    errors.push("all twelve scenarios are required");
  } else {
    const seenScenarioIds = new Set<string>();
    for (const [index, scenarioValue] of evidence.scenarios.entries()) {
      if (!isRecord(scenarioValue)) {
        errors.push(`scenarios[${index}] is invalid`);
        continue;
      }
      const scenario = scenarioValue;
      if (
        !hasExactKeys(scenario, [
          "id",
          "warmupCount",
          "samplesMs",
          "rssSamplesBytes",
          "measurement",
          "pass",
          "absoluteFailures",
          "baselineDisposition",
        ])
      ) {
        errors.push(`scenarios[${index}] fields do not match the closed schema`);
      }
      if (typeof scenario.id !== "string" || !(scenario.id in PERFORMANCE_BUDGETS)) {
        errors.push(`scenarios[${index}].id is unknown`);
      } else if (seenScenarioIds.has(scenario.id)) {
        errors.push(`scenarios[${index}].id is duplicated`);
      } else {
        seenScenarioIds.add(scenario.id);
      }
      if (scenario.warmupCount !== 3) errors.push(`scenarios[${index}].warmupCount must be three`);
      if (
        !Array.isArray(scenario.samplesMs) ||
        scenario.samplesMs.length !== 10 ||
        !scenario.samplesMs.every(isFiniteNonNegative)
      ) {
        errors.push(`scenarios[${index}].samplesMs must contain ten samples`);
      }
      if (
        !Array.isArray(scenario.rssSamplesBytes) ||
        scenario.rssSamplesBytes.length !== 10 ||
        !scenario.rssSamplesBytes.every(isFiniteNonNegative)
      ) {
        errors.push(`scenarios[${index}].rssSamplesBytes must contain ten samples`);
      }
      if (!isRecord(scenario.measurement) || !hasExactKeys(scenario.measurement, MEASUREMENT_KEYS)) {
        errors.push(`scenarios[${index}].measurement does not match the closed schema`);
      } else {
        const measurement = scenario.measurement;
        for (const key of MEASUREMENT_KEYS) {
          const value = measurement[key];
          if (key === "rejectOverLimitBeforeEditorView") {
            if (value !== null && typeof value !== "boolean") {
              errors.push(`scenarios[${index}].measurement.${key} is invalid`);
            }
          } else if (value !== null && !isFiniteNonNegative(value)) {
            errors.push(`scenarios[${index}].measurement.${key} is invalid`);
          }
        }
        if (Array.isArray(scenario.samplesMs) && scenario.samplesMs.length === 10) {
          const samples = scenario.samplesMs as number[];
          if (measurement.minMs !== Math.min(...samples)) errors.push(`scenarios[${index}].minMs is inconsistent`);
          if (measurement.maxMs !== Math.max(...samples)) errors.push(`scenarios[${index}].maxMs is inconsistent`);
          if (measurement.p50Ms !== nearestRankPercentile(samples, 50)) {
            errors.push(`scenarios[${index}].p50Ms is inconsistent`);
          }
          if (measurement.p95Ms !== nearestRankPercentile(samples, 95)) {
            errors.push(`scenarios[${index}].p95Ms is inconsistent`);
          }
        }
        if (
          Array.isArray(scenario.rssSamplesBytes) &&
          scenario.rssSamplesBytes.length === 10 &&
          measurement.peakRssBytes !== Math.max(...(scenario.rssSamplesBytes as number[]))
        ) {
          errors.push(`scenarios[${index}].peakRssBytes is inconsistent`);
        }
        if (typeof scenario.id === "string" && scenario.id in PERFORMANCE_BUDGETS) {
          const budget = PERFORMANCE_BUDGETS[scenario.id as PerformanceScenarioId];
          for (const budgetKey of Object.keys(budget) as Array<keyof NumericBudget>) {
            if (measurement[budgetKey] === null || measurement[budgetKey] === undefined) {
              errors.push(`scenarios[${index}].measurement.${budgetKey} is required`);
            }
          }
          const absolute = evaluateAbsoluteBudget(
            measurement as Parameters<typeof evaluateAbsoluteBudget>[0],
            budget,
          );
          if (
            Array.isArray(scenario.absoluteFailures) &&
            JSON.stringify(scenario.absoluteFailures) !== JSON.stringify(absolute.failures)
          ) {
            errors.push(`scenarios[${index}].absoluteFailures is inconsistent`);
          }
        }
      }
      if (typeof scenario.pass !== "boolean") errors.push(`scenarios[${index}].pass is invalid`);
      if (
        !Array.isArray(scenario.absoluteFailures) ||
        !scenario.absoluteFailures.every((failure) => typeof failure === "string")
      ) {
        errors.push(`scenarios[${index}].absoluteFailures is invalid`);
      }
      if (!isRecord(scenario.baselineDisposition)) {
        errors.push(`scenarios[${index}].baselineDisposition is invalid`);
      } else if (evidence.baselineMode === "establish") {
        if (
          !hasExactKeys(scenario.baselineDisposition, ["mode"]) ||
          scenario.baselineDisposition.mode !== "established"
        ) {
          errors.push(`scenarios[${index}].baselineDisposition must establish`);
        }
      } else if (evidence.baselineMode === "compare") {
        const disposition = scenario.baselineDisposition;
        if (
          !hasExactKeys(disposition, [
            "mode",
            "baseline",
            "p95RegressionRatio",
            "rssRegressionRatio",
            "failures",
            "pass",
          ]) ||
          disposition.mode !== "compared" ||
          !isRecord(disposition.baseline) ||
          !hasExactKeys(disposition.baseline, [
            "commit",
            "fixtureHash",
            "status",
            "selection",
            "p95Ms",
            "peakRssBytes",
          ]) ||
          typeof disposition.baseline.commit !== "string" ||
          !SAFE_PATH_SEGMENT.test(disposition.baseline.commit) ||
          typeof disposition.baseline.fixtureHash !== "string" ||
          !/^[a-f0-9]{64}$/.test(disposition.baseline.fixtureHash) ||
          disposition.baseline.fixtureHash !== evidence.fixtureHash ||
          disposition.baseline.status !== "passed" ||
          disposition.baseline.selection !== "latest-passing-same-runner" ||
          !isFiniteNonNegative(disposition.baseline.p95Ms) ||
          !isFiniteNonNegative(disposition.baseline.peakRssBytes) ||
          typeof disposition.p95RegressionRatio !== "number" ||
          !Number.isFinite(disposition.p95RegressionRatio) ||
          typeof disposition.rssRegressionRatio !== "number" ||
          !Number.isFinite(disposition.rssRegressionRatio) ||
          !Array.isArray(disposition.failures) ||
          !disposition.failures.every((failure) => typeof failure === "string") ||
          typeof disposition.pass !== "boolean"
        ) {
          errors.push(`scenarios[${index}].baselineDisposition comparison is invalid`);
        } else if (
          isRecord(scenario.measurement) &&
          isFiniteNonNegative(scenario.measurement.p95Ms) &&
          isFiniteNonNegative(scenario.measurement.peakRssBytes)
        ) {
          const expected = compareWithBaseline(
            {
              p95Ms: scenario.measurement.p95Ms,
              peakRssBytes: scenario.measurement.peakRssBytes,
            },
            {
              p95Ms: disposition.baseline.p95Ms,
              peakRssBytes: disposition.baseline.peakRssBytes,
            },
          );
          if (
            disposition.p95RegressionRatio !== expected.p95RegressionRatio ||
            disposition.rssRegressionRatio !== expected.rssRegressionRatio ||
            disposition.pass !== expected.pass ||
            JSON.stringify(disposition.failures) !== JSON.stringify(expected.failures)
          ) {
            errors.push(`scenarios[${index}].baselineDisposition is inconsistent`);
          }
        }
      }
      if (
        typeof scenario.pass === "boolean" &&
        Array.isArray(scenario.absoluteFailures) &&
        isRecord(scenario.baselineDisposition)
      ) {
        const baselinePass =
          scenario.baselineDisposition.mode === "established"
            ? true
            : scenario.baselineDisposition.pass === true;
        if (scenario.pass !== (scenario.absoluteFailures.length === 0 && baselinePass)) {
          errors.push(`scenarios[${index}].pass is inconsistent`);
        }
      }
    }
    if (
      seenScenarioIds.size !== REFERENCE_SCENARIO_IDS.length ||
      REFERENCE_SCENARIO_IDS.some((id) => !seenScenarioIds.has(id))
    ) {
      errors.push("scenario set is incomplete");
    }
  }
  if (evidence.baselineMode !== "establish" && evidence.baselineMode !== "compare") {
    errors.push("baselineMode is invalid");
  }
  if (typeof evidence.pass !== "boolean") errors.push("pass is invalid");
  if (
    typeof evidence.pass === "boolean" &&
    Array.isArray(evidence.scenarios) &&
    evidence.pass !== evidence.scenarios.every((scenario) => isRecord(scenario) && scenario.pass === true)
  ) {
    errors.push("evidence pass is inconsistent");
  }
  if (containsDevelopmentPath(evidence)) errors.push("evidence contains a development path");
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export interface ReferenceMachine {
  readonly cpu: string;
  readonly logicalCpuCount: number;
  readonly memoryBytes: number;
  readonly os: string;
  readonly filesystem: string;
  readonly storage: "ssd";
  readonly node: string;
}

export interface ReferenceEnvironment {
  readonly productionBuild: boolean;
  readonly devtools: boolean;
  readonly debugLogging: boolean;
}

export type ReferenceBaseline =
  | { readonly mode: "establish" }
  | {
      readonly mode: "compare";
      readonly commit: string;
      readonly fixtureHash: string;
      readonly machine: ReferenceMachine;
      readonly status: "passed";
      readonly selection: "latest-passing-same-runner";
      readonly values: Record<
        PerformanceScenarioId,
        { readonly p95Ms: number; readonly peakRssBytes: number }
      >;
    };

function snapshotRunnerInputs(
  machineInput: unknown,
  environmentInput: unknown,
  baselineInput: unknown,
): {
  readonly machine: ReferenceMachine;
  readonly environment: ReferenceEnvironment;
  readonly baseline: ReferenceBaseline;
} {
  const safe = readSafeEvidenceData({
    machine: machineInput,
    environment: environmentInput,
    baseline: baselineInput,
  });
  if ("error" in safe || !isRecord(safe.value)) {
    throw new Error(`Invalid reference runner input: ${"error" in safe ? safe.error : "invalid object"}`);
  }
  const machine = safe.value.machine;
  const environment = safe.value.environment;
  const baseline = safe.value.baseline;
  if (
    !isRecord(machine) ||
    !hasExactKeys(machine, [
      "cpu",
      "logicalCpuCount",
      "memoryBytes",
      "os",
      "filesystem",
      "storage",
      "node",
    ]) ||
    typeof machine.cpu !== "string" ||
    typeof machine.os !== "string" ||
    typeof machine.filesystem !== "string" ||
    typeof machine.node !== "string" ||
    machine.storage !== "ssd" ||
    !Number.isSafeInteger(machine.logicalCpuCount) ||
    !Number.isSafeInteger(machine.memoryBytes) ||
    containsDevelopmentPath(machine)
  ) {
    throw new Error("Reference machine does not meet the frozen runner schema");
  }
  if (!/^v?24(?:\.|$)/.test(machine.node)) {
    throw new Error("Reference machine does not meet the frozen Node 24 runner contract");
  }
  if (
    Number(machine.logicalCpuCount) < 8 ||
    Number(machine.memoryBytes) < 16 * 1024 ** 3
  ) {
    throw new Error("Reference machine does not meet the minimum CPU and memory contract");
  }
  if (
    !isRecord(environment) ||
    !hasExactKeys(environment, ["productionBuild", "devtools", "debugLogging"]) ||
    environment.productionBuild !== true ||
    environment.devtools !== false ||
    environment.debugLogging !== false
  ) {
    throw new Error("Reference environment does not meet the frozen production measurement contract");
  }
  const machineSnapshot: ReferenceMachine = {
    cpu: machine.cpu,
    logicalCpuCount: Number(machine.logicalCpuCount),
    memoryBytes: Number(machine.memoryBytes),
    os: machine.os,
    filesystem: machine.filesystem,
    storage: "ssd",
    node: machine.node,
  };
  const environmentSnapshot: ReferenceEnvironment = {
    productionBuild: true,
    devtools: false,
    debugLogging: false,
  };
  if (!isRecord(baseline) || baseline.mode === "establish") {
    if (!isRecord(baseline) || !hasExactKeys(baseline, ["mode"]) || baseline.mode !== "establish") {
      throw new Error("Reference baseline selection is invalid");
    }
    return { machine: machineSnapshot, environment: environmentSnapshot, baseline: { mode: "establish" } };
  }
  if (
    !hasExactKeys(baseline, [
      "mode",
      "commit",
      "fixtureHash",
      "machine",
      "status",
      "selection",
      "values",
    ]) ||
    baseline.mode !== "compare" ||
    typeof baseline.commit !== "string" ||
    !SAFE_PATH_SEGMENT.test(baseline.commit) ||
    typeof baseline.fixtureHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(baseline.fixtureHash) ||
    baseline.status !== "passed" ||
    baseline.selection !== "latest-passing-same-runner" ||
    !isRecord(baseline.machine) ||
    JSON.stringify(baseline.machine) !== JSON.stringify(machineSnapshot) ||
    !isRecord(baseline.values) ||
    !hasExactKeys(baseline.values, REFERENCE_SCENARIO_IDS)
  ) {
    throw new Error("Compare mode requires the latest passing same-runner baseline");
  }
  const values = {} as Record<
    PerformanceScenarioId,
    { readonly p95Ms: number; readonly peakRssBytes: number }
  >;
  for (const id of REFERENCE_SCENARIO_IDS) {
    const entry = baseline.values[id];
    if (
      !isRecord(entry) ||
      !hasExactKeys(entry, ["p95Ms", "peakRssBytes"]) ||
      !isFiniteNonNegative(entry.p95Ms) ||
      entry.p95Ms === 0 ||
      !isFiniteNonNegative(entry.peakRssBytes) ||
      entry.peakRssBytes === 0
    ) {
      throw new Error("Compare mode requires a complete same-runner baseline");
    }
    values[id] = { p95Ms: entry.p95Ms, peakRssBytes: entry.peakRssBytes };
  }
  return {
    machine: machineSnapshot,
    environment: environmentSnapshot,
    baseline: {
      mode: "compare",
      commit: baseline.commit,
      fixtureHash: baseline.fixtureHash,
      machine: machineSnapshot,
      status: "passed",
      selection: "latest-passing-same-runner",
      values,
    },
  };
}

export interface ReferenceBenchmarkObservation {
  readonly cancelMs?: number;
  readonly maxTaskMs?: number;
  readonly additionalPeakRssBytes?: number;
  readonly activeViewHeadroom?: number;
  readonly rejectOverLimitBeforeEditorView?: boolean;
}

export type ReferenceBenchmarkContext = Readonly<{
  readonly phase: "warmup" | "sample";
  readonly iteration: number;
  readonly signal?: AbortSignal;
  readonly dataset: KnowledgeFixtureDataset;
  readonly manifest: FixtureManifest;
  readonly scenarioFixture: ReturnType<KnowledgeFixtureDataset["scenario"]>;
}>;

export type ReferenceBenchmarkAdapter = (
  context: ReferenceBenchmarkContext,
) => Promise<ReferenceBenchmarkObservation | void> | ReferenceBenchmarkObservation | void;

export interface ReferenceBenchmarkProductAdapter {
  prepare(context: ReferenceBenchmarkContext): Promise<unknown> | unknown;
  measure(
    context: ReferenceBenchmarkContext,
    prepared: unknown,
  ): Promise<ReferenceBenchmarkObservation | void> | ReferenceBenchmarkObservation | void;
  cleanup?(context: ReferenceBenchmarkContext, prepared: unknown): Promise<void> | void;
}

export type ReferenceBenchmarkAdapterEntry =
  | ReferenceBenchmarkAdapter
  | ReferenceBenchmarkProductAdapter;

function maximumObservation(
  observations: readonly ReferenceBenchmarkObservation[],
  key: keyof Omit<ReferenceBenchmarkObservation, "rejectOverLimitBeforeEditorView">,
): number | undefined {
  const values = observations
    .map((observation) => observation[key])
    .filter((value): value is number => typeof value === "number");
  return values.length === 0 ? undefined : Math.max(...values);
}

function buildScenarioMeasurement(
  scenarioId: PerformanceScenarioId,
  summary: SampleSummary,
  observations: readonly ReferenceBenchmarkObservation[],
): Parameters<typeof evaluateAbsoluteBudget>[0] {
  const measurement: Parameters<typeof evaluateAbsoluteBudget>[0] = {
    cancelMs: maximumObservation(observations, "cancelMs"),
    maxTaskMs: maximumObservation(observations, "maxTaskMs"),
    additionalPeakRssBytes: maximumObservation(observations, "additionalPeakRssBytes"),
    activeViewHeadroom: maximumObservation(observations, "activeViewHeadroom"),
    rejectOverLimitBeforeEditorView:
      observations.some(
        (observation) => typeof observation.rejectOverLimitBeforeEditorView === "boolean",
      )
        ? observations.every((observation) => observation.rejectOverLimitBeforeEditorView === true)
        : undefined,
  };
  if (scenarioId === "searchWarmTrigram") {
    return { ...measurement, p50Ms: summary.p50Ms, p95Ms: summary.p95Ms };
  }
  if (scenarioId === "denseWikilinks50k") {
    return { ...measurement, incrementalP95Ms: summary.p95Ms };
  }
  if (scenarioId === "searchWarmShort") {
    return { ...measurement, firstPageP95Ms: summary.p95Ms };
  }
  if (scenarioId === "multiView100Tabs") {
    return { ...measurement, switchP95Ms: summary.p95Ms };
  }
  return { ...measurement, p95Ms: summary.p95Ms };
}

function assertRequiredMeasurements(
  measurement: Parameters<typeof evaluateAbsoluteBudget>[0],
  budget: NumericBudget,
  scenarioId: PerformanceScenarioId,
): void {
  for (const key of Object.keys(budget) as Array<keyof NumericBudget>) {
    if (measurement[key] === undefined) {
      throw new Error(`Reference adapter ${scenarioId} did not report ${key}`);
    }
  }
}

function completeMeasurement(
  measurement: Parameters<typeof evaluateAbsoluteBudget>[0],
  summary: SampleSummary,
): Record<(typeof MEASUREMENT_KEYS)[number], number | boolean | null> {
  return {
    p50Ms: summary.p50Ms,
    p95Ms: summary.p95Ms,
    minMs: summary.minMs,
    maxMs: summary.maxMs,
    peakRssBytes: summary.peakRssBytes,
    cancelMs: measurement.cancelMs ?? null,
    maxTaskMs: measurement.maxTaskMs ?? null,
    firstPageP95Ms: measurement.firstPageP95Ms ?? null,
    incrementalP95Ms: measurement.incrementalP95Ms ?? null,
    switchP95Ms: measurement.switchP95Ms ?? null,
    additionalPeakRssBytes: measurement.additionalPeakRssBytes ?? null,
    activeViewHeadroom: measurement.activeViewHeadroom ?? null,
    rejectOverLimitBeforeEditorView: measurement.rejectOverLimitBeforeEditorView ?? null,
  };
}

export interface EvidenceFileIo {
  readonly mkdir: (directory: string) => void;
  readonly write: (filePath: string, content: string) => void;
  readonly rename: (from: string, to: string) => void;
  readonly unlink: (filePath: string) => void;
}

const DEFAULT_EVIDENCE_IO: EvidenceFileIo = {
  mkdir: (directory) => fs.mkdirSync(directory, { recursive: true }),
  write: (filePath, content) =>
    fs.writeFileSync(filePath, content, { encoding: "utf8", mode: 0o600, flag: "wx" }),
  rename: (from, to) => fs.renameSync(from, to),
  unlink: (filePath) => fs.unlinkSync(filePath),
};

export function writePerformanceEvidenceAtomically(
  evidencePath: string,
  evidence: unknown,
  io: EvidenceFileIo = DEFAULT_EVIDENCE_IO,
): void {
  const validation = validatePerformanceEvidence(evidence);
  if ("errors" in validation) {
    throw new Error(`Invalid performance evidence: ${validation.errors.join("; ")}`);
  }
  const temporaryPath = `${evidencePath}.tmp`;
  io.mkdir(path.dirname(evidencePath));
  let temporaryMayExist = false;
  try {
    temporaryMayExist = true;
    io.write(temporaryPath, `${JSON.stringify(evidence, null, 2)}\n`);
    io.rename(temporaryPath, evidencePath);
    temporaryMayExist = false;
  } finally {
    if (temporaryMayExist) {
      try {
        io.unlink(temporaryPath);
      } catch {
        // Best-effort removal cannot replace the original mkdir/write/rename failure.
      }
    }
  }
}

export async function runReferenceBenchmark(options: {
  readonly hanaHome: string;
  readonly commit: string;
  readonly platform: string;
  readonly machine: ReferenceMachine;
  readonly environment: ReferenceEnvironment;
  readonly adapters: Partial<Record<PerformanceScenarioId, ReferenceBenchmarkAdapterEntry>>;
  readonly baseline: ReferenceBaseline;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
  readonly readRssBytes?: () => number;
  readonly evidenceIo?: EvidenceFileIo;
}): Promise<{ readonly evidencePath: string; readonly evidence: Record<string, unknown> }> {
  const snapshot = snapshotRunnerInputs(options.machine, options.environment, options.baseline);
  const plan = createReferenceBenchmarkPlan();
  const missing = plan.scenarios.filter((scenario) => options.adapters[scenario] === undefined);
  if (missing.length > 0) {
    throw new Error(`Missing reference benchmark adapters: ${missing.join(", ")}`);
  }
  const dataset = createKnowledgeFixtureDataset(resolveFixtureProfile("full"));
  if (snapshot.baseline.mode === "compare" && snapshot.baseline.fixtureHash !== dataset.identity) {
    throw new Error("Compare baseline fixture identity does not match the current full dataset");
  }
  const fixture = dataset.manifest;
  const scenarios: Array<Record<string, unknown>> = [];
  for (const scenarioId of plan.scenarios) {
    const adapter = options.adapters[scenarioId]!;
    const observations: ReferenceBenchmarkObservation[] = [];
    const scenarioFixture = dataset.scenario(scenarioId);
    let prepared: unknown;
    let preparedContext: ReferenceBenchmarkContext | null = null;
    const contextFor = (
      phase: "warmup" | "sample",
      iteration: number,
    ): ReferenceBenchmarkContext => ({
      phase,
      iteration,
      signal: options.signal,
      dataset,
      manifest: fixture,
      scenarioFixture,
    });
    const result = await runMeasuredScenario({
      beforeEach: async (phase, iteration) => {
        if (typeof adapter === "function") return;
        preparedContext = contextFor(phase, iteration);
        prepared = await adapter.prepare(preparedContext);
      },
      measure: async (phase, iteration) => {
        const context = preparedContext ?? contextFor(phase, iteration);
        const observation = typeof adapter === "function"
          ? await adapter(context)
          : await adapter.measure(context, prepared);
        if (phase === "sample" && observation !== undefined && typeof observation === "object") {
          observations.push(observation);
        }
      },
      afterEach: async () => {
        if (typeof adapter !== "function" && preparedContext) {
          await adapter.cleanup?.(preparedContext, prepared);
          prepared = undefined;
          preparedContext = null;
        }
      },
      signal: options.signal,
      now: options.now,
      readRssBytes: options.readRssBytes,
    });
    const baseline =
      snapshot.baseline.mode === "compare" ? snapshot.baseline.values[scenarioId] : undefined;
    const baselineDisposition =
      baseline === undefined
        ? { mode: "established" as const }
        : {
            mode: "compared" as const,
            baseline: {
              commit: snapshot.baseline.mode === "compare" ? snapshot.baseline.commit : "",
              fixtureHash:
                snapshot.baseline.mode === "compare" ? snapshot.baseline.fixtureHash : "",
              status: snapshot.baseline.mode === "compare" ? snapshot.baseline.status : "passed",
              selection:
                snapshot.baseline.mode === "compare"
                  ? snapshot.baseline.selection
                  : "latest-passing-same-runner",
              ...baseline,
            },
            ...compareWithBaseline(
              { p95Ms: result.summary.p95Ms, peakRssBytes: result.summary.peakRssBytes },
              baseline,
            ),
          };
    const measurement = buildScenarioMeasurement(scenarioId, result.summary, observations);
    assertRequiredMeasurements(measurement, PERFORMANCE_BUDGETS[scenarioId], scenarioId);
    const absolute = evaluateAbsoluteBudget(
      measurement,
      PERFORMANCE_BUDGETS[scenarioId],
    );
    scenarios.push({
      id: scenarioId,
      warmupCount: result.warmupCount,
      samplesMs: result.samplesMs,
      rssSamplesBytes: result.rssSamplesBytes,
      measurement: completeMeasurement(measurement, result.summary),
      pass: absolute.pass && ("pass" in baselineDisposition ? baselineDisposition.pass : true),
      absoluteFailures: absolute.failures,
      baselineDisposition,
    });
  }
  const evidence: Record<string, unknown> = {
    schemaVersion: 1,
    fixtureSeed: FIXTURE_SEED,
    fixtureHash: dataset.identity,
    commit: options.commit,
    platform: options.platform,
    environment: snapshot.environment,
    machine: snapshot.machine,
    scenarios,
    pass: scenarios.every((scenario) => scenario.pass === true),
    baselineMode: snapshot.baseline.mode,
  };
  const validation = validatePerformanceEvidence(evidence);
  if ("errors" in validation) {
    throw new Error(`Invalid performance evidence: ${validation.errors.join("; ")}`);
  }
  const evidencePath = buildPerformanceEvidencePath(options.hanaHome, options.commit, options.platform);
  writePerformanceEvidenceAtomically(evidencePath, evidence, options.evidenceIo);
  return { evidencePath, evidence };
}
