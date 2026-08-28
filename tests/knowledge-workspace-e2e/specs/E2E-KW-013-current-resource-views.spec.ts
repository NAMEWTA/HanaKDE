import fs from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/app-fixture.ts";

async function writeFixtureFiles(
  mainSource: string,
  researchSource: string,
): Promise<void> {
  await Promise.all([
    fs.writeFile(
      path.join(mainSource, "Target.md"),
      "# Target Heading\nshared-query-token\n[[Other.md#Details]]\n",
      "utf8",
    ),
    fs.writeFile(
      path.join(mainSource, "Other.md"),
      "# Details\nOther page\n",
      "utf8",
    ),
    fs.writeFile(
      path.join(mainSource, "SavedReferrer.md"),
      "# Saved Referrer\n[[Target.md]]\n",
      "utf8",
    ),
    fs.writeFile(
      path.join(mainSource, "DraftReferrer.md"),
      "# Draft Referrer\ndraft-referrer-token\n",
      "utf8",
    ),
    fs.writeFile(
      path.join(researchSource, "Target.md"),
      "# Research Target\nshared-query-token\n",
      "utf8",
    ),
    fs.writeFile(
      path.join(researchSource, "MountedReferrer.md"),
      "# Mounted Referrer\n[[Target.md]]\n",
      "utf8",
    ),
  ]);
}

async function requireOk(response: Response, operation: string): Promise<void> {
  if (response.ok) return;
  // Keep release artifacts path- and content-free if an authority regression
  // makes this request fail.
  throw new Error(`${operation} failed (${response.status})`);
}

async function openKnowledge(page: Page): Promise<Locator> {
  const entry = page.locator('[data-tab="knowledge"]');
  await expect(entry).toBeVisible({ timeout: 90_000 });
  await entry.click();
  const workspace = page.locator('[data-knowledge-workspace]');
  await expect(workspace).toBeVisible();
  return workspace;
}

async function searchKnowledge(
  page: Page,
  workspace: Locator,
  query: string,
): Promise<void> {
  const input = workspace.getByRole("searchbox");
  const submit = workspace.locator('button[type="submit"]');
  // A repeated query does not emit an input event in every browser engine.
  // Resetting it first makes the search state transition explicit, then a
  // pointer submit exercises the same public form path without depending on
  // the active preview/editor key handler (notably on Windows web runners).
  await input.fill("");
  await input.fill(query);
  await expect(submit).toBeEnabled();
  await Promise.all([
    page.waitForResponse((response) => (
      response.request().method() === "POST"
      && response.url().includes("/api/knowledge-workspace/search")
    )),
    submit.click(),
  ]);
}

function searchGroup(workspace: Locator, sourceKey: string): Locator {
  return workspace.locator(
    `section[aria-labelledby="knowledge-search-${sourceKey}"]`,
  );
}

function resultForPath(group: Locator, relativePath: string): Locator {
  return group.getByRole("button").filter({ hasText: relativePath }).first();
}

async function dismissSearchResults(workspace: Locator): Promise<void> {
  await workspace.getByRole("searchbox").press("Escape");
}

