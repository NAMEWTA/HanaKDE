# TODOList Plugin

**Todo 内置插件**：位于 `<Path>plugins/todolist/</Path>`、插件 id 为 `todolist`、随 HanaKDE 分发并由 PluginManager 加载的 Todo 领域贡献单元；拥有 Todo 私有数据、Page、routes、Agent tools 和自身后台任务 handler。
_Avoid_: Todo Core、系统 Todo 表

**唯一产品写入根**：本 change 的产品代码、测试、fixture、构建资产与依赖声明只能位于 `<Path>plugins/todolist/</Path>`；SpecDev 规划工件只记录合同。任何其它产品路径改动均为越界。
_Avoid_: 宿主前置 Ticket、公共测试改动、构建脚本补丁

**宿主既有契约**：Todo 插件只消费当前已有的 TaskRegistry、Session/Agent、EventBus、ResourceIO 与 PluginManager 行为，不为本 change 新增或修改系统契约。
_Avoid_: Todo 宿主补丁、新 capability、兼容别名猜测

**参考实现**：`<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/</Path>` 中用于提取候选行为、测试场景和失败教训的实现；它不是当前 change 的产品合同，也不是可直接复制的权威代码。
_Avoid_: audited-final、完成版

**Todo 执行模式**：用户为 Todo 显式选择的 `manual`、`reminder` 或 `agent_execute`。新 Todo 默认为 `manual`；计划时间或截止时间本身不授予提醒或 Agent 工具执行权。
_Avoid_: 到期即巡查、自动 Agent Todo

**AutomationRun**：一个 Todo × 一个 trigger occurrence 对应的可持久化、可取消、可重试、可诊断的 Agent 自动化执行生命周期；它与 Todo 的 `pending/completed` 主状态正交，并引用一个 Hana Session。
_Avoid_: 巡查日志、Todo 执行状态

**AutomationAttempt**：同一 AutomationRun 内的一次实际执行尝试；重试创建新的 attempt，但不改变 Run 的业务 identity，也不新建另一条 Todo 自动化语义。
_Avoid_: 新 Run、跨 Todo 批次

**AutomationHold**：阻止 AutomationRun 自动创建或重试的显式阻塞状态，例如等待权限、等待用户或策略暂停；它不是 Todo 主状态。
_Avoid_: Todo 暂停、隐式失败

**cancel_requested**：Todo 已向 TaskRegistry task 与 Hana Session 请求终止、但宿主尚未确认的 AutomationRun 状态；不得提前显示为 `cancelled`，取消失败必须保留可见诊断且不自动重试。
_Avoid_: 乐观 cancelled、静默取消失败

**安全取消触发**：关闭 Agent 自动化、完成/删除 Todo 或退出 `agent_execute` 模式时对 future/queued/running AutomationRun 执行的 fail-closed 收敛；恢复或重新启用不复活旧 Run。
_Avoid_: 继续执行旧授权、自动恢复旧 Run

**plannedFor**：Todo 计划进入用户注意范围或计划处理的时间意图；可以是纯日期，也可以是带 IANA 时区的精确时间，不自动创建提醒或 Agent 执行。
_Avoid_: startAt、模糊 due

**deadline**：Todo 必须完成的时间约束，与 `plannedFor` 分离；可以是纯日期或带 IANA 时区的精确时间，不自动构成执行授权。
_Avoid_: plannedFor、reminderAt

**trigger**：明确属于提醒或 Agent 执行的后台触发计划；精确触发保存 local value、IANA timezone 与 derived instant，且必须与 Todo 执行模式一致。
_Avoid_: 从 due 推断触发、字符串日期调度

**Project/List**：Todo 可选的单层稳定归属；一个 Todo 至多归属一个 Project/List，无归属时属于 Inbox。tags 只承担跨 Project/List 的横向分类。
_Avoid_: 多层项目树、用 tag 模拟唯一归属

**一级行动导航**：Todo Page 的稳定一级入口 `Today`、`Inbox`、`Upcoming`、`Projects`、`All`；Calendar、Completed、Automation、Review 属于二级视图，不建立另一套 Todo 状态。
_Avoid_: Day Todo、按分析维度组织一级入口

**快速捕获**：默认创建到 Inbox 的低摩擦 Todo 输入；只有 Today、具体 Project 或明确日期页面可以继承当前可见上下文，继承值和自然语言解析出的日期、Project、tag、提醒或执行模式都必须显示为可移除的 chip/预览。
_Avoid_: 隐式 selectedDate、不可见字段改写

**Automation 视图**：Todo Page 的二级运维视图，集中展示 AutomationRun 状态、失败原因、权限待办、重试/取消和 Hana Session 跳转；Todo 详情只保留最近运行摘要、状态与跳转。
_Avoid_: 在 Todo 编辑器嵌入完整对话、复制运行状态

**RecurrenceRule**：周期系列的权威规则，显式采用 `calendar` 或 `after_completion` 锚点。calendar 按本地日历规则只物化 Upcoming 所需的有界窗口；after_completion 在当前 occurrence 完成后生成下一条，并同时只保留一个活动 occurrence。
_Avoid_: 预生成 Todo 列表作为权威、混合周期锚点

**occurrence**：由 RecurrenceRule 产生、带稳定幂等键和规则来源引用的独立 Todo；它拥有自己的状态、提醒与 AutomationRun，而不是共享状态的展示副本。
_Avoid_: 虚拟 occurrence、无独立状态的系列行

**occurrence override**：只修改单个 occurrence 且保留 RecurrenceRule 来源引用的覆盖；它不回写规则，也不影响后续 occurrence。
_Avoid_: 脱离来源的复制 Todo、修改整个系列

**系列边界**：执行“本次及未来”时以当前 occurrence 为界创建新 RecurrenceRule 版本的切换点；边界后未完成的已物化 occurrence 可以替换，边界前历史和已完成项不可变。
_Avoid_: 原地重写历史规则、级联修改已完成 Todo

**attentionDate**：在用户显示时区中由 `min(plannedFor, deadline)` 派生的只读日期，不持久化也不可编辑。Today 使用 `attentionDate <= today`，Upcoming 使用未来 attentionDate 并去重分组。
_Avoid_: 第三个时间字段、重复 Upcoming 项

**桌面提醒交接**：插件以稳定 identity 持久化 reminder handoff，再发射宿主已有的全局 `notification` event；`handed_off` 只表示进入宿主事件流，不表示操作系统已送达。Bridge 与逐渠道回执不在范围内。
_Avoid_: delivered、sent receipt、Bridge route、notification capability

**回收站删除**：普通 UI 删除使用的可恢复软删除语义，并提供短期撤销；Agent、批量和永久删除另需绑定资源版本与会话的确认令牌。
_Avoid_: 所有删除无差别二次确认、无恢复硬删除

**Session 对话权威**：Hana Session 是 Agent 自动化完整对话的唯一权威；Todo 插件只保存 `sessionRef`、运行元数据、逐 Todo 结果与诊断，Markdown 报告按需导出。
_Avoid_: 插件复制完整会话、默认写工作台报告

**单一调度权威**：Todo 的后台提醒与自动化只由宿主 TaskRegistry 持久化调度；启动恢复仅补偿漏跑，不得并行维护 `setInterval` 第二调度器。
_Avoid_: 双唤醒、插件私有 scheduler

**TaskRegistry readiness handshake**：插件 onStartup 后以有限、可取消的短期 retry 等待已有 `task:*` handler，成功后注册 Todo handler 并恢复业务状态；它不扫描到期 Todo，耗尽后必须显示后台能力不可用。
_Avoid_: 修改 server 启动顺序、无限重试、第二调度器
