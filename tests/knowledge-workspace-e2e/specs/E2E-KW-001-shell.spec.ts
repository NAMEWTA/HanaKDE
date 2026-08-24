import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/app-fixture.ts";

async function openKnowledge(page: Page) {
  const entry = page.locator('[data-tab="knowledge"]');
  await expect(entry).toBeVisible({ timeout: 90_000 });
  await entry.click();
  const workspace = page.locator('[data-knowledge-workspace]');
  await expect(workspace).toBeVisible();
  return workspace;
}

test("E2E-KW-001 opens a blank main Knowledge shell", async ({
  knowledgeApp,
}) => {
  test.skip(
    knowledgeApp.runtime === "web-full",
    "E2E-KW-001 is required for desktop-full and web-open",
  );
  const { page } = knowledgeApp;
  const workspace = await openKnowledge(page);

  const resourceTree = workspace.getByRole("tree", {
    name: /resource tree|资源树|資源樹|リソースツリー|리소스 트리/i,
  });
  await expect(resourceTree).toBeVisible();
  await expect(resourceTree).toHaveCount(1);
  await expect(resourceTree.locator('[role="treeitem"][aria-level="1"]')).toHaveCount(1);
  await expect(workspace.getByRole("region", {
    name: /sources|来源|來源|ソース|소스/i,
  })).toHaveCount(0);
  await expect(
    workspace.getByRole("group", { name: /editor group|编辑组|編輯群組|エディターグループ|편집기 그룹/i }),
  ).toBeVisible();
  await expect(workspace.getByRole("tab")).toHaveCount(0);
  await expect(page.locator("#previewPanel")).toHaveCount(0);
  await expect(page.locator("#jianSidebar")).toHaveCount(0);
});

test("E2E-KW-023 covers five locales, themes, narrow layout and accessibility", async ({
  knowledgeApp,
}) => {
  test.skip(
    knowledgeApp.runtime !== "desktop-full",
    "E2E-KW-023 is a desktop-full user-flow gate",
  );
  const { apiFetch, page } = knowledgeApp;
  await openKnowledge(page);
  await expect(page.locator('.connection-status')).toHaveClass(/\bconnected\b/, {
    timeout: 30_000,
  });

  const localeTitles = [
    ["zh-CN", "打开一个资源"],
    ["zh-TW", "開啟資源"],
    ["en", "Open a resource"],
    ["ja", "リソースを開く"],
    ["ko", "리소스 열기"],
  ] as const;
  for (const [locale, expectedTitle] of localeTitles) {
    const response = await apiFetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale }),
    });
    expect(response.ok).toBe(true);
    await expect(
      page.locator('[data-knowledge-workspace] h1'),
    ).toHaveText(expectedTitle);
  }

  const contrastRatios: number[] = [];
  for (const theme of ["warm-paper", "midnight"]) {
    await page.evaluate((nextTheme) => window.setTheme?.(nextTheme), theme);
    contrastRatios.push(await page.locator('[data-knowledge-workspace]').evaluate((element) => {
      const style = getComputedStyle(element);
      return contrastRatio(style.color, style.backgroundColor);

      function contrastRatio(foreground: string, background: string): number {
        const luminance = (value: string) => {
          const channels = value.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [];
          const linear = channels.map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.03928
              ? normalized / 12.92
              : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * (linear[0] ?? 0)
            + 0.7152 * (linear[1] ?? 0)
            + 0.0722 * (linear[2] ?? 0);
        };
        const a = luminance(foreground);
        const b = luminance(background);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      }
    }));
  }
  expect(contrastRatios.every((ratio) => ratio >= 4.5)).toBe(true);

  await page.setViewportSize({ width: 600, height: 720 });
  const narrowWorkspace = page.locator('[data-knowledge-workspace]');
  const tree = await narrowWorkspace.getByRole("navigation").boundingBox();
  const editorGroup = narrowWorkspace.locator('[data-editor-group-id]');
  const editor = await editorGroup.boundingBox();
  expect(tree && editor).toBeTruthy();
  expect(tree!.y).toBeLessThan(editor!.y);
  const hasHorizontalOverflow = await narrowWorkspace.evaluate(
    element => element.scrollWidth > element.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await editorGroup.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(editorGroup).toBeFocused();
  const focusIndicator = await editorGroup.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.boxShadow;
  });
  expect(focusIndicator).not.toBe("none");
  await expect(narrowWorkspace).toHaveAttribute(
    "aria-label",
    /知识工作区|知識工作區|Knowledge workspace|ナレッジワークスペース|지식 작업 공간/,
  );
});
