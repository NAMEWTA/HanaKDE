import {
  TRANSFER_MAX_CHUNK_BYTES,
  transferEntryUnsupported,
} from "../transfer.ts";
import type {
  ResourceExportEntry,
  ResourceExportTreeOptions,
  ResourceProvider,
  ResourceRef,
} from "../types.ts";

export class RequestBodyResourceProvider implements ResourceProvider {
  readonly id = "session_file" as const;
  readonly #fileId: string;
  readonly #body: ReadableStream<Uint8Array> | null;
  readonly #sizeBytes: number;
  #consumed = false;

  constructor(input: {
    fileId: string;
    body: ReadableStream<Uint8Array> | null;
    sizeBytes: number;
  }) {
    if (
      typeof input.fileId !== "string"
      || input.fileId.length === 0
      || !Number.isSafeInteger(input.sizeBytes)
      || input.sizeBytes < 0
    ) {
      throw transferEntryUnsupported("invalid_request_body_resource");
    }
    this.#fileId = input.fileId;
    this.#body = input.body;
    this.#sizeBytes = input.sizeBytes;
  }

  capabilities() {
    return {
      exportTree: true,
    };
  }

  async *exportTree(
    ref: ResourceRef,
    options: ResourceExportTreeOptions = {},
  ): AsyncIterable<ResourceExportEntry> {
    this.#assertRef(ref);
    if (this.#consumed) {
      throw transferEntryUnsupported("request_body_already_consumed");
    }
    this.#consumed = true;
    yield {
      kind: "file",
      path: [],
      sizeBytes: this.#sizeBytes,
      version: { size: this.#sizeBytes },
      body: this.#chunks(options.signal),
    };
  }

  async *#chunks(signal?: AbortSignal): AsyncIterable<Uint8Array> {
    let received = 0;
    if (this.#body) {
      const reader = this.#body.getReader();
      try {
        while (true) {
          throwIfAborted(signal);
          const chunk = await reader.read();
          if (chunk.done) break;
          if (!(chunk.value instanceof Uint8Array)) {
            throw transferEntryUnsupported("invalid_request_body_chunk");
          }
          received += chunk.value.byteLength;
          if (received > this.#sizeBytes) {
            throw transferEntryUnsupported("request_body_size_mismatch");
          }
          for (
            let offset = 0;
            offset < chunk.value.byteLength;
            offset += TRANSFER_MAX_CHUNK_BYTES
          ) {
            yield chunk.value.subarray(
              offset,
              Math.min(
                chunk.value.byteLength,
                offset + TRANSFER_MAX_CHUNK_BYTES,
              ),
            );
          }
        }
      } finally {
        reader.releaseLock();
      }
    }
    if (received !== this.#sizeBytes) {
      throw transferEntryUnsupported("request_body_size_mismatch");
    }
  }

  #assertRef(ref: ResourceRef): void {
    if (
      ref.kind !== "session-file"
      || ref.fileId !== this.#fileId
      || Object.keys(ref).some(field => !["kind", "fileId"].includes(field))
    ) {
      throw transferEntryUnsupported("request_body_resource_mismatch");
    }
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException("Aborted", "AbortError");
}
