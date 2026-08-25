import assert from "node:assert/strict";
import test from "node:test";
import { FinanceApplication } from "../src/application.js";
import { cleanup, makeContext, tempDir } from "./helpers.js";

const events = [
  { assetId: "600519.SH", side: "buy", quantity: 10, price: 1000, fee: 10, date: "2026-01-01" },
  { assetId: "600519.SH", side: "sell", quantity: 4, price: 1200, fee: 8, date: "2026-02-01" },
];

test("ledger preview is atomic and portfolio separates realized/unrealized P&L with FX status", () => {
  const dir = tempDir("ledger");
  try {
    const app = new FinanceApplication(makeContext(dir));
    const bad = app.previewLedger({ format: "json", content: [{ ...events[0], quantity: -1 }] }).preview;
    assert.equal(bad.canCommit, false);
    assert.throws(() => app.commitLedger({ previewId: bad.previewId }), (error) => error.code === "invalid_import");
    assert.equal(app.portfolio().positions.length, 0);
    const preview = app.previewLedger({ format: "json", content: events }).preview;
    app.commitLedger({ previewId: preview.previewId, revision: preview.baseRevision, digest: preview.digest });
    const position = app.portfolio().positions[0];
    assert.equal(position.quantity, 6);
    assert.equal(position.realizedPnl, 788);
    assert.ok(position.unrealizedPnl > 0);
    assert.equal(position.fx.status, "not-required");
    assert.equal(position.quoteFreshness, "stale");
  } finally { cleanup(dir); }
});

test("ledger rejects sell-before-buy, cross-batch oversell, and stale preview commits", () => {
  const dir = tempDir("ledger-order");
  try {
    const app = new FinanceApplication(makeContext(dir));
    const reversed = app.previewLedger({ format: "json", content: [{ assetId: "600519.SH", side: "sell", quantity: 1, price: 1200, date: "2026-01-01" }, { assetId: "600519.SH", side: "buy", quantity: 1, price: 1000, date: "2026-02-01" }] }).preview;
    assert.equal(reversed.canCommit, false);
    const first = app.previewLedger({ format: "json", content: [events[0]] }).preview;
    assert.throws(() => app.commitLedger({ previewId: first.previewId, revision: first.baseRevision, digest: "wrong" }), (error) => error.code === "preview_changed");
    app.commitLedger({ previewId: first.previewId, revision: first.baseRevision, digest: first.digest });
    const oversell = app.previewLedger({ format: "json", content: [{ ...events[1], quantity: 11 }] }).preview;
    assert.equal(oversell.canCommit, false);
    const stale = app.previewLedger({ format: "json", content: [{ ...events[1], quantity: 1 }] }).preview;
    app.saveStrategy({ name: "revision bump", universe: ["600519.SH"], filters: [] });
    assert.throws(() => app.commitLedger({ previewId: stale.previewId, revision: stale.baseRevision, digest: stale.digest }), (error) => error.code === "preview_changed");
  } finally { cleanup(dir); }
});

test("strategy validation rejects unknown fields and non-PIT fundamentals", () => {
  const dir = tempDir("strategy");
  try {
    const app = new FinanceApplication(makeContext(dir));
    assert.throws(() => app.saveStrategy({ name: "bad", universe: ["600519.SH"], filters: [{ field: "futureReturn", operator: "gt", value: 1 }] }), (error) => error.code === "invalid_request");
    assert.throws(() => app.saveStrategy({ name: "bad-pit", universe: ["600519.SH"], filters: [{ field: "roe", operator: "gt", value: 0.1, pit: false }] }), (error) => error.code === "invalid_definition");
    assert.throws(() => app.saveStrategy({ name: "bad-factor", universe: ["600519.SH"], filters: [], factors: [{ field: "future_alpha", weight: 1 }] }), (error) => error.code === "invalid_request");
    assert.throws(() => app.saveStrategy({ name: "bad-unit", universe: ["600519.SH"], filters: [{ field: "roe", operator: "gt", value: 0.1, unit: "CNY", pit: true }] }), (error) => error.code === "unit_mismatch");
  } finally { cleanup(dir); }
});

test("screening executes allowlisted price rules with field-level explanations", () => {
  const dir = tempDir("screen");
  try {
    const app = new FinanceApplication(makeContext(dir));
    const strategy = app.saveStrategy({ name: "price screen", universe: ["600519.SH", "00700.HK"], filters: [{ field: "price", operator: "gt", value: 500 }], factors: [{ field: "price_momentum", weight: 1 }], missing: "exclude" });
    const result = app.screen({ immutableId: strategy.immutableId });
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows.every((row) => row.filterResults[0].evidence), true);
    assert.match(result.explanation, /filter and factor/i);
  } finally { cleanup(dir); }
});

test("backtest blocks missing gates and returns immutable manifests, costs, rules, risk and checkpoint", () => {
  const dir = tempDir("backtest");
  try {
    const app = new FinanceApplication(makeContext(dir));
    const strategy = app.saveStrategy({ name: "quality", universe: ["600519.SH", "00700.HK"], filters: [], factors: [{ field: "price_momentum", weight: 1 }], missing: "exclude" });
    assert.throws(() => app.runBacktest({ immutableId: strategy.immutableId, assumptions: {}, allowExperimental: true, confirmed: true }), (error) => error.code === "quality_gate_blocked");
    const assumptions = { calendar: "versioned", marketRules: "A-HK-v1", tPlusOne: true, priceLimits: "market-specific", pit: true, adjustment: "none", fees: 0.001, slippage: 0.001, liquidity: "5pct", capacity: 1_000_000 };
    assert.throws(() => app.runBacktest({ immutableId: strategy.immutableId, assumptions, allowExperimental: false, confirmed: true }), (error) => error.code === "quality_gate_blocked");
    const result = app.runBacktest({ immutableId: strategy.immutableId, assumptions, allowExperimental: true, confirmed: true, runBudget: 10000 }).result;
    assert.equal(result.sourceManifest.immutable, true);
    assert.equal(result.sourceManifest.datasets.length, 2);
    assert.equal(result.checkpoint.manifestHash, result.sourceManifest.hash);
    assert.ok(Number.isFinite(result.metrics.netReturn));
    assert.ok(result.costManifest.fees > 0);
    assert.match(result.limitations.join(" "), /not investment advice/i);
    assert.equal(app.portfolio().positions.length, 0);
  } finally { cleanup(dir); }
});
