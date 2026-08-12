import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../../stores';

describe('file history store integration', () => {
  beforeEach(() => {
    useStore.getState().closeFileHistoryModal();
  });

  it('exposes the main History lifecycle through the shared renderer store', () => {
    const initialGeneration = useStore.getState().fileHistoryModal.scopeGeneration;

    useStore.getState().openFileHistoryModal('notes/a.md');
    expect(useStore.getState().fileHistoryModal).toEqual({
      open: true,
      preselectRelPath: 'notes/a.md',
      scopeGeneration: initialGeneration + 1,
    });

    useStore.getState().closeFileHistoryModal();
    expect(useStore.getState().fileHistoryModal).toEqual({
      open: false,
      preselectRelPath: null,
      scopeGeneration: initialGeneration + 2,
    });
  });

  it('drops unsafe preselection without losing the modal command', () => {
    useStore.getState().openFileHistoryModal('../outside.md');

    expect(useStore.getState().fileHistoryModal).toMatchObject({
      open: true,
      preselectRelPath: null,
    });
  });
});
