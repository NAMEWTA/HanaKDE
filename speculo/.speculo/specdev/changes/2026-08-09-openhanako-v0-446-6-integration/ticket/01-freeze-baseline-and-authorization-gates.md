---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-01
title: 冻结实施基线与授权门
status: ready
planning_depth: deep
planning_depth_reason: "整仓 Git 固定点、脏工作树保护和后续不可逆 Git 操作批准点具有高事故半径。"
ready: true
risk: high
blocked_by: []
contract_ids: [AC-001]
owner: unassigned
expected_changes: []
writable_paths: []
read_only_paths: ["<Path>**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-01: 冻结实施基线与授权门

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/01-freeze-baseline-and-authorization-gates.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>`

## 1. 战略与来源

- **目标：** 在任何 integration branch、tag、merge 或 commit 前，重新冻结实际 HanaKDE 起点、工作树、上游 target、merge-base、patch equivalence、overlap 和授权边界。
- **可观察产出：** 形成可复查的只读基线报告；明确哪些本地修改必须保留、哪些 Git 动作仍未授权，并为 T-02 至 T-09 提供唯一 fixed point。
- **来源：** `US-001`、`US-012`、`AC-001`、`ADR-001`、`USER-DECISION:no-git-side-effects-without-explicit-authorization`。
- **当前事实：** 规划快照为 `bf4c6ee57891324fe686f63780092f5240e61bec`，冻结 target 为 `5f08a4f30203abb61dafac7dbb7ab92d11c23efa`；当前工作树含用户与并行工作修改，规划快照不能替代实施起点。
- **Planning Depth 原因：** 错误基线会污染全部 staged merge，且 Git 引用写入和 merge 需要独立批准。

## 2. 决策状态

### 已锁定决策

- 本 Ticket 仅执行只读 Git 与文件审计，不创建 branch/tag，不 merge、commit、push，也不清理现有工作树。
- target 必须精确解析为 `5f08a4f30203abb61dafac7dbb7ab92d11c23efa`；浮动 `upstream/main` 不得替代。
- 脏工作树必须逐项记录归属和隔离方案；不得 stash、reset、checkout 或覆盖未知修改。
- 后续每个产生 Git 状态变化的动作必须在执行点获得用户明确授权。

### 已采用的低影响假设

- 审计命令可在当前仓库只读执行；若 remote 不可用，已有本地 target object 足以完成对象验证，fetch 另行请求授权。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| HEAD/target/merge-base、worktree、divergence、patch-equivalence、overlap 与 checkpoint 清单 | Git object database、现有 Spec/ADR/设计计划 | 任何产品代码写入、Git 引用写入、远程写入或工作树清理 |

## 4. 要构建什么

维护者运行一组可重复只读检查，得到实际 HEAD、target tag/object、共同祖先、双方唯一提交与变更路径、重叠路径和当前工作树清单。报告同时标记 staged merge 的 checkpoint 顺序以及 branch/tag/merge/commit/push 各自尚需的批准，任何事实与规划快照不一致时停止并修订下游编排。

## 5. 实现契约

- **入口或接缝：** 本地 Git CLI 与 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>`。
- **输入与输出：** 输入为当前仓库和冻结 SHA；输出为固定点、工作树、overlap、checkpoint 与授权状态报告。
- **公共接口变化：** 无；仅文档、只读审计，无代码变更。
- **不变量：** 审计前后 HEAD、index、worktree、refs 和 remotes 不变；敏感值不写入 Evidence。
- **状态或数据流：** repository facts → normalized audit → downstream checkpoint inputs。
- **错误与失败行为：** target 缺失、tag 不匹配、命令失败或工作树无法归属时标记阻断，不猜测也不修改仓库。
- **兼容要求：** 报告使用完整 SHA；不依赖本地别名或机器绝对路径。
- **安全与隐私要求：** 不输出凭据、remote token 或用户文件正文。

## 6. 执行路线

1. 记录实际 HEAD、分支、status、remote 与 target tag/object，证明 target SHA 精确匹配。
2. 计算 merge-base、双方 divergence、patch equivalence、changed files、overlap 和 checkpoint 增量。
3. 分类当前未提交修改的归属和保护要求，不对其执行任何状态改变。
4. 将所有 Git 副作用列为未授权批准点，并为 T-02 固定可消费的起点。
5. 重跑只读摘要，证明审计未改变 HEAD、index、worktree 或 refs。

## 7. 路径访问契约

- **预计修改点：** 无代码变更；只写本 Ticket 的 Evidence 工件。
- **可写范围：** 项目路径为空；Evidence 写入由 SpecDev 工件边界授权。
- **只读上下文：** `<Path>**</Path>`。
- **共享路径：** 无。
- **保留或不动：** 全部现有用户修改、Git refs、index、worktree 与 remotes。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | Git fixed point | `git rev-parse HEAD`、`git rev-parse v0.446.6^{commit}`、`git merge-base HEAD v0.446.6` | 三个完整 SHA 和 divergence/overlap 均已记录 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>` |
| 失败路径 | target 与脏树门 | 模拟/识别 tag 不匹配、对象缺失或未知工作树项 | Ticket 停止且不产生 Git 状态改变 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>` |
| 回归 | 前后状态对比 | 比较审计前后 HEAD、status、refs 摘要 | 内容一致，无未知修改被触碰 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 不适用：本 Ticket 不迁移产品或数据。
- **兼容窗口：** 不适用：HanaKDE 未发布且本 Ticket 无产品变化。
- **监控信号：** target SHA、HEAD、status、merge-base 和 overlap 计数的前后对比。
- **回滚或前向恢复：** 无仓库写入，因此无需回滚；审计失败时修复环境后重跑。
- **不可逆操作与批准点：** branch/tag/merge/commit/push/fetch 均不在本 Ticket 授权内。
- **收缩条件：** 实际 fixed point 已记录，下游不再引用规划 HEAD 作为执行起点。

## 10. 验收标准

- [ ] `AC-001`：实际起点、冻结 target、merge-base、patch equivalence、overlap 和 checkpoint 清单可审计。
- [ ] 审计前后 Git 与工作树状态一致，所有未知修改均被保留。
- [ ] 所有 Git 写操作仍有明确、未被隐式跨越的批准点。
- [ ] 验证矩阵全部执行并记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-01.md</Path>`。
- [ ] Ticket、Tickets Map 和 Evidence 状态一致。
