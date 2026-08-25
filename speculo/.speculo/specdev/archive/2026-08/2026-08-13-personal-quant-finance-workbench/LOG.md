# 设计访谈日志

本文件记录当前 change 的设计树决策轨迹。第 1 轮的用户回答已写入设计树；第 2 轮问题等待用户回答。

## LOG-001 — 2026-08-13 — 首要市场与研究池
- **设计树节点：** D-001
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** V0 首先服务哪个市场和对象规模？
- **事实与来源：** `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-02/01-solution.md</Path>` 记录 Vibe-Research 的 A/HK/US 能力不对称；用户最新确认首要市场聚焦 A 股和港股。
- **选项：** A 股；A 股 + 港股；A/HK/US 同构。
- **推荐：** A 股 + 港股，按 market x dataset x workflow 展示能力差异。
- **结论：** 用户确认首要市场为 A 股和港股；不承诺两者数据集同构。
- **原因：** 这是用户明确的产品聚焦，覆盖参考项目的主要价值而避免无证据的全球市场承诺。
- **影响工件：** CONTEXT / ADR / Spec / Ticket
- **约束或不变量：** 每个 AssetRef 必须包含 market/exchange/assetType/currency/timezone；能力按市场和数据集单独标记。
- **后续：** D-007、D-008、D-009、D-011 继续细化。
- **替代/被替代：** 无

## LOG-002 — 2026-08-13 — 首版完整度
- **设计树节点：** D-005
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** 首版是否只做证据级最小切片，还是相对完整可上线？
- **事实与来源：** `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-07/01-solution.md</Path>` 原推荐 V0 最小切片；用户最新明确否定该范围，要求首板相对完整、可直接上线并认真复用参考项目能力。
- **选项：** 证据级最小切片；相对完整的研究/量化工作台；交易终端。
- **推荐：** 相对完整的内置插件，但每个模块必须有能力等级、质量门和明确 unavailable/experimental 状态；交易终端仍不在范围。
- **结论：** 用户确认首版走相对完整可上线路线；回测、持仓、实时性、自动化和参考项目中的可复用能力进入首版规划。
- **原因：** 这是用户对交付完整度的直接要求；具体 provider、SLA、Agent 和隐私动作仍需后续决策，不应被“完整”掩盖。
- **影响工件：** CONTEXT / ADR / Spec / Ticket
- **约束或不变量：** 完整入口不等于所有数据集 supported；不能以 experimental/partial 数据生成确定性金融结论。
- **后续：** D-007 至 D-011 锁定可上线合同。
- **替代/被替代：** 无

## LOG-003 — 2026-08-13 — 参考项目数据获取逻辑进入首版研究范围
- **设计树节点：** D-002
- **轮次与依赖：** round 1 / D-001
- **状态：** confirmed
- **问题：** 首板是否需要复用参考项目的数据源获取逻辑？
- **事实与来源：** 四个固定 commit 展示了 A 股多源、港股/全球行情、限流、缓存、失败和备用源逻辑；`<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-03/01-solution.md</Path>` 明确这些实现不能自动升级为稳定授权合同。
- **选项：** 只做用户导入；复用参考项目逻辑并建立 provider contract；直接整套复制。
- **推荐：** 复用行为和适配思路，逐 provider 通过质量/许可门，不整仓复制。
- **结论：** 用户确认首板应认真研究并尽可能复用参考项目的数据源获取逻辑；具体出厂源由 D-007 决定。
- **原因：** 这是用户明确的学习和复用要求，同时保留金融正确性与数据条款边界。
- **影响工件：** D-007 / Spec / capability manifest
- **约束或不变量：** provider 失败、陈旧、许可未知和语义不等价不得静默成功。
- **后续：** D-007
- **替代/被替代：** 无

