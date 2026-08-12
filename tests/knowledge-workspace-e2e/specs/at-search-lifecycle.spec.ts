import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '../fixtures/app-fixture.ts';

test('T-18 selects an active workspace resource through @ search and closes it from the keyboard', async ({
  knowledgeApp,
  workspaceSandbox,
}) => {
  test.skip(knowledgeApp.runtime !== 'web-full', 'T-18 direct @ search uses the full runtime because Desk search is closed-product only');

  const fileName = 'at-search-lifecycle-token.md';
  await fs.writeFile(
    path.join(workspaceSandbox.mainSource, fileName),
    '# @ search lifecycle\n',
    'utf8',
  );

  const { page } = knowledgeApp;
  const input = page.locator('#inputBox');
  await expect(input).toBeVisible({ timeout: 90_000 });
  await input.click();
  const searchResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (url.pathname === '/api/desk/search-files' || url.pathname === '/api/workbench/search')
      && url.searchParams.get('q') === 'at-search-lifecycle-token';
  });
  await page.keyboard.insertText('@at-search-lifecycle-token');

  const response = await searchResponse;
  if (!response.ok()) {
    throw new Error(`workspace search failed with ${response.status()}: ${await response.text()}`);
  }
  const payload = await response.json() as { results?: Array<{ name?: string }> };
  expect(payload.results).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: fileName }),
  ]));

  const option = page.locator('[role="dialog"] [role="option"]').filter({ hasText: fileName });
  await expect(option).toBeVisible();

  await page.keyboard.press('Enter');
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await expect(input).toContainText(fileName);

  await page.keyboard.insertText('@at-search-lifecycle-token');
  await expect(option).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
});
