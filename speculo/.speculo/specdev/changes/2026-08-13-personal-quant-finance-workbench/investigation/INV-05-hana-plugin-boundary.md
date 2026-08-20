---
artifact: wayfinder-ticket
id: INV-05
name: Hana 插件能力契约与破盒边界
parent_map: <Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/wayfinder-map.md</Path>
label: wayfinder:research
status: closed
blocked_by: []
resolution: answered
---

# Hana 插件能力契约与破盒边界

## 问题

AFK Research：基于当前 Hana 代码、插件文档与 `hana-plugin-creator`，金融工作台所需的页面、路由、工具、网络、配置/秘密、资源、私有存储、Session/Agent、模型调用、后台任务、进度/取消、图表资产和错误诊断分别能否由公开插件契约可靠表达；哪些量化计算、Python/TCP/本地进程或长期调度需求会破盒？

穷尽问题集包括：manifest 和最小 capabilities；page/widget 与 iframe 协议；`ctx.network.fetch()` 限制；ResourceIO/SessionFile/`ctx.dataDir` 分工；TaskRegistry 生命周期；插件 dev loop/scenario/diagnostics；本地库或 sidecar 的支持状态；数据迁移与卸载；安全主体；与 `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/placement-decision.md</Path>` 的逐条复核。

停止条件：每个必需能力有 supported/constrained/unsupported 结论和源码/官方文档证据；能给出候选 manifest/contribution 结构；所有 unsupported 项都有降级、外置或独立系统 change 路线。目标答案写入 `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-05/01-solution.md</Path>`。
