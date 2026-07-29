import {
  projectFrontmatterFromToken,
} from './frontmatter-projection.ts';
import {
  parseMarkdownKnowledgeIr,
  type MarkdownFrontmatterToken,
  type MarkdownTagToken,
} from './markdown-knowledge-ir.ts';

export type KnowledgeTagOrigin = 'frontmatter' | 'body';

export interface KnowledgePageTag {
  /** NFC-normalized, case-preserving tag value without a leading `#`. */
  readonly tag: string;
  /** Stable origin order: Frontmatter before body. */
  readonly origins: readonly KnowledgeTagOrigin[];
}

export interface KnowledgePageTags {
  /** Kept on every projection so callers cannot accidentally flatten sources. */
  readonly sourceKey: string;
  readonly tags: readonly KnowledgePageTag[];
}

export interface ExtractKnowledgePageTagsOptions {
  readonly signal?: AbortSignal;
}

const CONTROL_CHARACTER_RE = /\p{Cc}/u;

function normalizeTagValue(value: string): string | null {
  const normalized = value.normalize('NFC').trim();
  if (normalized.length === 0 || CONTROL_CHARACTER_RE.test(normalized)) {
    return null;
  }
  return normalized;
}

function frontmatterTagValues(
  source: string,
  token: MarkdownFrontmatterToken | undefined,
): readonly string[] {
  if (!token) return [];
  const projection = projectFrontmatterFromToken(source, token);
  if (projection.mode !== 'properties') return [];
  const tags = projection.fields.find(field => field.key === 'tags')?.value;
  if (typeof tags === 'string') return [tags];
  if (Array.isArray(tags) && tags.every(tag => typeof tag === 'string')) {
    return tags;
  }
  return [];
}

/**
 * Extracts the current page buffer only. Persisted indexing must call the same
 * function after ResourceIO has successfully saved and reread disk content.
 */
export function extractKnowledgePageTags(
  sourceKey: string,
  source: string,
  options: ExtractKnowledgePageTagsOptions = {},
): KnowledgePageTags {
  const ir = parseMarkdownKnowledgeIr(source, options);
  const ordered = new Map<string, Set<KnowledgeTagOrigin>>();
  const add = (raw: string, origin: KnowledgeTagOrigin): void => {
    const tag = normalizeTagValue(raw);
    if (!tag) return;
    const origins = ordered.get(tag);
    if (origins) {
      origins.add(origin);
    } else {
      ordered.set(tag, new Set([origin]));
    }
  };

  const frontmatter = ir.tokens.find(
    (token): token is MarkdownFrontmatterToken => token.kind === 'frontmatter',
  );
  for (const value of frontmatterTagValues(source, frontmatter)) {
    add(value, 'frontmatter');
  }
  for (const token of ir.tokens) {
    if (token.kind === 'tag') {
      add((token as MarkdownTagToken).tag, 'body');
    }
  }

  return {
    sourceKey,
    tags: [...ordered].map(([tag, origins]) => ({
      tag,
      origins: [...origins],
    })),
  };
}
