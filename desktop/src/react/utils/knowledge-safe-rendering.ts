import type {
  KnowledgeResourceAddress,
} from '../../../../shared/knowledge-workspace-contract.ts';
import {
  formatKnowledgeMarkdownDestination,
  resolveKnowledgeMarkdownDestination,
  resolveKnowledgeWikilink,
} from '../../../../lib/knowledge-workspace/link-resolver.ts';
import {
  parseMarkdownKnowledgeIr,
  type MarkdownRawHtmlToken,
  type MarkdownTextRange,
} from '../../../../lib/knowledge-workspace/markdown-knowledge-ir.ts';
import { getMd, renderMarkdown } from './markdown';
import { sanitizeMarkdownPreviewHtml } from './markdown-html-sanitizer';

const SAFE_CONTAINER_TAGS = new Set([
  'article', 'aside', 'blockquote', 'details', 'div', 'figcaption', 'figure',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ol', 'p', 'pre', 'section',
  'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);
const SAFE_INLINE_TAGS = new Set([
  'b', 'code', 'em', 'i', 'kbd', 'mark', 's', 'samp', 'small', 'strong',
  'sub', 'sup', 'u',
]);
const SAFE_VOID_TAGS = new Set(['br', 'hr']);
const SAFE_MEDIA_TAGS = new Set(['audio', 'img', 'video']);
const REMOVE_WITH_CONTENT_TAGS = new Set([
  'base', 'button', 'embed', 'form', 'iframe', 'input', 'link', 'meta',
  'object', 'script', 'select', 'style', 'textarea',
]);
const HTML_TOKEN_RE = /<!--[\s\S]*?-->|<\/?[A-Za-z][^<>]*>/gu;
const ATTRIBUTE_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
const DIMENSION_RE = /^[1-9]\d{0,4}$/u;

export type KnowledgeSafeLink =
  | Readonly<{
      kind: 'internal';
      address: KnowledgeResourceAddress;
      fragment: string | null;
    }>
  | Readonly<{ kind: 'external'; url: string }>
  | Readonly<{
      kind: 'blocked';
      reason: 'invalid' | 'out_of_scope' | 'unsupported_scheme';
    }>;

export type KnowledgeAssetResolution =
  | Readonly<{ ok: true; address: KnowledgeResourceAddress }>
  | Readonly<{
      ok: false;
      reason:
        | 'invalid'
        | 'out_of_scope'
        | 'remote_resource'
        | 'unsupported_scheme';
    }>;

export interface KnowledgeSafeAsset {
  readonly id: string;
  readonly element: 'audio' | 'img' | 'video';
  readonly address: KnowledgeResourceAddress;
  readonly alt: string;
}

export type KnowledgeSafeHtmlResult =
  | Readonly<{
      status: 'rendered';
      source: string;
      html: string;
      assets: readonly KnowledgeSafeAsset[];
    }>
  | Readonly<{
      status: 'blocked';
      source: string;
      html: '';
      reason:
        | 'active_content'
        | 'invalid_html'
        | 'unsafe_link'
        | 'unsafe_media';
      assets: readonly [];
    }>;

type KnowledgeSafeHtmlBlockedReason = Extract<
  KnowledgeSafeHtmlResult,
  { status: 'blocked' }
>['reason'];

interface ParsedAttribute {
  readonly name: string;
  readonly value: string;
}

interface HtmlTextNode {
  readonly kind: 'text';
  readonly value: string;
}

interface HtmlElementNode {
  readonly kind: 'element';
  readonly tag: string;
  readonly attributes: readonly ParsedAttribute[];
  readonly children: HtmlNode[];
  readonly selfClosing: boolean;
}

type HtmlNode = HtmlTextNode | HtmlElementNode;

interface ParsedTag {
  readonly closing: boolean;
  readonly selfClosing: boolean;
  readonly tag: string;
  readonly attributes: readonly ParsedAttribute[];
}

export interface KnowledgeRawHtmlElement {
  readonly from: number;
  readonly to: number;
  readonly block: boolean;
  readonly source: string;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/"/gu, '&quot;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;');
}

function parseTag(raw: string): ParsedTag | null {
  if (raw.startsWith('<!--')) return null;
  const match = /^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9-]*)([\s\S]*?)>$/u.exec(raw);
  if (!match) return null;
  const closing = match[1] === '/';
  const body = match[3];
  const selfClosing = !closing && /\/\s*$/u.test(body);
  const attributeSource = selfClosing ? body.replace(/\/\s*$/u, '') : body;
  if (closing && attributeSource.trim()) return null;

  const attributes: ParsedAttribute[] = [];
  let consumedTo = 0;
  ATTRIBUTE_RE.lastIndex = 0;
  for (let attribute = ATTRIBUTE_RE.exec(attributeSource);
    attribute;
    attribute = ATTRIBUTE_RE.exec(attributeSource)) {
    if (attributeSource.slice(consumedTo, attribute.index).trim()) return null;
    consumedTo = ATTRIBUTE_RE.lastIndex;
    attributes.push({
      name: attribute[1].toLowerCase(),
      value: attribute[2] ?? attribute[3] ?? attribute[4] ?? '',
    });
  }
  if (attributeSource.slice(consumedTo).trim()) return null;
  return {
    closing,
    selfClosing,
    tag: match[2].toLowerCase(),
    attributes,
  };
}

