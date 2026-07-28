// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  KnowledgeResourceAddress,
} from '../../../../../shared/knowledge-workspace-contract.ts';
import {
  KnowledgeConflictResolver,
  type KnowledgeConflictSubscribeToChanges,
} from '../../components/knowledge-workspace/KnowledgeConflictResolver';
import type {
  KnowledgeWorkspaceClient,
  RendererResourceVersion,
} from '../../services/knowledge-workspace-client';
import {
  createKnowledgeDocumentRegistry,
  knowledgeDocumentKey,
  type KnowledgeDocumentRegistry,
} from '../../stores/knowledge-document-registry';
import {
  knowledgeBase64FromBytes,
  knowledgeBytesFromBase64,
} from '../../utils/knowledge-markdown-file';
import {
  saveKnowledgeDocument,
  type SaveKnowledgeDocumentInput,
} from '../../utils/knowledge-document-operations';

const address: KnowledgeResourceAddress = {
  sourceKey: 'main',
  relativePath: 'Notes/conflict.md',
};

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function diskClient(initial = 'disk'): {
  client: KnowledgeWorkspaceClient;
  setDisk(content: string, version: RendererResourceVersion): void;
  stat: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
} {
  let content = initial;
  let version: RendererResourceVersion = {
    etag: 'disk-v2',
    sequence: 2,
    size: bytes(initial).byteLength,
  };
  const stat = vi.fn(async () => ({
    exists: true,
    isDirectory: false,
    version,
  }));
  const read = vi.fn(async () => ({
    content: knowledgeBase64FromBytes(bytes(content)),
    encoding: 'base64' as const,
    version,
  }));
  const write = vi.fn(async (
    _address: KnowledgeResourceAddress,
    encoded: string,
  ) => {
    const decoded = knowledgeBytesFromBase64(encoded);
    if (!decoded) throw new Error('expected valid base64');
    content = new TextDecoder().decode(decoded);
    version = {
      etag: 'saved-v3',
      sequence: 3,
      size: decoded?.byteLength ?? 0,
    };
    return {
      ok: true as const,
      changeType: 'modified' as const,
      version,
    };
  });
  return {
    stat,
    read,
    write,
    setDisk(nextContent, nextVersion) {
      content = nextContent;
      version = nextVersion;
    },
    client: {
      resources: {
        stat,
        read,
        writeExpectedVersion: write,
      },
    } as unknown as KnowledgeWorkspaceClient,
  };
}

function registryWithSession(
  buffer = 'baseline',
): KnowledgeDocumentRegistry {
  const registry = createKnowledgeDocumentRegistry({
    ownerId: 'owner',
    windowId: 'window',
  });
  registry.getState().establishDocumentSession({
    address,
    buffer,
    diskVersion: {
      etag: 'baseline-v1',
      sequence: 1,
      size: bytes(buffer).byteLength,
    },
  });
  registry.getState().openDocumentView({
    address,
    viewId: 'view',
    groupId: 'group',
  });
  return registry;
}

function createChangeSubscription(): {
  subscribe: KnowledgeConflictSubscribeToChanges;
  notify(): void;
  unsubscribe: ReturnType<typeof vi.fn>;
} {
  let listener: (() => void) | undefined;
  const unsubscribe = vi.fn();
  return {
    subscribe: vi.fn((next) => {
      listener = next;
      return unsubscribe;
    }),
    notify() {
      listener?.();
    },
    unsubscribe,
  };
}

function translate(key: string, vars?: Record<string, string | number>): string {
  const values: Record<string, string> = {
    'knowledge.retry': 'Retry',
    'knowledge.conflict.resolverLabel': 'Document conflict resolver',
    'knowledge.conflict.label': 'Resolve conflict for {name}',
    'knowledge.conflict.title': '{name} changed on disk',
    'knowledge.conflict.description': 'Compare three versions',
    'knowledge.conflict.baseline': 'Baseline',
    'knowledge.conflict.local': 'Local',
    'knowledge.conflict.disk': 'Disk',
    'knowledge.conflict.merged': 'Merged result',
    'knowledge.conflict.baselineLabel': 'Baseline version of {name}',
    'knowledge.conflict.localLabel': 'Local version of {name}',
    'knowledge.conflict.diskLabel': 'Disk version of {name}',
    'knowledge.conflict.mergedLabel': 'Merged result for {name}',
    'knowledge.conflict.mergeAndSave': 'Use merged result and save',
    'knowledge.conflict.useLocal': 'Use local and save',
    'knowledge.conflict.useDisk': 'Use disk',
    'knowledge.conflict.refreshError':
      'Could not check disk changes for {name}: {reason}.',
    'knowledge.document.loadError': 'Document could not be loaded',
  };
  let value = values[key] ?? key;
  for (const [name, replacement] of Object.entries(vars ?? {})) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}

