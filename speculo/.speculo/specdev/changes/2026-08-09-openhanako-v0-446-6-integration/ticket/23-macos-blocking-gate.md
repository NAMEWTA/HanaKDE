---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-23
title: 通过 macOS 阻断门
status: review
planning_depth: deep
planning_depth_reason: "macOS recursive watcher、sleep/resume、case/symlink、native extraction 与 DMG/app production package 是独立原生阻断 Gate。"
ready: true
risk: critical
blocked_by: [T-21]
contract_ids: [AC-009, AC-010, AC-012, AC-013, AC-014, AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-027]
owner: Worker-T-23 / Lead平台验收
expected_changes: ["<Path>scripts/platform/macos/**</Path>", "<Path>tests/platform/macos/**</Path>", "<Path>core/plugin-context.ts</Path>", "<Path>tests/plugin-context.test.ts</Path>"]
writable_paths: ["<Path>scripts/platform/macos/**</Path>", "<Path>tests/platform/macos/**</Path>", "<Path>core/plugin-context.ts</Path>", "<Path>tests/plugin-context.test.ts</Path>"]
read_only_paths: ["<Path>package.json</Path>", "<Path>package-lock.json</Path>", "<Path>desktop/**</Path>", "<Path>lib/**</Path>", "<Path>server/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-23: 通过 macOS 阻断门

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/23-macos-blocking-gate.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-23.md</Path>`

## 1. 战略与来源

- **目标：** 在真实 macOS runner 上执行 recursive watcher/descriptor/sleep-resume/gap-reconcile/root security/restore/native extraction 与 `dist` DMG/app smoke，形成独立阻断 Evidence。
- **可观察产出：** macOS case-insensitive filesystem、symlink、rapid change、sleep/resume、native package 行为全部通过；失败阻止 umbrella completion。
- **来源：** `US-011`、`US-012`、`AC-009`、`AC-010`、`AC-012`—`AC-023`、`AC-027`、`ADR-008`。
- **当前事实：** 仓库已有 `npm run dist`、macOS helper/entitlement/notarize 工具与 Knowledge E2E；新唯一 watcher/restore/extraction 需原生 Gate。
- **Planning Depth 原因：** recursive watch、sleep/resume、native asset 与 app bundle 行为必须在真实 macOS 验证且直接决定可发布性。

## 2. 决策状态

### 已锁定决策

- 必须真实 macOS 执行；Windows/Linux 结果不能替代。
- 覆盖 recursive watcher、descriptor count、rapid changes、sleep/resume、event loss/reconcile、case-insensitive root、symlink、restore、native extraction。
- 必须运行 `npm run dist` 并对 app/DMG 做 production smoke；本 Ticket 不签名、不 notarize、不发布。
- 任一阻断项失败则保持未完成，不以环境 skip 当作通过。

### 已采用的低影响假设

- 本地无签名证书时使用仓库允许的 unsigned/local package mode，但 app bundle 内容与启动 smoke 仍必须真实执行。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| macOS-only fixtures/runner、watch/security/restore/extraction/package Gate、Evidence | T-21 package inputs、existing mac helpers/E2E | product fixes outside harness、sign/notarize/publish、Linux替代 |

## 4. 要构建什么

macOS runner 创建大小写别名、symlink、rapid edits 和 sleep/resume/event-loss 场景，证明 watcher/repair/restore/Knowledge/Extraction 最终一致且 descriptor 被释放。随后构建 DMG/app，检查 native assets 并启动 production app 完成关键 user-flow smoke。任何关键失败都明确阻断。

## 5. 实现契约

- **入口或接缝：** macOS-only runner, filesystem/native fixtures, Electron package/app smoke, `npm run dist`。
- **输入与输出：** frozen code/package inputs + macOS fixtures → per-contract logs, app bundle inventory, launch/smoke results。
- **公共接口变化：** 无；仅验证已锁定 contracts。
- **不变量：** real macOS execution；no blocking skips；one watcher/baseline；cleanup descriptors/processes/temp roots。
- **状态或数据流：** build/app bundle → fixture setup → native contract tests → launch/E2E → cleanup/Evidence。
- **错误与失败行为：** sleep/resume/gap/native/permission/package failures 分类；关键项无法运行即未通过。
- **兼容要求：** 只验证当前新基线，无旧 Profile/migration。
- **安全与隐私要求：** symlink/root replacement fail closed，logs redacted，test roots/processes清理。

## 6. 执行路线

1. 建立 macOS-only fixtures/runner，复用 T-21 shared package inputs。
2. 运行 recursive/descriptor/rapid/sleep-resume/gap-reconcile/case/symlink native matrix。
3. 运行 restore TOCTOU/consistency 与 Document Extraction/Office Knowledge matrix。
4. 执行 `npm run dist`，检查 app/DMG 的 runtime closure/native assets。
5. 启动 production app，运行关键 direct-flow smoke 并清理进程/临时资源。
6. 分类失败并发布完整 macOS Evidence；任一阻断失败不标 done。

## 7. 路径访问契约

- **预计修改点：** macOS-only scripts/fixtures/tests。
- **可写范围：** 仅 `<Path>scripts/platform/macos/**</Path>` 与 `<Path>tests/platform/macos/**</Path>`。
- **只读上下文：** shared manifests、product code、Desktop/native source。
- **共享路径：** 无；T-21 拥有 package/CI，T-22 使用独立 Windows paths。
- **保留或不动：** shared scripts/manifests、Windows harness、sign/notarize/release state。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | macOS native runner | watcher/reconcile/restore/extraction/Knowledge suite | 单 owner、数据一致、formats 可用 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-23.md</Path>` |
| 失败路径 | native/security matrix | sleep-gap/symlink/root replace/converter failure | fail closed、repair正确、资源清理 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-23.md</Path>` |
| 回归 | production package | `npm run dist` + app/DMG inventory/start/teardown | package/runtime/native assets 完整 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-23.md</Path>` |
| E2E（owner：当前 Ticket 实现 owner） | Electron direct flow | 打开 main → external edit/history/restore → Office search | macOS production 用户流程一致 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-23.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** platform harness → native matrix → package build → app smoke；无数据迁移。
- **兼容窗口：** 无旧 macOS profile/schema compatibility。
- **监控信号：** descriptors、health transitions、gap/repair、restore/extraction outcomes、package/launch logs。
- **回滚或前向恢复：** Gate 失败回 owning Ticket 修复后整套重跑；不跳过或放宽断言。
- **不可逆操作与批准点：** 不签名/notarize/发布；Git integration 或外部 runner 写入需明确授权。
- **收缩条件：** blocking rows 全过、关键未执行为零、temp/process/descriptor cleanup 完成。

## 10. 验收标准

- [ ] `AC-009`/`AC-010`/`AC-012`/`AC-013`：macOS watcher/cutover/gap/health 原生合同通过。
- [ ] `AC-014`—`AC-017`：root security 与 restore convergence 通过。
- [ ] `AC-018`—`AC-023`：native extraction/Office/Materialize/Transfer 通过。
- [ ] `AC-027`：`dist`、app/DMG inventory、launch/smoke Evidence 全过。
- [ ] 完整结果记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-23.md</Path>`，无关键 skip。
