import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '../fixtures/app-fixture.ts';

test('E2E-KW-026 reuses the Desk tree, Preview editor and context menu in Knowledge', async ({
  knowledgeApp,
  workspaceSandbox,
}) => {
  const fileName = 'Shared Workbench.md';
  const filePath = path.join(workspaceSandbox.mainSource, fileName);
  await fs.writeFile(filePath, '# Shared workbench\n\nInitial body.\n', 'utf8');

  const { page } = knowledgeApp;
  await page.locator('[data-tab="knowledge"]').click();
  const workspace = page.locator('[data-knowledge-workspace]');
  await expect(workspace).toBeVisible({ timeout: 90_000 });

  const tree = workspace.locator('[data-desk-tree]');
  await expect(tree).toBeVisible();
  const file = tree.getByRole('treeitem', { name: fileName, exact: true });
  await expect(file).toBeVisible({ timeout: 30_000 });
  await file.dblclick();

  await expect(
    workspace.getByTestId('preview-tab-list').getByText(fileName, { exact: true }),
  ).toBeVisible();
  const editor = workspace.locator('.cm-content[contenteditable="true"]');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await page.keyboard.insertText('# Shared workbench\n\nSaved from the Knowledge tab.\n');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
  await expect.poll(() => fs.readFile(filePath, 'utf8')).toContain(
    'Saved from the Knowledge tab.',
  );

  await file.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Context menu' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Cut|剪切/i })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /^Copy$|^复制$/i })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Delete|删除/i })).toBeVisible();
});
