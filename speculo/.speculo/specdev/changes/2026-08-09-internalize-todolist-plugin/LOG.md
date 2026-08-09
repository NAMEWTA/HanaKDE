# TODOList 内置插件设计日志

本文件按轮次追加设计决策轨迹；尚未获得用户确认的候选结论不会写成共识。

## LOG-001 — 2026-08-09T10:27:08+08:00 — 功能落点
- **设计树节点：** D-001
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** TodoList 领域能力应作为内置插件还是 HanaKDE 系统本体。
- **事实与来源：** 用户明确要求形成自己的内置插件；`CODE:<Path>core/plugin-manager.ts</Path>`、`CODE:<Path>lib/task-registry.ts</Path>`、`CODE:<Path>lib/notifications/notification-service.ts</Path>` 证明宿主已定义插件、任务、通知与会话基础能力。
- **选项：** Todo 专用系统本体；完整内置插件；Todo 插件加通用宿主契约前置。
- **推荐：** Todo 领域整体落到内置插件，缺失的非 Todo 专用契约在系统本体独立补齐。
- **结论：** `plugins/todo/` 拥有 Todo 领域、私有数据、UI、routes、tools 与自身任务 handler；系统本体只拥有通用 Task、Session、Notification、ResourceIO 契约。
- **原因：** 功能可由插件贡献面表达、数据归插件私有、可整块删除，且不应定义跨组件共享原语。
- **影响工件：** CONTEXT / ADR / Spec / Ticket
- **约束或不变量：** Todo 插件消费契约，不定义或绕过宿主契约；不得增加 Todo 专用 Core 表、调度器或通知传输器。
- **后续：** 下游 Spec 将宿主通用契约缺口拆成独立前置合同。
- **替代/被替代：** 无

## LOG-002 — 2026-08-09T10:27:08+08:00 — 参考实现集成就绪性
- **设计树节点：** 不适用
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** `temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final` 能否作为当前 HanaKDE 的可直接迁入实现。
- **事实与来源：** `CODE:<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/src/index.ts</Path>` 错用 EventBus subscribe 参数顺序；`CODE:<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/src/infrastructure/hana-host-adapter.ts</Path>` 调用当前仓库没有 handler 的 notification/activity 别名；自带测试为 88/90，通过 typecheck 与 package verify，但两项 macOS 真实路径测试失败。
- **选项：** 直接迁入；把它当成领域与测试研究样本；完全忽略。
- **推荐：** 作为研究样本，逐条重验，不作为集成完成的事实来源。
- **结论：** 参考实现内部拥有较完整的领域意图和测试素材，但宿主 mock 掩盖了真实契约缺口，不能直接复制为内置插件。
- **原因：** 自测只证明 mock 假设；当前 HanaKDE 没有 `notification:notify`/`notification:send` 或助手活动写入 handler，EventBus 能力目录与真实 handler 才是集成权威。
- **影响工件：** Spec / Ticket
- **约束或不变量：** 每个宿主调用必须对照当前能力目录、handler 和集成测试；不以文档“全部覆盖”替代运行证据。
- **后续：** 设计完成后为真实 PluginManager/EventBus/TaskRegistry/NotificationService 接缝建立集成测试。
- **替代/被替代：** 无

## LOG-003 — 2026-08-09T12:01:22+08:00 — 功能落点判定复核
- **设计树节点：** D-001
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** TodoList 是否能完整装入内置插件盒子，还是因提醒与 Agent 自动化而必须落到系统本体。
- **事实与来源：** `CODE:<Path>plugins/</Path>`、`CODE:<Path>core/plugin-manager.ts</Path>`、`CODE:<Path>hub/event-bus-capabilities.ts</Path>`、`CODE:<Path>lib/task-registry.ts</Path>` 与 Hana Plugin SDK 证明 Page、routes、tools、lifecycle、TaskRegistry、Session/Agent、ResourceIO 均已有插件贡献面；当前缺失的 notification capability 与 task 启动顺序属于通用宿主契约，不是 Todo 领域。
- **选项：** Todo 全部进入系统本体；Todo 插件自行重建宿主能力；Todo 领域内置插件 + 独立通用宿主前置。
- **推荐：** 维持 D-001：Todo 领域整体作为内置插件，通用契约缺口拆到系统本体。
- **结论：** 七条判据逐项为：1 特权子系统=能装进盒子，Todo 只消费 Session/Task/Notification/ResourceIO；2 共享契约原语=能装进盒子，Todo handler 仅服务自身；3 启动常驻=能装进盒子，提醒/自动化可关闭，插件不是任何 Session 前置基础设施；4 可整块删除=能；5 贡献面=能；6 权限自洽=能，以 full-access 和最小 capabilities 声明；7 产物归属=能，Todo 数据属于插件私有存储，通知和 Session 只是宿主交付引用。软门破盒数为 0，决策树叶子为内置插件。
- **原因：** 删除 `<Path>plugins/todo/</Path>` 后 HanaKDE 引擎仍完整；Todo 新增的是可选领域能力而非系统原语。最强反方是后台提醒/巡查需要 onStartup，以及当前 notification/task 接缝需要系统修改，但这些应作为可复用宿主能力独立修复，不能把 Todo 领域一并焊入 Core。
- **影响工件：** ADR / Spec / Ticket
- **约束或不变量：** 落点为 `<Path>plugins/todo/</Path>`；贡献面为 page、routes、tools、lifecycle 与可选 skill；权限为 full-access，声明 session、agent、task、notification、必要的 resource.read/search 与 `ui.hostCapabilities.resource.open`，不为默认报告申请 resource.write。
- **后续：** D-011 与 D-020 决定通用宿主前置；D-002 决定是否按当前 hana-plugin-creator 形态重建。
- **替代/被替代：** 无

