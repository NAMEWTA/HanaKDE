---
schema_version: 3
artifact: spec
change: 2026-08-09-internalize-todolist-plugin
status: ready
ready_for_tickets: true
sources:
  - "USER-DECISION:2026-08-09 Todo 内置插件闭环与顺手体验"
  - "USER-DECISION:产品实现语言固定为 TypeScript"
  - "USER-DECISION:插件产品写入只能位于 plugins/todolist/"
  - "USER-DECISION:宿主未提供的能力暂不实现，待基础能力对外提供后再升级插件"
  - "WAYFINDER:INV-01..INV-14 confirmed solutions"
  - "ADR:<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ADR.md</Path>"
  - "CONTEXT:<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/CONTEXT.md</Path>"
  - "CODE:<Path>core/plugin-manager.ts</Path>"
  - "CODE:<Path>lib/task-registry.ts</Path>"
  - "CODE:<Path>hub/event-bus-capabilities.ts</Path>"
  - "CODE:<Path>packages/plugin-runtime/src/index.ts</Path>"
---

# Spec: Hana Todo 内置插件

- **Spec：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/spec.md</Path>`
- **当前 ADR：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ADR.md</Path>`
- **当前领域上下文：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/CONTEXT.md</Path>`

## 1. 问题与目标

### 问题陈述

参考 TodoList 实现表达了持久任务、提醒、周期和 Agent 自动化的领域意图，但不能直接作为 HanaKDE 内置插件。参考实现依赖未声明的事件别名、旧 SQLite 生命周期、第二调度器、完整会话复制和与宿主不一致的 UI。HanaKDE 已有会话内临时 `todo_write`，但缺少一个跨 Session、可恢复、可诊断且可以整块删除的个人 Todo 领域。

### 目标用户与场景

- 单一 owner 用户：逐项快速捕获、组织、安排、完成、回顾和恢复个人 Todo。
- 当前 Hana Agent：通过 namespaced Todo tools 读取或修改持久 Todo，不把时间字段当成后台执行授权。
- 已明确授权 Agent automation 的用户：在精确 trigger、Agent、workspace、ResourceRef 和 permission 边界内执行单条 Todo，并观察、取消、重试和处理结果。
- 需要备份或迁移的用户：使用严格版本化 JSON preview/commit/export，不直接接管旧 SQLite。

### 成功标准

- Hana Todo 作为 builtin `todolist` 插件加载，Page、routes、namespaced tools、生命周期和私有 store 共用同一 TypeScript application service。
- 所有产品运行时、routes/tools、domain/store、React、测试、fixture、Playwright 配置和 build config 位于 `<Path>plugins/todolist/</Path>`，不修改其它产品路径。
- 用户可以从 Inbox 逐项捕获，在 Today/Upcoming 聚焦，以单层 Project/List 与 tags 组织，并看到 Todo 出现在视图中的理由。
- plannedFor、deadline、reminder trigger 与 Agent trigger 分离；默认 manual；任何后台副作用都须显式配置和授权。
- 提醒和 Automation 在晚就绪、重启、重复唤醒、权限拒绝、handoff 未知、Session 不可用和取消失败时保持可解释、幂等、可重试且不伪装成功。
- Trash、恢复、Project/系列生命周期、Review、导入导出和窄窗口交互形成闭环；完成历史与已发生的 occurrence 不被未来编辑重写。

### 非目标

- 不把 Todo 表、scheduler、通知 transport 或 Session 生命周期焊入 Core/server/desktop/shared/SDK。
- 不替换、迁移或同步 `todo_write`、Session Todo UI 或其它插件的任务数据。
- 不在首发实现自然语言识别、批量创建、复杂 RRULE、工作日/节假日、第三方日历、Bridge/逐渠道送达回执、`session.open`、模糊搜索、拖拽排序、生产力评分、团队协作、多层项目或完整 transcript 导出。
- 不在插件内私造宿主尚未提供的 capability、公共接口、第二 scheduler、绝对路径旁路或真实外部副作用。

## 2. 解决方案与外部行为

### 解决方案摘要

使用 `hana-plugin-creator` 已核验的 `professional-react/full` 形态重建 `<Path>plugins/todolist/</Path>`。插件由 PluginManager 作为 builtin/full-access 插件加载，使用 TypeScript、React、`@hana/plugin-sdk`、`@hana/plugin-runtime`、`@hana/plugin-components` 和 `HanaThemeProvider`。Python 只可作为仓外脚手架生成工具，不进入产品目录、运行时或构建依赖。

插件消费当前已提供的 PluginManager、authenticated plugin routes、TaskRegistry、EventBus、Session/Agent、ResourceIO 和插件 lifecycle。TaskRegistry handler 晚于插件启动时，插件使用有限、可取消的 readiness handshake；不修改宿主启动顺序，不注册私有 `setInterval` 或到期扫描器。桌面提醒只能发射现有全局 `notification` event，`handed_off` 只表示交给事件流，不表示操作系统送达。

宿主当前未提供的 notification capability/receipt、Bridge、逐渠道通知、`session.open`、rich native card、workspace write、旧 SQLite 直读等能力均为 deferred。插件必须在 capability 缺失时显示可诊断降级，而不是猜别名、调用私有对象或提供假按钮。

### 主要流程

#### 捕获、组织和视图

1. 全局入口默认创建一个 pending/manual、无 Project 的 Inbox Todo；Today、具体 Project 或明确日期上下文只有在界面显示 chip 且用户未移除时才继承。
2. 首版只允许逐项创建。Enter 创建单条；IME composition 期间 Enter 只提交候选文本；不提供 Shift/Cmd/Ctrl 变体快捷提交，也不提供批量创建。多行粘贴提示用户逐项添加，不拆分、不合并、不部分写入。
3. 标题 trim 后保留内部空格、标点和大小写，最长 240 个 Unicode code points；空标题和超长标题稳定拒绝。首版不做自然语言识别；日期、Project、tag、提醒和 Agent 模式只通过显式控件/chip 设置。
4. 捕获字段包括 title、description、Project、plannedFor、deadline、priority、tags；reminder、recurrence、Agent automation 和 ResourceRef 在详情中显式配置。
5. 一级导航为 Today、Inbox、Upcoming、Projects、All；Calendar、Completed、Automation、Review 为二级视图；Trash 位于 Completed 下。
6. Today 显示 unfinished 且 `attentionDate <= today` 的 Todo，分 overdue/today；Inbox 显示 unfinished 且没有 Project 的 Todo；Upcoming 显示未来 attentionDate；All 显示全部 unfinished。`attentionDate = min(plannedFor, deadline)`，同日保留两种出现理由。
7. Calendar、Completed、Review 和 Automation 从同一 store projection 派生；查询失败保留最后成功快照并标记 stale，不显示伪造空状态。

#### 编辑、搜索与批量

1. 列表直接完成/恢复，其他编辑进入详情。标题/描述停止输入 600ms 或 blur 后自动保存；离散字段立即保存；高影响 reminder、recurrence、agent_execute、Project 删除和永久清除显式 preview/confirm。
2. mutation 使用字段级 patch、expectedVersion、baseline、mutationId；同字段串行、不同字段可并发；冲突不采用最后写入获胜，自动重放最多一次，真实冲突由用户裁决。
3. 搜索只覆盖 title/description/Project/tags，Unicode normalization 后大小写不敏感 contains；筛选按类别 AND、类别内 OR；每页 50 项 cursor，确定性 tie-breaker，真实空与筛选空分离。
4. 已有项可显式进入多选，最多 200 个已加载 ID；批量仅支持 complete、move Project、tags、priority、Trash，不支持批量创建、批量 date/reminder/recurrence/agent mode。批量操作先 preview，插件私有写入全成全不成，冲突保留选择。

#### 时间、提醒和周期

1. plannedFor、deadline、trigger 分离；date 为浮动日期，exact 保存 local value、IANA timezone、instant 和明确 DST offset。gap 拒绝，overlap 要求选择 offset，时区变化不改写原值。
2. reminder 必须显式启用且一个 Todo 只有一个 active reminder。TaskRegistry 是唯一调度权威；插件先 claim 稳定 reminder/occurrence/handoff identity，再发射 notification event。failed/unknown 可显式 retry，handed_off 不自动重发。
3. RecurrenceRule 支持 `calendar`（日/周/月/年）或 `after_completion`（完成后固定间隔），规则是系列权威，occurrence 是独立 Todo。Calendar 只按 Upcoming 有界窗口幂等物化；after_completion 只在当前完成后产生一个 next occurrence。
4. 日常操作默认仅当前 occurrence；“仅本次”形成 override，“本次及未来”建立规则边界版本。暂停停止未来物化和触发但不伪造取消已运行副作用；结束系列经确认后只 Trash 未完成未来 occurrence，历史不可变。

#### Agent automation

1. `agent_execute` 必须同时具备 Agent、instructions、workspace、permission mode、ResourceRef scope、精确 trigger 和用户批准；缺一项进入 needs_action，不降级执行。
2. 每个 Todo×trigger occurrence 只有一个 AutomationRun 和一个 plugin-private Hana Session；retry 在同一 Run 下创建新 Attempt。`session:send accepted` 只表示已接受，明确 completion event 和结果校验后才 succeeded。
3. Run 成功不自动完成 Todo。完成、删除、退出 agent_execute 或关闭自动化时，future/queued 取消，running 进入 cancel_requested，只有宿主确认才 cancelled；恢复/重新启用不复活旧 Run。
4. 无 `session.open` 时只展示 sessionRef/sessionId、复制和最小结果；不复制 transcript，不渲染假的导航按钮。

#### 删除、恢复、Review 和交换

1. 普通删除进入可恢复 Trash 并提供短期 Undo；Trash 只允许查看、恢复和 purge。恢复保留字段、occurrence、Project/series 引用和历史，不复活旧 schedule/reminder/Run。
2. Project 作为可恢复记录进入 Trash；其 Todo 不被级联删除，活动未完成 Todo 转 Inbox 投影并保留历史引用。恢复 Project 是独立动作。恢复时原 Project 不存在则保持 Inbox，不自动重建。
3. purge 前必须确认所有 queued/claimed/running/cancel_pending/unknown 外部副作用已结束或取消；purge 删除插件私有 Run/Attempt/sessionRef，但不声称删除宿主 Session，只保留最小不可逆审计。
4. Review 默认本周，固定展示 Inbox、逾期、未来 7 天、无日期、提醒/Automation 异常、最近完成六段；用户对逾期/Inbox 项选择明确去向，关闭页面不算结束，主动结束才写最小 session 记录。
5. exchange schema v1 只接受严格 JSON。导入先 preview 零写，默认追加，提交绑定 `previewId + sourceDigest + targetStoreVersion + commandId`，目标版本变化整次零写；导入不启动 schedule/Run/Session。导出基于一致 store snapshot，Trash 显式勾选，排除 transcript、secret、绝对路径和完整诊断，通过 ResourceIO `stageFile`/下载。

### 边界、失败与稳定错误行为

- 页面状态区分 `initializing`、`ready-empty`、`ready-with-data`、`stale`、`degraded`、`blocked`；失败不等于空，基础 CRUD 与附加能力隔离。
- migration 失败保留原 store、阻断写入、提供重试和脱敏诊断；未知写入结果不自动重放，重试使用新 commandId 并先重新读取。
- 错误稳定区分 validation、conflict、capability、store、unknown、preview_stale、reference_conflict、transaction_failed、export_failed 等类别，返回脱敏摘要、稳定 identity 和下一步。
- TaskRegistry readiness 耗尽进入 backend_unavailable；notification handoff 失败/未知、Session/Agent/ResourceIO/导入导出不可用时提供局部降级，不调用未声明能力。
- 外部宿主调用与插件 store 不宣称跨系统原子；不确定的通知交接、取消和 Session 结果保留 unknown/cancel_requested/needs_action。

### 状态转换与不变量

- Todo 主状态为 `pending <-> completed`，Trash 是正交归档；完成/恢复不伪造 Automation 状态。
- AutomationRun：`scheduled -> running -> succeeded|failed|needs_action|cancel_requested`，`cancel_requested -> cancelled` 仅宿主确认；retry 只新增 Attempt。
- Reminder handoff 一个 occurrence 一个 stable identity；`handed_off` 不等于 delivered。
- RecurrenceRule 权威、occurrence 独立、物化有界幂等、历史和已完成 occurrence 不可变。
- 一个 Todo 至多一个 Project、可有多个 tags；Project 删除不级联删除 Todo；Trash 恢复不复活外部副作用。
- Todo store、DTO、日志和导出不包含完整 Session messages、token/secret、workspace 绝对路径或宿主私有对象。
- 产品文件、测试、fixture、构建配置和依赖声明只能在 `<Path>plugins/todolist/</Path>`；其它产品路径只读。宿主未提供能力不在插件内私造。

## 3. 用户故事

- **US-001**：作为个人用户，我希望持久创建、查询、编辑、完成、恢复和删除 Todo，以便跨 Session 管理任务。
- **US-002**：作为快速记录用户，我希望逐项捕获并显式看到 Inbox/Today/Project/date 上下文，以便连续输入不产生隐藏字段或重复项。
- **US-003**：作为规划用户，我希望分别表达计划、截止、提醒和 Agent trigger，以便时间意图与副作用授权不混淆。
- **US-004**：作为任务增长用户，我希望使用 Today、Inbox、Upcoming、Projects、All、Calendar、Completed 和 Review，以便扫描、组织和复盘。
- **US-005**：作为可能误删的用户，我希望 Trash、Undo、恢复和 purge 前置条件清楚，以便不会意外丢失数据或复活副作用。
- **US-006**：作为周期任务用户，我希望仅本次或本次及未来地修改系列，同时保留历史事实。
- **US-007**：作为聊天用户，我希望 Agent 通过 namespaced Todo tools 操作持久 Todo，同时保留 `todo_write` 独立语义。
- **US-008**：作为授权自动化用户，我希望每个 Todo×occurrence 的 Run、Session、Attempt、取消和结果可隔离、可诊断、可恢复。
- **US-009**：作为自动化运营用户，我希望在 Automation 和 Review 中看到真实状态、失败原因和合法动作。
- **US-010**：作为备份/迁移用户，我希望 JSON 导入先预览、原子提交、可幂等，导出可核对且不泄露敏感数据。
- **US-011**：作为维护者，我希望插件只消费现有宿主能力并可整块删除，不污染系统本体。

## 4. 验收合同

| ID | 前置条件 | 动作或事件 | 可观察结果 | 验证接缝 |
|---|---|---|---|---|
| AC-001 | builtin 插件产物存在 | 冷启动加载 | `todolist` builtin/loaded，Page 与基础 CRUD 可用 | PluginManager harness + Playwright |
| AC-002 | Page/tools 使用同一 store | 任一入口创建/更新后由另一入口读取 | id、version、字段、状态一致 | route/tool/store integration |
| AC-003 | 既有 `todo_write` 可用 | 枚举和调用 Todo tools | `todo_write` 保持；只新增 namespaced tools，不替换旧语义 | tool catalog + regression |
| AC-004 | pending/manual Todo | CRUD、complete、reopen | 稳定 id/version、有界分页、主状态与审计正确 | Vitest service/route |
| AC-005 | plannedFor/deadline 组合 | Today/Upcoming 查询 | `attentionDate=min(plannedFor,deadline)`，Today/Upcoming 成员、理由和去重正确 | projection + UI |
| AC-006 | capture context | 逐项输入/Enter/IME/粘贴 | 单项创建、visible chips、无 NLP/批量创建/隐藏字段 | React + Playwright |
| AC-007 | Project/tags | 创建、归属、删除/恢复 Project | 单层归属；删除不级联，Todo 进入 Inbox 并保留历史引用 | store/UI integration |
| AC-008 | date/exact/DST | 保存、跨时区、gap/overlap | date 浮动；exact 保存 zone/instant；gap 拒绝、overlap 选择 offset | time unit tests |
| AC-009 | no explicit side effect | 创建/编辑 | 默认 manual；planned/deadline 不产生 Run/reminder；agent_execute 缺字段拒绝 | domain/scheduler |
| AC-010 | reminder trigger | TaskRegistry 唤醒 | claim 后 handoff；状态只到 handed_off/failed/unknown，不宣称 delivered | EventBus harness |
| AC-011 | duplicate/crash handoff | 重放、崩溃、显式 retry | stable identity 去重；handed_off 不自动重发，失败/未知可重试 | fault injection |
| AC-012 | backend partially unavailable | readiness/notification/Agent/Session/ResourceIO 缺失 | CRUD 保持；局部降级、诊断和出口清晰，无私有旁路 | capability harness |
| AC-013 | Todo active | delete/Undo/Trash/restore | 软删除、短期 Undo、字段和审计保留；恢复不复活外部副作用 | lifecycle E2E |
| AC-014 | dangerous mutation | stale version/token/session 或正常 confirm | 失效整次零写；有效确认逐项/事务结果可见 | confirmation fault tests |
| AC-015 | recurrence rule | materialize/complete/skip | calendar 有界幂等；after_completion 完成后仅一个 next | recurrence tests |
| AC-016 | series history | only-this/this-and-future/pause/end/restore | override/boundary/suppression 正确；历史不可变；系列恢复不隐式复活 | recurrence integration |
| AC-017 | authorized agent_execute | trigger claim | 每个 Todo×occurrence 一个 Run 和 private Session，不合并 | Task/Session harness |
| AC-018 | failed/needs_action Run | explicit retry | 同一 Run 新 Attempt，不复用失败 SessionRef 作为新 Session | automation integration |
| AC-019 | Session result | accepted/completion/error/timeout | accepted 不等成功；最小结果/诊断保存；Todo 不自动完成 | run protocol tests |
| AC-020 | queued/running Run | disable/complete/delete/exit mode/cancel | queued 取消，running cancel_requested，宿主确认后 cancelled，失败可见不重试 | cancel fault injection |
| AC-021 | Run history | Automation query/action | 有界筛选、真实状态、合法 retry/cancel/接管；详情只显示摘要 | React + Playwright |
| AC-022 | Session unavailable/export | view/report/export | 不复制 transcript；只显示 sessionRef/最小摘要/脱敏诊断 | privacy/session tests |
| AC-023 | late task handlers | startup handshake | 有界 retry，成功恢复 handler；耗尽 backend_unavailable；无第二 scheduler | startup harness |
| AC-024 | persisted schedules | restart/duplicate wake | 漏跑补偿一次、stable identity 去重、取消 schedule 不执行 | fake clock/task tests |
| AC-025 | product implementation | path audit | 所有产品 diff 仅 `<Path>plugins/todolist/</Path>`，插件外只读 | allowlist audit |
| AC-026 | ResourceRef/Session | resource/agent execution | 只用规范 ResourceRef 和宿主 workspace，不持久化绝对路径、不扩大 scope | ResourceIO/Session |
| AC-027 | exchange input | JSON v1/SQLite/unknown preview+commit | JSON preview/追加事务/幂等；SQLite/unknown 零写拒绝；导入不启副作用 | import/export integration |
| AC-028 | explicit export | JSON/Review/Automation download | 一致快照、显式 stage/download、Trash 明示勾选；无 workspace write | serializer/download E2E |
| AC-029 | invalid/stale/capability/batch failure | Page/tool/handler action | 稳定错误类别、脱敏诊断、无静默 fallback、无隐藏部分成功 | schema/fault tests |
| AC-030 | date/completion/Run data | Calendar/Completed/Review | 同源 projection；Completed 可恢复；Review 是行动工作流并可显式导出 | projection/UI |
| AC-031 | five locales + desktop/narrow | capture/edit/delete/Automation/import/review | 文案、焦点、键盘、ARIA、主题、长文本、窄布局无裁切遮挡 | component + Playwright screenshots |
| AC-032 | build/seed output | build/load/removal smoke | 产物自包含、自动发现；隔离副本删除插件后非 Todo 仍可构建运行 | build/seed/path smoke |
| AC-033 | normal Session tool catalog | plugin loaded | 只暴露用户级 namespaced tools；后台 handler 不作为用户 tool | PluginManager catalog |

每条用户故事至少由上述一个 AC 覆盖；AC-012、AC-025、AC-029、AC-031、AC-032 为横切阻断门。

## 5. 范围

### IN

- `<Path>plugins/todolist/</Path>` 内的 builtin `professional-react/full` 插件、manifest、Page、assets、routes、namespaced tools、lifecycle、私有 store、migration、测试、fixture、Playwright 配置和依赖声明。
- 持久 Todo CRUD、Project/tags、Today/Inbox/Upcoming/Projects/All、Calendar/Completed/Automation/Review、typed time、提醒 handoff、recurrence、Trash/恢复、AutomationRun/Attempt/Hold、JSON exchange v1 和显式下载。
- 使用当前已提供 TaskRegistry、EventBus、Session/Agent、ResourceIO 和 PluginManager 的集成与故障测试。

### REUSE

- PluginManager builtin discovery、plugin dataDir、authenticated routes、surface session、plugin SDK/runtime/components 和 Hana theme。
- TaskRegistry 持久 schedule/task lifecycle、现有 global `notification` event、稳定 Session/Agent/ResourceIO capability；均只读消费，不改宿主。
- 参考实现的纯 recurrence/date 算法和测试意图；不复用 HostAdapter、双 timer、自包含 renderer、旧 SQLite lifecycle 或 Python 生产代码。

### OUT

- **OOS-001**：替换/同步 `todo_write` 或 Session Todo UI。
- **OOS-002**：Core Todo 表、scheduler、notification transport、第二 scheduler、宿主启动顺序补丁、私有 Session 轮询。
- **OOS-003**：宿主当前未提供的 notification receipt/Bridge/渠道路由、`session.open`、rich native card、workspace write、任意本机路径旁路；待 HanaKDE 基础能力对外提供后另开升级 change。
- **OOS-004**：自然语言识别、批量创建、复杂 RRULE/工作日/节假日、第三方日历、模糊搜索、拖拽排序、生产力评分、团队协作、多层项目、看板/Habit/Pomodoro/位置提醒。
- **OOS-005**：直接打开/修改旧 SQLite；无真实脱敏样本时不宣称 0.0.5 兼容。
- **OOS-006**：完整 Session transcript/messages、token/secret、绝对 workspace path、完整 Agent 诊断或默认工作区报告导出。
- **OOS-007**：真实用户数据 import/purge/migration、真实通知、真实 Agent 副作用、发布部署、提交推送和远程写入。
- **OOS-008**：`<Path>plugins/todolist/</Path>` 之外的任何产品代码、公共测试、SDK、构建脚本、配置或其它插件改动。

## 6. 已锁定实现约束

- **DEC-001**：产品唯一写入根是 builtin `<Path>plugins/todolist/</Path>`；插件可整块删除。来源：Wayfinder INV-01/14、ADR-014。
- **DEC-002**：产品实现全部使用 TypeScript/React；`hana-plugin-creator` 的 Python scaffold 不进入生产目录。来源：Wayfinder INV-01/14、用户决定。
- **DEC-003**：默认 manual；reminder/agent_execute 需显式模式和授权；plannedFor/deadline 不授权后台副作用。来源：Wayfinder INV-01/02/06/08、ADR-003/005。
- **DEC-004**：Todo 主状态与 AutomationRun 正交；Run 成功不自动完成 Todo。来源：Wayfinder INV-08、ADR-004。
- **DEC-005**：`attentionDate=min(plannedFor,deadline)`；date/exact typed time 严格处理 DST。来源：Wayfinder INV-03/06、ADR-005。
- **DEC-006**：TaskRegistry 是唯一调度权威；插件使用有界 readiness handshake，无第二 scheduler。来源：Wayfinder INV-01/06/12、ADR-014。
- **DEC-007**：提醒仅发射现有 global `notification` event；handoff 不等于 delivered；宿主未提供的 receipt/Bridge 不实现。来源：Wayfinder INV-01/06/12、ADR-006/014。
- **DEC-008**：每个 Todo×occurrence 一个 Run/private Session；Session 是 transcript 权威；无 `session.open` 时降级为稳定 ref。来源：Wayfinder INV-08/09/12/13。
- **DEC-009**：RecurrenceRule 权威、occurrence 独立、有界幂等物化；历史和完成 occurrence 不可变。来源：Wayfinder INV-07/09。
- **DEC-010**：Trash 恢复不复活旧 schedule/reminder/Run；purge 受外部副作用状态和版本前置条件约束。来源：Wayfinder INV-09。
- **DEC-011**：exchange schema v1 先 preview 零写，再绑定版本/摘要/commandId 原子提交；导入不启动副作用；导出取一致快照并脱敏。来源：Wayfinder INV-11。
- **DEC-012**：基础 CRUD 与附加能力局部降级；migration/store/core route 失败阻断写入并保留诊断，不渲染空数据。来源：Wayfinder INV-12。
- **DEC-013**：桌面三栏、窄窗口单列全屏详情、焦点恢复、键盘、ARIA、五语言和稳定尺寸属于首发验收。来源：Wayfinder INV-13。

## 7. 数据、接口与兼容

- **公共接口变化：** 仅新增 builtin `todolist` Page、插件 authenticated routes、namespaced `todo_*` tools 和插件内部 task handlers；不修改宿主公共接口或既有 `todo_write`。
- **数据模型与持久化：** 插件私有 versioned store 至少保存 Todo、Project、typed time、trigger、Reminder/Handoff、AutomationRun/Attempt/Hold、RecurrenceRule/version/occurrence/suppression、Trash、confirmation、Review session、import/export audit；不保存完整 transcript、secret 或绝对路径。
- **兼容要求：** 现有 PluginManager、TaskRegistry、EventBus、Session/Agent、ResourceIO、SDK 和其它插件行为保持不变；插件只在能力声明和实际可用时调用。
- **迁移要求：** 私有 store migration 必须保留旧数据并可诊断；exchange schema v1 与 store schema 分离；SQLite/未知格式 preview 拒绝零写；真实 0.0.5 兼容需未来新样本和新 change。
- **发布或运维影响：** 只使用仓库已有 build/seed/通配复制；实现前执行 creator preflight 和宿主接缝复核；T-10 进行自包含产物、路径白名单和隔离删除 smoke。

## 8. 非功能要求

- **NFR-001 安全与隐私：** 权限来自宿主 context，不信任 body owner/plugin/session；ResourceRef 不扩大 workspace；store/DTO/log/export 排除 transcript、secret、绝对路径和完整诊断；capability 缺失 fail closed。
- **NFR-002 性能与容量：** 查询有界分页（默认 50）、批量选择最多 200 个已加载 ID、Upcoming/recurrence 有界窗口、上传 JSON 有界大小/深度/数组；虚拟化只有基线证明必要时才启用。
- **NFR-003 可用性与可靠性：** mutation、系列变更和 import 使用事务或可回滚边界；expectedVersion、stable identity、commandId 收敛重复唤醒/提交；stale/degraded/unknown 不伪装成功；基础 CRUD 与附加能力隔离。
- **NFR-004 可观测性与运营：** Run/Attempt/Hold、schedule、handoff、Trash、confirmation、Review、import/export audit 都有稳定 identity、时间、状态和脱敏诊断；支持能力矩阵与明确重试出口。
- **NFR-005 可访问性与国际化：** zh-CN、zh-TW、ja、ko、en；桌面/窄窗口无重叠；键盘、焦点、ARIA live/role、可见焦点、长文本换行和颜色非唯一状态信号。
- **NFR-006 路径与可移除性：** 所有产品 diff、测试、fixture、构建资产和依赖声明仅在 `<Path>plugins/todolist/</Path>`；隔离副本删除该目录后非 Todo 构建/测试仍可运行。

## 9. 验证策略

| 接缝 | 层级 | 覆盖合同 | 现有先例或命令 | Evidence 类型 |
|---|---|---|---|---|
| PluginManager/builtin discovery | integration/E2E | AC-001/003/025/032/033 | 插件内 harness、仓库 build/seed 命令 | load log、tool catalog、artifact smoke |
| Todo application service/routes/tools/store | unit/integration | AC-002/004/007/013/014/029 | 插件内 Vitest；既有宿主测试只读复用 | id/version/transaction/fault results |
| capture/search/projections/UI | component/E2E | AC-005/006/021/030/031 | 插件内 Vitest + Playwright | DOM/role/focus/locale/screenshots |
| typed time/reminder/TaskRegistry | unit/integration/fault | AC-008/009/010/011/012/023/024 | fake clock/EventBus/TaskRegistry harness | DST、handoff、readiness、restart evidence |
| recurrence/history | unit/integration | AC-015/016 | recurrence fixtures、事务/并发测试 | stable identity、history diff、rollback |
| Agent Run/Session/ResourceIO | integration/fault | AC-017/018/019/020/022/026 | Session/Agent/ResourceIO harness | Run state、cancel、redaction、sessionRef |
| exchange/Review | integration/E2E | AC-027/028/029/030/031 | schema fixture、preview/rollback、download E2E | counts、digest、privacy、Review state |
| build/path/removal | build/smoke | AC-025/032 | 仓库既有 typecheck/lint/build/seed/test；隔离 removal | artifact load、allowlist、non-Todo smoke |

## 10. 风险、假设与未决问题

### 风险

- TaskRegistry handler 晚就绪可能导致后台能力暂时不可用；使用有限 handshake 和诊断，不用第二 scheduler。
- EventBus notification 无送达回执；只记录 handoff，保留 failed/unknown，不宣称 delivered。
- Session/Agent/ResourceIO/宿主能力可能缺失；附加能力降级，禁止私有旁路。
- 外部副作用与插件事务不能跨系统原子；使用 outbox/intent、前向取消和可见 unknown。
- 文档或宿主事实漂移会使实现合同失效；实现前重读宿主代码、运行 creator preflight 和 validator。

### 已采用的低影响假设

- 默认 Review 时间范围为用户显示时区本周；验证接缝可调整视图，不改变 Todo 数据。
- 普通字段标题/描述 600ms 自动保存；以插件内 UI 测试验证，不形成宿主公共合同。
- 15 秒 Undo 窗口是插件私有默认值；若实现基线显示不可用，按不改变安全语义的方式调整并记录 Evidence。

### 未决问题

无
