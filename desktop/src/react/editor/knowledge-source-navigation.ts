import {
  EditorSelection,
  type EditorState,
  type StateCommand,
} from '@codemirror/state';
import type { KeyBinding } from '@codemirror/view';

type LogicalDirection = 'up' | 'down' | 'home' | 'end';

function logicalTarget(
  state: EditorState,
  position: number,
  direction: LogicalDirection,
): number {
  const line = state.doc.lineAt(position);
  if (direction === 'home') return line.from;
  if (direction === 'end') return line.to;

  const targetNumber = direction === 'up'
    ? Math.max(1, line.number - 1)
    : Math.min(state.doc.lines, line.number + 1);
  if (targetNumber === line.number) return position;
  const sourceColumn = position - line.from;
  const targetLine = state.doc.line(targetNumber);
  return Math.min(targetLine.from + sourceColumn, targetLine.to);
}

function logicalNavigationCommand(
  direction: LogicalDirection,
  extend: boolean,
): StateCommand {
  return ({ state, dispatch }) => {
    const ranges = state.selection.ranges.map((range) => {
      const head = logicalTarget(state, range.head, direction);
      return extend
        ? EditorSelection.range(range.anchor, head)
        : EditorSelection.cursor(head);
    });
    dispatch(state.update({
      selection: EditorSelection.create(ranges, state.selection.mainIndex),
      scrollIntoView: true,
      userEvent: 'select',
    }));
    return true;
  };
}

export const knowledgeSourceNavigationKeymap: readonly KeyBinding[] = [
  { key: 'ArrowUp', run: logicalNavigationCommand('up', false) },
  { key: 'ArrowDown', run: logicalNavigationCommand('down', false) },
  { key: 'Home', run: logicalNavigationCommand('home', false) },
  { key: 'End', run: logicalNavigationCommand('end', false) },
  { key: 'Shift-ArrowUp', run: logicalNavigationCommand('up', true) },
  { key: 'Shift-ArrowDown', run: logicalNavigationCommand('down', true) },
  { key: 'Shift-Home', run: logicalNavigationCommand('home', true) },
  { key: 'Shift-End', run: logicalNavigationCommand('end', true) },
];
