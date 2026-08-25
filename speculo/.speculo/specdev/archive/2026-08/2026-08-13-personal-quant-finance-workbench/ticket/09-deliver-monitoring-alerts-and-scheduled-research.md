---
schema_version: 3
artifact: ticket
change: 2026-08-13-personal-quant-finance-workbench
id: T-09
title: 交付监控告警与定时研究任务
status: done
planning_depth: deep
planning_depth_reason: 涉及长期任务、暂停恢复、取消确认、stale 触发和通知副作用，必须与 TaskRegistry readiness 和审计边界一致。
ready: true
risk: critical
blocked_by: [T-08]
contract_ids: [AC-021, AC-022, AC-023, AC-024, AC-035, AC-036]
owner: root
expected_changes: ["<Path>plugins/finance-workbench/src/automation/**</Path>", "<Path>plugins/finance-workbench/routes/automation.*</Path>", "<Path>plugins/finance-workbench/tests/automation.integration.test.ts</Path>", "<Path>plugins/finance-workbench/tests/automation.e2e.spec.ts</Path>"]
writable_paths: ["<Path>plugins/finance-workbench/src/automation/**</Path>", "<Path>plugins/finance-workbench/routes/automation.*</Path>", "<Path>plugins/finance-workbench/tests/automation.integration.test.ts</Path>", "<Path>plugins/finance-workbench/tests/automation.e2e.spec.ts</Path>"]
read_only_paths: ["<Path>plugins/finance-workbench/src/domain/**</Path>", "<Path>plugins/finance-workbench/src/data/**</Path>", "<Path>plugins/finance-workbench/src/quotes/**</Path>", "<Path>plugins/finance-workbench/src/quant/backtest/**</Path>", "<Path>plugins/finance-workbench/manifest.json</Path>", "<Path>temp/finance-references/tickflow-stock-panel/**</Path>", "<Path>temp/finance-references/TradingAgents-astock/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-09: 交付监控告警与定时研究任务

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/09-deliver-monitoring-alerts-and-scheduled-research.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-09.md</Path>`

## 1. 战略与来源

- **目标：** 让用户创建带交易时段、刷新、冷却、stale 和 SourcePolicy 语义的监控规则，并运行来源冻结、可暂停/恢复/取消/重试的定时研究任务。
- **可观察产出：** 规则页面显示每次观测的 SourceDecision、时间、质量和决策原因；任务页面显示 RunSourceManifest、完整状态与 checkpoint；长期任务和通知在确认前不创建。
- **来源：** `US-013`、`US-014`、`US-019`、`US-020`、`AC-021`～`AC-024`、`AC-035`、`AC-036`、`ADR-002`、`ADR-005`、`DEC-011`、`INV-01`、`INV-04`。
- **当前事实：** TickFlow 有 baseline/cooldown monitor 思路，TradingAgents 有有限 research phases/checkpoint 经验；宿主 TaskRegistry 是唯一调度权威，UI abort 不等于强取消。
- **Planning Depth 原因：** 后台任务和通知有副作用及恢复风险，需深度状态、监控、回滚和批准点。

## 2. 决策状态

### 已锁定决策

- `MonitorRule` 创建、长期任务、定时研究和通知目标都需要逐次用户确认；交易/资金动作不存在。
- 状态使用 `queued/running/paused/cancel_requested/cancelled/completed/failed/recoverable`；cancelled 只有 worker 确认后成立。
- monitor 的 `auto` 只允许语义等价实时源切换并记录 SourceDecision，`pinned` 不换源；定时 ResearchRun 创建时冻结 RunSourceManifest，恢复不匹配时阻断或新建 run。
- stale 输入不得触发新行情告警；应用退出/睡眠后恢复必须重新 probe 数据和授权，不承诺永久后台。

### 已采用的低影响假设

- 通知先实现 Hana 内部可审计 handoff；不承诺外部渠道送达，`handed_off` 不等于 delivered。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| monitor rule、TaskRegistry plugin_action、schedule、pause/resume/cancel/recovery、告警审计 UI | T-04 quote/stale、T-07 strategy、T-08 ResearchRun、宿主 TaskRegistry | 永久后台、券商告警送达、自动交易、修改宿主 scheduler |

## 4. 要构建什么

用户配置资产/策略条件、阈值、刷新、交易时段、冷却、stale 行为、SourcePolicy 和通知目标，确认后规则进入任务列表。运行中每次观测保存数据证据与 SourceDecision；定时研究冻结 RunSourceManifest。用户可暂停/恢复/请求取消、查看失败和从 checkpoint 重试；来源清单不匹配时不能续跑，通知只在授权和非 stale 观测满足条件时 hand off。

## 5. 实现契约

- **入口或接缝：** automation routes/tools/page、TaskRegistry registration、monitor evaluator、checkpoint store、audit view。
- **输入与输出：** 输入 MonitorRule/ResearchRun schedule、SourcePolicy/RunSourceManifest、confirmation、task action；输出 task state、observation/SourceDecision/evidence、notification handoff 或稳定 permission/stale/source/cancel 错误。
- **公共接口变化：** 插件 action 与 route；使用宿主 TaskRegistry/事件，不改 scheduler core。
- **不变量：** unique rule/task identity、cooldown、stale 不触发、cancel request 不假成功、checkpoint 幂等、通知不重复。
- **状态或数据流：** draft -> confirmed -> queued -> running -> paused/cancel_requested/completed/failed/recoverable；observation -> evaluate -> audit -> optional handoff。
- **错误与失败行为：** scheduler not ready、provider stale、rate limit、permission denied、cancel pending 和 notification failed 可分别观察。
- **兼容要求：** 任务 payload 与 RunSourceManifest 版本化，宿主重启恢复时重新验证 provider/source lineage/consent；旧 payload 或来源不匹配不执行。
- **安全与隐私要求：** 长期任务、私人字段、通知和写入均走 T-10 consent 适配；无交易 side effect。

## 6. 执行路线

1. 为 stale/no-trigger、cooldown、重复 task、cancel race、crash/recovery 和 notification failure 建立 harness。
2. 注册插件 action 和 versioned task payload，建立 readiness/probe gate。
3. 实现 MonitorRule evaluator、checkpoint/idempotency、pause/resume/cancel/retry。
4. 实现规则/任务/观测/审计页面和确认流程，通知只做授权 handoff。
5. 运行 TaskRegistry、行情、回测和隐私回归，记录恢复证据。

## 7. 路径访问契约

- **预计修改点：** `<Path>plugins/finance-workbench/src/automation/**</Path>`、`<Path>plugins/finance-workbench/routes/automation.*</Path>`、`<Path>plugins/finance-workbench/tests/automation.integration.test.ts</Path>`、`<Path>plugins/finance-workbench/tests/automation.e2e.spec.ts</Path>`。
- **可写范围：** 上述插件子路径。
- **只读上下文：** `<Path>plugins/finance-workbench/src/domain/**</Path>`、`<Path>plugins/finance-workbench/src/data/**</Path>`、`<Path>plugins/finance-workbench/src/quotes/**</Path>`、`<Path>plugins/finance-workbench/src/quant/backtest/**</Path>`、`<Path>plugins/finance-workbench/manifest.json</Path>`、`<Path>temp/finance-references/tickflow-stock-panel/**</Path>`、`<Path>temp/finance-references/TradingAgents-astock/**</Path>`。
- **共享路径：** 无。
- **保留或不动：** 宿主 TaskRegistry/scheduler/notification capability，不实现永久 daemon。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | TaskRegistry/monitor integration | 创建确认规则，运行公开数据观察和定时研究 | 状态、cooldown、evidence、handoff 可审计 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-09.md</Path>` |
| 失败路径 | scheduler/fault harness | 注入 stale、限流、非等价/pinned 源失败、run manifest mismatch、睡眠、cancel race、重复恢复、通知失败 | 不触发错误告警、不静默换源、不重复副作用，状态准确可恢复 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-09.md</Path>` |
| 回归 | T-04/T-08/TaskRegistry | 运行行情、回测、任务 contract tests | 任务只消费稳定 snapshot/ResearchRun，宿主无变更 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-09.md</Path>` |
| UI E2E（owner：Lead） | automation page | 桌面/窄屏创建、确认、暂停、取消、恢复、审计 | 状态和动作不重叠，cancel wording 准确 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-09.md</Path>` |

- **Workspace checks（current-workspace）：** implementation owner 在 current workspace 运行 monitor evaluator、TaskRegistry handler、cooldown/stale/cancel/checkpoint fault fixture、类型检查和插件构建，不创建 source worktree。
- **E2E disposition：** required：长期规则、TaskRegistry、通知授权、应用休眠恢复和 UI 状态跨越调度器、worker、外部副作用与浏览器边界，错误会重复告警或误报 stale 数据。
- **E2E owner/environment：** Lead / current-workspace；在 direct-parent 状态创建并确认规则，执行暂停/恢复/取消、睡眠恢复、限流/stale 和通知失败场景，预期状态机准确、cooldown 生效、无重复副作用且审计可追溯。
- **Integration evidence（direct-parent）：** 记录 implementation commit、parent before SHA、TaskRegistry/通知测试环境、E2E 状态轨迹、父分支 result SHA 及包含关系。

## 9. 发布、迁移与恢复

- **迁移顺序：** 先 task payload/readiness，再 evaluator/worker handler，最后 UI/通知 handoff。
- **兼容窗口：** 旧 payload 只读标 recoverable/blocked；不得在升级时偷偷启动任务。
- **监控信号：** task state transition、checkpoint、cancel latency、stale suppressions、cooldown hits、handoff result 和 recovery failures。
- **回滚或前向恢复：** 禁用插件 action 后不再接新任务；已运行任务进入 recoverable/failed 并保留 checkpoint；恢复重新授权。
- **不可逆操作与批准点：** 建立长期任务/通知是用户确认点；无交易批准。
- **收缩条件：** 没有绕过 TaskRegistry 的 timer/daemon，静态扫描和宿主诊断证明。

## 10. 验收标准

- [x] `AC-021`～`AC-024`、`AC-035`、`AC-036`：监控选源、告警、运行来源冻结、任务状态、取消/恢复和 stale 语义成立。
- [x] 验证矩阵记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-09.md</Path>`。
