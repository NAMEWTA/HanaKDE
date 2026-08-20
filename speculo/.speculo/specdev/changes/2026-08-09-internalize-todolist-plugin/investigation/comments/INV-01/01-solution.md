---
artifact: wayfinder-solution-comment
ticket: INV-01
sequence: 1
resolution: answered
---

# Solution: 核验宿主插件契约与文档漂移

- **Ticket：** `<Path>{roots.state}/specdev/changes/2026-08-09-internalize-todolist-plugin/investigation/INV-01.md</Path>`
- **答案：** Todo 可以继续作为 `<Path>plugins/todolist/</Path>` 内的 TypeScript builtin professional React/full 插件实现，当前没有必须先拆出的系统前置 change。插件必须适配现有 TaskRegistry 晚就绪顺序，并把通知定义为无回执的 desktop best-effort event handoff；当前宿主没有 `session.open` UI capability，因此不能承诺从 Todo 一键跳转 Hana Session。需要送达回执、跨渠道通知或 Session 原生导航时，应另立系统 change，不能在 Todo 内私造宿主接口。
- **事实与来源：**
  - **语言与加载：** `<Path>core/plugin-manager.ts</Path>` 优先解析 `.ts`、兼容 `.js`，builtin 不受 disabled 与 community full-access 开关影响；有 lifecycle 的插件默认 `onStartup`，但 Todo 应显式声明 activation event。当前 `<Path>plugins/</Path>` 的产品源码均为 TypeScript。Todo 的 runtime、routes、tools、领域服务、持久化、React UI、测试与构建配置只写 TypeScript；SDK/Vite 生成的 JavaScript 属于构建产物，不改变源码语言约束；不得引入 Python 源码、运行时或构建依赖。
  - **TaskRegistry：** `<Path>server/index.ts</Path>` 先执行 `engine.initPlugins()`，后注册 `registerTaskRegistryBusHandlers()`，所以 `onStartup` 首次请求 task handler 必然可能遇到 `NO_HANDLER`。`<Path>lib/task-registry.ts</Path>` 持久化 schedule/task 元数据但不持久化 runner，恢复中的 active task 会变为 `recovering`；runner 注册后会重新 arm 同类型 schedule。Todo 只做有上限、有退避、可诊断的 readiness handshake，不启动第二个 due scanner；耗尽后 CRUD 保持可用，提醒/周期后台能力 fail closed。`task:schedule`、`task:unschedule`、`task:list-schedules` 在 `<Path>hub/event-bus-capabilities.ts</Path>` 仍标为 experimental，须锁定 `minAppVersion` 并做插件内合同测试，不能把它描述成跨版本无条件稳定。
  - **通知：** `<Path>hub/event-bus.ts</Path>` 的 `emit()` 同步调用订阅者、吞并并记录订阅者异常、没有返回值或接收回执；能力目录不存在 `notification:send`。`<Path>server/routes/chat.ts</Path>` 与桌面 WebSocket 通知测试证明现有 `{ type: "notification" }` 事件可进入桌面路径，但不能证明存在客户端、系统通知权限可用、已经展示或已经送达。正常返回只可记作“事件已发出/已交接且送达未知”；claim 后崩溃同样是 unknown，只允许用户显式重试。ADR-006 已由 ADR-014 明确 supersede，不再是当前 change 的前置合同。
  - **Session/Agent：** `<Path>hub/event-bus-capabilities.ts</Path>` 的 `session:create/get/update/send/abort/history/list` 与 `agent:list/profile` 为 stable；`<Path>packages/plugin-runtime/src/index.ts</Path>` 提供主要 Session/Agent helper，但没有 `abortSession` 命名 helper，取消可直接调用稳定的 `ctx.bus.request("session:abort", target)`。`session:send` 的 accepted 只表示接收执行，不代表 Agent 成功完成。当前产品只选择已有 Agent，因此最小权限是 `agent.read`，不申请 `agent.write`。`<Path>core/plugin-manager.ts</Path>` 的 iframe host capability 列表没有 `session.open`，后续 INV-08 必须设计诚实的降级入口或明确拆出系统导航 change。
  - **资源与权限：** 插件私有数据库和生成物放在 `ctx.dataDir`；读取用户选择的 ResourceRef 使用 `ctx.resources` 与 `resource.read`；生成导出文件使用 `stageFile()`，无需 `resource.write`。只有真正调用资源搜索时才声明 `resource.search`，当前 change 没有该用例，Spec DEC-015 的 `resource.search` 应在最终文档修订时移除。UI 只在实际调用时声明 `resource.pick`/`resource.open`，不声明不存在的 notification 或 session navigation capability。
  - **验证：** `@hana/plugin-runtime`、`@hana/plugin-sdk`、`@hana/plugin-components` TypeScript 检查通过；排除无关 worktree 后，PluginManager、EventBus capability、TaskRegistry、Session/Agent、plugin context、notification 与桌面 WebSocket 的 8 个测试文件共 142 项全部通过。
- **资产：** `<Path>core/plugin-manager.ts</Path>`、`<Path>server/index.ts</Path>`、`<Path>lib/task-registry.ts</Path>`、`<Path>hub/event-bus.ts</Path>`、`<Path>hub/event-bus-capabilities.ts</Path>`、`<Path>packages/plugin-runtime/src/index.ts</Path>`、`<Path>core/plugin-context.ts</Path>`、`<Path>server/routes/chat.ts</Path>`、`<Path>desktop/src/react/plugin-ui/capabilities.ts</Path>`、`<Path>PLUGIN_SDK.md</Path>`、`<Path>PLUGINS.md</Path>`
- **后续 Ticket 所依赖的事实：** INV-06/INV-07 以单一 TaskRegistry、晚就绪 handshake、occurrence 自有幂等和无通知回执为边界；INV-08 以 stable Session/Agent bus、`session:send` 非完成回执和无 `session.open` 为边界；INV-11 以 ResourceIO 读取用户输入、`ctx.dataDir` + `stageFile()` 生成输出为边界；INV-14 需把 TypeScript-only、移除未使用的 `resource.search`、experimental task version pin 与 Session 跳转降级同步回 Spec/ADR/Tickets/Goal Plan。
- **新浮现的 Tickets：** 无；Session 导航缺口已由 INV-08 覆盖，通知权限/错过补救已由 INV-06 覆盖。
- **升级的战争迷雾：** 无；此前“是否存在强制系统前置能力”的模糊风险已解除。
- **对现有 Tickets 的影响：** update INV-06、INV-07、INV-08、INV-11、INV-14；不改变当前串行实现 Ticket 的产品代码写入边界。
