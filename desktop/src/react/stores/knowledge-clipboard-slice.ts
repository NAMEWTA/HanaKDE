import type { KnowledgeResourceAddress } from '../../../../shared/knowledge-workspace-contract.ts';

export type KnowledgeClipboardIntent = 'copy' | 'cut';

export type KnowledgeClipboardPayload = Readonly<{
  workspaceKey: string;
  sourceKey: string;
  intent: KnowledgeClipboardIntent;
  addresses: readonly KnowledgeResourceAddress[];
}>;

export interface KnowledgeClipboardSlice {
  knowledgeClipboard: KnowledgeClipboardPayload | null;
  setKnowledgeClipboard(
    workspaceKey: string,
    intent: KnowledgeClipboardIntent,
    addresses: readonly KnowledgeResourceAddress[],
  ): void;
  retainKnowledgeClipboardFailures(addresses: readonly KnowledgeResourceAddress[]): void;
  clearKnowledgeClipboard(): void;
}

export const createKnowledgeClipboardSlice = (
  set: (
    partial:
      | Partial<KnowledgeClipboardSlice>
      | ((state: KnowledgeClipboardSlice) => Partial<KnowledgeClipboardSlice>),
  ) => void,
): KnowledgeClipboardSlice => ({
  knowledgeClipboard: null,
  setKnowledgeClipboard: (workspaceKey, intent, addresses) => {
    const sourceKey = addresses[0]?.sourceKey;
    if (
      !workspaceKey
      || !sourceKey
      || addresses.length === 0
      || addresses.some(address => address.sourceKey !== sourceKey)
    ) {
      set({ knowledgeClipboard: null });
      return;
    }
    set({
      knowledgeClipboard: Object.freeze({
        workspaceKey,
        sourceKey,
        intent,
        addresses: Object.freeze(addresses.map(address => Object.freeze({ ...address }))),
      }),
    });
  },
  retainKnowledgeClipboardFailures: (addresses) => set(state => {
    if (!state.knowledgeClipboard) return {};
    if (addresses.length === 0) return { knowledgeClipboard: null };
    return {
      knowledgeClipboard: Object.freeze({
        ...state.knowledgeClipboard,
        addresses: Object.freeze(addresses.map(address => Object.freeze({ ...address }))),
      }),
    };
  }),
  clearKnowledgeClipboard: () => set({ knowledgeClipboard: null }),
});

export function activeKnowledgeClipboard(
  state: Pick<KnowledgeClipboardSlice, 'knowledgeClipboard'>,
  workspaceKey: string | null,
): KnowledgeClipboardPayload | null {
  return state.knowledgeClipboard?.workspaceKey === workspaceKey
    ? state.knowledgeClipboard
    : null;
}

/**
 * A cut is a durable move within one mounted source. Cross-source copies are
 * supported, but a cross-source cut must fail closed before reaching the API.
 */
export function knowledgeClipboardPasteAllowed(
  clipboard: KnowledgeClipboardPayload | null,
  targetSourceKey: string,
): boolean {
  return Boolean(
    clipboard
    && (clipboard.intent !== 'cut' || clipboard.sourceKey === targetSourceKey),
  );
}
