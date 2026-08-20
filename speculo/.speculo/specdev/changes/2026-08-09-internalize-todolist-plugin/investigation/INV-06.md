---
artifact: wayfinder-ticket
id: INV-06
name: 闭环计划截止提醒与错过补救
parent_map: <Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/wayfinder-map.md</Path>
label: wayfinder:grilling
status: closed
blocked_by: [INV-01, INV-04]
resolution: answered
---

# 闭环计划截止提醒与错过补救

## 问题

用户如何区分并配置 `plannedFor`、`deadline` 与精确 reminder trigger；默认值、时区/DST 提示、多个提醒、桌面权限拒绝、应用关闭或休眠错过、`handoff_failed/unknown`、显式重试、稍后提醒、关闭提醒和历史状态应如何呈现，才能既诚实又便于补救？