## LOG-004 — 2026-08-09T12:01:22+08:00 — Agent 巡查与宿主接缝审计
- **设计树节点：** 不适用
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** 参考 0.0.5 的 Agent 自动巡查为什么在真实 HanaKDE 中不可靠。
- **事实与来源：** `CODE:<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/src/application/todo-service.ts</Path>`、`CODE:<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/src/index.ts</Path>`、`CODE:<Path>core/plugin-context.ts</Path>`、`CODE:<Path>server/index.ts</Path>`、`CODE:<Path>hub/event-bus.ts</Path>`、`CODE:<Path>hub/event-bus-capabilities.ts</Path>`、`CODE:<Path>lib/task-registry.ts</Path>`；本轮运行参考插件 test、typecheck、package verify，并执行纯日期巡查探针。
- **选项：** 在原 HostAdapter 上继续增加兼容别名与轮询；修复少数 SQL 后直接迁入；以稳定 SDK/helper 和单一宿主契约重写自动化链。
- **推荐：** 重写自动化链，不迁入 HostAdapter 的别名探测与双调度器。
- **结论：** 已确认六类缺陷：一，`patrolDue/listDueAgents` 未调用已经存在的 `hasExactDueTime`，实测纯日期 Todo 的 eligibleCount=1；二，插件用 `bus.subscribe(eventType, handler)`，而真实代理契约是 `subscribe(callback,{types})`，权限变化 hold 不会按预期解除；三，`server/index.ts` 在 `engine.initPlugins()` 之后才注册 task bus handler，onStartup 插件首次注册 handler/schedule 必然失败；四，插件同时启动 TaskRegistry schedule 与 `setInterval`，形成双唤醒；五，当前能力目录没有 notification handler，mock 测试通过不代表实机投递可用；六，88/90 测试通过，两个报告路径测试因 macOS `/var` 与 `/private/var` 实路径别名失败，typecheck 与 package verify 通过。
- **原因：** 参考实现把宿主最终一致性、能力缺失、生命周期顺序和领域重试混在一个 1,736 行 HostAdapter 中，用兼容 fallback 掩盖了契约不存在或尚未就绪的事实。
- **影响工件：** Spec / Ticket
- **约束或不变量：** 内置版的自动化必须有唯一 scheduler 权威、精确触发类型、每次运行的稳定 identity、可取消/可恢复状态和真实宿主集成测试；不得用 mock handler 证明跨层接缝完成。
- **后续：** D-004、D-005、D-011、D-012、D-018、D-020 关闭后形成 AutomationRun 与宿主前置合同。
- **替代/被替代：** LOG-002 的一般性集成风险被本条具体化，不替代 LOG-002。

## LOG-005 — 2026-08-09T12:01:22+08:00 — Page 交互与插件 UI 边界审计
- **设计树节点：** 不适用
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** 参考 0.0.5 的 Page 为什么不适合作为内置版 UI 基线。
- **事实与来源：** `CODE:<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/src/ui/app.ts</Path>`、`CODE:<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/src/ui/styles.ts</Path>`、`CODE:<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/tests/mature-ui.test.ts</Path>`、`CODE:<Path>PLUGIN_SDK.md</Path>`、`CODE:<Path>PLUGINS.md</Path>` 与 `CODE:<Path>skills2set/hana-plugin-creator/SKILL.md</Path>`。浏览器运行时本轮不可用，因此这里只记录静态结构与可执行测试事实，不声明像素级结论。
- **选项：** 保留自包含页面并调 CSS；复制页面后换术语；以当前 professional-react 插件 UI 边界重做信息架构。
- **推荐：** 以 professional-react/full 插件重做，使用 `HanaThemeProvider mode=\"inherit\"`、`@hana/plugin-components`、`assets/` 与 `hana.api.fetch()`。
- **结论：** 0.0.5 的一级导航把 Day Todo、最近待办、日程概览、待办箱、数据复盘并列，混合时间范围、收集箱和分析维度；除 Inbox 外的所有快速输入都会静默继承全局 `selectedDate`，在过滤/复盘等视图可创建到意外日期；单个编辑弹窗同时承载日期、提醒、优先级、标签、Agent、通知渠道、周期、资源和完整巡查日志，主任务编辑与自动化诊断没有分层；其测试还强制内联 2,270 行脚本和 1,040 行 CSS，并保留自定义 assets handler，与当前 SDK 的正式静态资源边界冲突。
- **原因：** 页面在多轮补丁中围绕实现能力堆叠入口，没有先固定用户的捕获、计划、执行、复盘主流程；DOM 字符串重渲染也让焦点、弹层、状态恢复与窄屏交互难以系统验证。
- **影响工件：** Spec / Ticket
- **约束或不变量：** 新 UI 不复制 renderer internals，不在 route shell 内联大型 JS/CSS，不让自动化日志占据任务编辑主路径；桌面与窄屏必须用真实可访问元素和截图验证。
- **后续：** D-002、D-015、D-016、D-017、D-019 决定新页面范围与入口。
- **替代/被替代：** 无

