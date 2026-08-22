---
schema_version: 3
artifact: ticket
change: 2026-08-12-openhanako-v0-446-6-platform-gates
id: T-22
title: 通过 Windows 阻断门
status: done
planning_depth: deep
planning_depth_reason: "Windows case/junction/locked-file/watcher/native extraction/NSIS package 与启动恢复是平台原生安全和发布阻断 Gate。"
ready: true
risk: critical
blocked_by: [T-27, T-28, T-29]
contract_ids: [AC-009, AC-010, AC-014, AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-027, AC-029, AC-030, AC-031]
owner: windows-gate-owner
expected_changes: ["<Path>scripts/platform/windows/**</Path>", "<Path>tests/platform/windows/**</Path>"]
writable_paths: ["<Path>scripts/platform/windows/**</Path>", "<Path>tests/platform/windows/**</Path>"]
read_only_paths: ["<Path>package.json</Path>", "<Path>package-lock.json</Path>", "<Path>shared/runtime-dependency-integrity.cjs</Path>", "<Path>scripts/verify-runtime-dependencies.mjs</Path>", "<Path>desktop/**</Path>", "<Path>server/**</Path>", "<Path>lib/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-22: 通过 Windows 阻断门

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/22-windows-blocking-gate.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-22.md</Path>`

## 1. 战略与来源

- **目标：** 在包含 T-27 的真实 Windows 固定点上完成 filesystem/native/package/startup 阻断矩阵。
- **可观察产出：** Windows case-insensitive/junction/locked-file/rename/watcher/restore/extraction、`dist:win`、NSIS install/start 与组件修复全部通过且清理完整。
- **来源：** `US-011`—`US-014`、`AC-009`—`AC-010`、`AC-014`—`AC-023`、`AC-027`、`AC-029`—`AC-031`、`ADR-002`。
- **当前事实：** 旧 Evidence 在 macOS 上保持 blocked；真实 Windows 重跑已在 T-27/T-28/T-29 固定点完成全部平台矩阵、正式 package/install/start、direct flow 与 repair 证据。
- **Planning Depth 原因：** Windows 原生安全、进程、native helper、package 与恢复行为不可由其他平台替代，失败直接阻止 change 完成。

## 2. 决策状态

### 已锁定决策

- T-27 done 且 Evidence 通过是本 Ticket 的真实开始条件；T-22 不修改任何 T-27 产品路径。
- 使用 Volta Node 24.16.0；Windows sandbox helper 需要可发现的 MSVC `cl.exe`，工具链缺失分类为环境 blocker，不等同产品失败。
- 必须运行真实 `npm ci`、定向 tests、native runner、`dist:win`、NSIS package/install/start、standalone server 和 startup recovery smoke。
- blocking 行不能 skip；无法运行保持未完成。
- 所有测试安装、HANA_HOME、进程与临时 fixture 必须隔离和清理，不使用真实用户 Profile。

### 已采用的低影响假设

- symlink privilege 不可用时可用 junction 覆盖 Windows reparse-point 安全合同，但权限分类必须记录，越界 fail-closed 不得省略。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| Windows-only runner/fixtures/package/startup repair smoke 与最终 Evidence | T-27 产品修复、existing runner、T-21 package inputs、NSIS 配置 | 产品代码修复、依赖升级、签名/发布、真实用户数据、macOS 替代 |

## 4. 要构建什么

在真实 Windows x64 上以干净依赖和隔离 Profile 执行现有 native matrix，构建并安装 production NSIS，证明 Server、renderer、sandbox/native assets 和关键 Workspace/Knowledge 流程可用。随后在隔离安装中验证完整启动、缺组件确认修复、取消/失败和首次偏好缺失行为。任何产品失败返回 owning Ticket；任何环境缺失明确阻断，均不放宽断言。

## 5. 实现契约

- **入口或接缝：** `<Path>scripts/platform/windows/run-gate.mjs</Path>`、Windows Vitest matrix、`dist:win`、NSIS install/start、standalone smoke、Electron direct flow。
- **输入与输出：** T-27 final SHA + clean install + isolated fixtures/package → per-contract pass/fail logs、package inventory、process cleanup 和 Evidence。
- **公共接口变化：** 无；仅平台 harness 与 Evidence，产品代码只读。
- **不变量：** real win32；no blocking skips；产品路径只读；测试 Profile 隔离；absolute paths/用户内容不进入持久 Evidence。
- **状态或数据流：** preflight/toolchain → clean install → native matrix → build/package → install/start/direct flows → repair injection → teardown/Evidence。
- **错误与失败行为：** 产品、基线、环境、权限和无效验证分开记录；产品失败退回 T-27 或实际 owning Ticket，环境失败保持 T-22 未完成。
- **兼容要求：** 当前唯一新基线；不验证旧 Profile/migration。
- **安全与隐私要求：** junction/root replacement fail closed；repair 不触碰隔离 Profile 中的用户数据区；所有进程、installer 和 temp roots 清理。

## 6. 执行路线

1. 确认 T-27 Evidence、最终 SHA、Volta Node、MSVC/PowerShell/Electron/NSIS 前置，建立隔离工作目录和 HANA_HOME。
2. 执行 clean `volta run npm ci`、runtime dependency verify、相关 Vitest 与 Windows native filesystem/security/watcher matrix。
3. 执行 `volta run npm run dist:win`、standalone server verification，检查 `win-unpacked`、native assets、seed/manifest/signature 和 NSIS PE/inventory。
4. 安装/启动 production package，完成 Server/renderer/Workspace/Agent/Office/Knowledge 关键 direct-flow smoke。
5. 在隔离 artifact 中注入可恢复缺失，验证一次退避、取消、确认修复成功、repair 失败不循环及 preferences ENOENT 静默；清理所有状态。
6. 记录命令、SHA、架构、失败分类、未运行项和 cleanup，更新 T-22 Evidence；全部阻断行通过后关闭 Ticket。

## 7. 路径访问契约

- **预计修改点：** 仅 Windows runner/fixture/test 在需要补充最终场景时修改。
- **可写范围：** `<Path>scripts/platform/windows/**</Path>` 与 `<Path>tests/platform/windows/**</Path>`。
- **只读上下文：** manifests、T-27 shared verifier/Desktop、Server/lib。
- **共享路径：** 无。
- **保留或不动：** 产品代码、macOS harness、sign/release state、真实用户 Profile。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | Windows native runner | clean install + filesystem/watch/restore/extraction/Knowledge suite | 单 owner、数据一致、formats/runtime 可用 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-22.md</Path>` |
| 失败路径 | malicious/native matrix | junction/root replace/locked/permission/converter/module failure | fail closed、磁盘不误改、错误分类准确、资源清理 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-22.md</Path>` |
| 回归 | production package | `dist:win` + standalone + NSIS inventory/install/start | runtime/native assets 完整，package 可启动 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-22.md</Path>` |
| E2E（owner：windows-gate-owner） | installed Electron app | 关键 direct flow + isolated component repair | 正常流程通过，确认 repair 恢复，取消/失败不循环 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-22.md</Path>` |
| E2E disposition | `required`；`current-workspace` / `direct-parent` | Windows x64 installed package direct flow 与 repair | 必须通过，不允许 skip | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-22.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** T-27 → clean Windows Gate → package/install/start → repair smoke；无数据迁移。
- **兼容窗口：** 只验证当前新基线和最终 fixed SHA。
- **监控信号：** watcher/descriptor、root safety、restore/extraction、dependency preflight、retry count、repair result、process cleanup。
- **回滚或前向恢复：** 产品失败回 owning Ticket 修复并使 T-22 Evidence 失效后整套重跑；环境失败补齐工具链后从固定 SHA 重跑。
- **不可逆操作与批准点：** 安装/卸载仅作用于测试目标；不签名、不发布、不修改真实用户数据；Git/remote 动作未授权。
- **收缩条件：** 所有 blocking rows 通过、关键未执行为零、临时安装/Profile/进程清理完成。

## 10. 验收标准

- [x] `AC-009`/`AC-010`、`AC-014`—`AC-023`：真实 Windows native matrix 无阻断失败或 skip。
- [x] `AC-027`：`dist:win`、standalone、NSIS inventory/install/start 和 installed-package direct flow 全部通过。
- [x] `AC-029`—`AC-031`：clean dependency preflight、package startup、确认 repair 与 optional preferences 行为在 Windows 通过。
- [x] 完整结果、最终 SHA、环境信息与 cleanup 记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-22.md</Path>`。
- [x] 实际修改未超出 Windows harness writable paths，无未授权发布动作；产品修复由 T-27/T-28/T-29 owner 交付。
