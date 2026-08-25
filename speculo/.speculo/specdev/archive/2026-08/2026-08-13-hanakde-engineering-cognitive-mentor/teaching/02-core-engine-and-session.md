# Core 引擎与 Session：从装配根到一次模型回合

## 1. 阅读定位

这篇文档面向已经读过总览、准备进入实现细节的读者。建议先理解 Server 只是传输与组合层，再把本篇当作“运行时内核”的纵向切片：

```text
HanaEngine（装配/生命周期 facade）
  ├─ AgentManager → Agent（身份、人格、记忆、工具）
  ├─ SessionCoordinator → SessionManager/AgentSession（会话运行时）
  ├─ ModelManager/ResourceLoader（模型与能力快照）
  └─ Resource/Permission/Execution services（受控副作用）
```

本文只依据当前仓库静态源码和测试索引，不宣称真实模型请求、跨平台文件锁或崩溃恢复已经运行验证。

## 2. 职责与非职责

### HanaEngine 的职责

- 以 `hanakoHome`、产品目录和组合参数构造所有核心 Manager，并保存跨域依赖注入回调。
- 提供稳定的 facade 方法，例如 Agent、Session、Resource、模型、插件和生命周期 API；具体业务逻辑委托给 Manager。
- 在 `init()` 中建立运行时上下文、模型/Pi SDK、Agent、ResourceLoader、技能和扩展工厂的顺序依赖。
- 在 `dispose()` 中按依赖逆序释放插件、媒体/MCP、技能观察器、Agent、Session、知识索引和持久化 store。

### Agent/AgentManager 的职责

- `Agent` 拥有自己的 id、配置、人格提示词、记忆存储、工具集合和 Desk/Cron 能力。
- `AgentManager` 扫描 agent 目录，先加载配置，再按优先级、并发上限和去重 Promise 懒初始化 runtime。
- Agent 初始化失败时仍保留 config-only 实例，让下游可以显示配置修复界面；这不是“假装 runtime 可用”。

### SessionCoordinator 的职责

- 管理前台 Session 运行时、路径到 Session 的缓存、会话创建/恢复/关闭、prompt、steer、abort、fork 与 isolated execution。
- 维护持久化 JSONL 与稳定 `SessionRef`/manifest 的桥接；在 SDK 打开文件前执行结构修复。
- 将 Agent、模型、ResourceLoader、工具、权限模式、workspace scope 等快照绑定到一次 Session。

### 明确不负责的内容

- Core 不负责 HTTP 路由、WebSocket 广播或客户端 UI；这些属于 `<Path>server/</Path>` 和 `<Path>desktop/</Path>`。
- `HanaEngine` 不是所有业务数据的唯一存储真相源；Channel、ResourceIO、Knowledge、Bridge 等仍由各自域存储/Manager 拥有。
- `SessionCoordinator` 不决定网络认证，也不直接决定 Hub 的调度策略；它只执行已经解析好的会话操作。

## 3. 目录地图

| 目录/文件 | 读者应建立的模型 |
|---|---|
| `<Path>core/engine.ts</Path>` | Thin Facade、Manager 装配、初始化和逆序释放 |
| `<Path>core/agent-manager.ts</Path>` | agent 目录扫描、config-only、runtime 初始化队列 |
| `<Path>core/agent.ts</Path>` | Agent 身份、系统提示词、记忆和工具构造 |
| `<Path>core/session-coordinator.ts</Path>` | Session 生命周期、prompt、恢复、fork、isolated execution |
| `<Path>core/session-manifest/</Path>` | `sessionId`、current locator、owner、branch head 和生命周期 |
| `<Path>core/session-jsonl-file.ts</Path>` | JSONL 读取、超大行/内联媒体/坏结构修复 |
| `<Path>core/session-operation-lock.ts</Path>`、`<Path>core/session-execution-registry.ts</Path>` | 文件操作与运行中的取消/并发边界 |
| `<Path>core/model-manager.ts</Path>`、`<Path>lib/pi-sdk/</Path>` | 模型发现、凭据解析、Pi SDK SessionManager/AgentSession |
| `<Path>core/execution-boundary.ts</Path>`、`<Path>core/execution-router.ts</Path>` | 受控执行面、工具和远程/隔离执行边界 |
| `<Path>tests/engine-lifecycle.test.ts</Path>`、`<Path>tests/session-coordinator.test.ts</Path>` | 生命周期与 Session 合同的可执行证据 |

