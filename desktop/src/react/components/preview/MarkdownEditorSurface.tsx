import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type {
  MarkdownEditorCompartments,
  MarkdownEditorMode,
} from '../../editor/create-markdown-editor-extensions';

const EDITOR_HOST_MIN_SIZE_PX = 1;

export type MarkdownEditorSurfaceLifecycle = (
  view: EditorView,
) => void | (() => void);

export interface MarkdownEditorSurfaceProps {
  className?: string;
  configurationKey: string;
  containerRef: RefObject<HTMLDivElement | null>;
  initialContent: string;
  mode: MarkdownEditorMode;
  createExtensions(
    compartments: MarkdownEditorCompartments,
  ): readonly Extension[];
  onViewChange?(view: EditorView | null): void;
  onViewCreated?: MarkdownEditorSurfaceLifecycle;
}

export function MarkdownEditorSurface({
  className,
  configurationKey,
  containerRef,
  initialContent,
  mode,
  createExtensions,
  onViewChange,
  onViewCreated,
}: MarkdownEditorSurfaceProps) {
  const viewRef = useRef<EditorView | null>(null);
  const initialContentRef = useRef(initialContent);
  initialContentRef.current = initialContent;
  const createExtensionsRef = useRef(createExtensions);
  createExtensionsRef.current = createExtensions;
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  const onViewCreatedRef = useRef(onViewCreated);
  onViewCreatedRef.current = onViewCreated;
  const [hostReadySignal, setHostReadySignal] = useState(0);
  const lastHostReadyRef = useRef(false);
  const compartmentsRef = useRef<MarkdownEditorCompartments>({
    lang: new Compartment(),
    highlight: new Compartment(),
    gutter: new Compartment(),
    conceal: new Compartment(),
    theme: new Compartment(),
  });

  useLayoutEffect(() => {
    const host = containerRef.current;
    if (!host) return undefined;
    const doc = host.ownerDocument;
    const win = doc.defaultView ?? window;
    let disposed = false;
    let rafId: number | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const clearPending = () => {
      if (rafId !== null) {
        win.cancelAnimationFrame?.(rafId);
        rafId = null;
      }
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };
    const scheduleCheck = () => {
      if (disposed || rafId !== null || retryTimer) return;
      if (typeof win.requestAnimationFrame === 'function') {
        rafId = win.requestAnimationFrame(check);
      } else {
        retryTimer = setTimeout(check, 0);
      }
    };
    const check = () => {
      rafId = null;
      retryTimer = null;
      if (disposed) return;
      const ready = isEditorHostReady(host);
      if (ready && !lastHostReadyRef.current && !viewRef.current) {
        setHostReadySignal(signal => signal + 1);
      }
      lastHostReadyRef.current = ready;
      if (!ready) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          scheduleCheck();
        }, 250);
      }
    };
    const requestCheck = () => {
      if (disposed) return;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      scheduleCheck();
    };

    if (typeof win.ResizeObserver === 'function') {
      resizeObserver = new win.ResizeObserver(requestCheck);
      resizeObserver.observe(host);
    }
    doc.addEventListener('visibilitychange', requestCheck);
    win.addEventListener('resize', requestCheck);
    check();
    return () => {
      disposed = true;
      clearPending();
      resizeObserver?.disconnect();
      doc.removeEventListener('visibilitychange', requestCheck);
      win.removeEventListener('resize', requestCheck);
    };
  }, [containerRef]);

  useLayoutEffect(() => {
    const host = containerRef.current;
    if (!host || !hostReadySignal || !isEditorHostReady(host)) return undefined;
    const state = EditorState.create({
      doc: initialContentRef.current,
      extensions: [
        ...createExtensionsRef.current(compartmentsRef.current),
      ],
    });
    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    onViewChangeRef.current?.(view);
    const cleanup = onViewCreatedRef.current?.(view);
    return () => {
      if (typeof cleanup === 'function') cleanup();
      view.destroy();
      viewRef.current = null;
      onViewChangeRef.current?.(null);
    };
  }, [configurationKey, containerRef, hostReadySignal]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    syncEditorRootToDom(view);
  });

  return (
    <div
      className={className ?? `preview-editor mode-${mode}`}
      ref={containerRef}
    />
  );
}

function editorHostBoxSize(el: HTMLElement): { width: number; height: number } {
  const rect = el.getBoundingClientRect();
  return {
    width: Math.max(rect.width, el.clientWidth, el.offsetWidth),
    height: Math.max(rect.height, el.clientHeight, el.offsetHeight),
  };
}

function isEditorHostReady(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const doc = el.ownerDocument;
  const win = doc.defaultView;
  if (!win || win.closed || doc.visibilityState === 'hidden') return false;
  const { width, height } = editorHostBoxSize(el);
  return width >= EDITOR_HOST_MIN_SIZE_PX
    && height >= EDITOR_HOST_MIN_SIZE_PX;
}

function syncEditorRootToDom(view: EditorView): void {
  const root = view.dom.getRootNode();
  const currentRoot: unknown = view.root;
  if (root === currentRoot) return;
  const nodeType = (root as Node).nodeType;
  const isDocument = nodeType === 9;
  const isShadowRoot = nodeType === 11 && 'host' in root;
  if (isDocument || isShadowRoot) {
    view.setRoot(root as Document | ShadowRoot);
  }
}
