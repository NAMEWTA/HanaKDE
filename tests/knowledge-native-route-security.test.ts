import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { normalizePrincipal } from '../core/security-principal.ts';
import { createServerAuthService } from '../core/server-auth.ts';
import { configureKnowledgeNativeBridge, createKnowledgeWorkspaceRoute } from '../server/routes/knowledge-workspace.ts';

function appFor(connectionKind: 'local' | 'lan') {
  const engine = { getRuntimeContext: () => ({ userId: 'user_1', studioId: 'studio_1' }) };
  configureKnowledgeNativeBridge(engine, 'a'.repeat(43));
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('transportConnectionKind' as never, connectionKind as never);
    c.set('authPrincipal' as never, normalizePrincipal(connectionKind === 'local' ? {
      kind: 'local_user', userId: 'user_1', studioId: 'studio_1', serverId: 'server_1', serverNodeId: 'node_1',
      connectionKind: 'local', credentialKind: 'loopback_token', scopes: ['studio.owner', 'files.read', 'files.write'],
    } : {
      kind: 'device', userId: 'user_1', studioId: 'studio_1', serverId: 'server_1', serverNodeId: 'node_1', deviceId: 'device_1',
      connectionKind: 'lan', credentialKind: 'device_credential', trustState: 'paired', scopes: ['files.read', 'files.write'],
    }) as never);
    await next();
  });
  app.route('/api', createKnowledgeWorkspaceRoute(engine));
  return app;
}

describe('knowledge native main-only route', () => {
  it('mints and revokes a renderer credential bound to the trusted Main window key', async () => {
    const engine = { getRuntimeContext: () => ({ userId: 'user_1', studioId: 'studio_1' }) };
    const authService = createServerAuthService({
      hanakoHome: '/tmp',
      loopbackToken: 'local-secret',
      runtimeContext: {
        userId: 'user_1', studioId: 'studio_1', serverId: 'server_1', serverNodeId: 'node_1',
        capabilities: ['chat', 'resources', 'files'],
      },
    });
    configureKnowledgeNativeBridge(engine, 'a'.repeat(43), authService);
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('transportConnectionKind' as never, 'local' as never);
      const token = c.req.header('Authorization')?.replace(/^Bearer\s+/u, '') ?? '';
      c.set('authPrincipal' as never, authService.authenticateToken(token) as never);
      await next();
    });
    app.route('/api', createKnowledgeWorkspaceRoute(engine));

    const issued = await app.request('/api/knowledge-workspace/native/sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer local-secret', 'Content-Type': 'application/json', 'X-Hana-Native-Bridge': 'a'.repeat(43) },
      body: JSON.stringify({ windowKey: 'desktop-window-a' }),
    });
    expect(issued.status).toBe(201);
    const credential = await issued.json() as { token: string };
    expect(authService.authenticateToken(credential.token)).toMatchObject({
      sessionId: 'desktop-window-a',
    });

    const rendererCannotMint = await app.request('/api/knowledge-workspace/native/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${credential.token}`, 'Content-Type': 'application/json', 'X-Hana-Native-Bridge': 'a'.repeat(43) },
      body: JSON.stringify({ windowKey: 'desktop-window-b' }),
    });
    expect(rendererCannotMint.status).toBe(403);

    const revoked = await app.request('/api/knowledge-workspace/native/sessions/revoke', {
      method: 'POST',
      headers: { Authorization: 'Bearer local-secret', 'Content-Type': 'application/json', 'X-Hana-Native-Bridge': 'a'.repeat(43) },
      body: JSON.stringify({ windowKey: 'desktop-window-a' }),
    });
    expect(revoked.status).toBe(200);
    expect(authService.authenticateToken(credential.token)).toBeNull();
  });

  it('rejects a missing or wrong native credential even with the normal local server principal', async () => {
    const app = appFor('local');
    for (const credential of [undefined, 'b'.repeat(43)]) {
      const response = await app.request('/api/knowledge-workspace/native/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(credential ? { 'X-Hana-Native-Bridge': credential } : {}) },
        body: JSON.stringify({ action: 'reveal', grantId: '00000000-0000-4000-8000-000000000051' }),
      });
      expect(response.status).toBe(403);
    }
  });

  it('accepts the dedicated credential only on loopback and reaches one-time grant validation', async () => {
    const local = await appFor('local').request('/api/knowledge-workspace/native/consume', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hana-Native-Bridge': 'a'.repeat(43) },
      body: JSON.stringify({ action: 'reveal', grantId: '00000000-0000-4000-8000-000000000051' }),
    });
    expect(local.status).toBe(412);
    const remote = await appFor('lan').request('/api/knowledge-workspace/native/consume', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hana-Native-Bridge': 'a'.repeat(43) },
      body: JSON.stringify({ action: 'reveal', grantId: '00000000-0000-4000-8000-000000000051' }),
    });
    expect(remote.status).toBe(403);
  });
});
