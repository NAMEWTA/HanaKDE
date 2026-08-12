/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const hanaFetchMock = vi.fn();

vi.mock('../../api', () => ({
  hanaFetch: (...args: unknown[]) => hanaFetchMock(...args),
}));

import {
  addMcpConnector,
  loadMcpState,
  removeMcpConnector,
  setMcpDeferSettings,
  setMcpEnabled,
  updateMcpConnector,
} from './mcp-api';

function jsonResponse(body: unknown): Response {
  return { json: async () => body } as Response;
}

function mockMcpResponses(...responses: Response[]) {
  const queue = [...responses];
  hanaFetchMock.mockImplementation(() => Promise.resolve(queue.shift() ?? jsonResponse({ ok: true })));
}

afterEach(() => {
  hanaFetchMock.mockReset();
});

describe('mcp-api mutations', () => {
  it('keeps state connector-only while accepting the built-in defer flag', async () => {
    mockMcpResponses(jsonResponse({
      enabled: true,
      deferEnabled: true,
      deferThreshold: 12,
      builtinDeferEnabled: true,
      connectors: [],
      // A stale/retired response must not revive the removed client state.
      servers: [{ id: 'retired-server' }],
      agentConfig: { connectors: {} },
    }));

    const state = await loadMcpState('hanako');

    expect(state).toMatchObject({
      builtinDeferEnabled: true,
      connectors: [],
    });
    expect(state).not.toHaveProperty('servers');
    expect(hanaFetchMock).toHaveBeenCalledWith('/api/mcp/state?agentId=hanako');
  });

  it('sends the upstream built-in defer setting through the first-class route', async () => {
    mockMcpResponses(jsonResponse({ ok: true }));

    await setMcpDeferSettings({ builtinDeferEnabled: true });

    expect(hanaFetchMock).toHaveBeenCalledWith(
      '/api/mcp/settings/defer',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ builtinDeferEnabled: true }),
      }),
    );
  });

  it('throws when the global enabled endpoint returns a JSON error', async () => {
    mockMcpResponses(jsonResponse({ error: 'save failed' }));

    await expect(setMcpEnabled(true)).rejects.toThrow('save failed');
  });

  it('uses the first-class MCP namespace for the global enabled endpoint', async () => {
    mockMcpResponses(jsonResponse({ enabled: true, connectors: [], agentConfig: { connectors: {} } }));

    await setMcpEnabled(true);

    expect(hanaFetchMock).toHaveBeenCalledWith(
      '/api/mcp/settings/enabled',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('throws when the global enabled endpoint does not return an MCP state', async () => {
    mockMcpResponses(jsonResponse({ ok: true }));

    await expect(setMcpEnabled(true)).rejects.toThrow('invalid state');
  });

  it('checks JSON errors for connector mutations too', async () => {
    hanaFetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'add failed' }))
      .mockResolvedValueOnce(jsonResponse({ error: 'remove failed' }));

    await expect(addMcpConnector({
      name: 'GitHub',
      transport: 'remote',
      url: 'https://mcp.example.com/mcp',
      authType: 'none',
    })).rejects.toThrow('add failed');
    await expect(removeMcpConnector('github')).rejects.toThrow('remove failed');
  });

  it('updates connectors through the first-class MCP connector namespace', async () => {
    mockMcpResponses(jsonResponse({ connector: { id: 'local' }, state: {} }));

    await updateMcpConnector('local', {
      name: 'Local',
      transport: 'stdio',
      command: 'npx',
      env: { API_KEY: '********' },
      enabled: true,
    });

    expect(hanaFetchMock).toHaveBeenCalledWith(
      '/api/mcp/connectors/local',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          name: 'Local',
          transport: 'stdio',
          command: 'npx',
          env: { API_KEY: '********' },
          enabled: true,
        }),
      }),
    );
  });
});
