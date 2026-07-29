import { syntaxTree } from '@codemirror/language';
import {
  StateField,
  type EditorState,
  type Transaction,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  type DecorationSet,
} from '@codemirror/view';
import { selectionTouchesRange } from './knowledge-live-preview';

interface KnowledgeFence {
  readonly marker: '`' | '~';
  readonly length: number;
  readonly language: string;
}

function parseOpeningFence(line: string): KnowledgeFence | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`~]*)?.*$/);
  if (!match) return null;
  return {
    marker: match[1][0] as '`' | '~',
    length: match[1].length,
    language: (match[2] ?? '').toLocaleLowerCase(),
  };
}

function isClosingFence(line: string, fence: KnowledgeFence): boolean {
  const escaped = fence.marker === '`' ? '`' : '~';
  return new RegExp(`^ {0,3}${escaped}{${fence.length},}[ \\t]*$`).test(line);
}

const middleLine = Decoration.line({
  class: 'cm-codeblock-line cm-knowledge-code-line',
});
const firstLine = Decoration.line({
  class: 'cm-codeblock-line cm-codeblock-line-first cm-knowledge-code-line',
});
const lastLine = Decoration.line({
  class: 'cm-codeblock-line cm-codeblock-line-last cm-knowledge-code-line',
});
const onlyLine = Decoration.line({
  class: 'cm-codeblock-line cm-codeblock-line-first cm-codeblock-line-last cm-knowledge-code-line',
});

function lineDecoration(first: boolean, last: boolean): Decoration {
  if (first && last) return onlyLine;
  if (first) return firstLine;
  if (last) return lastLine;
  return middleLine;
}

export function buildKnowledgeCodeBlockDecorations(
  state: EditorState,
): DecorationSet {
  const ranges: ReturnType<Decoration['range']>[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'FencedCode') return;
      const openingLine = state.doc.lineAt(node.from);
      const closingLine = state.doc.lineAt(node.to);
      const fence = parseOpeningFence(openingLine.text);
      if (
        !fence
        || fence.language === 'mermaid'
        || !isClosingFence(closingLine.text, fence)
      ) {
        return false;
      }

      for (
        let lineNumber = openingLine.number;
        lineNumber <= closingLine.number;
        lineNumber += 1
      ) {
        const line = state.doc.line(lineNumber);
        ranges.push(lineDecoration(
          lineNumber === openingLine.number,
          lineNumber === closingLine.number,
        ).range(line.from));
      }

      if (!selectionTouchesRange(state, node.from, node.to)) {
        ranges.push(Decoration.replace({}).range(openingLine.from, openingLine.to));
        ranges.push(Decoration.replace({}).range(closingLine.from, closingLine.to));
      }
      return false;
    },
  });
  return Decoration.set(ranges, true);
}

export const knowledgeCodeBlockField = StateField.define<DecorationSet>({
  create: buildKnowledgeCodeBlockDecorations,
  update(value, transaction: Transaction) {
    if (
      transaction.docChanged
      || transaction.selection
      || syntaxTree(transaction.startState) !== syntaxTree(transaction.state)
    ) {
      return buildKnowledgeCodeBlockDecorations(transaction.state);
    }
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});
