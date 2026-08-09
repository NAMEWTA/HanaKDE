import {
  EditorView, ViewPlugin, Decoration, WidgetType,
} from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import {
  Facet,
  RangeSetBuilder,
} from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { hrDecoration } from './widgets/hr';
import { handleBlockquote } from './widgets/blockquote';
import { addImageDecoration, handleImage } from './widgets/image';
import { handleLink } from './widgets/link';
import {
  parseObsidianImageEmbed,
  resolveMarkdownImageSrc,
  type MarkdownImageContext,
} from '../utils/markdown';
import {
  activeLineNumbers,
  selectionSourceRanges,
  selectionTouchesRange,
} from './knowledge-live-preview';

/** @deprecated Import knowledgeMathField from knowledge-math-field instead. */
export { knowledgeMathField as markdownBlockDecoField } from './knowledge-math-field';

export type DecoRange = { from: number; to: number; deco: Decoration };
export type LivePreviewRange =
  | { kind: 'hide'; from: number; to: number }
  | { kind: 'mark'; from: number; to: number; text: string; color?: string };
interface LivePreviewOptions {
  selectionRanges?: readonly Readonly<{ from: number; to: number }>[];
}

export const markdownImageContextFacet = Facet.define<MarkdownImageContext, MarkdownImageContext>({
  combine(values) {
    return values[0] ?? {};
  },
});

export const hideMark = Decoration.replace({});
const centerLineDeco = Decoration.line({ class: 'cm-center-line' });
const unconfirmedHeadingLineDeco = Decoration.line({ class: 'cm-unconfirmed-heading-line' });
const markDeco = Decoration.mark({ class: 'cm-md-mark' });

class ListBulletWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-list-bullet';
    return span;
  }
}
const listBulletDeco = Decoration.replace({ widget: new ListBulletWidget() });
const autolinkDeco = Decoration.mark({ class: 'cm-link-text' });
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?$/;
const RGB_COLOR_RE = /^rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i;
const BG_SPAN_RE = /<span\s+style=(["'])\s*background(?:-color)?\s*:\s*([^;"']+)\s*;?\s*\1>([\s\S]*?)<\/span>/ig;
const FENCE_RE = /^(?: {0,3})(`{3,}|~{3,})/;

export const CONCEAL_MARKS = new Set([
  'HeaderMark', 'EmphasisMark', 'CodeMark', 'StrikethroughMark',
  'LinkMark', 'URL', 'QuoteMark',
]);

export function collectActiveLines(view: EditorView): Set<number> {
  return activeLineNumbers(view.state);
}

function normalizeSafeBackgroundColor(raw: string): string | null {
  const color = raw.trim();
  if (HEX_COLOR_RE.test(color)) return color;
  if (RGB_COLOR_RE.test(color)) return color;
  return null;
}

type InlineRange = { from: number; to: number };

function rangeOverlaps(from: number, to: number, excluded: InlineRange[]): boolean {
  return excluded.some(range => from < range.to && to > range.from);
}

function findNextOutside(line: string, needle: string, from: number, excluded: InlineRange[]): number {
  let index = line.indexOf(needle, from);
  while (index >= 0) {
    if (!rangeOverlaps(index, index + needle.length, excluded)) return index;
    index = line.indexOf(needle, index + needle.length);
  }
  return -1;
}

function collectInlineCodeRanges(line: string): InlineRange[] {
  const ranges: InlineRange[] = [];
  let i = 0;
  while (i < line.length) {
    const start = line.indexOf('`', i);
    if (start < 0) return ranges;
    let tickCount = 1;
    while (line[start + tickCount] === '`') tickCount += 1;
    const fence = '`'.repeat(tickCount);
    const end = line.indexOf(fence, start + tickCount);
    if (end < 0) return ranges;
    ranges.push({ from: start, to: end + tickCount });
    i = end + tickCount;
  }
  return ranges;
}

function collectFenceLineNumbers(src: string): Set<number> {
  const fenced = new Set<number>();
  const lines = src.split('\n');
  let inFence = false;
  let fenceChar: '`' | '~' | null = null;

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const fence = line.match(FENCE_RE);
    if (!inFence && fence) {
      inFence = true;
      fenceChar = fence[1][0] as '`' | '~';
      fenced.add(idx + 1);
      continue;
    }
    if (inFence) {
      fenced.add(idx + 1);
      if (fence && fenceChar === fence[1][0]) {
        inFence = false;
        fenceChar = null;
      }
    }
  }

  return fenced;
}

function sourceRangesTouch(
  from: number,
  to: number,
  selectionRanges: readonly Readonly<InlineRange>[],
): boolean {
  return selectionRanges.some(range => (
    range.from === range.to
      ? range.from >= from && range.from < to
      : range.from < to && range.to > from
  ));
}

