---
schema_version: 3
artifact: spec
change: 2026-08-13-personal-quant-finance-workbench
status: ready
ready_for_tickets: true
sources:
  - USER-DECISION:2026-08-13-first-version-all-finance-modules
  - USER-DECISION:2026-08-13-A-HK-personal-workbench-and-plugin-boundary
  - ADR-001
  - ADR-002
  - ADR-003
  - USER-DECISION:2026-08-23-financial-api-source-strategy
  - ADR-004
  - ADR-005
  - ADR-006
  - CODE:<Path>skills2set/hana-plugin-creator/SKILL.md</Path>
  - CODE:<Path>PLUGIN_SDK.md</Path>
  - CODE:<Path>PLUGINS.md</Path>
  - RESEARCH:<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-01/01-solution.md</Path>
  - RESEARCH:<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-02/01-solution.md</Path>
  - RESEARCH:<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-03/01-solution.md</Path>
  - RESEARCH:<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-04/01-solution.md</Path>
  - RESEARCH:<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-05/01-solution.md</Path>
  - RESEARCH:<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-06/01-solution.md</Path>
  - RESEARCH:<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-07/01-solution.md</Path>
  - RESEARCH:<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-08/01-solution.md</Path>
---

# 内置 A/HK 个人量化金融工作台插件

本 Spec 是一个 Deep 规格：它同时定义公共插件接口、金融数据语义、时点和交易规则、私有资料边界、自动化任务、Agent 授权和跨模块验收。首版不是把每个模块做成静态页面，而是让每个模块都有可进入、可操作、可解释的完整状态；数据不足时降低能力状态，不把失败包装成金融结论。

## 1. 问题与目标

HanaKDE 的个人工作台需要一个可包罗万象但边界清楚的金融工作台，服务 A 股和港股的个人研究者。参考项目分别提供了行情面板、研究底稿、A 股数据获取、量化分析 Agent 的可复用经验，但它们的代码、端点和许可不能直接当作 HanaKDE 的宿主契约。当前缺少统一的资产身份、provider 能力、数据质量、个人账本、回测规则、监控任务和 Agent 授权模型，容易出现 HTTP 200 被误当成正确数据、不同市场规则被混用、陈旧行情覆盖新值、私有资料无意外发和“分析”越界成交易动作等问题。现有通用多 provider 方案也没有指定 A 股适用数据集的出厂优先来源、逐数据集选择规则或研究/回测来源冻结合同，日常 fallback 可能因此破坏语义与可复现性。

目标是交付一个可安装、可直接使用的内置插件，提供以下首版产品入口：

- A 股和港股资产搜索、身份映射、自选和研究池。
- 行情、K 线、交易时段 live refresh，以及清晰的 stale/partial/unavailable 状态。
- 财务指标、估值、公告、研报、新闻和证据引用。
- 声明式筛选、因子和策略草稿；规则感知的回测和结果解释。
- 本地手工/文件导入持仓账本、成本、股数、P&L、笔记和私有研报引用。
- 监控、告警和可暂停/恢复的定时研究任务。
- 默认关闭、分层授权、证据约束的 Agent 研究。
- CSV、JSON、Parquet 和 Hana ResourceIO/SessionFile 导入导出。
- 同花顺官方 `hithink-rest` BYOK 配置、逐数据集来源选择、来源决策解释和运行来源清单。
- 受原型门约束的 `hithink-market-dump` 本地历史源状态、磁盘预算与恢复入口。

成功标准是：用户安装插件后能看见全部上述入口；每个入口都有空、加载、成功、陈旧、部分、不可用、阻断、取消和恢复状态；能力矩阵逐项说明市场、数据集、provider、source kind 和质量依据；配置有效且 capability probe 通过时，`hithink-rest` 成为适用 A 股数据集的出厂优先来源；用户能逐数据集选择 `auto | pinned` 并解释实际来源；ResearchRun/BacktestRun 可重放其冻结的来源清单；本地源未通过原型门时明确 blocked/unavailable 而不冒充 supported；确定性路径无需 AI 也能使用；插件停用不影响 HanaKDE 核心；任何路径都没有订单、券商、资金或交易副作用。

明确不包含：券商凭证、券商自动同步、下单、撤单、资金划转、基金交易、tick 级 SLA、后台永久运行、券商级告警送达保证、未经许可的第三方数据复制、产品共享同花顺 Key 或代理转发、嵌入/拉起 Financial-API Python/CLI，以及为本插件直接修改宿主核心/服务/共享层或全局数据库。

## 2. 解决方案与外部行为

### 2.1 插件边界与启动

所有生产实现只能位于 `<Path>plugins/finance-workbench/</Path>`，包括 `manifest.json`、页面、组件、路由、工具、任务、provider adapter、私有存储、测试 fixture 和资源。插件通过 Hana 插件 SDK 的 full-access 内置插件形态暴露 UI、工具、数据目录、ResourceIO、TaskRegistry 和 Agent 能力；“full-access”不等于绕过 capability、隐私、数据质量或交易禁令。

