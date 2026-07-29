import {
  EditorSelection,
  EditorState,
  type SelectionRange,
  type Transaction,
} from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import {
  knowledgeSourceNavigationKeymap,
} from '../../editor/knowledge-source-navigation';

function navigate(
  doc: string,
  selection: EditorSelection | SelectionRange,
  key: string,
): EditorState {
  let state = EditorState.create({ doc, selection });
  const binding = knowledgeSourceNavigationKeymap.find(
    candidate => candidate.key === key,
  );
  if (!binding?.run) throw new Error(`Missing key binding: ${key}`);
  const handled = binding.run({
    state,
    dispatch(transaction: Transaction) {
      state = transaction.state;
    },
  } as never);
  expect(handled).toBe(true);
  return state;
}

describe('knowledge source navigation', () => {
  it('moves vertically between real logical lines and clamps at the source end', () => {
    const doc = '012345\nx\nabcdef';
    expect(navigate(
      doc,
      EditorSelection.cursor(5),
      'ArrowDown',
    ).selection.main.head).toBe(8);
    expect(navigate(
      doc,
      EditorSelection.cursor(8),
      'ArrowDown',
    ).selection.main.head).toBe(10);
  });

  it('uses real logical Home and End positions independent of visual wrapping', () => {
    const doc = 'a very long logical source line\nnext';
    expect(navigate(
      doc,
      EditorSelection.cursor(12),
      'Home',
    ).selection.main.head).toBe(0);
    expect(navigate(
      doc,
      EditorSelection.cursor(12),
      'End',
    ).selection.main.head).toBe(31);
  });

  it('extends Shift navigation from the existing anchor', () => {
    const state = navigate(
      'alpha\nbeta\ngamma',
      EditorSelection.range(2, 8),
      'Shift-ArrowDown',
    );
    expect(state.selection.main.anchor).toBe(2);
    expect(state.selection.main.head).toBe(13);
  });
});
