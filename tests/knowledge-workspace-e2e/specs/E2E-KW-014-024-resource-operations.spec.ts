import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createDeviceCredential } from '../../../core/device-registry.ts';
import { saveServerNetworkConfig } from '../../../core/server-network-config.ts';
import { KNOWLEDGE_INDEX_ROOT } from '../../../lib/knowledge-workspace/knowledge-index-store.ts';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures/app-fixture.ts';
import { createKnowledgeWorkspaceSandbox } from '../fixtures/workspace-fixture.ts';
import { createKnowledgeLaunchConfig } from '../fixtures/server-fixture.ts';

async function openKnowledge(page: Page): Promise<Locator> {
  await page.locator('[data-tab="knowledge"]').click();
  const workspace = page.locator('[data-knowledge-workspace]');
  await expect(workspace).toBeVisible({ timeout: 90_000 });
  await expect(
    workspace.locator('[role="treeitem"][data-source-key="main"]').first()
      .getByRole('button').first(),
  ).toBeVisible({ timeout: 90_000 });
  return workspace;
}

async function expandMain(workspace: Locator): Promise<void> {
  const root = workspace.locator('[role="treeitem"][data-source-key="main"]').first();
  if (await root.getAttribute('aria-expanded') !== 'true') await root.getByRole('button').first().click();
}

async function openTreeFile(workspace: Locator, name: string): Promise<void> {
  await expandMain(workspace);
  const row = workspace.getByRole('treeitem', { name: new RegExp(name.replace('.', '\\.'), 'i') });
  await expect(row).toBeVisible();
  await row.dblclick();
}

async function createNativeGrantFromRenderer(
  page: Page,
  relativePath: string,
  action: 'reveal' | 'systemTrash' = 'reveal',
): Promise<string> {
  return page.evaluate(async ({ targetPath, nativeAction }) => {
    const hana = window.hana;
    const [port, token] = await Promise.all([hana.getServerPort(), hana.getServerToken()]);
    const response = await fetch(`http://127.0.0.1:${port}/api/knowledge-workspace/native/grants`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: nativeAction, address: { sourceKey: 'main', relativePath: targetPath } }),
    });
    const payload = await response.json() as { grant?: { grantId?: string }; code?: string };
    if (!response.ok || typeof payload.grant?.grantId !== 'string') {
      throw new Error(`native grant failed: ${response.status} ${payload.code ?? 'unknown'}`);
    }
    return payload.grant.grantId;
  }, { targetPath: relativePath, nativeAction: action });
}

async function ok(response: Response): Promise<Record<string, any>> {
  // Do not serialize an unexpected response into a Playwright failure. E2E
  // artifacts are deliberately safe to upload even for malicious workspaces.
  expect(response.ok, `Knowledge API returned ${response.status}`).toBe(true);
  return await response.json() as Record<string, any>;
}

async function findFile(root: string, fileName: string): Promise<string> {
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFile(candidate, fileName).catch(() => null);
      if (nested) return nested;
    } else if (entry.name === fileName) {
      return candidate;
    }
  }
  throw new Error(`${fileName} not found below Knowledge index root`);
}

type StandaloneServerInfo = {
  pid: number;
  port: number;
  token: string;
  networkMode: string;
  serverNodeId: string;
  studioId: string;
  userId: string;
};

async function waitForStandaloneServerInfo(
  hanaHome: string,
  child: ChildProcess,
): Promise<StandaloneServerInfo> {
  const infoPath = path.join(hanaHome, 'server-info.json');
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`LAN server exited before readiness (${child.exitCode ?? child.signalCode})`);
    }
    try {
      const value = JSON.parse(await fs.readFile(infoPath, 'utf8')) as Partial<StandaloneServerInfo>;
      if (
        Number.isInteger(value.pid)
        && Number.isInteger(value.port)
        && Number(value.port) > 0
        && typeof value.token === 'string'
        && typeof value.networkMode === 'string'
        && typeof value.serverNodeId === 'string'
        && typeof value.studioId === 'string'
        && typeof value.userId === 'string'
      ) {
        return value as StandaloneServerInfo;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('LAN server did not publish server-info.json');
}

function firstNonLoopbackIpv4(): string {
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const candidate of interfaces ?? []) {
      if (candidate.family === 'IPv4' && !candidate.internal) return candidate.address;
    }
  }
  throw new Error('No non-loopback IPv4 address is available for the LAN E2E');
}