## LOG-006 — 2026-08-09T12:01:22+08:00 — 主流 Todo 产品模式研究
- **设计树节点：** 不适用
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** 市场上哪些 Todo 功能与交互模式值得成为 Hana Todo 的设计输入，哪些只是范围膨胀。
- **事实与来源：** R-001：Things 以 Inbox 捕获，并用 Today、Upcoming、Anytime、Someday 控制任务何时进入注意范围，还明确区分 start date、deadline 与 reminder，来源 `RESEARCH:<Url>https://culturedcode.com/things/support/articles/4001304/</Url>`、`RESEARCH:<Url>https://culturedcode.com/things/support/articles/2803579/</Url>`；R-002：Todoist 的 Today 聚合跨 Project 的今日任务并强调重排/延期，task view 区分 date、deadline、reminder，来源 `RESEARCH:<Url>https://www.todoist.com/help/articles/plan-your-day-with-the-today-view-UVUXaiSs</Url>`、`RESEARCH:<Url>https://www.todoist.com/help/articles/use-the-task-view-to-manage-tasks-in-todoist-eDeRDO0C</Url>`；R-003：Todoist 与 Things 都区分固定日历周期和完成后周期，并把周期模板与当前 occurrence 的编辑语义分开，来源 `RESEARCH:<Url>https://www.todoist.com/help/articles/introduction-to-recurring-dates-YUYVJJAV</Url>`、`RESEARCH:<Url>https://culturedcode.com/things/support/articles/2803564/</Url>`；R-004：TickTick 将 Today/Tomorrow/Next 7 Days/Inbox 作为 smart lists，另提供多提醒、Calendar、Habit、Pomodoro 与 Matrix，来源 `RESEARCH:<Url>https://help.ticktick.com/articles/7055782283059396608</Url>`、`RESEARCH:<Url>https://ticktick.com/features?language=en_US</Url>`；R-005：Microsoft To Do 保持较小模型，以 My Day、steps、due date、reminder 和 repeat 为核心，来源 `RESEARCH:<Url>https://support.microsoft.com/en-US/ToDo/creating-daily-habits-with-microsoft-to-do</Url>`、`RESEARCH:<Url>https://support.microsoft.com/en-gb/office/add-due-dates-and-reminders-in-microsoft-to-do-064d9696-08d1-4433-bfdd-f661dc97491f</Url>`。
- **选项：** 复制全能型 Todo 套件；只做 Agent 自动化控制台；建立个人任务核心并以 Agent 执行为差异化扩展。
- **推荐：** 采用第三种：吸收 Inbox/Today/Upcoming、Project/List + tags、计划/截止/提醒分离、固定/完成后周期、快速捕获与可恢复删除；暂不复制团队协作、Habit、Pomodoro、复杂看板、位置提醒和统计套件。
- **结论：** 多产品交集不是“更多面板”，而是低摩擦捕获、可预测的今日聚焦、未来规划、清晰时间意图、稳定归属和可修正的周期。Hana 的差异点应是显式授权、可观察、可取消的 Agent AutomationRun，而不是用 Agent 巡查替代基础 Todo 心智模型。
- **原因：** 交集模式已被多种产品独立验证；全能型附加功能与 Hana 的 Agent 核心没有直接协同，首发引入会稀释可靠性与交互清晰度。
- **影响工件：** Spec / Ticket
- **约束或不变量：** 市场资料是设计输入，不是当前 change 的产品权威；日期、Project、自动化等高影响取舍仍由设计树和用户决定。
- **后续：** D-014 至 D-019 将研究结论转成可选择的产品合同。
- **替代/被替代：** 无

## LOG-007 — 2026-08-09T12:13:06+08:00 — 内化策略
- **设计树节点：** D-002
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** 直接迁入参考 0.0.5，还是按当前 HanaKDE 契约重新设计。
- **事实与来源：** LOG-002、LOG-004、LOG-005；`USER-DECISION:2026-08-09 全部按推荐确认`。
- **选项：** 整体复制后修补；契约优先重建并选择性复用。
- **推荐：** 以 hana-plugin-creator professional-react/full 形态重建。
- **结论：** 只复用经复核的领域算法、迁移思路与测试意图；宿主适配、调度、通知、巡查协议和 UI 按当前 SDK 重写。
- **原因：** 参考实现的 mock 契约、双调度器和自包含 UI 不能作为当前集成基础。
- **影响工件：** ADR / Spec / Ticket
- **约束或不变量：** 不以 17K 行参考实现整体复制作为迁移策略；每项复用均需重新验证。
- **后续：** 下游规划按专业 React full 插件结构拆分。
- **替代/被替代：** 无

## LOG-008 — 2026-08-09T12:13:06+08:00 — 目标范围与交付节奏
- **设计树节点：** D-003
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** 完整目标一次性交付，还是分成可独立验收的垂直里程碑。
- **事实与来源：** LOG-004、LOG-005、LOG-006；`USER-DECISION:2026-08-09 全部按推荐确认`。
- **选项：** 全量完成后集成；完整目标、分里程碑推进。
- **推荐：** 完整目标、分里程碑交付。
- **结论：** 先可靠 CRUD/查询/迁移与 Page+Agent tools，再统一提醒通知，最后自动化、周期、导入导出与报告；每阶段独立回归。
- **原因：** 宿主前置、领域核心和自动化风险可以分开验证，减少一次性集成失败面。
- **影响工件：** Spec / Ticket
- **约束或不变量：** 里程碑不得形成第二套临时契约；每个里程碑必须可验收和可回归。
- **后续：** planning 按垂直能力排序依赖。
- **替代/被替代：** 无

## LOG-009 — 2026-08-09T12:13:06+08:00 — Agent 巡查权限边界
- **设计树节点：** D-004
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** 到期 Todo 是否可自动执行，还是必须拥有显式执行模式和授权。
- **事实与来源：** LOG-004、LOG-006；`USER-DECISION:2026-08-09 全部按推荐确认`。
- **选项：** 到期即巡查；manual/reminder/agent_execute 显式三分。
- **推荐：** 显式三种模式，默认 manual。
- **结论：** 只有 agent_execute 且已配置 Agent、执行说明与授权策略时才创建自动化运行；到期时间本身不授予工具执行权。
- **原因：** 提醒意图与副作用执行意图不同，自动化还必须服从 Session 权限和 reviewer。
- **影响工件：** ADR / CONTEXT / Spec / Ticket
- **约束或不变量：** 新 Todo 默认 manual；reminder 只通知；agent_execute 不绕过宿主权限。
- **后续：** D-018 决定运行粒度，D-019 决定可视化。
- **替代/被替代：** 无

## LOG-010 — 2026-08-09T12:13:06+08:00 — Todo 与自动化状态分离
- **设计树节点：** D-005
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** Agent 执行状态是否进入 Todo 主状态机。
- **事实与来源：** LOG-004；`USER-DECISION:2026-08-09 全部按推荐确认`。
- **选项：** 扩张 Todo 主状态；使用正交 AutomationRun/AutomationHold。
- **推荐：** Todo 只保留 pending/completed，自动化独立建模。
- **结论：** 领取、运行、等待用户、失败和重试均不改变 Todo 主状态含义。
- **原因：** 用户任务生命周期和一次 Agent 执行生命周期可独立失败、重试、取消或完成。
- **影响工件：** ADR / CONTEXT / Spec / Ticket
- **约束或不变量：** 自动化成功不得隐式完成 Todo，除非具体动作被明确授权并通过并发检查。
- **后续：** D-018 定义 Todo 与 AutomationRun 的基数。
- **替代/被替代：** 无

