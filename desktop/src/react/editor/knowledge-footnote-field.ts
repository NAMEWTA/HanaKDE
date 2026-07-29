import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionSource,
} from '@codemirror/autocomplete';
import {
  EditorState,
  StateField,
  type Extension,
  type Range,
  type Transaction,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';
import {
  parseMarkdownKnowledgeIr,
  type MarkdownFootnoteDefinitionToken,
  type MarkdownFootnoteReferenceToken,
  type MarkdownInlineFootnoteToken,
  type MarkdownKnowledgeToken,
} from '../../../../lib/knowledge-workspace/markdown-knowledge-ir';
import { renderMarkdown } from '../utils/markdown';
import { sanitizeMarkdownPreviewHtml } from '../utils/markdown-html-sanitizer';
import { selectionTouchesRange } from './knowledge-live-preview';

export interface KnowledgeFootnoteModel {
  readonly definitions: readonly MarkdownFootnoteDefinitionToken[];
  readonly references: readonly MarkdownFootnoteReferenceToken[];
  readonly inlineFootnotes: readonly MarkdownInlineFootnoteToken[];
}

type FootnoteMarker = {
  readonly kind: 'reference' | 'inline';
  readonly from: number;
  readonly to: number;
  readonly number: number;
  readonly label?: string;
  readonly content?: string;
  readonly definitionFrom?: number;
};

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

function tokensOfKind<Kind extends MarkdownKnowledgeToken['kind']>(
  tokens: readonly MarkdownKnowledgeToken[],
  kind: Kind,
): Extract<MarkdownKnowledgeToken, { kind: Kind }>[] {
  return tokens.filter(
    (token): token is Extract<MarkdownKnowledgeToken, { kind: Kind }> => (
      token.kind === kind
    ),
  );
}

export function collectKnowledgeFootnotes(source: string): KnowledgeFootnoteModel {
  const tokens = parseMarkdownKnowledgeIr(source).tokens;
  return {
    definitions: tokensOfKind(tokens, 'footnote_definition'),
    references: tokensOfKind(tokens, 'footnote_reference'),
    inlineFootnotes: tokensOfKind(tokens, 'inline_footnote'),
  };
}

function renderStaticFootnoteContent(content: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'cm-footnote-tooltip-content';
  const template = document.createElement('template');
  try {
    template.innerHTML = sanitizeMarkdownPreviewHtml(renderMarkdown(content));
  } catch {
    wrapper.classList.add('is-error');
    wrapper.textContent = content;
    return wrapper;
  }
  template.content.querySelectorAll(
    'section.footnotes, img, audio, video, source, iframe, object, embed',
  ).forEach(element => element.remove());
  wrapper.appendChild(template.content.cloneNode(true));
  wrapper.querySelectorAll<HTMLElement>('a, input, details, summary').forEach(element => {
    element.tabIndex = -1;
  });
  return wrapper;
}

class KnowledgeFootnoteMarkerWidget extends WidgetType {
  constructor(readonly marker: FootnoteMarker) {
    super();
  }

  eq(other: KnowledgeFootnoteMarkerWidget): boolean {
    return this.marker.kind === other.marker.kind
      && this.marker.from === other.marker.from
      && this.marker.to === other.marker.to
      && this.marker.number === other.marker.number
      && this.marker.label === other.marker.label
      && this.marker.content === other.marker.content
      && this.marker.definitionFrom === other.marker.definitionFrom;
  }

  toDOM(view: EditorView): HTMLElement {
    const missing = this.marker.kind === 'reference'
      && this.marker.definitionFrom === undefined;
    const marker = document.createElement('span');
    marker.className = [
      'cm-footnote-marker',
      this.marker.kind === 'inline'
        ? 'cm-footnote-marker-inline'
        : 'cm-footnote-marker-reference',
      missing ? 'is-error' : '',
    ].filter(Boolean).join(' ');
    marker.tabIndex = 0;
    marker.setAttribute('role', 'button');

    const label = this.marker.label ?? String(this.marker.number);
    const tooltipId = `cm-footnote-tooltip-${this.marker.from}-${this.marker.to}`;
    const actionLabel = missing
      ? translated(
          'knowledge.footnote.missingDefinition',
          'Footnote [^{label}] has no definition. Activate to edit its source.',
          { label },
        )
      : this.marker.kind === 'inline'
        ? translated(
            'knowledge.footnote.editInline',
            'Inline footnote {number}. Activate to edit its source.',
            { number: this.marker.number },
          )
        : translated(
            'knowledge.footnote.jumpToDefinition',
            'Footnote [^{label}]. Activate to jump to its definition.',
            { label },
          );
    marker.setAttribute('aria-label', actionLabel);
    marker.setAttribute('aria-describedby', tooltipId);

    const glyph = document.createElement('sup');
    glyph.className = 'cm-footnote-marker-glyph';
    glyph.textContent = missing ? '!' : String(this.marker.number);
    marker.appendChild(glyph);

    const tooltip = document.createElement('span');
    tooltip.id = tooltipId;
    tooltip.className = 'cm-footnote-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    if (missing) {
      tooltip.textContent = translated(
        'knowledge.footnote.missingDefinition',
        'Footnote [^{label}] has no definition. Activate to edit its source.',
        { label },
      );
    } else {
      tooltip.appendChild(renderStaticFootnoteContent(this.marker.content ?? ''));
    }
    marker.appendChild(tooltip);

    const showTooltip = () => {
      tooltip.hidden = false;
    };
    const hideTooltip = () => {
      tooltip.hidden = true;
    };
    marker.addEventListener('mouseenter', showTooltip);
    marker.addEventListener('mouseleave', hideTooltip);
    marker.addEventListener('focus', showTooltip);
    marker.addEventListener('blur', hideTooltip);

    const activate = (revealSource: boolean) => {
      const anchor = revealSource || this.marker.definitionFrom === undefined
        ? this.marker.from
        : this.marker.definitionFrom;
      view.dispatch({
        selection: { anchor },
        scrollIntoView: true,
      });
      view.focus();
    };
    marker.addEventListener('mousedown', event => {
      event.preventDefault();
      event.stopPropagation();
      activate(
        this.marker.kind === 'inline'
        || missing
        || (event as MouseEvent).altKey,
      );
    });
    marker.addEventListener('keydown', event => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      activate(
        this.marker.kind === 'inline'
        || missing
        || keyboardEvent.altKey,
      );
    });
    return marker;
  }
}

class KnowledgeFootnoteDuplicateWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly label: string,
  ) {
    super();
  }

  eq(other: KnowledgeFootnoteDuplicateWidget): boolean {
    return this.from === other.from && this.label === other.label;
  }

  toDOM(view: EditorView): HTMLElement {
    const marker = document.createElement('span');
    marker.className = 'cm-footnote-duplicate';
    marker.tabIndex = 0;
    marker.setAttribute('role', 'button');
    const message = translated(
      'knowledge.footnote.duplicateDefinition',
      'Duplicate footnote definition [^{label}]. The first definition is used.',
      { label: this.label },
    );
    marker.setAttribute('aria-label', message);
    marker.title = message;
    marker.textContent = translated(
      'knowledge.footnote.duplicateBadge',
      'Duplicate footnote',
    );

    const reveal = () => {
      view.dispatch({
        selection: { anchor: this.from },
        scrollIntoView: true,
      });
      view.focus();
    };
    marker.addEventListener('mousedown', event => {
      event.preventDefault();
      event.stopPropagation();
      reveal();
    });
    marker.addEventListener('keydown', event => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      reveal();
    });
    return marker;
  }
}

function numberedMarkers(model: KnowledgeFootnoteModel): FootnoteMarker[] {
  const referenceNumberByLabel = new Map<string, number>();
  const definitionsByFrom = new Map(
    model.definitions
      .filter(definition => !definition.duplicate)
      .map(definition => [definition.range.from, definition] as const),
  );
  const sourceMarkers = [
    ...model.references.map(reference => ({ kind: 'reference' as const, token: reference })),
    ...model.inlineFootnotes.map(token => ({ kind: 'inline' as const, token })),
  ].sort((left, right) => left.token.range.from - right.token.range.from);
  let nextNumber = 1;

  return sourceMarkers.map(item => {
    if (item.kind === 'inline') {
      const number = nextNumber;
      nextNumber += 1;
      return {
        kind: 'inline',
        from: item.token.range.from,
        to: item.token.range.to,
        number,
        content: item.token.content,
      };
    }

    let number = referenceNumberByLabel.get(item.token.label);
    if (number === undefined) {
      number = nextNumber;
      nextNumber += 1;
      referenceNumberByLabel.set(item.token.label, number);
    }
    const definition = item.token.definitionRange
      ? definitionsByFrom.get(item.token.definitionRange.from)
      : undefined;
    return {
      kind: 'reference',
      from: item.token.range.from,
      to: item.token.range.to,
      number,
      label: item.token.label,
      content: definition?.content,
      definitionFrom: definition?.range.from,
    };
  });
}