## LOG-004 — 2026-08-13 — 个人资料与持仓进入首版范围
- **设计树节点：** D-004
- **轮次与依赖：** round 1 / D-001
- **状态：** confirmed
- **问题：** 首版是否纳入个人资料与持仓？
- **事实与来源：** Vibe-Research 提供本地 watchlist、portfolio、notes、reports；其模型外发路径与 Hana ResourceIO/secret 边界仍需重建。用户明确要求纳入个人资料和持仓相关能力。
- **选项：** 延后；纳入本地账本/资料；接入券商和自动同步。
- **推荐：** 纳入本地账本/资料，先排除券商 credential、自动同步和下单。
- **结论：** 用户确认首板纳入个人资料与持仓；产品形态由 D-008 锁定。
- **原因：** 这是个人工作台的核心价值，但安全和交易边界不能由“持仓”一词隐式扩大。
- **影响工件：** D-008 / Spec / privacy contract
- **约束或不变量：** 持仓是研究上下文，不是 broker account 或 execution authority。
- **后续：** D-008
- **替代/被替代：** 无

## LOG-005 — 2026-08-13 — 实时与自动化进入首版范围
- **设计树节点：** D-006
- **轮次与依赖：** round 1 / D-001, D-005
- **状态：** confirmed
- **问题：** 首版是否纳入实时性与自动化？
- **事实与来源：** TickFlow 有 monitor rule、refresh、任务和告警路径；Vibe-Research 有交易时段内 3 秒 live quote、hidden-tab 自动暂停；两者都需要 Hana TaskRegistry/网络/许可重新表达。用户明确要求首板纳入实时性与自动化。
- **选项：** 仅手动刷新；市场时段 live refresh + 可恢复监控任务；tick/后台常驻/交易通知 SLA。
- **推荐：** 纳入可见 live refresh、可暂停可恢复任务和条件告警，但不承诺 tick 级、券商级送达或应用退出后永久运行。
- **结论：** 用户确认实时性与自动化进入首版；具体等级由 D-009 锁定。
- **原因：** 它们是完整工作台的日常价值，但必须诚实声明刷新、后台、取消和送达语义。
- **影响工件：** D-009 / Spec / runtime architecture
- **约束或不变量：** stale、paused、recovering、unavailable 必须是一等状态；不得把 UI abort 当强取消。
- **后续：** D-009
- **替代/被替代：** 无

## LOG-006 — 2026-08-13 — AI 默认与个人资料外发
- **设计树节点：** D-003
- **轮次与依赖：** round 2 / 无
- **状态：** confirmed
- **问题：** 模型摘要和 Agent 研究是否默认启用，个人资料是否默认外发？
- **事实与来源：** Vibe-Research 的本地配置并不意味着模型调用不外发；`<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-06/01-solution.md</Path>` 要求字段级 egress、预算和证据审计。
- **选项：** 默认关闭并逐次授权；公开数据默认外发；全部个人资料默认外发。
- **推荐：** 默认关闭；确定性路径独立；用户选择公开证据并确认预算后才调用模型；持仓/私有资料逐次预览授权。
- **结论：** 用户确认按默认执行。
- **原因：** 保留 Agent 价值，同时避免“本地存储”等于“不会外发”的误解。
- **影响工件：** D-010 / Spec / privacy contract
- **约束或不变量：** 无用户确认不得向模型发送股数、成本、私有笔记、研报原文或密钥。
- **后续：** D-010 细化 Agent 自主权和副作用确认。
- **替代/被替代：** 无

