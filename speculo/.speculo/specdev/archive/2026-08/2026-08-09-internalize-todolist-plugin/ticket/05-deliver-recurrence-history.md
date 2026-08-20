---
schema_version: 3
artifact: ticket
change: 2026-08-09-internalize-todolist-plugin
id: T-05
title: 交付周期任务与历史不变量
status: done
planning_depth: deep
planning_depth_reason: 新增 RecurrenceRule/version/occurrence/override/suppression schema，涉及幂等物化、历史不可变与危险系列事务。
ready: true
risk: high
blocked_by: [T-04]
contract_ids: [AC-014, AC-015, AC-016, AC-029]
owner: implementation-owner
expected_changes: ["<Path>plugins/todolist/src/**</Path>", "<Path>plugins/todolist/assets/**</Path>", "<Path>plugins/todolist/tests/recurrence.test.ts</Path>", "<Path>plugins/todolist/tests/recurrence.integration.test.ts</Path>"]
writable_paths: ["<Path>plugins/todolist/**</Path>"]
read_only_paths: ["<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/tests/recurrence.test.ts</Path>", "<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/src/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-05: 交付周期任务与历史不变量

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/05-deliver-recurrence-history.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-05.md</Path>`

## 1. 战略与来源

- **目标：** 在 T-04 typed time 上建立可解释、幂等且不改写历史的周期任务模型。
- **可观察产出：** 用户可创建 calendar 或 after-completion 周期，跳过/编辑本次、编辑未来、暂停或结束系列，历史完成项保持不变。
- **来源：** US-005、US-006，AC-014～016、AC-029，ADR-011、ADR-012，D-027、D-029。
- **当前事实：** 参考实现有可复用的纯 recurrence 测试意图，但其整体服务、数据库和 timer 不符合内置插件合同。
- **Planning Depth 原因：** 周期 schema、系列边界和批量变更错误会制造重复任务或篡改历史，需 Deep 迁移和恢复设计。

## 2. 决策状态

### 已锁定决策

- RecurrenceRule 是周期权威；calendar 只在有界可见窗口物化且 stable occurrence identity 幂等。
- after-completion 同时最多一个活动 occurrence，完成当前项后才生成一个下一项。
- 单次编辑写 occurrence override；“本次及未来”创建边界 rule version；skip 写 suppression；历史与已完成 occurrence 不可变。
- 危险未来批量变更复用 T-02 prepare/confirm 并在同一事务中完成或回滚。
- occurrence 是独立 Todo 事实，系列操作不得静默重写用户已编辑字段。

### 已采用的低影响假设

- 首发 recurrence 表达采用 Spec 已锁定的有界频率/间隔集合；不支持的规则明确拒绝，不做近似转换。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| rule/version/occurrence/override/suppression、calendar/after-completion 物化、系列编辑 UI/tools、确认与历史测试 | T-02 confirmation，T-04 typed time/focus queries | 自建 scheduler timer、无限预生成、复杂自然语言 RRULE、外部日历同步、自动化 Run |

## 4. 要构建什么

用户为 Todo 选择固定日历节奏或完成后间隔。Calendar 模式只补齐查询窗口所需 occurrence，重复调用得到同一 identity；完成后模式在当前 occurrence 完成前不生成下一条。用户可对单次、未来系列、跳过、暂停和结束作出明确选择，危险范围先确认。历史和完成 occurrence 的标题、时间、状态和审计不被未来规则修改。

## 5. 实现契约

- **入口或接缝：** recurrence domain service、materialization application service、Todo completion hook、routes/tools 和 Page recurrence editor。
- **输入与输出：** versioned RecurrenceRule、window、series/occurrence id、edit scope；输出 occurrence DTO、materialization summary 或稳定错误。
- **公共接口变化：** 新增插件内 recurrence DTO/routes/tools；不注册内部 materializer 为普通 Session tool。
- **不变量：** stable series/ruleVersion/occurrence identity；同一窗口重复物化无重复；after-completion 一个 active next；历史/完成不可变；批量变更原子。
- **状态或数据流：** rule -> bounded planner -> identity claim -> transaction occurrence/suppression；completion -> after-completion planner -> one next occurrence。
- **错误与失败行为：** invalid_rule、unbounded_rule、stale_series、immutable_history、confirmation_required、materialization_conflict 和 transaction_failed 可判定。
- **兼容要求：** 非周期 Todo 行为不变；T-04 date/exact kind 原样沿用，不以 recurrence 修复非法时间。
- **安全与隐私要求：** 批量未来变更 fail closed；日志只记录 identity/count/category，不复制 Todo 正文。

## 6. 执行路线

1. 从参考测试仅提炼纯规则 fixture，先覆盖 DST、月末、重复窗口、after-completion 和历史不可变。
2. 事务增加 rule/version/occurrence/override/suppression schema 与 migration。
3. 实现纯 planner、bounded materializer 和 completion hook，使用稳定 identity 收敛重复调用。
4. 接入 routes/tools/Page 的范围选择与 T-02 confirmation，覆盖五语言、焦点和窄布局。
5. 运行 recurrence 单元/集成、故障回滚及 T-04 时间投影回归。

## 7. 路径访问契约

- **预计修改点：** 插件内 recurrence domain/application/store/UI/tests。
- **可写范围：** `<Path>plugins/todolist/**</Path>`。
- **只读上下文：** 参考 recurrence 测试和算法意图；参考基础设施、timer、数据库层不得复制。
- **共享路径：** 无；T-05 顺序消费 T-04 typed-time 合同。
- **保留或不动：** TaskRegistry、宿主时钟、公共测试与所有插件根外文件。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | recurrence domain/integration | `npx vitest run <Path>plugins/todolist/tests/recurrence.test.ts</Path> <Path>plugins/todolist/tests/recurrence.integration.test.ts</Path>` | 两种模式、编辑范围、暂停/结束和有界物化符合合同 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-05.md</Path>` |
| 失败路径 | 重复/事务/确认故障 | 同一测试重复物化、stale series、未确认未来变更、commit failure | 无重复、无历史改写、无部分系列更新 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-05.md</Path>` |
| UI E2E（owner：当前执行 owner） | Page recurrence editor | 运行插件内 recurrence 交互场景 | 范围选择和危险确认可键盘完成，文本/弹层不裁切 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-05.md</Path>` |
| 回归 | typed time/focus/lifecycle | `npx vitest run <Path>plugins/todolist/tests/time-projections.test.ts</Path> <Path>plugins/todolist/tests/todo-lifecycle.integration.test.ts</Path>` | 时区、Trash 和 confirmation 语义保持 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-05.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 新增空 recurrence 表 -> 写 rule/version -> 启用 materialization -> 暴露系列 UI/tools；不把普通 Todo 自动转为周期。
- **兼容窗口：** 非周期 DTO 不变；已存在 rule version 永不原地改写，新的未来规则使用边界版本。
- **监控信号：** duplicate claim、materialization window/count、suppression、immutable-history 拒绝和 transaction rollback。
- **回滚或前向恢复：** planner 可在不写库模式重算核对；transaction 失败不留下半系列；已生成 occurrence 不通过回滚删除，采用 suppression/前向修复。
- **不可逆操作与批准点：** 删除未来 occurrence 或结束系列需要 T-02 confirmation；完成历史永不作为清理对象。
- **收缩条件：** 重复 materialization 为零、历史 diff 为空、非周期回归通过后才允许 scheduler 消费 occurrence identity。

## 10. 验收标准

- [x] AC-015：calendar 有界幂等，after-completion 只在完成后产生一个活动下一项。
- [x] AC-016：override/version/suppression 正确，历史和完成 occurrence 不变，危险系列变更原子确认。
- [x] AC-014、AC-029：确认失败、冲突和事务失败无部分写入。
- [x] Evidence 完整且产品 diff 仅位于 `<Path>plugins/todolist/</Path>`。
