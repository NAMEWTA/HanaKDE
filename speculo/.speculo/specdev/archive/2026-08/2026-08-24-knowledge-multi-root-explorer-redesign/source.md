---
schema_version: 1
artifact: source
change: 2026-08-24-knowledge-multi-root-explorer-redesign
source_type: conversation
canonical_locator: null
captured_at: 2026-08-24T11:25:35+08:00
content_sha256: ce625ad9ae6c29c4300703b0e7458486b8e261afa7da015dd0658d908fee3484
remote_state: not-applicable
close_capability: not-applicable
---

# Source: Knowledge 多根目录树前端重设计

## Capture Metadata

- **Capture method:** conversation
- **Author:** user
- **Created / updated:** 2026-08-24
- **Labels or classification supplied by source:** knowledge、前端、UI、额外挂载、VS Code workspace、多根目录树
- **Attachments:** 用户提供的 VS Code workspace 目录树截图
- **Redactions:** 截图仅作为本地会话输入，不持久化机器临时路径

## Original Content

用户要求重新设计 HanaKDE knowledge 前端：额外挂载目录参考 VS Code workspace，与 main 在同一个目录树下作为一级兄弟根显示；整个目录树复用当前聊天工作台的渲染方式；不同文件的图标保持 HanaKDE 原有实现；尽可能复用代码并遵守代码和目录规范。用户已确认规划，并要求按计划实施修复完成。

## Source Comments

本 change 不改变 KnowledgeSourceDto、SourceRegistry、ResourceIO、挂载协议、地址模型或持久化，只收敛内置 Renderer 的信息架构与共享树行渲染。
