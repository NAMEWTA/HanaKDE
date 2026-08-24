import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '../fixtures/app-fixture.ts';
import {
  ENGINE_TOOL_HARNESS_COMPLETE,
  ENGINE_TOOL_HARNESS_CONTENT,
  ENGINE_TOOL_HARNESS_REL_PATH,
} from '../fixtures/engine-tool-harness.ts';

test.use({ engineToolHarness: true });

test('E2E-KW-025 T-17 projects a real Agent write into shared History after reload', async ({
  knowledgeApp,
  workspaceSandbox,
}) => {
  test.setTimeout(180_000);
  const { page } = knowledgeApp;
  await page.locator('[data-tab="chat"]').click();
  await expect(page.locator('.connection-status')).toHaveClass(/\bconnected\b/, {
    timeout: 30_000,
  });
  const editor = page.locator('.ProseMirror[contenteditable="true"]:visible').last();
  await expect(editor).toBeVisible();
  await editor.fill('Create the deterministic Agent History fixture.');
  await editor.press('Enter');

  await expect(page.getByText(ENGINE_TOOL_HARNESS_COMPLETE, { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect.poll(
    () => fs.readFile(
      path.join(workspaceSandbox.mainSource, ENGINE_TOOL_HARNESS_REL_PATH),
      'utf8',
    ),
    { timeout: 30_000 },
  ).toBe(ENGINE_TOOL_HARNESS_CONTENT);

  const sessionPath = await page.locator('[data-chat-selection-root][data-session-path]:visible')
    .getAttribute('data-session-path');
  expect(sessionPath).toBeTruthy();
  const resolvedSessionPath = path.resolve(String(sessionPath));
  expect(resolvedSessionPath.startsWith(`${path.resolve(workspaceSandbox.hanaHome)}${path.sep}`)).toBe(true);
  const persisted = (await fs.readFile(resolvedSessionPath, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as {
      message?: {
        role?: string;
        toolName?: string;
        details?: { agentFileChange?: unknown };
      };
    });
  expect(persisted).toEqual(expect.arrayContaining([
    expect.objectContaining({
      message: expect.objectContaining({
        role: 'toolResult',
        toolName: 'write',
        details: expect.objectContaining({
          agentFileChange: expect.objectContaining({
            resource: { sourceKey: 'main', relativePath: ENGINE_TOOL_HARNESS_REL_PATH },
          }),
        }),
      }),
    }),
  ]));

  const replayResponse = await knowledgeApp.apiFetch(
    `/api/sessions/messages?path=${encodeURIComponent(resolvedSessionPath)}`,
  );
  expect(replayResponse.ok).toBe(true);
  const replay = await replayResponse.json() as {
    blocks?: Array<{ agentFileChange?: unknown }>;
  };
  expect(replay.blocks).toEqual(expect.arrayContaining([
    expect.objectContaining({
      agentFileChange: expect.objectContaining({
        resource: { sourceKey: 'main', relativePath: ENGINE_TOOL_HARNESS_REL_PATH },
      }),
    }),
  ]));

  await page.reload({ waitUntil: 'domcontentloaded' });
  const sessionRow = page.locator(
    `button[data-session-path=${JSON.stringify(resolvedSessionPath)}]`,
  );
  await expect(sessionRow).toBeVisible({ timeout: 30_000 });
  await sessionRow.click();
  await expect(page.getByText(ENGINE_TOOL_HARNESS_COMPLETE, { exact: true })).toBeVisible({
    timeout: 30_000,
  });
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
