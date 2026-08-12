---
schema_version: 3
artifact: ticket
change: 2026-08-12-openhanako-v0-446-6-platform-gates
id: T-22
title: 通过 Windows 阻断门
status: blocked
planning_depth: deep
planning_depth_reason: "Windows case/junction/locked-file/watcher/native extraction/NSIS production package 是平台原生安全与发布阻断 Gate。"
ready: false
risk: critical
blocked_by: []
contract_ids: [AC-009, AC-010, AC-014, AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-027]
owner: Worker-T-22 / Lead platform owner
expected_changes: ["<Path>scripts/platform/windows/**</Path>", "<Path>tests/platform/windows/**</Path>"]
writable_paths: ["<Path>scripts/platform/windows/**</Path>", "<Path>tests/platform/windows/**</Path>"]
read_only_paths: ["<Path>package.json</Path>", "<Path>package-lock.json</Path>", "<Path>desktop/**</Path>", "<Path>lib/**</Path>", "<Path>core/**</Path>", "<Path>server/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-22: 通过 Windows 阻断门

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/22-windows-blocking-gate.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-22.md</Path>`

## 1. 战略与来源

- **目标：** 在真实 Windows runner 上执行 root security、watch/cutover/reconcile、restore、native extraction 与 `dist:win`/NSIS package smoke，形成阻断 Evidence。
- **可观察产出：** Windows case-insensitive/junction/locked-file/rename burst/temporary-save 等平台行为均通过；失败会阻止 umbrella completion。
- **来源：** `US-011`、`US-012`、`AC-009`、`AC-010`、`AC-014`—`AC-023`、`AC-027`、`ADR-008`。
- **当前事实：** 仓库已有 Windows sandbox helper、`dist:win`、Electron CDP fixture 和平台 build 工具，但新 Resource/History/Extraction contract 需原生覆盖。
- **Planning Depth 原因：** Windows filesystem/native/package 行为无法由 macOS 模拟替代，且属于发布阻断条件。

## 2. 决策状态

### 已锁定决策

- 必须在真实 Windows 环境运行，macOS 模拟或单元 mock 不能替代 Gate。
- 覆盖 case-insensitive roots、junction/symlink、root replacement、locked files、rename bursts、temp-save patterns、watcher cleanup、restore 与 native extraction。
- 必须运行 production `npm run dist:win` 和安装包/应用 smoke；不要求签名或发布。
- 任一阻断项失败则 T-22 不 done，不能以 Linux/macOS 结果豁免。

### 已采用的低影响假设

- symlink privilege 不可用时使用 junction 与明确的权限分类补足，但 root escape/fail-closed 行为仍必须验证。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| Windows native fixtures/runner、security/watch/restore/extraction/package Gate、Evidence | T-21 package inputs、existing Windows helpers/CDP | product fixes outside platform harness、signing、publishing、Linux替代 |

## 4. 要构建什么

Windows runner 创建临时 main/mount 和恶意 junction/root replacement fixtures，运行唯一 watcher、gap/reconcile、locked file、rename burst、restore convergence 与 Office extraction。随后构建 NSIS package，安装/启动应用并完成关键 smoke。任何失败按产品、基线、环境或无效验证分类并阻断，而不是跳过。

## 5. 实现契约

- **入口或接缝：** Windows-only test harness、native helper, Electron CDP/package smoke, `npm run dist:win`。
- **输入与输出：** frozen code/package inputs + Windows fixtures → per-contract pass/fail logs, package inventory and smoke results。
- **公共接口变化：** 无；平台 harness 只验证已锁定 contracts。
- **不变量：** real Windows execution；no skips for blocking scenarios；owner overlap 0；absolute paths redacted from external assertions。
- **状态或数据流：** build/install → fixture setup → native contract tests → package launch/smoke → cleanup/Evidence。
- **错误与失败行为：** locked/permission/environment failures 分类；无法执行关键项则 Gate 未通过。
- **兼容要求：** 只支持当前新基线；不验证旧 Profile/migration。
- **安全与隐私要求：** junction/root replacement fail closed，test artifacts/temp paths 清理，日志不含 secrets/user content。

## 6. 执行路线

1. 建立 Windows-only fixtures/runner，复用 T-21 package命令而不改 shared manifests。
2. 运行 case/root/junction/locked/rename/temp-save/descriptor/cutover/reconcile native matrix。
3. 运行 restore TOCTOU/consistency 与 Document Extraction/Materialize/Office Knowledge matrix。
4. 执行 `npm run dist:win`，检查 native assets/runtime closure 和 NSIS output。
5. 安装/启动 production package，运行关键 direct-flow smoke 并清理进程/临时资源。
6. 分类所有失败并发布完整 Windows Evidence；任一阻断失败保持 Ticket 未 done。

## 7. 路径访问契约

- **预计修改点：** Windows-only scripts/fixtures/tests。
- **可写范围：** 仅 `<Path>scripts/platform/windows/**</Path>` 与 `<Path>tests/platform/windows/**</Path>`。
- **只读上下文：** shared manifests、product code、Desktop/native source。
- **共享路径：** 无；T-21 拥有 package/CI，T-23 使用独立 macOS paths。
- **保留或不动：** shared scripts/manifests、macOS harness、sign/release state。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | Windows native runner | watcher/reconcile/restore/extraction/Knowledge suite | 单 owner、数据一致、formats 可用 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-22.md</Path>` |
| 失败路径 | malicious/native matrix | junction/root replace/locked/permission/converter failure | fail closed、磁盘不误改、资源清理 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-22.md</Path>` |
| 回归 | production package | `npm run dist:win` + NSIS install/start/teardown smoke | package/runtime/native assets 完整 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-22.md</Path>` |
| E2E（owner：当前 Ticket 实现 owner） | Electron CDP direct flow | 打开 main → edit/history/restore → Office search | Windows production 用户流程一致 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-22.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** platform harness → native matrix → package build → installed-app smoke；无数据迁移。
- **兼容窗口：** 无旧 Windows profile/schema compatibility。
- **监控信号：** watcher/descriptor counts、health transitions、restore/extraction outcomes、package/launch logs。
- **回滚或前向恢复：** Gate 失败回到 owning product Ticket 修复后整套重跑；不放宽/跳过断言。
- **不可逆操作与批准点：** 不签名、不发布；外部 CI/runner 写入与 Git integration 需明确授权。
- **收缩条件：** 所有 blocking rows 通过，未执行项为零，temp/process cleanup 完成。

## 10. 验收标准

- [ ] `AC-009`/`AC-010`：Windows native watcher/cutover overlap 为 0且无 descriptor leak。
- [ ] `AC-014`—`AC-017`：root security 与 restore consistency 在真实 Windows 通过。
- [ ] `AC-018`—`AC-023`：native extraction/Office/Materialize/Transfer contracts 通过。
- [ ] `AC-027`：`dist:win`、NSIS install/start/smoke Evidence 全部通过。
- [ ] 完整结果记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-22.md</Path>`，无关键 skip。
