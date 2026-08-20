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
