# Server、HTTP 与 WebSocket：把 Core 能力交付给客户端

## 1. 阅读定位

本篇回答一个核心问题：桌面、CLI、移动端或插件发来的请求，如何在不绕过身份与能力边界的情况下抵达 `<Path>core/engine.ts</Path>`，又如何以可恢复的流事件返回客户端？

```text
main-full/main-open
  → startServer(root)
  → 端口/互斥/首次运行
  → HanaEngine.init()
  → Hub + extensions + Hono app
  → global auth middleware
  → composition/open-root + optional full-root
  → REST /ws chat
  → Hub / HanaEngine / SessionCoordinator
```

本文是静态源码教学，不运行 Server，不声称某个端口、Provider 或 Electron packaged bundle 在当前机器上实际可用。

## 2. 职责与非职责

### Server 的职责

- 选择进程级 composition（open 或 full），建立 HTTP/Hono 与 Node WebSocket transport。
- 在任何 store/端口正式开放前执行 HANA_HOME 互斥、数据 epoch、网络配置和端口绑定。
- 创建并初始化 `HanaEngine`、`Hub`、扩展、插件、鉴权服务和 route context。
- 对每个 HTTP/WS 请求解析 principal、检查 transport 和 scope，再将已授权操作交给 Engine/Hub。
- 将 Core/Hub 事件转换成 REST JSON、WebSocket stream event、resume replay 或错误消息。
- 在 ready 后写入受保护的 `server-info.json`，并在退出时停止接收请求、挂起浏览器、停止 Bridge、清理 Hub/Engine。

### 明确不负责的内容

- Server 不拥有 Agent 人格、Session JSONL、ResourceIO 或 Knowledge 的领域真相；它只组装和转发。
- Hono route 不应自行猜 session owner、绕过 manifest 或直接拼接工具执行；身份解析集中在 `<Path>server/routes/ws-session-context.ts</Path>` 和 Core API。
- WebSocket 层不是模型协议本身；Pi SDK 的 provider 事件由 Core 产生，Server 负责投影、限流、广播和恢复。

## 3. 目录地图

| 路径 | 作用 |
|---|---|
| `<Path>server/main-full.ts</Path>`、`<Path>server/main-open.ts</Path>` | 进程级静态入口；决定 full/open，而非运行时 env switch |
| `<Path>server/index.ts</Path>` | `startServer()` 组合根、启动闸门、全局 middleware、WS upgrade、ready/shutdown |
| `<Path>server/composition/contract.ts</Path>` | `CompositionContext` 与 `CompositionRoot` 的显式依赖合同 |
| `<Path>server/composition/open-root.ts</Path>`、`<Path>server/composition/full-root.ts</Path>` | 开放路由与闭集产品路由的挂载边界 |
| `<Path>server/routes/chat.ts</Path>` | `/task/:taskId/abort` REST 面、`/ws` chat 协议、事件广播与 stream state |
| `<Path>server/http/request-principal.ts</Path>`、`<Path>server/http/route-security.ts</Path>` | HTTP principal 解析、路由分类、scope/owner/plugin 授权 |
| `<Path>core/ws-auth-ticket.ts</Path>`、`<Path>server/routes/ws-auth.ts</Path>` | 一次性 WS ticket 签发与消费 |
| `<Path>server/routes/ws-session-context.ts</Path>` | sessionId/path/owner 的唯一 WS 身份解析边界 |
| `<Path>server/session-stream-store.ts</Path>`、`<Path>server/ws-protocol.ts</Path>` | ring buffer、seq、stream resume 和 wire shape 校验 |
| `<Path>tests/server-composition-boundary.test.ts</Path>`、`<Path>tests/server-auth.test.ts</Path>` | 组合边界与认证/授权合同 |

## 4. Composition：入口文件决定产品面

`<Path>server/composition/contract.ts</Path>` 明确了一个重要不变量：`startServer(root)` 的 `registerClosedRoutes`、`builtinMediaAdapters` 和 `createMobileWorkbenchRoute` 是进程启动时传入的静态组合参数，不是运行中可切换的 feature flag。

