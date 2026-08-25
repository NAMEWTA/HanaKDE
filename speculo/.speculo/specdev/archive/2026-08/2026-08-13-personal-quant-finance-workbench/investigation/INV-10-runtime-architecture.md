---
artifact: wayfinder-ticket
id: INV-10
name: 插件运行时架构与契约裁决
parent_map: <Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/wayfinder-map.md</Path>
label: wayfinder:task
status: open
blocked_by: [INV-05, INV-06, INV-07, INV-08, INV-09]
resolution: null
---

# 插件运行时架构与契约裁决

## 问题

AFK Task：基于已确认的产品边界和 UI 原型，选择可删除、可恢复、最小权限的运行时架构，锁定插件贡献结构、领域模块、数据 provider 契约、缓存/存储、同步与长任务、策略/回测边界、Agent 编排、错误/进度/取消、迁移/卸载和测试策略；哪些能力留在插件、外置为可选适配器，或必须另立 Hana 系统前置 change？

产物必须给出至少两个候选及取舍、最终边界图、数据与任务状态机、能力/权限清单、失败降级、版本与迁移策略、关键 ADR 候选和可执行验证门；不得把未验证的 Python/TCP/子进程能力写成既成 SDK 契约。答案写入 `<Path>{roots.state}/specdev/changes/2026-08-13-personal-quant-finance-workbench/investigation/comments/INV-10/01-solution.md</Path>`。
