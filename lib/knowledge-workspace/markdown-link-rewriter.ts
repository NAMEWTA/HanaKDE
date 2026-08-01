import type { KnowledgeResourceAddress } from '../../shared/knowledge-workspace-contract.ts';
import { parseMarkdownKnowledgeIr } from './markdown-knowledge-ir.ts';
import {
  formatKnowledgeMarkdownDestination,
  formatKnowledgeWikilink,
  resolveKnowledgeMarkdownDestination,
  resolveKnowledgeWikilink,
} from './link-resolver.ts';

export type MarkdownLinkRewrite = Readonly<{
  from: number;
  to: number;
  value: string;
}>;

export function rewriteKnowledgeMarkdownLinks(input: Readonly<{
  source: string;
  pageAddress: KnowledgeResourceAddress;
  formatPageAddress?: KnowledgeResourceAddress;
  from: KnowledgeResourceAddress;
  to: KnowledgeResourceAddress;
  signal?: AbortSignal;
}>): Readonly<{ source: string; changed: boolean; rewrites: readonly MarkdownLinkRewrite[] }> {
  if (input.from.sourceKey !== input.to.sourceKey || input.pageAddress.sourceKey !== input.from.sourceKey) {
    return Object.freeze({ source: input.source, changed: false, rewrites: Object.freeze([]) });
  }
  const ir = parseMarkdownKnowledgeIr(input.source, { signal: input.signal });
  const formatPageAddress = input.formatPageAddress ?? input.pageAddress;
  const rewrites: MarkdownLinkRewrite[] = [];
  for (const token of ir.tokens) {
    if (token.kind === 'wikilink') {
      const resolved = resolveKnowledgeWikilink(input.pageAddress, {
        address: token.address,
        fragment: token.fragment,
      });
      if (resolved.kind !== 'internal') continue;
      const target = movedTarget(resolved.address, input.from, input.to);
      if (!target) continue;
      const formatted = formatKnowledgeWikilink(
        formatPageAddress,
        target,
        resolved.fragment ?? undefined,
      );
      if (formatted.ok) rewrites.push({
        from: token.addressRange.from,
        to: token.fragmentRange?.to ?? token.addressRange.to,
        value: formatted.value,
      });
      continue;
    }
    if (token.kind === 'markdown_link') {
      const resolved = resolveKnowledgeMarkdownDestination(input.pageAddress, token.destination);
      if (resolved.kind !== 'internal') continue;
      const target = movedTarget(resolved.address, input.from, input.to);
      if (!target) continue;
      const formatted = formatKnowledgeMarkdownDestination(
        formatPageAddress,
        target,
        resolved.fragment ?? undefined,
      );
      if (formatted.ok) rewrites.push({
        from: token.destinationRange.from,
        to: token.destinationRange.to,
        value: formatted.value,
      });
    }
  }
  if (rewrites.length === 0) {
    return Object.freeze({ source: input.source, changed: false, rewrites: Object.freeze([]) });
  }
  let source = input.source;
  for (const rewrite of [...rewrites].sort((left, right) => right.from - left.from)) {
    source = `${source.slice(0, rewrite.from)}${rewrite.value}${source.slice(rewrite.to)}`;
  }
  return Object.freeze({ source, changed: true, rewrites: Object.freeze(rewrites) });
}

function movedTarget(
  candidate: KnowledgeResourceAddress,
  from: KnowledgeResourceAddress,
  to: KnowledgeResourceAddress,
): KnowledgeResourceAddress | null {
  if (candidate.sourceKey !== from.sourceKey) return null;
  if (candidate.relativePath === from.relativePath) return { ...to };
  if (!candidate.relativePath.startsWith(`${from.relativePath}/`)) return null;
  return {
    sourceKey: to.sourceKey,
    relativePath: `${to.relativePath}${candidate.relativePath.slice(from.relativePath.length)}`,
  };
}
