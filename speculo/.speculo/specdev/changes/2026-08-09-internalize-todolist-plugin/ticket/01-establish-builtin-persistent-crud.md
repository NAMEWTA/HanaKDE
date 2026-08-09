---
schema_version: 3
artifact: ticket
change: 2026-08-09-internalize-todolist-plugin
id: T-01
title: 建立 builtin 插件与持久 CRUD 闭环
status: ready
planning_depth: deep
planning_depth_reason: 新增 builtin 插件贡献、私有持久 schema、authenticated routes 与 Agent tool 公共合同，并涉及权限和分发边界。
ready: true
risk: high
blocked_by: []
contract_ids: [AC-001, AC-002, AC-003, AC-004, AC-029, AC-033]
owner: implementation-owner
expected_changes: ["<Path>plugins/todolist/manifest.json</Path>", "<Path>plugins/todolist/package.json</Path>", "<Path>plugins/todolist/routes/**</Path>", "<Path>plugins/todolist/src/**</Path>", "<Path>plugins/todolist/assets/**</Path>", "<Path>plugins/todolist/tests/plugin-crud.integration.test.ts</Path>"]
writable_paths: ["<Path>plugins/todolist/**</Path>"]
read_only_paths: ["<Path>core/plugin-manager.ts</Path>", "<Path>core/plugin-context.ts</Path>", "<Path>lib/tools/todo.ts</Path>", "<Path>lib/tools/todo-constants.ts</Path>", "<Path>plugins/beautify/**</Path>", "<Path>skills2set/hana-plugin-creator/**</Path>", "<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-01: 建立 builtin 插件与持久 CRUD 闭环

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/01-establish-builtin-persistent-crud.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-01.md</Path>`

## 1. 战略与来源

- **目标：** 用当前 Hana 插件 SDK 建立可被 PluginManager 自动发现的 builtin `todolist`，让 Page 与 `todo_*` Agent tools 通过同一应用服务和私有持久 store 完成 Todo CRUD。
- **可观察产出：** 冷启动后 Hana Todo Page 可创建、分页查询、读取、更新、完成和恢复 Todo；tool 创建的记录立即可由 Page 读取，反向亦然。
- **来源：** US-001、US-007、US-011，AC-001～004、AC-029、AC-033，ADR-002、ADR-014，USER-DECISION。
- **当前事实：** PluginManager 已通配发现 builtin 插件，现有 `<Path>plugins/</Path>` 没有 Todo Page；参考实现不能整体复制，`todo_write` 仍是 Session 内规划工具。
- **Planning Depth 原因：** 该切片锁定新插件身份、持久数据入口、route/tool wire contract、能力声明和稳定错误类别，错误会影响后续全部 Ticket。

## 2. 决策状态

### 已锁定决策

- 插件目录与 id 均为 `todolist`，展示名为 Hana Todo，类型为 builtin、`professional-react/full`，所有产品文件只位于 `<Path>plugins/todolist/</Path>`。
- Page、routes、tools 不保存各自状态副本，统一调用同一 application service；Todo mutation 使用稳定 id、递增 version 和审计时间。
- 查询必须有界分页；初始主状态只有 `pending/completed`，副作用模式默认 `manual`。
- tools 使用 `todo_` namespace，不注册、包装或读写 `todo_write` 与 `hana.todo_state`；内部 handler 不暴露为普通 tool。
- route 身份和授权只信任宿主 context；错误返回稳定类别和脱敏诊断，不静默 fallback 或部分成功。

### 已采用的低影响假设

- 使用 `hana-plugin-creator` 已通过的 scaffold 能力生成等价目录骨架；若当前仓库示例与模板冲突，以仓库 SDK 类型和已加载 builtin 先例为准。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| manifest、插件入口、私有 store v1、CRUD service、authenticated routes、namespaced tools、最小可用 Page、插件内测试 | PluginManager discovery、surface session、`hana.api.fetch()`、插件组件与现有构建通配 | 时间视图、周期、提醒、Agent Run、迁移导出；任何宿主、根依赖或公共测试修改 |

## 4. 要构建什么

用户打开 Hana Todo 后看到稳定的 Inbox 列表和快速新增入口。创建返回 id/version，刷新后仍存在；编辑必须携带期望 version，完成和恢复只改变主状态及审计字段。Agent 通过 `todo_create/query/get/update/complete/reopen` 操作同一记录。无效字段、stale version、越权 context 或 store 失败均返回稳定错误且不产生隐式部分写入。Page 的最小交互同时具备五语言资源结构、键盘焦点、ARIA、主题继承和窄布局基线，后续 UI Ticket 在此基础上扩展。

## 5. 实现契约

- **入口或接缝：** PluginManager manifest/contributions、Todo Page、authenticated plugin routes、Agent tool registry、application service。
- **输入与输出：** mutation 输入为经过 schema 校验的 Todo 字段与可选 expectedVersion；输出为规范 Todo DTO 或稳定错误；query 输入为过滤与有界 cursor/limit。
- **公共接口变化：** 新增 builtin `todolist` Page、同插件 routes 和 `todo_*` tools；不改变任何宿主接口。
- **不变量：** Page/tool 同源；id 稳定；version 仅成功 mutation 递增；一次 mutation 要么完整提交要么不写；不持久化绝对路径、Session 消息或 token secret。
- **状态或数据流：** Page/tool -> schema adapter -> application service -> transaction/store -> DTO；store schema 版本与 migration journal 位于插件私有 dataDir。
- **错误与失败行为：** 至少区分 validation、not_found、conflict、forbidden、capability_unavailable、storage_failure；诊断脱敏，无吞错与假成功。
- **兼容要求：** `todo_write` 名称、快照、Session UI 不变；community plugin 与其它 builtin 的发现优先级不变。
- **安全与隐私要求：** 显式声明且只请求实际使用的能力；principal/plugin/session 从宿主 context 获取，body 中同名字段无权覆盖。

## 6. 执行路线

1. 在 `<Path>plugins/todolist/</Path>` 建立 manifest、package、server/UI 入口与插件内测试骨架，先用 discovery/tool catalog 测试证明目标尚未成立。
2. 建立私有 schema v1、事务 store、Todo DTO 与稳定错误模型，覆盖 version、分页和故障原子性。
3. 通过单一 application service 接入 routes 与 namespaced tools，并验证 `todo_write` 未被注册或触碰。
4. 接入最小 Page CRUD 流程和本地化/可访问性骨架，全部请求经 surface session 与 `hana.api.fetch()`。
5. 运行插件内集成、类型、lint 和既有 TodoWrite 回归，记录路径白名单与 Evidence。

## 7. 路径访问契约

- **预计修改点：** 仅 frontmatter `expected_changes` 所列的 `<Path>plugins/todolist/</Path>` 内 manifest、入口、领域/应用/存储/UI 和测试。
- **可写范围：** `<Path>plugins/todolist/**</Path>`；越界前必须停止并走偏差控制。
- **只读上下文：** PluginManager、plugin context、现有 TodoWrite、builtin 示例、creator skill 和参考插件。
- **共享路径：** 无；T-01 是根 Ticket，后续 Ticket 通过依赖串行消费其插件内契约。
- **保留或不动：** `<Path>core/</Path>`、`<Path>server/</Path>`、`<Path>desktop/</Path>`、`<Path>shared/</Path>`、`<Path>lib/</Path>`、`<Path>hub/</Path>`、`<Path>cli/</Path>`、`<Path>packages/</Path>`、`<Path>scripts/</Path>`、公共 `<Path>tests/</Path>` 和其它插件。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | route/tool/store 集成 | `npx vitest run <Path>plugins/todolist/tests/plugin-crud.integration.test.ts</Path>` | Page 与 tools 读写同一 id/version，CRUD 与分页持久化 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-01.md</Path>` |
| 失败路径 | schema、并发与 store 故障注入 | 同一集成测试执行 invalid、stale、forbidden、commit failure 场景 | 稳定错误，无部分写入或敏感诊断 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-01.md</Path>` |
| UI E2E（owner：当前执行 owner） | Desktop Page | 运行插件内 Playwright CRUD smoke | builtin Page 可达，窄布局无裁切，键盘可完成创建与编辑 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-01.md</Path>` |
| 回归 | 既有 TodoWrite 与插件目录 | `npx vitest run <Path>tests/todo-constants.test.ts</Path> <Path>tests/todo-write-tool.test.ts</Path>` 并审计 Git diff | 既有 2 组契约保持；产品 diff 仅在插件根 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-01.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 先创建空 store v1，再启用 CRUD contribution；schema 初始化和升级必须事务化。
- **兼容窗口：** 不读取参考插件 SQLite，也不接管任何旧目录；新插件没有隐式旧数据兼容承诺。
- **监控信号：** plugin loaded 状态、store schema/version、route/tool 错误类别和最近 migration 结果。
- **回滚或前向恢复：** 发布前可整块移除 `<Path>plugins/todolist/</Path>`；已有数据后 migration 失败保持原数据不变，优先前向修复而不是用旧代码读取新 schema。
- **不可逆操作与批准点：** 本 Ticket 无永久删除；任何无法事务回滚的 schema 变更必须停止并取得批准。
- **收缩条件：** plugin discovery、CRUD、tool catalog、TodoWrite 回归及整块删除 smoke 均有 Evidence 后，才允许后续扩展。

## 10. 验收标准

- [ ] AC-001、AC-002、AC-004：builtin Page 与 namespaced tools 通过同一持久 store 完成稳定 version CRUD 和有界查询。
- [ ] AC-003、AC-033：`todo_write` 保持不变，普通 Session 只看到用户级 `todo_*` tools。
- [ ] AC-029：无效、冲突、权限和存储失败均稳定、脱敏、原子。
- [ ] 验证矩阵全部执行并记录到 `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-01.md</Path>`。
- [ ] 实际项目修改未超出 `writable_paths`，没有宿主或公共测试改动。
- [ ] Ticket、Tickets Map 和 Evidence 状态一致，未发生未批准偏差。
