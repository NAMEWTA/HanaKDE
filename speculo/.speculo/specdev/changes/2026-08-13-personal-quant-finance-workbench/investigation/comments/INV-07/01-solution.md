---
artifact: wayfinder-solution-comment
ticket: INV-07
sequence: 1
resolution: answered
---

# Solution: 跨项目能力模型与价值分层

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/INV-07-capability-model.md</Path>`
- **答案：** 四个项目的能力不应按页面或 Agent 数量相加，而应归并为一条共享的证据链：`AssetRef -> DataRequest -> DataSnapshot -> QualityGate -> EvidenceRef -> Research/Quant Run -> Assessment/Review`。共同地基负责身份、来源、时点、质量、权限和可恢复运行；日常研究、量化实验和 Agent 只是这条链上的不同消费者。推荐的首个垂直切片是“一个受控 A 股单标的/小 universe、日线、一个获授权 HTTPS provider 或用户导入 -> 不可变快照 -> 确定性质量门 -> 一个声明式筛选条件 -> 证据底稿 -> 可选受限模型摘要 -> SessionFile 导出”。它足以证明长期架构，但不把未经官方规则/费率/PIT 证明的回测、实时流或交易动作提前承诺。
- **研究事实边界：** 证据来自固定 commit 的 `<Path>temp/finance-references/tickflow-stock-panel/</Path>`、`<Path>temp/finance-references/Vibe-Research/</Path>`、`<Path>temp/finance-references/a-stock-data/</Path>`、`<Path>temp/finance-references/TradingAgents-astock/</Path>`，以及 Hana `<Path>PLUGIN_SDK.md</Path>`、`<Path>PLUGINS.md</Path>` 和 `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-01/01-solution.md</Path>` 至 `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-06/01-solution.md</Path>`。代码事实、跨项目推断和本产品建议在下文分开；本票不实现插件。

## 1. 能力模型总图

```text
Hana plugin host / config / ResourceIO / network / model / TaskRegistry
                              |
                 C0 capability + license health
                              |
                 C1 AssetRef / Universe identity
                              |
             C2 DataRequest / provider adapter / PIT
                              |
             C3 DataSnapshot / schema / unit / calendar
                              |
                 C4 deterministic QualityGate
                              |
       +----------------------+----------------------+
       |                      |                      |
 R1 research dossier    Q1 strategy/screen      A1 evidence synthesis
 R2 notes/filings       Q2 backtest/monitor      A2 perspectives
 R3 assessment/export   Q3 outcome review        A3 outcome reflection
       |                      |                      |
       +------------ C5 Evidence/Run audit ------+
                              |
                 C6 budget / cancel / recovery
                              |
              O1 diagnostics / migration / retention
