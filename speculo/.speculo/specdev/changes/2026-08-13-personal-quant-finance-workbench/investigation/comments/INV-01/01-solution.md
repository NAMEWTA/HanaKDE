---
artifact: wayfinder-solution-comment
ticket: INV-01
sequence: 1
resolution: answered
---

# Solution: TickFlow 量化面板能力与工程边界

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/INV-01-tickflow-stock-panel.md</Path>`
- **答案：** TickFlow 最值得 Hana 吸收的不是其 14 个一级页面或整套 Python 服务，而是一个可审计的量化研究闭环：数据能力探测与同步 -> 标准化/复权/特征 -> 筛选与策略 -> 回测验证 -> 监控 -> 复盘。Hana 应在 `<Path>plugins/quant-finance-workbench/</Path>` 内按宿主 page/routes/tools/tasks/model/resources 契约重构这个闭环；首个垂直切片不复制独立 FastAPI、鉴权、OpenAI/Codex CLI、常驻 APScheduler、DuckDB/Parquet 全量数据湖、动态 Python 策略或抓站数据源。任何不可由公开插件契约表达的 Python/子进程/常驻计算能力，继续由“插件运行时架构与契约裁决”决定外置、降级或另立系统 change。
- **事实与来源：** 调查固定在 `ecfddb451e97f6fc9a7e43ac33e4ef0e69933b33`；以 `<Path>temp/finance-references/tickflow-stock-panel/</Path>` 的源码、测试、`CONTRIBUTING.md`、`LICENSE` 和部署文件为一手证据，以 README 只表示产品意图；Hana 初步映射以 `<Path>PLUGIN_SDK.md</Path>`、`<Path>PLUGINS.md</Path>` 和 `<Path>packages/plugin-runtime/README.md</Path>` 为依据。详细声明见下文 R-001 至 R-010。
- **资产：** `<Path>temp/finance-references/tickflow-stock-panel/</Path>`，<Url>https://github.com/shy3130/tickflow-stock-panel</Url>
- **后续 Ticket 所依赖的事实：** “跨项目能力模型与价值分层”可直接复用本文件的用户闭环、能力矩阵和 adopt/adapt/reject 结论；“Hana 插件能力契约与破盒边界”需验证这里标为 provisional 的任务、流式进度、取消和计算运行时映射；“金融正确性数据治理与用户安全契约”需把数据语义、回测运行清单、点时数据和显式降级收紧为 MUST/MUST NOT 测试条款。
- **新浮现的 Tickets：** 无；发现的问题均已被现有“数据能力层与降级治理”“Hana 插件能力契约与破盒边界”“金融正确性数据治理与用户安全契约”覆盖。
- **升级的战争迷雾：** 无；本次把“运行时是否破盒”“金融语义是否可信”从模糊风险定位到已有 Ticket，不提前替代其最终裁决。
- **对现有 Tickets 的影响：** update INV-03、INV-05、INV-06、INV-07、INV-10；不改变当前插件落点裁决，也不把候选首版范围提前变成产品承诺。

## 决策摘要

TickFlow 应被视为一间“量化架构实验室”，不能作为 Hana 插件的可嵌入依赖。它已经证明了从数据到反馈的完整产品链路，也暴露了独立全栈应用在数据源耦合、长期任务、缓存一致性、动态代码执行、部署重量和文档漂移上的成本。

Hana 的产品中心应是一个工作流，而不是页面集合：

```text
连接/诊断数据能力
  -> 同步并形成带血缘的数据快照
  -> 构建声明式信号并筛选候选
  -> 用显式成交与成本假设回测
  -> 将已验证条件提升为监控规则
  -> 在告警与复盘中回到证据、策略版本和运行记录
