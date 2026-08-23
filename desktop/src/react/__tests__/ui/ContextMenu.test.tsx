// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContextMenu } from '../../ui/ContextMenu';

describe('ContextMenu', () => {
  it('closes on Escape immediately after opening', () => {
    const onClose = vi.fn();
    render(
      <ContextMenu
        items={[{ label: 'Open' }]}
        position={{ x: 10, y: 10 }}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
