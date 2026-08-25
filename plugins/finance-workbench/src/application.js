import fs from "node:fs";
import path from "node:path";
import {
  CAPABILITY_STATES,
  DATASETS,
  FinanceError,
  MARKETS,
  MODULES,
  SCHEMA_VERSION,
  TASK_STATES,
  assertEnum,
  canonicalJson,
  envelope,
  id,
  nowIso,
  redact,
  requireString,
  sha256,
} from "./contracts.js";
import { FinanceStore } from "./store.js";

const FIXTURE_AS_OF = "2026-08-20T07:00:00.000Z";
const DAY = 86_400_000;

const ASSETS = [
  { assetId: "600519.SH", market: "A", code: "600519", exchange: "SH", name: "贵州茅台", assetType: "equity", currency: "CNY", validFrom: "2001-08-27", validTo: null, provider: "hana-fixture", identityConfidence: 1, aliases: ["Kweichow Moutai"] },
  { assetId: "000001.SZ", market: "A", code: "000001", exchange: "SZ", name: "平安银行", assetType: "equity", currency: "CNY", validFrom: "1991-04-03", validTo: null, provider: "hana-fixture", identityConfidence: 1, aliases: ["Ping An Bank"] },
  { assetId: "00700.HK", market: "HK", code: "00700", exchange: "HK", name: "腾讯控股", assetType: "equity", currency: "HKD", validFrom: "2004-06-16", validTo: null, provider: "hana-fixture", identityConfidence: 1, aliases: ["Tencent"] },
];

const QUOTES = {
  "600519.SH": { price: 1418.22, previousClose: 1402.5, open: 1408.0, high: 1426.6, low: 1399.0, volume: 2_145_800, amount: 3_032_000_000, currency: "CNY", volumeUnit: "share", amountUnit: "CNY" },
  "000001.SZ": { price: 11.42, previousClose: 11.31, open: 11.3, high: 11.48, low: 11.26, volume: 65_320_000, amount: 744_000_000, currency: "CNY", volumeUnit: "share", amountUnit: "CNY" },
  "00700.HK": { price: 598.5, previousClose: 594.0, open: 596.0, high: 603.0, low: 591.5, volume: 18_920_000, amount: 11_320_000_000, currency: "HKD", volumeUnit: "share", amountUnit: "HKD" },
};

const DOSSIERS = {
  "600519.SH": [
    { dataset: "financials", title: "2025 年报指标样本", period: "2025-FY", fields: { revenueCny: 174_100_000_000, netIncomeCny: 86_200_000_000, roe: 0.344 }, pitAvailable: false },
    { dataset: "filings", title: "年度报告入口", period: "2025-FY", externalUrl: "https://www.sse.com.cn/", pitAvailable: true },
  ],
  "000001.SZ": [{ dataset: "financials", title: "2025 年报指标样本", period: "2025-FY", fields: { revenueCny: 146_700_000_000, netIncomeCny: 44_500_000_000 }, pitAvailable: false }],
  "00700.HK": [{ dataset: "financials", title: "2025 年报指标样本", period: "2025-FY", fields: { revenueHkd: 718_000_000_000, netIncomeHkd: 194_000_000_000 }, pitAvailable: false }],
};

export class FinanceApplication {
  constructor(ctx) {
    this.ctx = ctx;
    this.store = new FinanceStore(ctx.dataDir);
    this.previews = new Map();
    this.lastTrustedSnapshots = new Map();
    this.taskBackend = { status: "unknown", reason: "Plugin lifecycle has not probed TaskRegistry" };
  }

  status() {
    const state = this.store.snapshot();
    return envelope({
      plugin: { id: "finance-workbench", version: "1.0.0", minAppVersion: "0.0.4", mode: "offline-first", aiDefault: false, trading: "permanently-disabled", dependencies: ["PluginManager", "ResourceIO", "TaskRegistry (optional)", "SessionFile"] },
      revision: state.revision,
      modules: MODULES.map((module) => ({ module, status: "available" })),
      automation: this.taskBackend,
      marketDump: { sourceKind: "hithink-market-dump", status: "blocked", reason: "Cross-platform native DuckDB prototype evidence is incomplete", alternatives: ["hithink-rest", "explicit import"] },
    });
  }

  capabilities() {
    const key = this.config("hithinkApiKey");
    const state = this.store.snapshot();
    const cells = [];
    for (const market of MARKETS) {
      for (const dataset of DATASETS) {
        const verifiedProbe = state.providerProbes.find((probe) => probe.market === market && probe.dataset === dataset && probe.provider === "hithink-rest");
        cells.push(capabilityCell({
          market,
          dataset,
          workflow: dataset === "quote" || dataset.includes("kline") ? "interactive" : "research",
          provider: "hithink-rest",
          sourceKind: "remote-rest",
          status: market === "A" && ["identity", "quote", "daily_kline", "financials"].includes(dataset)
            ? (verifiedProbe?.status ?? (key ? "partial" : "unavailable"))
            : "unavailable",
          reason: market !== "A" ? "hithink-rest is not an HK provider" : verifiedProbe?.reason ?? (key ? "BYOK configured; this dataset remains partial until a live schema probe passes" : "BYOK is not configured"),
          authentication: key ? "configured-masked" : "missing",
          pit: dataset === "financials" ? "unverified" : dataset === "daily_kline" ? "observed" : "not-applicable",
        }));
        cells.push(capabilityCell({
          market,
          dataset,
          workflow: dataset === "quote" || dataset.includes("kline") ? "interactive" : "research",
          provider: "hana-fixture",
          sourceKind: "fixture",
          status: fixtureSupports(dataset) ? "experimental" : "unavailable",
          reason: fixtureSupports(dataset) ? "Deterministic, visibly labelled product demo and test fixture; not live market data" : "No fixture for this dataset",
          authentication: "not-required",
          pit: dataset === "daily_kline" ? "synthetic-point-in-time" : "not-verified",
        }));
      }
    }
    return envelope({ cells, sourcePolicies: state.sourcePolicies, probedAt: nowIso() });
  }

