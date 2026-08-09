---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-24
title: 发布架构文档与 upstream sync ledger
status: ready
planning_depth: standard
planning_depth_reason: "跨模块架构和后续 upstream sync 审计涉及多来源事实，但仅修改文档且不改变运行时公共契约。"
ready: true
risk: medium
blocked_by: [T-21]
contract_ids: [AC-001, AC-028]
owner: unassigned
expected_changes: ["<Path>docs/architecture/openhanako-v0.446.6-integration.md</Path>", "<Path>docs/upstream-sync-ledger.md</Path>", "<Path>docs/troubleshooting/resource-consistency.md</Path>", "<Path>docs/index.md</Path>"]
writable_paths: ["<Path>docs/**</Path>"]
read_only_paths: ["<Path>core/**</Path>", "<Path>lib/**</Path>", "<Path>server/**</Path>", "<Path>desktop/**</Path>", "<Path>plugins/**</Path>", "<Path>tests/**</Path>", "<Path>package.json</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-24: 发布架构文档与 upstream sync ledger

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/24-architecture-and-upstream-sync-ledger.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-24.md</Path>`

## 1. 战略与来源

- **目标：** 把实际整合后的 Resource/Workspace/History/Knowledge/Extraction ownership、staged checkpoints、裁决、删除项和平台 Gates 写入仓库长期文档与 upstream sync ledger。
- **可观察产出：** 维护者可从文档理解 target/merge-base、保留/吸收/融合/删除项、唯一 owner、故障恢复和下一次 upstream sync 方法，而无需反推代码。
- **来源：** `US-001`、`US-012`、`AC-001`、`AC-028`、`ADR-001`—`ADR-011`、`DEC-001`—`DEC-015`。
- **当前事实：** 当前 change 的长计划和 ADR 已决策完备，但项目仓库只有 `<Path>docs/index.md</Path>`，还没有本次实施后的长期 architecture/sync ledger。
- **Planning Depth 原因：** 文档跨多个实现域，需要用实际 Evidence 校准；本身可逆且不改变运行时。

## 2. 决策状态

### 已锁定决策

- 文档记录实际实现，不复制规划假设；SHA、checkpoint、path ownership、删除项和 platform Gate 均引用 Evidence。
- 明确 main-only History、mount semantics、separate History/Knowledge DB、single observation owner、shared Extraction、no OCR/migration/dual-run。
- ledger 对每个 staged checkpoint 分类 upstream accepted、HanaKDE kept、semantic integration、generated、deleted duplicate。
- 后续 sync 仍以 frozen target/staged checkpoint/contract union 为方法，不把当前冲突答案固化成无审查 rerere 真理。

### 已采用的低影响假设

- 文档目录名沿用项目现有 docs 索引风格；必要时只增加最小目录，不做站点重构。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| architecture、sync ledger、troubleshooting、docs index 与链接检查 | implementation Evidence、Spec/ADR、Git audit | 产品代码、永久 Speculo promotion、release notes/marketing、远程发布 |

## 4. 要构建什么

项目文档说明 Engine assembly、Resource Event flow、main lifecycle、History/Knowledge 独立模型、Extraction/Office wiring、stop-then-start recovery、health states 和平台 Gate。sync ledger 逐 checkpoint 记录 target、overlap/c裁决/删除/验证，troubleshooting 提供 health/gap/retry/cleanup 的运行诊断，不包含机器绝对路径或临时事实。

## 5. 实现契约

- **入口或接缝：** project docs index、architecture document、sync ledger、troubleshooting guide。
- **输入与输出：** Ticket/Evidence/Git facts → current project documentation with traceable SHA/commands/results。
- **公共接口变化：** 无；仅文档。
- **不变量：** current truth only；no planned-as-done claims；no machine absolute paths；all ownership diagrams match code/scan Evidence。
- **状态或数据流：** gather Evidence → verify against code/Git → write docs/ledger → link/lint review。
- **错误与失败行为：** Evidence 缺失或代码冲突时标记文档阻断，不用规划内容填补“已完成”。
- **兼容要求：** 文档明确无 legacy migration/compat window，并保留 HanaKDE 外部产品合同。
- **安全与隐私要求：** 不记录 root、token、用户内容、remote credentials 或私有临时路径。

## 6. 执行路线

1. 汇总 T-01 至 T-21 的实际 SHAs、裁决、owner scans、interfaces、recovery 和 platform inputs。
2. 编写架构文档与依赖/事件/restore/extraction flow，逐项对照代码。
3. 编写 staged upstream sync ledger，记录每 checkpoint 的五类裁决和验证。
4. 编写 health/troubleshooting 指南，限定 scoped retry 和 stop-then-start recovery。
5. 更新 docs index，运行链接/路径/术语/结构审查并修复不一致。

## 7. 路径访问契约

- **预计修改点：** frontmatter 中 docs 文件。
- **可写范围：** `<Path>docs/**</Path>`。
- **只读上下文：** 全部实现、测试和 package facts。
- **共享路径：** 无；T-24 是本次项目架构/sync docs 唯一 owner。
- **保留或不动：** Speculo permanent ADR/context、产品代码、release metadata。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | evidence trace review | 随机/全量核对 SHA、owner、flows、commands 与 Evidence | 文档陈述可追踪且为当前事实 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-24.md</Path>` |
| 失败路径 | stale-claim review | 搜索 planned/TODO/旧 target/dual-run/migration 错误陈述 | 无把计划当完成或违背决策的内容 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-24.md</Path>` |
| 回归 | docs structure/link scan | 检查内部链接、项目相对路径、术语和 owner inventory | 链接有效、无机器路径、无重复架构描述冲突 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-24.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 不适用：仅文档，依据实际 Evidence 发布。
- **兼容窗口：** 不适用：文档描述唯一新基线。
- **监控信号：** 不适用：通过 docs/link/ledger review 观察。
- **回滚或前向恢复：** 文档可按 code/Evidence 前向修订；不得保留两套冲突架构说明。
- **不可逆操作与批准点：** 无；Git commit/push 仍需明确授权。
- **收缩条件：** 旧 target、重复 owner、migration/dual-run 错误描述为零。

## 10. 验收标准

- [ ] `AC-001`：ledger 记录 frozen target、actual start/merge-base、checkpoints 和裁决。
- [ ] `AC-028`：架构/ledger 记录 retained/absorbed/deleted、single owners 和 platform Gates。
- [ ] 文档与实际 code/Evidence 一致，无旧 `v0.444.1` 目标或规划即完成陈述。
- [ ] 链接、路径、术语和安全审查记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-24.md</Path>`。
- [ ] 修改范围仅为 `<Path>docs/**</Path>`。