## LOG-007 — 2026-08-13 — A/HK 出厂数据源策略
- **设计树节点：** D-007
- **轮次与依赖：** round 2 / D-001
- **状态：** confirmed
- **问题：** 首板是否要求安装后即可取得 A/HK 数据，如何处理未验证端点？
- **事实与来源：** Vibe-Research 使用 Tencent/Eastmoney 及 global-stock-data；a-stock-data 展示多源、限流、字段与僵尸报价反例；参考仓库许可证不等于第三方数据再分发许可。
- **选项：** 用户自配；内置多源分级；绑定一个商业正式源。
- **推荐：** 内置多源适配器和能力探测，按 dataset 标记 supported/experimental/blocked；允许合法 provider 和文件导入。
- **结论：** 用户确认按默认执行。
- **原因：** 兼顾安装即用和金融数据/许可不确定性，避免把参考端点硬编码为稳定合同。
- **影响工件：** Spec / capability manifest / provider contract
- **约束或不变量：** provider failure、stale、license unknown、semantic mismatch 显式呈现。
- **后续：** D-011 确认模块入口与上线等级。
- **替代/被替代：** 无

## LOG-008 — 2026-08-13 — 本地持仓与个人资料形态
- **设计树节点：** D-008
- **轮次与依赖：** round 2 / D-001
- **状态：** confirmed
- **问题：** 首版个人资料/持仓是否包含账本、导入、私有资料和券商同步？
- **事实与来源：** Vibe-Research 有本地 portfolio/watchlist/notes/reports；Hana 有 ResourceIO、ctx.dataDir、sensitive config 和 SessionFile；INV-05/06 明确 broker/execution out of scope。
- **选项：** 本地账本与文件导入；券商只读同步；券商交易接入。
- **推荐：** 本地手工/文件导入账本、成本/股数/P&L、研究笔记和私有研报引用；排除 broker credential、自动同步和交易执行。
- **结论：** 用户确认按默认执行。
- **原因：** 满足个人工作台价值，且不把研究上下文扩大为金融执行权限。
- **影响工件：** Spec / privacy contract / ResourceIO design
- **约束或不变量：** 原始文件归用户 ResourceIO；插件保存索引/派生数据；个人字段默认不进入模型。
- **后续：** D-011 确认这些模块的上线等级和失败状态。
- **替代/被替代：** 无

## LOG-009 — 2026-08-13 — Live refresh 与自动化等级
- **设计树节点：** D-009
- **轮次与依赖：** round 2 / D-001, D-005
- **状态：** confirmed
- **问题：** 首板实时与自动化需要达到什么程度？
- **事实与来源：** Vibe-Research live quote 默认关闭、交易时段 3 秒刷新、隐藏 tab/非交易时间暂停；TickFlow 有 monitor rules、cooldown、Task/SSE 路径；Hana TaskRegistry 取消是协作式，无法承诺后台永久运行。
- **选项：** 手动；市场时段 live refresh + 可恢复任务；tick/后台常驻/券商级告警。
- **推荐：** 市场时段 live refresh、用户可配置频率、stale 标识、可暂停/恢复监控和定时研究任务；不承诺 tick、永久后台或券商送达。
- **结论：** 用户确认按默认执行。
- **原因：** 复用参考项目高价值交互，同时诚实表达宿主 lifecycle、网络和任务边界。
- **影响工件：** Spec / runtime architecture / UI prototype
- **约束或不变量：** paused/recovering/stale/unavailable 一等可见；退出/休眠不宣称任务仍运行。
- **后续：** D-011 确认模块的上线等级；INV-09 验证高密度 UI。
- **替代/被替代：** 无

## LOG-010 — 2026-08-13 — Agent 分层授权
- **设计树节点：** D-010
- **轮次与依赖：** round 3 / D-003, D-005
- **状态：** confirmed
- **问题：** Agent 可以自主读取、创建任务和写入哪些对象？
- **事实与来源：** `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-05/01-solution.md</Path>` 定义了 plugin tools/Session/Agent/TaskRegistry/ResourceIO 的宿主边界；INV-06 要求个人资料外发、长期任务、预算和取消可审计。
- **选项：** 分层授权；统一预授权所有研究动作；每一步都确认。
- **推荐：** 公开数据只读与一次性分析自动化；长期任务、私有资料、模型外发、通知和用户文件写入确认；交易动作永禁。
- **结论：** 用户选择方案 1，确认分层授权。
- **原因：** 在日常研究效率和个人数据/长期副作用之间建立可观察的授权边界。
- **影响工件：** D-011 / Spec / capability manifest / privacy contract
- **约束或不变量：** Agent allowlist、预算、runId 和 evidence trace 不可绕过；“自动分析”不等于“自动执行”。
- **后续：** D-011 确认首版模块上线等级。
- **替代/被替代：** 无

