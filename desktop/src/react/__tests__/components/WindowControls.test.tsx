// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WindowControls } from '../../components/WindowControls';
import {
  registerKnowledgeWorkspaceCloseGuard,
} from '../../services/knowledge-workspace-lifecycle';

let unregisterGuard: (() => void) | null = null;

describe('WindowControls', () => {
  beforeEach(() => {
    window.t = ((key: string) => key) as typeof window.t;
    window.platform = {
      getPlatform: vi.fn().mockResolvedValue('win32'),
      windowIsMaximized: vi.fn().mockResolvedValue(false),
      onMaximizeChange: vi.fn(),
      windowMinimize: vi.fn(),
      windowMaximize: vi.fn(),
      windowClose: vi.fn(),
    } as unknown as typeof window.platform;
  });

  afterEach(() => {
    unregisterGuard?.();
    unregisterGuard = null;
    cleanup();
  });

  it('keeps native window buttons out of the page focus sequence', async () => {
    render(<WindowControls />);

    await waitFor(() => {
      expect(screen.getByTitle('window.minimize')).toBeInTheDocument();
    });

    for (const title of ['window.minimize', 'window.maximize', 'window.close']) {
      const button = screen.getByTitle(title);
      expect(button).toHaveAttribute('tabindex', '-1');
      expect(fireEvent.mouseDown(button)).toBe(false);
    }
  });

  it('does not invoke native close when the Knowledge guard cancels', async () => {
    const guard = vi.fn(async () => false);
    unregisterGuard = registerKnowledgeWorkspaceCloseGuard(guard);
    render(<WindowControls />);
    const close = await screen.findByTitle('window.close');

    fireEvent.click(close);

    await waitFor(() => expect(guard).toHaveBeenCalledWith('window-close'));
    expect(window.platform?.windowClose).not.toHaveBeenCalled();
  });
});
