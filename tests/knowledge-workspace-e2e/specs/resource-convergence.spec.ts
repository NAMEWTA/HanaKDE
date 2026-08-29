import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "../fixtures/app-fixture.ts";

type JsonRecord = Record<string, unknown>;

async function ok(response: Response): Promise<JsonRecord> {
  const body = await response.json() as JsonRecord;
  expect(
    response.ok,
    `Resource convergence API returned ${response.status}: ${JSON.stringify(body)}`,
  ).toBe(true);
  return body;
}

test("resource convergence keeps Open main on the work directory without native capabilities", async ({
  knowledgeApp,
  workspaceSandbox,
}) => {
  test.skip(knowledgeApp.runtime !== "web-open", "capability degradation is verified in Web Open");
  await Promise.all([
    fs.writeFile(path.join(workspaceSandbox.mainSource, "Guide.markdown"), "# Guide\n", "utf8"),
    fs.writeFile(path.join(workspaceSandbox.mainSource, "Paper.pdf"), "%PDF fixture", "utf8"),
    fs.writeFile(path.join(workspaceSandbox.mainSource, "Page.html"), "<h1>fixture</h1>", "utf8"),
  ]);

  const guideAddress = { sourceKey: "main", relativePath: "Guide.markdown" };
  const stat = await ok(await knowledgeApp.apiFetch("/api/resource-io/stat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: guideAddress }),
  }));
  const savedContent = "# Saved through the shared owner\n";
  await ok(await knowledgeApp.apiFetch("/api/resource-io/write-expected-version", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: guideAddress,
      content: Buffer.from(savedContent, "utf8").toString("base64"),
      encoding: "base64",
      expectedVersion: stat.version,
    }),
  }));
  expect(await fs.readFile(path.join(workspaceSandbox.mainSource, "Guide.markdown"), "utf8"))
    .toBe(savedContent);

  const createdPage = await ok(await knowledgeApp.apiFetch(
    "/api/knowledge-workspace/resources/create",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "page",
        sourceKey: "main",
        directoryPath: "",
        name: "ConvergencePage",
      }),
    },
  ));
  const createdResult = createdPage.result as JsonRecord;
  const createdAddress = createdResult.address as JsonRecord;
  expect(createdAddress).toEqual({
    sourceKey: "main",
    relativePath: "ConvergencePage.md",
  });

  const trashed = await ok(await knowledgeApp.apiFetch("/api/knowledge-workspace/trash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addresses: [createdAddress] }),
  }));
  const trashedResult = trashed.result as JsonRecord;
  expect(trashedResult.items).toEqual([expect.objectContaining({ ok: true })]);
  await expect(fs.stat(path.join(workspaceSandbox.mainSource, "ConvergencePage.md")))
    .rejects.toThrow();

  const capabilities = await ok(await knowledgeApp.apiFetch(
    "/api/knowledge-workspace/native/capabilities",
  ));
  expect(capabilities).toEqual({
    directoryPicker: false,
    filePicker: false,
    fileClipboard: false,
    openDefault: false,
    reveal: false,
    copyPath: false,
    systemTrash: false,
  });
});
