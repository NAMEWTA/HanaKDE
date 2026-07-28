import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES = ['zh', 'zh-TW', 'en', 'ja', 'ko'] as const;
const REQUIRED_KEYS = [
  'tab',
  'workspaceLabel',
  'sources.heading',
  'source.main',
  'sources.loading',
  'sources.error',
  'retry',
  'tree.heading',
  'tree.empty',
  'editor.groupLabel',
  'editor.emptyTitle',
  'editor.emptyDescription',
  'editor.splitHorizontal',
  'editor.splitVertical',
  'tabs.label',
  'tabs.preview',
  'tabs.close',
  'tabs.openSide',
  'breadcrumb.label',
  'conflict.resolverLabel',
  'conflict.label',
  'conflict.title',
  'conflict.description',
  'conflict.baseline',
  'conflict.local',
  'conflict.disk',
  'conflict.merged',
  'conflict.baselineLabel',
  'conflict.localLabel',
  'conflict.diskLabel',
  'conflict.mergedLabel',
  'conflict.mergeAndSave',
  'conflict.useLocal',
  'conflict.useDisk',
  'conflict.refreshError',
] as const;

function nestedString(
  value: unknown,
  dottedPath: string,
): string | undefined {
  let current = value;
  for (const segment of ['knowledge', ...dottedPath.split('.')]) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' ? current : undefined;
}

describe('knowledge shell i18n, accessibility and visual contract', () => {
  it('ships every shell string in all five supported locales', () => {
    for (const locale of LOCALES) {
      const file = path.resolve(`desktop/src/locales/${locale}.json`);
      const messages = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
      for (const key of REQUIRED_KEYS) {
        expect(
          nestedString(messages, key),
          `${locale}:knowledge.${key}`,
        ).toEqual(expect.stringMatching(/\S/u));
      }
    }
  });

  it('keeps semantic landmarks, visible keyboard focus and theme-responsive narrow layouts', () => {
    const layoutSource = fs.readFileSync(
      path.resolve(
        'desktop/src/react/components/knowledge-workspace/KnowledgeLayout.tsx',
      ),
      'utf8',
    );
    const cssSource = fs.readFileSync(
      path.resolve(
        'desktop/src/react/components/knowledge-workspace/KnowledgeWorkspace.module.css',
      ),
      'utf8',
    );
    const editorGroupsSource = fs.readFileSync(
      path.resolve(
        'desktop/src/react/components/knowledge-workspace/KnowledgeEditorGroups.tsx',
      ),
      'utf8',
    );

    expect(layoutSource).toMatch(/role="tree"/);
    expect(layoutSource).toMatch(/aria-(?:label|labelledby)=/);
    expect(editorGroupsSource).toMatch(/role="group"/);
    expect(editorGroupsSource).toMatch(/tabIndex=\{0\}/);
    expect(editorGroupsSource).toMatch(/<KnowledgeTabBar/);
    expect(cssSource).toMatch(/:focus-visible/);
    expect(cssSource).toMatch(/var\(--(?:bg|text|border|accent)/);
    expect(cssSource.match(/@media\s*\(max-width:/g)).toHaveLength(2);
    expect(cssSource).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
