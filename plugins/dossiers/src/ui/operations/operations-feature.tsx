import React, { useEffect, useId, useMemo, useRef, useState } from "react";

import type { DocumentImportPreview, ManagedDocumentRecord } from "../../application/documents/models.ts";
import type { ImportInspection } from "../../application/exchange/models.ts";
import type { MigrationPlan } from "../../application/migration/models.ts";
import {
  OperationsUiError,
  type DossierOperationsSnapshot,
  type OperationsClient,
  type OperationsContactSummary,
  type PurgeConfirmationPreview,
  type SuggestionConfirmation,
  type TrashSummary,
} from "./types.ts";
import "./operations.css";

interface ConfirmState {
  title: string;
  confirmLabel: string;
  danger?: boolean;
  disabled?: boolean;
  content: React.ReactNode;
  run(): Promise<void>;
}

function safeMessage(error: unknown): string {
  const code = error instanceof OperationsUiError ? error.code : "unavailable";
  switch (code) {
    case "validation": return "请检查操作范围和输入";
    case "conflict": return "数据已变化，请刷新后重新预检";
    case "cancelled": return "操作已取消";
    case "unsafe_archive": return "档案包未通过安全校验";
    case "recovery_required": return "操作已中断，请进入恢复流程";
    case "unavailable": return "档案服务暂时不可用";
  }
}

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function date(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "未知时间" : parsed.toLocaleDateString("zh-CN");
}

function actionLabel(action: string): string {
  if (action === "copy" || action === "reference") return "复制进档案";
  if (action === "duplicate") return "已存在，不重复复制";
  return "未知操作";
}

function ConfirmDialog({ state, onClose }: { state: ConfirmState; onClose(): void }): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLElement>(null);
  const titleId = useId();

  function keyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape" && !busy) { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])") ?? [])];
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return (
    <div className="operations-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section ref={dialog} className="operations-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={keyDown}>
        <header><h2 id={titleId}>{state.title}</h2></header>
        <div className="operations-modal-body">{state.content}{error && <p className="operations-error" role="alert">{error}</p>}</div>
        <footer>
          <button className="operations-button" type="button" autoFocus onClick={onClose} disabled={busy}>取消</button>
          <button className={`operations-button ${state.danger ? "operations-button-danger" : "operations-button-primary"}`} type="button" disabled={busy || state.disabled} onClick={() => {
            setBusy(true); setError("");
            void state.run().then(onClose).catch((reason: unknown) => { setError(safeMessage(reason)); setBusy(false); });
          }}>{busy ? "处理中" : state.confirmLabel}</button>
        </footer>
      </section>
    </div>
  );
}