插件被发现、安装、启用或禁用时必须提供 manifest 诊断和版本信息。删除或停用该目录后宿主仍可启动，且不存在金融实现残留。若 SDK 无法提供某一必要能力，当前 change 不得修改宿主；应记录外部依赖并另开 system change。

### 2.2 能力状态矩阵

工作台首页展示 `market x dataset x workflow x provider x source kind` 矩阵。每个单元格必须是以下之一：

- `supported`：条款、身份、字段、单位、PIT、交易日历、调整方式和刷新语义均有证据，并通过 fixture/契约测试。
- `partial`：字段、市场或时段有明确缺口，仍可使用的字段和缺口必须同时显示。
- `experimental`：可运行但尚未完成质量或许可证据，结果不可被标为可信结论。
- `unavailable`：当前没有可用 provider 或导入数据。
- `blocked`：存在明确条款、权限、凭证、质量或安全阻断。

状态卡必须显示原因、最近探测时间、认证/授权状态、实际来源、候选排除原因、替代 provider/导入入口和重试条件。模块不能因为当前 unavailable 而隐藏；也不能把空响应、HTTP 200、有效 API Key、连接成功或模型完成当作 supported 证据。

### 2.3 领域对象与通用数据合同

所有跨模块数据通过版本化、可审计的对象传递：

- `AssetRef`：`market`、规范代码、名称、资产类型、交易币种、有效期、来源 provider 和身份置信度；别名、旧代码和市场迁移必须保留 mapping evidence。
- `ProviderCapability`：provider、source kind、dataset、market、字段 schema、复权/时点/单位、交易日历、刷新和限流信息、认证/许可状态、探测时间、能力状态及阻断原因。
- `DataRequest`：资产集合、日期/时段、数据集、字段、复权、PIT、币种、质量门、预算和请求幂等键。
- `SourcePolicy`：market、dataset、workflow、`auto | pinned` 模式、可用候选、pinned source、语义等价门和 policy version。
- `SourceDecision`：请求、选中 provider/source kind、候选与排除原因、fallback 原因、决策时间、能力探测引用和 SourcePolicy version。
- `RunSourceManifest`：runId、每个输入数据集冻结的 provider/source kind、adapter version、schema hash、snapshot lineage、SourcePolicy version、覆盖窗口和质量状态。
- `DataSnapshot`：请求摘要、provider/source kind、SourceDecision、取得时间、观测时间、交易日历、adjustment、单位、字段来源、行数、schema hash、staleAt、quality gate、原始/派生关系和证据。
- `PortfolioSnapshot`：本地账本版本、交易/持仓事件、股数、成本币种、汇率来源、估值时刻、未实现/已实现 P&L、费用假设和数据新鲜度。
- `StrategyDefinition`：规则版本、Universe、因子、权重、再平衡、市场规则、费用/滑点模型、禁用 look-ahead 的时点约束。
- `ResearchRun`：runId、阶段、输入摘要、RunSourceManifest、证据列表、预算/成本、授权记录、任务状态、checkpoint 和错误。
- `MonitorRule`：资产/筛选条件、阈值、数据集、刷新策略、冷却、告警动作、确认状态、最后一次观测和 stale 行为。
- `EvidenceRef`：来源、取得时间、内容 hash、provider、适用市场/日期、字段和质量状态。模型输出只能引用可解析的 EvidenceRef。
- `ConsentRecord`：runId、字段摘要、目标模型/服务、外发目的、预算、一次性范围、批准时间、撤销/拒绝结果。

跨模块读取必须携带对象版本、时间和质量状态；解析失败、schema 不匹配、单位未知、时点不明、身份不确定或规则缺失时 fail closed。

### 2.4 数据源选择与同花顺接入

provider 配置页内置 `hithink-rest`。用户输入自己的 API Key 后，Key 只提交给 Node route 的敏感配置，不回显原值；系统以最小请求分别探测实际账号在各 A 股 dataset 上的认证、权限、schema、业务错误、限流、时间、单位、复权和 PIT 能力。只有单元格探测通过时，它才成为该适用 A 股数据集的出厂优先来源；未配置、凭据失效、权限不足、业务 `code` 非成功、数据为空或质量证据不足时显示 unavailable/partial/blocked，并保留其他合法 provider 与导入入口。

`hithink-rest` 的候选范围包括其探测通过的 A 股资产、行情快照、日 K、复权事件、财务报表/指标、最新估值、交易日历、当前指数/板块数据、集合竞价、特色数据和基金数据。它不承担港股、分钟 K、tick、宏观、新闻/公告/研报原文；顶层时间为空不能证明行情新鲜度，当前指数成分和有限日历覆盖不能冒充历史 PIT，缺少 revision/vintage 的财务数据不能自动进入 PIT 回测。