## LOG-011 — 2026-08-09T12:13:06+08:00 — 调度时间与时区
- **设计树节点：** D-006
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** 精确时间与纯日期是否继续共用本地字符串。
- **事实与来源：** LOG-004、LOG-006；`USER-DECISION:2026-08-09 全部按推荐确认`。
- **选项：** 本地日期字符串；typed date 与 zoned exact instant。
- **推荐：** 精确时间保存 local value、IANA timezone 与 derived instant，纯日期保持浮动 date。
- **结论：** 调度只消费可解析的精确 instant；纯日期不得因午夜或字符串比较自动获得执行资格。
- **原因：** 该模型可定义 DST、跨时区与系统时区改变时的行为。
- **影响工件：** ADR / CONTEXT / Spec / Ticket
- **约束或不变量：** 禁止以本地日期字符串排序或比较替代调度 instant。
- **后续：** 与 D-014 的时间意图一起形成时间模型。
- **替代/被替代：** 无

## LOG-012 — 2026-08-09T12:13:06+08:00 — 删除与恢复
- **设计树节点：** D-007
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** 所有删除是否都执行 prepare/confirm。
- **事实与来源：** LOG-005、LOG-006；`USER-DECISION:2026-08-09 全部按推荐确认`。
- **选项：** 所有删除二阶段；UI 可恢复删除，危险入口确认令牌。
- **推荐：** 普通 UI 软删除并短期撤销，Agent/批量/永久删除确认。
- **结论：** 回收站承担普通误删恢复；危险删除使用绑定资源版本和会话的确认令牌。
- **原因：** 高频 UI 操作需要低摩擦，Agent 与批量副作用需要强确认和并发保护。
- **影响工件：** CONTEXT / Spec / Ticket
- **约束或不变量：** 永久删除前必须确认；恢复、审计和版本冲突可验证。
- **后续：** Spec 定义撤销窗口、保留期和令牌失效条件。
- **替代/被替代：** 无

## LOG-013 — 2026-08-09T12:13:06+08:00 — 通知路由默认值
- **设计树节点：** D-008
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** 提醒是否自动发现 Agent Bridge 并同步发送。
- **事实与来源：** LOG-002、LOG-004；`USER-DECISION:2026-08-09 全部按推荐确认`。
- **选项：** 自动猜测 Bridge；桌面默认、其它路由显式 opt-in。
- **推荐：** 桌面默认并保存稳定宿主 notification route。
- **结论：** Bridge/社交渠道必须由用户为 Todo 或策略显式启用，不解析 Agent 公开配置猜测渠道。
- **原因：** 通知投递是用户可见副作用，路由必须稳定、可撤销且可审计。
- **影响工件：** CONTEXT / Spec / Ticket
- **约束或不变量：** 未选择的外部渠道不得收到提醒；每渠道保存独立回执。
- **后续：** D-011 的通用通知契约承载路由。
- **替代/被替代：** 无

## LOG-014 — 2026-08-09T12:13:06+08:00 — 旧数据迁移边界
- **设计树节点：** D-009
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** 新插件是否必须直接兼容参考 0.0.5 SQLite。
- **事实与来源：** LOG-002；`USER-DECISION:2026-08-09 全部按推荐确认`。当前没有用户提供的真实数据存在性证据。
- **选项：** 直接接管旧 SQLite；存在数据时走版本化 JSON importer。
- **推荐：** 不直接接管 SQLite；按需提供可验证、可回滚 JSON 导入。
- **结论：** 不以存在真实旧数据为前提；若后续发现迁移需求，导入后必须执行引用与完整性检查。
- **原因：** 直接复用旧数据库会把旧 schema、路径和生命周期耦合带入内置插件。
- **影响工件：** ADR / Spec / Ticket
- **约束或不变量：** 导入不覆盖源数据；格式带版本；失败可回滚并输出诊断。
- **后续：** 实施前只需确认是否存在真实迁移样本，不改变已确认的迁移策略。
- **替代/被替代：** 无

## LOG-015 — 2026-08-09T12:13:06+08:00 — 首发交互表面
- **设计树节点：** D-010
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** 首发是否要求 Page、Agent tools 与聊天 Card 三套入口。
- **事实与来源：** LOG-005；`USER-DECISION:2026-08-09 全部按推荐确认`。
- **选项：** 三套入口完全对等；Page + Agent tools 优先。
- **推荐：** 首发 Page + Agent tools，共用 application service。
- **结论：** 暂不恢复聊天 Card；只有明确交互价值和稳定 hydration 协议后再单独设计。
- **原因：** 两个入口已经覆盖人和 Agent，Card 会提前引入第三套 UI 状态同步。
- **影响工件：** Spec / Ticket
- **约束或不变量：** Page 与 tools 不能各自实现领域规则；所有入口使用同一应用服务。
- **后续：** D-016、D-017、D-019 完成 Page 结构。
- **替代/被替代：** 无

## LOG-016 — 2026-08-09T12:13:06+08:00 — 通用通知宿主契约
- **设计树节点：** D-011
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** 是否允许系统本体提供插件可消费的通用通知 capability。
- **事实与来源：** LOG-003、LOG-004；`USER-DECISION:2026-08-09 全部按推荐确认`。
- **选项：** Todo 使用兼容别名；新增稳定、受权限约束的通用 capability。
- **推荐：** 系统本体增加最小通用通知 EventBus capability。
- **结论：** 宿主定义稳定输入、逐渠道回执、幂等和权限；Todo 记录 reminder×channel delivery。
- **原因：** NotificationService 已属于系统本体，插件需要正式贡献面而非内部对象或猜测事件名。
- **影响工件：** ADR / CONTEXT / Spec / Ticket
- **约束或不变量：** capability 不包含 Todo 专用字段；必须进入能力目录、权限代理和真实 handler 测试。
- **后续：** 作为提醒里程碑的系统本体前置。
- **替代/被替代：** 无

## LOG-017 — 2026-08-09T12:13:06+08:00 — Session 权威与报告
- **设计树节点：** D-012
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** Agent 巡查对话由插件还是 Hana Session 保存为权威。
- **事实与来源：** LOG-003、LOG-004；`USER-DECISION:2026-08-09 全部按推荐确认`。
- **选项：** 插件复制对话并默认写 Markdown；Session 权威、插件最小引用。
- **推荐：** Hana Session 保存完整对话，报告按需导出。
- **结论：** 插件只保存 run metadata、sessionRef、逐 Todo 结果和错误诊断；不默认写工作台 Markdown。
- **原因：** 避免隐私重复、路径风险和双份会话数据漂移。
- **影响工件：** ADR / CONTEXT / Spec / Ticket
- **约束或不变量：** 完整转录只有一个权威；报告生成必须显式开启且服从资源写权限。
- **后续：** D-019 决定 UI 中结果摘要与 Session 跳转。
- **替代/被替代：** 无

