---
schema_version: 3
artifact: ticket
change: 2026-08-09-internalize-todolist-plugin
id: T-04
title: 交付类型化时间与聚焦视图
status: ready
planning_depth: deep
planning_depth_reason: 引入 date/zoned exact time wire 与持久 schema、DST 歧义处理和跨时区查询不变量。
ready: true
risk: high
blocked_by: [T-03]
contract_ids: [AC-005, AC-008, AC-009, AC-030, AC-031]
owner: implementation-owner
expected_changes: ["<Path>plugins/todolist/src/**</Path>", "<Path>plugins/todolist/assets/**</Path>", "<Path>plugins/todolist/tests/time-projections.test.ts</Path>", "<Path>plugins/todolist/tests/e2e/planning-views.spec.ts</Path>"]
writable_paths: ["<Path>plugins/todolist/**</Path>"]
read_only_paths: ["<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/src/domain/**</Path>", "<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/tests/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-04: 交付类型化时间与聚焦视图

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/04-deliver-typed-time-and-focus-views.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-04.md</Path>`

## 1. 战略与来源

- **目标：** 分离计划、截止和触发时间意图，建立可预测的 Today、Upcoming 与 Calendar 视图。
- **可观察产出：** 用户可保存浮动日期或带 IANA 时区的精确本地时间；跨时区查看不改写 instant，DST 非法/歧义输入得到明确处理。
- **来源：** US-002、US-003、US-004，AC-005、AC-008、AC-009、AC-030、AC-031，ADR-005，D-019、D-028。
- **当前事实：** T-03 只有可见日期 suggestion/organization context，尚未锁定 typed time、attentionDate 和投影成员规则。
- **Planning Depth 原因：** 时间 schema 与 DST 决策影响持久数据、后续 recurrence 和 scheduler identity，事故半径高。

## 2. 决策状态

### 已锁定决策

- `plannedFor`、`deadline`、`trigger` 分离；设置前两者不创建 reminder 或 Agent 自动化。
- date 是浮动日历日期；exact time 同时保存 local、IANA timezone、解析后的 instant 和 overlap 时的明确 offset。
- DST gap 拒绝；overlap 要求用户选择 offset；系统时区变化不得改写已存 instant。
- `attentionDate` 按显示时区从 plannedFor 优先、deadline 后备派生；Today 分 Overdue/Today，Upcoming 仅未来且每 Todo 出现一次，无日期不进入。
- Calendar 是同一 store 的时间意图投影，不创建第三份状态。

### 已采用的低影响假设

- Today 的显示时区优先使用 Hana surface/用户设置可得时区，缺失时使用运行时系统时区并在 DTO 返回所用 IANA zone。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| typed time、DST 校验、attentionDate、Today/Upcoming/Calendar、编辑控件和查询 | T-03 capture chips、Project 过滤、同源 store/Page/tool | recurrence、notification、Agent trigger 执行、外部日历同步、固定时间性能承诺 |

## 4. 要构建什么

用户在创建或编辑 Todo 时分别选择计划、截止和可选触发意图。纯日期在旅行或系统时区变化后仍代表同一日历日；精确时间显示原 zone/local 并以保存的 instant 排序。DST gap 保存被拒绝并定位字段，overlap 显示两个 offset 选择。Today、Upcoming 和 Calendar 从同一查询投影派生且不重复 Todo；无日期 Todo 仍留在 Inbox/Project。

## 5. 实现契约

- **入口或接缝：** typed-time domain service、Todo mutation DTO、focus query service、Page date/time editor。
- **输入与输出：** date `{kind: date, date}`；exact `{kind: exact, local, timezone, offset?}`，规范输出含 instant；query 输入含 displayTimezone/window/cursor。
- **公共接口变化：** 扩展插件内 Todo DTO/routes/tools；宿主接口不变。
- **不变量：** date 不绑定 instant；exact instant 保存后稳定；gap 永不落库；overlap 未选 offset 永不猜测；attention 投影每 Todo 最多一次。
- **状态或数据流：** user input -> typed parser -> zone resolution -> validation -> transaction -> timezone-aware query projection -> Page DTO。
- **错误与失败行为：** invalid_date、invalid_timezone、dst_gap、dst_overlap_requires_offset、invalid_window、stale_version 稳定且字段可定位。
- **兼容要求：** 无时间的旧 Todo 字段为空且不进入 focus views；组织与 Trash 过滤继续组合。
- **安全与隐私要求：** 时间/zone 仅作为 Todo 数据；诊断不包含无关文本或工作区路径。

## 6. 执行路线

1. 用多 IANA zone、DST gap/overlap 和 attention membership fixture 固定纯领域合同。
2. 事务扩展 typed-time schema/DTO，实现严格解析、规范化和 migration 默认值。
3. 实现 Today/Upcoming/Calendar 查询投影并与 Project、Trash、完成状态组合。
4. 扩展 capture/edit UI 的日期/精确时间选择、歧义处理和三类视图，覆盖五语言/键盘/窄布局。
5. 运行领域、集成、E2E 和前序 CRUD/capture 回归。

## 7. 路径访问契约

- **预计修改点：** 插件内 time domain、schema/migration、query、routes/tools、UI 和测试。
- **可写范围：** `<Path>plugins/todolist/**</Path>`。
- **只读上下文：** 参考实现的纯 recurrence/date 测试意图；不得复用其宿主 timer 或数据库接管代码。
- **共享路径：** 无；T-04 串行消费 T-03 capture/organization DTO。
- **保留或不动：** 系统时间设置、TaskRegistry、通知服务和公共测试。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | time domain/query | `npx vitest run <Path>plugins/todolist/tests/time-projections.test.ts</Path>` | date/exact roundtrip、attentionDate、Today/Upcoming/Calendar 成员正确 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-04.md</Path>` |
| 失败路径 | DST/validation fixture | 同一测试执行 gap、未选择 overlap offset、非法 zone/window | 明确拒绝且 store/version 不变 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-04.md</Path>` |
| UI E2E（owner：当前执行 owner） | Page planning views | `npx playwright test --config=<Path>plugins/todolist/tests/e2e/playwright.config.ts</Path> <Path>plugins/todolist/tests/e2e/planning-views.spec.ts</Path>` | 日期编辑、分组、日历、歧义选择在桌面/窄布局可用 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-04.md</Path>` |
| 回归 | capture/organization/lifecycle | `npx vitest run <Path>plugins/todolist/tests/capture-organization.integration.test.ts</Path> <Path>plugins/todolist/tests/todo-lifecycle.integration.test.ts</Path>` | chip 写入、Project、Trash 语义保持 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-04.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 新增 nullable typed fields -> 迁移/验证已有值 -> 启用写入 -> 启用 focus projections；无旧字段时不虚构迁移。
- **兼容窗口：** 无时间 Todo 继续可用；新 DTO consumer 必须显式处理 `null` 与 kind discriminant。
- **监控信号：** DST validation 类别、非法 zone、projection duplicate、migration failure 和 query window/cursor。
- **回滚或前向恢复：** migration 事务失败保持旧 schema；错误写入未发生前可回滚 UI，schema 已写后用前向修复保持 typed discriminant。
- **不可逆操作与批准点：** 无；禁止自动把浮动日期转换为 instant 或反向转换。
- **收缩条件：** 所有 time consumer 都按 kind 分支且 legacy/untyped 调用扫描为零后，typed time 才视为稳定前置。

## 10. 验收标准

- [ ] AC-005：Today/Upcoming 成员、分组、去重和无日期排除满足合同。
- [ ] AC-008：date 浮动、exact instant 稳定，DST gap/overlap 按合同处理。
- [ ] AC-009、AC-030：时间字段不隐式启用副作用，Calendar 只是同源投影。
- [ ] AC-031：规划视图在五语言、键盘和窄布局下可用。
- [ ] Evidence 完整，产品 diff 仅位于 `<Path>plugins/todolist/</Path>`。
