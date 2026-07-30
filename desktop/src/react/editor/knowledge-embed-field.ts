import {
  Facet,
  RangeSetBuilder,
  StateField,
  type EditorState,
  type Extension,
  type Transaction,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';
import type {
  KnowledgeResourceAddress,
} from '../../../../shared/knowledge-workspace-contract.ts';
import {
  parseMarkdownKnowledgeIr,
  type MarkdownHeadingToken,
  type MarkdownLinkToken,
  type MarkdownWikilinkToken,
} from '../../../../lib/knowledge-workspace/markdown-knowledge-ir.ts';
import {
  resolveKnowledgeWikilink,
} from '../../../../lib/knowledge-workspace/link-resolver.ts';
import {
  openKnowledgeExternalLink,
  resolveKnowledgeSafeLink,
} from '../utils/knowledge-safe-rendering';
import { renderMarkdownPreview } from '../utils/markdown';
import { renderMermaidSvg } from '../utils/mermaid-renderer';
import { selectionTouchesRange } from './knowledge-live-preview';

export const KNOWLEDGE_EMBED_MAX_DEPTH = 8;

export type KnowledgeEmbedPageReadResult =
  | Readonly<{ ok: true; content: string }>
  | Readonly<{
      ok: false;
      reason:
        | 'missing'
        | 'unavailable'
        | 'content_too_large'
        | 'invalid_utf8';
    }>;

export type KnowledgeEmbedLinkActivation =
  | Readonly<{
      kind: 'internal';
      address: KnowledgeResourceAddress;
      fragment: string | null;
    }>
  | Readonly<{ kind: 'external'; url: string }>;

export interface KnowledgeEmbedFieldConfig {
  readonly pageAddress: KnowledgeResourceAddress;
  readonly refreshKey?: string | number;
  readonly readPage: (
    address: KnowledgeResourceAddress,
    options: { signal: AbortSignal },
  ) => Promise<KnowledgeEmbedPageReadResult>;
  readonly onActivatePage?: (activation: Readonly<{
    address: KnowledgeResourceAddress;
    fragment: string | null;
  }>) => void | Promise<void>;
  readonly onActivateLink?: (
    activation: KnowledgeEmbedLinkActivation,
  ) => void | Promise<void>;
}

export type KnowledgeEmbedSectionResult =
  | Readonly<{
      ok: true;
      content: string;
      from: number;
      to: number;
    }>
  | Readonly<{ ok: false; reason: 'section_missing' }>;

interface KnowledgeEmbedEntry {
  readonly from: number;
  readonly to: number;
  readonly address: KnowledgeResourceAddress;
  readonly fragment: string | null;
  readonly raw: string;
}

interface KnowledgeEmbedFieldValue {
  readonly config: KnowledgeEmbedFieldConfig | null;
  readonly decorations: DecorationSet;
}

interface NestedEmbed {
  readonly marker: string;
  readonly address: KnowledgeResourceAddress;
  readonly fragment: string | null;
}

interface PreparedEmbedLink {
  readonly marker: string;
  readonly activation: KnowledgeEmbedLinkActivation;
}

interface PreparedEmbeddedMarkdown {
  readonly markdown: string;
  readonly nested: readonly NestedEmbed[];
  readonly links: readonly PreparedEmbedLink[];
}

let markerSequence = 0;

function createMarkerNamespace(): string {
  markerSequence += 1;
  const random = new Uint32Array(2);
  globalThis.crypto?.getRandomValues?.(random);
  return [
    markerSequence.toString(36),
    random[0].toString(36),
    random[1].toString(36),
  ].join('-');
}

function translated(
  key: string,
  fallback: string,
  params: Record<string, string | number> = {},
): string {
  const value = window.t?.(key, params);
  const template = value && value !== key ? value : fallback;
  return template.replace(/\{(\w+)\}/gu, (_, name: string) => (
    String(params[name] ?? `{${name}}`)
  ));
}

function addressKey(address: KnowledgeResourceAddress): string {
  return `${address.sourceKey}\u0000${address.relativePath}`;
}

function isMarkdownPage(address: KnowledgeResourceAddress): boolean {
  return /\.md$/iu.test(address.relativePath);
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/[\\[\]]/gu, character => `\\${character}`);
}

function tokenLabel(token: MarkdownWikilinkToken): string {
  return token.display
    || token.fragment
    || token.address
    || 'Embedded page';
}

