import {
  Facet,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import type {
  KnowledgeResourceAddress,
} from '../../../../shared/knowledge-workspace-contract.ts';
import {
  parseMarkdownKnowledgeIr,
  type MarkdownLinkToken,
  type MarkdownWikilinkToken,
} from '../../../../lib/knowledge-workspace/markdown-knowledge-ir.ts';
import { selectionTouchesRange } from './knowledge-live-preview';
import {
  formatKnowledgeWikilink,
  resolveKnowledgeMarkdownDestination,
  resolveKnowledgeWikilink,
  type KnowledgeLinkResolution,
} from '../../../../lib/knowledge-workspace/link-resolver.ts';

export type KnowledgeLinkAvailability =
  | 'checking'
  | 'available'
  | 'missing'
  | 'unavailable';

export interface KnowledgeLinkActivation {
  kind: 'internal' | 'external';
  sourceKind: 'wikilink' | 'markdown_link' | 'html';
  embedded: boolean;
  address?: KnowledgeResourceAddress;
  fragment?: string | null;
  url?: string;
  availability?: Exclude<KnowledgeLinkAvailability, 'checking'>;
}

export interface KnowledgeLinkLabels {
  internal(
    address: KnowledgeResourceAddress,
    availability: KnowledgeLinkAvailability,
  ): string;
  external(url: string): string;
  broken(reason: Extract<KnowledgeLinkResolution, { kind: 'broken' }>['reason']): string;
}

export interface KnowledgeLinkFieldConfig {
  pageAddress: KnowledgeResourceAddress;
  checkAddress?: (
    address: KnowledgeResourceAddress,
    options: { signal: AbortSignal },
  ) => Promise<boolean>;
  onActivate?: (activation: KnowledgeLinkActivation) => void | Promise<void>;
  labels?: Partial<KnowledgeLinkLabels>;
}

export interface KnowledgeLinkFieldEntry {
  id: string;
  from: number;
  to: number;
  visibleFrom: number;
  visibleTo: number;
  sourceKind: 'wikilink' | 'markdown_link';
  embedded: boolean;
  resolution: KnowledgeLinkResolution;
  availability: KnowledgeLinkAvailability | null;
}

export type KnowledgeWikilinkInsertionResult =
  | Readonly<{ ok: true; value: string }>
  | Readonly<{ ok: false; reason: 'invalid_address' | 'out_of_scope' }>;

export function createKnowledgeWikilinkInsertion(
  page: KnowledgeResourceAddress,
  target: KnowledgeResourceAddress,
  options: { embedded?: boolean; fragment?: string } = {},
): KnowledgeWikilinkInsertionResult {
  const formatted = formatKnowledgeWikilink(page, target, options.fragment);
  if (!formatted.ok) return formatted;
  return {
    ok: true,
    value: `${options.embedded ? '!' : ''}[[${formatted.value}]]`,
  };
}

interface KnowledgeLinkFieldValue {
  entries: readonly KnowledgeLinkFieldEntry[];
  decorations: DecorationSet;
}

interface AvailabilityEffectValue {
  id: string;
  availability: Exclude<KnowledgeLinkAvailability, 'checking'>;
}

const defaultLabels: KnowledgeLinkLabels = {
  internal: (address, availability) => (
    availability === 'missing'
      ? `Missing knowledge link: ${address.relativePath}`
      : availability === 'unavailable'
        ? `Unavailable knowledge link: ${address.relativePath}`
        : `Open knowledge link: ${address.relativePath}`
  ),
  external: url => `Open external link: ${url}`,
  broken: reason => `Invalid knowledge link: ${reason}`,
};

const knowledgeLinkConfigFacet = Facet.define<
  KnowledgeLinkFieldConfig,
  KnowledgeLinkFieldConfig | null
>({
  combine(values) {
    return values[0] ?? null;
  },
});

const setKnowledgeLinkAvailability = StateEffect.define<AvailabilityEffectValue>();

function entryId(
  token: MarkdownWikilinkToken | MarkdownLinkToken,
): string {
  return `${token.kind}:${token.range.from}:${token.range.to}`;
}

function wikilinkVisibleRange(
  token: MarkdownWikilinkToken,
): { from: number; to: number } {
  if (token.displayRange) return token.displayRange;
  return {
    from: token.addressRange.from,
    to: token.fragmentRange?.to ?? token.addressRange.to,
  };
}

function parseEntries(
  source: string,
  config: KnowledgeLinkFieldConfig,
): KnowledgeLinkFieldEntry[] {
  const entries: KnowledgeLinkFieldEntry[] = [];
  for (const token of parseMarkdownKnowledgeIr(source).tokens) {
    if (token.kind === 'wikilink') {
      const visible = wikilinkVisibleRange(token);
      const resolution = resolveKnowledgeWikilink(config.pageAddress, {
        address: token.address,
        fragment: token.fragment,
      });
      entries.push({
        id: entryId(token),
        from: token.range.from,
        to: token.range.to,
        visibleFrom: visible.from,
        visibleTo: visible.to,
        sourceKind: token.kind,
        embedded: token.embedded,
        resolution,
        availability: resolution.kind === 'internal'
          ? config.checkAddress ? 'checking' : 'available'
          : null,
      });
    } else if (token.kind === 'markdown_link') {
      const resolution = resolveKnowledgeMarkdownDestination(
        config.pageAddress,
        token.destination,
      );
      entries.push({
        id: entryId(token),
        from: token.range.from,
        to: token.range.to,
        visibleFrom: token.labelRange.from,
        visibleTo: token.labelRange.to,
        sourceKind: token.kind,
        embedded: token.embedded,
        resolution,
        availability: resolution.kind === 'internal'
          ? config.checkAddress ? 'checking' : 'available'
          : null,
      });
    }
  }
  return entries;
}

function labelForEntry(
  entry: KnowledgeLinkFieldEntry,
  config: KnowledgeLinkFieldConfig,
): string {
  const labels = { ...defaultLabels, ...config.labels };
  if (entry.resolution.kind === 'internal') {
    return labels.internal(
      entry.resolution.address,
      entry.availability ?? 'unavailable',
    );
  }
  if (entry.resolution.kind === 'external') {
    return labels.external(entry.resolution.url);
  }
  return labels.broken(entry.resolution.reason);
}

function classForEntry(entry: KnowledgeLinkFieldEntry): string {
  const classes = [
    'cm-knowledge-link',
    `cm-knowledge-link-${entry.sourceKind.replace('_', '-')}`,
  ];
  if (entry.embedded) classes.push('cm-knowledge-link-embedded');
  if (entry.resolution.kind === 'external') {
    classes.push('cm-knowledge-link-external');
  } else if (entry.resolution.kind === 'broken') {
    classes.push('cm-knowledge-link-broken');
  } else if (entry.availability === 'missing') {
    classes.push('cm-knowledge-link-broken');
  } else if (entry.availability === 'checking') {
    classes.push('cm-knowledge-link-checking');
  } else if (entry.availability === 'unavailable') {
    classes.push('cm-knowledge-link-unavailable');
  }
  return classes.join(' ');
}

function buildDecorations(
  entries: readonly KnowledgeLinkFieldEntry[],
  config: KnowledgeLinkFieldConfig,
  state: EditorState,
): DecorationSet {
  const ranges: Array<{
    from: number;
    to: number;
    decoration: Decoration;
  }> = [];
  for (const entry of entries) {
    if (selectionTouchesRange(state, entry.from, entry.to)) continue;
    if (entry.sourceKind === 'wikilink') {
      if (entry.from < entry.visibleFrom) {
        ranges.push({
          from: entry.from,
          to: entry.visibleFrom,
          decoration: Decoration.replace({}),
        });
      }
      if (entry.visibleTo < entry.to) {
        ranges.push({
          from: entry.visibleTo,
          to: entry.to,
          decoration: Decoration.replace({}),
        });
      }
    }
    const disabled = entry.resolution.kind === 'broken'
      || entry.availability === 'unavailable';
    ranges.push({
      from: entry.visibleFrom,
      to: entry.visibleTo,
      decoration: Decoration.mark({
        class: classForEntry(entry),
        attributes: {
          role: 'link',
          tabindex: '0',
          'aria-label': labelForEntry(entry, config),
          'aria-disabled': disabled ? 'true' : 'false',
          'data-knowledge-link-id': entry.id,
        },
      }),
    });
  }
  ranges.sort((left, right) => (
    left.from - right.from
    || left.to - right.to
    || left.decoration.startSide - right.decoration.startSide
  ));
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of ranges) {
    builder.add(range.from, range.to, range.decoration);
  }
  return builder.finish();
}

