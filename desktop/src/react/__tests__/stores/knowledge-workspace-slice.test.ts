import { beforeEach, describe, expect, it } from 'vitest';
import type { KnowledgeSourceDto } from '../../../../../shared/knowledge-workspace-contract.ts';
import { useStore } from '../../stores';
import { buildPersistedWorkspaceUiState } from '../../stores/workspace-ui-state-actions';

describe('knowledge workspace state namespace', () => {
  beforeEach(() => {
    useStore.setState({
      workspaceDeskStateByRoot: {
        '/workspace/docs': {
          deskCurrentPath: 'notes',
          deskFiles: [],
          deskTreeFilesByPath: {},
          deskExpandedPaths: ['notes'],
          deskSelectedPath: 'notes/old.md',
          deskJianContent: null,
          cwdSkills: [],
          cwdSkillsOpen: false,
          jianDrawerOpen: false,
          rightWorkspaceTab: 'workspace',
          jianView: 'desk',
          previewOpen: true,
          openTabs: ['old-tab'],
          activeTabId: 'old-tab',
          previewReadingPositions: {},
        },
      },
    } as never);
  });

  it('opens every Knowledge workspace with blank session state without changing persisted Desk state', () => {
    useStore.setState({
      knowledgeWorkspaceKey: 'previous',
      knowledgeSources: [{
        sourceKey: 'main',
        displayName: 'Previous',
        role: 'main',
        capabilities: ['read'],
        availability: 'available',
      }],
      knowledgeExpandedPathsBySource: { main: ['notes'] },
      knowledgeOpenResourceKeys: ['main:notes/old.md'],
      knowledgeActiveResourceKey: 'main:notes/old.md',
    } as never);

    useStore.getState().openKnowledgeWorkspace('workspace-session-2');

    const state = useStore.getState();
    expect(state).toMatchObject({
      knowledgeWorkspaceKey: 'workspace-session-2',
      knowledgeSources: [],
      knowledgeExpandedPathsBySource: {},
      knowledgeOpenResourceKeys: [],
      knowledgeActiveResourceKey: null,
      knowledgeSourcesStatus: 'idle',
    });
    expect(state.workspaceDeskStateByRoot['/workspace/docs']).toMatchObject({
      deskExpandedPaths: ['notes'],
      openTabs: ['old-tab'],
      activeTabId: 'old-tab',
    });
  });

  it('ignores source responses from a superseded request or previous workspace session', () => {
    useStore.getState().openKnowledgeWorkspace('workspace-session-1');
    const staleRequest = useStore.getState().beginKnowledgeSourcesRequest();
    const currentRequest = useStore.getState().beginKnowledgeSourcesRequest();
    const currentSources: KnowledgeSourceDto[] = [{
      sourceKey: 'main',
      displayName: 'Current',
      role: 'main',
      capabilities: ['read'],
      availability: 'available',
    }];

    useStore.getState().resolveKnowledgeSourcesRequest(currentRequest, currentSources);
    useStore.getState().resolveKnowledgeSourcesRequest(staleRequest, [{
      ...currentSources[0],
      displayName: 'Stale',
    }]);

    expect(useStore.getState()).toMatchObject({
      knowledgeSourcesStatus: 'ready',
      knowledgeSources: [{ displayName: 'Current' }],
    });

    const previousSessionRequest = useStore.getState().beginKnowledgeSourcesRequest();
    useStore.getState().openKnowledgeWorkspace('workspace-session-2');
    useStore.getState().rejectKnowledgeSourcesRequest(
      previousSessionRequest,
      'knowledge_resource_unavailable',
    );

    expect(useStore.getState()).toMatchObject({
      knowledgeWorkspaceKey: 'workspace-session-2',
      knowledgeSourcesStatus: 'idle',
      knowledgeSourcesErrorCode: null,
    });
  });

  it('allocates fresh blank collections for every Knowledge workspace session', () => {
    useStore.getState().openKnowledgeWorkspace('workspace-session-1');
    const firstOpenResources = useStore.getState().knowledgeOpenResourceKeys;
    const firstExpandedPaths = useStore.getState().knowledgeExpandedPathsBySource;

    useStore.getState().openKnowledgeWorkspace('workspace-session-2');

    expect(useStore.getState().knowledgeOpenResourceKeys).not.toBe(firstOpenResources);
    expect(useStore.getState().knowledgeExpandedPathsBySource).not.toBe(firstExpandedPaths);
  });

  it('keeps the legacy Desk persistence payload separate from Knowledge session state', () => {
    useStore.getState().openKnowledgeWorkspace('workspace-session-1');
    useStore.setState({
      knowledgeOpenResourceKeys: ['main:notes/new.md'],
      knowledgeExpandedPathsBySource: { main: ['notes'] },
    } as never);

    const persistedDeskState = buildPersistedWorkspaceUiState('/workspace/docs');

    expect(JSON.stringify(persistedDeskState)).not.toContain('knowledge');
    expect(persistedDeskState).toMatchObject({
      deskExpandedPaths: [],
      openTabs: [],
      activeTabId: null,
    });
  });
});
