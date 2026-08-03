import fs from 'node:fs/promises';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures/app-fixture.ts';

async function openKnowledge(page: Page): Promise<Locator> {
  await page.locator('[data-tab="knowledge"]').click();
  const workspace = page.locator('[data-knowledge-workspace]');
  await expect(workspace).toBeVisible({ timeout: 90_000 });
  return workspace;
}

async function expandMain(workspace: Locator): Promise<void> {
  await expandSource(workspace, 'main');
}

async function expandSource(workspace: Locator, sourceKey: string): Promise<void> {
  const root = workspace.locator(`[role="treeitem"][data-source-key="${sourceKey}"]`).first();
  if (await root.getAttribute('aria-expanded') !== 'true') {
    await root.getByRole('button').first().click();
  }
}

async function openTreeFile(workspace: Locator, name: string): Promise<void> {
  await openSourceTreeFile(workspace, 'main', name);
}

async function openSourceTreeFile(workspace: Locator, sourceKey: string, name: string): Promise<void> {
  await expandSource(workspace, sourceKey);
  const row = workspace.locator(`[role="treeitem"][data-source-key="${sourceKey}"]`)
    .filter({ hasText: name }).last();
  await expect(row).toBeVisible();
  await row.dblclick();
}

async function json(response: Response): Promise<Record<string, unknown>> {
  // Failure output is part of the release artifact surface. Never attach an
  // API response body here: security regressions must not echo test content,
  // absolute paths, or bearer material into CI logs.
  expect(response.ok, `Knowledge API returned ${response.status}`).toBe(true);
  return await response.json() as Record<string, unknown>;
}

test('E2E-KW-002 keeps Open and Full on the same public DTO and capability shape', async ({ knowledgeApp }) => {
  const sources = await json(await knowledgeApp.apiFetch('/api/knowledge-workspace/sources'));
  expect(sources).toMatchObject({ sources: [expect.objectContaining({
    sourceKey: 'main', role: 'main', availability: 'available',
  })] });
  expect(JSON.stringify(sources)).not.toMatch(/rootLocator|scopeToken|absolutePath|nativeBridgeToken/u);
  const capabilities = await json(await knowledgeApp.apiFetch('/api/knowledge-workspace/native/capabilities'));
  expect(capabilities).toEqual({
    directoryPicker: knowledgeApp.runtime === 'desktop-full',
    filePicker: knowledgeApp.runtime === 'desktop-full',
    fileClipboard: knowledgeApp.runtime === 'desktop-full',
    openDefault: knowledgeApp.runtime === 'desktop-full',
    reveal: knowledgeApp.runtime === 'desktop-full',
    systemTrash: knowledgeApp.runtime === 'desktop-full',
  });
});

test('E2E-KW-003 registers disjoint sources and rejects an occupied source identity', async ({ knowledgeApp }) => {
  test.skip(knowledgeApp.runtime === 'web-full', 'source journey is required for desktop-full and web-open');
  const register = (sourceKey: string, mountId: string) => knowledgeApp.apiFetch('/api/knowledge-workspace/sources', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceKey, displayName: sourceKey, mountId }),
  });
  expect((await register('research', 'knowledge_e2e_mount_1')).status).toBe(201);
  expect((await register('archive', 'knowledge_e2e_mount_2')).status).toBe(201);
  for (const [sourceKey, mountId, expectedCode] of [
    ['duplicate-key', 'knowledge_e2e_mount_2', 'knowledge_resource_conflict'],
    ['same-root', 'knowledge_e2e_mount_same', 'source_root_not_disjoint'],
    ['ancestor-root', 'knowledge_e2e_mount_ancestor', 'source_root_not_disjoint'],
    ['unknown-root', 'knowledge_e2e_mount_missing', 'source_root_identity_unprovable'],
  ] as const) {
    const response = sourceKey === 'duplicate-key'
      ? await register('research', mountId)
      : await register(sourceKey, mountId);
    expect(response.status, sourceKey).toBeGreaterThanOrEqual(400);
    const error = await response.json() as { code?: string };
    expect(error.code, sourceKey).toBe(expectedCode);
    expect(JSON.stringify(error)).not.toMatch(/[A-Za-z]:\\|\/Users\/|\/home\//u);
  }
});

