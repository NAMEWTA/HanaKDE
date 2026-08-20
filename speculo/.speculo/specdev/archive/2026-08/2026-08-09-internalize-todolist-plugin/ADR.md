# TODOList 内置插件架构决策

本文件仅记录已经用户接受、并成为本 change 下游合同的架构决策。

## ADR-001: Todo 领域落在内置插件，系统本体只补通用契约

**Status:** superseded
**Source:** LOG-001
**Supersedes:** none
**Superseded by:** ADR-014

### Context
Todo 需要私有持久化、Page、Agent tools、提醒和后台巡查，但可靠通知与 Agent 执行又依赖宿主能力。若把全部能力塞进插件，会诱发私有 scheduler、通知旁路和会话轮询；若把 Todo 领域焊进 Core，又会失去可删除边界并污染系统共享状态。

### Decision
Todo 领域整体实现为 `<Path>plugins/todo/</Path>` 内置插件。插件拥有领域模型、私有数据库、应用服务、UI/routes/tools、recurrence/reminder/run 状态和 TaskRegistry handler。任何需要被多个插件依赖的调度、通知、会话完成、权限或资源能力，都必须作为通用系统本体契约独立定义，再由 Todo 插件消费。

### Trade-off
直接迁入参考插件代码更快，但会保留别名探测、mock 契约和自行兜底 timer。全部进入系统本体可以直接调用内部对象，却把可选领域功能变成不可删除基础设施。选择分层方案会增加少量跨层合同与集成测试工作，但边界最稳定。

### Consequences
Todo 插件不得增加 Todo 专用 Core 表、系统 scheduler 或通知传输器；宿主缺口可能产生独立系统本体 Ticket；插件必须能在删除 `<Path>plugins/todo/</Path>` 后不影响 HanaKDE 引擎完整运行。

### Verification / Migration
通过 PluginManager 真实加载测试、EventBus capability/handler 集成测试、TaskRegistry 重启恢复测试和删除插件目录后的系统构建测试验证。

## ADR-002: 按当前插件契约重建，不整体迁入参考实现

**Status:** accepted
**Source:** LOG-007
**Supersedes:** none

### Context
参考 0.0.5 包含可复用的领域意图和测试场景，但其 HostAdapter 依赖 mock 掩盖的事件别名、双调度器和旧式自包含 UI。整体迁入会把这些假设固化到新内置插件。

### Decision
使用 hana-plugin-creator 的 `professional-react/full` 形态建立 `<Path>plugins/todolist/</Path>`。只选择性复用经当前契约复核的纯领域算法、schema 迁移思路和测试意图；宿主适配、调度、通知、Agent 运行协议、routes/tools 和 Page UI 均按当前 SDK 重写。

### Trade-off
重建需要重新实现一部分已有行为，但能够移除历史兼容层并让真实宿主集成测试成为权威。整体复制短期代码量更少，却会把无法工作的接缝和过时 UI 一并带入。

### Consequences
参考实现只作为研究输入；新插件不得复制大型 HostAdapter、renderer internals 或内联页面资产；复用清单需要逐项记录来源和验证。

### Verification / Migration
以真实 PluginManager、EventBus 和 TaskRegistry 测试验证宿主接缝，并对每项复用的领域行为建立等价或更严格的测试。

## ADR-003: 自动化必须由显式执行模式授权

**Status:** accepted
**Source:** LOG-009
**Supersedes:** none

### Context
参考巡查逻辑把到期条件与 Agent 执行资格靠得过近，甚至会把纯日期 Todo 纳入巡查。到期时间描述时间意图，不足以授权工具副作用。

### Decision
Todo 显式采用 `manual`、`reminder`、`agent_execute` 三种执行模式，新 Todo 默认 `manual`。只有 `agent_execute` 且配置 Agent、执行说明和授权策略时才能创建 AutomationRun；运行仍受 Hana Session 权限和 reviewer 约束。

### Trade-off
显式配置增加一次用户选择，但消除了静默执行和权限语义歧义。根据字段自动推断模式更省步骤，却无法可靠区分提醒与执行意图。