用户可以对每个 `market x dataset x workflow` 选择 `auto` 或 `pinned`。`auto` 按 capability、优先级和质量门选源，只允许在身份、字段、单位、复权、日历、PIT 与质量语义等价时有记录地 fallback；`pinned` 只请求指定来源，失败时保留最后可信快照并显示阻断，不自动换源。交互查询每次显示 SourceDecision；ResearchRun 与 BacktestRun 启动时冻结 RunSourceManifest，运行中来源失效时进入 paused/failed/recoverable 或要求新建 run，不在原 run 内静默续接其他来源。

SourcePolicy 预留 `hithink-market-dump` 插件私有本地 source kind，但其初始状态只能是 experimental/unavailable/blocked。只有 Node DuckDB 原型证明 macOS、Windows、Linux 打包加载、首次下载、断点续传、近十日增量、去重、复权、质量、磁盘预算、版本迁移和卸载后，才允许把通过的能力单元格标为 supported。原型不得复制或启动 Python marketdb/CLI 子进程；失败时保留来源入口、原因和替代路径，不修改宿主补洞。

### 2.5 首版用户流程

1. **激活与总览**：首次进入展示 A/HK 能力矩阵、provider 配置/导入入口、隐私与 AI 默认状态；仪表盘组合行情、持仓、研究任务和告警，但每块保留来源、时间和状态。
2. **数据源配置**：用户可以配置 `hithink-rest` BYOK，并逐 dataset 查看 capability；也可以为每个 market/dataset/workflow 选择 `auto` 或 `pinned`，看到选中来源、候选排除原因和 fallback 记录。本地历史源未过原型门时显示 blocked/unavailable、磁盘预算和恢复条件。
3. **数据与资产**：用户搜索代码/名称，选择市场和资产类型，确认 `AssetRef`；系统可显示旧代码迁移和身份冲突。选择数据集后先运行 provider capability probe 与 SourcePolicy 决策，再执行 DataRequest。
4. **行情与研究**：行情页显示报价、K 线、成交量/额单位、复权、交易时段、观测时间、staleAt、SourceDecision 和质量门；财务、公告、研报、新闻页显示原文/ResourceIO 引用、取得时间、覆盖区间和证据状态。
5. **组合与资料**：用户手工录入或导入账本，逐行预览字段映射、币种、费用和错误后提交；系统计算成本与 P&L，不创建券商连接。笔记和私有研报原文件走 ResourceIO，插件只保存派生索引和引用。
6. **筛选与回测**：用户从可验证字段组成筛选/因子/策略，预览 Universe 和缺失字段；回测执行前强制确认市场规则、PIT、复权、交易日历、费用、滑点、流动性、容量假设和 RunSourceManifest，缺任一门禁则阻断或降级。
7. **监控与自动化**：用户创建规则时看到刷新频率、交易时段、冷却和 stale 行为；创建长期监控或定时研究需要确认。任务显示 queued/running/paused/cancel_requested/cancelled/completed/failed/recoverable 状态，并支持 checkpoint 恢复。
8. **Agent 研究**：默认关闭。公开数据只读的一次性研究可在 allowlist、预算和证据门内运行；访问持仓、成本、笔记、私有报告、外发模型、通知、长期任务或写入用户文件前显示字段预览并逐次确认。Agent 无交易、仓位、券商、资金工具。
9. **导出与审计**：用户可以把表格、研究报告、回测结果、运行日志、RunSourceManifest 和 capability matrix 导出为 SessionFile，或通过 ResourceIO 选择目标；导出记录 schema、质量、来源、隐私和版本信息。

### 2.6 错误、降级和状态转换

插件所有 route/tool 失败均返回结构化错误：`code`、`message`、`retryable`、`requestId/runId`、影响范围、已产生的部分结果和用户可执行的替代路径。至少覆盖 `invalid_asset`、`identity_mismatch`、`provider_unreachable`、`rate_limited`、`stale_data`、`partial_data`、`pit_unavailable`、`adjustment_unknown`、`unit_mismatch`、`calendar_unknown`、`cost_model_missing`、`capacity_unknown`、`license_blocked`、`budget_exhausted`、`cancelled`、`permission_denied` 和 `unsubstantiated_output`。

provider fallback 只有在 SourcePolicy 为 `auto` 且身份、字段、单位、PIT、复权、日历和质量语义等价时才可切换，并且必须保存 SourceDecision；`pinned` 不允许 fallback。非等价候选必须显示 provider 变化并重新运行质量门或新建 run。网络、限流、凭据失效或隐藏标签页造成的陈旧数据必须保留最后可信快照，同时显示 stale，不得用新请求失败覆盖它。

`ResearchRun` 和定时任务状态转换必须可观察：`queued -> running -> (paused | cancel_requested | completed | failed)`，`cancel_requested -> cancelled` 只有 worker 确认停止后成立；可恢复失败必须保存 checkpoint 和恢复原因。UI 中止只是请求，不得冒充强取消。

### 2.7 不可违反的副作用规则

插件只能读公开金融数据、读用户显式选择的 ResourceIO、写插件私有派生数据和用户确认的 SessionFile/ResourceIO 目标。禁止注册下单、撤单、资金、券商、仓位自动变更或任何模拟“执行交易”的工具。所有通知、外部模型请求、长期任务和用户文件写入都必须通过 Hana 授权与审计路径。

