import { describe, expect, it } from 'vitest';
import { parseKnowledgeNativeRequest } from '../shared/knowledge-native-contract.ts';

describe('knowledge native contract', () => {
  it('accepts only fixed path-free picker and grant actions', () => {
    expect(parseKnowledgeNativeRequest({
      action: 'pickFiles',
      target: { sourceKey: 'main', directoryPath: 'imports' },
      conflictPolicy: 'keep-both',
    })).toEqual({
      action: 'pickFiles', target: { sourceKey: 'main', directoryPath: 'imports' }, conflictPolicy: 'keep-both',
    });
    expect(parseKnowledgeNativeRequest({
      action: 'reveal', grantId: '00000000-0000-4000-8000-000000000051',
    })).toEqual({ action: 'reveal', grantId: '00000000-0000-4000-8000-000000000051' });
    expect(parseKnowledgeNativeRequest({
      action: 'copyPath', grantId: '00000000-0000-4000-8000-000000000051',
    })).toEqual({ action: 'copyPath', grantId: '00000000-0000-4000-8000-000000000051' });
    const fileHandle = Object.freeze({ opaque: true });
    expect(parseKnowledgeNativeRequest({
      action: 'importDroppedFiles',
      files: [fileHandle],
      target: { sourceKey: 'main', directoryPath: 'imports' },
      conflictPolicy: 'keep-both',
    })).toEqual({
      action: 'importDroppedFiles',
      files: [fileHandle],
      target: { sourceKey: 'main', directoryPath: 'imports' },
      conflictPolicy: 'keep-both',
    });
  });

  it('rejects absolute paths, credentials, unknown actions and escaping target directories', () => {
    for (const request of [
      { action: 'pickFiles', target: { sourceKey: 'main', directoryPath: '../private' }, conflictPolicy: 'skip' },
      { action: 'pickFiles', target: { sourceKey: 'main', directoryPath: '' }, conflictPolicy: 'skip', path: '/tmp/a' },
      { action: 'importDroppedFiles', files: [], target: { sourceKey: 'main', directoryPath: '' }, conflictPolicy: 'skip' },
      { action: 'reveal', grantId: '00000000-0000-4000-8000-000000000051', token: 'secret' },
      { action: 'deleteForever', grantId: '00000000-0000-4000-8000-000000000051' },
    ]) expect(parseKnowledgeNativeRequest(request)).toBeNull();
  });
});
