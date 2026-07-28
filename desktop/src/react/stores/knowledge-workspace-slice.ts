import type {
  KnowledgeContractErrorCode,
  KnowledgeSourceDto,
} from '../../../../shared/knowledge-workspace-contract.ts';
import type {
  KnowledgeErrorCode,
} from '../../../../shared/knowledge-workspace-errors.ts';

export type KnowledgeSourcesStatus = 'idle' | 'loading' | 'ready' | 'error';
export type KnowledgeSourcesErrorCode =
  | KnowledgeErrorCode
  | KnowledgeContractErrorCode;

export interface KnowledgeWorkspaceSlice {
  knowledgeWorkspaceKey: string | null;
  knowledgeSessionEpoch: number;
  knowledgeSources: KnowledgeSourceDto[];
  knowledgeSourcesStatus: KnowledgeSourcesStatus;
  knowledgeSourcesRequestId: number;
  knowledgeSourcesErrorCode: KnowledgeSourcesErrorCode | null;
  knowledgeExpandedPathsBySource: Record<string, string[]>;
  knowledgeOpenResourceKeys: string[];
  knowledgeActiveResourceKey: string | null;
  openKnowledgeWorkspace: (workspaceKey: string) => void;
  beginKnowledgeSourcesRequest: () => number;
  resolveKnowledgeSourcesRequest: (
    requestId: number,
    sources: KnowledgeSourceDto[],
  ) => void;
  rejectKnowledgeSourcesRequest: (
    requestId: number,
    errorCode: KnowledgeSourcesErrorCode,
  ) => void;
}

type KnowledgeWorkspaceSliceState = Pick<
  KnowledgeWorkspaceSlice,
  | 'knowledgeWorkspaceKey'
  | 'knowledgeSessionEpoch'
  | 'knowledgeSources'
  | 'knowledgeSourcesStatus'
  | 'knowledgeSourcesRequestId'
  | 'knowledgeSourcesErrorCode'
  | 'knowledgeExpandedPathsBySource'
  | 'knowledgeOpenResourceKeys'
  | 'knowledgeActiveResourceKey'
>;

function blankKnowledgeSession() {
  return {
    knowledgeSources: [] as KnowledgeSourceDto[],
    knowledgeSourcesStatus: 'idle' as const,
    knowledgeSourcesErrorCode: null,
    knowledgeExpandedPathsBySource: {} as Record<string, string[]>,
    knowledgeOpenResourceKeys: [] as string[],
    knowledgeActiveResourceKey: null,
  };
}

export const createKnowledgeWorkspaceSlice = (
  set: (
    partial:
      | Partial<KnowledgeWorkspaceSlice>
      | ((state: KnowledgeWorkspaceSlice) => Partial<KnowledgeWorkspaceSlice>),
  ) => void,
  get: () => KnowledgeWorkspaceSlice,
): KnowledgeWorkspaceSlice => ({
  knowledgeWorkspaceKey: null,
  knowledgeSessionEpoch: 0,
  knowledgeSourcesRequestId: 0,
  ...blankKnowledgeSession(),

  openKnowledgeWorkspace: (workspaceKey) => set((state) => ({
    ...blankKnowledgeSession(),
    knowledgeWorkspaceKey: workspaceKey,
    knowledgeSessionEpoch: state.knowledgeSessionEpoch + 1,
    knowledgeSourcesRequestId: state.knowledgeSourcesRequestId + 1,
  })),

  beginKnowledgeSourcesRequest: () => {
    const requestId = get().knowledgeSourcesRequestId + 1;
    set({
      knowledgeSourcesRequestId: requestId,
      knowledgeSourcesStatus: 'loading',
      knowledgeSourcesErrorCode: null,
    });
    return requestId;
  },

  resolveKnowledgeSourcesRequest: (requestId, sources) => set((state) => (
    requestId !== state.knowledgeSourcesRequestId
      ? {}
      : {
          knowledgeSources: [...sources],
          knowledgeSourcesStatus: 'ready',
          knowledgeSourcesErrorCode: null,
        }
  )),

  rejectKnowledgeSourcesRequest: (requestId, errorCode) => set((state) => (
    requestId !== state.knowledgeSourcesRequestId
      ? {}
      : {
          knowledgeSourcesStatus: 'error',
          knowledgeSourcesErrorCode: errorCode,
        }
  )),
});

export type { KnowledgeWorkspaceSliceState };
