# Hub 编排：EventBus、消息路由与后台调度

## 阅读定位

Hub 位于 Server/Core 之上、客户端和外部适配器之下。它决定“消息应该走哪条执行路径、何时触发后台任务、如何把结果投影给订阅者”，但不取代 Core 的 Agent/Session owner，也不取代 Channel、Bridge、Activity 等持久化 owner。

## 职责与非职责

### Hub 的职责

- 组装 `<Path>hub/event-bus.ts</Path>`、`<Path>hub/channel-router.ts</Path>`、`<Path>hub/dm-router.ts</Path>`、`<Path>hub/guest-handler.ts</Path>`、`<Path>hub/scheduler.ts</Path>` 和 `AgentExecutor`。
- 提供统一的 `Hub.send()`，按 desktop owner、bridge guest/owner、ephemeral automation 等目标分支。
- 管理 heartbeat、Studio cron、fresh compact 和 task/notification 等后台调度生命周期。
- 通过 EventBus 做 session/global path/type 订阅、request/response、超时和 `HANA_BUS_SKIP` 链式跳过。
- 把 scheduler 的确定性触发转换成 Core 的 `executeIsolated()`，并附带 permission、abort、activity 和 delivery context。

### 明确不负责的内容

- Hub 不拥有主要 Agent/Session 状态；这些由 `<Path>core/engine.ts</Path>`、`<Path>core/session-coordinator.ts</Path>` 和对应 Manager 负责。
- Hub 不直接调用 LLM 来决定 Channel 是否有新消息；Channel store/ticker 负责读取窗口，Router/Executor 负责后续执行。
- Hub 不绕过 ResourceIO、Permission 或 automation execution context 写文件和网络。

## 目录地图

| 文件 | 学习重点 |
|---|---|
| `<Path>hub/index.ts</Path>` | 构造依赖、`send()` 分流、init/stop/dispose |
| `<Path>hub/event-bus.ts</Path>` | 订阅路径、request/response、timeout、capability |
| `<Path>hub/scheduler.ts</Path>` | heartbeat、cron、fresh compact、job lock、abort |
| `<Path>hub/agent-executor.ts</Path>` | 临时 phone/automation session、工具快照、tombstone |
| `<Path>hub/channel-router.ts</Path>` | Markdown channel 未读窗口、mention、回复和中止 |
| `<Path>hub/dm-router.ts</Path>`、`<Path>hub/guest-handler.ts</Path>` | DM、guest sender/context 与 bridge owner 转发 |
| `<Path>hub/fresh-compact-maintainer.ts</Path>` | Bridge/Session 的日常压缩维护 |

## 构造与依赖注入

`new Hub({ engine })` 建立 EventBus 和各 router/scheduler，并把受控 callback 注入 Engine。其关键是单向关系：Hub 可以调用 Engine 的公开执行能力，Engine 不需要知道每一种 Hub 路由实现。这样 Server 可以在 `engine.init()` 后组装 Hub，再把 `hub.eventBus` 注入插件、loop、deferred 和 task handlers。

```text
startServer()
  → engine.init()
  → new Hub({ engine })
  → register EventBus handlers/extensions
  → engine.initPlugins(hub.eventBus)
  → hub.initSchedulers()
  → ready
```

## `Hub.send()`：一个统一入口，多个执行分支

抽象主线：

```text
send(target, message, context)
  → normalize target / identity / permission
  → desktop owner ? engine.prompt/submit
  → bridge guest ? GuestHandler → owner
  → bridge owner ? BridgeSessionManager
  → ephemeral automation ? engine.executeIsolated
  → publish activity/result/events
```

为什么需要统一入口？桌面 Prompt、外部平台、频道消息和自动化任务最终都需要 Session、工具、权限、abort 和结果投影；如果每个入口自建一条执行链，Session identity、错误语义和审计会逐渐漂移。

代价是 `send()` 看起来像“大路由器”。阅读时应把它当作策略选择层：具体执行仍在 Engine、BridgeSessionManager、AgentExecutor 和 Router 中，不要把分支条件误读成领域实现。

## EventBus：事件与能力请求的深层接缝

`<Path>hub/event-bus.ts</Path>` 提供两类能力：

1. **订阅/发布**：按全局、session、path、type 过滤事件，供 Server WS、Desktop、Plugin、Activity 和后台维护消费。
2. **request/response**：按 capability/type 找 handler，按顺序尝试，handler 返回 `HANA_BUS_SKIP` 时继续下一个；超时、无 handler 和能力不可用都产生显式结果。

这种设计让插件和 Hub 可以消费稳定能力目录，而不必 import Core 私有实现。软依赖插件可用 `getCapability().available` 判断是否降级；full-access handler 才能注册部分能力。

并发边界包括 handler timeout、取消信号、订阅清理和 request 链的首个非 skip 结果。事件 bus 不是持久化数据库；需要恢复的状态仍必须写 ActivityStore、Session JSONL、Channel 或领域 store。

## Scheduler：决定“何时”，不决定“做什么”

`<Path>hub/scheduler.ts</Path>` 负责协调：

- heartbeat tick；
- Studio cron/automation job；
- fresh compact maintenance；
- job lock、AbortController、timeout、activity 和 notification。

典型路径：

