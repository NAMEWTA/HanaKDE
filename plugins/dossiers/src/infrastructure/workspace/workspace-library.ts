import {
  createLibraryManifest,
  LIBRARY_KIND,
  LIBRARY_SCHEMA_VERSION,
  parseLibraryManifest,
  serializeJson,
  type LibraryManifest,
} from "../../domain/library-schema.ts";
import { createStableId, isStableId } from "../../domain/ids.ts";
import { appendResourcePath, type WorkspaceTreeRef } from "./resource-path.ts";
import type { WorkspaceResources } from "./resource-port.ts";

export const LIBRARY_RELATIVE_PATHS = {
  manifest: "Dossiers/manifest.json",
  types: "Dossiers/types",
  contacts: "Dossiers/contacts",
  dossiers: "Dossiers/dossiers",
  operations: "Dossiers/.system/operations",
  staging: "Dossiers/.system/staging",
  trash: "Dossiers/.trash",
  audit: "Dossiers/audit",
} as const;

const INITIALIZATION_MARKER = "Dossiers/.dossiers-initializing.json";
const INITIALIZATION_DIRECTORIES = [
  "Dossiers/.system",
  LIBRARY_RELATIVE_PATHS.types,
  LIBRARY_RELATIVE_PATHS.contacts,
  LIBRARY_RELATIVE_PATHS.dossiers,
  LIBRARY_RELATIVE_PATHS.operations,
  LIBRARY_RELATIVE_PATHS.staging,
  LIBRARY_RELATIVE_PATHS.trash,
  LIBRARY_RELATIVE_PATHS.audit,
] as const;
const INITIALIZATION_ROOT_ITEMS = new Set([
  ".dossiers-initializing.json",
  ".system",
  ".trash",
  "audit",
  "contacts",
  "dossiers",
  "types",
]);

export type WorkspaceLibraryState = "ready" | "blocked" | "migration-required";

export interface WorkspaceLibraryProjection {
  state: WorkspaceLibraryState;
  rootPath: "Dossiers";
  paths: typeof LIBRARY_RELATIVE_PATHS;
  manifest: LibraryManifest | null;
  reason?: string;
}

interface InitializationMarker {
  kind: "hana.dossiers.initialization";
  schemaVersion: 1;
  libraryId: string;
  createdAt: string;
}

function isInitializationMarker(value: unknown): value is InitializationMarker {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const marker = value as Record<string, unknown>;
  return marker.kind === "hana.dossiers.initialization"
    && marker.schemaVersion === 1
    && isStableId(marker.libraryId, "lib")
    && typeof marker.createdAt === "string"
    && Number.isFinite(Date.parse(marker.createdAt));
}

export interface OpenWorkspaceLibraryInput {
  resources: WorkspaceResources;
  workspaceRoot: WorkspaceTreeRef;
  now?: () => string;
  createId?: () => string;
}

function ref(input: OpenWorkspaceLibraryInput, relativePath: string): WorkspaceTreeRef {
  return appendResourcePath(input.workspaceRoot, relativePath);
}

function blocked(reason: string): WorkspaceLibraryProjection {
  return {
    state: "blocked",
    rootPath: "Dossiers",
    paths: LIBRARY_RELATIVE_PATHS,
    manifest: null,
    reason,
  };
}

async function readText(resources: WorkspaceResources, target: WorkspaceTreeRef): Promise<string> {
  const result = await resources.read(target);
  return new TextDecoder().decode(result.content);
}

async function ensureDirectory(input: OpenWorkspaceLibraryInput, relativePath: string): Promise<void> {
  const target = ref(input, relativePath);
  const stat = await input.resources.stat(target);
  if (!stat.exists) await input.resources.mkdir(target);
  else if (!stat.isDirectory) throw new Error(`Expected directory at ${relativePath}`);
}

async function hasCompleteLibraryStructure(input: OpenWorkspaceLibraryInput): Promise<boolean> {
  for (const directory of INITIALIZATION_DIRECTORIES) {
    const stat = await input.resources.stat(ref(input, directory));
    if (!stat.exists || !stat.isDirectory) return false;
  }
  return true;
}

