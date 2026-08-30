import type { HanaResourceRef } from "@hana/plugin-runtime";

export const DOCUMENT_SCHEMA_VERSION = 1 as const;

export interface DocumentCategory {
  id: string;
  name: string;
  builtin: boolean;
}

export interface ManagedDocumentRecord {
  kind: "hana.dossiers.document";
  schemaVersion: number;
  id: string;
  name: string;
  relativePath: string;
  categoryId: string;
  tags: string[];
  size: number;
  sha256: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  extensions: Record<string, unknown>;
}

export interface DocumentSourceInput {
  ref: HanaResourceRef | Record<string, unknown>;
  name?: string;
}

export interface DocumentImportPreviewInput {
  dossierId: string;
  expectedRevision: number;
  categoryId: string;
  sources: DocumentSourceInput[];
  maxBytes?: number;
  maxFiles?: number;
}

export type PreviewAction = "copy" | "reference" | "duplicate";

export interface DocumentPreviewItem {
  itemId: string;
  name: string;
  relativePath: string;
  categoryId: string;
  action: PreviewAction;
  size: number;
  sha256: string;
  duplicateOf?: string;
}

export interface DocumentImportPreview {
  previewId: string;
  dossierId: string;
  expectedRevision: number;
  totalBytes: number;
  copyBytes: number;
  items: DocumentPreviewItem[];
  createdAt: string;
}

export interface DocumentCollection {
  dossierId: string;
  revision: number;
  categories: DocumentCategory[];
  documents: ManagedDocumentRecord[];
}

export const BUILTIN_DOCUMENT_CATEGORIES: readonly DocumentCategory[] = Object.freeze([
  { id: "general", name: "一般资料", builtin: true },
  { id: "contracts", name: "合同", builtin: true },
  { id: "reports", name: "报告", builtin: true },
  { id: "correspondence", name: "往来文件", builtin: true },
]);
