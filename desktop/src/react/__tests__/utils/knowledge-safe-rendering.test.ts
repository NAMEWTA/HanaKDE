/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import {
  collectKnowledgeRawHtmlElements,
  prepareKnowledgeSafeHtml,
  resolveKnowledgeAssetReference,
  resolveKnowledgeSafeLink,
} from '../../utils/knowledge-safe-rendering';

const page = {
  sourceKey: 'notes',
  relativePath: 'Guides/Start.md',
} as const;

describe('knowledge safe rendering', () => {
  it('uses shared-IR HTML boundaries and ignores lookalikes in source-only syntax', () => {
    const source = [
      'before <mark>safe</mark> after',
      '<details>',
      '<summary>Title</summary>',
      '',
      '**body**',
      '</details>',
      '',
      '`<img src="hidden.png">`',
      '```html',
      '<script>hidden()</script>',
      '```',
    ].join('\n');

    expect(collectKnowledgeRawHtmlElements(source).map(element => ({
      source: element.source,
      block: element.block,
    }))).toEqual([
      { source: '<mark>safe</mark>', block: false },
      {
        source: [
          '<details>',
          '<summary>Title</summary>',
          '',
          '**body**',
          '</details>',
        ].join('\n'),
        block: true,
      },
    ]);
  });

  it('renders allowlisted semantic HTML and Markdown without retaining document CSS hooks', () => {
    const source = [
      '<details class="spoof" id="app" style="position:fixed" open onclick="steal()">',
      '<summary>**Read this**</summary>',
      '',
      '- one',
      '- [[Other Page|internal]]',
      '- [website](https://example.com/docs)',
      '</details>',
    ].join('\n');

    const result = prepareKnowledgeSafeHtml(source, page);

    expect(result.status).toBe('rendered');
    expect(result.source).toBe(source);
    expect(result.html).toContain('<details open>');
    expect(result.html).toContain('<summary><strong>Read this</strong></summary>');
    expect(result.html).toContain('<ul>');
    expect(result.html).toContain('data-knowledge-link-kind="internal"');
    expect(result.html).toContain('data-knowledge-relative-path="Other Page"');
    expect(result.html).toContain('data-knowledge-link-kind="external"');
    expect(result.html).not.toMatch(/\b(?:class|id|style|onclick)=/i);
  });

  it.each([
    '<script>alert(1)</script>',
    '<style>@import "https://tracker.example/x.css"</style>',
    '<iframe src="https://example.com"></iframe>',
    '<div><img src="data:image/svg+xml,boom"></div>',
    '<video src="./safe.mp4"><script>alert(1)</script></video>',
    '<a href="javascript:alert(1)">bad</a>',
  ])('fails closed at the original source for %s', (source) => {
    expect(prepareKnowledgeSafeHtml(source, page)).toMatchObject({
      status: 'blocked',
      source,
      html: '',
    });
  });

  it('resolves HTML media from the Markdown page directory and never crosses sources', () => {
    expect(resolveKnowledgeAssetReference(page, '../Assets/Cover%20Image.png')).toEqual({
      ok: true,
      address: {
        sourceKey: 'notes',
        relativePath: 'Assets/Cover Image.png',
      },
    });
    expect(resolveKnowledgeAssetReference(page, '../../secret.png')).toMatchObject({
      ok: false,
      reason: 'out_of_scope',
    });
    expect(resolveKnowledgeAssetReference(page, 'other:asset.png')).toMatchObject({
      ok: false,
    });
    expect(resolveKnowledgeAssetReference(page, 'https://tracker.example/pixel.png')).toMatchObject({
      ok: false,
      reason: 'remote_resource',
    });
  });

  it('keeps internal addresses distinct from explicit HTTP/HTTPS external links', () => {
    expect(resolveKnowledgeSafeLink(page, './Other.md#part')).toEqual({
      kind: 'internal',
      address: {
        sourceKey: 'notes',
        relativePath: 'Guides/Other.md',
      },
      fragment: 'part',
    });
    expect(resolveKnowledgeSafeLink(page, 'HTTPS://example.com/a')).toEqual({
      kind: 'external',
      url: 'https://example.com/a',
    });
    for (const href of [
      'javascript:alert(1)',
      'data:text/html,boom',
      'file:///private/secret',
      'blob:https://example.com/id',
      '//example.com/implicit',
    ]) {
      expect(resolveKnowledgeSafeLink(page, href).kind).toBe('blocked');
    }
  });

  it('turns safe HTML anchors into inert, explicitly activated link metadata', () => {
    const source = '<a href="https://example.com/page">site</a>';
    expect(collectKnowledgeRawHtmlElements(source)).toEqual([
      {
        from: 0,
        to: source.length,
        block: false,
        source,
      },
    ]);
    expect(prepareKnowledgeSafeHtml(
      source,
      page,
    )).toMatchObject({
      status: 'rendered',
      html: expect.stringContaining('data-knowledge-link-kind="external"'),
    });
  });
});
