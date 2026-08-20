---
schema_version: 3
artifact: goal-plan
change: 2026-08-13-personal-quant-finance-workbench
status: ready
modes: [coordination, migration, high-assurance, reference-conformance, release-coordination]
ready_for_execution: true
---

# Goal Plan: 内置 A/HK 个人量化金融工作台插件

- **Goal Plan：** `<Path>{roots.state}/specdev/changes/{change}/goal-plan.md</Path>`
- **Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **Tickets Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **Ticket 目录：** `<Path>{roots.state}/specdev/changes/{change}/ticket/</Path>`
- **Evidence 目录：** `<Path>{roots.state}/specdev/changes/{change}/evidence/</Path>`

## 1. Outcome and Authority

### Outcome

在不修改 HanaKDE 宿主核心、server、shared、全局注册表、宿主数据库或其他插件的前提下，按 12 张 Ready Ticket 交付一个可安装、可诊断、可卸载的内置 A/HK 个人量化金融工作台。全部生产实现、测试 fixture、页面资源、provider adapter、任务、工具和私有派生数据只位于 `<Path>plugins/finance-workbench/</Path>`。

最终用户可从一个插件入口进入 A 股和港股的资产/自选、行情/K 线/live、财务/估值/公告/研报/新闻、筛选/因子/策略、回测、监控/告警、定时研究、本地持仓/成本/P&L、私有笔记/研报引用、Agent 研究和导入导出。每一项均保留正常、空、陈旧、部分、不可用、阻断、取消和恢复状态；能力不足不能隐藏模块或伪装成可信金融结论。

### Success and False Completion

成功必须同时满足：

- T-01～T-12 均 `done`，每票 Evidence 能复现代码修改、命令、结果、合同映射和残余风险；
- `AC-001`～`AC-033` 全部有可定位的 Ticket/Gate Evidence，没有未批准 deferred/unverified；
- A/HK 的身份、交易日历、PIT、复权、单位、费用、滑点、容量、stale、provider 许可与质量门在真实 fixture 中通过；不满足时状态如实降级；
- ResourceIO、SessionFile、secret、Agent consent、TaskRegistry pause/resume/cancel/recovery 和无交易工具扫描通过；
- 插件 dev install/reload/diagnostics/scenario、类型检查、定向测试、适用 E2E、构建和整块删除 smoke 通过，基线没有未经批准退化；
- 失败/限流/睡眠/模型不可用/任务恢复均有可执行的替代路径或安全阻断。

以下属于伪完成：只有静态页面或 happy path；以 HTTP 200、空响应、连接握手或模型完成代替数据质量；以 stale 数据触发告警；把 cancel request 命名为 cancelled；把持仓账本接成券商；把模型结论当建议；把 private data 写入日志/外发；修改宿主或其他插件绕过能力缺口；跳过测试、放宽断言、隐藏 unavailable 模块，或没有可卸载证据。

### Non-goals

- 券商 credential、券商同步、下单/撤单、资金划转、基金交易、自动仓位变更或任何交易副作用；
- tick 级 SLA、交易所直连、后台永久运行、券商级告警送达和自动交易；
- 直接复制参考项目未经验证的 endpoint、密钥、许可证、Python/Polars/DuckDB/TCP runtime；
- 修改 HanaKDE core/server/shared、全局 registry、宿主数据库或其他插件承载金融逻辑；
- 将模型预测、告警解释、回测收益输出为投资建议或金融事实；
- 本计划内远程 marketplace 发布、push/PR/merge、生产配置写入或真实用户数据导入。

### Measured Baseline

