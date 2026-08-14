---
artifact: wayfinder-ticket
id: INV-12
name: 定义首次使用与全局异常恢复状态
parent_map: <Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/wayfinder-map.md</Path>
label: wayfinder:grilling
status: closed
blocked_by: [INV-01, INV-02, INV-03, INV-04, INV-06, INV-08]
resolution: answered
---

# 定义首次使用与全局异常恢复状态

## 问题

首次打开、零数据、加载慢、route/store 失败、后台 handler 未就绪、通知权限缺失、Session/Agent 能力不可用、重启恢复、数据 migration 失败与局部功能降级时，各页面展示什么、哪些动作仍可用、如何重试或进入诊断、何时阻断写入，才能避免空白页、假成功和无出口错误？
