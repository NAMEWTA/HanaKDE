---
schema_version: 3
artifact: ticket
change: 2026-08-12-openhanako-v0-446-6-platform-gates
id: T-25
title: 完成 umbrella 最终验收
status: done
planning_depth: deep
planning_depth_reason: "31 项验收合同、15 项原 umbrella DoD、Git ancestry、整仓质量、双平台 package、启动完整性和结构 Evidence 在此形成最终阻断汇合。"
ready: false
risk: critical
blocked_by: [T-22, T-23]
contract_ids: [AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011, AC-012, AC-013, AC-014, AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-024, AC-025, AC-026, AC-027, AC-028, AC-029, AC-030, AC-031]
owner: final-acceptance-owner
expected_changes: []
writable_paths: []
read_only_paths: ["<Path>**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-25: 完成 umbrella 最终验收

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/25-final-umbrella-acceptance.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-25.md</Path>`

## 1. 战略与来源

- **目标：** 在 T-27、Windows 和 macOS Gate 完成后，对最终固定点的 AC-001—AC-031、15 项原 DoD、质量、结构与 Evidence 做只读终审。
- **可观察产出：** 明确 pass/fail verdict；只有启动完整性、双平台 production/native、原 umbrella 行为和结构去冗余同时通过，change 才可完成。
- **来源：** `US-001`—`US-015`、`AC-001`—`AC-031`、`ADR-001`—`ADR-004`。
- **当前事实：** 旧 T-25 Evidence 基于 T-27 之前的固定点，且当时 T-22/T-23 未全部通过；它是历史审计输入，不是最终 verdict。
- **Planning Depth 原因：** 这是整仓、双平台、安全、package 与启动恢复的最终阻断汇合，错误放行事故半径最大。

## 2. 决策状态

### 已锁定决策

- T-22/T-23 done 且 Evidence 指向同一包含 T-27 的最终 SHA 后才能开始。
- target 必须是最终 HEAD ancestor；不以 patch equivalence 或无冲突替代 ancestry。
- Windows/macOS 均阻断；Linux 仅附加。
- 旧统一模块缺失自动更新文案调用点、重复 watcher/mutation/baseline/root helper/parser 和禁止兼容状态必须归零。
- 本 Ticket 为仅文档/只读验收，无代码变更；发现任何产品失败必须退回 owning Ticket，不在 T-25 修复。
- 未授权 commit、merge、push、release、deploy、archive 或远程写入。

### 已采用的低影响假设

- 基础质量命令以最终 `<Path>package.json</Path>` scripts 为准，并至少包含 test、typecheck、lint、build:client 和 verify:runtime-deps。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| final SHA/ancestry、31 AC、15 DoD、quality、双平台/package/startup、结构扫描、Evidence/verdict | 归档 T-01..T-21/T-24/T-26 Evidence、当前 T-27/T-22/T-23 Evidence | 产品修复、waive blocking AC、Git/remote/release/archive side effects |

## 4. 要构建什么

验收 owner 冻结最终 HEAD，验证 ancestry 和所有 Evidence identity，重跑基础质量与关键反向门禁，审查 Windows/macOS native/package/startup recovery 结果，并逐项映射 AC-001—AC-031 与原 15 DoD。任何 stale、skip、missing、失败、未批准偏差或无效验证都产生 fail/blocked verdict，返回实际 owner。

## 5. 实现契约

- **入口或接缝：** Git fixed-point、project quality scripts、T-27/T-22/T-23 Evidence、归档 Evidence、structural scans、AC/DoD matrix。
- **输入与输出：** final HEAD + complete Evidence → 本地只读 verdict、失败 owner、残余风险和下一路由。
- **公共接口变化：** 无；仅文档验收，不修改代码。
- **不变量：** no blocking skips；Evidence SHA/platform/command 可追踪；T-25 不修复；verdict 不产生远程或发布副作用。
- **状态或数据流：** freeze HEAD → verify ancestry/Evidence → run quality/reverse checks → map AC/DoD → verdict/status sync。
- **错误与失败行为：** 任一阻断命令、AC、平台、结构或 Evidence 失败则不 done；路由 owning Ticket 后相关 final Evidence 失效并重跑。
- **兼容要求：** 唯一新基线；legacy compatibility、旧统一错误语义或 lock 漂移本身是失败。
- **安全与隐私要求：** Evidence 脱敏；不写真实用户数据；恶意 workspace、artifact repair 数据边界与日志 redaction 必须有证据。

## 6. 执行路线

1. 冻结最终 HEAD/worktree，验证 target ancestry、T-27/T-22/T-23 SHA identity、状态和 Evidence 完整性。
2. 运行 runtime dependency verify、test、typecheck、lint、client/server/package 适用构建和关键 Knowledge/UI E2E，分类所有失败。
3. 审查 Windows/macOS 原生、package、direct-flow、startup/repair Evidence，无 blocking skip/stale/环境空洞。
4. 扫描重复 owner/parser/legacy/OCR/raw-root/public-workspaceId，以及旧模块缺失统一自动更新归因调用点。
5. 逐项判定 AC-001—AC-031 与 15 DoD，执行 dependency fixture 或错误分类的受控反向验证并恢复绿色。
6. 写入最终 pass/fail verdict；失败回 owner，全部通过才同步 Ticket/Map/Goal Plan/change 完成建议。

## 7. 路径访问契约

- **预计修改点：** 无项目代码变更；只更新 SpecDev Evidence/状态工件。
- **可写范围：** 无代码变更；Evidence 写入遵循工作流工件边界。
- **只读上下文：** `<Path>**</Path>`、归档与当前 change 全部权威工件。
- **共享路径：** 无。
- **保留或不动：** final code、Git refs/index/worktree、platform artifacts、remote/release/archive state。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | umbrella matrix | ancestry + AC-001—AC-031 + 15 DoD + base quality | 每项有 final-SHA 通过 Evidence，无 missing/deferred | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-25.md</Path>` |
| 失败路径 | blocking audit | 识别 failed/skipped/stale/mismatched Evidence | verdict fail，返回 owner，不修改产品或伪装完成 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-25.md</Path>` |
| 回归 | structural/reverse checks | duplicate/legacy scans；残缺 fixture 与 classification reverse test | 禁止项为零，反向用例变红后恢复绿色 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-25.md</Path>` |
| E2E（owner：final-acceptance-owner） | Evidence trace review | 复核 Workspace/Agent/Office/startup repair 的 final-SHA traces | 用户流程和组件恢复属于相同 final SHA 且均通过 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-25.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 不适用：只验收最终新基线，不执行数据迁移。
- **兼容窗口：** 无；legacy compatibility 和旧错误归因是失败扫描项。
- **监控信号：** AC/DoD pass counts、Evidence SHA、platform/package status、quality commands、dependency/startup reverse checks、duplicate scans。
- **回滚或前向恢复：** 失败回 owning Ticket 前向修复，受影响 Gate/Evidence 全部重跑；T-25 不操作 Git 或生产。
- **不可逆操作与批准点：** commit/merge/push/release/deploy/archive 均未授权；本 Ticket 只能给出本地完成建议。
- **收缩条件：** 所有 blocking failure/missing/skip/deviation 为零，31 AC 与 15 DoD 全部有 final-SHA Evidence。

## 10. 验收标准

- [ ] `AC-001`—`AC-031` 每项均有 final-SHA、可重复、通过 Evidence。
- [ ] 15 项原 umbrella DoD 全部通过，没有用单平台、旧 Evidence 或 merge-no-conflict 替代。
- [ ] Windows/macOS native/package/startup recovery Gates 均通过；Linux 仅附加。
- [ ] duplicate/legacy/old error-classification 扫描为零，dependency reverse check 有效。
- [ ] 最终 verdict、失败分类与残余风险记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-25.md</Path>`。
- [ ] 本 Ticket 无项目代码变更，未产生未授权 Git、remote、release 或 archive 副作用。

## 11. 最终验收覆盖决定（2026-08-22）

用户作为验收权威明确取消 T-23 中当前无法获得的真实 macOS x64、物理 sleep/wake、literal descriptor 及其依赖的最终 package/startup/repair 重跑要求，并要求归档。本决定覆盖本 Ticket 中“不得 waive blocking AC”的旧约束，但不把未执行测试改写为 pass。

最终 verdict 基于 `f29abef4a7a79ac9eefebe0ed4597f1252a2b29c` 上已通过的 T-27/T-28/T-29、真实 Windows T-22 Evidence、macOS arm64 与既有 package/direct-flow Evidence，以及 2026-08-22 当前 workspace 回归。T-23 为 `cancelled`；T-25 为 `done`，未执行平台行以 approved waiver 和残余风险交付。