```

`C0-C6` 是共同地基，必须只有一份语义实现；`R*`、`Q*`、`A*` 是领域消费者；`O*` 是插件治理面。任何消费者不得私自复制身份、时间、质量、成本或证据逻辑。

## 2. 来源到能力映射

| 来源 | 代码/产品事实 | 归并能力 | 裁决 |
|---|---|---|---|
| TickFlow | provider 能力探测、维表/日线/复权/enriched、声明式策略、筛选、回测、监控、任务进度、复盘 | C0-C4、Q1-Q3、O1 | adopt 原则；adapt 到 Hana；拒绝独立 FastAPI、全量 DuckDB/Parquet、动态 Python、常驻 scheduler |
| Vibe-Research | dossier-first、Bull/Bear/neutral、missing、watchlist、portfolio context、成本提示、本地笔记和报告 | C5、R1-R3、A1-A3、隐私约束 | adopt 事实底稿/缺口/中立综合；adapt 为 EvidenceRef/ResourceIO；拒绝 localStorage 唯一账本和自建 AI/API 平台 |
| a-stock-data | 多 provider inventory、官方链接候选、代码迁移、真取数验活、stale 标志、单位陷阱、限流 | C0-C3、O1 | adopt inventory 与反例；adapt 为 provider contract/license gate；拒绝未经授权网页接口、mootdx TCP 直接进入插件、静默空结果/fallback |
| TradingAgents-astock | curr_date look-ahead guard、有限阶段图、结构化结果、checkpoint、成本统计、Outcome/Reflection | C4-C6、A1-A3 | adopt 阶段/审计/结果复盘思想；adapt 为 Hana Task/Session；拒绝评级到交易动作、固定 prompt 制度和独立 LangGraph/CLI |
| Hana | page/routes/tools/config/secrets/ResourceIO/dataDir/Session-Agent/sampleText/TaskRegistry/progress-cancel | C0、C5-C6、R/A/O surface | 作为宿主合同；插件消费而不定义新的系统级 Registry、权限或常驻基础设施 |

**重要区分：** README 宣称的“支持市场/端点/角色”不是能力完成度。只有 capability declaration、输入输出 schema、质量状态、许可状态和可重复验证同时存在，才能将能力标为 `supported`。

## 3. 领域能力目录

每项能力使用统一记录：`capabilityId`、`stage`、`owner`、`inputs`、`outputs`、`failure`、`verification`、`placement`。`owner=plugin` 表示数据与结果的权威在插件私有存储；`owner=host` 表示必须消费 Hana；`owner=user` 表示原始用户资源不能被插件复制成第二份真相。

### 3.1 共同地基（P0，所有研究模式必需）

| ID / 能力 | 输入 -> 输出 | 所有权 | 失败降级 | 验证 / Hana 落点 |
|---|---|---|---|---|
| C0 Provider 与许可健康 | provider config、dataset、terms -> `ProviderCapability`/`LicenseRecord` | plugin registry；secret 归 host | `license_blocked`、`auth_required`、`unsupported_capability` | fixture、terms review、health probe；route/tool + config + `network.fetch` |
| C1 AssetRef / Universe | 用户代码、名称或 Resource -> canonical identity、成员资格 as-of | plugin instrument master；源文件归 user | `invalid_asset`、`identity_mismatch`、`survivorship_uncontrolled` | 代码迁移/指数/ETF/BSE fixture；plugin `ctx.dataDir` |
| C2 DataRequest / Provider adapter | AssetRef、dataset、asOf、频率、复权、单位、预算 -> provider request + normalized rows | request/audit plugin；凭证 host | `pit_unavailable`、`rate_limited`、`provider_unreachable`、`schema_drift` | request hash、HTTP contract、分页/粒度/unit tests；route/tool |
| C3 Snapshot / Schema / Calendar | normalized rows + raw response -> immutable `DataSnapshot` | snapshot plugin data；用户导入仍归 user | `stale`、`partial`、`conflict`、`adjustment_unknown`、`calendar_unknown` | raw/normalized hash、schema/unit/asOf/cal calendar fixtures；plugin data |
| C4 QualityGate | snapshot + purpose -> `fresh|partial|blocked|unknown` + reasons | quality decision plugin | fail-closed；不把模型解释提升为通过 | deterministic gates、bad fixtures、PIT/identity tests；route/task |
| C5 Evidence / Run audit | snapshots、claims、task/model events -> `EvidenceRef`、run manifest、assessment | plugin record；SessionFile 是交付投影 | `model_output_unsubstantiated`、`evidence_missing` | claim-to-evidence replay、hash、引用打开测试；dataDir + Session/Agent |
| C6 Budget / Cancel / Recovery | run、data/model budgets、TaskRegistry -> progress/cancel/recoverable run | task metadata host；checkpoint plugin | `budget_exhausted`、`cancelled`、`recovering`、`failed` | cancel race、restart、idempotency、usage audit；TaskRegistry + dataDir |

共同地基的输出不能被下游重写。比如 `QualityGate=blocked` 时，R3 可以生成“需要补证据”的记录，但 Q2 不得把它改成可回测，A2 不得把它改成有信心的观点。

### 3.2 日常研究闭环（P1）

| ID / 能力 | 输入 -> 输出 | 所有权 | 失败降级 | 验证 |
|---|---|---|---|---|
| R1 Object workspace | AssetRef/Universe/Snapshot -> 观察摘要、事件时间线、数据能力矩阵 | plugin UI state + plugin records | 无快照显示 capability gap；不画空白假成功 | page/route smoke、市场不对称矩阵、stale UI |
| R2 Dossier / filings / notes | 合法 dataset、ResourceRef、asOf -> sections、missing、citations、ResearchRecord | 原文 ResourceIO；索引/派生 plugin | 只返回可用 sections；`partial` 明示缺项；不臆测 | section fixture、引用页码/URL、删除/导出 |
| R3 Assessment / export | dossier + evidence + user prompt -> `ResearchAssessment`、JSON/Markdown/SessionFile | assessment plugin；文件用户选择交付 | 无证据 `insufficient_evidence`；模型失败仍保留底稿 | schema、非荐股、SessionFile、字段 egress preview |

### 3.3 量化实验闭环（P2）

| ID / 能力 | 输入 -> 输出 | 所有权 | 失败降级 | 验证 |
|---|---|---|---|---|
| Q1 Declarative strategy / feature | snapshot、白名单 DSL、params -> versioned `StrategyDefinition`/features | strategy/feature plugin data | DSL/schema/field mismatch 拒绝；不运行任意 Python | expression allowlist、version drift、unit/NaN fixtures |
| Q2 Screen / candidate set | strategy + universe + snapshot -> candidate `UniverseSnapshot` + reasons | derived plugin snapshot | partial input -> partial/blocked；成员资格必须 as-of | deterministic replay、candidate evidence、empty-vs-error |
| Q3 Basic backtest | strategy、snapshot、rule/calendar/cost manifest -> trades、metrics、unfilled reasons | backtest run plugin data | 缺 PIT/规则/成本/容量 -> blocked；无分钟不降为日线 | T+1、lot、fees、slippage、price limit、frequency Sharpe fixtures |
| Q4 Monitor rule | validated strategy + refresh policy -> rule/baseline/alerts | plugin data + optional host notifications | stale/unavailable pauses evaluation；不能静默指向新策略版本 | cooldown/dedupe/reset/restart tests；TaskRegistry schedule |
| Q5 Outcome review | declared horizon、benchmark、holding/cost policy -> `OutcomeReview` | review record plugin | pending/selection bias/样本少显式保留；不称回测收益 | settlement/as-of/benchmark/sample-size replay |

Q1/Q2 可以在 P1 后进入；Q3 只有在 C0-C4 的规则、PIT、成本和容量门槛满足后才可标 `supported`；Q4 依赖 Q3 或用户明确声明的研究规则；Q5 不回写原始预测，不产生交易动作。

### 3.4 Agent 增强（P1 可选，P3 扩展）

| ID / 能力 | 输入 -> 输出 | 所有权 | 失败降级 | 验证 |
|---|---|---|---|---|
| A1 Bounded synthesis | approved dossier -> evidence-linked claims/unknowns | host model execution；assessment plugin | `insufficient_evidence`、`budget_exhausted` | evidence IDs、schema、egress audit、cost trace |
| A2 Independent perspectives | 同一 snapshot -> A/B 隔离观点 | host Session/Agent；run record plugin | 单方失败 -> partial；不把一方文本给另一方 | same input hash、no cross-read、bounded calls |
| A3 Neutral synthesis / checklist | A/B claims -> consensus/disagreement/verification checklist | plugin assessment | 无共同证据 -> unknown；不输出 Buy/Sell | structured schema、stance boundary、replay |
| A4 Outcome reflection | 已结算 OutcomeReview -> lessons | host model + plugin record | 无样本/数据 pending -> no-op/unknown | zero-LLM metrics first、lesson provenance |

Agent 不是另一条数据管线。它不能自行抓 provider、改规则、保存隐秘持仓或创建交易副作用；所有工具调用均通过 C2/C4/C5/C6。

### 3.5 运维治理（P0/P1）与未来扩展

| ID | 能力 | 阶段 | 结论 |
|---|---|---|---|
| O1 | provider health、freshness、rate/circuit、schema canary、license review | P0 | adopt，属于插件治理，不是“数据成功率”装饰 |
| O2 | snapshot retention、cache invalidation、checkpoint recovery、migration | P0 | adapt 到 `ctx.dataDir`/TaskRegistry；不写宿主 home |
| O3 | diagnostics、usage/cost、egress、删除/导出、审计浏览 | P0/P1 | adopt，页面上必须可见 |
| F1 | 多市场/多资产、分钟/实时、期权 Greeks、新闻全文、供应商共识 | P3+ | defer，按 market x dataset x workflow capability 逐项开启 |
| F2 | 大规模列式数据湖、Python/Polars/DuckDB、优化器/walk-forward | system prerequisite | defer；先建独立系统 change，不在插件内偷偷启动进程 |
| F3 | raw TCP/WebSocket、高频 feed、broker、订单、资金 | out of scope/system | reject；需要新的权限、安全和合规裁决 |

## 4. 依赖与最小闭环

### 4.1 能力依赖 DAG

```text
C0 provider/license health
  -> C1 AssetRef/Universe
  -> C2 DataRequest/PIT/provider
  -> C3 DataSnapshot/schema/unit/calendar
  -> C4 QualityGate
  -> C5 Evidence/Run audit
  -> R1/R2/R3
  -> Q1 -> Q2 -> Q3 -> Q4 -> Q5
  -> A1 -> A2 -> A3 -> A4

