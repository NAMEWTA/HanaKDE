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
  collectKnowledgeRawHtmlElements,
  openKnowledgeExternalLink,
  prepareKnowledgeSafeHtml,
  type KnowledgeRawHtmlElement,
  type KnowledgeSafeAsset,
  type KnowledgeSafeHtmlResult,
} from '../utils/knowledge-safe-rendering';
import { renderMermaidSvg } from '../utils/mermaid-renderer';
import { selectionTouchesRange } from './knowledge-live-preview';

export interface KnowledgeSafeHtmlAssetReadResult {
  readonly content: string;
  readonly encoding: 'base64';
  readonly expectedSize?: number;
}

export type KnowledgeSafeHtmlLinkActivation =
  | Readonly<{ kind: 'external'; url: string }>
  | Readonly<{
      kind: 'internal';
      address: KnowledgeResourceAddress;
      fragment: string | null;
    }>;

export interface KnowledgeSafeHtmlFieldConfig {
  readonly pageAddress: KnowledgeResourceAddress;
  readonly readAsset?: (
    address: KnowledgeResourceAddress,
    options: { signal: AbortSignal },
  ) => Promise<KnowledgeSafeHtmlAssetReadResult>;
  readonly onActivateLink?: (
    activation: KnowledgeSafeHtmlLinkActivation,
  ) => void | Promise<void>;
}

const knowledgeSafeHtmlConfigFacet = Facet.define<
  KnowledgeSafeHtmlFieldConfig,
  KnowledgeSafeHtmlFieldConfig | null
>({
  combine(values) {
    return values[0] ?? null;
  },
});

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  ogv: 'video/ogg',
  webm: 'video/webm',
};

function translated(key: string, fallback: string): string {
  const value = window.t?.(key);
  return value && value !== key ? value : fallback;
}

