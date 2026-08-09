import type {
  ProviderRootIdentity,
  ResourceOperationContext,
  ResourceRef,
} from "../../lib/resource-io/types.ts";
import type {
  MainWorkspaceRootAuthority,
  MainWorkspaceRootProof,
} from "./main-workspace-runtime.ts";

type ResourceRootAuthoritySurface = Readonly<{
  getRootIdentity: (
    root: ResourceRef,
    context?: ResourceOperationContext,
  ) => Promise<ProviderRootIdentity>;
  resolveWatchTarget: (root: ResourceRef, context?: ResourceOperationContext) => unknown;
}>;

export function createResourceMainRootAuthority({
  resourceIO,
  context = {},
}: {
  resourceIO: ResourceRootAuthoritySurface;
  context?: ResourceOperationContext;
}): MainWorkspaceRootAuthority {
  const prove = async (root: ResourceRef): Promise<MainWorkspaceRootProof | null> => {
    if (root.kind !== "local-file") return null;
    try {
      const identity = await resourceIO.getRootIdentity(root, context);
      const watchTarget = resourceIO.resolveWatchTarget(root, context);
      if (!isWatchableDirectoryTarget(watchTarget) || !isValidIdentity(identity)) return null;
      return Object.freeze({
        root: Object.freeze({ kind: "local-file" as const, path: root.path }),
        identity: Object.freeze({ ...identity }),
        watchTarget,
      });
    } catch {
      return null;
    }
  };

  return Object.freeze({
    proveMain: prove,
    revalidateMain: async (proof) => {
      const current = await prove(proof.root);
      if (!current || !sameIdentity(proof.identity, current.identity)) return null;
      return current;
    },
  });
}

function isWatchableDirectoryTarget(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const target = value as { ref?: ResourceRef; filePath?: unknown; isDirectory?: unknown };
  return target.ref?.kind === "local-file"
    && typeof target.filePath === "string"
    && target.isDirectory === true;
}

function isValidIdentity(value: ProviderRootIdentity): boolean {
  return Boolean(value)
    && typeof value.providerId === "string"
    && typeof value.identityNamespace === "string"
    && typeof value.opaqueRootId === "string"
    && typeof value.scopeToken === "string"
    && (value.caseMode === "sensitive" || value.caseMode === "insensitive" || value.caseMode === "unknown");
}

function sameIdentity(a: ProviderRootIdentity, b: ProviderRootIdentity): boolean {
  return a.providerId === b.providerId
    && a.identityNamespace === b.identityNamespace
    && a.opaqueRootId === b.opaqueRootId
    && a.scopeToken === b.scopeToken
    && a.caseMode === b.caseMode;
}
