import { syntaxTree } from '@codemirror/language';
import type { EditorState, StateCommand } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

interface QuoteLayer {
  readonly text: string;
}

interface ListLayer {
  readonly to: number;
  readonly indent: string;
  readonly marker: string;
  readonly markerSpacing: string;
  readonly number: number | null;
  readonly delimiter: '.' | ')' | null;
  readonly task: boolean;
  readonly taskSpacing: string;
}

interface KnowledgeLineStructure {
  readonly prefix: string;
  readonly quotes: readonly QuoteLayer[];
  readonly list: ListLayer | null;
  readonly body: string;
}

const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

function isInsideFencedCode(state: EditorState, position: number): boolean {
  for (
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(position, -1);
    node;
    node = node.parent
  ) {
    if (node.name === 'FencedCode') return true;
  }

  const targetLine = state.doc.lineAt(position).number;
  let active: { character: '`' | '~'; length: number } | null = null;

  for (let lineNumber = 1; lineNumber <= targetLine; lineNumber += 1) {
    const text = state.doc.line(lineNumber).text;
    if (!active) {
      const opening = text.match(FENCE_OPEN_RE);
      if (!opening) continue;
      const run = opening[1];
      active = {
        character: run[0] as '`' | '~',
        length: run.length,
      };
      continue;
    }

    const escaped = active.character === '`' ? '`' : '~';
    const closing = new RegExp(`^ {0,3}${escaped}{${active.length},}[ \\t]*$`);
    if (closing.test(text)) active = null;
  }

  return active !== null;
}

function parseQuoteLayers(text: string): {
  readonly layers: readonly QuoteLayer[];
  readonly offset: number;
} {
  const layers: QuoteLayer[] = [];
  let offset = 0;

  while (offset < text.length) {
    const match = /^( {0,3}>[ \t]?)/.exec(text.slice(offset));
    if (!match) break;
    offset += match[0].length;
    layers.push({ text: match[0] });
  }

  return { layers, offset };
}

function parseListLayer(text: string, offset: number): ListLayer | null {
  const remainder = text.slice(offset);
  const match = /^([ \t]*)(?:([-+*])|(\d+)([.)]))([ \t]+)/.exec(remainder);
  if (!match) return null;

  const indent = match[1];
  const marker = match[2] ?? `${match[3]}${match[4]}`;
  let to = offset + match[0].length;
  let task = false;
  let taskSpacing = '';
  const taskMatch = /^\[[ xX]\]([ \t]+)/.exec(text.slice(to));
  if (taskMatch) {
    task = true;
    taskSpacing = taskMatch[1];
    to += taskMatch[0].length;
  }

  return {
    to,
    indent,
    marker,
    markerSpacing: match[5],
    number: match[3] ? Number.parseInt(match[3], 10) : null,
    delimiter: (match[4] as '.' | ')' | undefined) ?? null,
    task,
    taskSpacing,
  };
}

function parseKnowledgeLineStructure(text: string): KnowledgeLineStructure | null {
  const quote = parseQuoteLayers(text);
  const list = parseListLayer(text, quote.offset);
  if (quote.layers.length === 0 && !list) return null;
  const prefixEnd = list?.to ?? quote.offset;
  return {
    prefix: text.slice(0, prefixEnd),
    quotes: quote.layers,
    list,
    body: text.slice(prefixEnd),
  };
}

function continuationPrefix(structure: KnowledgeLineStructure): string {
  const quotePrefix = structure.quotes.map(layer => layer.text).join('');
  if (!structure.list) return quotePrefix;

  const list = structure.list;
  const marker = list.number === null
    ? list.marker
    : `${list.number + 1}${list.delimiter}`;
  return `${quotePrefix}${list.indent}${marker}${list.markerSpacing}${
    list.task ? `[ ]${list.taskSpacing}` : ''
  }`;
}

function removeOneIndentLevel(indent: string): string {
  if (indent.endsWith('\t')) return indent.slice(0, -1);
  const spaces = indent.match(/ +$/)?.[0].length ?? 0;
  return indent.slice(0, indent.length - Math.min(2, spaces));
}

function parentPrefix(structure: KnowledgeLineStructure): string {
  const quotePrefix = structure.quotes.map(layer => layer.text).join('');
  const list = structure.list;
  if (list) {
    if (list.indent.length > 0) {
      return `${quotePrefix}${removeOneIndentLevel(list.indent)}${
        list.marker
      }${list.markerSpacing}`;
    }
    return quotePrefix;
  }

  return structure.quotes
    .slice(0, -1)
    .map(layer => layer.text)
    .join('');
}

/**
 * Continues or exits one Markdown list/task/quote layer.
 *
 * The command deliberately changes only the current line/cursor insertion and
 * never renumbers existing siblings. Returning false delegates ordinary Enter
 * behavior to CodeMirror's default keymap.
 */
export const knowledgeEnterCommand: StateCommand = ({ state, dispatch }) => {
  if (
    state.readOnly
    || state.selection.ranges.length !== 1
    || !state.selection.main.empty
  ) return false;

  const position = state.selection.main.head;
  if (isInsideFencedCode(state, position)) return false;

  const line = state.doc.lineAt(position);
  const structure = parseKnowledgeLineStructure(line.text);
  if (!structure) return false;

  const relativePosition = position - line.from;
  if (relativePosition < structure.prefix.length) return false;

  if (structure.body.trim() === '') {
    const insert = parentPrefix(structure);
    dispatch(state.update({
      changes: {
        from: line.from,
        to: line.to,
        insert,
      },
      selection: { anchor: line.from + insert.length },
      scrollIntoView: true,
      userEvent: 'input',
    }));
    return true;
  }

  const insert = `${state.lineBreak}${continuationPrefix(structure)}`;
  dispatch(state.update({
    changes: { from: position, insert },
    selection: { anchor: position + insert.length },
    scrollIntoView: true,
    userEvent: 'input',
  }));
  return true;
};