test("E2E-KW-013 keeps live buffer views separate from saved per-source backlinks", async ({
  knowledgeApp,
  workspaceSandbox,
}) => {
  test.skip(
    knowledgeApp.runtime === "web-full",
    "E2E-KW-013 is required for desktop-full and web-open",
  );
  await writeFixtureFiles(
    workspaceSandbox.mainSource,
    workspaceSandbox.mountedSources[0],
  );
  const { page } = knowledgeApp;
  const workspace = await openKnowledge(page);

  await requireOk(await knowledgeApp.apiFetch(
    "/api/knowledge-workspace/sources",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceKey: "research",
        displayName: "Research",
        mountId: "knowledge_e2e_mount_1",
      }),
    },
  ), "register research source");
  const sourcesAfterRegister = await knowledgeApp.apiFetch(
    "/api/knowledge-workspace/sources",
  );
  await requireOk(sourcesAfterRegister, "list sources after register");
  expect(await sourcesAfterRegister.json()).toMatchObject({
    sources: expect.arrayContaining([
      expect.objectContaining({ sourceKey: "research" }),
    ]),
  });
  await requireOk(await knowledgeApp.apiFetch(
    "/api/knowledge-workspace/index/main/rebuild",
    { method: "POST" },
  ), "rebuild main index");
  await requireOk(await knowledgeApp.apiFetch(
    "/api/knowledge-workspace/index/research/rebuild",
    { method: "POST" },
  ), "rebuild research index");
  const researchStatus = await knowledgeApp.apiFetch(
    "/api/knowledge-workspace/index/status?sourceKey=research",
  );
  await requireOk(researchStatus, "read research index status");
  expect(await researchStatus.json()).toMatchObject({
    sourceKey: "research",
    health: { state: "ready" },
  });
  await requireOk(await knowledgeApp.apiFetch(
    "/api/resource-io/read",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: { sourceKey: "main", relativePath: "Target.md" },
        encoding: "utf-8",
      }),
    },
  ), "read indexed main fixture through the public address protocol");

  await searchKnowledge(page, workspace, "shared-query-token");
  const mainGroup = searchGroup(workspace, "main");
  const researchGroup = searchGroup(workspace, "research");
  await expect(resultForPath(mainGroup, "Target.md")).toBeVisible();
  await expect(resultForPath(researchGroup, "Target.md")).toBeVisible();
  await resultForPath(mainGroup, "Target.md").click();
  await dismissSearchResults(workspace);
  await expect(page.locator('[aria-label="Edit Target.md"] .cm-content'))
    .toBeVisible();

  await workspace.getByRole("button", {
    name: /current resource|当前资源|目前資源|現在のリソース|현재 리소스/i,
  }).click();

  const currentViews = workspace.locator(
    "[data-knowledge-current-resource-views]",
  );
  await expect(currentViews).toContainText("Target.md");
  await expect(currentViews.getByRole("button", {
    name: "Target Heading",
  })).toBeVisible();
  await expect(currentViews.getByRole("button", {
    name: "Other.md#Details",
  })).toBeVisible();
  await expect(currentViews.getByRole("button", {
    name: "SavedReferrer.md",
  })).toBeVisible();
  await expect(currentViews).not.toContainText("MountedReferrer.md");

  await currentViews.getByRole("button", { name: "Target Heading" }).click();
  await expect(page.locator('[aria-label="Edit Target.md"] .cm-content'))
    .toBeFocused();

  await searchKnowledge(page, workspace, "draft-referrer-token");
  await resultForPath(searchGroup(workspace, "main"), "DraftReferrer.md")
    .click();
  await dismissSearchResults(workspace);
  const draftEditor = page.locator(
    '[aria-label="Edit DraftReferrer.md"] .cm-content',
  );
  await expect(draftEditor).toBeVisible();
  await draftEditor.click();
  await draftEditor.press("End");
  await page.keyboard.insertText("\n[[Target.md]]");
  await expect(currentViews.getByRole("button", { name: "Target.md" }))
    .toBeVisible();
  await expect(currentViews).toContainText(
    "Unsaved edits update the outline and outbound references",
  );

  await searchKnowledge(page, workspace, "shared-query-token");
  await resultForPath(searchGroup(workspace, "main"), "Target.md").click();
  await dismissSearchResults(workspace);
  await expect(currentViews.getByRole("button", {
    name: "SavedReferrer.md",
  })).toBeVisible();
  await expect(currentViews).not.toContainText("DraftReferrer.md");

  await searchKnowledge(page, workspace, "draft-referrer-token");
  await resultForPath(searchGroup(workspace, "main"), "DraftReferrer.md")
    .click();
  await dismissSearchResults(workspace);
  await expect(draftEditor).toBeVisible();
  await draftEditor.press(process.platform === "darwin" ? "Meta+s" : "Control+s");
  await expect(page.locator('[aria-label="Edit DraftReferrer.md"]'))
    .toHaveAttribute("data-dirty", "false");
  await requireOk(await knowledgeApp.apiFetch(
    "/api/knowledge-workspace/index/main/rebuild",
    { method: "POST" },
  ), "rebuild main index after save");

  await searchKnowledge(page, workspace, "shared-query-token");
  await resultForPath(searchGroup(workspace, "main"), "Target.md").click();
  await dismissSearchResults(workspace);
  await expect(currentViews.getByRole("button", {
    name: "DraftReferrer.md",
  })).toBeVisible();
  await expect(currentViews).not.toContainText("MountedReferrer.md");

  await currentViews.getByRole("button", { name: "Other.md#Details" }).click();
  await expect(workspace.getByRole("tab", { name: "Preview Other.md" }))
    .toBeVisible();

  await searchKnowledge(page, workspace, "shared-query-token");
  await resultForPath(searchGroup(workspace, "main"), "Target.md").click();
  await dismissSearchResults(workspace);
  await currentViews.getByRole("button", { name: "DraftReferrer.md" }).click();
  await expect(workspace.getByRole("tab", { name: "DraftReferrer.md" }))
    .toBeVisible();
  await expect(draftEditor).toBeFocused();
});