## LOG-018 — 2026-08-09T12:13:06+08:00 — 内置插件开关
- **设计树节点：** D-013
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** Page、CRUD、提醒和 Agent 巡查是否共用一个插件开关。
- **事实与来源：** LOG-003、LOG-005；`USER-DECISION:2026-08-09 全部按推荐确认`。
- **选项：** 一个总开关；基础能力常开、两类后台副作用独立开关。
- **推荐：** Page/CRUD 默认可用，提醒与 Agent 自动巡查分别控制。
- **结论：** 关闭后台能力时必须取消其 schedule；首版不扩张贡献面支持隐藏 Page。
- **原因：** 用户应能保留清单而停用通知或 Agent 副作用。
- **影响工件：** Spec / Ticket
- **约束或不变量：** 开关变化可观测、可恢复；关闭后不得继续创建新触发运行。
- **后续：** Spec 定义已有 running run 的关闭策略。
- **替代/被替代：** 无

## LOG-019 — 2026-08-09T12:13:06+08:00 — 时间意图模型
- **设计树节点：** D-014
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** 一个 dueAtLocal 是否继续承担计划、截止、提醒和 Agent 触发。
- **事实与来源：** LOG-004、LOG-006；`USER-DECISION:2026-08-09 全部按推荐确认`。
- **选项：** 单一 due；plannedFor、deadline、typed triggers 分离。
- **推荐：** 分离用户计划、完成约束与副作用触发。
- **结论：** plannedFor 表示计划处理，deadline 表示必须完成，trigger 明确属于提醒或 Agent 执行；日期与精确 instant 保持不同类型。
- **原因：** 市场成熟模式和自动化安全都要求时间意图可解释，不能由一个模糊字段推断。
- **影响工件：** ADR / CONTEXT / Spec / Ticket
- **约束或不变量：** trigger 不隐含执行授权；plannedFor/deadline 不自动创建后台副作用。
- **后续：** D-017 使用该模型定义快速捕获解析。
- **替代/被替代：** 无

## LOG-020 — 2026-08-09T12:13:06+08:00 — 组织模型
- **设计树节点：** D-015
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** 首发是否只有 tags，还是增加稳定的 Project/List 归属。
- **事实与来源：** LOG-005、LOG-006；`USER-DECISION:2026-08-09 全部按推荐确认`。
- **选项：** 仅 tags；单层 Project/List + tags；复杂层级与协作。
- **推荐：** 单层 Project/List + 多 tags。
- **结论：** Todo 可选归属一个 Project/List；无归属即 Inbox；tags 只作横向分类。首发不做团队、多层子任务或复杂依赖。
- **原因：** 稳定归属支持任务规模增长，而简单边界避免复制项目管理套件。
- **影响工件：** CONTEXT / Spec / Ticket
- **约束或不变量：** 一个 Todo 至多一个 Project/List；删除 Project 时 Todo 的归属处理必须可预测且不删除 Todo。
- **后续：** D-016 决定导航，D-017 决定捕获默认值。
- **替代/被替代：** 无

## LOG-021 — 2026-08-09T12:13:06+08:00 — TaskRegistry 启动与单一调度权威
- **设计树节点：** D-020
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** 是否允许修正通用 task handler 启动顺序，并移除 Todo 的 setInterval 兜底。
- **事实与来源：** LOG-003、LOG-004；`USER-DECISION:2026-08-09 全部按推荐确认`。
- **选项：** 保留当前顺序和双调度器；task capability 提前就绪并只用 TaskRegistry。
- **推荐：** 修正系统本体启动顺序，Todo 使用单一持久化 scheduler。
- **结论：** TaskRegistry EventBus handler 在插件 init/onStartup 前可用；Todo 通过 TaskRegistry one-shot/interval schedule 与启动恢复补偿漏跑，不保留第二个常驻 timer。
- **原因：** 当前顺序导致首次注册必然失败，双调度器则破坏 claim、幂等与取消语义。
- **影响工件：** ADR / CONTEXT / Spec / Ticket
- **约束或不变量：** 系统只有一个 schedule 权威；恢复逻辑只补偿漏跑，不创建第二套周期调度。
- **后续：** 作为所有 Todo 后台能力的系统本体前置并增加重启集成测试。
- **替代/被替代：** 无

## LOG-022 — 2026-08-09T13:02:29+08:00 — 页面信息架构
- **设计树节点：** D-016
- **轮次与依赖：** round 2 / D-015
- **状态：** confirmed
- **问题：** Todo Page 的一级导航应按行动流程还是按参考实现的混合维度组织。
- **事实与来源：** LOG-005、LOG-006、LOG-020；`USER-DECISION:2026-08-09 第二轮全部按推荐确认`。
- **选项：** 保留 Day Todo/最近待办/日程/待办箱/复盘；采用稳定行动入口并把分析及自动化降为二级视图。
- **推荐：** 一级使用 Today、Inbox、Upcoming、Projects、All。
- **结论：** Calendar、Completed、Automation、Review 作为二级视图；一级入口围绕捕获、当前执行、未来规划和稳定归属。
- **原因：** 用户能预测任务为什么出现在某个一级入口，不再混合时间范围、数据源和分析维度。
- **影响工件：** Spec / Ticket
- **约束或不变量：** 一级导航保持稳定且互相可解释；二级视图不得复制一套独立 Todo 状态。
- **后续：** D-017 定义快速捕获如何继承页面上下文。
- **替代/被替代：** 无

