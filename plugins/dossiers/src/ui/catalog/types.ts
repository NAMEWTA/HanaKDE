import type { FieldType, FieldValue } from "../../application/catalog/models.ts";

export interface CatalogField {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  order: number;
  required: boolean;
  options?: string[];
}

export interface CatalogType {
  id: string;
  key: string;
  name: string;
  builtin: boolean;
  fields: CatalogField[];
}

export interface CatalogContactSummary {
  id: string;
  name: string;
  organization?: string;
  title?: string;
}

export interface CatalogDossier {
  id: string;
  name: string;
  typeId: string;
  type: CatalogType;
  fields: Record<string, FieldValue>;
  tags: string[];
  contacts: Array<{ contactId: string; role: string; contact: CatalogContactSummary }>;
  documentCount: number;
  revision: number;
}

export interface CatalogSearchItem {
  dossierId: string;
  name: string;
  typeId?: string;
  typeName: string;
  tags: string[];
  documentCount: number;
  revision: number;
}

export interface CatalogSearchResult {
  items: CatalogSearchItem[];
  nextCursor: string | null;
  stale: boolean;
  degraded: boolean;
}

export interface CatalogClient {
  listTypes(): Promise<{ items: CatalogType[] }>;
  search(input: { query: string; typeId?: string; cursor?: string; limit: number }): Promise<CatalogSearchResult>;
  getDossier(id: string): Promise<CatalogDossier>;
  createDossier(input: { name: string; typeId: string; fields: Record<string, FieldValue>; tags: string[] }): Promise<CatalogDossier>;
  updateDossier(id: string, expectedRevision: number, patch: { name: string; fields: Record<string, FieldValue>; tags: string[] }): Promise<CatalogDossier>;
  rebuildIndex(): Promise<{ status: string }>;
}

export type CatalogUiErrorCode = "validation" | "conflict" | "index_unavailable" | "unavailable";

export class CatalogUiError extends Error {
  readonly code: CatalogUiErrorCode;
  readonly fieldErrors: Record<string, string>;

  constructor(code: CatalogUiErrorCode, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "CatalogUiError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}
