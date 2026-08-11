---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-25
title: 完成 umbrella 最终验收
status: in_progress
planning_depth: deep
planning_depth_reason: "28 项验收合同、15 项 DoD、Git ancestry、整仓质量、双平台 package 和去冗余 Evidence 在此形成最终阻断汇合。"
ready: true
risk: critical
blocked_by: [T-22, T-23, T-24]
contract_ids: [AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011, AC-012, AC-013, AC-014, AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-024, AC-025, AC-026, AC-027, AC-028]
owner: Worker-T-25 / Lead final owner
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

- **目标：** 在所有功能/平台/文档 Tickets 完成后，对冻结 ancestry、28 AC、15 项 umbrella DoD、整仓质量、重复基础设施和 Evidence 完整性做一次只读最终判定。
- **可观察产出：** 形成明确 pass/fail umbrella verdict；只有 Windows/macOS、production packages、结构去冗余和全部行为合同同时通过，change 才可进入实现完成/reconcile 路由。
- **来源：** `US-001`—`US-012`、`AC-001`—`AC-028`、`DEC-001`—`DEC-015`、`USER-DECISION:umbrella-change`。
- **当前事实：** 本 Ticket 不实现修复；任何失败回到 owning Ticket，修复后重跑受影响 Gate 与本验收。
- **Planning Depth 原因：** 这是整仓、双平台、发布与安全合同的最终 Gate，错误放行事故半径最大。

## 2. 决策状态

### 已锁定决策

- target 必须是最终 HEAD ancestor；不能用 patch equivalence 或无冲突替代 ancestry。
- Windows 和 macOS 均阻断；Linux 只附加，不得替代或阻断。
- watcher/mutation/baseline/root helper/parser duplicates 必须删除；不接受临时 dual-run、feature flag 或 compatibility shell。
- 无 legacy migration/旧 Profile/OCR/relocation/public workspaceId/mount History。
- 本 Ticket 不授权 commit/merge/push/release/deploy/archive；只形成 Evidence 与完成建议。

### 已采用的低影响假设

- 基础质量命令以最终 `<Path>package.json</Path>` 实际 scripts 为准，并至少包含 test/typecheck/lint/build:client。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| ancestry/audit、AC/DoD coverage、quality/platform/package/security/structure/Evidence review、verdict | T-01..T-24 Evidence、final code/docs/package outputs | 产品修复、Git/remote/release/archive side effects、waive blocking AC |

## 4. 要构建什么

验收 owner 从最终 fixed point 重跑 ancestry、基础质量和关键跨模块场景，审查 Windows/macOS 原生/package Evidence，扫描重复 owner/parser/migration/OCR/forbidden interfaces，并逐项映射 28 AC 与 15 DoD。任何缺失、skip、未批准偏差或环境无法验证都得到 fail/blocked，而不是推断通过。

## 5. 实现契约

- **入口或接缝：** Git fixed-point commands、project quality scripts、platform Evidence、structural scans、AC/DoD checklist。
- **输入与输出：** final HEAD + T-01..T-24 Evidence → signed-off local verdict with failures/residual risks/next route。
- **公共接口变化：** 无；仅文档、只读最终验收，无代码变更。
- **不变量：** no skipped blocking contract；failures classified；Evidence maps exact SHA/platform/command；verdict does not mutate repo/remote。
- **状态或数据流：** freeze final HEAD → run/read Gates → map AC/DoD → structural/security review → pass/fail verdict。
- **错误与失败行为：** 任一 blocking command/AC/platform/Evidence/scan 失败则 Ticket 不 done并路由 owning Ticket。
- **兼容要求：** 验证唯一新基线，不接受 legacy compatibility 作为成功条件。
- **安全与隐私要求：** Evidence 脱敏；不泄漏 root/token/content；恶意 workspace Gate 必须真实通过。

## 6. 执行路线

1. 冻结最终 HEAD/worktree，验证 target ancestry、checkpoint SHAs、sync ledger 与所有 Ticket Evidence identity。
2. 运行 clean install、test、typecheck、lint、client/server build 与适用 Knowledge/UI E2E。
3. 审查 T-22/T-23 的真实平台、native、package 和 direct-flow Evidence，无 blocking skip。
4. 运行 watcher/mutation/baseline/root helper/parser/migration/OCR/raw-root/public-workspaceId 结构扫描。
5. 逐项判定 AC-001..AC-028 与 15 DoD，记录命令、结果、失败分类和残余风险。
6. 形成 pass/fail verdict；失败回 owning Ticket，全部通过才建议进入实现完成/reconcile。

## 7. 路径访问契约

- **预计修改点：** 无代码变更；只写最终 Evidence。
- **可写范围：** 项目路径为空；SpecDev Evidence 工件按工作流边界写入。
- **只读上下文：** `<Path>**</Path>` 与全部当前 change 工件/Evidence。
- **共享路径：** 无。
- **保留或不动：** final code、Git refs/index/worktree、platform artifacts、remote/release/archive state。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | umbrella contract matrix | ancestry + 28 AC + 15 DoD + base quality | 每项有通过 Evidence，无 missing/deferred | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-25.md</Path>` |
| 失败路径 | blocking gate audit | 注入/识别 failed/skipped/stale/mismatched Evidence | verdict 为 fail，不修改项目，不伪装完成 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-25.md</Path>` |
| 回归 | structural/security scan | duplicate owner/parser/legacy/OCR/raw-root scans | 禁止项为零，安全合同保持 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-25.md</Path>` |
| E2E（owner：当前 Ticket 验收 owner） | integrated direct flows | 复核 Workspace/Agent/@/Office flows 的 final-SHA traces | traces 属于最终 SHA 且所有用户流程通过 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-25.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 不适用：只验收新基线，不迁移数据。
- **兼容窗口：** 无：legacy compatibility 本身是失败扫描项。
- **监控信号：** AC/DoD pass counts、platform/package status、quality commands、duplicate scans、Evidence SHA freshness。
- **回滚或前向恢复：** 失败回 owning Ticket 前向修复并重跑相关 Gate；本 Ticket不操作 Git/生产。
- **不可逆操作与批准点：** commit/merge/push/release/deploy/archive 均不授权，需后续独立明确批准。
- **收缩条件：** 所有 blocking failure/missing/skip/deviation 为零，28 AC 与 15 DoD 全部有 final-SHA Evidence。

## 10. 验收标准

- [ ] `AC-001`—`AC-028`：每项均有 final-SHA、可重复、通过的 Evidence。
- [ ] 15 项 umbrella Definition of Done 全部通过且没有用单平台/merge-no-conflict 代替。
- [ ] Windows/macOS native/package Gates 均通过；Linux 状态仅附加。
- [ ] duplicate owner/parser/legacy/OCR/raw-root/public workspaceId 扫描为零。
- [ ] 最终 verdict 与失败分类记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-25.md</Path>`。
- [ ] 本 Ticket 未产生任何未授权 Git、remote、release 或 archive 副作用。