function findMarks(
  line: string,
  lineOffset: number,
  ranges: LivePreviewRange[],
  excluded: InlineRange[],
  selectionRanges: readonly Readonly<InlineRange>[],
): void {
  let i = 0;
  while (i < line.length) {
    const start = findNextOutside(line, '==', i, excluded);
    if (start < 0) return;
    const end = findNextOutside(line, '==', start + 2, excluded);
    if (end < 0) return;
    const text = line.slice(start + 2, end);
    const absoluteFrom = lineOffset + start;
    const absoluteTo = lineOffset + end + 2;
    if (text && !sourceRangesTouch(absoluteFrom, absoluteTo, selectionRanges)) {
      ranges.push({ kind: 'hide', from: lineOffset + start, to: lineOffset + start + 2 });
      ranges.push({ kind: 'mark', from: lineOffset + start + 2, to: lineOffset + end, text });
      ranges.push({ kind: 'hide', from: lineOffset + end, to: lineOffset + end + 2 });
    }
    i = end + 2;
  }
}

function findBackgroundSpans(
  line: string,
  lineOffset: number,
  ranges: LivePreviewRange[],
  excluded: InlineRange[],
  selectionRanges: readonly Readonly<InlineRange>[],
): void {
  BG_SPAN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BG_SPAN_RE.exec(line)) !== null) {
    if (rangeOverlaps(match.index, match.index + match[0].length, excluded)) continue;
    if (sourceRangesTouch(
      lineOffset + match.index,
      lineOffset + match.index + match[0].length,
      selectionRanges,
    )) continue;
    const color = normalizeSafeBackgroundColor(match[2]);
    if (!color) continue;
    const openEnd = match.index + match[0].indexOf('>') + 1;
    const closeStart = match.index + match[0].length - '</span>'.length;
    const text = match[3];
    ranges.push({ kind: 'hide', from: lineOffset + match.index, to: lineOffset + openEnd });
    ranges.push({ kind: 'mark', from: lineOffset + openEnd, to: lineOffset + closeStart, text, color });
    ranges.push({ kind: 'hide', from: lineOffset + closeStart, to: lineOffset + match.index + match[0].length });
  }
}

export function collectLivePreviewRanges(
  src: string,
  _activeLines: Set<number>,
  options: LivePreviewOptions = {},
): LivePreviewRange[] {
  const selectionRanges = options.selectionRanges ?? [];
  const lines = src.split('\n');
  const ranges: LivePreviewRange[] = [];
  let offset = 0;
  let inFence = false;
  let fenceChar: '`' | '~' | null = null;
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const fence = line.match(FENCE_RE);
    if (fence) {
      const markerChar = fence[1][0] as '`' | '~';
      if (!inFence) {
        inFence = true;
        fenceChar = markerChar;
      } else if (fenceChar === markerChar) {
        inFence = false;
        fenceChar = null;
      }
      offset += line.length + 1;
      continue;
    }

    if (inFence) {
      offset += line.length + 1;
      continue;
    }

    const inlineCodeRanges = collectInlineCodeRanges(line);
    findMarks(line, offset, ranges, inlineCodeRanges, selectionRanges);
    findBackgroundSpans(line, offset, ranges, inlineCodeRanges, selectionRanges);
    offset += line.length + 1;
  }
  return ranges;
}

function livePreviewDeco(range: LivePreviewRange): DecoRange {
  if (range.kind === 'hide') return { from: range.from, to: range.to, deco: hideMark };
  const deco = range.color
    ? Decoration.mark({
        class: 'cm-md-mark',
        attributes: { style: `--cm-md-mark-bg: ${range.color}` },
      })
    : markDeco;
  return { from: range.from, to: range.to, deco };
}