### Consequences
`plannedFor`、`deadline` 或任意到期判断都不能单独触发工具执行；模式变更需要取消或重建不再匹配的 trigger；Agent tools 创建 Todo 时也必须遵守默认模式。

### Verification / Migration
测试 manual/reminder 永不创建 AutomationRun，agent_execute 缺少任一必需授权字段时拒绝调度，以及权限/reviewer 拒绝时进入可诊断 hold。

## ADR-004: Todo 状态与 AutomationRun 状态正交

**Status:** accepted
**Source:** LOG-010
**Supersedes:** none

### Context
用户任务可以保持未完成，同时某次 Agent 执行成功、失败、取消或等待用户。把执行状态加入 Todo 主状态机会让完成语义、重试和筛选不可解释。

### Decision
Todo 主状态保持 `pending/completed`。领取、scheduled、running、needs_action、failed、succeeded、cancelled 和 retry/hold 属于独立 AutomationRun/AutomationHold 状态机。

### Trade-off
独立实体增加表和关联查询，但换来可独立的重试、审计和状态迁移。单一状态机字段更简单，却无法表达 Todo 与一次执行的并行生命周期。

### Consequences
AutomationRun 成功不默认完成 Todo；Todo 完成或删除时必须通过显式策略处理尚未结束的运行；UI 和 tools 必须分别返回任务状态与自动化状态。

### Verification / Migration
用状态转换测试覆盖运行失败但 Todo 仍 pending、运行成功后显式完成、Todo 删除/恢复与运行取消的组合。

## ADR-005: 时间意图分离并采用类型化时区模型

**Status:** accepted
**Source:** LOG-011, LOG-019
**Supersedes:** none

### Context
参考实现用一个本地日期字段同时承担计划、截止、提醒和 Agent 触发，且字符串比较会让纯日期任务错误进入精确调度。DST 和系统时区变化也没有可执行合同。

### Decision
领域模型分离 `plannedFor`、`deadline` 与 typed `triggers`。纯日期保存浮动 date；精确时间保存 local value、IANA timezone 与 derived instant。只有 trigger 进入后台调度，且 Agent trigger 还必须满足 ADR-003。

### Trade-off
字段和转换逻辑更多，但每个时间值可解释、可迁移并可独立编辑。单一 due 字段 UI 更短，却把产品语义和调度安全混为一体。

### Consequences
不得用本地字符串比较承担调度；需要定义 DST 不存在/重复时间、用户跨时区和系统时区改变的处理；编辑计划或截止不隐式创建副作用。

### Verification / Migration
建立纯日期不触发、DST 跳变、重复本地时间、跨时区显示与 derived instant 重算测试，并验证 plannedFor/deadline 与 trigger 独立更新。

## ADR-006: 系统本体提供通用插件通知 capability

**Status:** superseded
**Source:** LOG-016
**Supersedes:** none
**Superseded by:** ADR-014

### Context
Core 已有 NotificationService，但插件 EventBus 能力目录没有稳定的通知 handler。参考实现只能探测 `notification:notify`/`notification:send` 等不存在的别名。

### Decision
本 change 不修改系统本体，也不新增通知 capability。Todo 插件只复用当前已存在的全局 `notification` event 做 desktop best-effort handoff，并持久化 reminder/occurrence 的 handoff identity 与 `handoff_claimed`、`handed_off`、`handoff_failed`、`handoff_unknown` 状态。notification receipt、Bridge、逐渠道路由和 OS delivery 属于待 HanaKDE 基础能力对外提供后的独立升级，不在本 change 实现。

### Trade-off
当前版本不提供逐渠道送达回执和 Bridge，但保持产品 diff 只在插件目录，避免在宿主未提供稳定 capability 时私造协议。允许插件直接调用内部 NotificationService 或猜事件别名会绕过权限和能力发现，因此禁止。

### Consequences
`handed_off` 只表示事件已交给宿主事件流，不表示操作系统已显示；failed/unknown 只能由用户显式重试。若未来需要通知 capability/receipt，必须新建系统 change 和插件升级，不得在本 change 内越界。

### Verification / Migration
插件内覆盖现有 notification event handoff、claim 崩溃、重复唤醒、failed/unknown 和显式 retry；扫描不得出现 `notification:send`、NotificationService 私有调用、Bridge 或逐渠道 delivery 假设。

