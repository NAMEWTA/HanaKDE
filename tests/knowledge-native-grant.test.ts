import { describe, expect, it } from 'vitest';
import { KnowledgeNativeGrantService, knowledgeNativeCredentialMatches } from '../core/knowledge-workspace/knowledge-native-grant-service.ts';

describe('knowledge native grants', () => {
  it('binds action, owner, window and expiry and consumes exactly once', () => {
    let now = 1_000;
    const service = new KnowledgeNativeGrantService({ now: () => now, randomUUID: () => '00000000-0000-4000-8000-000000000051' });
    const issued = service.issue({
      action: 'reveal', address: { sourceKey: 'main', relativePath: 'a.md' },
      version: { etag: 'v1' }, ownerKey: 'owner', windowKey: '7',
    });
    expect(service.consume({ grantId: issued.grantId, action: 'reveal', ownerKey: 'owner', windowKey: '7' })).toMatchObject({ address: { relativePath: 'a.md' } });
    expect(() => service.consume({ grantId: issued.grantId, action: 'reveal', ownerKey: 'owner', windowKey: '7' })).toThrow();

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

  it('compares only fixed-length native credentials', () => {
    const token = 'a'.repeat(43);
    expect(knowledgeNativeCredentialMatches(token, token)).toBe(true);
    expect(knowledgeNativeCredentialMatches(token, `${'a'.repeat(42)}b`)).toBe(false);
    expect(knowledgeNativeCredentialMatches(token, 'short')).toBe(false);
  });
});
