// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DeferSettings } from '../DeferSettings';

vi.mock('../../../helpers', () => ({
  t: (key: string) => key,
}));

afterEach(cleanup);

describe('DeferSettings', () => {
  it('keeps the built-in tier locked until the master defer switch is on', () => {
    const onChange = vi.fn();
    render(
      <DeferSettings deferEnabled={false} deferThreshold={10} builtinDeferEnabled={false} busy={false} onChange={onChange} />,
    );
    fireEvent.click(screen.getByText('settings.mcp.deferTitle'));

    const builtin = screen.getByRole('switch', { name: 'settings.mcp.deferBuiltin' });
    expect(builtin.hasAttribute('disabled') || builtin.getAttribute('aria-disabled') === 'true').toBe(true);
  });

  it('lets the built-in tier through once the master switch is on', () => {
    const onChange = vi.fn();
    render(
      <DeferSettings deferEnabled={true} deferThreshold={10} builtinDeferEnabled={false} busy={false} onChange={onChange} />,
    );
    fireEvent.click(screen.getByText('settings.mcp.deferTitle'));

    fireEvent.click(screen.getByRole('switch', { name: 'settings.mcp.deferBuiltin' }));
    expect(onChange).toHaveBeenCalledWith({ builtinDeferEnabled: true });
  });

  it('reflects an asynchronously loaded threshold without saving it', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DeferSettings deferEnabled={true} deferThreshold={10} builtinDeferEnabled={false} busy={false} onChange={onChange} />,
    );
    fireEvent.click(screen.getByText('settings.mcp.deferTitle'));

    const threshold = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(threshold.value).toBe('10');

    rerender(
      <DeferSettings deferEnabled={true} deferThreshold={25} builtinDeferEnabled={false} busy={false} onChange={onChange} />,
    );

    expect(threshold.value).toBe('25');
    expect(onChange).not.toHaveBeenCalled();
  });
});