## ADR-007: Hana Session 是自动化对话的唯一权威

**Status:** accepted
**Source:** LOG-017
**Supersedes:** none

### Context
插件复制全部消息并默认写 Markdown 会产生两份对话数据、隐私重复、工作区路径风险和漂移。Hana Session 已承担完整会话生命周期。

### Decision
AutomationRun 只保存运行元数据、`sessionRef`、逐 Todo 结果和错误诊断；完整转录由 Hana Session 保存。Markdown 或其它报告只在用户显式开启或导出时生成，并服从 ResourceIO 权限。

### Trade-off
离线查看运行详情需要通过 Session 引用，插件不能独立渲染完整转录；相对地，数据权威、权限和保留策略保持统一。

### Consequences
Todo 私有数据库不得复制完整会话消息；删除或不可访问 Session 时仍保留最小结果和可解释诊断；UI 通过稳定引用跳转到 Session。

### Verification / Migration
验证运行完成只写最小元数据、Session 不可用时的降级显示、报告默认关闭，以及显式导出时的权限和路径检查。

## ADR-008: TaskRegistry 是唯一调度权威且在插件启动前就绪

**Status:** superseded
**Source:** LOG-021
**Supersedes:** none
**Superseded by:** ADR-014

### Context
当前 server 在插件初始化后才注册 `task:*` handler，导致 onStartup 的首次 handler/schedule 注册失败；参考插件又用 `setInterval` 兜底，形成两个并发唤醒源。

### Decision
系统本体必须在插件 init/onStartup 前使 TaskRegistry EventBus capability 可用。Todo 只使用 TaskRegistry 的持久化 one-shot/interval schedule；启动恢复只补偿漏跑，不维护第二套周期 timer。

### Trade-off
调整启动顺序会触及共享宿主生命周期，需要更广集成回归；保留插件 timer 不改 Core 更局部，却无法可靠保证幂等、取消和重启恢复。

### Consequences
task handler 注册、schedule 创建、取消和恢复都通过一个权威；Todo 的 claim/lease 必须容忍 at-least-once 唤醒但同一运行不能重复执行。

### Verification / Migration
覆盖冷启动首次注册、重启恢复、漏跑补偿、重复唤醒幂等、取消后不再执行，以及不存在活动 `setInterval` 的集成测试。

## ADR-009: 旧版本数据只通过版本化 JSON 导入

**Status:** accepted
**Source:** LOG-014
**Supersedes:** none

### Context
当前尚无真实旧数据存在性证据，但若内置版直接打开参考插件 SQLite，会继承旧 schema、文件位置、迁移顺序和运行时生命周期耦合。

### Decision
新插件不直接接管旧 SQLite。若发现需要迁移的真实 0.0.5 数据，则提供一次性、带格式版本、可验证和可回滚的 JSON importer；导入后执行引用和完整性检查。

### Trade-off
用户需要先从旧插件导出，再在新插件导入；相较之下，直接读取数据库步骤更少，却让两个实现长期共享私有存储合同。

### Consequences
旧数据库保持只读且不被覆盖；没有真实迁移需求时可不实现 importer；一旦实现，格式版本和错误诊断属于公开迁移合同。

### Verification / Migration
使用脱敏样本覆盖版本识别、重复导入幂等、引用缺失、部分失败回滚和导入前后统计校验。

## ADR-010: AutomationRun 以 Todo 与触发 occurrence 为隔离单位

**Status:** accepted
**Source:** LOG-023
**Supersedes:** none

### Context
按 Agent 合并当前所有到期 Todo 会让多个任务共享会话、权限上下文、失败边界和结果摘要。一项任务的阻塞、取消或副作用可能污染同批其它任务，也无法准确归因成本和幂等键。

### Decision
每个 Todo × 每个 trigger occurrence 创建一个持久化 AutomationRun，并绑定一个 Hana Session。同一 occurrence 的重试记录为该 Run 下的独立 AutomationAttempt。调度器可以批量 claim 待执行项，但不同 Todo 默认不进入同一 Agent 会话。

### Trade-off
独立 Session 会增加会话数量和启动开销，但权限、工作区、取消、重试、成本与结果都可按 Todo 解释。合批能降低启动成本，却把多个不同副作用边界耦合在一起。