async function stopStandaloneServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise<boolean>(resolve => child.once('exit', () => resolve(true))),
    new Promise<boolean>(resolve => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (exited || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGKILL');
  await new Promise<void>(resolve => child.once('exit', () => resolve()));
}

test('E2E-KW-014 detects schema drift and corruption, serves the ready generation during rebuild, and preserves it on cancellation', async ({ knowledgeApp, workspaceSandbox }) => {
  test.skip(knowledgeApp.runtime !== 'web-open', 'index recovery is a web-open gate');
  await fs.writeFile(path.join(workspaceSandbox.mainSource, 'Indexed.md'), '# Indexed\nindex-recovery-token\n', 'utf8');
  const rebuilt = await ok(await knowledgeApp.apiFetch('/api/knowledge-workspace/index/main/rebuild', { method: 'POST' }));
  expect(rebuilt).toMatchObject({ sourceKey: 'main', health: { state: 'ready' } });
  const status = await ok(await knowledgeApp.apiFetch('/api/knowledge-workspace/index/status?sourceKey=main'));
  expect(status).toMatchObject({ sourceKey: 'main', health: { state: 'ready' } });
  const search = await ok(await knowledgeApp.apiFetch('/api/knowledge-workspace/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'index-recovery-token', limit: 20 }),
  }));
  expect(JSON.stringify(search)).toContain('Indexed.md');

  const firstGeneration = (status.health as { generationId: string }).generationId;
  const indexRoot = path.join(workspaceSandbox.hanaHome, KNOWLEDGE_INDEX_ROOT);
  const currentPath = await findFile(indexRoot, 'current.json');
  let current = JSON.parse(await fs.readFile(currentPath, 'utf8')) as { generationId: string };
  let generationPath = path.join(path.dirname(currentPath), `generation-${current.generationId}.sqlite`);

  const schemaDrift = new Database(generationPath);
  schemaDrift.prepare("UPDATE meta SET value = '999' WHERE key = 'schema_version'").run();
  schemaDrift.pragma('wal_checkpoint(TRUNCATE)');
  schemaDrift.close();
  const stale = await ok(await knowledgeApp.apiFetch('/api/knowledge-workspace/index/status?sourceKey=main'));
  expect(stale).toMatchObject({
    sourceKey: 'main',
    health: { state: 'stale', generationId: firstGeneration, reason: 'schema_version_mismatch' },
  });
  const schemaRecovered = await ok(await knowledgeApp.apiFetch(
    '/api/knowledge-workspace/index/main/rebuild',
    { method: 'POST' },
  ));
  expect(schemaRecovered).toMatchObject({ sourceKey: 'main', health: { state: 'ready' } });
  expect((schemaRecovered.health as { generationId: string }).generationId).not.toBe(firstGeneration);

  const bulkDirectory = path.join(workspaceSandbox.mainSource, 'Bulk');
  await fs.mkdir(bulkDirectory, { recursive: true });
  for (let batch = 0; batch < 10; batch += 1) {
    await Promise.all(Array.from({ length: 100 }, (_, offset) => {
      const ordinal = batch * 100 + offset;
      return fs.writeFile(
        path.join(bulkDirectory, `Page-${String(ordinal).padStart(4, '0')}.md`),
        `# Page ${ordinal}\nbulk-${ordinal}\n`,
        'utf8',
      );
    }));
  }
  const oldReadyGeneration = (schemaRecovered.health as { generationId: string }).generationId;
  const rebuildingResponse = knowledgeApp.apiFetch(
    '/api/knowledge-workspace/index/main/rebuild',
    { method: 'POST' },
  );
  await expect.poll(async () => {
    const building = await ok(await knowledgeApp.apiFetch(
      '/api/knowledge-workspace/index/status?sourceKey=main',
    ));
    return building.health;
  }, { timeout: 30_000, intervals: [10, 20, 50, 100] }).toMatchObject({
    state: 'building',
    generationId: oldReadyGeneration,
  });
  const duringRebuild = await ok(await knowledgeApp.apiFetch('/api/knowledge-workspace/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'index-recovery-token', limit: 20 }),
  }));
  expect(JSON.stringify(duringRebuild)).toContain('Indexed.md');
  const concurrentRecovered = await ok(await rebuildingResponse);
  expect((concurrentRecovered.health as { generationId: string }).generationId)
    .not.toBe(oldReadyGeneration);

  // The watcher may queue one final convergence build while the explicit
  // rebuild is running. Corrupt the active generation only after that
  // provider-owned work has settled, otherwise status correctly remains
  // `building` and serves the previous ready generation.
  await expect.poll(async () => {
    const settled = await ok(await knowledgeApp.apiFetch(
      '/api/knowledge-workspace/index/status?sourceKey=main',
    ));
    return (settled.health as { state?: string }).state;
  }, { timeout: 60_000, intervals: [50, 100, 250, 500] }).toBe('ready');
  current = JSON.parse(await fs.readFile(currentPath, 'utf8')) as { generationId: string };
  generationPath = path.join(path.dirname(currentPath), `generation-${current.generationId}.sqlite`);
  await fs.writeFile(generationPath, Buffer.from('not a sqlite database'));
  const corrupt = await ok(await knowledgeApp.apiFetch('/api/knowledge-workspace/index/status?sourceKey=main'));
  expect(corrupt).toMatchObject({ sourceKey: 'main', health: { state: 'corrupt' } });
  const recovered = await ok(await knowledgeApp.apiFetch('/api/knowledge-workspace/index/main/rebuild', { method: 'POST' }));
  expect(recovered).toMatchObject({ sourceKey: 'main', health: { state: 'ready' } });
  expect((recovered.health as { generationId: string }).generationId).not.toBe(current.generationId);

  const controller = new AbortController();
  controller.abort();
  await expect(knowledgeApp.apiFetch('/api/knowledge-workspace/index/main/rebuild', {
    method: 'POST', signal: controller.signal,
  })).rejects.toMatchObject({ name: 'AbortError' });
  const afterCancel = await ok(await knowledgeApp.apiFetch('/api/knowledge-workspace/index/status?sourceKey=main'));
  expect(afterCancel).toMatchObject({
    sourceKey: 'main',
    health: { state: 'ready', generationId: (recovered.health as { generationId: string }).generationId },
  });
});

