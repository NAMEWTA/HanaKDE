import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { FinanceApplication } from "../src/application.js";
import { errorEnvelope, financeErrorFrom } from "../src/contracts.js";
import { FinanceStore } from "../src/store.js";
import { cleanup, FakeBus, makeContext, tempDir } from "./helpers.js";

test("private material uses ResourceIO, rejects nested/absolute/query refs, and exports no ResourceRef", async () => {
  const dir = tempDir("private");
  let statCalls = 0;
  try {
    const app = new FinanceApplication(makeContext(dir, { stat: async (ref) => { statCalls += 1; return { resourceKey: "mount:private:report.md", resource: ref, exists: true, isDirectory: false, version: { sha256: "content" }, filePath: "/secret/report.md" }; } }));
    await assert.rejects(app.addPrivateMaterial({ label: "bad", resourceRef: { ref: { kind: "mount", mountId: "m", path: "a" }, password: "leak" } }), (error) => error.code === "invalid_request");
    await assert.rejects(app.addPrivateMaterial({ label: "bad", resourceRef: { kind: "local-file", path: "/secret/a" } }), (error) => error.code === "invalid_request");
    await assert.rejects(app.addPrivateMaterial({ label: "bad", resourceRef: { kind: "url", url: "https://user:pw@example.test/a?token=secret" } }), (error) => error.code === "permission_denied");
    const material = await app.addPrivateMaterial({ label: "report", resourceRef: { kind: "mount", mountId: "private", path: "report.md", password: "discard-me" } });
    assert.equal(statCalls, 1);
    assert.deepEqual(material.resourceRef, { kind: "mount", mountId: "private", path: "report.md" });
    const preview = app.previewExport({ sections: ["privateMaterials"] }).preview;
    const internal = app.previews.get(preview.previewId).document;
    assert.equal(JSON.stringify(internal).includes("resourceRef"), false);
    assert.equal(JSON.stringify(internal).includes("/secret"), false);
    assert.equal(app.removePrivateMaterial({ materialId: material.id }).removed, true);
    assert.equal(app.portfolio().privateMaterials.length, 0);
    assert.equal(JSON.stringify(app.previews.get(app.previewExport({ sections: ["privateMaterials"] }).preview.previewId).document).includes(material.id), false);
  } finally { cleanup(dir); }
});

test("unknown and ResourceIO errors never expose paths, refs, query secrets, or raw exception text", () => {
  const unknown = errorEnvelope(financeErrorFrom(new Error("ENOENT /Users/person/private/report.md?token=abc")));
  assert.equal(unknown.error.message, "Finance Workbench could not complete the request");
  assert.doesNotMatch(JSON.stringify(unknown), /Users|report\.md|token=abc|ENOENT/);
  const known = errorEnvelope({ code: "permission_denied" });
  assert.doesNotMatch(JSON.stringify(known), /Users|token=abc/);
});

test("private store isolates unknown schema fields without rewriting the source file", () => {
  const dir = tempDir("schema-isolation");
  try {
    const file = `${dir}/finance-workbench.v1.json`;
    const source = JSON.stringify({ schemaVersion: 1, revision: 0, futureUnsafeField: { pnl: 999 } });
    fs.writeFileSync(file, source);
    assert.throws(() => new FinanceStore(dir), (error) => error.code === "schema_mismatch");
    assert.equal(fs.readFileSync(file, "utf8"), source);
  } finally { cleanup(dir); }
});

test("AI default-off blocks model and bus egress even with approved consent", async () => {
  const dir = tempDir("ai-off");
  let sampled = 0;
  try {
    const ctx = makeContext(dir);
    const app = new FinanceApplication(ctx);
    app.createConsent({ runId: "run-ai", categories: ["external-model"], approved: true, budget: 1 });
    await assert.rejects(app.runAgent({ runId: "run-ai", assetId: "600519.SH", question: "summarize", useModel: true, budget: 1 }, { sample: async () => { sampled += 1; return "should not run"; } }), (error) => error.code === "permission_denied");
    assert.equal(sampled, 0);
    assert.equal(ctx.bus.requests.length, 0);
  } finally { cleanup(dir); }
});