- **Git 基线：** 当前仓库 HEAD 为 `1d2d0711fea31db022982d881de51daf60d8d588`；工作区存在其他 change/插件的用户或并行工作，执行者不得清理或覆盖无关修改。金融插件目录 `<Path>plugins/finance-workbench/</Path>` 当前不存在占用。
- **Creator preflight：** `node <Path>skills2set/hana-plugin-creator/scripts/check_env.mjs</Path> --capability scaffold` 返回 `ok: true`，Python 3.12.10，所需 Python 包为空。
- **项目命令：** `<Path>package.json</Path>` 已声明 `test`、`typecheck`、`lint`、`build:client`、`build:server`、`verify:seed-kit` 和知识工作区 Playwright E2E；插件实现优先增加插件内定向命令/fixture，不修改根脚本。
- **SDK 基线：** `<Path>packages/plugin-sdk/README.md</Path>`、`<Path>packages/plugin-runtime/README.md</Path>` 和 `<Path>packages/plugin-components/README.md</Path>` 支持 route-backed WebView、`hana.api.fetch`、`ctx.network.fetch`、ResourceIO、TaskRegistry、Session/Agent、`sampleText` 和主题组件；native rich card、宿主 scheduler 改造和原始 runtime 不属于本计划。
- **执行形态：** 单一当前工作区按 DAG 顺序推进。T-06/T-07 虽写路径不相交，可以作为候选并行 Wave，但默认逐票执行并在每票后重跑契约；不创建额外 worktree 或跨执行者角色合同。
- **参考基线：** T-02～T-05 的行为验证使用已固定 commit 的四个本地参考仓库和调查 Evidence；参考仓库只读，条款/质量不由代码许可证推断。

### Authoritative Inputs

| 优先级 | 来源 | 负责内容 | 冲突处理 |
|---|---|---|---|
| 1 | 用户最新决定：内置实现只在 `<Path>plugins/finance-workbench/</Path>`，A/HK、首版全模块 | 物理范围、产品批准和市场 | 只有用户新决定可改变；否则暂停并返回上游 |
| 2 | `<Path>{roots.state}/specdev/changes/{change}/ADR.md</Path>` | 当前架构、权限、数据与插件边界决策 | 新决定通过 ADR/Spec 形成替代，不在计划中静默覆盖 |
| 3 | `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>` | 外部行为、范围、AC、NFR | 下游只编排，不改写；行为变化回 S-spec |
| 4 | `<Path>{roots.state}/specdev/changes/{change}/ticket/{ticket-file}.md</Path>` | 单票契约、路径、验证和恢复 | Ticket frontmatter 是依赖/路径权威，变化先修票并重新校验 |
| 5 | `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>` | DAG/合同覆盖投影 | 与 Ticket 冲突时以 Ticket 为准并同步 Map |
| 6 | `<Path>PLUGIN_SDK.md</Path>`、`<Path>PLUGINS.md</Path>`、SDK README 与当前代码 | 可执行接缝、兼容和构建事实 | 事实冲突触发 deviation，不用计划扩大宿主范围 |
| 7 | `<Path>temp/finance-references/</Path>` 与 INV-01～INV-08 Evidence | 参考行为和风险证据 | 只复用可验证行为，不复制未验证实现/条款 |

## 2. Execution Graph

### DAG and Critical Path

```text
G0 基线/creator preflight/插件盒
  -> W1 T-01 共享 manifest + domain/error contract
       -> G1 共享契约稳定
            -> W2 T-02 provider probe + DataSnapshot
                 -> W3 T-03 AssetRef/watchlist/research pool
                      -> W4 T-04 quotes/K-line/live/stale
                           -> G2 数据可信闭环
                                -> W5 T-05 dossier/EvidenceRef
                                     -> G3 研究底稿/隐私输入稳定
                                          -> W6 T-06 portfolio/private materials
                                          -> W6 T-07 screener/factor/strategy
                                               -> G4 个人数据与策略汇合
                                                    -> W7 T-08 rule-aware backtest
                                                         -> G5 quant quality
                                                              -> W8 T-09 monitor/TaskRegistry automation
                                                                   -> G6 automation readiness
                                                                        -> W9 T-10 Agent/consent/no-trade
                                                                             -> G7 Agent security
                                                                                  -> W10 T-11 exchange/diagnostics
                                                                                       -> G8 exchange/diagnostics
                                                                                            -> W11 T-12 integration/release
                                                                                                 -> G9 publish/removal
```