test('E2E-KW-004 opens preview and pinned tabs while preserving one editor group', async ({ knowledgeApp, workspaceSandbox }) => {
  test.skip(knowledgeApp.runtime !== 'desktop-full', 'tab grouping is a desktop-full gate');
  await fs.writeFile(path.join(workspaceSandbox.mainSource, 'One.md'), '# One\n', 'utf8');
  await fs.writeFile(path.join(workspaceSandbox.mainSource, 'Two.md'), '# Two\n', 'utf8');
  const workspace = await openKnowledge(knowledgeApp.page);
  await expandMain(workspace);
  await workspace.getByRole('treeitem', { name: /One\.md/i }).click();
  await expect(workspace.getByRole('tab', { name: /Preview One\.md/i })).toBeVisible();
  await workspace.getByRole('treeitem', { name: /Two\.md/i }).dblclick();
  await expect(workspace.getByRole('tab', { name: 'Two.md' })).toBeVisible();
  await workspace.getByRole('button', { name: /Open Two\.md to the side/i }).click();
  await expect(workspace.locator('[data-editor-group-id]')).toHaveCount(2);
  const sharedEditors = knowledgeApp.page.locator('[aria-label="Edit Two.md"] .cm-content');
  await expect(sharedEditors).toHaveCount(2);
  await sharedEditors.first().click();
  await sharedEditors.first().press('End');
  await knowledgeApp.page.keyboard.insertText('\nshared-session-token');
  await expect(sharedEditors.nth(1)).toContainText('shared-session-token');
});

test('E2E-KW-005 edits manually, stays dirty without autosave and saves with expected version', async ({ knowledgeApp, workspaceSandbox }) => {
  test.skip(knowledgeApp.runtime === 'web-full', 'manual save is required for desktop-full and web-open');
  const file = path.join(workspaceSandbox.mainSource, 'Manual.md');
  await fs.writeFile(file, '# Baseline\n', 'utf8');
  await json(await knowledgeApp.apiFetch('/api/resource-io/list', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: { sourceKey: 'main', relativePath: '' } }),
  }));
  const workspace = await openKnowledge(knowledgeApp.page);
  await openTreeFile(workspace, 'Manual.md');
  const editor = knowledgeApp.page.locator('[aria-label="Edit Manual.md"] .cm-content');
  await editor.click();
  await editor.press('End');
  await knowledgeApp.page.keyboard.insertText('\nmanual-save-token');
  await expect(knowledgeApp.page.locator('[aria-label="Edit Manual.md"]')).toHaveAttribute('data-dirty', 'true');
  expect(await fs.readFile(file, 'utf8')).toBe('# Baseline\n');
  const writeRequest = knowledgeApp.page.waitForRequest(request => (
    request.method() === 'POST' && request.url().includes('/api/resource-io/write')
  ));
  await editor.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
  const saveRequest = await writeRequest;
  expect(saveRequest.postDataJSON()).toMatchObject({
    address: { sourceKey: 'main', relativePath: 'Manual.md' },
    expectedVersion: expect.any(Object),
  });
  await expect(knowledgeApp.page.locator('[aria-label="Edit Manual.md"]')).toHaveAttribute('data-dirty', 'false');
  expect(await fs.readFile(file, 'utf8')).toContain('manual-save-token');
  await editor.press('End');
  await knowledgeApp.page.keyboard.insertText('\nundo-to-baseline-token');
  await expect(knowledgeApp.page.locator('[aria-label="Edit Manual.md"]')).toHaveAttribute('data-dirty', 'true');
  await editor.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(knowledgeApp.page.locator('[aria-label="Edit Manual.md"]')).toHaveAttribute('data-dirty', 'false');
});

