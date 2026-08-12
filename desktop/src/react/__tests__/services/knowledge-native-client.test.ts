import { describe, expect, it, vi } from 'vitest';
import { getKnowledgeNativeCapabilities, invokeKnowledgeNative } from '../../services/knowledge-native-client';

describe('knowledge native renderer client', () => {
  it('returns explicit unavailable capability on Open/Web without inventing a path fallback', async () => {
    await expect(getKnowledgeNativeCapabilities({} as never)).resolves.toEqual({
      directoryPicker: false, filePicker: false, fileClipboard: false,
      openDefault: false, reveal: false, copyPath: false, systemTrash: false,
    });
    await expect(invokeKnowledgeNative({
      action: 'pickFiles', target: { sourceKey: 'main', directoryPath: '' }, conflictPolicy: 'skip',
    }, {} as never)).resolves.toEqual({ ok: false, code: 'knowledge_native_capability_unavailable' });
  });

  it('passes only the frozen path-free request through preload', async () => {
    const knowledgeNativeInvoke = vi.fn(async () => ({ ok: true as const, cancelled: true as const }));
    const request = { action: 'reveal' as const, grantId: '00000000-0000-4000-8000-000000000051' };
    await expect(invokeKnowledgeNative(request, { knowledgeNativeInvoke } as never)).resolves.toEqual({ ok: true, cancelled: true });
    expect(knowledgeNativeInvoke).toHaveBeenCalledWith(request);
    expect(JSON.stringify(request)).not.toMatch(/filePath|absolutePath|resolvedPath/u);
  });
});