## LOG-023 — 2026-08-09T13:02:29+08:00 — 自动化运行粒度
- **设计树节点：** D-018
- **轮次与依赖：** round 2 / D-004、D-005
- **状态：** confirmed
- **问题：** 同一 Agent 的多个到期 Todo 是否合并进一次巡查会话。
- **事实与来源：** LOG-004、LOG-009、LOG-010；`USER-DECISION:2026-08-09 第二轮全部按推荐确认`。
- **选项：** 按 Agent 合批巡查；按 Todo × trigger occurrence 独立运行。
- **推荐：** 每个 Todo × occurrence 创建一个持久化 AutomationRun 和一个 Hana Session。
- **结论：** 同一 occurrence 的重试记录为同一 Run 下的独立 attempt；调度器可以批量 claim，但不同 Todo 不进入同一 Agent 会话。
- **原因：** 权限、工作区、副作用、取消、幂等、成本和结果都必须可按任务单独解释。
- **影响工件：** ADR / CONTEXT / Spec / Ticket
- **约束或不变量：** 一个 Run 只绑定一个 Todo 和一个 trigger occurrence；attempt 不创建新的业务运行 identity；默认禁止跨 Todo 合批。
- **后续：** D-019 定义 Automation 视图和 Todo 详情的职责分界。
- **替代/被替代：** 无

## LOG-024 — 2026-08-09T13:05:03+08:00 — 快速捕获语义
- **设计树节点：** D-017
- **轮次与依赖：** round 3 / D-014、D-015、D-016
- **状态：** confirmed
- **问题：** 快速输入如何继承页面上下文，以及自然语言解析是否可以静默改写字段。
- **事实与来源：** LOG-005、LOG-006、LOG-019、LOG-020、LOG-022；`USER-DECISION:2026-08-09 第三轮全部按推荐确认`。
- **选项：** 延续全局 selectedDate；全部进入 Inbox；只继承明确可见上下文并展示解析预览。
- **推荐：** 全局默认 Inbox，Today/具体 Project/明确日期页继承可见上下文，解析结果使用可移除 chip/预览。
- **结论：** All、Completed、Automation、Review 等页面不得套用历史日期；日期、Project、tag、提醒和执行模式的解析结果必须对用户可见并可撤销。
- **原因：** 快速捕获需要低摩擦，但隐式上下文会把 Todo 创建到用户无法预测的位置或模式。
- **影响工件：** CONTEXT / Spec / Ticket
- **约束或不变量：** 未显示的解析结果不得写入；执行模式仍服从默认 manual 和显式授权；继承值必须在输入器中可见。
- **后续：** Spec 定义各入口继承矩阵、解析失败与撤销行为。
- **替代/被替代：** 无

## LOG-025 — 2026-08-09T13:05:03+08:00 — 自动化可视化
- **设计树节点：** D-019
- **轮次与依赖：** round 3 / D-004、D-012、D-018
- **状态：** confirmed
- **问题：** 自动化运行详情应进入独立视图，还是嵌入 Todo 编辑详情。
- **事实与来源：** LOG-005、LOG-009、LOG-017、LOG-023；`USER-DECISION:2026-08-09 第三轮全部按推荐确认`。
- **选项：** Todo 详情承载完整对话和报告；独立 Automation 视图，Todo 详情只保留摘要与跳转。
- **推荐：** 使用独立二级 Automation 视图。
- **结论：** Automation 集中展示 scheduled、running、needs_action、failed、succeeded、cancelled，并提供重试、取消、权限待办处理和 Session 跳转；Todo 详情仅显示最近运行摘要、状态与跳转。
- **原因：** 任务编辑和自动化运维是不同工作流；完整对话已有 Hana Session 权威，不能复制进编辑弹窗。
- **影响工件：** CONTEXT / Spec / Ticket
- **约束或不变量：** Automation 视图不保存另一份运行状态；所有显示来自同一 AutomationRun application service；完整转录只由 Session 提供。
- **后续：** Spec 定义状态筛选、空态、错误详情和可用操作矩阵。
- **替代/被替代：** 无

## LOG-026 — 2026-08-09T13:08:40+08:00 — 共识前完整性复核
- **设计树节点：** 不适用
- **轮次与依赖：** round 4 / D-006、D-014、D-016
- **状态：** confirmed
- **问题：** 第三轮后为空的 frontier 是否已经覆盖所有已知高影响外部行为。
- **事实与来源：** `CODE:<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/src/domain/recurrence.ts</Path>`、`CODE:<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/src/application/todo-service.ts</Path>` 与测试证明参考版已有 daily/weekly/monthly/yearly、预生成 occurrence、稳定 occurrence key 和规则管理；LOG-006 将固定日历周期与完成后周期列为市场验证模式；LOG-008 已把周期纳入完整目标；LOG-019 与 LOG-022 分离时间意图并确立 Today/Upcoming，但尚未定义视图成员规则。
- **选项：** 把周期与聚合视图细节留给实现；默认为参考实现行为；补充高影响决策节点。
- **推荐：** 新增 D-021 至 D-023，完成周期锚点、Today/Upcoming 成员与系列编辑边界。
- **结论：** 原 20 个节点虽然全部回答，但设计树仍缺少已在范围内且会改变数据、交互、兼容和验收的周期/视图合同；frontier 重新打开。
- **原因：** 固定日历与完成后周期会产生不同 occurrence 生命周期；plannedFor/deadline 分离后，Today/Upcoming 若无明确成员规则会让同一字段在 UI 中重新变得模糊。
- **影响工件：** design-tree / Spec / Ticket
- **约束或不变量：** 不把已知高影响外部行为降级成实现细节；不改变第三轮已经确认的节点。
- **后续：** round 4 询问 D-021、D-022；D-021 关闭后再询问 D-023。
- **替代/被替代：** 无

## LOG-027 — 2026-08-09T13:12:39+08:00 — 周期锚点语义
- **设计树节点：** D-021
- **轮次与依赖：** round 4 / D-006、D-014
- **状态：** confirmed
- **问题：** 周期 Todo 是否同时支持固定日历和完成后锚点，以及 occurrence 是否是独立 Todo。
- **事实与来源：** LOG-006、LOG-008、LOG-011、LOG-019、LOG-026；`USER-DECISION:2026-08-09 第四轮全部按推荐确认`。
- **选项：** 只保留固定日历预生成；calendar 与 after_completion 双模式；把周期作为单条 Todo 的动态字段。
- **推荐：** RecurrenceRule 权威、双锚点模式、独立 occurrence 和有界物化。
- **结论：** calendar 按本地日历规则物化 Upcoming 所需的有限窗口；after_completion 在当前 occurrence 完成后生成下一条且同时只保留一个活动 occurrence；每条 occurrence 都是具有稳定键、状态、提醒和 AutomationRun 的独立 Todo。
- **原因：** 固定承诺与完成后节奏是不同用户意图；独立 occurrence 才能可靠表达完成、跳过、提醒与 Agent 运行历史。
- **影响工件：** ADR / CONTEXT / Spec / Ticket
- **约束或不变量：** 周期规则而非预生成 Todo 列表是权威；物化必须幂等；after_completion 未完成时不得生成下一条。
- **后续：** D-023 决定单次与未来系列编辑边界。
- **替代/被替代：** 无

