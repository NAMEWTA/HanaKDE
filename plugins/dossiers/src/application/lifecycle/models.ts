import type { ManagedDocumentRecord } from "../documents/models.ts";

export interface LifecycleInvocation {
  actorId: string;
  sessionId: string;
  source: "agent-tool" | "user-action";
}

export interface PurgeConfirmation {
  tokenHash: string;
  actorId: string;
  sessionId: string;
  targetRevision: number;
  expiresAt: string;
}

export interface TrashRecord {
  kind: "hana.dossiers.trash-record";
  schemaVersion: 1;
  id: string;
  targetType: "dossier" | "document";
  targetId: string;
  dossierId: string;
  originalRelativePath: string;
  trashRelativePath: string;
  document?: ManagedDocumentRecord;
  documentIndex?: number;
  state: "trashing" | "trashed" | "restoring" | "restored" | "purging" | "purged";
  revision: number;
  deletedAt: string;
  expiresAt: string;
  updatedAt: string;
  actor: LifecycleInvocation;
  expectedEntityRevision?: number;
  transitionActor?: LifecycleInvocation;
  transitionAuditId?: string;
  restoreExpectedDossierRevision?: number;
  reason?: string;
  confirmation?: PurgeConfirmation;
  purgeAuditId?: string;
  extensions: Record<string, unknown>;
}

export interface TrashCatalog {
  kind: "hana.dossiers.trash-catalog";
  schemaVersion: 1;
  revision: number;
  records: TrashRecord[];
  createdAt: string;
  updatedAt: string;
  extensions: Record<string, unknown>;
}

export type AuditRetention = "ordinary" | "permanent";

export interface AuditEvent {
  kind: "hana.dossiers.audit-event";
  schemaVersion: 1;
  id: string;
  action: string;
  targetType: "dossier" | "document" | "contact" | "audit" | "security" | "migration";
  targetId?: string;
  result: "succeeded" | "rejected";
  reason?: string;
  retention: AuditRetention;
  actor: LifecycleInvocation;
  occurredAt: string;
  extensions: Record<string, unknown>;
}