test('E2E-KW-006 renders safe text, image, PDF and media while keeping unknown assets informational', async ({ knowledgeApp, workspaceSandbox }) => {
  test.skip(knowledgeApp.runtime === 'web-full', 'asset viewers are required for desktop-full and web-open');
  await Promise.all([
    fs.writeFile(path.join(workspaceSandbox.mainSource, 'sample.txt'), 'safe-text-token\n', 'utf8'),
    fs.writeFile(path.join(workspaceSandbox.mainSource, 'pixel.png'), Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
      'base64',
    )),
    fs.writeFile(path.join(workspaceSandbox.mainSource, 'document.pdf'), '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n', 'utf8'),
    fs.writeFile(path.join(workspaceSandbox.mainSource, 'silence.wav'), Buffer.from(
      'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
      'base64',
    )),
    fs.writeFile(path.join(workspaceSandbox.mainSource, 'unknown.bin'), Buffer.from([0, 1, 2, 3])),
  ]);
  const workspace = await openKnowledge(knowledgeApp.page);
  await openTreeFile(workspace, 'sample.txt');
  const viewer = workspace.locator('[role="tabpanel"]:visible [data-knowledge-asset-viewer]');
  await expect(viewer).not.toHaveAttribute('data-knowledge-asset-status', 'loading');
  await expect(viewer).toHaveAttribute('data-knowledge-asset-status', 'ready');
  await expect(workspace.getByText('safe-text-token')).toBeVisible();
  await expect(workspace.locator('[aria-label="Edit sample.txt"]')).toHaveCount(0);
  for (const [name, kind] of [
    ['pixel.png', 'image'],
    ['document.pdf', 'pdf'],
    ['silence.wav', 'audio'],
  ] as const) {
    await openTreeFile(workspace, name);
    await expect(workspace.locator(`[data-knowledge-asset-kind="${kind}"]`)).toBeVisible();
  }
  await openTreeFile(workspace, 'unknown.bin');
  await expect(viewer).toHaveAttribute('data-knowledge-asset-status', 'file-info');
  await expect(workspace.locator('[aria-label="Edit unknown.bin"]')).toHaveCount(0);
});

test('E2E-KW-007 keeps an open clean document responsive to external file events', async ({ knowledgeApp, workspaceSandbox }) => {
  test.skip(knowledgeApp.runtime === 'web-full', 'external change flow is required for desktop-full and web-open');
  const file = path.join(workspaceSandbox.mainSource, 'External.md');
  await fs.writeFile(file, '# Before\n', 'utf8');
  const workspace = await openKnowledge(knowledgeApp.page);
  await openTreeFile(workspace, 'External.md');
  await expect(workspace.getByText('Before').first()).toBeVisible();
  await fs.writeFile(file, '# After external change\n', 'utf8');
  await expect(workspace.getByText('After external change').first()).toBeVisible({ timeout: 15_000 });
  const editor = knowledgeApp.page.locator('[aria-label="Edit External.md"] .cm-content');
  await editor.click();
  await editor.press('End');
  await knowledgeApp.page.keyboard.insertText('\nlocal-dirty-token');
  await fs.writeFile(file, '# Disk changed again\n', 'utf8');
  const conflict = workspace.locator('[data-knowledge-conflict]');
  await expect(conflict).toBeVisible({ timeout: 15_000 });
  await expect(conflict.getByRole('button', { name: /Use disk/i })).toBeVisible();
  await conflict.getByRole('button', { name: /Use disk/i }).click();
  await expect(conflict).toHaveCount(0);
  await expect(editor).toContainText('Disk changed again');
});

test('E2E-KW-008 asks before close and saves a source-loss orphan to an explicit target', async ({ knowledgeApp, workspaceSandbox }) => {
  test.skip(knowledgeApp.runtime !== 'desktop-full', 'close/orphan dialog is a desktop-full gate');
  await fs.writeFile(path.join(workspaceSandbox.mountedSources[0], 'Dirty.md'), '# Dirty\n', 'utf8');
  expect((await knowledgeApp.apiFetch('/api/knowledge-workspace/sources', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceKey: 'research', displayName: 'Research', mountId: 'knowledge_e2e_mount_1' }),
  })).status).toBe(201);
  const workspace = await openKnowledge(knowledgeApp.page);
  await openSourceTreeFile(workspace, 'research', 'Dirty.md');
  const editor = knowledgeApp.page.locator('[aria-label="Edit Dirty.md"] .cm-content');
  await editor.click();
  await editor.press('End');
  await knowledgeApp.page.keyboard.insertText('\norphan-save-token');
  expect((await knowledgeApp.apiFetch('/api/knowledge-workspace/sources/research', { method: 'DELETE' })).ok).toBe(true);
  await fs.writeFile(path.join(workspaceSandbox.mountedSources[0], 'source-removal-event.txt'), 'refresh\n', 'utf8');
  await expect(knowledgeApp.page.locator('[aria-label="Edit Dirty.md"]')).toHaveAttribute('data-orphan', 'true', { timeout: 15_000 });
  await workspace.getByRole('button', { name: /Close Dirty\.md/i }).click();
  const dialog = knowledgeApp.page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox').fill('Recovered-orphan.md');
  await dialog.getByRole('button', { name: /^Save$/i }).click();
  await expect(dialog).toHaveCount(0);
  expect(await fs.readFile(path.join(workspaceSandbox.mainSource, 'Recovered-orphan.md'), 'utf8'))
    .toContain('orphan-save-token');
});

