import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createKnowledgeFixtureDataset,
  resolveFixtureProfile,
} from "./fixtures/knowledge-workspace/generate-fixture.ts";
import {
  PERFORMANCE_BUDGETS,
  REFERENCE_SCENARIO_IDS,
  type ReferenceBenchmarkContext,
  type ReferenceBenchmarkProductAdapter,
} from "./fixtures/knowledge-workspace/performance-budget.ts";
import {
  createKnowledgeProductPerformanceAdapters,
} from "./fixtures/knowledge-workspace/product-performance-adapters.ts";

describe("knowledge product performance adapters", () => {
  it("executes every reference scenario against product code with isolated lifecycle state", async () => {
    const scratchParent = fs.mkdtempSync(path.join(os.tmpdir(), "hana-kw-product-perf-"));
    const dataset = createKnowledgeFixtureDataset(resolveFixtureProfile("smoke"));
    const adapters = createKnowledgeProductPerformanceAdapters({ scratchParent });
    try {
      expect(Object.keys(adapters).sort()).toEqual([...REFERENCE_SCENARIO_IDS].sort());
      for (const scenarioId of REFERENCE_SCENARIO_IDS) {
        const adapter = adapters[scenarioId];
        expect(typeof adapter).toBe("object");
        const lifecycle = adapter as ReferenceBenchmarkProductAdapter;
        const context: ReferenceBenchmarkContext = {
          phase: "sample",
          iteration: 0,
          dataset,
          manifest: dataset.manifest,
          scenarioFixture: dataset.scenario(scenarioId),
        };
        const prepared = await lifecycle.prepare(context);
        try {
          const observation = await lifecycle.measure(context, prepared);
          for (const key of Object.keys(PERFORMANCE_BUDGETS[scenarioId])) {
            if (["p50Ms", "p95Ms", "firstPageP95Ms", "incrementalP95Ms", "switchP95Ms"].includes(key)) continue;
            expect(observation).toHaveProperty(key);
          }
        } finally {
          await lifecycle.cleanup?.(context, prepared);
        }
      }
    } finally {
      fs.rmSync(scratchParent, { recursive: true, force: true });
    }
  }, 120_000);
});