## LOG-011 — 2026-08-13 — 首版全模块上线承诺
- **设计树节点：** D-011
- **轮次与依赖：** round 3 / D-001, D-005, D-007, D-008, D-009, D-010
- **状态：** confirmed
- **问题：** 首版是否必须同时上线所有规划模块，以及如何处理模块间数据质量差异？
- **事实与来源：** `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-07/01-solution.md</Path>` 原有 V0-V5 分阶段建议；用户最新明确要求第一个版本全部上线。
- **选项：** 仅先上线证据/行情基础；模块入口完整但部分能力延后；所有规划模块首版上线并显式标记能力状态。
- **推荐：** 所有模块提供用户可见入口和完整操作状态；每个 market x dataset x workflow 按证据标记 `supported/partial/experimental/unavailable`，并提供导入、provider 配置或诊断替代路径。
- **结论：** 用户确认首版全部上线：A/HK 行情/K 线、资产/自选、财务/公告/研报/新闻、筛选/因子、回测、监控/告警、组合/持仓、Agent 研究、导入导出均属于首版范围。
- **原因：** 满足“相对完整、可直接上线”的个人工作台目标，同时保持金融数据状态诚实，避免完整入口被误读为全部数据已获授权或已达到同等质量。
- **影响工件：** CONTEXT / ADR / Spec / Ticket / UI prototype
- **约束或不变量：** 不隐藏模块；不把 `partial/experimental/unavailable` 结果作为可信金融结论；交易、券商、资金动作仍永久不在范围。
- **后续：** 设计树进入共识确认；下游 Spec 必须按全模块首版重排交付和验收，不再使用“V0 延后模块”的旧路线。
- **替代/被替代：** 替代此前 INV-07 中 V0-V5 的“能力分阶段出现”建议；保留其能力依赖和质量门。

