---
schema_version: 3
artifact: spec
change: 2026-08-25-hanakde-v0-0-4-todolist-release
status: ready
ready_for_tickets: false
planning_depth: lite
sources:
  - USER-DECISION:execute-commit-push-release-0.0.4
---

# HanaKDE v0.0.4 TodoList 修复发行

## Objective

将已通过真实 HanaKDE 宿主验证的 TodoList `0.2.1` 修复交付为 HanaKDE v0.0.4，并发布完整跨平台安装资产。

## Requirements

1. 根版本从 `0.0.3` 升级为 `0.0.4`，Todo 插件版本保持 `0.2.1`。
2. v0.0.4 更新摘要只陈述 `v0.0.3..v0.0.4` 中可验证的 TodoList 修复。
3. 本地通过 Todo 插件 verify、宿主 iframe 合同、根 typecheck、发布摘要与构建门禁。
4. 创建注释标签 `v0.0.4`，推送 `hanakde` 与标签，并确认 GitHub Actions 发布成功。
5. Release 必须保持非 draft prerelease，并包含 macOS arm64/x64、Windows x64、Linux、更新元数据、摘要和 Windows Core 资产。
6. 不调用原 HanaAgent Apple 身份、Developer ID 或公证流程。

## Acceptance Criteria

- `package.json` 与 `package-lock.json` 根版本均为 `0.0.4`。
- `release-digest.v1.json` 和 v2 history 通过 `v0.0.4` 校验。
- TodoList 本地回归和真实宿主 E2E 证据可定位。
- `v0.0.4` 标签指向已验证 release commit。
- GitHub Release 发布成功且必需资产完整。

## Out Of Scope

- 财务工作台、Knowledge redesign 和 pnpm 包管理器迁移。
- 修改持久化兼容标识、Todo 用户数据或现有签名边界。
- 归档其他 SpecDev changes。
