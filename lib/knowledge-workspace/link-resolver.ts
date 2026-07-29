import type { KnowledgeResourceAddress } from "../../shared/knowledge-workspace-contract.ts";
import {
  canonicalKnowledgeAddress,
  canonicalKnowledgeRelativePath,
  sameKnowledgeSource,
} from "./knowledge-address.ts";

export type KnowledgeLinkResolution =
  | Readonly<{
      kind: "internal";
      address: KnowledgeResourceAddress;
      fragment: string | null;
    }>
  | Readonly<{
      kind: "external";
      url: string;
    }>
  | Readonly<{
      kind: "broken";
      reason:
        | "invalid_address"
        | "invalid_destination"
        | "invalid_percent_encoding"
        | "out_of_scope"
        | "provider_validation_required"
        | "unsupported_scheme";
    }>;

export type KnowledgeLinkFormatResult =
  | Readonly<{ ok: true; value: string }>
  | Readonly<{
      ok: false;
      reason: "invalid_address" | "out_of_scope";
    }>;

export type ResolveKnowledgeLinkOptions = Readonly<{
  isProviderValidatedAddress?: (
    address: KnowledgeResourceAddress,
  ) => boolean;
}>;

export type WikilinkTarget = Readonly<{
  address: string;
  fragment?: string;
}>;

const SOURCE_PREFIX_PATTERN = /^[a-z][a-z0-9-]{0,31}:/;
const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const HTTP_SCHEME_PATTERN = /^https?:/i;
const WINDOWS_DRIVE_PATTERN = /^[a-z]:[\\/]/i;
const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;
const WIKILINK_ESCAPE_CHARACTERS = new Set(["\\", "#", "|", "[", "]"]);

function validPageAddress(
  page: KnowledgeResourceAddress,
): KnowledgeResourceAddress | null {
  const parsed = canonicalKnowledgeAddress(page, {
    literalBackslash: "provider-validated",
  });
  return parsed.ok ? parsed.value : null;
}

function internal(
  sourceKey: string,
  relativePath: string,
  fragment: string | undefined,
): KnowledgeLinkResolution {
  return {
    kind: "internal",
    address: { sourceKey, relativePath },
    fragment: fragment === undefined ? null : fragment,
  };
}

function broken(
  reason: Extract<KnowledgeLinkResolution, { kind: "broken" }>["reason"],
): KnowledgeLinkResolution {
  return { kind: "broken", reason };
}

export function resolveKnowledgeWikilink(
  page: KnowledgeResourceAddress,
  target: WikilinkTarget,
  options: ResolveKnowledgeLinkOptions = {},
): KnowledgeLinkResolution {
  const safePage = validPageAddress(page);
  if (!safePage || !target || typeof target.address !== "string") {
    return broken("invalid_address");
  }
  if (
    target.fragment !== undefined
    && typeof target.fragment !== "string"
  ) {
    return broken("invalid_address");
  }
  if (target.address.length === 0) {
    return target.fragment
      ? internal(
          safePage.sourceKey,
          safePage.relativePath,
          target.fragment,
        )
      : broken("invalid_address");
  }
  if (SOURCE_PREFIX_PATTERN.test(target.address)) {
    return broken("out_of_scope");
  }

  const parsedPath = canonicalKnowledgeRelativePath(target.address);
  if (parsedPath.ok === false) {
    if (parsedPath.reason !== "provider_validation_required") {
      return broken("invalid_address");
    }
    const candidate = {
      sourceKey: safePage.sourceKey,
      relativePath: target.address,
    };
    if (!options.isProviderValidatedAddress?.(candidate)) {
      return broken("provider_validation_required");
    }
    const providerPath = canonicalKnowledgeRelativePath(target.address, {
      literalBackslash: "provider-validated",
    });
    if (!providerPath.ok) return broken("invalid_address");
    return internal(safePage.sourceKey, providerPath.value, target.fragment);
  }
  return internal(safePage.sourceKey, parsedPath.value, target.fragment);
}