export function extractKnowledgeEmbedSection(
  source: string,
  fragment: string | null,
): KnowledgeEmbedSectionResult {
  if (fragment === null) {
    return {
      ok: true,
      content: source,
      from: 0,
      to: source.length,
    };
  }
  const headings = parseMarkdownKnowledgeIr(source).tokens.filter(
    (token): token is MarkdownHeadingToken => token.kind === 'heading',
  );
  const heading = headings.find(candidate => candidate.text === fragment);
  if (!heading) return { ok: false, reason: 'section_missing' };
  const next = headings.find(candidate => (
    candidate.range.from > heading.range.from
    && candidate.level <= heading.level
  ));
  const to = next?.range.from ?? source.length;
  return {
    ok: true,
    content: source.slice(heading.range.from, to),
    from: heading.range.from,
    to,
  };
}

function prepareEmbeddedMarkdown(
  source: string,
  pageAddress: KnowledgeResourceAddress,
): PreparedEmbeddedMarkdown {
  const linkTokens = parseMarkdownKnowledgeIr(source).tokens.filter(
    (token): token is MarkdownWikilinkToken | MarkdownLinkToken => (
      token.kind === 'wikilink'
      || (token.kind === 'markdown_link' && !token.embedded)
    ),
  );
  const nested: NestedEmbed[] = [];
  const links: PreparedEmbedLink[] = [];
  const namespace = createMarkerNamespace();
  let markdown = source;
  for (const token of [...linkTokens].reverse()) {
    if (token.kind === 'markdown_link') {
      const resolution = resolveKnowledgeSafeLink(
        pageAddress,
        token.destination,
      );
      if (resolution.kind === 'blocked') continue;
      const marker = `hana-knowledge-static-link-${namespace}-${links.length}`;
      links.push({ marker, activation: resolution });
      markdown = `${markdown.slice(0, token.destinationRange.from)}#${marker}${
        markdown.slice(token.destinationRange.to)
      }`;
      continue;
    }

    const resolution = resolveKnowledgeWikilink(pageAddress, {
      address: token.address,
      fragment: token.fragment,
    });
    if (resolution.kind !== 'internal') continue;
    let replacement: string;
    if (token.embedded && isMarkdownPage(resolution.address)) {
      const marker = `hana-knowledge-nested-embed-${namespace}-${nested.length}`;
      nested.push({
        marker,
        address: resolution.address,
        fragment: resolution.fragment,
      });
      replacement = `[${escapeMarkdownLabel(tokenLabel(token))}](#${marker})`;
    } else {
      const marker = `hana-knowledge-static-link-${namespace}-${links.length}`;
      links.push({ marker, activation: resolution });
      replacement = `[${escapeMarkdownLabel(tokenLabel(token))}](#${marker})`;
    }
    markdown = `${markdown.slice(0, token.range.from)}${replacement}${
      markdown.slice(token.range.to)
    }`;
  }
  return { markdown, nested, links };
}

function hasSelectionWithin(container: HTMLElement): boolean {
  const selection = container.ownerDocument.defaultView?.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString()) return false;
  return (
    (selection.anchorNode ? container.contains(selection.anchorNode) : false)
    || (selection.focusNode ? container.contains(selection.focusNode) : false)
  );
}

function isExplicitInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(
    'a, button, input, select, textarea, summary, [role="link"], [role="button"]',
  ));
}

function statusElement(
  reason:
    | 'loading'
    | 'cycle'
    | 'depth'
    | 'missing'
    | 'section_missing'
    | 'unavailable'
    | 'content_too_large'
    | 'invalid_utf8',
): HTMLElement {
  const status = document.createElement('span');
  status.className = `cm-knowledge-embed-status is-${reason.replaceAll('_', '-')}`;
  status.setAttribute('role', 'status');
  const messages = {
    loading: ['knowledge.embed.loading', 'Loading embedded page…'],
    cycle: ['knowledge.embed.cycle', 'Circular page embed'],
    depth: ['knowledge.embed.depth', 'Page embed depth limit reached'],
    missing: ['knowledge.embed.missing', 'Embedded page is missing'],
    section_missing: ['knowledge.embed.sectionMissing', 'Embedded section is missing'],
    unavailable: ['knowledge.embed.unavailable', 'Embedded page is unavailable'],
    content_too_large: ['knowledge.embed.tooLarge', 'Embedded page is too large'],
    invalid_utf8: ['knowledge.embed.invalidEncoding', 'Embedded page is not valid UTF-8'],
  } as const;
  const [key, fallback] = messages[reason];
  status.textContent = translated(key, fallback);
  return status;
}

function sameDocumentFragmentTarget(
  root: HTMLElement,
  href: string,
): HTMLElement | null {
  if (!href.startsWith('#') || href.length < 2) return null;
  let id: string;
  try {
    id = decodeURIComponent(href.slice(1));
  } catch {
    return null;
  }
  return Array.from(root.querySelectorAll<HTMLElement>('[id]'))
    .find(element => element.id === id) ?? null;
}

class KnowledgeEmbedWidget extends WidgetType {
  private readonly controller = new AbortController();

