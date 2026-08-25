---
schema_version: 3
artifact: tickets-map
change: 2026-08-13-personal-quant-finance-workbench
status: completed
---

# Tickets Map: 内置 A/HK 个人量化金融工作台

- **Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **Ticket 目录：** `<Path>{roots.state}/specdev/changes/{change}/ticket/</Path>`
- **Evidence 目录：** `<Path>{roots.state}/specdev/changes/{change}/evidence/</Path>`
- **Goal Plan：** `<Path>{roots.state}/specdev/changes/{change}/goal-plan.md</Path>`

## 1. 目标与拆分策略

本 Map 把 Spec 的 `US-001`～`US-021` 和 `AC-001`～`AC-038` 拆为 12 张纵向 Ticket，共同交付只能位于 `<Path>plugins/finance-workbench/</Path>` 的内置 A/HK 个人量化金融工作台。拆分从插件启动和共享领域契约开始，经 BYOK/provider 探测、逐数据集选源、可信快照、资产/行情、研究底稿、个人账本、量化、运行来源冻结、自动化和 Agent，最后汇合导入导出、诊断与发布。每张票都交付用户可观察行为或解除真实阻塞的安全接缝，不按宿主技术层水平拆分。

T-01 是 manifest/domain/source schema 共享 owner；T-02 是 provider/SourceDecision/DataSnapshot 质量 owner；T-12 是最终插件根集成/release owner。`hithink-market-dump` 的跨平台事实不增加水平实现票：T-02 交付 source contract 与 blocked/supported 门，P-prototype 独立回答三平台事实，结果只改变能力状态。为避免可写路径冲突，所有票据按真实数据/接口依赖串行；T-08 和 T-10 的双前置表示回测/Agent 分别需要策略+账本及任务+私有资料先完成。没有 prefactor 票：当前 SDK 和插件边界已足以开始实现，若出现 SDK 缺口必须另开 system change。

## 2. 执行清单

| ID | Ticket | 可观察产出 | Blocked By | Depth | Risk | Ready | Owner | Contract IDs | Wave/Gate | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| T-01 | `<Path>{roots.state}/specdev/changes/{change}/ticket/01-establish-finance-plugin-shell-and-domain-contract.md</Path>` | 插件盒、总览矩阵、共享领域/来源/错误契约 | — | deep | high | yes | root | AC-001～004、032、034～037 | W1 / G0-G1 根契约 | done |
| T-02 | `<Path>{roots.state}/specdev/changes/{change}/ticket/02-deliver-provider-capability-and-data-snapshot.md</Path>` | BYOK、多源探测/路由、可信 snapshot、本地源门 | T-01 | deep | critical | yes | root | AC-004、006、008、030、034、035、037 | W2 / G1 数据质量 | done |
| T-03 | `<Path>{roots.state}/specdev/changes/{change}/ticket/03-deliver-asset-identity-watchlist-and-research-pool.md</Path>` | A/HK AssetRef、自选、研究池 | T-02 | deep | high | yes | root | AC-005、010 | W3 / G1 资产 | done |
| T-04 | `<Path>{roots.state}/specdev/changes/{change}/ticket/04-deliver-quotes-kline-and-live-refresh.md</Path>` | 行情/K 线、市场时段 live、stale/选源 | T-03 | deep | critical | yes | root | AC-007、008、035 | W4 / G2 行情 | done |
| T-05 | `<Path>{roots.state}/specdev/changes/{change}/ticket/05-deliver-financials-filings-news-and-evidence.md</Path>` | 财务/估值/公告/研报/新闻 dossier | T-04 | deep | high | yes | root | AC-009 | W5 / G2 研究底稿 | done |
| T-06 | `<Path>{roots.state}/specdev/changes/{change}/ticket/06-deliver-local-portfolio-ledger-and-private-materials.md</Path>` | 本地账本、成本/P&L、私有资料 | T-05 | deep | critical | yes | root | AC-011～015 | W6 / G3 个人数据 | done |
| T-07 | `<Path>{roots.state}/specdev/changes/{change}/ticket/07-deliver-screening-factors-and-strategy-definitions.md</Path>` | 声明式筛选、因子和策略版本 | T-05 | deep | high | yes | root | AC-016 | W6 / G3 量化定义 | done |
| T-08 | `<Path>{roots.state}/specdev/changes/{change}/ticket/08-deliver-rule-aware-backtest-and-results.md</Path>` | A/HK 规则感知、来源冻结回测和结果解释 | T-07、T-06 | deep | critical | yes | root | AC-017～020、036 | W7 / G4 回测质量 | done |
| T-09 | `<Path>{roots.state}/specdev/changes/{change}/ticket/09-deliver-monitoring-alerts-and-scheduled-research.md</Path>` | 监控选源、RunSourceManifest、任务暂停恢复 | T-08 | deep | critical | yes | root | AC-021～024、035、036 | W8 / G5 自动化 | done |
| T-10 | `<Path>{roots.state}/specdev/changes/{change}/ticket/10-deliver-agent-research-and-consent-boundary.md</Path>` | Agent 研究、字段确认、预算和禁交易 | T-09、T-06 | deep | critical | yes | root | AC-025～029 | W9 / G6 Agent 安全 | done |
| T-11 | `<Path>{roots.state}/specdev/changes/{change}/ticket/11-deliver-import-export-and-diagnostics.md</Path>` | 导入导出、来源清单、选源/本地同步诊断审计 | T-10、T-06 | deep | high | yes | root | AC-014、015、030、033、038 | W10 / G7 交换诊断 | done |
| T-12 | `<Path>{roots.state}/specdev/changes/{change}/ticket/12-release-integrated-finance-workbench.md</Path>` | 全模块集成、dev loop、E2E、可卸载发布门 | T-01～T-11 | deep | critical | yes | root | AC-001～038 | W11 / G8 发布 | done |