test('E2E-KW-015 drives tree keyboard, range, context, sort, preview and explicit reveal', async ({ knowledgeApp, workspaceSandbox }) => {
  test.skip(knowledgeApp.runtime !== 'desktop-full', 'tree interaction is a desktop-full gate');
  await fs.mkdir(path.join(workspaceSandbox.mainSource, 'Deep', 'Inner'), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(workspaceSandbox.mainSource, 'A.md'), '# A\n', 'utf8'),
    fs.writeFile(path.join(workspaceSandbox.mainSource, 'B.txt'), 'B\n', 'utf8'),
    fs.writeFile(path.join(workspaceSandbox.mainSource, 'C.md'), '# C\n', 'utf8'),
    fs.writeFile(path.join(workspaceSandbox.mainSource, 'Deep', 'Inner', 'Located.md'), '# Located\n', 'utf8'),
  ]);
  const workspace = await openKnowledge(knowledgeApp.page);
  await expandMain(workspace);
  const a = workspace.getByRole('treeitem', { name: /A\.md/i });
  const b = workspace.getByRole('treeitem', { name: /B\.txt/i });
  const c = workspace.getByRole('treeitem', { name: /C\.md/i });

  await a.click();
  await expect(workspace.getByRole('tab', { name: /Preview A\.md/i })).toBeVisible();
  await b.click();
  await expect(workspace.getByRole('tab', { name: /Preview B\.txt/i })).toBeVisible();
  await expect(workspace.getByRole('tab', { name: /Preview A\.md/i })).toHaveCount(0);

  await a.click();
  await knowledgeApp.page.keyboard.down('Shift');
  await a.press('ArrowDown');
  await knowledgeApp.page.keyboard.up('Shift');
  await expect(a).toHaveAttribute('aria-selected', 'true');
  await expect(b).toHaveAttribute('aria-selected', 'true');

  await a.click({ button: 'right' });
  await expect(a).toHaveAttribute('aria-selected', 'true');
  await expect(b).toHaveAttribute('aria-selected', 'true');
  await c.click({ button: 'right' });
  await expect(c).toHaveAttribute('aria-selected', 'true');
  await expect(a).toHaveAttribute('aria-selected', 'false');
  await expect(b).toHaveAttribute('aria-selected', 'false');

  await workspace.getByRole('combobox', { name: /Sort/i }).selectOption('extension:descending');
  await expect.poll(() => workspace.locator(
    '[role="treeitem"][data-source-key="main"][aria-level="2"]',
  ).evaluateAll(rows => rows.map(row => row.getAttribute('data-resource-name')))).toEqual([
    'Deep',
    'B.txt',
    'A.md',
    'C.md',
  ]);

  await b.dblclick();
  await expect(workspace.getByRole('tab', { name: 'B.txt', exact: true })).toBeVisible();
  await a.click();
  await expect(workspace.getByRole('tab', { name: /Preview A\.md/i })).toBeVisible();
  await expect(workspace.getByRole('tab', { name: 'B.txt', exact: true })).toBeVisible();

  const deep = workspace.getByRole('treeitem', { name: /Deep/i });
  await deep.getByRole('button', { name: /Expand Deep/i }).click();
  const inner = workspace.getByRole('treeitem', { name: /Inner/i });
  await inner.getByRole('button', { name: /Expand Inner/i }).click();
  const located = workspace.getByRole('treeitem', { name: /Located\.md/i });
  await located.dblclick();
  await expect(workspace.getByRole('tab', { name: 'Located.md', exact: true })).toBeVisible();
  await deep.getByRole('button', { name: /Collapse Deep/i }).click();
  await c.click();
  await workspace.getByRole('tab', { name: 'Located.md', exact: true }).click();

  await expect(deep).toHaveAttribute('aria-expanded', 'false');
  await expect(c).toHaveAttribute('aria-selected', 'true');
  await workspace.getByRole('button', { name: 'Located.md', exact: true }).click();
  await expect(deep).toHaveAttribute('aria-expanded', 'true');
  await expect(inner).toHaveAttribute('aria-expanded', 'true');
  await expect(located).toHaveAttribute('aria-selected', 'true');
  await expect(c).toHaveAttribute('aria-selected', 'false');
});

test('E2E-KW-016 creates Page and folder and reports a name conflict without a partial target', async ({ knowledgeApp }) => {
  test.skip(knowledgeApp.runtime === 'web-full', 'create journey is required for desktop-full and web-open');
  const workspace = await openKnowledge(knowledgeApp.page);
  await workspace.getByRole('button', { name: /New page/i }).click();
  const dialog = knowledgeApp.page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('Created');
  await dialog.getByRole('button', { name: /Create/i }).click();
  await expect(workspace.getByRole('tab', { name: 'Created.md' })).toBeVisible();
  const conflict = await knowledgeApp.apiFetch('/api/knowledge-workspace/resources/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'page', sourceKey: 'main', directoryPath: '', name: 'Created' }),
  });
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toMatchObject({ code: 'knowledge_resource_conflict' });
  await workspace.getByRole('button', { name: /New folder/i }).click();
  await knowledgeApp.page.getByRole('dialog').getByRole('textbox').fill('Folder');
  await knowledgeApp.page.getByRole('dialog').getByRole('button', { name: /Create/i }).click();
  await expandMain(workspace);
  await expect(workspace.getByRole('treeitem', { name: /Folder/i })).toBeVisible();
});

test('E2E-KW-017 imports through the native picker, opens with the default app and degrades on Open', async ({
  knowledgeApp,
  workspaceSandbox,
  installDialogStub,
}) => {
  test.skip(knowledgeApp.runtime === 'web-full', 'native capability is required for desktop-full and web-open');
  const capability = await ok(await knowledgeApp.apiFetch('/api/knowledge-workspace/native/capabilities'));
  expect(capability.filePicker).toBe(knowledgeApp.runtime === 'desktop-full');
  const workspace = await openKnowledge(knowledgeApp.page);
  const importButton = workspace.getByRole('button', { name: /Import/i });
  await expect(importButton).toBeVisible();
  if (knowledgeApp.runtime === 'web-open') {
    await expect(importButton).toBeDisabled();
    await expect(knowledgeApp.page.getByRole('dialog')).toHaveCount(0);
    return;
  }
  await expect(importButton).toBeEnabled();
  const externalFile = path.join(workspaceSandbox.rootDir, 'Picker-import.txt');
  await fs.writeFile(externalFile, 'picker-import-token\n', 'utf8');
  await installDialogStub(knowledgeApp.electronApplication!, { openPaths: [externalFile] });
  await workspace.locator('[role="treeitem"][data-source-key="main"]').first().click();
  await importButton.click();
  await expect.poll(async () => fs.readFile(
    path.join(workspaceSandbox.mainSource, 'Picker-import.txt'),
    'utf8',
  ).catch(() => '')).toBe('picker-import-token\n');

  await openTreeFile(workspace, 'Picker-import.txt');
  await knowledgeApp.electronApplication!.evaluate(({ shell }) => {
    const scope = globalThis as typeof globalThis & {
      __knowledgeOpenDefaultRestore?: typeof shell.openPath;
      __knowledgeOpenedPath?: string;
    };
    scope.__knowledgeOpenDefaultRestore = shell.openPath;
    shell.openPath = async filePath => {
      scope.__knowledgeOpenedPath = filePath;
      return '';
    };
  });
  try {
    await workspace.getByRole('button', { name: /Open with default application/i }).click();
    await expect.poll(() => knowledgeApp.electronApplication!.evaluate(() => (
      (globalThis as typeof globalThis & { __knowledgeOpenedPath?: string }).__knowledgeOpenedPath ?? ''
    ))).toMatch(/Picker-import\.txt$/u);
  } finally {
    await knowledgeApp.electronApplication!.evaluate(({ shell }) => {
      const scope = globalThis as typeof globalThis & {
        __knowledgeOpenDefaultRestore?: typeof shell.openPath;
        __knowledgeOpenedPath?: string;
      };
      if (scope.__knowledgeOpenDefaultRestore) shell.openPath = scope.__knowledgeOpenDefaultRestore;
      delete scope.__knowledgeOpenDefaultRestore;
      delete scope.__knowledgeOpenedPath;
    });
  }
});

