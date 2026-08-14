import { expect, test } from "@playwright/test";

const locales = ["zh-CN", "zh-TW", "ja", "ko", "en"] as const;
const viewports = [{ name: "desktop", width: 1280, height: 800 }, { name: "narrow", width: 390, height: 844 }];

for (const locale of locales) {
  for (const viewport of viewports) {
    test(`${locale} ${viewport.name} supports one-item capture and lifecycle`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`/api/plugins/todolist/page?pluginSurfaceSession=e2e&hana-locale=${locale}`);
      await expect(page.getByRole("heading", { name: "Hana Todo" })).toBeVisible();
      const title = `UI ${locale} ${viewport.name}`;
      await page.locator("#todo-title").fill(title);
      await page.getByRole("button", { name: /^(添加|新增|追加|추가|Add)$/ }).click();
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      const row = page.locator("li").filter({ hasText: title }).first();
      await row.getByRole("button", { name: /编辑|編輯|編集|편집|Edit/ }).click();
      const editedRow = page.locator(`li[data-todo-id="e2e-1"]`);
      await editedRow.locator("input:not([type=checkbox])[aria-label]").fill(`${title} edited`);
      await editedRow.locator("input:not([type=checkbox])[aria-label]").press("Enter");
      await expect(page.getByText(`${title} edited`, { exact: true })).toBeVisible();
      await page.screenshot({ path: `plugins/todolist/tests/e2e/test-results/${locale}-${viewport.name}.png`, fullPage: true });
      await editedRow.getByRole("button", { name: /回收站|垃圾桶|ゴミ箱|휴지통|Trash/ }).click();
      const trashLabels = { "zh-CN": "回收站", "zh-TW": "垃圾桶", ja: "ゴミ箱", ko: "휴지통", en: "Trash" } as const;
      await page.getByRole("button", { name: trashLabels[locale], exact: true }).click();
      await expect(page.getByText(`${title} edited`, { exact: true })).toHaveCount(1);
      await page.locator(`li[data-todo-id="e2e-1"]`).getByRole("button", { name: /恢复|還原|復元|복원|Restore/ }).click();
      const inboxLabels = { "zh-CN": "收集箱", "zh-TW": "收件匣", ja: "受信箱", ko: "받은 편지함", en: "Inbox" } as const;
      await page.getByRole("button", { name: inboxLabels[locale], exact: true }).click();
      await expect(page.getByText(`${title} edited`, { exact: true })).toHaveCount(1);
    });
  }
}
