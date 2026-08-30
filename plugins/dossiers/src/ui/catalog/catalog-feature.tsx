import React, { useEffect, useMemo, useRef, useState } from "react";

import type { FieldValue } from "../../application/catalog/models.ts";
import { CatalogUiError, type CatalogClient, type CatalogDossier, type CatalogField, type CatalogSearchItem, type CatalogType } from "./types.ts";
import "./catalog.css";

export interface CatalogFeatureProps {
  client: CatalogClient;
  initialQuery?: string;
}

interface Draft {
  name: string;
  tags: string;
  fields: Record<string, FieldValue>;
}

interface CreateDraft {
  name: string;
  typeId: string;
  fields: Record<string, FieldValue>;
}

function errorCode(error: unknown): CatalogUiError["code"] {
  return error instanceof CatalogUiError ? error.code : "unavailable";
}

function cleanErrorMessage(code: CatalogUiError["code"]): string {
  switch (code) {
    case "validation": return "请检查标出的字段";
    case "conflict": return "档案已在其他位置更新，当前草稿尚未覆盖";
    case "index_unavailable": return "目录索引暂时不可用";
    case "unavailable": return "档案服务暂时不可用";
  }
}

function draftFrom(dossier: CatalogDossier): Draft {
  return { name: dossier.name, tags: dossier.tags.join(", "), fields: structuredClone(dossier.fields) };
}

function tagsFrom(value: string): string[] {
  return [...new Set(value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))];
}

function emptyValue(field: CatalogField): FieldValue {
  if (field.type === "boolean") return false;
  if (field.type === "number") return 0;
  return "";
}

