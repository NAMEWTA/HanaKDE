import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { EditorView } from '@codemirror/view';
import type {
  KnowledgeCommand,
  KnowledgeSlashMenuRequest,
} from '../../editor/knowledge-command-registry';

interface MenuPosition {
  left: number;
  top: number;
  maxHeight: number;
  maxWidth: number;
}

export interface KnowledgeSlashMenuProps {
  readonly request: KnowledgeSlashMenuRequest;
  readonly getView: () => EditorView | null;
  readonly container: HTMLElement | null;
}

function tr(key: string): string {
  return window.t?.(key) ?? key;
}

function platformShortcut(shortcut: string | undefined): string {
  if (!shortcut) return '';
  const isMac = navigator.platform?.startsWith('Mac')
    || navigator.userAgent?.includes('Mac');
  return shortcut.replace('Mod-', isMac ? '⌘' : 'Ctrl+');
}

function itemId(command: KnowledgeCommand): string {
  return `knowledge-slash-command-${command.id}`;
}

export function KnowledgeSlashMenu({
  request,
  getView,
  container,
}: KnowledgeSlashMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const place = useCallback(() => {
    const view = getView();
    const menu = menuRef.current;
    if (!view || !menu || !container) return;
    const anchor = view.coordsAtPos(request.triggerFrom, 1);
    if (!anchor) {
      request.dismiss();
      return;
    }
    const bounds = container.getBoundingClientRect();
    const gap = 4;
    const inset = 4;
    const availableBelow = Math.max(0, bounds.bottom - anchor.bottom - gap - inset);
    const availableAbove = Math.max(0, anchor.top - bounds.top - gap - inset);
    const openBelow = availableBelow >= Math.min(240, menu.scrollHeight)
      || availableBelow >= availableAbove;
    const maxHeight = openBelow ? availableBelow : availableAbove;
    const maxWidth = Math.max(0, bounds.width - inset * 2);
    if (maxHeight <= 0 || maxWidth <= 0) {
      request.dismiss();
      return;
    }
    const width = Math.min(menu.offsetWidth || 320, maxWidth);
    const height = Math.min(menu.scrollHeight || 64, maxHeight);
    const left = Math.min(
      Math.max(anchor.left, bounds.left + inset),
      Math.max(bounds.left + inset, bounds.right - inset - width),
    );
    const top = openBelow
      ? anchor.bottom + gap
      : Math.max(bounds.top + inset, anchor.top - gap - height);
    setPosition({ left, top, maxHeight, maxWidth });
  }, [container, getView, request]);

  useLayoutEffect(() => {
    place();
    const view = getView();
    const doc = container?.ownerDocument ?? document;
    const win = doc.defaultView ?? window;
    const handleGeometryChange = () => place();
    win.addEventListener('resize', handleGeometryChange);
    win.addEventListener('scroll', handleGeometryChange, true);
    view?.scrollDOM.addEventListener('scroll', handleGeometryChange, { passive: true });
    return () => {
      win.removeEventListener('resize', handleGeometryChange);
      win.removeEventListener('scroll', handleGeometryChange, true);
      view?.scrollDOM.removeEventListener('scroll', handleGeometryChange);
    };
  }, [container, getView, place]);

  useLayoutEffect(() => {
    const selected = selectedRef.current;
    if (selected && typeof selected.scrollIntoView === 'function') {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [request.selectedIndex]);

  const ownerDocument = container?.ownerDocument ?? document;
  return createPortal(
    <div
      ref={menuRef}
      className="knowledge-slash-command-menu"
      role="listbox"
      aria-label={tr('knowledge.commands.menuLabel')}
      aria-activedescendant={request.commands[request.selectedIndex]
        ? itemId(request.commands[request.selectedIndex])
        : undefined}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        maxHeight: position?.maxHeight ?? 320,
        maxWidth: position?.maxWidth ?? 320,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {request.commands.length === 0 ? (
        <p className="knowledge-slash-command-empty" role="status">
          {tr('knowledge.commands.empty')}
        </p>
      ) : request.commands.map((command, index) => {
        const selected = index === request.selectedIndex;
        return (
          <button
            key={command.id}
            ref={selected ? selectedRef : undefined}
            id={itemId(command)}
            type="button"
            role="option"
            aria-selected={selected}
            className={`knowledge-slash-command-item ${selected ? 'is-selected' : ''}`}
            tabIndex={-1}
            onMouseEnter={() => request.select(index)}
            onMouseDown={event => event.preventDefault()}
            onClick={() => request.execute(command.id)}
          >
            <span className="knowledge-slash-command-icon" aria-hidden="true">{command.icon}</span>
            <span className="knowledge-slash-command-copy">
              <span className="knowledge-slash-command-name">{command.label}</span>
              <span className="knowledge-slash-command-description">{command.description}</span>
            </span>
            {command.shortcut ? (
              <kbd className="knowledge-slash-command-shortcut">{platformShortcut(command.shortcut)}</kbd>
            ) : null}
          </button>
        );
      })}
    </div>,
    ownerDocument.body,
  );
}