Ticket frontmatter 是状态、依赖、深度和路径访问契约的权威；本表是同步投影，不得独立修改出另一套真相。W1～W11 是真实依赖下的候选 Wave；正式跨票编排由 Goal Plan 决定。

## 3. 依赖 DAG

```text
T-01 [READY: plugin shell/domain owner]
  -> T-02 [READY: provider capability/DataSnapshot]
      -> T-03 [READY: AssetRef/watchlist]
          -> T-04 [READY: quotes/K-line/live]
              -> T-05 [READY: financial dossier/EvidenceRef]
                  -> T-06 [READY: local portfolio/private refs]
                  -> T-07 [READY: screener/factor/strategy]
T-06 + T-07 -> T-08 [READY: rule-aware backtest]
T-08 -> T-09 [READY: monitor/TaskRegistry automation]
T-06 + T-09 -> T-10 [READY: Agent/consent/no-trade]
T-06 + T-10 -> T-11 [READY: exchange/diagnostics]
T-01..T-11 -> T-12 [READY: integration/release]
```

每条边都是真实开始条件：后续票据需要前序版本化数据/任务/授权接缝；没有为人员交接或“更方便”添加边。DAG 无环，T-12 是唯一收缩点。

## 4. 合同覆盖矩阵

| Contract ID | 覆盖 Ticket | 验证接缝 | 状态 | 说明 |
|---|---|---|---|---|
| AC-001 | T-01、T-12 | plugin manifest/dev loop/host smoke | covered | 发现、启停、安装和发布 |
| AC-002 | T-01、T-12 | path allowlist/static scan | covered | 唯一插件目录 |
| AC-003 | T-01、T-12 | capability matrix/UI | covered | A/HK 全模块入口 |
| AC-004 | T-01、T-02 | capability probe/fixture | covered | provider 证据门 |
| AC-005 | T-03 | identity integration | covered | AssetRef/旧代码/冲突 |
| AC-006 | T-02、T-04 | DataSnapshot/quote integration | covered | snapshot provenance |
| AC-007 | T-04 | quote/K-line E2E | covered | 时段、单位、stale |
| AC-008 | T-02、T-04 | fault injection | covered | provider failure/fallback |
| AC-009 | T-05 | dossier/EvidenceRef | covered | 研究底稿与 PIT |
| AC-010 | T-03 | watchlist/research-pool E2E | covered | 列表工作流 |
| AC-011 | T-06、T-11 | import preview/ledger | covered | 账本导入 |
| AC-012 | T-06、T-08 | P&L/backtest fixture | covered | 成本、估值和状态 |
| AC-013 | T-06 | ResourceIO/private index | covered | 私有资料引用 |
| AC-014 | T-06、T-11 | exchange/SessionFile | covered | 导入导出元数据 |
| AC-015 | T-06、T-10、T-11 | privacy/redaction | covered | 不泄露私有数据 |
| AC-016 | T-07 | AST/strategy validator | covered | 声明式定义 |
| AC-017 | T-08 | quality gate | covered | 回测前置门 |
| AC-018 | T-08 | result provenance | covered | 结果 manifest |
| AC-019 | T-08 | metrics/result UI | covered | 风险、成本、容量、免责声明 |
| AC-020 | T-08 | bias fixture | covered | look-ahead 等偏差 |
| AC-021 | T-09 | monitor confirmation | covered | 规则与通知确认 |
| AC-022 | T-09 | stale monitor fixture | covered | stale 不误触发 |
| AC-023 | T-09 | TaskRegistry harness | covered | 状态、取消、恢复 |
| AC-024 | T-09 | pause/restart/recovery | covered | 非永久后台 |
| AC-025 | T-10 | AI-off deterministic path | covered | 默认关闭 |
| AC-026 | T-10 | Agent/EvidenceRef | covered | 公开只读研究 |
| AC-027 | T-10 | ConsentRecord/egress | covered | 字段级外发 |
| AC-028 | T-10、T-12 | tool catalog/static scan | covered | 永久无交易工具 |
| AC-029 | T-10、T-11、T-12 | secret/audit/redaction | covered | 安全审计 |
| AC-030 | T-02、T-09、T-11 | structured error diagnostics | covered | 错误可恢复 |
| AC-031 | T-01、T-04、T-06、T-08、T-09、T-10、T-11、T-12 | desktop/narrow/a11y E2E | covered | UI 质量 |
| AC-032 | T-01、T-12 | schema/build/removal | covered | 版本/兼容/可卸载 |
| AC-033 | T-11、T-12 | diagnostics query | covered | requestId/runId 审计 |
| AC-034 | T-01、T-02、T-12 | sensitive config + hithink adapter/probe + release E2E | covered | BYOK、A 股适用范围与逐数据集授权 |
| AC-035 | T-01、T-02、T-04、T-09、T-12 | source schema/router + quote/monitor E2E | covered | auto/pinned、等价 fallback 与 SourceDecision |
| AC-036 | T-01、T-08、T-09、T-12 | run schema + backtest/task recovery fixture | covered | RunSourceManifest 冻结、恢复与重放 |
| AC-037 | T-01、T-02、T-12 | source capability gate + static/runtime scan | covered | Market Dumps 原型门和禁 Python/CLI |
| AC-038 | T-11、T-12 | diagnostics/export/redaction E2E | covered | 来源决策、运行清单与本地同步诊断 |

