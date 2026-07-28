import { useRef } from 'react';
import type {
  KnowledgeResourceAddress,
} from '../../../../../shared/knowledge-workspace-contract.ts';
import styles from './KnowledgeWorkspace.module.css';

export type KnowledgeEditorResourceKind = 'markdown' | 'asset';

export interface KnowledgeEditorTab {
  viewId: string;
  address: KnowledgeResourceAddress;
  sourceName: string;
  kind: KnowledgeEditorResourceKind;
  preview: boolean;
}

export type KnowledgeBreadcrumbTarget =
  | {
      kind: 'source';
      sourceKey: string;
      relativePath: null;
    }
  | {
      kind: 'folder' | 'resource';
      sourceKey: string;
      relativePath: string;
    };

export interface KnowledgeTabBarProps {
  tabs: KnowledgeEditorTab[];
  activeViewId: string | null;
  onActivate(viewId: string): void;
  onClose(viewId: string): void;
  onOpenSide(viewId: string): void;
  onPin(viewId: string): void;
  onLocateResource?(target: KnowledgeBreadcrumbTarget): void;
}

function tr(key: string, vars?: Record<string, string | number>): string {
  return window.t?.(key, vars) ?? key;
}

export function knowledgeResourceFileName(
  address: KnowledgeResourceAddress,
): string {
  return address.relativePath.split('/').at(-1) ?? address.relativePath;
}

function breadcrumbTargets(
  tab: KnowledgeEditorTab,
): Array<{ label: string; target: KnowledgeBreadcrumbTarget }> {
  const segments = tab.address.relativePath.split('/');
  const items: Array<{ label: string; target: KnowledgeBreadcrumbTarget }> = [{
    label: tab.sourceName,
    target: {
      kind: 'source',
      sourceKey: tab.address.sourceKey,
      relativePath: null,
    },
  }];
  for (let index = 0; index < segments.length; index += 1) {
    const relativePath = segments.slice(0, index + 1).join('/');
    items.push({
      label: segments[index],
      target: {
        kind: index === segments.length - 1 ? 'resource' : 'folder',
        sourceKey: tab.address.sourceKey,
        relativePath,
      },
    });
  }
  return items;
}

export function KnowledgeTabBar({
  tabs,
  activeViewId,
  onActivate,
  onClose,
  onOpenSide,
  onPin,
  onLocateResource,
}: KnowledgeTabBarProps) {
  const tabRefs = useRef(new Map<string, HTMLElement>());
  const activeTab = tabs.find(tab => tab.viewId === activeViewId) ?? null;

  const activateAt = (index: number) => {
    if (tabs.length === 0) return;
    const normalized = (index + tabs.length) % tabs.length;
    const tab = tabs[normalized];
    onActivate(tab.viewId);
    tabRefs.current.get(tab.viewId)?.focus();
  };

  return (
    <>
      <div
        className={styles.knowledgeTabBar}
        role="tablist"
        aria-label={tr('knowledge.tabs.label')}
      >
        {tabs.map((tab, index) => {
          const fileName = knowledgeResourceFileName(tab.address);
          const selected = tab.viewId === activeViewId;
          return (
            <div className={styles.knowledgeTabShell} key={tab.viewId}>
              <div
                ref={(node) => {
                  if (node) tabRefs.current.set(tab.viewId, node);
                  else tabRefs.current.delete(tab.viewId);
                }}
                className={styles.knowledgeTab}
                role="tab"
                aria-controls={`knowledge-panel-${tab.viewId}`}
                aria-label={tab.preview
                  ? tr('knowledge.tabs.preview', { name: fileName })
                  : fileName}
                aria-selected={selected}
                data-preview={tab.preview ? 'true' : 'false'}
                draggable
                tabIndex={selected ? 0 : -1}
                onClick={() => onActivate(tab.viewId)}
                onDoubleClick={() => onPin(tab.viewId)}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData(
                    'application/x-openhanako-knowledge-view',
                    tab.viewId,
                  );
                  onPin(tab.viewId);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    activateAt(index + 1);
                  } else if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    activateAt(index - 1);
                  } else if (event.key === 'Home') {
                    event.preventDefault();
                    activateAt(0);
                  } else if (event.key === 'End') {
                    event.preventDefault();
                    activateAt(tabs.length - 1);
                  }
                }}
              >
                <span className={styles.knowledgeTabTitle}>{fileName}</span>
                {tab.preview ? (
                  <span className={styles.knowledgePreviewMarker} aria-hidden="true">
                    •
                  </span>
                ) : null}
              </div>
              <button
                className={styles.knowledgeTabAction}
                type="button"
                aria-label={tr('knowledge.tabs.openSide', { name: fileName })}
                onClick={() => onOpenSide(tab.viewId)}
              >
                ↗
              </button>
              <button
                className={styles.knowledgeTabAction}
                type="button"
                aria-label={tr('knowledge.tabs.close', { name: fileName })}
                onClick={() => onClose(tab.viewId)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      {activeTab ? (
        <nav
          className={styles.knowledgeBreadcrumb}
          aria-label={tr('knowledge.breadcrumb.label')}
        >
          {breadcrumbTargets(activeTab).map(({ label, target }, index) => (
            <span className={styles.knowledgeBreadcrumbPart} key={`${index}:${label}`}>
              {index > 0 ? (
                <span className={styles.knowledgeBreadcrumbSeparator} aria-hidden="true">
                  ›
                </span>
              ) : null}
              <button
                type="button"
                className={styles.knowledgeBreadcrumbButton}
                onClick={() => onLocateResource?.(target)}
              >
                {label}
              </button>
            </span>
          ))}
        </nav>
      ) : null}
    </>
  );
}