## 3. 用户故事

- **US-001** 作为个人研究者，我能从一个入口看到 A 股和港股的完整模块和当前能力状态。
- **US-002** 作为研究者，我能搜索并确认一个不会因旧代码或市场歧义而错配的资产。
- **US-003** 作为研究者，我能查看带时点、复权、单位、来源和 stale 标识的报价与 K 线。
- **US-004** 作为研究者，我能建立自选和研究池，并知道每个标的可用的数据集。
- **US-005** 作为研究者，我能阅读财务、估值、公告、研报和新闻，并追溯原始证据。
- **US-006** 作为研究者，我能用自己的 Key 配置 `hithink-rest` 或其他合法 provider，也能导入 CSV/JSON/Parquet 来补足不可用数据。
- **US-007** 作为个人用户，我能手工维护或导入本地持仓、成本、股数、费用和币种。
- **US-008** 作为个人用户，我能看到可解释的组合估值和 P&L，并区分估值时刻和陈旧状态。
- **US-009** 作为个人用户，我能保存笔记和私有研报引用，且原文件仍由 ResourceIO 管理。
- **US-010** 作为量化研究者，我能声明筛选、因子和策略，不依赖隐藏代码副作用。
- **US-011** 作为量化研究者，我能在缺 PIT、日历、复权或成本证据时看到回测被阻断的具体原因。
- **US-012** 作为量化研究者，我能查看含费用、滑点、流动性、容量和规则假设的回测结果。
- **US-013** 作为研究者，我能创建、暂停、恢复和取消监控规则，并看到 stale 时的行为。
- **US-014** 作为研究者，我能运行定时研究任务并从 checkpoint 恢复可恢复失败。
- **US-015** 作为用户，我能在 AI 默认关闭时独立使用确定性行情、筛选、账本和回测。
- **US-016** 作为用户，我能让 Agent 分析公开证据，并在任何私有资料外发前逐字段确认。
- **US-017** 作为用户，我能拒绝通知、长期任务、文件写入和模型外发，且拒绝后没有副作用。
- **US-018** 作为用户，我能导出带来源、质量和隐私标记的研究结果与审计记录。
- **US-019** 作为研究者，我能按 market、dataset 和 workflow 选择 `auto` 或 `pinned`，并看到系统实际选择来源及排除其他候选的原因。
- **US-020** 作为量化研究者，我能让研究和回测冻结完整来源清单，在来源失效时停止或新建 run，而不是静默换源改变结果。
- **US-021** 作为本地研究者，我能看到 Market Dumps 本地源的支持状态、磁盘预算、同步进度和恢复条件，且原型门未通过时不会被误导为 supported。

## 4. 验收合同

以下合同均针对 `<Path>plugins/finance-workbench/</Path>` 内的插件实现。验证可使用插件 route/tool contract tests、provider fixture、ResourceIO/TaskRegistry 集成测试、静态扫描和 Playwright UI 测试；不得以人工“看起来能用”替代质量门。

### 4.1 安装、范围与能力

- **AC-001** 插件 manifest 可被 Hana 发现、启用和禁用，首页显示插件版本、依赖和诊断；删除插件目录不阻断宿主启动。
- **AC-002** 静态扫描证明金融实现、测试 fixture 和资源只出现在 `<Path>plugins/finance-workbench/</Path>`；core/server/shared、宿主 DB migration 和其他插件没有本 change 代码。
- **AC-003** 首页同时显示 A 股和港股的模块矩阵；模块不可用时仍保留入口、原因、替代路径和重试条件。
- **AC-004** capability probe 记录 provider/source kind、认证与账号授权、条款、字段 schema、PIT、单位、复权、日历、刷新、限流、探测时间和状态；有效 Key、未知证据或单个成功数据集不能让其他单元格成为 `supported`。

### 4.2 资产、行情与研究数据

- **AC-005** 搜索结果生成带 market、规范代码、类型、币种、有效期和来源的 `AssetRef`；旧代码迁移、冲突和低置信度必须阻断下游计算并给出人工确认。
- **AC-006** 每个 `DataSnapshot` 可追溯 request/provider/source kind/SourceDecision/取得时间/观测时间/schema hash/单位/复权/PIT/日历/staleAt/quality gate；字段语义或 lineage 不明时 fail closed。
- **AC-007** A 股和港股报价、K 线、成交量和成交额分别显示单位及观测时间；交易时段按市场日历刷新，配置频率和隐藏标签页暂停行为可见，陈旧值有 stale 标记。
- **AC-008** provider 断开、凭据失效、权限不足、限流、空响应、业务错误代码或 HTTP 200 空数据都能映射为结构化失败/部分状态，并保留最后可信快照；只有 `auto` 且语义等价时才可执行有 SourceDecision 记录的 fallback，`pinned` 不换源。
- **AC-009** 财务、估值、公告、研报、新闻条目显示覆盖区间、取得时间、原始链接或 ResourceIO 引用、内容 hash 和证据状态；缺 PIT 或原文时不得显示为确定性事实。
- **AC-010** 自选和研究池支持创建、修改、排序、删除、市场混合和数据集可用性查看，并能从资产页回到研究上下文。