## LOG-012 — 2026-08-23 — 同花顺官方 Financial-API 接入事实基线
- **设计树节点：** 不适用
- **轮次与依赖：** round 4 / 无
- **状态：** confirmed
- **问题：** HiThink-Tech/Financial-API 是否能增强当前金融工作台的数据来源、数据源切换和本地历史数据路径？
- **事实与来源：** 研究固定在上游 commit `9dbef74d2ce535857e610eec265bcb9302942d48`（tag `v0.1.5`，2026-08-17）以及 2026-08-23 在线契约 `<Url>https://fuyao.aicubes.cn/llms-full.txt</Url>`。该项目由同花顺官方维护，以同一 API Key 提供 REST、托管 MCP、Node CLI、Python toolkit 和 Market Dumps/本地 DuckDB；公开 REST 使用 `X-api-key`、HTTP 200 + `{code,message,request_id,data}` 业务信封，明确区分认证、权限、参数、未就绪、限流与上游失败。
- **事实与来源：** 当前公开范围可补强 A 股标的、快照、日 K、复权事件、财务报表/指标、最新估值、近一年交易日历、指数/板块、集合竞价、特色数据、基金及全市场 Parquet；不提供港股、分钟 K、tick、宏观、新闻/公告/研报原文。显式 `thscodes` 行情快照的顶层 `timestamp` 可为 `null`，指数成分只提供当前值，交易日历只覆盖近一年，财务接口没有历史修订/vintage 契约，因此这些数据不能自动通过 live observed-at 或 PIT 回测门。
- **事实与来源：** 官方 CLI 已实现 `auto | local | remote` 路由：远程用于快照/财务/指数/特色/日历，本地用于 panel/factors/db，历史数据在本地覆盖窗口时优先本地；单标的可回退远程，批量历史在本地不足时 fail closed。该策略可作为 Hana 数据源路由的行为参考，但它只解决同花顺远端与本地库的选择，不等于 Hana 的跨 provider 切换合同。
- **事实与来源：** 上游公开文档未给出固定价格、QPS、再分发或商用数据条款，权限与频率以账号 capability 为准；线上可用性必须用用户授权 Key 做最小探测。根仓库与 Node CLI 标 MIT，但 Python `marketdb` 的 `pyproject.toml` 标记 `Proprietary`，在上游澄清前不得复制或打包 Python 实现。
- **事实与来源：** Hana 插件现有 `ctx.network.fetch()`、`network.allowedHosts`、敏感 configuration、owner-only plugin config、`ctx.dataDir`、routes/tools 和 TaskRegistry 足以容纳 REST adapter 与插件私有数据。若要求通用 OS Keyring/Secret API 或跨插件共享量化数据库，则属于宿主契约原语，应另开 system change。
- **选项：** 不接入；把 REST 作为普通可选 provider；把 REST 作为 A 股出厂优先 provider，并把 Market Dumps 作为受原型门约束的可选本地源；整包嵌入 CLI/Python/MCP。
- **推荐：** 直接 REST adapter 作为 A 股出厂优先 provider，但采用 BYOK、逐 dataset capability probe 和严格质量门；MCP 只作为可选 Agent 入口；不嵌入 Python/CLI。把 `auto | pinned`、远端/本地/导入来源和 run-level source manifest 加入现有 Provider contract，Market Dumps + 插件私有 DuckDB 另经跨平台原型后再标 supported。
- **结论：** 可发现事实已关闭；D-012 至 D-015 记录仍需用户决定的产品/架构取舍。
- **原因：** 官方来源显著降低 A 股网页抓取与许可不透明风险，也提供稳定错误/批量历史路径；但覆盖范围、PIT、live timestamp、账号授权和数据条款不足以让它成为 A/HK 全域单一真相源。
- **影响工件：** design tree / 后续 ADR / Spec / T-02 / T-04 / T-05 / T-08 / T-11
- **约束或不变量：** 不把仓库 MIT 等同于数据再分发权；不把 HTTP 200、API Key 有效或 `timestamp=null` 当作金融新鲜度证据；不在同一 ResearchRun/BacktestRun 中静默更换 provider 或混合未知 lineage。
- **后续：** 用户回答 round 4 frontier 后，继续 D-014/D-015；共识后回到 Spec 修订，不直接实施。
- **替代/被替代：** 补充 LOG-007；不推翻其多 provider 与能力分级原则。

## LOG-013 — 2026-08-23 — 同花顺官方 Provider 的产品角色
- **设计树节点：** D-012
- **轮次与依赖：** round 4 / 无
- **状态：** confirmed
- **问题：** Financial-API 是普通可选 provider，还是 A 股适用数据集的出厂优先 provider？
- **事实与来源：** LOG-012 证明其为同花顺官方结构化服务，并确认只覆盖 A 股适用数据集，不能替代港股和缺失内容源。
- **选项：** 不接入；普通可选；配置用户 Key 且探测通过后作为 A 股出厂优先 provider。
- **推荐：** 内置 `hithink-rest` adapter，逐 dataset 探测后优先路由，未配置或未通过门禁时保持 unavailable/partial/blocked。
- **结论：** 用户确认按推荐执行。
- **原因：** 官方结构化契约显著优于未经授权的网页端点，同时不掩盖市场和数据集缺口。
- **影响工件：** CONTEXT / ADR / Spec / T-02 / T-04 / T-05
- **约束或不变量：** 不做全局同花顺绑定；港股、分钟 K 和原文数据继续走其他 provider 或导入。
- **后续：** Spec 修订 capability matrix 和 provider inventory。
- **替代/被替代：** 补充 LOG-007 的出厂多源策略。