function DocumentRows(props: {
  snapshot: DossierOperationsSnapshot;
  categoryDraft: Record<string, string>;
  onCategory(document: ManagedDocumentRecord, categoryId: string): void;
  onTrash(document: ManagedDocumentRecord): void;
}): React.ReactElement {
  const categoryName = new Map(props.snapshot.categories.map((category) => [category.id, category.name]));
  if (props.snapshot.documents.length === 0) return <div className="operations-empty"><strong>尚无资料</strong><span>加入文件后会复制到当前档案</span></div>;
  return <div className="operations-document-list">{props.snapshot.documents.map((document) => (
    <div className="operations-document" key={document.id}>
      <span className="operations-file-icon" aria-hidden="true">□</span>
      <span className="operations-document-main"><strong>{document.name}</strong><small>{bytes(document.size)} · {categoryName.get(document.categoryId) ?? "未知分类"}</small></span>
      <select aria-label={`${document.name}的分类`} value={props.categoryDraft[document.id] ?? document.categoryId} onChange={(event) => props.onCategory(document, event.target.value)}>
        {props.snapshot.categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
      </select>
      <button className="operations-icon-button" type="button" aria-label={`将${document.name}移至回收站`} title="移至回收站" onClick={() => props.onTrash(document)}>×</button>
    </div>
  ))}</div>;
}

export function DossierOperations({ dossierId, client }: { dossierId: string; client: OperationsClient }): React.ReactElement {
  const [snapshot, setSnapshot] = useState<DossierOperationsSnapshot | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"documents" | "contacts" | "suggestions">("documents");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [categoryId, setCategoryId] = useState("general");
  const [categoryDraft, setCategoryDraft] = useState<Record<string, string>>({});
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<OperationsContactSummary[]>([]);
  const [selectedContact, setSelectedContact] = useState("");
  const [role, setRole] = useState("相关联系人");
  const [newContact, setNewContact] = useState({ name: "", organization: "", title: "", role: "相关联系人" });
  const [working, setWorking] = useState("");
  const loadRequest = useRef(0);

  async function load(): Promise<void> {
    const request = ++loadRequest.current;
    setState("loading"); setError("");
    try {
      const value = await client.loadDossierOperations(dossierId);
      if (request !== loadRequest.current) return;
      setSnapshot(value);
      setCategoryId(value.categories[0]?.id ?? "general");
      setState("ready");
    } catch (reason) { if (request === loadRequest.current) { setError(safeMessage(reason)); setState("error"); } }
  }

  useEffect(() => { void load(); return () => { loadRequest.current += 1; }; }, [client, dossierId]);

  async function addDocuments(): Promise<void> {
    if (!snapshot) return;
    setWorking("正在选择资料"); setError("");
    try {
      const sources = await client.pickDocumentSources();
      if (sources.length === 0) { setWorking(""); return; }
      const preview = await client.previewDocumentImport({ dossierId, expectedRevision: snapshot.revision, categoryId, sourceIds: sources.map((source) => source.sourceId) });
      const unknownAction = preview.items.some((item) => !new Set(["copy", "reference", "duplicate"]).has(item.action));
      setConfirm({
        title: "确认复制资料",
        confirmLabel: unknownAction ? "无法提交" : `复制 ${preview.items.filter((item) => item.action !== "duplicate").length} 项`,
        disabled: unknownAction,
        content: <DocumentPreview preview={preview} unknownAction={unknownAction} />,
        run: async () => { await client.commitDocumentImport(preview.previewId, preview.expectedRevision); await load(); },
      });
    } catch (reason) { setError(safeMessage(reason)); }
    finally { setWorking(""); }
  }

  async function previewCategory(document: ManagedDocumentRecord, nextCategoryId: string): Promise<void> {
    if (!snapshot || nextCategoryId === document.categoryId) return;
    setCategoryDraft((current) => ({ ...current, [document.id]: nextCategoryId }));
    try {
      const preview = await client.previewClassification({ dossierId, documentId: document.id, expectedRevision: snapshot.revision, categoryId: nextCategoryId });
      setConfirm({
        title: "确认调整资料分类",
        confirmLabel: "应用分类",
        content: <div className="operations-scope"><strong>{preview.documentName}</strong><span>{preview.movesManagedBytes ? "资料将移动到新的分类目录" : "仅更新分类元数据"}</span></div>,
        run: async () => { await client.commitClassification(preview.previewId, preview.confirmationToken); setCategoryDraft({}); await load(); },
      });
    } catch (reason) { setError(safeMessage(reason)); setCategoryDraft({}); }
  }

  function confirmTrash(document: ManagedDocumentRecord): void {
    if (!snapshot) return;
    setConfirm({
      title: "将资料移至回收站",
      confirmLabel: "移至回收站",
      danger: true,
      content: <div className="operations-scope"><strong>{document.name}</strong><span>可在维护视图中恢复；不会立即永久删除</span></div>,
      run: async () => { await client.trashDocument({ dossierId, documentId: document.id, expectedRevision: snapshot.revision }); await load(); },
    });
  }

  async function linkExisting(): Promise<void> {
    if (!snapshot || !selectedContact || !role.trim()) return;
    setWorking("正在关联联系人"); setError("");
    try { await client.linkContact({ dossierId, contactId: selectedContact, role: role.trim(), expectedRevision: snapshot.revision }); await load(); }
    catch (reason) { setError(safeMessage(reason)); }
    finally { setWorking(""); }
  }

  async function createContact(): Promise<void> {
    if (!snapshot || !newContact.name.trim() || !newContact.role.trim()) { setError("请填写联系人名称和角色"); return; }
    setWorking("正在创建联系人"); setError("");
    try {
      await client.createAndLinkContact({ dossierId, name: newContact.name.trim(), role: newContact.role.trim(), expectedRevision: snapshot.revision, ...(newContact.organization.trim() ? { organization: newContact.organization.trim() } : {}), ...(newContact.title.trim() ? { title: newContact.title.trim() } : {}) });
      setNewContact({ name: "", organization: "", title: "", role: "相关联系人" }); await load();
    } catch (reason) { setError(safeMessage(reason)); }
    finally { setWorking(""); }
  }

  async function toggleModel(enabled: boolean): Promise<void> {
    if (!snapshot) return;
    setWorking("正在更新模型访问"); setError("");
    try { await client.setModelAccess(enabled, snapshot.modelAccess.revision); await load(); }
    catch (reason) { setError(safeMessage(reason)); }
    finally { setWorking(""); }
  }

  async function confirmSuggestion(suggestionId: string): Promise<void> {
    if (!snapshot) return;
    try {
      const preview: SuggestionConfirmation = await client.requestSuggestionConfirmation(suggestionId);
      setConfirm({ title: "确认接受建议", confirmLabel: "接受建议", content: <div className="operations-scope"><strong>{preview.scopeLabel}</strong><span>仅应用上述范围，使用当前档案修订</span></div>, run: async () => { await client.acceptSuggestion(preview.suggestionId, preview.confirmationToken, preview.expectedRevision); await load(); } });
    } catch (reason) { setError(safeMessage(reason)); }
  }

  if (state === "loading" && !snapshot) return <section className="operations-feature"><div className="operations-state" role="status">正在加载操作</div></section>;
  if (state === "error" && !snapshot) return <section className="operations-feature"><div className="operations-state" role="alert"><strong>{error}</strong><button className="operations-button" type="button" onClick={() => void load()}>重试</button></div></section>;
  if (!snapshot) return <section className="operations-feature" />;

  return (
    <section className="operations-feature" aria-label={`${snapshot.dossierName}操作`}>
      <header className="operations-header"><div><h2>档案操作</h2><span>{snapshot.dossierName}</span></div><label className="operations-model-toggle"><input type="checkbox" aria-label="模型访问" checked={snapshot.modelAccess.enabled} onChange={(event) => void toggleModel(event.target.checked)} /><span aria-hidden="true" /><b>模型访问</b></label></header>
      {!snapshot.modelAccess.enabled && <div className="operations-notice" role="status"><strong>资料内容访问已关闭</strong><span>目录、属性和联系人元数据仍可使用</span></div>}
      {(error || working) && <div className={error ? "operations-error-banner" : "operations-progress"} role={error ? "alert" : "status"}>{error || working}</div>}
      <nav className="operations-tabs" aria-label="档案操作分类" role="tablist">
        <button type="button" role="tab" className={tab === "documents" ? "is-active" : ""} aria-selected={tab === "documents"} onClick={() => setTab("documents")}>资料</button>
        <button type="button" role="tab" className={tab === "contacts" ? "is-active" : ""} aria-selected={tab === "contacts"} onClick={() => setTab("contacts")}>联系人</button>
        <button type="button" role="tab" className={tab === "suggestions" ? "is-active" : ""} aria-selected={tab === "suggestions"} onClick={() => setTab("suggestions")}>AI 建议</button>
      </nav>
      <div className="operations-body" role="tabpanel">
        {tab === "documents" && <section className="operations-section"><div className="operations-section-head"><div><h3>受管资料</h3><span>{snapshot.documents.length} 项</span></div><div className="operations-actions"><select aria-label="加入资料的分类" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{snapshot.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><button className="operations-button operations-button-primary" type="button" onClick={() => void addDocuments()}>+ 加入资料</button></div></div><DocumentRows snapshot={snapshot} categoryDraft={categoryDraft} onCategory={(document, category) => void previewCategory(document, category)} onTrash={confirmTrash} /></section>}
        {tab === "contacts" && <section className="operations-section"><div className="operations-section-head"><div><h3>已关联联系人</h3><span>{snapshot.contacts.length} 人</span></div></div><div className="operations-contact-list">{snapshot.contacts.map((relation) => <div className="operations-contact" key={relation.contactId}><span className="operations-avatar" aria-hidden="true">{relation.contact.name.slice(0, 1)}</span><span><strong>{relation.contact.name}</strong><small>{[relation.contact.title, relation.contact.organization].filter(Boolean).join(" · ") || "联系人"}</small></span><em>{relation.role}</em></div>)}</div><div className="operations-form-band"><h3>关联已有联系人</h3><form onSubmit={(event) => { event.preventDefault(); void client.searchContacts(contactQuery).then(setContactResults).catch((reason: unknown) => setError(safeMessage(reason))); }}><input aria-label="搜索联系人" value={contactQuery} onChange={(event) => setContactQuery(event.target.value)} placeholder="按姓名或组织搜索" /><button className="operations-button" type="submit">搜索</button><select aria-label="选择联系人" value={selectedContact} onChange={(event) => setSelectedContact(event.target.value)}><option value="">选择联系人</option>{contactResults.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.organization ? ` · ${contact.organization}` : ""}</option>)}</select><input aria-label="联系人角色" value={role} onChange={(event) => setRole(event.target.value)} /><button className="operations-button operations-button-primary" type="button" onClick={() => void linkExisting()} disabled={!selectedContact}>关联</button></form></div><div className="operations-form-band"><h3>新建联系人</h3><div className="operations-contact-form"><input aria-label="新联系人姓名" value={newContact.name} onChange={(event) => setNewContact({ ...newContact, name: event.target.value })} placeholder="姓名" /><input aria-label="新联系人组织" value={newContact.organization} onChange={(event) => setNewContact({ ...newContact, organization: event.target.value })} placeholder="组织（可选）" /><input aria-label="新联系人职务" value={newContact.title} onChange={(event) => setNewContact({ ...newContact, title: event.target.value })} placeholder="职务（可选）" /><input aria-label="新联系人角色" value={newContact.role} onChange={(event) => setNewContact({ ...newContact, role: event.target.value })} /><button className="operations-button operations-button-primary" type="button" onClick={() => void createContact()}>创建并关联</button></div></div></section>}
        {tab === "suggestions" && <section className="operations-section"><div className="operations-section-head"><div><h3>待审查建议</h3><span>{snapshot.suggestions.length} 项</span></div></div>{snapshot.suggestions.length === 0 ? <div className="operations-empty"><strong>没有待审查建议</strong></div> : <div className="operations-suggestion-list">{snapshot.suggestions.map((suggestion) => <div className="operations-suggestion" key={suggestion.id}><span><strong>{suggestion.summary}</strong><small>{suggestion.action}</small></span>{suggestion.state === "proposed" ? <span className="operations-row-actions"><button className="operations-button" type="button" onClick={() => void client.rejectSuggestion(suggestion.id, suggestion.revision).then(load).catch((reason: unknown) => setError(safeMessage(reason)))}>拒绝</button><button className="operations-button operations-button-primary" type="button" onClick={() => void confirmSuggestion(suggestion.id)}>审查并接受</button></span> : <em>只读状态：{suggestion.state}</em>}</div>)}</div>}</section>}
      </div>
      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
    </section>
  );
}

