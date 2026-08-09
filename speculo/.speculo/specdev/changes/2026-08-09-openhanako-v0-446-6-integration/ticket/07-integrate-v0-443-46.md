---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-07
title: 整合上游 v0.443.46 checkpoint
status: done
planning_depth: deep
planning_depth_reason: "约 49 个提交、94 个文件和 21 个 overlap，集中进入 Resource、History、Extraction 与 UI 相关增量。"
ready: true
risk: critical
blocked_by: [T-06]
contract_ids: [AC-001, AC-002, AC-003]
owner: Worker-T-07 / Lead
expected_changes: ["<Path>**</Path>"]
writable_paths: ["<Path>**</Path>"]
read_only_paths: []
shared_paths: []
shared_path_owners: []
---

# Ticket T-07: 整合上游 v0.443.46 checkpoint

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/07-integrate-v0-443-46.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-07.md</Path>`

## 1. 战略与来源

- **目标：** 吸收至 `v0.443.46`，完整保留上游新能力代码，同时为 Resource Kernel、File History、Document Extraction 和 Workbench 的后续语义融合冻结真实输入。
- **可观察产出：** checkpoint 具备可运行上游行为、HanaKDE 合同回归和同用途实现 inventory，且没有生产双 owner。
- **来源：** `US-001`、`AC-001`—`AC-003`、`ADR-001`、`ADR-004`—`ADR-006`、`DEC-001`、`DEC-013`。
- **当前事实：** 规划增量约 49 commits、94 files、21 overlaps；上游开始带入本 umbrella change 的核心功能先例。
- **Planning Depth 原因：** 上游新能力与 HanaKDE 更强系统 primitive 同时存在，错误裁决会造成重复基础设施或功能丢失。

## 2. 决策状态

### 已锁定决策

- 上游 File History、Extraction、Materialize 先例必须可追踪地吸收，但不允许其私有 watcher/parser/write path 直接成为第二生产 owner。
- HanaKDE ResourceIO、Root Identity、Transfer、Knowledge 和 Workbench 合同保持权威；同用途实现的最终收敛归后续 Tickets。
- checkpoint 可以包含未连接生产的上游模块，但不能保留临时生产双运行。

### 已采用的低影响假设

- 尚未 wiring 的上游模块可通过其原始单元测试证明已吸收，生产接入由依赖后的垂直 Ticket 完成。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| release merge、功能先例保留、最小适配、重复 owner/parser inventory | T-06 checkpoint、上游单测、HanaKDE 合同 | 最终生产 wiring、双 owner、兼容壳、push/release |

## 4. 要构建什么

维护者能够证明上游核心能力源码与测试已进入整合线，同时 HanaKDE 用户不会因为尚未完成语义融合而遭遇第二 watcher、第二 parser 或第二写入事实源。后续 Ticket 直接消费已冻结模块，而不是重新 cherry-pick 或重写。

## 5. 实现契约

- **入口或接缝：** 经授权 staged merge、上游功能单测、HanaKDE contract union、结构 inventory。
- **输入与输出：** T-06 checkpoint + `v0.443.46^{commit}` → 绿色 checkpoint 与后续模块输入映射。
- **公共接口变化：** 上游新增内部接口可保留；外部 HanaKDE 语义仅按 Spec 调整。
- **不变量：** 单 production watcher/mutation/baseline owner；单 Resource authority；Extraction 不绕过授权。
- **状态或数据流：** merge → preserve upstream modules → semantic conflict resolution → inventory → tests。
- **错误与失败行为：** 需要连接双生产路径或删除 HanaKDE 合同才能通过时停止，不推进 T-08。
- **兼容要求：** 不为上游私有 File History 或 parser 建立长期 fork compatibility。
- **安全与隐私要求：** 新工具路径必须继续经过 ResourceAccessPolicy，不能因 merge 暴露 raw roots。

## 6. 执行路线

1. 验证 T-06 和当前 Git 授权状态。
2. staged merge `v0.443.46`，标记 History/Extraction/Materialize/Resource/UI 相关路径。
3. 按五类规则裁决，保存上游模块并阻止重复生产 wiring。
4. 解决源依赖后重建 lock/generated 输出。
5. 运行上游新模块单测、HanaKDE 核心合同、基础质量门和结构 scan。
6. 经 commit 授权形成 checkpoint，输出 T-10/T-13/T-19 的输入清单。

## 7. 路径访问契约

- **预计修改点：** `<Path>**</Path>`，实际路径由 merge index 固定。
- **可写范围：** `<Path>**</Path>`，限 release 增量和最小适配。
- **只读上下文：** 无额外范围。
- **共享路径：** 无；integration chain 串行。
- **保留或不动：** 用户未提交修改、远程 refs 和尚未授权的生产切换。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | ancestry + upstream modules | `git merge-base --is-ancestor v0.443.46 HEAD` 和新增模块单测 | checkpoint 与上游功能先例存在 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-07.md</Path>` |
| 失败路径 | production ownership scan | 扫描 watcher/parser/write wiring | 不存在重叠 production owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-07.md</Path>` |
| 回归 | HanaKDE contracts | Resource/Knowledge/Transfer/Workbench/security 套件 | 合同无回退 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-07.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** T-06 后 Git checkpoint；不迁移用户数据。
- **兼容窗口：** 无；上游模块最终直接适配唯一 HanaKDE owner。
- **监控信号：** ancestry、module tests、contract union、production owner/parser count。
- **回滚或前向恢复：** commit 前 abort；commit 后经批准回到 T-06 或前向修复，始终 stop-then-start。
- **不可逆操作与批准点：** merge/commit/tag/push 分别需明确授权。
- **收缩条件：** conflict 为零、后续输入明确、production duplicate count 为零。

## 10. 验收标准

- [x] `AC-001`：`v0.443.46` checkpoint 可审计。
- [x] `AC-002`：本区间上游正常能力和修复已吸收。
- [x] `AC-003`：HanaKDE 核心合同保持且无重复生产 owner。
- [x] 验证矩阵记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-07.md</Path>`。
- [x] 无未批准 Git 副作用。
