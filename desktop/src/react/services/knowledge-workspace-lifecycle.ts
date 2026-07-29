export type KnowledgeWorkspaceCloseReason =
  | 'workspace-switch'
  | 'workspace-close'
  | 'window-close';

export type KnowledgeWorkspaceCloseGuard = (
  reason: KnowledgeWorkspaceCloseReason,
) => Promise<boolean>;

let activeGuard: KnowledgeWorkspaceCloseGuard | null = null;
let allowNextWindowClose = false;

export function registerKnowledgeWorkspaceCloseGuard(
  guard: KnowledgeWorkspaceCloseGuard,
): () => void {
  activeGuard = guard;
  return () => {
    if (activeGuard === guard) activeGuard = null;
  };
}

export async function requestKnowledgeWorkspaceClose(
  reason: KnowledgeWorkspaceCloseReason,
): Promise<boolean> {
  return activeGuard ? activeGuard(reason) : true;
}

export function hasKnowledgeWorkspaceCloseGuard(): boolean {
  return activeGuard !== null;
}

export function allowOneKnowledgeWindowClose(): void {
  allowNextWindowClose = true;
}

export function consumeKnowledgeWindowCloseAllowance(): boolean {
  if (!allowNextWindowClose) return false;
  allowNextWindowClose = false;
  return true;
}
