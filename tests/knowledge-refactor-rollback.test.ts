import { describe, expect, it } from 'vitest';
import { rewriteKnowledgeMarkdownLinks } from '../lib/knowledge-workspace/markdown-link-rewriter.ts';

describe('knowledge saved-link refactor', () => {
  it('rewrites exact and descendant same-source links while preserving labels and fragments', () => {
    const source = [
      '[[docs/Old.md#Heading|Old label]]',
      '[child](../docs/Old/child%20page.md#Part)',
      '`[[docs/Old.md]]`',
      '[external](https://example.com/docs/Old.md)',
    ].join('\n');
    const result = rewriteKnowledgeMarkdownLinks({
      source,
      pageAddress: { sourceKey: 'main', relativePath: 'notes/page.md' },
      from: { sourceKey: 'main', relativePath: 'docs/Old.md' },
      to: { sourceKey: 'main', relativePath: 'archive/New.md' },
    });
    expect(result.source).toContain('[[archive/New.md#Heading|Old label]]');
    expect(result.source).toContain('[child](../docs/Old/child%20page.md#Part)');
    expect(result.source).toContain('`[[docs/Old.md]]`');
    expect(result.source).toContain('https://example.com/docs/Old.md');
  });

  it('rewrites directory descendants with independently formatted Markdown destinations', () => {
    const result = rewriteKnowledgeMarkdownLinks({
      source: '[child](../docs/Old/child%20page.md#Part)',
      pageAddress: { sourceKey: 'main', relativePath: 'notes/page.md' },
      from: { sourceKey: 'main', relativePath: 'docs/Old' },
      to: { sourceKey: 'main', relativePath: 'archive/New' },
    });
    expect(result.source).toBe('[child](../archive/New/child%20page.md#Part)');
  });
});
