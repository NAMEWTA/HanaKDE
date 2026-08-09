---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-14
title: 收敛 Knowledge 事件消费与 scoped repair
status: ready
planning_depth: deep
planning_depth_reason: "Knowledge 索引状态、event cursor、generation 与跨模块一致性依赖共享核心事件并涉及可重建持久化模型。"
ready: true
risk: critical
blocked_by: [T-10, T-11]
contract_ids: [AC-003, AC-011, AC-012, AC-013, AC-017]
owner: unassigned
expected_changes: ["<Path>core/knowledge-workspace/**</Path>", "<Path>lib/knowledge-workspace/**</Path>", "<Path>server/routes/knowledge-workspace.ts</Path>", "<Path>tests/knowledge-*.test.ts</Path>"]
writable_paths: ["<Path>core/knowledge-workspace/**</Path>", "<Path>lib/knowledge-workspace/**</Path>", "<Path>server/routes/knowledge-workspace.ts</Path>", "<Path>tests/knowledge-*.test.ts</Path>"]
read_only_paths: ["<Path>lib/resource-io/**</Path>", "<Path>core/workspace-runtime/**</Path>", "<Path>core/engine.ts</Path>", "<Path>lib/file-history/**</Path>", "<Path>desktop/src/react/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-14: 收敛 Knowledge 事件消费与 scoped repair

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/14-converge-knowledge-events-and-repair.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-14.md</Path>`

## 1. 战略与来源

- **目标：** 让 Knowledge Index Runtime 只消费统一 ResourceEvent 与 shared baseline differences，删除对同一 root 的私有观察/完整扫描 ownership，同时保留独立 DB、Semantic IR、Source Registry 和 Search。
- **可观察产出：** internal/external/gap/reconcile 变化最终更新 Knowledge 和 Search；consumer cursor stale 时只做 scoped repair，不重复完整 filesystem walk。
- **来源：** `US-001`、`US-005`、`US-006`、`AC-003`、`AC-011`—`AC-013`、`AC-017`、`ADR-005`、`ADR-006`、`ADR-010`。
- **当前事实：** `<Path>core/knowledge-workspace/knowledge-index-runtime.ts</Path>` 已依赖 ResourceEventBus 与 ResourceWatchRegistry，并拥有 event coordinator/rebuild contracts。
- **Planning Depth 原因：** 事件 cursor、索引 generation、持久状态与 repair 一旦错误会造成静默 Search 分叉或重复扫描。

## 2. 决策状态

### 已锁定决策

- History 与 Knowledge 共享 observations/version/root/baseline，但 DB、retention、policy、model 和 recovery 独立。
- Knowledge 不拥有 canonical root physical watcher 或 full baseline walk；只消费 event/baseline diffs 并做 scoped read/re-index/remove。
- 已保存磁盘内容仍是持久知识事实；subscriber failure 不改写已提交 Resource mutation 结果。
- health 复用四态物理事实，并可报告 Knowledge 派生进度但不创建冲突状态枚举。

### 已采用的低影响假设

- 现有 KnowledgeIndexEventCoordinator 的 generation/cursor 命名可演进，只要 stale/gap/scoped repair 行为保持。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| event subscriber、cursor/gap、scoped repair、source version、private watcher/full-walk removal | Semantic IR、Source Registry、index store/search、shared observation | File History DB、Office extraction、UI、Knowledge model合并 |

## 4. 要构建什么

资源发生 create/modify/rename/delete 后，Knowledge subscriber 按 source/resource scope 更新或移除索引。事件丢失或 cursor stale 时，系统消费一次共享 baseline difference 并只修复受影响 source/resource。Knowledge 失败进入可见派生状态并可 retry，但不会启动自己的 root watcher 或重新扫描整个 main。

## 5. 实现契约

- **入口或接缝：** KnowledgeIndexRuntime/EventCoordinator ResourceEvent subscription、baseline diff consumer、query health。
- **输入与输出：** ordered resource events/cursor/scoped diffs → source generation/version, index mutations, health/retry result。
- **公共接口变化：** 可 additive 暴露 health/progress；Knowledge query/search 外部合同保持。
- **不变量：** no private physical watcher/full walk；generation commit atomic；saved disk is fact；History/Knowledge stores independent。
- **状态或数据流：** EventBus/baseline diff → classify source change → bounded read/parse → generation commit → query/search。
- **错误与失败行为：** gap/stale 触发 scoped repair；reader/parser/index failure 不污染已提交 generation，保留 retryable state。
- **兼容要求：** 保留现有 Knowledge external/open boundary contracts；删除旧 internal watch/rebuild ownership，无兼容开关。
- **安全与隐私要求：** source registry 和 ResourceIO authority 继续限制访问；diagnostics 不泄漏 root/content/token。

## 6. 执行路线

1. 用 existing event/rebuild/runtime tests 加 scan counter 固定 create/modify/rename/delete/gap 行为。
2. 将 runtime 改为 EventBus logical subscriber，并保存足够的 source/resource version/cursor。
3. 将 full rebuild 入口拆为 shared baseline diff + Knowledge scoped repair consumer。
4. 删除 Knowledge 私有 root watcher/full-walk wiring，保持 Source Registry/IR/index/search 独立。
5. 覆盖 failure isolation、generation atomicity、health/retry 和 external modification。
6. 运行结构 scan 与 Knowledge E2E 定向流程，证明 watcher/baseline owner 不重复。

## 7. 路径访问契约

- **预计修改点：** Knowledge core/lib/route 与定向 tests。
- **可写范围：** 仅 frontmatter `writable_paths`；Resource/Workspace contracts 与 production assembly 只读。
- **只读上下文：** Kernel、workspace runtime、Engine、History、Desktop。
- **共享路径：** 无；本 Ticket 是 Knowledge event/repair 唯一 owner。
- **保留或不动：** History store/policy、Office plugin、UI state 和 mount semantics。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | Knowledge event integration | create/modify/rename/delete/external event tests | index/search 与已保存磁盘版本一致 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-14.md</Path>` |
| 失败路径 | gap/generation injection | drop event、stale cursor、reader/index failure、retry | 一次 shared baseline；scoped repair；generation 不污染 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-14.md</Path>` |
| 回归 | scan/Knowledge suite | watch factory/full-walk counters + existing Knowledge tests/E2E subset | private owner 为零，现有合同保持 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-14.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** isolated subscriber/repair → T-12 production EventBus → remove old owner；不迁移 Knowledge DB 到 History。
- **兼容窗口：** 无 private watcher/full-walk 兼容期；Knowledge schema 仅按实际新字段建立当前基线。
- **监控信号：** event cursor/gap、scoped repair count、full scan count、generation state、query health。
- **回滚或前向恢复：** 先停止新 subscriber/queue再恢复前一 code Wave；绝不同时恢复 old watcher。
- **不可逆操作与批准点：** 可重建 index 操作需遵守现有 journal/generation contracts；Git integration 需授权。
- **收缩条件：** private root watcher、duplicate baseline and direct Engine-to-Knowledge mutation calls 为零。

## 10. 验收标准

- [ ] `AC-003`：Knowledge/Workbench 外部合同无回退。
- [ ] `AC-011`/`AC-012`：事件和 stale/gap 通过 shared baseline + scoped repair 收敛。
- [ ] `AC-013`：Knowledge 派生 failure/retry 与四态 health 一致且可见。
- [ ] `AC-017`：资源版本变化后 Knowledge source/search 可收敛到磁盘版本。
- [ ] watcher/full-walk/direct mutation 重复调用点为零并记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-14.md</Path>`。