```

“全能”应解释为同一套可追溯对象能跨研究阶段流动，而不是首版复刻所有市场、榜单、指标、优化器和 AI 角色。

## Research: TickFlow 的用户闭环、工程边界与 Hana 映射

- **Decision / target：** 决定 TickFlow 的哪些能力应采用、改造或拒绝，并为 Hana 插件后续产品和架构票据提供事实底稿。
- **Scope / version：** tickflow-stock-panel commit `ecfddb451e97f6fc9a7e43ac33e4ef0e69933b33`；Hana 当前工作区插件公开契约。未跟随上游未来提交。
- **Stop condition：** 核心用户任务和运行路径有源码定位；候选能力有 adopt/adapt/reject、依赖与风险；README 与代码不一致已记录。

### R-001：真正的用户价值是“研究对象贯穿闭环”

- **Claim：** 上游的主要用户旅程不是单独看盘，而是从初始化/数据诊断进入市场与自选，再把同一标的、信号或策略用于筛选、回测、监控和复盘。
- **Type：** code fact + inference
- **Source：** `<Path>temp/finance-references/tickflow-stock-panel/frontend/src/router.tsx</Path>` 懒加载并路由 Dashboard、Watchlist、Screener、Backtest、Financials、Data、Monitor、Stock Analysis、Concept、Industry、Limit Ladder、Indices、Regime、Review、Settings；`<Path>temp/finance-references/tickflow-stock-panel/frontend/src/components/Layout.tsx</Path>` 维护同一导航、自选查询缓存与实时 quote stream；`<Path>temp/finance-references/tickflow-stock-panel/README.md</Path>` 描述选股、回测、监控与复盘的产品意图。
- **Confidence：** high
- **Limits：** 路由存在不等于各页面成熟度一致；品牌、登录、设置和开发页不是量化领域能力。
- **Artifact impact：** 后续信息架构应围绕“标的/策略/研究运行”上下文切换，不能照抄 14 个一级导航。

主要任务及 Hana 价值如下：

| 用户任务 | TickFlow 能力 | Hana 结论 |
|---|---|---|
| 首次接入 | onboarding、API Key/数据源设置、能力档位与数据状态 | adopt：先显示能做什么、缺什么和数据新鲜度 |
| 日常观察 | 市场概览、指数、市场环境、涨停梯队、概念/行业 | adapt：保留摘要与可钻取证据，不把榜单数量当核心价值 |
| 管理研究池 | 自选、批量导入、行情刷新、标的详情 | adopt：作为筛选、回测、监控的共同入口 |
| 形成假设 | 18 个内置策略、自定义条件、组合策略、参数覆盖 | adapt：统一成版本化声明式策略对象 |
| 快速验证 | 个股/组合/自由信号、因子回测、参数优化、walk-forward | adopt core，defer advanced：先保证成交与数据语义正确 |
| 持续观察 | signal/price/market/strategy 规则、scope、AND/OR、cooldown | adopt：从回测结果一键提升规则，保留基线与去重状态 |
| 解释与复盘 | 个股分析、市场复盘、AI 报告历史、推送 | adapt：调用 Hana 宿主模型并附数据快照/来源，不自建 AI provider |
| 维护可信度 | 数据同步、修复、进度、错误、缓存刷新、设置 | adopt：数据健康与任务状态是产品面，不藏在日志中 |

### R-002：数据到反馈的分层链路值得采用，具体数据湖不应直接移植

- **Claim：** 当前代码形成了 provider -> 标准化数据 -> Parquet/DuckDB repository -> enriched/indicator -> strategy/monitor/backtest -> FastAPI/SSE -> React query cache 的闭环；这是可采用的分层思想，但实现是一个重量级独立应用。
- **Type：** code fact + recommendation
- **Source：** `<Path>temp/finance-references/tickflow-stock-panel/backend/app/data_providers/base.py</Path>` 定义 stock/index/etf 与 instruments/daily/adj_factor/minute/realtime/financial 能力；`<Path>temp/finance-references/tickflow-stock-panel/backend/app/parquet.py</Path>` 定义 daily/enriched schema；`<Path>temp/finance-references/tickflow-stock-panel/backend/app/tickflow/repository.py</Path>` 建 DuckDB views、分区 Parquet、内存缓存和原子替换；`<Path>temp/finance-references/tickflow-stock-panel/backend/app/jobs/daily_pipeline.py</Path>` 串起同步、复权、enriched、指数/ETF、分钟数据、市场环境和视图刷新；`<Path>temp/finance-references/tickflow-stock-panel/frontend/src/main.tsx</Path>` 与 `<Path>temp/finance-references/tickflow-stock-panel/frontend/src/components/Layout.tsx</Path>` 负责查询缓存和实时反馈。
- **Confidence：** high
- **Limits：** 未做全仓性能基准；数据量、供应商档位与设备内存会显著改变成本。
- **Artifact impact：** 保留层次和不可变运行快照；首切片用插件自有的小规模、可迁移存储证明闭环，是否需要列式数据湖由 INV-05/INV-10 裁决。

上游盘后链路的实际阶段包括：维表 -> universe -> 日 K -> 除权因子 -> enriched -> 指数/ETF -> 分钟 K -> 市场环境 -> DuckDB views；工作日盘前维表和盘后管道由 Asia/Shanghai 的 APScheduler 触发。写 Parquet 使用同目录临时文件后原子替换，并在落盘后刷新多层缓存。可取之处是阶段化、单飞、原子写和缓存失效协议；不可直接继承的是常驻 scheduler、多个进程内缓存、DuckDB 视图重建与全市场同步的运维面。

Hana 数据对象至少需要以下共同元数据，具体 MUST 条款由 INV-06 收敛：

```text
dataset_id / snapshot_id / schema_version
provider / source_uri / license_or_terms / fetched_at / as_of
market / asset_type / symbol / currency / timezone / frequency
adjustment / unit / trading_calendar
freshness / completeness / quality_flags / conflicts
```

任何筛选、回测、监控或 AI 报告都应引用 `snapshot_id` 和策略/特征版本，而不是只保存最终数值。

### R-003：provider 抽象方向正确，但路由与降级尚未完全去 TickFlow 化

- **Claim：** 上游已经有能力声明和标准化 provider protocol，也支持 YAML HTTP 源与运行时插件；但核心 registry 仍只注册 TickFlow，部分服务直接调用 TickFlow，并在自定义源缺失能力时隐式回退。
- **Type：** code fact
- **Source：** `<Path>temp/finance-references/tickflow-stock-panel/backend/app/data_providers/base.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/app/data_providers/registry.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/app/data_providers/custom/</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/docs/custom-data-source.md</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/docs/plugin-development.md</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/app/services/quote_service.py</Path>` 在自定义实时源未声明 realtime 时回退 TickFlow；`<Path>temp/finance-references/tickflow-stock-panel/backend/app/services/instrument_sync.py</Path>` 在非 TickFlow provider 无维表能力或失败时走 TickFlow。
- **Confidence：** high
- **Limits：** YAML HTTP source 与代码型 data-source plugin 是两个扩展层，支持面不同，不能把其文档合并成一个统一能力承诺。
- **Artifact impact：** Hana provider contract 必须按 dataset capability 路由，并把来源、缺能力、失败与任何人工选择的 fallback 写入运行记录；禁止静默混源。

建议的 provider 结果不是“返回一些 rows”，而是：

```text
request + declared capability
  -> normalized rows
  -> provenance + schema/unit contract
  -> freshness/completeness result
  -> explicit error or explicit fallback decision
