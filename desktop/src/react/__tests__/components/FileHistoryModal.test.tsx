/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const fetchMock = vi.hoisted(() => vi.fn());
const closeModal = vi.hoisted(() => vi.fn());
const openModal = vi.hoisted(() => vi.fn());
const store = vi.hoisted(() => ({
  locale: 'en',
  fileHistoryModal: {
    open: true,
    preselectRelPath: null as string | null,
    scopeGeneration: 1,
  },
}));

vi.mock('../../hooks/use-hana-fetch', () => ({ hanaFetch: fetchMock }));
vi.mock('../../stores', () => ({
  useStore: (selector: (state: typeof store & {
    closeFileHistoryModal: typeof closeModal;
    openFileHistoryModal: typeof openModal;
  }) => unknown) => selector({ ...store, closeFileHistoryModal: closeModal, openFileHistoryModal: openModal }),
}));

import { FileHistoryEntryButton, FileHistoryModal } from '../../components/file-history/FileHistoryModal';
import {
  applyHistoryDiff,
} from '../../utils/file-history-api';

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const files = [
  { relPath: 'notes/a.md', deletedAt: null, lastCapturedAt: 2_000, snapshotCount: 2 },
  { relPath: 'gone.md', deletedAt: 3_000, lastCapturedAt: 1_000, snapshotCount: 1 },
];

const versions = [
  { id: 2, capturedAt: 2_000, origin: 'event', opContext: 'workspace_observation', rawSize: 4, versionToken: 'v2' },
  { id: 1, capturedAt: 1_000, origin: 'baseline', opContext: null, rawSize: 4, versionToken: 'v1' },
];