test('E2E-KW-018 performs internal copy/paste, system file clipboard import and path-free drag', async ({ knowledgeApp, workspaceSandbox }) => {
  test.skip(knowledgeApp.runtime !== 'desktop-full', 'clipboard and drag are a desktop-full gate');
  await fs.writeFile(path.join(workspaceSandbox.mainSource, 'Drag.md'), '# drag\n', 'utf8');
  const workspace = await openKnowledge(knowledgeApp.page);
  await expandMain(workspace);
  const clipboardFile = path.join(workspaceSandbox.rootDir, 'Clipboard-import.txt');
  await fs.writeFile(clipboardFile, 'system-clipboard-token\n', 'utf8');
  await knowledgeApp.electronApplication!.evaluate(({ clipboard }, filePath) => {
    const scope = globalThis as typeof globalThis & {
      __knowledgeClipboardRestore?: {
        availableFormats: typeof clipboard.availableFormats;
        readBuffer: typeof clipboard.readBuffer;
      };
    };
    scope.__knowledgeClipboardRestore = {
      availableFormats: clipboard.availableFormats,
      readBuffer: clipboard.readBuffer,
    };
    clipboard.availableFormats = () => ['FileNameW'];
    clipboard.readBuffer = format => format === 'FileNameW'
      ? Buffer.from(`${filePath}\0`, 'utf16le')
      : Buffer.alloc(0);
  }, clipboardFile);
  try {
    await workspace.locator('[role="treeitem"][data-source-key="main"]').first().click();
    const systemPaste = workspace.getByRole('button', { name: /^Paste$/i });
    await expect(systemPaste).toBeEnabled();
    await systemPaste.click();
    await expect.poll(async () => fs.readFile(
      path.join(workspaceSandbox.mainSource, 'Clipboard-import.txt'),
      'utf8',
    ).catch(() => '')).toBe('system-clipboard-token\n');
  } finally {
    await knowledgeApp.electronApplication!.evaluate(({ clipboard }) => {
      const scope = globalThis as typeof globalThis & {
        __knowledgeClipboardRestore?: {
          availableFormats: typeof clipboard.availableFormats;
          readBuffer: typeof clipboard.readBuffer;
        };
      };
      const restore = scope.__knowledgeClipboardRestore;
      if (!restore) return;
      clipboard.availableFormats = restore.availableFormats;
      clipboard.readBuffer = restore.readBuffer;
      delete scope.__knowledgeClipboardRestore;
    });
  }

  const row = workspace.getByRole('treeitem', { name: /Drag\.md/i });
  await row.click();
  await workspace.getByRole('button', { name: /^Copy$/i }).click();
  await workspace.locator('[role="treeitem"][data-source-key="main"]').first().click();
  await workspace.getByRole('button', { name: /^Paste$/i }).click();
  await expect.poll(async () => fs.readdir(workspaceSandbox.mainSource)).toContain('Drag_2.md');
  const transferred = await row.evaluate(element => {
    const transfer = new DataTransfer();
    element.dispatchEvent(new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
    }));
    return transfer.getData('application/x-openhanako-knowledge-resources+json');
  });
  expect(transferred).toContain('"relativePath":"Drag.md"');
  expect(transferred).not.toMatch(/\/Users\/|[A-Za-z]:\\/u);
});

test('E2E-KW-019 atomically renames and moves pages while rewriting saved same-source backlinks', async ({ knowledgeApp, workspaceSandbox }) => {
  test.skip(knowledgeApp.runtime === 'web-full', 'refactor journey is required for desktop-full and web-open');
  await fs.mkdir(path.join(workspaceSandbox.mainSource, 'Archive'), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(workspaceSandbox.mainSource, 'Old.md'), '# Old\n', 'utf8'),
    fs.writeFile(path.join(workspaceSandbox.mainSource, 'Ref.md'), '[[Old.md]]\n', 'utf8'),
    fs.writeFile(path.join(workspaceSandbox.mainSource, 'MoveMe.md'), '# Move me\n', 'utf8'),
    fs.writeFile(path.join(workspaceSandbox.mainSource, 'MoveRef.md'), '[[MoveMe.md]]\n', 'utf8'),
  ]);
  await ok(await knowledgeApp.apiFetch('/api/knowledge-workspace/index/main/rebuild', { method: 'POST' }));
  const stat = await ok(await knowledgeApp.apiFetch('/api/resource-io/stat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: { sourceKey: 'main', relativePath: 'Old.md' } }),
  }));
  const planned = await ok(await knowledgeApp.apiFetch('/api/knowledge-workspace/operations/plan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'rename', from: { sourceKey: 'main', relativePath: 'Old.md' }, to: { sourceKey: 'main', relativePath: 'New.md' }, expectedVersion: stat.version }),
  }));
  const plan = planned.plan;
  const committed = await ok(await knowledgeApp.apiFetch(`/api/knowledge-workspace/operations/${plan.operationId}/commit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestHash: plan.requestHash }),
  }));
  expect(committed.result.state).toBe('FINALIZED');
  expect(await fs.readFile(path.join(workspaceSandbox.mainSource, 'Ref.md'), 'utf8')).toContain('[[New.md]]');
  await expect(fs.stat(path.join(workspaceSandbox.mainSource, 'Old.md'))).rejects.toThrow();

  const moveStat = await ok(await knowledgeApp.apiFetch('/api/resource-io/stat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: { sourceKey: 'main', relativePath: 'MoveMe.md' } }),
  }));
  const movePlanned = await ok(await knowledgeApp.apiFetch('/api/knowledge-workspace/operations/plan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'move',
      from: { sourceKey: 'main', relativePath: 'MoveMe.md' },
      to: { sourceKey: 'main', relativePath: 'Archive/MoveMe.md' },
      expectedVersion: moveStat.version,
    }),
  }));
  const movePlan = movePlanned.plan;
  const moveCommitted = await ok(await knowledgeApp.apiFetch(
    `/api/knowledge-workspace/operations/${movePlan.operationId}/commit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestHash: movePlan.requestHash }),
    },
  ));
  expect(moveCommitted.result.state).toBe('FINALIZED');
  expect(await fs.readFile(path.join(workspaceSandbox.mainSource, 'MoveRef.md'), 'utf8'))
    .toContain('[[Archive/MoveMe.md]]');
  expect(await fs.readFile(path.join(workspaceSandbox.mainSource, 'Archive', 'MoveMe.md'), 'utf8'))
    .toBe('# Move me\n');
  await expect(fs.stat(path.join(workspaceSandbox.mainSource, 'MoveMe.md'))).rejects.toThrow();
});