### 4.3 组合、私有资料与导入导出

- **AC-011** 用户可手工录入账本事件或导入 CSV/JSON/Parquet；提交前显示字段映射、必填项、市场/币种、重复行、无效日期和错误，不合格行不进入派生账本。
- **AC-012** 组合计算明确股数、成本、费用、汇率、估值时刻和行情新鲜度，区分已实现/未实现 P&L；缺价格或汇率时显示 partial/stale，不静默归零。
- **AC-013** 原始持仓文件、笔记和私有研报通过 ResourceIO 读取/保存；插件只保留最小派生索引和 EvidenceRef，删除或撤销引用后搜索结果不可继续泄露正文。
- **AC-014** 导入、导出和索引操作均有 schema/version、requestId、来源、质量和隐私标记；导出到 SessionFile/ResourceIO 前显示目标和字段范围。
- **AC-015** 私有资料路径不会进入前端源码、普通日志、错误消息、provider 请求或模型请求；未批准的读取、外发和写入返回 `permission_denied` 且无副作用。

### 4.4 筛选、因子与回测

- **AC-016** 筛选、因子和策略定义可保存、版本化、解释每个字段和缺失处理；非法字段、单位不一致或身份不确定时不能执行。
- **AC-017** 回测开始前强制显示并确认交易日历、A/HK 规则、T+1/涨跌停、复权、PIT、费用、滑点、流动性、容量和数据覆盖；任一高影响门缺失则 blocked/partial。
- **AC-018** 回测结果携带 `StrategyDefinition`、RunSourceManifest、数据快照、成本 manifest、运行时间、随机性/确定性标记和错误/缺失统计，不能只返回收益率。
- **AC-019** 回测结果同时展示收益、风险、回撤、换手、成本影响、容量/流动性限制和样本覆盖，并明确“研究结果，不构成投资建议”；模型不能改变门禁。
- **AC-020** 任何时间旅行、幸存者偏差、错误复权、错误成交单位或未来字段使用在 fixture 中都能被检测并阻断或标成不可用。

### 4.5 监控、任务与自动化

- **AC-021** 创建监控规则时必须确认资产/筛选条件、阈值、数据集、刷新、交易时段、冷却、stale 行为和告警目标；长期规则和通知需要一次性授权。
- **AC-022** 监控在网络失败、限流、非交易时段和 stale 输入时遵守规则，不把 stale 触发当作新行情；每次观测保存 source、time、quality 和决策原因。
- **AC-023** 定时研究任务展示 queued/running/paused/cancel_requested/cancelled/completed/failed/recoverable；取消仅在 worker 确认后成立，恢复从 checkpoint 继续且不重复副作用。
- **AC-024** 任务和监控可暂停、恢复、重试和查看审计；应用退出/睡眠后不承诺永久后台运行，恢复时必须重新探测数据和授权。

### 4.6 Agent、授权与安全

- **AC-025** AI 默认关闭；AI 关闭或 provider 不可用时行情、资产、账本、筛选和回测确定性流程仍可完成。
- **AC-026** 公开数据只读的一次性 Agent 运行仅能调用 allowlist 工具，在预算内执行，并为每个事实绑定 EvidenceRef；无证据结论标为 `unsubstantiated_output`。
- **AC-027** 读取持仓/成本/笔记/私有报告、发送外部模型、创建长期任务、通知或写用户文件前显示字段摘要、目标、用途和预算；同意只对当前 run/字段生效，拒绝后无外发或写入。
- **AC-028** Agent 工具清单不存在交易、仓位变更、券商、资金、下单或撤单能力；静态扫描和运行时 allowlist 均拒绝这些意图。
- **AC-029** secret 与 `hithink-rest` BYOK 只通过 Hana 敏感配置/secret capability 在 Node route 使用，前端、日志、快照、导出、fixture、EvidenceRef 和普通错误不可见；provider/model、成本、授权和结果摘要进入可审计记录。

### 4.7 兼容、体验与诊断

- **AC-030** provider、任务、导入和 Agent 的结构化错误包含稳定 code、retryable、requestId/runId、部分结果和替代路径；UI 可恢复而不丢失最后可信数据。
- **AC-031** 主要页面在桌面和窄屏均能操作，加载/空/错误/陈旧/部分/阻断/取消状态不重叠；长列表、K 线和任务进度不阻塞宿主 UI。
- **AC-032** 插件更新使用版本化私有 schema 和显式迁移；未知字段、旧 provider 结果和失效缓存被拒绝或隔离，不静默改变历史 P&L/回测。
- **AC-033** 安装、provider 探测、数据请求、导入、回测、任务、授权、导出和错误都可在插件诊断页按 requestId/runId 检索，并提供脱敏日志和质量解释。

