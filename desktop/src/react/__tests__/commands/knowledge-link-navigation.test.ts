// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type {
  KnowledgeLinkActivation,
} from '../../editor/knowledge-link-field';
import {
  navigateKnowledgeLink,
  revealKnowledgeHeading,
} from '../../commands/knowledge-link-navigation';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  createKnowledgeDocumentRegistry,
  knowledgeDocumentKey,
} from '../../stores/knowledge-document-registry';
import {
  saveKnowledgeDocument,
} from '../../utils/knowledge-document-operations';
import type {
  KnowledgeWorkspaceClient,
} from '../../services/knowledge-workspace-client';

const pageAddress = {
  sourceKey: 'main',
  relativePath: 'Notes/Today.md',
} as const;

function activation(
  relativePath: string,
  availability: 'available' | 'missing' = 'available',
): KnowledgeLinkActivation {
  return {
    kind: 'internal',
    sourceKind: 'wikilink',
    embedded: false,
    address: {
      sourceKey: 'main',
      relativePath,
    },
    fragment: null,
    availability,
  };
}

function source(writable = true) {
  return {
    sourceKey: 'main',
    displayName: 'Main workspace',
    available: true,
    writable,
  };
}

describe('knowledge link navigation', () => {
  it('reveals the first case-sensitive exact heading without changing source', () => {
    const sourceText = '# Intro\n\n## Target\none\n\n## target\ntwo\n\n## Target\nthree\n';
    const view = new EditorView({
      state: EditorState.create({ doc: sourceText }),
    });

    expect(revealKnowledgeHeading(view, 'Target')).toBe(true);
    expect(view.state.selection.main.head).toBe(sourceText.indexOf('## Target'));
    expect(view.state.doc.toString()).toBe(sourceText);
    expect(revealKnowledgeHeading(view, 'TARGET')).toBe(false);
    view.destroy();
  });

  it('opens same-source resources through the global preview seam and reuses its result', async () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner',
      windowId: 'window',
    });
    const stat = vi.fn(async () => ({ exists: true, isDirectory: false }));
    const openResource = vi.fn(() => ({
      viewId: 'existing-view',
      reused: true,
    }));

    const result = await navigateKnowledgeLink({
      activation: activation('Pages/Target.md'),
      pageAddress,
      source: source(),
      registry,
      stat,
      openResource,
      groupId: 'current-group',
    });

    expect(result).toEqual({
      ok: true,
      viewId: 'existing-view',
      reused: true,
      pendingCreate: false,
    });
    expect(stat).toHaveBeenCalledWith({
      sourceKey: 'main',
      relativePath: 'Pages/Target.md',
    }, {
      signal: undefined,
    });
    expect(openResource).toHaveBeenCalledWith({
      address: {
        sourceKey: 'main',
        relativePath: 'Pages/Target.md',
      },
      sourceName: 'Main workspace',
      kind: 'markdown',
    }, {
      mode: 'preview',
      groupId: 'current-group',
    });
  });

  it('rejects cross-source fallback before stat or open', async () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner',
      windowId: 'window',
    });
    const stat = vi.fn();
    const openResource = vi.fn();
    const crossSource = {
      ...activation('Pages/Target.md'),
      address: {
        sourceKey: 'other',
        relativePath: 'Pages/Target.md',
      },
    } satisfies KnowledgeLinkActivation;

    await expect(navigateKnowledgeLink({
      activation: crossSource,
      pageAddress,
      source: source(),
      registry,
      stat,
      openResource,
      groupId: 'group',
    })).resolves.toEqual({ ok: false, reason: 'out_of_scope' });
    expect(stat).not.toHaveBeenCalled();
    expect(openResource).not.toHaveBeenCalled();
  });

  it('opens a missing same-source Markdown page as pending without writing', async () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner',
      windowId: 'window',
    });
    const target = {
      sourceKey: 'main',
      relativePath: 'Deep/New Page.md',
    };
    const openResource = vi.fn(() => ({
      viewId: 'pending-view',
      reused: false,
    }));

    const result = await navigateKnowledgeLink({
      activation: activation(target.relativePath, 'missing'),
      pageAddress,
      source: source(),
      registry,
      stat: vi.fn(async () => ({ exists: false, isDirectory: false })),
      openResource,
      groupId: 'group',
    });

    expect(result).toMatchObject({ ok: true, pendingCreate: true });
    expect(registry.getState().sessions[knowledgeDocumentKey(target)])
      .toMatchObject({
        buffer: '',
        baseline: '',
        diskVersion: null,
        dirty: false,
        pendingCreate: true,
      });
    expect(openResource).toHaveBeenCalledTimes(1);
    expect(registry.getState().disposeDocumentSession(target)).toBe(true);
    expect(registry.getState().sessions[knowledgeDocumentKey(target)])
      .toBeUndefined();
  });

  it('creates pending parents and Page only on explicit save with null expected version', async () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner',
      windowId: 'window',
    });
    const target = {
      sourceKey: 'main',
      relativePath: 'Deep/New Page.md',
    };
    registry.getState().establishDocumentSession({
      address: target,
      buffer: '',
      baseline: '',
      diskVersion: null,
      pendingCreate: true,
    });
    const writeExpectedVersion = vi.fn(async () => ({
      ok: true as const,
      changeType: 'created' as const,
      version: { etag: 'created', size: 0 },
    }));
    const client = {
      resources: { writeExpectedVersion },
    } as unknown as KnowledgeWorkspaceClient;

    await expect(saveKnowledgeDocument({
      registry,
      address: target,
      client,
    })).resolves.toEqual({ ok: true });
    expect(writeExpectedVersion).toHaveBeenCalledWith(
      target,
      expect.any(String),
      null,
      { encoding: 'base64', signal: undefined },
    );
    expect(registry.getState().sessions[knowledgeDocumentKey(target)])
      .toMatchObject({
        pendingCreate: false,
        dirty: false,
        diskVersion: { etag: 'created', size: 0 },
      });
  });

  it('keeps a pending buffer intact when null-version creation conflicts', async () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner',
      windowId: 'window',
    });
    const target = {
      sourceKey: 'main',
      relativePath: 'Deep/Raced.md',
    };
    registry.getState().establishDocumentSession({
      address: target,
      buffer: 'local draft',
      baseline: '',
      diskVersion: null,
      pendingCreate: true,
    });
    const writeExpectedVersion = vi.fn(async () => ({
      ok: false as const,
      conflict: true as const,
      version: { etag: 'external', size: 8 },
    }));
    const client = {
      resources: { writeExpectedVersion },
    } as unknown as KnowledgeWorkspaceClient;

    await expect(saveKnowledgeDocument({
      registry,
      address: target,
      client,
    })).resolves.toEqual({ ok: false, conflict: true });
    expect(registry.getState().sessions[knowledgeDocumentKey(target)])
      .toMatchObject({
        buffer: 'local draft',
        baseline: '',
        dirty: true,
        pendingCreate: true,
        saveError: { code: 'conflict' },
      });
  });

  it('does not turn missing Assets, read-only sources, or stat errors into pending Pages', async () => {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner',
      windowId: 'window',
    });
    const openResource = vi.fn();
    const base = {
      pageAddress,
      registry,
      openResource,
      groupId: 'group',
    };

    await expect(navigateKnowledgeLink({
      ...base,
      activation: activation('missing.png', 'missing'),
      source: source(),
      stat: async () => ({ exists: false, isDirectory: false }),
    })).resolves.toEqual({ ok: false, reason: 'missing_asset' });
    await expect(navigateKnowledgeLink({
      ...base,
      activation: {
        ...activation('missing.md', 'missing'),
        sourceKind: 'markdown_link',
      },
      source: source(),
      stat: async () => ({ exists: false, isDirectory: false }),
    })).resolves.toEqual({ ok: false, reason: 'missing_asset' });
    await expect(navigateKnowledgeLink({
      ...base,
      activation: activation('missing.md', 'missing'),
      source: source(false),
      stat: async () => ({ exists: false, isDirectory: false }),
    })).resolves.toEqual({ ok: false, reason: 'read_only' });
    await expect(navigateKnowledgeLink({
      ...base,
      activation: activation('missing.md', 'missing'),
      source: source(),
      stat: async () => {
        throw new Error('unavailable');
      },
    })).resolves.toEqual({ ok: false, reason: 'target_unavailable' });

    expect(registry.getState().sessions).toEqual({});
    expect(openResource).not.toHaveBeenCalled();
  });
});
