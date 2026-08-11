import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures/app-fixture.ts';

type ApiFetch = (pathname: string, init?: RequestInit) => Promise<Response>;
type JsonRecord = Record<string, unknown>;

async function json(response: Response): Promise<JsonRecord> {
  expect(response.ok, `History E2E API returned ${response.status}`).toBe(true);
  return await response.json() as JsonRecord;
}

async function writeMainText(
  apiFetch: ApiFetch,
  relPath: string,
  content: string,
  expectedVersion: unknown,
): Promise<JsonRecord> {
  return json(await apiFetch('/api/resource-io/write-expected-version', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: { sourceKey: 'main', relativePath: relPath },
      content,
      encoding: 'utf-8',
      expectedVersion,
      reason: 'file_history_e2e',
      operationId: randomUUID(),
    }),
  }));
}

async function waitForSnapshotCount(
  apiFetch: ApiFetch,
  relPath: string,
  minimum: number,
): Promise<{ lastCapturedAt: number; snapshotCount: number }> {
  const deadline = Date.now() + 30_000;
  let lastStatus = 0;
  let lastBody: JsonRecord = {};
  while (Date.now() < deadline) {
    const response = await apiFetch('/api/file-history/files');
    lastStatus = response.status;
    if (response.ok) {
      lastBody = await response.json() as JsonRecord;
      const files = Array.isArray(lastBody.files) ? lastBody.files : [];
      const entry = files.find((value): value is JsonRecord => (
        typeof value === 'object'
        && value !== null
        && (value as JsonRecord).relPath === relPath
      ));
      if (
        entry
        && typeof entry.snapshotCount === 'number'
        && entry.snapshotCount >= minimum
        && typeof entry.lastCapturedAt === 'number'
      ) {
        return {
          lastCapturedAt: entry.lastCapturedAt,
          snapshotCount: entry.snapshotCount,
        };
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(
    `History did not capture ${minimum} snapshot(s) for ${relPath}: ${lastStatus} ${JSON.stringify(lastBody)}`,
  );
}

async function readMainText(apiFetch: ApiFetch, relPath: string): Promise<string> {
  const body = await json(await apiFetch('/api/resource-io/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: { sourceKey: 'main', relativePath: relPath },
      encoding: 'utf-8',
    }),
  }));
  expect(typeof body.content).toBe('string');
  return String(body.content);
}

test('T-16 opens main History, inspects a diff, and restores through the expected-version flow', async ({
  knowledgeApp,
}) => {
  test.setTimeout(180_000);
  test.skip(
    knowledgeApp.runtime !== 'desktop-full',
    'The Workbench History owner flow is a desktop renderer gate',
  );

  const { page } = knowledgeApp;
  await page.locator('[data-tab="chat"]').click();
  const entry = page.getByTestId('file-history-entry');
  await expect(entry).toBeVisible();

  const relPath = 'History E2E.md';
  const initialContent = '# History E2E\n\nInitial body.\n';
  const revisedContent = '# History E2E\n\nRevised body.\n';
  const firstWrite = await writeMainText(
    knowledgeApp.apiFetch,
    relPath,
    initialContent,
    null,
  );
  expect(firstWrite.changeType).toBe('created');
  expect(firstWrite.version).toBeTruthy();

  const firstSnapshot = await waitForSnapshotCount(knowledgeApp.apiFetch, relPath, 1);
  const mergeWindowDeadline = firstSnapshot.lastCapturedAt + 60_050;
  if (Date.now() < mergeWindowDeadline) {
    await new Promise(resolve => setTimeout(resolve, mergeWindowDeadline - Date.now()));
  }

  const secondWrite = await writeMainText(
    knowledgeApp.apiFetch,
    relPath,
    revisedContent,
    firstWrite.version,
  );
  expect(secondWrite.changeType).toBe('modified');
  await waitForSnapshotCount(knowledgeApp.apiFetch, relPath, 2);

  await entry.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAttribute('data-history-source', 'main');
  await dialog.getByRole('button', { name: relPath, exact: true }).click();

  const versions = dialog.locator('[data-testid^="fh-version-"]');
  await expect(versions).toHaveCount(2);
  await versions.last().click();
  const diff = dialog.locator('pre[aria-label]');
  await expect(diff).toContainText('Initial body.');
  await expect(diff).toContainText('Revised body.');

  const restoreResponse = page.waitForResponse(response => (
    response.url().includes('/api/resource-io/write-expected-version')
    && response.request().method() === 'POST'
  ));
  await dialog.getByTestId('fh-restore').click();
  expect((await restoreResponse).ok()).toBe(true);

  await expect.poll(
    () => readMainText(knowledgeApp.apiFetch, relPath),
    { timeout: 30_000 },
  ).toBe(initialContent);
  await expect(dialog.getByRole('status')).toHaveAttribute('data-health', 'HEALTHY');
});