test("model research requires consent, budget and an EvidenceRef citation; trading intent is rejected", async () => {
  const dir = tempDir("agent");
  try {
    const app = new FinanceApplication(makeContext(dir, { config: { aiEnabled: true } }));
    await assert.rejects(app.runAgent({ runId: "r1", assetId: "600519.SH", question: "summary", useModel: true, budget: 1 }, { sample: async () => "x" }), (error) => error.code === "confirmation_required");
    app.createConsent({ runId: "r1", categories: ["external-model"], approved: true, budget: 1 });
    await assert.rejects(app.runAgent({ runId: "r1", assetId: "600519.SH", question: "summary", useModel: true, budget: 0 }, { sample: async () => "x" }), (error) => error.code === "budget_exhausted");
    await assert.rejects(app.runAgent({ runId: "r1", assetId: "600519.SH", question: "summary", useModel: true, budget: 1 }, { sample: async () => "uncited" }), (error) => error.code === "unsubstantiated_output");
    await assert.rejects(app.runAgent({ assetId: "600519.SH", question: "请帮我买入并下单", useModel: false }), (error) => error.code === "forbidden_intent");
  } finally { cleanup(dir); }
});

test("monitor scheduling is confirmed, stays active, persists observations, and supports pause/resume/cancel", async () => {
  const dir = tempDir("monitor");
  const bus = new FakeBus();
  try {
    const app = new FinanceApplication(makeContext(dir, { bus }));
    await assert.rejects(app.createMonitor({ assetId: "600519.SH", threshold: 1000 }), (error) => error.code === "confirmation_required");
    const created = (await app.createMonitor({ assetId: "600519.SH", condition: "above", threshold: 1000, intervalSeconds: 30, confirmed: true })).monitor;
    assert.equal(created.status, "active");
    assert.equal(bus.schedules.size, 1);
    const observed = app.observeMonitor(created.id);
    assert.equal(observed.status, "active");
    assert.equal(observed.lastObservation.triggered, false);
    assert.match(observed.lastObservation.reason, /stale/);
    assert.equal((await app.actMonitor({ monitorId: created.id, action: "pause", confirmed: true })).monitor.status, "paused");
    assert.equal((await app.actMonitor({ monitorId: created.id, action: "resume", confirmed: true })).monitor.status, "active");
    assert.equal((await app.actMonitor({ monitorId: created.id, action: "cancel", confirmed: true })).monitor.status, "cancelled");
  } finally { cleanup(dir); }
});

test("monitor persist failure compensates schedule and export cannot bypass prior preview confirmation", async () => {
  const dir = tempDir("compensation");
  const bus = new FakeBus();
  try {
    const app = new FinanceApplication(makeContext(dir, { bus }));
    app.store.persist = () => { throw new Error("disk full"); };
    await assert.rejects(app.createMonitor({ assetId: "600519.SH", condition: "above", threshold: 1000, confirmed: true }), /disk full/);
    assert.equal(bus.schedules.size, 0);
  } finally { cleanup(dir); }

  const exportDir = tempDir("export");
  try {
    const app = new FinanceApplication(makeContext(exportDir));
    await assert.rejects(app.writeExport({ confirmed: true, previewId: "invented", confirmToken: "x", digest: "x", revision: 0 }), (error) => error.code === "preview_expired");
    const preview = app.previewExport({ format: "json", sections: ["portfolio"] }).preview;
    await assert.rejects(app.writeExport({ confirmed: true, previewId: preview.previewId }), (error) => error.code === "confirmation_required");
    const result = await app.writeExport({ confirmed: true, previewId: preview.previewId, confirmToken: preview.confirmToken, digest: preview.digest, revision: preview.revision });
    assert.equal(result.file.storage, "session-file");
    assert.ok(fs.existsSync(Array.from(fs.readdirSync(`${exportDir}/exports`)).length ? `${exportDir}/exports/${result.file.label}` : ""));
  } finally { cleanup(exportDir); }
});

test("scheduled public research freezes lineage and supports completion, pause, resume and confirmed cancellation", async () => {
  const dir = tempDir("scheduled-research");
  const bus = new FakeBus();
  try {
    const app = new FinanceApplication(makeContext(dir, { bus }));
    await assert.rejects(app.createResearchTask({ assetId: "600519.SH" }), (error) => error.code === "confirmation_required");
    const created = (await app.createResearchTask({ assetId: "600519.SH", intervalSeconds: 600, confirmed: true })).task;
    assert.equal(created.status, "queued");
    assert.equal(created.sourceManifest.immutable, true);
    assert.equal((await app.runResearchTask(created.id)).task.status, "completed");
    assert.equal(app.monitors().tasks[0].checkpoint.sequence, 1);
    assert.equal((await app.actResearchTask({ taskId: created.id, action: "pause", confirmed: true })).task.status, "paused");
    assert.equal((await app.actResearchTask({ taskId: created.id, action: "resume", confirmed: true })).task.status, "queued");
    assert.equal((await app.actResearchTask({ taskId: created.id, action: "cancel", confirmed: true })).task.status, "cancelled");
  } finally { cleanup(dir); }
});
