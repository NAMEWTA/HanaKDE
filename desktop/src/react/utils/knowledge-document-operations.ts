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
  if (!current?.diskVersion) {
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
