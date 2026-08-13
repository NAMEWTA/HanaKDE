# 09 跨域业务流：把域卷串起来

## 使用方式

本篇不是新的实现说明，而是跨域索引。先读对应域卷，再用这里的主线检查“谁调用谁、状态在哪里、事件如何返回”。每条链都明确静态证据与尚未运行验证的部分。

## 职责与非职责

本篇负责串联跨域行为和状态 owner；不重新定义 Core、Server、Hub、Resource 或 Plugin 的局部接口，也不替代各域卷的测试索引。

## 桌面 Prompt

```text
React Input / server connection
 → HTTP/WS auth and chat context
 → server/routes/chat.ts
 → Hub.send()
 → desktop owner branch
 → HanaEngine.prompt / desktop session submit
 → SessionCoordinator + Pi SDK
 → tools / ResourceIO / memory hooks
 → EventBus + session stream store
 → WS replay / ws-message-handler
 → Zustand stores / React render
```

关键证据：`<Path>desktop/src/react/services/server-connection.ts</Path>`、`<Path>desktop/src/react/services/ws-message-handler.ts</Path>`、`<Path>server/routes/chat.ts</Path>`、`<Path>hub/index.ts</Path>`、`<Path>core/session-coordinator.ts</Path>`。

Why：Server 负责请求边界，Hub 负责选择执行分支，Core 负责 session 与模型，Desktop 只消费事件并渲染。这样 CLI、Mobile 和 Bridge 可以复用同一核心链路。

## Bridge 外部消息

```text
Telegram/Feishu/QQ/WeChat adapter
 → bridge session key + capability context
 → Hub.send(owner/guest)
 → BridgeSessionManager
 → SessionRef + bridge index + JSONL transcript
 → Pi session/tools with media and permission policy
 → sanitizer + adapter delivery
```

证据：`<Path>lib/bridge/bridge-manager.ts</Path>`、`<Path>lib/bridge/session-key.ts</Path>`、`<Path>core/bridge-session-manager.ts</Path>`、`<Path>hub/guest-handler.ts</Path>`。

关键边界是平台 adapter 不应猜测身份或直接写 session 文件；能力、媒体限制、幂等和出站清理由 Bridge 契约集中管理。待验证项：不同 adapter 的生命周期和全部媒体 fallback 分支尚未运行验证。

## Channel / DM 与临时 Agent

```text
Markdown channel/DM truth
 → ChannelRouter / DmRouter
 → AgentExecutor 临时 phone session
 → tool/permission/abort/tombstone
 → channel append / external reply / checkpoint
```

证据：`<Path>lib/channels/channel-store.ts</Path>`、`<Path>hub/channel-router.ts</Path>`、`<Path>hub/dm-router.ts</Path>`、`<Path>hub/agent-executor.ts</Path>`。

Channel 文件的锁、重读 body、tmp+rename 是持久化不变量；Router 负责编排，ticker 不直接调用 LLM。不要把 Hub 当作 Channel 的持久化 owner。

## 后台自动化

```text
heartbeat / cron tick
 → Hub.scheduler 读取 job 与 cursor
 → automation execution context 固化 cwd/workspace/identity
 → engine.executeIsolated
 → ActivityStore + EventBus + notification
 → history / UI / Bridge projection
```

证据：`<Path>hub/scheduler.ts</Path>`、`<Path>lib/desk/cron-scheduler.ts</Path>`、`<Path>lib/desk/automation-execution-context.ts</Path>`、`<Path>lib/desk/activity-store.ts</Path>`。

Why：调度器只决定何时触发，执行上下文决定以谁和何权限运行，Agent executor 才决定做什么。这使人工审批、自动化 deny-on-prompt 和恢复状态可分离测试。

## Resource 编辑与 Knowledge 索引

```text
ResourceRef
 → normalize + authority
 → ResourceAccessPolicy / PathGuard
 → provider stat/read/writeExpectedVersion
 → audit + ResourceEventBus
 → extractor
 → immutable knowledge index generation
 → query/search/operation plan
```

证据：`<Path>lib/resource-io/resource-io.ts</Path>`、`<Path>lib/resource-io/resource-refs.ts</Path>`、`<Path>lib/resource-io/providers/local-fs-provider.ts</Path>`、`<Path>lib/knowledge-workspace/knowledge-index-store.ts</Path>`、`<Path>core/knowledge-workspace/knowledge-index-runtime.ts</Path>`。

关键因果是“资源身份先于内容，版本证明先于写入，索引发布先于查询”。如果 expected version、root identity 或 lease 失败，应返回 typed conflict/fail closed，而不是覆盖新内容。

## Plugin UI surface

```text
Plugin manifest/contribution
 → PluginManager scan/load/activation
 → server/routes/plugins.ts metadata + ticket
 → desktop refreshPluginUI + surface URL
 → iframe host / origin / postMessage grants
 → plugin-sdk hana.ready/api.fetch/resources
 → plugin route request context + ResourceIO/network capability
```

证据：`<Path>core/plugin-manager.ts</Path>`、`<Path>server/routes/plugins.ts</Path>`、`<Path>desktop/src/react/hooks/use-plugin-surface-url.ts</Path>`、`<Path>desktop/src/react/plugin-ui/plugin-ui-host-controller.ts</Path>`、`<Path>packages/plugin-sdk/src/index.ts</Path>`。

文档 ticket 只认证 iframe document load；动态同插件请求使用 surface-session header。宿主持有 capability grant 与 filesystem/network boundary，iframe 不获得裸本地路径。

## 跨域故障阅读顺序

1. 先确认入口进程和 `server-info.json` 状态。
2. 再确认请求 principal、session identity 或 ResourceRef 是否正确。
3. 然后确认 Hub 分支和 Engine/Manager ownership。
4. 最后检查 EventBus/WS replay、ActivityStore、audit 或 typed error。

## 测试阅读

跨域阅读应回到 `<Path>tests/chat-route-session-identity.test.ts</Path>`、`<Path>tests/scheduler-studio-cron.test.ts</Path>`、`<Path>tests/resource-event-bus.test.ts</Path>` 和 `<Path>tests/plugin-route-integration.test.ts</Path>`，分别验证 Prompt、Automation、Resource event 和 Plugin route 的连接点。

## 事实、推断、待验证

- **事实：** 上述主链路均由静态入口、route、Hub、Core、Lib 和 Desktop 文件共同支持。
- **推断：** 所有跨域链路都把“身份、权限、版本、事件”作为比 UI 更稳定的核心状态。
- **待验证：** 没有运行测试或实际启动；跨平台网络、Bridge 媒体和崩溃恢复仍需专门验证 Work。

## 下一篇

阅读 `10-tests-and-reading-map`，把每条链路映射到行为测试和可证伪的源码问题。
