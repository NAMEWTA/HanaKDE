import {
  parseKnowledgeResourceAddress,
  type KnowledgeResourceAddress,
} from "../../shared/knowledge-workspace-contract.ts";

export type CanonicalKnowledgePathOptions = Readonly<{
  literalBackslash?: "reject" | "provider-validated";
}>;

export type CanonicalKnowledgePathResult =
  | Readonly<{ ok: true; value: string }>
  | Readonly<{
      ok: false;
      reason: "invalid_path" | "provider_validation_required";
    }>;

export type CanonicalKnowledgeAddressResult =
  | Readonly<{ ok: true; value: KnowledgeResourceAddress }>
  | Readonly<{
      ok: false;
      reason:
        | "invalid_address"
        | "invalid_source_key"
        | "invalid_path"
        | "provider_validation_required";
    }>;

/**
 * Validates the persisted, source-root-relative spelling used by knowledge
 * addresses. It deliberately does not normalize case, Unicode, separators, or
 * percent escapes because all of those are provider-visible identity facts.
 */
export function canonicalKnowledgeRelativePath(
  value: unknown,
  options: CanonicalKnowledgePathOptions = {},
): CanonicalKnowledgePathResult {
  const parsed = parseKnowledgeResourceAddress({
    sourceKey: "main",
    relativePath: value,
  });
  if (parsed.ok === false) {
    return { ok: false, reason: "invalid_path" };
  }
  if (
    parsed.value.relativePath.includes("\\")
    && options.literalBackslash !== "provider-validated"
  ) {
    return { ok: false, reason: "provider_validation_required" };
  }
  return { ok: true, value: parsed.value.relativePath };
}

export function canonicalKnowledgeAddress(
  value: unknown,
  options: CanonicalKnowledgePathOptions = {},
): CanonicalKnowledgeAddressResult {
  const parsed = parseKnowledgeResourceAddress(value);
  if (parsed.ok === false) {
    return {
      ok: false,
      reason: parsed.error.code === "invalid_source_key"
        ? "invalid_source_key"
        : parsed.error.code === "invalid_relative_path"
          ? "invalid_path"
          : "invalid_address",
    };
  }
  const relativePath = canonicalKnowledgeRelativePath(
    parsed.value.relativePath,
    options,
  );
  if (relativePath.ok === false) {
    return { ok: false, reason: relativePath.reason };
  }
  return {
    ok: true,
    value: {
      sourceKey: parsed.value.sourceKey,
      relativePath: relativePath.value,
    },
  };
}

export function sameKnowledgeSource(
  left: Pick<KnowledgeResourceAddress, "sourceKey">,
  right: Pick<KnowledgeResourceAddress, "sourceKey">,
): boolean {
  return left.sourceKey === right.sourceKey;
}