  constructor(
    readonly entry: KnowledgeEmbedEntry,
    readonly config: KnowledgeEmbedFieldConfig,
  ) {
    super();
  }

  eq(other: KnowledgeEmbedWidget): boolean {
    return this.entry.from === other.entry.from
      && this.entry.to === other.entry.to
      && this.entry.raw === other.entry.raw
      && this.config === other.config;
  }

  ignoreEvent(): boolean {
    return false;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-knowledge-embed';
    wrapper.replaceChildren(statusElement('loading'));
    void this.renderPage(
      wrapper,
      this.entry.address,
      this.entry.fragment,
      new Set([addressKey(this.config.pageAddress)]),
      1,
    );
    return wrapper;
  }

  destroy(): void {
    this.controller.abort();
  }

  private async renderPage(
    container: HTMLElement,
    address: KnowledgeResourceAddress,
    fragment: string | null,
    chain: ReadonlySet<string>,
    depth: number,
  ): Promise<void> {
    if (this.controller.signal.aborted) return;
    const key = addressKey(address);
    if (chain.has(key)) {
      container.replaceChildren(statusElement('cycle'));
      return;
    }
    if (depth > KNOWLEDGE_EMBED_MAX_DEPTH) {
      container.replaceChildren(statusElement('depth'));
      return;
    }

    let read: KnowledgeEmbedPageReadResult;
    try {
      read = await this.config.readPage(address, {
        signal: this.controller.signal,
      });
    } catch {
      if (!this.controller.signal.aborted) {
        container.replaceChildren(statusElement('unavailable'));
      }
      return;
    }
    if (this.controller.signal.aborted) return;
    if (read.ok === false) {
      container.replaceChildren(statusElement(read.reason));
      return;
    }
    const section = extractKnowledgeEmbedSection(read.content, fragment);
    if (section.ok === false) {
      container.replaceChildren(statusElement(section.reason));
      return;
    }

    const content = document.createElement('span');
    content.className = 'cm-knowledge-embed-content';
    content.setAttribute('contenteditable', 'false');
    content.tabIndex = 0;
    content.setAttribute('role', 'group');
    content.setAttribute(
      'aria-label',
      translated(
        'knowledge.embed.openPage',
        'Embedded page {path}. Activate a plain area to open the source page.',
        { path: address.relativePath },
      ),
    );
    content.dataset.knowledgeEmbedSourceKey = address.sourceKey;
    content.dataset.knowledgeEmbedRelativePath = address.relativePath;
    this.installPageActivation(content, address, fragment);

    const prepared = prepareEmbeddedMarkdown(section.content, address);
    const template = document.createElement('template');
    template.innerHTML = renderMarkdownPreview(prepared.markdown);
    template.content.querySelectorAll(
      'iframe, object, embed, script, style, form, input, textarea, select',
    ).forEach(element => element.remove());
    template.content.querySelectorAll<HTMLElement>(
      'img, audio, video, source',
    ).forEach(element => {
      element.removeAttribute('src');
      element.removeAttribute('srcset');
    });
    content.appendChild(template.content.cloneNode(true));
    container.replaceChildren(content);

    const nextChain = new Set(chain);
    nextChain.add(key);
    this.installLinks(content, address, prepared.links, prepared.nested);
    this.installMermaid(content);
    for (const nested of prepared.nested) {
      const anchor = Array.from(content.querySelectorAll<HTMLAnchorElement>('a'))
        .find(candidate => candidate.getAttribute('href') === `#${nested.marker}`);
      if (!anchor) continue;
      const slot = document.createElement('span');
      slot.className = 'cm-knowledge-embed-nested';
      slot.replaceChildren(statusElement('loading'));
      anchor.replaceWith(slot);
      void this.renderPage(
        slot,
        nested.address,
        nested.fragment,
        nextChain,
        depth + 1,
      );
    }
  }