## 4. 关键装配链：为什么 Engine 是薄 facade

`HanaEngine` 的构造函数在 `<Path>core/engine.ts</Path>` 中接收 `hanakoHome`、`productDir`、可选 `agentId`、版本和闭集媒体适配器。它先建立目录、SessionFileRegistry、manifest store、Resource 相关对象，再创建 Preferences、Model、Media、MCP、Channel、AgentManager 和 SessionCoordinator。

关键点不是“构造了很多类”，而是依赖方向：

1. `ModelManager` 必须先存在，Agent 初始化需要解析 chat/utility/memory 模型。
2. `AgentManager` 通过回调取得 `SessionCoordinator` 和 Engine，避免在构造期间形成硬循环。
3. `SessionCoordinator` 通过 `buildTools`、`getResourceLoader`、`ensureAgentRuntime` 等回调取得能力，而不是复制一份 Agent 业务逻辑。
4. `ConfigCoordinator`、Bridge、Resource 与 Hub 回调在 Engine 上汇合；Engine 对外暴露 facade，内部仍保留各域 owner。

这解释了一个常见阅读误区：看到 `engine.promptSession()` 不要把所有逻辑都归给 `engine.ts`；它通常只是转发到 `_sessionCoord`，真正的 preflight、SDK 调用和 branch 同步在 `<Path>core/session-coordinator.ts</Path>`。

## 5. 生命周期主链

### 5.1 构造阶段

```text
new HanaEngine({ hanakoHome, productDir, ... })
  → 目录/manifest/resource 基础设施
  → Preferences + ModelManager + Media/MCP
  → 选择启动 Agent id（显式 id > primary preference > 首个可用目录）
  → ChannelManager + AgentManager
  → SessionExecutionRegistry + SessionCoordinator
```

显式 `agentId` 会经过合法性检查；不能悄悄切换到另一个 Agent。没有可用 Agent 时构造失败，这个错误在 Server 启动阶段表现为启动失败，而不是创建一个没有身份的 Engine。

### 5.2 `engine.init()` 五段式骨架

`<Path>core/engine.ts</Path>` 的 `init()` 先做凭据文件权限收紧和 `ServerRuntimeContext`，随后按以下顺序推进：

1. **Pi SDK/模型基础设施**：`ModelManager.init()`、`refreshAvailable()`，使 Agent 能解析 utility 与 memory 模型。
2. **所有 Agent**：`AgentManager.initAllAgents()` 先加载配置；焦点 Agent 以 foreground 优先级初始化，失败则保留 config-only。
3. **ResourceLoader 与技能**：建立核心扩展工厂、Provider payload/context 规范化、媒体能力过滤，并加载 workspace/external skills。
4. **模型发现与默认模型**：同步 Provider、校验 `{ id, provider }` 引用，找不到模型时显式保持 `defaultModel = null`。
5. **技能同步/观察和辅助清理**：同步 Agent skills、启动 watch、Bridge reconcile、沙盒与临时会话清理。

核心设计是“依赖前置 + 局部 best-effort”：模型基础设施失败会影响后续能力；凭据 mode、健康警告、过期 ephemeral 文件等维护步骤多数记录并继续，避免一个可修复的辅助问题阻断整个 UI。

### 5.3 释放阶段

`engine.dispose()` 先停生产 workspace runtime，再卸载仍 loaded 的插件，停止媒体/MCP、技能观察、deferred/loop 服务，调用 `AgentManager.disposeAll()` 和 `SessionCoordinator.cleanupSession()`，最后关闭 Knowledge index、computer runtime 与 manifest store。逆序的原因是上层插件/调度器可能仍持有 Engine、Session 或 Resource 引用。

## 6. Agent runtime：配置身份与可执行能力分离

`<Path>core/agent.ts</Path>` 的 `loadConfigOnly()` 只读取 config、身份字段和记忆总开关；不会打开 FactStore、MemoryTicker 或工具。这是启动容错的关键：用户可以在 Server 已起来的情况下修复坏配置。

完整 `Agent.init()` 大致为：

```text
compat checks → load config → identity/flags
  → FactStore + SessionSummaryManager
  → resolve utility/memory model
  → MemoryTicker（若模型可用）
  → memory/general tools
  → Desk/Cron + file/browser/session tools
  → buildSystemPrompt / runtimeInitialized
```