export function resolveKnowledgeMarkdownDestination(
  page: KnowledgeResourceAddress,
  destination: string,
): KnowledgeLinkResolution {
  const safePage = validPageAddress(page);
  if (!safePage || typeof destination !== "string") {
    return broken("invalid_destination");
  }
  if (HTTP_SCHEME_PATTERN.test(destination)) {
    return { kind: "external", url: destination };
  }
  if (URI_SCHEME_PATTERN.test(destination)) {
    return broken("unsupported_scheme");
  }
  if (
    destination.startsWith("//")
    || destination.startsWith("/")
    || destination.startsWith("\\")
    || WINDOWS_DRIVE_PATTERN.test(destination)
  ) {
    return broken("out_of_scope");
  }

  const hash = destination.indexOf("#");
  const rawPath = hash < 0 ? destination : destination.slice(0, hash);
  const fragment = hash < 0 ? undefined : destination.slice(hash + 1);
  if (rawPath.length === 0) {
    return fragment !== undefined
      ? internal(safePage.sourceKey, safePage.relativePath, fragment)
      : broken("invalid_destination");
  }
  if (
    rawPath.includes("?")
    || rawPath.includes("\\")
    || CONTROL_CHARACTER_PATTERN.test(rawPath)
  ) {
    return broken("invalid_destination");
  }

  const decodedSegments: string[] = [];
  for (const rawSegment of rawPath.split("/")) {
    if (rawSegment.length === 0) return broken("invalid_destination");
    let segment: string;
    try {
      segment = decodeURIComponent(rawSegment);
    } catch {
      return broken("invalid_percent_encoding");
    }
    if (
      segment.includes("/")
      || segment.includes("\\")
      || CONTROL_CHARACTER_PATTERN.test(segment)
    ) {
      return broken("invalid_percent_encoding");
    }
    decodedSegments.push(segment);
  }

  const pageSegments = safePage.relativePath.split("/");
  const normalized = pageSegments.slice(0, -1);
  for (const segment of decodedSegments) {
    if (segment === ".") continue;
    if (segment === "..") {
      if (normalized.length === 0) return broken("out_of_scope");
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }
  const relativePath = normalized.join("/");
  const canonical = canonicalKnowledgeRelativePath(relativePath);
  if (!canonical.ok) return broken("invalid_destination");
  return internal(safePage.sourceKey, canonical.value, fragment);
}

export function formatKnowledgeWikilink(
  page: KnowledgeResourceAddress,
  target: KnowledgeResourceAddress,
  fragment?: string,
): KnowledgeLinkFormatResult {
  const safePage = validPageAddress(page);
  const safeTarget = canonicalKnowledgeAddress(target);
  if (!safePage || !safeTarget.ok) {
    return { ok: false, reason: "invalid_address" };
  }
  if (!sameKnowledgeSource(safePage, safeTarget.value)) {
    return { ok: false, reason: "out_of_scope" };
  }
  return {
    ok: true,
    value: `${escapeWikilinkField(safeTarget.value.relativePath)}${
      fragment === undefined ? "" : `#${escapeWikilinkField(fragment)}`
    }`,
  };
}

export function formatKnowledgeMarkdownDestination(
  page: KnowledgeResourceAddress,
  target: KnowledgeResourceAddress,
  fragment?: string,
): KnowledgeLinkFormatResult {
  const safePage = validPageAddress(page);
  const safeTarget = canonicalKnowledgeAddress(target);
  if (!safePage || !safeTarget.ok) {
    return { ok: false, reason: "invalid_address" };
  }
  if (!sameKnowledgeSource(safePage, safeTarget.value)) {
    return { ok: false, reason: "out_of_scope" };
  }

  const from = safePage.relativePath.split("/").slice(0, -1);
  const to = safeTarget.value.relativePath.split("/");
  let common = 0;
  while (
    common < from.length
    && common < to.length
    && from[common] === to[common]
  ) {
    common += 1;
  }
  const relativeSegments = [
    ...Array.from({ length: from.length - common }, () => ".."),
    ...to.slice(common),
  ];
  const relativePath = relativeSegments.map(percentEncodePathSegment).join("/");
  return {
    ok: true,
    value: `${relativePath}${
      fragment === undefined ? "" : `#${fragment}`
    }`,
  };
}

function escapeWikilinkField(value: string): string {
  let escaped = "";
  for (const character of value) {
    escaped += WIKILINK_ESCAPE_CHARACTERS.has(character)
      ? `\\${character}`
      : character;
  }
  return escaped;
}

function percentEncodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