## LOG-028 — 2026-08-09T13:12:39+08:00 — Today 与 Upcoming 成员规则
- **设计树节点：** D-022
- **轮次与依赖：** round 4 / D-014、D-016
- **状态：** confirmed
- **问题：** plannedFor 与 deadline 分离后，行动视图如何稳定决定成员且避免重复。
- **事实与来源：** LOG-006、LOG-019、LOG-022、LOG-024、LOG-026；`USER-DECISION:2026-08-09 第四轮全部按推荐确认`。
- **选项：** 按 plannedFor；按 deadline；两个日期分别重复展示；派生唯一 attentionDate。
- **推荐：** 按用户显示时区派生 attentionDate=min(plannedFor, deadline)，不持久化。
- **结论：** Today 显示 pending 且 attentionDate<=today，并区分 Overdue/Today；Upcoming 只显示未来 attentionDate 并按日期去重分组。较晚 deadline 只作约束标识；无日期 Todo 不进入行动时间视图。
- **原因：** 一个可解释的派生日期能保证任务只在 Upcoming 出现一次，同时保留计划与截止字段各自语义。
- **影响工件：** CONTEXT / Spec / Ticket
- **约束或不变量：** attentionDate 不是第三个可编辑时间字段；Inbox/Project 与 Today/Upcoming 可重叠；Today 快速创建显式写 plannedFor=today。
- **后续：** Spec 定义日期边界、显示时区与精确时间投影测试。
- **替代/被替代：** 无

## LOG-029 — 2026-08-09T13:16:43+08:00 — 周期系列编辑边界
- **设计树节点：** D-023
- **轮次与依赖：** round 5 / D-021
- **状态：** confirmed
- **问题：** 周期 occurrence 的单次编辑、未来规则变更、跳过、暂停与结束如何影响历史和已物化项。
- **事实与来源：** LOG-012、LOG-027；`USER-DECISION:2026-08-09 第五轮按推荐确认`。
- **选项：** 所有实例原地批改；只允许修改规则；提供本次与本次及未来作用域并版本化规则。
- **推荐：** occurrence override、规则边界版本化、历史不可变和危险批量确认。
- **结论：** 仅本次编辑保留规则来源且不影响未来；本次及未来从当前边界版本化规则，只替换边界后未完成的已物化 occurrence。跳过/删除本次保存 suppression key；暂停只停止新增；结束系列软删除边界后未完成 occurrence。
- **原因：** 用户需要修改未来计划，但历史完成事实、审计记录和已经发生的 Agent/通知副作用不能被回写。
- **影响工件：** ADR / CONTEXT / Spec / Ticket
- **约束或不变量：** 历史和已完成 occurrence 永不重写；suppression key 防止被再次物化；批量破坏性操作使用绑定版本与会话的确认令牌。
- **后续：** frontier 清空后进行整棵设计树的共识确认。
- **替代/被替代：** 无

## LOG-030 — 2026-08-09T13:20:35+08:00 — 设计树总共识与 S-spec 路由
- **设计树节点：** 不适用
- **轮次与依赖：** consensus / D-001 至 D-023
- **状态：** confirmed
- **问题：** 23 个设计节点是否构成完整共识，以及下一 Work 是否进入 S-spec。
- **事实与来源：** design tree 已有 23 个 answered、0 个 open 节点并通过 grill 校验；`USER-DECISION:2026-08-09 显式指定 <Path>{roots.workflows}/specdev/S-spec/S-spec.md</Path> 与当前 change`。
- **选项：** 重开 G；进入 S-spec；直接拆 Ticket 或实现。
- **推荐：** 将设计树标记为 consensus，进入 S-spec 综合外部行为与验收合同。
- **结论：** 用户对当前设计共识执行显式下一 Work 路由；G 成功结束，S-spec 获得工件写入授权，但未获得产品实现授权。
- **原因：** 用户直接指定 S-spec 入口和 change 路径，且所有高影响设计分支均已关闭。
- **影响工件：** design-tree / spec / status
- **约束或不变量：** S 不重新决定已接受 ADR；不自动执行 Ticket 或实现。
- **后续：** 生成并校验 `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`。
- **替代/被替代：** 无

## LOG-031 — 2026-08-09T14:14:31+08:00 — 自动化安全取消策略
- **设计树节点：** D-024
- **轮次与依赖：** S-spec focused confirmation / D-004、D-005、D-013、D-018
- **状态：** confirmed
- **问题：** 关闭自动化或 Todo 生命周期变化时，running Run 与已交付提醒如何收敛。
- **事实与来源：** ADR-003、ADR-004、ADR-008、ADR-010；`USER-DECISION:2026-08-09 确认 fail-closed 取消策略`。
- **选项：** 允许运行完成；静默标记取消；请求宿主终止并以确认结果收敛。
- **推荐：** 取消 future/queued，running 进入 cancel_requested 并等待 TaskRegistry/Session 确认。
- **结论：** 关闭 Agent 自动化、完成/删除 Todo 或退出 agent_execute 时取消 future/queued，并请求终止 running task/session；取消失败保持可见且不自动重试。恢复或重新启用不复活旧 Run。提醒关闭只阻止未投递项，已交付通知保留真实回执。
- **原因：** 用户撤销自动执行授权后不能继续产生新副作用，也不能把尚未真正停止的会话伪装成 cancelled。
- **影响工件：** ADR / CONTEXT / Spec / Ticket
- **约束或不变量：** 只有宿主确认后进入 cancelled；旧 Run 不自动复活；AutomationRun 成功不隐式完成 Todo。
- **后续：** S-spec 将该策略写入状态转换、错误行为与验收合同。
- **替代/被替代：** 无

