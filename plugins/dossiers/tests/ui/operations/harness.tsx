import React from "react";
import { createRoot } from "react-dom/client";

import { DossierOperations, MaintenanceView, type DossierOperationsSnapshot, type OperationsClient } from "../../../src/ui/operations/index.tsx";

const dossierId = "dos_01hzharnessdossier";
const snapshot: DossierOperationsSnapshot = {
  dossierId, dossierName: "广州数据交易所", revision: 7,
  categories: [{ id: "general", name: "一般资料", builtin: true }, { id: "contracts", name: "合同", builtin: true }, { id: "reports", name: "报告", builtin: true }],
  documents: [
    { kind: "hana.dossiers.document", schemaVersion: 1, id: "doc_01hzrule", name: "数据交易规则.pdf", relativePath: "documents/general/数据交易规则.pdf", categoryId: "general", tags: ["制度"], size: 245760, sha256: "a".repeat(64), revision: 2, createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z", extensions: {} },
    { kind: "hana.dossiers.document", schemaVersion: 1, id: "doc_01hzreport", name: "2026 年数据要素市场报告.docx", relativePath: "documents/reports/2026-市场报告.docx", categoryId: "reports", tags: ["报告"], size: 1560576, sha256: "b".repeat(64), revision: 1, createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z", extensions: {} },
    { kind: "hana.dossiers.document", schemaVersion: 1, id: "doc_01hzagreement", name: "南沙数据合作协议.pdf", relativePath: "documents/contracts/南沙数据合作协议.pdf", categoryId: "contracts", tags: ["合同"], size: 860160, sha256: "c".repeat(64), revision: 1, createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z", extensions: {} },
  ],
  contacts: [
    { contactId: "con_01hzzhang", role: "业务联系人", contact: { id: "con_01hzzhang", name: "张三", organization: "广州数据交易所", title: "业务经理" } },
    { contactId: "con_01hzli", role: "合规联系人", contact: { id: "con_01hzli", name: "李四", organization: "南沙数据项目", title: "合规负责人" } },
  ],
  suggestions: [{ id: "sug_01hzclass", action: "update_document", summary: "将市场报告归入报告分类", state: "proposed", revision: 1 }],
  modelAccess: { enabled: false, revision: 3 },
};

const client: OperationsClient = {
  async loadDossierOperations() { return snapshot; },
  async pickDocumentSources() { return [{ sourceId: "source-protocol", displayName: "补充协议.pdf", size: 98304 }, { sourceId: "source-rule", displayName: "数据交易规则.pdf", size: 245760 }]; },
  async previewDocumentImport() { return { previewId: "preview-docs", dossierId, expectedRevision: 7, totalBytes: 344064, copyBytes: 98304, createdAt: "2026-08-30T00:00:00.000Z", items: [{ itemId: "source-protocol", name: "补充协议.pdf", relativePath: "documents/general/补充协议.pdf", categoryId: "general", action: "copy", size: 98304, sha256: "d".repeat(64) }, { itemId: "source-rule", name: "数据交易规则.pdf", relativePath: "documents/general/数据交易规则.pdf", categoryId: "general", action: "duplicate", size: 245760, sha256: "a".repeat(64), duplicateOf: "doc_01hzrule" }] }; },
  async commitDocumentImport() { return { revision: 8 }; },
  async previewClassification(input) { const document = snapshot.documents.find((item) => item.id === input.documentId)!; return { previewId: "preview-class", confirmationToken: "class-token", documentId: document.id, documentName: document.name, fromCategoryId: document.categoryId, toCategoryId: input.categoryId, movesManagedBytes: true, expectedRevision: 7 }; },
  async commitClassification() { return { revision: 8 }; },
  async trashDocument() { return { state: "trashed" }; },
  async searchContacts() { return [{ id: "con_01hzwang", name: "王五", organization: "数据服务机构" }]; },
  async linkContact() { return { revision: 8 }; },
  async createAndLinkContact() { return { revision: 8 }; },
  async setModelAccess(enabled) { return { enabled, revision: 4 }; },
  async requestSuggestionConfirmation() { return { suggestionId: "sug_01hzclass", confirmationToken: "suggest-token", scopeLabel: "市场报告：分类改为报告", expectedRevision: 7 }; },
  async acceptSuggestion() { return { state: "accepted" }; },
  async rejectSuggestion() { return { state: "rejected" }; },
  async listTrash() { return [{ id: "op_01hztrash", targetType: "document", targetId: "doc_01hzold", label: "旧版管理办法.pdf", state: "trashed", deletedAt: "2026-08-15T00:00:00.000Z", expiresAt: "2026-09-14T00:00:00.000Z", revision: 2, purgeEligible: false }]; },
  async restoreTrash() { return { state: "restored" }; },
  async requestPurgeConfirmation() { return { trashId: "op_01hztrash", confirmationToken: "purge-token", targetLabel: "旧版管理办法.pdf", expectedRevision: 2, expiresAt: "2026-08-30T01:00:00.000Z" }; },
  async purgeTrash() { return { state: "purged" }; },
  async exportDossier() { return { dossierId, fileCount: 8, totalBytes: 2768896, deliveryName: "广州数据交易所.dossier.zip" }; },
  async pickImportArchive() { return { sourceId: "archive-1", displayName: "南沙数据项目.zip" }; },
  async inspectImport() { return { previewId: "preview-import", confirmationToken: "import-token", sourceDossierId: "dos_01hzsource", targetDossierId: "dos_01hztarget", name: "南沙数据项目", contacts: 3, documents: 12, totalBytes: 4915200, contactConflicts: 1, typeConflict: true }; },
  async commitImport() { return { previewId: "preview-import", dossierId: "dos_01hztarget", importedContacts: 2, reusedContacts: 1, documents: 12, reindexRequired: true }; },
  async compatibilityStatus() { return { state: "needs-migration", currentVersion: 0, targetVersion: 1, writeAllowed: false, exportAllowed: true, reason: "older-schema" }; },
  async planMigration() { return { previewId: "preview-migration", confirmationToken: "migration-token", fromVersion: 0, toVersion: 1, fileCount: 128, authorityFileCount: 19, totalBytes: 73400320, requiredBackupBytes: 73400320, inventorySha256: "e".repeat(64) }; },
  async executeMigration() { return { migrationId: "mig_01hzharness", state: "ready", migratedFiles: 19, backupRetained: true, reindexRequired: true }; },
  async recoverMigration() { return { migrationId: "mig_01hzharness", state: "ready", migratedFiles: 19, backupRetained: true, reindexRequired: true }; },
};

const view = new URLSearchParams(window.location.search).get("view");
createRoot(document.getElementById("root")!).render(view === "maintenance"
  ? <MaintenanceView client={client} dossierId={dossierId} dossierName="广州数据交易所" />
  : <DossierOperations client={client} dossierId={dossierId} />);
