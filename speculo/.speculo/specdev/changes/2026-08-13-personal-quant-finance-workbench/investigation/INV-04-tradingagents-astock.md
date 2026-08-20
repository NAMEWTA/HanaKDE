---
artifact: wayfinder-ticket
id: INV-04
name: TradingAgents A 股多 Agent 决策与审计边界
parent_map: <Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/wayfinder-map.md</Path>
label: wayfinder:research
status: closed
blocked_by: []
resolution: answered
---

# TradingAgents A 股多 Agent 决策与审计边界

## 问题

AFK Research：在固定 commit `0badc3340c70fa0eb16e8cb527c5c32efacc7966` 上，TradingAgents-astock 的分析师、工具循环、多空辩论、研究经理、风险辩论、组合经理、记忆、检查点和绩效统计如何实际编排；Hana 应采用何种更可控、更节省且不伪装确定性的研究 Agent 模式？

穷尽问题集包括：状态图与角色职责；快/慢模型分工及调用成本；中断、恢复、进度和历史；数据事实底稿与幻觉防线；A 股制度约束；look-ahead guard、记忆和绩效指标语义；报告导出；许可证；映射到 Hana plugin_private Session/Agent、`sampleText()`、工具与任务的可行性；应该拒绝的评级/交易结论设计。

停止条件：主要节点、状态转移、模型调用和数据工具均有源码证据；给出最小 Agent 拓扑、预算/取消/审计要求和 adopt/adapt/reject 结论，不以角色数量作为能力完成度。目标答案写入 `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-04/01-solution.md</Path>`。
