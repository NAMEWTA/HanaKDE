---
schema_version: 3
artifact: ticket
change: 2026-08-12-openhanako-v0-446-6-platform-gates
id: T-28
title: 修复 Windows NSIS install hook 栈安全
status: done
planning_depth: deep
planning_depth_reason: "NSIS 自定义安装检查使用栈式变量；多余 Pop 会在真实安装阶段破坏控制流并阻止 package gate。"
ready: true
risk: critical
blocked_by: [T-27]
contract_ids: [AC-027, AC-030]
owner: windows-installer-owner
expected_changes: ["<Path>build/installer.nsh</Path>", "<Path>tests/windows-installer-contract.test.ts</Path>"]
writable_paths: ["<Path>build/installer.nsh</Path>", "<Path>tests/windows-installer-contract.test.ts</Path>"]
read_only_paths: ["<Path>package.json</Path>", "<Path>package-lock.json</Path>", "<Path>desktop/**</Path>", "<Path>server/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-28: 修复 Windows NSIS install hook 栈安全

## 1. 战略与来源

真实 Windows installer smoke 暴露 `hanakoGrantSandboxAce` 多消费一个 NSIS
栈项。目标是恢复 custom install hook 的栈平衡，使正式 NSIS 可构建、安装和启动。

## 2. 决策状态

已锁定：`nsExec::ExecToStack` 的返回值恰好消费一次；保留 ACL、进程检查与失败
诊断语义；不修改 electron-builder、启动代码、依赖或 lockfile。无未决问题。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| installer macro 与合同测试 | 既有 NSIS/ACL/package gate | 构建配置、依赖、启动恢复、发布 |

## 4. 要构建什么

删除多余 `Pop $0`，并以合同测试固定该宏恰好包含一个 `Pop $0`。

## 5. 实现契约

- **入口：** `build/installer.nsh` 的 `hanakoGrantSandboxAce`。
- **不变量：** 栈平衡；失败仍可观察；安装目标与 ACL 行为不变。
- **失败行为：** contract 或真实安装失败均阻断 T-22，不允许 skip。

## 6. 执行路线

1. 以红测试复现多余栈消费。
2. 删除单个多余 `Pop $0` 并重跑 contract。
3. 运行正式 `dist:win`、package gate、静默安装与 installed flow。
4. 写入 T-28/T-22 Evidence。

## 7. 路径访问契约

只写 `build/installer.nsh` 与
`tests/windows-installer-contract.test.ts`；其余产品和发布路径只读。

## 8. 验证矩阵

| 风险 | 验证接缝 | 预期 |
|---|---|---|
| 栈下溢 | installer contract | 宏恰好一个 `Pop $0` |
| 构建回归 | `dist:win` | NSIS 成功 |
| 安装回归 | silent install | exit 0 且 inventory 完整 |
| 启动回归 | installed direct flow | launch/health/cleanup 全部通过 |

## 9. 发布、迁移与恢复

无迁移或发布动作。回归时由 contract 先失败，再修复并重跑 T-22；不得跳过安装。

## 10. 验收标准

- [x] AC-027：正式 NSIS 构建、PE/inventory 和静默安装通过。
- [x] AC-030：安装 hook 不再阻断 packaged recovery。
- [x] 路径所有权、无 lock/dependency/release 变化和 Evidence 均通过。
