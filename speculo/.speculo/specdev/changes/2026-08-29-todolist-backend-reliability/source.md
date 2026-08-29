---
schema_version: 1
artifact: source
change: 2026-08-29-todolist-backend-reliability
source_type: conversation
canonical_locator: conversation:2026-08-29-todolist-backend-reliability
captured_at: 2026-08-29T01:18:00+08:00
content_sha256: b2f31b474ae35890b8c1b68c0f2e93419966710ea24f670904ccd404d784f5b9
remote_state: not-applicable
close_capability: not-applicable
status: frozen
---

# Source: Todo 后台与完整 CRUD 恢复

## Capture Metadata

- 来源：当前用户会话。
- 用户目标：恢复 Todo 后台，并完善 Todo List 相关增删改查功能。
- 执行授权：用户要求实现；不包含 commit、push 或 release 授权。

## Original Content

用户报告 Todo 后台依然不可用，要求完善 Todo List 相关功能，包括增删改查以及 Todo 关联能力。

## Source Comments

- 既有 builtin `<Path>plugins/todolist</Path>` 已包含 Todo、Project、提醒、周期任务、Agent、导入导出和磁盘 Store，不应新建第二套实现。
- 本次应先恢复宿主与插件的启动合同，再验证真实 HTTP、持久化和页面操作。