test('E2E-KW-009 completes and navigates same-source links, creates a missing page and renders embeds/backlinks', async ({ knowledgeApp, workspaceSandbox }) => {
  test.skip(knowledgeApp.runtime === 'web-full', 'Wikilink navigation is required for desktop-full and web-open');
  await fs.writeFile(path.join(workspaceSandbox.mainSource, 'Link.md'), '# Link\n[[Target.md]]\n![[Embed.md]]\n[[Missing.md]]\n', 'utf8');
  await fs.writeFile(path.join(workspaceSandbox.mainSource, 'Target.md'), '# Linked target\n', 'utf8');
  await fs.writeFile(path.join(workspaceSandbox.mainSource, 'Embed.md'), '# Embedded token\n', 'utf8');
  await fs.writeFile(path.join(workspaceSandbox.mainSource, 'Broken.md'), '# Broken\n[[Missing.md]]\n', 'utf8');
  await json(await knowledgeApp.apiFetch('/api/knowledge-workspace/index/main/rebuild', { method: 'POST' }));
  const workspace = await openKnowledge(knowledgeApp.page);
  await openTreeFile(workspace, 'Link.md');

  const linkRegion = knowledgeApp.page.locator('[aria-label="Edit Link.md"]');
  const linkEditor = linkRegion.locator('.cm-content');
  await expect(workspace.locator('.cm-knowledge-embed-content')).toContainText('Embedded token');
  await linkRegion.getByRole('button', { name: 'Source' }).click();
  await linkEditor.click();
  await linkEditor.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await knowledgeApp.page.keyboard.insertText('\n[[Tar');
  await expect(knowledgeApp.page.locator('.cm-tooltip-autocomplete')).toBeVisible();
  await knowledgeApp.page.keyboard.press('Enter');
  await expect(linkEditor).toContainText('[[Target.md]]');

  await linkRegion.getByRole('button', { name: 'Live Preview' }).click();
  await knowledgeApp.page.getByText('Target.md', { exact: true }).last().click();
  await expect(workspace.getByRole('tab', { name: /Target\.md/i })).toBeVisible();
  await expect(workspace.locator('[data-knowledge-current-resource-views]').getByRole('button', { name: 'Link.md' }))
    .toBeVisible();

  await openTreeFile(workspace, 'Broken.md');
  const missingStat = knowledgeApp.page.waitForResponse(response => (
    response.request().method() === 'POST'
    && response.url().includes('/api/resource-io/stat')
    && response.request().postDataJSON()?.address?.relativePath === 'Missing.md'
  ));
  await workspace.locator('[data-knowledge-current-resource-views]').getByRole('button', { name: 'Missing.md' }).click();
  expect(await (await missingStat).json()).toMatchObject({ exists: false, isDirectory: false });
  await expect(workspace.getByRole('tab', { name: /Missing\.md/i })).toBeVisible();
  await expect(fs.stat(path.join(workspaceSandbox.mainSource, 'Missing.md'))).rejects.toThrow();
  const missingEditor = knowledgeApp.page.locator('[aria-label="Edit Missing.md"] .cm-content');
  await missingEditor.click();
  await knowledgeApp.page.keyboard.insertText('# Created later');
  await expect.poll(async () => fs.readFile(
    path.join(workspaceSandbox.mainSource, 'Missing.md'),
    'utf8',
  ).catch(() => '')).toBe('# Created later');
});

