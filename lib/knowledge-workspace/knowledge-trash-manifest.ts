import type { KnowledgeResourceAddress } from '../../shared/knowledge-workspace-contract.ts';

export const KNOWLEDGE_TRASH_MANIFEST_VERSION = 1;
export const KNOWLEDGE_TRASH_RETENTION_DAYS = 30;

export type KnowledgeTrashEntryState = 'pending' | 'trashed' | 'restored' | 'cleaned' | 'failed';

export type KnowledgeTrashManifestEntry = Readonly<{
  entryId: string;
  originalAddress: KnowledgeResourceAddress;
  trashAddress: KnowledgeResourceAddress;
  kind: 'file' | 'directory';
  deletedAt: string;
  state: KnowledgeTrashEntryState;
  errorCode?: string;
}>;

export type KnowledgeTrashManifest = Readonly<{
  schemaVersion: 1;
  batchId: string;
  sourceKey: string;
  deletedAt: string;
  entries: readonly KnowledgeTrashManifestEntry[];
}>;

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function parseKnowledgeTrashManifest(input: unknown): KnowledgeTrashManifest {
  const value = typeof input === 'string' ? parseJson(input) : input;
  if (!isRecord(value) || value.schemaVersion !== 1 || !ID_PATTERN.test(String(value.batchId))) {
    throw invalidManifest();
  }
  const sourceKey = String(value.sourceKey ?? '');
  const deletedAt = validIso(value.deletedAt);
  if (!/^[a-z][a-z0-9-]{0,31}$/u.test(sourceKey) || !Array.isArray(value.entries)) {
    throw invalidManifest();
  }
  const entryIds = new Set<string>();
  const entries = value.entries.map((candidate) => {
    if (!isRecord(candidate) || !ID_PATTERN.test(String(candidate.entryId)) || entryIds.has(String(candidate.entryId))) {
      throw invalidManifest();
    }
    entryIds.add(String(candidate.entryId));
    const originalAddress = parseAddress(candidate.originalAddress, sourceKey, false);
    const trashAddress = parseAddress(candidate.trashAddress, sourceKey, true);
    if (!trashAddress.relativePath.startsWith(`.trash/${String(value.batchId)}/payload/`)) {
      throw invalidManifest();
    }
    const state = candidate.state;
    if (!['pending', 'trashed', 'restored', 'cleaned', 'failed'].includes(String(state))) {
      throw invalidManifest();
    }
    if (!['file', 'directory'].includes(String(candidate.kind))) throw invalidManifest();
    const errorCode = candidate.errorCode;
    if (errorCode !== undefined && (typeof errorCode !== 'string' || !/^[a-z][a-z0-9_]{1,63}$/u.test(errorCode))) {
      throw invalidManifest();
    }
    return Object.freeze({
      entryId: String(candidate.entryId),
      originalAddress,
      trashAddress,
      kind: candidate.kind as 'file' | 'directory',
      deletedAt: validIso(candidate.deletedAt),
      state: state as KnowledgeTrashEntryState,
      ...(errorCode === undefined ? {} : { errorCode: errorCode as string }),
    });
  });
  return Object.freeze({
    schemaVersion: 1 as const,
    batchId: String(value.batchId),
    sourceKey,
    deletedAt,
    entries: Object.freeze(entries),
  });
}

export function serializeKnowledgeTrashManifest(manifest: KnowledgeTrashManifest): string {
  const checked = parseKnowledgeTrashManifest(manifest);
  return `${JSON.stringify(checked, null, 2)}\n`;
}

export function isKnowledgeTrashEntryExpired(entry: KnowledgeTrashManifestEntry, nowMs: number): boolean {
  return nowMs - Date.parse(entry.deletedAt) >= KNOWLEDGE_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1_000;
}

function parseAddress(input: unknown, sourceKey: string, trash: boolean): KnowledgeResourceAddress {
  if (!isRecord(input) || Object.keys(input).some(key => !['sourceKey', 'relativePath'].includes(key))) {
    throw invalidManifest();
  }
  const relativePath = String(input.relativePath ?? '');
  if (input.sourceKey !== sourceKey || !isRelativePath(relativePath) || (!trash && relativePath.startsWith('.trash/'))) {
    throw invalidManifest();
  }
  return Object.freeze({ sourceKey, relativePath });
}

function isRelativePath(value: string): boolean {
  return value.length > 0 && !value.startsWith('/') && !value.endsWith('/')
    && !value.includes('\\') && value.split('/').every(segment => segment && segment !== '.' && segment !== '..' && !/\p{Cc}/u.test(segment));
}
function validIso(input: unknown): string {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(input) || Number.isNaN(Date.parse(input))) {
    throw invalidManifest();
  }
  return input;
}
function parseJson(input: string): unknown {
  try { return JSON.parse(input); } catch { throw invalidManifest(); }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function invalidManifest(): Error {
  return Object.assign(new Error('knowledge trash manifest is invalid'), { code: 'knowledge_operation_precondition_failed' });
}
