// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeResourceAddress } from '../../../../../shared/knowledge-workspace-contract.ts';
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

  function setup() {
    const registry = createKnowledgeDocumentRegistry({
      ownerId: 'owner',
      windowId: 'groups-test',
    });
    const controller = createRef<KnowledgeEditorGroupsHandle>();
    render(
      <KnowledgeEditorGroups
        ref={controller}
        registry={registry}
        client={createClient()}
        workspaceKey="workspace-a"
        onLocateResource={vi.fn()}
      />,
    );
    return { registry, controller };
  }

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

  it('collapses an empty side group while retaining its dirty shared session', async () => {
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

    expect(screen.getAllByRole('group', { name: /Editor group/ })).toHaveLength(1);
    expect(registry.getState().sessions[key]?.dirty).toBe(true);
    expect(registry.getState().views[opened.viewId]).toBeUndefined();
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