无 `uncovered` 或 `deferred` 合同。

## 5. 并行与路径所有权

- 最大并发来自 `<Path>{roots.state}/specdev/config.json</Path>`；本 change 的真实数据和公共契约依赖决定串行主 DAG，不以并发上限强行并行。
- T-01 唯一拥有 `<Path>plugins/finance-workbench/manifest.json</Path>` 与 `<Path>plugins/finance-workbench/src/domain/**</Path>`；其他票据只读。
- T-12 在所有前序完成后唯一拥有 `<Path>plugins/finance-workbench/**</Path>` 做整合和发布修复；前序票据不与其并行。
- T-02～T-11 使用彼此不相交的插件子路径；部分票据在 DAG 上可作为未来候选并行，但当前 ready 投影按依赖串行执行，避免共享 UI/fixture 冲突。

| Ticket A | Ticket B | Writable 交集 | 真实依赖 | 处理 |
|---|---|---|---|---|
| T-01 | T-02～T-11 | 共享 domain/manifest | 是 | T-01 owner，后续只读 |
| T-06 | T-07 | 无 | 否（均依赖 T-05） | 可作为候选并行，但共享总览 UI 由 T-12 汇合 |
| T-08 | T-09 | 无 | 是 | T-09 等待回测任务接缝 |
| T-10 | T-11 | 无 | 是（T-11 需要 consent/audit） | 串行 |
| T-01～T-11 | T-12 | 插件根 | 是 | T-12 唯一集成 owner |

