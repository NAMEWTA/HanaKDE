import { useMemo } from 'react';
import { useStore as useRegistryStore } from 'zustand';
import { useI18n } from '../../hooks/use-i18n';
import type {
  KnowledgeDocumentRegistry,
  KnowledgeDocumentSession,
  KnowledgeDocumentView,
} from '../../stores/knowledge-document-registry';
import type {
  KnowledgeEditorResourceKind,
} from './KnowledgeTabBar';
import styles from './KnowledgeWorkspace.module.css';

export interface KnowledgeEditorStatusTarget {
  viewId: string;
  kind: KnowledgeEditorResourceKind;
}

export interface KnowledgeEditorStatus {
  line: number;
  column: number;
  characters: number;
}

export interface KnowledgeEditorStatusBarProps {
  registry: KnowledgeDocumentRegistry;
  activeTarget: KnowledgeEditorStatusTarget | null;
}

interface KnowledgeEditorTextMetrics {
  lineStarts: number[];
  characters: number;
}

function buildKnowledgeEditorTextMetrics(
  buffer: string,
): KnowledgeEditorTextMetrics {
  const lineStarts = [0];
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer.charCodeAt(index) === 10) lineStarts.push(index + 1);
  }
  return {
    lineStarts,
    characters: Array.from(buffer).length,
  };
}

export function calculateKnowledgeEditorStatus(
  session: KnowledgeDocumentSession | undefined,
  view: KnowledgeDocumentView | undefined,
  metrics?: KnowledgeEditorTextMetrics,
): KnowledgeEditorStatus | null {
  if (
    !session
    || !view
    || session.resourceState === 'missing'
    || session.resourceState === 'source-unavailable'
  ) {
    return null;
  }

  const position = Math.max(
    0,
    Math.min(session.buffer.length, view.selection.head),
  );
  const resolvedMetrics = metrics
    ?? buildKnowledgeEditorTextMetrics(session.buffer);
  let low = 0;
  let high = resolvedMetrics.lineStarts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (resolvedMetrics.lineStarts[middle] <= position) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const lineIndex = Math.max(0, low - 1);
  return {
    line: lineIndex + 1,
    column: position - resolvedMetrics.lineStarts[lineIndex] + 1,
    characters: resolvedMetrics.characters,
  };
}

export function KnowledgeEditorStatusBar({
  registry,
  activeTarget,
}: KnowledgeEditorStatusBarProps) {
  const { t, locale } = useI18n();
  const activeMarkdownViewId = activeTarget?.kind === 'markdown'
    ? activeTarget.viewId
    : null;
  const view = useRegistryStore(
    registry,
    state => activeMarkdownViewId
      ? state.views[activeMarkdownViewId]
      : undefined,
  );
  const session = useRegistryStore(
    registry,
    state => view ? state.sessions[view.sessionKey] : undefined,
  );
  const buffer = session?.buffer;
  const metrics = useMemo(
    () => buffer === undefined
      ? undefined
      : buildKnowledgeEditorTextMetrics(buffer),
    [buffer],
  );
  const status = calculateKnowledgeEditorStatus(session, view, metrics);
  const numberFormatter = new Intl.NumberFormat(locale || undefined);

  return (
    <footer
      className={styles.knowledgeEditorStatusBar}
      data-knowledge-editor-status-bar=""
      role="status"
      aria-label={t('knowledge.editor.status.label')}
      aria-live="polite"
    >
      {status ? (
        <span
          className={styles.knowledgeEditorStatusGroup}
          data-knowledge-editor-status-summary=""
          aria-atomic="true"
        >
          {t('knowledge.editor.status.summary', {
            line: numberFormatter.format(status.line),
            column: numberFormatter.format(status.column),
            characters: numberFormatter.format(status.characters),
          })}
        </span>
      ) : null}
    </footer>
  );
}
