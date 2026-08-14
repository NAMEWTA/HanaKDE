---
artifact: wayfinder-solution-comment
ticket: INV-08
sequence: 1
resolution: answered
---

# Solution: 个人金融工作台产品边界共识

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/INV-08-product-boundary-grilling.md</Path>`
- **共识状态：** 用户已在三轮 HITL 设计访谈中确认完整设计树；权威状态见 `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/design-tree.json</Path>`（`status: consensus`）。
- **核心产品承诺：** 首版交付一个相对完整、可直接上线的 A 股 + 港股个人量化金融工作台内置插件。所有规划模块首版都提供可操作入口、完整状态、质量提示和替代路径；“全部上线”不等于每个 provider/数据集都被伪装成 `supported`。
- **实现边界：** 产品是研究、量化实验、个人资料和决策审计工作台，不是券商交易终端。券商 credential、自动同步、订单、仓位执行、资金托管和无人值守交易永久不在本 change 范围。
- **来源与方法：** 参考项目固定 commit 和 Hana 契约见 Wayfinder map；本答案只提炼行为、数据治理和交互纪律，不整仓复制四个项目的独立平台、Python/TCP/CLI/Agent 运行时。

## 1. 用户与市场范围

### 首要市场

首版聚焦：

- 中国 A 股：股票、指数、ETF 等资产类型按 `AssetRef` 分开，不用裸六位代码推断身份。
- 港股：港交所标的、市场时段、币种、交易日历和 provider 能力单独建模，不把 A 股规则套用到港股。

所有 UI、工具和 Agent 入口以 `market x dataset x workflow` 能力矩阵表达覆盖。A 股和港股都可以有行情、K 线、筛选、回测、监控和研究入口，但每个数据集的 `supported/partial/experimental/unavailable/blocked` 状态独立返回。港股不能因为有单点报价就被描述为具备 A 股同等财务、公告、复权或 PIT 能力。

### 目标用户

首要用户是拥有自选、持仓、研究资料和量化假设的个人研究者。工作台支持从“今天发生了什么”进入对象、底稿、筛选、回测、监控和复盘；不替用户做投资决定，不承诺收益，不把模型评级转成交易动作。

## 2. 首版模块承诺

以下模块全部进入首版产品面和验收范围：

| 模块 | 首版用户流程 | 数据/安全状态要求 |
|---|---|---|
| A/HK 行情与 K 线 | 选择 AssetRef -> 查看报价/日线/可用分钟粒度 -> 显示刷新时间 | 币种、时区、asOf、复权、单位、staleAt、provider 必须可见；粒度不支持时不得静默降级 |
| 资产与自选 | 代码/名称输入 -> identity 校验 -> 加入 watchlist/universe -> 批量比较 | 迁移代码、指数/股票同码和错误市场必须 `identity_mismatch`；自选归插件私有数据 |
| 财务与估值 | 选择数据集 -> 查看报告期/发布日/修订和单位 -> 引用到 dossier | 无 PIT 的 current-only 数据标为 `current_context`，不能进入历史回测事实 |
| 公告/研报/新闻 | 搜索元数据/官方链接 -> 打开 ResourceRef -> 选择片段进入底稿 | 发布时间、来源、版权/许可、页码或段落可追溯；全文不默认复制/再分发 |
| 筛选与因子 | 选择 universe/snapshot -> 使用声明式条件/特征 -> 查看候选理由 | 策略/特征有版本、字段/单位/窗口和 evidence；不运行任意 Python |
| 回测 | 选择策略、区间、规则、成本和容量模型 -> 运行 -> 查看交易/未成交/指标 | 缺 PIT、日历、复权、T+1、手数、费用、滑点或容量时 `blocked/partial`，不显示伪净收益 |
| 监控/告警 | 从策略/条件创建规则 -> 设刷新/冷却 -> 暂停/恢复 -> 查看触发记录 | 创建长期规则和通知需用户确认；stale/unavailable 自动暂停评估；记录不等于送达保证 |
| 组合/持仓 | 手工或文件导入 -> 成本/股数/币种 -> P&L/暴露/历史变化 | 本地账本不接券商；P&L 需报价 freshness、费用/汇率口径；个人字段默认不外发 |
| Agent 研究 | 选择公开 dossier -> 预算预览 -> 只读分析/草稿 -> 用户确认后持久化或外发 | Agent allowlist、evidence refs、事实/推断分离；交易、仓位和资金动作永禁 |
| 导入/导出 | 选择 ResourceRef -> 校验/形成 snapshot；导出 JSON/Markdown/SessionFile | 原始文件归用户 ResourceIO；导出带 run manifest、hash、来源、质量、版本和非投资建议 |

**上线的定义：** 每个模块都有正常、空集、陈旧、部分、不可用、阻断、取消和恢复状态；若 provider 尚未满足合同，模块仍显示入口、诊断、配置/导入替代路径和明确原因。上线不允许使用“默认空数据”“HTTP 200”“任务完成”替代金融正确性。

## 3. 数据源出厂策略

### 三层 provider 策略

1. **内置稳定源：** 只有拥有条款/访问基础、字段/单位/schema、时点、限流和质量 fixture 的 HTTPS provider 才能默认启用。
2. **用户 provider：** 用户可以在 Hana sensitive config 中配置合法 provider/API key；插件逐 provider 运行 capability probe，凭证不进入页面、日志、快照或模型 prompt。
3. **实验/导入源：** 四个参考项目的公开端点、代码适配和用户 CSV/JSON/Parquet 作为 inventory、experimental 或本地导入路径；许可未知、语义不等价或质量不稳定时显示 `experimental/unavailable/blocked`，不静默 fallback。

### 参考项目逻辑的复用边界

| 可复用行为 | 首版处理 |
|---|---|
| a-stock-data 的 provider inventory、Session 复用、串行限流、真实取数验活、stale 检测、字段单位警告和官方链接候选 | 改写为插件 provider adapter + `DataSnapshot` + `ProviderAudit`；每个数据集单独 contract |
| Vibe-Research 的 Tencent/Eastmoney A 股路径、global-stock-data 港股/全球聚合、交易时段 live refresh、隐藏 tab/非交易时段暂停 | 只复用交互/适配思想；A/HK endpoint、条款、币种、时区、PIT 和 freshness 必须重新验证 |
| TickFlow 的 provider capability、阶段化同步、原子发布、cache invalidation、monitor baseline/cooldown、SSE/任务进度 | 迁移到 Hana route/TaskRegistry/dataDir；不复制独立 FastAPI、常驻 APScheduler、DuckDB 数据湖或假取消 |
| TradingAgents 的 `curr_date` look-ahead guard、有限阶段、结构化输出、checkpoint、OutcomeReview | 接入 `DataRequest.asOf`、`ResearchRun`、Session/Agent 和 TaskRegistry；不复制独立 LangGraph/CLI 或评级到交易层 |

### provider 发布门

每个 A/HK dataset 必须保存：`providerId/version`、terms/许可状态、allowed hosts、请求/响应 hash、schema/unit map、asOf/publishedAt、calendar/timezone、adjustment/currency、rate budget、fallback trace 和质量结果。以下任一缺失只能是 `experimental` 或 `blocked`：

- 资产身份不能与 exchange/assetType/name 回显一致；
- provider 没有明确历史 PIT 或只提供 current snapshot；
- 复权、公司行动、币种、金额/成交量单位未知；
- 分页、空集、陈旧、停牌和 provider error 无法区分；
- 许可/缓存/再分发条款未知；
- fallback 改变频率、复权、字段或市场语义；
- 无 fixture、contract test、限流和真实取数验活证据。

## 4. 个人资料与持仓

### 首版数据形态

- 手工持仓账本：`AssetRef`、买卖日期、股数、成本、费用、币种、备注和来源。
- CSV/JSON/Parquet 或 Hana ResourceRef 导入：先校验 schema/身份/单位，再生成私有 `PortfolioSnapshot`。
- 研究笔记、公告片段和私有研报：原始文件保持 ResourceRef；插件只保存索引、引用和派生摘要。
- P&L、暴露和组合指标：必须显示 quote asOf、汇率、费用/税、估值口径和 stale 状态。
- 删除、导出、冲突和版本历史：通过 ResourceIO/插件 data 记录，不能只存在 localStorage。

### 明确排除

- 不读取或保存券商 API key、cookie、资金账户、交易权限或 broker credential。
- 不自动同步券商成交、余额、可用资金或真实订单。
- 不把研究 P&L、回测收益或模型 stance 映射为订单、仓位或买卖动作。

### 个人资料外发门

Agent/模型读取私有资料前，界面必须预览：文件/持仓对象、字段、片段、目标模型/provider、预算、保留/删除说明。默认允许公开 evidence 的只读分析；股数、成本、盈亏、笔记正文和研报原文默认拒绝，用户逐次确认后才可外发。授权只对当前 run 和明确字段生效，不形成永久全局同意。

## 5. 实时性与自动化

### 首版支持

- A 股、港股按各自 market calendar/timezone 判断交易时段。
- live quote 刷新是用户可见的、用户可配置频率的短轮询/受控刷新；页面显示 `asOf`、`fetchedAt`、`staleAt`、provider 和暂停原因。
- watchlist、portfolio 和监控页面可在交易时段自动更新；参考 Vibe-Research 的非交易时段/隐藏页面暂停和 TickFlow 的 query cache/cooldown 纪律。
- 用户可创建可暂停/可恢复的策略/价格/市场条件规则和定时研究任务；任务显示 queued/running/progress/paused/recovering/cancelling/cancelled/failed/succeeded/partial。
- 监控触发记录可在工作台内查看；通知/外部副作用需用户确认并显示是否仅记录、尝试发送或已获送达回执。

### 不承诺

- tick 级、盘口逐笔、raw TCP、长连接 WebSocket、行情 backpressure 或交易所级实时 SLA。
- 应用退出、机器休眠或宿主重启后任务仍持续执行；恢复只能从 checkpoint 继续，provider 调用是否可取消必须诚实显示。
- 券商/短信/推送送达；没有回执的通知只能标 `attempted/unknown`。
- 监控触发后自动创建订单、修改持仓或采取资金动作。

## 6. Agent 分层授权

| 动作 | 默认 | 确认 |
|---|---|---|
| 读取已授权公开数据、比较 A/HK 对象、生成一次性分析 | 自动 | 需受 dataset/tool allowlist、数据/模型预算约束 |
| 生成筛选/回测/监控草稿 | 自动生成草稿 | 运行长期任务前确认 |
| 创建/启用长期监控、定时研究、通知规则 | 不自动持久化 | 用户确认 scope、频率、预算和副作用 |
| 读取持仓、成本、笔记、私有研报 | 不自动 | 用户确认对象、字段和目的 |
| 向模型发送个人资料或私有片段 | 不自动 | 用户确认字段、provider/model、成本和外发 |
| 写入用户 Resource、修改研究记录、发布报告 | 不自动 | 用户确认目标资源和变更内容 |
| 交易、仓位、券商、资金或下单 | 永远禁止 | 不提供确认入口 |

Agent 的所有工具调用回到 C0-C6 能力链：`AssetRef`、`DataRequest`、`QualityGate`、`EvidenceRef`、`RunEvent`、budget/cancel。工具完成不等于数据正确，模型完成不等于事实成立。

## 7. 上线验收与成功标准

### 必须可证明

1. 安装/激活后能打开金融工作台首页，查看 A/HK 能力矩阵、provider health、许可状态和数据缺口。
2. 每个首版模块均有可执行 happy path 和可见的 `empty/stale/partial/unavailable/blocked/cancelled/recovering` 状态；不能以空白图替代状态。
3. A/HK 至少各有一条 provider 或用户导入路径可形成带 hash/asOf/unit/currency/quality 的 snapshot；未通过 provider 显示替代路径。
4. 持仓/资料可以导入、编辑、删除、导出、引用，且 ResourceIO/插件 data 所有权清楚；密钥和个人字段不泄露到 iframe/log/model。
5. live refresh、监控和定时任务能够显示刷新时间、暂停/恢复/取消语义、预算、错误和 fallback；不宣称后台永久运行或通知送达。
6. 筛选、回测和 Agent 研究共享同一 snapshot/strategy/run/evidence；回测缺金融规则时阻断净结论，Agent 缺证据时输出 `insufficient_evidence`。
7. 全部用户可见金融结论带来源、asOf、质量、规则/成本版本、非投资建议和未知项；任何模块都不产生交易 side effect。

### 成功标准

“相对完整可上线”是：用户能在一个 Hana 内置插件内完成发现、取数/导入、资产与持仓管理、研究、筛选、回测、监控、Agent 辅助和导出，并在每一步知道数据能否信、为什么失败、会不会外发和任务是否仍在运行。它不是“所有 provider 都可用”“所有市场数据同质”“所有任务后台持续”或“模型给出投资答案”。

## 8. 下游执行约束

- Spec 必须把所有模块纳入首版外部行为和验收，不再使用 INV-07 原 V0-V5 作为模块延后计划；V0-V5 只能保留为能力依赖/质量成熟顺序。
- Spec 必须定义 A/HK `MarketCalendar`、`AssetRef`、provider/capability manifest、`PortfolioSnapshot`、`StrategyDefinition`、`ResearchRun`、`MonitorRule`、`EvidenceRef` 和授权/外发状态。
- 首版实现必须先验证 Hana 是否能承载“完整入口 + 插件私有数据 + TaskRegistry 任务 + live refresh”组合；若需要共享规则 Registry、Python/Polars/DuckDB、raw TCP/WebSocket、常驻 worker、系统数据库迁移或 broker execution，另立 system change。
- UI prototype 必须验证高密度金融首页、A/HK 能力矩阵、持仓/研究上下文、任务状态、质量状态和授权确认，不把“全部上线”渲染成数据无条件可用。
- 代码复用只在许可证和数据条款允许范围内进行；优先复写行为和测试，不复制独立 FastAPI/CLI/LangGraph/动态 Python 平台。

## 9. 不可逆非目标

本 change 永久不包含：券商账户/credential、自动同步真实资产、下单、资金托管、无人值守交易、收益保证、个性化投资建议、自动把 stance 转成仓位、绕过 provider 条款或用私有网页接口伪装稳定金融数据。