### Consequences
Run identity 必须稳定绑定 todoId 与 trigger occurrence；attempt 不创建新 Run；同一 Todo 的周期性 occurrence 可以产生多个历史 Run。未来合批只能作为显式策略，且需另行证明 policy、workspace 和副作用边界完全一致。

### Verification / Migration
测试批量 claim 后仍生成独立 Run/Session、同一 occurrence 重试复用 Run、不同 occurrence 产生不同 Run，以及单项取消或失败不影响其它 Todo。

## ADR-011: RecurrenceRule 是周期权威并采用有界 occurrence 物化

**Status:** accepted
**Source:** LOG-027
**Supersedes:** none

### Context
参考实现只支持固定日历规则，并预生成未来 30 条 Todo。预生成列表若成为事实权威，会使规则修改、时区变化、跳过和长期数据量难以保持一致；完成后周期又不能在前一 occurrence 完成前安全生成下一条。

### Decision
RecurrenceRule 是周期系列权威，显式采用 `calendar` 或 `after_completion` 锚点。calendar 按本地日历规则只物化 Upcoming 所需的有界窗口；after_completion 在当前 occurrence 完成后生成下一条，并同时只保留一个活动 occurrence。每个物化 occurrence 是带稳定幂等键和规则来源引用的独立 Todo。

### Trade-off
有界物化需要滚动补齐与规则版本管理，但避免长期预生成和批量重写。一次生成大量未来 Todo 查询简单，却会扩大写放大、迁移和编辑一致性风险。

### Consequences
物化过程必须幂等；扩大 Upcoming 窗口时可按规则继续生成；after_completion 未完成时不得生成下一条。每个 occurrence 独立拥有状态、提醒与 AutomationRun，规则不能直接覆盖历史完成事实。

### Verification / Migration
覆盖冷启动重复补齐、窗口扩张、固定日历 DST、完成后只生成一个下一 occurrence、并发完成幂等，以及 occurrence 独立提醒和 AutomationRun。

## ADR-012: 周期规则通过系列边界版本化且历史 occurrence 不可变

**Status:** accepted
**Source:** LOG-029
**Supersedes:** none

### Context
周期 occurrence 已经拥有独立完成、提醒和 AutomationRun 历史。若规则变更原地重写所有实例，会修改已经发生的用户事实和副作用记录；若每次编辑都完全脱离系列，又无法表达可预测的未来变更。

### Decision
周期编辑提供“仅本次”和“本次及未来”两个作用域。仅本次创建保留规则来源的 occurrence override；本次及未来从当前 occurrence 建立系列边界并创建新 RecurrenceRule 版本，只替换边界之后尚未完成的已物化 occurrence。历史和已完成 occurrence 永不重写。

跳过或删除本次执行软删除并保存稳定 suppression key；暂停规则只停止新增 occurrence；结束系列停止规则，并在确认后软删除边界之后尚未完成的已物化 occurrence。批量破坏性变更使用绑定版本与会话的确认令牌。

### Trade-off
规则版本、override 和 suppression 记录增加数据模型复杂度，但保存了历史真实性和可回滚边界。原地更新一条规则更简单，却无法可靠审计过去实例为何出现及执行过什么。

### Consequences
历史查询必须能解析 occurrence 对应的规则版本；补齐逻辑必须尊重 override 与 suppression；系列结束不能删除已完成 Todo 或其 AutomationRun/Session 引用。

### Verification / Migration
覆盖仅本次编辑、边界分叉、重复补齐 suppression、暂停/恢复、结束系列确认、历史不可变，以及未来 occurrence 替换失败时的事务回滚。

## ADR-013: 自动化授权撤销采用宿主确认的 fail-closed 取消

**Status:** accepted
**Source:** LOG-031
**Supersedes:** none
**Superseded in part by:** ADR-014（仅提醒交接与回执部分）

### Context
关闭 Agent 自动化、完成/删除 Todo 或退出 `agent_execute` 都撤销了继续产生自动副作用的依据。running Session 可能无法瞬时终止，若 UI 立即标记 cancelled 会掩盖仍在执行的任务。

