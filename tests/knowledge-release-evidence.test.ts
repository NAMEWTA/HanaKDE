import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveOpenHanakoKnowledgeArtifacts } from './helpers/openhanako-knowledge-artifacts.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHANGE = resolveOpenHanakoKnowledgeArtifacts(ROOT);

const RETIRED_DUPLICATE_KNOWLEDGE_TESTS = new Set([
  'desktop/src/react/__tests__/components/CreateResourceDialog.test.tsx',
  'desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx',
  'desktop/src/react/__tests__/components/KnowledgeConflictResolver.test.tsx',
  'desktop/src/react/__tests__/components/KnowledgeCurrentResourceViews.test.tsx',
  'desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx',
  'desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx',
  'desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx',
  'desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx',
  'desktop/src/react/__tests__/components/KnowledgeResourceTree.keyboard.test.tsx',
  'desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx',
  'desktop/src/react/__tests__/components/KnowledgeResourceTree.test.tsx',
  'desktop/src/react/__tests__/components/KnowledgeSearch.test.tsx',
  'desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx',
  'desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx',
  'desktop/src/react/__tests__/components/knowledge-drag-controller.test.ts',
]);

function read(relativePath: string): string {
  return fs.readFileSync(path.join(CHANGE, relativePath), 'utf8');
}

function numberedIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => (
    `${prefix}${String(index + 1).padStart(3, '0')}`
  ));
}

describe('knowledge workspace release evidence', () => {
  it('assigns all 193 stories to one non-release primary owner and real tests', () => {
    const rows = read('requirements-traceability.md')
      .split('\n')
      .filter(line => /^\| KW-US-\d{3} \|/u.test(line));
    expect(rows.map(row => row.split('|')[1].trim()))
      .toEqual(numberedIds('KW-US-', 193));

    const observedRetiredTests = new Set<string>();
    for (const row of rows) {
      const columns = row.split('|').map(column => column.trim());
      expect(columns[3]).toMatch(/^(?:0[1-9]|[1-4]\d|5[0-6])$/u);
      expect(columns[3]).not.toBe('57');
      const testPaths = [...columns[5].matchAll(/`([^`]+)`/gu)]
        .map(match => match[1]);
      expect(testPaths.length, row).toBeGreaterThan(0);
      for (const testPath of testPaths) {
        if (fs.existsSync(path.join(ROOT, testPath))) continue;
        expect(RETIRED_DUPLICATE_KNOWLEDGE_TESTS.has(testPath), testPath).toBe(true);
        observedRetiredTests.add(testPath);
      }
    }
    expect(observedRetiredTests).toEqual(RETIRED_DUPLICATE_KNOWLEDGE_TESTS);
  });

  it('keeps the 57-ticket map complete and its links resolvable', () => {
    const rows = read('tickets-map.md')
      .split('\n')
      .filter(line => /^\| \d{2} \|/u.test(line));
    expect(rows.map(row => row.split('|')[1].trim()))
      .toEqual(Array.from({ length: 57 }, (_, index) => String(index + 1).padStart(2, '0')));
    for (const row of rows) {
      const link = row.match(/\]\(\.\/(ticket\/[^)]+)\)/u)?.[1];
      expect(link, row).toBeTruthy();
      expect(fs.existsSync(path.join(CHANGE, link!)), link).toBe(true);
    }
  });

  it('keeps archived E2E stories historical and runs the shared workbench gates', () => {
    const specsRoot = path.join(ROOT, 'tests/knowledge-workspace-e2e/specs');
    const content = fs.readdirSync(specsRoot)
      .filter(file => file.endsWith('.spec.ts'))
      .map(file => fs.readFileSync(path.join(specsRoot, file), 'utf8'))
      .join('\n');
    for (const id of numberedIds('E2E-KW-', 24)) {
      expect(content, id).not.toMatch(new RegExp(`test\\(['"]${id}\\b`, 'u'));
    }
    expect(content).toMatch(/test\(['"]E2E-KW-025\b/u);
    expect(content).toMatch(/test\(['"]E2E-KW-026\b/u);
    expect(content).toContain('[data-desk-tree]');
    expect(content).toContain(".cm-content[contenteditable=\"true\"]");
  });

  it('runs every Knowledge Workspace project on the three release operating systems', () => {
    const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain('knowledge-workspace-e2e:');
    expect(workflow).toMatch(/os: \[ubuntu-latest, macos-latest, windows-latest\]/u);
    expect(workflow).toMatch(/project: \[desktop-full, web-open, web-full\]/u);
    expect(workflow).toContain('-c tests/knowledge-workspace-e2e/playwright.config.ts');
  });

  it('keeps the reference runner wired to all real product adapters', () => {
    const runner = fs.readFileSync(path.join(ROOT, 'scripts/run-knowledge-performance-reference.ts'), 'utf8');
    const adapters = fs.readFileSync(
      path.join(ROOT, 'tests/fixtures/knowledge-workspace/product-performance-adapters.ts'),
      'utf8',
    );
    expect(runner).toContain('createKnowledgeProductPerformanceAdapters');
    expect(runner).toContain('gitCommitForCleanWorktree()');
    for (const scenario of [
      'initialTree10k',
      'hugeTree100k',
      'markdown10MiB',
      'denseWikilinks50k',
      'watcherBurst5k',
      'searchWarmTrigram',
      'searchWarmShort',
      'searchColdOpen',
      'multiView100Tabs',
      'fullRebuild100k',
      'generationSwitch',
      'operationRecovery1k',
    ]) {
      expect(adapters, scenario).toContain(`${scenario}:`);
    }
  });

  it('keeps release evidence rows exhaustive and Ticket 57 ownerless', () => {
    const evidence = read('release-evidence.md');
    const storyIds = evidence.split('\n')
      .filter(line => /^\| KW-US-\d{3} \|/u.test(line))
      .map(row => row.split('|')[1].trim());
    expect(storyIds).toEqual(numberedIds('KW-US-', 193));
    const e2eIds = evidence.split('\n')
      .filter(line => /^\| E2E-KW-\d{3} \|/u.test(line))
      .map(row => row.split('|')[1].trim());
    expect(e2eIds).toEqual(numberedIds('E2E-KW-', 24));
    expect(read('ticket/57-release-knowledge-workspace.md'))
      .toContain('**Primary ownership：** 无直接用户故事');
  });
});