test('E2E-KW-020 restores with a conflict suffix and retains failed or unexpired system-trash entries', async ({ knowledgeApp, workspaceSandbox }) => {
  test.skip(knowledgeApp.runtime !== 'desktop-full', 'trash journey is a desktop-full gate');
  await fs.writeFile(path.join(workspaceSandbox.mainSource, 'TrashMe.md'), '# trash\n', 'utf8');
  const trashed = await ok(await knowledgeApp.apiFetch('/api/knowledge-workspace/trash', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addresses: [{ sourceKey: 'main', relativePath: 'TrashMe.md' }] }),
  }));
  expect(trashed.result.items).toEqual([expect.objectContaining({ ok: true })]);
  await expect(fs.stat(path.join(workspaceSandbox.mainSource, 'TrashMe.md'))).rejects.toThrow();
  const listed = await ok(await knowledgeApp.apiFetch('/api/knowledge-workspace/trash/main'));
  const batch = listed.batches.find((candidate: any) => candidate.batchId === trashed.result.batchId);
  const entry = batch.entries.find((candidate: any) => candidate.state === 'trashed');
  await fs.writeFile(path.join(workspaceSandbox.mainSource, 'TrashMe.md'), '# occupied\n', 'utf8');
  const restored = await ok(await knowledgeApp.apiFetch(`/api/knowledge-workspace/trash/main/${batch.batchId}/restore`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entryIds: [entry.entryId] }),
  }));
  expect(restored.results).toEqual([expect.objectContaining({
    ok: true,
    restoredAddress: { sourceKey: 'main', relativePath: 'TrashMe_2.md' },
  })]);
  expect(await fs.readFile(path.join(workspaceSandbox.mainSource, 'TrashMe.md'), 'utf8')).toBe('# occupied\n');
  expect(await fs.readFile(path.join(workspaceSandbox.mainSource, 'TrashMe_2.md'), 'utf8')).toBe('# trash\n');

  await fs.writeFile(path.join(workspaceSandbox.mainSource, 'Retained.md'), '# retained\n', 'utf8');
  const retained = await ok(await knowledgeApp.apiFetch('/api/knowledge-workspace/trash', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addresses: [{ sourceKey: 'main', relativePath: 'Retained.md' }] }),
  }));
  const retainedList = await ok(await knowledgeApp.apiFetch('/api/knowledge-workspace/trash/main'));
  const retainedBatch = retainedList.batches.find((candidate: any) => candidate.batchId === retained.result.batchId);
  const retainedEntry = retainedBatch.entries.find((candidate: any) => candidate.state === 'trashed');
  const retainedPayload = path.join(workspaceSandbox.mainSource, ...retainedEntry.trashAddress.relativePath.split('/'));
  const failedGrant = await createNativeGrantFromRenderer(
    knowledgeApp.page,
    retainedEntry.trashAddress.relativePath,
    'systemTrash',
  );
  await knowledgeApp.electronApplication!.evaluate(({ shell }) => {
    const scope = globalThis as typeof globalThis & { __knowledgeTrashOriginal?: typeof shell.trashItem };
    scope.__knowledgeTrashOriginal = shell.trashItem;
    shell.trashItem = async () => { throw new Error('injected system trash failure'); };
  });
  try {
    const failed = await knowledgeApp.page.evaluate(
      id => window.hana.knowledgeNativeInvoke({ action: 'systemTrash', grantId: id }),
      failedGrant,
    );
    expect(failed).toMatchObject({ ok: false, code: 'knowledge_resource_unavailable' });
    expect(await fs.readFile(retainedPayload, 'utf8')).toBe('# retained\n');
    const afterFailure = await ok(await knowledgeApp.apiFetch('/api/knowledge-workspace/trash/main'));
    expect(afterFailure.batches.find((candidate: any) => candidate.batchId === retained.result.batchId))
      .toEqual(expect.objectContaining({ entries: [expect.objectContaining({
        state: 'trashed', errorCode: 'knowledge_resource_unavailable',
      })] }));
  } finally {
    await knowledgeApp.electronApplication!.evaluate(({ shell }) => {
      const scope = globalThis as typeof globalThis & { __knowledgeTrashOriginal?: typeof shell.trashItem };
      if (scope.__knowledgeTrashOriginal) shell.trashItem = scope.__knowledgeTrashOriginal;
      delete scope.__knowledgeTrashOriginal;
    });
  }

  await fs.writeFile(path.join(workspaceSandbox.mainSource, 'Expired.md'), '# expired\n', 'utf8');
  const expired = await ok(await knowledgeApp.apiFetch('/api/knowledge-workspace/trash', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addresses: [{ sourceKey: 'main', relativePath: 'Expired.md' }] }),
  }));
  const manifestPath = path.join(workspaceSandbox.mainSource, '.trash', expired.result.batchId, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.deletedAt = '2026-06-01T00:00:00.000Z';
  for (const candidate of manifest.entries) candidate.deletedAt = '2026-06-01T00:00:00.000Z';
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const workspace = await openKnowledge(knowledgeApp.page);
  await workspace.getByRole('button', { name: /Workspace trash/i }).click();
  const trashView = knowledgeApp.page.getByRole('complementary', { name: /Workspace trash/i });
  await expect(trashView.getByText('Expired.md')).toBeVisible();
  await knowledgeApp.electronApplication!.evaluate(({ shell }) => {
    const scope = globalThis as typeof globalThis & {
      __knowledgeTrashOriginal?: typeof shell.trashItem;
      __knowledgeTrashedPath?: string;
    };
    scope.__knowledgeTrashOriginal = shell.trashItem;
    shell.trashItem = async filePath => {
      scope.__knowledgeTrashedPath = filePath;
    };
  });
  try {
    await trashView.getByRole('button', { name: /Clean up items older than 30 days/i }).click();
    const confirm = knowledgeApp.page.getByRole('dialog', { name: /Move to system trash/i });
    await expect(confirm.getByRole('button', { name: /^Cancel$/i })).toBeFocused();
    await confirm.getByRole('button', { name: /^System trash$/i }).click();
    await expect(trashView.getByText('Expired.md')).toHaveCount(0);
    const trashedPath = await knowledgeApp.electronApplication!.evaluate(() => (
      (globalThis as typeof globalThis & { __knowledgeTrashedPath?: string }).__knowledgeTrashedPath ?? ''
    ));
    expect(trashedPath).toMatch(/Expired\.md$/u);
    await fs.rm(trashedPath, { force: true, recursive: true });
  } finally {
    await knowledgeApp.electronApplication!.evaluate(({ shell }) => {
      const scope = globalThis as typeof globalThis & {
        __knowledgeTrashOriginal?: typeof shell.trashItem;
        __knowledgeTrashedPath?: string;
      };
      if (scope.__knowledgeTrashOriginal) shell.trashItem = scope.__knowledgeTrashOriginal;
      delete scope.__knowledgeTrashOriginal;
      delete scope.__knowledgeTrashedPath;
    });
  }
});

