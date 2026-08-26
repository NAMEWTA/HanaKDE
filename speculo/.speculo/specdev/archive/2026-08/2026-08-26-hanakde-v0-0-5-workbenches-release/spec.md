---
schema_version: 3
artifact: spec
change: 2026-08-26-hanakde-v0-0-5-workbenches-release
status: ready
ready_for_tickets: false
planning_depth: lite
sources:
  - USER-DECISION:2026-08-26-commit-push-release-plus-0.0.1
---

# HanaKDE v0.0.5 Workbenches Release

## Objective

将 v0.0.4 之后已完成并归档的 Markdown WeChat 与 research-only Finance Workbench 交付为 HanaKDE v0.0.5，并发布完整跨平台安装资产。

## Requirements

1. 根版本从 0.0.4 升级为 0.0.5，根 npm lock 与版本一致。
2. v1/v2 release digest 只陈述 `v0.0.4..v0.0.5` 中可验证的两个工作台及必要宿主交互。
3. Finance 私有数据写入复用现有 `plugin-runtime-data` 持久化契约，并通过扫描器与 schema tripwire。
4. Finance、Markdown、宿主 capability 回归、根 typecheck、release digest、持久化和客户端构建门禁通过。
5. 创建注释标签 `v0.0.5`，先推送 `hanakde` 再推送标签，并确认 GitHub Actions 发布成功。
6. Release 保持非 draft prerelease，并包含 macOS arm64/x64、Windows x64、Linux、更新元数据、摘要与 Windows Core 资产。
7. 不使用原 HanaAgent Apple 签名、公证身份或其他未授权外部凭据。

## Acceptance Criteria

- `package.json` 与 `package-lock.json` 根版本均为 0.0.5。
- `release-digest.v1.json` 和 v2 history 通过 `v0.0.5` 校验。
- 本地插件、宿主、持久化、类型和构建门禁通过。
- 本地与远端 `v0.0.5^{}` 指向相同已验证 release commit。
- GitHub Release 发布成功且必需资产完整。

## Out Of Scope

- 引入 pnpm 或提交未跟踪的 pnpm 文件。
- 新增交易执行能力、第三方图床或其他产品功能。
- 修改应用身份、数据 epoch 或 Apple 公证边界。
