---
schema_version: 1
artifact: source
change: 2026-08-12-knowledge-workspace-resource-convergence
source_type: conversation
canonical_locator: null
captured_at: 2026-08-12T11:52:00+08:00
content_sha256: c275d912b1b5d570d54ba6b930c4fad2d7fe0956c62754d68d9b5725812e0fec
remote_state: not-applicable
close_capability: not-applicable
---

# Source: Knowledge 工作区资源内核与文件树交互收敛

## Capture Metadata

- **Capture method:** conversation
- **Author:** user
- **Created / updated:** 2026-08-12
- **Labels or classification supplied by source:** bug report and feature request
- **Attachments:** `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/</Path>`, `<Path>{roots.state}/specdev/archive/2026-08/2026-08-09-openhanako-v0-446-6-integration/</Path>`
- **Redactions:** request payload content was intentionally abbreviated by the user

## Original Content

用户确认：聊天/工作台打开选择的工作目录就是 Knowledge 的 `main` 主来源；应尽可能复用工作台文件资源管理器已有的 file tree、file icon 与 open file 能力。

用户报告：Knowledge 编辑保存调用 `/api/resource-io/write-expected-version` 返回 `knowledge_resource_unavailable` 503；新建页面调用 `/api/knowledge-workspace/resources/create` 返回同一 503；新建文件夹成功后弹窗未关闭，重复点击导致 409；删除操作 commit 返回 503；剪切/粘贴不可用。

用户要求：Knowledge 资源树补齐工作台文件/文件夹右键操作（剪切、复制、删除、重命名、复制相对路径、复制绝对路径、打开文件夹、用默认应用打开等），复用已有实现与图标，减少纯文字按钮；统一 `main` 为“工作目录”展示语义；区分每个 agent 会话不同的授权目录与 Knowledge 可同时管理多个挂载目录的挂载目录。

## Source Comments

本 change 只修复与收敛 Knowledge 工作区资源访问及资源树交互，不改变既有来源隔离、ResourceIO、Operation Journal、Trash、Native Grant 与安全边界。
