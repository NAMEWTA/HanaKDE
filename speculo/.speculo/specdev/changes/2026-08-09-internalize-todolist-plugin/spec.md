---
schema_version: 3
artifact: spec
change: 2026-08-09-internalize-todolist-plugin
status: ready
ready_for_tickets: true
sources:
  - "USER-DECISION:2026-08-09 internalize TodoList plugin and repair patrol and UI behavior"
  - "USER-DECISION:2026-08-09 implementation writes are confined to plugins/todolist"
  - "DESIGN-TREE:D-001..D-025 consensus"
  - "ADR:<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ADR.md</Path>"
  - "CODE:<Path>core/plugin-manager.ts</Path>"
  - "CODE:<Path>lib/task-registry.ts</Path>"
  - "CODE:<Path>lib/notifications/notification-service.ts</Path>"
---

# Spec: Hana Todo 内置插件

- **Spec：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/spec.md</Path>`
- **当前 ADR：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ADR.md</Path>`
- **当前领域上下文：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/CONTEXT.md</Path>`

## 1. 问题与目标

### 问题陈述

`<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/</Path>` 已经表达了持久 Todo、提醒、周期和 Agent 巡查等领域意图，但不能直接成为 HanaKDE 内置插件：它依赖 mock 中存在、真实宿主中缺失或尚未就绪的 EventBus 能力；TaskRegistry handler 在插件启动后才注册；通知通过多个兼容别名猜测；TaskRegistry schedule 与 `setInterval` 同时唤醒；纯日期 Todo 会错误进入 Agent 巡查；完整对话和报告被重复保存；Page 又把捕获、日期、分析与自动化调试堆进同一交互层。

HanaKDE 同时已经拥有会话内临时计划工具 `todo_write`。本 change 需要新增的是独立、持久、跨会话的个人 Todo 领域，不能替换、同步或复用 `todo_write` 的会话消息状态。

### 目标用户与场景

- HanaKDE 的单一 owner 用户：快速捕获、组织、安排、完成和复盘个人任务。
- 代表当前用户调用插件工具的 Hana Agent：读取或修改持久 Todo，但不能把到期时间当成后台执行授权。
- 配置了 `agent_execute` 的用户：让指定 Agent 在明确 trigger、权限和工作区边界内执行一条 Todo，并能观察、取消、重试和进入对应 Hana Session。
- 需要迁移参考插件数据的用户：通过显式、版本化、可预览和可回滚的 JSON 导入迁移，而不是让新插件直接打开旧 SQLite。

### 成功标准

- Hana Todo 作为 `<Path>plugins/todolist/</Path>` 的内置插件随产品加载，Page、Agent tools 和后台能力共用一个持久化应用服务。
- 所有产品实现、测试、fixture、构建资产和插件运行依赖都位于 `<Path>plugins/todolist/</Path>`；本 change 不修改该目录之外的产品文件。
- 用户能够从 Inbox 捕获，在 Today 聚焦，在 Upcoming 规划，并以单层 Project/List 与 tags 组织任务；同一任务为何出现在某个视图可以解释。
- `manual`、`reminder` 与 `agent_execute` 的副作用边界明确；纯日期、计划时间或截止时间不会自行触发 Agent。
- 提醒和自动化在冷启动、重启、重复唤醒、权限拒绝、桌面通知交接不确定和取消失败时保持可诊断、幂等且不伪装成功。
- 自动化以一个 Todo × 一个 trigger occurrence 为运行隔离单元；Hana Session 是完整对话权威，Todo 只保存最小运行投影。
- 周期规则支持固定日历与完成后锚点，历史 occurrence 不因未来编辑而改变。
- 新 Page 使用 Hana 主题和组件边界，在桌面及窄布局中无重叠、可用键盘操作，并覆盖 HanaKDE 的五种产品语言。
- 当前 `todo_write`、Session、TaskRegistry、NotificationService、ResourceIO 和其它插件行为保持兼容。

### 非目标

- 不把 Todo 表、Todo scheduler 或 Todo notification transport 写入 Core。
- 不替换或自动同步现有 `todo_write`、Session Todo Card 或 Markdown Page Task。
- 不整体复制参考实现、HostAdapter、自包含 renderer 或旧 SQLite schema。
- 不在首发提供聊天 Card、团队协作、多层子任务、复杂依赖、看板、Habit、Pomodoro、位置提醒或生产力评分套件。

## 2. 解决方案与外部行为

### 解决方案摘要

使用 hana-plugin-creator 已确认的 `professional-react/full` 形态重建 `<Path>plugins/todolist/</Path>`。插件以 `todolist` 为稳定 id，由 PluginManager 作为 `builtin`、`full-access` 插件加载；内置插件本身不可通过社区插件的禁用/移除入口关闭，但 Page/CRUD 始终可用，提醒与 Agent 自动化分别提供领域级总开关。

插件拥有 Todo、Project/List、RecurrenceRule、trigger、提醒投递、AutomationRun/Attempt/Hold、删除确认和导入记录等私有数据。UI、routes 与 Agent tools 只调用同一应用服务。浏览器端使用 `hana.api.fetch()` 访问同插件 route，静态资产只放在 `assets/`，React UI 使用 `HanaThemeProvider mode="inherit"` 与 `@hana/plugin-components`。

本 change 不新增或修改任何系统本体、共享 SDK、构建脚本或公共测试文件。插件只消费当前已有的 PluginManager、EventBus、TaskRegistry、Session/Agent 与 ResourceIO 行为：冷启动时在插件内部进行有界的 TaskRegistry readiness handshake；桌面提醒通过已有全局 `notification` 事件交给宿主。该事件没有投递回执，因此插件只记录 handoff 状态，不宣称送达；Todo 不持有第二套到期扫描 timer，也不调用 NotificationService、Session 内部对象或本机路径旁路。

### 主要流程

#### 捕获、组织与聚焦

1. 用户从全局快速捕获输入标题；未处于 Today、具体 Project 或明确日期上下文时，Todo 默认无 Project/List 并属于 Inbox。
2. Today 创建显式写入 `plannedFor=today`；Project 或日期上下文的继承值必须显示在输入器中。
3. 自然语言识别的日期、Project、tag、提醒和执行模式先显示为可移除 chip/预览；未显示的解析结果不得写入。
4. Todo 默认 `pending`、`manual`。用户可添加 description、priority、Project/List、tags、`plannedFor`、`deadline`、ResourceRef 和明确 trigger。
5. 一级导航固定为 Today、Inbox、Upcoming、Projects、All；Calendar、Completed、Automation、Review 是二级视图。
6. `attentionDate` 在用户显示时区中由 `min(plannedFor, deadline)` 派生，不持久化。Today 展示 `pending` 且 attentionDate 已到今天或逾期的 Todo；Upcoming 只展示未来 attentionDate 并按日期去重。

#### 提醒

1. 用户把执行模式改为 `reminder` 并配置一个或多个精确 trigger。
2. 当前唯一提醒出口是 desktop；本 change 不提供 Bridge/社交路由，也不从 Agent 配置猜测通知目标。
3. 到点后 TaskRegistry 唤醒 Todo handler；插件先以 reminder occurrence 的稳定 identity 持久化 handoff claim，再发射宿主已有的全局 `notification` 事件。
4. 插件保存 `handoff_claimed`、`handed_off`、`handoff_failed` 或 `handoff_unknown`。EventBus 正常返回只代表已经交给宿主事件流，不代表操作系统已经展示；重复唤醒不得自动再次发射，失败或不确定项只能由用户显式重试。

#### Agent 自动化

1. 用户显式选择 `agent_execute`、Agent、执行说明、授权策略和精确 trigger。任一必需项缺失时不能调度。
2. trigger 到期后，调度器可以批量 claim 候选，但每个 Todo × trigger occurrence 分别创建一个 AutomationRun 和一个 plugin-private Hana Session。
3. 每个 Run 使用稳定 identity；重试创建同一 Run 下的新 AutomationAttempt，不把不同 Todo 放入同一 Session。
4. Session 的 Agent、permission/reviewer 和宿主解析的 workspace 是执行权威；Todo 关联的 ResourceRef 只提供显式上下文，不能扩大 Session workspace 或 capability scope。
5. Run 在 Automation 视图中从 scheduled 进入 running，并收敛到 succeeded、failed、needs_action、cancel_requested 或 cancelled。AutomationHold 记录等待权限、等待用户或策略暂停。
6. Run 成功只保存摘要、结构化结果、诊断与 `sessionRef`，不会隐式完成 Todo。完整转录由 Hana Session 保存。
7. 用户关闭 Agent 自动化、完成/删除 Todo 或退出 `agent_execute` 时，取消 future schedule 与 queued Run，并请求终止 running TaskRegistry task 与 Hana Session。只有宿主确认后才从 `cancel_requested` 进入 `cancelled`。
8. 取消失败保持可见诊断且不自动重试；重新启用或恢复 Todo 不复活旧 Run。新 trigger occurrence 或显式重试才能再次执行。

#### 周期任务

1. RecurrenceRule 显式使用 `calendar` 或 `after_completion` 锚点。
2. calendar 支持按本地日历表达的日、周、月、年规则，并只物化 Upcoming 所需的有界窗口。
3. after_completion 在当前 occurrence 完成后按间隔产生下一条，同时只保留一个活动 occurrence。
4. 每个 occurrence 是独立 Todo，拥有稳定幂等键、状态、提醒和 AutomationRun。
5. “仅本次”编辑形成 occurrence override；“本次及未来”在当前 occurrence 建立系列边界并创建新规则版本，只替换边界后未完成的已物化 occurrence。
6. 跳过/删除本次保存 suppression key；暂停规则只停止新增；结束系列在确认后软删除边界后未完成的 occurrence。历史和已完成 occurrence 永不重写。

#### 删除、恢复与迁移

1. 普通 UI 删除执行软删除，并提供即时撤销和持久 Trash/恢复入口。
2. Agent、批量与永久删除先产生绑定 session、目标版本和过期条件的确认令牌；版本变化、session 不匹配或令牌失效时拒绝提交。
3. 删除 Project/List 不删除 Todo；受影响 Todo 解除归属并回到 Inbox。
4. 当前数据可显式导出为带 schema version 的 JSON；Review/Automation 报告只在用户主动导出时生成，不默认写工作区 Markdown。
5. 若存在真实 0.0.5 数据，迁移先从旧插件只读导出 JSON，再由新插件预览、校验并事务导入。新插件不直接打开或修改旧 SQLite。

### 边界、失败与稳定错误行为

- 无效输入、未知 Todo、过期版本、失效确认、未声明 capability、宿主不可用和超时必须返回结构化、可诊断失败；不得吞错、猜别名或降级到私有旁路。
- 同一 mutation 使用 `expectedVersion` 或等价版本前置；冲突时不产生部分写入，并要求调用者重新读取。
- 批量删除、系列分叉和导入必须返回逐项或事务结果；不能用单一 success boolean 隐藏部分完成。
- EventBus 边界保留现有 `NO_HANDLER`、`TIMEOUT`、`INVALID_PAYLOAD`、`FORBIDDEN`、`NOT_FOUND`、`INTERNAL_ERROR` 语义；插件领域错误标识由接口 Ticket 固定，但必须稳定区分校验、缺失、版本冲突、确认失效和 capability 失败。
- 桌面提醒在 handoff claim 持久化后、EventBus 发射前崩溃属于不确定结果。插件不得宣称送达或 exactly-once；恢复时展示 `handoff_unknown` 并等待显式重试选择。
- TaskRegistry 采用 at-least-once 唤醒；Todo 的 claim、occurrence、reminder、delivery 和 AutomationRun identity 必须让重复唤醒收敛为同一业务事实。
- Task handler 尚未就绪时，Page/CRUD 仍可用；插件以可取消、有限次数的 readiness retry 等待已有 `task:*` handler，成功后注册 Todo handler、恢复 schedule/Run，耗尽后显示不可用诊断。retry timer 只承担启动握手，不扫描到期 Todo，也不成为第二调度器。
- 精确本地时间必须解析成唯一 instant。DST 不存在的本地时间在保存时拒绝；DST 重复时间要求用户明确选择 offset。系统时区变化不改写已保存 IANA timezone 或 derived instant。
- 纯日期保持浮动 date，不进入精确提醒或 Agent trigger 调度。
- 自然语言无法识别的内容保留为普通输入，不生成隐藏字段或失败 Todo。
- Hana Session 不可访问时，Automation 仍显示最小结果和诊断，但不伪造完整转录。

### 状态转换与不变量

- Todo：`pending <-> completed`。软删除是正交归档状态；恢复保留版本和审计。完成、删除或退出 `agent_execute` 触发安全取消，但 Todo 状态保存不等待取消成功。
- AutomationRun：`scheduled -> running -> succeeded | failed | needs_action | cancel_requested`，`cancel_requested -> cancelled` 仅由宿主终止确认触发。显式重试在同一 occurrence 的 Run 下增加 AutomationAttempt。
- AutomationRun 成功不自动完成 Todo；Todo 完成也不把 Run 伪装成 succeeded。
- Reminder/Handoff：一个 reminder occurrence 只有一个稳定 handoff identity；`handed_off` 不自动重发，`handoff_failed` 或 `handoff_unknown` 只能显式重试，且界面不得把 handoff 显示为已送达。
- 全局提醒开关关闭后不创建新提醒投递，并取消尚未执行的 reminder schedule；已交付宿主的通知不可撤回。
- 全局 Agent 自动化开关关闭后不创建新 Run/attempt，并按 ADR-013 收敛已有运行。
- `plannedFor`、`deadline` 与 trigger 互不隐式创建或改写；attentionDate 只读派生。
- 一个 Todo 至多属于一个 Project/List，可以有多个 tags；Inbox 与 Today/Upcoming 是可重叠的归属/行动投影。
- RecurrenceRule 是系列权威；物化有界、幂等，历史和已完成 occurrence 不可变。
- Todo 私有数据库不保存完整 Session 消息、绝对工作区路径或 Bridge 路由猜测结果。
- 产品改动的唯一允许根目录是 `<Path>plugins/todolist/</Path>`；该目录外的新增、修改、删除或生成产品文件均使本 change 验收失败。当前 change 下的 SpecDev 规划工件只记录合同，不属于产品实现路径。

## 3. 用户故事

- **US-001**：作为 HanaKDE 用户，我希望在持久 Todo Page 中创建、查看、修改、完成和恢复任务，以便跨 Session 管理个人承诺。
- **US-002**：作为需要快速记录事项的用户，我希望低摩擦捕获并在 Today/Upcoming 中看到可预测的聚合结果，以便把记录和执行分开。
- **US-003**：作为有时间约束的用户，我希望分别表达计划、截止和桌面提醒，并看到通知交接的真实状态，以便在不混淆时间意图和送达结果的前提下获得提醒。
- **US-004**：作为任务数量增长的用户，我希望使用单层 Project/List、tags、Calendar、Completed 与 Review 组织和复盘任务，以便保持稳定归属而不引入复杂项目管理。
- **US-005**：作为可能误删或通过 Agent 批量操作的用户，我希望普通删除可恢复、危险删除必须确认，以便避免不可逆数据损失。
- **US-006**：作为管理重复事项的用户，我希望选择固定日历或完成后周期，并安全编辑单次或未来系列，以便历史保持真实。
- **US-007**：作为在聊天中工作的用户，我希望 Hana Agent 通过独立 namespaced tools 操作持久 Todo，同时保留现有 `todo_write` 的会话规划语义。
- **US-008**：作为授权 Agent 自动处理任务的用户，我希望每条 Todo 的运行、权限、取消、重试和结果相互隔离，以便副作用可控制、可解释。
- **US-009**：作为自动化使用者，我希望在 Automation 视图看到队列、失败、权限待办和 Session 跳转，以便诊断和恢复自动执行。
- **US-010**：作为参考插件用户或需要备份的用户，我希望显式导入、导出和按需生成报告，以便迁移和审计时不接管旧私有数据库。
- **US-011**：作为 HanaKDE 维护者，我希望 Todo 只消费当前插件、事件、任务、Session 与 ResourceIO 契约，并把全部实现封闭在一个可整块删除的目录中，以便内置功能不污染系统本体或形成第二套基础设施。

## 4. 验收合同

| ID | 前置条件 | 动作或事件 | 可观察结果 | 验证接缝 |
|---|---|---|---|---|
| AC-001 | 产品包含 builtin `todolist` 插件 | HanaKDE 冷启动并加载插件 | 插件状态为 builtin/loaded，Todo Page 与 CRUD 可用；社区 full-access 总开关不影响它，通用禁用/移除入口不可用于 builtin | 插件内 PluginManager harness + desktop Playwright |
| AC-002 | Page 与 Agent tools 指向同一 Todo store | 任一入口创建或更新 Todo，另一入口重新读取 | 两端看到同一 id、version、字段和状态，不存在独立 UI 状态副本 | route/tool 应用服务集成 |
| AC-003 | 现有 `todo_write` 可用 | 安装并调用 Hana Todo tools | `todo_write` 的名称、会话快照和 Session UI 行为保持不变；持久插件 tools 使用 `todo_*` 且不注册 `todo_write` | 既有 TodoWrite 回归 + 工具目录测试 |
| AC-004 | Todo 为 pending/manual | 用户或 Agent 执行创建、查询、更新、完成、恢复 | mutation 使用稳定 id/version；查询有界分页；完成/恢复只改变 Todo 主状态和审计字段 | application service + route/tool Vitest |
| AC-005 | Todo 具有 plannedFor/deadline 组合 | 用户打开 Today 或 Upcoming | attentionDate 在显示时区派生；Today 分 Overdue/Today；Upcoming 只按未来 attentionDate 出现一次；无日期 Todo 不进入 | 领域查询单测 + UI 集成 |
| AC-006 | 用户在不同页面快速捕获 | 输入自然语言并提交 | 全局默认 Inbox；Today/Project/日期上下文显式显示继承 chip；未显示或已移除的解析字段不写入 | React 组件测试 + Playwright |
| AC-007 | 存在 Project/List 与 Todo | 用户归属、过滤或删除 Project/List | Todo 至多一个 Project/List、tags 可多选；删除 Project/List 不删除 Todo，Todo 回到 Inbox | 领域/持久化集成 |
| AC-008 | 用户输入 date 或 zoned exact time | 保存、跨时区查看或遇到 DST gap/overlap | date 保持浮动；exact 保存 local/timezone/instant；gap 拒绝，overlap 要求明确 offset；系统时区变化不改写 instant | 时间领域单测 |
| AC-009 | 新建或编辑 Todo | 未显式选择副作用模式 | 默认 manual；plannedFor/deadline 不创建 reminder 或 AutomationRun；缺少 Agent/说明/授权/精确 trigger 的 agent_execute 拒绝调度 | 领域 + scheduler 集成 |
| AC-010 | reminder 已配置 | trigger 到期 | 插件先持久化稳定 handoff claim，再发射已有 `notification` 事件；正常返回记录 handed_off，但 UI 明确它不是操作系统送达回执 | 插件内 EventBus harness + handoff store |
| AC-011 | 同一 reminder 被重复唤醒或 handoff 中途崩溃 | scheduler 重放、用户显式重试 | handed_off 不自动重发；failed/unknown 可显式重试；重复唤醒收敛为同一 handoff identity，不伪装 delivered | 插件内故障注入 + handoff store |
| AC-012 | Page/CRUD 可用 | 用户分别关闭提醒或 Agent 自动化 | 只取消对应 schedule/Run，另一后台能力和 CRUD 不受影响；重新开启不复活旧 Run | 配置/TaskRegistry 集成 |
| AC-013 | Todo 尚未永久删除 | 普通 UI 删除、撤销、Trash 恢复 | 删除立即从活动视图消失，撤销/恢复后保留业务字段和审计；没有永久数据丢失 | application service + Playwright |
| AC-014 | Agent/批量/永久删除目标已读取 | prepare 后目标版本变化、session 不匹配、令牌失效或正常 confirm | 前三种拒绝且无部分写入；有效 confirm 才执行，并返回逐项/事务结果 | confirmation 集成 |
| AC-015 | 创建 calendar 或 after_completion RecurrenceRule | 物化、重复补齐或完成 occurrence | calendar 只补齐有界窗口且幂等；after_completion 未完成不生成下一条，完成后只生成一个活动下一条 | recurrence + store Vitest |
| AC-016 | 周期已有历史与未来 occurrence | 编辑本次、本次及未来、跳过、暂停或结束系列 | override/规则版本/suppression 按合同生效；历史和已完成项不变；危险未来批量变更要求确认并可事务回滚 | recurrence 集成 |
| AC-017 | agent_execute 配置完整且精确 trigger 到期 | scheduler claim 候选 | 每个 Todo × occurrence 只创建一个 Run 和一个 plugin-private Session；不同 Todo 不合并会话 | TaskRegistry/Session 集成 |
| AC-018 | 同一 Run 失败或 needs_action | 用户显式重试 | 同一 Run 增加 AutomationAttempt；权限、workspace、成本、结果和取消仍只归属该 Todo/occurrence | automation service 集成 |
| AC-019 | Agent Session 返回成功、失败或结构化结果 | Run 收敛 | 插件保存 sessionRef、摘要、结果和诊断；Todo 仍保持原 pending/completed 状态，除非另有显式 Todo mutation | run protocol + store 集成 |
| AC-020 | Run queued 或 running | 关闭自动化、完成/删除 Todo 或退出 agent_execute | queued/future 被取消；running 进入 cancel_requested 并请求 Task/Session 终止；仅确认后 cancelled；失败可见且不自动重试 | TaskRegistry + Session 取消故障注入 |
| AC-021 | 存在不同状态 Run | 打开 Automation 或 Todo 详情 | Automation 可筛选 scheduled/running/needs_action/failed/succeeded/cancel_requested/cancelled，并提供合法重试/取消/Session 跳转；Todo 详情只显示最近摘要 | React + route 集成 + Playwright |
| AC-022 | Run 拥有 Session | 查看详情、导出报告或 Session 不可访问 | 完整对话只从 Hana Session 读取；插件库无消息副本；报告默认不生成；Session 缺失时仍显示最小诊断 | store 检查 + Session 集成 |
| AC-023 | HanaKDE 冷启动且 `task:*` handler 晚于插件 onStartup 就绪 | builtin plugin 执行 readiness handshake | 插件内有限 retry 在 handler 出现后完成 Todo handler/schedule 注册；耗尽时后台功能进入可诊断不可用状态；没有 Todo 到期扫描 timer | 插件内启动时序 harness + 假时钟 |
| AC-024 | 存在到期或漏跑 schedule | 重启、重复唤醒、handler 恢复 | 启动补偿漏跑，稳定 identity 防止重复 occurrence/reminder/Run；取消后的 schedule 不执行 | TaskRegistry 持久化/假时钟测试 |
| AC-025 | change 实现完成 | 审计相对基线的产品文件变更 | 所有新增、修改、删除及生成的产品文件都位于 `<Path>plugins/todolist/</Path>`；`core/`、`server/`、`desktop/`、`shared/`、`lib/`、`hub/`、`cli/`、`packages/`、`scripts/`、公共 `tests/` 与其它插件均无改动 | Git path allowlist + clean-boundary audit |
| AC-026 | Todo 关联 ResourceRef 或 Automation 创建 Session | 打开资源或执行 Agent | 只使用 ResourceRef 与宿主 Session workspace；Renderer/DTO/日志不持久化绝对路径，关联资源不扩大 workspace scope | ResourceIO/Session 安全集成 |
| AC-027 | 用户提供受支持版本 JSON 或旧 SQLite | 执行导入预览和提交 | JSON 显示版本、计数、冲突与引用诊断后事务导入；重复提交可判定；旧 SQLite 被拒绝且不修改 | migration fixture + dry-run/rollback |
| AC-028 | 用户显式请求导出或报告 | 导出当前数据、Review 或 Automation 报告 | 生成版本化 JSON 或按需 Markdown 下载；默认无工作区文件写入、无自动报告 | route/tool 下载集成 |
| AC-029 | 无效字段、stale version、宿主 capability 失败或批处理错误 | Page/tool/handler 执行操作 | 返回稳定类别和脱敏诊断；无静默 fallback、无吞错、无未声明部分成功 | route/tool schema + 故障注入 |
| AC-030 | 存在有日期、完成和自动化数据 | 打开 Calendar、Completed 或 Review | 视图从同一 store 派生；Calendar 展示时间意图而不创建新状态，Completed 可恢复，Review 只展示基础任务/运行汇总和显式导出 | query projection + UI 测试 |
| AC-031 | 语言为 zh-CN、zh-TW、ja、ko 或 en，且窗口为桌面或窄布局 | 完成捕获、编辑、删除恢复和 Automation 操作 | 文本本地化；键盘、焦点、ARIA、主题和窄布局可用；控件无文本裁切或互相遮挡 | component/a11y + desktop/narrow Playwright 截图 |
| AC-032 | 构建精确产品产物 | 使用仓库既有 build/seed 流程并检查产物 | builtin Todo、assets 和运行依赖由既有通配复制流程进入产物；从产物加载无 workspace 包解析依赖；删除 `<Path>plugins/todolist/</Path>` 后引擎仍能构建和运行非 Todo 测试 | build/seed/package smoke + path audit |
| AC-033 | 普通 Hana Session 枚举工具 | 插件已加载 | 只暴露用户级 namespaced Todo tools；claim、schedule runner 和 run completion handler 不作为任意 Session 可调用工具 | PluginManager 工具目录测试 |

### 用户故事追踪

| 用户故事 | 覆盖的验收合同 |
|---|---|
| US-001 | AC-001、AC-002、AC-004、AC-013 |
| US-002 | AC-005、AC-006、AC-031 |
| US-003 | AC-008、AC-010、AC-011、AC-012 |
| US-004 | AC-007、AC-030 |
| US-005 | AC-013、AC-014 |
| US-006 | AC-015、AC-016 |
| US-007 | AC-002、AC-003、AC-004、AC-033 |
| US-008 | AC-009、AC-017、AC-018、AC-019、AC-020、AC-023、AC-024 |
| US-009 | AC-021、AC-022 |
| US-010 | AC-027、AC-028 |
| US-011 | AC-003、AC-012、AC-025、AC-026、AC-029、AC-032 |

## 5. 范围

### IN

- `<Path>plugins/todolist/</Path>` 内置 `professional-react/full` 插件：manifest、Page、assets、routes、tools、lifecycle、私有持久化、测试、fixture、构建配置和所需运行依赖声明。
- 持久 Todo CRUD、分页查询、搜索、priority、Project/List、tags、ResourceRef、plannedFor、deadline、typed triggers、Trash/恢复与版本冲突。
- Today、Inbox、Upcoming、Projects、All 一级视图，以及 Calendar、Completed、Automation、Review 二级视图。
- 桌面 EventBus handoff、失败/不确定状态的显式重试和后台总开关；不宣称系统送达回执。
- `manual/reminder/agent_execute`、AutomationRun/Attempt/Hold、plugin-private Hana Session、取消/重试/诊断与按需报告。
- calendar/after_completion RecurrenceRule、有界 occurrence 物化、override、系列边界版本、suppression、暂停/结束。
- 版本化 JSON 导出；若存在真实迁移样本，提供 0.0.5 JSON importer、预览、完整性校验和回滚。
- 插件内 TaskRegistry readiness handshake、handler/schedule 恢复与启动诊断；不修改宿主启动顺序，不增加独立到期扫描器。
- 直接用户流程所需的桌面/窄布局 Playwright，领域、接口、存储、安全和故障路径 Vitest，以及产物 smoke。

### REUSE

- PluginManager、builtin source、plugin dataDir、surface session 与 route request context 的既有行为，只读参考：`<Path>core/plugin-manager.ts</Path>`、`<Path>core/plugin-route-request-context.ts</Path>`。
- TaskRegistry 持久 schedule、task lifecycle 与 EventBus handler 的既有行为，只读参考：`<Path>lib/task-registry.ts</Path>`、`<Path>server/task-bus-handlers.ts</Path>`、`<Path>hub/event-bus-capabilities.ts</Path>`。
- 现有全局 `notification` EventBus event 到桌面客户端的 best-effort handoff；不调用或修改 NotificationService。
- Session/Agent stable capability 与 `sessionId/sessionRef`：`<Path>hub/event-bus-capabilities.ts</Path>`。
- ResourceIO 与 ResourceRef；不创建第二套资源地址或接受任意绝对路径。
- `@hana/plugin-sdk`、`@hana/plugin-runtime`、`@hana/plugin-components` 与 `HanaThemeProvider`。
- 参考实现中经重验的纯 recurrence/date 算法、迁移意图和测试场景；不复用其 HostAdapter、双 timer 或自包含 UI。
- Vitest 作为默认门禁，Playwright 只覆盖直接用户流程。

### OUT

- **OOS-001**：替换、迁移或双向同步核心 `todo_write` 与 Session Todo UI；两者用途和数据权威不同。
- **OOS-002**：聊天 Card 或富 native card composition；公开 SDK 的 rich card/hydration 合同尚未稳定。
- **OOS-003**：团队、多 owner、共享 Project、指派协作、评论或远程同步。
- **OOS-004**：多层子任务、复杂依赖、甘特、看板、Habit、Pomodoro、位置提醒和生产力评分。
- **OOS-005**：Todo 专用 Core 表、Core scheduler、通知 transport、私有 Session 轮询或 `setInterval` 兜底。
- **OOS-006**：直接打开、迁移或修改参考插件 SQLite；旧数据库只作为只读导出来源。
- **OOS-007**：默认生成工作区 Markdown 报告、复制完整 Session 对话或为默认报告申请 `resource.write`。
- **OOS-008**：独立原生移动端 Todo surface；首发 Page 仍必须在窄 WebView/iframe 中可用。
- **OOS-009**：`<Path>plugins/todolist/</Path>` 之外的任何产品代码、公共测试、SDK、构建脚本、配置或其它插件改动。
- **OOS-010**：新增 `notification:send` capability、调整 TaskRegistry 宿主启动顺序、Bridge/社交通知投递或逐渠道送达回执；这些都需要超出插件目录的宿主合同。

## 6. 已锁定实现约束

- **DEC-001**：Todo 领域属于 builtin `<Path>plugins/todolist/</Path>`，它是本 change 唯一产品写入根；删除该目录后系统仍完整。来源：ADR-014。
- **DEC-002**：按当前 SDK 契约重建 `professional-react/full` 插件，不整体复制参考实现。来源：ADR-002。
- **DEC-003**：自动副作用必须由 `manual/reminder/agent_execute` 显式模式授权，默认 manual。来源：ADR-003。
- **DEC-004**：Todo 与 AutomationRun 状态正交，Run 成功不隐式完成 Todo。来源：ADR-004。
- **DEC-005**：plannedFor、deadline 与 trigger 分离；date 与 zoned exact time 是不同类型。来源：ADR-005。
- **DEC-006**：提醒只使用已有全局 `notification` EventBus event 做 desktop best-effort handoff；插件持久化 handoff identity/status，不宣称送达，不提供 Bridge。来源：ADR-014。
- **DEC-007**：Hana Session 是完整自动化对话唯一权威，Todo 只存 sessionRef 与最小运行结果。来源：ADR-007。
- **DEC-008**：TaskRegistry 仍是唯一到期调度权威；插件通过有界 readiness retry 适配当前 handler 晚就绪顺序，retry 不扫描 Todo，到期调度不得使用第二 timer。来源：ADR-014。
- **DEC-009**：旧数据只通过版本化 JSON importer，禁止直接接管旧 SQLite。来源：ADR-009。
- **DEC-010**：AutomationRun 以 Todo × trigger occurrence 为隔离单位，同一 occurrence 重试形成 attempt。来源：ADR-010。
- **DEC-011**：RecurrenceRule 是周期权威，calendar 有界物化，after_completion 同时一个活动 occurrence。来源：ADR-011。
- **DEC-012**：系列变更通过 occurrence override 或边界规则版本化，历史和已完成 occurrence 不可变。来源：ADR-012。
- **DEC-013**：撤销自动化授权使用宿主确认的 fail-closed 取消，先 cancel_requested 后 cancelled。来源：ADR-013。
- **DEC-014**：内置插件始终 full-access/loaded，但必须显式声明所需敏感 capability；不得依赖 legacy manifest 全放行。来源：`CODE:<Path>core/plugin-manager.ts</Path>`、`CODE:<Path>core/plugin-route-request-context.ts</Path>`。
- **DEC-015**：插件至少声明 session.read/write、agent.read、task.read/write/control，以及实际使用的 resource.read/search；UI 仅声明实际使用的 resource.open/resource.pick。默认不声明 resource.write，也不虚构 notification capability。
- **DEC-016**：Agent tools 使用 `todo_` namespace，至少覆盖 create/query/get/update/complete/reopen、delete prepare/confirm、Project、recurrence、Automation query/retry/cancel 与 reminder handoff retry；内部 scheduler claim 和 run completion handler 不暴露为普通工具。
- **DEC-017**：现有 `todo_write` 和 `hana.todo_state` 契约保持不变；持久 Hana Todo 不读取或写入其 Session 快照。来源：`CODE:<Path>lib/tools/todo.ts</Path>`、`CODE:<Path>lib/tools/todo-constants.ts</Path>`。
- **DEC-018**：所有 UI route 请求使用 surface session 和 `hana.api.fetch()`；浏览器资产放在 `assets/`，不自建静态资源 route，不硬编码插件 API 根。
- **DEC-019**：新增测试、fixture、Playwright 配置、构建脚本和依赖声明也必须位于 `<Path>plugins/todolist/</Path>`；只允许运行仓库既有命令，不得为接入 Todo 修改其定义。来源：ADR-014。

## 7. 数据、接口与兼容

- **公共接口变化：** 只新增 builtin `todolist` Page、同插件 authenticated routes 和 namespaced Agent tools。系统 EventBus、TaskRegistry、Session/Agent、ResourceIO、SDK 与构建接口均不变化；插件对现有 task handler 晚就绪和 notification event 无回执的事实自行适配。
- **Agent tool 行为：** read tools 为只读；只修改 Todo 私有数据的 mutation 使用 plugin_output 类权限；通知重发和 Agent 执行/取消属于 external side effect 或 reviewer-bound。所有 mutation 接受稳定目标和版本前置，危险删除使用 session-bound token。
- **Route 行为：** routes 按 todos、projects、recurrence、automation、notifications、import/export 资源组提供 Page 所需能力；保持 authentication principal、plugin id 和 capability grant 来自宿主 context，不信任 body 中的 owner/plugin/session 近似字段。
- **数据模型与持久化：** 插件私有 versioned durable store 位于 PluginManager 提供的 Todo dataDir。至少持久化 Todo、Project/List、typed time、trigger、Reminder/Handoff、AutomationRun/Attempt/Hold、RecurrenceRule/version/occurrence/suppression、Trash、confirmation 与 import audit。每个 mutation 有 version/audit 时间；完整 Session message、token secret 和任意绝对路径不进入该 store。
- **ResourceRef：** Todo 可以关联宿主 ResourceRef；持久化规范引用而非解析路径。Agent Session 的宿主 workspace 是执行边界，ResourceRef 只提供已授权上下文。
- **兼容要求：** `todo_write`、Session Todo Card、现有 PluginManager source priority、TaskRegistry 其它 task 类型、NotificationService 直接内部调用者和 community plugin 加载行为不得回归。由于它们没有任何代码改动，回归验证以既有命令为观察证据；删除 `<Path>plugins/todolist/</Path>` 后非 Todo 引擎仍可构建运行。
- **迁移要求：** 新 store 使用自身 schema migration。旧 0.0.5 数据只有在提供真实脱敏样本后才实现/验收 importer；JSON 格式带版本，先 preview，再事务 commit，失败回滚并保留源。无真实样本不允许声称旧数据兼容完成。
- **发布或运维影响：** builtin source 自动加载且不能由社区插件管理入口移除；运营诊断需显示 capability readiness、schedule、最近 handoff 和 Run 错误。仓库既有构建流程必须把插件 server bundle、UI assets 和运行依赖放入 seed/产品产物，本 change 不修改该流程。

## 8. 非功能要求

- **NFR-001 安全与隐私：** 所有宿主能力显式声明并 fail closed；Session/Agent/Task 使用宿主 principal 与 stable ref；不信任 raw path、ownerId 或 pluginId 输入；不提供 Bridge route；完整对话不复制；报告不默认生成；诊断脱敏且不含绝对工作区路径或消息正文。
- **NFR-002 性能与容量：** Todo/query/Automation history 使用有界分页；calendar occurrence 只按可见 Upcoming 窗口滚动物化；scheduler 可批量 claim 但不合并 Run；Page 不因日志或完整 Session 加载阻塞基础列表。不得虚构固定耗时阈值，Ticket 以当前仓库基线和可重复数据集建立回归门。
- **NFR-003 可用性与可靠性：** 私有 store mutation、系列变更和 import 使用事务或可回滚边界；TaskRegistry at-least-once 唤醒由稳定 identity 收敛；重启恢复漏跑；取消和提醒 handoff 不伪装 exactly-once 或已送达；插件后台能力不可用时 CRUD 仍可用并展示诊断。
- **NFR-004 可访问性与视觉质量：** 每个 UI 垂直切片同时覆盖 zh-CN、zh-TW、ja、ko、en、键盘、焦点、ARIA、inherit 主题和窄布局。操作型页面保持安静、密集、可扫描；不复制参考实现的大型内联 DOM/CSS；文字、按钮、列表、弹层和详情不得裁切或重叠。
- **NFR-005 可观测性与运营：** AutomationRun/Attempt/Hold、schedule、reminder handoff、import 和确认失败都有稳定 identity、时间、状态和脱敏诊断；Page 与 tools 读取同一投影。错误按新失败、基线失败、环境失败或无效验证分类。
- **NFR-006 可维护性与分发：** server-side 插件入口和 UI bundle 不依赖仓库 workspace symlink 才能解析；参考代码复用有可审计清单；所有新增代码、测试、fixture、构建资产和依赖声明封闭在 `<Path>plugins/todolist/</Path>`；类型检查、lint、build、seed smoke 和相关测试通过。

## 9. 验证策略

| 接缝 | 层级 | 覆盖合同 | 现有先例或命令 | Evidence 类型 |
|---|---|---|---|---|
| Todo/时间/attentionDate/recurrence 领域服务 | 单元 | AC-004、AC-005、AC-008、AC-009、AC-015、AC-016 | 测试位于 `<Path>plugins/todolist/tests/</Path>`；参考测试意图来自 `<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/tests/recurrence.test.ts</Path>` | 测试输出与 fixture 摘要 |
| PluginManager + Todo routes/tools + private store | 集成 | AC-001、AC-002、AC-003、AC-004、AC-007、AC-013、AC-014、AC-029、AC-033 | 新增 harness 位于 `<Path>plugins/todolist/tests/</Path>`；既有 `<Path>tests/plugin-manager.test.ts</Path>` 仅作只读先例 | 命令、退出状态、AC 映射 |
| EventBus desktop notification handoff | 集成/故障注入 | AC-010、AC-011、AC-029 | `<Path>plugins/todolist/tests/</Path>` 内 EventBus fake/真实事件形状 harness | handoff 状态、重复/崩溃结果 |
| TaskRegistry readiness/schedule/recovery | 集成/假时钟 | AC-012、AC-017、AC-020、AC-023、AC-024 | 新增 harness 位于 `<Path>plugins/todolist/tests/</Path>`；既有 `<Path>tests/task-registry.test.ts</Path>` 仅作只读先例 | 冷启动晚就绪、重启、重复唤醒、取消日志 |
| Hana Session/Agent automation harness | 集成/故障注入 | AC-017、AC-018、AC-019、AC-020、AC-022、AC-026 | 新增 harness 位于 `<Path>plugins/todolist/tests/</Path>`；既有能力测试仅作只读先例 | Run/attempt/sessionRef 与取消结果 |
| JSON import/export 与 schema migration | 集成/dry-run | AC-027、AC-028、AC-029 | 脱敏 versioned fixture 与测试位于 `<Path>plugins/todolist/tests/</Path>` | preview、commit、rollback、完整性摘要 |
| React Page 与 `@hana/plugin-components` | 组件/jsdom | AC-005、AC-006、AC-021、AC-030、AC-031 | 组件测试位于 `<Path>plugins/todolist/tests/</Path>` | role/label/focus/locale 断言 |
| Todo 直接用户流程 | Desktop/narrow Playwright | AC-001、AC-006、AC-013、AC-021、AC-031 | 配置与 specs 位于 `<Path>plugins/todolist/tests/e2e/</Path>`，复用仓库已安装的 Playwright | screenshot、DOM/role、交互结果 |
| 产物、路径边界与回归 | 构建/全量 | AC-003、AC-023、AC-025、AC-032 | 运行既有 `npm run typecheck`、`npm run lint`、`npm run build:server`、`npm run build:renderer`、`npm run verify:seed-kit`、`npm test`，并审计 Git path allowlist | 构建日志、seed 内容、全量测试摘要、越界文件列表为空 |

当前 grounding 基线已执行：

```text
npx vitest run tests/task-registry.test.ts tests/hub-plugin-session-agent-capabilities.test.ts tests/event-bus-capabilities.test.ts tests/plugin-route-request-context.test.ts tests/plugin-ui-capabilities.test.ts tests/plugin-sdk-examples.test.ts tests/plugin-runtime.test.ts tests/todo-constants.test.ts tests/todo-write-tool.test.ts
```

结果为 9 个测试文件、89 项测试通过。该结果只证明现有接缝基线，不构成 Todo 实现证据。

## 10. 风险、假设与未决问题

### 风险

- **插件边界风险：** 严格禁止宿主改动后，Todo 必须适配当前 TaskRegistry handler 晚就绪；有界 readiness retry 耗尽时后台能力降级并可诊断，不能退回第二扫描器。
- **投递不确定性：** 当前全局 `notification` event 没有送达回执；Spec 只承诺 desktop handoff，以稳定 identity、持久 handoff 状态和显式重试降低重复风险，Bridge 不在范围内。
- **时区风险：** DST overlap/gap、用户跨时区和 calendar recurrence 容易产生重复或漏跑，需要纯领域假时钟和多时区 fixture。
- **取消风险：** Hana Session/Task 终止是异步的；`cancel_requested` 与取消失败必须真实可见，不能乐观收敛。
- **心智模型风险：** 持久 Hana Todo 与 `todo_write` 名称相近；UI、tool 描述和文档必须明确一个跨 Session、一个仅当前 Session。
- **迁移风险：** 尚无真实旧数据样本；无样本时不能凭参考 schema 宣称兼容完成。
- **UI 范围风险：** Page 同时包含捕获、计划、周期和 Automation；必须按垂直流程交付，不能把完整日志重新塞回 Todo 编辑器。

### 已采用的低影响假设

- 插件 id 与目录名均为 `todolist`，展示名为 Hana Todo；由 manifest、builtin discovery 与 namespaced tool 目录测试验证。
- priority 保持可选的简单排序提示，不扩张为 Eisenhower/评分系统；通过 Todo schema、排序查询和 UI 组件测试验证。
- Trash 不在本 change 中自动按天数永久清理；永久清理只能显式触发并经过确认，通过假时钟与确认集成测试验证不会自动清理。
- calendar 物化窗口由 Upcoming 查询范围驱动，不在 Spec 中固定条数；测试验证有界、幂等和窗口扩张即可。
- Review 只提供 Todo/Automation 的基础可解释汇总与显式导出，不引入目标评分或行为建议；通过 query projection 与 UI 测试验证展示字段来自同一 store。

### 执行前门禁

实现开始前仍需按永久 ADR-0021 运行可执行 repository preflight；这是一项执行门禁，不是产品未决问题。

### 未决问题

无。
