// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  KnowledgeResourceAddress,
  KnowledgeSourceDto,
} from '../../../../../shared/knowledge-workspace-contract.ts';
import type { KnowledgeWorkspaceClient } from '../../services/knowledge-workspace-client';
import {
  KnowledgeEditorGroups,
  type KnowledgeEditorGroupsHandle,
  type KnowledgeOpenResource,
} from '../../components/knowledge-workspace/KnowledgeEditorGroups';
import {
  createKnowledgeDocumentRegistry,
  knowledgeDocumentKey,
} from '../../stores/knowledge-document-registry';

const markdownFiles = new Map([
  ['notes/A.md', '# A\n'],
  ['notes/B.md', '# B\n'],
  ['notes/C.md', '# C\n'],
]);

function base64(value: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(value)));
}

function createClient(): KnowledgeWorkspaceClient {
  return {
    resources: {
      stat: vi.fn(async (address: KnowledgeResourceAddress) => {
        const content = markdownFiles.get(address.relativePath) ?? '';
        return {
          exists: true,
          isDirectory: false,
          version: { etag: `etag:${address.relativePath}`, size: content.length },
        };
      }),
      read: vi.fn(async (address: KnowledgeResourceAddress) => {
        const content = markdownFiles.get(address.relativePath) ?? '';
        return {
          content: base64(content),
          encoding: 'base64' as const,
          version: { etag: `etag:${address.relativePath}`, size: content.length },
        };
      }),
      writeExpectedVersion: vi.fn(async (
        address: KnowledgeResourceAddress,
      ) => ({
        ok: true as const,
        version: { etag: `saved:${address.relativePath}`, size: 1 },
      })),
    },
  } as unknown as KnowledgeWorkspaceClient;
}

function resource(relativePath: string): KnowledgeOpenResource {
  return {
    address: { sourceKey: 'main', relativePath },
    sourceName: 'Main workspace',
    kind: 'markdown',
  };
}

