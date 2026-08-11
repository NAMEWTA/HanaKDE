/**
 * Main-scoped renderer adapter for Workspace History.
 *
 * History itself is authoritative in the main process. The renderer receives
 * relative paths and opaque snapshot/version metadata only; current content
 * and writes go through ResourceIO. Snapshot bodies are reconstructed from
 * the server's line-diff contract because the retired snapshot endpoint is
 * deliberately not part of the main-only route.
 */

import { hanaFetch } from '../hooks/use-hana-fetch';

const MAIN_SOURCE = 'main' as const;
const MAX_HISTORY_CONTENT_CHARS = 5 * 1024 * 1024;

export type FileHistoryHealth = 'HEALTHY' | 'DEGRADED' | 'RECONCILING' | 'FAILED';

export interface FileHistoryRequestOptions {
  signal?: AbortSignal;
  /** Test seam for deterministic operation correlation. */
  operationId?: string;
}

export interface FileHistoryFileEntry {
  relPath: string;
  deletedAt: number | null;
  lastCapturedAt: number;
  snapshotCount: number;
}

export type FileHistoryVersionOrigin = 'baseline' | 'event' | 'restore';

export interface FileHistoryVersionEntry {
  id: number;
  capturedAt: number;
  origin: FileHistoryVersionOrigin;
  opContext: string | null;
  rawSize: number;
  versionToken: string | null;
}

export type FileHistoryDiffKind = 'same' | 'added' | 'removed';

export interface FileHistoryDiffLine {
  kind: FileHistoryDiffKind;
  text: string;
}

export interface FileHistorySnapshotContent {
  relPath: string;
  capturedAt: number;
  origin: FileHistoryVersionOrigin;
  content: string;
  versionToken: string | null;
}

export type FileHistoryExpectedVersion = Readonly<{
  mtimeMs?: number;
  size?: number | null;
  sha256?: string;
  etag?: string;
  sequence?: number;
}>;

export interface FileHistoryCurrentContent {
  relPath: string;
  content: string;
  version: FileHistoryExpectedVersion | null;
}

export type FileHistoryRestoreResult =
  | {
    ok: true;
    relPath: string;
    changeType?: 'created' | 'modified';
    version: FileHistoryExpectedVersion | null;
  }
  | {
    ok: false;
    conflict: true;
    relPath: string;
    version: FileHistoryExpectedVersion | null;
  };

export class FileHistoryApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, status: number) {
    super(code);
    this.name = 'FileHistoryApiError';
    this.code = code;
    this.status = status;
  }
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === 'AbortError';
}

function abortedError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError');
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function assertRelativePath(relPath: string): string {
  if (
    typeof relPath !== 'string'
    || relPath.length === 0
    || relPath.startsWith('/')
    || relPath.includes('\\')
    || relPath.split('/').some(part => part === '' || part === '.' || part === '..')
    || /\p{Cc}/u.test(relPath)
    || /^[A-Za-z]:/u.test(relPath)
  ) {
    throw new FileHistoryApiError('invalid_rel_path', 400);
  }
  return relPath;
}

function assertPositiveId(id: number): number {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new FileHistoryApiError('invalid_snapshot_id', 400);
  }
  return id;
}