### 4.8 数据源选择与运行可复现性

- **AC-034** 未配置 `hithink-rest` BYOK 时，适用 A 股单元格显示 unavailable 和配置入口；配置后逐 dataset 最小探测认证、权限、业务信封、schema、时间、单位、复权、PIT 与限流，只有通过的单元格将其列为出厂优先来源。港股、分钟 K、tick 和新闻/公告/研报原文不得路由到该 adapter。
- **AC-035** 每个 market x dataset x workflow 可保存版本化 `auto | pinned` SourcePolicy；`auto` 的等价 fallback 产生可检索 SourceDecision，非等价候选必须重新确认质量门，`pinned` 失败则保留最后可信快照并明确阻断。
- **AC-036** ResearchRun 与 BacktestRun 启动时生成不可变 RunSourceManifest，覆盖每个输入数据集的 provider/source kind、adapter version、schema hash、snapshot lineage、SourcePolicy version、时间窗和质量状态；恢复或重放时不匹配即阻断，运行中不得静默更换来源。
- **AC-037** `hithink-market-dump` 在三平台原型证据不完整时只能是 experimental/unavailable/blocked；只有打包加载、下载/断点续传、增量幂等、复权、质量、磁盘预算、迁移和卸载门全部通过的能力单元格才可标 supported，且实现与运行时均不复制或拉起 Python marketdb/CLI。
- **AC-038** 诊断与导出能按 requestId/runId 展示脱敏的 capability probe、SourcePolicy、SourceDecision、RunSourceManifest、本地同步状态和候选排除原因；API Key 原值、敏感配置和未授权原始数据永不出现。

## 5. 范围

### In scope

- 内置 `finance-workbench` 插件的 manifest、UI、routes/tools、provider adapters、能力探测、缓存/限流/失败降级、A/HK 数据语义、资产身份、自选/研究池、财务/估值/公告/研报/新闻、筛选/因子/回测、监控/告警、定时研究、本地组合/持仓/笔记、Agent 研究、导入导出、诊断和插件内测试。
- 内置 `hithink-rest` BYOK adapter、逐 dataset capability probe、逐 market/dataset/workflow SourcePolicy、SourceDecision、RunSourceManifest 和来源诊断/导出。
- 定义 `hithink-market-dump` 本地 source kind 及其 bounded prototype gate；生产支持等级由跨平台原型证据决定，失败时交付可见的 blocked/unavailable 状态和替代路径。
- 复用参考项目验证过的行为思想：A/HK 市场差异、交易时段和 T+1/涨跌停、数据源握手后真实 K 线校验、旧代码迁移、字段单位、缓存与限流、规则化研究阶段、可暂停/恢复任务和本地资料边界。
- 复用 HanaKDE 现有插件 SDK、ResourceIO、TaskRegistry、secret、Capability、SessionFile 和 Agent 授权机制。

### Out of scope

- **OOS-001** 券商 credential、券商同步、下单/撤单/资金划转、模拟执行交易和任何仓位自动变更。
- **OOS-002** tick 级低延迟 SLA、交易所直连、后台永久任务、券商级通知送达和自动交易。
- **OOS-003** 把参考仓库的未验证端点、密钥、数据许可、Python/Polars/DuckDB/TCP runtime 直接移植到插件。
- **OOS-004** 修改 HanaKDE core/server/shared、全局注册表、宿主数据库或其他插件以承载金融逻辑。
- **OOS-005** 将模型预测、回测收益或告警解释为投资建议或金融事实。
- **OOS-006** 产品共享同花顺 API Key、由 Hana 代理同花顺请求或再分发数据；未来只有取得书面商业与数据授权后才能另立 change。
- **OOS-007** 用 `hithink-rest` 填充港股、分钟 K、tick、宏观或新闻/公告/研报原文，或把当前指数成分、有限日历和无 revision/vintage 财务数据冒充历史 PIT。
- **OOS-008** 在原型门通过前把 `hithink-market-dump` 标为 supported，复制上游 Python 实现，或从插件拉起 Financial-API Python/CLI 子进程。

## 6. 已锁定实现约束

