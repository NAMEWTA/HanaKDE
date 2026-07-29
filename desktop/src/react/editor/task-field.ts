import {
  EditorState,
  StateField,
  Transaction,
  type Extension,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';
import {
  parseMarkdownKnowledgeIr,
  type MarkdownTaskMarkerToken,
} from '../../../../lib/knowledge-workspace/markdown-knowledge-ir.ts';
import { activeLineNumbers } from './knowledge-live-preview';

export type PageTaskToggleResult =
  | 'toggled'
  | 'not_task'
  | 'read_only';

function tr(key: string): string {
  return window.t?.(key) ?? key;
}

function taskAt(
  source: string,
  markerFrom: number,
): MarkdownTaskMarkerToken | undefined {
  return parseMarkdownKnowledgeIr(source).tokens.find(
    (token): token is MarkdownTaskMarkerToken => (
      token.kind === 'task_marker'
      && token.markerRange.from === markerFrom
      && token.markerRange.to === markerFrom + 3
    ),
  );
}

export function togglePageTask(
  view: EditorView,
  markerFrom: number,
): PageTaskToggleResult {
  if (view.state.readOnly) return 'read_only';
  const task = taskAt(view.state.doc.toString(), markerFrom);
  if (!task) return 'not_task';

  view.dispatch({
    changes: {
      from: task.markerRange.from,
      to: task.markerRange.to,
      insert: task.checked ? '[ ]' : '[x]',
    },
    annotations: Transaction.userEvent.of('input'),
  });
  return 'toggled';
}

class PageTaskWidget extends WidgetType {
  constructor(
    private readonly markerFrom: number,
    private readonly checked: boolean,
  ) {
    super();
  }

  eq(other: PageTaskWidget): boolean {
    return this.markerFrom === other.markerFrom
      && this.checked === other.checked;
  }

  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = this.checked;
    input.disabled = view.state.readOnly;
    input.className = 'cm-checkbox cm-page-task';
    input.setAttribute(
      'aria-label',
      tr(this.checked ? 'knowledge.task.completed' : 'knowledge.task.open'),
    );
    input.addEventListener('change', (event) => {
      event.stopPropagation();
      if (togglePageTask(view, this.markerFrom) !== 'toggled') {
        input.checked = this.checked;
      }
    });
    return input;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function buildTaskDecorations(state: EditorState): DecorationSet {
  const activeLines = activeLineNumbers(state);
  const ranges = parseMarkdownKnowledgeIr(state.doc.toString()).tokens
    .filter((token): token is MarkdownTaskMarkerToken => token.kind === 'task_marker')
    .filter(task => !activeLines.has(state.doc.lineAt(task.markerRange.from).number))
    .map(task => Decoration.replace({
      widget: new PageTaskWidget(task.markerRange.from, task.checked),
    }).range(task.markerRange.from, task.markerRange.to));
  return Decoration.set(ranges, true);
}

export const taskField: Extension = StateField.define<DecorationSet>({
  create: buildTaskDecorations,
  update(value, transaction) {
    return transaction.docChanged || transaction.selection
      ? buildTaskDecorations(transaction.state)
      : value;
  },
  provide: field => EditorView.decorations.from(field),
});