- `main-open.ts` 只 `await startServer({})`，因此挂载开放路由/WS，不引入闭集产品文件。
- `main-full.ts` 静态引入 `<Path>server/composition/full-root.ts</Path>`，传入闭集路由和媒体适配器；它是当前产品启动路径。
- `server/index.ts` 无条件调用 `registerOpenRoutes(app, ctx)`，然后按 root 参数追加 evidence-needed mobile route 和 closed routes。

这样做的 Why 是让可再分发的 open bundle 不因静态 import 泄漏闭集代码，同时保持所有 route factory 共享同一个 Engine、Hub、鉴权和 WS plumbing。代价是读者必须同时追踪入口文件和 composition hook，不能只看 `server/index.ts` 的局部代码。

`<Path>tests/server-composition-boundary.test.ts</Path>` 通过 mount-call inventory、静态 import 检查和真实 spawn smoke 锁定这个边界。

## 5. `startServer()` 启动主链

### 5.1 启动闸门与临时 503

`<Path>server/index.ts</Path>` 的 `startServer()` 先创建只返回 `server_starting`/`/api/health` 503 的 `activeFetch`，再绑定 Node transport。这样 Electron 早期探测得到的是显式“正在启动”，而不是连接被静默拒绝。

启动前顺序如下：

1. 解析 `HANA_HOME` 和版本。
2. 检查 `server-info.json`；用 token probe 判断同宅旧进程，确认 dead/not-hana 才清残留文件。裸 PID 不被信任。
3. 协调 data epoch；发现更高格式或未完成迁移时 fail closed。
4. 解析 network mode/host/port；未固定端口时允许 loopback fallback，端口被其他 Hana 占用则返回 typed `PORT_IN_USE`。
5. 创建 adaptor server 并 `listen()`；成功后进入首次运行播种。

### 5.2 Core/Hub/扩展装配

绑定 transport 后：

```text
ensureFirstRun + local identity registries
  → new HanaEngine({ ...root.builtinMediaAdapters })
  → await engine.init()
  → new Hub({ engine })
  → deferred/compaction/loop extension factories
  → await engine.initPlugins(hub.eventBus)
  → hub.initSchedulers()
  → serverAuthService + wsTicketService
  → Hono app + @hono/node-ws
```

扩展注册先于插件 `onStartup`，避免插件通过 `session:send` 抢先创建缺核心 handler 的 Session。插件热操作后由 Engine 同步 extension factories，再按空闲状态 reload Session。

### 5.3 路由、ready 与后台 Bridge

全局 CORS/transport/auth middleware 安装后，`registerOpenRoutes()` 挂载 chat、sessions、agents、resources、knowledge、plugins、bridge 等开放面；full root 再追加 avatar/cards/desk/diary 等产品路由。随后 `/api/health` 才返回 `status: "ok"`。

Server 完成 WS upgrade 注入、读取实际端口后写入 `server-info.json`（mode `0600`），打印 `ready: port=<actualPort>`。Bridge adapter 不是 HTTP readiness 前置条件，ready 后用 `setImmediate()` 后台启动，避免外部平台依赖拖慢桌面握手。

## 6. HTTP 鉴权：先身份，再路由策略

`<Path>server/http/request-principal.ts</Path>` 规定统一顺序：

1. `serverAuthService.authenticateRequestDetailed()` 读取 bearer、query token、web session cookie，并结合 transport connection kind。
2. `/ws` 可消费一次性 `wsTicket`；ticket 必须匹配 path 与 connection kind。
3. 只有主凭证“缺席”时，才尝试 plugin surface session；无效 bearer 不能被附带的 plugin token 掩盖。
4. `authorizeHttpRoute()` 根据 path/method 将请求归类为 public、local_only、authenticated、studio_owner、scope 或 plugin_route。

`<Path>server/http/route-security.ts</Path>` 中的策略示例：

- `/api/health`、`/api/server/identity`：authenticated。
- `/api/ws-ticket`、`/ws`：需要 `chat` scope（ticket POST 还受 transport 约束）。
- `/api/resources/*`：GET/HEAD 需要 `resources.read`，写操作需要 `resources.write`。
- `/api/sessions/*`、`/api/chat`、channels/DM：需要 `chat`。
- 插件代理路由只允许 matching plugin surface principal 或 studio owner。
- 未分类 `/api/*` 默认 studio owner；未分类非 API 默认 local only。

