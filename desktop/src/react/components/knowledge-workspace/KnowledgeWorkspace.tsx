import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createKnowledgeWorkspaceClient,
  KnowledgeWorkspaceClientError,
  type KnowledgeWorkspaceClient,
  type KnowledgeWorkspaceSelector,
} from '../../services/knowledge-workspace-client';
import { useStore } from '../../stores';
import { createKnowledgeDocumentRegistry } from '../../stores/knowledge-document-registry';
import {
  allowOneKnowledgeWindowClose,
  consumeKnowledgeWindowCloseAllowance,
  requestKnowledgeWorkspaceClose,
} from '../../services/knowledge-workspace-lifecycle';
import {
  retainKnowledgeSourceWatch,
  subscribeKnowledgeResourceTreeChanges,
} from '../../services/resource-events';
import { KnowledgeLayout } from './KnowledgeLayout';
import type { KnowledgeResourceTreeProps } from './KnowledgeResourceTree';
import { DeskSection } from '../DeskSection';
import { PreviewPanel } from '../PreviewPanel';
import { RegionalErrorBoundary } from '../RegionalErrorBoundary';
import { WorkspaceFileChangeBridge } from '../app/WorkspaceFileChangeBridge';
import styles from './KnowledgeWorkspace.module.css';

export interface KnowledgeIndexWorkspaceProps {
  client?: KnowledgeWorkspaceClient;
  workspaceKey?: string;
  treeServices?: Pick<
    KnowledgeResourceTreeProps,
    'watchSource' | 'subscribeToChanges' | 'refreshDelayMs'
  >;
}

/**
 * Knowledge 的主工作面直接复用已经成熟的 Desk + Preview 工作台。
 * 索引、知识地址与回收站仍由 KnowledgeIndexWorkspace 承载，并作为按需附加面板接入。
 */
export function KnowledgeWorkspace() {
  const setPreviewOpen = useStore((state) => state.setPreviewOpen);

  useEffect(() => {
    if (!useStore.getState().previewOpen) setPreviewOpen(true);
  }, [setPreviewOpen]);

  return (
    <main
      className={styles.workbench}
      aria-label={(window.t ?? ((key: string) => key))('knowledge.workspaceLabel')}
      data-knowledge-workspace=""
      data-shared-workbench=""
    >
      <WorkspaceFileChangeBridge />
      <aside className={styles.workbenchExplorer} aria-label={(window.t ?? ((key: string) => key))('knowledge.tree.heading')}>
        <RegionalErrorBoundary region="knowledge-workbench-explorer">
          <DeskSection framed={false} showHeader={false} />
        </RegionalErrorBoundary>
      </aside>
      <section className={styles.workbenchEditor} aria-label={(window.t ?? ((key: string) => key))('knowledge.editor.groupLabel')}>
        <RegionalErrorBoundary region="knowledge-workbench-editor">
          <PreviewPanel variant="workspace" />
        </RegionalErrorBoundary>
      </section>
    </main>
  );
}

export function KnowledgeIndexWorkspace({
  client: injectedClient,
  workspaceKey: explicitWorkspaceKey,
  treeServices,
}: KnowledgeIndexWorkspaceProps) {
  const activeServerConnectionId = useStore((state) => state.activeServerConnectionId);
  const currentAgentId = useStore((state) => state.currentAgentId);
  const deskWorkspaceMountId = useStore((state) => state.deskWorkspaceMountId);
  const deskWorkspaceLabel = useStore((state) => state.deskWorkspaceLabel);
  const deskBasePath = useStore((state) => state.deskBasePath);
  const selectedFolder = useStore((state) => state.selectedFolder);
  const storeWorkspaceKey = useStore((state) => state.knowledgeWorkspaceKey);
  const sources = useStore((state) => state.knowledgeSources);
  const sourcesStatus = useStore((state) => state.knowledgeSourcesStatus);
  const requestController = useRef<AbortController | null>(null);
  const sourceRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connectionKey = activeServerConnectionId ?? 'local';
  const workspaceSelector = useMemo<KnowledgeWorkspaceSelector | undefined>(() => {
    const label = deskWorkspaceLabel
      || (deskBasePath || selectedFolder || '').split(/[/\\]/).filter(Boolean).at(-1);
    if (deskWorkspaceMountId) {
      return {
        workspaceMountId: deskWorkspaceMountId,
        ...(label ? { workspaceLabel: label } : {}),
        ...(currentAgentId ? { workspaceAgentId: currentAgentId } : {}),
      };
    }
    const workspaceDir = deskBasePath || selectedFolder;
    if (!workspaceDir) return undefined;
    return {
      workspaceDir,
      ...(label ? { workspaceLabel: label } : {}),
      ...(currentAgentId ? { workspaceAgentId: currentAgentId } : {}),
    };
  }, [currentAgentId, deskBasePath, deskWorkspaceLabel, deskWorkspaceMountId, selectedFolder]);
  const client = useMemo(() => injectedClient ?? createKnowledgeWorkspaceClient({
    workspaceSelector,
  }), [injectedClient, workspaceSelector]);
  const effectiveTreeServices = useMemo(() => ({
    ...treeServices,
    watchSource: treeServices?.watchSource
      ?? ((sourceKey: string) => retainKnowledgeSourceWatch(sourceKey, workspaceSelector)),
  }), [treeServices, workspaceSelector]);
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

  useEffect(() => {
    const subscribe = treeServices?.subscribeToChanges
      ?? subscribeKnowledgeResourceTreeChanges;
    const delay = Math.max(0, treeServices?.refreshDelayMs ?? 120);
    const unsubscribe = subscribe(() => {
      if (sourceRefreshTimer.current) {
        clearTimeout(sourceRefreshTimer.current);
      }
      sourceRefreshTimer.current = setTimeout(() => {
        sourceRefreshTimer.current = null;
        void loadSources();
      }, delay);
    });
    return () => {
      unsubscribe();
      if (sourceRefreshTimer.current) {
        clearTimeout(sourceRefreshTimer.current);
        sourceRefreshTimer.current = null;
      }
    };
  }, [loadSources, treeServices]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (consumeKnowledgeWindowCloseAllowance()) return;
      event.preventDefault();
      (event as unknown as { returnValue: boolean }).returnValue = false;
      void requestKnowledgeWorkspaceClose('window-close').then((proceed) => {
        if (!proceed || !window.platform?.windowClose) return;
        allowOneKnowledgeWindowClose();
        window.platform.windowClose();
      });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return (
    <KnowledgeLayout
      sources={isCurrentWorkspace ? sources : []}
      sourcesStatus={isCurrentWorkspace ? sourcesStatus : 'idle'}
      treeClient={client}
      treeWorkspaceKey={workspaceKey}
      documentRegistry={documentRegistry}
      treeServices={effectiveTreeServices}
      onRetry={() => void loadSources()}
    />
  );
}