function extensionOf(address: KnowledgeResourceAddress): string {
  const name = address.relativePath.split('/').at(-1) ?? '';
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

function assetMime(asset: KnowledgeSafeAsset): string | null {
  const mime = MIME_BY_EXTENSION[extensionOf(asset.address)];
  if (!mime) return null;
  if (asset.element === 'img' && mime.startsWith('image/')) return mime;
  if (asset.element === 'audio' && mime.startsWith('audio/')) return mime;
  if (asset.element === 'video' && mime.startsWith('video/')) return mime;
  return null;
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function revealSource(
  view: EditorView,
  element: KnowledgeRawHtmlElement,
): void {
  view.dispatch({
    selection: { anchor: element.from },
    scrollIntoView: true,
  });
  view.focus();
}

class KnowledgeSafeHtmlWidget extends WidgetType {
  private readonly controllers = new Set<AbortController>();
  private readonly objectUrls = new Set<string>();

  constructor(
    readonly element: KnowledgeRawHtmlElement,
    readonly result: KnowledgeSafeHtmlResult,
    readonly config: KnowledgeSafeHtmlFieldConfig,
  ) {
    super();
  }

  eq(other: KnowledgeSafeHtmlWidget): boolean {
    return this.element.from === other.element.from
      && this.element.to === other.element.to
      && this.element.source === other.element.source
      && this.result.status === other.result.status
      && this.config === other.config;
  }

  ignoreEvent(): boolean {
    return false;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement(this.element.block ? 'div' : 'span');
    wrapper.className = [
      'cm-knowledge-safe-html',
      this.element.block ? 'cm-knowledge-safe-html-block' : 'cm-knowledge-safe-html-inline',
      this.result.status === 'blocked' ? 'is-error' : 'is-rendered',
    ].join(' ');
    wrapper.tabIndex = 0;

    if (this.result.status === 'blocked') {
      wrapper.setAttribute('role', 'button');
      wrapper.setAttribute(
        'aria-label',
        translated(
          'knowledge.html.unsafeEditSource',
          'HTML was not safely rendered. Activate to edit its source.',
        ),
      );
      wrapper.textContent = translated(
        'knowledge.html.unsafe',
        'HTML was not safely rendered',
      );
    } else {
      wrapper.setAttribute('role', 'group');
      wrapper.setAttribute(
        'aria-label',
        translated(
          'knowledge.html.preview',
          'Safe HTML preview. Activate its background to edit the source.',
        ),
      );
      wrapper.innerHTML = this.result.html;
      this.installLinks(wrapper);
      this.installAssets(wrapper, this.result.assets);
      this.installMermaid(wrapper);
    }

    wrapper.addEventListener('mousedown', event => {
      if (event.target !== wrapper) return;
      event.preventDefault();
      event.stopPropagation();
      revealSource(view, this.element);
    });
    wrapper.addEventListener('keydown', event => {
      const keyboardEvent = event as KeyboardEvent;
      if (
        event.target !== wrapper
        || (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ')
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      revealSource(view, this.element);
    });
    if (this.result.status === 'blocked') {
      wrapper.addEventListener('focus', () => revealSource(view, this.element), {
        once: true,
      });
    }
    return wrapper;
  }

  destroy(): void {
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.clear();
  }

  private installLinks(wrapper: HTMLElement): void {
    for (const link of wrapper.querySelectorAll<HTMLElement>(
      '[data-knowledge-link-kind]',
    )) {
      link.tabIndex = 0;
      link.setAttribute('role', 'link');
      const activate = () => {
        if (link.dataset.knowledgeLinkKind === 'external') {
          const url = link.dataset.knowledgeUrl ?? '';
          if (this.config.onActivateLink) {
            void this.config.onActivateLink({ kind: 'external', url });
          } else {
            openKnowledgeExternalLink(url);
          }
          return;
        }
        const sourceKey = link.dataset.knowledgeSourceKey;
        const relativePath = link.dataset.knowledgeRelativePath;
        if (!sourceKey || !relativePath || !this.config.onActivateLink) return;
        void this.config.onActivateLink({
          kind: 'internal',
          address: { sourceKey, relativePath },
          fragment: link.dataset.knowledgeFragment ?? null,
        });
      };
      link.addEventListener('click', event => {
        if ((event as MouseEvent).button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        activate();
      });
      link.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        activate();
      });
    }
  }

  private installAssets(
    wrapper: HTMLElement,
    assets: readonly KnowledgeSafeAsset[],
  ): void {
    for (const asset of assets) {
      const placeholder = wrapper.querySelector<HTMLElement>(
        `[data-knowledge-asset-id="${asset.id}"]`,
      );
      if (!placeholder) continue;
      placeholder.className = 'cm-knowledge-safe-html-asset';
      placeholder.textContent = translated(
        'knowledge.html.assetLoading',
        'Loading local asset…',
      );
      const mime = assetMime(asset);
      if (!mime || !this.config.readAsset) {
        this.showAssetError(placeholder);
        continue;
      }
      const controller = new AbortController();
      this.controllers.add(controller);
      void this.config.readAsset(asset.address, {
        signal: controller.signal,
      }).then(result => {
        if (controller.signal.aborted) return;
        const bytes = result.encoding === 'base64'
          ? decodeBase64(result.content)
          : null;
        if (
          !bytes
          || (
            result.expectedSize !== undefined
            && bytes.byteLength !== result.expectedSize
          )
        ) {
          this.showAssetError(placeholder);
          return;
        }
        const buffer = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(buffer).set(bytes);
        const url = URL.createObjectURL(new Blob([buffer], { type: mime }));
        this.objectUrls.add(url);
        const media = document.createElement(asset.element);
        media.src = url;
        if (asset.element === 'img') {
          media.setAttribute('alt', asset.alt);
          media.setAttribute('loading', 'lazy');
          media.setAttribute('decoding', 'async');
        } else {
          media.setAttribute('controls', '');
          media.removeAttribute('autoplay');
        }
        placeholder.replaceChildren(media);
        placeholder.removeAttribute('role');
      }).catch(() => {
        if (!controller.signal.aborted) this.showAssetError(placeholder);
      }).finally(() => {
        this.controllers.delete(controller);
      });
    }
  }

  private installMermaid(wrapper: HTMLElement): void {
    for (const diagram of wrapper.querySelectorAll<HTMLElement>('.mermaid-diagram')) {
      const source = diagram.querySelector<HTMLElement>(
        '.mermaid-source code',
      )?.textContent ?? '';
      const rendered = diagram.querySelector<HTMLElement>('.mermaid-rendered');
      if (!source.trim() || !rendered) continue;
      const controller = new AbortController();
      this.controllers.add(controller);
      void renderMermaidSvg(source, controller.signal).then(result => {
        if (controller.signal.aborted || result.status === 'cancelled') return;
        if (result.status === 'error') {
          diagram.classList.add('is-error');
          rendered.textContent = translated(
            'knowledge.mermaid.renderError',
            'Mermaid diagram could not be rendered. Edit the source to fix it.',
          );
          return;
        }
        rendered.innerHTML = result.svg;
        diagram.querySelector<HTMLElement>('.mermaid-source')
          ?.setAttribute('hidden', '');
        diagram.classList.add('is-rendered');
      }).finally(() => {
        this.controllers.delete(controller);
      });
    }
  }

  private showAssetError(placeholder: HTMLElement): void {
    placeholder.classList.add('is-error');
    placeholder.setAttribute('role', 'status');
    placeholder.textContent = translated(
      'knowledge.html.assetUnavailable',
      'Local asset is unavailable',
    );
  }
}

function buildDecorations(state: EditorState): DecorationSet {
  const config = state.facet(knowledgeSafeHtmlConfigFacet);
  if (!config) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  for (const element of collectKnowledgeRawHtmlElements(state.doc.toString())) {
    if (selectionTouchesRange(state, element.from, element.to)) continue;
    const result = prepareKnowledgeSafeHtml(element.source, config.pageAddress);
    builder.add(
      element.from,
      element.to,
      Decoration.replace({
        widget: new KnowledgeSafeHtmlWidget(element, result, config),
        block: element.block,
      }),
    );
  }
  return builder.finish();
}

const knowledgeSafeHtmlField = StateField.define<DecorationSet>({
  create: buildDecorations,
  update(value, transaction: Transaction) {
    if (transaction.docChanged || transaction.selection) {
      return buildDecorations(transaction.state);
    }
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});

export function createKnowledgeSafeHtmlField(
  config: KnowledgeSafeHtmlFieldConfig,
): Extension {
  return [
    knowledgeSafeHtmlConfigFacet.of(config),
    knowledgeSafeHtmlField,
  ];
}
