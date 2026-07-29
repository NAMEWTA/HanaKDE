/**
 * MarkdownEditorSurface — policy-driven CodeMirror 6 editor surface
 *
 * Obsidian 风格 markdown live preview：
 * - 衬线体渲染，无行号，无行高亮
 * - 已成立的语法标记始终 conceal，未完成的输入保留源码
 * - H1 居中，标题/粗体/斜体等格式实时渲染
 *
 * 架构：
 * - forwardRef 暴露 EditorView handle，供外部 toolbar 与显式保存调用
 * - Compartment 动态扩展槽，运行时可切换 mode/language
 * - 保存、附件、链接打开与内容门禁由调用方 policy 注入
 */

import { forwardRef, useEffect, useRef, useCallback, useImperativeHandle, useLayoutEffect, useMemo, useState, Fragment } from 'react';
import { EditorContextMenu } from './EditorContextMenu';
import { isContextMenuButton } from '../../stores/selection-actions';
import { EditorView } from '@codemirror/view';
import { EditorState, Transaction, EditorSelection } from '@codemirror/state';
import {
  type MarkdownBlockMenuRequest,
} from '../../editor/markdown-block-handles';
import {
  createMarkdownEditorCompartments,
  createMarkdownEditorExtensions,
} from '../../editor/create-markdown-editor-extensions';
import {
  isMarkdownCoverOnlyUpdate,
  mergeMarkdownCoverIntoDocument,
  parseMarkdownCover,
} from '../../utils/markdown-cover';
import { hasMarkdownCoverDropImage } from '../../utils/markdown-cover-drop';
import type { FileVersion, RemoteWorkbenchContentRef, VersionedWriteResult } from '../../types';
import type { MarkdownImageContext } from '../../utils/markdown';
import type { PreviewScrollSnapshot } from '../../../../../shared/preview-reading-position.ts';
import { KNOWLEDGE_MARKDOWN_MAX_BYTES } from '../../../../../shared/knowledge-workspace-contract.ts';
import type {
  KnowledgeLinkFieldConfig,
} from '../../editor/knowledge-link-field';

/* ── Types ── */

export { KNOWLEDGE_MARKDOWN_MAX_BYTES };

export type MarkdownContentGateRejectionReason = 'content_too_large' | 'invalid_utf8';

export type MarkdownContentGateResult =
  | {
      allowed: true;
      content: string;
      byteLength?: number;
      hadBom?: boolean;
    }
  | {
      allowed: false;
      reason: MarkdownContentGateRejectionReason;
      byteLength: number;
    };

export interface MarkdownEditorSaveError {
  code: 'conflict' | 'unavailable';
  cause?: unknown;
}

export interface MarkdownEditorSurfacePolicy {
  save: {
    scopeKey: string;
    mode: 'autosave' | 'manual';
    delayMs?: number;
    checkpointIntervalMs?: number;
    checkpoint?: (reason: 'edit-start' | 'autosave-interval') => Promise<void>;
    execute: (content: string, expectedVersion: FileVersion | null) => Promise<VersionedWriteResult>;
    onError?: (error: MarkdownEditorSaveError) => void;
  };
  attachment: {
    accepts?: (dataTransfer: DataTransfer | null) => boolean;
    insert?: (dataTransfer: DataTransfer | null) => Promise<string>;
    imageContext?: MarkdownImageContext;
    applyCoverDrop?: (dataTransfer: DataTransfer | null) => Promise<void>;
    onError?: (error: unknown) => void;
  } | null;
  openLink: {
    open: (url: string) => void | Promise<void>;
  } | null;
  knowledgeLinks?: KnowledgeLinkFieldConfig | null;
  contentGate: (input: { content: string }) => MarkdownContentGateResult;
}

export interface MarkdownEditorSurfaceHandle {
  getView(): EditorView | null;
  focus(): void;
  save(): Promise<boolean>;
  isDirty(): boolean;
  getScrollSnapshot(contentHash?: string): PreviewScrollSnapshot | null;
  restoreScrollSnapshot(snapshot: PreviewScrollSnapshot | null | undefined): void;
  scrollToLine(line: number): void;
  scrollToOffset(from: number, to?: number, options?: MarkdownEditorSurfaceScrollOptions): void;
  getTopVisibleLine(): number;
}

export interface MarkdownEditorSurfaceScrollOptions {
  focus?: boolean;
}

export interface MarkdownEditorSurfaceStats {
  selectedChars: number;
  totalChars: number;
}

