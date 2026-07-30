import {
  KNOWLEDGE_MARKDOWN_MAX_BYTES,
} from '../components/preview/MarkdownEditorSurface';
import type {
  KnowledgeResourceAddress,
} from '../../../../shared/knowledge-workspace-contract.ts';
import type {
  KnowledgeWorkspaceClient,
  RendererResourceVersion,
} from '../services/knowledge-workspace-client';
import {
  knowledgeDocumentKey,
  type KnowledgeDocumentRegistry,
  type KnowledgeDocumentSaveError,
  type KnowledgeExternalDocumentSnapshot,
} from '../stores/knowledge-document-registry';
import {
  decodeKnowledgeMarkdownFile,
  encodeKnowledgeMarkdownFile,
} from './knowledge-markdown-file';

export type KnowledgeDocumentReadFailureReason =
  | 'missing'
  | 'notFile'
  | 'sizeUnavailable'
  | 'tooLarge'
  | 'invalidEncoding'
  | 'invalid_base64'
  | 'invalid_utf8'
  | 'content_too_large'
  | 'changedWhileOpening'
  | 'versionUnavailable'
  | 'loadError';

export class KnowledgeDocumentReadError extends Error {
  readonly reason: KnowledgeDocumentReadFailureReason;

  constructor(reason: KnowledgeDocumentReadFailureReason) {
    super(reason);
    this.name = 'KnowledgeDocumentReadError';
    this.reason = reason;
  }
}

export interface SaveKnowledgeDocumentInput {
  registry: KnowledgeDocumentRegistry;
  address: KnowledgeResourceAddress;
  client: KnowledgeWorkspaceClient;
  onSaved?: (
    address: KnowledgeResourceAddress,
    version: RendererResourceVersion,
  ) => void;
  signal?: AbortSignal;
}

export type SaveKnowledgeDocumentResult =
  | { ok: true }
  | { ok: false; conflict?: true };

const pendingDocumentCreates = new WeakMap<
  KnowledgeDocumentRegistry,
  Map<string, Promise<SaveKnowledgeDocumentResult>>
>();

export interface CreateKnowledgeOrphanDocumentInput {
  registry: KnowledgeDocumentRegistry;
  from: KnowledgeResourceAddress;
  to: KnowledgeResourceAddress;
  client: KnowledgeWorkspaceClient;
  signal?: AbortSignal;
}

export type CreateKnowledgeOrphanDocumentResult =
  | { ok: true; version: RendererResourceVersion }
  | { ok: false; reason: 'conflict' | 'unavailable' };

function fileNameFromAddress(address: KnowledgeResourceAddress): string {
  return address.relativePath.split('/').at(-1) ?? address.relativePath;
}

function reportSaveError(
  registry: KnowledgeDocumentRegistry,
  address: KnowledgeResourceAddress,
  code: KnowledgeDocumentSaveError['code'],
): void {
  registry.getState().reportDocumentSaveError(address, {
    code,
    fileName: fileNameFromAddress(address),
    reason: code === 'conflict'
      ? 'knowledge.document.saveConflict'
      : 'knowledge.document.saveUnavailable',
  });
}

function safeSize(version: RendererResourceVersion | undefined): number | null {
  return Number.isSafeInteger(version?.size) && Number(version?.size) >= 0
    ? Number(version?.size)
    : null;
}

export async function readKnowledgeMarkdownSnapshot(
  client: KnowledgeWorkspaceClient,
  address: KnowledgeResourceAddress,
  options: { signal?: AbortSignal } = {},
): Promise<KnowledgeExternalDocumentSnapshot> {
  const throwIfAborted = () => {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
    }
  };
  let stat;
  try {
    stat = await client.resources.stat(address, options);
  } catch {
    throw new KnowledgeDocumentReadError('loadError');
  }
  throwIfAborted();
  if (!stat.exists) throw new KnowledgeDocumentReadError('missing');
  if (stat.isDirectory) throw new KnowledgeDocumentReadError('notFile');
  const size = safeSize(stat.version);
  if (size === null) throw new KnowledgeDocumentReadError('sizeUnavailable');
  if (size > KNOWLEDGE_MARKDOWN_MAX_BYTES) {
    throw new KnowledgeDocumentReadError('tooLarge');
  }

  let read;
  try {
    read = await client.resources.read(address, {
      encoding: 'base64',
      signal: options.signal,
    });
  } catch {
    throw new KnowledgeDocumentReadError('loadError');
  }
  throwIfAborted();
  if (read.encoding !== 'base64') {
    throw new KnowledgeDocumentReadError('invalidEncoding');
  }
  const decoded = decodeKnowledgeMarkdownFile(read.content);
  if (!decoded.ok) throw new KnowledgeDocumentReadError(decoded.reason);
  const expectedSize = read.version?.size ?? size;
  if (expectedSize !== decoded.byteLength) {
    throw new KnowledgeDocumentReadError('changedWhileOpening');
  }
  const diskVersion = read.version ?? stat.version;
  if (!diskVersion) {
    throw new KnowledgeDocumentReadError('versionUnavailable');
  }
  return {
    buffer: decoded.content,
    diskVersion,
    format: decoded.format,
  };
}

