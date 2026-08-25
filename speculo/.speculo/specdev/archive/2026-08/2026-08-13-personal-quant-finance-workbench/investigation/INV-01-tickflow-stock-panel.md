---
artifact: wayfinder-ticket
id: INV-01
name: TickFlow 量化面板能力与工程边界
parent_map: <Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/wayfinder-map.md</Path>
label: wayfinder:research
status: closed
blocked_by: []
resolution: answered
---

# TickFlow 量化面板能力与工程边界

## 问题

AFK Research：在固定 commit `ecfddb451e97f6fc9a7e43ac33e4ef0e69933b33` 上，tickflow-stock-panel 的用户闭环、页面/功能、数据流水线、选股/因子/回测、监控/调度、扩展机制和 AI 接入究竟如何工作；哪些设计应采用、改造或拒绝，才能支撑 Hana 插件而不继承其部署重量、数据源耦合或金融正确性风险？

穷尽问题集包括：功能与用户任务清单；前后端/存储/任务/流式进度架构；策略与自定义数据扩展点；T+1、手续费、滑点、复权和回测指标语义；外部凭据与运行成本；许可证及复用边界；逐能力映射到 Hana page/routes/tools/tasks/model/resources 的结果。

停止条件：主要用户任务和关键运行路径均有源码定位；每项候选能力都有 adopt/adapt/reject 结论、理由、依赖和风险；README 与代码不一致处已显式记录。目标答案写入 `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-01/01-solution.md</Path>`。
