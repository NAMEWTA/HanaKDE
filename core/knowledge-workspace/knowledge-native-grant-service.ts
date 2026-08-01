import crypto from 'node:crypto';
import type { KnowledgeResourceAddress } from '../../shared/knowledge-workspace-contract.ts';
import { createKnowledgeWorkspaceError } from '../../shared/knowledge-workspace-errors.ts';
import { createKnowledgeOperationId } from '../../lib/knowledge-workspace/knowledge-operation-plan.ts';
import type { ResourceVersion } from '../../lib/resource-io/types.ts';

export type KnowledgeNativeGrantAction = 'openDefault' | 'reveal' | 'systemTrash';
export type KnowledgeNativeResourceGrant = Readonly<{
  grantId: string;
  action: KnowledgeNativeGrantAction;
  address: KnowledgeResourceAddress;
  version: ResourceVersion;
  ownerKey: string;
  windowKey: string;
  expiresAt: number;
}>;

export class KnowledgeNativeGrantService {
  readonly #grants = new Map<string, KnowledgeNativeResourceGrant>();
  readonly #pendingSystemTrash = new Map<string, KnowledgeNativeResourceGrant>();
  readonly #now: () => number;
  readonly #randomUUID: () => string;
  constructor(input: { now?: () => number; randomUUID?: () => string } = {}) {
    this.#now = input.now ?? Date.now;
    this.#randomUUID = input.randomUUID ?? createKnowledgeOperationId;
  }
  issue(input: Omit<KnowledgeNativeResourceGrant, 'grantId' | 'expiresAt'>): Readonly<{ grantId: string; expiresAt: number }> {
    this.#sweep();
    const grantId = this.#randomUUID();
    const expiresAt = this.#now() + 60_000;
    this.#grants.set(grantId, Object.freeze({ ...input, address: Object.freeze({ ...input.address }), version: Object.freeze({ ...input.version }), grantId, expiresAt }));
    return Object.freeze({ grantId, expiresAt });
  }
  consume(input: Readonly<{ grantId: string; action: KnowledgeNativeGrantAction; ownerKey: string; windowKey: string }>): KnowledgeNativeResourceGrant {
    const grant = this.#grants.get(input.grantId);
    if (!grant || grant.expiresAt <= this.#now()) {
      this.#grants.delete(input.grantId);
      throw createKnowledgeWorkspaceError('knowledge_operation_precondition_failed', 'knowledge native grant is invalid or expired');
    }
    if (grant.action !== input.action || grant.ownerKey !== input.ownerKey || grant.windowKey !== input.windowKey) {
      throw createKnowledgeWorkspaceError('knowledge_operation_precondition_failed', 'knowledge native grant is invalid or expired');
    }
    this.#grants.delete(input.grantId);
    if (grant.action === 'systemTrash') this.#pendingSystemTrash.set(grant.grantId, grant);
    return grant;
  }
  completeSystemTrash(grantId: string): KnowledgeNativeResourceGrant {
    const grant = this.#pendingSystemTrash.get(grantId);
    this.#pendingSystemTrash.delete(grantId);
    if (!grant) throw createKnowledgeWorkspaceError('knowledge_operation_precondition_failed', 'knowledge native trash completion is invalid');
    return grant;
  }
  discardSystemTrash(grantId: string): KnowledgeNativeResourceGrant {
    const grant = this.#pendingSystemTrash.get(grantId);
    if (!grant) {
      throw createKnowledgeWorkspaceError('knowledge_operation_precondition_failed', 'knowledge native trash completion is invalid');
    }
    this.#pendingSystemTrash.delete(grantId);
    return grant;
  }
  #sweep(): void {
    const now = this.#now();
    for (const [id, grant] of this.#grants) if (grant.expiresAt <= now) this.#grants.delete(id);
  }
}

export function knowledgeNativeCredentialMatches(expected: string | null | undefined, actual: string | null | undefined): boolean {
  if (typeof expected !== 'string' || typeof actual !== 'string') return false;
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(actual, 'utf8');
  return left.length === right.length && left.length === 43 && crypto.timingSafeEqual(left, right);
}