模型解析函数被保留为“每次现场解析”回调，而不是永久缓存凭据；Provider key/url 变化后记忆 tick 可以恢复。代价是每次后台维护都要面对模型不可用、凭据过期等运行时错误，因此 Agent 对 memory ticker 使用告警和降级。

`<Path>core/agent-manager.ts</Path>` 通过 `_runtimeInitPromises` 去重同一 Agent 的初始化请求，并用 `_runtimeInitConcurrency` 和优先级队列限制并发。焦点 Agent 是 foreground，后台/其他 Agent 默认 background；这同时保护启动响应时间和 CPU/数据库资源。

## 7. Session 的三个身份层

理解 Session 时要把三个概念分开：

1. **运行时对象**：Pi SDK 返回的 `AgentSession`，含 `sessionManager`、model、stream 状态和订阅。
2. **持久化 locator**：通常是 Agent session 目录下的 `.jsonl` 文件路径，便于旧客户端和文件层读取。
3. **稳定逻辑身份**：manifest 中的 `sessionId`、owner、domain、kind、lifecycle 和 current locator。新协议优先使用它，路径只是兼容定位器。

`<Path>core/session-manifest/ref.ts</Path>` 的 `ensureSessionRefForPath()` 会为旧 JSONL 回填稳定 manifest；`<Path>core/session-manifest/store.ts</Path>` 保存 owner、branch、lifecycle 和 locator history。这样文件移动、fork 或多客户端同时引用时，不必把路径当作不可变主键。

### Session 状态

- **未加载**：只有 manifest/文件元数据，没有内存 `AgentSession`。
- **加载中**：`ensureSessionLoaded()` 通过 `_ensureSessionLoadedInFlight` 合并同一路径请求，防止重复打开同一 JSONL。
- **已加载空闲**：可接受 prompt；可被 runtime pressure hibernate/淘汰。
- **streaming**：当前回合运行，禁止普通重复 prompt；可 steer 或 abort。
- **compacting/switching**：模型/上下文维护期间，入口拒绝冲突操作。
- **关闭/删除**：运行时释放，manifest lifecycle 或文件清理记录最终状态。

## 8. 创建、恢复与一次 Prompt

### 8.1 创建

调用 `SessionCoordinator.createSession()` 时：

1. 解析目标 Agent，并调用 `_ensureAgentRuntimeReady()`；runtime 未就绪不能生成能力快照。
2. 决定 cwd、workspace folders、authorized folders 和模型；非 restore 且无模型直接报 `noAvailableModel`。
3. 执行 `onBeforeSessionCreate()`，同步 workspace skills/policy。
4. 没有传入 `SessionManager` 时调用 Pi SDK `SessionManager.create()`。
5. 组装 system prompt、skills、tool names、permission/thinking level 等快照，再调用 `createAgentSession()`。
6. 以 SDK 返回的 session file 建立/确认 manifest，检查运行时 locator 与稳定 `SessionRef` 一致；不一致报 identity conflict。

输出至少包含 `session`、`sessionPath`、`agentId`（测试 `<Path>tests/session-concurrency.test.ts</Path>` 锁定这一形状）。

### 8.2 恢复

`ensureSessionLoaded()`/切换路径在 `SessionManager.open()` 之前做三类读时修复：超大 JSONL 行、孤儿 `toolResult`、内联媒体。然后以 JSONL 作为模型单一数据源恢复（不会从 `session-meta.json` 猜模型），调用 `createSession(..., { restore: true })`。

恢复健康检查只发 `session_unhealthy_warning`，不因近期 `stopReason=error` 自动阻断打开；这是“提示用户新建/修复”与“保持历史可读”的折衷。

### 8.3 前台 Prompt

```text
promptSession(sessionPath, text, opts)
  → 解析/加载 Session + 检查 model/owner
  → AbortController 保护异步媒体准备
  → 视觉/图片/音视频能力校验与 prompt envelope
  → 再次检查 isStreaming + preflightSessionInput
  → AgentSession.prompt(text, promptOpts)
  → finally: 媒体收尾、历史裁剪、branch head 同步、pressure check
  → MemoryTicker.notifyTurn()
```

注意两次忙碌检查：Server/Hub 入口的检查不能覆盖媒体准备期间新启动的后台 turn，因此 `promptSession()` 在真正写入前再次检查 `entry.session.isStreaming`，冲突时抛 `session_busy`。

