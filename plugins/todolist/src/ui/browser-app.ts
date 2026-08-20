// @ts-nocheck
const I18N = {
  "zh-CN": {
    app: "Todo", today: "今天", inbox: "收集箱", upcoming: "即将到来", all: "全部", calendar: "日历",
    automation: "自动化", review: "复盘", completed: "已完成", trash: "废纸篓", projects: "项目",
    addProject: "新建项目", projectName: "项目名称", capture: "快速记录", captureHint: "输入一个手动 Todo",
    add: "添加", search: "搜索 Todo", empty: "这里还没有 Todo", loading: "正在加载…", retry: "重试",
    details: "详情", close: "关闭", title: "标题", description: "说明", priority: "优先级", project: "项目",
    tags: "标签", plannedFor: "计划日期", deadline: "截止日期", mode: "执行方式", manual: "手动",
    reminder: "提醒", agent: "Agent 执行", triggerTime: "触发时间", timezone: "时区", agentLabel: "Agent",
    instructions: "执行说明", permission: "权限模式", workspace: "工作区", pickWorkspace: "选择工作区",
    saving: "正在保存…", saved: "已保存", conflict: "数据已更新，请重新载入", complete: "完成", reopen: "重新打开",
    moveTrash: "移到废纸篓", restore: "恢复", purge: "永久删除", purgeConfirm: "再次确认永久删除",
    export: "导出", import: "导入", preview: "导入预览", commit: "提交导入", cancel: "取消",
    recurrence: "周期", createRecurrence: "创建周期", frequency: "频率", interval: "间隔", daily: "每天",
    weekly: "每周", monthly: "每月", yearly: "每年", afterCompletion: "完成后", pause: "暂停", end: "结束",
    runNow: "立即运行", retryRun: "重试运行", cancelRun: "取消运行", backendReady: "后台就绪",
    backendUnavailable: "后台不可用；手动 CRUD 仍可使用", blocked: "数据存储不可写", status: "状态",
    noProject: "无项目", none: "无", low: "低", medium: "中", high: "高", urgent: "紧急",
    ask: "每次询问", readOnly: "只读", workspaceWrite: "工作区写入", reviewExceptions: "需处理异常",
    overdue: "逾期", nextSevenDays: "未来七天", unscheduled: "未安排", recentlyCompleted: "最近完成",
    importReady: "校验通过，可以提交", importBlocked: "存在阻断问题，不能提交", chooseFile: "选择 JSON 文件",
  },
  "zh-TW": {
    app: "Todo", today: "今天", inbox: "收集匣", upcoming: "即將到來", all: "全部", calendar: "日曆",
    automation: "自動化", review: "複盤", completed: "已完成", trash: "垃圾桶", projects: "專案",
    addProject: "新增專案", projectName: "專案名稱", capture: "快速記錄", captureHint: "輸入一個手動 Todo",
    add: "新增", search: "搜尋 Todo", empty: "這裡還沒有 Todo", loading: "正在載入…", retry: "重試",
    details: "詳情", close: "關閉", title: "標題", description: "說明", priority: "優先級", project: "專案",
    tags: "標籤", plannedFor: "計畫日期", deadline: "截止日期", mode: "執行方式", manual: "手動",
    reminder: "提醒", agent: "Agent 執行", triggerTime: "觸發時間", timezone: "時區", agentLabel: "Agent",
    instructions: "執行說明", permission: "權限模式", workspace: "工作區", pickWorkspace: "選擇工作區",
    saving: "正在儲存…", saved: "已儲存", conflict: "資料已更新，請重新載入", complete: "完成", reopen: "重新開啟",
    moveTrash: "移到垃圾桶", restore: "還原", purge: "永久刪除", purgeConfirm: "再次確認永久刪除",
    export: "匯出", import: "匯入", preview: "匯入預覽", commit: "提交匯入", cancel: "取消",
    recurrence: "週期", createRecurrence: "建立週期", frequency: "頻率", interval: "間隔", daily: "每天",
    weekly: "每週", monthly: "每月", yearly: "每年", afterCompletion: "完成後", pause: "暫停", end: "結束",
    runNow: "立即執行", retryRun: "重試執行", cancelRun: "取消執行", backendReady: "背景就緒",
    backendUnavailable: "背景不可用；手動 CRUD 仍可使用", blocked: "資料儲存不可寫", status: "狀態",
    noProject: "無專案", none: "無", low: "低", medium: "中", high: "高", urgent: "緊急",
    ask: "每次詢問", readOnly: "唯讀", workspaceWrite: "工作區寫入", reviewExceptions: "需處理異常",
    overdue: "逾期", nextSevenDays: "未來七天", unscheduled: "未安排", recentlyCompleted: "最近完成",
    importReady: "驗證通過，可以提交", importBlocked: "存在阻斷問題，不能提交", chooseFile: "選擇 JSON 檔案",
  },
  ja: {
    app: "Todo", today: "今日", inbox: "受信トレイ", upcoming: "予定", all: "すべて", calendar: "カレンダー",
    automation: "自動化", review: "レビュー", completed: "完了", trash: "ゴミ箱", projects: "プロジェクト",
    addProject: "プロジェクト追加", projectName: "プロジェクト名", capture: "クイック追加", captureHint: "手動 Todo を1件入力",
    add: "追加", search: "Todo を検索", empty: "Todo はありません", loading: "読み込み中…", retry: "再試行",
    details: "詳細", close: "閉じる", title: "タイトル", description: "説明", priority: "優先度", project: "プロジェクト",
    tags: "タグ", plannedFor: "予定日", deadline: "期限", mode: "実行モード", manual: "手動",
    reminder: "リマインダー", agent: "Agent 実行", triggerTime: "実行時刻", timezone: "タイムゾーン", agentLabel: "Agent",
    instructions: "実行指示", permission: "権限モード", workspace: "ワークスペース", pickWorkspace: "ワークスペースを選択",
    saving: "保存中…", saved: "保存済み", conflict: "データが更新されました。再読み込みしてください", complete: "完了", reopen: "再開",
    moveTrash: "ゴミ箱へ", restore: "復元", purge: "完全削除", purgeConfirm: "完全削除を確認",
    export: "エクスポート", import: "インポート", preview: "インポート確認", commit: "インポート実行", cancel: "キャンセル",
    recurrence: "繰り返し", createRecurrence: "繰り返し作成", frequency: "頻度", interval: "間隔", daily: "毎日",
    weekly: "毎週", monthly: "毎月", yearly: "毎年", afterCompletion: "完了後", pause: "一時停止", end: "終了",
    runNow: "今すぐ実行", retryRun: "実行を再試行", cancelRun: "実行をキャンセル", backendReady: "バックグラウンド準備完了",
    backendUnavailable: "バックグラウンド利用不可。手動 CRUD は利用可能", blocked: "ストレージは書き込み不可", status: "状態",
    noProject: "プロジェクトなし", none: "なし", low: "低", medium: "中", high: "高", urgent: "緊急",
    ask: "毎回確認", readOnly: "読み取り専用", workspaceWrite: "ワークスペース書き込み", reviewExceptions: "要対応",
    overdue: "期限超過", nextSevenDays: "今後7日", unscheduled: "未設定", recentlyCompleted: "最近完了",
    importReady: "検証済み。実行できます", importBlocked: "問題があるため実行できません", chooseFile: "JSON を選択",
  },
  ko: {
    app: "Todo", today: "오늘", inbox: "받은 편지함", upcoming: "예정", all: "전체", calendar: "캘린더",
    automation: "자동화", review: "리뷰", completed: "완료", trash: "휴지통", projects: "프로젝트",
    addProject: "프로젝트 추가", projectName: "프로젝트 이름", capture: "빠른 추가", captureHint: "수동 Todo 하나 입력",
    add: "추가", search: "Todo 검색", empty: "Todo가 없습니다", loading: "불러오는 중…", retry: "재시도",
    details: "상세", close: "닫기", title: "제목", description: "설명", priority: "우선순위", project: "프로젝트",
    tags: "태그", plannedFor: "예정일", deadline: "마감일", mode: "실행 방식", manual: "수동",
    reminder: "알림", agent: "Agent 실행", triggerTime: "실행 시간", timezone: "시간대", agentLabel: "Agent",
    instructions: "실행 지침", permission: "권한 모드", workspace: "워크스페이스", pickWorkspace: "워크스페이스 선택",
    saving: "저장 중…", saved: "저장됨", conflict: "데이터가 변경되었습니다. 다시 불러오세요", complete: "완료", reopen: "다시 열기",
    moveTrash: "휴지통으로", restore: "복원", purge: "영구 삭제", purgeConfirm: "영구 삭제 확인",
    export: "내보내기", import: "가져오기", preview: "가져오기 미리보기", commit: "가져오기 실행", cancel: "취소",
    recurrence: "반복", createRecurrence: "반복 만들기", frequency: "주기", interval: "간격", daily: "매일",
    weekly: "매주", monthly: "매월", yearly: "매년", afterCompletion: "완료 후", pause: "일시중지", end: "종료",
    runNow: "지금 실행", retryRun: "실행 재시도", cancelRun: "실행 취소", backendReady: "백그라운드 준비됨",
    backendUnavailable: "백그라운드를 사용할 수 없음. 수동 CRUD는 가능", blocked: "저장소에 쓸 수 없음", status: "상태",
    noProject: "프로젝트 없음", none: "없음", low: "낮음", medium: "중간", high: "높음", urgent: "긴급",
    ask: "매번 확인", readOnly: "읽기 전용", workspaceWrite: "워크스페이스 쓰기", reviewExceptions: "처리 필요",
    overdue: "기한 초과", nextSevenDays: "향후 7일", unscheduled: "미정", recentlyCompleted: "최근 완료",
    importReady: "검증 완료, 실행 가능", importBlocked: "차단 문제가 있어 실행할 수 없음", chooseFile: "JSON 파일 선택",
  },
  en: {
    app: "Todo", today: "Today", inbox: "Inbox", upcoming: "Upcoming", all: "All", calendar: "Calendar",
    automation: "Automation", review: "Review", completed: "Completed", trash: "Trash", projects: "Projects",
    addProject: "New project", projectName: "Project name", capture: "Quick capture", captureHint: "Enter one manual Todo",
    add: "Add", search: "Search Todos", empty: "No Todos here", loading: "Loading…", retry: "Retry",
    details: "Details", close: "Close", title: "Title", description: "Description", priority: "Priority", project: "Project",
    tags: "Tags", plannedFor: "Planned date", deadline: "Deadline", mode: "Execution mode", manual: "Manual",
    reminder: "Reminder", agent: "Agent execute", triggerTime: "Trigger time", timezone: "Time zone", agentLabel: "Agent",
    instructions: "Instructions", permission: "Permission mode", workspace: "Workspace", pickWorkspace: "Pick workspace",
    saving: "Saving…", saved: "Saved", conflict: "The data changed. Reload and merge.", complete: "Complete", reopen: "Reopen",
    moveTrash: "Move to Trash", restore: "Restore", purge: "Permanently delete", purgeConfirm: "Confirm permanent deletion",
    export: "Export", import: "Import", preview: "Import preview", commit: "Commit import", cancel: "Cancel",
    recurrence: "Recurrence", createRecurrence: "Create recurrence", frequency: "Frequency", interval: "Interval", daily: "Daily",
    weekly: "Weekly", monthly: "Monthly", yearly: "Yearly", afterCompletion: "After completion", pause: "Pause", end: "End",
    runNow: "Run now", retryRun: "Retry run", cancelRun: "Cancel run", backendReady: "Background ready",
    backendUnavailable: "Background unavailable; manual CRUD still works", blocked: "Store is not writable", status: "Status",
    noProject: "No project", none: "None", low: "Low", medium: "Medium", high: "High", urgent: "Urgent",
    ask: "Ask every time", readOnly: "Read only", workspaceWrite: "Workspace write", reviewExceptions: "Exceptions",
    overdue: "Overdue", nextSevenDays: "Next seven days", unscheduled: "Unscheduled", recentlyCompleted: "Recently completed",
    importReady: "Validated and ready to commit", importBlocked: "Blocking issues prevent commit", chooseFile: "Choose JSON file",
  },
};

