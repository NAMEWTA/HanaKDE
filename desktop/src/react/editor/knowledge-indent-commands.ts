import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type SelectionRange,
  type StateCommand,
} from '@codemirror/state';

const INDENT = '  ';

function touchedLineNumbers(state: EditorState, range: SelectionRange): number[] {
  if (range.empty) return [state.doc.lineAt(range.head).number];

  const start = state.doc.lineAt(range.from).number;
  const lineAtEnd = state.doc.lineAt(range.to);
  const effectiveEnd = lineAtEnd.from === range.to
    ? Math.max(range.from, range.to - 1)
    : range.to;
  const end = state.doc.lineAt(effectiveEnd).number;
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function mapSelection(
  state: EditorState,
  changes: ReturnType<EditorState['changes']>,
): EditorSelection {
  return EditorSelection.create(state.selection.ranges.map(range => (
    EditorSelection.range(
      changes.mapPos(range.anchor, 1),
      changes.mapPos(range.head, 1),
    )
  )), state.selection.mainIndex);
}

function dispatchLineChanges(
  state: EditorState,
  dispatch: Parameters<StateCommand>[0]['dispatch'],
  specs: readonly ChangeSpec[],
): void {
  const changes = state.changes(specs);
  dispatch(state.update({
    changes,
    selection: mapSelection(state, changes),
    scrollIntoView: true,
    userEvent: 'input',
  }));
}

function uniqueSortedPositions(positions: readonly number[]): number[] {
  return [...new Set(positions)].sort((left, right) => left - right);
}

/**
 * Inserts exactly two ASCII spaces at each caret, or at every line start
 * touched by an explicit selection. No structural descendants are inferred.
 */
export const knowledgeIndentCommand: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;

  const positions = uniqueSortedPositions(state.selection.ranges.flatMap(range => {
    if (range.empty) return [range.head];
    return touchedLineNumbers(state, range)
      .map(lineNumber => state.doc.line(lineNumber).from);
  }));

  dispatchLineChanges(
    state,
    dispatch,
    positions.map(from => ({ from, insert: INDENT })),
  );
  return true;
};

/**
 * Removes up to two existing ASCII spaces from the start of each touched line.
 * Existing tab characters and all unselected lines remain byte-exact.
 */
export const knowledgeOutdentCommand: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;

  const lineNumbers = [...new Set(state.selection.ranges.flatMap(
    range => touchedLineNumbers(state, range),
  ))].sort((left, right) => left - right);

  const specs = lineNumbers.flatMap<ChangeSpec>(lineNumber => {
    const line = state.doc.line(lineNumber);
    const spaces = line.text.match(/^ {1,2}/)?.[0].length ?? 0;
    return spaces > 0
      ? [{ from: line.from, to: line.from + spaces, insert: '' }]
      : [];
  });

  if (specs.length > 0) dispatchLineChanges(state, dispatch, specs);
  return true;
};
