---
artifact: wayfinder-ticket
id: INV-02
name: Vibe Research 个人投研闭环与知识沉淀
parent_map: <Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/wayfinder-map.md</Path>
label: wayfinder:research
status: closed
blocked_by: []
resolution: answered
---

# Vibe Research 个人投研闭环与知识沉淀

## 问题

AFK Research：在固定 commit `d8c80d4ac60e43c1f096c0c486355b19800f16d7` 上，Vibe-Research 如何把每日复盘、资讯雷达、个股/板块、自选、持仓、私有研报、研究记录、反思审计和多空辩论串成个人投研闭环；哪些信息架构、隐私原则和 Agent 交互值得 Hana 采用，哪些只适合原项目？

穷尽问题集包括：A/HK/US 多市场模型；本地持仓与研报数据归属；研究记录及可追溯性；AI/MCP/CLI 接入；多空辩论的事实底稿与非荐股边界；刷新策略与数据源；页面密度和导航；许可证、成本、失败降级；与 Hana Session/Agent/ResourceIO/页面贡献面的映射。

停止条件：核心用户旅程、数据所有权、AI 触发点和每个主要页面均有源码证据；产出 adopt/adapt/reject 矩阵，并说明它与“量化执行面板”互补而非重复的部分。目标答案写入 `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-02/01-solution.md</Path>`。
