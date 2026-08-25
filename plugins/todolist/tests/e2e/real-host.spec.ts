import { expect, test } from "@playwright/test";

const locales = ["zh-CN", "zh-TW", "ja", "ko", "en"] as const;

function localizedUrl(base: string, locale: string): string {
  const url = new URL(base);
  url.searchParams.set("locale", locale);
  return url.toString();
}

test.describe("real Hana todolist page", () => {
  for (const locale of locales) {
    test(`${locale}: manual capture, autosave, complete, Trash and restore`, async ({ page }) => {
      const base = process.env.HANA_TODO_E2E_URL;
      if (!base) throw new Error("HANA_TODO_E2E_URL is missing");
      const authenticationFailures: string[] = [];
      page.on("response", (response) => {
        if (response.url().includes("/api/plugins/todolist/") && [401, 403].includes(response.status())) {
          authenticationFailures.push(`${response.status()} ${new URL(response.url()).pathname}`);
        }
      });
      await page.goto(localizedUrl(base, locale));
      await expect(page.locator(".app-shell")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", locale);

      const marker = `E2E ${locale} ${Date.now()}`;
      await page.locator("#capture-title").fill(marker);
      await page.locator("[data-capture] button[type=submit]").click();
      const title = page.locator(".todo-title", { hasText: marker }).first();
      await expect(title).toBeVisible();

      await title.click();
      const detailTitle = page.locator('[data-detail-form] [data-field="title"]');
      const edited = `${marker} edited`;
      const saved = page.waitForResponse((response) => (
        response.request().method() === "PATCH"
        && response.url().includes("/api/plugins/todolist/api/todos/")
        && response.ok()
      ));
      await detailTitle.fill(edited);
      await saved;
      await expect(page.locator(".todo-title", { hasText: edited }).first()).toHaveText(edited);

      await page.locator("[data-toggle-selected]").click();
      await expect(detailTitle).toHaveValue(edited);
      await page.locator("[data-trash]").click();
      await page.locator('[data-nav="trash"]').click();
      await expect(page.locator(".todo-title", { hasText: edited }).first()).toBeVisible();
      await page.locator(".todo-title", { hasText: edited }).first().click();
      await page.locator("[data-restore]").click();
      expect(authenticationFailures).toEqual([]);
    });
  }

  test("capture remains one-item-only and is composition safe", async ({ page }) => {
    const base = process.env.HANA_TODO_E2E_URL;
    if (!base) throw new Error("HANA_TODO_E2E_URL is missing");
    await page.goto(localizedUrl(base, "en"));
    const capture = page.locator("#capture-title");
    await expect(capture).toHaveAttribute("type", "text");
    await expect(capture).toHaveAttribute("maxlength", "240");
    await expect(page.locator('[data-capture] textarea')).toHaveCount(0);
  });
});
