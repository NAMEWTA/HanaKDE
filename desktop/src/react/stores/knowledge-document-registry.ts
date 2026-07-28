import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  parseKnowledgeResourceAddress,
  type KnowledgeResourceAddress,
} from '../../../../shared/knowledge-workspace-contract.ts';

export type KnowledgeDocumentMode = 'live-preview' | 'source';
export type KnowledgeDocumentLineEnding = 'lf' | 'crlf';

export interface KnowledgeDocumentVersion {
  mtimeMs?: number;
  size?: number | null;
  sha256?: string;
  etag?: string;
  sequence?: number;
}

export interface KnowledgeDocumentFormat {
  hadBom: boolean;
  lineEnding: KnowledgeDocumentLineEnding;
  mixedLineEndings: boolean;
}

export interface KnowledgeDocumentSaveError {
  code: 'conflict' | 'unavailable';
  fileName: string;
  reason: string;
}

export interface KnowledgeDocumentSelection {
  anchor: number;
  head: number;
}

export interface KnowledgeDocumentScroll {
  top: number;
  left: number;
}

export interface KnowledgeDocumentViewport {
  from: number;
  to: number;
}

export interface KnowledgeDocumentRange {
  from: number;
  to: number;
}

export interface KnowledgeDocumentTextEdit {
  from: number;
  to: number;
  insert: string;
  deleted: string;
}

export interface KnowledgeDocumentHistoryEntry {
  id: number;
  originViewId: string;
  forward: KnowledgeDocumentTextEdit;
  inverse: KnowledgeDocumentTextEdit;
}

export interface KnowledgeDocumentHistory {
  revision: number;
  undo: KnowledgeDocumentHistoryEntry[];
  redo: KnowledgeDocumentHistoryEntry[];
}

export interface KnowledgeDocumentConflict {
  baseline: string;
  local: string;
  disk: string;
  diskVersion: KnowledgeDocumentVersion | null;
  diskFormat: KnowledgeDocumentFormat;
}

export interface KnowledgeExternalDocumentSnapshot {
  buffer: string;
  diskVersion: KnowledgeDocumentVersion;
  format: KnowledgeDocumentFormat;
  forceConflict?: boolean;
}

export type KnowledgeExternalDocumentResult =
  | 'missing'
  | 'unchanged'
  | 'reloaded'
  | 'conflict';

export type KnowledgeDocumentConflictResolution =
  | { kind: 'merge'; content: string }
  | { kind: 'local' }
  | { kind: 'disk' };

export interface KnowledgeDocumentSession {
  key: string;
  address: KnowledgeResourceAddress;
  buffer: string;
  baseline: string;
  diskVersion: KnowledgeDocumentVersion | null;
  format: KnowledgeDocumentFormat;
  history: KnowledgeDocumentHistory;
  dirty: boolean;
  saveError: KnowledgeDocumentSaveError | null;
  conflict: KnowledgeDocumentConflict | null;
  orphan: boolean;
}

export interface KnowledgeDocumentView {
  id: string;
  sessionKey: string;
  groupId: string;
  cursor: number;
  selection: KnowledgeDocumentSelection;
  scroll: KnowledgeDocumentScroll;
  viewport: KnowledgeDocumentViewport;
  mode: KnowledgeDocumentMode;
  revealedSyntaxRanges: KnowledgeDocumentRange[];
}

export interface KnowledgeDocumentRegistryContext {
  ownerId: string;
  windowId: string | number;
}

export interface EstablishKnowledgeDocumentSessionInput {
  address: KnowledgeResourceAddress;
  buffer: string;
  baseline?: string;
  diskVersion?: KnowledgeDocumentVersion | null;
  format?: KnowledgeDocumentFormat;
}

export interface OpenKnowledgeDocumentViewInput {
  viewId: string;
  address: KnowledgeResourceAddress;
  groupId: string;
}