- **DEC-001 目录**：所有实现只在 `<Path>plugins/finance-workbench/</Path>`；需要宿主能力时另开 system change。
- **DEC-002 全模块首版**：所有规划模块必须有用户可见入口和完整状态；V0-V5 仅表示依赖/成熟度，不得删除模块。
- **DEC-003 能力状态**：每个 market/dataset/workflow/provider 单元使用 `supported/partial/experimental/unavailable/blocked`，状态必须有原因、时间和替代路径。
- **DEC-004 数据正确性**：资产身份、市场日历、PIT、复权、单位、规则、成本、容量和证据任一未知时 fail closed 或降级，不默认为可信。
- **DEC-005 数据源**：内置多 provider adapter + capability probe；只复用研究中可验证的缓存、限流、握手后真实数据校验和失败/降级思想；许可和条款必须单独通过。来源：`ADR-001`、`ADR-004`。
- **DEC-006 个人资料**：本地手工/文件导入账本、笔记和私有引用；ResourceIO 管原文件，插件私有目录存派生索引；无 broker sync。
- **DEC-007 实时自动化**：交易时段 live quote、可配置刷新、staleAt、监控和定时研究；支持暂停/恢复/取消请求/恢复 checkpoint，不承诺永久后台或 tick SLA。
- **DEC-008 Agent**：默认关闭；公开只读一次性可自动，私有字段/外发/长期任务/通知/文件写入逐次确认；交易、仓位、券商、资金永久禁止。
- **DEC-009 可卸载与最小权限**：manifest/capability 按实际使用申请，插件禁用/删除不破坏宿主，secret/日志/导出不泄露隐私。
- **DEC-010 同花顺 REST**：内置 `hithink-rest`，只采用用户 BYOK；逐 dataset probe 通过后作为适用 A 股数据集的出厂优先 provider，不作为港股或全域唯一来源。来源：`ADR-004`。
- **DEC-011 来源策略与冻结**：每个 market x dataset x workflow 使用版本化 `auto | pinned` SourcePolicy；交互 fallback 必须语义等价且有 SourceDecision，ResearchRun/BacktestRun 冻结 RunSourceManifest，运行中不静默换源。来源：`ADR-005`。
- **DEC-012 本地历史源原型门**：SourcePolicy 定义 `hithink-market-dump`，候选实现为插件私有 Node DuckDB；三平台打包、同步、复权、质量、磁盘、迁移与卸载原型通过前不得标 supported，也不得复制或拉起 Python/CLI。来源：`ADR-006`。

## 7. 数据、接口与兼容

插件内部 route/tool API 必须以版本化对象承载上述领域合同，至少支持请求幂等键、分页/限制、requestId/runId、质量状态和结构化错误；不得把 provider 原始字段直接暴露为稳定公共 API。UI、工具和任务共享同一 DataSnapshot/EvidenceRef/ConsentRecord/SourcePolicy/SourceDecision/RunSourceManifest 语义。

插件私有数据使用 `ctx.dataDir` 下的版本化 envelope，缓存键包含 market、asset、dataset、workflow、时间窗、adjustment、PIT、provider/source kind、SourcePolicy version 和 schema version；缓存命中仍需检查 staleAt、capability 与 lineage。SourcePolicy、SourceDecision、RunSourceManifest 和本地同步状态使用独立版本化 envelope；旧快照缺来源清单时隔离或降级，不静默补造 lineage。原始用户文件只通过 ResourceIO 的引用读取，导出只通过 SessionFile/ResourceIO 目标。不存在从参考项目本地存储自动迁移的承诺；如需导入，走显式 CSV/JSON/Parquet 映射预览。

`hithink-rest` 只由 Node route 通过 `ctx.network.fetch()` 访问 manifest allowlist 中的官方 host，并把 HTTP 与 `{code,message,request_id,data}` 业务信封共同映射到稳定插件错误；API Key 只来自 owner 可配置的敏感配置。`hithink-market-dump` 数据只属于插件私有目录，必须记录数据版本、覆盖窗口、文件/hash、同步 checkpoint、磁盘预算和删除/保留选择；任何 native DuckDB production dependency 还必须通过精确 runtime entry 完整性、打包和 import smoke。

manifest 仅声明实际需要的 network/provider、ResourceIO、TaskRegistry、secret/configuration、session/agent/model capability 和精确 allowedHosts，并遵循 hana-plugin-creator 的安装、缓存破坏和重装流程。插件实现不增加 HanaKDE 宿主公共 API；SDK 缺口、通用 OS Keyring/Secret API、跨插件 provider registry、Python runtime、原始 TCP/WebSocket worker 或系统级数据库能力必须另开 system change。

## 8. 非功能要求

- **金融正确性**：测试时区、交易日历、A/HK 规则、旧代码迁移、T+1、涨跌停、复权、成交量/额单位、PIT、成本、费用、滑点、容量和汇率；不确定即标记并阻断。
- **隐私与安全**：最小 capability；BYOK/secret 不进前端、日志、快照、fixture 或导出；私有字段、模型外发、通知和文件写入有逐次确认和审计；Agent 无交易工具。
- **可靠性与可复现性**：缓存、限流、退避和 provider fallback 不改变语义；断网、凭据失效、限流、空响应、隐藏标签页和睡眠后恢复均保留最后可信快照并显示状态；运行恢复必须核对 RunSourceManifest，不能用新来源延续旧 run。
- **性能与容量**：大列表、K 线、筛选和任务进度采用分页/分段/后台任务，不阻塞宿主 UI；每个 provider 和任务暴露容量、预算和超时状态；本地历史源还必须在下载前显示磁盘预算与覆盖窗口，不能使用未声明的无限重试或无上限增长。
- **可观察性**：每个请求/任务/授权/导入导出都有可检索的 requestId/runId、脱敏错误、provider/model、SourceDecision/RunSourceManifest、时间、成本、质量和 checkpoint；用户能在诊断页解释结果为何可用、为何选中或为何不可用。
- **兼容性**：插件数据、SourcePolicy、RunSourceManifest 和本地历史数据 schema 均版本化，更新/降级不静默重算历史账本和回测；未知 lineage/版本被隔离，窄屏、键盘、加载与错误状态保持可操作。

