/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { PluginWidgetView } from '../../components/plugin/PluginWidgetView';

const mockState = {
  pluginWidgets: [{
    pluginId: 'plain-widget',
    routeUrl: '/api/plugins/plain-widget/widget',
    hostCapabilities: [],
  }],
  currentAgentId: 'agent-1',
};

vi.mock('../../stores', () => ({
  useStore: vi.fn((selector: (state: typeof mockState) => unknown) => selector(mockState)),
}));

vi.mock('../../hooks/use-plugin-surface-url', () => ({
  usePluginSurfaceUrl: vi.fn(() => ({
    status: 'ready',
    iframeSrc: 'http://127.0.0.1:3210/api/plugins/plain-widget/widget?ticket=abc',
    retry: vi.fn(),
  })),
}));

vi.mock('../../hooks/use-plugin-iframe', () => ({
  usePluginIframe: vi.fn(() => ({
    iframeRef: { current: null },
    status: 'ready',
    retry: vi.fn(),
  })),
}));

describe('PluginWidgetView', () => {
  afterEach(cleanup);

  it('permits user-initiated downloads without broadening navigation or top-level access', () => {
    const { container } = render(<PluginWidgetView pluginId="plain-widget" />);

    expect(container.querySelector('iframe')?.getAttribute('sandbox')).toBe(
      'allow-scripts allow-forms allow-popups allow-same-origin allow-downloads',
    );
  });
});