function installHealthyRoutes() {
  fetchMock.mockImplementation(async (path: string, options: RequestInit = {}) => {
    if (path === '/api/file-history/files') return response({ files });
    if (path === '/api/file-history/versions?relPath=notes%2Fa.md') return response({ versions });
    if (path === '/api/file-history/diff?snapshotId=1') return response({ diff: [{ kind: 'added', text: 'old\n' }] });
    if (path === '/api/file-history/diff?snapshotId=2') {
      return response({ diff: [{ kind: 'removed', text: 'old\n' }, { kind: 'added', text: 'new\n' }] });
    }
    if (path === '/api/resource-io/read') {
      return response({ content: 'new\n', encoding: 'utf-8', version: { mtimeMs: 10, size: 4, etag: 'current' } });
    }
    if (path === '/api/resource-io/write-expected-version') {
      return response({ changeType: 'modified', version: { mtimeMs: 11, size: 4, etag: 'restored' } });
    }
    throw new Error(`unexpected request: ${path} ${JSON.stringify(options)}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: () => '123e4567-e89b-42d3-a456-426614174000' });
  window.t = ((key: string) => ({
    'fileHistory.title': 'File History',
    'fileHistory.searchPlaceholder': 'Search files',
    'fileHistory.deletedGroup': 'Deleted files',
    'fileHistory.empty': 'No history yet',
    'fileHistory.noVersions': 'No versions',
    'fileHistory.selectVersion': 'Select a version',
    'fileHistory.restore': 'Restore',
    'fileHistory.restoreDone': 'Restored',
    'fileHistory.error': 'Operation failed',
    'fileHistory.origin.event': 'In-app edit',
    'fileHistory.origin.sweep': 'Baseline snapshot',
    'fileHistory.origin.restore': 'Restore',
    'preview.fileHistory': 'File history',
    'action.retry': 'Retry',
    'common.close': 'Close',
  }[key] || key)) as typeof window.t;
  store.fileHistoryModal = { open: true, preselectRelPath: null, scopeGeneration: 1 };
  installHealthyRoutes();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('FileHistoryModal', { sequential: true }, () => {
  it('renders a main-only entry and active/deleted file groups', async () => {
    render(<FileHistoryEntryButton preselectRelPath="notes/a.md" />);
    fireEvent.click(screen.getByTestId('file-history-entry'));
    expect(openModal).toHaveBeenCalledWith('notes/a.md');

    render(<FileHistoryModal />);
    expect(await screen.findByRole('dialog')).toHaveAttribute('data-history-source', 'main');
    await waitFor(() => expect(screen.getByText('notes/a.md')).toBeInTheDocument());
    expect(screen.getByText('gone.md')).toBeInTheDocument();
    expect(screen.getByText('Deleted files')).toBeInTheDocument();
  });

  it('reconstructs the selected timeline snapshot, renders diff, and restores with current version', async () => {
    render(<FileHistoryModal />);
    await screen.findByTestId('fh-version-2');
    expect(screen.getByText('In-app edit')).toBeInTheDocument();
    expect(await screen.findByText('new')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('fh-restore'));
    await waitFor(() => expect(fetchMock.mock.calls.some(([path]) => path === '/api/resource-io/write-expected-version')).toBe(true));
    const writeCall = fetchMock.mock.calls.find(([path]) => path === '/api/resource-io/write-expected-version');
    const writeBody = JSON.parse(String(writeCall?.[1]?.body));
    expect(writeBody.address).toEqual({ sourceKey: 'main', relativePath: 'notes/a.md' });
    expect(writeBody.content).toBe('new\n');
    expect(writeBody.expectedVersion).toEqual({ mtimeMs: 10, size: 4, etag: 'current' });
    expect(writeBody.reason).toBe('history_restore');
    expect(writeBody.operationId).toBe('123e4567-e89b-42d3-a456-426614174000');
    await waitFor(() => expect(screen.getByText('Restored')).toBeInTheDocument());
    await waitFor(() => expect(fetchMock.mock.calls.filter(([path]) => path === '/api/file-history/files').length).toBeGreaterThanOrEqual(2));
  });

  it('keeps a conflict visible and does not claim restore success', async () => {
    fetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/file-history/files') return response({ files });
      if (path === '/api/file-history/versions?relPath=notes%2Fa.md') return response({ versions });
      if (path === '/api/file-history/diff?snapshotId=1') return response({ diff: [{ kind: 'added', text: 'old\n' }] });
      if (path === '/api/file-history/diff?snapshotId=2') return response({ diff: [{ kind: 'removed', text: 'old\n' }, { kind: 'added', text: 'new\n' }] });
      if (path === '/api/resource-io/read') return response({ content: 'new\n', encoding: 'utf-8', version: { mtimeMs: 12, size: 4, etag: 'changed' } });
      if (path === '/api/resource-io/write-expected-version') return response({ ok: false, conflict: true, version: { mtimeMs: 13, size: 5, etag: 'newer' } }, 409);
      throw new Error(`unexpected request: ${path}`);
    });
    render(<FileHistoryModal />);
    await screen.findByTestId('fh-version-2');
    await screen.findByText('new');
    fireEvent.click(screen.getByTestId('fh-restore'));
    await waitFor(() => expect(screen.getByText('Operation failed')).toBeInTheDocument());
    expect(screen.getByText('Operation failed')).toHaveAttribute('data-error-code', 'resource_conflict');
  });

  it('cancels and ignores an older files response after the modal scope changes', async () => {
    let resolveOld: (value: unknown) => void = () => {};
    fetchMock.mockImplementationOnce(async () => new Promise(resolve => { resolveOld = resolve; }));
    const view = render(<FileHistoryModal />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/file-history/files', expect.objectContaining({ signal: expect.any(AbortSignal), throwOnHttpError: false })));
    store.fileHistoryModal = { open: false, preselectRelPath: null, scopeGeneration: 2 };
    view.rerender(<FileHistoryModal />);
    resolveOld(response({ files: [{ ...files[0], relPath: 'stale.md' }] }));
    expect(screen.queryByText('stale.md')).not.toBeInTheDocument();

    store.fileHistoryModal = { open: true, preselectRelPath: null, scopeGeneration: 3 };
    installHealthyRoutes();
    view.rerender(<FileHistoryModal />);
    await waitFor(() => expect(screen.getByText('notes/a.md')).toBeInTheDocument());
  });

  it('surfaces a failed main history health probe with a retry action', async () => {
    let calls = 0;
    fetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/file-history/files') {
        calls += 1;
        return calls === 1 ? response({ error: 'main history is unavailable' }, 503) : response({ files });
      }
      if (path === '/api/file-history/versions?relPath=notes%2Fa.md') return response({ versions });
      if (path === '/api/file-history/diff?snapshotId=1') return response({ diff: [{ kind: 'added', text: 'old\n' }] });
      if (path === '/api/file-history/diff?snapshotId=2') return response({ diff: [{ kind: 'removed', text: 'old\n' }, { kind: 'added', text: 'new\n' }] });
      if (path === '/api/resource-io/read') return response({ content: 'new\n', version: { mtimeMs: 10, size: 4 } });
      throw new Error(`unexpected request: ${path}`);
    });
    render(<FileHistoryModal />);
    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.getByRole('status')).toHaveAttribute('data-health', 'FAILED');
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByText('notes/a.md')).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveAttribute('data-health', 'HEALTHY');
  });

  it('supports keyboard file navigation and exposes dialog semantics', async () => {
    render(<FileHistoryModal />);
    const first = await screen.findByText('notes/a.md');
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'file-history-title');
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(screen.getByText('gone.md')).toHaveAttribute('aria-current', 'true');
  });

  it('keeps the refreshed file list alive after a successful restore', async () => {
    let fileListCalls = 0;
    fetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/file-history/files') {
        fileListCalls += 1;
        return response(fileListCalls === 1 ? { files } : {
          files: [{ relPath: 'refreshed.md', deletedAt: null, lastCapturedAt: 4_000, snapshotCount: 1 }],
        });
      }
      if (path === '/api/file-history/versions?relPath=notes%2Fa.md') return response({ versions });
      if (path === '/api/file-history/versions?relPath=refreshed.md') return response({ versions: [] });
      if (path === '/api/file-history/diff?snapshotId=1') return response({ diff: [{ kind: 'added', text: 'old\n' }] });
      if (path === '/api/file-history/diff?snapshotId=2') return response({ diff: [{ kind: 'removed', text: 'old\n' }, { kind: 'added', text: 'new\n' }] });
      if (path === '/api/resource-io/read') return response({ content: 'new\n', version: { mtimeMs: 10, size: 4, etag: 'current' } });
      if (path === '/api/resource-io/write-expected-version') return response({ changeType: 'modified', version: { mtimeMs: 11, size: 4, etag: 'restored' } });
      throw new Error(`unexpected request: ${path}`);
    });

    render(<FileHistoryModal />);
    await screen.findByTestId('fh-version-2');
    fireEvent.click(screen.getByTestId('fh-restore'));
    await waitFor(() => expect(screen.getByText('refreshed.md')).toBeInTheDocument(), { timeout: 3_000 });
    await waitFor(() => expect(fetchMock.mock.calls.some(([path]) => path === '/api/file-history/versions?relPath=refreshed.md')).toBe(true));
    expect(fileListCalls).toBeGreaterThanOrEqual(2);
  });

  it('uses a null expected version for deleted-file recreation', async () => {
    store.fileHistoryModal = { open: true, preselectRelPath: 'gone.md', scopeGeneration: 1 };
    fetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/file-history/files') return response({ files });
      if (path === '/api/file-history/versions?relPath=gone.md') return response({
        versions: [{ id: 3, capturedAt: 1_000, origin: 'event', opContext: null, rawSize: 4, versionToken: null }],
      });
      if (path === '/api/file-history/diff?snapshotId=3') return response({ diff: [{ kind: 'added', text: 'old\n' }] });
      if (path === '/api/resource-io/write-expected-version') return response({ changeType: 'created', version: { mtimeMs: 11, size: 4 } });
      throw new Error(`unexpected request: ${path}`);
    });

    render(<FileHistoryModal />);
    await screen.findByTestId('fh-version-3');
    fireEvent.click(screen.getByTestId('fh-restore'));
    await waitFor(() => expect(fetchMock.mock.calls.some(([path]) => path === '/api/resource-io/write-expected-version')).toBe(true));
    const writeCall = fetchMock.mock.calls.find(([path]) => path === '/api/resource-io/write-expected-version');
    expect(JSON.parse(String(writeCall?.[1]?.body)).expectedVersion).toBeNull();
    await waitFor(() => expect(fetchMock.mock.calls.filter(([path]) => path === '/api/file-history/files').length).toBeGreaterThanOrEqual(2));
  });

  it('rejects an invalid diff sequence before presenting fabricated content', () => {
    expect(() => applyHistoryDiff('known\n', [{ kind: 'same', text: 'other\n' }]))
      .toThrowError('invalid_diff_sequence');
  });
});
