import { sampleText } from "@hana/plugin-runtime";
import { FinanceError, errorEnvelope, financeErrorFrom } from "../src/contracts.js";
import { getRuntime } from "../src/runtime.js";

export default function register(app, ctx) {
  const runtime = getRuntime(ctx);
  app.get("/api/status", route((c) => c.json(runtime.status())));
  app.get("/api/widget-summary", route((c) => {
    const status = runtime.status();
    const quote = runtime.quote({ assetId: "600519.SH" });
    const portfolio = runtime.portfolio();
    const monitors = runtime.monitors();
    return c.json(envelopeSummary(status, quote, portfolio, monitors));
  }));
  app.get("/api/capabilities", route((c) => c.json(runtime.capabilities())));
  app.post("/api/capabilities/probe", route(async (c) => c.json(await runtime.probeHithink(await body(c)))));
  app.post("/api/source-policy", route(async (c) => c.json({ ok: true, policy: runtime.setSourcePolicy(await body(c)) })));
  app.get("/api/assets", route((c) => c.json(runtime.searchAssets({ query: c.req.query("query"), market: c.req.query("market") }))));
  app.get("/api/lists", route((c) => c.json(runtime.lists())));
  app.post("/api/lists", route(async (c) => c.json({ ok: true, list: runtime.mutateList(await body(c)) })));
  app.get("/api/quote/:assetId", route((c) => c.json(runtime.quote({ assetId: c.req.param("assetId"), interval: c.req.query("interval") ?? "quote", adjustment: c.req.query("adjustment") ?? "none" }))));
  app.get("/api/research/:assetId", route((c) => c.json(runtime.dossier({ assetId: c.req.param("assetId") }))));
  app.get("/api/portfolio", route((c) => c.json(runtime.portfolio())));
  app.post("/api/portfolio/preview", route(async (c) => c.json(runtime.previewLedger(await body(c)))));
  app.post("/api/portfolio/commit", route(async (c) => c.json(runtime.commitLedger(await body(c)))));
  app.post("/api/private-materials", route(async (c) => c.json({ ok: true, material: await runtime.addPrivateMaterial(await body(c)) })));
  app.delete("/api/private-materials", route(async (c) => c.json({ ok: true, result: runtime.removePrivateMaterial(await body(c)) })));
  app.get("/api/strategies", route((c) => c.json(runtime.strategies())));
  app.post("/api/strategies", route(async (c) => c.json({ ok: true, strategy: runtime.saveStrategy(await body(c)) })));
  app.post("/api/screen", route(async (c) => c.json(runtime.screen(await body(c)))));
  app.get("/api/backtests", route((c) => c.json(runtime.backtests())));
  app.post("/api/backtests", route(async (c) => c.json(runtime.runBacktest(await body(c)))));
  app.get("/api/monitors", route((c) => c.json(runtime.monitors())));
  app.post("/api/monitors", route(async (c) => c.json(await runtime.createMonitor(await body(c)))));
  app.post("/api/monitors/action", route(async (c) => c.json(await runtime.actMonitor(await body(c)))));
  app.post("/api/research-tasks", route(async (c) => c.json(await runtime.createResearchTask(await body(c)))));
  app.post("/api/research-tasks/action", route(async (c) => c.json(await runtime.actResearchTask(await body(c)))));
  app.post("/api/consents", route(async (c) => c.json({ ok: true, consent: runtime.createConsent(await body(c)) })));
  app.post("/api/agent/run", route(async (c) => {
    const input = await body(c);
    return c.json(await runtime.runAgent(input, {
      sample: async (payload) => {
        const response = await sampleText(ctx, { prompt: `${JSON.stringify(payload)}\nReturn a concise research draft. Every fact must cite an evidenceId. Do not give investment advice or trading instructions.`, maxTokens: 700 });
        return response.text;
      },
    }));
  }));
  app.post("/api/exchange/preview", route(async (c) => c.json(runtime.previewExport(await body(c)))));
  app.get("/api/diagnostics", route((c) => c.json(runtime.diagnostics({ query: c.req.query("query") }))));
}

function envelopeSummary(status, quote, portfolio, monitors) {
  return {
    ok: true,
    schemaVersion: 1,
    requestId: status.requestId,
    plugin: status.plugin,
    marketDump: status.marketDump,
    automation: status.automation,
    quote: { asset: quote.asset, snapshot: { observedAt: quote.snapshot.observedAt, stale: quote.snapshot.stale, quality: quote.snapshot.quality, rows: quote.snapshot.rows.slice(0, 1) } },
    positionCount: portfolio.positions.length,
    monitorCount: monitors.monitors.length,
  };
}

async function body(c) {
  try {
    const value = await c.req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object required");
    return value;
  } catch {
    throw new FinanceError("invalid_request", "A JSON object request body is required");
  }
}

function route(handler) {
  return async (c) => {
    try { return await handler(c); }
    catch (error) {
      const known = financeErrorFrom(error);
      return c.json(errorEnvelope(known), known.status);
    }
  };
}
