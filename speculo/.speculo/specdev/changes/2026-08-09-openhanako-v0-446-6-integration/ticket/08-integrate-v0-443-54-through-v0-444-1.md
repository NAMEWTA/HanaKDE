---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-08
title: 整合上游 v0.443.54 至 v0.444.1 checkpoints
status: in_progress
planning_depth: deep
planning_depth_reason: "两个紧邻 release 子 checkpoint 共约 15 个提交，后段含 52 个文件与 17 个 overlap，需分别留存可恢复审计点。"
ready: true
risk: high
blocked_by: [T-07]
contract_ids: [AC-001, AC-002, AC-003]
owner: Worker-T-08 / Lead
expected_changes: ["<Path>**</Path>"]
writable_paths: ["<Path>**</Path>"]
read_only_paths: []
shared_paths: []
shared_path_owners: []
---

# Ticket T-08: 整合上游 v0.443.54 至 v0.444.1 checkpoints

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/08-integrate-v0-443-54-through-v0-444-1.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-08.md</Path>`

## 1. 战略与来源

- **目标：** 在一个上下文内依次吸收 `v0.443.54` 和 `v0.444.1`，但保留两个独立可验证、可恢复的子 checkpoint。
- **可观察产出：** 两个 tag 的 ancestry、diff、裁决和测试结果分别可审计；T-09 仅从已验证的 `v0.444.1` 开始。
- **来源：** `US-001`、`AC-001`—`AC-003`、`ADR-001`、`DEC-001`、`DEC-013`。
- **当前事实：** `v0.443.54` 增量约 9 commits/22 files/5 overlaps；`v0.444.1` 约 6 commits/52 files/17 overlaps。
- **Planning Depth 原因：** 虽规模较小，但两个 release 必须独立 Gate，且仍触及整仓共享面。

## 2. 决策状态

### 已锁定决策

- 合并顺序固定为 `v0.443.54` 后 `v0.444.1`；第一子 checkpoint 未绿时禁止开始第二个。
- 两个子 checkpoint 分别记录 ancestry、冲突和验证，不压缩成不可审计的一次解决。
- 继续遵守上游默认吸收、HanaKDE 语义融合和零生产双 owner。

### 已采用的低影响假设

- 两个小增量适合一个新上下文，但每个 merge/commit 仍有独立授权与恢复点。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| 两个顺序子 checkpoint、各自最小适配和 audit | T-07 checkpoint、既有合同/构建门 | `v0.446.6`、架构收敛、合并验证点、push/release |

## 4. 要构建什么

维护者能在 `v0.443.54` 验证后再进入 `v0.444.1`，任何第二段失败都可回到第一段，且不会把两个 release 的冲突裁决混为一份无法追踪的记录。

## 5. 实现契约

- **入口或接缝：** 两次经授权 staged merge、两组 ancestry/contract Gate。
- **输入与输出：** T-07 checkpoint + 两个冻结 tag → 已验证 `v0.444.1` checkpoint。
- **公共接口变化：** 仅吸收各自正常上游接口；超出 Spec 的语义改变停止。
- **不变量：** tag 顺序不变；每个子 checkpoint 单独绿色；无生产双 watcher/parser/write/baseline。
- **状态或数据流：** merge 443.54 → verify/record → merge 444.1 → verify/record。
- **错误与失败行为：** 第一段失败不开始第二段；第二段失败保留第一段恢复点。
- **兼容要求：** 保留外部 HanaKDE 合同，不保留内部 legacy。
- **安全与隐私要求：** 权限和外部边界回归必须在每个受影响子段运行。

## 6. 执行路线

1. 验证 T-07 predecessor 并确认 `v0.443.54` merge 授权。
2. merge/classify/adapt/test `v0.443.54`，经授权形成子 checkpoint。
3. 复核第一子 checkpoint，再确认 `v0.444.1` merge 授权。
4. merge/classify/adapt `v0.444.1`，重建 generated/lock 输出。
5. 运行第二段定向测试、HanaKDE 核心合同和基础质量门。
6. 经 commit 授权形成最终 checkpoint，并记录两个子段 Evidence。

## 7. 路径访问契约

- **预计修改点：** `<Path>**</Path>`，每段由对应 merge index 固定。
- **可写范围：** `<Path>**</Path>`，限两个 release 增量与最小适配。
- **只读上下文：** 无额外范围。
- **共享路径：** 无；两个子 checkpoint 和相邻 Tickets 严格串行。
- **保留或不动：** 用户修改、T-09 目标差异和后续架构实现。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | two ancestry gates | 对两个 tag 分别运行 `git merge-base --is-ancestor` 与定向测试 | 两个子 checkpoint 独立成立 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-08.md</Path>` |
| 失败路径 | sequential gate | 第一段失败时检查第二段未开始；第二段失败时验证恢复点 | 不跨越失败 checkpoint | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-08.md</Path>` |
| 回归 | contract union | 每段受影响套件 + 最终核心合同 | HanaKDE 合同保持 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-08.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** `v0.443.54` → `v0.444.1`；无用户数据迁移。
- **兼容窗口：** 无：未发布新基线。
- **监控信号：** 每段 SHA、ancestry、conflicts、tests 与 audit completeness。
- **回滚或前向恢复：** commit 前 abort；第二段可在授权下回到第一子 checkpoint；不双运行。
- **不可逆操作与批准点：** 每次 merge/commit/tag/push 各自需授权。
- **收缩条件：** 两段冲突/临时分支均为零，两个 audit 均完整。

## 10. 验收标准

- [ ] `AC-001`：两个 release checkpoint 均可独立审计。
- [ ] `AC-002`：两个区间正常上游变化均完整吸收。
- [ ] `AC-003`：最终 HanaKDE 核心合同无回退。
- [ ] 验证矩阵记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-08.md</Path>`。
- [ ] T-09 只从已验证 `v0.444.1` 开始。
