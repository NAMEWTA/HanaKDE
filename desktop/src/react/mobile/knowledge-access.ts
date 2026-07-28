import {
  KnowledgeWorkspaceClientError,
  knowledgeWorkspaceClient,
  type KnowledgeWorkspaceClient,
} from '../services/knowledge-workspace-client';
import { retainKnowledgeSourceWatch } from '../services/resource-events';
import { useStore } from '../stores';
import { KNOWLEDGE_ERROR_METADATA } from '../../../../shared/knowledge-workspace-errors.ts';

export const mobileKnowledgeWorkspaceClient = knowledgeWorkspaceClient;

export async function initializeMobileKnowledgeAccess({
  workspaceKey,
  client = mobileKnowledgeWorkspaceClient,
  signal,
}: {
  workspaceKey: string;
  client?: KnowledgeWorkspaceClient;
  signal?: AbortSignal;
}): Promise<void> {
  const store = useStore.getState();
  store.openKnowledgeWorkspace(workspaceKey);
  const requestId = useStore.getState().beginKnowledgeSourcesRequest();

  try {
    const sources = await client.listSources({ signal });
    if (signal?.aborted) throw signal.reason;
    useStore.getState().resolveKnowledgeSourcesRequest(requestId, sources);
    if (signal && !signal.aborted) {
      const releases = sources
        .filter((source) => (
          source.availability === 'available'
          && source.capabilities.includes('watch')
        ))
        .map((source) => retainKnowledgeSourceWatch(source.sourceKey));
      bindKnowledgeWatchCleanup(signal, releases);
    }
  } catch (error) {
    if (signal?.aborted) {
      const latest = useStore.getState();
      if (
        latest.knowledgeWorkspaceKey === workspaceKey
        && latest.knowledgeSourcesRequestId === requestId
      ) {
        latest.openKnowledgeWorkspace(workspaceKey);
      }
      throw signal.reason ?? error;
    }
    const normalized = error instanceof KnowledgeWorkspaceClientError
      ? error
      : new KnowledgeWorkspaceClientError(
          KNOWLEDGE_ERROR_METADATA.knowledge_resource_unavailable,
        );
    useStore.getState().rejectKnowledgeSourcesRequest(
      requestId,
      normalized.code,
    );
    throw normalized;
  }
}

function bindKnowledgeWatchCleanup(
  signal: AbortSignal | undefined,
  releases: Array<() => void>,
): void {
  if (releases.length === 0) return;
  const releaseAll = () => {
    for (const release of releases.splice(0).reverse()) release();
  };
  if (!signal) return;
  if (signal.aborted) {
    releaseAll();
    return;
  }
  signal.addEventListener('abort', releaseAll, { once: true });
}
