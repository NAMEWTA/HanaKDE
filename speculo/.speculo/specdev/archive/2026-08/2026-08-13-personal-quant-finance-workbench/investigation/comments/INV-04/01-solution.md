---
artifact: wayfinder-solution-comment
ticket: INV-04
sequence: 1
resolution: answered
---

# Solution: TradingAgents A 股多 Agent 决策与审计边界

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/INV-04-tradingagents-astock.md</Path>`
- **答案：** TradingAgents-astock 最值得 Hana 采用的是“有边界的研究编排”：数据工具循环 -> 质量检查 -> 独立正反视角 -> 中立综合 -> 可选结果复盘；不是 7 个分析师、2 个研究员、3 个风险辩手、Trader 和 Portfolio Manager 的角色数量本身。上游检查点、线程安全进度、结构化输出和反思日志可以改造成 Hana 的任务/Session/Agent 运行协议；其全局字符串状态、质量门只写报告不阻断、结构化失败自动再调用自由文本、当前数据源混杂、评级启发式解析、文件路径写盘和固定 A 股规则 prompt 必须重建。首版只产生带证据引用、时点、质量和未知项的 `ResearchAssessment`，不产生仓位、价位、下单或自动执行动作。
- **事实与来源：** 调查固定在 `<Path>temp/finance-references/TradingAgents-astock/</Path>` 的 commit `0badc3340c70fa0eb16e8cb527c5c32efacc7966`（tag `v0.5.14`）；主要证据是 `tradingagents/graph/`、`agents/`、`dataflows/`、`web/`、`cli/`、`tests/`、`CHANGELOG.md`、`NOTICE` 和 `LICENSE`。Hana 契约依据 `<Path>skills2set/hana-plugin-creator/SKILL.md</Path>`、`<Path>PLUGIN_SDK.md</Path>`、`<Path>PLUGINS.md</Path>`、`<Path>packages/plugin-sdk/README.md</Path>` 与 `<Path>packages/plugin-components/README.md</Path>`。
- **资产：** `<Path>temp/finance-references/TradingAgents-astock/</Path>`，<Url>https://github.com/simonlin1212/TradingAgents-astock</Url>；其上游论文 <Url>https://arxiv.org/abs/2412.20138</Url>；代码为 Apache-2.0，归属和改动清单见 `<Path>temp/finance-references/TradingAgents-astock/NOTICE</Path>` 与 `<Path>temp/finance-references/TradingAgents-astock/CHANGES_FROM_UPSTREAM.md</Path>`。
- **后续 Ticket 所依赖的事实：** INV-05 需要验证 plugin-private Session/Agent、TaskRegistry、取消和 `stageFile` 的宿主能力；INV-06 需要把 A 股规则、PIT、交易日历和结果指标变成版本化确定性服务；INV-07 需要把 `ResearchRun` 阶段、数据能力和模型能力纳入统一 capability；INV-09 需要显示阶段、证据、成本、失败和用户确认；INV-10 需要设计可恢复运行状态和 provider/tool audit。
- **新浮现的 Tickets：** 无；最小 Agent 拓扑、研究输出 schema、取消/预算和结果语义已由既有 INV-05/06/07/09/10 覆盖。
- **升级的战争迷雾：** 无。原本“多 Agent 是否适合 Hana”的模糊问题已收敛为：首版采用有限阶段的研究运行协议，长期 Agent 只作为同一协议的可选执行器，不复制上游独立 Python 图运行时。
- **对现有 Tickets 的影响：** update INV-05、INV-06、INV-07、INV-09、INV-10；与 INV-02 的“事实底稿 -> 正反检验 -> 中立沉淀”合并为一条共享研究运行链；不改变 `<Path>plugins/quant-finance-workbench/</Path>` 的内置 full-access 插件落点。

## 决策摘要

### 上游能力的裁决

| 能力/设计 | 裁决 | Hana 处理 |
|---|---|---|
| LangGraph 阶段图、有限轮数、节点状态 | adapt | 由 Hana Task/Session 状态表达；阶段和状态是产品合同，图库不是插件依赖 |
| Analyst 工具循环 | adapt | 首版使用显式 `tools`/routes；允许列表、数据快照和调用 trace 必须先冻结 |
| 质量门（硬检查 + LLM 复审） | adopt then strengthen | 硬校验决定是否可进入综合；LLM 只能解释质量，不得把失败报告变成“可用” |
| 快/慢模型和角色级模型 | adapt | 快模型做抽取/分类，深模型做一次综合；调用前显示预算，模型由 Hana provider/config 决定 |
| Bull/Bear、风险三方辩论 | adapt | 默认两个互相不可见的独立视角 + 一次中立综合；多轮仅在用户批准预算后开启 |
| 结构化 Pydantic 输出 | adopt | 使用版本化 JSON schema；结构化失败不得无提示重复计费，失败状态与自由文本 fallback 必须可见 |
| SQLite checkpoint、暂停、恢复、历史 | adapt | 迁移到 `ctx.dataDir` + TaskRegistry；恢复按 `runId`/snapshot，不按裸 ticker+date |
| 记忆日志、结果反思、alpha 统计 | adapt | 作为 `OutcomeReview`，必须使用同一 provider snapshot/基准/成本口径；不称为回测或策略绩效 |
| 评级、Trader、Portfolio Manager | reject as action | 可保存研究立场和风险摘要，但不得输出仓位、价位、下单或调用交易接口 |
| 独立 FastAPI/Streamlit/CLI/Claude SDK | reject | Hana 已有页面、Session、模型、任务和文件交付边界；只移植行为，不嵌入第二个平台 |

**硬规则：** Agent 的文本不是数据事实；评级不是交易指令；“工具成功调用”不是数据正确；“完成阶段”不是质量通过；“恢复运行”不是恢复网络请求的幂等性。每个研究结论都必须回指冻结的 `EvidenceRef`/`DataSnapshot`，并显示 `fresh/stale/partial/unavailable`。

## Research Findings

### R-001：真实拓扑是有向状态图，不是平行 Agent 自由协作

- **Claim：** `GraphSetup.setup_graph()` 创建 7 个可选分析师，每个分析师接一个 `ToolNode` 和消息清理节点；分析师按 `selected_analysts` 串行连接。最后进入 `Quality Gate`，然后是 Bull/Bear 交替辩论、Research Manager、Trader、Aggressive/Conservative/Neutral 风险辩论和 Portfolio Manager。`ConditionalLogic` 用 `max_debate_rounds` 与 `max_risk_discuss_rounds` 计数终止；默认每个讨论阶段只有一轮配置（Bull/Bear 两次发言，风险三次发言）。
- **Type：** code fact
- **Source：** `<Path>temp/finance-references/TradingAgents-astock/tradingagents/graph/setup.py</Path>`、`conditional_logic.py`、`propagation.py`、`agents/utils/agent_states.py`。
- **Confidence：** high
- **Limits：** 实际 LLM 工具循环次数由模型发出 tool calls 决定，不能从角色数量推导总成本；分析师选项仍可能改变阶段数量。
- **Hana impact：** 产品显示 `ResearchRun` 的阶段图和每阶段状态，不显示“16 个 Agent 已达成智能”；阶段数、输入快照、输出 schema 和退出原因固定后才算可复现。

当前图可压缩为：

```text
DataRequest / AssetRef
  -> analyst tool calls (selected, serial)
  -> deterministic hard checks + quality review
  -> independent perspective A || independent perspective B
  -> neutral synthesis
  -> optional rule/risk review
  -> immutable ResearchAssessment + evidence audit
  -> optional outcome review after a declared horizon