`prompt()`（焦点 session 代理）与 `promptSession()`（路径感知 API）共享同一原则；前者先保证当前焦点 session 存在，后者允许多 Session 并存并按路径更新缓存条目。

## 9. Abort、Steer 与隔离执行

### 9.1 Abort

`promptSession()` 在媒体预处理阶段登记 `_prePromptAbortControllers`。如果用户在 SDK run 尚未开始时 abort，控制器可以让 `signal.throwIfAborted()` 提前结束；如果 run 已开始，则 `SessionExecutionRegistry`/Pi SDK `session.abort()` 负责取消。清理阶段会同步 sidecar、branch head 和 runtime map。

### 9.2 Steer

`steerSession()` 只对 streaming Session 调 `session.steer(text)`；非 streaming 时返回 false，由上层把消息降级为普通 prompt。这样 steer 不会伪造“已插入当前模型回合”的成功状态。

### 9.3 `executeIsolated()`

后台 Cron、subagent、heartbeat 使用 `SessionCoordinator.executeIsolated()`：

```text
提前 abort 检查
  → ensureAgentRuntime
  → 创建或 resume ephemeral/persistent SessionManager
  → ensure SessionRef/manifest
  → 继承/收窄 workspace 与 authorized folder scope
  → 按活动类型筛选工具、构造 subagent/automation prompt
  → createAgentSession + subscribe 事件
  → prompt；将事件可选 emit 到 EventBus
  → teardown/dispose；临时 session best-effort 清理或 manifest tombstone
```

隔离 session 不进入长期 `_sessions` map，但仍必须有稳定身份、权限上下文和 teardown。`resumeSessionPath` 存在时绝不删除原文件；新建 ephemeral 失败则回滚 manifest/file。工具错误、模型 stopReason 和 abort 都被归一到返回对象的 `error`/`stopReason`，调用者无需猜异常类型。

## 10. 输入、输出、错误与并发不变量

### 输入/输出边界

- 输入：文本、图片/视频/音频、SessionFile 引用、UI context、workspace scope、permission mode、模型引用和可选 AbortSignal。
- 输出：SDK 事件流、持久化 JSONL/custom entries、manifest branch head、SessionFile 结果、`{ sessionPath, replyText, error, stopReason }` 等结构化 isolated 结果。
- 外部副作用：模型网络请求、工具调用、文件/浏览器操作、记忆 tick；都应经过 tool catalog、Resource/permission 和 execution boundary。

### 错误分层

- **身份/配置**：`target agent unavailable`、`noAvailableModel`、manifest identity conflict。
- **输入状态**：`session_busy`、`noActiveSessionPrompt`、模型不支持视频/音频。
- **历史修复**：坏 JSONL/孤儿 toolResult 修复失败只告警，除非无法建立基本 Session 身份。
- **执行**：模型 provider error、tool error、`aborted`；isolated 将其转成可消费字段，前台由 EventBus/Server 翻译为 UI 事件。

### 并发不变量

1. 同一 Agent runtime 初始化 Promise 合并，队列限制并行数量。
2. 同一路径 Session load 合并；同一 JSONL 不允许两个长期 writer 幽灵实例。
3. 同一 Session 的普通 prompt 不能重入；steer/abort 是显式例外。
4. Session operation lock、execution registry、branch-head sync 协作保护文件 append、取消和 fork。
5. isolated session 与前台 session 分离缓存和生命周期，但可通过 parentSessionId/path 记录归因。

## 11. Why、代价、边界与替代设计

### Why 选择 Thin Facade + Coordinator

Server、CLI、Bridge、Hub 和桌面都需要相同的 Agent/Session 能力。把所有逻辑放进路由会造成多个入口各自处理身份、模型和清理；把所有逻辑塞进 Engine 则会让 Engine 变成不可测试的“上帝对象”。当前方案用 Engine 统一组装和生命周期，用 Manager/Coordinator 保存领域 owner。

### Why 用 JSONL + manifest 双层身份

JSONL 适合 Pi SDK 的追加式消息历史和人工恢复；manifest 适合稳定 id、owner、branch、lifecycle 和移动历史。代价是恢复流程必须维护两套一致性，并为旧文件做回填/修复。

### Why runtime 与 config-only 分离

配置损坏不应让用户完全失去修复入口；代价是调用者必须检查 `runtimeInitialized`，不能仅凭 Agent 对象存在就执行工具。