function DocumentPreview({ preview, unknownAction }: { preview: DocumentImportPreview; unknownAction: boolean }): React.ReactElement {
  return <div className="operations-preview">{unknownAction && <div className="operations-diagnostic" role="alert"><strong>预检包含未知操作</strong><small>已禁用提交，请更新插件后重新预检</small></div>}<div className="operations-preview-summary"><span>{preview.items.length} 项</span><span>{bytes(preview.copyBytes)} 需复制</span></div>{preview.items.map((item) => <div className="operations-preview-row" key={item.itemId}><span><strong>{item.name}</strong><small>{item.relativePath}</small></span><em>{actionLabel(item.action)}</em></div>)}</div>;
}

const KNOWN_COMPATIBILITY = new Set(["ready", "needs-migration", "recoverable", "future-version", "blocked"]);

export function MaintenanceView({ client, dossierId, dossierName }: { client: OperationsClient; dossierId?: string; dossierName?: string }): React.ReactElement {
  const [tab, setTab] = useState<"trash" | "exchange" | "migration">("trash");
  const [trash, setTrash] = useState<TrashSummary[]>([]);
  const [compatibility, setCompatibility] = useState<Awaited<ReturnType<OperationsClient["compatibilityStatus"]>> | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [exportResult, setExportResult] = useState("");
  const loadRequest = useRef(0);

  async function load(): Promise<void> {
    const request = ++loadRequest.current;
    setError("");
    try {
      const [trashItems, compatibilityValue] = await Promise.all([client.listTrash(), client.compatibilityStatus()]);
      if (request !== loadRequest.current) return;
      setTrash(trashItems); setCompatibility(compatibilityValue);
    } catch (reason) { if (request === loadRequest.current) setError(safeMessage(reason)); }
  }
  useEffect(() => { void load(); return () => { loadRequest.current += 1; }; }, [client]);

  async function purge(item: TrashSummary): Promise<void> {
    try {
      const preview: PurgeConfirmationPreview = await client.requestPurgeConfirmation(item.id);
      setConfirm({ title: "永久清理", confirmLabel: "永久清理", danger: true, content: <div className="operations-scope"><strong>{preview.targetLabel}</strong><span>此操作不可撤销，确认有效期至 {date(preview.expiresAt)}</span></div>, run: async () => { await client.purgeTrash(preview.trashId, preview.confirmationToken, preview.expectedRevision); await load(); } });
    } catch (reason) { setError(safeMessage(reason)); }
  }

  async function inspectArchive(): Promise<void> {
    setStatus("正在检查档案包"); setError("");
    try {
      const source = await client.pickImportArchive();
      if (!source) { setStatus(""); return; }
      const inspection: ImportInspection = await client.inspectImport(source.sourceId);
      setConfirm({ title: "确认导入档案", confirmLabel: "导入新档案", content: <div className="operations-import-scope"><strong>{inspection.name}</strong><span>{inspection.documents} 份资料 · {inspection.contacts} 位联系人 · {bytes(inspection.totalBytes)}</span>{inspection.contactConflicts > 0 && <span className="is-warning">{inspection.contactConflicts} 个联系人冲突将生成独立记录</span>}{inspection.typeConflict && <span className="is-warning">类型定义冲突将保留独立快照</span>}</div>, run: async () => { await client.commitImport(inspection.previewId, inspection.confirmationToken); setStatus("档案已导入，目录需要刷新"); } });
    } catch (reason) { setError(safeMessage(reason)); }
    finally { setStatus(""); }
  }

  async function planMigration(): Promise<void> {
    try {
      const plan: MigrationPlan = await client.planMigration();
      setConfirm({ title: "确认迁移档案库", confirmLabel: `迁移到版本 ${plan.toVersion}`, content: <div className="operations-migration-scope"><span><strong>{plan.fileCount}</strong> 个文件</span><span><strong>{plan.authorityFileCount}</strong> 个权威文件</span><span><strong>{bytes(plan.requiredBackupBytes)}</strong> 备份空间</span><small>完整备份通过校验后才会更新权威格式</small></div>, run: async () => { await client.executeMigration(plan.previewId, plan.confirmationToken); await load(); } });
    } catch (reason) { setError(safeMessage(reason)); }
  }

  function confirmRecovery(action: "continue" | "restore"): void {
    setConfirm({ title: action === "continue" ? "继续迁移" : "从备份恢复", confirmLabel: action === "continue" ? "继续迁移" : "恢复旧版本", danger: action === "restore", content: <div className="operations-scope"><strong>{action === "continue" ? "继续已验证的迁移步骤" : "用迁移前备份恢复全部权威文件"}</strong><span>{compatibility?.migrationId ? `迁移记录 ${compatibility.migrationId}` : "当前可恢复迁移"}</span></div>, run: async () => { await client.recoverMigration(action); await load(); } });
  }

  const compatibilityKnown = compatibility ? KNOWN_COMPATIBILITY.has(compatibility.state) : true;
  const trashActive = useMemo(() => trash.filter((item) => item.state !== "purged" && item.state !== "restored"), [trash]);

  return (
    <section className="operations-feature operations-maintenance" aria-label="档案维护">
      <header className="operations-header"><div><h2>档案维护</h2><span>回收、交换与兼容性</span></div></header>
      {(error || status) && <div className={error ? "operations-error-banner" : "operations-progress"} role={error ? "alert" : "status"}>{error || status}</div>}
      <nav className="operations-tabs" aria-label="维护分类" role="tablist"><button type="button" role="tab" aria-selected={tab === "trash"} className={tab === "trash" ? "is-active" : ""} onClick={() => setTab("trash")}>回收站</button><button type="button" role="tab" aria-selected={tab === "exchange"} className={tab === "exchange" ? "is-active" : ""} onClick={() => setTab("exchange")}>导入导出</button><button type="button" role="tab" aria-selected={tab === "migration"} className={tab === "migration" ? "is-active" : ""} onClick={() => setTab("migration")}>迁移恢复</button></nav>
      <div className="operations-body" role="tabpanel">
        {tab === "trash" && <section className="operations-section"><div className="operations-section-head"><div><h3>回收站</h3><span>{trashActive.length} 项</span></div></div>{trashActive.length === 0 ? <div className="operations-empty"><strong>回收站为空</strong></div> : <div className="operations-trash-list">{trashActive.map((item) => <div className="operations-trash" key={item.id}><span><strong>{item.label}</strong><small>{item.targetType === "dossier" ? "档案" : "资料"} · 清理期限 {date(item.expiresAt)}</small>{item.reason && <small className="is-warning">{item.reason}</small>}</span>{item.state === "trashed" ? <span className="operations-row-actions"><button className="operations-button" type="button" onClick={() => void client.restoreTrash(item.id, item.revision).then(load).catch((reason: unknown) => setError(safeMessage(reason)))}>恢复</button><button className="operations-button operations-button-danger-quiet" type="button" disabled={!item.purgeEligible} title={item.purgeEligible ? "永久清理" : "保留期内不可清理"} onClick={() => void purge(item)}>{item.purgeEligible ? "永久清理" : "保留期内"}</button></span> : <em>只读状态：{item.state}</em>}</div>)}</div>}</section>}
        {tab === "exchange" && <section className="operations-section"><div className="operations-section-head"><div><h3>档案包</h3><span>自包含 ZIP</span></div></div><div className="operations-command-band"><span><strong>导出当前档案</strong><small>{dossierName ?? "请先选择档案"}</small></span><button className="operations-button" type="button" disabled={!dossierId} onClick={() => { if (!dossierId) return; setStatus("正在生成档案包"); setError(""); void client.exportDossier(dossierId).then((result) => { setExportResult(`${result.deliveryName} · ${result.fileCount} 个文件 · ${bytes(result.totalBytes)}`); setStatus(""); }).catch((reason: unknown) => { setError(safeMessage(reason)); setStatus(""); }); }}>导出</button></div>{exportResult && <div className="operations-success" role="status">{exportResult}</div>}<div className="operations-command-band"><span><strong>导入档案包</strong><small>先检查结构、路径与校验和，再确认写入</small></span><button className="operations-button operations-button-primary" type="button" onClick={() => void inspectArchive()}>选择并检查</button></div></section>}
        {tab === "migration" && <section className="operations-section"><div className="operations-section-head"><div><h3>工作区兼容性</h3><span>目标版本 {compatibility?.targetVersion ?? 1}</span></div></div>{!compatibility && <div className="operations-state" role="status">正在检查兼容性</div>}{compatibility && !compatibilityKnown && <div className="operations-diagnostic" role="alert"><strong>未知兼容状态</strong><span>{compatibility.state}</span><small>已禁用全部迁移写入，仅保留诊断</small></div>}{compatibility && compatibilityKnown && <div className={`operations-compatibility state-${compatibility.state}`}><span><strong>{compatibility.state === "ready" ? "档案库已兼容" : compatibility.state === "needs-migration" ? "档案库需要迁移" : compatibility.state === "recoverable" ? "检测到未完成迁移" : compatibility.state === "future-version" ? "档案库来自更高版本" : "档案库已阻塞"}</strong><small>{compatibility.reason ?? `当前版本 ${compatibility.currentVersion ?? "未知"}`}</small></span>{compatibility.state === "needs-migration" && <button className="operations-button operations-button-primary" type="button" onClick={() => void planMigration()}>预检迁移</button>}{compatibility.state === "recoverable" && <span className="operations-row-actions"><button className="operations-button" type="button" onClick={() => confirmRecovery("continue")}>继续</button><button className="operations-button operations-button-danger-quiet" type="button" onClick={() => confirmRecovery("restore")}>从备份恢复</button></span>}</div>}</section>}
      </div>
      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
    </section>
  );
}