## 6. Gate、Wave 与集成点

- **G0 基线/插件盒：** T-01，确认 creator preflight、manifest、SDK 和路径 allowlist。
- **G1 数据可信：** T-02～T-04，确认 `hithink-rest` BYOK、provider capability、SourcePolicy/SourceDecision、AssetRef、行情/stale 语义；`hithink-market-dump` 支持等级提升前必须先运行 `<Path>{roots.workflows}/specdev/P-prototype/P-prototype.md</Path>` 并取得三平台门证据。
- **G2 研究/个人数据：** T-05～T-06，确认 EvidenceRef、账本、P&L 和 ResourceIO 隐私。
- **G3 量化质量：** T-07～T-08，确认策略 validator、RunSourceManifest、回测 gate、偏差和成本。
- **G4 自动化安全：** T-09～T-10，确认监控 SourceDecision、定时运行来源冻结、TaskRegistry 状态、consent、Agent/no-trade。
- **G5 交换/诊断：** T-11，确认导入导出、来源清单、候选排除/本地同步、脱敏审计和恢复建议。
- **G6 发布：** T-12，确认 build、dev loop、UI、a11y、路径、无插件宿主和整块删除。

v6 Goal Plan 已采用 `ticket_workspace_policy: current`，T-01～T-12 全部使用 `E2E disposition: required`。implementation owner 在 current workspace 运行非 E2E 检查并形成 commit，Lead 在同一 current/direct-parent 状态运行集成与 E2E；每张 Ticket 验证通过后才串行推进下一张。

## 7. 横切契约与风险

- **唯一实现边界：** 产品、测试、fixture 和资源只写 `<Path>plugins/finance-workbench/</Path>`；SpecDev 工件不属于产品代码。
- **数据正确性与来源：** AssetRef、DataSnapshot、SourcePolicy、SourceDecision、RunSourceManifest、EvidenceRef、PIT、单位、复权、日历、费用、容量和 stale 状态不得被跳过、伪造 lineage 或静默替换；`pinned` 不换源，run 内不换源。
- **同花顺边界：** `hithink-rest` 仅 BYOK 且逐 A 股 dataset 探测；Key 不进入前端/日志/快照/导出/fixture。`hithink-market-dump` 原型前不超过 experimental/blocked，不复制或启动 Python/CLI，不修改宿主补洞。
- **隐私/副作用：** ResourceIO 管原始文件，ctx.dataDir 管派生数据；模型外发、私有读取、长期任务、通知和写用户文件逐次确认；交易工具永久不存在。
- **任务/恢复：** TaskRegistry 是唯一调度 authority；取消请求不冒充强取消；恢复重新 probe 和授权，保存 checkpoint。
- **兼容/发布：** 私有 schema versioned；未知版本隔离；provider/缓存/导入失败 fail closed；宿主和其他插件不依赖金融插件。
- **路径越界处理：** 任意票据发现需要修改宿主/shared/其他插件时停止并按 deviation control 另开 system change，不先改后报。

## 8. 同步规则

- Ticket frontmatter 是状态、依赖、深度和路径合同的权威；Map 仅投影。
- 每张完成票必须生成 `<Path>{roots.state}/specdev/changes/{change}/evidence/{ticket-id}.md</Path>`，未运行关键验证或有未批准偏差不得标 `done`。
- 依赖、合同覆盖、路径 owner 或状态变化后运行 `<Path>{roots.workflows}/specdev/common/tools/validate-specdev.mjs</Path>`。
- 若 Goal Plan 生成，Wave/Gate/owner/恢复以 `<Path>{roots.state}/specdev/changes/{change}/goal-plan.md</Path>` 为编排权威并回投 Map。
- 只有用户确认拆分或明确授权自主发布后，才能进入 Goal Plan/Implement；当前 Ticket 规划已 ready，但未代替用户确认执行。