function FieldControl(props: { field: CatalogField; value: FieldValue | undefined; onChange(value: FieldValue): void; idPrefix: string; disabled?: boolean }): React.ReactElement {
  const { field, onChange, disabled } = props;
  const value = props.value ?? emptyValue(field);
  const common = { id: `${props.idPrefix}-${field.id}`, disabled, "aria-required": field.required };
  if (field.type === "boolean") {
    return (
      <label className="catalog-switch" htmlFor={common.id}>
        <input {...common} type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
        <span aria-hidden="true" />
        <b>{field.label}</b>
      </label>
    );
  }
  if (field.type === "long_text") {
    return <textarea {...common} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} rows={3} />;
  }
  if (field.type === "enum") {
    return (
      <select {...common} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
        <option value="">未设置</option>
        {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }
  const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "url" ? "url" : "text";
  return (
    <input
      {...common}
      type={inputType}
      value={String(value ?? "")}
      onChange={(event) => onChange(field.type === "number" ? Number(event.target.value) : event.target.value)}
    />
  );
}

function TypeFields(props: { type: CatalogType; values: Record<string, FieldValue>; onChange(id: string, value: FieldValue): void; idPrefix: string; fieldErrors?: Record<string, string> }): React.ReactElement {
  if (props.type.fields.length === 0) return <p className="catalog-muted">此模板没有额外属性</p>;
  return (
    <div className="catalog-field-grid">
      {[...props.type.fields].sort((a, b) => a.order - b.order).map((field) => (
        field.type === "boolean"
          ? <div className="catalog-field catalog-field-boolean" key={field.id}><FieldControl idPrefix={props.idPrefix} field={field} value={props.values[field.id]} onChange={(value) => props.onChange(field.id, value)} /><small>{props.fieldErrors?.[field.id]}</small></div>
          : <label className={`catalog-field ${field.type === "long_text" ? "catalog-field-wide" : ""}`} key={field.id} htmlFor={`${props.idPrefix}-${field.id}`}><span>{field.label}{field.required ? " *" : ""}</span><FieldControl idPrefix={props.idPrefix} field={field} value={props.values[field.id]} onChange={(value) => props.onChange(field.id, value)} /><small>{props.fieldErrors?.[field.id]}</small></label>
      ))}
    </div>
  );
}

function DirectoryRow(props: { item: CatalogSearchItem; selected: boolean; onSelect(): void }): React.ReactElement {
  return (
    <button type="button" className={`catalog-row ${props.selected ? "is-selected" : ""}`} onClick={props.onSelect} aria-current={props.selected ? "true" : undefined}>
      <span className="catalog-row-main"><strong>{props.item.name}</strong><span>{props.item.typeName} · {props.item.documentCount} 份资料</span></span>
      <span className="catalog-row-tags">{props.item.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}</span>
    </button>
  );
}

export function CatalogFeature({ client, initialQuery = "" }: CatalogFeatureProps): React.ReactElement {
  const [types, setTypes] = useState<CatalogType[]>([]);
  const [items, setItems] = useState<CatalogSearchItem[]>([]);
  const [query, setQuery] = useState(initialQuery);
  const [typeId, setTypeId] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [directoryState, setDirectoryState] = useState<"loading" | "ready" | "error">("loading");
  const [directoryError, setDirectoryError] = useState("");
  const [stale, setStale] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [detail, setDetail] = useState<CatalogDossier | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveError, setSaveError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft>({ name: "", typeId: "", fields: {} });
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const detailRequest = useRef(0);

  const selectedType = useMemo(() => types.find((type) => type.id === createDraft.typeId) ?? types[0], [createDraft.typeId, types]);

  async function search(cursor?: string, append = false): Promise<void> {
    setDirectoryState("loading");
    setDirectoryError("");
    try {
      const result = await client.search({ query: query.trim(), ...(typeId ? { typeId } : {}), ...(cursor ? { cursor } : {}), limit: 50 });
      setItems((current) => append ? [...current, ...result.items] : result.items);
      setNextCursor(result.nextCursor);
      setStale(result.stale || result.degraded);
      setDirectoryState("ready");
    } catch (error) {
      setDirectoryError(cleanErrorMessage(errorCode(error)));
      setDirectoryState("error");
    }
  }

  useEffect(() => {
    let active = true;
    void Promise.all([client.listTypes(), client.search({ query: initialQuery.trim(), limit: 50 })]).then(([typeResult, searchResult]) => {
      if (!active) return;
      setTypes(typeResult.items);
      setCreateDraft((current) => ({ ...current, typeId: current.typeId || typeResult.items[0]?.id || "" }));
      setItems(searchResult.items);
      setNextCursor(searchResult.nextCursor);
      setStale(searchResult.stale || searchResult.degraded);
      setDirectoryState("ready");
    }).catch((error: unknown) => {
      if (!active) return;
      setDirectoryError(cleanErrorMessage(errorCode(error)));
      setDirectoryState("error");
    });
    return () => { active = false; };
  }, [client, initialQuery]);

  async function openDossier(id: string): Promise<void> {
    const request = ++detailRequest.current;
    setSelectedId(id);
    setMobileDetail(true);
    setDetailLoading(true);
    setDetail(null);
    setDraft(null);
    setSaveError("");
    try {
      const value = await client.getDossier(id);
      if (request !== detailRequest.current) return;
      setDetail(value);
      setDraft(draftFrom(value));
    } catch (error) {
      if (request !== detailRequest.current) return;
      setSaveError(cleanErrorMessage(errorCode(error)));
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  }

  async function save(): Promise<void> {
    if (!detail || !draft || saving) return;
    if (!draft.name.trim()) { setFieldErrors({ name: "请输入档案名称" }); return; }
    setSaving(true);
    setSaveError("");
    setFieldErrors({});
    try {
      const updated = await client.updateDossier(detail.id, detail.revision, { name: draft.name.trim(), tags: tagsFrom(draft.tags), fields: draft.fields });
      setDetail(updated);
      setDraft(draftFrom(updated));
      setItems((current) => current.map((item) => item.dossierId === updated.id ? { ...item, name: updated.name, tags: updated.tags, revision: updated.revision } : item));
    } catch (error) {
      const code = errorCode(error);
      setSaveError(cleanErrorMessage(code));
      if (error instanceof CatalogUiError) setFieldErrors(error.fieldErrors);
    } finally { setSaving(false); }
  }

  async function refreshForComparison(): Promise<void> {
    if (!detail) return;
    setDetailLoading(true);
    try { setDetail(await client.getDossier(detail.id)); }
    catch (error) { setSaveError(cleanErrorMessage(errorCode(error))); }
    finally { setDetailLoading(false); }
  }

  async function create(): Promise<void> {
    if (!selectedType || creating) return;
    if (!createDraft.name.trim()) { setCreateError("请输入档案名称"); return; }
    setCreating(true);
    setCreateError("");
    try {
      const created = await client.createDossier({ name: createDraft.name.trim(), typeId: selectedType.id, fields: createDraft.fields, tags: [] });
      setCreateOpen(false);
      setCreateDraft({ name: "", typeId: selectedType.id, fields: {} });
      await search();
      await openDossier(created.id);
    } catch (error) { setCreateError(cleanErrorMessage(errorCode(error))); }
    finally { setCreating(false); }
  }

  async function rebuild(): Promise<void> {
    setRebuilding(true);
    try { await client.rebuildIndex(); setStale(false); await search(); }
    catch { setDirectoryError("目录索引重建失败"); }
    finally { setRebuilding(false); }
  }

  const knownFields = new Set(detail?.type.fields.map((field) => field.id) ?? []);
  const unknownFields = detail && draft ? Object.entries(draft.fields).filter(([id]) => !knownFields.has(id)) : [];

  return (
    <section className="catalog-feature" aria-label="档案目录">
      <header className="catalog-toolbar">
        <div className="catalog-title"><h1>档案</h1><span>{items.length} 项</span></div>
        <form role="search" className="catalog-search" onSubmit={(event) => { event.preventDefault(); void search(); }}>
          <label className="catalog-search-box"><span aria-hidden="true">⌕</span><input type="search" aria-label="搜索档案元数据" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、属性、联系人或资料元数据" /></label>
          <select aria-label="档案类型筛选" value={typeId} onChange={(event) => setTypeId(event.target.value)}>
            <option value="">全部类型</option>
            {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
          <button className="catalog-icon-button" type="submit" aria-label="应用筛选" title="应用筛选">↻</button>
        </form>
        <button className="catalog-button catalog-button-primary" type="button" aria-label="新建档案" onClick={() => setCreateOpen(true)}><span aria-hidden="true">+</span> 新建档案</button>
      </header>

      {stale && <div className="catalog-notice" role="status"><span><strong>目录索引需要重建</strong><small>当前结果来自权威清单，仍仅搜索元数据</small></span><button type="button" className="catalog-button" onClick={() => void rebuild()} disabled={rebuilding}>{rebuilding ? "重建中" : "重建索引"}</button></div>}

      <div className={`catalog-workspace ${mobileDetail ? "detail-open" : ""}`}>
        <div className="catalog-directory" aria-label="档案列表">
          {directoryState === "loading" && <div className="catalog-state" role="status"><span className="catalog-spinner" />正在加载档案</div>}
          {directoryState === "error" && <div className="catalog-state" role="alert"><strong>{directoryError}</strong><button className="catalog-button" type="button" onClick={() => void search()}>重试</button></div>}
          {directoryState === "ready" && items.length === 0 && <div className="catalog-state"><strong>没有匹配的档案</strong><span>调整元数据搜索或新建档案</span></div>}
          {directoryState === "ready" && items.map((item) => <DirectoryRow key={item.dossierId} item={item} selected={selectedId === item.dossierId} onSelect={() => void openDossier(item.dossierId)} />)}
          {directoryState === "ready" && nextCursor && <button className="catalog-load-more" type="button" onClick={() => void search(nextCursor, true)}>加载更多</button>}
        </div>

        <aside className="catalog-detail" aria-label="档案详情">
          {!selectedId && <div className="catalog-state"><strong>选择一份档案</strong><span>在这里查看属性和联系人摘要</span></div>}
          {selectedId && detailLoading && !detail && <div className="catalog-state" role="status"><span className="catalog-spinner" />正在加载详情</div>}
          {detail && draft && (
            <>
              <div className="catalog-detail-head">
                <button className="catalog-back" type="button" onClick={() => setMobileDetail(false)} aria-label="返回档案列表">←</button>
                <div><h2>{detail.name}</h2><span>{detail.type.name} · 修订 {detail.revision}</span></div>
                <button className="catalog-button catalog-button-primary" type="button" onClick={() => void save()} disabled={saving}>{saving ? "保存中" : "保存档案"}</button>
              </div>
              {saveError && <div className="catalog-conflict" role="alert"><span>{saveError}</span>{saveError.includes("其他位置") && <button type="button" className="catalog-button" onClick={() => void refreshForComparison()}>刷新并比较</button>}</div>}
              <form className="catalog-detail-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
                <label className="catalog-field catalog-field-wide"><span>档案名称</span><input aria-label="档案名称" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /><small>{fieldErrors.name}</small></label>
                <label className="catalog-field catalog-field-wide"><span>标签</span><input aria-label="档案标签" value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="用逗号分隔" /></label>
                <div className="catalog-section-heading"><h3>属性</h3><span>{detail.type.name}</span></div>
                <TypeFields idPrefix="catalog-detail-field" type={detail.type} values={draft.fields} fieldErrors={fieldErrors} onChange={(id, value) => setDraft({ ...draft, fields: { ...draft.fields, [id]: value } })} />
                {unknownFields.length > 0 && <div className="catalog-unknown"><h3>未识别属性</h3>{unknownFields.map(([id, value]) => <label key={id}><span>{id}</span><input readOnly value={String(value ?? "")} /></label>)}</div>}
                <div className="catalog-section-heading"><h3>联系人</h3><span>{detail.contacts.length} 人</span></div>
                <div className="catalog-contact-list">
                  {detail.contacts.length === 0 && <p className="catalog-muted">尚未关联联系人</p>}
                  {detail.contacts.map((relation) => <div className="catalog-contact" key={relation.contactId}><span className="catalog-avatar" aria-hidden="true">{relation.contact.name.slice(0, 1)}</span><span><strong>{relation.contact.name}</strong><small>{[relation.contact.title, relation.contact.organization].filter(Boolean).join(" · ") || "联系人"}</small></span><em>{relation.role}</em></div>)}
                </div>
              </form>
            </>
          )}
        </aside>
      </div>

      {createOpen && <div className="catalog-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}><section className="catalog-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-create-title"><header><h2 id="catalog-create-title">新建档案</h2><button className="catalog-icon-button" type="button" aria-label="关闭新建档案" title="关闭" onClick={() => setCreateOpen(false)}>×</button></header><div className="catalog-modal-body"><label className="catalog-field"><span>档案类型</span><select aria-label="新档案类型" value={selectedType?.id ?? ""} onChange={(event) => setCreateDraft({ name: createDraft.name, typeId: event.target.value, fields: {} })}>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label><label className="catalog-field"><span>档案名称</span><input autoFocus aria-label="新档案名称" value={createDraft.name} onChange={(event) => setCreateDraft({ ...createDraft, name: event.target.value })} /></label>{selectedType && <TypeFields idPrefix="catalog-create-field" type={selectedType} values={createDraft.fields} onChange={(id, value) => setCreateDraft({ ...createDraft, fields: { ...createDraft.fields, [id]: value } })} />}{createError && <p className="catalog-form-error" role="alert">{createError}</p>}</div><footer><button className="catalog-button" type="button" onClick={() => setCreateOpen(false)}>取消</button><button className="catalog-button catalog-button-primary" type="button" onClick={() => void create()} disabled={creating}>{creating ? "创建中" : "创建档案"}</button></footer></section></div>}
    </section>
  );
}
