import assert from "node:assert/strict";
import test from "node:test";
import { FinanceApplication } from "../src/application.js";
import { cleanup, makeContext, tempDir } from "./helpers.js";

test("capability matrix is explicit for every A/HK dataset and market dump stays blocked", () => {
  const dir = tempDir("capabilities");
  try {
    const app = new FinanceApplication(makeContext(dir));
    const result = app.capabilities();
    assert.equal(result.cells.length, 2 * 8 * 2);
    assert.equal(result.cells.filter((cell) => cell.market === "HK").length, 16);
    assert.equal(result.cells.find((cell) => cell.market === "A" && cell.dataset === "quote" && cell.provider === "hithink-rest").status, "unavailable");
    assert.equal(app.status().marketDump.status, "blocked");
    assert.equal(app.status().plugin.trading, "permanently-disabled");
  } finally { cleanup(dir); }
});

test("provider probe fails closed on incomplete HTTP 200 data and supports only comprehensive dataset semantics", async () => {
  const dir = tempDir("probe");
  try {
    let payload = { code: 200, data: [] };
    const ctx = makeContext(dir, { config: { hithinkApiKey: "secret" }, network: { fetch: async () => ({ ok: true, status: 200, json: async () => payload }) } });
    const app = new FinanceApplication(ctx);
    await assert.rejects(app.probeHithink({ dataset: "quote" }), (error) => error.code === "partial_data");
    payload = { code: 200, data: [{ price: 1, observed_at: "2026-08-25T01:00:00Z" }], request_id: "provider-partial" };
    const partial = await app.probeHithink({ dataset: "quote" });
    assert.equal(partial.capability.status, "partial");
    payload = { code: 200, data: [{ asset_id: "600519.SH", price: 1, observed_at: "2026-08-25T01:00:00Z", currency: "CNY", volume_unit: "share", amount_unit: "CNY", calendar: "CN-XSHG/XSHE-v1" }], request_id: "provider-1" };
    const result = await app.probeHithink({ dataset: "quote" });
    assert.equal(result.capability.status, "supported");
    assert.equal(result.providerRequestId, "provider-1");
    assert.equal(app.capabilities().cells.find((cell) => cell.dataset === "financials" && cell.provider === "hithink-rest").status, "partial");
  } finally { cleanup(dir); }
});

test("daily provider probe requires a meaningful ordered coverage window", async () => {
  const dir = tempDir("probe-window");
  try {
    let payload = { code: 200, data: [{ asset_id: "600519.SH", date: "2026-08-25", open: 1, high: 2, low: 1, close: 2, volume: 10, currency: "CNY", volume_unit: "share", adjustment: "none", calendar: "CN-XSHG/XSHE-v1", pit: true }] };
    const app = new FinanceApplication(makeContext(dir, { config: { hithinkApiKey: "secret" }, network: { fetch: async () => ({ ok: true, status: 200, json: async () => payload }) } }));
    assert.equal((await app.probeHithink({ dataset: "daily_kline" })).capability.status, "partial");
    payload = { code: 200, data: [payload.data[0], { ...payload.data[0], date: "2026-08-26", open: 2, high: 3, low: 2, close: 3 }] };
    assert.equal((await app.probeHithink({ dataset: "daily_kline" })).capability.status, "supported");
  } finally { cleanup(dir); }
});

test("a configured key or pinned policy cannot label fixture rows as remote without a successful fetch", () => {
  const dir = tempDir("no-false-lineage");
  try {
    let networkCalls = 0;
    const app = new FinanceApplication(makeContext(dir, { config: { hithinkApiKey: "configured" }, network: { fetch: async () => { networkCalls += 1; throw new Error("not called"); } } }));
    const automatic = app.quote({ assetId: "600519.SH" });
    assert.equal(automatic.snapshot.provider, "hana-fixture");
    assert.equal(automatic.snapshot.sourceKind, "fixture");
    app.setSourcePolicy({ market: "A", dataset: "quote", workflow: "interactive", mode: "pinned", pinnedSource: "hithink-rest" });
    assert.throws(() => app.quote({ assetId: "600519.SH" }), (error) => error.code === "provider_unavailable");
    assert.equal(networkCalls, 0);
  } finally { cleanup(dir); }
});

test("asset identity conflict and legacy low confidence stay out of downstream calculations", () => {
  const dir = tempDir("identity");
  try {
    const app = new FinanceApplication(makeContext(dir));
    const legacy = app.searchAssets({ query: "430047" }).assets[0];
    assert.equal(legacy.confirmed, false);
    assert.equal(legacy.identityStatus, "needs-confirmation");
    const conflict = app.searchAssets({ query: "平安" }).assets.find((item) => item.identityStatus === "conflict");
    assert.ok(conflict.mappingEvidence.candidates.length > 1);
    assert.throws(() => app.quote({ assetId: "920047.BJ" }), (error) => error.code === "invalid_asset");
  } finally { cleanup(dir); }
});

test("lists support versioned create, rename, mixed-market ordering and delete", () => {
  const dir = tempDir("lists");
  try {
    const app = new FinanceApplication(makeContext(dir));
    const created = app.mutateList({ kind: "watchlist", action: "create", name: "跨市场" });
    app.mutateList({ kind: "watchlist", action: "add", listId: created.id, assetId: "600519.SH" });
    app.mutateList({ kind: "watchlist", action: "add", listId: created.id, assetId: "00700.HK" });
    const moved = app.mutateList({ kind: "watchlist", action: "move", listId: created.id, assetId: "00700.HK", index: 0 });
    assert.deepEqual(moved.assetIds, ["00700.HK", "600519.SH"]);
    assert.ok(moved.version > 1);
    assert.equal(app.mutateList({ kind: "watchlist", action: "delete", listId: created.id }).deleted, true);
  } finally { cleanup(dir); }
});

test("quotes expose provenance, units, stale state, calendar and hidden-page refresh behavior", () => {
  const dir = tempDir("quote");
  try {
    const app = new FinanceApplication(makeContext(dir, { config: { refreshIntervalSeconds: 5 } }));
    const result = app.quote({ assetId: "00700.HK", interval: "daily" });
    assert.equal(result.snapshot.currency, "HKD");
    assert.equal(result.snapshot.units.volume, "share");
    assert.equal(result.snapshot.stale, true);
    assert.equal(result.snapshot.refresh.configuredSeconds, 10);
    assert.equal(result.snapshot.refresh.pauseWhenHidden, true);
    assert.match(result.snapshot.calendar, /HK/);
    assert.equal(result.snapshot.sourceDecision.selectedProvider, "hana-fixture");
  } finally { cleanup(dir); }
});
