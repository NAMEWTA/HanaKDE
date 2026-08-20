---
artifact: wayfinder-solution-comment
ticket: INV-08
sequence: 1
resolution: answered
---

# Solution: 定义 Agent 协作授权冲突与结果回路

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/INV-08.md</Path>`
- **答案：** 聊天 Agent 的普通 Todo mutation 与后台 `agent_execute` Run 分离；后台执行默认 manual、显式预览授权、每 Todo×occurrence 隔离 Session、结果不自动完成 Todo。所有授权变化和取消都 fail closed，`session:send` 的 accepted 不被误报为成功；当前无 `session.open` 时只提供稳定 SessionRef/复制降级。
- **事实与来源：**
  - **聊天 Agent 授权：** Agent 可直接执行普通字段创建/修改；reminder、周期、`agent_execute`、批量操作和删除必须先给结构化预览并等待用户确认。创建默认为 `manual`，聊天文本不会隐式授予后台触发或外部副作用。
  - **agent_execute 前置条件：** 必须同时拥有明确 Agent、执行说明、workspace 范围、permission mode、ResourceRef/资源边界、精确 trigger 和用户批准；缺任一项拒绝调度，不降级为其它模式。首版只选择已有 Agent，插件只需 `agent.read`，不创建/修改 Agent。
  - **授权预览：** 创建 Run 前展示 Todo/occurrence、trigger、Agent、workspace/ResourceRef、permission mode、预期副作用、取消方式与结果保存位置；配置快照和版本进入 Run，后续人工变更不动态改写旧 Run。
  - **隔离与隐私：** 每个 Todo×trigger occurrence 只创建一个 AutomationRun 和一个 plugin-private Hana Session；不同 Todo 不合并 Session。Session 使用真实 permission mode/workspace，ResourceRef 不扩大 workspace。插件只保存 `sessionRef`、attempt、结构化结果、最小摘要和脱敏诊断，完整 transcript 由 Hana Session 权威保存，不进入 Todo store、导出或默认报告。
  - **Session 结果语义：** `session:send` 返回 `accepted` 只能让 Run 进入 `running/awaiting_result`；只有明确完成事件并通过结果校验才进入 `succeeded`。异步 error、timeout、断开或历史不可读进入 `failed`/`needs_action`，保留 sessionRef，不创建替代 Session。`session:abort` 的实际结果用于取消收敛。
  - **结果与 Todo 状态：** Agent 成功只更新 Run/Attempt 摘要，不自动完成 Todo。Agent 返回的 Todo 更新建议先作为待应用变更展示，携带当前 Todo version；用户确认后按普通 expectedVersion mutation 写入，冲突复用 INV-04 字段裁决。Todo `pending/completed` 与 Run 状态正交。
  - **人工接管：** 用户可停止未来触发、请求取消当前 Run 并切回 manual。Todo 模式可先切 manual，但 Run 保持 `cancel_requested` 直到宿主确认；取消失败进入可见 `cancel_failed`/诊断，不自动重试、不继续旧授权。切回 manual 不删除历史 Run/Session。
  - **配置变化：** 修改 Agent、说明、workspace、permission mode 或 ResourceRef 不动态继承到运行中的 Run；旧 Run 标记 needs_action/待取消。用户明确选择“应用到下一次”或“取消并重试”后才使用新配置。权限排队期撤销时不创建 Session，进入 needs_action；运行期变化按宿主结果收敛，不由插件猜测。workspace/ResourceRef 版本变化不扩大范围，需用户确认新 attempt。
  - **失败与恢复：** failed 由用户选择重试、修改配置或关闭 automation，不自动重试；retry 沿用同一 Run、增加新 Attempt，不复用失败 SessionRef 作为新 Session。needs_action 必须说明原因、等待项、允许动作和配置快照，恢复动作仅为补齐后继续当前 Run、取消 Run 或切回 manual。
  - **取消状态：** queued/future 可直接取消；running 先 `cancel_requested`，只有宿主终止确认才 `cancelled`；取消失败保留状态且不新建 Attempt。完成、删除、退出 agent_execute 或关闭 automation 会分别触发 future/queued/running 的 fail-closed 收敛，重新启用不复活旧 Run。
  - **Session 导航降级：** 当前稳定 iframe host capability 没有 `session.open`，因此首版只展示 sessionRef/sessionId、复制入口和最小结果，不能渲染假的“打开会话”按钮。真正导航必须是独立系统 capability change，不能在 Todo 内调用私有 UI API。
  - **运营展示与幂等：** Todo 详情只显示最近 Run 摘要和合法动作；Automation 视图显示有界 Run/Attempt、来源、配置版本、状态、诊断和 retry/cancel/接管动作。所有操作带 `runId + expectedVersion + commandId`，重复请求返回既有结果，不创建重复 Run/Session/Attempt。后台 claim、runner、completion handler 不注册为普通用户 tool。
- **资产：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/07-deliver-isolated-agent-runs.md</Path>`、`<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/ticket/08-deliver-automation-operations-surface.md</Path>`、`<Path>hub/event-bus-capabilities.ts</Path>`、`<Path>hub/index.ts</Path>`、`<Path>packages/plugin-runtime/src/index.ts</Path>`、`<Path>PLUGINS.md</Path>`
- **后续 Ticket 所依赖的事实：** INV-09 承接运行中 Todo 删除和 Session/Task 取消；INV-10 展示 Run/Attempt/SessionRef 历史但不复制 transcript；INV-11 导出最小运行投影而非完整对话；INV-12/13 验证权限拒绝、needs_action、取消竞态、SessionRef 降级和窄布局；INV-14 需统一 AC-017～022/026/029/033 与工具权限合同。
- **新浮现的 Tickets：** 无；`session.open` 已明确为未来独立系统 change，而非 Todo 阻塞票。
- **升级的战争迷雾：** 无。
- **对现有 Tickets 的影响：** update T-01/T-06/T-07/T-08/T-09/T-10、AC-009/012/017～022/026/029/031/033、INV-09/10/11/12/13/14。
