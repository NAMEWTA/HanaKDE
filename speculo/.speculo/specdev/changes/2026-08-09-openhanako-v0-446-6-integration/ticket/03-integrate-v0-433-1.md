---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-03
title: 整合上游 v0.433.1 checkpoint
status: done
planning_depth: deep
planning_depth_reason: "第二个整仓 checkpoint 约含 65 个提交、181 个文件和 27 个重叠路径，继续改变共享 runtime 与 UI。"
ready: true
risk: high
blocked_by: [T-02]
contract_ids: [AC-001, AC-002, AC-003]
owner: Worker-T-03 / Lead
expected_changes: ["<Path>**</Path>"]
writable_paths: ["<Path>**</Path>"]
read_only_paths: []
shared_paths: []
shared_path_owners: []
---

# Ticket T-03: 整合上游 v0.433.1 checkpoint

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/03-integrate-v0-433-1.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>`

## 1. 战略与来源

- **目标：** 从已验证的 `v0.421.24` checkpoint 吸收至 `v0.433.1`，保持上游 runtime/session/provider 迭代与 HanaKDE 产品合同的语义并集。
- **可观察产出：** 新 checkpoint 可构建、可运行并有独立 conflict/semantic audit，成为 T-04 的唯一输入。
- **来源：** `US-001`、`AC-001`—`AC-003`、`ADR-001`、`DEC-001`、`DEC-013`。
- **当前事实：** 规划增量约 65 commits、181 files、27 overlaps；实际增量由 T-01/T-02 Evidence 重新确认。
- **Planning Depth 原因：** 大范围共享 runtime 与 UI 变化要求整仓 Gate 和可恢复 checkpoint。

## 2. 决策状态

### 已锁定决策

- 继续使用五类冲突裁决；普通上游变化默认接受。
- HanaKDE Knowledge/Resource/Transfer/Workbench 和安全开放边界只在真实冲突处语义融合。
- 不提前实现 File History、Document Extraction 或 watcher convergence；只保留后续可收敛的单一路线，不增加兼容壳。

### 已采用的低影响假设

- 新增依赖与 generated 输出按整合后的 `<Path>package.json</Path>` 和仓库现有生成命令重建。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| `v0.421.24..v0.433.1` staged merge、最小适配和 checkpoint audit | T-02 已验证结果、现有合同测试、冲突分类 | 后续 release、资源基础设施重构、远程写入或发布 |

## 4. 要构建什么

维护者可以单独检查此 release 区间吸收了什么、HanaKDE 保留了什么、哪些路径做了语义融合。只有当这一 checkpoint 的上游回归和 HanaKDE 合同同时成立时，后续 release 才可开始。

## 5. 实现契约

- **入口或接缝：** 经授权 Git staged merge、package/build 和定向合同套件。
- **输入与输出：** T-02 checkpoint + `v0.433.1^{commit}` → 绿色 checkpoint 和 audit。
- **公共接口变化：** 接受此 release 正常上游接口；任何影响 Spec 外部语义的差异必须停止并上报偏差。
- **不变量：** 不跳过 T-02；不夹带 T-10 以后重构；不删除 HanaKDE 已锁定合同。
- **状态或数据流：** verify predecessor → merge → classify → adapt → regenerate → verify → record。
- **错误与失败行为：** predecessor 不绿、Git 未授权、冲突或回归未关闭时不得形成完成 checkpoint。
- **兼容要求：** 保留外部 HanaKDE 合同，不保留未发布内部旧实现。
- **安全与隐私要求：** 权限、root、network 与 renderer 边界冲突采用已锁定的 fail-closed 合同。

## 6. 执行路线

1. 证明 T-02 checkpoint 和工作树保护条件仍成立，确认本次 merge 授权。
2. staged merge `v0.433.1` 并固定冲突/新增/删除/generated 清单。
3. 按上游权威、HanaKDE 权威和语义融合分类解决，删除无价值内部兼容分支。
4. 重建依赖/生成物并运行受影响模块的定向测试。
5. 运行基础质量门和 HanaKDE 核心合同，记录 patch-equivalence 与裁决。
6. 在独立 commit 授权后形成 checkpoint；不 push、不继续 T-04。

## 7. 路径访问契约

- **预计修改点：** `<Path>**</Path>`，实际路径由 merge index 提供。
- **可写范围：** `<Path>**</Path>`，仅本 release 增量及最小适配。
- **只读上下文：** 无额外范围。
- **共享路径：** 无；与相邻 integration Tickets 串行。
- **保留或不动：** 未授权用户修改、远程 refs 与 T-10 以后职责收敛。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | checkpoint ancestry/build | `git merge-base --is-ancestor v0.433.1 HEAD` 与受影响测试 | ancestry 与正常上游行为成立 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>` |
| 失败路径 | checkpoint gate | 检查 unresolved conflict、generated drift、未授权动作 | 任一存在即停止 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>` |
| 回归 | HanaKDE contract union | Resource、Knowledge、Transfer、Workbench 与安全定向测试 | 既有合同保持 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 仅在 T-02 后推进 Git checkpoint；不迁移用户数据。
- **兼容窗口：** 无：新基线直接收敛。
- **监控信号：** ancestry、conflict count、test/build、generated drift 和 audit completeness。
- **回滚或前向恢复：** commit 前 abort；commit 后在授权下回到 T-02 checkpoint 或前向修复。
- **不可逆操作与批准点：** merge/commit/tag/push 需分别授权；无授权不执行。
- **收缩条件：** 冲突与临时分支为零，checkpoint 质量门绿色且 audit 完整。

## 10. 验收标准

- [ ] `AC-001`：`v0.433.1` checkpoint 与语义裁决可审计。
- [ ] `AC-002`：此增量正常上游变化完整吸收。
- [ ] `AC-003`：HanaKDE 核心产品与安全合同无回退。
- [ ] 验证矩阵全部记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-03.md</Path>`。
- [ ] 没有未授权 Git 副作用或范围偏差。