关键路径为 `T-01 -> T-02 -> T-03 -> T-04 -> T-05 -> (T-06,T-07) -> T-08 -> T-09 -> T-10 -> T-11 -> T-12`。T-06/T-07 依赖相同的 T-05 产物、可写路径不相交，可在资源允许时同 Wave；默认单工作区逐票执行，完成一票后才启动另一票，不改变 DAG。

### Waves and Ownership

| Wave | Ticket | 前置条件 | 项目写路径 | Shared owner | 集成点 |
|---|---|---|---|---|---|
| W0 | — | HEAD、SDK、creator preflight、无 finance 目录占用 | 无 | — | G0 基线 |
| W1 | T-01 | G0 关闭 | `<Path>plugins/finance-workbench/**</Path>` | manifest/domain 由 T-01 | G1 共享契约 |
| W2 | T-02 | T-01 Evidence | provider/data 子路径 | T-01 domain 只读 | G1 数据质量 |
| W3 | T-03 | T-02 Evidence | assets/watchlist 子路径 | 无 | identity contract |
| W4 | T-04 | T-03 Evidence | quotes/calendar 子路径 | 无 | G2 数据可信 |
| W5 | T-05 | T-04 Evidence | research-data/evidence 子路径 | 无 | G3 dossier |
| W6 | T-06、T-07 | T-05 Evidence | portfolio/private 与 quant definition 子路径 | T-01 domain 只读 | G4 个人/策略汇合 |
| W7 | T-08 | T-06、T-07 Evidence | quant/backtest 子路径 | 无 | G5 quant quality |
| W8 | T-09 | T-08 Evidence | automation 子路径 | TaskRegistry 宿主只读 | G6 automation readiness |
| W9 | T-10 | T-06、T-09 Evidence | agent/tools 子路径 | T-01 domain 只读 | G7 Agent security |
| W10 | T-11 | T-06、T-10 Evidence | exchange/diagnostics 子路径 | 无 | G8 exchange |
| W11 | T-12 | T-01～T-11 Evidence | `<Path>plugins/finance-workbench/**</Path>` | T-12 唯一整合 owner | G9 release/removal |

### Ticket Quick Reference

| ID | Ticket | 行为产出 | Depth/Risk | Dependencies | Wave/Gate | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| T-01 | `<Path>{roots.state}/specdev/changes/{change}/ticket/01-establish-finance-plugin-shell-and-domain-contract.md</Path>` | 插件盒/共享契约/总览矩阵 | deep/high | — | W1/G1 | implementation-owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>` |
| T-02 | `<Path>{roots.state}/specdev/changes/{change}/ticket/02-deliver-provider-capability-and-data-snapshot.md</Path>` | provider probe/snapshot | deep/critical | T-01 | W2/G1 | implementation-owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` |
| T-03 | `<Path>{roots.state}/specdev/changes/{change}/ticket/03-deliver-asset-identity-watchlist-and-research-pool.md</Path>` | AssetRef/列表 | deep/high | T-02 | W3/G1 | implementation-owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>` |
| T-04 | `<Path>{roots.state}/specdev/changes/{change}/ticket/04-deliver-quotes-kline-and-live-refresh.md</Path>` | quotes/K-line/live | deep/critical | T-03 | W4/G2 | implementation-owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>` |
| T-05 | `<Path>{roots.state}/specdev/changes/{change}/ticket/05-deliver-financials-filings-news-and-evidence.md</Path>` | dossier/EvidenceRef | deep/high | T-04 | W5/G3 | implementation-owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` |
| T-06 | `<Path>{roots.state}/specdev/changes/{change}/ticket/06-deliver-local-portfolio-ledger-and-private-materials.md</Path>` | portfolio/private | deep/critical | T-05 | W6/G4 | implementation-owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>` |
| T-07 | `<Path>{roots.state}/specdev/changes/{change}/ticket/07-deliver-screening-factors-and-strategy-definitions.md</Path>` | strategy definitions | deep/high | T-05 | W6/G4 | implementation-owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-07.md</Path>` |
| T-08 | `<Path>{roots.state}/specdev/changes/{change}/ticket/08-deliver-rule-aware-backtest-and-results.md</Path>` | backtest/results | deep/critical | T-06,T-07 | W7/G5 | implementation-owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-08.md</Path>` |
| T-09 | `<Path>{roots.state}/specdev/changes/{change}/ticket/09-deliver-monitoring-alerts-and-scheduled-research.md</Path>` | automation | deep/critical | T-08 | W8/G6 | implementation-owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-09.md</Path>` |
| T-10 | `<Path>{roots.state}/specdev/changes/{change}/ticket/10-deliver-agent-research-and-consent-boundary.md</Path>` | Agent/consent | deep/critical | T-06,T-09 | W9/G7 | implementation-owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-10.md</Path>` |
| T-11 | `<Path>{roots.state}/specdev/changes/{change}/ticket/11-deliver-import-export-and-diagnostics.md</Path>` | exchange/diagnostics | deep/high | T-06,T-10 | W10/G8 | implementation-owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-11.md</Path>` |
| T-12 | `<Path>{roots.state}/specdev/changes/{change}/ticket/12-release-integrated-finance-workbench.md</Path>` | integration/release | deep/critical | T-01..T-11 | W11/G9 | release-owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>` |