C6 budget/cancel/recovery wraps C2, C4, R2, Q2/Q3/Q4, A1-A4
O1/O2/O3 observe and retain C0-C6 plus every consumer
```

依赖有三条硬规则：

1. C1-C4 是所有历史研究和量化能力的硬前置；没有 identity/PIT/quality，只有 current-context 观察可运行。
2. C5 是所有模型/报告/回测结果的硬输出；无 evidence 的文本不能进入知识沉淀或导出。
3. C6 不是附加 UI；没有预算、取消、幂等和恢复，长任务只能降级为用户触发的短同步。

### 4.2 首版垂直切片 V0：证据级单标的研究

**目标用户闭环：** 用户在金融工作台输入一个带市场身份的 A 股标的或小 universe，选择公开数据/自己的 Resource，看到数据能力和许可状态，取得一个带 as-of/单位/复权/质量的快照，运行一个白名单条件筛选，并选择是否用 Hana 模型生成带证据引用的研究摘要，最后导出可复现记录。

**范围：**

1. 一个 `AssetRef` 或不超过小规模的 `UniverseRef`，优先 CN A-share daily；不承诺其他市场同等覆盖。
2. 一个已审核 HTTPS provider；在 provider 尚未通过许可/稳定性门时，以用户自己的 CSV/JSON/Parquet Resource 或固定 fixture 作为有效路径。
3. 日线 OHLCV/基础行情、维表和公告元数据/官方链接中的已验证字段；不默认复制公告全文、研报 PDF 或私有榜单。
4. C0-C6 全部可观察：能力矩阵、request/snapshot hash、quality、freshness、fallback、预算、取消、run history、evidence refs。
5. 一个声明式条件（例如字段与滚动窗口的比较）和一个 deterministic derived feature；策略可保存版本但不运行任意代码。
6. 一次受限 `sampleText()` 可选摘要，默认关闭外发私密字段；输出 `ResearchAssessment`，不能产生仓位/价位/交易动作。
7. 通过 Hana ResourceIO/`stageFile()` 导出 JSON/Markdown/SessionFile；原始输入仍归用户资源。

**不在 V0：** 真实交易、broker、分钟/实时 feed、mootdx TCP、全市场数据湖、复杂回测、参数优化、walk-forward、期权、北向/热榜/资金信号、无 PIT 的历史财务/一致预期、自动多 Agent 辩论和自动通知。

**为什么不是首版回测：** 回测用户价值高，但它会同时激活 C1-C4 的所有高风险语义（历史 universe、规则/日历、复权、PIT、T+1、成本、容量、成交）。先用 V0 证明“来源到证据、缺口到阻断、同一快照到研究输出”的骨架，能用更小的金融事故半径验证长期对象；Q3 在官方规则和费率证据齐备后进入 V2，而不是用示例默认值制造漂亮曲线。

### 4.3 后续价值阶段

| 阶段 | 用户价值 | 进入条件 | 主要能力 | 退出条件 |
|---|---|---|---|---|
| V0 | 可信地看懂一个对象 | C0-C6、一个 provider/导入路径 | snapshot、quality、screen、dossier、optional synthesis、export | F-01 类身份/PIT/质量/证据/cancel 验收通过 |
| V1 | 研究池批量比较 | V0 稳定；小 universe contract | Q1/Q2、watchlist/universe、派生因子、对比视图 | 同一策略/快照可重放，partial 不伪装完整 |
| V2 | 可信量化验证 | 官方 rule/calendar、cost/PIT/capacity evidence | Q3 基础回测、样本外、交易与未成交原因 | 金融正确性矩阵和指标口径全绿 |
| V3 | 持续观察假设 | V2 或显式研究规则 | Q4 monitor、baseline/cooldown、可恢复刷新 | stale/暂停/取消/策略版本迁移可验证 |
| V4 | 证据增强研究 | V0 证据链稳定、用户确认 egress | A1-A4、私有资料引用、OutcomeReview | claim、外发、预算、反思和样本偏差可审计 |
| V5 | 广度与规模 | 每新增市场/数据集有独立 license/PIT/质量 | 多市场、分钟、更多 provider、优化 | 任何破盒能力另立系统 change |

## 5. Adopt / Adapt / Reject

| 能力/设计 | 裁决 | 处理方式 |
|---|---|---|
| 一套对象贯穿观察、研究、量化和复盘 | **adopt** | C1-C5 作为唯一语义链；禁止页面各自存一套 ticker/状态 |
| provider capability matrix、健康和来源显示 | **adopt** | C0/O1；能力按 dataset/market/workflow 粒度探测 |
| immutable snapshot、schema/unit/PIT/freshness | **adopt** | C2-C4；失败可见且 fail-closed |
| dossier-first、missing、neutral synthesis | **adopt** | R2/A1-A3；模型不能填空缺 |
| versioned declarative strategy/feature | **adopt** | Q1；白名单 DSL，Agent 只生成草稿 |
| screening / candidate reasons | **adopt** | Q2；输出候选及理由/evidence，不能称预测 |
| 基础回测、T+1、费用、滑点、容量 | **adapt after gates** | Q3/V2；规则、PIT、成本和容量证据齐全才启用 |
| monitor baseline/cooldown | **adapt after Q3** | Q4/V3；复用策略版本和 snapshot，stale 时暂停 |
| OutcomeReview/Reflection | **adapt** | Q5/A4；严格命名为结果观察，不是策略收益证明 |
| quick/deep、多 Agent 角色 | **adapt** | 宿主模型 + 有界调用；独立观点不可互读，预算先行 |
| localStorage、用户 home、独立报告目录 | **reject** | `ctx.dataDir`、ResourceIO、SessionFile 取代 |
| 动态 Python、mootdx TCP、raw WebSocket、sidecar | **reject for plugin** | HTTP/导入降级；价值成立再建系统前置 change |
| 抓站热榜、涨停池、研报全文、实时北向 | **defer/reject default** | 需许可、方法论、PIT、分页和稳定性证据 |
| broker、订单、仓位、收益承诺 | **reject/out of scope** | 不在当前产品目的地内 |

## 6. 插件放置判定

依据 `<Path>.agents/skills/feature-placement/SKILL.md</Path>`，V0-V4 的领域能力落在 `<Path>plugins/quant-finance-workbench/</Path>` 内置 full-access 插件：

- **消费什么：** Hana 已有 page/routes/tools、`network.fetch`、配置/秘密、ResourceIO、`ctx.dataDir`、Session/Agent、`sampleText()`、TaskRegistry、进度/取消和 SessionFile。
- **新增什么：** 只在插件私有边界定义金融 `AssetRef`、provider capability、DataSnapshot、QualityGate、StrategyDefinition、ResearchRun、EvidenceRef、Assessment 和其迁移/审计。
- **产物归谁：** provider audit、快照、策略、运行和 assessment 归插件私有数据；用户原始文件归 ResourceIO；导出归用户选择的 SessionFile。

七项 placement 判据：

| 判据 | V0-V4 裁决 | 证据/边界 |
|---|---|---|
| 修改特权子系统 | 能装进盒子 | 只消费 Hana API；不改 session/provider/permission/host migration |
| 定义共享契约原语 | 能装进盒子（当前） | registry 只服务插件；若未来跨插件共享 DataSnapshot/RuleSet，则升格 system |
| 必须启动即常驻 | 能装进盒子 | 页面/工具/按需 task 激活；不要求 feed、scheduler 或数据库启动前置 |
| 整块删除 | 能装进盒子 | 删除插件只失去金融 workspace；需测试 data/config/schedule 清理策略 |
| 贡献面表达 | 能装进盒子（V0） | page/routes/tools/config/lifecycle/task 足够；图表自包含 |
| 权限自洽 | 能装进盒子 | HTTPS 走 network allowlist，秘密走 host config，文件走 ResourceIO |
| 产物归属 | 能装进盒子 | plugin data + user ResourceIO/SessionFile；不写全局状态 |

**破盒触发器：** 共享官方日历/规则/费率 Registry、通用回测/列式引擎、Python worker、raw TCP/WebSocket、高频 feed、broker execution、跨插件 DataSnapshot/usage/audit 或宿主数据库迁移。命中任一项，停止扩展插件权限并建立独立 system change；不能因为插件标为 `full-access` 就绕过该门。

## 7. 验收矩阵与交付顺序

### V0 验收

| ID | 验收证据 | 失败含义 |
|---|---|---|
| V0-01 | AssetRef 对 exchange/assetType/name/currency 回显校验；裸代码被拒绝 | C1 未成立 |
| V0-02 | provider/导入路径显示 license、capability、asOf、timezone、adjustment、unit | C0-C3 不可审计 |
| V0-03 | 正常/空/陈旧/冲突/schema drift/429/403 fixture 生成稳定状态和错误码 | provider 静默成功 |
| V0-04 | immutable snapshot raw/normalized hash 可重放；筛选引用 snapshotId | 对象语义分叉 |
| V0-05 | 一个白名单筛选条件返回 candidate reasons 和 evidence；无任意代码 | Q1/Q2 边界破坏 |
| V0-06 | 模型关闭时完整工作；开启时 preview egress、budget，claim 绑定 evidenceId | AI 变成硬依赖或无证据叙事 |
| V0-07 | TaskRegistry 显示 queued/running/progress/cancelled/failed/recovering；取消不被晚到响应覆盖 | C6 假取消/不可恢复 |
| V0-08 | JSON/Markdown/SessionFile 带 run manifest、snapshot hash、质量、来源、非投资建议 | 结果无法迁移/审计 |

### 之后的验证门

- V1：批量 universe、策略版本和派生特征在不同运行中得到相同 input/output hash；成员资格和 partial 状态可见。
- V2：官方规则/日历、PIT、复权、T+1、lot、费用、滑点、容量、指标频率的 fixtures 全绿；任何缺口阻断净收益结论。
- V3：策略版本、baseline、cooldown、stale pause、重启恢复和通知副作用可审计。
- V4：A/B 观点输入相同且互不可见；中立综合只能引用现有 evidence；OutcomeReview 样本偏差和成本口径可复算。

## 8. 尚存冲突与用户需要决定的选项

本票已把“最小闭环”命名为 V0，但以下选择会改变 provider、UI、隐私和后续成本，不能由能力数量推断：

1. **首要市场：** 推荐 CN A-share daily 作为 V0，因为四个参考项目的最深证据集中在 A 股；用户也可选择以用户导入为主、市场中立的 V0。无明确选择前，不扩展 A/HK/US 同构承诺。
2. **数据来源：** 推荐“用户导入 + 一个有书面权利基础的 HTTPS provider”双路径；不建议把 a-stock-data 的免费网页端点作为默认。provider 合同不齐时，V0 仍可用 fixtures/用户文件，不阻塞对象架构。
3. **AI 默认值：** 推荐默认关闭，只在用户批准 egress 和预算后启用一次 bounded synthesis；确定性 dossier/screen 必须独立可用。
4. **首版输出：** 推荐 evidence-grade dossier + screen + export；不在 V0 产出净回测收益、目标价、仓位或交易动作。
5. **持仓/私有资料：** 推荐 V0 不导入券商凭证；持仓和私有文档仅在字段级 egress、删除、导出和 ResourceIO contract 完成后进入 V4。
6. **实时性：** 推荐 V0 手动刷新/短轮询并显示 `staleAt`；高频/长连接视为系统前置候选。

这些是待用户确认的产品偏好，不是本票隐藏的技术缺口；在用户选择前可继续完成不依赖它们的能力 contract 和插件边界。

## 9. 结论

“全能”应定义为：一个带证据和质量状态的研究对象可以在观察、筛选、回测、监控、Agent 和复盘之间流动；不是每个市场、数据集和模型都首日可用。实现顺序应是：

```text
V0 evidence-grade single-object slice
  -> V1 declarative universe/screen
  -> V2 rule- and cost-complete backtest
  -> V3 snapshot-driven monitor
  -> V4 bounded Agent + private evidence + outcome review
  -> V5 market/data breadth or system prerequisite changes
```

这条路线将用户价值、证据质量、事故半径、成本和插件可行性放在功能数量之前；它也为后续 Spec 提供可直接拆解的 capability IDs、输入输出、所有权、失败语义和验收门。
