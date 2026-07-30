import type {
  KnowledgeResourceAddress,
} from '../../../../shared/knowledge-workspace-contract.ts';
import {
  parseMarkdownKnowledgeIr,
} from '../../../../lib/knowledge-workspace/markdown-knowledge-ir.ts';
import {
  EditorView,
} from '@codemirror/view';
import type {
  KnowledgeLinkActivation,
} from '../editor/knowledge-link-field';
import {
  knowledgeDocumentKey,
  type KnowledgeDocumentRegistry,
} from '../stores/knowledge-document-registry';

export interface KnowledgeLinkNavigationSource {
  sourceKey: string;
  displayName: string;
  available: boolean;
  writable: boolean;
}

export interface KnowledgeLinkNavigationOpenResource {
  address: KnowledgeResourceAddress;
  sourceName: string;
  kind: 'markdown' | 'asset';
}

export type KnowledgeLinkNavigationResult =
  | { ok: true; viewId: string; reused: boolean; pendingCreate: boolean }
  | {
      ok: false;
      reason:
        | 'invalid_activation'
        | 'out_of_scope'
        | 'source_unavailable'
        | 'target_unavailable'
        | 'missing_asset'
        | 'read_only';
    };

export function revealKnowledgeHeading(
  view: EditorView,
  fragment: string,
): boolean {
  const heading = parseMarkdownKnowledgeIr(view.state.doc.toString()).tokens
    .find(token => token.kind === 'heading' && token.text === fragment);
  if (!heading) return false;
  view.dispatch({
    selection: { anchor: heading.range.from },
    effects: EditorView.scrollIntoView(heading.range.from, { y: 'start' }),
  });
  view.focus();
  return true;
}

export async function navigateKnowledgeLink(input: {
  activation: KnowledgeLinkActivation;
  pageAddress: KnowledgeResourceAddress;
  source: KnowledgeLinkNavigationSource | null;
  registry: KnowledgeDocumentRegistry;
  stat(
    address: KnowledgeResourceAddress,
    options: { signal?: AbortSignal },
  ): Promise<{ exists: boolean; isDirectory: boolean }>;
  openResource(
    resource: KnowledgeLinkNavigationOpenResource,
    options: { mode: 'preview'; groupId: string },
  ): { viewId: string; reused: boolean };
  groupId: string;
  signal?: AbortSignal;
}): Promise<KnowledgeLinkNavigationResult> {
  const target = input.activation.address;
  if (input.activation.kind !== 'internal' || !target) {
    return { ok: false, reason: 'invalid_activation' };
  }
  if (target.sourceKey !== input.pageAddress.sourceKey) {
    return { ok: false, reason: 'out_of_scope' };
  }
  if (
    !input.source
    || input.source.sourceKey !== target.sourceKey
    || !input.source.available
  ) {
    return { ok: false, reason: 'source_unavailable' };
  }

  let stat;
  try {
    stat = await input.stat(target, { signal: input.signal });
  } catch {
    return { ok: false, reason: 'target_unavailable' };
  }
  if (stat.exists && stat.isDirectory) {
    return { ok: false, reason: 'target_unavailable' };
  }

  const markdown = target.relativePath.toLocaleLowerCase().endsWith('.md');
  let pendingCreate = false;
  if (!stat.exists) {
    if (!markdown || input.activation.sourceKind !== 'wikilink') {
      return { ok: false, reason: 'missing_asset' };
    }
    if (!input.source.writable) return { ok: false, reason: 'read_only' };
    const targetKey = knowledgeDocumentKey(target);
    const existing = input.registry.getState().sessions[targetKey];
    if (!existing) {
      input.registry.getState().establishDocumentSession({
        address: target,
        buffer: '',
        baseline: '',
        diskVersion: null,
        pendingCreate: true,
      });
    }
    pendingCreate = input.registry.getState().sessions[targetKey]
      ?.pendingCreate === true;
  }

  const opened = input.openResource({
    address: target,
    sourceName: input.source.displayName,
    kind: markdown ? 'markdown' : 'asset',
  }, {
    mode: 'preview',
    groupId: input.groupId,
  });
  return {
    ok: true,
    viewId: opened.viewId,
    reused: opened.reused,
    pendingCreate,
  };
}
