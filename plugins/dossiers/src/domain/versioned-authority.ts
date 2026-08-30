import { isStableId, type EntityIdKind } from "./ids.ts";

export const AUTHORITY_SCHEMA_VERSION = 1 as const;

export type AuthorityKind = "dossier" | "dossier-type" | "contact" | "document";

const ID_KIND: Record<AuthorityKind, EntityIdKind> = {
  dossier: "dos",
  "dossier-type": "typ",
  contact: "con",
  document: "doc",
};

export interface VersionedAuthority<K extends AuthorityKind = AuthorityKind, T = unknown> {
  kind: `hana.dossiers.${K}`;
  schemaVersion: number;
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  data: T;
  extensions: Record<string, unknown>;
  [key: string]: unknown;
}

export function createVersionedAuthority<K extends AuthorityKind, T>(input: {
  kind: K;
  id: string;
  now: string;
  data: T;
}): VersionedAuthority<K, T> {
  const idKind = ID_KIND[input.kind];
  if (!isStableId(input.id, idKind)) {
    throw new Error(`${input.kind} id must be a stable ${idKind}_ identifier`);
  }
  return {
    kind: `hana.dossiers.${input.kind}`,
    schemaVersion: AUTHORITY_SCHEMA_VERSION,
    id: input.id,
    revision: 1,
    createdAt: input.now,
    updatedAt: input.now,
    data: input.data,
    extensions: {},
  };
}

export type AuthorityParseResult<K extends AuthorityKind> =
  | { ok: true; value: VersionedAuthority<K> }
  | { ok: false; reason: "invalid-json" | "invalid-authority" };

export function parseVersionedAuthority<K extends AuthorityKind>(
  text: string,
  expectedKind: K,
): AuthorityParseResult<K> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "invalid-authority" };
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.kind !== `hana.dossiers.${expectedKind}`
    || typeof candidate.schemaVersion !== "number"
    || !Number.isInteger(candidate.schemaVersion)
    || !isStableId(candidate.id, ID_KIND[expectedKind])
    || typeof candidate.revision !== "number"
    || !Number.isInteger(candidate.revision)
    || candidate.revision < 1
    || typeof candidate.createdAt !== "string"
    || typeof candidate.updatedAt !== "string"
    || !("data" in candidate)
    || !candidate.extensions
    || typeof candidate.extensions !== "object"
    || Array.isArray(candidate.extensions)
  ) {
    return { ok: false, reason: "invalid-authority" };
  }
  return { ok: true, value: candidate as VersionedAuthority<K> };
}