export interface KnowledgeDocumentViewPatch {
  groupId?: string;
  cursor?: number;
  selection?: KnowledgeDocumentSelection;
  scroll?: KnowledgeDocumentScroll;
  viewport?: KnowledgeDocumentViewport;
  mode?: KnowledgeDocumentMode;
  revealedSyntaxRanges?: KnowledgeDocumentRange[];
}

export interface KnowledgeDocumentRegistryState {
  context: Readonly<KnowledgeDocumentRegistryContext>;
  sessions: Record<string, KnowledgeDocumentSession>;
  views: Record<string, KnowledgeDocumentView>;
  establishDocumentSession: (
    input: EstablishKnowledgeDocumentSessionInput,
  ) => string;
  openDocumentView: (
    input: OpenKnowledgeDocumentViewInput,
  ) => KnowledgeDocumentView;
  updateDocumentView: (
    viewId: string,
    patch: KnowledgeDocumentViewPatch,
  ) => void;
  replaceDocumentBuffer: (
    viewId: string,
    buffer: string,
    originViewPatch?: Pick<
      KnowledgeDocumentViewPatch,
      'cursor' | 'selection' | 'scroll' | 'viewport' | 'revealedSyntaxRanges'
    >,
  ) => boolean;
  undoDocument: (viewId: string) => boolean;
  redoDocument: (viewId: string) => boolean;
  commitSavedDocument: (
    address: KnowledgeResourceAddress,
    savedBuffer: string,
    diskVersion: KnowledgeDocumentVersion | null,
  ) => boolean;
  reportDocumentSaveError: (
    address: KnowledgeResourceAddress,
    error: KnowledgeDocumentSaveError,
  ) => boolean;
  clearDocumentSaveError: (address: KnowledgeResourceAddress) => boolean;
  reconcileExternalDocument: (
    address: KnowledgeResourceAddress,
    snapshot: KnowledgeExternalDocumentSnapshot,
  ) => KnowledgeExternalDocumentResult;
  resolveDocumentConflict: (
    address: KnowledgeResourceAddress,
    resolution: KnowledgeDocumentConflictResolution,
  ) => boolean;
  closeDocumentView: (viewId: string) => boolean;
  disposeDocumentSession: (address: KnowledgeResourceAddress) => boolean;
  dispose: () => void;
}

export type KnowledgeDocumentRegistry =
  StoreApi<KnowledgeDocumentRegistryState>;

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function requireNonEmptyIdentifier(value: unknown, field: string): string {
  if (
    typeof value !== 'string'
    || value.trim() !== value
    || value.length === 0
    || hasControlCharacter(value)
  ) {
    throw new TypeError(`${field} must be a non-empty identifier`);
  }
  return value;
}

function validateContext(
  context: KnowledgeDocumentRegistryContext,
): Readonly<KnowledgeDocumentRegistryContext> {
  const ownerId = requireNonEmptyIdentifier(context?.ownerId, 'ownerId');
  const windowId = context?.windowId;
  if (
    !(
      (typeof windowId === 'string'
        && windowId.length > 0
        && windowId.trim() === windowId
        && !hasControlCharacter(windowId))
      || (typeof windowId === 'number'
        && Number.isSafeInteger(windowId)
        && windowId >= 0)
    )
  ) {
    throw new TypeError('windowId must be a non-empty string or non-negative integer');
  }
  return Object.freeze({ ownerId, windowId });
}

function validateAddress(
  address: KnowledgeResourceAddress,
): KnowledgeResourceAddress {
  const parsed = parseKnowledgeResourceAddress(address);
  if (!parsed.ok) {
    throw new TypeError(`invalid knowledge address: ${parsed.error.code}`);
  }
  return parsed.value;
}

/**
 * A collision-free, canonical in-memory key. It is intentionally not persisted
 * into Markdown and contains no native path.
 */
export function knowledgeDocumentKey(
  address: KnowledgeResourceAddress,
): string {
  const canonical = validateAddress(address);
  return JSON.stringify([canonical.sourceKey, canonical.relativePath]);
}

