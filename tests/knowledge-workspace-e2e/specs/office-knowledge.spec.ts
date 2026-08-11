import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import JSZip from "jszip";
import { expect, test } from "../fixtures/app-fixture.ts";

type ApiFetch = (pathname: string, init?: RequestInit) => Promise<Response>;

async function json(response: Response): Promise<Record<string, unknown>> {
  expect(response.ok, `Knowledge API returned ${response.status}`).toBe(true);
  return await response.json() as Record<string, unknown>;
}

async function waitForInitialMainIndex(
  apiFetch: ApiFetch,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastState = "unknown";
  while (Date.now() < deadline) {
    const status = await json(await apiFetch(
      "/api/knowledge-workspace/index/status?sourceKey=main",
    ));
    const health = status.health;
    lastState = health && typeof health === "object" && !Array.isArray(health)
      ? String((health as Record<string, unknown>).state || "unknown")
      : "unknown";
    if (lastState === "ready") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Knowledge main index did not reach ready before Office E2E (${lastState})`);
}

async function searchOffice(apiFetch: ApiFetch, query: string): Promise<Record<string, unknown>> {
  return json(await apiFetch(
    "/api/knowledge-workspace/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 20 }),
    },
  ));
}

async function waitForOfficeSearch(
  apiFetch: ApiFetch,
  query: string,
  expectedPath: string,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 30_000;
  let last: Record<string, unknown> = {};
  while (Date.now() < deadline) {
    last = await searchOffice(apiFetch, query);
    if (JSON.stringify(last).includes(expectedPath)) return last;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Office Knowledge search did not converge for ${query}: ${JSON.stringify(last)}`);
}

async function replaceDocxText(
  source: Buffer,
  before: string,
  after: string,
): Promise<Buffer> {
  const archive = await JSZip.loadAsync(source);
  const document = archive.file("word/document.xml");
  if (!document) throw new Error("Office E2E fixture is missing word/document.xml");
  const xml = await document.async("string");
  if (!xml.includes(before)) throw new Error(`Office E2E fixture is missing ${before}`);
  archive.file("word/document.xml", xml.replace(before, after));
  return archive.generateAsync({ type: "nodebuffer" });
}

test("T-20 reindexes and restores an Office resource without a derived Workspace file", async ({
  knowledgeApp,
  workspaceSandbox,
}) => {
  test.skip(
    knowledgeApp.runtime === "web-full",
    "Office Knowledge ingestion is a local-source gate",
  );
  await waitForInitialMainIndex(knowledgeApp.apiFetch);
  const original = await fs.readFile(path.resolve("tests/fixtures/document-extract/sample.docx"));
  const revised = await replaceDocxText(original, "Quarterly Notes", "Revised Forecast");
  const officePath = path.join(workspaceSandbox.mainSource, "Quarterly.docx");
  await fs.writeFile(officePath, original);

  const rebuilt = await json(await knowledgeApp.apiFetch(
    "/api/knowledge-workspace/index/main/rebuild",
    { method: "POST" },
  ));
  expect(rebuilt).toMatchObject({
    sourceKey: "main",
    health: { state: "ready" },
  });
  expect(JSON.stringify(await searchOffice(knowledgeApp.apiFetch, "Quarterly Notes")))
    .toContain("Quarterly.docx");

  const initial = await json(await knowledgeApp.apiFetch(
    "/api/resource-io/stat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: { sourceKey: "main", relativePath: "Quarterly.docx" },
      }),
    },
  ));
  expect(initial.version).toBeTruthy();
  const modified = await json(await knowledgeApp.apiFetch(
    "/api/resource-io/write-expected-version",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: { sourceKey: "main", relativePath: "Quarterly.docx" },
        content: revised.toString("base64"),
        encoding: "base64",
        expectedVersion: initial.version,
        reason: "office_e2e_edit",
        operationId: randomUUID(),
      }),
    },
  ));
  expect(modified.ok).toBe(true);
  expect(JSON.stringify(await waitForOfficeSearch(
    knowledgeApp.apiFetch,
    "Revised Forecast",
    "Quarterly.docx",
  ))).toContain("Quarterly.docx");

  const current = await json(await knowledgeApp.apiFetch(
    "/api/resource-io/stat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: { sourceKey: "main", relativePath: "Quarterly.docx" },
      }),
    },
  ));
  expect(current.version).toBeTruthy();
  const restored = await json(await knowledgeApp.apiFetch(
    "/api/resource-io/write-expected-version",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: { sourceKey: "main", relativePath: "Quarterly.docx" },
        content: original.toString("base64"),
        encoding: "base64",
        expectedVersion: current.version,
        reason: "history_restore",
        operationId: randomUUID(),
      }),
    },
  ));
  expect(restored.ok).toBe(true);
  expect(JSON.stringify(await waitForOfficeSearch(
    knowledgeApp.apiFetch,
    "Quarterly Notes",
    "Quarterly.docx",
  ))).toContain("Quarterly.docx");
  expect(JSON.stringify(await searchOffice(knowledgeApp.apiFetch, "Revised Forecast")))
    .not.toContain("Quarterly.docx");
  expect(await fs.readdir(workspaceSandbox.mainSource)).not.toContain("Quarterly.md");
});
