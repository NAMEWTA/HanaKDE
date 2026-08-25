---
schema_version: 3
artifact: spec
change: 2026-08-25-hanakde-v0-0-3-brand-release
status: ready
ready_for_tickets: false
planning_depth: deep
sources:
  - USER-DECISION:conversation-confirmed-execution
---

# HanaKDE v0.0.3 品牌与发行修复

## Objective

交付可开发、可打包、可更新的 HanaKDE v0.0.3，修复损坏的 Electron 安装诊断，移除对上游 HanaAgent Apple 公证身份的依赖，并确保 GitHub Release 资产采用 HanaKDE 名称。

## Requirements

1. `npm` 是仓库唯一受支持的根包管理器；启动前必须验证 Electron 可执行文件存在，并给出可操作的 `npm ci` 恢复指令。
2. 用户可见产品名、窗口标题、安装器、产物、文档和发行验证统一为 HanaKDE。
3. 发布版本为 `0.0.3`；独立核心发行物命名为 `HanaKDE-Core-*`。
4. 删除 electron-builder `afterSign` 公证钩子及其脚本和 CI 环境变量，不需要原 HanaAgent Apple Developer ID。
5. 保留 `CSC_IDENTITY_AUTO_DISCOVERY=false`、本地 ad-hoc Mach-O 签名、Electron entitlements 和种子完整性签名。
6. 保留兼容标识 `com.hanako.app`、`.hanako*`、`HANA_HOME`、`hana` CLI 与 `@hana/*`；新增 `hanakde` CLI 别名。
7. 不修改或提交用户当前 Todo、财务工作台和其他进行中的工作。
8. 通过单元测试、类型检查、构建、打包门禁和发行摘要校验；推送 `v0.0.3` 后确认 GitHub Release 与资产完整。

## Acceptance Criteria

- 干净安装后 Electron 预检通过；损坏安装在 renderer 构建前失败，并显示 `volta run npm ci` 恢复命令。
- `npm run start:dev` 能启动 Electron 开发环境，不再出现 `electron/path.txt` ENOENT。
- 构建配置和 CI 中不存在 Apple 公证钩子或上游证书要求。
- 发行资产名称不含 `HanaAgent` 或 `HanaCore`，产品 UI 不再以 HanaAgent 自称。
- 旧应用数据、更新身份与插件生态标识仍可兼容读取。
- `v0.0.3` 是新注释标签，不覆盖 `v0.0.2`，自动 Release 成功发布。

## Out Of Scope

- 修改 `com.hanako.app`、`.hanako*` 或 `@hana/*` 等持久化与生态标识。
- 购买、配置或使用新的 Apple Developer ID 证书。
- 重做应用图标或迁移已有用户数据。
- 合并当前工作区内其他未完成的用户改动。