function cloneVersion(
  version: KnowledgeDocumentVersion | null | undefined,
): KnowledgeDocumentVersion | null {
  if (version == null) return null;
  const next: KnowledgeDocumentVersion = {};
  if (version.mtimeMs !== undefined) {
    if (!Number.isFinite(version.mtimeMs) || version.mtimeMs < 0) {
      throw new TypeError('diskVersion.mtimeMs is invalid');
    }
    next.mtimeMs = version.mtimeMs;
  }
  if (version.size !== undefined) {
    if (
      version.size !== null
      && (!Number.isSafeInteger(version.size) || version.size < 0)
    ) {
      throw new TypeError('diskVersion.size is invalid');
    }
    next.size = version.size;
  }
  if (version.sha256 !== undefined) {
    if (typeof version.sha256 !== 'string' || version.sha256.length === 0) {
      throw new TypeError('diskVersion.sha256 is invalid');
    }
    next.sha256 = version.sha256;
  }
  if (version.etag !== undefined) {
    if (typeof version.etag !== 'string' || version.etag.length === 0) {
      throw new TypeError('diskVersion.etag is invalid');
    }
    next.etag = version.etag;
  }
  if (version.sequence !== undefined) {
    if (!Number.isSafeInteger(version.sequence) || version.sequence < 0) {
      throw new TypeError('diskVersion.sequence is invalid');
    }
    next.sequence = version.sequence;
  }
  if (Object.keys(next).length === 0) {
    throw new TypeError('diskVersion must contain a version field');
  }
  return next;
}

function validateFormat(
  value: KnowledgeDocumentFormat | undefined,
): KnowledgeDocumentFormat {
  const format = value ?? {
    hadBom: false,
    lineEnding: 'lf',
    mixedLineEndings: false,
  };
  if (
    typeof format.hadBom !== 'boolean'
    || (format.lineEnding !== 'lf' && format.lineEnding !== 'crlf')
    || typeof format.mixedLineEndings !== 'boolean'
  ) {
    throw new TypeError('format is invalid');
  }
  return { ...format };
}

function sameFormat(
  left: KnowledgeDocumentFormat,
  right: KnowledgeDocumentFormat,
): boolean {
  return left.hadBom === right.hadBom
    && left.lineEnding === right.lineEnding
    && left.mixedLineEndings === right.mixedLineEndings;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${field} must be a string`);
  }
  return value;
}

function finiteNonNegative(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${field} must be a finite non-negative number`);
  }
  return value;
}

function documentPosition(value: unknown, field: string, length: number): number {
  const position = finiteNonNegative(value, field);
  if (!Number.isSafeInteger(position) || position > length) {
    throw new RangeError(`${field} must be an integer within the document`);
  }
  return position;
}

function validateRange(
  value: KnowledgeDocumentRange,
  field: string,
  length: number,
): KnowledgeDocumentRange {
  const from = documentPosition(value?.from, `${field}.from`, length);
  const to = documentPosition(value?.to, `${field}.to`, length);
  if (to < from) throw new RangeError(`${field}.to must not precede from`);
  return { from, to };
}

function validateViewPatch(
  current: KnowledgeDocumentView,
  patch: KnowledgeDocumentViewPatch,
  documentLength: number,
): KnowledgeDocumentView {
  if (patch == null || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new TypeError('view patch must be an object');
  }
  const next: KnowledgeDocumentView = {
    ...current,
    selection: { ...current.selection },
    scroll: { ...current.scroll },
    viewport: { ...current.viewport },
    revealedSyntaxRanges: current.revealedSyntaxRanges.map(range => ({ ...range })),
  };
  if (patch.groupId !== undefined) {
    next.groupId = requireNonEmptyIdentifier(patch.groupId, 'groupId');
  }
  if (patch.cursor !== undefined) {
    next.cursor = documentPosition(patch.cursor, 'cursor', documentLength);
  }
  if (patch.selection !== undefined) {
    next.selection = {
      anchor: documentPosition(
        patch.selection?.anchor,
        'selection.anchor',
        documentLength,
      ),
      head: documentPosition(
        patch.selection?.head,
        'selection.head',
        documentLength,
      ),
    };
  }
  if (patch.scroll !== undefined) {
    next.scroll = {
      top: finiteNonNegative(patch.scroll?.top, 'scroll.top'),
      left: finiteNonNegative(patch.scroll?.left, 'scroll.left'),
    };
  }
  if (patch.viewport !== undefined) {
    next.viewport = validateRange(patch.viewport, 'viewport', documentLength);
  }
  if (patch.mode !== undefined) {
    if (patch.mode !== 'live-preview' && patch.mode !== 'source') {
      throw new TypeError('mode is invalid');
    }
    next.mode = patch.mode;
  }
  if (patch.revealedSyntaxRanges !== undefined) {
    if (!Array.isArray(patch.revealedSyntaxRanges)) {
      throw new TypeError('revealedSyntaxRanges must be an array');
    }
    next.revealedSyntaxRanges = patch.revealedSyntaxRanges.map((range, index) =>
      validateRange(range, `revealedSyntaxRanges[${index}]`, documentLength));
  }
  return next;
}