async function initializeLibrary(
  input: OpenWorkspaceLibraryInput,
  existingMarker?: InitializationMarker,
): Promise<WorkspaceLibraryProjection> {
  const now = input.now?.() ?? new Date().toISOString();
  const marker: InitializationMarker = existingMarker ?? {
    kind: "hana.dossiers.initialization",
    schemaVersion: 1,
    libraryId: input.createId?.() ?? createStableId("lib"),
    createdAt: now,
  };
  const markerRef = ref(input, INITIALIZATION_MARKER);
  if (!existingMarker) await input.resources.write(markerRef, serializeJson(marker));
  for (const directory of INITIALIZATION_DIRECTORIES) {
    await ensureDirectory(input, directory);
  }
  const manifest = createLibraryManifest({ libraryId: marker.libraryId, now: marker.createdAt });
  await input.resources.write(ref(input, LIBRARY_RELATIVE_PATHS.manifest), serializeJson(manifest));
  try {
    await input.resources.delete(markerRef);
  } catch {
    // The manifest is authoritative; a leftover initialization marker is harmless and retryable.
  }
  return {
    state: "ready",
    rootPath: "Dossiers",
    paths: LIBRARY_RELATIVE_PATHS,
    manifest,
  };
}

async function openWorkspaceLibraryUnsafe(
  input: OpenWorkspaceLibraryInput,
): Promise<WorkspaceLibraryProjection> {
  const rootRef = ref(input, "Dossiers");
  const rootStat = await input.resources.stat(rootRef);
  if (!rootStat.exists) {
    try {
      await input.resources.mkdir(rootRef);
      return await initializeLibrary(input);
    } catch {
      return blocked("initialization-failed");
    }
  }
  if (!rootStat.isDirectory) {
    return { state: "blocked", rootPath: "Dossiers", paths: LIBRARY_RELATIVE_PATHS, manifest: null, reason: "root-not-directory" };
  }

  const listing = await input.resources.list(rootRef);
  if (listing.items.length === 0) {
    try {
      return await initializeLibrary(input);
    } catch {
      return blocked("initialization-failed");
    }
  }

  const manifestRef = ref(input, LIBRARY_RELATIVE_PATHS.manifest);
  const manifestStat = await input.resources.stat(manifestRef);
  if (manifestStat.exists && !manifestStat.isDirectory) {
    const parsed = parseLibraryManifest(await readText(input.resources, manifestRef));
    if (parsed.ok === false) {
      return { state: "blocked", rootPath: "Dossiers", paths: LIBRARY_RELATIVE_PATHS, manifest: null, reason: parsed.reason };
    }
    if (parsed.manifest.schemaVersion < LIBRARY_SCHEMA_VERSION) {
      return { state: "migration-required", rootPath: "Dossiers", paths: LIBRARY_RELATIVE_PATHS, manifest: parsed.manifest, reason: "older-schema" };
    }
    if (parsed.manifest.schemaVersion > LIBRARY_SCHEMA_VERSION || parsed.manifest.kind !== LIBRARY_KIND) {
      return { state: "blocked", rootPath: "Dossiers", paths: LIBRARY_RELATIVE_PATHS, manifest: parsed.manifest, reason: "unsupported-schema" };
    }
    if (!await hasCompleteLibraryStructure(input)) {
      return { state: "blocked", rootPath: "Dossiers", paths: LIBRARY_RELATIVE_PATHS, manifest: parsed.manifest, reason: "incomplete-library" };
    }
    return { state: "ready", rootPath: "Dossiers", paths: LIBRARY_RELATIVE_PATHS, manifest: parsed.manifest };
  }

  const markerRef = ref(input, INITIALIZATION_MARKER);
  const markerStat = await input.resources.stat(markerRef);
  if (markerStat.exists && !markerStat.isDirectory) {
    try {
      const marker: unknown = JSON.parse(await readText(input.resources, markerRef));
      const hasOnlyInitializationItems = listing.items.every((item) => INITIALIZATION_ROOT_ITEMS.has(item.name));
      if (isInitializationMarker(marker) && hasOnlyInitializationItems) {
        try {
          return await initializeLibrary(input, marker);
        } catch {
          return blocked("initialization-failed");
        }
      }
    } catch {
      // Invalid initialization markers are treated as ordinary incompatible content.
    }
  }

  return blocked("incompatible-root");
}

export async function openWorkspaceLibrary(
  input: OpenWorkspaceLibraryInput,
): Promise<WorkspaceLibraryProjection> {
  try {
    return await openWorkspaceLibraryUnsafe(input);
  } catch {
    return blocked("resource-access-denied");
  }
}