### Decision
安全取消触发时，插件取消 future schedule 与 queued Run，并向 TaskRegistry task 和 Hana Session 请求终止 running Run。Run 先进入 `cancel_requested`，只有宿主确认终止后才进入 `cancelled`；终止失败保留可见诊断，不自动重试，也不继续创建新 attempt。

重新启用自动化、恢复 Todo 或重新切回 `agent_execute` 不复活旧 Run；只有新的 trigger occurrence 或用户显式重试可以创建后续执行。关闭提醒只取消尚未 handoff 的项；已交给宿主 EventBus 的桌面提醒不可撤回，只保留真实 handoff 状态，不宣称送达回执。

### Trade-off
取消过程成为异步状态，用户可能短暂看到 `cancel_requested`；相较之下，乐观取消更简短，却无法证明副作用已经停止。

### Consequences
Automation 视图必须展示取消中与取消失败；Todo 完成不等待取消成功才保存业务状态，但相关 Run 必须保持可追踪；AutomationRun 成功仍不隐式完成 Todo。

### Verification / Migration
覆盖 queued 取消、running task/session 终止确认、取消失败、重复取消幂等、关闭后不创建新 attempt、重新启用不复活旧 Run，以及提醒 handoff 后不可撤回且不伪装送达。

## ADR-014: 产品实现严格封闭在单一内置插件目录

**Status:** accepted
**Source:** LOG-033
**Supersedes:** ADR-001、ADR-006、ADR-008，以及 ADR-013 中逐渠道通知回执部分

### Context
用户进一步锁定了物理贡献边界：本 change 只允许在插件目录新建一个 TodoList 目录并在其中开发，不允许修改系统本体、共享 SDK、构建脚本、公共测试或其它插件。当前仓库已有 builtin plugin 自动发现与通配复制、TaskRegistry、Session/Agent、ResourceIO 和全局 `notification` event，但 `task:*` handler 晚于 plugin onStartup 注册，且通知 event 不提供送达回执或 Bridge 路由。

### Decision
产品实现的唯一写入根为 `<Path>plugins/todolist/</Path>`，插件 id 为 `todolist`。领域代码、manifest、Page、assets、routes、tools、lifecycle、私有持久化、测试、fixture、Playwright 配置、构建资产和依赖声明全部位于该目录；当前 change 的 SpecDev 工件仅记录合同，不属于产品实现。

插件只消费现有宿主行为，不新增 capability、不调整启动顺序。TaskRegistry 仍是唯一到期调度权威；插件在冷启动时以可取消、有限次数的 readiness retry 等待现有 `task:*` handler，随后注册 handler、恢复 schedule/Run。retry timer 只做启动握手，不扫描到期 Todo，也不得成为第二调度器。

提醒只通过现有全局 `notification` event 做 desktop best-effort handoff。插件持久化稳定 handoff identity 与 `handoff_claimed/handed_off/handoff_failed/handoff_unknown`，明确 EventBus 正常返回不等于操作系统送达；Bridge、逐渠道路由和送达回执不在本 change 范围。

### Trade-off
单目录边界使插件可以整块删除、审计和独立演进，也完全避免共享宿主回归。代价是当前版本不能提供 Bridge 通知或真实送达回执，并需要在插件内适配 TaskRegistry 晚就绪；若 readiness retry 耗尽，后台提醒和自动化必须降级为可诊断不可用，不能用私有 scheduler 兜底。

### Consequences
任何 `<Path>plugins/todolist/</Path>` 外的产品文件变更都会使验收失败。Ticket writable_paths 必须只包含该根目录；现有宿主文件和公共测试最多作为只读证据。构建与回归命令可以执行，但不得为 Todo 修改其定义。删除整个目录后 HanaKDE 必须继续构建和运行。

### Verification / Migration
使用 Git path allowlist 证明产品 diff 仅位于 `<Path>plugins/todolist/</Path>`；插件内 harness 覆盖 task handler 晚就绪、retry 耗尽、重启恢复、重复唤醒、notification handoff 崩溃窗口和显式重试；运行仓库既有 build/seed/回归命令证明无需宿主改动即可加载，最后删除插件目录执行非 Todo smoke。