```

供应商凭据、档位、频率和请求预算是 provider 配置，不得渗入策略或页面。抓取型 stock-sdk 在上游 Docker 默认禁用，Hana 不应把未经授权的网页接口包装成内置稳定数据能力。

### R-004：策略的统一身份与声明式条件可采用，动态 Python 必须拒绝直接移植

- **Claim：** 上游把 builtin/custom/ai/composite 策略放进统一 registry，统一参数、依赖和执行入口；18 个内置策略是示例资产而非架构本身。无代码条件被编译为白名单 Polars 表达式，但 AI/自定义 Python 最终仍由 `importlib` 装载执行，AST 白名单不等于进程或资源隔离。
- **Type：** code fact + recommendation
- **Source：** `<Path>temp/finance-references/tickflow-stock-panel/backend/app/strategy/engine.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/app/strategy/custom_signals.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/app/strategy/ai_generator.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/app/strategy/builtin/</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/tests/test_strategy_code_save.py</Path>`。
- **Confidence：** high
- **Limits：** AST 检查确实拒绝危险 import/call 等已知模式，但不能给同进程 Python 任意代码提供完备安全边界。
- **Artifact impact：** Hana 首版策略采用版本化 JSON/AST DSL：字段、运算符、窗口、参数、scope、依赖、输出与基础过滤均为白名单；Agent 可生成草稿，但必须经过同一验证器。可编程策略若未来需要，应作为可信本地 runner/sidecar 的独立边界问题。

策略应成为跨模块的单一对象：

```text
StrategyDefinition
  id + version + source + asset_types + timeframes
  params + dependencies + expression/composition
  data_contract_version + created_at + author
