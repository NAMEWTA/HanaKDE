import type {
  KnowledgeResourceAddress,
} from '../../../../shared/knowledge-workspace-contract.ts';
import {
  resolveKnowledgeMarkdownDestination,
  resolveKnowledgeWikilink,
} from '../../../../lib/knowledge-workspace/link-resolver.ts';
import {
  parseMarkdownKnowledgeIr,
} from '../../../../lib/knowledge-workspace/markdown-knowledge-ir.ts';
import {
  uniqueMarkdownHeadingId,
} from '../../../../lib/knowledge-workspace/markdown-heading-slug.ts';

export type KnowledgeCurrentOutlineItem = {
  ordinal: number;
  level: number;
  text: string;
  slug: string;
  fromOffset: number;
  toOffset: number;
};

export type KnowledgeCurrentOutboundItem = {
  ordinal: number;
  linkKind: 'wikilink' | 'embed' | 'markdown' | 'content-ref';
  sourceKind: 'wikilink' | 'markdown_link';
  embedded: boolean;
  targetAddress: KnowledgeResourceAddress;
  fragment: string | null;
  fromOffset: number;
  toOffset: number;
};

export type KnowledgeCurrentResourceProjection = {
  outline: KnowledgeCurrentOutlineItem[];
  outbound: KnowledgeCurrentOutboundItem[];
};

export function deriveKnowledgeCurrentResource(
  buffer: string,
  pageAddress: KnowledgeResourceAddress,
): KnowledgeCurrentResourceProjection {
  const ir = parseMarkdownKnowledgeIr(buffer);
  const seenSlugs = new Map<string, number>();
  const outline: KnowledgeCurrentOutlineItem[] = [];
  const outbound: KnowledgeCurrentOutboundItem[] = [];

  for (const token of ir.tokens) {
    if (token.kind === 'heading') {
      outline.push({
        ordinal: outline.length,
        level: token.level,
        text: token.text,
        slug: uniqueMarkdownHeadingId(token.text, seenSlugs),
        fromOffset: token.range.from,
        toOffset: token.range.to,
      });
      continue;
    }

    if (token.kind === 'wikilink') {
      const resolution = resolveKnowledgeWikilink(pageAddress, {
        address: token.address,
        ...(token.fragment === undefined
          ? {}
          : { fragment: token.fragment }),
      });
      if (
        resolution.kind !== 'internal'
        || resolution.address.sourceKey !== pageAddress.sourceKey
      ) {
        continue;
      }
      outbound.push({
        ordinal: outbound.length,
        linkKind: token.embedded
          ? 'embed'
          : token.display === undefined
            ? 'wikilink'
            : 'content-ref',
        sourceKind: 'wikilink',
        embedded: token.embedded,
        targetAddress: resolution.address,
        fragment: resolution.fragment,
        fromOffset: token.range.from,
        toOffset: token.range.to,
      });
      continue;
    }

    if (token.kind === 'markdown_link') {
      const resolution = resolveKnowledgeMarkdownDestination(
        pageAddress,
        token.destination,
      );
      if (
        resolution.kind !== 'internal'
        || resolution.address.sourceKey !== pageAddress.sourceKey
      ) {
        continue;
      }
      outbound.push({
        ordinal: outbound.length,
        linkKind: token.embedded ? 'embed' : 'markdown',
        sourceKind: 'markdown_link',
        embedded: token.embedded,
        targetAddress: resolution.address,
        fragment: resolution.fragment,
        fromOffset: token.range.from,
        toOffset: token.range.to,
      });
    }
  }

  return { outline, outbound };
}
