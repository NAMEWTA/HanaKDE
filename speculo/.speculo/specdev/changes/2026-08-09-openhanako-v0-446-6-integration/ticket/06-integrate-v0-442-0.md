---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-06
title: 整合上游 v0.442.0 checkpoint
status: done
planning_depth: deep
planning_depth_reason: "约 40 个提交、180 个文件和 30 个 overlap，是 staged chain 中高重叠的整仓公共契约 checkpoint。"
ready: true
risk: critical
blocked_by: [T-05]
contract_ids: [AC-001, AC-002, AC-003]
owner: Worker-T-06 / Lead
expected_changes: ["<Path>**</Path>"]
writable_paths: ["<Path>**</Path>"]
read_only_paths: []
shared_paths: []
shared_path_owners: []
---

# Ticket T-06: 整合上游 v0.442.0 checkpoint

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/06-integrate-v0-442-0.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>`

## 1. 战略与来源

- **目标：** 吸收 `v0.441.32..v0.442.0` 的高重叠 release，保护 HanaKDE 的 Resource/Knowledge/Workbench 合同并冻结后续收敛所需真实输入。
- **可观察产出：** `v0.442.0` checkpoint 通过合同并集，所有高风险 semantic conflicts 有裁决和后续 owner 归属。
- **来源：** `US-001`、`AC-001`—`AC-003`、`ADR-001`、`DEC-001`、`DEC-008`、`DEC-013`。
- **当前事实：** 规划增量约 40 commits、180 files、30 overlaps，是 checkpoint chain 的高风险汇合点。
- **Planning Depth 原因：** 大量公共路径重叠，任何错误保留/删除都会影响后续单 owner cutover。

## 2. 决策状态

### 已锁定决策

- 对 ResourceIO、watcher、engine wiring、root identity、Knowledge 与 UI 重叠必须语义融合，禁止简单 ours/theirs。
- 若完整收敛超出 merge 最小适配，记录稳定接口和唯一 owner 目标，交给 T-10 至 T-20。
- 不允许为通过此 checkpoint 暂时启用双 watcher、双写或双 baseline walk。

### 已采用的低影响假设

- 临时编译接缝仅可存在于未连接真实 root 的隔离测试，且必须在本 Ticket 结束前删除或转为显式后续未启用代码。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| 高重叠 staged merge、semantic classification、最小适配和 owner handoff inventory | T-05 checkpoint、Spec/ADR、核心合同套件 | 完整 Resource/Workspace 重构、双生产 owner、push/release |

## 4. 要构建什么

此 checkpoint 把高风险冲突转化为可验证的语义结果和明确后续 owner 输入。用户观察到的上游改善可用，HanaKDE 现有能力不回退，且生产 wiring 始终没有同时连接两套相同职责。

## 5. 实现契约

- **入口或接缝：** 经授权 staged merge、module ownership inventory、contract union tests。
- **输入与输出：** T-05 checkpoint + `v0.442.0^{commit}` → 绿色 checkpoint、semantic ledger、owner handoff list。
- **公共接口变化：** 只吸收冻结 release 正常上游接口；HanaKDE 的外部合同优先于内部同名实现。
- **不变量：** physical watcher/mutation/baseline overlap 为 0；ProviderRootIdentity 安全不降级；无公共 `workspaceId`。
- **状态或数据流：** merge → conflict classification → minimal semantic integration → owner inventory → verification。
- **错误与失败行为：** 任何需要双运行才能绿色的结果视为失败；保留 predecessor checkpoint。
- **兼容要求：** 事件 metadata 可 additive；内部旧函数不建立兼容层。
- **安全与隐私要求：** raw roots、scope tokens 和用户内容不进入外部错误或 Evidence。

## 6. 执行路线

1. 验证 T-05 checkpoint 并确认本 release merge 授权。
2. staged merge `v0.442.0`，冻结 semantic overlap 和 production owner inventory。
3. 按权威分类解决；同用途基础设施只保留一个可接生产的 owner。
4. 重建 generated/lock 输出，运行 Resource/Knowledge/Workbench 定向合同。
5. 运行基础质量门、owner overlap scan 和开放边界安全回归。
6. 经 commit 授权形成 checkpoint，并把未完成收敛映射到后续 Ticket。

## 7. 路径访问契约

- **预计修改点：** `<Path>**</Path>`，实际由 merge index 固定。
- **可写范围：** `<Path>**</Path>`，仅 release 增量和最小适配。
- **只读上下文：** 无额外范围。
- **共享路径：** 无；integration chain 串行。
- **保留或不动：** 用户修改、远程 refs、尚未获批的架构重构。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | ancestry/contract union | `git merge-base --is-ancestor v0.442.0 HEAD` 加定向套件 | checkpoint 和语义并集成立 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>` |
| 失败路径 | single-owner scan | 检查 watcher/mutation/baseline production wiring | overlap count 为 0；否则失败 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>` |
| 回归 | security/open boundary | Root identity、Resource authority、Knowledge 与 Workbench 测试 | 安全和产品合同保持 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** T-05 后的 Git checkpoint；无用户数据迁移。
- **兼容窗口：** 无；禁止生产双运行兼容期。
- **监控信号：** ancestry、contract results、owner overlap count、semantic ledger completeness。
- **回滚或前向恢复：** commit 前 abort；commit 后经授权回到 T-05 或前向修复，恢复也不双运行。
- **不可逆操作与批准点：** merge/commit/tag/push 逐项需明确授权。
- **收缩条件：** 冲突为零、生产 overlap 为零、每个延后项有唯一后续 Ticket。

## 10. 验收标准

- [x] `AC-001`：`v0.442.0` checkpoint 与裁决可审计。
- [x] `AC-002`：正常上游变化完整吸收。
- [x] `AC-003`：HanaKDE 合同无回退，生产 owner overlap 为 0。
- [x] 验证矩阵记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>`。
- [x] 无未批准 Git 操作或隐式范围扩大。
