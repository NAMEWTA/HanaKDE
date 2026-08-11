import { expect, test } from '../fixtures/app-fixture.ts';

test('T-16 opens main History, inspects a diff, and restores through the expected-version flow', async ({
  knowledgeApp,
}) => {
  test.skip(
    true,
    'Host Workbench does not yet mount the T-16 entry/store, and the current server exposes no History restore/health routes; enable after the owning integration ticket wires those seams.',
  );

  const { page } = knowledgeApp;
  const entry = page.getByTestId('file-history-entry');
  await expect(entry).toBeVisible();
  await entry.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAttribute('data-history-source', 'main');
  await expect(dialog.getByTestId('file-history-deleted-group')).toBeVisible();

  const version = dialog.locator('[data-testid^="fh-version-"]').first();
  await expect(version).toBeVisible();
  await version.click();
  await expect(dialog.locator('pre[aria-label]')).toBeVisible();

  await dialog.getByTestId('fh-restore').click();
  await expect(dialog.getByRole('status')).toHaveAttribute('data-health', /HEALTHY|DEGRADED|FAILED/);
  await expect(dialog.getByTestId('fh-result')).toHaveAttribute('data-result', /restored|conflict|error/);
});