function parseHtmlSource(source: string): HtmlNode[] | null {
  const root: HtmlElementNode = {
    kind: 'element',
    tag: '#root',
    attributes: [],
    children: [],
    selfClosing: false,
  };
  const stack = [root];
  let cursor = 0;
  let sawTag = false;
  HTML_TOKEN_RE.lastIndex = 0;

  for (let match = HTML_TOKEN_RE.exec(source);
    match;
    match = HTML_TOKEN_RE.exec(source)) {
    const raw = match[0];
    if (match.index > cursor) {
      stack.at(-1)!.children.push({
        kind: 'text',
        value: source.slice(cursor, match.index),
      });
    }
    cursor = match.index + raw.length;
    if (raw.startsWith('<!--')) return null;
    const tag = parseTag(raw);
    if (!tag) return null;
    sawTag = true;
    if (tag.closing) {
      const current = stack.at(-1);
      if (!current || current === root || current.tag !== tag.tag) return null;
      stack.pop();
      continue;
    }
    const element: HtmlElementNode = {
      kind: 'element',
      tag: tag.tag,
      attributes: tag.attributes,
      children: [],
      selfClosing: tag.selfClosing
        || SAFE_VOID_TAGS.has(tag.tag)
        || tag.tag === 'img',
    };
    stack.at(-1)!.children.push(element);
    if (!element.selfClosing) stack.push(element);
  }
  if (cursor < source.length) {
    stack.at(-1)!.children.push({
      kind: 'text',
      value: source.slice(cursor),
    });
  }
  if (!sawTag || stack.length !== 1) return null;
  if (root.children.some(node => node.kind === 'text' && node.value.trim())) {
    return null;
  }
  return root.children;
}

function rangeContains(
  ranges: readonly MarkdownTextRange[],
  from: number,
  to: number,
): boolean {
  return ranges.some(range => from < range.to && to > range.from);
}

function lineIsBlockHtml(source: string, from: number, to: number): boolean {
  const lineFrom = Math.max(0, source.lastIndexOf('\n', from - 1) + 1);
  const lineBreak = source.indexOf('\n', to);
  const lineTo = lineBreak < 0 ? source.length : lineBreak;
  return source.slice(lineFrom, from).trim() === ''
    && source.slice(to, lineTo).trim() === '';
}

/**
 * Pairs source HTML tags only where the shared Markdown IR identified raw HTML.
 * Code and frontmatter ranges remain literal even if a Lezer HTML block spans
 * adjacent lines.
 */
