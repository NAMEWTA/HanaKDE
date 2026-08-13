# 01 启动、生命周期与 CLI

## 读者目标与边界

本篇解释“谁启动谁、启动顺序是什么、如何被客户端发现、如何安全关闭”。它不深入 Session 业务，也不把 CLI 当成另一套 Agent 引擎。

## 职责与非职责

本篇负责解释进程启动、ready、发现、CLI 连接和 shutdown 的生命周期；不负责解释 Session 内部模型回合，也不把静态顺序当作跨平台运行证据。

## 启动入口分层

| 场景 | 入口 | 作用 |
|---|---|---|
| Electron | `<Path>desktop/bootstrap.cjs</Path>` → main bundle | 读取运行时路径、完整性和主进程启动约束 |
| Server full | `<Path>server/main-full.ts</Path>` | 注入 closed routes 与 builtin media adapters，再调用 `startServer` |
| Server open | `<Path>server/main-open.ts</Path>` | 只注入 open composition |
| Server bootstrap | `<Path>server/bootstrap.ts</Path>` | 独立进程 import bundle，并用 worker keepalive 维持启动可见性 |
| CLI | `<Path>cli/entry.ts</Path>`、`<Path>scripts/launch.js</Path>` | 解析命令、发现/启动 Server、消费 HTTP/WS |

关键设计是“组合在进程入口静态决定”，不是运行时把 open server 切换成 full server。`<Path>server/composition/contract.ts</Path>` 定义组合契约，`open-root.ts` 和 `full-root.ts` 负责各自的 route/media 接入。

## Server 启动主链

`<Path>server/index.ts</Path>` 的 `startServer()` 可按以下顺序阅读：

```text
解析 HANA_HOME
 → 同宅 server-info 互斥探测
 → data epoch 启动闸
 → 读取网络模式/端口
 → bind HTTP transport
 → first-run / identity
 → construct HanaEngine + engine.init()
 → new Hub({ engine })
 → 注册 EventBus/framework handlers
 → engine.initPlugins(hub.eventBus)
 → hub.initSchedulers()
 → Hono middleware / auth / routes / WS
 → health + server-info.json ready
```

### 为什么先做这些闸

- **同宅互斥：** 同一个 `HANA_HOME` 不能被两个内核同时打开，否则 SQLite、session 文件和 JSONL 可能互相覆盖；探测 token/端口而非盲信 PID。
- **数据 epoch：** 迁移或更高格式数据必须先被识别；未知的低可信元数据不能在普通启动中自动猜测迁移。
- **端口选择：** loopback 模式在未固定端口且确认为其他 Hana 实例时可选择 fallback；显式 pinned port 则应该失败并给出诊断。
- **先 bind 再初始化：** 让 readiness 和启动失败尽早可见，同时把“监听所有权”与领域初始化顺序固定下来。

## Ready 与关闭

ready 不等于“所有后台任务已完成”，而是 Server 已完成组合、认证和监听，并将可发现信息写入 `server-info.json`。CLI 的 `<Path>cli/local-server.ts</Path>` 读取并校验该文件的 URL、token、PID/owner 语义，随后 `<Path>cli/client.ts</Path>` 通过 bearer HTTP 或带 token 的 WS 连接。

关闭路径由 `<Path>server/index.ts</Path>` 的 shutdown 逻辑拥有：停止 HTTP/WS 与 Bridge，flush deferred state，停止/释放 Hub，清理 server-info。为什么必须逆序？上层路由和调度不能再产生新工作，才能安全释放下层 Engine、session、workspace 和持久化资源。

`<Path>server/bootstrap.ts</Path>` 的 worker keepalive 是启动可观察性适配器：主线程可能被 native module import 阻塞，worker 直接写 stdout 让 Electron 不误判 Server 无响应。它不改变业务生命周期。

## CLI 是操作面，不是第二个引擎

`<Path>cli/entry.ts</Path>` 将命令分成：

- `serve`：调用 `<Path>cli/server-runner.ts</Path>` 启动 Server；
- `status`/`sessions`：发现 Server 后读取投影；
- `chat`/`continue`：建立稳定 Session identity 和 WS 流；
- `bundle`/`data`：执行本地 bundle 或数据维护边界，不通过普通 chat 路径。

`server-runner.ts` 负责 source/packaged bootstrap 选择、foreign-server guard、ready polling；`cli/chat.ts` 负责流 reducer、防 stale stream 和 abort 语义。Why：CLI 与 Desktop 共享 Server 合同，避免复制 Engine 初始化和领域状态。

## 错误、并发和恢复

- 端口占用、监听权限、foreign server、data epoch block 应转换为可诊断启动错误，而不是模糊退出。
- 启动期间需要区分“进程还活着但 import 尚未结束”和“确实启动失败”；bootstrap keepalive 解决的是前者。
- 关闭采用 stop-then-release；不能在旧 owner 尚未归零时启动新的 workspace watcher、scheduler 或 server。

## 证据与测试阅读

优先阅读 `<Path>server/index.ts</Path>`、`<Path>server/bootstrap.ts</Path>`、`<Path>server/main-full.ts</Path>`、`<Path>cli/server-runner.ts</Path>`、`<Path>cli/local-server.ts</Path>`；再读 `tests/server-port-ownership.test.ts`、`tests/server-readiness.test.ts`、`tests/cli-server-runner.test.ts`、`tests/cli-local-server.test.ts`。

- **事实：** 入口和启动函数的静态顺序可由上述文件确认。
- **推断：** 先 bind 再 Engine init 是为了把传输 ownership 与领域启动隔离；需结合测试确认所有失败分支。
- **待验证：** 本篇未运行 packaged Electron、跨平台 helper 或实际 crash recovery；不能声称 ready/shutdown 在所有平台都通过。

## 下一篇

阅读 `02-core-engine-and-session`，追踪 `startServer` 创建的 `HanaEngine` 如何把 Manager 组合成用户可见的 Agent/Session 行为。