test('E2E-KW-010 drags cross-source pages/assets through copy-before-link and leaves failed editor text unchanged', async ({ knowledgeApp, workspaceSandbox }) => {
  test.skip(knowledgeApp.runtime === 'web-full', 'cross-source copy is required for desktop-full and web-open');
  await fs.mkdir(path.join(workspaceSandbox.mainSource, 'Notes'));
  await fs.writeFile(path.join(workspaceSandbox.mainSource, 'Notes', 'Host.md'), '# Host\n', 'utf8');
  await fs.mkdir(path.join(workspaceSandbox.mainSource, 'Blocked'));
  await fs.writeFile(path.join(workspaceSandbox.mainSource, 'Blocked', 'Host.md'), '# Stable\n', 'utf8');
  await fs.writeFile(path.join(workspaceSandbox.mainSource, 'Blocked', 'assets'), 'occupied', 'utf8');
  await fs.writeFile(path.join(workspaceSandbox.mountedSources[0], 'Copy.md'), '[[StillLocal.md]]\r\n', 'utf8');
  await fs.writeFile(path.join(workspaceSandbox.mountedSources[0], 'photo.png'), Buffer.from([0, 1, 2, 255, 13, 10]));
  await json(await knowledgeApp.apiFetch('/api/knowledge-workspace/sources', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceKey: 'research', displayName: 'Research', mountId: 'knowledge_e2e_mount_1' }),
  }));
  const workspace = await openKnowledge(knowledgeApp.page);
  await expandMain(workspace);
  const notes = workspace.locator('[data-source-key="main"][data-resource-path="Notes"]');
  await notes.getByRole('button').first().click();
  await workspace.locator('[data-source-key="main"][data-resource-path="Notes/Host.md"]').dblclick();
  const research = workspace.locator('[role="treeitem"][data-source-key="research"]').first();
  if (await research.getAttribute('aria-expanded') !== 'true') await research.getByRole('button').first().click();
  const hostRegion = knowledgeApp.page.locator('[aria-label="Edit Host.md"]');
  await hostRegion.getByRole('button', { name: 'Source' }).click();
  const editor = hostRegion.locator('.cm-content');
  const dragIntoEditor = async (name: string) => {
    const transfer = await knowledgeApp.page.evaluateHandle(() => new DataTransfer());
    const row = workspace.locator(`[data-source-key="research"][data-resource-path="${name}"]`);
    await row.dispatchEvent('dragstart', { dataTransfer: transfer });
    await editor.dispatchEvent('drop', { dataTransfer: transfer });
    await transfer.dispose();
  };

  await dragIntoEditor('Copy.md');
  await expect(editor).toContainText('[[Notes/Copy.md]]');
  expect(await fs.readFile(path.join(workspaceSandbox.mainSource, 'Notes', 'Copy.md'), 'utf8'))
    .toBe('[[StillLocal.md]]\r\n');
  expect(await fs.readFile(path.join(workspaceSandbox.mountedSources[0], 'Copy.md'), 'utf8'))
    .toBe('[[StillLocal.md]]\r\n');

  await dragIntoEditor('photo.png');
  await expect(editor).toContainText(/!\[\[Notes\/assets\/\d{4}-\d{2}-\d{2}-photo\.png\]\]/u);
  const assets = await fs.readdir(path.join(workspaceSandbox.mainSource, 'Notes', 'assets'));
  const copiedPhoto = assets.find(name => name.endsWith('-photo.png'))!;
  expect(await fs.readFile(path.join(workspaceSandbox.mainSource, 'Notes', 'assets', copiedPhoto)))
    .toEqual(Buffer.from([0, 1, 2, 255, 13, 10]));

  await workspace.locator('[data-source-key="main"][data-resource-path="Blocked"]').getByRole('button').first().click();
  await workspace.locator('[data-source-key="main"][data-resource-path="Blocked/Host.md"]').dblclick();
  const blockedRegion = knowledgeApp.page.locator('[aria-label="Edit Host.md"]').last();
  await blockedRegion.getByRole('button', { name: 'Source' }).click();
  const blockedEditor = blockedRegion.locator('.cm-content');
  const before = await blockedEditor.textContent();
  const failedTransfer = await knowledgeApp.page.evaluateHandle(() => new DataTransfer());
  await workspace.locator('[data-source-key="research"][data-resource-path="photo.png"]').dispatchEvent('dragstart', { dataTransfer: failedTransfer });
  await blockedEditor.dispatchEvent('drop', { dataTransfer: failedTransfer });
  await failedTransfer.dispose();
  await expect(blockedEditor).toHaveText(before ?? '');
  expect(await fs.readFile(path.join(workspaceSandbox.mainSource, 'Blocked', 'assets'), 'utf8')).toBe('occupied');
});