这种“先 principal、后 route policy”的结构把认证失败、权限不足和插件 surface 错误分成可诊断的 403 原因，也让测试直接复用生产解析链。

## 7. WebSocket 连接与 session 身份

### 7.1 Upgrade 与连接记录

`<Path>server/index.ts</Path>` 使用 `@hono/node-ws` 的 `upgradeWebSocket` 处理 chat；`/internal/browser` 例外使用 raw `WebSocketServer`，因为 Browser transport 需要原生 `.on/.off`。upgrade handler 会跳过该路径，避免同一 socket 被两套处理器消费。

`<Path>server/routes/chat.ts</Path>` 的 `/ws` `onOpen` 建立 client record、统计连接数并取消“无客户端自动 abort”定时器；`onClose` 清理订阅/状态，若 grace window 内没有任何客户端则调用 `engine.abortAllStreaming()`。

### 7.2 唯一身份入口

每条带 Session 的 WS 消息先经过 `<Path>server/routes/ws-session-context.ts</Path>`：

```text
msg.sessionId + msg.sessionPath
  → path 反查 id
  → 显式 id/path 一致性检查
  → manifest currentLocator
  → resolveSessionOwnership()
  → { sessionId, sessionPath, agentId, agentIdSource, agentDeleted }
```

失败被分为：

- `internal_contract`：调用方没有任何身份；
- `session_identity_mismatch`：id 与 path 指向不同 Session；
- `session_identity_unresolved`：locator/owner 查询失败或无法解析。

服务端查 owner 抛错时 fail closed，不把“查询失败”当成“无 owner 草稿”；只有确实没有 owner 的草稿才允许使用客户端显式 `agentId`。这是防止存储故障变成越权的关键不变量。

## 8. Chat WS 主调用链

### 8.1 入站消息分支

`<Path>server/ws-protocol.ts</Path>` 定义客户端消息形状：`prompt`、`interject`、`steer`、`abort`、`resume_stream`、`compact` 等。`chat.ts` 的 `onMessage` 先 `wsParse()`、检查 client scope、按 session 自动订阅，再进入异步分支：

1. **abort**：解析目标与 streamId；旧 stream 被拒绝为 `stale_stream`，否则先取消 agent review，再调用 `hub.abort()`，返回 `abort_result`。
2. **steer**：若 Session 正在 streaming，调用 `engine.steerSession()`；否则把消息降级为普通 prompt。
3. **resume_stream**：按 `streamId/sinceSeq` 从 session state ring buffer 生成 `stream_resume`；同时报告 Engine 真实 `runtimeIsStreaming`。
4. **context_usage/slash/compact**：读取用量、派发 slash、或检查 deleted/compacting/streaming 后执行压缩。
5. **prompt/interject**：验证媒体大小/格式、deleted/streaming/model-switch 门禁，构造显示消息和 SessionFile envelope，再调用 `hub.send()`；Hub 最终会进入 `submitDesktopSessionMessage()`/`engine.promptSession()`。

### 8.2 出站事件链

```text
Pi AgentSession event
  → chat.ts engine/hub event subscription
  → normalize parser（thinking/mood/card/content block）
  → appendSessionStreamEvent(seq)
  → createSessionStreamEventWsMessage()
  → broadcast() 按 studio/session subscription 过滤
  → wsSendSerialized(JSON)
```

`turn_end` 会合并 aborted/truncated/error 状态，记账 token usage，发送最终 `turn_end`，再 `finishSessionStream()` 清空本轮 ring buffer，并触发 deferred completion/title 等后续工作。Provider `message_end` 的 error 会先变成 `error` wire message；空回复且非 abort 会被识别为 `modelNoResponse`。

### 8.3 Stream resume 的设计

`<Path>server/session-stream-store.ts</Path>` 为每轮创建 `streamId`，事件 `seq` 从 1 递增，默认最多 5000 条/8 MiB；超大事件先 compact，仍超限则保留类型和 omitted 标记。旧 streamId 会返回 `reset: true`，sinceSeq 早于 ring buffer 首项会返回 `truncated: true`。

