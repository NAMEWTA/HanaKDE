/**
 * Main-only Workspace History entry state.
 *
 * The slice stores only UI intent. It never stores a root, agent identity,
 * file body, version cache, or restore result; those facts stay with the
 * main-bound History/ResourceIO adapters.
 */

export interface FileHistoryModalState {
  open: boolean;
  /** A validated workspace-relative POSIX path, or null for no preselection. */
  preselectRelPath: string | null;
  /** Monotonic UI scope token used to invalidate requests on open/close. */
  scopeGeneration: number;
}

export interface FileHistorySlice {
  fileHistoryModal: FileHistoryModalState;
  openFileHistoryModal: (preselectRelPath?: string | null) => void;
  closeFileHistoryModal: () => void;
}

function normalizeRelativePath(value: string | null | undefined): string | null {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.startsWith('/')
    || value.includes('\\')
    || value.split('/').some(part => part === '' || part === '.' || part === '..')
    || /\p{Cc}/u.test(value)
    || /^[A-Za-z]:/u.test(value)
  ) return null;
  return value;
}

export const createFileHistorySlice = (
  set: (partial: Partial<FileHistorySlice>) => void,
  get?: () => Pick<FileHistorySlice, 'fileHistoryModal'>,
): FileHistorySlice => {
  const currentGeneration = () => (get?.().fileHistoryModal.scopeGeneration ?? 0) + 1;
  return {
    fileHistoryModal: { open: false, preselectRelPath: null, scopeGeneration: 0 },

    openFileHistoryModal: (preselectRelPath = null) => set({
      fileHistoryModal: {
        open: true,
        preselectRelPath: normalizeRelativePath(preselectRelPath),
        scopeGeneration: currentGeneration(),
      },
    }),

    closeFileHistoryModal: () => set({
      fileHistoryModal: {
        open: false,
        preselectRelPath: null,
        scopeGeneration: currentGeneration(),
      },
    }),
  };
};