```

上游的“研究经理 -> 交易员 -> 投资组合经理”把研究观点逐步包装成交易语汇；Hana 应把最后两层改名为 `Synthesis`/`RiskReview`，保留可讨论的 stance，但去掉交易动作语义。

### R-002：AgentState 是全局字符串袋，底稿和事实血缘不足

- **Claim：** `AgentState` 以字符串保存 `market_report`、`fundamentals_report`、`policy_report`、辩论 history、`investment_plan`、`final_trade_decision`；`InvestDebateState` 和 `RiskDebateState` 也以拼接字符串保存历史和当前回应。工具结果先进入消息，再被模型写成 Markdown；状态没有 provider、请求、字段、单位、as-of、快照 hash、缺失原因或证据 ID。
- **Type：** code fact + recommendation
- **Source：** `<Path>temp/finance-references/TradingAgents-astock/tradingagents/agents/utils/agent_states.py</Path>`、`propagation.py`、`agents/researchers/*.py`、`agents/risk_mgmt/*.py`。
- **Confidence：** high
- **Limits：** 上游报告中可能包含来源文字，但不是机器可验证的血缘；本票未把每个工具的完整返回逐一执行。
- **Hana impact：** 不把 prose report 当共享事实层，定义结构化 `DossierSnapshot`：

```text
DossierSnapshot {
  snapshotId, runId, assetRef, asOf, fetchedAt, calendarId,
  sections[], evidenceRefs[], missing[], qualityFlags[],
  providerVersions[], schemaVersion, inputHash, complete
}
EvidenceRef {
  evidenceId, dataset, providerId/version, sourceUrl,
  requestHash, rawSnapshotHash, fieldMap, unitMap,
  asOf, publishedAt, citation, quality, licenseStatus
}
```

模型只接收用户批准的 dossier 投影；正文中的事实引用 `evidenceId`，不得让下游 Agent 从上游的长 Markdown 中重新猜数字。

### R-003：七个 Analyst 的职责有价值，但来源与方法论不是同质的

| 角色 | 上游数据/工具 | 可采用部分 | 需要收紧 |
|---|---|---|---|
| Market | mootdx K 线、技术指标 | 技术观察和指标解释 | 复权、停牌、交易日历、代码身份和指标参数来自 snapshot，不由 prompt 猜 |
| Social | 新闻/资金流/热点 | 把情绪作为观察维度 | 供应商热度和资金流是派生值，不能称“硬证据”或预测 |
| News | 个股/全球新闻/公告 | 事件时间线和引用 | 去重、撤稿、发布时间、版权和来源可信度必须显式 |
| Fundamentals | 三表、估值、一致预期 | 事实字段横向比较 | current-only 数据不得用于历史分析；会计/币种/合并/审计/发布日必须保留 |
| Policy | 新闻和宏观资讯 | 事实事件分类和待验证影响 | “政策市”是研究假设，政策力度与窗口不能由模型编造 |
| Hot Money | 龙虎榜、北向、概念、资金流 | 观察资金/题材现象 | 龙虎榜方法论、北向披露缺口、接口许可、累积口径和 BSE 映射风险 |
| Lockup | 解禁、股东、新闻、基本面 | 供给事件提醒 | 事件日期、股份单位、减持公告与实际成交不能混为一谈 |

上游 `dataflows/interface.py` 通过 `route_to_vendor()` 做类别/工具路由，这个抽象可采用；但 a-stock-data 事实已经证明 provider 可能无响应、字段漂移或只有当前快照。每个 Analyst 只能读取声明的 `DatasetCapability`，不能在 prompt 中自由切换供应商。

### R-004：Quality Gate 当前是“质量报告”，不是阻断门

- **Claim：** `quality_gate.py` 先检查空报告、长度、失败标记、表格和 `[数据缺失]`，再在少于 4 个 D/F 时调用一次 LLM 复审，最终写入 `data_quality_summary`。后续 Bull/Bear prompt 会看到摘要并被要求谨慎，但图仍无条件进入辩论、交易员和 Portfolio Manager；没有 `blocked/partial` 路由。
- **Type：** code fact
- **Source：** `<Path>temp/finance-references/TradingAgents-astock/tradingagents/agents/quality_gate.py</Path>`、`setup.py`、`agents/researchers/bull_researcher.py`。
- **Confidence：** high
- **Limits：** 上游选择的是“尽量产出报告”的教学体验；这不能满足金融研究的完整性门槛。
- **Hana impact：** 质量门拆成确定性和解释性两层：
  1. deterministic validator 判断身份、时点、完整性、单位、schema、分页和关键字段；失败则 `blocked` 或 `partial`，不进入自动综合。
  2. 可选 `sampleText()` 解释缺口、冲突和需要人工核验的项；它不能把 `license_blocked`、`identity_mismatch` 或 PIT 缺失提升为通过。

### R-005：工具循环适合有限、可审计的调用，不适合隐形自主探索

- **Claim：** 每个 Analyst 的 LLM 可以不断产生工具调用，`ConditionalLogic` 只判断“最后消息是否有 tool_calls”；没有统一的单角色调用预算、数据请求去重、最大响应字节、单源限流或工具输出引用。工具失败通常作为字符串返回，模型可能继续写报告。
- **Type：** code fact + inference
- **Source：** `<Path>temp/finance-references/TradingAgents-astock/tradingagents/graph/conditional_logic.py</Path>`、`agents/utils/agent_utils.py`、`dataflows/a_stock.py`、`web/runner.py`。
- **Confidence：** high
- **Limits：** provider 自身可能有 LangChain recursion limit；这不是业务级成本/数据预算。
- **Hana impact：** 每次调用先通过 `ToolInvocationPolicy`：

```text
allowedDatasets / maxToolCalls / maxBytes / deadline
dedupeKey / providerBudget / egressConsent / requiredAsOf
```

工具结果返回 `ToolResult`（数据、来源、状态、证据 ID），而非“Error: ...”字符串；同一请求 hash 在 run 内去重，超预算返回 `budget_exhausted`。页面和运行记录显示已调用工具、耗时、tokens、provider 和失败，不把隐形自主性包装成智能。

### R-006：快/慢模型分工合理，但当前成本与结构化 fallback 会失真

- **Claim：** 上游默认 `quick_think_llm` 给 7 个 Analyst、Bull/Bear、Trader 和风险辩手；`deep_think_llm` 给 Research Manager 和 Portfolio Manager。还允许 `role_llms`，同 provider+model 复用 client；支持 OpenAI-compatible、Anthropic、Google、Claude Agent SDK 等客户端。`bind_structured()` 失败或结构化调用异常后，`invoke_structured_or_freetext()` 会再调用一次普通文本。
- **Type：** code fact
- **Source：** `<Path>temp/finance-references/TradingAgents-astock/tradingagents/default_config.py</Path>`、`graph/trading_graph.py`、`graph/setup.py`、`agents/utils/structured.py`、`llm_clients/`、`tests/test_role_llms.py`。
- **Confidence：** high
- **Limits：** 不同模型的 tool/structured 能力是外部供应商事实，应在 Hana provider registry 中实测，不凭名称推断。
- **Hana impact：** 采用“快模型做受限抽取/分类，深模型做一次综合”的思想；但每个 run 先冻结 `model/provider/prompt/schema/version`，预估并设置 token/cost/deadline budget。结构化失败默认变为 `schema_error`/`provider_error`，用户显式选择后才重试自由文本，且两次调用都计费并写 trace；不要让 fallback 改变输出协议而仍标记 `succeeded`。

建议首版调用预算：

```text
deterministic data/quality: no LLM
perspective A: 1 bounded sampleText
perspective B: 1 bounded sampleText
neutral synthesis: 1 bounded structured sampleText
optional reflection: separate user/task opt-in
```

不同 provider 的多样性可以作为高级选项，但必须提示数据外发、价格、失败和“模型不同不等于观点独立”；不自动为每个角色开一条付费连接。

### R-007：正反辩论应采用独立观察，不应复制同一模型的先后锚定

- **Claim：** 上游 Bull 先发言，Bear 读到 Bull 的 `current_response` 后反驳；默认一轮只形成一次先后对话。风险辩论是 Aggressive -> Conservative -> Neutral 的顺序，后者读历史。多个角色默认可以共用同一个 quick model。
- **Type：** code fact + research recommendation
- **Source：** `<Path>temp/finance-references/TradingAgents-astock/tradingagents/graph/setup.py</Path>`、`conditional_logic.py`、`agents/researchers/*.py`、`agents/risk_mgmt/*.py`、`tests/test_role_llms.py`。
- **Confidence：** high
- **Limits：** 角色提示词虽要求反驳，但提示词不是独立性证明；不同模型也可能共享同一错误底稿。
- **Hana impact：** 默认协议是 `perspective A || perspective B`，两者只能读取同一 `DossierSnapshot`，不能读取对方草稿；第三阶段 `Synthesis` 才可看到双方带 evidence refs 的 claims，输出共识、冲突、未知和验证清单。交叉辩论是用户可选的第二阶段，不是首版默认成本。

### R-008：结构化 schema 是正确方向，但当前字段仍允许无证据叙事

- **Claim：** `ResearchPlan` 有 recommendation/rationale/strategic_actions，`TraderProposal` 有 action/reasoning，`PortfolioDecision` 有 rating/executive_summary/investment_thesis/time_horizon；schema 明确禁止价格、止损和仓位，渲染回 Markdown 以兼容旧报告。字段没有 `evidenceIds`、`confidence`、`unknowns`、`dataQuality` 或 `ruleSetVersion`。
- **Type：** code fact
- **Source：** `<Path>temp/finance-references/TradingAgents-astock/tradingagents/agents/schemas.py</Path>`、`trader/trader.py`、`managers/*.py`。
- **Confidence：** high
- **Limits：** Pydantic 只验证形状和枚举，不验证陈述是否被数据支持。
- **Hana impact：** 用版本化 `ResearchAssessment` 替换决策 schema：

```text
stance: supportive | mixed | cautious | insufficient_evidence
summary, claims[], counterclaims[], consensus[], disagreements[]
unknowns[], verificationChecklist[], evidenceIds[]
quality: fresh | stale | partial | blocked
ruleSetVersion, modelRef, promptVersion, schemaVersion
```

任何 `claim` 没有 `evidenceIds` 或明确标为 `inference` 时不能进入“事实”区；`stance` 不映射成 Buy/Sell 动作。模型输出结构错误时运行失败或转人工编辑，不以自由文本猜评级。

### R-009：A 股制度提示必须从 prompt 移到版本化规则服务

- **Claim：** Trader 和 Portfolio Manager 的 system prompt 硬编码 T+1、涨跌停、最小手数、交易时段、ST/退市、融资融券等约束；这些规则随市场、板块、新股阶段和监管日期变化，代码没有 `ruleSetId`、来源、有效期或 deterministic validator。上游 changelog 还记录了规则与评级/日期修复需要多轮回归。
- **Type：** code fact + financial correctness recommendation
- **Source：** `<Path>temp/finance-references/TradingAgents-astock/tradingagents/agents/trader/trader.py</Path>`、`agents/managers/portfolio_manager.py`、`CHANGELOG.md`、`tests/test_market_guard.py`。
- **Confidence：** high for code shape; exact current market rules are out of scope here
- **Limits：** 本票不裁定 2026 年具体交易规则；INV-06 必须用官方资料和生效日期验证。
- **Hana impact：** `MarketRuleSet` 由确定性服务按 `exchange/assetType/asOf` 返回；prompt 只引用 `ruleSetId` 和已校验的约束结果。规则缺失或过期时输出 `rule_unknown`，不让模型自行补全。首版没有执行层，因此展示“研究中需要考虑的规则”不等于下单可行性。

### R-010：Look-ahead guard 已有良好意图，但只能算部分防护

- **Claim：** a-stock data layer 对 OHLCV 按 `curr_date` 截断；资金流历史扩大窗口后按分析日过滤并裁回 20 行；`_is_historical()` 改为 Asia/Shanghai；current-only 的估值/一致预期使用 `_snapshot_notice` 明确“不得当作历史事实”。测试文件覆盖这些行为，并修复过 `curr_date` 默认空串导致告警永远不触发、未来资金流窗口泄漏和主机时区误判。
- **Type：** code + test fact
- **Source：** `<Path>temp/finance-references/TradingAgents-astock/tradingagents/dataflows/a_stock.py</Path>`、`agents/utils/signal_data_tools.py`、`tests/test_lookahead_guard.py`、`tests/test_market_lookback.py`、`CHANGELOG.md`。
- **Confidence：** high
- **Limits：** current snapshot 仍会进入报告，只是加警告；公告、新闻、股东、解禁和 provider 缓存的发布/生效时点不由同一个 guard 统一控制。
- **Hana impact：** 历史模式采用 fail-closed：请求带 `asOf`，provider 声明 `pit=true/false`；`pit=false` 数据只能放在 `current_context`，不能进入 `DossierSnapshot` 的 historical facts。每条证据保存 `publishedAt/effectiveAt/asOf`，不是只给模型一个交易日字符串。

### R-011：检查点、暂停和恢复是可复用工程模式，但上游取消不是强取消

- **Claim：** `checkpointer.py` 为每只 ticker 建 SQLite，`thread_id` 由 ticker+date hash 得出；`prepare_graph_run()` 有 checkpoint 时返回 `None` 初始状态，让 LangGraph 恢复；成功后清理 checkpoint。Web runner 在 stream chunk 之间检查 `stop_requested`，`ProgressTracker.pause()` 清除 Event 等待下一 chunk，`resume()` 继续；停止会清空可见阶段并删除 checkpoint/incomplete task。当前正在运行的 LLM/tool 调用无法被中断，只能等 chunk 返回。
- **Type：** code fact
- **Source：** `<Path>temp/finance-references/TradingAgents-astock/tradingagents/graph/checkpointer.py</Path>`、`graph/trading_graph.py`、`web/progress.py`、`web/runner.py`、`tests/test_checkpoint_resume.py`、`tests/test_progress_pause.py`。
- **Confidence：** high
- **Limits：** 进程崩溃后的真实 LangGraph 版本兼容性仍需运行环境验证；本次 clone 没有安装 pytest。
- **Hana impact：** 采用 `runId`、阶段 checkpoint、幂等 `DataRequest` 和宿主 TaskRegistry；暂停语义明确为“当前 provider 调用完成后暂停”，取消语义明确为“发送 cancellation signal，并在 provider 支持时终止”。UI 必须区分 `paused`、`cancelling`、`cancelled`、`failed`、`partial`、`succeeded`。checkpoint 写 `ctx.dataDir`，不使用 `Path.home()`、SQLite 裸路径或 ticker+date 作为唯一身份。

### R-012：记忆与绩效是复盘工具，不是回测或模型胜率

- **Claim：** `TradingMemoryLog` 以 Markdown 追加 pending 决策；下一次同 ticker run 用 yfinance 取 5 个持有日和 CSI 300 基准，写 raw return、alpha、holding days，再调用一次 Reflector 生成 2-4 句 lesson；`performance.py` 统计 `direction_accuracy`、`up_rate`、`outperform_rate`、平均 alpha 和五档评级单调性，并明确它不是回测、无仓位/成本/冲击、窗口重叠且有选择偏差。BSE/退市等 yfinance 不支持时保持 pending。
- **Type：** code fact + semantic recommendation
- **Source：** `<Path>temp/finance-references/TradingAgents-astock/tradingagents/agents/utils/memory.py</Path>`、`graph/trading_graph.py`、`graph/reflection.py`、`performance.py`、`README.md`、`tests/test_memory_log.py`、`tests/test_performance.py`。
- **Confidence：** high
- **Limits：** 取数基准和实际成交假设仍是简化的 outcome observation；pending 只在同一 ticker 再运行时解决，跨 ticker 不会自动结算。
- **Hana impact：** adopt “判断 -> 声明 horizon -> outcome -> reflection”闭环，但产物叫 `OutcomeReview`，记录 snapshot、benchmark、calendar、fees、holding policy、selection set 和 pending reason。统计零 LLM；反思是显式任务并计成本。没有足够样本时 UI 必须显示噪声警告，绝不把方向正确率称为 Agent accuracy 或收益证明。

### R-013：进度和成本统计可采用，但当前统计不等于账单审计

- **Claim：** `StatsCallbackHandler` 统计 LLM calls、tool calls、input/output tokens；Web 进度展示 12 个阶段。没有统一 provider price table、币种、重试/structured fallback 分拆、缓存命中、数据请求成本或模型响应版本；某些 provider 可能不返回 usage metadata。
- **Type：** code fact
- **Source：** `<Path>temp/finance-references/TradingAgents-astock/cli/stats_handler.py</Path>`、`web/progress.py`、`web/runner.py`、`llm_clients/base_client.py`。
- **Confidence：** high
- **Limits：** provider 回调的具体覆盖率需在 Hana 模型适配器中实测。
- **Hana impact：** 每个 `ModelInvocation` 记录 provider/model、prompt/schema version、input/output tokens、estimated cost、cache hit、retry/fallback、started/completed/cancelled 和 external egress。缺 usage 记 `unknown`，不显示虚构精确价格。开始前做预算确认，超过预算转 `budget_exhausted`，不能继续静默调用。

### R-014：历史、报告和 PDF 都绕过了 Hana 的资源边界

- **Claim：** 上游默认把结果、缓存、memory 和 incomplete index 写入 `~/.tradingagents`；CLI 还可写当前目录 `reports/`，Web/PDF 使用本地文件和字体路径。Web 历史通过扫描 `full_states_log_*.json` 复原；`web/history.py` 的 `_checkpoint_step()` 读取 `DEFAULT_CONFIG` 而非当前运行 config，定制 cache 目录时恢复判断可能错位。
- **Type：** code fact
- **Source：** `<Path>temp/finance-references/TradingAgents-astock/tradingagents/default_config.py</Path>`、`graph/trading_graph.py`、`web/history.py`、`cli/main.py`、`web/pdf_export.py`。
- **Confidence：** high
- **Limits：** 上游是桌面/CLI 应用，直接路径写盘对其部署目标可接受；对 Hana 插件不成立。
- **Hana impact：** 运行和 checkpoint 使用 `ctx.dataDir`；用户研报/导入通过 ResourceIO 和 `ResourceRef`；用户下载报告先写插件私有目录，再 `toolCtx.stageFile()`/SessionFile 交付；不能在 iframe 读写文件或暴露本地绝对路径。报告保存必须带 run manifest、证据引用、模型/提示/规则版本和 license 状态。

### R-015：许可证覆盖代码，不覆盖数据源、模型和报告内容

- **Claim：** 仓库和 fork 均 Apache-2.0，并有 `NOTICE` 说明 TauricResearch 原作、Simon Lin 改动和 A 股数据层；这允许在保留通知、许可证和改动说明的前提下讨论代码层衍生。README 的“免费直连”不是数据再分发许可。mootdx、Eastmoney、Sina、腾讯、THS、CLS、CNINFO、yfinance、模型 provider 和新闻/PDF 的条款是独立边界。
- **Type：** source fact + compliance recommendation
- **Source：** `<Path>temp/finance-references/TradingAgents-astock/LICENSE</Path>`、`NOTICE`、`README.md`、`CHANGES_FROM_UPSTREAM.md`；数据许可沿用 INV-03 的 provider registry。
- **Confidence：** high for repository license; external terms require separate review
- **Limits：** 本票不是法律意见；不能因为仓库 Apache-2.0 就把上游数据代码和抓取结果一并授权。
- **Hana impact：** 优先重写行为。若未来复制实质代码，保留 Apache notice/license/modified-file notice；每个数据集和模型 provider 必须通过 license gate，未知条款默认为 `license_blocked`。个人自用工作台也要区分“本机访问”与“随插件分发的代码/缓存/报告”。

## Hana 最小研究运行协议

### Run contract

```text
ResearchRun {
  runId, assetRef, purpose, asOf, timezone, calendarId,
  dossierSnapshotId, selectedDatasets, selectedTools,
  modelPlan, budget, consent, ruleSetId,
  status, phase, startedAt, completedAt,
  evidenceAudit, fallbackTrace, error, outputRef
}
```

阶段只允许以下状态转换：

```text
created -> preparing -> quality_check
quality_check -> blocked | ready
ready -> perspective_a | perspective_b | cancelled | failed
perspective_a/b -> synthesis | partial | cancelled | failed
synthesis -> review | succeeded | partial | failed
review -> succeeded | partial | failed
any active -> pausing -> paused -> resuming -> previous phase
any active -> cancelling -> cancelled
```

每次 transition 写入 `runId/phase/inputHash/outputHash/reason`。恢复只从最后一个完整 phase 继续；工具请求必须有 idempotency key，避免重试重复抓取或重复计费。取消不能宣称已停止尚未支持 cancellation 的外部调用。

### 最小 Agent 拓扑

1. **Deterministic Data/Quality service：** 调 provider、校验 AssetRef/PIT/单位/时点/完整性，形成 `DossierSnapshot`；不调用 LLM。
2. **Perspective A / Perspective B：** 两次相互不可见的 `sampleText()` 或 plugin-private Agent，限定同一 snapshot 和 evidence IDs，只输出 claims、risks、unknowns，不输出交易动作。
3. **Neutral Synthesis：** 一次结构化 `sampleText()`，合并共识/分歧/验证清单，要求每条 claim 引用 evidence；数据不足则输出 `insufficient_evidence`。
4. **Optional Risk/Outcome review：** 用户明确触发或任务授权后运行；复盘只消费已结算 OutcomeSnapshot，不回写原始判断。

只有当用户需要多步工具探索、长时运行或跨阶段恢复时，才使用一个 plugin-private Agent；它必须调用同一插件 route/tool 和 `TaskRegistry`，不是再建一套 LangGraph/FastAPI/CLI。多 Agent 是执行器选择，不是数据或权限边界。

## Adopt / Adapt / Reject 总表

| 主题 | 结论 | 主要理由 |
|---|---|---|
| 角色化研究提示 | adopt as prompt modules | 角色帮助覆盖维度，但不拥有数据真相和动作权限 |
| 7 个 A 股观察维度 | adapt | 先以 dataset checklist 实现，只有合法/稳定数据才启用角色 |
| 质量门 | adopt + hard block | 质量状态必须影响路由，不能只生成提示语 |
| Bull/Bear | adapt to independent perspectives | 去除先后锚定，默认一次综合，有限轮数可选 |
| Quick/Deep | adopt budgeted model plan | 宿主模型优先，成本/模型/重试可审计 |
| Structured output | adopt strict schema | schema failure 可见；不能隐形 free-text fallback |
| Checkpoint/resume | adapt to TaskRegistry/dataDir | runId、快照和幂等请求替代 ticker+date/用户 home |
| Pause/stop | adapt with honest semantics | 阶段间暂停；provider 支持才强取消 |
| Markdown memory | reject as authority | 改为版本化记录/证据引用，Markdown 仅导出视图 |
| Reflection/alpha | adapt as outcome review | 不叫回测、胜率或收益证明，保留样本和偏差警告 |
| Buy/Sell/Underweight/position | reject for first slice | 研究立场不能自动变成投资服务或交易执行 |
| PDF/CLI/Web/独立配置 | reject | Hana UI/ResourceIO/config/session/task 已是宿主权威 |

## 首版边界与验收证据

### 首版必须证明

1. 用户选择一个合法 `AssetRef`、as-of、数据集和研究目的；运行前看到 provider、许可、模型、预计 tokens/cost、外发字段和规则版本。
2. 运行形成一个不可变 `DossierSnapshot`；每个 section 有数据状态、来源、时间、单位、证据 ID 和缺口；历史模式拒绝 current-only 数据混入事实。
3. 两个独立视角不能读取对方输出；中立综合使用结构化 schema，claims 必须有 evidence refs，缺证据时只能输出 unknown/verification item。
4. UI 能显示阶段状态、工具调用、质量门、预算、fallback、重试、取消/暂停/恢复和最终 `succeeded/partial/blocked/failed`；页面离开不丢任务。
5. 导出 Markdown/PDF/JSON 通过 ResourceIO/`stageFile()`，内容带 run manifest、快照 hash、模型/提示/schema/规则版本和非荐股声明。
6. OutcomeReview 使用声明的 holding policy、calendar、benchmark 和成本，样本不足/数据 pending/选择偏差均可见；不生成“策略收益”或“Agent 准确率”文案。

### 明确延后

- 自动多轮辩论、异构模型全角色并行、自治 Agent 长时浏览；
- 任何 Buy/Sell 到仓位、价位、止损、订单或券商账户的映射；
- 无 PIT 的历史基本面/一致预期、实时北向/资金/热榜作为核心证据；
- 自由 Python、回测引擎、全市场数据湖、常驻 sidecar 和 mootdx TCP；
- 批量 PDF/新闻全文复制、跨用户报告分享和未审查数据 provider。

## Verification Plan

固定 fixtures 与 contract tests 至少覆盖：

- phase state machine 的正常、blocked、partial、failed、cancelled、resume 和重复请求；
- provider/tool 的成功、空集、PIT 缺失、身份错配、429/403、schema drift、超时、分页未完；
- 两视角输入 hash 相同且互不可见，综合只能引用已存在 evidence ID；
- structured output 成功、schema 错误、明确批准的 free-text fallback，并验证预算计数不重复；
- 取消/暂停时当前调用的真实语义，进程重启后 checkpoint 与 progress index 一致；
- 评级/stance 不会产生交易 side effect，OutcomeReview 的 benchmark、holding days、费用和样本口径可复算。

本次尝试运行上游聚焦 pytest 时，clone 环境没有安装 `pytest`（`No module named pytest`），因此没有把“上游测试通过”写成验证结论；本票证据来自固定提交源码、测试设计和 changelog 审阅。

## Recommendation

将 TradingAgents-astock 作为“研究运行协议和失败修复史”的参考实现：采用有限阶段、确定性质量门、结构化研究输出、可恢复任务和事后复盘；拒绝整仓移植 Python 依赖、独立 LLM 客户端、硬编码 A 股规则、隐式 fallback、评级到交易动作和本地路径写盘。Hana 的长期全能工作台可以容纳更多观察角色，但必须始终共享同一个 AssetRef、DossierSnapshot、ResearchRun、EvidenceRef 和 OutcomeReview，而不是让每个 Agent 拥有自己的数据真相。

