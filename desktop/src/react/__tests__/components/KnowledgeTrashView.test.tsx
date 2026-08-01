// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeSourceDto } from '../../../../../shared/knowledge-workspace-contract';
import type { KnowledgeWorkspaceClient } from '../../services/knowledge-workspace-client';
import { KnowledgeTrashView } from '../../components/knowledge-workspace/KnowledgeTrashView';

describe('KnowledgeTrashView', () => {
  beforeEach(() => {
    window.t = ((key: string) => key) as typeof window.t;
  });
  afterEach(cleanup);

  function trashBatch(overrides: Record<string, unknown> = {}) {
    return {
      batchId: '00000000-0000-4000-8000-000000000055',
      sourceKey: 'main',
      deletedAt: '2026-06-01T00:00:00.000Z',
      entries: [{
        entryId: '00000000-0000-4000-8000-000000000056',
        originalAddress: { sourceKey: 'main', relativePath: 'notes/page.md' },
        trashAddress: { sourceKey: 'main', relativePath: '.trash/00000000-0000-4000-8000-000000000055/payload/page.md' },
        deletedAt: '2026-06-01T00:00:00.000Z',
        state: 'trashed',
      }],
      ...overrides,
    };
  }

  it('lists path-free batch entries, restores one item and reports failure accessibly', async () => {
    const listTrash = vi.fn(async () => [{
      batchId: '00000000-0000-4000-8000-000000000055',
      sourceKey: 'main',
      deletedAt: '2026-08-01T00:00:00.000Z',
      entries: [{
        entryId: '00000000-0000-4000-8000-000000000056',
        originalAddress: { sourceKey: 'main', relativePath: 'notes/page.md' },
        trashAddress: { sourceKey: 'main', relativePath: '.trash/00000000-0000-4000-8000-000000000055/payload/page.md' },
        deletedAt: '2026-08-01T00:00:00.000Z',
        state: 'trashed',
      }],
    }]);
    const restoreTrash = vi.fn(async () => [{ ok: false }]);
    const client = { listTrash, restoreTrash } as unknown as KnowledgeWorkspaceClient;
    render(<KnowledgeTrashView
      client={client}
      sources={[{
        sourceKey: 'main', displayName: 'Main', role: 'main',
        capabilities: ['read', 'write'], availability: 'available',
      }]}
      open
      onClose={vi.fn()}
    />);
    expect(await screen.findByText('notes/page.md')).toBeInTheDocument();
    expect(screen.queryByText(/\.trash\//u)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'knowledge.action.restore' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
      'knowledge.trash.operationError',
    ));
    expect(restoreTrash).toHaveBeenCalledWith(
      'main',
      '00000000-0000-4000-8000-000000000055',
      ['00000000-0000-4000-8000-000000000056'],
    );
  });

  it('refreshes an open trash view when the mounted sources change', async () => {
    const listTrash = vi.fn(async () => []);
    const client = { listTrash } as unknown as KnowledgeWorkspaceClient;
    const main: KnowledgeSourceDto = {
      sourceKey: 'main', displayName: 'Main', role: 'main',
      capabilities: ['read', 'write'], availability: 'available',
    };
    const { rerender } = render(<KnowledgeTrashView
      client={client}
      sources={[main]}
      open
      onClose={vi.fn()}
    />);
    await waitFor(() => expect(listTrash).toHaveBeenCalledWith('main'));

    rerender(<KnowledgeTrashView
      client={client}
      sources={[main, {
        sourceKey: 'research', displayName: 'Research', role: 'mounted',
        capabilities: ['read', 'write'], availability: 'available',
      }]}
      open
      onClose={vi.fn()}
    />);

    await waitFor(() => expect(listTrash).toHaveBeenCalledWith('research'));
  });

  it('uses a modal with cancel-first focus for selected and whole-batch system-trash cleanup', async () => {
    const listTrash = vi.fn(async () => [trashBatch()]);
    const createNativeGrant = vi.fn(async () => ({ grantId: 'grant-1', expiresAt: Date.now() + 60_000 }));
    window.hana = {
      ...window.hana,
      knowledgeNativeInvoke: vi.fn(async () => ({ ok: true, cancelled: false, result: {} })),
    } as typeof window.hana;
    const client = { listTrash, createNativeGrant } as unknown as KnowledgeWorkspaceClient;
    render(<KnowledgeTrashView client={client} sources={[{
      sourceKey: 'main', displayName: 'Main', role: 'main', capabilities: ['read', 'write'], availability: 'available',
    }]} open onClose={vi.fn()} systemTrashAvailable />);

    const entry = await screen.findByText('notes/page.md');
    const item = entry.closest('li')!;
    fireEvent.click(within(item).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'knowledge.trash.cleanupSelected' }));
    const dialog = screen.getByRole('dialog', { name: 'knowledge.trash.cleanupTitle' });
    expect(within(dialog).getByRole('button', { name: 'knowledge.action.cancel' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'knowledge.trash.cleanupBatch' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'knowledge.action.systemTrash' }));
    await waitFor(() => expect(createNativeGrant).toHaveBeenCalledWith(
      'systemTrash',
      expect.objectContaining({ relativePath: expect.stringContaining('.trash/') }),
    ));
  });

  it('offers expired cleanup and a retry action for persisted failures', async () => {
    const failedBatch = trashBatch({
      entries: [{
        ...(trashBatch().entries as Array<Record<string, unknown>>)[0],
        errorCode: 'knowledge_resource_unavailable',
      }],
    });
    const client = {
      listTrash: vi.fn(async () => [failedBatch]),
      createNativeGrant: vi.fn(async () => ({ grantId: 'grant-2', expiresAt: Date.now() + 60_000 })),
    } as unknown as KnowledgeWorkspaceClient;
    render(<KnowledgeTrashView client={client} sources={[{
      sourceKey: 'main', displayName: 'Main', role: 'main', capabilities: ['read', 'write'], availability: 'available',
    }]} open onClose={vi.fn()} systemTrashAvailable now={() => new Date('2026-08-01T00:00:00.000Z').getTime()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('knowledge_resource_unavailable');
    expect(screen.getByRole('button', { name: 'knowledge.trash.cleanupExpired' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'knowledge.trash.retryFailed' })).toBeEnabled();
  });
});
