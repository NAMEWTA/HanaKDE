---
artifact: wayfinder-ticket
id: INV-04
name: 设计编辑保存冲突与撤销反馈
parent_map: <Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/wayfinder-map.md</Path>
label: wayfinder:grilling
status: closed
blocked_by: [INV-02, INV-03]
resolution: answered
---

# 设计编辑保存冲突与撤销反馈

## 问题

标题、描述、状态、时间、组织与执行模式应在列表内还是详情中编辑，使用显式保存还是自动保存；加载中、保存中、成功、失败、离开未保存、stale version、Agent 与人工并发修改、完成/恢复和撤销时如何反馈与恢复，才能避免静默覆盖和频繁打断？
