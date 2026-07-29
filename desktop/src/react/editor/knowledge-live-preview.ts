import {
  Compartment,
  Facet,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export type KnowledgeMarkdownViewMode = 'live-preview' | 'source';

export type KnowledgeMarkdownModeChangeResult =
  | 'changed'
  | 'unchanged'
  | 'unavailable'
  | 'failed';

const knowledgeMarkdownViewModeFacet = Facet.define<
  KnowledgeMarkdownViewMode,
  KnowledgeMarkdownViewMode
>({
  combine(values) {
    return values[0] ?? 'live-preview';
  },
});

export function knowledgeMarkdownModeExtensions(
  mode: KnowledgeMarkdownViewMode,
  livePreviewExtensions: readonly Extension[],
): Extension {
  return [
    knowledgeMarkdownViewModeFacet.of(mode),
    ...(mode === 'live-preview' ? livePreviewExtensions : []),
  ];
}

export function getKnowledgeMarkdownViewMode(
  state: EditorState,
): KnowledgeMarkdownViewMode {
  return state.facet(knowledgeMarkdownViewModeFacet);
}

export function activeLineNumbers(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const start = state.doc.lineAt(range.from).number;
    const lineAtTo = state.doc.lineAt(range.to);
    const effectiveTo = (
      !range.empty
      && range.to > range.from
      && lineAtTo.from === range.to
    )
      ? range.to - 1
      : range.to;
    const end = state.doc.lineAt(Math.max(range.from, effectiveTo)).number;
    for (let line = start; line <= end; line += 1) lines.add(line);
  }
  return lines;
}

export function selectionTouchesRange(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  return state.selection.ranges.some(range => (
    range.empty
      ? range.head >= from && range.head < to
      : range.from < to && range.to > from
  ));
}

export function selectionSourceRanges(
  state: EditorState,
): readonly Readonly<{ from: number; to: number }>[] {
  return state.selection.ranges.map(range => ({
    from: range.from,
    to: range.to,
  }));
}

function restoreScroll(view: EditorView, top: number, left: number): void {
  view.scrollDOM.scrollTop = top;
  view.scrollDOM.scrollLeft = left;
}

export function reconfigureKnowledgeMarkdownMode(
  view: EditorView | null,
  compartment: Compartment,
  mode: KnowledgeMarkdownViewMode,
  livePreviewExtensions: readonly Extension[],
): KnowledgeMarkdownModeChangeResult {
  if (!view) return 'unavailable';
  if (getKnowledgeMarkdownViewMode(view.state) === mode) return 'unchanged';
  const top = view.scrollDOM.scrollTop;
  const left = view.scrollDOM.scrollLeft;
  try {
    view.dispatch({
      effects: compartment.reconfigure(
        knowledgeMarkdownModeExtensions(mode, livePreviewExtensions),
      ),
    });
  } catch {
    restoreScroll(view, top, left);
    return 'failed';
  }
  restoreScroll(view, top, left);
  queueMicrotask(() => restoreScroll(view, top, left));
  return 'changed';
}
