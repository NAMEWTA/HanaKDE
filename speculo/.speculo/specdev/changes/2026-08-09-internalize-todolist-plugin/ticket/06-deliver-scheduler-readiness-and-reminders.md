---
schema_version: 3
artifact: ticket
change: 2026-08-09-internalize-todolist-plugin
id: T-06
title: 修复调度巡查并交付提醒 handoff
status: done
planning_depth: deep
planning_depth_reason: 涉及后台生命周期、TaskRegistry at-least-once 调度、幂等 claim、崩溃恢复与外部桌面通知副作用。
ready: true
risk: high
blocked_by: [T-05]
contract_ids: [AC-009, AC-010, AC-011, AC-012, AC-023, AC-024, AC-029]
owner: implementation-owner
expected_changes: ["<Path>plugins/todolist/src/**</Path>", "<Path>plugins/todolist/routes/**</Path>", "<Path>plugins/todolist/assets/**</Path>", "<Path>plugins/todolist/tests/scheduler-reminder.integration.test.ts</Path>"]
writable_paths: ["<Path>plugins/todolist/**</Path>"]
read_only_paths: ["<Path>lib/task-registry.ts</Path>", "<Path>server/task-bus-handlers.ts</Path>", "<Path>core/plugin-context.ts</Path>", "<Path>server/routes/chat.ts</Path>", "<Path>lib/notifications/notification-service.ts</Path>", "<Path>tests/task-registry.test.ts</Path>", "<Path>tests/event-bus-capabilities.test.ts</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-06: 修复调度巡查并交付提醒 handoff

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/06-deliver-scheduler-readiness-and-reminders.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-06.md</Path>`

## 1. 战略与来源

- **目标：** 以 TaskRegistry 为唯一到期权威，修复插件启动早于 `task:*` handler 就绪导致的自动巡查失效，并提供诚实、可恢复的桌面提醒 handoff。
- **可观察产出：** 冷启动晚就绪后 schedule 正常注册；到期 reminder 只产生一个稳定 handoff，UI 显示 handed_off/failed/unknown 而不声称 OS delivered。
- **来源：** US-003、US-008、US-011，AC-009～012、AC-023、AC-024、AC-029，ADR-014，D-021、D-025。
- **当前事实：** 宿主 task handlers 晚于 plugin startup 注册；全局 `notification` event 可触发桌面通知但没有送达确认。两项都必须在插件内适配，但 receipt、Bridge 和逐渠道路由不是当前宿主能力，必须延后到未来基础能力变更。
- **Planning Depth 原因：** 后台 at-least-once、进程崩溃窗口和外部副作用会造成漏提醒或重复提醒，需 Deep 状态机与恢复证据。

## 2. 决策状态

### 已锁定决策

- 插件 onStartup 使用有界 readiness retry 等待所需 `task:*` handler；retry 只探测 capability，不扫描 Todo、不判断到期、不成为第二 scheduler。
- retry 耗尽后 CRUD 保持可用，后台状态进入可诊断 unavailable；不得改宿主启动顺序。
- reminder 必须显式启用并有精确 trigger；plannedFor/deadline 单独存在时仍为 `manual`。
- 到期先事务持久化 stable schedule/occurrence/handoff identity 与 claim，再发射已有全局 `notification` event。
- `handed_off` 仅表示 EventBus 调用正常返回；崩溃窗口可为 `unknown`，`failed/unknown` 仅由用户显式重试；`handed_off` 不自动重发。
- reminder 与 Agent automation 开关独立；关闭只取消对应 future schedule，不复活旧 Run。

### 已采用的低影响假设

- readiness retry 的次数与退避值作为插件私有常量并由假时钟测试约束；不把具体毫秒数提升为公共合同。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| task handler readiness、schedule identity/register/cancel/recovery、reminder claim/handoff/retry、独立开关和诊断 | TaskRegistry、full-access EventBus、现有 `notification` event、T-04 trigger、T-05 occurrence identity | 宿主启动重排、新 notification capability、receipt/Bridge/逐渠道路由、Todo due 扫描 timer、Agent Session 执行 |

## 4. 要构建什么

启用 reminder 的 Todo 保存后，插件在 TaskRegistry handler 可用时注册稳定 schedule；冷启动 handler 暂不可用时只进行有限 readiness handshake。到期唤醒以 stable identity claim，先写 handoff 状态再发射现有 notification event。成功仅显示“已交接给桌面通知”，失败或崩溃不伪装成功并提供显式重试。重启补偿漏跑但重复唤醒收敛；关闭提醒只取消 reminder schedule，CRUD 和未来 Agent 能力保持。

## 5. 实现契约

- **入口或接缝：** plugin lifecycle、TaskRegistry bus handlers、schedule/reminder application service、现有 EventBus `notification` event、Page diagnostics/actions；不得假设未提供的 receipt/Bridge 接口。
- **输入与输出：** readiness 返回 ready/exhausted diagnostics；handler 输入 stable schedule identity/trigger payload；handoff 输出 claimed/handed_off/failed/unknown/duplicate。
- **公共接口变化：** 新增插件私有 task handler 与 reminder routes/tools；不新增宿主 capability 或普通 Session 内部 handler tool。
- **不变量：** TaskRegistry 唯一 due authority；同一 trigger identity 最多一个有效 claim；handed_off 不等于 delivered；自动 retry 不重发外部通知；开关互不干扰。
- **状态或数据流：** startup -> bounded readiness -> register handlers/schedules 或 degraded；wake -> transaction claim -> event emit -> persist handed_off/failed，崩溃窗口 -> unknown。
- **错误与失败行为：** readiness_exhausted、schedule_conflict、handoff_failed、handoff_unknown、duplicate_wakeup、capability_unavailable 稳定可见；CRUD 不因后台失败不可用。
- **兼容要求：** 其它 task 类型、NotificationService 调用者与 community plugins 不变；现有 `notification` event shape 只读复用。
- **安全与隐私要求：** notification payload 只含用户确认的最小 Todo 信息；诊断不含绝对路径或 token；副作用 fail closed。

## 6. 执行路线

1. 用假 Task bus/clock 建立晚就绪、耗尽、重复唤醒、重启漏跑、取消和崩溃窗口的失败测试。
2. 扩展插件私有 schedule/reminder/handoff schema，以 stable identity 和事务 claim 固定状态机。
3. 实现有界 readiness handshake、handler/schedule 注册与补偿；代码审计证明不存在 Todo due scanner/第二 interval。
4. 实现 EventBus handoff、显式 retry、独立开关和 Page 诊断，明确 handed_off 文案。
5. 执行故障注入、前序 recurrence/time 回归以及现有 TaskRegistry/EventBus 只读回归命令。

## 7. 路径访问契约

- **预计修改点：** 插件内 lifecycle、scheduler/reminder domain/application/store、routes/tools/UI/tests。
- **可写范围：** `<Path>plugins/todolist/**</Path>`。
- **只读上下文：** TaskRegistry、server handler 顺序、plugin EventBus、chat notification 消费与既有测试。
- **共享路径：** 无；T-06 在 T-05 后独占插件根写入。
- **保留或不动：** 宿主 task/notification/context 代码、公共测试、根配置及其它插件；缺失的通知送达确认能力留待后续 HanaKDE 基础 change。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | TaskRegistry/EventBus harness | `npx vitest run <Path>plugins/todolist/tests/scheduler-reminder.integration.test.ts</Path>` | 晚就绪后注册，到期 claim/handoff、重启补偿和独立开关正确 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-06.md</Path>` |
| 失败路径 | 假时钟/崩溃注入 | 同一测试执行 retry 耗尽、emit 失败、claim 后崩溃、重复 wake、cancel 后 wake | degraded 可诊断，failed/unknown 诚实，零自动重复 handoff | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-06.md</Path>` |
| 回归 | 现有宿主接缝 | `npx vitest run <Path>tests/task-registry.test.ts</Path> <Path>tests/event-bus-capabilities.test.ts</Path>` | 既有 TaskRegistry/EventBus 合同保持 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-06.md</Path>` |
| 边界审计 | 源码和 Git path | 扫描 `setInterval`/due scan/notification capability 并审计产品 diff | 无第二到期调度器、无虚构 capability、无插件外产品改动 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-06.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 增加 schedule/handoff schema -> 后台开关默认安全值 -> readiness 成功后注册 -> 最后开放 reminder UI；不得先发副作用再记 claim。
- **兼容窗口：** 无 reminder 的 Todo 继续 manual；已有 trigger 只有显式 mode=reminder 才调度。
- **监控信号：** readiness attempts/exhausted、registered schedules、duplicate claims、handoff 状态、cancel/restore 结果。
- **回滚或前向恢复：** 关闭 reminder 开关可停止新 schedule；running handoff 不伪造撤回；schema/identity 保留以支持前向恢复和显式 retry。
- **不可逆操作与批准点：** 桌面 notification 是外部可见副作用，只有用户显式启用和到期 claim 才批准；自动重发禁止。
- **收缩条件：** 晚就绪与耗尽测试通过、due scanner 扫描为零、重复 handoff 为零后才允许 Agent runtime 复用 scheduler。

## 10. 验收标准

- [x] AC-009、AC-012：默认 manual，提醒/Agent 开关相互独立且不隐式复活。
- [x] AC-010、AC-011：先 claim 后 handoff，handed_off 不冒充 delivered，重复/崩溃/显式 retry 合同成立。
- [x] AC-023、AC-024：有限 readiness retry、重启补偿、幂等 wake/cancel 生效且没有第二到期 scanner。
- [x] AC-029：后台失败可诊断，CRUD 仍可用，无静默 fallback。
- [x] Evidence 完整，产品 diff 仅位于 `<Path>plugins/todolist/</Path>`。