## 9. 验证策略

实现阶段按以下门禁验证，不以单一端到端 happy path 代替：

1. **插件边界**：manifest/schema 校验、发现/启停/卸载、静态路径扫描、无插件宿主启动；覆盖 AC-001/002/032。
2. **能力与 provider fixture**：为 A/HK 各数据集准备成功、旧代码、空 200、业务错误信封、凭据失效、权限不足、限流、断网、单位冲突、PIT/许可缺失和 stale fixture；对 `hithink-rest` 固定测试 A 股允许范围及港股/分钟 K/原文拒绝范围，覆盖 AC-003 至 AC-009、AC-030、AC-034。
3. **来源路由与运行冻结**：用确定性候选矩阵测试 `auto | pinned`、等价/非等价 fallback、候选排除、运行中失效、恢复/重放 manifest mismatch 和未知 lineage 隔离；覆盖 AC-006、AC-008、AC-018、AC-022、AC-035、AC-036、AC-038。
4. **本地历史源原型**：在 macOS、Windows、Linux 验证 native DuckDB 精确入口、打包/import、下载中断、断点续传、近十日重复增量、复权/质量 fixture、磁盘预算、版本迁移和卸载；任一门失败时验证状态不会超过 experimental/blocked，覆盖 AC-001、AC-032、AC-037、AC-038。
5. **确定性金融计算**：时区/日历/T+1/涨跌停/复权/成本/费用/滑点/容量/PIT/回测偏差 fixture；覆盖 AC-012、AC-016 至 AC-020、AC-036。
6. **ResourceIO 与隐私**：导入预览、字段拒绝、私有引用删除、BYOK/secret 脱敏、SessionFile/ResourceIO 导出和未授权外发断言；覆盖 AC-011 至 AC-015、AC-027、AC-029、AC-034、AC-038。
7. **任务与自动化**：TaskRegistry 的 pause/resume/cancel_requested/cancelled/recoverable、checkpoint 幂等、非交易时段、stale 和等价实时源切换记录；覆盖 AC-021 至 AC-024、AC-035。
8. **Agent 安全**：公开 allowlist 自动运行、EvidenceRef 绑定、预算耗尽、字段级确认/拒绝、长期任务/通知/文件写入确认和交易意图静态/运行时拒绝；覆盖 AC-025 至 AC-029。
9. **用户体验与诊断**：桌面/窄屏 Playwright、加载/空/部分/阻断/陈旧/取消/恢复状态、来源选择、候选原因、运行 manifest、诊断检索和脱敏快照；覆盖 AC-010、AC-030 至 AC-038。

任何 provider 在实现时仍需验证条款、schema、PIT、单位和容量；验证未通过时保留模块入口并将状态置为 `experimental`、`unavailable` 或 `blocked`，不能为了通过演示而降低门禁。

## 10. 风险、假设与未决问题

高影响产品决策已在 INV-01..INV-08、ADR-001..ADR-006、D-001..D-015 和用户共识中闭合，因此本 Spec 可以进入 tickets。以下事实会改变能力状态或触发原型/质量门，但其外部失败行为已经确定，不再构成范围或接口未决项：

- 首版实际启用的 provider 组合由条款、质量、PIT、单位和容量探测决定；不能预先承诺所有数据集均 `supported`。
- `hithink-rest` 的价格、QPS、商用/再分发条款和账号 capability 以用户账号及实际探测为准；BYOK 不授予产品代理或再分发权，未知项显示 blocked/unavailable。
- `hithink-rest` 显式代码行情的顶层时间可能为空，公开财务没有 revision/vintage，指数成分是当前值且交易日历窗口有限；这些字段必须停留在对应 observed/latest/limited 能力，不自动通过 live freshness 或 PIT backtest 门。
- `hithink-market-dump` 的 native DuckDB 三平台打包、数据生命周期和磁盘行为仍需 bounded prototype；原型结果只决定 supported/experimental/blocked，不改变 source kind、插件边界或替代路径合同。
- 某些 provider 可能只覆盖 A 股或港股、日线而非实时、或只提供部分财务字段；矩阵和导入路径必须如实反映。
- Hana 插件 SDK 若缺少某个必要 capability，不得在插件内变通越权；记录外部依赖并另开 system change。
- 交易时段、汇率、企业行为和市场规则会变化，必须以版本化配置和探测时间随结果保存。
- AI 服务的模型、费用、地区和外发政策由用户配置与授权决定；无模型时确定性路径仍必须完整可用。

没有未决的首版范围、市场、数据源策略、运行来源冻结、隐私、Agent 副作用或实现目录选择；这些受门禁事实不会把任何模块或 provider 伪装为可用数据，也不会扩大本 change 的插件边界。
