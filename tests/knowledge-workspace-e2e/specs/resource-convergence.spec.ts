import fs from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
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

async function openKnowledge(page: Page): Promise<Locator> {
  await page.locator('[data-tab="knowledge"]').click();
  const workspace = page.locator('[data-knowledge-workspace]');
  await expect(workspace).toBeVisible({ timeout: 90_000 });
  return workspace;
}

async function expandMain(workspace: Locator): Promise<void> {
  const root = workspace.locator('[role="treeitem"][data-source-key="main"]').first();
  await expect(root).toBeVisible({ timeout: 90_000 });
  if (await root.getAttribute("aria-expanded") !== "true") {
    await root.getByRole("button").first().click();
  }
}

test("resource convergence keeps main on the work directory and hides unavailable native actions", async ({
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

  const workspace = await openKnowledge(knowledgeApp.page);
  await expandMain(workspace);
  const guide = workspace.getByRole("treeitem", { name: /Guide\.markdown/i });
  const paper = workspace.getByRole("treeitem", { name: /Paper\.pdf/i });
  const html = workspace.getByRole("treeitem", { name: /Page\.html/i });
  await expect(guide).toBeVisible();
  await expect(paper).toBeVisible();
  await expect(html).toBeVisible();

  await guide.dblclick();
  await expect(workspace.getByRole("tab", { name: "Guide.markdown", exact: true })).toBeVisible();
  await paper.dblclick();
  await expect(workspace.getByRole("tab", { name: "Paper.pdf", exact: true })).toBeVisible();
  await html.dblclick();
  await expect(workspace.getByRole("tab", { name: "Page.html", exact: true })).toBeVisible();

  await paper.click({ button: "right" });
  const menu = knowledgeApp.page.getByRole("menu", { name: "Context menu" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Cut|剪切/i })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /^Copy$|^复制$/i })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Delete|删除/i })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Rename|重命名/i })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Copy relative path|复制相对路径/i })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Open folder|打开文件夹/i })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Copy absolute path|复制绝对路径/i })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: /Open with default application|用默认应用程序打开/i })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: /Reveal|文件管理器/i })).toHaveCount(0);
  await expect(menu.getByText(workspaceSandbox.mainSource)).toHaveCount(0);
});
