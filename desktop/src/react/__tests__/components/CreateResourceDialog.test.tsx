// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateResourceDialog } from '../../components/knowledge-workspace/CreateResourceDialog';

describe('CreateResourceDialog', () => {
  afterEach(() => cleanup());
  it('creates through the path-free client and returns the canonical result', async () => {
    window.t = (key) => key;
    const createResource = vi.fn(async () => ({ kind: 'page' as const, address: { sourceKey: 'main', relativePath: 'notes/New.md' } }));
    const onCreated = vi.fn();
    const onClose = vi.fn();
    const events: string[] = [];
    onClose.mockImplementation(() => events.push('close'));
    onCreated.mockImplementation(() => events.push('created'));
    render(<CreateResourceDialog
      client={{ createResource } as never}
      kind="page"
      sourceKey="main"
      directoryPath="notes"
      onClose={onClose}
      onCreated={onCreated}
    />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New' } });
    fireEvent.click(screen.getByRole('button', { name: 'knowledge.action.create' }));
    await waitFor(() => expect(createResource).toHaveBeenCalledWith({ kind: 'page', sourceKey: 'main', directoryPath: 'notes', name: 'New' }));
    expect(onCreated).toHaveBeenCalledWith({ kind: 'page', address: { sourceKey: 'main', relativePath: 'notes/New.md' } });
    expect(events).toEqual(['close', 'created']);
  });

  it('ignores duplicate submits while the first request is pending', async () => {
    window.t = (key) => key;
    let resolve: (value: unknown) => void = () => {};
    const createResource = vi.fn(() => new Promise((done) => { resolve = done; }));
    render(<CreateResourceDialog
      client={{ createResource } as never}
      kind="folder"
      sourceKey="main"
      directoryPath=""
      onClose={vi.fn()}
      onCreated={vi.fn()}
    />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Folder' } });
    const form = screen.getByRole('dialog');
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(createResource).toHaveBeenCalledTimes(1);
    resolve({ kind: 'folder', address: { sourceKey: 'main', relativePath: 'Folder' } });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('keeps the input and exposes one stable error until an explicit retry', async () => {
    window.t = (key) => key;
    const createResource = vi.fn()
      .mockRejectedValueOnce({ code: 'knowledge_resource_conflict' })
      .mockResolvedValueOnce({ kind: 'page', address: { sourceKey: 'main', relativePath: 'Retry.md' } });
    const onCreated = vi.fn();
    render(<CreateResourceDialog
      client={{ createResource } as never}
      kind="page"
      sourceKey="main"
      directoryPath=""
      onClose={vi.fn()}
      onCreated={onCreated}
    />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Retry' } });
    fireEvent.submit(screen.getByRole('dialog'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Retry');
    expect(createResource).toHaveBeenCalledTimes(1);
    fireEvent.submit(screen.getByRole('dialog'));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(createResource).toHaveBeenCalledTimes(2);
  });

  it('accepts immediate input after reopening for a different resource kind', () => {
    window.t = (key) => key;
    const props = {
      client: { createResource: vi.fn() } as never,
      sourceKey: 'main',
      directoryPath: '',
      onClose: vi.fn(),
      onCreated: vi.fn(),
    };
    const view = render(<CreateResourceDialog key="page" {...props} kind="page" />);
    view.rerender(<CreateResourceDialog key="closed" {...props} kind={null} />);
    view.rerender(<CreateResourceDialog key="folder" {...props} kind="folder" />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Folder' } });

    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Folder');
    expect((screen.getByRole('button', {
      name: 'knowledge.action.create',
    }) as HTMLButtonElement).disabled).toBe(false);
  });
});
