---
schema_version: 3
artifact: ticket
change: 2026-08-12-knowledge-workspace-resource-convergence
id: T-06
title: 按 checkpoint 遍历上游更新并固化收敛证据
status: done
planning_depth: deep
planning_depth_reason: "fork/upstream 兼容与架构/安全 owner scan 是不可省略的跨路径发布 Gate；涉及 checkpoint 冻结、path overlap、五路分类、回滚/恢复和最终合同证据，但不直接合并上游。"
ready: true
risk: high
blocked_by: [T-05]
contract_ids: [AC-012]
owner: current-implementer
expected_changes: ["<Path>docs/upstream-sync-ledger.md</Path>"]
writable_paths: ["<Path>docs/upstream-sync-ledger.md</Path>"]
read_only_paths: ["<Path>core/**</Path>", "<Path>lib/**</Path>", "<Path>server/**</Path>", "<Path>desktop/**</Path>", "<Path>tests/**</Path>"]
shared_paths: ["<Path>docs/upstream-sync-ledger.md</Path>"]
shared_path_owners: ["<Path>docs/upstream-sync-ledger.md</Path> => T-06"]
---

# Ticket T-06: 按 checkpoint 遍历上游更新并固化收敛证据

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/06-traverse-upstream-resource-convergence-checkpoints.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>`

## 1. 战略与来源

- **目标：** 将本 change 的最小 seam 修复纳入 fork 的 checkpoint 遍历流程，证明每次上游更新不会引入第二 owner/watcher/parser/route 或丢失本地安全增强。
- **可观察产出：** 对每个待遍历 checkpoint 冻结 upstream/local SHA、path overlap 和五路分类，执行架构/安全扫描及受影响合同测试，并把实际结果写入 `<Path>docs/upstream-sync-ledger.md</Path>`；最终 Map/Gate 证据完整。
- **来源：** `US-006`、`AC-012`、`DEC-006`、`docs/upstream-sync-ledger.md`、`docs/architecture/openhanako-v0.446.6-integration.md`、归档 `2026-08-09-openhanako-v0-446-6-integration`。
- **当前事实：** fork 已有 checkpoint ledger 和 target `OpenHanako v0.446.6`；当前 change 要求在不大幅重排目录、不重复 owner 的前提下可遍历升级，且上游合并本身明确 OUT。
- **Planning Depth 原因：** 这是共享核心与 fork 维护的发布 Gate，含不可静默的语义分类、冲突重审、恢复和人工批准点。

## 2. 决策状态

### 已锁定决策

- 每个 checkpoint 先冻结 source/local SHA 和 path overlap，再逐路径归类为 upstream accepted、HanaKDE kept、semantic integration、generated 或 deleted duplicate。
- “无冲突”不等于完成；必须运行 owner/architecture/security scans、affected tests、`git diff --check` 并记录证据。
- 若公共契约、owner、安全边界或本 Spec 合同冲突，停止遍历并回到 Spec/Grill；不得在 ledger 中静默选边。
- 本 Ticket 不合并、提交、推送或发布 upstream；只维护 ledger 和本地 Evidence。

### 已采用的低影响假设

- 上游 checkpoint 列表和当前 integration ancestry 由 ledger 当前内容提供；若目标 SHA 变化，先在 Evidence 标为阻塞并按 deviation-control 处理。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| ledger checkpoint entries、path overlap/classification、owner/security scan receipt、affected test receipt、最终兼容 Gate | 现有 docs procedure、Spec contracts、T-01~T-05 Evidence、git read-only inspection | upstream merge/rebase/cherry-pick、生产代码修改、提交/推送/发布、第二套同步工具 |

## 4. 要构建什么

对 ledger 指定的每个上游 checkpoint，读取冻结 SHA 和本地基线，生成明确 path overlap。逐路径判断上游是否已包含修复、本地增强是否保留、是否需要语义适配、是否为生成文件或删除重复实现；检查 owner/watcher/parser/route 是否仍唯一，安全扫描不泄漏 absolute path/capability。运行 T-05 受影响测试和必要 typecheck/diff check，将每个命令、结果、冲突与批准记录到 ledger/Evidence。若发生契约冲突，停止在该 checkpoint 并提出回到 Spec/Grill 的偏差，不声称已收敛。

## 5. 实现契约

- **入口或接缝：** `<Path>docs/upstream-sync-ledger.md</Path>` sync procedure/checkpoint table；Git SHA/path overlap/architecture/security scans；T-05 affected tests。
- **输入与输出：** frozen upstream/local SHA + changed-path set → classification, owner/security scan result, affected test result, ledger checkpoint status。
- **公共接口变化：** 无；只更新文档与 change Evidence。
- **不变量：** 每个路径恰有一种分类；本地 `main` owner/scope/native grant/clipboard boundary 保持；无第二 owner/watcher/parser/route；无绝对路径敏感值写入状态工件。
- **状态或数据流：** freeze → overlap → classify → scan → affected tests → record → approve/stop。
- **错误与失败行为：** SHA 不可用、overlap 未解析、扫描/测试失败或契约冲突使 checkpoint 保持 blocked；不以无冲突或 rerere 代替语义证据。
- **兼容要求：** 上游更新可按 ledger 逐 checkpoint 重放；本地目录结构和稳定 seam 不被大范围重排。
- **安全与隐私要求：** ledger/Evidence 只记录项目相对路径、SHA、摘要和安全结果，不记录真实用户根、token 或文件内容。

## 6. 执行路线

1. 读取 ledger 当前 integration ancestry，冻结待遍历 checkpoint 与 local baseline SHA。
2. 对每个 checkpoint 生成 changed-path overlap，按五路分类并标记可能影响 T-01~T-05 的 owner/契约。
3. 运行 owner uniqueness、architecture/security scans、`git diff --check` 和受影响合同测试；失败时分类并停止该 checkpoint。
4. 将实际 SHA、分类、命令、结果、剩余风险和批准/阻塞写回 ledger 与 T-06 Evidence。
5. 汇总所有 checkpoint 的兼容结论，交给最终 change completion；不执行 upstream merge 或发布。

## 7. 路径访问契约

- **预计修改点：** `docs/upstream-sync-ledger.md`、T-06 Evidence 和 Tickets Map 的 Gate/状态投影。
- **可写范围：** 仅 frontmatter `writable_paths`；不修改生产源码或 Spec。
- **只读上下文：** 所有 core/lib/server/desktop/tests、T-01~T-05 Evidence、architecture docs。
- **共享路径：** `<Path>docs/upstream-sync-ledger.md</Path>` 由 T-06 作为唯一 owner 更新；Tickets Map 是 SpecDev 状态工件，由当前 T-tickets Work 维护，不属于项目 writable path。
- **保留或不动：** 不创建第二 ledger、sync script 或 integration ancestry。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| checkpoint 分类 | ledger procedure | 冻结 SHA、生成 path overlap、逐路径五路分类 | 每条 overlap 有唯一分类和理由 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>` |
| owner/security uniqueness | repository scans | `rg`/结构扫描 owner、watcher、parser、route 创建点 | 无第二 owner/watcher/parser/route，路径隐私边界保持 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>` |
| 受影响合同 | T-05 affected tests | 运行 T-05 integration/E2E 定向命令 | 所有受影响 AC 保持绿色；失败明确归因 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>` |
| 文档/工作树完整性 | repository checks | `git diff --check`；ledger/Evidence review | 无 whitespace/敏感值/未记录 checkpoint | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** T-05 Gate 通过后逐 checkpoint 遍历；每个 checkpoint 独立记录，最后才汇总。
- **兼容窗口：** ledger 记录 checkpoint 之间的可遍历窗口；不引入双实现兼容窗口。
- **监控信号：** checkpoint SHA、overlap 数、分类数、owner scan、affected test、冲突/阻塞数。
- **回滚或前向恢复：** checkpoint 失败保留当前 local baseline，停止该 checkpoint 并回到 Spec/Grill；不得部分改写生产代码。
- **不可逆操作与批准点：** upstream merge/rebase/cherry-pick、commit/push/release 均 OUT，需独立授权。
- **收缩条件：** 所有指定 checkpoint 有实际证据；没有 unresolved overlap、未批准契约冲突或重复 owner。

## 10. 验收标准

- [x] `AC-012`：每个 checkpoint 有冻结 SHA、path overlap、五路分类、owner/security scan、受影响测试和 ledger 记录。
- [x] 不以“无冲突”替代语义验证；公共契约/安全冲突会停止并回到 Spec/Grill。
- [x] `docs/upstream-sync-ledger.md`、Map 和 Evidence 状态一致，未执行 upstream merge/publish。
- [x] 验证记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-06.md</Path>`。
