---
schema_version: 1
artifact: source
change: 2026-08-27-macos-release-team-id-crash
source_type: conversation
canonical_locator: conversation:2026-08-27-macos-release-team-id-crash
captured_at: 2026-08-27T14:45:43+08:00
content_sha256: 22a5ab64bead4a5a6597966dab583a4cf37a3b1668f9c60c6eaab8fda90a4fdc
remote_state: not-applicable
close_capability: not-applicable
status: frozen
---

# Source: macOS release Team ID crash

## Capture Metadata

- 来源：原始用户会话，由既有 diagnosis、Spec、Ticket 与 Evidence 重建缺失的 intake 工件。
- 远程目标：无。

## Original Content

用户报告 macOS 发布包因 TEAM ID / Developer ID 相关签名路径发生启动崩溃，要求实验版收敛为不依赖平台发行身份的 macOS/Windows 安装包，并以真实目标平台启动门验证。

## Source Comments

- 本文件只补齐既有 change 的来源冻结，不改变既有 Spec 或验收合同。
- 实现与平台验证事实位于该 change 的 Evidence 中。
