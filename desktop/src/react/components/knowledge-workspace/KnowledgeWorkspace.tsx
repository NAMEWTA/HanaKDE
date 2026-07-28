import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KnowledgeWorkspaceClientError,
  knowledgeWorkspaceClient,
  type KnowledgeWorkspaceClient,
} from '../../services/knowledge-workspace-client';
import { useStore } from '../../stores';
import { createKnowledgeDocumentRegistry } from '../../stores/knowledge-document-registry';
import { KnowledgeLayout } from './KnowledgeLayout';
import type { KnowledgeResourceTreeProps } from './KnowledgeResourceTree';

export interface KnowledgeWorkspaceProps {
  client?: KnowledgeWorkspaceClient;
  workspaceKey?: string;
  treeServices?: Pick<
    KnowledgeResourceTreeProps,
    'watchSource' | 'subscribeToChanges' | 'refreshDelayMs'
  >;
}

export function KnowledgeWorkspace({
  client = knowledgeWorkspaceClient,
  workspaceKey: explicitWorkspaceKey,
  treeServices,
}: KnowledgeWorkspaceProps) {
  const activeServerConnectionId = useStore((state) => state.activeServerConnectionId);
  const currentAgentId = useStore((state) => state.currentAgentId);
  const deskWorkspaceMountId = useStore((state) => state.deskWorkspaceMountId);
  const deskBasePath = useStore((state) => state.deskBasePath);
  const selectedFolder = useStore((state) => state.selectedFolder);
  const storeWorkspaceKey = useStore((state) => state.knowledgeWorkspaceKey);
  const sources = useStore((state) => state.knowledgeSources);
  const sourcesStatus = useStore((state) => state.knowledgeSourcesStatus);
  const requestController = useRef<AbortController | null>(null);

  const connectionKey = activeServerConnectionId ?? 'local';
  const mainKey = deskWorkspaceMountId
    ? `mount:${deskWorkspaceMountId}`
    : `main:${deskBasePath || selectedFolder || 'current'}`;
  const workspaceKey = explicitWorkspaceKey ?? `${connectionKey}:${mainKey}`;
  const isCurrentWorkspace = storeWorkspaceKey === workspaceKey;
  const [rendererContextId] = useState(() => (
    globalThis.crypto?.randomUUID?.() ?? `knowledge-${Date.now()}`
  ));
  const documentRegistry = useMemo(() => createKnowledgeDocumentRegistry({
    ownerId: currentAgentId || connectionKey,
    windowId: `${rendererContextId}:${workspaceKey}`,
  }), [connectionKey, currentAgentId, rendererContextId, workspaceKey]);

  useEffect(() => () => {
    documentRegistry.getState().dispose();
  }, [documentRegistry]);

  const loadSources = useCallback(async () => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;

    const before = useStore.getState();
    if (before.knowledgeWorkspaceKey !== workspaceKey) {
      before.openKnowledgeWorkspace(workspaceKey);
    }
    const requestId = useStore.getState().beginKnowledgeSourcesRequest();

    try {
      const nextSources = await client.listSources({ signal: controller.signal });
      if (controller.signal.aborted) return;
      useStore.getState().resolveKnowledgeSourcesRequest(requestId, nextSources);
    } catch (error) {
      if (controller.signal.aborted) return;
      const code = error instanceof KnowledgeWorkspaceClientError
        ? error.code
        : 'knowledge_resource_unavailable';
      useStore.getState().rejectKnowledgeSourcesRequest(requestId, code);
    }
  }, [client, workspaceKey]);

  useEffect(() => {
    const state = useStore.getState();
    if (
      state.knowledgeWorkspaceKey !== workspaceKey
      || state.knowledgeSourcesStatus !== 'ready'
    ) {
      void loadSources();
    }
    return () => {
      requestController.current?.abort();
      requestController.current = null;
    };
  }, [loadSources, workspaceKey]);

  return (
    <KnowledgeLayout
      sources={isCurrentWorkspace ? sources : []}
      sourcesStatus={isCurrentWorkspace ? sourcesStatus : 'idle'}
      treeClient={client}
      treeWorkspaceKey={workspaceKey}
      documentRegistry={documentRegistry}
      treeServices={treeServices}
      onRetry={() => void loadSources()}
    />
  );
}
