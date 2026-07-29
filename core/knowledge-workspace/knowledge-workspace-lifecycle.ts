import {
  parseKnowledgeResourceAddress,
  type KnowledgeResourceAddress,
  type KnowledgeSourceDto,
} from "../../shared/knowledge-workspace-contract.ts";

export type KnowledgeDocumentResourceState =
  | "available"
  | "missing"
  | "source-unavailable"
  | "orphan";

export type KnowledgeUnsavedDecision = "save" | "discard" | "cancel";

export interface KnowledgeLifecycleDocument {
  sessionKey: string;
  address: KnowledgeResourceAddress;
  sourceName: string;
  buffer: string;
  dirty: boolean;
  orphan: boolean;
  resourceState: KnowledgeDocumentResourceState;
  viewIds: string[];
  displayOrder: number;
  active: boolean;
}

export interface KnowledgeCloseFlowServices {
  decide(
    document: Readonly<KnowledgeLifecycleDocument>,
  ): Promise<KnowledgeUnsavedDecision>;
  save(
    document: Readonly<KnowledgeLifecycleDocument>,
  ): Promise<boolean>;
  discard(
    document: Readonly<KnowledgeLifecycleDocument>,
  ): void | Promise<void>;
}

export interface KnowledgeCloseFlowResult {
  ok: boolean;
  stoppedBy: "cancel" | "save-failed" | null;
  processedSessionKeys: string[];
}

export type KnowledgeWorkspaceTransitionResult =
  | { ok: true }
  | {
      ok: false;
      stoppedBy: "preflight-failed" | "cancel" | "save-failed";
    };

export interface KnowledgeWorkspaceTransitionServices
  extends KnowledgeCloseFlowServices {
  preflight(): Promise<boolean>;
  commit(): void | Promise<void>;
}

export type KnowledgeSourceLossReason = "resource-missing" | "source-unavailable";

export interface KnowledgeSourceLossTransition {
  orphan: boolean;
  resourceState: KnowledgeDocumentResourceState;
  reloadWhenSourceRecovers: boolean;
}

export interface KnowledgeOrphanSaveTarget {
  address: KnowledgeResourceAddress;
  sourceName: string;
}

export type KnowledgeCreateOrphanPageResult =
  | {
      ok: true;
      address: KnowledgeResourceAddress;
      version: Readonly<Record<string, unknown>>;
    }
  | { ok: false; reason: "conflict" | "unavailable" };

export type KnowledgeOrphanSaveResult =
  | {
      ok: true;
      address: KnowledgeResourceAddress;
      version: Readonly<Record<string, unknown>>;
    }
  | {
      ok: false;
      reason:
        | "not-orphan"
        | "no-writable-source"
        | "cancel"
        | "invalid-target"
        | "conflict"
        | "unavailable";
    };

export interface SaveKnowledgeOrphanInput {
  document: Readonly<KnowledgeLifecycleDocument>;
  sources: readonly KnowledgeSourceDto[];
  chooseTarget(
    candidates: readonly KnowledgeSourceDto[],
    document: Readonly<KnowledgeLifecycleDocument>,
  ): Promise<KnowledgeOrphanSaveTarget | null>;
  createPage(
    target: Readonly<KnowledgeOrphanSaveTarget>,
    buffer: string,
  ): Promise<KnowledgeCreateOrphanPageResult>;
}

function cloneAddress(
  address: KnowledgeResourceAddress,
): KnowledgeResourceAddress {
  return {
    sourceKey: address.sourceKey,
    relativePath: address.relativePath,
  };
}

function uniqueDocuments(
  documents: readonly KnowledgeLifecycleDocument[],
): KnowledgeLifecycleDocument[] {
  const seen = new Set<string>();
  const unique: KnowledgeLifecycleDocument[] = [];
  for (const document of documents) {
    if (seen.has(document.sessionKey)) continue;
    seen.add(document.sessionKey);
    unique.push({
      ...document,
      address: cloneAddress(document.address),
      viewIds: [...document.viewIds],
    });
  }
  return unique;
}

/**
 * Returns the unsaved close queue in the only supported V1 order: active
 * document first, then stable visible tab order, with shared sessions deduped.
 */
export function orderKnowledgeUnsavedDocuments(
  documents: readonly KnowledgeLifecycleDocument[],
): KnowledgeLifecycleDocument[] {
  return uniqueDocuments(documents)
    .filter(document => document.dirty)
    .sort((left, right) => {
      if (left.active !== right.active) return left.active ? -1 : 1;
      return left.displayOrder - right.displayOrder;
    });
}

/**
 * Closing a non-last view never ends a shared document session and therefore
 * never opens an unsaved prompt.
 */
