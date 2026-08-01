// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateResourceDialog } from '../../components/knowledge-workspace/CreateResourceDialog';

describe('CreateResourceDialog', () => {
  it('creates through the path-free client and returns the canonical result', async () => {
    window.t = (key) => key;
    const createResource = vi.fn(async () => ({ kind: 'page' as const, address: { sourceKey: 'main', relativePath: 'notes/New.md' } }));
    const onCreated = vi.fn();
    render(<CreateResourceDialog
      client={{ createResource } as never}
      kind="page"
      sourceKey="main"
      directoryPath="notes"
      onClose={vi.fn()}
      onCreated={onCreated}
    />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New' } });
    fireEvent.click(screen.getByRole('button', { name: 'knowledge.action.create' }));
    await waitFor(() => expect(createResource).toHaveBeenCalledWith({ kind: 'page', sourceKey: 'main', directoryPath: 'notes', name: 'New' }));
    expect(onCreated).toHaveBeenCalledWith({ kind: 'page', address: { sourceKey: 'main', relativePath: 'notes/New.md' } });
  });
});
