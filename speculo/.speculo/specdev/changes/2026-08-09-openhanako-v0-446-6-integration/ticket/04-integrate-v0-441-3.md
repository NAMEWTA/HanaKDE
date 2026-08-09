---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-04
title: 整合上游 v0.441.3 checkpoint
status: in_progress
planning_depth: deep
planning_depth_reason: "整仓 release checkpoint 约含 30 个提交、144 个文件和 25 个重叠路径，涉及共享 runtime 与产品表面。"
ready: true
risk: high
blocked_by: [T-03]
contract_ids: [AC-001, AC-002, AC-003]
owner: Worker-T-04 / Lead
expected_changes: ["<Path>**</Path>"]
writable_paths: ["<Path>**</Path>"]
read_only_paths: []
shared_paths: []
shared_path_owners: []
---

# Ticket T-04: 整合上游 v0.441.3 checkpoint

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/04-integrate-v0-441-3.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>`

## 1. 战略与来源

- **目标：** 从 `v0.433.1` 继续吸收至 `v0.441.3`，让上游 runtime、provider、session、UI 和安全修复进入 HanaKDE 新基线。
- **可观察产出：** 独立可构建的 `v0.441.3` checkpoint，具有完整 conflict/semantic audit 和双合同回归结果。
- **来源：** `US-001`、`AC-001`—`AC-003`、`ADR-001`、`DEC-001`、`DEC-013`。
- **当前事实：** 规划增量为约 30 commits、144 files、25 overlaps；实施以 T-01 Evidence 为准。
- **Planning Depth 原因：** checkpoint 修改整仓共享面，必须保持可回退的 ancestry 与合同并集。

## 2. 决策状态

### 已锁定决策

- 上游正常迭代默认接受；HanaKDE 仅为真实产品、安全、数据或开放边界差异做语义融合。
- 不用 ours/theirs 批量覆盖 overlap；每项归类并记录。
- 不在 merge conflict 中实现后续 Resource/Workspace/History 重构。

### 已采用的低影响假设

- 受影响测试从实际 diff 和既有脚本推导；不存在的脚本不写入 Gate。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| `v0.433.1..v0.441.3` merge、最小适配、generated 重建与 audit | T-03 checkpoint、现有合同/构建门 | 后续 release、架构收敛、push/release |

## 4. 要构建什么

维护者获得一个边界清楚的 release 落点，可以逐项说明上游吸收、HanaKDE 保留和 semantic integration，并能在失败时停留在 T-03 而不污染后续 checkpoint。

## 5. 实现契约

- **入口或接缝：** 经授权 staged merge、Git audit、定向测试和基础质量门。
- **输入与输出：** T-03 checkpoint + `v0.441.3^{commit}` → 验证完成的 checkpoint。
- **公共接口变化：** 只接受冻结上游此区间正常接口；超出 Spec 的公共语义改变触发偏差。
- **不变量：** predecessor 已绿、用户修改受保护、无后续架构工作夹带、无未裁决冲突。
- **状态或数据流：** predecessor proof → merge → classify/adapt → regenerate → test → checkpoint audit。
- **错误与失败行为：** 未授权或任一阻断门失败即停止，不开始 T-05。
- **兼容要求：** 保留 HanaKDE 外部合同，不增加内部 legacy compatibility。
- **安全与隐私要求：** 更严格的授权与 fail-closed 结果优先，Evidence 脱敏。

## 6. 执行路线

1. 复核 T-03 SHA、工作树和本 checkpoint 授权。
2. staged merge `v0.441.3` 并冻结冲突、删除和生成物清单。
3. 按五类规则逐项裁决，只做最小必要适配。
4. 重建 lock/generated 输出并运行差异驱动测试。
5. 运行 HanaKDE 核心合同和基础质量门，记录失败分类。
6. 经 commit 授权形成 checkpoint，确认没有 push/release。

## 7. 路径访问契约

- **预计修改点：** `<Path>**</Path>`，由 merge index 固定实际清单。
- **可写范围：** `<Path>**</Path>`，仅此 release 增量与最小适配。
- **只读上下文：** 无额外范围。
- **共享路径：** 无；integration Tickets 串行。
- **保留或不动：** 未授权用户修改、后续基础设施设计和远程 refs。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | ancestry + affected tests | `git merge-base --is-ancestor v0.441.3 HEAD` 和定向测试 | checkpoint 与上游行为成立 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>` |
| 失败路径 | merge gate | 扫描 unmerged entries、generated drift、未授权动作 | 任一存在即停止 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>` |
| 回归 | contract union | Resource/Knowledge/Transfer/Workbench/security 套件 | HanaKDE 合同保持 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** T-03 后的 Git checkpoint；无数据迁移。
- **兼容窗口：** 无：未发布新基线。
- **监控信号：** SHA、ancestry、conflicts、tests、build 与 audit coverage。
- **回滚或前向恢复：** commit 前 abort；commit 后经批准回到 T-03 或前向修复。
- **不可逆操作与批准点：** branch/merge/commit/tag/push 分别需用户授权。
- **收缩条件：** 冲突与临时兼容为零，checkpoint 绿色且 audit 完整。

## 10. 验收标准

- [ ] `AC-001`：`v0.441.3` checkpoint 可审计。
- [ ] `AC-002`：正常上游变化已吸收。
- [ ] `AC-003`：HanaKDE 核心合同无回退。
- [ ] 验证矩阵记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-04.md</Path>`。
- [ ] 无未批准 Git 或范围偏差。