export interface MarkdownEditorSurfaceQuoteRange {
  from: number;
  to: number;
}

export interface MarkdownEditorSurfaceProps {
  content: string;
  incomingContentMode?: 'protect-local' | 'registry-authoritative';
  savedContent?: string;
  filePath?: string;
  remoteContentRef?: RemoteWorkbenchContentRef | null;
  fileVersion?: FileVersion | null;
  policy: MarkdownEditorSurfacePolicy;
  mode: 'markdown' | 'code' | 'csv' | 'text';
  language?: string | null;
  onSelectionChange?: (view: EditorView) => void;
  onSelectionCommit?: (view: EditorView) => void;
  onQuoteRange?: (view: EditorView, range: MarkdownEditorSurfaceQuoteRange) => void;
  onStatsChange?: (stats: MarkdownEditorSurfaceStats) => void;
  onContentChange?: (content: string, fileVersion?: FileVersion | null) => void;
  onContentRejected?: (result: Extract<MarkdownContentGateResult, { allowed: false }>) => void;
  onViewDestroy?: () => void;
  initialScrollSnapshot?: PreviewScrollSnapshot | null;
  contentHash?: string;
  onScrollSnapshotChange?: (snapshot: PreviewScrollSnapshot, topVisibleLine: number) => void;
  /**
   * 只读模式：禁用编辑、不挂 autosave listener。
   * 调用方（如派生 viewer 窗口）自己把新 content 作为 prop 传入即可。
   */
  readOnly?: boolean;
}

export function decodeKnowledgeMarkdown(bytes: Uint8Array): MarkdownContentGateResult {
  if (bytes.byteLength > KNOWLEDGE_MARKDOWN_MAX_BYTES) {
    return {
      allowed: false,
      reason: 'content_too_large',
      byteLength: bytes.byteLength,
    };
  }
  const hadBom = bytes.byteLength >= 3
    && bytes[0] === 0xef
    && bytes[1] === 0xbb
    && bytes[2] === 0xbf;
  try {
    return {
      allowed: true,
      content: new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes),
      byteLength: bytes.byteLength,
      hadBom,
    };
  } catch {
    return {
      allowed: false,
      reason: 'invalid_utf8',
      byteLength: bytes.byteLength,
    };
  }
}

