---
artifact: wayfinder-ticket
id: INV-09
name: 完善删除回收站与数据生命周期
parent_map: <Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/wayfinder-map.md</Path>
label: wayfinder:grilling
status: closed
blocked_by: [INV-04, INV-07, INV-08]
resolution: answered
---

# 完善删除回收站与数据生命周期

## 问题

单条、批量、Project、周期 occurrence/系列和带运行记录的 Todo 删除时，软删除、Undo、Trash、恢复位置、永久清除、保留期限、关联 schedule/Run/Session 投影和审计如何处理；确认令牌失效或目标版本变化后，用户如何理解并安全重试？