export function shouldConfirmKnowledgeViewClose(
  document: Readonly<KnowledgeLifecycleDocument>,
  viewId: string,
): boolean {
  return document.dirty
    && document.viewIds.length === 1
    && document.viewIds[0] === viewId;
}

/**
 * Coordinates close, quit and workspace switch without transactionally
 * rolling back earlier explicit document decisions.
 */
export async function runKnowledgeCloseFlow(
  documents: readonly KnowledgeLifecycleDocument[],
  services: KnowledgeCloseFlowServices,
): Promise<KnowledgeCloseFlowResult> {
  const processedSessionKeys: string[] = [];
  for (const document of orderKnowledgeUnsavedDocuments(documents)) {
    const decision = await services.decide(document);
    if (decision === "cancel") {
      return {
        ok: false,
        stoppedBy: "cancel",
        processedSessionKeys,
      };
    }
    if (decision === "save") {
      if (!await services.save(document)) {
        return {
          ok: false,
          stoppedBy: "save-failed",
          processedSessionKeys,
        };
      }
    } else {
      await services.discard(document);
    }
    processedSessionKeys.push(document.sessionKey);
  }
  return { ok: true, stoppedBy: null, processedSessionKeys };
}

/**
 * Workspace switching validates the candidate first, then resolves unsaved
 * documents, and only then commits the new root.
 */
export async function runKnowledgeWorkspaceTransition(
  documents: readonly KnowledgeLifecycleDocument[],
  services: KnowledgeWorkspaceTransitionServices,
): Promise<KnowledgeWorkspaceTransitionResult> {
  if (!await services.preflight()) {
    return { ok: false, stoppedBy: "preflight-failed" };
  }
  const close = await runKnowledgeCloseFlow(documents, services);
  if (!close.ok) {
    return {
      ok: false,
      stoppedBy: close.stoppedBy ?? "save-failed",
    };
  }
  await services.commit();
  return { ok: true };
}

/**
 * Dirty source-loss is irreversible for the current session. Clean documents
 * retain a recoverable placeholder only when the source itself is unavailable.
 */
export function transitionKnowledgeDocumentForSourceLoss(
  document: Pick<KnowledgeLifecycleDocument, "dirty" | "orphan">,
  reason: KnowledgeSourceLossReason,
): KnowledgeSourceLossTransition {
  if (document.orphan || document.dirty) {
    return {
      orphan: true,
      resourceState: "orphan",
      reloadWhenSourceRecovers: false,
    };
  }
  return reason === "source-unavailable"
    ? {
        orphan: false,
        resourceState: "source-unavailable",
        reloadWhenSourceRecovers: true,
      }
    : {
        orphan: false,
        resourceState: "missing",
        reloadWhenSourceRecovers: false,
      };
}

export function knowledgeWritableSources(
  sources: readonly KnowledgeSourceDto[],
): KnowledgeSourceDto[] {
  return sources
    .filter(source => (
      source.availability === "available"
      && source.capabilities.includes("write")
    ))
    .map(source => ({
      ...source,
      capabilities: [...source.capabilities],
    }));
}

/**
 * Orphan save is a create-page operation in the current workspace, not a
 * migration. Only the current buffer and the selected new address are passed
 * to the create callback, so old inbound/outbound references are untouched.
 */
export async function saveKnowledgeOrphanDocument(
  input: SaveKnowledgeOrphanInput,
): Promise<KnowledgeOrphanSaveResult> {
  if (!input.document.orphan || input.document.resourceState !== "orphan") {
    return { ok: false, reason: "not-orphan" };
  }
  const candidates = knowledgeWritableSources(input.sources);
  if (candidates.length === 0) {
    return { ok: false, reason: "no-writable-source" };
  }
  const target = await input.chooseTarget(candidates, input.document);
  if (!target) return { ok: false, reason: "cancel" };
  const parsed = parseKnowledgeResourceAddress(target.address);
  const source = candidates.find(candidate => (
    candidate.sourceKey === target.address.sourceKey
  ));
  if (
    !parsed.ok
    || !source
    || !parsed.value.relativePath.toLocaleLowerCase().endsWith(".md")
    || target.sourceName !== source.displayName
  ) {
    return { ok: false, reason: "invalid-target" };
  }
  const created = await input.createPage(
    {
      address: cloneAddress(parsed.value),
      sourceName: source.displayName,
    },
    input.document.buffer,
  );
  if (created.ok) {
    return {
      ok: true,
      address: cloneAddress(created.address),
      version: { ...created.version },
    };
  }
  return {
    ok: false,
    reason: "reason" in created ? created.reason : "unavailable",
  };
}