export function buildMarkdownDecorations(view: EditorView): DecorationSet {
  const activeLines = activeLineNumbers(view.state);
  const selectionRanges = selectionSourceRanges(view.state);
  const ranges: DecoRange[] = [];
  const imageContext = view.state.facet(markdownImageContextFacet);

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from, to,
      enter(node) {
        const line = view.state.doc.lineAt(node.from);
        const isUnconfirmedHeading = /^#{1,6}$/.test(line.text);
        // ── 始终渲染，不再由焦点行改变文档外观 ──
        switch (node.name) {
          case 'ATXHeading1':
            ranges.push({
              from: line.from,
              to: line.from,
              deco: isUnconfirmedHeading ? unconfirmedHeadingLineDeco : centerLineDeco,
            });
            return;
          case 'ATXHeading2': case 'ATXHeading3': case 'ATXHeading4':
          case 'ATXHeading5': case 'ATXHeading6':
            if (isUnconfirmedHeading) {
              ranges.push({ from: line.from, to: line.from, deco: unconfirmedHeadingLineDeco });
            }
            return;
          case 'HorizontalRule':
            if (activeLines.has(line.number)) return;
            ranges.push({ from: node.from, to: node.to, deco: hrDecoration });
            ranges.push({ from: line.from, to: line.from, deco: centerLineDeco });
            return;
          case 'Blockquote':
            handleBlockquote({ view, node, ranges });
            return;
        }

        if (node.name === 'Image') {
          if (!selectionTouchesRange(view.state, node.from, node.to)) {
            handleImage({ view, node, ranges, imageContext });
          }
          return;
        }

        // ── 已成立的语法按节点类型 conceal / replace ──
        switch (node.name) {
          case 'Link':
            if (selectionTouchesRange(view.state, node.from, node.to)) return false;
            handleLink({ view, node, ranges });
            break;
          case 'Autolink': {
            if (selectionTouchesRange(view.state, node.from, node.to)) return false;
            // Autolink <url> — hide angle brackets, keep URL text visible with link style
            const full = view.state.doc.sliceString(node.from, node.to);
            if (full.startsWith('<') && full.endsWith('>')) {
              ranges.push({ from: node.from, to: node.from + 1, deco: hideMark });
              ranges.push({ from: node.from + 1, to: node.to - 1, deco: autolinkDeco });
              ranges.push({ from: node.to - 1, to: node.to, deco: hideMark });
            }
            return false; // prevent child URL/LinkMark from being concealed
          }
          case 'URL': {
            const parent = node.node.parent;
            const parentName = parent?.name;
            const isDestination = parentName === 'Link' || parentName === 'Image';
            if (
              isDestination
              && parent
              && selectionTouchesRange(view.state, parent.from, parent.to)
            ) break;
            ranges.push({
              from: node.from,
              to: node.to,
              deco: isDestination ? hideMark : autolinkDeco,
            });
            break;
          }
          case 'ListMark': {
            if (activeLines.has(line.number)) break;
            const markText = view.state.doc.sliceString(node.from, node.to);
            if (markText !== '-' && markText !== '*' && markText !== '+') break;
            let hideTo = node.to;
            if (view.state.doc.sliceString(hideTo, hideTo + 1) === ' ') hideTo += 1;
            const rest = view.state.doc.sliceString(node.to, Math.min(node.to + 5, line.to));
            const isTask = /^ ?\[[ xX]\]/.test(rest);
            if (isTask) {
              ranges.push({ from: node.from, to: hideTo, deco: hideMark });
            } else {
              ranges.push({ from: node.from, to: hideTo, deco: listBulletDeco });
            }
            break;
          }
          // conceal marks
          case 'HeaderMark': case 'EmphasisMark': case 'CodeMark':
          case 'StrikethroughMark': case 'LinkMark': case 'QuoteMark': {
            if (
              (node.name === 'HeaderMark' || node.name === 'QuoteMark')
                ? activeLines.has(line.number)
                : selectionTouchesRange(
                    view.state,
                    node.node.parent?.from ?? node.from,
                    node.node.parent?.to ?? node.to,
                  )
            ) break;
            let hideTo = node.to;
            if (node.name === 'HeaderMark') {
              if (isUnconfirmedHeading) break;
              const next = view.state.doc.sliceString(hideTo, hideTo + 1);
              if (next === ' ') hideTo += 1;
            }
            ranges.push({ from: node.from, to: hideTo, deco: hideMark });
            break;
          }
        }
      },
    });
  }

  collectObsidianImageDecorations(view, imageContext, ranges);

  for (const range of collectLivePreviewRanges(
    view.state.doc.toString(),
    activeLines,
    { selectionRanges },
  )) {
    ranges.push(livePreviewDeco(range));
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const r of ranges) builder.add(r.from, r.to, r.deco);
  return builder.finish();
}

function collectObsidianImageDecorations(
  view: EditorView,
  imageContext: MarkdownImageContext,
  ranges: DecoRange[],
): void {
  const fencedLines = collectFenceLineNumbers(view.state.doc.toString());

  for (const { from, to } of view.visibleRanges) {
    let line = view.state.doc.lineAt(from);
    while (line.from <= to) {
      if (!fencedLines.has(line.number)) {
        collectObsidianImagesInLine(
          view,
          line.text,
          line.from,
          imageContext,
          ranges,
          false,
        );
      }
      if (line.to >= view.state.doc.length) break;
      line = view.state.doc.line(line.number + 1);
    }
  }
}

function collectObsidianImagesInLine(
  view: EditorView,
  line: string,
  lineOffset: number,
  imageContext: MarkdownImageContext,
  ranges: DecoRange[],
  isActiveLine: boolean,
): void {
  const inlineCodeRanges = collectInlineCodeRanges(line);
  let from = 0;

  while (from < line.length) {
    const start = findNextOutside(line, '![[', from, inlineCodeRanges);
    if (start < 0) return;
    const close = findNextOutside(line, ']]', start + 3, inlineCodeRanges);
    if (close < 0) return;

    const parsed = parseObsidianImageEmbed(line.slice(start + 3, close));
    if (
      parsed
      && !selectionTouchesRange(
        view.state,
        lineOffset + start,
        lineOffset + close + 2,
      )
    ) {
      const src = resolveMarkdownImageSrc(parsed.src, imageContext);
      addImageDecoration({
        ranges,
        from: lineOffset + start,
        to: lineOffset + close + 2,
        lineTo: lineOffset + line.length,
        url: src,
        alt: parsed.alt,
        dimensions: parsed.dimensions,
        placement: isActiveLine ? 'below-source-line' : 'replace-source',
      });
    }

    from = close + 2;
  }
}

export const markdownDecoPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildMarkdownDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged
          || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = buildMarkdownDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);