function hasUnpairedUtf16Surrogate(content: string): boolean {
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = content.charCodeAt(index + 1);
      if (index + 1 >= content.length || next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export function knowledgeMarkdownContentGate(
  input: { content: string },
): MarkdownContentGateResult {
  const encoded = new TextEncoder().encode(input.content);
  if (hasUnpairedUtf16Surrogate(input.content)) {
    return {
      allowed: false,
      reason: 'invalid_utf8',
      byteLength: encoded.byteLength,
    };
  }
  if (encoded.byteLength > KNOWLEDGE_MARKDOWN_MAX_BYTES) {
    return {
      allowed: false,
      reason: 'content_too_large',
      byteLength: encoded.byteLength,
    };
  }
  const hadBom = input.content.startsWith('\ufeff');
  return {
    allowed: true,
    content: hadBom ? input.content.slice(1) : input.content,
    byteLength: encoded.byteLength,
    hadBom,
  };
}

const EDITOR_HOST_MIN_SIZE_PX = 1;

interface SaveJob {
  text: string;
  revision: number;
  scopeKey: string;
  resolve?: (saved: boolean) => void;
}

interface PendingIncomingContent {
  content: string;
  fileVersion: FileVersion | null;
  noticeShown: boolean;
}

function fileVersionIdentity(version: FileVersion | null | undefined): string {
  if (!version) return '';
  return [
    Number.isFinite(version.mtimeMs) ? version.mtimeMs : '',
    Number.isFinite(version.size) ? version.size : '',
    version.sha256 || '',
  ].join(':');
}

function clampPos(pos: number, max: number): number {
  return Math.max(0, Math.min(pos, max));
}

function countTextChars(text: string): number {
  return Array.from(text).length;
}

function getSelectedText(state: EditorState): string {
  return state.selection.ranges
    .filter(range => !range.empty)
    .map(range => state.sliceDoc(range.from, range.to))
    .join('');
}

function getEditorStats(view: EditorView): MarkdownEditorSurfaceStats {
  return {
    selectedChars: countTextChars(getSelectedText(view.state).trim()),
    totalChars: countTextChars(view.state.doc.toString()),
  };
}

function scrollRatio(scrollTop: number, scrollHeight: number, clientHeight: number): number {
  const max = Math.max(0, scrollHeight - clientHeight);
  return max > 0 ? Math.min(1, Math.max(0, scrollTop / max)) : 0;
}

function getScrollSnapshot(view: EditorView, contentHash?: string): PreviewScrollSnapshot {
  const el = view.scrollDOM;
  return {
    scrollTop: el.scrollTop,
    scrollLeft: el.scrollLeft,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    ratio: scrollRatio(el.scrollTop, el.scrollHeight, el.clientHeight),
    ...(contentHash ? { contentHash } : {}),
  };
}

function restoreEditorScrollSnapshot(view: EditorView, snapshot: PreviewScrollSnapshot | null | undefined): void {
  if (!snapshot) return;
  const el = view.scrollDOM;
  const restore = () => {
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    const top = Number.isFinite(snapshot.scrollTop)
      ? snapshot.scrollTop
      : Number.isFinite(snapshot.ratio) ? (snapshot.ratio || 0) * max : 0;
    el.scrollTop = Math.min(max, Math.max(0, top));
    el.scrollLeft = Math.max(0, snapshot.scrollLeft || 0);
  };
  restore();
  queueMicrotask(restore);
  window.requestAnimationFrame?.(restore);
}

function topVisibleLine(view: EditorView): number {
  const rect = view.scrollDOM.getBoundingClientRect();
  const pos = view.posAtCoords({ x: rect.left + 8, y: rect.top + 8 }) ?? view.viewport.from;
  return Math.max(0, view.state.doc.lineAt(pos).number - 1);
}

function scrollEditorToOffset(view: EditorView, from: number, to = from, options: MarkdownEditorSurfaceScrollOptions = {}): void {
  const length = view.state.doc.length;
  const safeFrom = clampPos(from, length);
  const safeTo = clampPos(to, length);
  view.dispatch({
    selection: EditorSelection.single(safeFrom, safeTo),
    effects: EditorView.scrollIntoView(safeFrom, { y: 'start', yMargin: 64 }),
  });
  if (options.focus !== false) view.focus();
}

function restoreScrollPosition(view: EditorView, scrollTop: number, scrollLeft: number): void {
  const restore = () => {
    view.scrollDOM.scrollTop = scrollTop;
    view.scrollDOM.scrollLeft = scrollLeft;
  };
  restore();
  queueMicrotask(restore);
  window.requestAnimationFrame?.(restore);
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
  if (!win || win.closed) return false;
  if (doc.visibilityState === 'hidden') return false;
  const { width, height } = editorHostBoxSize(el);
  return width >= EDITOR_HOST_MIN_SIZE_PX && height >= EDITOR_HOST_MIN_SIZE_PX;
}

function replaceDocumentPreservingSelection(view: EditorView, content: string): boolean {
  const current = view.state.doc.toString();
  if (current === content) return false;
  const nextLength = content.length;
  const { anchor, head } = view.state.selection.main;
  const { scrollTop, scrollLeft } = view.scrollDOM;
  view.dispatch({
    changes: { from: 0, to: current.length, insert: content },
    selection: EditorSelection.single(clampPos(anchor, nextLength), clampPos(head, nextLength)),
    annotations: Transaction.remote.of(true),
  });
  restoreScrollPosition(view, scrollTop, scrollLeft);
  return true;
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

function insertMarkdownAt(view: EditorView, markdown: string, position: number | null): void {
  const selection = view.state.selection.main;
  const from = position ?? selection.from;
  const to = position ?? selection.to;
  view.dispatch({
    changes: { from, to, insert: markdown },
    selection: EditorSelection.cursor(from + markdown.length),
    scrollIntoView: true,
    annotations: Transaction.userEvent.of('input.paste'),
  });
}

function dropPosition(view: EditorView, event: DragEvent): number | null {
  try {
    return view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? null;
  } catch {
    return null;
  }
}

function dragEventElement(event: DragEvent): Element | null {
  return event.target instanceof Element ? event.target : null;
}

function editorCoverElementFromEvent(event: DragEvent): HTMLElement | null {
  return dragEventElement(event)?.closest('.cm-markdown-cover') as HTMLElement | null;
}

function clearEditorCoverDropState(view: EditorView): void {
  view.dom.classList.remove('cm-markdown-cover-rail-active');
  view.dom.querySelector('.cm-markdown-cover-drop-active')?.classList.remove('cm-markdown-cover-drop-active');
}

function isEditorCoverRailDrop(view: EditorView, event: DragEvent): boolean {
  if (parseMarkdownCover(view.state.doc.toString())) return false;
  const rect = view.scrollDOM.getBoundingClientRect();
  if (!Number.isFinite(event.clientY)) return false;
  const y = event.clientY;
  return y >= rect.top && y <= rect.top + 40;
}

/* ── Editor Component ── */

export const MarkdownEditorSurface = forwardRef<MarkdownEditorSurfaceHandle, MarkdownEditorSurfaceProps>(
  function MarkdownEditorSurface({ content, incomingContentMode = 'protect-local', savedContent, filePath, remoteContentRef, fileVersion, policy, mode, language, onSelectionChange, onSelectionCommit, onQuoteRange, onStatsChange, onContentChange, onContentRejected, onViewDestroy, initialScrollSnapshot, contentHash, onScrollSnapshotChange, readOnly = false }, ref) {
    const gateResult = useMemo(
      () => policy.contentGate({ content }),
      [content, policy],
    );
    const rejectedContent: Extract<MarkdownContentGateResult, { allowed: false }> | null =
      gateResult.allowed === false ? gateResult : null;
    const gatedContent = gateResult.allowed ? gateResult.content : '';
    const incomingFileVersionKey = fileVersionIdentity(fileVersion ?? null);
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const [blockMenuRequest, setBlockMenuRequest] = useState<MarkdownBlockMenuRequest | null>(null);
    const toggleBlockMenu = useCallback((request: MarkdownBlockMenuRequest) => {
      setBlockMenuRequest(current => (
        current
        && current.target.from === request.target.from
        && current.target.to === request.target.to
        && current.target.source === request.target.source
          ? null
          : request
      ));
    }, []);
    const [editorHostReadySignal, setEditorHostReadySignal] = useState(0);
    const lastEditorHostReadyRef = useRef(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveInFlightRef = useRef(false);
    const pendingSaveRef = useRef<SaveJob | null>(null);
    const manualSaveRef = useRef<() => Promise<boolean>>(async () => false);
    const lastSavedContentRef = useRef<string>(gatedContent);
    const selfWriteContentsRef = useRef<Set<string>>(new Set());
    const pendingIncomingContentRef = useRef<PendingIncomingContent | null>(null);
    const diskVersionRef = useRef<FileVersion | null>(fileVersion ?? null);
    const lastPropFileVersionKeyRef = useRef(incomingFileVersionKey);
    const docRevisionRef = useRef(0);
    const lastCheckpointAtRef = useRef<number>(0);
    const policyRef = useRef(policy);
    policyRef.current = policy;
    const selectionCbRef = useRef(onSelectionChange);
    selectionCbRef.current = onSelectionChange;
    const selectionCommitCbRef = useRef(onSelectionCommit);
    selectionCommitCbRef.current = onSelectionCommit;
    const statsCbRef = useRef(onStatsChange);
    statsCbRef.current = onStatsChange;
    const lastStatsRef = useRef<MarkdownEditorSurfaceStats | null>(null);
    const contentCbRef = useRef(onContentChange);
    contentCbRef.current = onContentChange;
    const initialScrollSnapshotRef = useRef(initialScrollSnapshot);
    initialScrollSnapshotRef.current = initialScrollSnapshot;
    const contentHashRef = useRef(contentHash);
    contentHashRef.current = contentHash;
    const scrollSnapshotCbRef = useRef(onScrollSnapshotChange);
    scrollSnapshotCbRef.current = onScrollSnapshotChange;
    const viewDestroyCbRef = useRef(onViewDestroy);
    viewDestroyCbRef.current = onViewDestroy;
    const restoredScrollKeyRef = useRef<string>('');

    useEffect(() => {
      if (rejectedContent) onContentRejected?.(rejectedContent);
    }, [onContentRejected, rejectedContent]);

    useEffect(() => {
      if (fileVersion !== undefined) {
        diskVersionRef.current = fileVersion;
      }
    }, [fileVersion]);

    useEffect(() => {
      if (savedContent !== undefined) {
        lastSavedContentRef.current = savedContent;
      }
    }, [savedContent]);

    // Per-instance compartments for dynamic reconfiguration
    const cRef = useRef(createMarkdownEditorCompartments());

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

      const check = () => {
        rafId = null;
        retryTimer = null;
        if (disposed) return;
        const ready = isEditorHostReady(host);
        if (ready && !lastEditorHostReadyRef.current && !viewRef.current) {
          setEditorHostReadySignal(signal => signal + 1);
        }
        lastEditorHostReadyRef.current = ready;
        if (!ready) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            scheduleCheck();
          }, 250);
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
    }, []);

    useImperativeHandle(ref, () => ({
      getView: () => viewRef.current,
      focus: () => viewRef.current?.focus(),
      save: () => manualSaveRef.current(),
      isDirty: () => {
        const view = viewRef.current;
        return Boolean(view && view.state.doc.toString() !== lastSavedContentRef.current);
      },
      getScrollSnapshot: (hash?: string) => viewRef.current ? getScrollSnapshot(viewRef.current, hash ?? contentHashRef.current) : null,
      restoreScrollSnapshot: (snapshot) => {
        if (viewRef.current) restoreEditorScrollSnapshot(viewRef.current, snapshot);
      },
      scrollToLine: (line) => {
        const view = viewRef.current;
        if (!view) return;
        const docLine = view.state.doc.line(Math.min(view.state.doc.lines, Math.max(1, line + 1)));
        scrollEditorToOffset(view, docLine.from);
      },
      scrollToOffset: (from, to, options) => {
        if (viewRef.current) scrollEditorToOffset(viewRef.current, from, to, options);
      },
      getTopVisibleLine: () => viewRef.current ? topVisibleLine(viewRef.current) : 0,
    }));

    const createCheckpointIfDue = useCallback(async () => {
      const savePolicy = policyRef.current.save;
      if (!savePolicy.checkpoint) return;
      const now = Date.now();
      const interval = savePolicy.checkpointIntervalMs ?? 0;
      if (lastCheckpointAtRef.current > 0 && now - lastCheckpointAtRef.current < interval) return;
      const reason = lastCheckpointAtRef.current > 0
        ? 'autosave-interval'
        : 'edit-start';
      try {
        await savePolicy.checkpoint(reason);
      } catch (cause) {
        savePolicy.onError?.({ code: 'unavailable', cause });
      } finally {
        lastCheckpointAtRef.current = now;
      }
    }, []);

    const insertMarkdownAttachments = useCallback(async (
      view: EditorView,
      dataTransfer: DataTransfer | null,
      position: number | null = null,
    ) => {
      const attachmentPolicy = policyRef.current.attachment;
      if (!attachmentPolicy?.insert) return;
      const markdown = await attachmentPolicy.insert(dataTransfer);
      if (markdown) insertMarkdownAt(view, markdown, position);
    }, []);

    const emitStatsIfChanged = useCallback((view: EditorView) => {
      const next = getEditorStats(view);
      const previous = lastStatsRef.current;
      if (
        previous
        && previous.selectedChars === next.selectedChars
        && previous.totalChars === next.totalChars
      ) {
        return;
      }
      lastStatsRef.current = next;
      statsCbRef.current?.(next);
    }, []);

    const rememberSelfWrite = useCallback((text: string) => {
      selfWriteContentsRef.current.add(text);
      window.setTimeout(() => {
        selfWriteContentsRef.current.delete(text);
      }, 5000);
    }, []);

    const performSave = useCallback(async ({ text, revision, scopeKey }: SaveJob): Promise<boolean> => {
      const savePolicy = policyRef.current.save;
      try {
        const matchesCurrentScope = () => (
          scopeKey === savePolicy.scopeKey
          && scopeKey === policyRef.current.save.scopeKey
        );
        if (revision !== docRevisionRef.current || !matchesCurrentScope()) return false;
        await createCheckpointIfDue();
        if (revision !== docRevisionRef.current || !matchesCurrentScope()) return false;
        const expectedVersion = diskVersionRef.current;
        const result = await savePolicy.execute(text, expectedVersion);
        if (!result?.ok) {
          savePolicy.onError?.({
            code: result?.conflict ? 'conflict' : 'unavailable',
          });
          return false;
        }
        if (!matchesCurrentScope()) return false;
        const nextVersion = result.version;
        if (result.version) diskVersionRef.current = result.version;
        lastSavedContentRef.current = text;
        if (pendingIncomingContentRef.current?.content === text) {
          pendingIncomingContentRef.current = null;
        }
        rememberSelfWrite(text);

        if (revision === docRevisionRef.current && nextVersion !== undefined) {
          contentCbRef.current?.(text, nextVersion);
        }
        return true;
      } catch (cause) {
        savePolicy.onError?.({ code: 'unavailable', cause });
        return false;
      }
    }, [createCheckpointIfDue, rememberSelfWrite]);

    const drainSaveQueue = useCallback(function drain() {
      if (saveInFlightRef.current) return;
      const job = pendingSaveRef.current;
      if (!job) return;
      pendingSaveRef.current = null;
      saveInFlightRef.current = true;
      void performSave(job)
        .then(saved => job.resolve?.(saved))
        .finally(() => {
          saveInFlightRef.current = false;
          drain();
        });
    }, [performSave]);

    const saveToFile = useCallback((
      text: string,
      revision: number = docRevisionRef.current,
      scopeKey: string = policyRef.current.save.scopeKey,
    ): Promise<boolean> => {
      pendingSaveRef.current?.resolve?.(false);
      const promise = new Promise<boolean>((resolve) => {
        pendingSaveRef.current = {
          text,
          revision,
          scopeKey,
          resolve,
        };
      });
      drainSaveQueue();
      return promise;
    }, [drainSaveQueue]);

    manualSaveRef.current = async () => {
      const view = viewRef.current;
      if (!view || readOnly) return false;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      return saveToFile(view.state.doc.toString(), docRevisionRef.current);
    };

    const applyIncomingContent = useCallback((nextContent: string, options: { publish?: boolean } = {}) => {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (current === nextContent) {
        if (options.publish) {
          lastSavedContentRef.current = nextContent;
          pendingIncomingContentRef.current = null;
        }
        return;
      }

      if (selfWriteContentsRef.current.has(nextContent)) {
        if (options.publish) {
          lastSavedContentRef.current = nextContent;
          pendingIncomingContentRef.current = null;
        }
        return;
      }

      if (incomingContentMode === 'registry-authoritative') {
        docRevisionRef.current += 1;
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        pendingIncomingContentRef.current = null;
        replaceDocumentPreservingSelection(view, nextContent);
        return;
      }

      const hasLocalUnsavedEdits = !readOnly && current !== lastSavedContentRef.current;
      if (hasLocalUnsavedEdits) {
        const merged = mode === 'markdown' && isMarkdownCoverOnlyUpdate(lastSavedContentRef.current, nextContent)
          ? mergeMarkdownCoverIntoDocument(current, nextContent)
          : null;
        if (merged) {
          docRevisionRef.current += 1;
          const revision = docRevisionRef.current;
          if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
          }
          lastSavedContentRef.current = nextContent;
          pendingIncomingContentRef.current = null;
          replaceDocumentPreservingSelection(view, merged);
          contentCbRef.current?.(merged);
          void saveToFile(merged, revision);
          return;
        }

        const nextVersion = diskVersionRef.current;
        const previousPending = pendingIncomingContentRef.current;
        const samePending = !!previousPending
          && previousPending.content === nextContent
          && fileVersionIdentity(previousPending.fileVersion) === fileVersionIdentity(nextVersion);
        const pending: PendingIncomingContent = {
          content: nextContent,
          fileVersion: nextVersion,
          noticeShown: samePending ? previousPending.noticeShown : false,
        };
        pendingIncomingContentRef.current = pending;
        contentCbRef.current?.(current);
        if (!pending.noticeShown) {
          policyRef.current.save.onError?.({
            code: 'conflict',
            cause: new Error('local edits are not saved yet'),
          });
          pending.noticeShown = true;
        }
        return;
      }

      docRevisionRef.current += 1;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      lastSavedContentRef.current = nextContent;
      pendingIncomingContentRef.current = null;
      replaceDocumentPreservingSelection(view, nextContent);
      if (options.publish) {
        contentCbRef.current?.(nextContent, diskVersionRef.current);
      }
    }, [incomingContentMode, mode, readOnly, saveToFile]);

    // Create editor
    useLayoutEffect(() => {
      if (!containerRef.current) return;
      if (!editorHostReadySignal || !isEditorHostReady(containerRef.current)) return;
      const c = cRef.current;
      const isMd = mode === 'markdown';
      const editorSaveScopeKey = policyRef.current.save.scopeKey;
      const attachmentExtension = isMd && !readOnly && policyRef.current.attachment?.insert
        ? EditorView.domEventHandlers({
            dragover(event) {
              if (!policyRef.current.attachment?.accepts?.(event.dataTransfer)) return false;
              event.preventDefault();
              if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
              return true;
            },
            drop(event, view) {
              if (!policyRef.current.attachment?.accepts?.(event.dataTransfer)) return false;
              event.preventDefault();
              event.stopPropagation();
              const position = dropPosition(view, event);
              void insertMarkdownAttachments(view, event.dataTransfer, position)
                .catch(error => policyRef.current.attachment?.onError?.(error));
              return true;
            },
            paste(event, view) {
              if (!policyRef.current.attachment?.accepts?.(event.clipboardData)) return false;
              event.preventDefault();
              event.stopPropagation();
              void insertMarkdownAttachments(view, event.clipboardData)
                .catch(error => policyRef.current.attachment?.onError?.(error));
              return true;
            },
          })
        : undefined;
      const changeExtension = EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        if (update.transactions.some((tr) => tr.annotation(Transaction.remote))) return;
        const text = update.state.doc.toString();
        docRevisionRef.current += 1;
        const revision = docRevisionRef.current;
        contentCbRef.current?.(text);
        if (policyRef.current.save.mode === 'autosave') {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
            void saveToFile(text, revision, editorSaveScopeKey);
          }, policyRef.current.save.delayMs ?? 600);
        }
      });
      const observeExtension = EditorView.updateListener.of((update) => {
          if (update.selectionSet && selectionCbRef.current) {
            selectionCbRef.current(update.view);
          }
          if (update.docChanged || update.selectionSet) {
            emitStatsIfChanged(update.view);
          }
      });
      const extensions = createMarkdownEditorExtensions({
        mode,
        readOnly,
        compartments: c,
        imageContext: policyRef.current.attachment?.imageContext ?? { filePath },
        attachmentExtension,
        changeExtension,
        observeExtension,
        onManualSave: policyRef.current.save.mode === 'manual'
          ? () => {
              void manualSaveRef.current();
              return true;
            }
          : undefined,
        onOpenBlockMenu: toggleBlockMenu,
        onOpenLink: (url) => policyRef.current.openLink?.open(url),
        knowledgeLinks: policyRef.current.knowledgeLinks ?? undefined,
      });

      const state = EditorState.create({ doc: gatedContent, extensions });
      const view = new EditorView({ state, parent: containerRef.current });
      const selectionCommitWindow = containerRef.current.ownerDocument.defaultView ?? window;
      const handledSelectionCommitEvents = new WeakSet<Event>();
      const onSelectionCommitEvent = (event: Event) => {
        if (handledSelectionCommitEvents.has(event)) return;
        if (isContextMenuButton(event)) return;
        handledSelectionCommitEvents.add(event);
        selectionCommitCbRef.current?.(view);
      };
      const onWindowSelectionCommitEvent = (event: Event) => {
        if (!view.hasFocus) return;
        onSelectionCommitEvent(event);
      };
      let scrollTimer: ReturnType<typeof setTimeout> | null = null;
      const publishScrollSnapshot = () => {
        scrollTimer = null;
        scrollSnapshotCbRef.current?.(getScrollSnapshot(view, contentHashRef.current), topVisibleLine(view));
      };
      const onScroll = () => {
        if (!scrollSnapshotCbRef.current) return;
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(publishScrollSnapshot, 160);
      };
      const onCoverDragOver = (event: DragEvent) => {
        const canApplyCover = Boolean(policyRef.current.attachment?.applyCoverDrop);
        const coverElement = editorCoverElementFromEvent(event);
        if (coverElement && canApplyCover && hasMarkdownCoverDropImage(event.dataTransfer)) {
          event.preventDefault();
          event.stopPropagation();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
          coverElement.classList.add('cm-markdown-cover-drop-active');
          view.dom.classList.remove('cm-markdown-cover-rail-active');
          return;
        }

        if (canApplyCover && hasMarkdownCoverDropImage(event.dataTransfer) && isEditorCoverRailDrop(view, event)) {
          event.preventDefault();
          event.stopPropagation();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
          view.dom.classList.add('cm-markdown-cover-rail-active');
          return;
        }

        clearEditorCoverDropState(view);
      };
      const onCoverDragLeave = (event: DragEvent) => {
        const coverElement = editorCoverElementFromEvent(event);
        if (coverElement && !(event.relatedTarget instanceof Node && coverElement.contains(event.relatedTarget))) {
          coverElement.classList.remove('cm-markdown-cover-drop-active');
        }
        if (!(event.relatedTarget instanceof Node && view.dom.contains(event.relatedTarget))) {
          clearEditorCoverDropState(view);
        }
      };
      const onCoverDrop = (event: DragEvent) => {
        const applyCoverDrop = policyRef.current.attachment?.applyCoverDrop;
        const coverElement = editorCoverElementFromEvent(event);
        const isCoverTarget = Boolean(coverElement)
          || (hasMarkdownCoverDropImage(event.dataTransfer) && isEditorCoverRailDrop(view, event));
        if (!applyCoverDrop || !isCoverTarget || !hasMarkdownCoverDropImage(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        clearEditorCoverDropState(view);
        void applyCoverDrop(event.dataTransfer)
          .catch(error => policyRef.current.attachment?.onError?.(error));
      };
      view.dom.addEventListener('mouseup', onSelectionCommitEvent);
      view.dom.addEventListener('touchend', onSelectionCommitEvent);
      view.dom.addEventListener('keyup', onSelectionCommitEvent);
      selectionCommitWindow.addEventListener('mouseup', onWindowSelectionCommitEvent);
      selectionCommitWindow.addEventListener('touchend', onWindowSelectionCommitEvent);
      selectionCommitWindow.addEventListener('keyup', onWindowSelectionCommitEvent);
      view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });
      view.dom.addEventListener('dragover', onCoverDragOver, true);
      view.dom.addEventListener('dragleave', onCoverDragLeave, true);
      view.dom.addEventListener('drop', onCoverDrop, true);
      viewRef.current = view;
      lastStatsRef.current = null;
      emitStatsIfChanged(view);
      restoreEditorScrollSnapshot(view, initialScrollSnapshotRef.current);

      return () => {
        if (scrollTimer) {
          clearTimeout(scrollTimer);
          publishScrollSnapshot();
        }
        if (saveTimerRef.current && policyRef.current.save.mode === 'autosave') {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
          void saveToFile(view.state.doc.toString(), docRevisionRef.current, editorSaveScopeKey);
        }
        view.dom.removeEventListener('mouseup', onSelectionCommitEvent);
        view.dom.removeEventListener('touchend', onSelectionCommitEvent);
        view.dom.removeEventListener('keyup', onSelectionCommitEvent);
        selectionCommitWindow.removeEventListener('mouseup', onWindowSelectionCommitEvent);
        selectionCommitWindow.removeEventListener('touchend', onWindowSelectionCommitEvent);
        selectionCommitWindow.removeEventListener('keyup', onWindowSelectionCommitEvent);
        view.scrollDOM.removeEventListener('scroll', onScroll);
        view.dom.removeEventListener('dragover', onCoverDragOver, true);
        view.dom.removeEventListener('dragleave', onCoverDragLeave, true);
        view.dom.removeEventListener('drop', onCoverDrop, true);
        view.destroy();
        viewDestroyCbRef.current?.();
        viewRef.current = null;
      };
    }, [editorHostReadySignal, mode, language, readOnly, filePath, remoteContentRef, gateResult.allowed, emitStatsIfChanged, insertMarkdownAttachments]); // eslint-disable-line react-hooks/exhaustive-deps -- 仅在 host 可测量以及 mode/language/readOnly/filePath/remoteContentRef/gate 变化时重建 CodeMirror，content/refs 故意省略以避免销毁重建

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      syncEditorRootToDom(view);
    });

    useEffect(() => {
      const view = viewRef.current;
      const snapshot = initialScrollSnapshot;
      if (!view || !snapshot) return;
      const key = `${filePath || remoteContentRef?.contentPath || ''}:${mode}:${contentHash || ''}:${snapshot.updatedAt || ''}:${snapshot.scrollTop}:${snapshot.ratio ?? ''}`;
      if (restoredScrollKeyRef.current === key) return;
      restoredScrollKeyRef.current = key;
      restoreEditorScrollSnapshot(view, snapshot);
    }, [contentHash, filePath, initialScrollSnapshot, mode, remoteContentRef?.contentPath]);

    // content prop change → update editor (skip if already in sync)
    useEffect(() => {
      const versionChanged = incomingFileVersionKey !== lastPropFileVersionKeyRef.current;
      lastPropFileVersionKeyRef.current = incomingFileVersionKey;
      if (gateResult.allowed) {
        applyIncomingContent(gateResult.content, { publish: versionChanged });
      }
    }, [gateResult, incomingFileVersionKey, applyIncomingContent]);

    const getViewForMenu = useCallback(() => viewRef.current, []);
    const closeBlockMenu = useCallback(() => setBlockMenuRequest(null), []);

    if (!gateResult.allowed) return null;

    return (
      <Fragment>
        <div className={`preview-editor mode-${mode}`} ref={containerRef} />
        <EditorContextMenu
          getView={getViewForMenu}
          containerRef={containerRef}
          mode={mode}
          readOnly={readOnly}
          blockMenuRequest={blockMenuRequest}
          onBlockMenuClose={closeBlockMenu}
          onQuoteRange={onQuoteRange}
        />
      </Fragment>
    );
  },
);
