import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "../fixtures/app-fixture.ts";

async function json(response: Response): Promise<Record<string, unknown>> {
  expect(response.ok, `Knowledge API returned ${response.status}`).toBe(true);
  return await response.json() as Record<string, unknown>;
}

test("T-20 indexes an Office resource through shared extraction without a derived Workspace file", async ({
  knowledgeApp,
  workspaceSandbox,
}) => {
  test.skip(
    knowledgeApp.runtime === "web-full",
    "Office Knowledge ingestion is a local-source gate",
  );
  await fs.copyFile(
    path.resolve("tests/fixtures/document-extract/sample.docx"),
    path.join(workspaceSandbox.mainSource, "Quarterly.docx"),
  );

  const rebuilt = await json(await knowledgeApp.apiFetch(
    "/api/knowledge-workspace/index/main/rebuild",
    { method: "POST" },
  ));
  expect(rebuilt).toMatchObject({
    sourceKey: "main",
    health: { state: "ready" },
  });
  const search = await json(await knowledgeApp.apiFetch(
    "/api/knowledge-workspace/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Quarterly Notes", limit: 20 }),
    },
  ));
  expect(JSON.stringify(search)).toContain("Quarterly.docx");
  expect(await fs.readdir(workspaceSandbox.mainSource)).not.toContain("Quarterly.md");
});
