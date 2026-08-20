---
artifact: wayfinder-ticket
id: INV-08
name: 定义 Agent 协作授权冲突与结果回路
parent_map: <Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/wayfinder-map.md</Path>
label: wayfinder:grilling
status: closed
blocked_by: [INV-01, INV-04, INV-06]
resolution: answered
---

# 定义 Agent 协作授权冲突与结果回路

## 问题

Agent 在聊天中创建/修改 Todo 与 `agent_execute` 后台执行时，何时要求确认、如何预览副作用、如何选择 Agent/workspace/permission、如何显示来源和最近改动、人工编辑与运行中更新冲突时谁可继续、成功为何不自动完成、needs_action/retry/cancel/Session 跳转如何形成可理解的闭环？
