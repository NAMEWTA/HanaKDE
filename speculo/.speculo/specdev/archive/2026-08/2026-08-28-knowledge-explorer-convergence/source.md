---
schema_version: 1
artifact: source
change: 2026-08-28-knowledge-explorer-convergence
source_type: conversation
canonical_locator: conversation:2026-08-28-knowledge-explorer-convergence
captured_at: 2026-08-28T00:00:00+08:00
content_sha256: 75b80c54b43d5c2b0e3ca593becdc21ef386108f425726626871f6ef93df830d
remote_state: not-applicable
close_capability: not-applicable
status: frozen
---

# Source: Knowledge Explorer 收敛

## Capture Metadata

- 来源：当前用户会话与两张对比截图。
- 目标参照：upstream Desk 工作区的搜索、工具栏、紧凑目录树与工作台布局。
- 执行授权：用户明确要求“执行计划”；不包含 commit、push 或 release 授权。

## Original Content

用户要求知识文件资源管理直接学习并复用 upstream 已有工作台文件 Explorer 的 UI 与后台逻辑，修复当前 Knowledge 页面来源不可用、常驻三栏、控件堆叠和大面积空白的问题。已批准的执行顺序是：先统一工作区身份和真实资源加载，再复用 upstream Explorer 外壳，最后以用户真实嵌套目录及桌面截图作为验收。

## Source Comments

- 当前缺陷不只是视觉问题：Knowledge 请求未携带活动 Desk 的 `mountId` 或本地目录，Server 因此可能无法解析主来源。
- 既有 Knowledge operations、editor、trash、index 和 drag 状态机应保留；本次复用 upstream 的工作区身份合同与 Explorer 结构，不另造文件管理后端。