  private installPageActivation(
    content: HTMLElement,
    address: KnowledgeResourceAddress,
    fragment: string | null,
  ): void {
    const activate = () => {
      void this.config.onActivatePage?.({ address, fragment });
    };
    content.addEventListener('mousedown', event => {
      event.stopPropagation();
    });
    content.addEventListener('click', event => {
      if (
        event.defaultPrevented
        || isExplicitInteractiveTarget(event.target)
        || hasSelectionWithin(content)
      ) {
        return;
      }
      event.stopPropagation();
      activate();
    });
    content.addEventListener('keydown', event => {
      if (
        event.target !== content
        || (event.key !== 'Enter' && event.key !== ' ')
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      activate();
    });
  }

  private installLinks(
    root: HTMLElement,
    sourcePage: KnowledgeResourceAddress,
    preparedLinks: readonly PreparedEmbedLink[],
    nestedEmbeds: readonly NestedEmbed[],
  ): void {
    for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a')) {
      const href = anchor.getAttribute('href') ?? '';
      if (nestedEmbeds.some(nested => href === `#${nested.marker}`)) continue;
      const preparedResolution = preparedLinks.find(
        link => href === `#${link.marker}`,
      )?.activation;
      const localTarget = sameDocumentFragmentTarget(root, href);
      anchor.removeAttribute('href');
      anchor.tabIndex = 0;
      anchor.setAttribute('role', 'link');
      const activate = () => {
        if (localTarget) {
          localTarget.scrollIntoView?.({ block: 'nearest' });
          return;
        }
        const resolution = preparedResolution
          ?? resolveKnowledgeSafeLink(sourcePage, href);
        if (resolution.kind === 'blocked') return;
        if (this.config.onActivateLink) {
          void this.config.onActivateLink(resolution);
        } else if (resolution.kind === 'external') {
          openKnowledgeExternalLink(resolution.url);
        }
      };
      anchor.addEventListener('click', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        activate();
      });
      anchor.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        activate();
      });
    }
  }

  private installMermaid(root: HTMLElement): void {
    for (const diagram of root.querySelectorAll<HTMLElement>('.mermaid-diagram')) {
      const source = diagram.querySelector<HTMLElement>(
        '.mermaid-source code',
      )?.textContent ?? '';
      const rendered = diagram.querySelector<HTMLElement>('.mermaid-rendered');
      if (!source.trim() || !rendered) continue;
      void renderMermaidSvg(source, this.controller.signal).then(result => {
        if (this.controller.signal.aborted || result.status === 'cancelled') return;
        diagram.classList.remove('is-rendered', 'is-error');
        if (result.status === 'rendered') {
          rendered.innerHTML = result.svg;
          diagram.querySelector<HTMLElement>('.mermaid-source')
            ?.setAttribute('hidden', '');
          diagram.classList.add('is-rendered');
        } else {
          rendered.textContent = translated(
            'knowledge.mermaid.renderError',
            'Mermaid diagram could not be rendered.',
          );
          diagram.classList.add('is-error');
        }
      }).catch(() => {
        if (!this.controller.signal.aborted) {
          rendered.textContent = translated(
            'knowledge.mermaid.renderError',
            'Mermaid diagram could not be rendered.',
          );
          diagram.classList.add('is-error');
        }
      });
    }
  }
}

const knowledgeEmbedConfigFacet = Facet.define<
  KnowledgeEmbedFieldConfig,
  KnowledgeEmbedFieldConfig | null
>({
  combine(values) {
    return values[0] ?? null;
  },
});

function embedEntries(
  state: EditorState,
  config: KnowledgeEmbedFieldConfig,
): readonly KnowledgeEmbedEntry[] {
  return parseMarkdownKnowledgeIr(state.doc.toString()).tokens.flatMap(token => {
    if (
      token.kind !== 'wikilink'
      || !token.embedded
      || selectionTouchesRange(state, token.range.from, token.range.to)
    ) {
      return [];
    }
    const resolution = resolveKnowledgeWikilink(config.pageAddress, {
      address: token.address,
      fragment: token.fragment,
    });
    if (resolution.kind !== 'internal' || !isMarkdownPage(resolution.address)) {
      return [];
    }
    return [{
      from: token.range.from,
      to: token.range.to,
      address: resolution.address,
      fragment: resolution.fragment,
      raw: token.raw,
    }];
  });
}

function buildFieldValue(
  state: EditorState,
  config: KnowledgeEmbedFieldConfig | null,
): KnowledgeEmbedFieldValue {
  if (!config) {
    return { config, decorations: Decoration.none };
  }
  const builder = new RangeSetBuilder<Decoration>();
  for (const entry of embedEntries(state, config)) {
    builder.add(
      entry.from,
      entry.to,
      Decoration.replace({
        widget: new KnowledgeEmbedWidget(entry, config),
      }),
    );
  }
  return { config, decorations: builder.finish() };
}

const knowledgeEmbedField = StateField.define<KnowledgeEmbedFieldValue>({
  create(state) {
    return buildFieldValue(state, state.facet(knowledgeEmbedConfigFacet));
  },
  update(value, transaction: Transaction) {
    const config = transaction.state.facet(knowledgeEmbedConfigFacet);
    if (
      transaction.docChanged
      || transaction.selection
      || value.config !== config
    ) {
      return buildFieldValue(transaction.state, config);
    }
    return value;
  },
  provide: field => EditorView.decorations.from(
    field,
    value => value.decorations,
  ),
});

export function createKnowledgeEmbedField(
  config: KnowledgeEmbedFieldConfig,
): Extension {
  return [
    knowledgeEmbedConfigFacet.of(config),
    knowledgeEmbedField,
  ];
}