describe('KnowledgeEditorGroups', () => {
  beforeEach(() => {
    window.t = ((key: string, vars?: Record<string, string | number>) => ({
      'knowledge.editor.groupLabel': `Editor group ${vars?.number ?? ''}`.trim(),
      'knowledge.editor.emptyTitle': 'Open a resource',
      'knowledge.editor.emptyDescription': 'Choose a resource from the tree.',
      'knowledge.editor.splitHorizontal': 'Split right',
      'knowledge.editor.splitVertical': 'Split down',
      'knowledge.tabs.label': 'Open resources',
      'knowledge.tabs.preview': `Preview ${vars?.name}`,
      'knowledge.tabs.close': `Close ${vars?.name}`,
      'knowledge.tabs.openSide': `Open ${vars?.name} to the side`,
      'knowledge.breadcrumb.label': 'Resource location',
      'knowledge.document.loading': 'Loading document…',
      'knowledge.document.editorLabel': `Edit ${vars?.name}`,
      'knowledge.document.noticesLabel': 'Document notices',
      'knowledge.asset.label': 'Asset viewer',
      'knowledge.asset.loading': 'Loading asset…',
      'knowledge.asset.openDefault': 'Open with default application',
      'knowledge.unsaved.description': `Unsaved ${vars?.document}`,
    })[key] ?? key) as typeof window.t;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setup(
    sources: KnowledgeSourceDto[] = [{
      sourceKey: 'main',
      displayName: 'Main workspace',
      role: 'main',
      capabilities: ['read', 'write', 'watch'],
      availability: 'available',
    }],
    client = createClient(),
  ) {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner',
      windowId: 'groups-test',
    });
    const controller = createRef<KnowledgeEditorGroupsHandle>();
    render(
      <KnowledgeEditorGroups
        ref={controller}
        registry={registry}
        client={client}
        workspaceKey="workspace-a"
        sources={sources}
        onLocateResource={vi.fn()}
        conflictServices={{
          watchSource: () => () => undefined,
          subscribeToChanges: () => () => undefined,
        }}
      />,
    );
    return { registry, controller };
  }

  it('uses normal Wikilink navigation for current-view outbound opens', async () => {
    const client = createClient();
    vi.mocked(client.resources.stat).mockImplementation(async (nextAddress) => ({
      exists: nextAddress.relativePath !== 'notes/New.md',
      isDirectory: false,
      version: { etag: `etag:${nextAddress.relativePath}`, size: 0 },
    }));
    const { controller, registry } = setup(undefined, client);
    let opened = { viewId: '', groupId: '', reused: false };
    act(() => {
      opened = controller.current!.openResource(resource('notes/A.md'), {
        mode: 'pinned',
      });
    });
    await waitFor(() => {
      expect(registry.getState().views[opened.viewId]).toBeDefined();
    });

    let result = false;
    await act(async () => {
      result = await controller.current!.openCurrentOutbound(
        {
          sourceKey: 'main',
          relativePath: 'notes/New.md',
        },
        opened.groupId,
        null,
        'wikilink',
        false,
      );
    });

    expect(result).toBe(true);
    expect(registry.getState().sessions[
      knowledgeDocumentKey({
        sourceKey: 'main',
        relativePath: 'notes/New.md',
      })
    ]).toMatchObject({
      buffer: '',
      baseline: '',
      pendingCreate: true,
    });
    expect(screen.getByRole('tab', { name: 'Preview New.md' }))
      .toBeInTheDocument();
  });

  it('creates and consumes a native grant from the asset default-open action', async () => {
    const client = createClient();
    client.createNativeGrant = vi.fn(async () => ({
      grantId: '00000000-0000-4000-8000-000000000051',
      expiresAt: Date.now() + 60_000,
    }));
    const knowledgeNativeInvoke = vi.fn(async () => ({
      ok: true as const,
      cancelled: false as const,
      result: { action: 'openDefault' },
    }));
    vi.stubGlobal('hana', { knowledgeNativeInvoke });
    const { controller } = setup(undefined, client);
    act(() => {
      controller.current!.openResource({
        address: { sourceKey: 'main', relativePath: 'notes/asset.txt' },
        sourceName: 'Main workspace',
        kind: 'asset',
      }, { mode: 'pinned' });
    });

    fireEvent.click(await screen.findByRole('button', {
      name: 'Open with default application',
    }));
    await waitFor(() => {
      expect(client.createNativeGrant).toHaveBeenCalledWith(
        'openDefault',
        { sourceKey: 'main', relativePath: 'notes/asset.txt' },
      );
      expect(knowledgeNativeInvoke).toHaveBeenCalledWith({
        action: 'openDefault',
        grantId: '00000000-0000-4000-8000-000000000051',
      });
    });
  });

  it('reveals live outline offsets and opens saved backlinks with normal preview reuse', async () => {
    const { controller, registry } = setup();
    let current = { viewId: '', groupId: '', reused: false };
    act(() => {
      current = controller.current!.openResource(resource('notes/A.md'), {
        mode: 'pinned',
      });
    });
    await waitFor(() => {
      expect(registry.getState().views[current.viewId]).toBeDefined();
      expect(screen.getByLabelText('Edit A.md')).toBeInTheDocument();
    });

    act(() => {
      expect(controller.current!.revealOffset(current.viewId, 3)).toBe(true);
    });
    await waitFor(() => {
      expect(registry.getState().views[current.viewId]?.cursor).toBe(3);
    });

    let openedBacklink = false;
    act(() => {
      openedBacklink = controller.current!.openBacklink(
        resource('notes/B.md'),
        current.groupId,
        2,
      );
    });
    expect(openedBacklink).toBe(true);
    expect(screen.getByRole('tab', { name: 'Preview B.md' }))
      .toBeInTheDocument();
    const bKey = knowledgeDocumentKey(resource('notes/B.md').address);
    await waitFor(() => {
      expect(Object.values(registry.getState().views).some(
        view => view.sessionKey === bKey,
      )).toBe(true);
    });
    act(() => {
      openedBacklink = controller.current!.openBacklink(
        resource('notes/B.md'),
        current.groupId,
        2,
      );
    });
    expect(openedBacklink).toBe(true);
    await waitFor(() => {
      expect(Object.values(registry.getState().views).find(
        view => view.sessionKey === bKey,
      )?.cursor).toBe(2);
    });

    const bView = Object.values(registry.getState().views).find(
      view => view.sessionKey === bKey,
    )!;
    act(() => {
      registry.getState().replaceDocumentBuffer(bView.id, 'prefix # B dirty\n');
      controller.current!.revealOffset(bView.id, 1);
      controller.current!.openResource(resource('notes/A.md'), {
        mode: 'pinned',
      });
    });
    await waitFor(() => {
      expect(registry.getState().sessions[bKey]?.dirty).toBe(true);
      expect(registry.getState().views[bView.id]?.cursor).toBe(1);
    });

    act(() => {
      openedBacklink = controller.current!.openBacklink(
        resource('notes/B.md'),
        current.groupId,
        6,
      );
    });
    expect(openedBacklink).toBe(true);
    expect(registry.getState().views[bView.id]?.cursor).toBe(1);
    expect(registry.getState().sessions[bKey]?.buffer)
      .toBe('prefix # B dirty\n');
  });

  it('starts with one empty group and keeps multiple complete-filename tabs', async () => {
    const { controller } = setup();
    expect(screen.getAllByRole('group', { name: /Editor group/ })).toHaveLength(1);
    expect(screen.getByText('Open a resource')).toBeInTheDocument();

    act(() => {
      controller.current?.openResource(resource('notes/A.md'), { mode: 'pinned' });
      controller.current?.openResource(resource('notes/B.md'), { mode: 'pinned' });
    });

    expect(screen.getByRole('tab', { name: 'A.md' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'B.md' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Edit A.md')).toBeInTheDocument();
      expect(screen.getByLabelText('Edit B.md')).toBeInTheDocument();
    });
  });

  it('keeps one replaceable preview per group and pins it on edit', async () => {
    const { controller, registry } = setup();
    let firstViewId = '';
    act(() => {
      firstViewId = controller.current?.openResource(
        resource('notes/A.md'),
        { mode: 'preview' },
      ).viewId ?? '';
    });
    await waitFor(() => expect(registry.getState().views[firstViewId]).toBeDefined());

    act(() => {
      controller.current?.openResource(resource('notes/B.md'), { mode: 'preview' });
    });
    expect(screen.queryByRole('tab', { name: 'Preview A.md' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Preview B.md' })).toBeInTheDocument();
    expect(
      registry.getState().sessions[
        knowledgeDocumentKey(resource('notes/A.md').address)
      ],
    ).toBeUndefined();

    const bKey = knowledgeDocumentKey(resource('notes/B.md').address);
    await waitFor(() => expect(registry.getState().sessions[bKey]).toBeDefined());
    const bView = Object.values(registry.getState().views).find(
      view => view.sessionKey === bKey,
    );
    act(() => {
      registry.getState().replaceDocumentBuffer(bView!.id, '# edited\n');
    });
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'B.md' })).toHaveAttribute(
        'data-preview',
        'false',
      );
    });

    act(() => {
      controller.current?.openResource(resource('notes/C.md'), { mode: 'preview' });
    });
    expect(screen.getByRole('tab', { name: 'B.md' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Preview C.md' })).toBeInTheDocument();
  });

  it('globally reuses ordinary opens but creates a second shared-session view only for explicit side open', async () => {
    const { controller, registry } = setup();
    let first = { viewId: '', groupId: '', reused: false };
    let side = first;
    act(() => {
      first = controller.current!.openResource(resource('notes/A.md'), {
        mode: 'pinned',
      });
      const secondGroup = controller.current!.splitGroup(
        first.groupId,
        'vertical',
      );
      const reused = controller.current!.openResource(resource('notes/A.md'), {
        mode: 'preview',
        groupId: secondGroup,
      });
      expect(reused).toEqual({ ...first, reused: true });
      side = controller.current!.openInSide(resource('notes/A.md'), {
        fromGroupId: first.groupId,
        direction: 'horizontal',
      });
    });

    expect(side.viewId).not.toBe(first.viewId);
    expect(side.groupId).not.toBe(first.groupId);
    expect(screen.getAllByRole('tab', { name: 'A.md' })).toHaveLength(2);
    expect(screen.getAllByRole('group', { name: /Editor group/ })).toHaveLength(3);
    expect(document.querySelectorAll('[data-split-direction="horizontal"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-split-direction="vertical"]')).toHaveLength(1);
    await waitFor(() => {
      expect(registry.getState().views[first.viewId]?.sessionKey).toBe(
        registry.getState().views[side.viewId]?.sessionKey,
      );
    });
  });

  it('prompts before the dirty last view, preserves it on cancel, and disposes it after discard', async () => {
    const { controller, registry } = setup();
    let opened = { viewId: '', groupId: '', reused: false };
    act(() => {
      opened = controller.current!.openInSide(resource('notes/A.md'), {
        direction: 'horizontal',
      });
    });
    const key = knowledgeDocumentKey(resource('notes/A.md').address);
    await waitFor(() => expect(registry.getState().views[opened.viewId]).toBeDefined());
    act(() => {
      registry.getState().replaceDocumentBuffer(opened.viewId, '# dirty\n');
      controller.current!.closeView(opened.viewId);
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(registry.getState().sessions[key]?.dirty).toBe(true);
    expect(registry.getState().views[opened.viewId]).toBeDefined();
    fireEvent.click(screen.getByRole('button', {
      name: 'knowledge.unsaved.cancel',
    }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(registry.getState().views[opened.viewId]).toBeDefined();

    act(() => {
      controller.current!.closeView(opened.viewId);
    });
    fireEvent.click(screen.getByRole('button', {
      name: 'knowledge.unsaved.discard',
    }));
    expect(screen.getAllByRole('group', { name: /Editor group/ })).toHaveLength(1);
    expect(registry.getState().sessions[key]).toBeUndefined();
    expect(registry.getState().views[opened.viewId]).toBeUndefined();
  });

  it('closes a dirty non-last shared view directly without prompting', async () => {
    const { controller, registry } = setup();
    let first = { viewId: '', groupId: '', reused: false };
    let side = first;
    act(() => {
      first = controller.current!.openResource(resource('notes/A.md'), {
        mode: 'pinned',
      });
      side = controller.current!.openInSide(resource('notes/A.md'), {
        fromGroupId: first.groupId,
      });
    });
    await waitFor(() => {
      expect(registry.getState().views[first.viewId]).toBeDefined();
      expect(registry.getState().views[side.viewId]).toBeDefined();
    });
    act(() => {
      registry.getState().replaceDocumentBuffer(first.viewId, '# dirty\n');
      controller.current!.closeView(side.viewId);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(registry.getState().views[side.viewId]).toBeUndefined();
    expect(registry.getState().sessions[
      knowledgeDocumentKey(resource('notes/A.md').address)
    ]?.buffer).toBe('# dirty\n');
  });

  it('turns a dirty document orphan when its source is no longer writable', async () => {
    const { controller, registry } = setup([{
      sourceKey: 'main',
      displayName: 'Main workspace',
      role: 'main',
      capabilities: ['read'],
      availability: 'available',
    }]);
    let opened = { viewId: '', groupId: '', reused: false };
    act(() => {
      opened = controller.current!.openResource(resource('notes/A.md'), {
        mode: 'pinned',
      });
    });
    await waitFor(() => {
      expect(registry.getState().views[opened.viewId]).toBeDefined();
    });
    act(() => {
      registry.getState().replaceDocumentBuffer(opened.viewId, '# dirty\n');
    });
    await waitFor(() => {
      expect(registry.getState().sessions[
        knowledgeDocumentKey(resource('notes/A.md').address)
      ]).toMatchObject({
        buffer: '# dirty\n',
        dirty: true,
        orphan: true,
        resourceState: 'orphan',
      });
    });
  });

  it('processes lifecycle close active-first and stops on cancel without rolling back discard', async () => {
    const { controller, registry } = setup();
    let first = { viewId: '', groupId: '', reused: false };
    let second = first;
    act(() => {
      first = controller.current!.openResource(resource('notes/A.md'), {
        mode: 'pinned',
      });
      second = controller.current!.openResource(resource('notes/B.md'), {
        mode: 'pinned',
      });
    });
    await waitFor(() => {
      expect(registry.getState().views[first.viewId]).toBeDefined();
      expect(registry.getState().views[second.viewId]).toBeDefined();
    });
    act(() => {
      registry.getState().replaceDocumentBuffer(first.viewId, '# A dirty\n');
      registry.getState().replaceDocumentBuffer(second.viewId, '# B dirty\n');
    });

    let closeResult!: Promise<boolean>;
    act(() => {
      closeResult = controller.current!.prepareToClose();
    });
    expect(screen.getByText('Unsaved Main workspace / notes/B.md'))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {
      name: 'knowledge.unsaved.discard',
    }));
    await waitFor(() => {
      expect(screen.getByText('Unsaved Main workspace / notes/A.md'))
        .toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', {
      name: 'knowledge.unsaved.cancel',
    }));

    await expect(closeResult).resolves.toBe(false);
    expect(registry.getState().sessions[
      knowledgeDocumentKey(resource('notes/B.md').address)
    ]).toMatchObject({ buffer: '# B\n', dirty: false });
    expect(registry.getState().sessions[
      knowledgeDocumentKey(resource('notes/A.md').address)
    ]).toMatchObject({ buffer: '# A dirty\n', dirty: true });
    expect(registry.getState().views[first.viewId]).toBeDefined();
    expect(registry.getState().views[second.viewId]).toBeDefined();
  });

  it('resolves only dirty documents beneath resources selected for removal', async () => {
    const { controller, registry } = setup();
    let inside = { viewId: '', groupId: '', reused: false };
    let outside = { viewId: '', groupId: '', reused: false };
    act(() => {
      inside = controller.current!.openResource(resource('notes/A.md'), { mode: 'pinned' });
      outside = controller.current!.openResource(resource('other/B.md'), { mode: 'pinned' });
    });
    await waitFor(() => {
      expect(registry.getState().views[inside.viewId]).toBeDefined();
      expect(registry.getState().views[outside.viewId]).toBeDefined();
    });
    act(() => {
      registry.getState().replaceDocumentBuffer(inside.viewId, '# changed inside');
      registry.getState().replaceDocumentBuffer(outside.viewId, '# changed outside');
    });

    let result!: Promise<boolean>;
    act(() => {
      result = controller.current!.prepareResourceRemoval([
        { sourceKey: 'main', relativePath: 'notes' },
      ]);
    });
    expect(screen.getByText('Unsaved Main workspace / notes/A.md')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'knowledge.unsaved.discard' }));
    await act(async () => expect(result).resolves.toBe(true));
    expect(registry.getState().sessions[knowledgeDocumentKey({
      sourceKey: 'main', relativePath: 'notes/A.md',
    })].dirty).toBe(false);
    expect(registry.getState().sessions[knowledgeDocumentKey({
      sourceKey: 'main', relativePath: 'other/B.md',
    })].dirty).toBe(true);
  });

  it('rejects a concurrent close request without replacing the active decision', async () => {
    const { controller, registry } = setup();
    let opened = { viewId: '', groupId: '', reused: false };
    act(() => {
      opened = controller.current!.openResource(resource('notes/A.md'), {
        mode: 'pinned',
      });
    });
    await waitFor(() => {
      expect(registry.getState().views[opened.viewId]).toBeDefined();
    });
    act(() => {
      registry.getState().replaceDocumentBuffer(opened.viewId, '# dirty\n');
    });

    let first!: Promise<boolean>;
    let concurrent!: Promise<boolean>;
    act(() => {
      first = controller.current!.prepareToClose();
      concurrent = controller.current!.prepareToClose();
    });

    await expect(concurrent).resolves.toBe(false);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', {
      name: 'knowledge.unsaved.cancel',
    }));
    await expect(first).resolves.toBe(false);
  });

  it('saves an orphan to an explicit new Page and rebinds its tab, session, and breadcrumb', async () => {
    const { controller, registry } = setup();
    let opened = { viewId: '', groupId: '', reused: false };
    act(() => {
      opened = controller.current!.openResource(resource('notes/A.md'), {
        mode: 'pinned',
      });
    });
    await waitFor(() => {
      expect(registry.getState().views[opened.viewId]).toBeDefined();
    });
    act(() => {
      registry.getState().replaceDocumentBuffer(
        opened.viewId,
        '[[Old/Link.md]]\n# orphan\n',
      );
      registry.getState().markDocumentResourceUnavailable(
        resource('notes/A.md').address,
        'source-unavailable',
      );
    });

    let closeResult!: Promise<boolean>;
    act(() => {
      closeResult = controller.current!.prepareToClose();
    });
    expect(screen.getByText('knowledge.unsaved.orphanTarget'))
      .toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('knowledge.unsaved.relativePath'), {
      target: { value: 'Recovered/A-copy.md' },
    });
    fireEvent.click(screen.getByRole('button', {
      name: 'knowledge.unsaved.save',
    }));

    await act(async () => {
      await expect(closeResult).resolves.toBe(true);
    });
    const target = {
      sourceKey: 'main',
      relativePath: 'Recovered/A-copy.md',
    };
    const targetSession = registry.getState().sessions[
      knowledgeDocumentKey(target)
    ];
    expect(targetSession).toMatchObject({
      address: target,
      buffer: '[[Old/Link.md]]\n# orphan\n',
      baseline: '[[Old/Link.md]]\n# orphan\n',
      dirty: false,
      orphan: false,
      resourceState: 'available',
    });
    expect(registry.getState().views[opened.viewId].sessionKey).toBe(
      knowledgeDocumentKey(target),
    );
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'A-copy.md' }))
        .toBeInTheDocument();
      expect(screen.getByRole('navigation', {
        name: 'Resource location',
      })).toHaveTextContent('Main workspace›Recovered›A-copy.md');
    });
  });

  it('pins a dragged preview and moves its view into the explicit target group', () => {
    const { controller } = setup();
    let opened = { viewId: '', groupId: '', reused: false };
    let targetGroupId = '';
    act(() => {
      opened = controller.current!.openResource(resource('notes/A.md'), {
        mode: 'preview',
      });
      targetGroupId = controller.current!.splitGroup(
        opened.groupId,
        'horizontal',
      );
    });

    const tab = screen.getByRole('tab', { name: 'Preview A.md' });
    const target = document.querySelector(
      `[data-editor-group-id="${targetGroupId}"]`,
    ) as HTMLElement;
    const data = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: 'move',
      dropEffect: 'move',
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? '',
    };
    fireEvent.dragStart(tab, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    expect(screen.getByRole('tab', { name: 'A.md' })).toHaveAttribute(
      'data-preview',
      'false',
    );
    expect(document.querySelector(
      `[data-editor-group-id="${targetGroupId}"]`,
    )).toContainElement(screen.getByRole('tab', { name: 'A.md' }));
  });
});