export function collectKnowledgeRawHtmlElements(
  source: string,
): KnowledgeRawHtmlElement[] {
  const tokens = parseMarkdownKnowledgeIr(source).tokens;
  const htmlTokens = tokens.filter(
    (token): token is MarkdownRawHtmlToken => token.kind === 'raw_html',
  );
  const htmlRanges = htmlTokens.map(token => token.range);
  const exclusions = tokens
    .filter(token => (
      token.kind === 'frontmatter'
      || token.kind === 'fenced_code'
      || token.kind === 'indented_code'
      || token.kind === 'inline_code'
    ))
    .map(token => token.range);
  const elements: KnowledgeRawHtmlElement[] = [];
  const stack: Array<{ tag: string; from: number; block: boolean }> = [];
  HTML_TOKEN_RE.lastIndex = 0;

  for (let match = HTML_TOKEN_RE.exec(source);
    match;
    match = HTML_TOKEN_RE.exec(source)) {
    const from = match.index;
    const to = from + match[0].length;
    if (
      !rangeContains(htmlRanges, from, to)
      || rangeContains(exclusions, from, to)
    ) {
      continue;
    }
    if (match[0].startsWith('<!--')) {
      if (stack.length === 0) {
        elements.push({
          from,
          to,
          block: lineIsBlockHtml(source, from, to),
          source: source.slice(from, to),
        });
      }
      continue;
    }
    const parsed = parseTag(match[0]);
    if (!parsed) continue;
    if (parsed.closing) {
      const opening = stack.at(-1);
      if (!opening || opening.tag !== parsed.tag) {
        if (stack.length === 0) {
          elements.push({
            from,
            to,
            block: lineIsBlockHtml(source, from, to),
            source: source.slice(from, to),
          });
        }
        continue;
      }
      stack.pop();
      if (stack.length === 0) {
        elements.push({
          from: opening.from,
          to,
          block: opening.block || source.slice(opening.from, to).includes('\n'),
          source: source.slice(opening.from, to),
        });
      }
      continue;
    }
    const block = lineIsBlockHtml(source, from, to);
    if (
      parsed.selfClosing
      || SAFE_VOID_TAGS.has(parsed.tag)
      || parsed.tag === 'img'
    ) {
      if (stack.length === 0) {
        elements.push({
          from,
          to,
          block,
          source: source.slice(from, to),
        });
      }
      continue;
    }
    stack.push({ tag: parsed.tag, from, block });
  }

  for (const opening of stack.slice(0, 1)) {
    const containing = htmlTokens.find(token => (
      token.range.from <= opening.from && token.range.to > opening.from
    ));
    const to = containing?.range.to ?? source.length;
    elements.push({
      from: opening.from,
      to,
      block: opening.block || source.slice(opening.from, to).includes('\n'),
      source: source.slice(opening.from, to),
    });
  }
  return elements.sort((left, right) => left.from - right.from || left.to - right.to);
}