test('E2E-KW-011 isolates enhanced Markdown rendering from active HTML', async ({ knowledgeApp, workspaceSandbox }) => {
  test.skip(knowledgeApp.runtime === 'web-full', 'enhanced rendering is required for desktop-full and web-open');
  await fs.writeFile(
    path.join(workspaceSandbox.mainSource, 'Render.md'),
    [
      '# Render',
      '',
      '$E=mc^2$ and $\\notacommand{$',
      '',
      '```mermaid',
      'graph TD',
      'A --> B',
      '```',
      '',
      '```mermaid',
      'this is not mermaid syntax ???',
      '```',
      '',
      'Footnote reference [^safe].',
      '',
      '[^safe]: **safe footnote**',
      '',
      '<script>window.__unsafe=1</script>',
      '',
    ].join('\n'),
    'utf8',
  );
  const workspace = await openKnowledge(knowledgeApp.page);
  await openTreeFile(workspace, 'Render.md');
  await expect(workspace.getByText('Render', { exact: true }).last()).toBeVisible();
  await expect(workspace.locator('.cm-math-widget.is-rendered')).toBeVisible();
  await expect(workspace.locator('.cm-math-widget.is-error')).toBeVisible();
  await expect(workspace.locator('.cm-mermaid-widget.is-rendered')).toBeVisible({ timeout: 15_000 });
  await expect(workspace.locator('.cm-mermaid-widget.is-error')).toBeVisible({ timeout: 15_000 });
  await expect(workspace.locator('.cm-footnote-marker')).toBeVisible();
  expect(await knowledgeApp.page.evaluate(() => (window as Window & { __unsafe?: number }).__unsafe)).toBeUndefined();
});

test('E2E-KW-012 cycles document find, replaces as one undo step and retains group query across tabs', async ({ knowledgeApp, workspaceSandbox }) => {
  test.skip(knowledgeApp.runtime !== 'desktop-full', 'find/replace is a desktop-full gate');
  await fs.writeFile(path.join(workspaceSandbox.mainSource, 'Find.md'), '# repeated repeated\n', 'utf8');
  await fs.writeFile(path.join(workspaceSandbox.mainSource, 'Other.md'), '# Other repeated\n', 'utf8');
  const workspace = await openKnowledge(knowledgeApp.page);
  await openTreeFile(workspace, 'Find.md');
  const editor = knowledgeApp.page.locator('[aria-label="Edit Find.md"] .cm-content');
  await editor.click();
  await editor.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
  const find = knowledgeApp.page.getByRole('search', { name: /Find and replace/i });
  const query = find.getByRole('textbox', { name: 'Find', exact: true });
  await query.fill('repeated');
  await expect(find.getByText('1 / 2')).toBeVisible();
  await find.getByRole('button', { name: /Next match/i }).click();
  await expect(find.getByText('2 / 2')).toBeVisible();
  await find.getByRole('button', { name: /Next match/i }).click();
  await expect(find.getByText('1 / 2')).toBeVisible();
  await find.getByRole('button', { name: /Show replace controls/i }).click();
  await find.getByRole('textbox', { name: /Replace with/i }).fill('changed');
  await find.getByRole('button', { name: /Replace all matches/i }).click();
  await expect(editor).toContainText('# changed changed');
  await editor.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(editor).toContainText('# repeated repeated');
  await openTreeFile(workspace, 'Other.md');
  await expect(query).toHaveValue('repeated');
  await expect(workspace.getByRole('tab', { name: 'Other.md' })).toHaveAttribute('aria-selected', 'true');
});