function buildKnowledgeFootnoteDecorations(state: EditorState): DecorationSet {
  const model = collectKnowledgeFootnotes(state.doc.toString());
  const ranges: Range<Decoration>[] = [];

  for (const definition of model.definitions) {
    const firstLine = state.doc.lineAt(definition.range.from).number;
    const lastLine = state.doc.lineAt(definition.range.to).number;
    for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber += 1) {
      ranges.push(
        Decoration.line({ class: 'cm-footnote-definition-line' })
          .range(state.doc.line(lineNumber).from),
      );
    }
    if (definition.duplicate) {
      ranges.push(
        Decoration.widget({
          widget: new KnowledgeFootnoteDuplicateWidget(
            definition.range.from,
            definition.label,
          ),
          side: 1,
        }).range(definition.range.to),
      );
    }
  }

  for (const marker of numberedMarkers(model)) {
    if (selectionTouchesRange(state, marker.from, marker.to)) continue;
    ranges.push(
      Decoration.replace({
        widget: new KnowledgeFootnoteMarkerWidget(marker),
      }).range(marker.from, marker.to),
    );
  }
  return Decoration.set(ranges, true);
}

export const knowledgeFootnoteField = StateField.define<DecorationSet>({
  create: buildKnowledgeFootnoteDecorations,
  update(value, transaction: Transaction) {
    if (transaction.docChanged || transaction.selection) {
      return buildKnowledgeFootnoteDecorations(transaction.state);
    }
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});

export const knowledgeFootnoteCompletionSource: CompletionSource = (
  context: CompletionContext,
) => {
  if (context.state.readOnly) return null;
  const match = context.matchBefore(/\[\^[^\]\s]*$/u);
  if (!match) return null;

  const ir = parseMarkdownKnowledgeIr(context.state.doc.toString());
  const excluded = ir.tokens.some(token => (
    (
      token.kind === 'frontmatter'
      || token.kind === 'fenced_code'
      || token.kind === 'indented_code'
      || token.kind === 'inline_code'
      || token.kind === 'footnote_definition'
    )
    && match.from >= token.range.from
    && match.from < token.range.to
  ));
  if (excluded) return null;

  const prefix = match.text.slice(2);
  const definitions = tokensOfKind(ir.tokens, 'footnote_definition')
    .filter(definition => !definition.duplicate && definition.label.startsWith(prefix));
  const options: Completion[] = definitions.map(definition => ({
    label: definition.label,
    detail: `[^${definition.label}]`,
    type: 'reference',
    apply(view, _completion, from, to) {
      const inserted = `[^${definition.label}]`;
      view.dispatch({
        changes: { from, to, insert: inserted },
        selection: { anchor: from + inserted.length },
        userEvent: 'input.complete',
      });
    },
  }));
  if (options.length === 0 && !context.explicit) return null;
  return {
    from: match.from,
    options,
    filter: false,
  };
};

export const knowledgeFootnoteCompletion: Extension = [
  autocompletion({
    override: [knowledgeFootnoteCompletionSource],
  }),
];