function createFieldValue(
  state: EditorState,
  config: KnowledgeLinkFieldConfig | null,
): KnowledgeLinkFieldValue {
  if (!config) {
    return { entries: [], decorations: Decoration.none };
  }
  const entries = parseEntries(state.doc.toString(), config);
  return {
    entries,
    decorations: buildDecorations(entries, config, state),
  };
}

export const knowledgeLinkField = StateField.define<KnowledgeLinkFieldValue>({
  create(state) {
    return createFieldValue(
      state,
      state.facet(knowledgeLinkConfigFacet),
    );
  },
  update(value, transaction) {
    const config = transaction.state.facet(knowledgeLinkConfigFacet);
    if (transaction.docChanged || !config) {
      return createFieldValue(transaction.state, config);
    }
    let entries: readonly KnowledgeLinkFieldEntry[] = value.entries;
    for (const effect of transaction.effects) {
      if (!effect.is(setKnowledgeLinkAvailability)) continue;
      entries = entries.map(entry => (
        entry.id === effect.value.id && entry.resolution.kind === 'internal'
          ? { ...entry, availability: effect.value.availability }
          : entry
      ));
    }
    if (entries === value.entries && !transaction.selection) return value;
    return {
      entries,
      decorations: buildDecorations(entries, config, transaction.state),
    };
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations),
});