### 替代方案与不选原因

| 方案 | 优点 | 代价 | 当前不选原因 |
|---|---|---|---|
| 每个 route 自建 Agent/Session | 入口代码直观 | 身份、并发、清理重复且容易漂移 | 无法保证桌面/CLI/Bridge 语义一致 |
| 只用文件路径作 session id | 简单、兼容旧客户端 | 移动/fork/多 studio 时身份可变、易混淆 | manifest 需要稳定逻辑身份 |
| 所有 Session 永久驻内存 | 读取快 | 内存、模型连接和 writer 泄漏 | 当前支持 hibernate、pressure 和冷恢复 |
| 所有后台任务复用前台 Session | 少建文件 | 会污染用户历史、权限和取消边界 | isolated execution 保持归因与隔离 |

## 12. 事实、推断、假设与待验证

### 已确认事实

- `HanaEngine` 持有 Manager 并在 `init()`/`dispose()` 负责顺序装配和释放：`<Path>core/engine.ts</Path>`。
- `AgentManager.initAllAgents()` 先 config-only，再通过并发队列初始化 runtime：`<Path>core/agent-manager.ts</Path>`。
- `SessionCoordinator` 使用 Pi SDK `SessionManager`，并在 open 前修复历史：`<Path>core/session-coordinator.ts</Path>`、`<Path>core/session-jsonl-file.ts</Path>`。
- `SessionRef`/manifest 保存稳定 id 与 current locator：`<Path>core/session-manifest/ref.ts</Path>`、`<Path>core/session-manifest/store.ts</Path>`。
- `executeIsolated()` 支持 ephemeral、持久化 resume、权限/工具筛选、abort 和 teardown：`<Path>core/session-coordinator.ts</Path>`。

### 教学推断

- Core 是跨入口的运行时组合根，Server 只是其 transport/composition consumer。这由构造依赖和 Server 调用顺序推导，不能替代正式架构决策。
- manifest 是新的身份权威、路径是兼容 locator；WS context 的注释和 manifest API 支持此方向，但旧会话迁移仍需观察。

### 假设与待验证

- 当前未运行模型请求、真实多进程竞争或跨平台文件锁；`server-info` 互斥的秒级冷启动竞态仍是源码明确接受的边界。
- Provider registry 多实例缓存、知识索引与 MemoryTicker 在崩溃/重启下的完整恢复行为，需要后续运行验证。
- packaged Electron 启动时的 spawn/readiness 细节留给启动卷，不在本篇重复作运行承诺。

## 13. 测试阅读地图

建议按以下顺序阅读测试，用行为问题驱动源码回看：

1. `<Path>tests/engine-lifecycle.test.ts</Path>`：Engine 初始化/释放、依赖顺序和失败容错。
2. `<Path>tests/session-coordinator.test.ts</Path>`：创建返回值、prompt、恢复、模型不可用和扩展快照。
3. `<Path>tests/session-concurrency.test.ts</Path>`：Session 创建结构、并发限制和 per-session 隔离。
4. `<Path>tests/session-operation-lock.test.ts</Path>`、`<Path>tests/session-meta-write-serialization.test.ts</Path>`：写入互斥与元数据串行化。
5. `<Path>tests/session-jsonl-file.test.ts</Path>`、`<Path>tests/session-orphan-tool-repair.test.ts</Path>`：历史修复与恢复前置条件。
6. `<Path>tests/session-manifest-engine.test.ts</Path>`、`<Path>tests/session-manifest-coordinator.test.ts</Path>`：稳定身份、owner、branch head。
7. `<Path>tests/session-coordinator-isolated-abort.test.ts</Path>`、`<Path>tests/session-execution-registry.test.ts</Path>`：后台隔离执行和取消。

测试存在并不等于所有跨平台行为已证实；它们首先是“契约导航”，其次才是覆盖率指标。

## 14. 推荐下一篇

先阅读 `<Path>{roots.state}/specdev/changes/2026-08-13-hanakde-engineering-cognitive-mentor/teaching/03-server-http-websocket.md</Path>`，把本篇的 `engine.promptSession()` 放回 HTTP/WS 入口；随后阅读 Hub 卷，理解谁决定调用 `promptSession()`、谁决定 `executeIsolated()`，最后再进入 Shared/Lib 的 ResourceIO、Permission 和 Provider 接缝。