这不是持久化历史：`finishSessionStream()` 结束回合即清空缓存，真正的长期历史仍在 Core JSONL。它解决的是“用户切离面板或网络短断时，补回当前流”，不承担离线消息队列。

## 9. 输入、输出、错误与并发

### 输入/输出

- HTTP 输入：Authorization/cookie/query token、JSON body、resource/plugin ticket、method/path。
- WS 输入：JSON frame、SessionRef、文本和媒体、streamId/sinceSeq、UI context。
- Core 输出：Pi 事件、Session JSONL、Hub EventBus 事件。
- Server 输出：REST JSON、错误 code/reason、stream event、`stream_resume`、status/turn_end/content block。

### 错误合同

- **启动错误**：`PORT_IN_USE`、`LISTEN_PERMISSION_DENIED`、高 epoch/foreign server；写结构化 stderr 供桌面 readiness 解析。
- **HTTP 鉴权**：`missing_principal`、`invalid_credential`、`insufficient_scope`、`local_owner_required`。
- **WS 身份**：`internal_contract`、`session_identity_mismatch`、`session_identity_unresolved`。
- **回合执行**：`session_busy`、`agent_deleted`、`modelSwitching`、provider/tool error、`aborted`。

全局 `app.onError()` 用 `AppError.wrap()` 生成 `{ code, message, traceId }`，同时写 ErrorBus；局部可预期错误则在 route 内返回具体状态，避免把用户输入错误伪装成 500。

### 并发与背压

1. `activeWsClients` 为零且 grace 到期时，Server 批量 abort streaming；短暂网络抖动不会立即杀回合。
2. 每个 Session 的 stream state 独立；`MAX_SESSION_STATES=100` 时淘汰最久未访问且非 streaming 的条目，正在流式的条目不会被淘汰。
3. `broadcast()` 先按 studio/session subscription 过滤，只有确实有接收者才 JSON.stringify，并复用同一序列化字符串。
4. Ring buffer 有事件数、总字节和单事件上限；大 payload 会 compact，防止媒体/缩略图把内存打爆。
5. WS client scope 既控制发送也控制接收；订阅 session 会绑定 studioId，避免跨 studio 事件泄漏。

## 10. 生命周期与优雅关闭

### Ready

ready 的含义是：端口已绑定、Engine/Hub/开放路由已装配、WS upgrade 已注入、`server-info.json` 已写入；并不意味着所有 Bridge adapter 或后台维护任务已完成。

### Shutdown

`gracefulShutdown()` 使用幂等 `_shutting` 和 15 秒 force timer：

```text
停止接收 HTTP
  → 挂起 Browser sessions
  → bridgeManager.stopAll()
  → flush deferred result store
  → hub.dispose()（含 Engine/Agent/Session 清理）
  → 删除 server-info.json
  → exit(0)
```

浏览器挂起失败、Bridge 停止失败或某个清理器异常会记录并继续；超时则强制退出。这样优先保证不再接收新请求，同时尽量留下可恢复的 Session/Browser 状态。

## 11. Why、代价、边界与替代设计

### Why composition root 与显式 context

把 route factory 所需的 `engine/hub/wsTicketService/serverAuthService/confirmStore` 集中在 `CompositionContext`，可以在 open/full bundle 间复用同一逻辑，也避免 route 读取全局 singleton。代价是 context 较宽，新增能力需要同时修改合同、组装和测试。

### Why 全局 middleware 而非每个 route 自己鉴权

统一 middleware 保证 public、loopback、bearer、plugin surface 和 scope 的顺序一致；局部 route 只做资源/业务级授权。代价是新 route 若未更新 `<Path>server/http/route-security.ts</Path>`，可能落入默认 local-only/studio-owner，必须配合测试检查。

### Why WS ticket + sessionId/path 双字段

短寿命一次性 ticket 适合把 HTTP 已验证 principal 传给升级握手；sessionId 是稳定身份，path 保留旧客户端兼容和 locator metadata。代价是需要一致性检查、ticket 消费和错误分级。

### Why 内存 ring buffer 而非持久化 stream log

当前目标是短断线恢复，不是离线同步；内存缓存延迟低且不会把每个 token delta 永久写入历史。代价是进程崩溃或回合结束后不能从 stream store 恢复，客户端必须重新读取 JSONL/Session projection。

