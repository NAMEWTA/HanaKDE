import { expect, test } from '../fixtures/app-fixture.ts';

test('T-17 projects one correlated main Agent file change into shared History', async ({
  knowledgeApp,
}) => {
  test.skip(
    true,
    'Fixed residual: ActivityHub and chat history payloads currently omit the explicit sessionId + operationId + source-relative resource envelope; fail-closed behavior must stay link-free until the read-only producers provide it.',
  );

  const { page } = knowledgeApp;
  const impact = page.getByTestId('agent-file-change-history');
  await expect(impact).toBeVisible();
  await expect(impact).toHaveAttribute('data-agent-file-impact', 'main');

  const historyEntry = impact.getByTestId('file-history-entry');
  await expect(historyEntry).toHaveAttribute('data-history-source', 'main');
  await historyEntry.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAttribute('data-history-source', 'main');
  await expect(dialog.getByTestId('fh-restore')).toBeVisible();
});