## LOG-014 — 2026-08-23 — 逐数据集数据源策略与运行冻结
- **设计树节点：** D-013
- **轮次与依赖：** round 4 / 无
- **状态：** confirmed
- **问题：** 数据源采用全局开关，还是逐 dataset 的 `auto | pinned` 并冻结研究/回测来源？
- **事实与来源：** LOG-012 记录官方 CLI 的 `auto | local | remote` 只处理同花顺本地/远端；本 change 还需跨 provider、导入和运行可复现性合同。
- **选项：** 全局开关；逐 dataset 手工选择；逐 dataset `auto | pinned` + run-level source manifest。
- **推荐：** 交互查询允许有记录的语义等价 auto fallback；ResearchRun/BacktestRun 启动后冻结 provider、adapter、schema、lineage 和 policy version。
- **结论：** 用户确认按推荐执行。
- **原因：** 兼顾日常可用性、跨数据集覆盖差异和研究/回测可复现性。
- **影响工件：** CONTEXT / ADR / Spec / T-02 / T-04 / T-08 / T-11
- **约束或不变量：** 运行中失败不得静默换源；非等价切换必须显式新建 run 或重新确认质量门。
- **后续：** Spec 增加 SourcePolicy、SourceDecision 和 RunSourceManifest 合同。
- **替代/被替代：** 无

## LOG-015 — 2026-08-23 — 同花顺 API Key 与授权形态
- **设计树节点：** D-014
- **轮次与依赖：** round 5 / D-012
- **状态：** confirmed
- **问题：** 首版采用用户自有 API Key，还是共享 Key/产品代理？
- **事实与来源：** LOG-012 记录公开文档未给出固定价格、QPS、再分发或商用数据条款，账号 capability 与配额需要线上探测。
- **选项：** BYOK；内嵌共享 Key；产品方代理服务。
- **推荐：** 首版只采用 BYOK；敏感配置只在 Node route 读取。共享 Key/代理必须在书面商业和数据授权后另立设计。
- **结论：** 用户确认按完整推荐执行。
- **原因：** 将配额、权限和账号生命周期归还用户，避免未经授权的共享凭据与数据再分发。
- **影响工件：** CONTEXT / ADR / Spec / T-02 / T-10 / T-11
- **约束或不变量：** Key 不进前端、日志、快照、导出或 fixture；未配置时提供 unavailable + 配置入口。
- **后续：** Spec 明确敏感 configuration、最小认证探针和凭据失效状态。
- **替代/被替代：** 无

## LOG-016 — 2026-08-23 — Market Dumps 与插件私有历史源
- **设计树节点：** D-015
- **轮次与依赖：** round 5 / D-012, D-013
- **状态：** confirmed
- **问题：** 是否把 Market Dumps + 插件私有 DuckDB 纳入首版 source contract？
- **事实与来源：** LOG-012 证明 Market Dumps 提供全 A 股十年日 K、近十交易日增量和复权事件；Hana Node 版本满足官方 Node CLI 下限，但 native dependency 仍需逐平台打包验证，Python 包许可证存在冲突。
- **选项：** 不纳入；直接宣称 supported；先定义 source kind 并用隔离原型决定支持等级。
- **推荐：** 定义 `hithink-market-dump` 本地 source kind；直接实现 Node 插件私有 DuckDB，先验证跨平台打包、断点续传、增量、复权、质量、磁盘预算和卸载，再决定 supported/partial/blocked。
- **结论：** 用户确认按完整推荐执行。
- **原因：** 全市场和多标的历史研究不适合逐股 REST，请求规模需要本地库；原型门防止 native runtime 和数据生命周期破坏插件可删除性。
- **影响工件：** CONTEXT / ADR / Spec / Prototype / T-02 / T-08 / T-11
- **约束或不变量：** 不复制或拉起 Python marketdb/CLI 子进程；原型失败时保留 source contract 和 unavailable/blocked 状态，不修改宿主补洞。
- **后续：** 共识后路由回 Spec，并先为本地源建立 bounded prototype gate。
- **替代/被替代：** 无

