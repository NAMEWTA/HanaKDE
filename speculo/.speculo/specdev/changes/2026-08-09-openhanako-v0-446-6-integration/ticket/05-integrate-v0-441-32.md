---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-05
title: 整合上游 v0.441.32 checkpoint
status: review
planning_depth: deep
planning_depth_reason: "约 30 个提交、132 个文件和 20 个 overlap 的整仓 checkpoint 开始接近 History/Resource 高重叠区。"
ready: true
risk: high
blocked_by: [T-04]
contract_ids: [AC-001, AC-002, AC-003]
owner: Worker-T-05 / Lead
expected_changes: ["<Path>**</Path>"]
writable_paths: ["<Path>**</Path>"]
read_only_paths: []
shared_paths: []
shared_path_owners: []
---

# Ticket T-05: 整合上游 v0.441.32 checkpoint

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/05-integrate-v0-441-32.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>`

## 1. 战略与来源

- **目标：** 将 `v0.441.3..v0.441.32` 吸收到独立 checkpoint，为后续 Resource/File History 增量提供干净上游基座。
- **可观察产出：** `v0.441.32` ancestry、上游行为、HanaKDE 合同与冲突裁决均可独立验证。
- **来源：** `US-001`、`AC-001`—`AC-003`、`ADR-001`、`DEC-001`、`DEC-013`。
- **当前事实：** 规划增量约 30 commits、132 files、20 overlaps；实际值从 T-01 audit 读取。
- **Planning Depth 原因：** 即将进入共享基础设施区，错误合并会模糊“上游吸收”和“架构收敛”的边界。

## 2. 决策状态

### 已锁定决策

- 此 Ticket 只建立上游 checkpoint，不在冲突中创建第二 watcher/store/parser。
- 上游正常功能默认接受；HanaKDE 产品与安全合同按语义融合。
- 发现同用途重复 primitive 时记录给 T-10/T-12/T-19，不在本 Ticket 双运行。

### 已采用的低影响假设

- 重复 owner inventory 可作为后续 Ticket 输入，但不会让本 checkpoint 保留临时生产双运行。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| 当前 release staged merge、最小适配、重复职责记录 | T-04 checkpoint、合同测试与审计格式 | owner cutover、History 产品实现、push/release |

## 4. 要构建什么

该 checkpoint 让维护者能先看清上游真实变化，再由后续 Ticket 按 HanaKDE 架构收敛同用途 primitive；不会用临时双运行掩盖尚未完成的设计整合。

## 5. 实现契约

- **入口或接缝：** 经授权 Git staged merge、diff inventory、定向合同与基础质量门。
- **输入与输出：** T-04 checkpoint + `v0.441.32^{commit}` → 绿色 checkpoint 与重复职责输入清单。
- **公共接口变化：** 仅冻结上游此 release 正常接口；公共冲突按 Spec 外部语义裁决。
- **不变量：** 不双运行 watcher/mutation/baseline；不建立内部兼容壳；不提前改变 main/挂载语义。
- **状态或数据流：** predecessor proof → merge → classify → adapt → inventory → verify。
- **错误与失败行为：** 若保持绿色只能依赖生产双运行，则停止并把问题升级为偏差，而非完成 Ticket。
- **兼容要求：** 保留外部 HanaKDE 合同；未发布内部实现可直接被后续统一 owner 替代。
- **安全与隐私要求：** root/authorization 结果不得降级为字符串路径猜测。

## 6. 执行路线

1. 验证 T-04 predecessor 与当前 merge 授权。
2. staged merge `v0.441.32`，固定重叠和 duplicate-owner candidates。
3. 按五类规则裁决并完成最小适配，不接入临时双生产 owner。
4. 重建 generated/lock 输出并执行差异驱动测试。
5. 运行核心合同和基础质量门，发布重复职责清单给后续 Tickets。
6. 经 commit 授权形成 checkpoint，保持下一 release 未开始。

## 7. 路径访问契约

- **预计修改点：** `<Path>**</Path>`，实际由 merge index 固定。
- **可写范围：** `<Path>**</Path>`，限本 release 和最小适配。
- **只读上下文：** 无额外范围。
- **共享路径：** 无；integration chain 串行。
- **保留或不动：** 未授权用户修改与后续 owner 收敛实现。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | ancestry/affected tests | `git merge-base --is-ancestor v0.441.32 HEAD` 和定向套件 | checkpoint 绿色 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` |
| 失败路径 | duplicate-owner gate | 扫描生产 wiring 是否出现双 watcher/双写/双 baseline | overlap count 保持 0；否则停止 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` |
| 回归 | HanaKDE contract union | Resource/Knowledge/Transfer/Workbench/security 测试 | 合同无回退 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** T-04 后的 Git checkpoint；无数据迁移。
- **兼容窗口：** 无；禁止以兼容窗口保留双 owner。
- **监控信号：** ancestry、tests、build、duplicate-owner inventory 和 audit completeness。
- **回滚或前向恢复：** commit 前 abort；commit 后获批回到 T-04 或前向修复。
- **不可逆操作与批准点：** merge/commit/tag/push 分别明确授权。
- **收缩条件：** 冲突为零、生产 owner overlap 为零、checkpoint 绿色。

## 10. 验收标准

- [ ] `AC-001`：`v0.441.32` checkpoint 可审计。
- [ ] `AC-002`：正常上游变化已吸收。
- [ ] `AC-003`：HanaKDE 合同无回退且未引入临时双运行。
- [ ] 验证矩阵记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>`。
- [ ] 未发生未批准 Git 副作用。
