import { SearchQuery } from '@codemirror/search';
import {
  EditorSelection,
  StateEffect,
  StateField,
  Transaction,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  type DecorationSet,
} from '@codemirror/view';

export interface KnowledgeFindMatch {
  from: number;
  to: number;
}

export interface KnowledgeFindOptions {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
}

interface KnowledgeFindHighlightState {
  matches: readonly KnowledgeFindMatch[];
  active: KnowledgeFindMatch | null;
}

interface KnowledgeFindHighlightFieldValue extends KnowledgeFindHighlightState {
  decorations: DecorationSet;
}

const setKnowledgeFindHighlights = StateEffect.define<
  KnowledgeFindHighlightState | null
>();

function sameMatch(
  left: KnowledgeFindMatch | null,
  right: KnowledgeFindMatch,
): boolean {
  return Boolean(
    left
    && left.from === right.from
    && left.to === right.to,
  );
}

function buildDecorations(
  state: EditorState,
  value: KnowledgeFindHighlightState | null,
): DecorationSet {
  if (!value) return Decoration.none;
  const ranges = value.matches
    .filter(match => (
      match.from >= 0
      && match.to > match.from
      && match.to <= state.doc.length
    ))
    .map(match => Decoration.mark({
      class: sameMatch(value.active, match)
        ? 'cm-knowledge-find-match cm-knowledge-find-match-current'
        : 'cm-knowledge-find-match',
    }).range(match.from, match.to));
  return Decoration.set(ranges, true);
}

function emptyHighlightState(): KnowledgeFindHighlightFieldValue {
  return {
    matches: [],
    active: null,
    decorations: Decoration.none,
  };
}

function mapMatch(
  transaction: Transaction,
  match: KnowledgeFindMatch,
): KnowledgeFindMatch {
  return {
    from: transaction.changes.mapPos(match.from, 1),
    to: transaction.changes.mapPos(match.to, -1),
  };
}

const knowledgeFindHighlightField = StateField.define<
  KnowledgeFindHighlightFieldValue
>({
  create: emptyHighlightState,
  update(value, transaction) {
    let next: KnowledgeFindHighlightFieldValue = transaction.docChanged
      ? {
        matches: value.matches.map(match => mapMatch(transaction, match)),
        active: value.active ? mapMatch(transaction, value.active) : null,
        decorations: value.decorations.map(transaction.changes),
      }
      : value;
    for (const effect of transaction.effects) {
      if (effect.is(setKnowledgeFindHighlights)) {
        next = effect.value
          ? {
            ...effect.value,
            decorations: buildDecorations(transaction.state, effect.value),
          }
          : emptyHighlightState();
      }
    }
    return next;
  },
  provide: field => EditorView.decorations.from(
    field,
    value => value.decorations,
  ),
});

export const knowledgeFindHighlightExtension: Extension = [
  knowledgeFindHighlightField,
];

function createSearchQuery(options: KnowledgeFindOptions): SearchQuery {
  return new SearchQuery({
    search: options.query,
    caseSensitive: options.caseSensitive,
    literal: true,
    regexp: false,
    wholeWord: options.wholeWord,
  });
}

export function findKnowledgeMatches(
  state: EditorState,
  options: KnowledgeFindOptions,
): KnowledgeFindMatch[] {
  if (!options.query || /[\r\n]/u.test(options.query)) return [];
  const cursor = createSearchQuery(options).getCursor(state);
  const matches: KnowledgeFindMatch[] = [];
  for (;;) {
    const next = cursor.next();
    if (next.done) break;
    matches.push(next.value);
  }
  return matches;
}

export function initialKnowledgeFindQuery(view: EditorView | null): string {
  if (!view) return '';
  const selection = view.state.selection.main;
  if (selection.empty) return '';
  const selected = view.state.sliceDoc(selection.from, selection.to);
  return /[\r\n]/u.test(selected) ? '' : selected;
}

export function chooseKnowledgeFindMatch(
  matches: readonly KnowledgeFindMatch[],
  position: number,
): number {
  if (matches.length === 0) return -1;
  const containing = matches.findIndex(match => (
    position >= match.from && position < match.to
  ));
  if (containing >= 0) return containing;
  const following = matches.findIndex(match => match.from >= position);
  return following >= 0 ? following : 0;
}

export function chooseKnowledgeFindMatchAfter(
  matches: readonly KnowledgeFindMatch[],
  position: number,
): number {
  if (matches.length === 0) return -1;
  const following = matches.findIndex(match => match.from >= position);
  return following >= 0 ? following : 0;
}

export function applyKnowledgeFindHighlights(
  view: EditorView,
  matches: readonly KnowledgeFindMatch[],
  activeIndex: number,
): void {
  view.dispatch({
    effects: setKnowledgeFindHighlights.of({
      matches,
      active: matches[activeIndex] ?? null,
    }),
  });
}

export function clearKnowledgeFindHighlights(view: EditorView): void {
  view.dispatch({
    effects: setKnowledgeFindHighlights.of(null),
  });
}

export function getActiveKnowledgeFindHighlight(
  view: EditorView,
): KnowledgeFindMatch | null {
  return view.state.field(knowledgeFindHighlightField, false)?.active ?? null;
}

export function activateKnowledgeFindMatch(
  view: EditorView,
  match: KnowledgeFindMatch,
  overlayHeight = 0,
): void {
  const yMargin = Math.max(5, Math.ceil(overlayHeight) + 8);
  view.dispatch({
    selection: EditorSelection.single(match.from, match.to),
    effects: EditorView.scrollIntoView(
      EditorSelection.range(match.from, match.to),
      { y: 'nearest', yMargin },
    ),
  });
}

export function replaceKnowledgeFindMatch(
  view: EditorView,
  match: KnowledgeFindMatch,
  replacement: string,
): number {
  const cursor = match.from + replacement.length;
  view.dispatch({
    changes: {
      from: match.from,
      to: match.to,
      insert: replacement,
    },
    selection: EditorSelection.cursor(cursor),
    annotations: Transaction.userEvent.of('input.replace'),
  });
  return cursor;
}

export function replaceAllKnowledgeFindMatches(
  view: EditorView,
  matches: readonly KnowledgeFindMatch[],
  replacement: string,
): void {
  if (matches.length === 0) return;
  view.dispatch({
    changes: matches.map(match => ({
      from: match.from,
      to: match.to,
      insert: replacement,
    })),
    annotations: Transaction.userEvent.of('input.replace.all'),
  });
}
