---
schema_version: 3
artifact: ticket
change: 2026-08-13-personal-quant-finance-workbench
id: T-08
title: 交付规则感知回测与研究结果解释
status: ready
planning_depth: deep
planning_depth_reason: 涉及资金/金融数据完整性、PIT、A/HK 交易规则、费用滑点容量、不可逆错误结论和长任务恢复。
ready: true
risk: critical
blocked_by: [T-07, T-06]
contract_ids: [AC-017, AC-018, AC-019, AC-020]
owner: implementation-owner
expected_changes: ["<Path>plugins/finance-workbench/src/quant/backtest/**</Path>", "<Path>plugins/finance-workbench/routes/backtest.*</Path>", "<Path>plugins/finance-workbench/tests/backtest.integration.test.ts</Path>", "<Path>plugins/finance-workbench/tests/backtest.fixtures/**</Path>"]
writable_paths: ["<Path>plugins/finance-workbench/src/quant/backtest/**</Path>", "<Path>plugins/finance-workbench/routes/backtest.*</Path>", "<Path>plugins/finance-workbench/tests/backtest.integration.test.ts</Path>", "<Path>plugins/finance-workbench/tests/backtest.fixtures/**</Path>"]
read_only_paths: ["<Path>plugins/finance-workbench/src/domain/**</Path>", "<Path>plugins/finance-workbench/src/data/**</Path>", "<Path>plugins/finance-workbench/src/assets/**</Path>", "<Path>plugins/finance-workbench/src/quotes/**</Path>", "<Path>plugins/finance-workbench/src/quant/strategy/**</Path>", "<Path>plugins/finance-workbench/src/portfolio/**</Path>", "<Path>temp/finance-references/tickflow-stock-panel/**</Path>", "<Path>temp/finance-references/TradingAgents-astock/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-08: 交付规则感知回测与研究结果解释

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/08-deliver-rule-aware-backtest-and-results.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-08.md</Path>`

## 1. 战略与来源

- **目标：** 在 T-07 策略定义和 T-02 数据快照上交付 A/HK 规则感知、可解释、可恢复的回测。
- **可观察产出：** 用户在执行前看到交易日历、T+1/涨跌停、PIT、复权、费用、滑点、流动性和容量门；结果包含收益/风险/成本/样本覆盖与研究免责声明。
- **来源：** `US-011`、`US-012`、`AC-017`～`AC-020`、`INV-01`、`INV-06`。
- **当前事实：** TickFlow 有 rule-aware price limit/T+1、fees/slippage 经验；单一 universal rule contract 不存在，需按 market dataset 保存假设。
- **Planning Depth 原因：** 回测是高事故金融计算和长任务，必须有前置批准、checkpoint、回滚/隔离和偏差检测。

## 2. 决策状态

### 已锁定决策

- 任一高影响质量门缺失则 blocked/partial，不产生可信结果；模型不能改变门禁。
- 回测结果必须携带 StrategyDefinition、DataSnapshot、cost manifest、运行时、错误/缺失、容量和随机性/确定性标记。
- 结果是研究结果，不构成投资建议，不触发持仓/订单/通知副作用。

### 已采用的低影响假设

- 初版使用可测试的插件内 deterministic engine 接口；若需要 Python/Polars/DuckDB runtime，另开 system change，当前票不越界。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| backtest request/gates/engine adapter/results/metrics/checkpoint UI | T-02 snapshots、T-06 portfolio assumptions、T-07 StrategyDefinition、TickFlow rule ideas | 自动交易、宿主 worker、未授权 runtime、投资建议 |

## 4. 要构建什么

用户选择不可变策略版本、A/HK Universe 和数据区间，系统先展示质量门并要求确认。门禁通过后执行回测任务，显示进度、可取消/恢复状态；完成后展示收益、风险、回撤、换手、成本影响、流动性/容量限制、缺失统计、EvidenceRef 和免责声明。时间旅行、幸存者偏差、错误复权/单位 fixture 会被阻断。

## 5. 实现契约

- **入口或接缝：** backtest route/tool、quality gate evaluator、engine adapter、result store、result page。
- **输入与输出：** 输入 StrategyDefinition version、DataSnapshot set、market rules、cost/slippage/liquidity/capacity assumptions、run budget；输出 ResearchRun/metrics/cost manifest/checkpoint 或稳定阻断错误。
- **公共接口变化：** 插件内 backtest request/result schema；不改宿主任务 API。
- **不变量：** no look-ahead、PIT/规则/费用门禁、不可变输入、幂等 run、无交易副作用；结果没有证据不能标可信。
- **状态或数据流：** validate gates -> user confirm -> queued/running/checkpoint -> completed/failed/cancelled -> immutable result。
- **错误与失败行为：** `pit_unavailable`、`calendar_unknown`、`cost_model_missing`、`capacity_unknown`、`cancelled` 等可定位到 gate。
- **兼容要求：** result schema versioned，旧结果只读；engine 不改变账本和策略定义。
- **安全与隐私要求：** 默认只用公开/用户确认输入；私有持仓若参与必须走 Agent/资料确认，不写外部模型。

## 6. 执行路线

1. 为每个高影响 gate、时间旅行/幸存者偏差/复权/单位错误和取消恢复建立红灯 fixture。
2. 实现 gate evaluator、成本 manifest 和 engine adapter，先让非法请求稳定 blocked。
3. 实现任务状态、checkpoint、幂等 result store 和 metrics/provenance。
4. 实现确认/进度/结果页面，显示所有假设、缺失和免责声明。
5. 运行故障注入、回测回归、静态无交易扫描和 T-06/T-07 合同测试。

## 7. 路径访问契约

- **预计修改点：** `<Path>plugins/finance-workbench/src/quant/backtest/**</Path>`、`<Path>plugins/finance-workbench/routes/backtest.*</Path>`、`<Path>plugins/finance-workbench/tests/backtest.integration.test.ts</Path>`、`<Path>plugins/finance-workbench/tests/backtest.fixtures/**</Path>`。
- **可写范围：** 上述插件子路径。
- **只读上下文：** `<Path>plugins/finance-workbench/src/domain/**</Path>`、`<Path>plugins/finance-workbench/src/data/**</Path>`、`<Path>plugins/finance-workbench/src/assets/**</Path>`、`<Path>plugins/finance-workbench/src/quotes/**</Path>`、`<Path>plugins/finance-workbench/src/quant/strategy/**</Path>`、`<Path>plugins/finance-workbench/src/portfolio/**</Path>`、`<Path>temp/finance-references/tickflow-stock-panel/**</Path>`、`<Path>temp/finance-references/TradingAgents-astock/**</Path>`。
- **共享路径：** 无。
- **保留或不动：** 宿主 TaskRegistry/worker、broker/交易接口和 Python runtime。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | gate/engine/result integration | 用 deterministic fixture 执行 A/HK 策略并查看结果 | 假设、metrics、成本、容量、样本和 EvidenceRef 完整 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-08.md</Path>` |
| 失败路径 | gate/fault injection | 缺 PIT/日历/成本/容量，注入未来字段、错误复权、取消/worker 失败 | blocked/failed/cancelled/recoverable，无部分可信结果和副作用 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-08.md</Path>` |
| 回归 | T-02/T-06/T-07 integration | 运行数据、账本、StrategyDefinition 回归 | 输入不可变，结果不修改账本/策略 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-08.md</Path>` |
| UI E2E（owner：当前执行 owner） | backtest page | 桌面/窄屏确认门禁、取消、查看结果 | 所有状态和免责声明可见、无重叠 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-08.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 先 gate/fixture，再 engine adapter，再 task/result UI；旧结果只读。
- **兼容窗口：** Strategy/DataSnapshot/result schema 版本化；未知版本阻断而不静默重算。
- **监控信号：** gate rejection、run duration/budget、checkpoint、cancel latency、missing rows、cost impact、capacity violations。
- **回滚或前向恢复：** 输入快照和结果不可变；worker 中断从 checkpoint 恢复，engine 失败保留 failed run，不修改账本。
- **不可逆操作与批准点：** 每次回测执行前用户确认质量门；不存在交易批准。
- **收缩条件：** 没有绕过 gate/engine adapter 的 route/tool；静态扫描和 integration 证明。

## 10. 验收标准

- [ ] `AC-017`～`AC-020`：回测门禁、规则、成本、偏差检测、结果解释和无副作用成立。
- [ ] 验证矩阵记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-08.md</Path>`。
