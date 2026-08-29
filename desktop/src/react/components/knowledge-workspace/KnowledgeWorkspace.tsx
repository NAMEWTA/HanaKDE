import { useEffect } from 'react';
import { useStore } from '../../stores';
import { DeskSection } from '../DeskSection';
import { PreviewPanel } from '../PreviewPanel';
import { RegionalErrorBoundary } from '../RegionalErrorBoundary';
import { WorkspaceFileChangeBridge } from '../app/WorkspaceFileChangeBridge';
import styles from './KnowledgeWorkspace.module.css';

const tr = (key: string) => window.t?.(key) ?? key;

/** Knowledge reuses the upstream workspace instead of owning another file editor. */
export function KnowledgeWorkspace() {
  const setPreviewOpen = useStore((state) => state.setPreviewOpen);

  useEffect(() => {
    if (!useStore.getState().previewOpen) setPreviewOpen(true);
  }, [setPreviewOpen]);

  return (
    <main
      className={styles.workbench}
      aria-label={tr('knowledge.workspaceLabel')}
      data-knowledge-workspace=""
      data-shared-workbench=""
    >
      <WorkspaceFileChangeBridge />
      <aside className={styles.explorer} aria-label={tr('knowledge.tree.heading')}>
        <RegionalErrorBoundary region="knowledge-workbench-explorer">
          <DeskSection framed={false} showHeader={false} />
        </RegionalErrorBoundary>
      </aside>
      <section className={styles.editor} aria-label={tr('knowledge.editor.groupLabel')}>
        <RegionalErrorBoundary region="knowledge-workbench-editor">
          <PreviewPanel variant="workspace" />
        </RegionalErrorBoundary>
      </section>
    </main>
  );
}