```

筛选、回测和监控只能调用同一版本策略，不允许各自复制条件或使用不同默认参数。

### R-005：回测正确性纪律应采用，但所有默认值和降级必须显式化

- **Claim：** 当前回测覆盖信号日/成交日分离、T+1、佣金、印花税、滑点、涨跌停不可成交、持仓/暴露/仓位、止损止盈、分钟成交、因子统计、优化与 walk-forward；测试覆盖成本、涨跌停/ST、Sharpe 年化和样本外流程。它也暴露了默认值漂移：底层 matcher 为兼容默认 `close_t`，策略/SSE 路径通常默认 `open_t+1`。
- **Type：** code fact + recommendation
- **Source：** `<Path>temp/finance-references/tickflow-stock-panel/backend/app/backtest/engine.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/app/backtest/strategy.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/app/backtest/factor.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/app/backtest/optimizer.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/app/backtest/walkforward.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/tests/backtest/test_cost_model.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/tests/backtest/test_strategy_backtest_correctness.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/tests/test_price_limits.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/tests/test_st_limit_and_sharpe.py</Path>`。
- **Confidence：** high
- **Limits：** 代码测试证明实现意图，不证明真实市场可成交性或未来收益；本次只审阅测试，未在研究 clone 内安装依赖并执行测试。
- **Artifact impact：** 每次 Hana 回测必须保存并展示完整 run manifest；不能只展示收益曲线与 Sharpe。

最低运行清单：

```text
data_snapshot_id + feature_set_version + strategy_version
universe + start/end + calendar + point_in_time_policy
signal_time + entry_fill + exit_fill + missing_bar_policy
T+1 + lot_size + suspension + ST/price_limit rules
commission + minimum_fee + tax + slippage + position/capacity model
initial_capital + rebalance + random_seed + engine_version
```

建议默认使用更保守的下一可成交时点，但最终默认由 INV-06 决定。分钟数据缺失时不得自动把“精确分钟成交”降为日线并继续以原名称报告；必须阻止运行或创建带醒目标记的新假设版本。收益、年化、最大回撤、Sharpe、Sortino、Calmar、胜率等指标必须连同频率、基准和无风险利率口径展示。

### R-006：监控应复用同一快照与策略，但只保留一个规则引擎

- **Claim：** 新 MonitorRuleEngine 已支持 signal/price/market/strategy、symbols/all/sector scope、多条件 AND/OR、cooldown、基线与状态重置；同时文件仍保留 legacy StrategyMonitorService，说明迁移未完成。
- **Type：** code fact + recommendation
- **Source：** `<Path>temp/finance-references/tickflow-stock-panel/backend/app/strategy/monitor.py</Path>` 明确标注两个 evaluator；`<Path>temp/finance-references/tickflow-stock-panel/backend/tests/test_strategy_monitor_events.py</Path>` 覆盖首次基线不告警、去重、跨日重放与规则语义变化重置。
- **Confidence：** high
- **Limits：** 部分内存状态的进程重启语义仍需从持久化路径逐项验证。
- **Artifact impact：** Hana 只设计一个 snapshot-driven RuleEngine；规则、baseline、last evaluation、last fire、cooldown 和 alert record 都要可恢复、可审计。通知属于外部副作用适配器，不能阻塞行情评估路径。

“从回测提升到监控”必须保留策略版本、数据依赖和参数；后续策略被编辑时，监控规则不能静默指向新语义，应要求迁移或固定旧版本。

### R-007：长任务的可观察性可采用，但需要真正的取消与一致任务身份

- **Claim：** 上游数据管道使用持久化 JSON 任务、single-flight、阶段进度、stale reap 和专用线程池；回测使用 SSE、参数哈希重连、协作式 cancel event，以及 spawn 隔离 worker 和峰值 RSS 采样。数据管道的 cancel 端点却只把 job 标为 failed，不能中断仍在运行的线程；普通回测取消还依赖客户端和服务端重算相同 job key，而优化/walk-forward 已改为由服务端回吐 key。
- **Type：** code fact + recommendation
- **Source：** `<Path>temp/finance-references/tickflow-stock-panel/backend/app/services/pipeline_jobs.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/app/api/pipeline.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/app/api/backtest.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/app/backtest/worker.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/frontend/src/lib/backtestTask.ts</Path>`。
- **Confidence：** high
- **Limits：** Hana TaskRegistry 是否能承载所需恢复、进度、取消和资源隔离由 INV-05 最终核验。
- **Artifact impact：** Hana 任务统一采用服务端分配的 `run_id`，状态至少有 queued/running/succeeded/failed/cancelling/cancelled，进度有阶段与心跳，取消必须传播到实际 worker。任务结果在成功前不可成为“当前数据快照”。

需要保留的工程纪律是：幂等输入、single-flight/有界并发、原子发布、断线重连、错误可见、资源上限和任务历史。需要拒绝的是“UI 显示已取消但后台仍写数据”的假取消。

### R-008：AI 是研究增强层，应消费 Hana 宿主模型而非复制第二套运行时

- **Claim：** TickFlow 的 AI 负责策略代码生成、个股分析与市场复盘，报告持久化并支持流式输出；它自行适配 OpenAI-compatible API 或启动本地 Codex CLI，复制认证文件到临时 CODEX_HOME，并在 Docker 中携带 Codex CLI。Hana 已提供 `sampleText()`、plugin-private Agent/Session、用量账本和 SessionFile 交付。
- **Type：** code fact + recommendation
- **Source：** `<Path>temp/finance-references/tickflow-stock-panel/backend/app/services/ai_provider.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/app/services/ai_reports.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/app/services/stock_analyzer.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/app/services/market_recap.py</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/Dockerfile</Path>`；Hana `<Path>packages/plugin-runtime/README.md</Path>`。
- **Confidence：** high
- **Limits：** 此 Ticket 不决定最终 Agent 拓扑、提示词、预算或自动调度；这些还依赖 TradingAgents 调查与用户共识。
- **Artifact impact：** 插件不保存第二份 AI Key、不挂载用户 Codex home、不启动 Codex 子进程。短结构化任务用 `sampleText()`；需要可继续的研究过程用 plugin-private Session/Agent；结果必须引用数据快照、区分事实/推断/未知，并由用户显式触发或明确授权的任务触发。

AI 可以解释数据、生成策略 DSL 草稿、比较回测和形成复盘，不得把自然语言输出直接变成可执行 Python，也不得输出伪装成确定性结论的荐股/下单指令。

### R-009：Hana 初步贡献面映射成立，但计算运行时仍是待验证边界

- **Claim：** 工作台的产品面可由内置 full-access 插件贡献表达；第三方网络、资源和模型调用必须经过宿主边界。这个映射是 INV-01 的可行性输入，不替代 INV-05 的 supported/constrained/unsupported 核验。
- **Type：** Hana code/doc fact + provisional recommendation
- **Source：** `<Path>PLUGIN_SDK.md</Path>`；`<Path>PLUGINS.md</Path>`；`<Path>packages/plugin-runtime/README.md</Path>`；`<Path>packages/plugin-runtime/src/index.ts</Path>`；既有 `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/placement-decision.md</Path>`。
- **Confidence：** medium pending INV-05
- **Limits：** Python/Polars/DuckDB、TCP、自定义子进程、常驻行情、跨重启任务和高内存回测不能假设为公开插件能力。
- **Artifact impact：** 后续 manifest 和架构只申请已验证且实际使用的能力。

| TickFlow 能力 | Hana 初步落点 | 约束 |
|---|---|---|
| 高密度主工作区 | `page` + plugin SDK/components | 一个主页面内按研究上下文组织视图，不复刻独立 SPA 导航壳 |
| 查询、筛选、策略、回测、监控 API | `routes/` | iframe 用宿主 API facade；route 内做鉴权、校验和 DTO 归一化 |
| Agent 可调用的查行情/筛选/回测/报告 | `tools/` | read/routine/review 按具体副作用声明 session permission |
| 数据同步、回测、复盘、监控批次 | lifecycle + TaskRegistry / `plugin_action` 候选 | 必须验证调度、恢复、进度、取消；不自启第二个 scheduler |
| 外部行情/资讯 HTTP | `ctx.network.fetch()` | HTTPS、allowedHosts、方法、超时、响应大小、缓存与 secret 均显式 |
| API Key 与用户偏好 | plugin configuration | secret 不进 iframe asset、不写报告、不进入日志 |
| 私有缓存、策略、运行记录 | `ctx.dataDir` | 有 schema/version/migration/retention；卸载与清理语义待定 |
| 用户导入的数据/研报 | `ResourceRef` + `ctx.resources` | 不猜本地路径；只申请实际所需 read/search/write |
| 导出的报告/表格 | `stageFile()` / SessionFile | 生成物先写插件私有目录，再由宿主交付 |
| AI 摘要与研究 | `sampleText()` 或 plugin-private Session/Agent | 使用宿主模型、权限、用量与会话审计，不带第二套 provider |
| 实时反馈 | route stream / host event / task status 候选 | 具体 SSE/WS/event 能力与页面生命周期由 INV-05 验证 |

最强反方仍是高性能全市场计算。如果可信实现确实要求 Python/Numba/DuckDB 子进程、TCP 行情或不可按需激活的常驻服务，那么该“计算基础设施”命中特权执行边界或常驻原语硬门；它必须外置为可选适配器或另立 Hana 系统 change，而不是让整个金融产品退出插件盒子。

### R-010：部署、许可证与文档漂移阻止整仓复制

- **Claim：** 上游代码仓库的 `LICENSE` 和 Python package metadata 声明 MIT，但 README 同时写“严禁商业用途”；数据源服务条款、交易所行情权利和 stock-sdk 的 ISC 许可是独立问题。部署还需要 Python 3.11、Polars/DuckDB/PyArrow、可选 vectorbt/Numba、前端 Node 构建、数据卷，并可能带 Tesseract、Node bridge 与 Codex CLI，不能等同于 Hana 插件的“零运维”。
- **Type：** code/doc fact + risk recommendation
- **Source：** `<Path>temp/finance-references/tickflow-stock-panel/LICENSE</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/backend/pyproject.toml</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/README.md</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/Dockerfile</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/docs/deployment.md</Path>`；`<Path>temp/finance-references/tickflow-stock-panel/docs/plugin-development.md</Path>`。
- **Confidence：** high for repository facts; legal interpretation intentionally not asserted
- **Limits：** 本调查不是法律意见；MIT 与 README 限制冲突需在复制实质代码前由项目所有者/法律审查解决。
- **Artifact impact：** 优先重新实现架构思想；若复制实质代码，保留 MIT notice 并先解决上游额外限制；每个数据 provider 单独记录授权、条款、地域、缓存与再分发边界。

已确认的 README/代码漂移：

1. README 称回测以 vectorbt 为“唯一 pandas 边界”，当前 `<Path>temp/finance-references/tickflow-stock-panel/backend/app/backtest/engine.py</Path>` 明确是纯 Polars/NumPy，vectorbt 只在 optional extra 中。
2. README 称 Docker 内置 stock-sdk，当前 Dockerfile 与部署文档默认 `INCLUDE_STOCKSDK=0`，出于抓取、版权与反爬风险不打包。
3. README 同时展示 MIT badge/license 和“严禁商业用途”，两者不能被实现团队自行假设为已消解。
4. provider protocol 已宣称下游数据源无关，但 quote/instrument/minute 路径仍有 TickFlow 直连或 fallback，属于迁移中的架构而非已完成边界。
5. monitor 文件并存旧/新两个 evaluator；回测不同入口也保留不同兼容默认。Hana 不继承这种过渡态。

## Adopt / Adapt / Reject 总表

| 能力/设计 | 结论 | 理由 | 依赖与主要风险 |
|---|---|---|---|
| 数据能力探测、onboarding、数据健康 | adopt | 防止用户在不满足前提时运行研究 | provider 诊断、freshness/quality contract |
| 标准化 provider + capability matrix | adapt | 隔离供应商并支持渐进接入 | 禁止隐式混源；INV-03 验证数据源稳定性与许可 |
| 阶段化同步、原子发布、缓存失效 | adopt | 保证读者只见完整快照 | TaskRegistry/存储能力与断电恢复待 INV-05/10 验证 |
| 全量 Parquet/DuckDB 数据湖 | reject for first slice | 运维、迁移、内存与 Python 依赖过重 | 数据规模证明需要后再引入可替换后端 |
| 市场/自选/标的详情 | adapt | 是研究入口但不应吞噬工作台 | 数据源覆盖、移动端密度、数据陈旧表达 |
| 统一策略 registry、参数与依赖 | adopt | 让筛选/回测/监控保持同一语义 | 必须版本化并阻止静默编辑漂移 |
| 白名单声明式信号/组合 | adopt | 可审查、可迁移、适合 Agent 生成草稿 | DSL 版本、字段单位、窗口和缺失值语义 |
| AI/用户 Python 策略 | reject | AST 不是执行隔离，插件不应运行任意代码 | 未来可信 runner 需独立安全与资源设计 |
| T+1/费用/滑点/涨跌停/成交日分离 | adopt | 回测可信度的最低门槛 | 由 INV-06 固化市场规则、默认和测试 oracle |
| 因子、优化、Monte Carlo、walk-forward | defer/adapt | 有价值但会放大算力与多重检验风险 | 先完成基础回测、样本外与预算协议 |
| 单一监控规则引擎、baseline/cooldown | adopt | 把验证后的假设转成持续观察 | 状态恢复、通知回执、市场时钟 |
| SSE/轮询重连、run history | adapt | 长任务必须离开页面生命周期 | 宿主流式能力、run_id、真正取消与幂等 |
| OpenAI-compatible/Codex CLI 自建层 | reject | 与 Hana 模型、权限、用量和会话重复 | 只用宿主 `sampleText()`/private Session |
| 独立 FastAPI、登录、设置壳、APScheduler | reject | Hana 已提供宿主身份、路由、配置与任务边界 | 不得在插件里创建平行平台 |
| 抓站型 stock-sdk 内置 | reject | 服务条款、版权、反爬与易失性不可承诺 | 只接受用户明确配置、合法来源的 provider |
| 14 个一级页面整体复刻 | reject | 增加导航与维护成本，不能证明闭环价值 | 后续原型以高频旅程决定信息架构 |

## 候选垂直切片（供后续排序，不是最终承诺）

最小但足以证明长期架构的候选链路是：

1. 配置一个合法数据 provider，显示 capability、来源、条款、新鲜度和失败诊断。
2. 同步一个受控 universe 的日线与维表，生成不可变标准化快照和少量版本化特征。
3. 用声明式条件创建策略并筛选候选，结果能回到原始数据与特征依据。
4. 对同一策略运行带完整假设清单的基础回测，展示净值、回撤、交易与未成交原因。
5. 把已验证策略提升为一个可恢复监控规则，触发记录引用相同策略版本和数据口径。
6. 用户显式调用 Hana 模型生成“研究摘要”，保存事实、推断、未知项和快照引用，并可导出。

这条链路刻意不包含全市场分钟数据、自由 Python、参数海量搜索、自动多 Agent 辩论、实盘下单或抓站数据源。它们只有在共同数据/任务/审计地基被证明后才有资格进入后续阶段。

## Conflicts and Unknowns

- Hana 对长时、CPU/内存密集、可取消计算的公开插件支持程度未知，由 INV-05 核验；不得据此文件假设 sidecar 或 Python 可用。
- A 股 provider 的合法可用性、字段覆盖、价格、限流、跨地域网络与再分发条款未知，由 INV-03 核验。
- 点时财务、复权、停牌/ST/涨跌停、交易日历、最小手数、费用版本、幸存者偏差和未来函数的最终规范未知，由 INV-06 固化。
- 首要市场、首版 universe、自动化程度、AI 预算和通知方式是用户偏好，留给 INV-08，不由本 AFK Ticket 代答。
- 上游测试未在 clone 内执行；本次证据是固定提交源码与测试审阅。后续不应把“存在测试文件”表述成 Hana 已通过同等金融验证。

## Recommendation

后续跨项目综合以三个不变原则约束范围：

1. **单一语义链：** provider、特征、策略、回测、监控和报告通过版本与 snapshot 相连。
2. **显式失败优于聪明降级：** 缺能力、缺数据、混源、陈旧和假设变化必须可见并写入运行记录。
3. **宿主优先：** 身份、网络、配置、资源、模型、会话、任务和文件交付优先消费 Hana 契约；只有公开契约无法表达且产品价值已被验证时，才讨论外置适配器或系统前置 change。