async function requestJson(
  path: string,
  options: RequestInit = {},
): Promise<{ body: unknown; status: number }> {
  const response = await hanaFetch(path, {
    ...options,
    throwOnHttpError: false,
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok && !(
    response.status === 409
    && isRecord(body)
    && body.ok === false
    && body.conflict === true
  )) {
    const code = isRecord(body) && typeof body.error === 'string'
      ? body.error
      : `http_${response.status}`;
    throw new FileHistoryApiError(code, response.status);
  }
  return { body, status: response.status };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseVersion(value: unknown): FileHistoryExpectedVersion | null {
  if (!isRecord(value)) return null;
  const result: Record<string, number | string | null> = {};
  if (typeof value.mtimeMs === 'number' && Number.isFinite(value.mtimeMs)) result.mtimeMs = value.mtimeMs;
  if (value.size === null || (typeof value.size === 'number' && Number.isFinite(value.size))) result.size = value.size as number | null;
  if (typeof value.sha256 === 'string' && value.sha256.length > 0) result.sha256 = value.sha256;
  if (typeof value.etag === 'string' && value.etag.length > 0) result.etag = value.etag;
  if (typeof value.sequence === 'number' && Number.isFinite(value.sequence)) result.sequence = value.sequence;
  return Object.keys(result).length > 0 ? result : null;
}

function parseFileEntry(value: unknown): FileHistoryFileEntry {
  if (!isRecord(value) || typeof value.relPath !== 'string') {
    throw new FileHistoryApiError('invalid_files_response', 502);
  }
  return {
    relPath: assertRelativePath(value.relPath),
    deletedAt: numberOrNull(value.deletedAt),
    lastCapturedAt: numberOrNull(value.lastCapturedAt) ?? 0,
    snapshotCount: numberOrNull(value.snapshotCount) ?? 0,
  };
}

function parseVersionEntry(value: unknown): FileHistoryVersionEntry {
  if (
    !isRecord(value)
    || !Number.isSafeInteger(value.id)
    || Number(value.id) <= 0
    || typeof value.capturedAt !== 'number'
    || !Number.isFinite(value.capturedAt)
  ) {
    throw new FileHistoryApiError('invalid_versions_response', 502);
  }
  const origin = value.origin === 'baseline' || value.origin === 'event' || value.origin === 'restore'
    ? value.origin
    : null;
  if (!origin) throw new FileHistoryApiError('invalid_versions_response', 502);
  return {
    id: Number(value.id),
    capturedAt: value.capturedAt,
    origin,
    opContext: stringOrNull(value.opContext),
    rawSize: numberOrNull(value.rawSize) ?? 0,
    versionToken: stringOrNull(value.versionToken),
  };
}

function parseDiffLine(value: unknown): FileHistoryDiffLine {
  if (!isRecord(value) || typeof value.text !== 'string') {
    throw new FileHistoryApiError('invalid_diff_response', 502);
  }
  const kind = value.kind === 'unchanged' || value.kind === 'same'
    ? 'same'
    : value.kind === 'added'
      ? 'added'
      : value.kind === 'removed'
        ? 'removed'
        : null;
  if (!kind) throw new FileHistoryApiError('invalid_diff_response', 502);
  return { kind, text: value.text };
}

export async function fetchHistoryFiles(
  options: FileHistoryRequestOptions = {},
): Promise<FileHistoryFileEntry[]> {
  const { body } = await requestJson('/api/file-history/files', {
    method: 'GET',
    signal: options.signal,
  });
  if (!isRecord(body) || !Array.isArray(body.files)) {
    throw new FileHistoryApiError('invalid_files_response', 502);
  }
  return body.files.map(parseFileEntry);
}

export async function fetchHistoryVersions(
  relPath: string,
  options: FileHistoryRequestOptions = {},
): Promise<FileHistoryVersionEntry[]> {
  const safePath = assertRelativePath(relPath);
  const { body } = await requestJson(
    `/api/file-history/versions?relPath=${encodeURIComponent(safePath)}`,
    { method: 'GET', signal: options.signal },
  );
  if (!isRecord(body) || !Array.isArray(body.versions)) {
    throw new FileHistoryApiError('invalid_versions_response', 502);
  }
  return body.versions.map(parseVersionEntry);
}

export async function fetchHistoryDiff(
  snapshotId: number,
  baseSnapshotId?: number,
  options: FileHistoryRequestOptions = {},
): Promise<FileHistoryDiffLine[]> {
  const query = new URLSearchParams({ snapshotId: String(assertPositiveId(snapshotId)) });
  if (baseSnapshotId !== undefined) query.set('baseSnapshotId', String(assertPositiveId(baseSnapshotId)));
  const { body } = await requestJson(`/api/file-history/diff?${query.toString()}`, {
    method: 'GET',
    signal: options.signal,
  });
  if (!isRecord(body) || !Array.isArray(body.diff)) {
    throw new FileHistoryApiError('invalid_diff_response', 502);
  }
  return body.diff.map(parseDiffLine);
}

function splitLines(value: string): string[] {
  return value.match(/[^\n]*\n|[^\n]+$/g) || [];
}

/** Apply the server's complete line diff to the prior snapshot body. */
export function applyHistoryDiff(
  previousContent: string,
  diff: readonly FileHistoryDiffLine[],
): string {
  const previousLines = splitLines(previousContent);
  const output: string[] = [];
  let cursor = 0;
  for (const line of diff) {
    if (line.kind === 'same') {
      if (previousLines[cursor] !== line.text) {
        throw new FileHistoryApiError('invalid_diff_sequence', 502);
      }
      output.push(line.text);
      cursor += 1;
    } else if (line.kind === 'removed') {
      if (previousLines[cursor] === undefined) {
        throw new FileHistoryApiError('invalid_diff_sequence', 502);
      }
      cursor += 1;
    } else {
      output.push(line.text);
    }
  }
  if (cursor !== previousLines.length) throw new FileHistoryApiError('invalid_diff_sequence', 502);
  const result = output.join('');
  if (result.length > MAX_HISTORY_CONTENT_CHARS) throw new FileHistoryApiError('history_content_too_large', 413);
  return result;
}

export async function fetchHistorySnapshot(
  relPath: string,
  snapshotId: number,
  versions: readonly FileHistoryVersionEntry[] = [],
  options: FileHistoryRequestOptions = {},
): Promise<FileHistorySnapshotContent> {
  const safePath = assertRelativePath(relPath);
  const listed = versions.length > 0 ? [...versions] : await fetchHistoryVersions(safePath, options);
  listed.sort((a, b) => a.capturedAt - b.capturedAt || a.id - b.id);
  const targetIndex = listed.findIndex(version => version.id === assertPositiveId(snapshotId));
  if (targetIndex < 0) throw new FileHistoryApiError('snapshot_not_found', 404);

  let content = '';
  for (let index = 0; index <= targetIndex; index += 1) {
    if (options.signal?.aborted) throw options.signal.reason ?? abortedError();
    content = applyHistoryDiff(content, await fetchHistoryDiff(listed[index].id, undefined, options));
  }
  const target = listed[targetIndex];
  return {
    relPath: safePath,
    capturedAt: target.capturedAt,
    origin: target.origin,
    content,
    versionToken: target.versionToken,
  };
}

export async function fetchHistoryCurrent(
  relPath: string,
  options: FileHistoryRequestOptions = {},
): Promise<FileHistoryCurrentContent> {
  const safePath = assertRelativePath(relPath);
  const { body } = await requestJson('/api/resource-io/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: { sourceKey: MAIN_SOURCE, relativePath: safePath },
      encoding: 'utf-8',
    }),
    signal: options.signal,
  });
  if (!isRecord(body) || typeof body.content !== 'string') {
    throw new FileHistoryApiError('invalid_current_response', 502);
  }
  return {
    relPath: safePath,
    content: body.content,
    version: parseVersion(body.version),
  };
}