export function normalizeKnowledgeExternalUrl(href: string): string | null {
  if (typeof href !== 'string' || !/^https?:/iu.test(href.trim())) return null;
  try {
    const parsed = new URL(href.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function resolveKnowledgeSafeLink(
  pageAddress: KnowledgeResourceAddress,
  href: string,
): KnowledgeSafeLink {
  const external = normalizeKnowledgeExternalUrl(href);
  if (external) return { kind: 'external', url: external };
  const resolution = resolveKnowledgeMarkdownDestination(pageAddress, href.trim());
  if (resolution.kind === 'internal') return resolution;
  if (resolution.kind === 'external') {
    const normalized = normalizeKnowledgeExternalUrl(resolution.url);
    return normalized
      ? { kind: 'external', url: normalized }
      : { kind: 'blocked', reason: 'unsupported_scheme' };
  }
  return {
    kind: 'blocked',
    reason: resolution.reason === 'out_of_scope'
      ? 'out_of_scope'
      : resolution.reason === 'unsupported_scheme'
        ? 'unsupported_scheme'
        : 'invalid',
  };
}

export function resolveKnowledgeAssetReference(
  pageAddress: KnowledgeResourceAddress,
  source: string,
): KnowledgeAssetResolution {
  if (/^https?:/iu.test(source.trim())) {
    return { ok: false, reason: 'remote_resource' };
  }
  const resolution = resolveKnowledgeMarkdownDestination(
    pageAddress,
    source.trim(),
  );
  if (resolution.kind === 'internal') {
    return { ok: true, address: resolution.address };
  }
  if (resolution.kind === 'external') {
    return { ok: false, reason: 'remote_resource' };
  }
  return {
    ok: false,
    reason: resolution.reason === 'out_of_scope'
      ? 'out_of_scope'
      : resolution.reason === 'unsupported_scheme'
        ? 'unsupported_scheme'
        : 'invalid',
  };
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/[\\[\]]/gu, character => `\\${character}`);
}

function markdownWithKnowledgeWikilinks(
  source: string,
  pageAddress: KnowledgeResourceAddress,
): string {
  const wikilinks = parseMarkdownKnowledgeIr(source).tokens.filter(
    token => token.kind === 'wikilink',
  );
  let output = source;
  for (const token of [...wikilinks].reverse()) {
    const resolution = resolveKnowledgeWikilink(pageAddress, {
      address: token.address,
      fragment: token.fragment,
    });
    if (resolution.kind !== 'internal') continue;
    const destination = formatKnowledgeMarkdownDestination(
      pageAddress,
      resolution.address,
      resolution.fragment ?? undefined,
    );
    if (!destination.ok) continue;
    const label = token.display
      || token.address
      || token.fragment
      || resolution.address.relativePath;
    const replacement = `[${escapeMarkdownLabel(label)}](${destination.value})`;
    output = `${output.slice(0, token.range.from)}${replacement}${output.slice(token.range.to)}`;
  }
  return output;
}

function markdownHtml(
  source: string,
  inline: boolean,
  pageAddress: KnowledgeResourceAddress,
): string {
  const prepared = markdownWithKnowledgeWikilinks(source, pageAddress);
  const rendered = inline
    ? getMd().renderInline(prepared)
    : renderMarkdown(prepared);
  const input = document.createElement('template');
  input.innerHTML = rendered;
  const links: KnowledgeSafeLink[] = [];
  for (const anchor of input.content.querySelectorAll<HTMLAnchorElement>('a')) {
    const resolution = resolveKnowledgeSafeLink(
      pageAddress,
      anchor.getAttribute('href') ?? '',
    );
    if (resolution.kind === 'blocked') {
      anchor.remove();
      continue;
    }
    const index = links.push(resolution) - 1;
    anchor.setAttribute('href', `#hana-knowledge-link-${index}`);
  }
  const sanitized = sanitizeMarkdownPreviewHtml(input.innerHTML);
  const output = document.createElement('template');
  output.innerHTML = sanitized;
  for (const anchor of output.content.querySelectorAll<HTMLAnchorElement>('a')) {
    const match = /^#hana-knowledge-link-(\d+)$/u.exec(
      anchor.getAttribute('href') ?? '',
    );
    if (!match) continue;
    const resolution = links[Number(match[1])];
    anchor.removeAttribute('href');
    if (!resolution || resolution.kind === 'blocked') continue;
    anchor.setAttribute('data-knowledge-link-kind', resolution.kind);
    if (resolution.kind === 'external') {
      anchor.setAttribute('data-knowledge-url', resolution.url);
      anchor.setAttribute('rel', 'noopener noreferrer');
    } else {
      anchor.setAttribute('data-knowledge-source-key', resolution.address.sourceKey);
      anchor.setAttribute('data-knowledge-relative-path', resolution.address.relativePath);
      if (resolution.fragment) {
        anchor.setAttribute('data-knowledge-fragment', resolution.fragment);
      }
    }
  }
  return output.innerHTML;
}

function rewriteGeneratedMarkdownLinks(
  html: string,
  pageAddress: KnowledgeResourceAddress,
): string | null {
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const anchor of template.content.querySelectorAll<HTMLAnchorElement>('a')) {
    if (anchor.hasAttribute('data-knowledge-link-kind')) continue;
    const href = anchor.getAttribute('href') ?? '';
    const resolution = resolveKnowledgeSafeLink(pageAddress, href);
    anchor.removeAttribute('href');
    anchor.removeAttribute('target');
    if (resolution.kind === 'blocked') return null;
    anchor.setAttribute('data-knowledge-link-kind', resolution.kind);
    if (resolution.kind === 'external') {
      anchor.setAttribute('data-knowledge-url', resolution.url);
      anchor.setAttribute('rel', 'noopener noreferrer');
    } else {
      anchor.setAttribute('data-knowledge-source-key', resolution.address.sourceKey);
      anchor.setAttribute('data-knowledge-relative-path', resolution.address.relativePath);
      if (resolution.fragment) {
        anchor.setAttribute('data-knowledge-fragment', resolution.fragment);
      }
    }
  }
  return template.innerHTML;
}

function firstAttribute(
  attributes: readonly ParsedAttribute[],
  name: string,
): string | null {
  return attributes.find(attribute => attribute.name === name)?.value ?? null;
}

function allowedAttributes(element: HtmlElementNode): string[] {
  const attributes: string[] = [];
  const title = firstAttribute(element.attributes, 'title');
  if (title) attributes.push(`title="${escapeAttribute(title)}"`);
  if (element.tag === 'details' && element.attributes.some(attr => attr.name === 'open')) {
    attributes.push('open');
  }
  if (SAFE_MEDIA_TAGS.has(element.tag)) {
    const alt = firstAttribute(element.attributes, 'alt');
    if (element.tag === 'img' && alt !== null) {
      attributes.push(`alt="${escapeAttribute(alt)}"`);
    }
    for (const name of ['width', 'height'] as const) {
      const value = firstAttribute(element.attributes, name);
      if (value && DIMENSION_RE.test(value.trim())) {
        attributes.push(`${name}="${value.trim()}"`);
      }
    }
    if (
      (element.tag === 'audio' || element.tag === 'video')
      && element.attributes.some(attr => attr.name === 'controls')
    ) {
      attributes.push('controls');
    }
  }
  return attributes;
}

