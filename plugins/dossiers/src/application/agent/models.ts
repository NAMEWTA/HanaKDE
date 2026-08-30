export interface AgentInvocation {
  actorId: string;
  sessionId: string;
  source: "agent-tool" | "user-action";
}

export type SuggestionAction = "update_dossier" | "update_document" | "link_contact";
export type SuggestionState = "proposed" | "applying" | "accepted" | "rejected" | "failed";

export interface SuggestionRecord {
  id: string;
  action: SuggestionAction;
  dossierId: string;
  documentId?: string;
  contactId?: string;
  role?: string;
  patch?: Record<string, unknown>;
  expectedEntityRevision: number;
  actorId: string;
  sessionId: string;
  tokenHash: string;
  state: SuggestionState;
  revision: number;
  resultRevision?: number;
  createdAt: string;
  updatedAt: string;
  extensions: Record<string, unknown>;
}

export interface SuggestionCatalog {
  kind: "hana.dossiers.suggestion-catalog";
  schemaVersion: 1;
  revision: number;
  suggestions: SuggestionRecord[];
  createdAt: string;
  updatedAt: string;
  extensions: Record<string, unknown>;
}

export interface ModelAccessRecord {
  kind: "hana.dossiers.model-access";
  schemaVersion: 1;
  revision: number;
  enabled: boolean;
  updatedBy?: AgentInvocation;
  createdAt: string;
  updatedAt: string;
  extensions: Record<string, unknown>;
}

export type SuggestionInput =
  | { action: "update_dossier"; dossierId: string; expectedEntityRevision: number; patch: Record<string, unknown> }
  | { action: "update_document"; dossierId: string; documentId: string; expectedEntityRevision: number; patch: { categoryId?: string; tags?: string[] } }
  | { action: "link_contact"; dossierId: string; contactId: string; role: string; expectedEntityRevision: number };