## LOG-032 — 2026-08-09T14:24:32+08:00 — S-spec Ready 发布
- **设计树节点：** 不适用
- **轮次与依赖：** S-spec readiness / D-001 至 D-024
- **状态：** confirmed
- **问题：** 当前 Spec 是否已完整表达可拆分为垂直 Ticket 的外部行为、范围、接口、数据、安全、迁移与验证合同。
- **事实与来源：** design tree 为 consensus 且 24 个节点全部 answered；Spec 包含 11 个用户故事、33 个验收合同、6 个非功能要求和故事追踪；`validate-specdev --stage spec` 在 draft 阶段返回 0 error、0 warning。
- **选项：** 保持 draft；返回 G 补充高影响决策；标记 ready 并路由到 T-tickets。
- **推荐：** 标记 `ready_for_tickets: true`，结束当前 S-spec Work。
- **结论：** 外部行为与验证接缝已锁定，高影响未决问题为零；低影响假设均显式、可逆且有验证方式。当前 change 保持 active，但不自动执行下一 Work。
- **原因：** Spec Readiness 的各项条件均有文档或验证证据，后续工作可以在不重新决定产品行为的前提下拆分垂直 Ticket。
- **影响工件：** spec / status / Ticket
- **约束或不变量：** 实现前仍需执行 repository preflight；真实 0.0.5 样本缺失时不得声称 importer 兼容完成；不自动进入实现。
- **后续：** 用户确认后运行 `<Path>{roots.workflows}/specdev/T-tickets/T-tickets.md</Path>`。
- **替代/被替代：** 无

## LOG-033 — 2026-08-09T14:48:55+08:00 — 单一内置插件目录成为唯一产品写入边界
- **设计树节点：** D-025
- **轮次与依赖：** round 7 / D-001、D-006、D-020
- **状态：** confirmed
- **问题：** TodoList 是否必须只在 `<Path>plugins/todolist/</Path>` 内开发，并取消此前允许的系统本体前置改动。
- **事实与来源：** `USER-DECISION:2026-08-09 这个是内置插件，只会在插件目录新建 todolist 文件夹并在里面开发，不会存在其他地方的改动`；`CODE:<Path>scripts/build-server.mjs</Path>` 已通配复制 builtin plugins；`CODE:<Path>core/plugin-context.ts</Path>` 允许 full-access 插件消费 EventBus；`CODE:<Path>server/task-bus-handlers.ts</Path>` 的 task handler 当前晚于 plugin init；`CODE:<Path>server/routes/chat.ts</Path>` 已消费全局 `notification` event，但该事件没有送达回执。
- **选项：** 维持插件加宿主前置；只改目录但保留无法兑现的 Bridge/回执承诺；严格单目录并按现有宿主能力收缩合同。
- **推荐：** 严格单目录，采用插件内 TaskRegistry readiness handshake 与 desktop notification handoff。
- **结论：** `<Path>plugins/todolist/</Path>` 是唯一产品写入根；所有实现、测试、fixture、构建资产与依赖声明都放在其中。不得新增 notification capability、调整宿主启动顺序或修改公共测试。Bridge 和逐渠道送达回执退出范围；桌面提醒只记录 handoff。此前 D-001 的跨层前置部分及 D-006、D-020 的宿主修改授权被本节点取代。
- **原因：** feature-placement 重新判定显示 Todo 的 Page/routes/tools/lifecycle、私有数据、TaskRegistry 与 Session/Agent 使用均可装入插件盒子，可整块删除；最强反方是通知无回执和 task handler 晚就绪，但通过诚实收缩通知合同与插件内有限 readiness retry 可以处理，不需要破坏目录边界。
- **影响工件：** design-tree / ADR / CONTEXT / spec / Ticket
- **约束或不变量：** readiness retry 不是到期扫描器；EventBus handoff 不是 delivered；任何插件目录外产品 diff 都使验收失败；SpecDev 规划工件不属于产品实现。
- **后续：** T-tickets 必须把所有 writable_paths 限制为 `<Path>plugins/todolist/</Path>`，共享/只读路径不得获得写权限。
- **替代/被替代：** 取代 D-001 的系统本体前置范围、D-006、D-020，并收缩 D-024 的逐渠道回执措辞。

## LOG-034 — 2026-08-09T15:47:12+08:00 — T-tickets Ready 发布
- **设计树节点：** D-001 至 D-025
- **轮次与依赖：** T-tickets / ready Spec / 用户确认的十票拆分
- **状态：** confirmed
- **问题：** 如何把 33 个验收合同拆成单上下文可执行的纵向 Ticket，同时保持唯一插件目录写入边界和可信依赖。
- **事实与来源：** 用户确认十票拆分；全部 Ticket 的 `writable_paths` 仅为 `<Path>plugins/todolist/**</Path>`；宿主、公共测试、构建脚本和参考插件均为只读；`validate-specdev --stage tickets` 返回 0 error、0 warning。
- **选项：** 按技术层并行拆分；使用 shared path 最终合并；按真实数据与运行接缝串行拆成十个纵向行为切片。
- **推荐：** 采用 T-01 至 T-10 单链 DAG，并由 Goal Plan 正式定义 Gate、基线、owner 和恢复点。
- **结论：** 十张 Ticket 全部 `ready: true`，AC-001 至 AC-033 全部 covered，无 deferred、无 DAG 环、无并发写冲突、无高影响未决问题。
- **原因：** Todo 的 store、routes、tools、Page 与 runtime 会在同一插件根持续演进；每条依赖边都对应前序稳定 schema、identity 或状态协议，而不是人员交接。
- **影响工件：** ticket / tickets-map / evidence / status
- **约束或不变量：** SpecDev 工件可位于 change 目录；任何产品实现、测试、fixture、Playwright 配置、构建资产和依赖声明仍只能位于 `<Path>plugins/todolist/</Path>`。
- **后续：** 运行 `<Path>{roots.workflows}/specdev/P-goal-plan/P-goal-plan.md</Path>`；不得由 T-tickets 自动进入实现。
- **替代/被替代：** 无