function renderNodes(
  nodes: readonly HtmlNode[],
  pageAddress: KnowledgeResourceAddress,
  assets: KnowledgeSafeAsset[],
  inline: boolean,
): { ok: true; html: string } | { ok: false; reason: KnowledgeSafeHtmlBlockedReason } {
  const output: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'text') {
      if (!node.value) continue;
      const rewritten = rewriteGeneratedMarkdownLinks(
        markdownHtml(node.value, inline, pageAddress),
        pageAddress,
      );
      if (rewritten === null) return { ok: false, reason: 'unsafe_link' };
      output.push(rewritten);
      continue;
    }

    if (REMOVE_WITH_CONTENT_TAGS.has(node.tag)) {
      return { ok: false, reason: 'active_content' };
    }
    if (node.tag === 'a') {
      const href = firstAttribute(node.attributes, 'href') ?? '';
      const resolution = resolveKnowledgeSafeLink(pageAddress, href);
      if (resolution.kind === 'blocked') {
        return { ok: false, reason: 'unsafe_link' };
      }
      const children = renderNodes(
        node.children,
        pageAddress,
        assets,
        true,
      );
      if (!children.ok) return children;
      const attributes = resolution.kind === 'external'
        ? [
            'data-knowledge-link-kind="external"',
            `data-knowledge-url="${escapeAttribute(resolution.url)}"`,
            'rel="noopener noreferrer"',
          ]
        : [
            'data-knowledge-link-kind="internal"',
            `data-knowledge-source-key="${escapeAttribute(resolution.address.sourceKey)}"`,
            `data-knowledge-relative-path="${escapeAttribute(resolution.address.relativePath)}"`,
            ...(resolution.fragment
              ? [`data-knowledge-fragment="${escapeAttribute(resolution.fragment)}"`]
              : []),
          ];
      output.push(`<a ${attributes.join(' ')}>${children.html}</a>`);
      continue;
    }
    if (SAFE_MEDIA_TAGS.has(node.tag)) {
      if (node.children.some(child => (
        child.kind === 'element' || child.value.trim() !== ''
      ))) {
        return { ok: false, reason: 'active_content' };
      }
      const src = firstAttribute(node.attributes, 'src') ?? '';
      const resolution = resolveKnowledgeAssetReference(pageAddress, src);
      if (!resolution.ok) return { ok: false, reason: 'unsafe_media' };
      const id = `asset-${assets.length + 1}`;
      assets.push({
        id,
        element: node.tag as KnowledgeSafeAsset['element'],
        address: resolution.address,
        alt: firstAttribute(node.attributes, 'alt') ?? '',
      });
      output.push(
        `<span data-knowledge-asset-id="${id}" role="status"></span>`,
      );
      continue;
    }
    if (
      !SAFE_CONTAINER_TAGS.has(node.tag)
      && !SAFE_INLINE_TAGS.has(node.tag)
      && !SAFE_VOID_TAGS.has(node.tag)
    ) {
      return { ok: false, reason: 'active_content' };
    }
    const attributes = allowedAttributes(node);
    const opening = attributes.length
      ? `<${node.tag} ${attributes.join(' ')}>`
      : `<${node.tag}>`;
    if (node.selfClosing || SAFE_VOID_TAGS.has(node.tag)) {
      output.push(opening);
      continue;
    }
    const children = renderNodes(
      node.children,
      pageAddress,
      assets,
      SAFE_INLINE_TAGS.has(node.tag) || node.tag === 'summary',
    );
    if (!children.ok) return children;
    output.push(`${opening}${children.html}</${node.tag}>`);
  }
  return { ok: true, html: output.join('') };
}

export function prepareKnowledgeSafeHtml(
  source: string,
  pageAddress: KnowledgeResourceAddress,
): KnowledgeSafeHtmlResult {
  const nodes = parseHtmlSource(source);
  if (!nodes) {
    return {
      status: 'blocked',
      source,
      html: '',
      reason: 'invalid_html',
      assets: [],
    };
  }
  const assets: KnowledgeSafeAsset[] = [];
  const rendered = renderNodes(nodes, pageAddress, assets, false);
  if ('reason' in rendered) {
    return {
      status: 'blocked',
      source,
      html: '',
      reason: rendered.reason,
      assets: [],
    };
  }
  return {
    status: 'rendered',
    source,
    html: rendered.html,
    assets,
  };
}

/**
 * This function is intentionally side-effect free until its caller invokes it
 * from an explicit click/keyboard activation handler.
 */
export function openKnowledgeExternalLink(href: string): boolean {
  const safeUrl = normalizeKnowledgeExternalUrl(href);
  if (!safeUrl || typeof window === 'undefined') return false;
  window.platform?.openExternal?.(safeUrl);
  return typeof window.platform?.openExternal === 'function';
}