test('E2E-KW-021 keeps real LAN/Mobile requests path-free and fails closed on transport, scope and owner', async ({ knowledgeApp }, testInfo) => {
  test.skip(knowledgeApp.runtime !== 'web-open', 'LAN/Mobile contract is a web-open gate');
  const sources = await ok(await knowledgeApp.apiFetch('/api/knowledge-workspace/sources'));
  expect(JSON.stringify(sources)).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\|scopeToken|nativeBridgeToken/u);
  const consume = await knowledgeApp.apiFetch('/api/knowledge-workspace/native/consume', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reveal', grantId: '00000000-0000-4000-8000-000000000051' }),
  });
  expect(consume.status).toBe(403);
  expect(JSON.stringify(await consume.json())).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\/u);

  const lanSandbox = await createKnowledgeWorkspaceSandbox(testInfo.workerIndex + 10_000);
  let lanServer: ChildProcess | null = null;
  try {
    await fs.writeFile(path.join(lanSandbox.mainSource, 'Lan-owned.md'), '# LAN\n', 'utf8');
    saveServerNetworkConfig(lanSandbox.hanaHome, {
      mode: 'lan',
      listenHost: '0.0.0.0',
      listenPort: 14500,
      customRemote: { enabled: false, baseUrl: null, wsUrl: null },
    });
    const launch = createKnowledgeLaunchConfig(lanSandbox);
    lanServer = spawn(process.execPath, [path.resolve('server/bootstrap.ts')], {
      cwd: process.cwd(),
      env: {
        ...launch.env,
        HANA_SERVER_ENTRY: path.resolve('server/main-open.ts'),
        HANA_RENDERER_DIST: path.resolve('desktop/dist-renderer'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const serverInfo = await waitForStandaloneServerInfo(lanSandbox.hanaHome, lanServer);
    expect(serverInfo.networkMode).toBe('lan');
    const lanHost = firstNonLoopbackIpv4();
    const baseUrl = `http://${lanHost}:${serverInfo.port}`;
    const issue = (scopes: string[]) => createDeviceCredential(lanSandbox.hanaHome, {
      serverNodeId: serverInfo.serverNodeId,
      userId: serverInfo.userId,
      studioIds: [serverInfo.studioId],
      displayName: `Knowledge E2E LAN ${scopes.join('-')}`,
      deviceKind: 'mobile',
      trustState: 'lan',
      scopes,
    });
    const ownerA = issue(['files.read', 'files.write']);
    const ownerB = issue(['files.read', 'files.write']);
    const reader = issue(['files.read']);
    const lanFetch = (secret: string, pathname: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${secret}`);
      return fetch(`${baseUrl}${pathname}`, { ...init, headers });
    };

    const lanSourcesResponse = await lanFetch(ownerA.secret, '/api/knowledge-workspace/sources');
    expect(lanSourcesResponse.status).toBe(200);
    const lanSources = await lanSourcesResponse.json();
    expect(JSON.stringify(lanSources)).not.toMatch(
      /\/Users\/|\/home\/|[A-Za-z]:\\|rootLocator|scopeToken|nativeBridgeToken/u,
    );

    const stolenLoopback = await lanFetch(serverInfo.token, '/api/knowledge-workspace/sources');
    expect(stolenLoopback.status).toBe(403);
    expect(await stolenLoopback.json()).toMatchObject({
      error: 'forbidden',
      reason: 'loopback_token_requires_local_transport',
    });
    const nativeFromLan = await lanFetch(ownerA.secret, '/api/knowledge-workspace/native/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hana-Native-Bridge': 'a'.repeat(43) },
      body: JSON.stringify({
        action: 'reveal',
        grantId: '00000000-0000-4000-8000-000000000051',
      }),
    });
    expect(nativeFromLan.status).toBe(403);

    const deniedByScope = await lanFetch(reader.secret, '/api/knowledge-workspace/operations/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'rename',
        from: { sourceKey: 'main', relativePath: 'Lan-owned.md' },
        to: { sourceKey: 'main', relativePath: 'Lan-renamed.md' },
        expectedVersion: { sequence: 1 },
      }),
    });
    expect(deniedByScope.status).toBe(403);
    expect(await deniedByScope.json()).toMatchObject({ error: 'insufficient_scope' });

    const stat = await lanFetch(ownerA.secret, '/api/resource-io/stat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: { sourceKey: 'main', relativePath: 'Lan-owned.md' } }),
    });
    expect(stat.status).toBe(200);
    const statBody = await stat.json() as { version: unknown };
    const planned = await lanFetch(ownerA.secret, '/api/knowledge-workspace/operations/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'rename',
        from: { sourceKey: 'main', relativePath: 'Lan-owned.md' },
        to: { sourceKey: 'main', relativePath: 'Lan-renamed.md' },
        expectedVersion: statBody.version,
      }),
    });
    expect(planned.status).toBe(201);
    const plannedBody = await planned.json() as { plan: { operationId: string } };
    const ownerTakeover = await lanFetch(
      ownerB.secret,
      `/api/knowledge-workspace/operations/${plannedBody.plan.operationId}`,
    );
    expect(ownerTakeover.status).toBe(403);
    expect(await ownerTakeover.json()).toMatchObject({ code: 'knowledge_resource_out_of_scope' });
  } finally {
    if (lanServer) await stopStandaloneServer(lanServer);
    await lanSandbox.dispose();
  }
});

test('E2E-KW-022 rejects platform link escapes, URI traversal, active HTML and oversized Markdown', async ({ knowledgeApp, workspaceSandbox }) => {
  test.skip(knowledgeApp.runtime !== 'web-open', 'malicious workspace is exercised once per available platform in web-open');
  const outsideDirectory = path.join(workspaceSandbox.rootDir, 'outside');
  await fs.mkdir(outsideDirectory);
  const outside = path.join(outsideDirectory, 'outside-secret.md');
  await fs.writeFile(outside, 'outside-secret-token\n', 'utf8');
  const escapedRelativePath = process.platform === 'win32' ? 'escape-dir/outside-secret.md' : 'escape.md';
  const escapedLinkPath = path.join(
    workspaceSandbox.mainSource,
    process.platform === 'win32' ? 'escape-dir' : 'escape.md',
  );
  if (process.platform === 'win32') {
    await fs.symlink(outsideDirectory, escapedLinkPath, 'junction');
  } else {
    await fs.symlink(outside, escapedLinkPath);
  }
  const response = await knowledgeApp.apiFetch('/api/resource-io/read', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: { sourceKey: 'main', relativePath: escapedRelativePath }, encoding: 'utf-8' }),
  });
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(
    JSON.stringify(await response.json()).includes('outside-secret'),
    'a symlink denial must not echo source-external content',
  ).toBe(false);
  // Keep the verified platform link isolated to its escape assertion. The
  // following UI check exercises active-content handling, not rendering a
  // deliberately blocked entry. On Windows an existing junction can also
  // keep native directory enumeration pending after the guarded read closes.
  await fs.unlink(escapedLinkPath);

  for (const relativePath of ['../outside/outside-secret.md', 'file:///outside-secret.md', '%2e%2e/outside-secret.md']) {
    const traversal = await knowledgeApp.apiFetch('/api/resource-io/read', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: { sourceKey: 'main', relativePath }, encoding: 'utf-8' }),
    });
    expect(traversal.status, relativePath).toBeGreaterThanOrEqual(400);
    expect(
      JSON.stringify(await traversal.json()).includes('outside-secret-token'),
      'a traversal denial must not echo source-external content',
    ).toBe(false);
  }

  // Exercise active-content and oversized-document handling while the source
  // is stable. The independent TOCTOU attack below deliberately makes this
  // source transiently unavailable, so it must not also determine whether
  // the UI policy checks can find the otherwise authorized root.
  await fs.writeFile(
    path.join(workspaceSandbox.mainSource, 'Unsafe.md'),
    '# Unsafe\n<script>window.__knowledgeUnsafe=1</script>\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(workspaceSandbox.mainSource, 'TooLarge.md'),
    Buffer.alloc(10 * 1024 * 1024 + 1, 0x78),
  );
  const workspace = await openKnowledge(knowledgeApp.page);
  await openTreeFile(workspace, 'Unsafe.md');
  expect(await knowledgeApp.page.evaluate(() => (window as Window & { __knowledgeUnsafe?: number }).__knowledgeUnsafe)).toBeUndefined();
  await openTreeFile(workspace, 'TooLarge.md');
  await expect(workspace.locator('[aria-label="Edit TooLarge.md"]')).toHaveCount(0);

  const racedName = 'Raced.md';
  const raceCurrent = path.join(workspaceSandbox.mainSource, 'race-current');
  const raceHolding = path.join(workspaceSandbox.mainSource, 'race-holding');
  await fs.mkdir(raceCurrent);
  await fs.writeFile(path.join(raceCurrent, racedName), 'inside-race-token\n', 'utf8');
  await fs.writeFile(path.join(outsideDirectory, racedName), 'outside-race-secret-token\n', 'utf8');
  let keepRacing = true;
  let swapCount = 0;
  const attacker = (async () => {
    while (keepRacing) {
      // Replace the exact parent in place. Keeping the holding directory out
      // of the swap avoids a platform-dependent rename-over-junction window
      // (which can leave the test's attacker, rather than the provider, with
      // an ENOENT on Linux/Windows).
      let holding = false;
      let linked = false;
      try {
        await fs.rename(raceCurrent, raceHolding);
        holding = true;
        await fs.symlink(
          outsideDirectory,
          raceCurrent,
          process.platform === 'win32' ? 'junction' : 'dir',
        );
        linked = true;
        await fs.unlink(raceCurrent);
        linked = false;
        await fs.rename(raceHolding, raceCurrent);
        holding = false;
        swapCount += 1;
        // Keep replacing this exact parent throughout every guarded read, but
        // give the independently hosted server a scheduling turn after a real
        // replacement. An unbounded successful fs loop can otherwise starve
        // its watcher/revalidation work on a shared Linux CI CPU and turn the
        // test harness itself into a connection-reset source.
        await new Promise((resolve) => setTimeout(resolve, 1));
      } catch (error) {
        // Windows can briefly hold a directory while a guarded read closes.
        // Restore the in-root parent before retrying; only a completed actual
        // junction/symlink replacement increments swapCount.
        if (linked) await fs.unlink(raceCurrent).catch(() => {});
        if (holding) await fs.rename(raceHolding, raceCurrent).catch(() => {});
        const code = (error as NodeJS.ErrnoException).code;
        if (!['EBUSY', 'EEXIST', 'ENOENT', 'ENOTEMPTY', 'EPERM'].includes(code ?? '')) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  })();
  let completedReadCount = 0;
  try {
    for (let batch = 0; batch < 12; batch += 1) {
      const reads = await Promise.all(Array.from({ length: 4 }, () => (
        knowledgeApp.apiFetch('/api/resource-io/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: { sourceKey: 'main', relativePath: `race-current/${racedName}` },
            encoding: 'utf-8',
          }),
        })
      )));
      for (const read of reads) {
        const body = await read.json();
        expect(
          JSON.stringify(body).includes('outside-race-secret-token'),
          'a raced read must never return source-external content',
        ).toBe(false);
        if (read.ok) {
          expect(JSON.stringify(body)).toContain('inside-race-token');
        } else {
          // A read that loses the identity/scope race must fail closed. It
          // may never surface as a server error, which could conceal a
          // provider failure rather than a deliberate authorization denial.
          const errorCode = typeof (body as { code?: unknown })?.code === 'string'
            ? (body as { code: string }).code
            : 'missing_error_code';
          expect(read.status, `raced read error code: ${errorCode}`).toBeGreaterThanOrEqual(400);
          expect(read.status, `raced read error code: ${errorCode}`).toBeLessThan(500);
        }
        completedReadCount += 1;
      }
    }
  } finally {
    keepRacing = false;
    await attacker;
  }
  expect(swapCount).toBeGreaterThan(0);
  // Completion can race either side of a real parent replacement. A stable
  // provider is permitted to return authorized in-root bytes for every
  // request when it acquires each proof before a swap; forcing at least one
  // rejection would turn that safe outcome into a scheduler-dependent test.
  // The invariant is exhaustive: every completed response is authorized
  // content or a sanitized 4xx denial, never a source-external body or 5xx.
  expect(completedReadCount).toBe(48);
});

test('E2E-KW-024 isolates two Renderer contexts across open, save, conflict and native grants', async ({ knowledgeApp, workspaceSandbox }) => {
  test.skip(knowledgeApp.runtime !== 'desktop-full' || !knowledgeApp.electronApplication, 'multi-context gate is desktop-full');
  const app = knowledgeApp.electronApplication!;
  const sharedFile = path.join(workspaceSandbox.mainSource, 'TwoWindows.md');
  await fs.writeFile(sharedFile, '# Shared baseline\n', 'utf8');
  const secondPagePromise = app.waitForEvent('window');
  const secondWindowId = await app.evaluate(async ({ BrowserWindow }, preloadPath) => {
    const first = BrowserWindow.getAllWindows().find(window => /index\.html/u.test(window.webContents.getURL()));
    if (!first) throw new Error('main renderer unavailable');
    const second = new BrowserWindow({ show: false, webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    } });
    await second.loadURL(first.webContents.getURL());
    return second.id;
  }, path.resolve('desktop/preload.bundle.cjs'));
  const secondPage = await secondPagePromise;
  const [firstWorkspace, secondWorkspace] = await Promise.all([
    openKnowledge(knowledgeApp.page),
    openKnowledge(secondPage),
  ]);
  await expect(firstWorkspace).toBeVisible();
  await expect(secondWorkspace).toBeVisible();
  expect(app.windows().length).toBeGreaterThanOrEqual(2);

  await Promise.all([
    openTreeFile(firstWorkspace, 'TwoWindows.md'),
    openTreeFile(secondWorkspace, 'TwoWindows.md'),
  ]);
  const firstEditor = knowledgeApp.page.locator('[aria-label="Edit TwoWindows.md"] .cm-content');
  const secondEditor = secondPage.locator('[aria-label="Edit TwoWindows.md"] .cm-content');
  await firstEditor.click();
  await firstEditor.press('End');
  await knowledgeApp.page.keyboard.insertText('\nfirst-window-save');
  await secondEditor.click();
  await secondEditor.press('End');
  await secondPage.keyboard.insertText('\nsecond-window-dirty');
  await firstEditor.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
  await expect(knowledgeApp.page.locator('[aria-label="Edit TwoWindows.md"]')).toHaveAttribute('data-dirty', 'false');
  await expect(secondPage.locator('[data-knowledge-conflict]')).toBeVisible({ timeout: 15_000 });
  await secondPage.locator('[data-knowledge-conflict]').getByRole('button', { name: /Use disk/i }).click();
  await expect(secondPage.locator('[data-knowledge-conflict]')).toHaveCount(0);
  expect(await fs.readFile(sharedFile, 'utf8')).toContain('first-window-save');
  expect(await fs.readFile(sharedFile, 'utf8')).not.toContain('second-window-dirty');

  const grantId = await createNativeGrantFromRenderer(knowledgeApp.page, 'TwoWindows.md');
  await app.evaluate(({ shell }) => {
    const scope = globalThis as typeof globalThis & { __knowledgeRevealOriginal?: typeof shell.showItemInFolder };
    scope.__knowledgeRevealOriginal = shell.showItemInFolder;
    shell.showItemInFolder = () => {};
  });
  try {
    const rejected = await secondPage.evaluate((id) => window.hana.knowledgeNativeInvoke({ action: 'reveal', grantId: id }), grantId);
    expect(rejected).toMatchObject({ ok: false, code: 'knowledge_operation_precondition_failed' });
    const accepted = await knowledgeApp.page.evaluate((id) => window.hana.knowledgeNativeInvoke({ action: 'reveal', grantId: id }), grantId);
    expect(accepted).toMatchObject({ ok: true, result: { action: 'reveal', completed: true } });
    const replayed = await knowledgeApp.page.evaluate((id) => window.hana.knowledgeNativeInvoke({ action: 'reveal', grantId: id }), grantId);
    expect(replayed).toMatchObject({ ok: false, code: 'knowledge_operation_precondition_failed' });
  } finally {
    await app.evaluate(({ shell }) => {
      const scope = globalThis as typeof globalThis & { __knowledgeRevealOriginal?: typeof shell.showItemInFolder };
      if (scope.__knowledgeRevealOriginal) shell.showItemInFolder = scope.__knowledgeRevealOriginal;
      delete scope.__knowledgeRevealOriginal;
    });
    const secondPageClosed = secondPage.waitForEvent('close');
    await app.evaluate(({ BrowserWindow }, windowId) => {
      BrowserWindow.fromId(windowId)?.close();
    }, secondWindowId);
    await secondPageClosed;
  }
});