export async function saveKnowledgeDocument({
  registry,
  address,
  client,
  onSaved,
  signal,
}: SaveKnowledgeDocumentInput): Promise<SaveKnowledgeDocumentResult> {
  const key = knowledgeDocumentKey(address);
  const current = registry.getState().sessions[key];
  if (!current || current.orphan) {
    reportSaveError(registry, address, 'unavailable');
    return { ok: false };
  }
  if (current.pendingCreate) {
    let registryCreates = pendingDocumentCreates.get(registry);
    if (!registryCreates) {
      registryCreates = new Map();
      pendingDocumentCreates.set(registry, registryCreates);
    }
    const active = registryCreates.get(key);
    if (active) return active;
    const operation = (async (): Promise<SaveKnowledgeDocumentResult> => {
      const snapshot = registry.getState().sessions[key];
      if (!snapshot?.pendingCreate || snapshot.orphan) {
        return { ok: false };
      }
      const encoded = encodeKnowledgeMarkdownFile(snapshot.buffer, {
        hadBom: false,
        lineEnding: 'lf',
        mixedLineEndings: false,
      });
      if (!encoded.ok) {
        reportSaveError(registry, address, 'unavailable');
        return { ok: false };
      }
      let result;
      try {
        result = await client.resources.writeExpectedVersion(
          address,
          encoded.base64,
          null,
          { encoding: 'base64', signal },
        );
      } catch {
        reportSaveError(registry, address, 'unavailable');
        return { ok: false };
      }
      if (!result.ok) {
        reportSaveError(registry, address, 'conflict');
        return { ok: false, conflict: true };
      }
      if (!result.version) {
        reportSaveError(registry, address, 'unavailable');
        return { ok: false };
      }
      registry.getState().commitSavedDocument(
        address,
        snapshot.buffer,
        result.version,
      );
      try {
        onSaved?.(address, result.version);
      } catch {
        // The disk create already succeeded; projection callbacks are isolated.
      }
      return { ok: true };
    })().finally(() => {
      registryCreates?.delete(key);
    });
    registryCreates.set(key, operation);
    return operation;
  }
  if (!current.diskVersion) {
    reportSaveError(registry, address, 'unavailable');
    return { ok: false };
  }
  if (current.conflict) {
    reportSaveError(registry, address, 'conflict');
    return { ok: false, conflict: true };
  }
  if (!current.dirty && !current.format.mixedLineEndings) {
    registry.getState().clearDocumentSaveError(address);
    return { ok: true };
  }
  const savedBuffer = current.buffer;
  const encoded = encodeKnowledgeMarkdownFile(savedBuffer, current.format);
  if (!encoded.ok) {
    reportSaveError(registry, address, 'unavailable');
    return { ok: false };
  }

  let result;
  try {
    result = await client.resources.writeExpectedVersion(
      address,
      encoded.base64,
      current.diskVersion,
      { encoding: 'base64', signal },
    );
  } catch {
    reportSaveError(registry, address, 'unavailable');
    return { ok: false };
  }
  if (!result.ok) {
    reportSaveError(registry, address, 'conflict');
    try {
      const disk = await readKnowledgeMarkdownSnapshot(
        client,
        address,
        { signal },
      );
      registry.getState().reconcileExternalDocument(address, {
        ...disk,
        diskVersion: result.version ?? disk.diskVersion,
        forceConflict: true,
      });
    } catch {
      // The current buffer and baseline remain intact. A later resource event
      // or explicit retry can obtain the third version without overwriting them.
    }
    return { ok: false, conflict: true };
  }
  if (!result.version) {
    reportSaveError(registry, address, 'unavailable');
    return { ok: false };
  }
  registry.getState().commitSavedDocument(address, savedBuffer, result.version);
  try {
    onSaved?.(address, result.version);
  } catch {
    // The disk write already succeeded; projection callbacks cannot rewrite it
    // into a document-save failure.
  }
  return { ok: true };
}

/**
 * Saves an orphan as a new Page. A null expected version means "the target
 * must not exist", so ordinary create-name conflicts never overwrite data.
 */
export async function createKnowledgeOrphanDocument({
  registry,
  from,
  to,
  client,
  signal,
}: CreateKnowledgeOrphanDocumentInput): Promise<CreateKnowledgeOrphanDocumentResult> {
  const session = registry.getState().sessions[knowledgeDocumentKey(from)];
  if (!session?.orphan || session.resourceState !== 'orphan') {
    return { ok: false, reason: 'unavailable' };
  }
  const fromKey = knowledgeDocumentKey(from);
  const toKey = knowledgeDocumentKey(to);
  if (
    fromKey !== toKey
    && registry.getState().sessions[toKey]
  ) {
    return { ok: false, reason: 'conflict' };
  }
  const encoded = encodeKnowledgeMarkdownFile(session.buffer, {
    hadBom: false,
    lineEnding: 'lf',
    mixedLineEndings: false,
  });
  if (!encoded.ok) return { ok: false, reason: 'unavailable' };
  let result;
  try {
    result = await client.resources.writeExpectedVersion(
      to,
      encoded.base64,
      null,
      { encoding: 'base64', signal },
    );
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (!result.ok) return { ok: false, reason: 'conflict' };
  if (!result.version) return { ok: false, reason: 'unavailable' };
  const rebound = registry.getState().rebindOrphanDocument(
    from,
    to,
    result.version,
  );
  return rebound
    ? { ok: true, version: result.version }
    : { ok: false, reason: 'unavailable' };
}
