---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-02
title: 整合上游 v0.421.24 checkpoint
status: in_progress
planning_depth: deep
planning_depth_reason: "首个整仓 staged merge 涉及约 46 个提交、146 个文件和 26 个重叠路径，并建立后续冲突裁决基线。"
ready: true
risk: high
blocked_by: [T-01]
contract_ids: [AC-001, AC-002, AC-003]
owner: Worker-T-02 / Lead
expected_changes: ["<Path>**</Path>"]
writable_paths: ["<Path>**</Path>"]
read_only_paths: []
shared_paths: []
shared_path_owners: []
---

# Ticket T-02: 整合上游 v0.421.24 checkpoint

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/02-integrate-v0-421-24.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>`

## 1. 战略与来源

- **目标：** 在显式 Git 授权后，把 merge-base 之后至 `v0.421.24` 的上游变化作为首个可审计 checkpoint 吸收，并建立 upstream/HanaKDE/semantic/generated/delete 五类裁决记录。
- **可观察产出：** integration 分支达到 `v0.421.24` checkpoint，普通上游改进生效，HanaKDE Knowledge/Resource/Workbench 合同仍绿色。
- **来源：** `US-001`、`AC-001`—`AC-003`、`ADR-001`、`DEC-001`、`DEC-013`。
- **当前事实：** 此增量约 46 commits、146 changed files、26 overlap files；实际数字以 T-01 Evidence 为准。
- **Planning Depth 原因：** 第一个 merge checkpoint 决定后续 ancestry 与冲突复用，错误裁决事故半径覆盖整仓。

## 2. 决策状态

### 已锁定决策

- 普通上游功能、修复和优化默认接受；只有真实 HanaKDE 产品、安全、数据或开放边界差异进入语义融合。
- Knowledge、ResourceIO、Transfer、安全边界与 Workbench 产品语义不得因上游同名路径被删除。
- 本 Ticket 只处理此 checkpoint 的 merge 与保持绿色所需最小适配；Resource/History/Extraction 收敛留给 T-10 之后。

### 已采用的低影响假设

- 具体冲突文件以获批 merge 后 Git index 为准；生成物在源配置完成后重建。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| `v0.421.24` checkpoint、冲突分类、最小编译/合同适配和 audit | T-01 fixed point、现有质量门与 rerere（若已授权配置） | 后续 tag、基础设施收敛、长期兼容壳、push/release |

## 4. 要构建什么

维护者可从冻结起点审查一个边界明确的 upstream checkpoint：其 merge commit、冲突清单、每项裁决及验证结果互相对应。checkpoint 失败时仓库不进入下一 tag，架构重构不会被埋进冲突解决。

## 5. 实现契约

- **入口或接缝：** 经用户授权的 Git staged merge 与仓库质量命令。
- **输入与输出：** T-01 起点和 `v0.421.24^{commit}` → 可构建 checkpoint 与裁决清单。
- **公共接口变化：** 仅吸收该 release 已定义的上游接口；HanaKDE 公开边界若需改变必须按偏差治理停止。
- **不变量：** checkpoint 单调推进；不跳 tag；不触碰 T-01 记录的用户修改；不丢 HanaKDE 合同。
- **状态或数据流：** authorized merge → classify conflicts → minimal adaptation → verify → record checkpoint。
- **错误与失败行为：** 未授权、target 不符、冲突无法按权威裁决或基础门失败时停止，不开始 T-03。
- **兼容要求：** 不为未发布 fork 内部实现创建兼容层；保留现有外部 HanaKDE 合同。
- **安全与隐私要求：** 安全冲突采用更严格且符合 Resource authority 的结果，Evidence 不含敏感值。

## 6. 执行路线

1. 复核 T-01 fixed point，并请求/确认 branch 与本 checkpoint merge 的明确授权。
2. 以 no-commit staged merge 引入 `v0.421.24`，冻结冲突与 generated 文件清单。
3. 按五类权威逐项裁决，只做保持 checkpoint 绿色的最小适配。
4. 先解决源配置，再按仓库策略重建 lock/generated 输出。
5. 运行定向上游回归、HanaKDE 核心合同和基础质量门，记录失败分类。
6. 经单独 commit 授权形成 checkpoint，并确认未推送、未开始下一 tag。

## 7. 路径访问契约

- **预计修改点：** `<Path>**</Path>`，实际清单由 merge index 固定。
- **可写范围：** `<Path>**</Path>`；仅限本 checkpoint 的上游差异和最小适配。
- **只读上下文：** 无额外范围。
- **共享路径：** 无；T-02 至 T-09 严格串行。
- **保留或不动：** Speculo 工件之外的用户未提交修改，除非已在 T-01 中隔离且另获授权。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | checkpoint ancestry/build | `git merge-base --is-ancestor v0.421.24 HEAD` 与仓库定向测试 | ancestry 成立，正常上游行为可用 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` |
| 失败路径 | conflict/authorization gate | 检查未裁决冲突、未授权 Git 动作和失败分类 | 任一存在即停止，不推进 T-03 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` |
| 回归 | HanaKDE contracts | 运行 Resource、Knowledge、Transfer、Workbench 定向套件 | 现有合同无回退 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** Git checkpoint only；无用户数据迁移。
- **兼容窗口：** 无：未发布基线不保留旧内部兼容壳。
- **监控信号：** unresolved conflicts、test/build 状态、checkpoint SHA 与 semantic ledger entries。
- **回滚或前向恢复：** commit 前 abort merge；commit 后仅在用户授权下回到 T-01 recovery point 或前向修复本 checkpoint。
- **不可逆操作与批准点：** branch、merge、commit、tag、push 各自需要明确授权；本 Ticket 永不隐含 push/release。
- **收缩条件：** 冲突为零、基础门绿色、裁决均记录，且没有本 checkpoint 引入的临时兼容实现。

## 10. 验收标准

- [ ] `AC-001`：`v0.421.24` checkpoint ancestry 与 audit 可追踪。
- [ ] `AC-002`：本 checkpoint 的正常上游能力和修复已吸收。
- [ ] `AC-003`：HanaKDE Knowledge、Resource、Transfer、安全和 Workbench 合同无回退。
- [ ] 验证矩阵全部执行并记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-02.md</Path>`。
- [ ] 实际项目修改未超出 `writable_paths`，未发生未批准 Git 副作用。