describe('KnowledgeConflictResolver', () => {
  beforeEach(() => {
    window.t = translate as typeof window.t;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('automatically reloads an externally changed clean session', async () => {
    const registry = registryWithSession();
    const services = diskClient('disk');
    const changes = createChangeSubscription();
    const releaseWatch = vi.fn();
    const watchSource = vi.fn(() => releaseWatch);
    const view = render(
      <KnowledgeConflictResolver
        registry={registry}
        client={services.client}
        watchSource={watchSource}
        subscribeToChanges={changes.subscribe}
        refreshDelayMs={0}
      />,
    );

    act(() => changes.notify());

    await waitFor(() => expect(
      registry.getState().sessions[knowledgeDocumentKey(address)],
    ).toMatchObject({
      buffer: 'disk',
      baseline: 'disk',
      diskVersion: { etag: 'disk-v2', sequence: 2, size: 4 },
      dirty: false,
      conflict: null,
    }));
    expect(services.stat.mock.invocationCallOrder[0]).toBeLessThan(
      services.read.mock.invocationCallOrder[0],
    );
    expect(watchSource).toHaveBeenCalledWith('main');
    expect(screen.queryByLabelText('Document conflict resolver'))
      .not.toBeInTheDocument();
    view.unmount();
    expect(releaseWatch).toHaveBeenCalledTimes(1);
  });

  it('preserves and displays baseline/local/disk without automatic merge when dirty', async () => {
    const registry = registryWithSession();
    registry.getState().replaceDocumentBuffer('view', 'local');
    const services = diskClient('disk');
    const changes = createChangeSubscription();
    render(
      <KnowledgeConflictResolver
        registry={registry}
        client={services.client}
        watchSource={() => () => undefined}
        subscribeToChanges={changes.subscribe}
        refreshDelayMs={0}
      />,
    );

    act(() => changes.notify());

    expect(await screen.findByLabelText('Baseline version of conflict.md'))
      .toHaveValue('baseline');
    expect(screen.getByLabelText('Local version of conflict.md'))
      .toHaveValue('local');
    expect(screen.getByLabelText('Disk version of conflict.md'))
      .toHaveValue('disk');
    expect(screen.getByLabelText('Merged result for conflict.md'))
      .toHaveValue('local');
    expect(services.write).not.toHaveBeenCalled();
    expect(registry.getState().sessions[knowledgeDocumentKey(address)])
      .toMatchObject({
        buffer: 'local',
        baseline: 'baseline',
        dirty: true,
      });
  });

  it('does not create a false conflict when a source event leaves disk equal to baseline', async () => {
    const registry = registryWithSession();
    registry.getState().replaceDocumentBuffer('view', 'local');
    const services = diskClient('baseline');
    services.setDisk('baseline', {
      etag: 'metadata-v2',
      sequence: 2,
      size: 8,
    });
    render(
      <KnowledgeConflictResolver
        registry={registry}
        client={services.client}
        watchSource={() => () => undefined}
        subscribeToChanges={() => () => undefined}
        refreshDelayMs={0}
      />,
    );

    await waitFor(() => expect(services.read).toHaveBeenCalledTimes(1));
    expect(registry.getState().sessions[knowledgeDocumentKey(address)])
      .toMatchObject({
        buffer: 'local',
        baseline: 'baseline',
        diskVersion: { etag: 'metadata-v2', sequence: 2, size: 8 },
        dirty: true,
        conflict: null,
      });
    expect(screen.queryByLabelText('Document conflict resolver'))
      .not.toBeInTheDocument();
  });

  it('treats an external byte-format change as disk divergence while local text is dirty', () => {
    const registry = registryWithSession('line\n');
    registry.getState().replaceDocumentBuffer('view', 'local\n');

    expect(registry.getState().reconcileExternalDocument(address, {
      buffer: 'line\n',
      diskVersion: { etag: 'crlf-v2', sequence: 2, size: 6 },
      format: { hadBom: false, lineEnding: 'crlf', mixedLineEndings: false },
    })).toBe('conflict');
    expect(registry.getState().sessions[knowledgeDocumentKey(address)].conflict)
      .toMatchObject({
        baseline: 'line\n',
        local: 'local\n',
        disk: 'line\n',
        diskFormat: {
          hadBom: false,
          lineEnding: 'crlf',
          mixedLineEndings: false,
        },
      });
  });

  it.each([
    {
      button: 'Use merged result and save',
      merged: 'explicit merge',
      expectedBuffer: 'explicit merge',
    },
    {
      button: 'Use local and save',
      merged: null,
      expectedBuffer: 'local',
    },
    {
      button: 'Use disk',
      merged: null,
      expectedBuffer: 'disk',
    },
  ])('routes $button through the same manual save executor', async ({
    button,
    merged,
    expectedBuffer,
  }) => {
    const registry = registryWithSession();
    registry.getState().replaceDocumentBuffer('view', 'local');
    registry.getState().reconcileExternalDocument(address, {
      buffer: 'disk',
      diskVersion: { etag: 'disk-v2', sequence: 2, size: 4 },
      format: { hadBom: false, lineEnding: 'lf', mixedLineEndings: false },
    });
    const services = diskClient('disk');
    const saveDocument = vi.fn(async (input: SaveKnowledgeDocumentInput) => {
      const current = input.registry.getState()
        .sessions[knowledgeDocumentKey(input.address)];
      expect(current.buffer).toBe(expectedBuffer);
      expect(current.baseline).toBe('disk');
      expect(current.conflict).toBeNull();
      return { ok: true as const };
    });
    render(
      <KnowledgeConflictResolver
        registry={registry}
        client={services.client}
        watchSource={() => () => undefined}
        subscribeToChanges={() => () => undefined}
        saveDocument={saveDocument}
      />,
    );
    if (merged) {
      fireEvent.change(screen.getByLabelText('Merged result for conflict.md'), {
        target: { value: merged },
      });
    }

    fireEvent.click(screen.getByRole('button', { name: button }));

    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(1));
  });

  it('blocks direct save during a conflict and saves the explicit local choice against the disk version', async () => {
    const registry = registryWithSession();
    registry.getState().replaceDocumentBuffer('view', 'local');
    registry.getState().reconcileExternalDocument(address, {
      buffer: 'disk',
      diskVersion: { etag: 'disk-v2', sequence: 2, size: 4 },
      format: { hadBom: false, lineEnding: 'lf', mixedLineEndings: false },
    });
    const services = diskClient('disk');

    await expect(saveKnowledgeDocument({
      registry,
      address,
      client: services.client,
    })).resolves.toEqual({ ok: false, conflict: true });
    expect(services.write).not.toHaveBeenCalled();

    render(
      <KnowledgeConflictResolver
        registry={registry}
        client={services.client}
        watchSource={() => () => undefined}
        subscribeToChanges={() => () => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use local and save' }));

    await waitFor(() => expect(services.write).toHaveBeenCalledWith(
      address,
      expect.any(String),
      { etag: 'disk-v2', sequence: 2, size: 4 },
      { encoding: 'base64', signal: undefined },
    ));
    await waitFor(() => expect(
      registry.getState().sessions[knowledgeDocumentKey(address)],
    ).toMatchObject({
      buffer: 'local',
      baseline: 'local',
      dirty: false,
      conflict: null,
    }));
  });

  it('keeps the local buffer intact and offers retry when external refresh is unavailable', async () => {
    const registry = registryWithSession();
    registry.getState().replaceDocumentBuffer('view', 'local');
    const services = diskClient('disk');
    services.stat.mockRejectedValueOnce(new Error('offline'));
    const changes = createChangeSubscription();
    render(
      <KnowledgeConflictResolver
        registry={registry}
        client={services.client}
        watchSource={() => () => undefined}
        subscribeToChanges={changes.subscribe}
        refreshDelayMs={0}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not check disk changes for conflict.md',
    );
    expect(registry.getState().sessions[knowledgeDocumentKey(address)])
      .toMatchObject({
        buffer: 'local',
        baseline: 'baseline',
        dirty: true,
        conflict: null,
      });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByLabelText('Disk version of conflict.md'))
      .toHaveValue('disk');
  });

  it('aborts a stale refresh so an older disk response cannot replace newer state', async () => {
    const registry = registryWithSession();
    let resolveSlow: ((value: {
      content: string;
      encoding: 'base64';
      version: RendererResourceVersion;
    }) => void) | undefined;
    const stat = vi.fn(async () => ({
      exists: true,
      isDirectory: false,
      version: { etag: 'stat', size: 6 },
    }));
    const read = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => {
        resolveSlow = resolve;
      }))
      .mockResolvedValueOnce({
        content: knowledgeBase64FromBytes(bytes('newest')),
        encoding: 'base64' as const,
        version: { etag: 'newest', sequence: 3, size: 6 },
      });
    const client = {
      resources: { stat, read },
    } as unknown as KnowledgeWorkspaceClient;
    const changes = createChangeSubscription();
    render(
      <KnowledgeConflictResolver
        registry={registry}
        client={client}
        watchSource={() => () => undefined}
        subscribeToChanges={changes.subscribe}
        refreshDelayMs={0}
      />,
    );
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));

    act(() => changes.notify());
    await waitFor(() => expect(
      registry.getState().sessions[knowledgeDocumentKey(address)].buffer,
    ).toBe('newest'));
    await act(async () => {
      resolveSlow?.({
        content: knowledgeBase64FromBytes(bytes('old')),
        encoding: 'base64',
        version: { etag: 'old', sequence: 2, size: 3 },
      });
      await Promise.resolve();
    });

    expect(registry.getState().sessions[knowledgeDocumentKey(address)])
      .toMatchObject({
        buffer: 'newest',
        baseline: 'newest',
        diskVersion: { etag: 'newest', sequence: 3, size: 6 },
      });
  });
});
