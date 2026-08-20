---
schema_version: 3
artifact: ticket
change: 2026-08-12-openhanako-v0-446-6-platform-gates
id: T-23
title: 通过 macOS 阻断门
status: blocked
planning_depth: deep
planning_depth_reason: "macOS x64/arm64、recursive watcher、物理 sleep/resume、literal descriptor、native extraction、DMG/app 与共享启动恢复是独立原生阻断 Gate。"
ready: false
risk: critical
blocked_by: [T-27, T-28, T-29]
contract_ids: [AC-009, AC-010, AC-012, AC-013, AC-014, AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-027, AC-029, AC-030, AC-031]
owner: macos-gate-owner
expected_changes: ["<Path>scripts/platform/macos/**</Path>", "<Path>tests/platform/macos/**</Path>"]
writable_paths: ["<Path>scripts/platform/macos/**</Path>", "<Path>tests/platform/macos/**</Path>"]
read_only_paths: ["<Path>package.json</Path>", "<Path>package-lock.json</Path>", "<Path>shared/runtime-dependency-integrity.cjs</Path>", "<Path>scripts/verify-runtime-dependencies.mjs</Path>", "<Path>desktop/**</Path>", "<Path>server/**</Path>", "<Path>lib/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-23: 通过 macOS 阻断门

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/23-macos-blocking-gate.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-23.md</Path>`

## 1. 战略与来源

- **目标：** 在包含 T-27 的最终固定点补齐 macOS x64、物理 sleep/wake、literal descriptor 和受共享启动路径影响的 package/startup Evidence。
- **可观察产出：** arm64/x64 原生 watcher/security/restore/extraction、DMG/app、启动完整性和组件修复均有新鲜通过证据。
- **来源：** `US-011`—`US-014`、`AC-009`—`AC-010`、`AC-012`—`AC-023`、`AC-027`、`AC-029`—`AC-031`、`ADR-002`。
- **当前事实：** 旧 T-23 Evidence 已有 macOS arm64 与 direct-flow 成果，但仍缺 x64、物理 sleep/wake、literal descriptor；T-27 修改 shared startup 后，相关 package/start Evidence 必须重跑。
- **Planning Depth 原因：** descriptor、sleep/resume、x64 native、app/DMG 和用户恢复必须由真实 macOS 观察，且直接决定最终发布 Gate。

## 2. 决策状态

### 已锁定决策

- T-27 done/Evidence 是开始条件；T-23 不修改共享产品路径。
- arm64 既有通过可作为历史参照，但最终 verdict 必须记录 T-27 后的受影响重跑和所有原残余。
- x64、物理 sleep/wake、literal descriptor 与 app/DMG startup 不得由 arm64、mock 或代码阅读替代。
- unsigned/local package mode 可用于本地 Gate，但 app bundle 内容和启动行为必须真实。
- 所有 fixture、app process、descriptor、staging 与隔离 HANA_HOME 必须清理。

### 已采用的低影响假设

- 无签名证书时沿用仓库允许的 unsigned/local package 流程；不降低 bundle inventory、native runtime 或启动恢复断言。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| macOS runner/fixtures、x64/arm64 residual、sleep/descriptor、app/DMG/startup repair smoke 与最终 Evidence | T-27 产品修复、existing macOS runner、旧 arm64 Evidence、T-21 package inputs | 产品代码修复、sign/notarize/publish、Windows/Linux 替代、真实用户数据 |

## 4. 要构建什么

在真实 macOS 环境按最终 SHA 运行 recursive watcher、descriptor、rapid edit、sleep/resume、root security、restore 与 native extraction；补齐 x64 机器/runner，并重建 app/DMG。用隔离 Profile 验证完整启动、依赖 preflight、packaged component repair 和 optional preferences。旧 Evidence 只作为历史对比，新 Evidence 必须明确哪些行重跑、哪些原 residual 关闭。

## 5. 实现契约

- **入口或接缝：** macOS-only runner、filesystem/native fixtures、`volta run npm run dist`、app/DMG inventory/start、Electron direct flow。
- **输入与输出：** T-27 final SHA + arm64/x64 hosts + isolated fixtures → per-contract logs、descriptor counts、package inventory、startup/repair results、cleanup。
- **公共接口变化：** 无；仅 platform harness/Evidence，产品代码只读。
- **不变量：** real macOS；blocking residual 无 skip；shared product paths read-only；Evidence 含 arch/SHA/command；测试状态隔离。
- **状态或数据流：** preflight → native matrix → sleep/resume → package → app startup/direct flow/repair → teardown/Evidence。
- **错误与失败行为：** 产品、基线、环境和无效验证分类；产品失败返回 owning Ticket，环境缺失保持 Ticket 未完成。
- **兼容要求：** 当前唯一新基线；无需旧 Profile/migration。
- **安全与隐私要求：** symlink/root replacement fail closed；repair 白名单不触碰用户数据；日志脱敏，descriptor/process/temp root 全清理。

## 6. 执行路线

1. 确认 T-27 Evidence/final SHA，准备 arm64 与 x64 真机/runner、隔离 HANA_HOME 和 sleep/wake 操作窗口。
2. clean install 并运行 dependency verifier、受影响 Vitest、recursive/descriptor/rapid/sleep-gap/root/symlink native matrix。
3. 运行 restore/extraction/Office/Knowledge matrix，记录 literal descriptor 与 sleep/resume 前后资源状态。
4. 分别执行适用架构 package build，检查 app/DMG/native assets/seed，并启动 app 完成关键 direct flow。
5. 注入隔离组件缺失，验证一次退避、取消、确认修复、失败不循环和 preferences ENOENT；清理进程与 Profile。
6. 汇总旧 Evidence 与新 final-SHA Evidence，所有残余和受影响行通过后标 done。

## 7. 路径访问契约

- **预计修改点：** 仅 macOS runner/fixture/test 在补齐残余场景时修改。
- **可写范围：** `<Path>scripts/platform/macos/**</Path>` 与 `<Path>tests/platform/macos/**</Path>`。
- **只读上下文：** manifests、T-27 shared verifier/Desktop、Server/lib。
- **共享路径：** 无。
- **保留或不动：** 产品代码、Windows harness、sign/notarize/release state、真实用户 Profile。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | macOS native runner | arm64/x64 watcher/reconcile/restore/extraction/Knowledge suite | 单 owner、一致性、formats 与架构 runtime 可用 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-23.md</Path>` |
| 失败路径 | native/security matrix | physical sleep-gap、symlink/root replace、converter/module failure | fail closed、repair 正确、descriptor/process 清理 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-23.md</Path>` |
| 回归 | production package | `dist` + app/DMG inventory/start | native assets 与启动路径完整，受 T-27 影响行新鲜通过 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-23.md</Path>` |
| E2E（owner：macos-gate-owner） | packaged Electron app | direct flow + isolated component repair | 用户流程一致，确认 repair 恢复，取消/失败不循环 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-23.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** T-27 → arm64/x64 residual → package/startup/repair → Evidence；无数据迁移。
- **兼容窗口：** 只验证最终 fixed SHA；旧 arm64 Evidence 不替代共享路径修改后的重跑。
- **监控信号：** descriptor counts、health transitions、sleep/gap/repair、dependency preflight、package startup、artifact repair、cleanup。
- **回滚或前向恢复：** 产品失败回 owning Ticket 并使受影响 Evidence 失效；环境 blocker 补齐硬件/runner 后从相同 fixed SHA 重跑。
- **不可逆操作与批准点：** 物理 sleep/wake 由运行者明确执行；不签名/notarize/发布，不操作真实用户数据或远程状态。
- **收缩条件：** x64、physical sleep/wake、literal descriptor 与 T-27 后 package/startup residual 全部通过，未执行为零，资源清理完成。

## 10. 验收标准

- [ ] `AC-009`/`AC-010`/`AC-012`—`AC-023`：arm64/x64、physical sleep/wake、literal descriptor 和 native matrix 无阻断缺口。
- [ ] `AC-027`：app/DMG inventory、launch 和 direct flow 在最终 SHA 通过。
- [ ] `AC-029`—`AC-031`：dependency preflight、packaged repair 和 optional preferences 在 macOS package 路径通过。
- [ ] 新鲜结果、架构/OS、命令、cleanup 与旧 Evidence 关系记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-23.md</Path>`。
- [ ] 实际修改未超出 macOS harness writable paths，无产品代码越权或未批准发布动作。
