import {
  EditorState,
  RangeSetBuilder,
  StateField,
  type Transaction,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';
import katex from 'katex';
import { selectionTouchesRange } from './knowledge-live-preview';

export interface KnowledgeMathElement {
  kind: 'inline' | 'block';
  from: number;
  to: number;
  source: string;
}

type InlineRange = { from: number; to: number };

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

function translated(key: string, fallback: string): string {
  const value = window.t?.(key);
  return value && value !== key ? value : fallback;
}

function isEscaped(source: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

function overlaps(from: number, to: number, ranges: readonly InlineRange[]): boolean {
  return ranges.some(range => from < range.to && to > range.from);
}

function collectInlineCodeRanges(line: string): InlineRange[] {
  const ranges: InlineRange[] = [];
  let cursor = 0;
  while (cursor < line.length) {
    const start = line.indexOf('`', cursor);
    if (start < 0) break;
    let markerLength = 1;
    while (line[start + markerLength] === '`') markerLength += 1;
    const marker = '`'.repeat(markerLength);
    const end = line.indexOf(marker, start + markerLength);
    if (end < 0) break;
    ranges.push({ from: start, to: end + markerLength });
    cursor = end + markerLength;
  }
  return ranges;
}

function isInlineDelimiter(
  line: string,
  index: number,
  excluded: readonly InlineRange[],
): boolean {
  return line[index] === '$'
    && !isEscaped(line, index)
    && line[index - 1] !== '$'
    && line[index + 1] !== '$'
    && !overlaps(index, index + 1, excluded);
}

function collectInlineMath(
  line: string,
  lineOffset: number,
  elements: KnowledgeMathElement[],
): void {
  const excluded = collectInlineCodeRanges(line);
  let cursor = 0;
  while (cursor < line.length) {
    let start = cursor;
    while (start < line.length && !isInlineDelimiter(line, start, excluded)) start += 1;
    if (start >= line.length) return;

    let end = start + 1;
    while (end < line.length && !isInlineDelimiter(line, end, excluded)) end += 1;
    if (end >= line.length) return;

    const source = line.slice(start + 1, end);
    if (source.trim()) {
      elements.push({
        kind: 'inline',
        from: lineOffset + start,
        to: lineOffset + end + 1,
        source,
      });
    }
    cursor = end + 1;
  }
}

export function collectKnowledgeMathElements(
  text: string,
): KnowledgeMathElement[] {
  const elements: KnowledgeMathElement[] = [];
  const lines = text.split('\n');
  let offset = 0;
  let fence: { character: string; length: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.replace(/\r$/, '');
    const fenceMatch = line.match(FENCE_RE);
    const marker = fenceMatch?.[1];
    if (marker) {
      if (!fence) {
        fence = { character: marker[0], length: marker.length };
      } else if (
        marker[0] === fence.character
        && marker.length >= fence.length
        && line.slice(fenceMatch![0].length).trim() === ''
      ) {
        fence = null;
      }
      offset += rawLine.length + (index < lines.length - 1 ? 1 : 0);
      continue;
    }
    if (fence) {
      offset += rawLine.length + (index < lines.length - 1 ? 1 : 0);
      continue;
    }

    if (line.trim() === '$$') {
      let endIndex = index + 1;
      while (endIndex < lines.length && lines[endIndex].replace(/\r$/, '').trim() !== '$$') {
        endIndex += 1;
      }
      if (endIndex < lines.length) {
        const source = lines
          .slice(index + 1, endIndex)
          .map(value => value.replace(/\r$/, ''))
          .join('\n');
        const fullBlock = lines.slice(index, endIndex + 1).join('\n');
        if (source.trim()) {
          elements.push({
            kind: 'block',
            from: offset,
            to: offset + fullBlock.length,
            source,
          });
        }
        for (; index < endIndex; index += 1) {
          offset += lines[index].length + 1;
        }
        offset += lines[index].length + (index < lines.length - 1 ? 1 : 0);
        continue;
      }
    }

    collectInlineMath(line, offset, elements);
    offset += rawLine.length + (index < lines.length - 1 ? 1 : 0);
  }

  return elements;
}

class KnowledgeMathWidget extends WidgetType {
  constructor(
    readonly element: KnowledgeMathElement,
  ) {
    super();
  }

  eq(other: KnowledgeMathWidget): boolean {
    return this.element.kind === other.element.kind
      && this.element.from === other.element.from
      && this.element.source === other.element.source;
  }

  toDOM(view: EditorView): HTMLElement {
    const displayMode = this.element.kind === 'block';
    const wrapper = document.createElement(displayMode ? 'div' : 'span');
    wrapper.className = displayMode
      ? 'cm-math-widget cm-math-block-widget'
      : 'cm-math-widget cm-math-inline-widget';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'button');
    wrapper.setAttribute(
      'aria-label',
      translated('knowledge.math.editSource', 'Edit math source'),
    );

    const revealSource = () => {
      view.focus();
      view.dispatch({
        selection: { anchor: this.element.from },
        scrollIntoView: true,
      });
    };
    wrapper.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      revealSource();
    });
    wrapper.addEventListener('keydown', (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      revealSource();
    });

    try {
      wrapper.innerHTML = katex.renderToString(this.element.source, {
        displayMode,
        throwOnError: true,
        strict: 'error',
        trust: false,
      });
      wrapper.classList.add('is-rendered');
    } catch {
      wrapper.classList.add('is-error');
      wrapper.textContent = translated(
        'knowledge.math.renderError',
        'Formula could not be rendered. Edit the source to fix it.',
      );
    }
    return wrapper;
  }
}

function buildKnowledgeMathDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const element of collectKnowledgeMathElements(state.doc.toString())) {
    if (selectionTouchesRange(state, element.from, element.to)) continue;
    builder.add(
      element.from,
      element.to,
      Decoration.replace({
        widget: new KnowledgeMathWidget(element),
        block: element.kind === 'block',
      }),
    );
  }
  return builder.finish();
}

export const knowledgeMathField = StateField.define<DecorationSet>({
  create: buildKnowledgeMathDecorations,
  update(value, transaction: Transaction) {
    if (transaction.docChanged || transaction.selection) {
      return buildKnowledgeMathDecorations(transaction.state);
    }
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});
