/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DossierOperations,
  MaintenanceView,
  type DossierOperationsSnapshot,
  type OperationsClient,
} from "../../../src/ui/operations/index.tsx";

const dossierId = "dos_01hzoperationsdossier";
const documentId = "doc_01hzoperationsdocument";
const snapshot: DossierOperationsSnapshot = {
  dossierId,
  dossierName: "广州数据交易所",
  revision: 7,
  categories: [{ id: "general", name: "一般资料", builtin: true }, { id: "contracts", name: "合同", builtin: true }],
  documents: [{ kind: "hana.dossiers.document", schemaVersion: 1, id: documentId, name: "交易规则.pdf", relativePath: "documents/general/交易规则.pdf", categoryId: "general", tags: ["制度"], size: 4096, sha256: "a".repeat(64), revision: 2, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z", extensions: {} }],
  contacts: [{ contactId: "con_01hzoperationscontact", role: "业务联系人", contact: { id: "con_01hzoperationscontact", name: "张三", organization: "广州数据交易所", title: "业务经理" } }],
  suggestions: [{ id: "sug_01hzoperationssuggestion", action: "update_document", summary: "将交易规则归入合同", state: "proposed", revision: 1 }],
  modelAccess: { enabled: false, revision: 3 },
};

function client(overrides: Partial<OperationsClient> = {}): OperationsClient {
  return {
    loadDossierOperations: vi.fn().mockResolvedValue(snapshot),
    pickDocumentSources: vi.fn().mockResolvedValue([{ sourceId: "source-1", displayName: "补充协议.pdf", size: 2048 }]),
    previewDocumentImport: vi.fn().mockResolvedValue({ previewId: "preview-docs", dossierId, expectedRevision: 7, totalBytes: 2048, copyBytes: 2048, createdAt: "2026-08-30T00:00:00.000Z", items: [{ itemId: "source-1", name: "补充协议.pdf", relativePath: "documents/contracts/补充协议.pdf", categoryId: "contracts", action: "copy", size: 2048, sha256: "b".repeat(64) }] }),
    commitDocumentImport: vi.fn().mockResolvedValue({ revision: 8 }),
    previewClassification: vi.fn().mockResolvedValue({ previewId: "preview-class", confirmationToken: "class-token", documentId, documentName: "交易规则.pdf", fromCategoryId: "general", toCategoryId: "contracts", movesManagedBytes: true, expectedRevision: 7 }),
    commitClassification: vi.fn().mockResolvedValue({ revision: 8 }),
    trashDocument: vi.fn().mockResolvedValue({ state: "trashed" }),
    searchContacts: vi.fn().mockResolvedValue([{ id: "con_01hznewcontact", name: "李四", organization: "南沙项目" }]),
    linkContact: vi.fn().mockResolvedValue({ revision: 8 }),
    createAndLinkContact: vi.fn().mockResolvedValue({ revision: 8 }),
    setModelAccess: vi.fn().mockResolvedValue({ enabled: true, revision: 4 }),
    requestSuggestionConfirmation: vi.fn().mockResolvedValue({ suggestionId: "sug_01hzoperationssuggestion", confirmationToken: "suggest-token", scopeLabel: "交易规则.pdf：分类改为合同", expectedRevision: 7 }),
    acceptSuggestion: vi.fn().mockResolvedValue({ state: "accepted" }),
    rejectSuggestion: vi.fn().mockResolvedValue({ state: "rejected" }),
    listTrash: vi.fn().mockResolvedValue([{ id: "op_01hztrashrecord", targetType: "document", targetId: documentId, label: "旧版规则.pdf", state: "trashed", deletedAt: "2026-07-20T00:00:00.000Z", expiresAt: "2026-08-20T00:00:00.000Z", revision: 2, purgeEligible: true }]),
    restoreTrash: vi.fn().mockResolvedValue({ state: "restored" }),
    requestPurgeConfirmation: vi.fn().mockResolvedValue({ trashId: "op_01hztrashrecord", confirmationToken: "purge-token", targetLabel: "旧版规则.pdf", expectedRevision: 2, expiresAt: "2026-08-30T01:00:00.000Z" }),
    purgeTrash: vi.fn().mockResolvedValue({ state: "purged" }),
    exportDossier: vi.fn().mockResolvedValue({ dossierId, fileCount: 4, totalBytes: 8192, deliveryName: "广州数据交易所.dossier.zip" }),
    pickImportArchive: vi.fn().mockResolvedValue({ sourceId: "archive-1", displayName: "外部档案包.zip" }),
    inspectImport: vi.fn().mockResolvedValue({ previewId: "preview-import", confirmationToken: "import-token", sourceDossierId: dossierId, targetDossierId: "dos_01hzimporttarget", name: "南沙数据项目", contacts: 2, documents: 8, totalBytes: 16384, contactConflicts: 1, typeConflict: false }),
    commitImport: vi.fn().mockResolvedValue({ previewId: "preview-import", dossierId: "dos_01hzimporttarget", importedContacts: 1, reusedContacts: 1, documents: 8, reindexRequired: true }),
    compatibilityStatus: vi.fn().mockResolvedValue({ state: "needs-migration", currentVersion: 0, targetVersion: 1, writeAllowed: false, exportAllowed: true, reason: "older-schema" }),
    planMigration: vi.fn().mockResolvedValue({ previewId: "preview-migration", confirmationToken: "migration-token", fromVersion: 0, toVersion: 1, fileCount: 24, authorityFileCount: 6, totalBytes: 65536, requiredBackupBytes: 65536, inventorySha256: "c".repeat(64) }),
    executeMigration: vi.fn().mockResolvedValue({ migrationId: "mig_01hzoperation", state: "ready", migratedFiles: 6, backupRetained: true, reindexRequired: true }),
    recoverMigration: vi.fn().mockResolvedValue({ migrationId: "mig_01hzoperation", state: "ready", migratedFiles: 6, backupRetained: true, reindexRequired: true }),
    ...overrides,
  };
}

describe("DossierOperations", () => {
  afterEach(() => cleanup());

  it("previews document copies and cancellation sends no commit", async () => {
    const api = client();
    render(<DossierOperations dossierId={dossierId} client={api} />);
    fireEvent.click(await screen.findByRole("button", { name: /加入资料/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("复制进档案");
    expect(api.commitDocumentImport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(api.commitDocumentImport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /加入资料/ }));
    fireEvent.click(await screen.findByRole("button", { name: "复制 1 项" }));
    await waitFor(() => expect(api.commitDocumentImport).toHaveBeenCalledWith("preview-docs", 7));
  });

  it("confirms classification moves and document trash scope before commands", async () => {
    const api = client();
    render(<DossierOperations dossierId={dossierId} client={api} />);
    const category = await screen.findByLabelText("交易规则.pdf的分类");
    fireEvent.change(category, { target: { value: "contracts" } });
    expect(await screen.findByRole("dialog")).toHaveTextContent("移动到新的分类目录");
    expect(api.commitClassification).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "应用分类" }));
    await waitFor(() => expect(api.commitClassification).toHaveBeenCalledWith("preview-class", "class-token"));

    fireEvent.click(screen.getByRole("button", { name: "将交易规则.pdf移至回收站" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("不会立即永久删除");
    fireEvent.click(screen.getByRole("button", { name: "移至回收站" }));
    await waitFor(() => expect(api.trashDocument).toHaveBeenCalledWith({ dossierId, documentId, expectedRevision: 7 }));
  });

  it("keeps metadata visible with model access off and confirms Agent suggestions", async () => {
    const api = client();
    render(<DossierOperations dossierId={dossierId} client={api} />);
    expect(await screen.findByText("资料内容访问已关闭")).toBeInTheDocument();
    expect(screen.getByText("交易规则.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(api.setModelAccess).toHaveBeenCalledWith(true, 3));

    fireEvent.click(screen.getByRole("tab", { name: "AI 建议" }));
    fireEvent.click(screen.getByRole("button", { name: "审查并接受" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("仅应用上述范围");
    expect(api.acceptSuggestion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "接受建议" }));
    await waitFor(() => expect(api.acceptSuggestion).toHaveBeenCalledWith("sug_01hzoperationssuggestion", "suggest-token", 7));
  });

  it("searches and links existing contacts without exposing contact channels", async () => {
    const api = client();
    render(<DossierOperations dossierId={dossierId} client={api} />);
    fireEvent.click(await screen.findByRole("tab", { name: "联系人" }));
    fireEvent.change(screen.getByLabelText("搜索联系人"), { target: { value: "李四" } });
    fireEvent.submit(screen.getByLabelText("搜索联系人").closest("form")!);
    await screen.findByRole("option", { name: /李四/ });
    fireEvent.change(screen.getByLabelText("选择联系人"), { target: { value: "con_01hznewcontact" } });
    fireEvent.change(screen.getByLabelText("联系人角色"), { target: { value: "合规联系人" } });
    fireEvent.click(screen.getByRole("button", { name: "关联" }));
    await waitFor(() => expect(api.linkContact).toHaveBeenCalledWith({ dossierId, contactId: "con_01hznewcontact", role: "合规联系人", expectedRevision: 7 }));
    expect(document.body.textContent).not.toMatch(/@|\+86/);
  });

  it("renders an unknown preview action as read-only and disables commit", async () => {
    const api = client({
      previewDocumentImport: vi.fn().mockResolvedValue({ previewId: "preview-unknown", dossierId, expectedRevision: 7, totalBytes: 1, copyBytes: 1, createdAt: "2026-08-30T00:00:00.000Z", items: [{ itemId: "future", name: "未来资料.bin", relativePath: "documents/general/未来资料.bin", categoryId: "general", action: "future-action", size: 1, sha256: "f".repeat(64) }] } as never),
    });
    render(<DossierOperations dossierId={dossierId} client={api} />);
    fireEvent.click(await screen.findByRole("button", { name: /加入资料/ }));
    expect(await screen.findByText("预检包含未知操作")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "无法提交" })).toBeDisabled();
    expect(api.commitDocumentImport).not.toHaveBeenCalled();
  });
});

describe("MaintenanceView", () => {
  afterEach(() => cleanup());

  it("requires a second confirmation for permanent purge", async () => {
    const api = client();
    render(<MaintenanceView client={api} dossierId={dossierId} dossierName="广州数据交易所" />);
    fireEvent.click(await screen.findByRole("button", { name: "永久清理" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("不可撤销");
    expect(api.purgeTrash).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "永久清理" }));
    await waitFor(() => expect(api.purgeTrash).toHaveBeenCalledWith("op_01hztrashrecord", "purge-token", 2));
  });

  it("does not offer permanent purge before retention eligibility", async () => {
    const api = client({ listTrash: vi.fn().mockResolvedValue([{ id: "op_01hztrashrecord", targetType: "document", targetId: documentId, label: "近期资料.pdf", state: "trashed", deletedAt: "2026-08-20T00:00:00.000Z", expiresAt: "2026-09-20T00:00:00.000Z", revision: 2, purgeEligible: false }]) });
    render(<MaintenanceView client={api} />);
    expect(await screen.findByRole("button", { name: "保留期内" })).toBeDisabled();
    expect(api.requestPurgeConfirmation).not.toHaveBeenCalled();
  });

  it("inspects an archive before import commit and shows conflict scope", async () => {
    const api = client();
    render(<MaintenanceView client={api} dossierId={dossierId} dossierName="广州数据交易所" />);
    fireEvent.click(screen.getByRole("tab", { name: "导入导出" }));
    fireEvent.click(screen.getByRole("button", { name: "选择并检查" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("1 个联系人冲突");
    expect(api.commitImport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "导入新档案" }));
    await waitFor(() => expect(api.commitImport).toHaveBeenCalledWith("preview-import", "import-token"));
  });

  it("confirms a migration plan and fails closed for future or unknown states", async () => {
    const api = client();
    const view = render(<MaintenanceView client={api} />);
    fireEvent.click(screen.getByRole("tab", { name: "迁移恢复" }));
    fireEvent.click(await screen.findByRole("button", { name: "预检迁移" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("24");
    expect(api.executeMigration).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "迁移到版本 1" }));
    await waitFor(() => expect(api.executeMigration).toHaveBeenCalledWith("preview-migration", "migration-token"));

    const future = client({ compatibilityStatus: vi.fn().mockResolvedValue({ state: "future-version", currentVersion: 9, targetVersion: 1, writeAllowed: false, exportAllowed: true }) });
    view.rerender(<MaintenanceView client={future} />);
    expect(await screen.findByText("档案库来自更高版本")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "预检迁移" })).not.toBeInTheDocument();

    const unknown = client({ compatibilityStatus: vi.fn().mockResolvedValue({ state: "mystery", currentVersion: null, targetVersion: 1, writeAllowed: false, exportAllowed: false }) });
    view.rerender(<MaintenanceView client={unknown} />);
    expect(await screen.findByText("未知兼容状态")).toBeInTheDocument();
    expect(screen.getByText("已禁用全部迁移写入，仅保留诊断")).toBeInTheDocument();
  });

  it("offers explicit continue and restore actions for recoverable migration state", async () => {
    const api = client({ compatibilityStatus: vi.fn().mockResolvedValue({ state: "recoverable", currentVersion: 0, targetVersion: 1, writeAllowed: false, exportAllowed: true, migrationId: "mig_01hzoperation" }) });
    render(<MaintenanceView client={api} />);
    fireEvent.click(screen.getByRole("tab", { name: "迁移恢复" }));
    fireEvent.click(await screen.findByRole("button", { name: "从备份恢复" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("恢复全部权威文件");
    expect(api.recoverMigration).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "恢复旧版本" }));
    await waitFor(() => expect(api.recoverMigration).toHaveBeenCalledWith("restore"));
  });
});