function createTextEdit(before: string, after: string): KnowledgeDocumentTextEdit {
  let from = 0;
  const sharedLimit = Math.min(before.length, after.length);
  while (from < sharedLimit && before.charCodeAt(from) === after.charCodeAt(from)) {
    from += 1;
  }

  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (
    beforeEnd > from
    && afterEnd > from
    && before.charCodeAt(beforeEnd - 1) === after.charCodeAt(afterEnd - 1)
  ) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  return {
    from,
    to: beforeEnd,
    insert: after.slice(from, afterEnd),
    deleted: before.slice(from, beforeEnd),
  };
}

function invertTextEdit(edit: KnowledgeDocumentTextEdit): KnowledgeDocumentTextEdit {
  return {
    from: edit.from,
    to: edit.from + edit.insert.length,
    insert: edit.deleted,
    deleted: edit.insert,
  };
}

function applyTextEdit(buffer: string, edit: KnowledgeDocumentTextEdit): string {
  if (
    edit.from < 0
    || edit.to < edit.from
    || edit.to > buffer.length
    || buffer.slice(edit.from, edit.to) !== edit.deleted
  ) {
    throw new Error('document history no longer matches the shared buffer');
  }
  return buffer.slice(0, edit.from) + edit.insert + buffer.slice(edit.to);
}

function mapPosition(position: number, edit: KnowledgeDocumentTextEdit): number {
  if (position <= edit.from) return position;
  if (position >= edit.to) {
    return position + edit.insert.length - (edit.to - edit.from);
  }
  return edit.from + edit.insert.length;
}

function mapRange(
  range: KnowledgeDocumentRange,
  edit: KnowledgeDocumentTextEdit,
): KnowledgeDocumentRange {
  const from = mapPosition(range.from, edit);
  const to = mapPosition(range.to, edit);
  return from <= to ? { from, to } : { from: to, to: from };
}

function mapViewsForEdit(
  views: Record<string, KnowledgeDocumentView>,
  sessionKey: string,
  edit: KnowledgeDocumentTextEdit,
): Record<string, KnowledgeDocumentView> {
  let nextViews = views;
  for (const [viewId, view] of Object.entries(views)) {
    if (view.sessionKey !== sessionKey) continue;
    if (nextViews === views) nextViews = { ...views };
    nextViews[viewId] = {
      ...view,
      cursor: mapPosition(view.cursor, edit),
      selection: {
        anchor: mapPosition(view.selection.anchor, edit),
        head: mapPosition(view.selection.head, edit),
      },
      viewport: mapRange(view.viewport, edit),
      revealedSyntaxRanges: view.revealedSyntaxRanges.map(range =>
        mapRange(range, edit)),
    };
  }
  return nextViews;
}

