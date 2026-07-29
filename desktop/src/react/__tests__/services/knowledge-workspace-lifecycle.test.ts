import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  allowOneKnowledgeWindowClose,
  consumeKnowledgeWindowCloseAllowance,
  registerKnowledgeWorkspaceCloseGuard,
  requestKnowledgeWorkspaceClose,
} from '../../services/knowledge-workspace-lifecycle';

let release: (() => void) | null = null;

afterEach(() => {
  release?.();
  release = null;
  consumeKnowledgeWindowCloseAllowance();
});

describe('knowledge workspace lifecycle bridge', () => {
  it('allows a transition when no Knowledge workspace guard is mounted', async () => {
    await expect(requestKnowledgeWorkspaceClose('workspace-switch'))
      .resolves.toBe(true);
  });

  it('forwards workspace and window close requests to the active guard', async () => {
    const guard = vi.fn(async (reason) => reason === 'workspace-switch');
    release = registerKnowledgeWorkspaceCloseGuard(guard);

    await expect(requestKnowledgeWorkspaceClose('workspace-switch'))
      .resolves.toBe(true);
    await expect(requestKnowledgeWorkspaceClose('window-close'))
      .resolves.toBe(false);
    expect(guard).toHaveBeenCalledTimes(2);
  });

  it('consumes exactly one renderer-approved native close allowance', () => {
    expect(consumeKnowledgeWindowCloseAllowance()).toBe(false);
    allowOneKnowledgeWindowClose();
    expect(consumeKnowledgeWindowCloseAllowance()).toBe(true);
    expect(consumeKnowledgeWindowCloseAllowance()).toBe(false);
  });
});
