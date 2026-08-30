import type { HanaResourceRef } from "@hana/plugin-runtime";

export const EXCHANGE_SCHEMA_VERSION = 1 as const;

export interface ExchangeFileManifest {
  path: string;
  size: number;
  sha256: string;
}

export interface DossierExchangeManifest {
  kind: "hana.dossiers.exchange";
  schemaVersion: number;
  dossierId: string;
  exportedAt: string;
  files: ExchangeFileManifest[];
  extensions: Record<string, unknown>;
}

export interface ExportResult {
  dossierId: string;
  archiveRef: Extract<HanaResourceRef, { kind: "mount" | "local-file" }>;
  fileCount: number;
  totalBytes: number;
  sha256: string;
}

export interface ImportInspection {
  previewId: string;
  confirmationToken: string;
  sourceDossierId: string;
  targetDossierId: string;
  name: string;
  contacts: number;
  documents: number;
  totalBytes: number;
  contactConflicts: number;
  typeConflict: boolean;
}

export interface ImportResult {
  previewId: string;
  dossierId: string;
  importedContacts: number;
  reusedContacts: number;
  documents: number;
  reindexRequired: true;
}