## 3. Gates and Completion Evidence

### Overall Definition of Done

整体 DoD 只有在所有 Ticket Evidence 完整、所有 AC 覆盖、所有 Gate 关闭、项目和插件验证通过、无未批准偏差、无高风险未处置项且 change 状态与源码一致时成立。最后的关闭 owner 是最后一个计划内 Implement；本普通计划不提前关闭 change，也不执行远程发布。

### Gates

| Gate | 开启条件 | 关闭证据 | 阻塞范围 | Owner/批准人 | 失败恢复 |
|---|---|---|---|---|---|
| G0 基线与插件盒 | 用户已批准进入实现；HEAD/SDK/preflight 可复现；finance 目录未被占用 | T-01 前置基线记录、creator preflight、路径扫描 | 全部 | implementation-owner / 用户范围批准 | 停止，重新读取 change 状态；若宿主接缝漂移，回到 Ticket/Spec |
| G1 共享契约与数据可信 | T-01 ready Evidence；T-02 provider fixtures 可运行 | manifest/domain schema、AC-001～004/032、provider probe/snapshot/错误 fixtures | T-02～T-04 | implementation-owner | 保留旧 fixture/contract，隔离未知 provider，不扩宿主 |
| G2 行情闭环 | T-02/T-03 Evidence；A/HK identity/calendar fixture 通过 | T-04 live/stale/单位/闭市/隐藏页恢复 Evidence | T-05～T-12 | implementation-owner | 关闭 live，仅保留手动/最后可信 snapshot，修复后重开 |
| G3 研究底稿与私有输入 | T-05 Evidence；EvidenceRef/PIT/ResourceIO 接缝稳定 | T-05 dossier 与 T-06 privacy/import preflight | T-06、T-07 及后续 | implementation-owner | 隔离失效引用/私有索引，禁止 Agent/回测读取 |
| G4 个人账本与策略汇合 | T-06、T-07 Evidence；ledger/StrategyDefinition version stable | P&L/import 和 AST/strategy contract 回归 | T-08～T-12 | implementation-owner | 只读旧 ledger/definitions，回到失败票据，不重算历史 |
| G5 Quant quality | T-08 gate fixture、成本/规则/PIT 门通过 | 回测 normal/negative/bias/cancel/checkpoint Evidence | T-09～T-12 | implementation-owner / 质量批准 | blocked/failed 保留，不输出可信结果；回到 T-08 |
| G6 Automation readiness | T-09 TaskRegistry readiness、cancel/recovery fixture 通过 | monitor stale/cooldown/任务状态/重启审计 Evidence | T-10～T-12 | implementation-owner | 禁止新 schedule/notification，保留 checkpoint/recoverable |
| G7 Agent security | T-10 public/private/egress/forbidden intent tests 通过 | field preview/ConsentRecord/budget/EvidenceRef/no-trade static+runtime Evidence | T-11/T-12 | implementation-owner / 用户隐私批准 | 默认关闭 Agent，撤销外发/任务/写入权限，保留审计 |
| G8 Exchange/diagnostics | T-06/T-10 Evidence；ResourceIO/SessionFile 可用 | import preview/commit、export redaction、requestId/runId diagnostics Evidence | T-12 | implementation-owner | 禁止导出/写入，保留本地数据和诊断 |
| G9 Release/removal | T-01～T-11 全部 done 且无 uncovered AC | build/typecheck/lint/定向测试/E2E/plugin.dev/删除插件 smoke、整合 Evidence | change completion | release-owner / 用户上线批准 | release blocked；回滚插件 dev install 或前向修复，不标 completed |

