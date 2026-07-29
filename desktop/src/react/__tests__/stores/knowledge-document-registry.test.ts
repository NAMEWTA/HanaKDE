import { describe, expect, it, vi } from 'vitest';
import type { KnowledgeResourceAddress } from '../../../../../shared/knowledge-workspace-contract.ts';
import {
  createKnowledgeDocumentRegistry,
  knowledgeDocumentKey,
} from '../../stores/knowledge-document-registry';

const address: KnowledgeResourceAddress = {
  sourceKey: 'main',
  relativePath: 'notes/alpha.md',
};

function establish(
  registry: ReturnType<typeof createKnowledgeDocumentRegistry>,
  target = address,
  buffer = '# Alpha\n',
) {
  return registry.getState().establishDocumentSession({
    address: target,
    buffer,
    baseline: buffer,
    diskVersion: { mtimeMs: 10, size: buffer.length, sha256: 'v1' },
  });
}

describe('knowledge document registry', () => {
  it('shares one buffer, baseline, version, dirty flag, and undo history across views', () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner-a',
      windowId: 'window-1',
    });
    const sessionKey = establish(registry);
    registry.getState().openDocumentView({
      viewId: 'view-left',
      address,
      groupId: 'group-left',
    });
    registry.getState().openDocumentView({
      viewId: 'view-right',
      address,
      groupId: 'group-right',
    });
    const changes: string[] = [];
    const unsubscribe = registry.subscribe((state, previous) => {
      if (state.sessions[sessionKey]?.buffer !== previous.sessions[sessionKey]?.buffer) {
        changes.push(state.sessions[sessionKey]?.buffer ?? '');
      }
    });

    registry.getState().replaceDocumentBuffer(
      'view-left',
      '# Alpha changed\n',
      {
        cursor: 15,
        selection: { anchor: 15, head: 15 },
      },
    );

    let state = registry.getState();
    expect(state.sessions[sessionKey]).toMatchObject({
      buffer: '# Alpha changed\n',
      baseline: '# Alpha\n',
      diskVersion: { mtimeMs: 10, size: 8, sha256: 'v1' },
      dirty: true,
    });
    expect(state.sessions[sessionKey].history.undo).toHaveLength(1);
    expect(changes).toEqual(['# Alpha changed\n']);

    expect(state.undoDocument('view-right')).toBe(true);
    state = registry.getState();
    expect(state.sessions[sessionKey]).toMatchObject({
      buffer: '# Alpha\n',
      dirty: false,
    });
    expect(state.sessions[sessionKey].history.redo).toHaveLength(1);

    expect(state.redoDocument('view-left')).toBe(true);
    expect(registry.getState().sessions[sessionKey]).toMatchObject({
      buffer: '# Alpha changed\n',
      dirty: true,
    });
    unsubscribe();
  });

  it('keeps cursor, selection, scroll, viewport, mode, and syntax visibility per view', () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner-a',
      windowId: 7,
    });
    establish(registry);
    registry.getState().openDocumentView({
      viewId: 'view-left',
      address,
      groupId: 'group-left',
    });
    registry.getState().openDocumentView({
      viewId: 'view-right',
      address,
      groupId: 'group-right',
    });

    registry.getState().updateDocumentView('view-left', {
      cursor: 4,
      selection: { anchor: 1, head: 4 },
      scroll: { top: 120, left: 8 },
      viewport: { from: 1, to: 8 },
      mode: 'source',
      revealedSyntaxRanges: [{ from: 0, to: 3 }],
    });

    expect(registry.getState().views['view-left']).toMatchObject({
      cursor: 4,
      selection: { anchor: 1, head: 4 },
      scroll: { top: 120, left: 8 },
      viewport: { from: 1, to: 8 },
      mode: 'source',
      revealedSyntaxRanges: [{ from: 0, to: 3 }],
    });
    expect(registry.getState().views['view-right']).toMatchObject({
      cursor: 0,
      selection: { anchor: 0, head: 0 },
      scroll: { top: 0, left: 0 },
      viewport: { from: 0, to: 0 },
      mode: 'live-preview',
      revealedSyntaxRanges: [],
    });
  });

  it('restores an existing view but gives a closed and reopened view fresh defaults', () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner-a',
      windowId: 'window-1',
    });
    establish(registry);
    registry.getState().openDocumentView({
      viewId: 'view-a',
      address,
      groupId: 'group-a',
    });
    registry.getState().updateDocumentView('view-a', {
      cursor: 5,
      scroll: { top: 80, left: 0 },
      mode: 'source',
    });

    const existing = registry.getState().openDocumentView({
      viewId: 'view-a',
      address,
      groupId: 'ignored-group',
    });
    expect(existing).toMatchObject({
      groupId: 'group-a',
      cursor: 5,
      scroll: { top: 80, left: 0 },
      mode: 'source',
    });

    registry.getState().closeDocumentView('view-a');
    const reopened = registry.getState().openDocumentView({
      viewId: 'view-a',
      address,
      groupId: 'group-b',
    });
    expect(reopened).toMatchObject({
      groupId: 'group-b',
      cursor: 0,
      selection: { anchor: 0, head: 0 },
      scroll: { top: 0, left: 0 },
      mode: 'live-preview',
    });
  });

  it('maps positions for both views after shared edits without making them equal', () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner-a',
      windowId: 'window-1',
    });
    establish(registry, address, 'abcdef');
    registry.getState().openDocumentView({
      viewId: 'view-left',
      address,
      groupId: 'group-left',
    });
    registry.getState().openDocumentView({
      viewId: 'view-right',
      address,
      groupId: 'group-right',
    });
    registry.getState().updateDocumentView('view-left', {
      cursor: 2,
      selection: { anchor: 2, head: 2 },
    });
    registry.getState().updateDocumentView('view-right', {
      cursor: 5,
      selection: { anchor: 4, head: 5 },
    });

    registry.getState().replaceDocumentBuffer('view-left', 'abXYZcdef', {
      cursor: 5,
      selection: { anchor: 5, head: 5 },
    });

    expect(registry.getState().views['view-left']).toMatchObject({
      cursor: 5,
      selection: { anchor: 5, head: 5 },
    });
    expect(registry.getState().views['view-right']).toMatchObject({
      cursor: 8,
      selection: { anchor: 7, head: 8 },
    });
  });

  it('only advances the saved baseline/version after the matching buffer is committed', () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner-a',
      windowId: 'window-1',
    });
    const sessionKey = establish(registry);
    registry.getState().openDocumentView({
      viewId: 'view-a',
      address,
      groupId: 'group-a',
    });
    registry.getState().replaceDocumentBuffer('view-a', '# Draft one\n');
    const savedDraft = registry.getState().sessions[sessionKey].buffer;
    registry.getState().replaceDocumentBuffer('view-a', '# Draft two\n');

    registry.getState().commitSavedDocument(
      address,
      savedDraft,
      { mtimeMs: 20, size: savedDraft.length, sha256: 'v2' },
    );

    expect(registry.getState().sessions[sessionKey]).toMatchObject({
      buffer: '# Draft two\n',
      baseline: '# Draft one\n',
      diskVersion: { mtimeMs: 20, size: 12, sha256: 'v2' },
      dirty: true,
    });
  });

  it('isolates owner/window contexts and never stores editor, DOM, or file handles', () => {
    const first = createKnowledgeDocumentRegistry({
      ownerId: 'owner-a',
      windowId: 'window-1',
    });
    const second = createKnowledgeDocumentRegistry({
      ownerId: 'owner-a',
      windowId: 'window-2',
    });
    const third = createKnowledgeDocumentRegistry({
      ownerId: 'owner-b',
      windowId: 'window-1',
    });
    const fileHandle = { kind: 'file', name: 'alpha.md' };
    const key = first.getState().establishDocumentSession({
      address,
      buffer: '# Alpha\n',
      baseline: '# Alpha\n',
      diskVersion: { mtimeMs: 10, size: 8, sha256: 'v1' },
      fileHandle,
    } as Parameters<
      ReturnType<typeof first.getState>['establishDocumentSession']
    >[0]);
    establish(second);
    establish(third);
    first.getState().openDocumentView({
      viewId: 'view-a',
      address,
      groupId: 'group-a',
      editorView: { state: 'must not enter the registry' },
    } as Parameters<
      ReturnType<typeof first.getState>['openDocumentView']
    >[0]);
    first.getState().replaceDocumentBuffer('view-a', '# Private draft\n');

    expect(second.getState().sessions[key].buffer).toBe('# Alpha\n');
    expect(third.getState().sessions[key].buffer).toBe('# Alpha\n');
    const serializableState = {
      context: first.getState().context,
      sessions: first.getState().sessions,
      views: first.getState().views,
    };
    expect(() => JSON.stringify(serializableState)).not.toThrow();
    expect(JSON.stringify(serializableState)).not.toMatch(
      /EditorView|HTMLElement|FileSystemHandle|fileHandle|dom/i,
    );
  });

  it('keeps the first established session when a late load resolves for the same address', () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner-a',
      windowId: 'window-1',
    });
    const key = establish(registry, address, '# Current\n');

    const duplicateKey = establish(registry, address, '# Stale response\n');

    expect(duplicateKey).toBe(key);
    expect(registry.getState().sessions[key]).toMatchObject({
      buffer: '# Current\n',
      baseline: '# Current\n',
      dirty: false,
      conflict: null,
      orphan: false,
    });
  });

  it('rejects invalid addresses/context/view state and leaves no partial state', () => {
    expect(() => createKnowledgeDocumentRegistry({
      ownerId: '',
      windowId: 'window-1',
    })).toThrow(/ownerId/);

    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner-a',
      windowId: 'window-1',
    });
    expect(() => establish(registry, {
      sourceKey: 'main',
      relativePath: '../escape.md',
    })).toThrow(/address/);
    expect(registry.getState().sessions).toEqual({});

    establish(registry);
    registry.getState().openDocumentView({
      viewId: 'view-a',
      address,
      groupId: 'group-a',
    });
    const before = registry.getState().views['view-a'];
    expect(() => registry.getState().updateDocumentView('view-a', {
      scroll: { top: Number.NaN, left: 0 },
    })).toThrow(/scroll/);
    expect(registry.getState().views['view-a']).toBe(before);
    expect(registry.getState().undoDocument('missing')).toBe(false);
  });

  it('uses an unambiguous canonical address key and explicit cleanup', () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner-a',
      windowId: 'window-1',
    });
    const firstAddress = {
      sourceKey: 'main',
      relativePath: 'folder:a.md',
    };
    const firstKey = establish(registry, firstAddress, 'one');
    const secondKey = establish(registry, {
      sourceKey: 'main',
      relativePath: 'folder/a.md',
    }, 'two');

    expect(firstKey).toBe(knowledgeDocumentKey(firstAddress));
    expect(firstKey).not.toBe(secondKey);
    expect(registry.getState().disposeDocumentSession(firstAddress)).toBe(true);
    expect(registry.getState().sessions[firstKey]).toBeUndefined();

    registry.getState().dispose();
    expect(registry.getState().sessions).toEqual({});
    expect(registry.getState().views).toEqual({});
  });

  it('notifies once per atomic mutation', () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner-a',
      windowId: 'window-1',
    });
    establish(registry);
    registry.getState().openDocumentView({
      viewId: 'view-a',
      address,
      groupId: 'group-a',
    });
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);

    registry.getState().replaceDocumentBuffer('view-a', '# Updated\n');

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('keeps clean missing and unavailable resources as distinct placeholders', () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner-a',
      windowId: 'window-1',
    });
    const key = establish(registry);

    expect(registry.getState().markDocumentResourceUnavailable(
      address,
      'missing',
    )).toBe(true);
    expect(registry.getState().sessions[key]).toMatchObject({
      dirty: false,
      orphan: false,
      resourceState: 'missing',
    });
    expect(registry.getState().markDocumentResourceUnavailable(
      address,
      'source-unavailable',
    )).toBe(true);
    expect(registry.getState().sessions[key]).toMatchObject({
      dirty: false,
      orphan: false,
      resourceState: 'source-unavailable',
    });
  });

  it('irreversibly orphans a dirty document and ignores source recovery reloads', () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner-a',
      windowId: 'window-1',
    });
    const key = establish(registry);
    registry.getState().openDocumentView({
      viewId: 'view-a',
      address,
      groupId: 'group-a',
    });
    registry.getState().replaceDocumentBuffer('view-a', '# local\n');

    registry.getState().markDocumentResourceUnavailable(
      address,
      'source-unavailable',
    );
    expect(registry.getState().sessions[key]).toMatchObject({
      buffer: '# local\n',
      dirty: true,
      orphan: true,
      resourceState: 'orphan',
    });
    expect(registry.getState().reconcileExternalDocument(address, {
      buffer: '# recovered disk\n',
      diskVersion: { etag: 'recovered', size: 17 },
      format: {
        hadBom: false,
        lineEnding: 'lf',
        mixedLineEndings: false,
      },
    })).toBe('unchanged');
    expect(registry.getState().sessions[key]).toMatchObject({
      buffer: '# local\n',
      orphan: true,
      resourceState: 'orphan',
    });
  });

  it('rebinds an orphan and all of its views only after a successful new Page save', () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner-a',
      windowId: 'window-1',
    });
    const oldKey = establish(registry);
    registry.getState().openDocumentView({
      viewId: 'view-a',
      address,
      groupId: 'group-a',
    });
    registry.getState().replaceDocumentBuffer(
      'view-a',
      '[[Old/Link.md]]\n# local\n',
    );
    registry.getState().markDocumentResourceUnavailable(address, 'missing');
    const target = {
      sourceKey: 'archive',
      relativePath: 'Recovered/Alpha.md',
    };
    const targetKey = knowledgeDocumentKey(target);

    expect(registry.getState().rebindOrphanDocument(
      address,
      target,
      { etag: 'created', size: 24 },
    )).toBe(true);
    expect(registry.getState().sessions[oldKey]).toBeUndefined();
    expect(registry.getState().sessions[targetKey]).toMatchObject({
      address: target,
      buffer: '[[Old/Link.md]]\n# local\n',
      baseline: '[[Old/Link.md]]\n# local\n',
      dirty: false,
      orphan: false,
      resourceState: 'available',
      diskVersion: { etag: 'created', size: 24 },
    });
    expect(registry.getState().views['view-a'].sessionKey).toBe(targetKey);
  });
});
