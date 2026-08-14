import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { Button, CardShell, EmptyState, HanaThemeProvider, Select, Textarea, TextInput } from "@hana/plugin-components";
import { hana } from "@hana/plugin-sdk";
import "@hana/plugin-components/styles.css";

type Locale = "zh-CN" | "zh-TW" | "ja" | "ko" | "en";
type View = "inbox" | "today" | "upcoming" | "all" | "calendar" | "completed" | "trash" | "projects" | "automation" | "review";
type TodoTime = { kind: "date"; date: string } | { kind: "exact"; instant: string; timeZone: string; offsetMinutes: number };
type Todo = { id: string; title: string; notes: string; status: "pending" | "completed"; version: number; deletedAt?: string | null; attentionDate?: string | null; priority?: "low" | "normal" | "high"; projectId?: string | null; tags?: string[]; mode?: string; agentId?: string | null; instructions?: string | null; permissionMode?: string | null; workspaceRef?: string | null };
type Project = { id: string; name: string; version: number; deletedAt: string | null };
type Run = { id: string; todoId: string; occurrenceId: string | null; status: string; summary: string | null; diagnostic: string | null; sessionRef: { sessionId?: string; sessionPath?: string } | null };
type TodoPage = { items: Todo[] };

const copy: Record<Locale, Record<string, string>> = {
  "zh-CN": { title: "Hana Todo", inbox: "收集箱", today: "今天", upcoming: "即将到来", all: "全部", calendar: "日历", completed: "已完成", trash: "回收站", projects: "项目", automation: "自动化", review: "复盘", export: "导出", add: "添加", edit: "编辑", save: "保存", placeholder: "添加一项 Todo", notes: "描述", priority: "优先级", mode: "执行模式", project: "项目", tags: "标签（逗号分隔）", planned: "计划日期", deadline: "截止日期", reminder: "提醒时间", agent: "Agent", instructions: "执行说明", permission: "授权模式", workspace: "工作区引用", empty: "暂无 Todo", trashEmpty: "回收站为空", projectEmpty: "暂无项目", begin: "创建一项 Todo", complete: "完成", reopen: "重新打开", moveTrash: "移入回收站", restore: "恢复", runs: "自动化运行", reviewTitle: "复盘", createLabel: "创建 Todo", titleLabel: "Todo 标题", error: "Todo 请求失败", stale: "显示的是上次成功的数据", retry: "重试", cancel: "取消", copyRef: "复制 Session 引用", createProject: "新建项目", projectName: "项目名称", low: "低", normal: "普通", high: "高", manual: "手动", reminderMode: "提醒", agentMode: "Agent 执行", statusFilter: "状态筛选", allStatuses: "全部状态" },
  "zh-TW": { title: "Hana Todo", inbox: "收件匣", today: "今天", upcoming: "即將到來", all: "全部", calendar: "日曆", completed: "已完成", trash: "垃圾桶", projects: "專案", automation: "自動化", review: "複盤", export: "匯出", add: "新增", edit: "編輯", save: "儲存", placeholder: "新增一項 Todo", notes: "描述", priority: "優先級", mode: "執行模式", project: "專案", tags: "標籤（逗號分隔）", planned: "計畫日期", deadline: "截止日期", reminder: "提醒時間", agent: "Agent", instructions: "執行說明", permission: "授權模式", workspace: "工作區引用", empty: "目前沒有 Todo", trashEmpty: "垃圾桶是空的", projectEmpty: "目前沒有專案", begin: "建立一項 Todo", complete: "完成", reopen: "重新開啟", moveTrash: "移至垃圾桶", restore: "還原", runs: "自動化執行", reviewTitle: "複盤", createLabel: "建立 Todo", titleLabel: "Todo 標題", error: "Todo 請求失敗", stale: "顯示上次成功的資料", retry: "重試", cancel: "取消", copyRef: "複製 Session 引用", createProject: "建立專案", projectName: "專案名稱", low: "低", normal: "普通", high: "高", manual: "手動", reminderMode: "提醒", agentMode: "Agent 執行", statusFilter: "狀態篩選", allStatuses: "全部狀態" },
  ja: { title: "Hana Todo", inbox: "受信箱", today: "今日", upcoming: "近日", all: "すべて", calendar: "カレンダー", completed: "完了", trash: "ゴミ箱", projects: "プロジェクト", automation: "自動化", review: "レビュー", export: "書き出す", add: "追加", edit: "編集", save: "保存", placeholder: "Todoを1件追加", notes: "説明", priority: "優先度", mode: "実行モード", project: "プロジェクト", tags: "タグ（カンマ区切り）", planned: "予定日", deadline: "締切", reminder: "リマインダー", agent: "Agent", instructions: "実行指示", permission: "権限モード", workspace: "ワークスペース参照", empty: "Todoはありません", trashEmpty: "ゴミ箱は空です", projectEmpty: "プロジェクトはありません", begin: "Todoを1件作成", complete: "完了にする", reopen: "再開", moveTrash: "ゴミ箱へ", restore: "復元", runs: "自動化実行", reviewTitle: "レビュー", createLabel: "Todoを作成", titleLabel: "Todoタイトル", error: "Todoリクエストに失敗しました", stale: "前回成功したデータを表示中", retry: "再試行", cancel: "キャンセル", copyRef: "Session参照をコピー", createProject: "プロジェクト作成", projectName: "プロジェクト名", low: "低", normal: "普通", high: "高", manual: "手動", reminderMode: "リマインダー", agentMode: "Agent実行", statusFilter: "状態フィルター", allStatuses: "すべての状態" },
  ko: { title: "Hana Todo", inbox: "받은 편지함", today: "오늘", upcoming: "예정", all: "전체", calendar: "캘린더", completed: "완료", trash: "휴지통", projects: "프로젝트", automation: "자동화", review: "검토", export: "내보내기", add: "추가", edit: "편집", save: "저장", placeholder: "Todo 한 건 추가", notes: "설명", priority: "우선순위", mode: "실행 모드", project: "프로젝트", tags: "태그(쉼표 구분)", planned: "계획 날짜", deadline: "마감일", reminder: "알림 시간", agent: "Agent", instructions: "실행 지침", permission: "권한 모드", workspace: "워크스페이스 참조", empty: "Todo가 없습니다", trashEmpty: "휴지통이 비어 있습니다", projectEmpty: "프로젝트가 없습니다", begin: "Todo 한 건 만들기", complete: "완료", reopen: "다시 열기", moveTrash: "휴지통으로 이동", restore: "복원", runs: "자동화 실행", reviewTitle: "검토", createLabel: "Todo 만들기", titleLabel: "Todo 제목", error: "Todo 요청에 실패했습니다", stale: "마지막 성공 데이터를 표시 중", retry: "재시도", cancel: "취소", copyRef: "Session 참조 복사", createProject: "프로젝트 만들기", projectName: "프로젝트 이름", low: "낮음", normal: "보통", high: "높음", manual: "수동", reminderMode: "알림", agentMode: "Agent 실행", statusFilter: "상태 필터", allStatuses: "모든 상태" },
  en: { title: "Hana Todo", inbox: "Inbox", today: "Today", upcoming: "Upcoming", all: "All", calendar: "Calendar", completed: "Completed", trash: "Trash", projects: "Projects", automation: "Automation", review: "Review", export: "Export", add: "Add", edit: "Edit", save: "Save", placeholder: "Add one Todo", notes: "Description", priority: "Priority", mode: "Execution mode", project: "Project", tags: "Tags (comma separated)", planned: "Planned date", deadline: "Deadline", reminder: "Reminder time", agent: "Agent", instructions: "Instructions", permission: "Permission mode", workspace: "Workspace reference", empty: "No todos yet", trashEmpty: "Trash is empty", projectEmpty: "No projects yet", begin: "Create one Todo", complete: "Complete", reopen: "Reopen", moveTrash: "Move to Trash", restore: "Restore", runs: "Automation runs", reviewTitle: "Review", createLabel: "Create Todo", titleLabel: "Todo title", error: "Todo request failed", stale: "Showing the last successful data", retry: "Retry", cancel: "Cancel", copyRef: "Copy Session reference", createProject: "Create project", projectName: "Project name", low: "Low", normal: "Normal", high: "High", manual: "Manual", reminderMode: "Reminder", agentMode: "Agent execute", statusFilter: "Status filter", allStatuses: "All statuses" },
};

