---
artifact: wayfinder-ticket
id: INV-11
name: 闭环导入导出备份与冲突预演
parent_map: <Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/wayfinder-map.md</Path>
label: wayfinder:grilling
status: closed
blocked_by: [INV-05, INV-07, INV-08, INV-09]
resolution: answered
---

# 闭环导入导出备份与冲突预演

## 问题

当前数据导出、旧 0.0.5 JSON 迁移、再次导入与恢复备份时，文件选择/交付、schema 兼容、预览汇总、字段映射、重复检测、冲突策略、敏感字段排除、事务提交、取消、中断恢复和导入后核对如何设计，才能让用户在不可逆写入前看懂结果并可安全回退？