| 替代 | 优点 | 当前不选 |
|---|---|---|
| 每个 route 独立鉴权 | 局部简单 | 顺序漂移，plugin/bearer 互相掩盖，难审计 |
| 运行时 feature flag 切换 full/open | 部署灵活 | bundle 静态边界不再可证明，闭集依赖可能泄漏 |
| WS 直接传文件路径、不带 stable id | 协议短 | fork/move/multi-studio 时身份歧义 |
| 把所有事件写入永久日志再 resume | 崩溃后可 replay | I/O/隐私/清理成本大，超出当前短断线目标 |

## 12. 事实、推断、假设与待验证

### 已确认事实

- full/open 组合由 `<Path>server/main-full.ts</Path>`、`<Path>server/main-open.ts</Path>` 和 `<Path>server/composition/contract.ts</Path>` 静态决定。
- `startServer()` 在端口绑定前执行 HANA_HOME probe/data epoch/network 处理，ready 后写 `server-info.json`：`<Path>server/index.ts</Path>`。
- 全局 HTTP principal 解析和 route authorization 复用 `<Path>server/http/request-principal.ts</Path>`、`<Path>server/http/route-security.ts</Path>`。
- WS session identity 单点解析和 fail-closed owner 查询在 `<Path>server/routes/ws-session-context.ts</Path>`。
- chat WS 支持 abort/steer/resume/compact/prompt，并以 `session-stream-store` 管理 seq/ring buffer：`<Path>server/routes/chat.ts</Path>`、`<Path>server/session-stream-store.ts</Path>`。

### 教学推断

- Server 是 transport/composition/lifecycle coordinator，而非领域状态 owner；这是由 Engine/Hub 在启动中先被创建、route 只调用其 facade 推导。
- `ready` 是“HTTP/WS 可交付”的门，而不是“所有后台依赖全部健康”的总健康结论；Bridge 延后启动的源码注释直接支持这一解释。

### 假设与待验证

- 未运行真实 LAN/custom_remote/relay 连接；不同 transport 下 query token、cookie、ticket 的最终行为应以后续集成测试为准。
- 未运行断线 grace、stream truncation、raw browser WS 与 Hono WS 同时升级；源码和单测覆盖了主要分支，但不等于跨平台 socket 行为证明。
- packaged Electron readiness 对 `server-bootstrap` keepalive、文件就绪退避和 stderr 解析的完整链路，留给启动生命周期附件。

## 13. 测试阅读地图

建议以“边界 → 身份 → 流”为顺序：

1. `<Path>tests/server-composition-boundary.test.ts</Path>`：open/full mount inventory、静态入口和真实启动 smoke。
2. `<Path>tests/server-auth.test.ts</Path>`、`<Path>tests/server-identity.test.ts</Path>`：principal、token、scope、server identity。
3. `<Path>tests/server-port-ownership.test.ts</Path>`、`<Path>tests/server-port-selection.test.ts</Path>`、`<Path>tests/server-startup-diagnostics-contract.test.ts</Path>`：端口、互斥和 typed startup error。
4. `<Path>tests/chat-route-session-identity.test.ts</Path>`、`<Path>tests/ws-session-context.test.ts</Path>`：WS owner/path/id 一致性和 fail-closed。
5. `<Path>tests/session-stream-store.test.ts</Path>`、`<Path>tests/server-connection.test.ts</Path>`：stream seq、resume、客户端连接状态。
6. `<Path>tests/server-readiness.test.ts</Path>`、`<Path>tests/cli-server-runner.test.ts</Path>`：桌面/CLI 对启动文件与 stderr 的消费方式。

阅读测试时注意：静态 composition 测试验证“代码不会越界”，spawn smoke 才验证一部分真实 transport；两者不能互相替代。

## 14. 推荐下一篇

接着读 `<Path>{roots.state}/specdev/changes/2026-08-13-hanakde-engineering-cognitive-mentor/teaching/04-hub-orchestration.md</Path>`，追踪 `hub.send()` 如何选择 owner/guest/automation 分支、何时调用 `engine.promptSession()` 或 `executeIsolated()`；再读 Resource/Permission 卷，理解 Server middleware 之后的业务级安全边界。