function resolveLocale(): Locale {
  const value = new URLSearchParams(window.location.search).get("hana-locale") || document.documentElement.lang;
  if (value.startsWith("zh-TW")) return "zh-TW";
  if (value.startsWith("ja")) return "ja";
  if (value.startsWith("ko")) return "ko";
  if (value.startsWith("en")) return "en";
  return "zh-CN";
}

function dateValue(value: string): TodoTime | null { return value ? { kind: "date", date: value } : null; }
function exactValue(value: string): TodoTime | null {
  if (!value) return null;
  const date = new Date(value);
  return { kind: "exact", instant: date.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, offsetMinutes: -date.getTimezoneOffset() };
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await hana.api.fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.detail || "Todo request failed");
  return result as T;
}

function TodoPageView() {
  const [locale] = useState<Locale>(resolveLocale);
  const t = copy[locale];
  const [items, setItems] = useState<Todo[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [review, setReview] = useState<Record<string, unknown> | null>(null);
  const [view, setView] = useState<View>("inbox");
  const [filterStatus, setFilterStatus] = useState("");
  const [stale, setStale] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [planned, setPlanned] = useState("");
  const [deadline, setDeadline] = useState("");
  const [reminder, setReminder] = useState("");
  const [mode, setMode] = useState<"manual" | "reminder" | "agent_execute">("manual");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [projectId, setProjectId] = useState("");
  const [tags, setTags] = useState("");
  const [agentId, setAgentId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [permissionMode, setPermissionMode] = useState("");
  const [workspaceRef, setWorkspaceRef] = useState("");
  const [projectName, setProjectName] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    try {
      if (view === "projects") setProjects((await request<{ projects: Project[] }>("api/projects?includeTrash=true")).projects);
      else if (view === "automation") setRuns((await request<{ runs: Run[] }>(`api/automation/runs${filterStatus ? `?status=${encodeURIComponent(filterStatus)}` : ""}`)).runs);
      else if (view === "review") setReview(await request<Record<string, unknown>>("api/review"));
      else setItems((await request<TodoPage>(`api/todos?${view === "trash" ? "includeTrash=true" : `view=${view}`}`)).items);
      setStale(false); setError("");
    } catch (reason) {
      setStale(true); setError(reason instanceof Error ? reason.message : t.error);
    }
  };
  useEffect(() => { hana.ready({ plugin: "todolist" }); }, []);
  useEffect(() => { void load(); }, [view, filterStatus]);
  useEffect(() => { hana.ui.resize({ height: Math.min(900, Math.max(420, 300 + items.length * 60)) }); }, [items.length]);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    try {
      await request("api/todos", { method: "POST", body: JSON.stringify({ title, notes, plannedFor: dateValue(planned), deadline: dateValue(deadline), reminderAt: mode === "reminder" ? exactValue(reminder) : null, mode, priority, projectId: projectId || null, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), agentId: agentId || null, instructions: instructions || null, permissionMode: permissionMode || null, workspaceRef: workspaceRef || null }) });
      setTitle(""); setNotes(""); setPlanned(""); setDeadline(""); setReminder(""); setTags(""); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); }
  };
  const toggle = async (todo: Todo) => { try { await request(`api/todos/${todo.id}/${todo.status === "completed" ? "reopen" : "complete"}`, { method: "POST", body: JSON.stringify({ expectedVersion: todo.version }) }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); } };
  const trash = async (todo: Todo) => { try { await request(`api/todos/${todo.id}`, { method: "DELETE", body: JSON.stringify({ expectedVersion: todo.version }) }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); } };
  const restore = async (todo: Todo) => { try { await request(`api/todos/${todo.id}/restore`, { method: "POST", body: JSON.stringify({ expectedVersion: todo.version }) }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); } };
  const saveTitle = async (todo: Todo) => { if (!editingTitle.trim()) return; try { await request(`api/todos/${todo.id}`, { method: "PATCH", body: JSON.stringify({ expectedVersion: todo.version, title: editingTitle }) }); setEditingId(null); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); } };
  const exportJson = async () => { try { const result = await request<{ content: string; filename: string }>("api/exchange/export"); const url = URL.createObjectURL(new Blob([result.content], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = result.filename; anchor.click(); URL.revokeObjectURL(url); } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); } };
  const runAction = async (run: Run, action: "retry" | "cancel") => { try { await request(`api/automation/runs/${run.id}/${action}`, { method: "POST" }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); } };
  const copyRef = async (run: Run) => { const value = run.sessionRef?.sessionId || run.sessionRef?.sessionPath; if (value) await hana.clipboard.writeText(value); };
  const createProject = async (event: FormEvent) => { event.preventDefault(); if (!projectName.trim()) return; try { await request("api/projects", { method: "POST", body: JSON.stringify({ name: projectName }) }); setProjectName(""); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); } };
  const saveProject = async (project: Project) => { if (!projectName.trim()) return; try { await request(`api/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ name: projectName, expectedVersion: project.version }) }); setProjectName(""); setEditingProjectId(null); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); } };
  const trashProject = async (project: Project) => { try { await request(`api/projects/${project.id}`, { method: "DELETE", body: JSON.stringify({ expectedVersion: project.version }) }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); } };
  const restoreProject = async (project: Project) => { try { await request(`api/projects/${project.id}/restore`, { method: "POST", body: JSON.stringify({ expectedVersion: project.version }) }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); } };
  const labels = useMemo(() => ({ inbox: t.inbox, today: t.today, upcoming: t.upcoming, all: t.all, calendar: t.calendar, completed: t.completed, trash: t.trash, projects: t.projects, automation: t.automation, review: t.review }), [t]);
  const projectOptions = [{ value: "", label: t.project }, ...projects.filter((project) => !project.deletedAt).map((project) => ({ value: project.id, label: project.name }))];
  return <HanaThemeProvider mode="inherit"><CardShell title={t.title}>
    <nav aria-label={t.title} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>{Object.keys(labels).map((candidate) => { const key = candidate as View; return <Button key={key} variant={view === key ? "primary" : "secondary"} size="sm" onClick={() => setView(key)}>{labels[key]}</Button>; })}<Button size="sm" onClick={() => void exportJson()}>{t.export}</Button></nav>
    {stale && <p role="status" aria-live="polite">{t.stale}</p>}
    {error && <p role="alert" aria-live="assertive">{error}</p>}
    {view === "projects" ? <section aria-label={t.projects}><form onSubmit={createProject} style={{ display: "flex", gap: 8, marginBottom: 16 }}><TextInput aria-label={t.projectName} value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder={t.projectName} /><Button type="submit" variant="primary">{t.add}</Button></form>{projects.length === 0 ? <EmptyState title={t.projectEmpty} /> : <ul style={{ listStyle: "none", padding: 0 }}>{projects.map((project) => <li key={project.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--hana-border, #ddd)" }}>{editingProjectId === project.id ? <TextInput autoFocus aria-label={t.projectName} value={projectName} onChange={(event) => setProjectName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveProject(project); } }} /> : <span style={{ flex: 1, textDecoration: project.deletedAt ? "line-through" : undefined }}>{project.name}</span>}{project.deletedAt ? <Button size="sm" onClick={() => void restoreProject(project)}>{t.restore}</Button> : editingProjectId === project.id ? <Button size="sm" variant="primary" onClick={() => void saveProject(project)}>{t.save}</Button> : <><Button size="sm" onClick={() => { setEditingProjectId(project.id); setProjectName(project.name); }}>{t.edit}</Button><Button size="sm" variant="danger" onClick={() => void trashProject(project)}>{t.moveTrash}</Button></>}</li>)}</ul>}</section>
      : view === "automation" ? <section aria-label={t.runs}><Select label={t.statusFilter} value={filterStatus} onChange={setFilterStatus} options={[{ value: "", label: t.allStatuses }, ...["queued", "running", "succeeded", "failed", "needs_action", "cancel_requested", "cancelled"].map((value) => ({ value, label: value }))]} /><ul style={{ listStyle: "none", padding: 0 }}>{runs.length === 0 ? <EmptyState title={t.runs} /> : runs.map((run) => <li key={run.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--hana-border, #ddd)", overflowWrap: "anywhere" }}><strong>{run.id}</strong><span> {run.status}</span>{run.summary && <p>{run.summary}</p>}{run.diagnostic && <p role="status">{run.diagnostic}</p>}{(run.sessionRef?.sessionId || run.sessionRef?.sessionPath) && <Button size="sm" onClick={() => void copyRef(run)}>{t.copyRef}</Button>}<span style={{ display: "flex", gap: 8 }}>{["failed", "needs_action"].includes(run.status) && <Button size="sm" onClick={() => void runAction(run, "retry")}>{t.retry}</Button>}{["queued", "running"].includes(run.status) && <Button size="sm" variant="danger" onClick={() => void runAction(run, "cancel")}>{t.cancel}</Button>}</span></li>)}</ul></section>
      : view === "review" ? <section aria-label={t.reviewTitle}><h2>{t.reviewTitle}</h2>{review && <dl>{Object.entries(review).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? value.length : String(value)}</dd></div>)}</dl>}</section>
      : <><form onSubmit={create} aria-label={t.createLabel} style={{ display: "grid", gap: 8, marginBottom: 16, minWidth: 0 }}><TextInput id="todo-title" label={t.titleLabel} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} required placeholder={t.placeholder} /><Textarea label={t.notes} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={10000} rows={2} /><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}><TextInput type="date" label={t.planned} value={planned} onChange={(event) => setPlanned(event.target.value)} /><TextInput type="date" label={t.deadline} value={deadline} onChange={(event) => setDeadline(event.target.value)} /><Select label={t.priority} value={priority} onChange={(value) => setPriority(value as typeof priority)} options={[{ value: "low", label: t.low }, { value: "normal", label: t.normal }, { value: "high", label: t.high }]} /><Select label={t.mode} value={mode} onChange={(value) => setMode(value as typeof mode)} options={[{ value: "manual", label: t.manual }, { value: "reminder", label: t.reminderMode }, { value: "agent_execute", label: t.agentMode }]} /><Select label={t.project} value={projectId} onChange={setProjectId} options={projectOptions} /></div><TextInput label={t.tags} value={tags} onChange={(event) => setTags(event.target.value)} /><>{mode === "reminder" && <TextInput type="datetime-local" label={t.reminder} value={reminder} onChange={(event) => setReminder(event.target.value)} />}{mode === "agent_execute" && <div style={{ display: "grid", gap: 8 }}><TextInput label={t.agent} value={agentId} onChange={(event) => setAgentId(event.target.value)} /><Textarea label={t.instructions} value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={2} /><TextInput label={t.permission} value={permissionMode} onChange={(event) => setPermissionMode(event.target.value)} /><TextInput label={t.workspace} value={workspaceRef} onChange={(event) => setWorkspaceRef(event.target.value)} /></div>}</><Button type="submit" variant="primary">{t.add}</Button></form>{items.length === 0 ? <EmptyState title={view === "trash" ? t.trashEmpty : t.empty} description={t.begin} /> : <ul aria-label={t.title} style={{ listStyle: "none", padding: 0, margin: 0 }}>{items.map((todo) => <li key={todo.id} data-todo-id={todo.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--hana-border, #ddd)", minWidth: 0 }}>{view !== "trash" && <input type="checkbox" checked={todo.status === "completed"} onChange={() => void toggle(todo)} aria-label={`${todo.status === "completed" ? t.reopen : t.complete}: ${todo.title}`} />}{editingId === todo.id ? <TextInput autoFocus value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} onBlur={() => void saveTitle(todo)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveTitle(todo); } }} aria-label={t.titleLabel} /> : <span style={{ flex: 1, overflowWrap: "anywhere", textDecoration: todo.status === "completed" ? "line-through" : undefined }}>{todo.title}</span>}{todo.attentionDate && <time dateTime={todo.attentionDate}>{todo.attentionDate}</time>}{view === "trash" ? <Button size="sm" onClick={() => void restore(todo)}>{t.restore}</Button> : <>{editingId !== todo.id && <Button size="sm" onClick={() => { setEditingId(todo.id); setEditingTitle(todo.title); }}>{t.edit}</Button>}<Button size="sm" variant="danger" onClick={() => void trash(todo)}>{t.moveTrash}</Button></>}</li>)}</ul>}</>}
  </CardShell></HanaThemeProvider>;
}

createRoot(document.getElementById("root")!).render(<TodoPageView />);