```text
tick
  → read job/cursor
  → acquire lock + re-read current config
  → build automation execution context
  → engine.executeIsolated({ permissionPolicy: deny_on_prompt })
  → record ActivityStore/EventBus/history
  → release lock / advance cursor only if revision still matches
```

为什么在 dispatch 前重读 job？用户可能在 tick 和执行之间修改计划；旧 job 不应覆盖新 revision 的 cursor 或产生越权 cwd。具体 Cron 持久化由 `<Path>lib/desk/cron-store.ts</Path>`、`<Path>lib/desk/cron-scheduler.ts</Path>` 负责，Hub scheduler 是更高层协调器。

## Channel、DM、Guest 与 AgentExecutor

### ChannelRouter

`<Path>hub/channel-router.ts</Path>` 读取 channel 的成员、bookmark、mention 和新消息窗口，判断是否需要中止当前执行、广播成员或生成回复。Channel 真相由 `<Path>lib/channels/channel-store.ts</Path>` 的 Markdown 文件持有；Router 不复制另一份消息数据库。

### DmRouter 与 GuestHandler

DM 需要区分 owner/guest 和 sender context。`<Path>hub/guest-handler.ts</Path>` 将 guest 的平台、用户和权限上下文附加后转给 bridge owner；它不能擅自把 guest 变成 desktop owner。

### AgentExecutor

`<Path>hub/agent-executor.ts</Path>` 为 phone/automation 等无 UI 场景创建临时 Session，绑定工具快照、permission、abort 和 tombstone。执行完成后释放 runtime；失败时保留可追踪的 activity/result，而不是静默丢弃。

## 生命周期、错误与恢复

- `initSchedulers()` 只能在 Engine/Hub handlers 完成后调用；重复初始化应被拒绝或幂等处理。
- `stopSchedulers()` 先停止新 tick，再 abort in-flight job，等待 activity/notification flush。
- `dispose()` 释放 router、EventBus subscription、scheduler、AgentExecutor 和维护器，避免旧 callback 继续引用 Engine。
- scheduler timeout、permission denial、model error、abort 和 stale revision 必须分开记录；“任务没有运行”不等于“任务成功”。
- orphan `running` activity 在启动恢复为 `interrupted`，由 `<Path>lib/desk/activity-store.ts</Path>` 提供持久化恢复语义。

## Why、代价与替代设计

### Why 使用 Hub 作为编排层

Server 需要一个地方把 HTTP/WS/Bridge/CLI 入口统一导向 Core；Core 又不应知道每种外部触发器的调度细节。Hub 把“触发来源与路由策略”集中起来，同时把实际执行委托给稳定的 Engine/Lib 接缝。

### 主要代价

读者需要同时理解 Hub 的内存编排和 Lib/Core 的持久化 owner；跨域事件容易形成隐式时间耦合；scheduler、EventBus 和 Session stream 的恢复必须依靠多份证据。

### 实质替代方案

| 方案 | 优点 | 代价 | 当前取舍 |
|---|---|---|---|
| 每个 route 直接调用 Engine | route 看起来短 | 触发源之间没有统一路由、审批、activity 和 abort | 不选 |
| 一个全局队列包揽所有任务 | 调度模型统一 | 前台 prompt、Bridge、cron 的身份/延迟/恢复语义被强行同质化 | 不选 |
| 当前 Hub + 领域 owner | 编排集中、领域状态局部、可按行为测试 | EventBus/恢复路径较多 | 当前推荐 |

## 事实、推断、待验证

| ID | 类型 | 结论 | 证据 | 状态 |
|---|---|---|---|---|
| F-04-01 | 事实 | `Hub.send()` 按 owner、guest、bridge 和 isolated automation 分流。 | `<Path>hub/index.ts</Path>` | 静态确认 |
| F-04-02 | 事实 | EventBus 支持订阅、request/response、timeout 和 skip。 | `<Path>hub/event-bus.ts</Path>` | 静态确认 |
| F-04-03 | 事实 | Scheduler 在任务执行前建立 lock、abort 和 activity 上下文。 | `<Path>hub/scheduler.ts</Path>` | 静态确认 |
| I-04-01 | 推断 | Hub 是 orchestration/projection 层，不是主要持久化 owner。 | 由 Router、Engine、Lib store 分工推导 | 需端到端验证 |
| V-04-01 | 待验证 | 多 scheduler 重启、跨 Studio revision race、EventBus handler timeout 的真实恢复行为尚未运行验证。 | 静态代码与测试索引 | 不阻塞教学 |

## 测试阅读地图

优先阅读 `<Path>tests/scheduler-studio-cron.test.ts</Path>`、`<Path>tests/scheduler-heartbeat-default.test.ts</Path>`、`<Path>tests/activity-hub.test.ts</Path>`、`<Path>tests/channel-router-trigger.test.ts</Path>`、`<Path>tests/channel-store-locking.test.ts</Path>`、`<Path>tests/loop/loop-bus-handlers.test.ts</Path>` 和 `<Path>tests/cli-chat.test.ts</Path>`。这些测试分别把调度、恢复、Channel lock、事件 handler 和客户端流连接到 Hub 的行为合同。

## 下一篇

阅读 `05-shared-persistence-resource-security`，理解 Hub/Engine 调用的资源、权限、版本和审计接缝；然后回到 `09-end-to-end-business-flows` 重走自动化和 Channel 主线。
