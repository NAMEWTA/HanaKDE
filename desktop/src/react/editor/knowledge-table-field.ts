import { syntaxTree } from '@codemirror/language';
import {
  StateField,
  type EditorState,
  type Transaction,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';
import { getMd } from '../utils/markdown';
import { selectionTouchesRange } from './knowledge-live-preview';

export type KnowledgeTableAlignment = 'left' | 'center' | 'right' | null;

export interface KnowledgeTableModel {
  readonly headers: readonly string[];
  readonly alignments: readonly KnowledgeTableAlignment[];
  readonly rows: readonly (readonly string[])[];
}

function splitGfmRow(line: string): string[] {
  const trimmed = line.trim();
  const hasLeadingPipe = trimmed.startsWith('|');
  const hasTrailingPipe = trimmed.endsWith('|') && !trimmed.endsWith('\\|');
  const cells: string[] = [];
  let current = '';
  let escaped = false;

  for (const character of trimmed) {
    if (escaped) {
      current += `\\${character}`;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  if (escaped) current += '\\';
  cells.push(current.trim());
  if (hasLeadingPipe) cells.shift();
  if (hasTrailingPipe) cells.pop();
  return cells;
}

function delimiterAlignment(cell: string): KnowledgeTableAlignment | undefined {
  const source = cell.trim();
  if (!/^:?-{3,}:?$/.test(source)) return undefined;
  const left = source.startsWith(':');
  const right = source.endsWith(':');
  if (left && right) return 'center';
  if (left) return 'left';
  if (right) return 'right';
  return null;
}

export function parseKnowledgeGfmTable(source: string): KnowledgeTableModel | null {
  const lines = source.split('\n');
  if (lines.length < 2 || lines.some(line => line.trim() === '')) return null;
  const headers = splitGfmRow(lines[0]);
  const delimiters = splitGfmRow(lines[1]);
  if (headers.length === 0 || delimiters.length !== headers.length) return null;
  const alignments = delimiters.map(delimiterAlignment);
  if (alignments.some(value => value === undefined)) return null;

  return {
    headers,
    alignments: alignments as KnowledgeTableAlignment[],
    rows: lines.slice(2).map(line => {
      const cells = splitGfmRow(line);
      return Array.from({ length: headers.length }, (_, index) => cells[index] ?? '');
    }),
  };
}

export class KnowledgeTableWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly model: KnowledgeTableModel,
  ) {
    super();
  }

  eq(other: KnowledgeTableWidget): boolean {
    return this.source === other.source && this.from === other.from;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-table-widget cm-knowledge-table-widget';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'button');
    wrapper.setAttribute('aria-label', window.t?.('knowledge.table.editSource') ?? 'Edit table source');
    const table = document.createElement('table');
    const md = getMd();
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    this.model.headers.forEach((source, index) => {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.innerHTML = md.renderInline(source);
      const alignment = this.model.alignments[index];
      if (alignment) cell.style.textAlign = alignment;
      headerRow.appendChild(cell);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of this.model.rows) {
      const tr = document.createElement('tr');
      row.forEach((source, index) => {
        const cell = document.createElement('td');
        cell.innerHTML = md.renderInline(source);
        const alignment = this.model.alignments[index];
        if (alignment) cell.style.textAlign = alignment;
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrapper.appendChild(table);

    const reveal = () => {
      view.focus();
      view.dispatch({
        selection: { anchor: this.from },
        scrollIntoView: true,
      });
    };
    wrapper.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      reveal();
    });
    wrapper.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      reveal();
    });
    return wrapper;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

export function buildKnowledgeTableDecorations(
  state: EditorState,
): DecorationSet {
  const ranges: ReturnType<Decoration['range']>[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'Table' || selectionTouchesRange(state, node.from, node.to)) {
        return;
      }
      const source = state.doc.sliceString(node.from, node.to);
      const model = parseKnowledgeGfmTable(source);
      if (!model) return;
      ranges.push(Decoration.replace({
        widget: new KnowledgeTableWidget(source, node.from, model),
        block: true,
      }).range(node.from, node.to));
    },
  });
  return Decoration.set(ranges, true);
}

export const knowledgeTableField = StateField.define<DecorationSet>({
  create: buildKnowledgeTableDecorations,
  update(value, transaction: Transaction) {
    if (
      transaction.docChanged
      || transaction.selection
      || syntaxTree(transaction.startState) !== syntaxTree(transaction.state)
    ) {
      return buildKnowledgeTableDecorations(transaction.state);
    }
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});
