import type {
  KnowledgeNativeCapabilities,
  KnowledgeNativeRequest,
  KnowledgeNativeResult,
} from '../../../../shared/knowledge-native-contract';
import type { KnowledgeResourceAddress } from '../../../../shared/knowledge-workspace-contract';
import {
  KnowledgeWorkspaceClientError,
  type KnowledgeWorkspaceClient,
} from './knowledge-workspace-client';

const unavailableCapabilities: KnowledgeNativeCapabilities = Object.freeze({
  directoryPicker: false,
  filePicker: false,
  fileClipboard: false,
  openDefault: false,
  reveal: false,
  systemTrash: false,
});

export async function getKnowledgeNativeCapabilities(platform = window.hana): Promise<KnowledgeNativeCapabilities> {
  if (typeof platform?.knowledgeNativeCapabilities !== 'function') return unavailableCapabilities;
  try {
    return await platform.knowledgeNativeCapabilities();
  } catch {
    return unavailableCapabilities;
  }
}

export async function invokeKnowledgeNative(
  request: KnowledgeNativeRequest,
  platform = window.hana,
): Promise<KnowledgeNativeResult> {
  if (typeof platform?.knowledgeNativeInvoke !== 'function') {
    return Object.freeze({ ok: false, code: 'knowledge_native_capability_unavailable' });
  }
  return platform.knowledgeNativeInvoke(request);
}

export async function invokeKnowledgeNativeGrant(
  client: Pick<KnowledgeWorkspaceClient, 'createNativeGrant'>,
  action: 'openDefault' | 'reveal' | 'systemTrash',
  address: KnowledgeResourceAddress,
  platform = window.hana,
): Promise<KnowledgeNativeResult> {
  const grant = await client.createNativeGrant(action, address);
  const result = await invokeKnowledgeNative({ action, grantId: grant.grantId }, platform);
  if (!result.ok) {
    throw new KnowledgeWorkspaceClientError({
      code: result.code,
      httpStatus: result.code === 'knowledge_native_capability_unavailable' ? 501 : 409,
      retryable: false,
    });
  }
  return result;
}
