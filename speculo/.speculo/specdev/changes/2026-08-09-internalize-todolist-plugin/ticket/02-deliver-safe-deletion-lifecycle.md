---
schema_version: 3
artifact: ticket
change: 2026-08-09-internalize-todolist-plugin
id: T-02
title: 交付安全删除、Trash 与确认协议
status: done
planning_depth: deep
planning_depth_reason: 涉及可恢复与永久删除、事务原子性、session/version 绑定授权以及私有 schema 迁移。
ready: true
risk: high
blocked_by: [T-01]
contract_ids: [AC-013, AC-014, AC-029]
owner: implementation-owner
expected_changes: ["<Path>plugins/todolist/src/**</Path>", "<Path>plugins/todolist/assets/**</Path>", "<Path>plugins/todolist/tests/todo-lifecycle.integration.test.ts</Path>", "<Path>plugins/todolist/tests/e2e/todo-lifecycle.spec.ts</Path>"]
writable_paths: ["<Path>plugins/todolist/**</Path>"]
read_only_paths: ["<Path>core/plugin-route-request-context.ts</Path>", "<Path>lib/tools/**</Path>", "<Path>temp/HanaKDE-TodoList-0.0.5-workbench-source-audited-final/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-02: 交付安全删除、Trash 与确认协议

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/02-deliver-safe-deletion-lifecycle.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-02.md</Path>`

## 1. 战略与来源

- **目标：** 在 T-01 的 versioned mutation 上提供普通删除可恢复、危险删除显式确认的完整生命周期。
- **可观察产出：** 删除后 Todo 立即离开活动视图，用户可撤销或从 Trash 恢复；永久、批量或 Agent 删除只有 prepare/confirm 成功才执行。
- **边界澄清：** 这里的“批量”仅指用户显式选择后的危险删除确认，不包含批量创建；Todo 创建始终由 T-03 逐项完成。
- **来源：** US-001、US-005，AC-013、AC-014、AC-029，ADR-013，Spec DEC-013。
- **当前事实：** T-01 只提供主状态 CRUD，没有 Trash、undo 窗口或危险操作确认；参考插件的删除行为不得直接成为授权先例。
- **Planning Depth 原因：** 删除影响数据完整性且包含不可逆操作与授权令牌，需要迁移、回滚和批准点。

## 2. 决策状态

### 已锁定决策

- 普通 UI 删除是 soft delete，保留业务字段与审计；undo 和 Trash restore 恢复同一稳定 id。
- prepare 返回短时、单用途、session-bound、目标及 expectedVersion 绑定的 opaque token；confirm 重新验证全部约束。
- 目标版本变化、session 不匹配、token 过期/复用均拒绝且不写；批量永久删除采用全成全不成事务，或按明确请求返回逐项事务结果，不得隐藏部分成功。
- token secret 不持久化为明文，不进入 DTO、日志或 UI；Agent 与 Page 共用确认 service。

### 已采用的低影响假设

- Undo 可由 UI 在 soft-delete mutation 返回后展示，不承诺跨设备同步倒计时；Trash restore 始终是持久恢复入口。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| soft delete、undo、Trash、restore、prepare/confirm、批量原子性、Page/tool 行为与测试 | T-01 id/version/store/route/tool/error 基线、宿主 surface session | Project 删除、周期系列删除、自动化取消、旧数据导入、宿主确认 API |

## 4. 要构建什么

用户删除普通 Todo 后，活动查询不再返回它，Page 立即提供可聚焦的撤销动作，Trash 可列出并恢复原记录。永久删除和 Agent/批量危险操作先 prepare，UI 或 tool 展示明确目标与数量，再以同一 session 和目标版本 confirm。任何验证失败均保持数据原样并返回可行动错误；成功后重复 confirm 也不得再次删除。

## 5. 实现契约

- **入口或接缝：** Todo lifecycle application service、Trash routes/Page、`todo_delete_prepare`、`todo_delete_confirm`、`todo_restore`。
- **输入与输出：** soft delete 接收 id/version；prepare 接收排序规范化后的目标集；confirm 接收 opaque token；输出 mutation result、恢复 Todo 或稳定错误。
- **公共接口变化：** 新增插件内 lifecycle routes/tools；宿主接口不变。
- **不变量：** soft-deleted 数据不出现在活动查询；restore 保留业务字段；confirm 严格绑定 principal/session/target/version/expiry/nonce；永久删除不发生未声明部分成功。
- **状态或数据流：** active -> trashed -> active 或 purged；confirmation prepare -> issued -> consumed/expired/rejected，状态转换与审计同事务提交。
- **错误与失败行为：** stale_target、session_mismatch、confirmation_expired、confirmation_consumed、not_found 和 transaction_failed 稳定可判定。
- **兼容要求：** T-01 CRUD 对活动 Todo 的语义保持；完成/恢复状态不等同于 Trash restore。
- **安全与隐私要求：** fail closed；token 不可推导目标外权限，不记录 secret，不接受 body 伪造 owner/session。

## 6. 执行路线

1. 为 soft delete、恢复和确认状态转换建立失败测试及事务不变量。
2. 在插件私有 schema 中增加 Trash/confirmation 审计所需字段或表，并提供事务 migration。
3. 实现 lifecycle service 与 routes/tools，所有危险入口统一调用 prepare/confirm。
4. 扩展 Page 的 undo、Trash、恢复和确认对话框，覆盖焦点返回、键盘与五语言文案。
5. 执行故障注入、E2E 和 T-01 CRUD 回归，记录永久操作未执行的负向证据。

## 7. 路径访问契约

- **预计修改点：** `<Path>plugins/todolist/src/**</Path>`、`<Path>plugins/todolist/assets/**</Path>` 与插件内 lifecycle 测试。
- **可写范围：** `<Path>plugins/todolist/**</Path>`。
- **只读上下文：** 宿主 route context、现有 tools 先例与参考插件删除意图。
- **共享路径：** 无；T-02 在 T-01 完成后成为本次串行写入 owner。
- **保留或不动：** 所有插件根之外产品文件；不新增宿主确认能力。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | lifecycle service/route/tool | `npx vitest run <Path>plugins/todolist/tests/todo-lifecycle.integration.test.ts</Path>` | soft delete、undo、Trash restore 和有效 confirm 保持字段与审计合同 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-02.md</Path>` |
| 失败路径 | confirmation 故障注入 | 同一测试执行 stale、session mismatch、expired、replay、事务失败 | 全部拒绝且零部分写入，token 不泄漏 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-02.md</Path>` |
| UI E2E（owner：当前执行 owner） | Page 删除与 Trash | `npx playwright test --config=<Path>plugins/todolist/tests/e2e/playwright.config.ts</Path> <Path>plugins/todolist/tests/e2e/todo-lifecycle.spec.ts</Path>` | 删除、撤销、恢复、确认焦点和窄布局可用 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-02.md</Path>` |
| 回归 | T-01 CRUD | `npx vitest run <Path>plugins/todolist/tests/plugin-crud.integration.test.ts</Path>` | 活动 CRUD/version/pagination 不回归 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-02.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 事务扩展 store 后再暴露 Trash 和 confirmation 入口；旧活动记录默认非 deleted。
- **兼容窗口：** T-01 DTO 新增 lifecycle 字段时保持旧字段含义，插件内消费者同 Ticket 原子迁移。
- **监控信号：** lifecycle transition、confirmation 拒绝类别、purge 数量和 transaction rollback 计数，均脱敏。
- **回滚或前向恢复：** migration 失败不改变旧 store；soft delete 可恢复；已永久删除不可由代码回滚，因此发布后优先前向修复。
- **不可逆操作与批准点：** 永久删除 confirm 是明确用户批准点；测试或 migration 不得自动 purge 用户数据。
- **收缩条件：** Page/tool 不再存在无确认永久删除入口，扫描与测试有 Evidence 后才允许后续切片复用该协议。

## 10. 验收标准

- [x] AC-013：普通删除立即隐藏且可撤销/Trash 恢复，业务字段与审计保持。
- [x] AC-014：stale、session mismatch、过期和重放均拒绝，有效 confirm 才原子执行。
- [x] AC-029：失败类别稳定、脱敏且无未声明部分成功。
- [x] 验证矩阵记录于 `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-02.md</Path>`。
- [x] 产品修改仅位于 `<Path>plugins/todolist/</Path>`，Ticket/Map/Evidence 状态一致。
