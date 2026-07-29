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
import { renderMermaidSvg } from '../utils/mermaid-renderer';
import { selectionTouchesRange } from './knowledge-live-preview';

export interface KnowledgeMermaidBlock {
  from: number;
  to: number;
  source: string;
  startLine: number;
  endLine: number;
}

const MERMAID_OPEN_RE = /^ {0,3}(`{3,})[ \t]*mermaid(?:[ \t]+.*)?[ \t]*$/i;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,})[ \t]*$/;
const widgetTasks = new WeakMap<HTMLElement, AbortController>();

function translated(key: string, fallback: string): string {
  const value = window.t?.(key);
  return value && value !== key ? value : fallback;
}

export function collectKnowledgeMermaidBlocks(
  text: string,
): KnowledgeMermaidBlock[] {
  const blocks: KnowledgeMermaidBlock[] = [];
  const lines = text.split('\n');
  let offset = 0;
  let blockStart = -1;
  let blockStartLine = -1;
  let openingFenceLength = 0;
  let sourceLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.replace(/\r$/, '');
    const lineNumber = index + 1;
    const lineStart = offset;
    const lineEnd = offset + rawLine.length;

    if (blockStart < 0) {
      const opening = line.match(MERMAID_OPEN_RE);
      if (opening) {
        blockStart = lineStart;
        blockStartLine = lineNumber;
        openingFenceLength = opening[1].length;
        sourceLines = [];
      }
    } else {
      const closing = line.match(FENCE_CLOSE_RE);
      if (closing && closing[1].length >= openingFenceLength) {
        blocks.push({
          from: blockStart,
          to: lineEnd,
          source: sourceLines.join('\n'),
          startLine: blockStartLine,
          endLine: lineNumber,
        });
        blockStart = -1;
        blockStartLine = -1;
        openingFenceLength = 0;
        sourceLines = [];
      } else {
        sourceLines.push(line);
      }
    }

    offset = lineEnd + (index < lines.length - 1 ? 1 : 0);
  }

  return blocks;
}

class KnowledgeMermaidWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly revealFrom: number,
  ) {
    super();
  }

  eq(other: KnowledgeMermaidWidget): boolean {
    return this.source === other.source && this.revealFrom === other.revealFrom;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-mermaid-widget mermaid-diagram is-loading';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'button');
    wrapper.setAttribute(
      'aria-label',
      translated('knowledge.mermaid.editSource', 'Edit Mermaid source'),
    );

    const rendered = document.createElement('div');
    rendered.className = 'mermaid-rendered';
    rendered.setAttribute('aria-live', 'polite');
    rendered.textContent = translated(
      'knowledge.mermaid.loading',
      'Rendering Mermaid diagram…',
    );
    wrapper.appendChild(rendered);

    const revealSource = () => {
      view.focus();
      view.dispatch({
        selection: { anchor: this.revealFrom },
        scrollIntoView: true,
      });
    };
    wrapper.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      revealSource();
    });
    wrapper.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      revealSource();
    });

    const controller = new AbortController();
    widgetTasks.set(wrapper, controller);
    void renderMermaidSvg(this.source, controller.signal).then((result) => {
      if (controller.signal.aborted || widgetTasks.get(wrapper) !== controller) return;
      wrapper.classList.remove('is-loading', 'is-rendered', 'is-error');
      rendered.replaceChildren();
      if (result.status === 'rendered') {
        rendered.innerHTML = result.svg;
        wrapper.classList.add('is-rendered');
        return;
      }
      if (result.status === 'error') {
        rendered.textContent = translated(
          'knowledge.mermaid.renderError',
          'Mermaid diagram could not be rendered. Edit the source to fix it.',
        );
        wrapper.classList.add('is-error');
      }
    });

    return wrapper;
  }

  destroy(dom: HTMLElement): void {
    widgetTasks.get(dom)?.abort();
    widgetTasks.delete(dom);
  }
}

function buildKnowledgeMermaidDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const block of collectKnowledgeMermaidBlocks(state.doc.toString())) {
    if (selectionTouchesRange(state, block.from, block.to)) continue;
    builder.add(
      block.from,
      block.to,
      Decoration.replace({
        widget: new KnowledgeMermaidWidget(block.source, block.from),
        block: true,
      }),
    );
  }
  return builder.finish();
}

export const knowledgeMermaidField = StateField.define<DecorationSet>({
  create: buildKnowledgeMermaidDecorations,
  update(value, transaction: Transaction) {
    if (transaction.docChanged || transaction.selection) {
      return buildKnowledgeMermaidDecorations(transaction.state);
    }
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});
