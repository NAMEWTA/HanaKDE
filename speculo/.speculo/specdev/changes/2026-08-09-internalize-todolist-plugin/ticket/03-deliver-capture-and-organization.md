---
schema_version: 3
artifact: ticket
change: 2026-08-09-internalize-todolist-plugin
id: T-03
title: 交付快速捕获与组织工作流
status: ready
planning_depth: deep
planning_depth_reason: 扩展持久 Todo/Project schema、上下文解析写入规则和 Project 删除数据完整性合同。
ready: true
risk: medium
blocked_by: [T-02]
contract_ids: [AC-006, AC-007, AC-029, AC-031]
owner: unassigned
expected_changes: ["<Path>plugins/todolist/src/**</Path>", "<Path>plugins/todolist/assets/**</Path>", "<Path>plugins/todolist/tests/capture-organization.integration.test.ts</Path>", "<Path>plugins/todolist/tests/e2e/capture-organization.spec.ts</Path>"]
writable_paths: ["<Path>plugins/todolist/**</Path>"]
read_only_paths: ["<Path>plugins/office/**</Path>", "<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/src/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-03: 交付快速捕获与组织工作流

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/03-deliver-capture-and-organization.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-03.md</Path>`

## 1. 战略与来源

- **目标：** 把低摩擦捕获、单层 Project/List 和 tags 组合为一条可预测的日常组织路径。
- **可观察产出：** 用户可从全局、Today 或 Project 上下文捕获 Todo，并明确看到将写入的继承 chip；可归属、筛选和安全删除 Project。
- **来源：** US-002、US-004，AC-006、AC-007、AC-029、AC-031，ADR-002，Spec DEC-019。
- **当前事实：** T-02 提供安全 mutation/restore，但 Todo 尚无 Project/List、tags 或上下文捕获语义。
- **Planning Depth 原因：** 组织关系进入持久 schema 和 wire DTO，Project 删除必须保证 Todo 不丢失。

## 2. 决策状态

### 已锁定决策

- Todo 至多归属一个单层 Project/List，tags 为多值；不实现嵌套项目、看板或团队协作。
- 全局捕获默认 Inbox；Today、Project 和日期上下文只有在 UI 显示对应 chip 且用户未移除时才写入继承字段。
- 自然语言解析只是建议，解析字段必须可见、可移除；未显示字段不得暗写。
- 删除 Project/List 不删除 Todo，所属 Todo 原子回到 Inbox；危险 Todo 删除仍走 T-02。

### 已采用的低影响假设

- tag 规范化采用 trim 后的显示值与稳定内部 id；大小写折叠仅用于去重，不改写用户最终展示文本。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| Inbox、Project/List CRUD、tags、捕获解析建议、inherit chips、筛选和 Project 删除回 Inbox | T-01 store/routes/tools/Page，T-02 version/confirmation/undo 模式 | 嵌套项目、协作、复杂 NLP、时间 DST 语义、周期和自动化 |

## 4. 要构建什么

用户在任何主视图键入标题时，Page 解析可识别的 Project/tag/日期提示并以 chip 明示最终写入值。全局入口没有上下文时写入 Inbox；Project 入口显示并继承 Project，移除 chip 后不写。Project 列表支持创建、重命名、过滤和删除；删除后原 Todo 仍可在 Inbox 查到。route 与 tool 对同一组织 DTO、version 和错误规则达成一致。

## 5. 实现契约

- **入口或接缝：** capture application service、Project routes/tools、Page quick capture 与导航过滤器。
- **输入与输出：** capture 输入为原文本、显式 context 和用户确认后的 chips；输出为规范 Todo；Project mutation 接收 id/version/name。
- **公共接口变化：** 新增插件内 Project/tag 字段、routes 和 namespaced tools；无宿主变化。
- **不变量：** 一个 Todo 最多一个 Project；删除 Project 后引用归零且 Todo 回 Inbox；未确认的解析建议不落库；tag 查询有界。
- **状态或数据流：** raw input -> parse suggestions -> visible chips -> confirmed create DTO -> application service/store；Project delete 与 Todo reassignment 同事务。
- **错误与失败行为：** invalid_context、duplicate_project、stale_version、parse_rejected、transaction_failed 可判定；失败不暗写字段。
- **兼容要求：** 既有无组织 Todo 解释为 Inbox；T-01/T-02 DTO 和生命周期保持。
- **安全与隐私要求：** 捕获文本仅作为 Todo 用户数据处理，不进入诊断；不向外部服务发送自然语言。

## 6. 执行路线

1. 用 Project 删除和 capture chip 行为测试固定组织不变量与失败结果。
2. 事务扩展私有 schema/DTO，并实现 Project/List、tag 与 Inbox 查询。
3. 实现显式 suggestions -> chips -> create 流程及对应 routes/tools，禁止隐藏继承。
4. 扩展 Page 主导航、quick capture、Project 管理与响应式交互，补齐五语言和键盘路径。
5. 运行集成、E2E、Trash/CRUD 回归和路径审计。

## 7. 路径访问契约

- **预计修改点：** 插件内领域、应用、存储、UI、assets 和 capture/organization 测试。
- **可写范围：** `<Path>plugins/todolist/**</Path>`。
- **只读上下文：** 现有插件 UI 先例与参考插件的捕获意图，禁止复制其宿主 mock。
- **共享路径：** 无；依赖 T-02 后顺序修改整个插件根。
- **保留或不动：** 宿主导航、公共组件、公共测试和根依赖定义。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | capture/organization 集成 | `npx vitest run <Path>plugins/todolist/tests/capture-organization.integration.test.ts</Path>` | Inbox、Project、tags、chips 和筛选结果同源且持久 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-03.md</Path>` |
| 失败路径 | parser/transaction 故障 | 测试未显示 chip、移除 chip、stale Project、删除回滚 | 不暗写解析字段，失败时 Project/Todo 均保持原状 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-03.md</Path>` |
| UI E2E（owner：当前执行 owner） | Page capture/Project | `npx playwright test --config=<Path>plugins/todolist/tests/e2e/playwright.config.ts</Path> <Path>plugins/todolist/tests/e2e/capture-organization.spec.ts</Path>` | 五语言、键盘、chip 移除和窄布局均可完成流程 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-03.md</Path>` |
| 回归 | lifecycle/CRUD | `npx vitest run <Path>plugins/todolist/tests/plugin-crud.integration.test.ts</Path> <Path>plugins/todolist/tests/todo-lifecycle.integration.test.ts</Path>` | 版本、Trash 和 restore 不回归 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-03.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 先增加 nullable Project 引用和组织表，再把无引用记录投影为 Inbox；最后启用 UI/tool。
- **兼容窗口：** 旧 Todo 不需要重写即可显示为 Inbox；新增字段对旧 DTO consumer 使用明确默认值。
- **监控信号：** orphan Project reference、capture suggestion 接受/移除、Project delete rollback 和稳定错误类别。
- **回滚或前向恢复：** migration 失败保持 T-02 schema；Project 删除事务失败不改变任何 Todo；schema 已升级后采用前向恢复。
- **不可逆操作与批准点：** 无；Project 删除不删除 Todo，tag 清理不得删除 Todo 数据。
- **收缩条件：** orphan 扫描为零且所有无 Project Todo 可由 Inbox 查询证明后，组织 migration 才完成。

## 10. 验收标准

- [ ] AC-006：所有捕获上下文以可见 chip 决定写入，缺失或移除 chip 不暗写。
- [ ] AC-007：单层 Project/List 与 tags 可用，删除 Project 后 Todo 完整回到 Inbox。
- [ ] AC-029、AC-031：失败稳定无部分写入，核心捕获/组织交互在五语言、键盘和窄布局下可用。
- [ ] Evidence 写入 `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-03.md</Path>`，产品 diff 仅在插件根。
