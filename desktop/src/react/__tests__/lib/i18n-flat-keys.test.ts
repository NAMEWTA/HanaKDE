/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import zh from '../../../locales/zh.json';

describe('renderer i18n flat dotted keys', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'i18n');
    Reflect.deleteProperty(window, 't');
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('resolves exact flat dotted keys before nested dot-path fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      'preview.markdownPreview': '预览',
      preview: { markdownPreview: 'nested preview' },
      common: { screenshot: '截图' },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));

    // @ts-expect-error i18n.js is a browser side-effect script without module declarations.
    await import('../../../lib/i18n.js');
    await window.i18n.load('zh-CN');

    expect(window.t('preview.markdownPreview')).toBe('预览');
    expect(window.t('common.screenshot')).toBe('截图');
  });

  it('loads the Knowledge explorer strings from the shipped Chinese catalog', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(zh), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));

    // @ts-expect-error i18n.js is a browser side-effect script without module declarations.
    await import('../../../lib/i18n.js');
    await window.i18n.load('zh-CN');

    expect(window.t('knowledge.search.placeholder')).toBe('搜索所有已保存知识…');
    expect(window.t('knowledge.sources.error')).toBe('无法加载内容来源');
    expect(window.t('knowledge.tree.empty')).toBe('暂无已展开资源');
    expect(window.t('knowledge.editor.emptyTitle')).toBe('打开一个资源');
  });
});
