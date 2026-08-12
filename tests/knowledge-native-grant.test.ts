import { describe, expect, it } from 'vitest';
import { KnowledgeNativeGrantService, knowledgeNativeCredentialMatches } from '../core/knowledge-workspace/knowledge-native-grant-service.ts';

describe('knowledge native grants', () => {
  it('binds action, owner, window and expiry and consumes exactly once', () => {
    let now = 1_000;
    const service = new KnowledgeNativeGrantService({ now: () => now, randomUUID: () => '00000000-0000-4000-8000-000000000051' });
    const issued = service.issue({
      action: 'copyPath', address: { sourceKey: 'main', relativePath: 'a.md' },
      version: { etag: 'v1' }, ownerKey: 'owner', windowKey: '7',
    });
    expect(service.consume({ grantId: issued.grantId, action: 'copyPath', ownerKey: 'owner', windowKey: '7' })).toMatchObject({
      action: 'copyPath',
      address: { relativePath: 'a.md' },
    });
    expect(() => service.consume({ grantId: issued.grantId, action: 'copyPath', ownerKey: 'owner', windowKey: '7' })).toThrow();

    const expired = new KnowledgeNativeGrantService({ now: () => now, randomUUID: () => '00000000-0000-4000-8000-000000000052' });
    const second = expired.issue({ action: 'systemTrash', address: { sourceKey: 'main', relativePath: 'b.md' }, version: { etag: 'v2' }, ownerKey: 'owner', windowKey: '7' });
    now += 60_001;
    expect(() => expired.consume({ grantId: second.grantId, action: 'systemTrash', ownerKey: 'owner', windowKey: '7' })).toThrow();
  });

  it('does not let a different window invalidate the rightful window grant', () => {
    const service = new KnowledgeNativeGrantService({ randomUUID: () => '00000000-0000-4000-8000-000000000053' });
    const issued = service.issue({
      action: 'reveal', address: { sourceKey: 'main', relativePath: 'shared.md' },
      version: { etag: 'v1' }, ownerKey: 'owner', windowKey: 'window-a',
    });

    expect(() => service.consume({
      grantId: issued.grantId, action: 'reveal', ownerKey: 'owner', windowKey: 'window-b',
    })).toThrow();
    expect(service.consume({
      grantId: issued.grantId, action: 'reveal', ownerKey: 'owner', windowKey: 'window-a',
    })).toMatchObject({ windowKey: 'window-a' });
  });

  it('does not let another window finalize a pending system-trash grant', () => {
    const service = new KnowledgeNativeGrantService({ randomUUID: () => '00000000-0000-4000-8000-000000000054' });
    const identity = { ownerKey: 'owner', windowKey: 'window-a' };
    const anotherWindow = { ownerKey: 'owner', windowKey: 'window-b' };
    const systemTrash = service.issue({
      action: 'systemTrash', address: { sourceKey: 'main', relativePath: '.trash/batch/payload/000001.md' },
      version: { etag: 'v1' },
      ...identity,
    });

    service.consume({ grantId: systemTrash.grantId, action: 'systemTrash', ...identity });
    expect(() => service.completeSystemTrash({ grantId: systemTrash.grantId, ...anotherWindow })).toThrow();
    expect(() => service.discardSystemTrash({ grantId: systemTrash.grantId, ...anotherWindow })).toThrow();
    expect(() => service.failSystemTrash({ grantId: systemTrash.grantId, ...anotherWindow })).toThrow();
    expect(service.completeSystemTrash({ grantId: systemTrash.grantId, ...identity })).toMatchObject({
      action: 'systemTrash',
      address: { relativePath: '.trash/batch/payload/000001.md' },
    });
  });

  it('does not let another window fail an unconsumed system-trash grant', () => {
    const service = new KnowledgeNativeGrantService({ randomUUID: () => '00000000-0000-4000-8000-000000000055' });
    const identity = { ownerKey: 'owner', windowKey: 'window-a' };
    const anotherWindow = { ownerKey: 'owner', windowKey: 'window-b' };
    const systemTrash = service.issue({
      action: 'systemTrash', address: { sourceKey: 'main', relativePath: '.trash/batch/payload/000002.md' },
      version: { etag: 'v2' },
      ...identity,
    });

    expect(() => service.failSystemTrash({ grantId: systemTrash.grantId, ...anotherWindow })).toThrow();
    expect(service.consume({ grantId: systemTrash.grantId, action: 'systemTrash', ...identity })).toMatchObject({
      action: 'systemTrash',
    });
    expect(service.failSystemTrash({ grantId: systemTrash.grantId, ...identity })).toMatchObject({
      address: { relativePath: '.trash/batch/payload/000002.md' },
    });
  });

  it('compares only fixed-length native credentials', () => {
    const token = 'a'.repeat(43);
    expect(knowledgeNativeCredentialMatches(token, token)).toBe(true);
    expect(knowledgeNativeCredentialMatches(token, `${'a'.repeat(42)}b`)).toBe(false);
    expect(knowledgeNativeCredentialMatches(token, 'short')).toBe(false);
  });
});