## LOG-017 — 2026-08-23 — 整棵设计树共识确认与发布校验阻塞
- **设计树节点：** 不适用
- **轮次与依赖：** round 5 / D-001 至 D-015
- **状态：** confirmed
- **问题：** 设计树的全部适用分支是否已经走过、没有遗漏，并达成用户共识？
- **事实与来源：** 当前 design tree 没有 open 节点；用户明确回复“确认共识”。随后执行 `validate-specdev.mjs --stage grill`，现有 12 张 Ready Ticket 均因缺少 E2E disposition 和明确 execution environment 而失败，共 12 个错误。
- **选项：** 确认共识；指出遗漏并继续访谈。
- **推荐：** 确认共识，并在校验恢复后发布 `consensus`。
- **结论：** 用户已明确确认 D-001 至 D-015 的整棵设计树共识；由于强制 grill 校验失败，按工作流暂不把 design tree 标为 `consensus`，保持 G Work 可恢复。
- **原因：** G 工作流要求用户明确确认且阶段校验通过后才能发布共识；用户确认已经满足，唯一剩余阻塞是既有 Ticket 工件与当前校验契约不一致。
- **影响工件：** design tree / change status / 既有 12 张 Ticket
- **约束或不变量：** 不因校验失败丢失用户确认；不在 G Work 中越权改写 Ticket；校验通过前不路由或自动执行下一 Work。
- **后续：** 通过拥有 Ticket 的工作流补齐 12 张 Ready Ticket 的 E2E disposition 与明确 execution environment，再恢复 G 重新校验并发布共识。
- **替代/被替代：** 无

## LOG-018 — 2026-08-23 — Ticket 契约修复后正式发布设计共识
- **设计树节点：** 不适用
- **轮次与依赖：** round 5 / LOG-017
- **状态：** confirmed
- **问题：** 既有 Ticket 校验阻塞解除后，是否可以正式发布已获用户确认的整棵设计树共识？
- **事实与来源：** 用户明确要求通过 `<Path>{roots.workflows}/specdev/T-tickets/T-tickets.md</Path>` 补齐后返回 G。T Work 为 T-01 至 T-12 补齐 required E2E disposition、Lead owner、current-workspace/direct-parent 执行环境和集成证据，并同步 Tickets Map；`validate-specdev.mjs --stage tickets` 与 `--stage grill` 均返回 `0 error(s), 0 warning(s)`。
- **选项：** 保持可恢复阻塞；发布共识并路由下游。
- **推荐：** 正式发布共识并路由 S-spec。
- **结论：** design tree 正式标记为 `consensus`；G Work 成功完成，当前 work 清空。
- **原因：** frontier 为空、用户已明确确认 D-001 至 D-015，且强制 grill 校验已经通过，满足全部发布条件。
- **影响工件：** design tree / LOG / change status / global status
- **约束或不变量：** 本次只修复规划工件，未授权或执行产品实现；现有 Spec 尚未纳入 `hithink-rest`、SourcePolicy、RunSourceManifest 和 `hithink-market-dump` 原型门，不能直接沿用旧 Spec/Ticket 开始实现。
- **后续：** 进入 `<Path>{roots.workflows}/specdev/S-spec/S-spec.md</Path>` 修订外部行为和验收合同；随后重新投影 Tickets，并在实现前通过 P-goal-plan 重建 v6 Goal Plan。
- **替代/被替代：** 解除 LOG-017 的校验阻塞，不替代其中的用户共识证据。