### Contract and Reference Coverage

| 合同或参考要求 | 覆盖 Ticket | 验证接缝 | Evidence | 状态 |
|---|---|---|---|---|
| `AC-001`～`AC-004`、`AC-032` 插件盒/能力/兼容 | T-01、T-12 | manifest/schema/path/removal | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>`、`<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>` | covered |
| `AC-005`～`AC-010` A/HK 身份/行情/研究 | T-02～T-05 | provider/identity/quote/dossier fixtures | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>`～`<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` | covered |
| `AC-011`～`AC-015` 账本/私有资料/交换 | T-06、T-11 | ResourceIO/import/privacy/export | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>`、`<Path>{roots.state}/specdev/changes/{change}/evidence/T-11.md</Path>` | covered |
| `AC-016`～`AC-020` 策略/回测/金融正确性 | T-07、T-08 | AST/gate/bias/cost/checkpoint | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-07.md</Path>`、`<Path>{roots.state}/specdev/changes/{change}/evidence/T-08.md</Path>` | covered |
| `AC-021`～`AC-024` 监控/自动化 | T-09 | TaskRegistry/fault/recovery | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-09.md</Path>` | covered |
| `AC-025`～`AC-029` Agent/授权/无交易 | T-10、T-11、T-12 | allowlist/egress/redaction/no-trade scan | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-10.md</Path>`～`<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>` | covered |
| `AC-030`～`AC-033` 错误/体验/诊断 | T-01、T-11、T-12 | error contract/UI/diagnostics/build | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>`、`<Path>{roots.state}/specdev/changes/{change}/evidence/T-11.md</Path>`、`<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>` | covered |
| TickFlow fixed commit `ecfddb451e97f6fc9a7e43ac33e4ef0e69933b33` | T-04、T-08、T-09 | session/rules/cost/monitor fixtures | 对应 Ticket Evidence | covered |
| Vibe Research fixed commit `d8c80d4ac60e43c1f096c0c486355b19800f16d7` | T-04、T-05、T-06、T-10 | A/HK asymmetry/local portfolio/evidence/agent fixtures | 对应 Ticket Evidence | covered |
| a-stock-data fixed commit `3a3149dedbe30cda58b5c94387039d7e707cedcd` | T-02、T-03、T-04 | old code/TCP/K-line/unit/rate fixtures | 对应 Ticket Evidence | covered |
| TradingAgents fixed commit `0badc3340c70fa0eb16e8cb527c5c32efacc7966` | T-05、T-08、T-09、T-10 | curr_date/phases/checkpoint/evidence fixtures | 对应 Ticket Evidence | covered |

## 4. Execution and Integration Protocol

### Ticket Execution Order

| Ticket | 开始条件 | 执行 owner | 必跑验证 | Evidence | 集成条件 |
|---|---|---|---|---|---|
| T-01 | G0 关闭、插件目录空闲、preflight 通过 | implementation-owner | manifest/surface/domain/path scan | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>` | G1 开启前共享契约冻结 |
| T-02 | T-01 Evidence；network capability 接缝可用 | implementation-owner | provider fixture/data contract/failure | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` | G1 关闭，未知 provider 隔离 |
| T-03 | T-02 Evidence | implementation-owner | identity migration/list E2E | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>` | confirmed AssetRef 可消费 |
| T-04 | T-03 Evidence | implementation-owner | A/HK clock/live/stale E2E | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>` | G2 关闭，行情 view model 稳定 |
| T-05 | T-04 Evidence | implementation-owner | dossier/PIT/EvidenceRef/ResourceIO | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` | G3 关闭，研究证据可消费 |
| T-06 | T-05 Evidence | implementation-owner | import/ledger/P&L/privacy | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>` | ledger/private refs stable |
| T-07 | T-05 Evidence | implementation-owner | AST/definition/field quality | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-07.md</Path>` | StrategyDefinition stable |
| T-08 | T-06、T-07 Evidence | implementation-owner | gates/bias/cost/cancel/recovery | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-08.md</Path>` | G5 关闭，结果不可变 |
| T-09 | T-08 Evidence | implementation-owner | TaskRegistry/stale/cooldown/restart | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-09.md</Path>` | G6 关闭，不创建未授权任务 |
| T-10 | T-06、T-09 Evidence | implementation-owner | Agent allowlist/consent/egress/no-trade | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-10.md</Path>` | G7 关闭，Agent 默认安全 |
| T-11 | T-06、T-10 Evidence | implementation-owner | import/export/redaction/diagnostics | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-11.md</Path>` | G8 关闭，交换可审计 |
| T-12 | T-01～T-11 Evidence、G8 关闭 | release-owner | full test/typecheck/lint/build/E2E/dev loop/removal | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-12.md</Path>` | G9 关闭，按 change-completion 转换 |

每张 Ticket 完成后，执行者必须先写对应 Evidence，再将 Ticket frontmatter 标为 `done`，同步 Tickets Map/Goal Plan/status，并运行适用的阶段校验。Evidence 不完整、关键命令未运行、路径越界或偏差未批准时，Ticket 保持 `review`/`blocked`。

### Authorization Matrix

| 动作 | 状态 | 目标与条件 |
|---|---|---|
| Local changes | allowed | 本 Goal Plan 工件和未来实现仅限 `<Path>plugins/finance-workbench/</Path>`；不得覆盖无关工作区改动 |
| Commit | not-authorized | 当前用户请求未包含提交；保留本地变更并在 Evidence 记录工作区状态 |
| Push / PR / Merge | not-authorized | 需要用户逐动作明确授权 |
| Deploy / Migration | not-authorized | 不操作真实用户数据、生产配置、远程发布或 marketplace；插件私有 migration 只在测试 fixture/隔离环境执行 |
| Production configuration / feature / real user data | not-authorized | provider secret、真实账户、外发模型、长期任务和真实文件写入必须在产品运行时逐次确认，不由计划预授权 |

### Evidence Return and Integration

每个实现者按对应 Ticket 和 `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>` 执行，写入 `<Path>{roots.state}/specdev/changes/{change}/evidence/{ticket-id}.md</Path>`，同步 Ticket、Map、Goal Plan 和 change 状态。遇到跨票契约变化，立即暂停依赖 Wave，记录 deviation，重新打开拥有该契约的 Ticket/Gate；不得在 T-12 以整合冲突为由静默改 Spec。

## 5. Constraints, Risk and Recovery

### Non-negotiable Constraints

- **插件物理边界（ADR-003/用户决定）：** 生产实现、测试和资源只能写 `<Path>plugins/finance-workbench/</Path>`；违反即停止并返回 system change，不允许改 core/server/shared/其他插件。
- **全模块首版（ADR-001）：** 模块入口不可删除；provider/dataset 能力单独标记 supported/partial/experimental/unavailable/blocked；失败不伪装可信结论。
- **金融正确性（Spec DEC-004/DEC-005）：** AssetRef、PIT、日历、复权、单位、费用、滑点、容量、stale 和 Evidence 缺一即 fail closed 或降级；模型不能改变 gate。
- **私有资料（ADR-002/Spec DEC-006）：** ResourceIO 管原文件，插件 dataDir 管派生索引；secret、私有正文和绝对路径不得进 frontend/log/provider/model/export。
- **授权与无交易（ADR-002/Spec DEC-008）：** AI 默认关闭；私有读取、外发、长期任务、通知和用户文件写入逐次确认；交易/仓位/券商/资金/订单工具永远禁止。
- **任务恢复（Spec DEC-007）：** TaskRegistry 是唯一调度 authority；cancel request 不冒充 cancelled；恢复重新 probe/授权并使用 checkpoint。
- **SDK 约束（hana-plugin-creator/SDK）：** iframe 通过 `hana.api.fetch` 调本插件 route，外部 HTTP 走 `ctx.network.fetch`，用户文件走 `ctx.resources`，生成文件走 SessionFile；不创建自定义静态资源 route。

### Verification Integrity

- 基线命令、退出状态、测试数量和 commit 记录在每个 Evidence；不能仅写“通过”。
- 定向测试之外必须在 G1/G5/G7/G9 做受控反向验证：空 200/旧代码/单位冲突、look-ahead、stale 告警、未授权 egress、交易意图、路径越界和删除插件启动。
- 禁止跳过测试、弱化断言、吞错、把 baseline 失败标为新功能通过、用截图代替数据契约、用 mock 成功代替 provider/license 证据。
- 每个 Gate 的关闭只接受实际代码/命令/Evidence/批准；未运行的测试标为未验证并阻塞 Gate。

### Migration or Release Sequence

1. **Expand：** T-01 建立版本化 manifest/domain/error/store 接缝，保持宿主和其他插件不变。
2. **Migrate：** T-02～T-11 按 DAG 接入 provider、AssetRef、snapshot、dossier、ledger、strategy、backtest、TaskRegistry、Agent、exchange；每票只写自己的插件子路径，前序 Evidence 稳定后才开放下游。
3. **Observe：** 各 Gate 检查旧 raw provider 调用、裸 AssetRef、绝对路径、secret/private egress、交易意图、第二 timer、未确认 write、schema/缓存旧版本使用量为零或已隔离。
4. **Contract：** T-12 只在扫描证明旧接缝为零、全 AC 覆盖和回归通过后收缩旧 fixture/兼容分支，并冻结插件 release schema。
5. **Release：** T-12 在隔离环境执行 plugin.dev install/reload/diagnostics/scenario、桌面/窄屏 E2E、构建和整块删除 smoke；未授权远程发布不执行。

### Risks, Monitoring and Recovery

| 风险 | 触发信号/事故半径 | 预防与检测 | 恢复动作 | Owner/批准点 |
|---|---|---|---|---|
| provider 误报可信 | 空 200、schema/unit/PIT/许可探测失败；污染行情/回测/P&L | T-02 fixtures、quality gate、stale/provider diagnostics | 隔离源、回到最后可信 snapshot/import，重开 G1/G2 | implementation-owner / 数据质量批准 |
| AssetRef 错配 | 旧代码/同名/market conflict；污染全部下游 | T-03 显式确认、mapping evidence、下游 confirmed-only scan | 冻结下游请求，修 mapping，重建派生索引 | implementation-owner / 资产语义批准 |
| P&L/回测错误 | PIT/look-ahead/日历/复权/成本 fixture 失败；金融结论风险 | T-06/T-08 deterministic fixtures、反向验证、不可变输入 | 标 partial/blocked，保留旧账本/结果，重开 G4/G5 | implementation-owner / 金融质量批准 |
| 私有数据外发 | egress 字段超出 ConsentRecord、secret/redaction 失败 | T-06/T-10/T-11 field preview、静态/运行时 scan | 默认关闭 Agent，撤销 consent，删除外发队列，保留审计，重开 G7/G8 | implementation-owner / 用户隐私批准 |
| 任务副作用/恢复错 | stale 触发、重复 handoff、cancel 假成功、恢复重跑 | T-09 TaskRegistry fault/restart/idempotency | 禁止新任务/通知，标 recoverable，使用 checkpoint 前向恢复，重开 G6 | implementation-owner / 自动化批准 |
| SDK/宿主缺口 | plugin route/resource/task/session capability 不可用 | G0 preflight、SDK contract test、诊断 | 停止当前票，按 deviation 另开 system change，不改宿主 | implementation-owner / 用户范围批准 |
| 路径越界/卸载失败 | diff 出现 core/server/shared/其他插件或删目录宿主不启动 | 每票 path audit、T-12 removal smoke | 丢弃越界实现，回到 owner Ticket；release blocked | release-owner / 发布批准 |
| UI/性能不可用 | 窄屏重叠、隐藏状态、长查询阻塞 | T-01/T-04/T-06/T-08/T-09/T-10/T-11/T-12 E2E/a11y | 保留确定性 route，标模块 partial，修插件内 UI 后重开对应 Gate | release-owner / 体验批准 |

### Deviation Control

任何需要改变 Spec 外部行为、AC、ADR、插件目录、shared owner、宿主 API、数据质量门、Agent 授权或交易禁令的发现都立即暂停受影响 Wave，记录在 `<Path>{roots.state}/specdev/changes/{change}/.status.json</Path>` 的 deviations，并返回相应上游 Work；未经批准不得继续实现。仅字段命名、fixture 内容或沿用 SDK 惯例的低影响调整可在 Ticket 内记录并重跑校验。

## 6. Progress and Decisions

### Current Status

初始计划状态：

```text
WAVE_STATUS wave=W0 ready=T-01 active=none done=none blocked=none
GATE_STATUS gate=G0 state=open evidence=baseline/preflight pending risks=workspace dirty but finance path free
TICKET_STATUS id=T-01..T-12 state=ready evidence=pending deviation=none
```

Gate 只在对应 Ticket Evidence、实际命令结果和适用人工批准齐全后关闭；不使用主观百分比。

### Pending Decisions and Blockers

当前没有高影响未决产品决策或 blocker。待实现时可发现的低影响事项仅包括 provider 最终启用组合、具体合法 host、数据容量和 UI 文案/布局；这些必须以 capability/fixture/诊断状态验证，不得扩大范围。

### Resume Protocol

恢复时先读取 `<Path>{roots.state}/specdev/changes/{change}/goal-plan.md</Path>`、当前 Ticket frontmatter、最新 `<Path>{roots.state}/specdev/changes/{change}/evidence/{ticket-id}.md</Path>`、`<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>` 和 change status；从最后一个已关闭 Gate 继续。若发现 path、schema、provider、宿主接缝或授权漂移，暂停并按 Deviation Control 返回上游，不重复已确认决定。

### Reporting Format

每次进度回报使用：

```text
WAVE_STATUS wave=<n> ready=<ids> active=<ids> done=<ids> blocked=<ids>
GATE_STATUS gate=<name> state=open|closed evidence=<paths> risks=<summary>
TICKET_STATUS id=<id> state=<state> evidence=<path> deviation=<none|id>
BLOCKER id=<id> owner=<owner> needed=<decision-or-input> impact=<scope>
DECISION id=<id> owner=<owner> status=pending|approved|rejected impact=<scope>
```

## Assumptions

- `plugins/finance-workbench/` 在每次 Ticket 启动时仍为空闲或只包含本 change 已授权内容；以路径扫描验证。
- 现有 hana-plugin-creator、SDK、Node/Python 环境和项目脚本保持可执行；每个 Gate 重跑最小 preflight。
- provider 的实际 A/HK 覆盖、许可、容量和实时性不预先假设为 supported；由 T-02 capability probe 和后续 Evidence 决定。
- 单工作区顺序执行优先于形式并行；T-06/T-07 只有在路径隔离、基线和验证资源足够时才可并行，结果仍必须分别 Evidence。

以上假设均低影响、可逆且不改变 Spec 外部行为、插件边界、金融质量门、隐私授权或交易禁令。