export function getKnowledgeLinkEntries(
  state: EditorState,
): readonly KnowledgeLinkFieldEntry[] {
  return state.field(knowledgeLinkField, false)?.entries ?? [];
}

function linkElementFromEvent(event: Event): HTMLElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>('[data-knowledge-link-id]');
}

function entryFromEvent(
  event: Event,
  view: EditorView,
): KnowledgeLinkFieldEntry | null {
  const id = linkElementFromEvent(event)?.dataset.knowledgeLinkId;
  if (!id) return null;
  return getKnowledgeLinkEntries(view.state).find(entry => entry.id === id) ?? null;
}

function activateEntry(
  entry: KnowledgeLinkFieldEntry,
  config: KnowledgeLinkFieldConfig | null,
): boolean {
  if (!config?.onActivate) return false;
  if (entry.resolution.kind === 'external') {
    void config.onActivate({
      kind: 'external',
      sourceKind: entry.sourceKind,
      embedded: entry.embedded,
      url: entry.resolution.url,
    });
    return true;
  }
  if (
    entry.resolution.kind !== 'internal'
    || entry.availability === 'checking'
    || entry.availability === 'unavailable'
  ) {
    return false;
  }
  void config.onActivate({
    kind: 'internal',
    sourceKind: entry.sourceKind,
    embedded: entry.embedded,
    address: entry.resolution.address,
    fragment: entry.resolution.fragment,
    availability: entry.availability ?? 'available',
  });
  return true;
}

const knowledgeLinkInteraction = EditorView.domEventHandlers({
  click(event, view) {
    if (event.button !== 0) return false;
    const entry = entryFromEvent(event, view);
    if (!entry) return false;
    return activateEntry(entry, view.state.facet(knowledgeLinkConfigFacet));
  },
  keydown(event, view) {
    if (event.key !== 'Enter' && event.key !== ' ') return false;
    const entry = entryFromEvent(event, view);
    if (!entry) return false;
    const activated = activateEntry(
      entry,
      view.state.facet(knowledgeLinkConfigFacet),
    );
    if (activated) event.preventDefault();
    return activated;
  },
});

const knowledgeLinkAvailabilityPlugin = ViewPlugin.fromClass(class {
  private readonly controllers = new Map<string, AbortController>();

  constructor(private readonly view: EditorView) {
    this.refresh();
  }

  update(update: ViewUpdate) {
    if (update.docChanged) this.abortAll();
    this.refresh();
  }

  destroy() {
    this.abortAll();
  }

  private abortAll() {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
  }

  private refresh() {
    const config = this.view.state.facet(knowledgeLinkConfigFacet);
    if (!config?.checkAddress) return;
    for (const entry of getKnowledgeLinkEntries(this.view.state)) {
      if (
        entry.resolution.kind !== 'internal'
        || entry.availability !== 'checking'
        || this.controllers.has(entry.id)
      ) {
        continue;
      }
      const controller = new AbortController();
      const address = entry.resolution.address;
      this.controllers.set(entry.id, controller);
      void Promise.resolve().then(() => config.checkAddress?.(
        address,
        { signal: controller.signal },
      ) ?? false).then(
        exists => this.complete(entry.id, exists ? 'available' : 'missing', controller),
        () => this.complete(entry.id, 'unavailable', controller),
      );
    }
  }

  private complete(
    id: string,
    availability: Exclude<KnowledgeLinkAvailability, 'checking'>,
    controller: AbortController,
  ) {
    if (controller.signal.aborted || this.controllers.get(id) !== controller) return;
    this.controllers.delete(id);
    this.view.dispatch({
      effects: setKnowledgeLinkAvailability.of({ id, availability }),
    });
  }
});

export function createKnowledgeLinkField(
  config: KnowledgeLinkFieldConfig,
): Extension {
  return [
    knowledgeLinkConfigFacet.of(config),
    knowledgeLinkField,
    knowledgeLinkAvailabilityPlugin,
    knowledgeLinkInteraction,
  ];
}
