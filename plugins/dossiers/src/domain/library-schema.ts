import { isStableId } from "./ids.ts";

export const LIBRARY_KIND = "hana.dossiers.library" as const;
export const LIBRARY_SCHEMA_VERSION = 1 as const;

export interface LibraryManifest {
  kind: typeof LIBRARY_KIND;
  schemaVersion: number;
  libraryId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  extensions: Record<string, unknown>;
  [key: string]: unknown;
}

export type ManifestParseResult =
  | { ok: true; manifest: LibraryManifest }
  | { ok: false; reason: "invalid-json" | "invalid-manifest" };

export function createLibraryManifest(input: {
  libraryId: string;
  now: string;
}): LibraryManifest {
  if (!isStableId(input.libraryId, "lib")) {
    throw new Error("libraryId must be a stable lib_ identifier");
  }
  return {
    kind: LIBRARY_KIND,
    schemaVersion: LIBRARY_SCHEMA_VERSION,
    libraryId: input.libraryId,
    revision: 1,
    createdAt: input.now,
    updatedAt: input.now,
    extensions: {},
  };
}

export function parseLibraryManifest(text: string): ManifestParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "invalid-manifest" };
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.kind !== LIBRARY_KIND
    || typeof candidate.schemaVersion !== "number"
    || !Number.isInteger(candidate.schemaVersion)
    || !isStableId(candidate.libraryId, "lib")
    || typeof candidate.revision !== "number"
    || !Number.isInteger(candidate.revision)
    || candidate.revision < 1
    || typeof candidate.createdAt !== "string"
    || typeof candidate.updatedAt !== "string"
    || !candidate.extensions
    || typeof candidate.extensions !== "object"
    || Array.isArray(candidate.extensions)
  ) {
    return { ok: false, reason: "invalid-manifest" };
  }
  return { ok: true, manifest: candidate as LibraryManifest };
}

export function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