  async probeHithink(input = {}) {
    const dataset = assertEnum(input.dataset ?? "quote", ["identity", "quote", "daily_kline", "financials"], "dataset");
    const apiKey = this.config("hithinkApiKey");
    if (!apiKey) throw new FinanceError("permission_denied", "Configure a personal hithink-rest API key before probing", { alternative: "Use import or the labelled fixture" });
    if (!this.ctx.network?.fetch) throw new FinanceError("provider_unreachable", "Hana network capability is unavailable", { retryable: true });
    const endpointPath = normalizeEndpointPath(this.config("hithinkEndpointPath") ?? "/api/v1/financial-data");
    const requestId = id("probe");
    const response = await this.ctx.network.fetch(`https://fuyao.aicubes.cn${endpointPath}`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-api-key": apiKey },
      body: JSON.stringify({ dataset, market: "A", probe: true, limit: dataset === "daily_kline" ? 2 : 1, request_id: requestId }),
      timeoutMs: 10_000,
      maxResponseBytes: 1_048_576,
    });
    const body = await safeJson(response);
    if (!response.ok) throw new FinanceError(response.status === 429 ? "rate_limited" : "provider_unreachable", `hithink-rest HTTP ${response.status}`, { retryable: response.status === 429 || response.status >= 500 });
    if (!body || typeof body !== "object" || body.code === undefined || !("data" in body)) throw new FinanceError("schema_mismatch", "hithink-rest response did not match the documented business envelope");
    if (![0, "0", 200, "200", "success"].includes(body.code)) throw new FinanceError("provider_business_error", typeof body.message === "string" ? body.message : "hithink-rest rejected the probe", { details: { providerCode: String(body.code) } });
    const rows = Array.isArray(body.data) ? body.data : body.data && typeof body.data === "object" ? [body.data] : [];
    if (!rows.length) throw new FinanceError("partial_data", "Probe returned no data; an empty success cannot establish capability");
    const semantics = inspectProbeRows(dataset, rows);
    const capability = capabilityCell({ market: "A", dataset, workflow: "interactive", provider: "hithink-rest", sourceKind: "remote-rest", status: semantics.complete ? "supported" : "partial", reason: semantics.complete ? "Live account probe passed envelope and dataset semantics" : `Probe lacks required semantics: ${semantics.missing.join(", ")}`, authentication: "authorized", pit: semantics.pit });
    this.store.mutate("provider.probe", "system", (draft) => {
      draft.providerProbes = draft.providerProbes.filter((probe) => !(probe.market === "A" && probe.dataset === dataset && probe.provider === "hithink-rest"));
      draft.providerProbes.push({ market: "A", dataset, provider: "hithink-rest", status: capability.status, reason: capability.reason, probedAt: capability.probedAt, requestId, rows: redact(rows), contentHash: sha256(rows) });
      return { dataset, status: capability.status, requestId };
    });
    return envelope({ capability, providerRequestId: typeof body.request_id === "string" ? body.request_id : null }, requestId);
  }

  setSourcePolicy(input) {
    const market = assertEnum(input.market, MARKETS, "market");
    const dataset = assertEnum(input.dataset, DATASETS, "dataset");
    const workflow = requireString(input.workflow ?? "interactive", "workflow");
    const mode = assertEnum(input.mode, ["auto", "pinned"], "mode");
    const pinnedSource = mode === "pinned" ? requireString(input.pinnedSource, "pinnedSource") : null;
    return this.store.mutate("source-policy.set", "user", (draft) => {
      const key = `${market}:${dataset}:${workflow}`;
      const previous = draft.sourcePolicies.find((item) => item.key === key);
      const policy = { schemaVersion: SCHEMA_VERSION, key, market, dataset, workflow, mode, pinnedSource, version: (previous?.version ?? 0) + 1, updatedAt: nowIso() };
      draft.sourcePolicies = draft.sourcePolicies.filter((item) => item.key !== key);
      draft.sourcePolicies.push(policy);
      return policy;
    });
  }

  resolveSource({ market, dataset, workflow = "interactive", allowFixture = true }) {
    const state = this.store.snapshot();
    const key = `${market}:${dataset}:${workflow}`;
    const policy = state.sourcePolicies.find((item) => item.key === key) ?? { schemaVersion: 1, key, market, dataset, workflow, mode: "auto", pinnedSource: null, version: 1 };
    const hithinkConfigured = Boolean(this.config("hithinkApiKey"));
    const verifiedProbe = state.providerProbes.find((probe) => probe.market === market && probe.dataset === dataset && probe.provider === "hithink-rest" && probe.status === "supported");
    const candidates = [
      { provider: "hithink-rest", eligible: market === "A" && hithinkConfigured && Boolean(verifiedProbe), reason: verifiedProbe ? `verified dataset probe ${verifiedProbe.requestId}` : hithinkConfigured ? "requires a successful dataset-specific probe" : "BYOK missing" },
      { provider: "hana-fixture", eligible: allowFixture && fixtureSupports(dataset), reason: "experimental deterministic fixture" },
    ];
    let selected;
    if (policy.mode === "pinned") {
      selected = candidates.find((item) => item.provider === policy.pinnedSource && item.eligible);
      if (!selected) throw new FinanceError("provider_unavailable", `Pinned source ${policy.pinnedSource} is unavailable; no fallback was performed`, { alternative: "Change SourcePolicy or import data", details: { policy } });
    } else {
      selected = candidates.find((item) => item.provider === "hithink-rest" && item.eligible) ?? candidates.find((item) => item.provider === "hana-fixture" && item.eligible);
    }
    if (!selected) throw new FinanceError("provider_unavailable", "No semantically eligible source is available", { alternative: "Configure BYOK or import data" });
    return {
      schemaVersion: 1,
      decisionId: id("source"),
      policy,
      selectedProvider: selected.provider,
      sourceKind: selected.provider === "hana-fixture" ? "fixture" : "remote-rest",
      decidedAt: nowIso(),
      candidates: candidates.map((candidate) => ({ ...candidate, selected: candidate.provider === selected.provider })),
      fallback: null,
    };
  }

  searchAssets(input = {}) {
    const market = input.market && input.market !== "ALL" ? assertEnum(input.market, MARKETS, "market") : null;
    const query = String(input.query ?? "").trim().toLowerCase();
    const assets = ASSETS.filter((asset) => (!market || asset.market === market) && (!query || [asset.assetId, asset.code, asset.name, ...asset.aliases].some((value) => value.toLowerCase().includes(query))));
    const candidates = assets.map(assetRef);
    if (["430047", "430047.BJ"].includes(query.toUpperCase())) candidates.push({ schemaVersion: 1, assetId: "920047.BJ", market: "A", code: "920047", exchange: "BJ", name: "旧代码迁移候选", assetType: "equity", currency: "CNY", validFrom: null, validTo: null, provider: "identity-migration-fixture", identityConfidence: 0.72, confirmed: false, identityStatus: "needs-confirmation", mappingEvidence: { legacyCode: "430047.BJ", conflict: "BSE code migration evidence is intentionally incomplete" } });
    if (query === "平安") candidates.push({ schemaVersion: 1, assetId: null, market: "A", code: null, exchange: null, name: "平安（跨市场歧义）", assetType: "unknown", currency: null, provider: "identity-conflict-fixture", identityConfidence: 0.4, confirmed: false, identityStatus: "conflict", mappingEvidence: { candidates: ["000001.SZ", "601318.SH"], reason: "Name-only lookup crosses issuers" } });
    return envelope({ assets: candidates, count: candidates.length, confidencePolicy: "Only fixture identities with confidence=1 are pre-confirmed; migrations, conflicts, and low-confidence candidates cannot enter calculations" });
  }

  mutateList(input) {
    const kind = assertEnum(input.kind ?? "watchlist", ["watchlist", "researchPool"], "kind");
    const collection = kind === "watchlist" ? "watchlists" : "researchPools";
    const action = assertEnum(input.action ?? "add", ["create", "rename", "add", "remove", "move", "delete"], "action");
    const asset = ["add", "remove", "move"].includes(action) ? findAsset(input.assetId) : null;
    return this.store.mutate(`${kind}.${action}`, "user", (draft) => {
      if (action === "create") {
        const created = { id: id(kind === "watchlist" ? "watchlist" : "pool"), name: requireString(input.name, "name"), assetIds: [], version: 1 };
        draft[collection].push(created);
        return created;
      }
      const list = draft[collection].find((item) => item.id === (input.listId ?? (kind === "watchlist" ? "default" : "research")));
      if (!list) throw new FinanceError("not_found", `${kind} not found`, { status: 404 });
      if (action === "delete") {
        if (["default", "research"].includes(list.id)) throw new FinanceError("permission_denied", "The default list cannot be deleted");
        draft[collection] = draft[collection].filter((item) => item.id !== list.id);
        return { id: list.id, deleted: true };
      }
      if (action === "rename") list.name = requireString(input.name, "name");
      if (action === "add" && !list.assetIds.includes(asset.assetId)) list.assetIds.push(asset.assetId);
      if (action === "remove") list.assetIds = list.assetIds.filter((item) => item !== asset.assetId);
      if (action === "move") {
        list.assetIds = list.assetIds.filter((item) => item !== asset.assetId);
        list.assetIds.splice(Math.max(0, Math.min(Number(input.index) || 0, list.assetIds.length)), 0, asset.assetId);
      }
      list.version = (list.version ?? 0) + 1;
      return { ...list, assets: list.assetIds.map((assetId) => assetRef(findAsset(assetId))) };
    });
  }

  lists() {
    const state = this.store.snapshot();
    const project = (list) => ({ ...list, assets: list.assetIds.map((assetId) => assetRef(findAsset(assetId))) });
    return envelope({ watchlists: state.watchlists.map(project), researchPools: state.researchPools.map(project) });
  }

  quote(input) {
    const asset = findAsset(input.assetId);
    const interval = input.interval ?? "quote";
    assertEnum(interval, ["quote", "daily"], "interval");
    const decision = this.resolveSource({ market: asset.market, dataset: interval === "daily" ? "daily_kline" : "quote", workflow: "interactive", allowFixture: input.allowFixture !== false });
    const probe = this.store.snapshot().providerProbes.find((item) => item.market === asset.market && item.dataset === (interval === "daily" ? "daily_kline" : "quote") && item.provider === decision.selectedProvider && item.status === "supported");
    const raw = decision.selectedProvider === "hithink-rest" ? normalizeProbedQuote(probe?.rows?.[0], asset) : QUOTES[asset.assetId];
    if (!raw) throw new FinanceError("provider_unavailable", "No quote is available for this asset");
    if (raw.currency !== asset.currency || raw.volumeUnit !== "share") throw new FinanceError("unit_mismatch", "Provider quote units do not match the confirmed AssetRef");
    const observedAt = decision.selectedProvider === "hithink-rest" ? raw.observedAt : FIXTURE_AS_OF;
    const staleAt = new Date(Date.parse(observedAt) + 15 * 60_000).toISOString();
    const stale = Date.now() > Date.parse(staleAt);
    const rows = interval === "daily" ? (decision.selectedProvider === "hithink-rest" ? probe.rows.map((row) => normalizeProbedKline(row, asset.assetId)) : makeKline(asset.assetId, raw.price)) : [{ ...raw, observedAt }];
    const snapshot = {
      schemaVersion: 1,
      snapshotId: id("snapshot"),
      request: { assetId: asset.assetId, market: asset.market, dataset: interval === "daily" ? "daily_kline" : "quote", adjustment: interval === "daily" ? (input.adjustment ?? "none") : "not-applicable", pit: interval === "daily" },
      provider: decision.selectedProvider,
      sourceKind: decision.sourceKind,
      sourceDecision: decision,
      retrievedAt: nowIso(),
      observedAt,
      staleAt,
      stale,
      calendar: asset.market === "A" ? "CN-XSHG/XSHE-v1" : "HK-XHKG-v1",
      currency: asset.currency,
      units: { price: asset.currency, volume: "share", amount: asset.currency },
      adjustment: interval === "daily" ? (input.adjustment ?? "none") : "not-applicable",
      schemaHash: sha256(Object.keys(rows[0]).sort()),
      rowCount: rows.length,
      quality: decision.selectedProvider === "hithink-rest" ? { status: stale ? "partial" : "supported", reasons: ["Dataset-specific live schema probe", stale ? "Probed observation is stale" : "Probed observation is within stale window"] } : { status: "experimental", reasons: ["Labelled deterministic fixture", stale ? "Fixture observation is stale" : "Fixture observation within stale window"] },
      refresh: { configuredSeconds: clamp(Number(this.config("refreshIntervalSeconds")) || 30, 10, 300), calendarState: marketCalendarState(asset.market), pauseWhenHidden: true, pauseWhenSleeping: true, lastTrustedSnapshotAvailable: this.lastTrustedSnapshots.has(`${asset.assetId}:${interval}`) },
      rows,
    };
    this.lastTrustedSnapshots.set(`${asset.assetId}:${interval}`, structuredClone(snapshot));
    return envelope({ asset: assetRef(asset), snapshot });
  }

  dossier(input) {
    const asset = findAsset(input.assetId);
    const records = (DOSSIERS[asset.assetId] ?? []).map((record) => {
      const evidence = {
        schemaVersion: 1,
        evidenceId: id("evidence"),
        provider: "hana-fixture",
        sourceKind: "fixture",
        acquiredAt: nowIso(),
        applicableAt: FIXTURE_AS_OF,
        market: asset.market,
        assetId: asset.assetId,
        contentHash: sha256(record),
        quality: record.pitAvailable ? "experimental" : "partial",
      };
      return { ...record, evidence, quality: record.pitAvailable ? "experimental" : "partial", limitations: record.pitAvailable ? ["Fixture evidence"] : ["Provider revision/vintage is unavailable; not eligible for PIT backtests"] };
    });
    return envelope({ asset: assetRef(asset), records, count: records.length });
  }

  previewLedger(input) {
    const format = assertEnum(input.format ?? "json", ["json", "csv", "parquet"], "format");
    if (format === "parquet") throw new FinanceError("format_unavailable", "Parquet requires a verified runtime adapter; use CSV or JSON", { alternative: "CSV or JSON" });
    const rows = parseLedger(input.content, format);
    const normalized = rows.map((row, index) => validateLedgerRow(row, index));
    const state = this.store.snapshot();
    const errors = normalized.filter((item) => item.error).map((item) => item.error);
    const candidateRows = normalized.filter((item) => !item.error).map((item) => item.value);
    errors.push(...validateLedgerSequence(state.ledgerEvents, candidateRows));
    const previewId = id("preview");
    const digest = sha256({ baseRevision: state.revision, rows: candidateRows });
    const preview = { previewId, baseRevision: state.revision, createdAt: nowIso(), expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), digest, rows: candidateRows, errors, canCommit: normalized.length > 0 && errors.length === 0 };
    this.previews.set(previewId, preview);
    return envelope({ preview });
  }

  commitLedger(input) {
    const preview = this.previews.get(requireString(input.previewId, "previewId"));
    if (!preview || Date.now() > Date.parse(preview.expiresAt)) throw new FinanceError("preview_expired", "Ledger preview is missing or expired; preview again");
    if (!preview.canCommit) throw new FinanceError("invalid_import", "Ledger preview contains invalid rows");
    if (Number(input.revision) !== preview.baseRevision || input.digest !== preview.digest || this.store.snapshot().revision !== preview.baseRevision) throw new FinanceError("preview_changed", "Ledger changed after preview; preview again");
    const result = this.store.mutate("ledger.import", "user", (draft) => {
      const known = new Set(draft.ledgerEvents.map((event) => event.eventId));
      for (const event of preview.rows) if (!known.has(event.eventId)) draft.ledgerEvents.push(event);
      return { count: preview.rows.length, revision: draft.revision + 1 };
    });
    this.previews.delete(preview.previewId);
    return envelope({ committed: result });
  }

  portfolio() {
    const state = this.store.snapshot();
    const positions = new Map();
    for (const event of state.ledgerEvents) {
      const current = positions.get(event.assetId) ?? { assetId: event.assetId, quantity: 0, bookCost: 0, realizedPnl: 0, fees: 0, currency: event.currency };
      if (event.side === "buy") {
        current.quantity += event.quantity;
        current.bookCost += event.quantity * event.price + event.fee;
      } else {
        if (event.quantity > current.quantity) throw new FinanceError("ledger_inconsistent", `Sell quantity exceeds holdings for ${event.assetId}`);
        const averageCost = current.quantity ? current.bookCost / current.quantity : 0;
        current.realizedPnl += event.quantity * event.price - averageCost * event.quantity - event.fee;
        current.quantity -= event.quantity;
        current.bookCost -= averageCost * event.quantity;
      }
      current.fees += event.fee;
      positions.set(event.assetId, current);
    }
    const items = [...positions.values()].map((position) => {
      const quote = QUOTES[position.assetId];
      const marketValue = quote ? position.quantity * quote.price : null;
      return { ...position, cost: position.bookCost, averageCost: position.quantity ? position.bookCost / position.quantity : 0, marketValue, unrealizedPnl: marketValue === null ? null : marketValue - position.bookCost, valuationAt: quote ? FIXTURE_AS_OF : null, quoteFreshness: quote ? "stale" : "missing", fx: { baseCurrency: position.currency, rate: 1, status: "not-required" }, status: quote ? "stale" : "partial" };
    });
    return envelope({ ledgerRevision: state.revision, positions: items, totalsByCurrency: aggregatePortfolio(items), privateMaterials: state.privateMaterials.map((item) => ({ id: item.id, label: item.label, contentHash: item.contentHash, resourceKeyHash: item.resourceKeyHash, private: true })) });
  }

  async addPrivateMaterial(input) {
    const resourceRef = normalizePrivateResourceRef(input.resourceRef);
    if (typeof this.ctx.resources?.stat !== "function") throw new FinanceError("backend_unavailable", "ResourceIO validation is unavailable", { retryable: true });
    let descriptor;
    try {
      descriptor = await this.ctx.resources.stat(resourceRef, { auditRead: true });
    } catch (error) {
      throw new FinanceError("permission_denied", "ResourceIO denied or could not validate the private material");
    }
    if (!descriptor?.exists || descriptor.isDirectory) throw new FinanceError("invalid_request", "Private material must reference an existing file-like resource");
    return this.store.mutate("private-material.add", "user", (draft) => {
      const material = { id: id("material"), label: requireString(input.label, "label"), resourceRef, resourceKeyHash: sha256(String(descriptor.resourceKey ?? "unknown")), contentHash: typeof input.contentHash === "string" ? input.contentHash : descriptor.version?.sha256 ?? null, indexedAt: nowIso(), private: true };
      draft.privateMaterials.push(material);
      return material;
    });
  }

  removePrivateMaterial(input) {
    const materialId = requireString(input.materialId, "materialId");
    return this.store.mutate("private-material.remove", "user", (draft) => {
      const material = draft.privateMaterials.find((item) => item.id === materialId);
      if (!material) throw new FinanceError("not_found", "Private material reference not found", { status: 404 });
      draft.privateMaterials = draft.privateMaterials.filter((item) => item.id !== materialId);
      return { id: materialId, removed: true, contentHash: material.contentHash };
    });
  }

  saveStrategy(input) {
    const definition = normalizeStrategy(input);
    return this.store.mutate("strategy.save", "user", (draft) => {
      const versions = draft.strategies.filter((item) => item.strategyId === definition.strategyId);
      const saved = { ...definition, version: versions.length + 1, immutableId: sha256(definition), savedAt: nowIso() };
      draft.strategies.push(saved);
      return saved;
    });
  }

  strategies() {
    return envelope({ strategies: this.store.snapshot().strategies });
  }

  screen(input = {}) {
    const state = this.store.snapshot();
    const strategy = input.immutableId ? state.strategies.find((item) => item.immutableId === input.immutableId) : state.strategies.at(-1);
    if (!strategy) throw new FinanceError("invalid_definition", "Save a valid strategy before screening");
    const rows = strategy.universe.map((assetId) => {
      const asset = findAsset(assetId), quote = this.quote({ assetId }).snapshot;
      const price = quote.rows[0].price ?? quote.rows.at(-1)?.close;
      const filterResults = strategy.filters.map((filter) => filter.field === "price" ? { field: filter.field, passed: compareFilter(price, filter), value: price, unit: asset.currency, evidence: quote.snapshotId } : { field: filter.field, passed: false, value: null, unit: filter.unit, status: "pit_unavailable", reason: "Fixture fundamentals have no revision vintage" });
      const factorResults = strategy.factors.map((factor) => ({ field: factor.field, weight: factor.weight, value: factor.field === "price_momentum" ? calculateReturns(quote.rows).at(-1) ?? 0 : null, status: factor.field === "price_momentum" ? "experimental" : "partial" }));
      return { asset: assetRef(asset), passed: filterResults.every((item) => item.passed), filterResults, factorResults, score: factorResults.reduce((sum, item) => sum + (Number(item.value) || 0) * item.weight, 0), quality: quote.quality.status };
    });
    return envelope({ strategyImmutableId: strategy.immutableId, rows, missingPolicy: strategy.missing, explanation: "Each filter and factor reports its value, unit, evidence, and quality" });
  }

  runBacktest(input) {
    const state = this.store.snapshot();
    const strategy = input.immutableId ? state.strategies.find((item) => item.immutableId === input.immutableId) : state.strategies.at(-1);
    if (!strategy) throw new FinanceError("invalid_definition", "Save a valid strategy before running a backtest");
    const required = ["calendar", "marketRules", "tPlusOne", "priceLimits", "pit", "adjustment", "fees", "slippage", "liquidity", "capacity"];
    const missing = required.filter((key) => input.assumptions?.[key] === undefined || input.assumptions?.[key] === null);
    if (missing.length) throw new FinanceError("quality_gate_blocked", `Backtest assumptions missing: ${missing.join(", ")}`, { details: { missing } });
    if (input.allowExperimental !== true) throw new FinanceError("quality_gate_blocked", "Only experimental fixture history is present; explicit experimental consent is required", { details: { gate: "source-quality" } });
    if (input.confirmed !== true) throw new FinanceError("confirmation_required", "Backtest market rules, data coverage, and costs require explicit confirmation");
    if (strategy.filters.some((filter) => ["roe", "revenue", "marketCap"].includes(filter.field))) throw new FinanceError("pit_unavailable", "Fixture fundamentals have no provider revision vintage and cannot enter a point-in-time backtest");
    const runBudget = positiveNumber(input.runBudget ?? 10_000, "runBudget");
    const assets = strategy.universe.map(findAsset);
    const snapshots = assets.map((asset) => this.quote({ assetId: asset.assetId, interval: "daily", adjustment: input.assumptions.adjustment }).snapshot);
    const sourceManifest = runSourceManifest(snapshots);
    const returns = snapshots.map((snapshot) => calculateReturns(snapshot.rows));
    const combined = combineReturns(returns);
    const feeRate = finiteNonNegative(input.assumptions.fees, "fees") + finiteNonNegative(input.assumptions.slippage, "slippage");
    const grossReturn = combined.reduce((acc, value) => acc * (1 + value), 1) - 1;
    const turnover = Math.min(12, combined.length / 5);
    const netReturn = grossReturn - turnover * feeRate;
    const result = {
      runId: id("backtest"),
      status: "completed",
      strategyImmutableId: strategy.immutableId,
      strategyDefinition: strategy,
      sourceManifest,
      inputSnapshots: snapshots.map((snapshot) => ({ snapshotId: snapshot.snapshotId, schemaHash: snapshot.schemaHash, rowCount: snapshot.rowCount, observedAt: snapshot.observedAt })),
      assumptions: input.assumptions,
      costManifest: { fees: input.assumptions.fees, slippage: input.assumptions.slippage, liquidity: input.assumptions.liquidity, capacity: input.assumptions.capacity },
      marketRuleManifest: { calendar: input.assumptions.calendar, rules: input.assumptions.marketRules, tPlusOne: input.assumptions.tPlusOne, priceLimits: input.assumptions.priceLimits },
      checkpoint: { sequence: combined.length, manifestHash: sourceManifest.hash, resumable: true },
      budget: { requested: runBudget, consumed: combined.length * assets.length },
      startedAt: nowIso(),
      completedAt: nowIso(),
      deterministic: true,
      quality: "experimental",
      metrics: validateFiniteMetrics({ grossReturn, netReturn, annualizedVolatility: stddev(combined) * Math.sqrt(252), maxDrawdown: maxDrawdown(combined), turnover, observations: combined.length, costImpact: turnover * feeRate, missingRows: 0, capacityUtilization: Math.min(1, Number(input.assumptions.capacity) / 1_000_000) }),
      limitations: ["Deterministic fixture history", "Research result; not investment advice", "No order, broker, funds, or position mutation occurred"],
    };
    this.store.mutate("backtest.run", "user", (draft) => { draft.backtests.push(result); return result; });
    return envelope({ result });
  }

  backtests() {
    return envelope({ backtests: this.store.snapshot().backtests });
  }

  async createMonitor(input, invocationCtx = this.ctx) {
    if (input.confirmed !== true) throw new FinanceError("confirmation_required", "Creating a long-lived monitor requires confirmation");
    const asset = findAsset(input.assetId);
    const sourceDecision = this.resolveSource({ market: asset.market, dataset: "quote", workflow: "monitor" });
    const monitor = { id: id("monitor"), assetId: asset.assetId, dataset: "quote", condition: assertEnum(input.condition ?? "above", ["above", "below"], "condition"), threshold: positiveNumber(input.threshold, "threshold"), intervalSeconds: Math.max(30, Number(input.intervalSeconds) || 60), tradingSession: input.tradingSession ?? "market-calendar", cooldownSeconds: Math.max(60, Number(input.cooldownSeconds) || 300), staleBehavior: "suppress", alertTarget: input.alertTarget ?? "in-app-audit-only", notificationAuthorized: false, sourcePolicy: sourceDecision.policy, status: "active", confirmedAt: nowIso(), lastObservation: null };
    const scheduleId = `finance.monitor.${monitor.id}`;
    if (!invocationCtx.bus?.request) throw new FinanceError("backend_unavailable", "TaskRegistry is unavailable", { retryable: true });
    await this.scheduleMonitor(monitor, asset, invocationCtx);
    monitor.scheduleId = scheduleId;
    try {
      this.store.mutate("monitor.create", "user", (draft) => { draft.monitors.push(monitor); return monitor; });
    } catch (error) {
      try { await invocationCtx.bus.request("task:unschedule", { scheduleId }); } catch (compensationError) { invocationCtx.log?.error?.("Finance Workbench could not compensate an orphan monitor schedule", compensationError); }
      throw error;
    }
    return envelope({ monitor });
  }

  monitors() {
    const state = this.store.snapshot();
    return envelope({ monitors: state.monitors, tasks: state.tasks, taskStates: TASK_STATES });
  }

  async createResearchTask(input, invocationCtx = this.ctx) {
    if (input.confirmed !== true) throw new FinanceError("confirmation_required", "Creating scheduled research requires confirmation");
    const asset = findAsset(input.assetId);
    const snapshot = this.quote({ assetId: asset.assetId, interval: "daily" }).snapshot;
    const sourceManifest = runSourceManifest([snapshot]);
    const task = {
      id: id("research-task"),
      runId: id("scheduled-research"),
      assetId: asset.assetId,
      status: "queued",
      intervalSeconds: Math.max(300, Number(input.intervalSeconds) || 86_400),
      sourceManifest,
      sourcePolicyVersion: snapshot.sourceDecision.policy.version,
      checkpoint: { sequence: 0, manifestHash: sourceManifest.hash, resumable: true, at: nowIso() },
      confirmedAt: nowIso(),
    };
    task.scheduleId = `finance.research.${task.id}`;
    if (!invocationCtx.bus?.request) throw new FinanceError("backend_unavailable", "TaskRegistry is unavailable", { retryable: true });
    await this.scheduleResearchTask(task, invocationCtx);
    try {
      this.store.mutate("research-task.create", "user", (draft) => { draft.tasks.push(task); return task; });
    } catch (error) {
      try { await invocationCtx.bus.request("task:unschedule", { scheduleId: task.scheduleId }); } catch {}
      throw error;
    }
    return envelope({ task });
  }

  async actResearchTask(input) {
    const taskId = requireString(input.taskId, "taskId");
    const action = assertEnum(input.action, ["pause", "resume", "cancel", "retry"], "action");
    if (input.confirmed !== true) throw new FinanceError("confirmation_required", `Research task ${action} requires confirmation`);
    const task = this.store.snapshot().tasks.find((item) => item.id === taskId);
    if (!task) throw new FinanceError("not_found", "Research task not found", { status: 404 });
    if (typeof this.ctx.bus?.request !== "function") throw new FinanceError("backend_unavailable", "TaskRegistry is unavailable", { retryable: true });
    if (action === "pause" || action === "cancel") {
      if (action === "cancel") this.store.mutate("research-task.cancel-request", "user", (draft) => { draft.tasks.find((item) => item.id === taskId).status = "cancel_requested"; return { id: taskId, status: "cancel_requested" }; });
      const result = await this.ctx.bus.request("task:unschedule", { scheduleId: task.scheduleId });
      return envelope({ task: this.store.mutate(`research-task.${action}`, "user", (draft) => { const item = draft.tasks.find((entry) => entry.id === taskId); item.status = action === "cancel" && result?.removed === true ? "cancelled" : action === "cancel" ? "cancel_requested" : "paused"; item.checkpoint = { ...item.checkpoint, at: nowIso() }; return item; }) });
    }
    this.assertResearchManifest(task);
    await this.scheduleResearchTask(task);
    return envelope({ task: this.store.mutate(`research-task.${action}`, "user", (draft) => { const item = draft.tasks.find((entry) => entry.id === taskId); item.status = "queued"; item.checkpoint = { ...item.checkpoint, at: nowIso(), resumable: true }; return item; }) });
  }

  async runResearchTask(taskId) {
    const task = this.store.snapshot().tasks.find((item) => item.id === taskId);
    if (!task) throw new FinanceError("not_found", "Research task not found", { status: 404 });
    if (["paused", "cancel_requested", "cancelled"].includes(task.status)) return envelope({ task });
    try {
      this.assertResearchManifest(task);
      this.store.mutate("research-task.running", "system", (draft) => { draft.tasks.find((item) => item.id === taskId).status = "running"; return { id: taskId, status: "running" }; });
      const result = await this.runAgent({ runId: task.runId, assetId: task.assetId, question: "Scheduled public-evidence summary", useModel: false });
      return envelope({ task: this.store.mutate("research-task.completed", "system", (draft) => { const item = draft.tasks.find((entry) => entry.id === taskId); item.status = "completed"; item.checkpoint = { sequence: item.checkpoint.sequence + 1, manifestHash: item.sourceManifest.hash, resumable: true, at: nowIso() }; item.lastResult = { runId: result.run.runId, evidenceIds: result.run.evidenceIds }; return item; }) });
    } catch (error) {
      this.store.mutate("research-task.recoverable", "system", (draft) => { const item = draft.tasks.find((entry) => entry.id === taskId); item.status = "recoverable"; item.recoveryReason = error instanceof Error ? error.message : String(error); item.checkpoint = { ...item.checkpoint, resumable: true, at: nowIso() }; return item; });
      throw error;
    }
  }

  async actMonitor(input) {
    const monitorId = requireString(input.monitorId, "monitorId");
    const action = assertEnum(input.action, ["pause", "resume", "cancel", "retry"], "action");
    if (input.confirmed !== true) throw new FinanceError("confirmation_required", `Monitor ${action} requires confirmation`);
    const monitor = this.store.snapshot().monitors.find((item) => item.id === monitorId);
    if (!monitor) throw new FinanceError("not_found", "Monitor not found", { status: 404 });
    if (typeof this.ctx.bus?.request !== "function") throw new FinanceError("backend_unavailable", "TaskRegistry is unavailable", { retryable: true });
    if (action === "pause" || action === "cancel") {
      if (action === "cancel") this.store.mutate("monitor.cancel-request", "user", (draft) => { const item = draft.monitors.find((entry) => entry.id === monitorId); item.status = "cancel_requested"; return item; });
      const result = await this.ctx.bus.request("task:unschedule", { scheduleId: monitor.scheduleId });
      return envelope({ monitor: this.store.mutate(`monitor.${action}`, "user", (draft) => { const item = draft.monitors.find((entry) => entry.id === monitorId); item.status = action === "cancel" && result?.removed === true ? "cancelled" : action === "cancel" ? "cancel_requested" : "paused"; item.checkpoint = { at: nowIso(), observation: item.lastObservation, sourcePolicyVersion: item.sourcePolicy.version }; return item; }) });
    }
    await this.scheduleMonitor(monitor);
    return envelope({ monitor: this.store.mutate(`monitor.${action}`, "user", (draft) => { const item = draft.monitors.find((entry) => entry.id === monitorId); item.status = "active"; item.resumedAt = nowIso(); return item; }) });
  }

  observeMonitor(monitorId) {
    return this.store.mutate("monitor.observe", "system", (draft) => {
      const monitor = draft.monitors.find((item) => item.id === monitorId);
      if (!monitor) throw new FinanceError("not_found", "Monitor not found", { status: 404 });
      const result = this.quote({ assetId: monitor.assetId });
      const row = result.snapshot.rows[0];
      const triggered = !result.snapshot.stale && (monitor.condition === "above" ? row.price > monitor.threshold : row.price < monitor.threshold);
      monitor.status = "active";
      monitor.lastObservation = { observedAt: result.snapshot.observedAt, evaluatedAt: nowIso(), stale: result.snapshot.stale, price: row.price, triggered, provider: result.snapshot.provider, quality: result.snapshot.quality.status, decisionId: result.snapshot.sourceDecision.decisionId, reason: result.snapshot.stale ? "stale input suppressed" : triggered ? "threshold met" : "threshold not met" };
      monitor.checkpoint = { sequence: (monitor.checkpoint?.sequence ?? 0) + 1, at: nowIso(), sourcePolicyVersion: monitor.sourcePolicy.version };
      return monitor;
    });
  }

  createConsent(input) {
    const categories = Array.isArray(input.categories) ? input.categories.map((item) => assertEnum(item, ["private-data", "external-model", "long-task", "notification", "user-file-write"], "category")) : [];
    if (!categories.length) throw new FinanceError("invalid_request", "At least one consent category is required");
    return this.store.mutate("consent.create", "user", (draft) => {
      const consent = { consentId: id("consent"), runId: requireString(input.runId, "runId"), categories, fields: Array.isArray(input.fields) ? input.fields.map(String) : [], target: String(input.target ?? "hana-model"), purpose: String(input.purpose ?? "finance research"), budget: Math.max(0, Number(input.budget) || 0), status: input.approved === true ? "approved" : "rejected", approvedAt: input.approved === true ? nowIso() : null, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
      draft.consents.push(consent);
      return consent;
    });
  }

  async runAgent(input, options = {}) {
    rejectTradingIntent(input.question);
    const runId = input.runId ?? id("research"), asset = findAsset(input.assetId ?? "600519.SH");
    const privateFields = Array.isArray(input.privateFields) ? input.privateFields.map(String) : [];
    const wantsModel = input.useModel === true;
    if (wantsModel && this.config("aiEnabled") !== true) throw new FinanceError("permission_denied", "AI research is disabled in Finance Workbench settings");
    if (privateFields.length || wantsModel) this.assertConsent(runId, [...(privateFields.length ? ["private-data"] : []), ...(wantsModel ? ["external-model"] : [])], privateFields);
    const budget = Math.max(0, Number(input.budget) || 0);
    if (wantsModel && budget < 1) throw new FinanceError("budget_exhausted", "Model-assisted research requires a positive one-run budget", { details: { runId } });
    const evidence = this.dossier({ assetId: asset.assetId }).records.map((record) => record.evidence);
    const quote = this.quote({ assetId: asset.assetId });
    evidence.push({ evidenceId: id("evidence"), provider: quote.snapshot.provider, contentHash: sha256(quote.snapshot.rows), applicableAt: quote.snapshot.observedAt, quality: quote.snapshot.quality.status });
    let text = `${asset.name} (${asset.assetId}) has ${evidence.length} labelled evidence items. Current ${quote.snapshot.provider} quote is ${quote.snapshot.rows[0].price} ${asset.currency} and is ${quote.snapshot.stale ? "stale" : "fresh"}.`;
    if (wantsModel) {
      if (typeof options.sample !== "function") throw new FinanceError("model_unavailable", "Model sampling is unavailable; deterministic research remains available");
      text = await options.sample({ question: requireString(input.question, "question"), asset: assetRef(asset), quote: redact(quote.snapshot), evidence });
      if (typeof text !== "string" || !text.trim()) throw new FinanceError("unsubstantiated_output", "Model returned no substantiated output");
      if (!evidence.some((item) => text.includes(item.evidenceId))) throw new FinanceError("unsubstantiated_output", "Model output did not cite any supplied EvidenceRef", { details: { runId } });
    }
    const run = { runId, status: "completed", mode: wantsModel ? "model-assisted" : "deterministic", question: String(input.question ?? "Summarize evidence"), assetId: asset.assetId, evidenceIds: evidence.map((item) => item.evidenceId), output: text, budget: { limit: budget, consumed: wantsModel ? 1 : 0 }, completedAt: nowIso(), disclaimer: "Research draft; not investment advice" };
    this.store.mutate("agent.run", "user", (draft) => { draft.researchRuns.push(run); return run; });
    return envelope({ run, evidence });
  }

  assertConsent(runId, categories, fields) {
    const consent = [...this.store.snapshot().consents].reverse().find((item) => item.runId === runId && item.status === "approved" && Date.now() <= Date.parse(item.expiresAt));
    if (!consent || categories.some((category) => !consent.categories.includes(category)) || fields.some((field) => !consent.fields.includes(field))) throw new FinanceError("confirmation_required", "A one-run field-level consent is required before private access or model egress", { details: { runId, categories, fields } });
  }

  previewExport(input = {}) {
    const format = assertEnum(input.format ?? "json", ["json", "csv", "markdown"], "format");
    const allowedSections = ["portfolio", "strategies", "backtests", "monitors", "researchRuns", "privateMaterials"];
    const sections = Array.isArray(input.sections) ? input.sections.map((section) => assertEnum(String(section), allowedSections, "section")) : ["portfolio", "strategies", "backtests"];
    const state = this.store.snapshot();
    const document = exportDocument(state, sections);
    this.prunePreviews();
    if (this.previews.size >= 32) this.previews.delete(this.previews.keys().next().value);
    const preview = { previewId: id("export"), confirmToken: id("confirm"), format, sections, target: input.target ?? "session-file", fieldCount: countFields(document), privacy: sections.includes("privateMaterials") ? "private-descriptors-without-resource-refs" : "public-and-derived", digest: sha256(document), revision: state.revision, createdAt: nowIso(), expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), document };
    this.previews.set(preview.previewId, preview);
    return envelope({ preview: { ...preview, document: undefined } });
  }

  async writeExport(input, toolCtx = this.ctx) {
    const preview = this.previews.get(requireString(input.previewId, "previewId"));
    if (!preview || Date.now() > Date.parse(preview.expiresAt)) throw new FinanceError("preview_expired", "Export preview is missing or expired");
    if (input.confirmed !== true || input.confirmToken !== preview.confirmToken) throw new FinanceError("confirmation_required", "Export confirmation must use the token from a prior preview");
    if (input.digest !== preview.digest || Number(input.revision) !== preview.revision) throw new FinanceError("preview_changed", "Export preview digest or revision changed; preview again");
    if (this.store.snapshot().revision !== preview.revision) throw new FinanceError("preview_changed", "Finance data changed after preview; preview again");
    const outputDir = path.join(toolCtx.dataDir, "exports");
    fs.mkdirSync(outputDir, { recursive: true });
    const extension = preview.format === "markdown" ? "md" : preview.format;
    const filePath = path.join(outputDir, `finance-workbench-${Date.now()}.${extension}`);
    fs.writeFileSync(filePath, serializeExport(preview.document, preview.format), { encoding: "utf8", mode: 0o600 });
    const staged = typeof toolCtx.stageFile === "function" ? await toolCtx.stageFile({ sessionId: toolCtx.sessionId, sessionRef: toolCtx.sessionRef, filePath, label: path.basename(filePath) }) : null;
    this.audit("export.write", { format: preview.format, sections: preview.sections, target: staged ? "session-file" : "plugin-data" });
    this.previews.delete(preview.previewId);
    return envelope({ file: { label: path.basename(filePath), staged, storage: staged ? "session-file" : "plugin-data" } });
  }

  diagnostics(input = {}) {
    const state = this.store.snapshot();
    const query = String(input.query ?? "").toLowerCase();
    const events = state.audit.map(redact).filter((event) => !query || canonicalJson(event).toLowerCase().includes(query));
    return envelope({ revision: state.revision, events: events.slice(-200).reverse(), counts: { strategies: state.strategies.length, backtests: state.backtests.length, monitors: state.monitors.length, consents: state.consents.length, researchRuns: state.researchRuns.length }, sources: { providerProbes: state.providerProbes.map(({ rows, ...probe }) => probe), policies: state.sourcePolicies, runSourceManifests: state.backtests.map((run) => ({ runId: run.runId, manifest: run.sourceManifest })) }, secrets: "redacted", marketDump: "blocked" });
  }

  audit(action, result) {
    return this.store.mutate(action, "system", () => redact(result));
  }

  config(key) {
    try { return this.ctx.config?.get?.(key); } catch { return undefined; }
  }

  setTaskBackend(status, error) {
    this.taskBackend = { status, reason: error ? (error instanceof Error ? error.message : String(error)) : null, checkedAt: nowIso() };
  }

  async scheduleMonitor(monitor, asset = findAsset(monitor.assetId), invocationCtx = this.ctx) {
    if (typeof invocationCtx.bus?.request !== "function") throw new FinanceError("backend_unavailable", "TaskRegistry is unavailable", { retryable: true });
    await invocationCtx.bus.request("task:schedule", { scheduleId: monitor.scheduleId ?? `finance.monitor.${monitor.id}`, type: "finance-workbench-monitor", pluginId: "finance-workbench", intervalMs: monitor.intervalSeconds * 1000, payload: { monitorId: monitor.id }, meta: { label: `${asset.name} monitor` } });
  }

  async recoverMonitors() {
    for (const monitor of this.store.snapshot().monitors.filter((item) => item.status === "active")) await this.scheduleMonitor(monitor);
    for (const task of this.store.snapshot().tasks.filter((item) => ["queued", "running", "recoverable"].includes(item.status))) {
      this.assertResearchManifest(task);
      await this.scheduleResearchTask(task);
    }
  }

  async shutdown() {
    if (typeof this.ctx.bus?.request !== "function") return;
    for (const monitor of this.store.snapshot().monitors.filter((item) => item.status === "active" && item.scheduleId)) {
      try { await this.ctx.bus.request("task:unschedule", { scheduleId: monitor.scheduleId }); } catch (error) { this.ctx.log?.warn?.(`Could not unschedule ${monitor.scheduleId}`, error); }
    }
    for (const task of this.store.snapshot().tasks.filter((item) => ["queued", "running", "recoverable"].includes(item.status) && item.scheduleId)) {
      try { await this.ctx.bus.request("task:unschedule", { scheduleId: task.scheduleId }); } catch (error) { this.ctx.log?.warn?.(`Could not unschedule ${task.scheduleId}`, error); }
    }
  }

  async scheduleResearchTask(task, invocationCtx = this.ctx) {
    if (typeof invocationCtx.bus?.request !== "function") throw new FinanceError("backend_unavailable", "TaskRegistry is unavailable", { retryable: true });
    await invocationCtx.bus.request("task:schedule", { scheduleId: task.scheduleId, type: "finance-workbench-research", pluginId: "finance-workbench", intervalMs: task.intervalSeconds * 1000, payload: { taskId: task.id }, meta: { label: `${task.assetId} scheduled research` } });
  }

  assertResearchManifest(task) {
    const snapshot = this.quote({ assetId: task.assetId, interval: "daily" }).snapshot;
    const current = runSourceManifest([snapshot]);
    const expected = task.sourceManifest.datasets[0];
    const actual = current.datasets[0];
    if (expected.provider !== actual.provider || expected.sourceKind !== actual.sourceKind || expected.schemaHash !== actual.schemaHash || expected.sourcePolicyVersion !== actual.sourcePolicyVersion) throw new FinanceError("source_manifest_mismatch", "Scheduled research source lineage changed; create a new run", { retryable: false });
  }

  prunePreviews() {
    for (const [previewId, preview] of this.previews) if (preview.expiresAt && Date.now() > Date.parse(preview.expiresAt)) this.previews.delete(previewId);
  }
}