function defaultView(
  input: OpenKnowledgeDocumentViewInput,
  sessionKey: string,
): KnowledgeDocumentView {
  return {
    id: requireNonEmptyIdentifier(input.viewId, 'viewId'),
    sessionKey,
    groupId: requireNonEmptyIdentifier(input.groupId, 'groupId'),
    cursor: 0,
    selection: { anchor: 0, head: 0 },
    scroll: { top: 0, left: 0 },
    viewport: { from: 0, to: 0 },
    mode: 'live-preview',
    revealedSyntaxRanges: [],
  };
}

export function createKnowledgeDocumentRegistry(
  inputContext: KnowledgeDocumentRegistryContext,
): KnowledgeDocumentRegistry {
  const context = validateContext(inputContext);

  return createStore<KnowledgeDocumentRegistryState>()((set, get) => ({
    context,
    sessions: {},
    views: {},

    establishDocumentSession(input) {
      const address = validateAddress(input.address);
      const key = knowledgeDocumentKey(address);
      const existing = get().sessions[key];
      if (existing) return key;
      const buffer = requireString(input.buffer, 'buffer');
      const baseline = requireString(input.baseline ?? buffer, 'baseline');
      const diskVersion = cloneVersion(input.diskVersion);
      const session: KnowledgeDocumentSession = {
        key,
        address: { ...address },
        buffer,
        baseline,
        diskVersion,
        format: validateFormat(input.format),
        history: { revision: 0, undo: [], redo: [] },
        dirty: buffer !== baseline,
        saveError: null,
        conflict: null,
        orphan: false,
      };
      set(state => ({
        sessions: { ...state.sessions, [key]: session },
      }));
      return key;
    },

    openDocumentView(input) {
      const viewId = requireNonEmptyIdentifier(input.viewId, 'viewId');
      const key = knowledgeDocumentKey(input.address);
      const existing = get().views[viewId];
      if (existing) {
        if (existing.sessionKey !== key) {
          throw new Error('viewId is already attached to another document');
        }
        return existing;
      }
      if (!get().sessions[key]) {
        throw new Error('document session must be established before opening a view');
      }
      const view = defaultView({ ...input, viewId }, key);
      set(state => ({ views: { ...state.views, [viewId]: view } }));
      return view;
    },

    updateDocumentView(viewId, patch) {
      const current = get().views[viewId];
      if (!current) throw new Error('document view does not exist');
      const session = get().sessions[current.sessionKey];
      if (!session) throw new Error('document session does not exist');
      const next = validateViewPatch(current, patch, session.buffer.length);
      set(state => ({ views: { ...state.views, [viewId]: next } }));
    },

    replaceDocumentBuffer(viewId, nextBuffer, originViewPatch) {
      requireString(nextBuffer, 'buffer');
      const state = get();
      const originView = state.views[viewId];
      if (!originView) return false;
      const session = state.sessions[originView.sessionKey];
      if (!session) return false;

      if (nextBuffer === session.buffer) {
        if (originViewPatch) {
          const nextView = validateViewPatch(
            originView,
            originViewPatch,
            nextBuffer.length,
          );
          set(current => ({
            views: { ...current.views, [viewId]: nextView },
          }));
        }
        return false;
      }

      const edit = createTextEdit(session.buffer, nextBuffer);
      const inverse = invertTextEdit(edit);
      const nextRevision = session.history.revision + 1;
      const entry: KnowledgeDocumentHistoryEntry = {
        id: nextRevision,
        originViewId: viewId,
        forward: edit,
        inverse,
      };
      let views = mapViewsForEdit(state.views, session.key, edit);
      if (originViewPatch) {
        views = {
          ...views,
          [viewId]: validateViewPatch(
            views[viewId],
            originViewPatch,
            nextBuffer.length,
          ),
        };
      }
      const nextSession: KnowledgeDocumentSession = {
        ...session,
        buffer: nextBuffer,
        dirty: nextBuffer !== session.baseline,
        conflict: session.conflict
          ? { ...session.conflict, local: nextBuffer }
          : null,
        history: {
          revision: nextRevision,
          undo: [...session.history.undo, entry],
          redo: [],
        },
      };
      set({
        sessions: { ...state.sessions, [session.key]: nextSession },
        views,
      });
      return true;
    },

    undoDocument(viewId) {
      const state = get();
      const view = state.views[viewId];
      if (!view) return false;
      const session = state.sessions[view.sessionKey];
      const entry = session?.history.undo.at(-1);
      if (!session || !entry) return false;
      const buffer = applyTextEdit(session.buffer, entry.inverse);
      const nextSession: KnowledgeDocumentSession = {
        ...session,
        buffer,
        dirty: buffer !== session.baseline,
        conflict: session.conflict
          ? { ...session.conflict, local: buffer }
          : null,
        history: {
          revision: session.history.revision + 1,
          undo: session.history.undo.slice(0, -1),
          redo: [...session.history.redo, entry],
        },
      };
      set({
        sessions: { ...state.sessions, [session.key]: nextSession },
        views: mapViewsForEdit(state.views, session.key, entry.inverse),
      });
      return true;
    },

    redoDocument(viewId) {
      const state = get();
      const view = state.views[viewId];
      if (!view) return false;
      const session = state.sessions[view.sessionKey];
      const entry = session?.history.redo.at(-1);
      if (!session || !entry) return false;
      const buffer = applyTextEdit(session.buffer, entry.forward);
      const nextSession: KnowledgeDocumentSession = {
        ...session,
        buffer,
        dirty: buffer !== session.baseline,
        conflict: session.conflict
          ? { ...session.conflict, local: buffer }
          : null,
        history: {
          revision: session.history.revision + 1,
          undo: [...session.history.undo, entry],
          redo: session.history.redo.slice(0, -1),
        },
      };
      set({
        sessions: { ...state.sessions, [session.key]: nextSession },
        views: mapViewsForEdit(state.views, session.key, entry.forward),
      });
      return true;
    },

    commitSavedDocument(address, savedBuffer, diskVersion) {
      requireString(savedBuffer, 'savedBuffer');
      const key = knowledgeDocumentKey(address);
      const state = get();
      const session = state.sessions[key];
      if (!session) return false;
      const nextVersion = cloneVersion(diskVersion);
      set({
        sessions: {
          ...state.sessions,
          [key]: {
            ...session,
            baseline: savedBuffer,
            diskVersion: nextVersion,
            dirty: session.buffer !== savedBuffer,
            format: {
              ...session.format,
              mixedLineEndings: false,
            },
            saveError: null,
            conflict: session.conflict?.disk === savedBuffer
              ? null
              : session.conflict,
          },
        },
      });
      return true;
    },

    reportDocumentSaveError(address, error) {
      const key = knowledgeDocumentKey(address);
      const state = get();
      const session = state.sessions[key];
      if (!session) return false;
      if (
        (error?.code !== 'conflict' && error?.code !== 'unavailable')
        || typeof error.fileName !== 'string'
        || error.fileName.length === 0
        || typeof error.reason !== 'string'
        || error.reason.length === 0
      ) {
        throw new TypeError('save error is invalid');
      }
      set({
        sessions: {
          ...state.sessions,
          [key]: {
            ...session,
            saveError: { ...error },
          },
        },
      });
      return true;
    },

    clearDocumentSaveError(address) {
      const key = knowledgeDocumentKey(address);
      const state = get();
      const session = state.sessions[key];
      if (!session || session.saveError === null) return false;
      set({
        sessions: {
          ...state.sessions,
          [key]: { ...session, saveError: null },
        },
      });
      return true;
    },

    reconcileExternalDocument(address, snapshot) {
      const key = knowledgeDocumentKey(address);
      const state = get();
      const session = state.sessions[key];
      if (!session) return 'missing';
      const disk = requireString(snapshot?.buffer, 'snapshot.buffer');
      const diskVersion = cloneVersion(snapshot?.diskVersion);
      if (!diskVersion) {
        throw new TypeError('snapshot.diskVersion is required');
      }
      const diskFormat = validateFormat(snapshot?.format);
      const forceConflict = snapshot?.forceConflict === true;
      const diskMatchesBaseline = disk === session.baseline
        && sameFormat(diskFormat, session.format);

      if (session.conflict) {
        if (
          session.conflict.disk === disk
          && JSON.stringify(session.conflict.diskVersion) === JSON.stringify(diskVersion)
        ) {
          return 'unchanged';
        }
        set({
          sessions: {
            ...state.sessions,
            [key]: {
              ...session,
              conflict: {
                ...session.conflict,
                local: session.buffer,
                disk,
                diskVersion,
                diskFormat,
              },
            },
          },
        });
        return 'conflict';
      }

      if (!forceConflict && diskMatchesBaseline) {
        set({
          sessions: {
            ...state.sessions,
            [key]: {
              ...session,
              diskVersion,
              format: diskFormat,
            },
          },
        });
        return 'unchanged';
      }

      if (session.dirty || (forceConflict && session.format.mixedLineEndings)) {
        set({
          sessions: {
            ...state.sessions,
            [key]: {
              ...session,
              conflict: {
                baseline: session.baseline,
                local: session.buffer,
                disk,
                diskVersion,
                diskFormat,
              },
            },
          },
        });
        return 'conflict';
      }

      if (session.buffer === disk) {
        set({
          sessions: {
            ...state.sessions,
            [key]: {
              ...session,
              baseline: disk,
              diskVersion,
              format: diskFormat,
            },
          },
        });
        return 'unchanged';
      }

      const edit = createTextEdit(session.buffer, disk);
      set({
        sessions: {
          ...state.sessions,
          [key]: {
            ...session,
            buffer: disk,
            baseline: disk,
            diskVersion,
            format: diskFormat,
            history: {
              revision: session.history.revision + 1,
              undo: [],
              redo: [],
            },
            dirty: false,
            conflict: null,
          },
        },
        views: mapViewsForEdit(state.views, session.key, edit),
      });
      return 'reloaded';
    },

    resolveDocumentConflict(address, resolution) {
      const key = knowledgeDocumentKey(address);
      const state = get();
      const session = state.sessions[key];
      const conflict = session?.conflict;
      if (!session || !conflict) return false;
      if (
        !resolution
        || (resolution.kind !== 'merge'
          && resolution.kind !== 'local'
          && resolution.kind !== 'disk')
      ) {
        throw new TypeError('conflict resolution is invalid');
      }
      const buffer = resolution.kind === 'merge'
        ? requireString(resolution.content, 'resolution.content')
        : resolution.kind === 'local'
          ? session.buffer
          : conflict.disk;
      const edit = createTextEdit(session.buffer, buffer);
      let views = state.views;
      let history = session.history;
      if (buffer !== session.buffer) {
        const nextRevision = session.history.revision + 1;
        const entry: KnowledgeDocumentHistoryEntry = {
          id: nextRevision,
          originViewId: 'conflict-resolver',
          forward: edit,
          inverse: invertTextEdit(edit),
        };
        views = mapViewsForEdit(state.views, session.key, edit);
        history = {
          revision: nextRevision,
          undo: [...session.history.undo, entry],
          redo: [],
        };
      }
      set({
        sessions: {
          ...state.sessions,
          [key]: {
            ...session,
            buffer,
            baseline: conflict.disk,
            diskVersion: cloneVersion(conflict.diskVersion),
            format: validateFormat(conflict.diskFormat),
            history,
            dirty: buffer !== conflict.disk,
            saveError: null,
            conflict: null,
          },
        },
        views,
      });
      return true;
    },

    closeDocumentView(viewId) {
      const state = get();
      if (!state.views[viewId]) return false;
      const views = { ...state.views };
      delete views[viewId];
      set({ views });
      return true;
    },

    disposeDocumentSession(address) {
      const key = knowledgeDocumentKey(address);
      const state = get();
      if (!state.sessions[key]) return false;
      if (Object.values(state.views).some(view => view.sessionKey === key)) {
        return false;
      }
      const sessions = { ...state.sessions };
      delete sessions[key];
      set({ sessions });
      return true;
    },

    dispose() {
      set({ sessions: {}, views: {} });
    },
  }));
}
