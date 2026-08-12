import type { ResourceOperationContext, ResourceRef } from "../resource-io/types.ts";

export type ExtractFailureReason = "unsupported" | "parse-failed" | "scanned-pdf" | "too-large";

export interface ExtractSuccess {
  ok: true;
  markdown: string;
  format: string;
  warnings: string[];
  extractorVersion: string;
}

export interface ExtractFailure {
  ok: false;
  reason: ExtractFailureReason;
  message: string;
}

export type ExtractResult = ExtractSuccess | ExtractFailure;

export interface DocumentExtractionRequest {
  resource: ResourceRef;
  filenameHint?: string;
  /**
   * Cancellation is checked at ResourceIO boundaries. Native Anydoc conversion
   * runs in an isolated child process; aborting kills and reaps that process
   * before any Materialize lease is released.
   */
  signal?: AbortSignal;
  context?: ResourceOperationContext;
}