function capabilityCell(input) {
  assertEnum(input.status, CAPABILITY_STATES, "status");
  return { schemaVersion: 1, probedAt: nowIso(), terms: input.provider === "hana-fixture" ? "bundled deterministic fixture" : "user account terms apply; redistribution not granted", fields: "dataset-specific", units: "explicit", adjustment: input.dataset?.includes("kline") ? "request-specific" : "not-applicable", calendar: input.market === "A" ? "CN-XSHG/XSHE-v1" : "HK-XHKG-v1", refresh: input.dataset === "quote" ? "provider-observed" : "on-demand", rateLimit: input.provider === "hithink-rest" ? "account-probed" : "not-applicable", alternatives: ["explicit import", "another configured provider"], ...input };
}

function fixtureSupports(dataset) { return ["identity", "quote", "daily_kline", "financials", "filings"].includes(dataset); }
function assetRef(asset) { return { schemaVersion: 1, ...asset, confirmed: asset.identityConfidence === 1, mappingEvidence: { provider: asset.provider, aliases: asset.aliases, checkedAt: FIXTURE_AS_OF } }; }
function findAsset(assetId) { const asset = ASSETS.find((item) => item.assetId === assetId); if (!asset) throw new FinanceError("invalid_asset", `Unknown or unconfirmed asset ${assetId}`, { alternative: "Search and confirm an AssetRef" }); return asset; }
function normalizeEndpointPath(value) { if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\r\n]/.test(value)) throw new FinanceError("invalid_request", "hithink endpoint path must be an absolute host-relative path"); return value; }
function normalizePrivateResourceRef(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new FinanceError("invalid_request", "resourceRef is required");
  if (input.resource || input.ref || input.target) throw new FinanceError("invalid_request", "Nested ResourceRefs are not accepted");
  const kind = assertEnum(input.kind, ["mount", "session-file", "resource", "url"], "resourceRef.kind");
  if (kind === "mount") {
    const mountId = requireString(input.mountId, "resourceRef.mountId");
    const resourcePath = String(input.path ?? "").replace(/\\/g, "/");
    if (resourcePath.startsWith("/") || resourcePath.split("/").includes("..")) throw new FinanceError("permission_denied", "Mount paths must be relative and cannot traverse parent directories");
    return { kind, mountId, path: resourcePath };
  }
  if (kind === "session-file") return { kind, fileId: requireString(input.fileId, "resourceRef.fileId") };
  if (kind === "resource") return { kind, resourceId: requireString(input.resourceId, "resourceRef.resourceId") };
  let parsed;
  try { parsed = new URL(requireString(input.url, "resourceRef.url")); } catch { throw new FinanceError("invalid_request", "Resource URL is invalid"); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) throw new FinanceError("permission_denied", "Resource URLs must be credential-free HTTPS URLs without query or fragment data");
  return { kind, url: parsed.toString() };
}
async function safeJson(response) { try { return await response.json(); } catch { throw new FinanceError("schema_mismatch", "Provider response was not valid JSON"); } }
function inspectProbeRows(dataset, rows) {
  const required = dataset === "quote"
    ? ["asset_id", "price", "observed_at", "currency", "volume_unit", "amount_unit", "calendar"]
    : dataset === "daily_kline"
      ? ["asset_id", "date", "open", "high", "low", "close", "volume", "currency", "volume_unit", "adjustment", "calendar", "pit"]
      : dataset === "identity"
        ? ["code", "market", "name", "asset_type", "currency", "valid_from"]
        : ["asset_id", "period", "currency", "unit", "revision", "vintage"];
  const first = rows[0] ?? {};
  const missing = required.filter((key) => first[key] === undefined || first[key] === null || first[key] === "");
  if (dataset === "quote" && !Number.isFinite(Date.parse(String(first.observed_at)))) missing.push("valid observed_at");
  if (dataset === "daily_kline") {
    const dates = rows.map((row) => String(row.date));
    if (rows.length < 2) missing.push("coverage window");
    if (new Set(dates).size !== dates.length || dates.some((date, index) => index > 0 && date <= dates[index - 1])) missing.push("ordered unique dates");
  }
  return { complete: missing.length === 0, missing: [...new Set(missing)], pit: dataset === "financials" && first.revision === undefined ? "unverified" : dataset === "daily_kline" ? "observed" : "not-applicable" };
}
function normalizeProbedQuote(row, asset) { if (!row) throw new FinanceError("provider_unavailable", "The verified provider probe has no cached observation", { retryable: true }); const observedAt = String(row.observed_at); if (!Number.isFinite(Date.parse(observedAt))) throw new FinanceError("schema_mismatch", "The provider quote observation time is invalid"); return { price: positiveNumber(row.price, "price"), previousClose: finiteOrNull(row.previous_close), open: finiteOrNull(row.open), high: finiteOrNull(row.high), low: finiteOrNull(row.low), volume: finiteOrNull(row.volume), amount: finiteOrNull(row.amount), currency: String(row.currency ?? asset.currency), volumeUnit: String(row.volume_unit ?? "share"), amountUnit: String(row.amount_unit ?? asset.currency), observedAt }; }
function normalizeProbedKline(row, assetId) { const normalized = { date: String(row.date), open: positiveNumber(row.open, "open"), high: positiveNumber(row.high, "high"), low: positiveNumber(row.low, "low"), close: positiveNumber(row.close, "close"), volume: finiteNonNegative(row.volume, "volume"), assetId }; if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.date)) throw new FinanceError("schema_mismatch", "The provider K-line date is invalid"); return normalized; }
function finiteOrNull(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function makeKline(assetId, anchor) { return Array.from({ length: 40 }, (_, index) => { const wave = Math.sin(index / 3) * 0.025 + index * 0.001; const close = Number((anchor * (0.96 + wave)).toFixed(2)); const open = Number((close * (1 - Math.sin(index) * 0.005)).toFixed(2)); return { date: new Date(Date.parse("2026-06-20T00:00:00Z") + index * DAY).toISOString().slice(0, 10), open, high: Number((Math.max(open, close) * 1.008).toFixed(2)), low: Number((Math.min(open, close) * 0.992).toFixed(2)), close, volume: 1_000_000 + index * 20_000, assetId }; }); }
function parseLedger(content, format) { if (format === "json") { let parsed; try { parsed = typeof content === "string" ? JSON.parse(content) : content; } catch { throw new FinanceError("invalid_import", "Ledger JSON is invalid"); } return Array.isArray(parsed) ? parsed : [parsed]; } const text = requireString(content, "content"); const lines = text.trim().split(/\r?\n/); const headers = lines.shift().split(",").map((item) => item.trim()); return lines.map((line) => Object.fromEntries(line.split(",").map((item, index) => [headers[index], item.trim()]))); }
function validateLedgerRow(row, index) { try { const asset = findAsset(requireString(row.assetId, "assetId")); const side = assertEnum(row.side, ["buy", "sell"], "side"); const quantity = positiveNumber(row.quantity, "quantity"), price = positiveNumber(row.price, "price"), fee = Math.max(0, Number(row.fee) || 0); const date = new Date(row.date); if (!Number.isFinite(date.getTime())) throw new FinanceError("invalid_import", "date is invalid"); const eventId = row.eventId ? String(row.eventId) : sha256({ assetId: asset.assetId, side, quantity, price, fee, date: date.toISOString() }).slice(0, 24); return { value: { eventId, assetId: asset.assetId, side, quantity, price, fee, currency: asset.currency, date: date.toISOString(), source: "user-import" } }; } catch (error) { return { error: { row: index + 1, code: error.code ?? "invalid_import", message: error.message } }; } }
function validateLedgerSequence(existing, candidates) { const errors = [], seen = new Set(), holdings = new Map(); const combined = [...existing.map((event) => ({ ...event, candidate: false })), ...candidates.map((event, index) => ({ ...event, candidate: true, candidateRow: index + 1 }))].sort((a, b) => a.date.localeCompare(b.date) || a.eventId.localeCompare(b.eventId)); for (const event of combined) { if (seen.has(event.eventId)) { if (event.candidate) errors.push({ row: event.candidateRow, code: "duplicate_event", message: `Duplicate ledger event ${event.eventId}` }); continue; } seen.add(event.eventId); const quantity = holdings.get(event.assetId) ?? 0; if (event.side === "sell" && event.quantity > quantity) { if (event.candidate) errors.push({ row: event.candidateRow, code: "ledger_inconsistent", message: `Sell precedes sufficient holdings for ${event.assetId}` }); continue; } holdings.set(event.assetId, quantity + (event.side === "buy" ? event.quantity : -event.quantity)); } return errors; }
function positiveNumber(value, field) { const number = Number(value); if (!Number.isFinite(number) || number <= 0) throw new FinanceError("invalid_request", `${field} must be a positive number`, { details: { field } }); return number; }
function finiteNonNegative(value, field) { const number = Number(value); if (!Number.isFinite(number) || number < 0) throw new FinanceError("invalid_request", `${field} must be a finite non-negative number`, { details: { field } }); return number; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function marketCalendarState(market) { const now = new Date(); const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: market === "A" ? "Asia/Shanghai" : "Asia/Hong_Kong", hour: "2-digit", hour12: false }).format(now)); const weekday = Number(new Intl.DateTimeFormat("en-US", { timeZone: market === "A" ? "Asia/Shanghai" : "Asia/Hong_Kong", weekday: "short" }).format(now).length > 0 ? now.getUTCDay() : 0); return { calendar: market === "A" ? "CN-XSHG/XSHE-v1" : "HK-XHKG-v1", session: weekday === 0 || weekday === 6 || hour < 9 || hour >= 16 ? "closed" : "open", probedAt: nowIso(), holidayCoverage: "fixture-weekday-only", retryCondition: "re-probe on resume" }; }
function validateFiniteMetrics(metrics) { for (const [key, value] of Object.entries(metrics)) if (typeof value === "number" && !Number.isFinite(value)) throw new FinanceError("invalid_result", `Backtest metric ${key} is not finite`); return metrics; }
function aggregatePortfolio(items) { const totals = {}; for (const item of items) { const row = totals[item.currency] ?? { currency: item.currency, cost: 0, marketValue: 0, realizedPnl: 0, unrealizedPnl: 0, partial: false }; row.cost += item.cost; row.realizedPnl += item.realizedPnl; if (item.marketValue === null) row.partial = true; else { row.marketValue += item.marketValue; row.unrealizedPnl += item.unrealizedPnl; } totals[item.currency] = row; } return Object.values(totals); }
function normalizeStrategy(input) { const strategyId = String(input.strategyId ?? id("strategy")); const name = requireString(input.name ?? "Untitled Strategy", "name"); const universe = Array.isArray(input.universe) && input.universe.length ? [...new Set(input.universe.map((item) => findAsset(String(item)).assetId))] : (() => { throw new FinanceError("invalid_definition", "Strategy universe cannot be empty"); })(); const operators = ["gt", "gte", "lt", "lte", "eq", "between"]; const filters = Array.isArray(input.filters) ? input.filters.map((filter) => { const field = assertEnum(filter.field, ["price", "roe", "revenue", "marketCap"], "field"); const expectedUnit = field === "roe" ? "ratio" : field === "price" ? "native" : "currency"; const unit = String(filter.unit ?? expectedUnit); if (unit !== expectedUnit) throw new FinanceError("unit_mismatch", `${field} requires unit ${expectedUnit}`); return { field, operator: assertEnum(filter.operator, operators, "operator"), value: filter.value, unit, pit: filter.pit === true }; }) : []; if (filters.some((filter) => ["roe", "revenue", "marketCap"].includes(filter.field) && !filter.pit)) throw new FinanceError("invalid_definition", "Fundamental fields require explicit PIT=true"); const factors = Array.isArray(input.factors) ? input.factors.map((factor) => ({ field: assertEnum(factor.field, ["price_momentum", "value", "quality"], "factor.field"), weight: finiteNonNegative(factor.weight ?? 1, "factor.weight"), missing: assertEnum(factor.missing ?? input.missing ?? "exclude", ["exclude", "zero", "median"], "factor.missing") })) : []; return { schemaVersion: 1, strategyId, name, universe, filters, factors, rebalance: assertEnum(input.rebalance ?? "monthly", ["weekly", "monthly", "quarterly"], "rebalance"), missing: assertEnum(input.missing ?? "exclude", ["exclude", "zero", "median"], "missing"), noLookAhead: true, fieldExplanations: { price: "native quote currency", roe: "point-in-time ratio", revenue: "point-in-time reporting currency", marketCap: "point-in-time currency", price_momentum: "trailing close return" } }; }
function runSourceManifest(snapshots) { const datasets = snapshots.map((snapshot) => ({ snapshotId: snapshot.snapshotId, provider: snapshot.provider, sourceKind: snapshot.sourceKind, adapterVersion: snapshot.provider === "hana-fixture" ? "fixture-v1" : "hithink-rest-probe-v1", schemaHash: snapshot.schemaHash, snapshotLineage: sha256(snapshot.rows), sourcePolicyVersion: snapshot.sourceDecision.policy.version, window: { from: snapshot.rows[0]?.date ?? snapshot.observedAt, to: snapshot.rows.at(-1)?.date ?? snapshot.observedAt }, quality: snapshot.quality.status })); return { schemaVersion: 1, manifestId: id("manifest"), frozenAt: nowIso(), datasets, hash: sha256(datasets), immutable: true }; }
function compareFilter(value, filter) { if (!Number.isFinite(Number(value))) return false; if (filter.operator === "between") { if (!Array.isArray(filter.value) || filter.value.length !== 2 || filter.value.some((item) => !Number.isFinite(Number(item)))) throw new FinanceError("invalid_definition", `Filter ${filter.field} range must contain two finite values`); return value >= Number(filter.value[0]) && value <= Number(filter.value[1]); } const target = Number(filter.value); if (!Number.isFinite(target)) throw new FinanceError("invalid_definition", `Filter ${filter.field} value must be finite`); if (filter.operator === "gt") return value > target; if (filter.operator === "gte") return value >= target; if (filter.operator === "lt") return value < target; if (filter.operator === "lte") return value <= target; if (filter.operator === "eq") return value === target; return false; }
function calculateReturns(rows) { return rows.slice(1).map((row, index) => row.close / rows[index].close - 1); }
function combineReturns(series) { const size = Math.min(...series.map((items) => items.length)); return Array.from({ length: size }, (_, index) => series.reduce((sum, items) => sum + items[index], 0) / series.length); }
function stddev(values) { if (!values.length) return 0; const mean = values.reduce((a, b) => a + b, 0) / values.length; return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length); }
function maxDrawdown(returns) { let value = 1, peak = 1, drawdown = 0; for (const item of returns) { value *= 1 + item; peak = Math.max(peak, value); drawdown = Math.min(drawdown, value / peak - 1); } return drawdown; }
function rejectTradingIntent(value) { if (/(下单|撤单|买入|卖出|调仓|资金划转|broker|place\s*order|execute\s*trade)/i.test(String(value ?? ""))) throw new FinanceError("forbidden_intent", "Trading, broker, funds, order, and position-mutation intents are permanently unavailable"); }
function exportDocument(state, sections) { const output = { schemaVersion: 1, exportedAt: nowIso(), qualityNotice: "Every result retains source and quality metadata", sections: {} }; for (const section of sections) { if (section === "portfolio") output.sections.portfolio = { ledgerEvents: state.ledgerEvents }; else if (section === "strategies") output.sections.strategies = state.strategies; else if (section === "backtests") output.sections.backtests = state.backtests; else if (section === "monitors") output.sections.monitors = state.monitors; else if (section === "researchRuns") output.sections.researchRuns = state.researchRuns; else if (section === "privateMaterials") output.sections.privateMaterials = state.privateMaterials.map((item) => ({ id: item.id, label: item.label, contentHash: item.contentHash, resourceKeyHash: item.resourceKeyHash, private: true })); } return redact(output); }
function countFields(value) { if (!value || typeof value !== "object") return 1; return Object.values(value).reduce((sum, item) => sum + countFields(item), 0); }
function serializeExport(document, format) { if (format === "json") return `${JSON.stringify(document, null, 2)}\n`; if (format === "markdown") return `# Finance Workbench Export\n\nExported: ${document.exportedAt}\n\n\`\`\`json\n${JSON.stringify(document.sections, null, 2)}\n\`\`\`\n`; const rows = [["section", "json"], ...Object.entries(document.sections).map(([key, value]) => [key, JSON.stringify(value)])]; return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n") + "\n"; }