export function mountTodoApp(root) {
  if (!root) throw new Error("Todo root element is missing");
  const locale = I18N[document.documentElement.lang] ? document.documentElement.lang : "zh-CN";
  const strings = I18N[locale];
  const t = (key) => strings[key] || I18N.en[key] || key;
  const hana = window.hana || {};
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const state = {
    view: "today", projectId: undefined, status: "initializing", runtime: null, items: [], projects: [], agents: [],
    selectedId: null, draft: null, review: null, loading: true, error: null, search: "", saveState: "", importPreview: null,
    workspaceRef: null, narrowDetail: false,
  };
  let loadGeneration = 0;
  let saveTimer = null;
  let saveChain = Promise.resolve();
  let destroyed = false;
  let resizeObserver = null;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const attr = escapeHtml;
  const datePart = (value) => !value ? "" : value.kind === "date" ? value.date : value.localDateTime?.slice(0, 10) || "";
  const localPart = (trigger) => trigger?.localDateTime?.slice(0, 16) || "";
  const selected = () => state.items.find((item) => item.id === state.selectedId) || state.draft;
  const routeUrl = (route) => new URL(route, window.location.href).toString();

  async function api(route, init = {}) {
    const options = { ...init, headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) } };
    let response;
    if (hana.api && typeof hana.api.fetch === "function") response = await hana.api.fetch(route, options);
    else response = await fetch(routeUrl(route), options);
    if (response && typeof response.json === "function") {
      const value = await response.json();
      if (!response.ok || value?.ok === false) {
        const error = new Error(value?.error?.message || `Request failed (${response.status})`);
        error.payload = value;
        error.status = response.status;
        throw error;
      }
      return value;
    }
    if (response?.ok === false) throw new Error(response?.error?.message || "Request failed");
    return response;
  }

  function notify(message, kind = "info") {
    const toast = root.querySelector("[data-toast]");
    if (!toast) return;
    toast.textContent = message;
    toast.dataset.kind = kind;
    toast.hidden = false;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { toast.hidden = true; }, 4200);
    try { hana.ui?.toast?.({ message, kind }); } catch { /* host toast is optional */ }
  }

  function navItems() {
    return [
      ["today", "◉", t("today")], ["inbox", "⌂", t("inbox")], ["upcoming", "→", t("upcoming")],
      ["all", "≡", t("all")], ["calendar", "▦", t("calendar")], ["automation", "⚙", t("automation")],
      ["review", "◇", t("review")], ["completed", "✓", t("completed")], ["trash", "⌫", t("trash")],
    ];
  }

  function runtimeBanner() {
    if (!state.runtime) return "";
    const store = state.runtime.store || {};
    const runtime = state.runtime.runtime || {};
    if (!store.writable) return `<div class="notice notice-error" role="alert"><strong>${escapeHtml(t("blocked"))}</strong><span>${escapeHtml(store.error || "")}</span></div>`;
    if (runtime.taskBackend === "backend_unavailable") return `<div class="notice notice-warning" role="status"><strong>${escapeHtml(t("backendUnavailable"))}</strong><span>${escapeHtml(runtime.lastReadinessError || "")}</span></div>`;
    return "";
  }

  function sidebar() {
    const nav = navItems().map(([view, icon, label]) => `<button class="nav-item ${state.view === view && !state.projectId ? "is-active" : ""}" data-nav="${view}" type="button"><span aria-hidden="true">${icon}</span><span>${escapeHtml(label)}</span></button>`).join("");
    const projects = state.projects.filter((project) => !project.archivedAt).map((project) => `<button class="nav-item project-item ${state.projectId === project.id ? "is-active" : ""}" data-project="${attr(project.id)}" type="button"><span class="project-dot" aria-hidden="true"></span><span>${escapeHtml(project.name)}</span></button>`).join("");
    return `<aside class="sidebar" aria-label="${attr(t("app"))}">
      <div class="brand"><span class="brand-mark" aria-hidden="true">✓</span><span>${escapeHtml(t("app"))}</span></div>
      <nav class="nav-stack">${nav}</nav>
      <section class="project-block"><div class="section-label"><span>${escapeHtml(t("projects"))}</span></div>${projects || `<p class="sidebar-empty">${escapeHtml(t("empty"))}</p>`}
        <form class="project-create" data-project-create><input name="name" maxlength="240" placeholder="${attr(t("projectName"))}" aria-label="${attr(t("projectName"))}"><button type="submit" title="${attr(t("addProject"))}">＋</button></form>
      </section>
    </aside>`;
  }

  function captureBar() {
    if (["completed", "trash", "review", "automation"].includes(state.view)) return "";
    const projectOptions = [`<option value="">${escapeHtml(t("noProject"))}</option>`, ...state.projects.filter((project) => !project.archivedAt).map((project) => `<option value="${attr(project.id)}" ${state.projectId === project.id ? "selected" : ""}>${escapeHtml(project.name)}</option>`)].join("");
    return `<form class="capture" data-capture>
      <label class="sr-only" for="capture-title">${escapeHtml(t("capture"))}</label>
      <input id="capture-title" name="title" type="text" maxlength="240" autocomplete="off" placeholder="${attr(t("captureHint"))}" required>
      <select name="projectId" aria-label="${attr(t("project"))}">${projectOptions}</select>
      <button class="button button-primary" type="submit">${escapeHtml(t("add"))}</button>
    </form>`;
  }

  function toolbar() {
    const title = state.projectId ? state.projects.find((project) => project.id === state.projectId)?.name || t("projects") : t(state.view);
    return `<header class="content-header"><div><h1>${escapeHtml(title)}</h1><p class="view-summary">${state.items.length} Todo</p></div><div class="header-actions">
      <label class="search"><span aria-hidden="true">⌕</span><input data-search value="${attr(state.search)}" placeholder="${attr(t("search"))}"></label>
      <button type="button" class="button button-quiet" data-export>${escapeHtml(t("export"))}</button>
      <button type="button" class="button button-quiet" data-import>${escapeHtml(t("import"))}</button>
      <input type="file" accept="application/json,.json" data-import-file hidden>
    </div></header>`;
  }

  function statusBadge(todo) {
    const run = todo.latestRun;
    const reminder = todo.activeReminder;
    if (run) return `<span class="badge badge-${attr(run.status)}">${escapeHtml(run.status.replaceAll("_", " "))}</span>`;
    if (reminder) return `<span class="badge badge-${attr(reminder.status)}">${escapeHtml(reminder.status.replaceAll("_", " "))}</span>`;
    return `<span class="badge badge-${attr(todo.mode)}">${escapeHtml(todo.mode === "manual" ? t("manual") : todo.mode === "reminder" ? t("reminder") : t("agent"))}</span>`;
  }

  function todoCard(todo) {
    const completed = todo.status === "completed";
    const archived = Boolean(todo.archivedAt);
    const date = todo.attentionDate || datePart(todo.plannedFor) || datePart(todo.deadline);
    const reasons = (todo.reasons || []).slice(0, 2).map((reason) => `<span>${escapeHtml(reason.label)}${reason.date ? ` · ${escapeHtml(reason.date)}` : ""}</span>`).join("");
    return `<article class="todo-row ${state.selectedId === todo.id ? "is-selected" : ""} ${completed ? "is-completed" : ""}" data-todo-id="${attr(todo.id)}">
      <button class="check-button ${completed ? "completed" : ""}" data-toggle-complete="${attr(todo.id)}" type="button" aria-label="${attr(completed ? t("reopen") : t("complete"))}" ${archived ? "disabled" : ""}><span>${completed ? "✓" : ""}</span></button>
      <button class="todo-open" data-open-todo="${attr(todo.id)}" type="button"><span class="todo-title">${escapeHtml(todo.title)}</span><span class="todo-meta">${date ? `<time>${escapeHtml(date)}</time>` : ""}${reasons}${todo.project ? `<span>${escapeHtml(todo.project.name)}</span>` : ""}</span></button>
      <div class="todo-end"><span class="priority priority-${attr(todo.priority)}" title="${attr(t(todo.priority))}"></span>${statusBadge(todo)}</div>
    </article>`;
  }

  function listPanel() {
    if (state.loading) return `<div class="state-panel"><div class="spinner" aria-hidden="true"></div><p>${escapeHtml(t("loading"))}</p></div>`;
    if (state.error) return `<div class="state-panel state-error"><p>${escapeHtml(state.error)}</p><button class="button" type="button" data-reload>${escapeHtml(t("retry"))}</button></div>`;
    if (!state.items.length) return `<div class="state-panel"><div class="empty-mark" aria-hidden="true">✓</div><p>${escapeHtml(t("empty"))}</p></div>`;
    return `<div class="todo-list" role="list">${state.items.map(todoCard).join("")}</div>`;
  }

  function projectOptions(selectedId) {
    return [`<option value="">${escapeHtml(t("noProject"))}</option>`, ...state.projects.filter((project) => !project.archivedAt).map((project) => `<option value="${attr(project.id)}" ${selectedId === project.id ? "selected" : ""}>${escapeHtml(project.name)}</option>`)].join("");
  }

  function agentOptions(selectedId) {
    return [`<option value="">—</option>`, ...state.agents.map((agent) => `<option value="${attr(agent.id)}" ${selectedId === agent.id ? "selected" : ""}>${escapeHtml(agent.name || agent.id)}</option>`)].join("");
  }

  function automationFields(todo) {
    if (todo.mode === "reminder") return `<fieldset class="field-group"><legend>${escapeHtml(t("reminder"))}</legend>
      <label><span>${escapeHtml(t("triggerTime"))}</span><input data-field="reminderLocal" type="datetime-local" value="${attr(localPart(todo.reminderTrigger))}" required></label>
      <label><span>${escapeHtml(t("timezone"))}</span><input data-field="timeZone" value="${attr(todo.reminderTrigger?.timeZone || timezone)}" required></label>
    </fieldset>`;
    if (todo.mode === "agent_execute") {
      const workspace = state.workspaceRef || todo.workspaceRef;
      return `<fieldset class="field-group"><legend>${escapeHtml(t("agent"))}</legend>
        <label><span>${escapeHtml(t("triggerTime"))}</span><input data-field="agentLocal" type="datetime-local" value="${attr(localPart(todo.agentTrigger))}" required></label>
        <label><span>${escapeHtml(t("timezone"))}</span><input data-field="timeZone" value="${attr(todo.agentTrigger?.timeZone || timezone)}" required></label>
        <label><span>${escapeHtml(t("agentLabel"))}</span><select data-field="agentId" required>${agentOptions(todo.agentId)}</select></label>
        <label class="span-2"><span>${escapeHtml(t("instructions"))}</span><textarea data-field="instructions" rows="5" maxlength="12000" required>${escapeHtml(todo.instructions || "")}</textarea></label>
        <label><span>${escapeHtml(t("permission"))}</span><select data-field="permissionMode"><option value="ask" ${todo.permissionMode === "ask" ? "selected" : ""}>${escapeHtml(t("ask"))}</option><option value="read_only" ${todo.permissionMode === "read_only" ? "selected" : ""}>${escapeHtml(t("readOnly"))}</option><option value="workspace_write" ${todo.permissionMode === "workspace_write" ? "selected" : ""}>${escapeHtml(t("workspaceWrite"))}</option></select></label>
        <div class="workspace-field"><span>${escapeHtml(t("workspace"))}</span><code>${escapeHtml(workspace ? resourceLabel(workspace) : "—")}</code><button class="button button-quiet" type="button" data-pick-workspace>${escapeHtml(t("pickWorkspace"))}</button></div>
      </fieldset>`;
    }
    return "";
  }

  function resourceLabel(ref) {
    if (!ref || typeof ref !== "object") return "";
    for (const key of ["label", "displayName", "name", "resourceId", "id", "uri", "mountId", "sessionId"]) {
      const value = ref[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    return typeof ref.scheme === "string" ? ref.scheme : typeof ref.kind === "string" ? ref.kind : "Hana Resource";
  }

  function recurrencePanel(todo) {
    if (todo.occurrenceMeta) return `<section class="subpanel"><div class="subpanel-title"><h3>${escapeHtml(t("recurrence"))}</h3><span class="badge">${escapeHtml(todo.occurrenceMeta.nominalLocalDate)}</span></div><p class="muted">${escapeHtml(todo.occurrenceMeta.recurrenceKey)}</p><div class="button-row"><button class="button button-quiet" data-skip-occurrence type="button">${escapeHtml(t("moveTrash"))}</button></div></section>`;
    if (todo.recurrenceSeriesId) return "";
    return `<details class="subpanel recurrence-editor"><summary>${escapeHtml(t("createRecurrence"))}</summary><form data-recurrence-create>
      <label><span>${escapeHtml(t("frequency"))}</span><select name="frequency"><option value="daily">${escapeHtml(t("daily"))}</option><option value="weekly">${escapeHtml(t("weekly"))}</option><option value="monthly">${escapeHtml(t("monthly"))}</option><option value="yearly">${escapeHtml(t("yearly"))}</option><option value="after_completion">${escapeHtml(t("afterCompletion"))}</option></select></label>
      <label><span>${escapeHtml(t("interval"))}</span><input name="interval" type="number" min="1" max="999" value="1"></label>
      <button class="button" type="submit">${escapeHtml(t("createRecurrence"))}</button>
    </form></details>`;
  }

  function runPanel(todo) {
    const run = todo.latestRun;
    if (!run) return "";
    const actions = [];
    if (["scheduled", "pending_registration"].includes(run.status)) actions.push(`<button class="button" type="button" data-run-start="${attr(run.id)}">${escapeHtml(t("runNow"))}</button>`);
    if (["failed", "needs_action", "cancelled"].includes(run.status)) actions.push(`<button class="button" type="button" data-run-retry="${attr(run.id)}">${escapeHtml(t("retryRun"))}</button>`);
    if (["scheduled", "pending_registration", "running"].includes(run.status)) actions.push(`<button class="button button-danger-quiet" type="button" data-run-cancel="${attr(run.id)}">${escapeHtml(t("cancelRun"))}</button>`);
    return `<section class="subpanel"><div class="subpanel-title"><h3>${escapeHtml(t("automation"))}</h3>${statusBadge(todo)}</div>${run.lastError ? `<p class="error-text">${escapeHtml(run.lastError)}</p>` : ""}${run.resultSummary ? `<p>${escapeHtml(run.resultSummary)}</p>` : ""}<div class="button-row">${actions.join("")}</div></section>`;
  }

  function detailPanel() {
    const todo = state.draft || selected();
    if (!todo) return `<aside class="detail detail-empty"><div class="empty-mark" aria-hidden="true">↗</div><p>${escapeHtml(t("details"))}</p></aside>`;
    const archived = Boolean(todo.archivedAt);
    const completed = todo.status === "completed";
    const planned = datePart(todo.plannedFor);
    const deadline = datePart(todo.deadline);
    const saveLabel = state.saveState === "saving" ? t("saving") : state.saveState === "error" ? state.error || t("conflict") : state.saveState === "saved" ? t("saved") : "";
    return `<aside class="detail ${state.narrowDetail ? "is-open" : ""}" aria-label="${attr(t("details"))}"><div class="detail-head"><h2>${escapeHtml(t("details"))}</h2><div class="save-state" data-save-state>${escapeHtml(saveLabel)}</div><button class="icon-button" type="button" data-close-detail aria-label="${attr(t("close"))}">×</button></div>
      <form class="detail-form" data-detail-form data-id="${attr(todo.id)}">
        <label class="span-2"><span>${escapeHtml(t("title"))}</span><input data-field="title" value="${attr(todo.title)}" maxlength="240" ${archived ? "disabled" : ""}></label>
        <label class="span-2"><span>${escapeHtml(t("description"))}</span><textarea data-field="description" rows="5" maxlength="12000" ${archived ? "disabled" : ""}>${escapeHtml(todo.description || "")}</textarea></label>
        <label><span>${escapeHtml(t("project"))}</span><select data-field="projectId" ${archived ? "disabled" : ""}>${projectOptions(todo.projectId)}</select></label>
        <label><span>${escapeHtml(t("priority"))}</span><select data-field="priority" ${archived ? "disabled" : ""}>${["none", "low", "medium", "high", "urgent"].map((priority) => `<option value="${priority}" ${todo.priority === priority ? "selected" : ""}>${escapeHtml(t(priority))}</option>`).join("")}</select></label>
        <label class="span-2"><span>${escapeHtml(t("tags"))}</span><input data-field="tags" value="${attr((todo.tags || []).join(", "))}" ${archived ? "disabled" : ""}></label>
        <label><span>${escapeHtml(t("plannedFor"))}</span><input data-field="plannedFor" type="date" value="${attr(planned)}" ${archived ? "disabled" : ""}></label>
        <label><span>${escapeHtml(t("deadline"))}</span><input data-field="deadline" type="date" value="${attr(deadline)}" ${archived ? "disabled" : ""}></label>
        <label class="span-2"><span>${escapeHtml(t("mode"))}</span><select data-field="mode" ${archived || completed ? "disabled" : ""}><option value="manual" ${todo.mode === "manual" ? "selected" : ""}>${escapeHtml(t("manual"))}</option><option value="reminder" ${todo.mode === "reminder" ? "selected" : ""}>${escapeHtml(t("reminder"))}</option><option value="agent_execute" ${todo.mode === "agent_execute" ? "selected" : ""}>${escapeHtml(t("agent"))}</option></select></label>
        ${archived ? "" : automationFields(todo)}
      </form>
      <div class="detail-actions">${archived ? `<button class="button" type="button" data-restore>${escapeHtml(t("restore"))}</button><button class="button button-danger" type="button" data-purge>${escapeHtml(t("purge"))}</button>` : `<button class="button" type="button" data-toggle-selected>${escapeHtml(completed ? t("reopen") : t("complete"))}</button><button class="button button-danger-quiet" type="button" data-trash>${escapeHtml(t("moveTrash"))}</button>`}</div>
      ${archived ? "" : recurrencePanel(todo)}${runPanel(todo)}
    </aside>`;
  }

  function reviewSection(title, items) {
    return `<section class="review-section"><h2>${escapeHtml(title)} <span>${items.length}</span></h2>${items.length ? `<div class="review-list">${items.map(todoCard).join("")}</div>` : `<p class="muted">${escapeHtml(t("empty"))}</p>`}</section>`;
  }

  function reviewView() {
    const review = state.review;
    if (state.loading) return listPanel();
    if (!review) return listPanel();
    const exceptions = (review.exceptions || []).map((item) => `<article class="exception-row"><div><strong>${escapeHtml(item.type)} · ${escapeHtml(item.state)}</strong><p>${escapeHtml(item.diagnostic || "")}</p></div><button class="button button-quiet" type="button" data-open-todo="${attr(item.todoId)}">${escapeHtml(t("details"))}</button></article>`).join("");
    return `<div class="review-grid">${reviewSection(t("overdue"), review.overdue || [])}${reviewSection(t("nextSevenDays"), review.nextSevenDays || [])}${reviewSection(t("unscheduled"), review.unscheduled || [])}<section class="review-section"><h2>${escapeHtml(t("reviewExceptions"))} <span>${review.exceptions?.length || 0}</span></h2>${exceptions || `<p class="muted">${escapeHtml(t("empty"))}</p>`}</section>${reviewSection(t("recentlyCompleted"), review.recentlyCompleted || [])}</div>`;
  }

  function importDialog() {
    const preview = state.importPreview;
    if (!preview) return "";
    const diagnostics = (preview.preview?.diagnostics || []).map((item) => `<li class="diagnostic diagnostic-${attr(item.severity)}"><strong>${escapeHtml(item.code)}</strong><span>${escapeHtml(item.message)}</span>${item.path ? `<code>${escapeHtml(item.path)}</code>` : ""}</li>`).join("");
    return `<div class="modal-backdrop" data-modal><section class="modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><div class="modal-head"><h2 id="import-title">${escapeHtml(t("preview"))}</h2><button class="icon-button" type="button" data-import-close>×</button></div><p class="${preview.preview?.canCommit ? "success-text" : "error-text"}">${escapeHtml(preview.preview?.canCommit ? t("importReady") : t("importBlocked"))}</p><ul class="diagnostics">${diagnostics || `<li>${escapeHtml(t("importReady"))}</li>`}</ul><div class="modal-actions"><button class="button button-quiet" type="button" data-import-close>${escapeHtml(t("cancel"))}</button><button class="button button-primary" type="button" data-import-commit ${preview.preview?.canCommit ? "" : "disabled"}>${escapeHtml(t("commit"))}</button></div></section></div>`;
  }

  function render() {
    if (destroyed) return;
    root.innerHTML = `<div class="app-shell">${sidebar()}<section class="workspace">${runtimeBanner()}${toolbar()}${captureBar()}<div class="workspace-grid ${state.narrowDetail ? "detail-open" : ""}"><main class="content" tabindex="-1">${state.view === "review" ? reviewView() : listPanel()}</main>${detailPanel()}</div></section></div>${importDialog()}<div class="toast" data-toast hidden role="status"></div>`;
    updateResize();
  }

  function updateSaveState(value, message) {
    state.saveState = value;
    const element = root.querySelector("[data-save-state]");
    if (element) element.textContent = message || (value === "saving" ? t("saving") : value === "saved" ? t("saved") : value === "error" ? state.error || t("conflict") : "");
  }

  async function load(options = {}) {
    const generation = ++loadGeneration;
    state.loading = true;
    state.error = null;
    if (!options.keepSelection) { state.selectedId = null; state.draft = null; state.workspaceRef = null; }
    render();
    try {
      const query = new URLSearchParams();
      query.set("view", state.projectId ? "project" : state.view === "review" ? "all" : state.view);
      query.set("timeZone", timezone);
      query.set("limit", "100");
      if (state.projectId) query.set("projectId", state.projectId);
      if (state.search.trim()) query.set("search", state.search.trim());
      const [todos, projects, runtimeResult] = await Promise.all([
        api(`api/todos?${query}`), api("api/projects"), api("api/status"),
      ]);
      let agents = { agents: state.agents };
      try { agents = await api("api/agents"); } catch { /* Agent list may be denied while manual use remains valid. */ }
      if (generation !== loadGeneration) return;
      state.items = todos.items || [];
      state.projects = projects.items || [];
      state.runtime = runtimeResult;
      state.agents = agents.agents || [];
      if (state.view === "review") {
        const result = await api(`api/review?timeZone=${encodeURIComponent(timezone)}`);
        if (generation !== loadGeneration) return;
        state.review = result.review;
      } else state.review = null;
      state.loading = false;
      if (options.keepSelection && state.selectedId) {
        const refreshed = state.items.find((item) => item.id === state.selectedId);
        if (refreshed) { state.draft = structuredClone(refreshed); state.workspaceRef = refreshed.workspaceRef || null; }
      }
      render();
      signalReady();
    } catch (error) {
      if (generation !== loadGeneration) return;
      state.loading = false;
      state.error = error.message || String(error);
      render();
    }
  }

  function openTodo(id) {
    const todo = state.items.find((item) => item.id === id);
    if (!todo) return;
    state.selectedId = id;
    state.draft = structuredClone(todo);
    state.workspaceRef = todo.workspaceRef || null;
    state.narrowDetail = true;
    state.saveState = "";
    render();
    requestAnimationFrame(() => root.querySelector(".detail input")?.focus());
  }

  function updateDraftFromForm() {
    const form = root.querySelector("[data-detail-form]");
    if (!form || !state.draft) return;
    const value = (name) => form.querySelector(`[data-field="${name}"]`)?.value ?? "";
    state.draft.title = value("title");
    state.draft.description = value("description");
    state.draft.projectId = value("projectId") || undefined;
    state.draft.priority = value("priority") || "none";
    state.draft.tags = value("tags").split(",").map((item) => item.trim()).filter(Boolean);
    state.draft.plannedFor = value("plannedFor") ? { kind: "date", date: value("plannedFor") } : undefined;
    state.draft.deadline = value("deadline") ? { kind: "date", date: value("deadline") } : undefined;
    state.draft.mode = value("mode") || "manual";
    if (state.draft.mode === "reminder") {
      state.draft.reminderTrigger = value("reminderLocal") ? { kind: "exact", localDateTime: `${value("reminderLocal")}:00`.replace(":00:00", ":00"), timeZone: value("timeZone") || timezone, enabled: true } : undefined;
      state.draft.agentTrigger = undefined;
      state.draft.agentId = undefined; state.draft.instructions = undefined; state.draft.permissionMode = undefined; state.draft.workspaceRef = undefined;
    } else if (state.draft.mode === "agent_execute") {
      state.draft.agentTrigger = value("agentLocal") ? { kind: "exact", localDateTime: `${value("agentLocal")}:00`.replace(":00:00", ":00"), timeZone: value("timeZone") || timezone, enabled: true } : undefined;
      state.draft.reminderTrigger = undefined;
      state.draft.agentId = value("agentId") || undefined;
      state.draft.instructions = value("instructions") || undefined;
      state.draft.permissionMode = value("permissionMode") || "ask";
      state.draft.workspaceRef = state.workspaceRef || state.draft.workspaceRef;
    } else {
      state.draft.reminderTrigger = undefined; state.draft.agentTrigger = undefined;
      state.draft.agentId = undefined; state.draft.instructions = undefined; state.draft.permissionMode = undefined; state.draft.workspaceRef = undefined;
    }
  }

  function patchFromDraft(todo) {
    return {
      title: todo.title, description: todo.description || "", projectId: todo.projectId || null, tags: todo.tags || [], priority: todo.priority,
      plannedFor: todo.plannedFor || null, deadline: todo.deadline || null, mode: todo.mode,
      reminderTrigger: todo.reminderTrigger || null, agentTrigger: todo.agentTrigger || null, agentId: todo.agentId || null,
      instructions: todo.instructions || null, permissionMode: todo.permissionMode || null, workspaceRef: todo.workspaceRef || null,
    };
  }

  function queueSave({ rerenderMode = false } = {}) {
    if (!state.draft || state.draft.archivedAt || state.draft.status === "completed") return;
    updateDraftFromForm();
    if (rerenderMode) { render(); return queueSave(); }
    clearTimeout(saveTimer);
    updateSaveState("saving");
    saveTimer = setTimeout(() => {
      const id = state.draft.id;
      const expectedVersion = state.draft.version;
      const patch = patchFromDraft(structuredClone(state.draft));
      saveChain = saveChain.then(async () => {
        try {
          const result = await api(`api/todos/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ patch, expectedVersion, mutationId: crypto.randomUUID() }) });
          const current = state.items.findIndex((item) => item.id === id);
          if (current >= 0) state.items[current] = { ...state.items[current], ...result.value };
          if (state.draft?.id === id) state.draft.version = result.value.version;
          state.error = null;
          updateSaveState("saved");
          const listTitle = root.querySelector(`[data-todo-id="${CSS.escape(id)}"] .todo-title`);
          if (listTitle) listTitle.textContent = result.value.title;
        } catch (error) {
          state.error = error.message || String(error);
          updateSaveState("error", state.error);
          notify(state.error, "error");
        }
      });
    }, 600);
  }

  async function mutate(path, method = "POST", body = {}) {
    try {
      await api(path, { method, body: JSON.stringify(body) });
      await load();
    } catch (error) {
      notify(error.message || String(error), "error");
    }
  }

  async function pickWorkspace() {
    try {
      if (!hana.resources || typeof hana.resources.pick !== "function") throw new Error("Hana resource picker is unavailable");
      const result = await hana.resources.pick({ kind: "directory", multiple: false, title: t("pickWorkspace") });
      const ref = result?.resourceRef || result?.ref || result?.resource || (Array.isArray(result) ? result[0] : result);
      if (!ref || typeof ref !== "object") return;
      state.workspaceRef = ref;
      if (state.draft) state.draft.workspaceRef = ref;
      render();
      queueSave();
    } catch (error) { notify(error.message || String(error), "error"); }
  }

  async function createRecurrence(form) {
    const todo = state.draft;
    if (!todo) return;
    const data = new FormData(form);
    const frequency = String(data.get("frequency") || "daily");
    const interval = Number(data.get("interval") || 1);
    const anchorDate = datePart(todo.plannedFor) || new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const rule = frequency === "after_completion"
      ? { kind: "after_completion", interval, unit: "day", anchorDate, timeZone: timezone }
      : { kind: "calendar", frequency, interval, anchorDate, timeZone: timezone };
    try {
      await api("api/recurrence", { method: "POST", body: JSON.stringify({ todoId: todo.id, expectedVersion: todo.version, rule }) });
      await load();
      notify(t("saved"), "success");
    } catch (error) { notify(error.message || String(error), "error"); }
  }

  async function exportData() {
    try {
      const documentValue = await api(`api/exchange/export?includeTrash=${state.view === "trash" ? "true" : "false"}`);
      const blob = new Blob([`${JSON.stringify(documentValue, null, 2)}\n`], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `hana-todolist-${new Date().toISOString().slice(0, 10)}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { notify(error.message || String(error), "error"); }
  }

  async function previewImport(file) {
    try {
      const source = await file.text();
      state.importPreview = await api("api/exchange/preview", { method: "POST", body: JSON.stringify({ source }) });
      render();
    } catch (error) { notify(error.message || String(error), "error"); }
  }

  async function commitImport() {
    try {
      const previewId = state.importPreview?.preview?.id;
      if (!previewId) return;
      await api("api/exchange/commit", { method: "POST", body: JSON.stringify({ previewId, commandId: crypto.randomUUID() }) });
      state.importPreview = null;
      await load();
      notify(t("saved"), "success");
    } catch (error) { notify(error.message || String(error), "error"); }
  }

  root.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.matches("[data-capture]")) {
      event.preventDefault();
      const data = new FormData(form);
      const title = String(data.get("title") || "").trim();
      if (!title) return;
      const submit = form.querySelector("button[type=submit]"); if (submit) submit.disabled = true;
      try {
        await api("api/todos", { method: "POST", body: JSON.stringify({ title, projectId: data.get("projectId") || undefined, mode: "manual", commandId: crypto.randomUUID() }) });
        form.reset();
        await load();
      } catch (error) { notify(error.message || String(error), "error"); }
      finally { if (submit) submit.disabled = false; }
      return;
    }
    if (form.matches("[data-project-create]")) {
      event.preventDefault();
      const data = new FormData(form); const name = String(data.get("name") || "").trim(); if (!name) return;
      try { await api("api/projects", { method: "POST", body: JSON.stringify({ name, commandId: crypto.randomUUID() }) }); form.reset(); await load({ keepSelection: true }); }
      catch (error) { notify(error.message || String(error), "error"); }
      return;
    }
    if (form.matches("[data-recurrence-create]")) { event.preventDefault(); await createRecurrence(form); }
  });

  root.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.matches("#capture-title") && event.key === "Enter" && event.isComposing) {
      event.preventDefault();
    }
  });

  root.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches("[data-search]")) {
      state.search = target.value;
      clearTimeout(target.searchTimer);
      target.searchTimer = setTimeout(() => load(), 300);
      return;
    }
    if (target.matches("[data-detail-form] [data-field]")) queueSave();
  });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches("[data-field=mode]")) { updateDraftFromForm(); render(); queueSave(); }
    if (target.matches("[data-import-file]") && target.files?.[0]) { previewImport(target.files[0]); target.value = ""; }
  });

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.nav) { state.view = button.dataset.nav; state.projectId = undefined; await load(); return; }
    if (button.dataset.project) { state.projectId = button.dataset.project; state.view = "project"; await load(); return; }
    if (button.dataset.openTodo) { openTodo(button.dataset.openTodo); return; }
    if (button.dataset.closeDetail !== undefined) { state.narrowDetail = false; state.selectedId = null; state.draft = null; render(); return; }
    if (button.dataset.reload !== undefined) { await load({ keepSelection: true }); return; }
    if (button.dataset.toggleComplete) {
      const todo = state.items.find((item) => item.id === button.dataset.toggleComplete); if (!todo) return;
      await mutate(`api/todos/${encodeURIComponent(todo.id)}/${todo.status === "completed" ? "reopen" : "complete"}`, "POST", { expectedVersion: todo.version, commandId: crypto.randomUUID() }); return;
    }
    if (button.dataset.toggleSelected !== undefined && state.draft) { await mutate(`api/todos/${encodeURIComponent(state.draft.id)}/${state.draft.status === "completed" ? "reopen" : "complete"}`, "POST", { expectedVersion: state.draft.version, commandId: crypto.randomUUID() }); return; }
    if (button.dataset.trash !== undefined && state.draft) { await mutate(`api/todos/${encodeURIComponent(state.draft.id)}`, "DELETE", { expectedVersion: state.draft.version, commandId: crypto.randomUUID() }); return; }
    if (button.dataset.restore !== undefined && state.draft) { await mutate(`api/todos/${encodeURIComponent(state.draft.id)}/restore`, "POST", { expectedVersion: state.draft.version, commandId: crypto.randomUUID() }); return; }
    if (button.dataset.purge !== undefined && state.draft) {
      try {
        const prepared = await api(`api/todos/${encodeURIComponent(state.draft.id)}/purge/prepare`, { method: "POST", body: JSON.stringify({ expectedVersion: state.draft.version }) });
        if (!window.confirm(t("purgeConfirm"))) return;
        await api(`api/todos/${encodeURIComponent(state.draft.id)}/purge/confirm`, { method: "POST", body: JSON.stringify({ token: prepared.token }) });
        await load();
      } catch (error) { notify(error.message || String(error), "error"); }
      return;
    }
    if (button.dataset.pickWorkspace !== undefined) { await pickWorkspace(); return; }
    if (button.dataset.skipOccurrence !== undefined && state.draft) { await mutate(`api/recurrence/occurrences/${encodeURIComponent(state.draft.id)}/skip`, "POST", { expectedVersion: state.draft.version }); return; }
    if (button.dataset.runStart) { await mutate(`api/automation/runs/${encodeURIComponent(button.dataset.runStart)}/start`, "POST", {}); return; }
    if (button.dataset.runRetry) { await mutate(`api/automation/runs/${encodeURIComponent(button.dataset.runRetry)}/retry`, "POST", { runAt: new Date().toISOString() }); return; }
    if (button.dataset.runCancel) { await mutate(`api/automation/runs/${encodeURIComponent(button.dataset.runCancel)}/cancel`, "POST", {}); return; }
    if (button.dataset.export !== undefined) { await exportData(); return; }
    if (button.dataset.import !== undefined) { root.querySelector("[data-import-file]")?.click(); return; }
    if (button.dataset.importClose !== undefined) { state.importPreview = null; render(); return; }
    if (button.dataset.importCommit !== undefined) { await commitImport(); }
  });

  document.addEventListener("keydown", onKeyDown);
  function onKeyDown(event) {
    if (event.key === "Escape" && (state.selectedId || state.importPreview)) {
      state.importPreview = null; state.selectedId = null; state.draft = null; state.narrowDetail = false; render();
    }
  }

  function signalReady() {
    try { hana.ready?.(); } catch { /* optional */ }
    try { window.parent?.postMessage({ type: "hana:ready", protocolVersion: 1 }, "*"); } catch { /* optional */ }
  }

  function updateResize() {
    requestAnimationFrame(() => {
      const height = Math.max(document.documentElement.scrollHeight, root.scrollHeight);
      try { hana.ui?.resize?.({ height }); } catch { /* optional */ }
      try { window.parent?.postMessage({ type: "hana:resize", protocolVersion: 1, height }, "*"); } catch { /* optional */ }
    });
  }

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(updateResize);
    resizeObserver.observe(root);
  }
  render();
  load();

  return () => {
    destroyed = true;
    clearTimeout(saveTimer);
    resizeObserver?.disconnect();
    document.removeEventListener("keydown", onKeyDown);
  };
}