function operationId(options: FileHistoryRequestOptions): string {
  const value = options.operationId || globalThis.crypto?.randomUUID?.();
  if (
    typeof value !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  ) {
    throw new FileHistoryApiError('invalid_operation_id', 400);
  }
  return value;
}

export async function restoreHistorySnapshot(
  relPath: string,
  content: string,
  expectedVersion: FileHistoryExpectedVersion | null,
  options: FileHistoryRequestOptions = {},
): Promise<FileHistoryRestoreResult> {
  const safePath = assertRelativePath(relPath);
  if (typeof content !== 'string' || content.length > MAX_HISTORY_CONTENT_CHARS) {
    throw new FileHistoryApiError('history_content_too_large', 413);
  }
  const { body } = await requestJson('/api/resource-io/write-expected-version', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: { sourceKey: MAIN_SOURCE, relativePath: safePath },
      content,
      encoding: 'utf-8',
      expectedVersion,
      reason: 'history_restore',
      operationId: operationId(options),
    }),
    signal: options.signal,
  });
  if (!isRecord(body)) throw new FileHistoryApiError('invalid_restore_response', 502);
  if (body.ok === false && body.conflict === true) {
    return {
      ok: false,
      conflict: true,
      relPath: safePath,
      version: parseVersion(body.version),
    };
  }
  if (body.ok !== true) throw new FileHistoryApiError('invalid_restore_response', 502);
  return {
    ok: true,
    relPath: safePath,
    changeType: body.changeType === 'created' || body.changeType === 'modified' ? body.changeType : undefined,
    version: parseVersion(body.version),
  };
}

export function healthFromHistoryError(error: unknown): FileHistoryHealth {
  if (isAbortError(error)) return 'RECONCILING';
  if (error instanceof FileHistoryApiError && error.status === 503) return 'FAILED';
  return 'DEGRADED';
}
