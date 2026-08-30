import type { DocumentCategory, DocumentImportPreview, ManagedDocumentRecord } from "../../application/documents/models.ts";
import type { ImportInspection, ImportResult } from "../../application/exchange/models.ts";
import type { CompatibilityReport, MigrationPlan, MigrationResult } from "../../application/migration/models.ts";

export interface OperationsContactSummary {
  id: string;
  name: string;
  organization?: string;
  title?: string;
}

export interface OperationsContactRelation {
  contactId: string;
  role: string;
  contact: OperationsContactSummary;
}

export interface OperationsSuggestion {
  id: string;
  action: "update_dossier" | "update_document" | "link_contact" | string;
  summary: string;
  state: "proposed" | "failed" | string;
  revision: number;
}

export interface DossierOperationsSnapshot {
  dossierId: string;
  dossierName: string;
  revision: number;
  categories: DocumentCategory[];
  documents: ManagedDocumentRecord[];
  contacts: OperationsContactRelation[];
  suggestions: OperationsSuggestion[];
  modelAccess: { enabled: boolean; revision: number };
}

export interface PickedDocumentSource {
  sourceId: string;
  displayName: string;
  size: number;
}

export interface ClassificationPreview {
  previewId: string;
  confirmationToken: string;
  documentId: string;
  documentName: string;
  fromCategoryId: string;
  toCategoryId: string;
  movesManagedBytes: boolean;
  expectedRevision: number;
}

export interface SuggestionConfirmation {
  suggestionId: string;
  confirmationToken: string;
  scopeLabel: string;
  expectedRevision: number;
}

export interface TrashSummary {
  id: string;
  targetType: "dossier" | "document";
  targetId: string;
  label: string;
  state: "trashed" | "blocked" | string;
  deletedAt: string;
  expiresAt: string;
  revision: number;
  purgeEligible: boolean;
  reason?: string;
}

export interface PurgeConfirmationPreview {
  trashId: string;
  confirmationToken: string;
  targetLabel: string;
  expectedRevision: number;
  expiresAt: string;
}

export interface PickedArchive {
  sourceId: string;
  displayName: string;
}

export interface ExportSummary {
  dossierId: string;
  fileCount: number;
  totalBytes: number;
  deliveryName: string;
}

export interface OperationsClient {
  loadDossierOperations(dossierId: string): Promise<DossierOperationsSnapshot>;
  pickDocumentSources(): Promise<PickedDocumentSource[]>;
  previewDocumentImport(input: { dossierId: string; expectedRevision: number; categoryId: string; sourceIds: string[] }): Promise<DocumentImportPreview>;
  commitDocumentImport(previewId: string, expectedRevision: number): Promise<{ revision: number }>;
  previewClassification(input: { dossierId: string; documentId: string; expectedRevision: number; categoryId: string }): Promise<ClassificationPreview>;
  commitClassification(previewId: string, confirmationToken: string): Promise<{ revision: number }>;
  trashDocument(input: { dossierId: string; documentId: string; expectedRevision: number }): Promise<{ state: "trashed" }>;
  searchContacts(query: string): Promise<OperationsContactSummary[]>;
  linkContact(input: { dossierId: string; contactId: string; role: string; expectedRevision: number }): Promise<{ revision: number }>;
  createAndLinkContact(input: { dossierId: string; name: string; organization?: string; title?: string; role: string; expectedRevision: number }): Promise<{ revision: number }>;
  setModelAccess(enabled: boolean, expectedRevision: number): Promise<{ enabled: boolean; revision: number }>;
  requestSuggestionConfirmation(suggestionId: string): Promise<SuggestionConfirmation>;
  acceptSuggestion(suggestionId: string, confirmationToken: string, expectedRevision: number): Promise<{ state: "accepted" }>;
  rejectSuggestion(suggestionId: string, expectedRevision: number): Promise<{ state: "rejected" }>;
  listTrash(): Promise<TrashSummary[]>;
  restoreTrash(trashId: string, expectedRevision: number): Promise<{ state: "restored" }>;
  requestPurgeConfirmation(trashId: string): Promise<PurgeConfirmationPreview>;
  purgeTrash(trashId: string, confirmationToken: string, expectedRevision: number): Promise<{ state: "purged" }>;
  exportDossier(dossierId: string): Promise<ExportSummary>;
  pickImportArchive(): Promise<PickedArchive | null>;
  inspectImport(sourceId: string): Promise<ImportInspection>;
  commitImport(previewId: string, confirmationToken: string): Promise<ImportResult>;
  compatibilityStatus(): Promise<CompatibilityReport | (Omit<CompatibilityReport, "state"> & { state: string })>;
  planMigration(): Promise<MigrationPlan>;
  executeMigration(previewId: string, confirmationToken: string): Promise<MigrationResult>;
  recoverMigration(action: "continue" | "restore"): Promise<MigrationResult>;
}

export type OperationsUiErrorCode = "validation" | "conflict" | "cancelled" | "unavailable" | "unsafe_archive" | "recovery_required";

export class OperationsUiError extends Error {
  readonly code: OperationsUiErrorCode;
  constructor(code: OperationsUiErrorCode, message: string) {
    super(message);
    this.name = "OperationsUiError";
    this.code = code;
  }
}

export type { CompatibilityReport, DocumentImportPreview, ImportInspection, MigrationPlan };
