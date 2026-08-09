---
schema_version: 3
artifact: ticket
change: 2026-08-09-internalize-todolist-plugin
id: T-07
title: 交付隔离的 Agent 自动化运行协议
status: ready
planning_depth: deep
planning_depth_reason: 涉及 Agent/Session/Task 权限、外部副作用、Run/Attempt 持久 schema、隐私边界与异步 fail-closed 取消。
ready: true
risk: high
blocked_by: [T-06]
contract_ids: [AC-009, AC-012, AC-017, AC-018, AC-019, AC-020, AC-022, AC-026, AC-029, AC-033]
owner: unassigned
expected_changes: ["<Path>plugins/todolist/src/**</Path>", "<Path>plugins/todolist/routes/**</Path>", "<Path>plugins/todolist/tests/automation-run.integration.test.ts</Path>"]
writable_paths: ["<Path>plugins/todolist/**</Path>"]
read_only_paths: ["<Path>lib/task-registry.ts</Path>", "<Path>core/plugin-context.ts</Path>", "<Path>core/plugin-route-request-context.ts</Path>", "<Path>server/task-bus-handlers.ts</Path>", "<Path>tests/hub-plugin-session-agent-capabilities.test.ts</Path>", "<Path>tests/plugin-ui-capabilities.test.ts</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-07: 交付隔离的 Agent 自动化运行协议

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/07-deliver-isolated-agent-runs.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-07.md</Path>`

## 1. 战略与来源

- **目标：** 将失效的“Agent 自动巡查”重建为由 TaskRegistry 精确触发、每 Todo × occurrence 隔离、可取消可诊断的 Run 协议。
- **可观察产出：** 配置完整的 Todo 到期时只创建一个 Run 和一个 plugin-private Session；失败/needs_action 可显式 retry，同一 Run 增加 Attempt，结果不隐式完成 Todo。
- **来源：** US-007、US-008、US-011，AC-009、AC-012、AC-017～020、AC-022、AC-026、AC-029、AC-033，ADR-004、ADR-007、ADR-010、ADR-013。
- **当前事实：** T-06 已建立唯一 scheduler/readiness/claim 接缝；参考插件的轮询、自管执行器和会话 mock 不符合宿主能力合同。
- **Planning Depth 原因：** Agent 执行涉及授权、workspace scope、Session 隐私、成本/副作用和异步取消，失败事故半径高。

## 2. 决策状态

### 已锁定决策

- `agent_execute` 只有 Agent、说明、授权和精确 trigger 全部存在才可调度；否则拒绝，不降级为其它模式。
- 一个 Todo × trigger occurrence 只创建一个 AutomationRun 和一个 plugin-private Hana Session；不同 Todo 不合并 Session。
- retry 不新建 Run，而是增加 AutomationAttempt；每次 attempt 的权限、workspace、成本、结果、诊断和取消仍归属该 Run。
- 插件仅存 sessionRef、摘要、结构化结果和最小诊断；完整消息只从 Session 读取且不进入 store、导出或默认报告。
- Run 成功不修改 Todo pending/completed；Todo 变化必须由显式 Todo mutation 完成。
- queued/future 可直接取消；running 先 `cancel_requested` 并请求 Task/Session 终止，只有宿主确认才 `cancelled`，失败保持可见且不自动 retry。
- ResourceRef 不解析/持久化绝对路径，不扩大 Session workspace；内部 claim/completion handler 不注册为普通 tool。

### 已采用的低影响假设

- Session 不可访问时保留最小 Run 诊断与 sessionRef，不自动创建替代 Session 或复制缓存消息。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| Run/Attempt/Hold schema、精确 claim、Session/Agent 调用、结果收敛、retry、取消、ResourceRef 与内部 handlers | T-06 TaskRegistry readiness/schedule、宿主 Session/Agent/Task/ResourceIO、T-02 confirmation | 自建 Agent runtime、轮询巡查、跨 Todo 合并会话、复制对话、自动完成 Todo、扩大 workspace |

## 4. 要构建什么

用户显式把 Todo 设为 agent_execute 并提供完整配置后，精确 trigger 由 T-06 scheduler 唤醒。插件对 Todo/occurrence claim，创建唯一 Run 与 private Session，并用宿主 Agent 在该 Session workspace 内执行。运行结果只更新 Run/Attempt 摘要；失败和 needs_action 等待用户动作。取消时状态如实经历 cancel_requested，只有终止确认后才 cancelled。关闭自动化或完成/删除 Todo 会取消 future/queued 并请求 running 终止，另一 reminder 能力不受影响。

## 5. 实现契约

- **入口或接缝：** scheduler internal handler、automation application service、Session/Agent/Task/ResourceIO capabilities、automation routes/tools。
- **输入与输出：** handler 输入 stable Todo/occurrence/schedule identity；Run 输出 state、attempts、sessionRef、summary/result/diagnostic；mutation 需要 expectedVersion 和授权 context。
- **公共接口变化：** 新增用户级 automation query/retry/cancel tools 与 routes；claim、runner、completion handler 均为 plugin-private。
- **不变量：** Todo×occurrence 唯一 Run；每 Run 唯一 Session；retry 追加 Attempt；Run/Todo 状态正交；cancelled 必须有宿主确认；无消息副本和绝对路径。
- **状态或数据流：** due claim -> Run queued -> Session created -> running Attempt -> succeeded/failed/needs_action；cancel -> cancel_requested -> host confirmation -> cancelled 或 visible failure。
- **错误与失败行为：** incomplete_configuration、permission_denied、workspace_unavailable、session_unavailable、duplicate_claim、cancel_failed、result_invalid、capability_unavailable 稳定可见。
- **兼容要求：** reminder schedule/handoff 与 `todo_write` 不受影响；关闭 automation 不取消 reminder；既有 Session/Agent 行为不变。
- **安全与隐私要求：** 最小 capabilities、宿主 principal、ResourceRef、Session workspace 和 reviewer-bound side effect 权限全部 fail closed；诊断脱敏。

## 6. 执行路线

1. 用 fake Task/Session/Agent/ResourceIO 建立唯一 Run/Session、retry、结果正交、权限拒绝和异步取消测试。
2. 事务扩展 Run/Attempt/Hold/identity schema，并实现 claim 与状态机约束。
3. 接入宿主 Session/Agent 执行和 completion 收敛，只保存 sessionRef/最小结果，不复制消息。
4. 实现用户级 query/retry/cancel routes/tools、Todo lifecycle/开关取消联动及内部 handler 隐藏。
5. 运行故障注入、capability/tool catalog、T-06 scheduler/reminder 与 Todo 状态回归。

## 7. 路径访问契约

- **预计修改点：** 插件内 automation domain/application/store/runtime/routes/tools/tests。
- **可写范围：** `<Path>plugins/todolist/**</Path>`。
- **只读上下文：** 宿主 Task/Session/Agent/plugin context 和现有 capability 测试。
- **共享路径：** 无；T-07 串行消费 T-06 scheduler 接缝。
- **保留或不动：** 宿主 Agent/Session/Task/ResourceIO、公共测试和插件根外所有产品文件。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | automation harness | `npx vitest run <Path>plugins/todolist/tests/automation-run.integration.test.ts</Path>` | 每 occurrence 唯一 Run/Session，retry 增 Attempt，结果不完成 Todo | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-07.md</Path>` |
| 失败路径 | permission/session/cancel 故障注入 | 同一测试执行缺配置、拒权、Session 失败、重复 claim、终止失败 | fail closed，cancel_requested/失败可见，无自动重试或消息副本 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-07.md</Path>` |
| 安全边界 | store/DTO/tool catalog 扫描 | 检查绝对路径、完整 messages、内部 handler tool 与 workspace 扩大 | 全部不存在；只暴露用户级 namespaced tools | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-07.md</Path>` |
| 回归 | 宿主 capability + scheduler | `npx vitest run <Path>tests/hub-plugin-session-agent-capabilities.test.ts</Path> <Path>plugins/todolist/tests/scheduler-reminder.integration.test.ts</Path>` | 宿主权限合同和 reminder 路径保持 | `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/evidence/T-07.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 增加 Run/Attempt schema -> 默认 automation off/manual -> 注册内部 handler -> 通过 capability/readiness gate -> 开放 agent_execute UI/tools。
- **兼容窗口：** 既有 Todo 保持 manual；已有 reminder 不变；未配置完整的 agent_execute 数据拒绝调度并可诊断。
- **监控信号：** Run/Attempt state、duplicate claim、needs_action、cancel_requested age、cancel failure、Session unavailable 和 capability denied。
- **回滚或前向恢复：** 关闭 automation 停止新 Run并按合同取消现有运行；不得假设 running side effect 可回滚，保留 sessionRef/诊断供人工恢复。
- **不可逆操作与批准点：** Agent 外部副作用必须有用户显式模式与宿主 reviewer-bound 授权；无授权不得执行。
- **收缩条件：** 内部 handler 不可枚举、消息副本/绝对路径扫描为零、取消故障测试通过后才开放 Automation UI。

## 10. 验收标准

- [ ] AC-017～019：Run/Session/Attempt 隔离与结果正交合同成立。
- [ ] AC-020：future/queued/running 取消按 fail-closed 状态机执行，不乐观标记 cancelled。
- [ ] AC-022、AC-026：Session 是对话权威，store 无消息副本/绝对路径，ResourceRef 不扩大 workspace。
- [ ] AC-009、AC-012、AC-029、AC-033：显式授权、独立开关、稳定失败和内部 handler 隐藏成立。
- [ ] Evidence 完整且产品 diff 仅位于 `<Path>plugins/todolist/</Path>`。
