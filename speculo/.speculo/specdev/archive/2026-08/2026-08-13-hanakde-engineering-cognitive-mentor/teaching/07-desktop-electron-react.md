# 07. Desktop、Electron 与 React：受控客户端如何变成可用的工作台

## 1. 这篇文档解决什么问题

这篇面向已经读过总览、准备进入客户端实现的读者。建议先掌握 TypeScript/React、Electron 的 main/preload/renderer 三进程模型，以及 HTTP、WebSocket 和 Promise 的基本概念。阅读目标不是记住每个组件，而是能够回答三件事：

1. Electron 壳为什么负责启动和窗口，却不承载聊天业务真相；
2. React 如何从本地 server 身份建立连接，把 HTTP 快照和 WebSocket 增量投影进 Zustand；
3. 哪些操作必须经过 preload/IPC，哪些操作必须走 server HTTP/WS，以及插件 iframe 为什么又是一条更窄的边界。

本篇是“桌面客户端域卷”，不是 Electron API 参考，也不替代插件协议卷。插件 iframe 的 ticket、surface session 和 postMessage 细节在 `<Path>{roots.state}/specdev/changes/{change}/teaching/08-plugin-protocol-sdk-runtime.md</Path>`。

## 2. 职责与非职责

### 职责

- 在不同平台上创建、隐藏、显示和关闭 Electron 窗口；
- 解析 HANA_HOME、启动或复用独立 server，等待 `server-info.json` 就绪；
- 通过 context isolation 的 preload 暴露最小化桌面能力；
- 在 renderer 中维护连接、会话、消息流、布局和插件 UI 的客户端投影；
- 把 server 的 HTTP 快照、WS 事件和少量主进程 IPC 事件汇合成可观察状态；
- 处理重连、流恢复、窗口崩溃诊断和优雅退出。

### 非职责

- Electron main 不是 Agent、Session、ResourceIO 或 PluginManager 的业务真相源；
- renderer 不直接读取本机任意路径，不直接加载 Node 模块，也不替 server 判定权限；
- preload 不实现聊天协议，不应成为第二个 server API；
- React 组件不拥有跨页面持久化真相，状态切片和 server 负责相应的持久化/业务规则；
- 桌面端不绕过 server 的鉴权、版本、资源身份和审计边界。

这是一个重要的阅读模型：Electron 是“操作系统适配器 + 生命周期协调器”，React 是“客户端投影与交互层”，server/Core 才是跨客户端的行为 authority。该结论由下文的启动和请求路径静态推导，运行时跨平台细节仍须看“待验证”章节。

## 3. 目录地图

| 层 | 关键位置 | 阅读问题 |
|---|---|---|
| 壳启动 | `<Path>desktop/bootstrap.cjs</Path>` | 在加载 main 之前如何设定 TLS、HANA_HOME、诊断和失败出口？ |
| Electron main | `<Path>desktop/main.cjs</Path>` | 如何创建窗口、spawn/reuse server、注册 IPC、监控崩溃和退出？ |
| preload | `<Path>desktop/preload.cjs</Path>` | renderer 能看到哪些白名单能力？哪些输入先被规范化？ |
| renderer 入口 | `<Path>desktop/src/main.tsx</Path>`、`<Path>desktop/src/react/App.tsx</Path>` | React 根组件如何挂载，初始化为何与布局分离？ |
| 初始化 | `<Path>desktop/src/react/app-init.ts</Path>`、`<Path>desktop/src/react/bootstrap.ts</Path>` | 如何取得 server 身份、健康信息、Agent、Session 并宣布 app-ready？ |
| Zustand | `<Path>desktop/src/react/stores/index.ts</Path>` 及各 `*-slice.ts` | 哪些状态是连接、会话、流、UI、插件或资源投影？ |
| HTTP/WS 服务 | `<Path>desktop/src/react/services/server-connection.ts</Path>`、`<Path>desktop/src/react/services/websocket.ts</Path>`、`<Path>desktop/src/react/services/ws-message-handler.ts</Path>` | 连接凭证如何变成 URL/header，WS 如何重连和恢复流？ |
| 插件 UI 宿主 | `<Path>desktop/src/react/hooks/use-plugin-iframe.ts</Path>`、`<Path>desktop/src/react/plugin-ui/plugin-ui-host-controller.ts</Path>` | iframe 消息如何验证来源、能力、slot 和尺寸？ |
| 测试 | `<Path>desktop/src/react/__tests__/</Path>`、`<Path>tests/</Path>` | 哪些契约有测试保护，哪些仍是静态假设？ |

## 4. 总体边界：四个运行上下文

可以先把一次桌面运行画成四个上下文：

```text
Electron bootstrap/main
        │ spawn / reuse server；IPC 窗口与 OS 能力
        ▼
独立 Node server（HTTP + WS + Core/Hub/PluginManager）
        ▲                         │
        │ HTTP 快照、WS 增量       │ 插件 route / ticket / assets
        │                         ▼
React renderer（Zustand + components）── iframe plugin surface
        │
        └── preload 的白名单 IPC（窗口、文件选择、通知、更新等）
```

**事实：** preload 文件头部明确写出“业务通信走 HTTP/WS；IPC 仅用于窗口管理、系统对话框、跨窗口消息转发”，见 `<Path>desktop/preload.cjs</Path>`。`server/index.ts` 的注释也说明 Electron main 通过独立进程启动 server，并以 `server-info.json` 传递就绪信息，见 `<Path>server/index.ts</Path>`。

**推断：** 这种拆分让 CLI、PWA、远程客户端和 Electron 共享 server/Core，而不会把桌面专属 API 带进业务层。代价是读者必须同时追踪进程、凭证和状态投影，不能把“一个前端请求”误读为“一个函数调用”。

## 5. 启动主链路：从进程到首屏

### 5.1 bootstrap：最早期的安全和诊断护栏

`<Path>desktop/bootstrap.cjs</Path>` 先加载 Windows system CA（普通生产启动保留，知识 E2E 可显式退出），解析并写入 `HANA_HOME`，创建诊断目录，登记 `bootstrap-started` marker。它为 `uncaughtException` 和 `unhandledRejection` 记录结构化诊断，然后加载 `<Path>desktop/src/shared/launch-integrity.cjs</Path>`，在打包 Windows 环境检查安装面，最后根据 `app.isPackaged` 选择 `main.bundle.cjs` 或 `main.cjs`。

这一步的关键 Why 是“失败也要可解释”：Electron 如果在 main 尚未加载前失败，bootstrap 仍能写 diagnostic、显示 error box，并以非零码退出。它不创建业务窗口，也不启动 server；它只建立启动前提。

### 5.2 main：组合 Electron 壳和 server 子进程

`<Path>desktop/main.cjs</Path>` 加载 Electron、窗口、文件、网络代理、更新、GPU 和 server guardian 等模块。初始化时硬检查 `<Path>desktop/preload.bundle.cjs</Path>` 存在；缺失就显示“构建不完整”并退出，避免 renderer 静默得到没有 `window.hana` 的白屏。

主要顺序如下：

1. 解析 HANA_HOME、单实例锁、GPU 启动策略和网络代理；
2. `app.whenReady()` 后解析打包 artifact（如果有 seed），再调用 `startServer()`；
3. `startServer()` 先读 `server-info.json`，验证 PID、身份、版本和 token，可信的桌面-owned server 可复用；
4. 无法复用时 `_spawnServerOnce()` 选择开发或打包 server 入口，设置环境变量，spawn 子进程并轮询 `server-info.json`；
5. 获得 `serverPort`、`serverToken` 后进入 server 健康观察期，并挂上 `monitorServer()`；
6. 创建 splash/main window。主窗口的 `webPreferences` 使用 preload bundle、`contextIsolation: true`、`nodeIntegration: false`；
7. renderer 完成 `initApp()` 后调用 `platform.appReady()`，main 的 `app-ready` IPC handler 显示主窗口、关闭 splash/onboarding 并标记 GPU ready。

关键证据位于 `<Path>desktop/main.cjs</Path>` 的 `startServer`、`pollServerInfo`、`_spawnServerOnce`、`createMainWindow`、`wrapIpcBestEffortHandler("app-ready")` 和 `app.whenReady().then(...)`。源码还设置 30 秒 app-ready 超时，防止首屏永远隐藏；这说明“HTML 加载完成”和“业务初始化完成”是两种不同状态。

### 5.3 server 边界：为什么用文件握手而不是 IPC

main 与 server 是独立 Node 进程。server 在运行时 HANA_HOME 下写入 `server-info.json`，包含端口、token、PID、版本和 owner 信息；main 通过轮询读取并验证，而不是把 server 对象跨进程序列化。

**事实：** `<Path>server/index.ts</Path>` 注释说明“无 IPC 通道：就绪与端口写入 HANA_HOME/server-info.json，桌面端轮询该文件”。

**Why：** server 也可能由 CLI 或独立部署启动；文件握手让桌面端能复用残留 server、让外部工具发现端口，也避免 Electron IPC 成为 server 的必需依赖。

**代价与边界：** 文件可能损坏、过期或指向 foreign server，因此 main 还会调用 identity/health probe、区分可复用、可认证关闭、端口冲突和残留未清理。静态代码能证明分支存在，但不能证明每个平台进程退出时序；这属于待验证项。

## 6. preload 与 IPC：最小桥接面

### 6.1 暴露方式

`<Path>desktop/preload.cjs</Path>` 通过 `contextBridge.exposeInMainWorld("hana", {...})` 暴露白名单对象，并将所有主进程调用封装为 `ipcRenderer.invoke`、`send` 或事件订阅。常用类别包括：

- server 连接：`getServerPort`、`getServerToken`、`appReady`；
- 窗口/系统：`windowMinimize`、`windowMaximize`、`selectFolder`、`selectFiles`、`openExternal`、通知；
- 文件与知识原生入口：`readFileSnapshot`、`writeFileIfUnchanged`、`knowledgeNativeInvoke`；
- 更新：`autoUpdate*`、`trainUpdate*` 及进度事件；
- 多窗口/浏览器/skill viewer：对应 open/close/load 与跨窗口事件。

`invokeKnowledgeNative` 是一个有代表性的输入收窄点：普通请求直接转发；`importDroppedFiles` 只接收最多 1000 个 File，调用 `webUtils.getPathForFile` 把真实路径提取出来，拒绝 synthetic/revoked File handle，再把明确字段交给 main。它说明 preload 可以做“边界归一化”，但不应做资源业务决策。

### 6.2 main 侧 handler 纪律

main 用 `wrapIpcHandler`、`wrapIpcBestEffortHandler`、`wrapIpcOn` 统一注册 handler，按 sender 窗口取得 `BrowserWindow`，并对路径、URL、文件版本和权限做校验。比如 `openExternal` 的导航策略、知识原生调用和文件写入仍由 main/server 规则约束；renderer 只能调用 preload 给出的函数。

### 6.3 安全不变量

1. `nodeIntegration: false`，renderer 没有 Node require；
2. `contextIsolation: true`，`window.hana` 是隔离世界的显式 API；
3. preload 不暴露任意 `ipcRenderer`，而是每个函数固定 channel 和参数形状；
4. 外部 URL、文件路径和窗口来源必须由 main 重新验证，不能把 renderer 的字符串当可信身份；
5. 业务请求优先 HTTP/WS，IPC 只承担操作系统/窗口边界。

这些规则也被 `<Path>tests/knowledge-safe-links.test.ts</Path>`、`<Path>tests/ipc-wrapper.test.ts</Path>` 等测试间接保护。测试不会证明操作系统本身安全，只证明仓库代码没有明显绕过。

## 7. React renderer：初始化、存储和服务

### 7.1 入口与布局分离

`<Path>desktop/src/main.tsx</Path>` 只做日志、CSP violation 监听和 `createRoot(...).render(<App />)`。`<Path>desktop/src/react/App.tsx</Path>` 在模块加载时调用 `initTheme()` 与 `initDragPrevention()`，组件本身负责 titlebar、sidebar、`AppPages`、overlay、Toast 和错误边界的布局编排。真正的启动副作用放在 `<Path>desktop/src/react/app-init.ts</Path>`，这是“组件结构”和“生命周期流程”分离的明确设计。

### 7.2 `initApp()` 主链路

`initApp()` 的静态顺序可概括为：

```text
取得 preload serverPort/token
 → 构造 local/persisted ServerConnection
 → GET /api/server/identity（必要时回退 local）
 → 并行 health/config/agents
 → 加载 locale、Agent 身份、workspace/config
 → connectWebSocket()
 → loadModels、loadAgents、loadSessions
 → 初始化 desk、项目目录、插件 UI、viewer、事件桥
 → platform.appReady()
```

代码明确避免“从 server 当前焦点猜 Agent”：先从 health 返回的 `agentId` 和 `/api/agents` 选主 Agent，再按 Agent 请求 config。远程连接 identity 失败时，如果本地连接存在，会回退到 local；两者都失败也会调用 `appReady`，让 main 不永久隐藏窗口。

`<Path>desktop/src/react/app-init.ts</Path>` 后半段还注册 `platform.onServerRestarted`，更新 store 中的本地连接并重连 WS；注册 `configureAppEventActions`、`configureWsMessageHandler`、错误总线和插件 UI 刷新。这些 callback 是长期存在的 service wiring，不是单个 React 组件的临时 effect。

### 7.3 ServerConnection：把身份变成可用传输

`<Path>desktop/src/react/services/server-connection.ts</Path>` 定义 `ServerConnection`，包括 `connectionId`、kind、server/studio identity、`baseUrl`、`wsUrl`、token、auth/trust/credential 状态、execution boundary 和 capabilities。`createLocalServerConnection()` 把 main 提供的端口/token变成 `http://127.0.0.1:<port>` 与 `ws://127.0.0.1:<port>`；远程/browser 连接则从 identity/principal 合并信任和能力。

连接模块还负责：

- 规范化端口、URL、token 和 route path；
- 只允许 local loopback connection 使用 query token；
- 为 HTTP 拼接合适的 Authorization/cookie/header；
- 为 WS 先请求 ticket，再构造 `/ws` URL；
- 在协议版本不匹配时发出 warning，而不是静默把不同 server 当成同一版本。

这让 UI 组件只消费 `activeServerConnection`，而不直接拼接端口或读取 localStorage 的散乱字段。

### 7.4 Zustand：按行为切片，而不是一个巨型 reducer

`<Path>desktop/src/react/stores/index.ts</Path>` 用 `create(...)` 合并多个 slice：`connection`、`session`、`streaming`、`ui`、`agent`、`channel`、`desk`、`model`、`chat`、`preview`、`context`、`automation`、`bridge`、`plugin-ui`、`knowledge-workspace` 等。切片既定义状态，也定义最小 action；例如 `<Path>desktop/src/react/stores/connection-slice.ts</Path>` 维护 local/remote connection registry，`<Path>desktop/src/react/stores/plugin-ui-slice.ts</Path>` 维护 pages/widgets、隐藏项、tab order 和 Jian view。

按行为切片的 Why：

- 连接状态、聊天流和 UI 偏好拥有不同生命周期；
- WS handler 可以直接更新对应 slice，而不经过层层 prop drilling；
- 单元测试可以针对 action 和 selector，不必挂载完整 App。

代价是状态键的命名和 session identity 纪律很重要。代码用 `sessionId` 优先、`sessionPath` 兼容旧数据，并在 `message-live-version`、`sessionScopedKey` 等 helper 中避免把不同会话的事件写到同一个槽位。

## 8. WebSocket：增量事件、重连和流恢复

### 8.1 建立连接

`<Path>desktop/src/react/services/websocket.ts</Path>` 维护模块级 singleton `_ws`。`connectWebSocket()` 从显式参数或 store 解析 `ServerConnection`，调用 `requestConnectionWsTicket()`，关闭旧 socket 后以 `buildConnectionWsUrl(connection, '/ws', { wsTicket })` 创建新 WebSocket。

这意味着 WS 凭证不是直接长期复用 server token；先申请 connection ticket，再连接，是浏览器/远程连接和本地连接共用的可演进边界。

### 8.2 onopen：重置、恢复、补偿

打开后，模块：

- 重置 retry delay/count，写入 `wsState: 'connected'`；
- 清空 compacting 状态；
- 找出仍在 streaming 的 session，通过 `requestStreamResume` 请求服务端恢复；
- 对当前 session 发送 `context_usage`；
- 调用 `catchUpResourceEventsAfterReconnect` 补抓断线期间的资源事件。

### 8.3 onmessage：快照事件与增量事件分流

消息 JSON 解析后，如果是 Resource event，先交给 `processResourceEventMessage`，否则交给 `handleServerMessage()`。后者位于 `<Path>desktop/src/react/services/ws-message-handler.ts</Path>`，处理文本 delta、thinking、tool、turn、plugin card、compaction、session/channel/DM 等事件，并根据 session identity 更新对应 Zustand slice。

`REACT_CHAT_EVENTS` 明确列出由流缓冲器消费的事件集合。`turn_end` 会刷新 sessions 并请求 context usage；todo tool end 会 bump live version，避免旧的 history fetch 覆盖实时状态。这些是“事件顺序和竞态”而非单纯 UI 细节。

### 8.4 onclose：指数退避与边界

断开后先进入 `reconnecting`，前 20 次使用 1 秒起步、指数增长至 30 秒；超过后使用 60 秒慢速重试。`manualReconnect()` 清零计数。网络异常、server 重启和 renderer 暂停都会走同一条恢复路径，但具体平台网络行为尚未运行验证。

相关测试：

- `<Path>desktop/src/react/__tests__/services/websocket.test.ts</Path>`：连接 URL、状态和重连；
- `<Path>desktop/src/react/__tests__/services/stream-resume.test.ts</Path>`：断线恢复目标；
- `<Path>desktop/src/react/__tests__/services/ws-message-handler.test.ts</Path>`：事件到 store 的投影；
- `<Path>desktop/src/react/__tests__/services/resource-events.test.ts</Path>`：资源事件补偿；
- `<Path>desktop/src/react/__tests__/services/ws-stream-abort-lifecycle.test.ts</Path>`：流中止生命周期。

## 9. 插件 UI 在桌面端的落点（预览）

React 通过 `<Path>desktop/src/react/stores/plugin-ui-actions.ts</Path>` 并行读取 `/api/plugins/pages`、`/api/plugins/widgets`、`/api/plugins/ui-host-capabilities` 和 `/api/preferences/plugin-ui`，写入 plugin-ui slice。`<Path>desktop/src/react/components/app/AppPages.tsx</Path>` 把 `plugin:<id>` tab 映射到 `PluginPageView`；`<Path>desktop/src/react/components/right-workspace/RightWorkspacePanel.tsx</Path>` 把 `widget:<id>` 映射到 `PluginWidgetView`；`<Path>desktop/src/react/components/chat/PluginCardBlock.tsx</Path>` 处理聊天中的 iframe/webview/card 与 `chat.surface`。

`PluginPageView`、`PluginWidgetView` 和 `PluginCardBlock` 都使用 `usePluginSurfaceUrl()` 先请求 iframe ticket，再用 `usePluginIframe()` 挂载 iframe。宿主控制器验证 `event.source === iframe.contentWindow`、origin、协议版本、slot、payload 和 grant，并把响应通过同一目标 origin 发回。

这部分的详细协议、cookie、SDK 和 server route 见下一篇；本篇只需记住桌面端是“surface host”，不是插件代码执行的业务 owner。

## 10. 状态、错误与生命周期矩阵

| 阶段 | 主要状态 | 失败表现 | 恢复/清理 |
|---|---|---|---|
| bootstrap | `HANA_HOME`、诊断 marker | CA、路径或 main load 失败 | 写诊断、error box、退出 |
| server start | `serverProcess`、port/token、server-info | timeout、PID 死亡、端口冲突、foreign server | 验证、认证关闭、重试或显示诊断 |
| window create | splash/main hidden/visible | preload 缺失、BrowserWindow/GPU 失败 | 硬失败或 Windows minimal retry |
| renderer init | connection、identity、health/config | server identity 失败、远程不可达 | 回退 local；仍失败则 app-ready + degraded UI |
| WS active | connected/reconnecting/disconnected | close/error/parse error | ticket 重连、stream resume、resource catch-up |
| plugin iframe | loading/ready/error | ticket 失败、握手超时、grant/slot 拒绝 | retry；card/page 按 slot 显示错误 |
| quit | `isQuitting`、owned server | shutdown 超时或 guardian 失败 | graceful shutdown 后 force fallback，避免 orphan |

`before-quit` 的实现强调：主动退出时先关闭 desktop-owned server；更新重启和普通窗口关闭有不同标志，避免 monitorServer 在有意重启期间误判为崩溃。静态代码可以确认标志和顺序，不能代替真实 OS 进程实验。

## 11. 代码规范与构建约束

### 11.1 规范

- Electron main/preload 保持 CJS 边界；renderer/shared/lib 多数为 TypeScript/ESM；不要把 Node-only import 带进 browser bundle；
- 业务通信使用 typed service/helper（`hanaFetch`、`ServerConnection`、WS handler），组件避免直接拼 URL；
- 新状态优先加入行为 slice，action 与 selector 同处或有清晰边界；
- IPC API 必须在 preload 显式白名单、在 main 注册 handler，并验证 sender/参数；
- 所有跨会话事件必须携带 `sessionId` 或明确 legacy `sessionPath`，缺失时安全跳过；
- 受 CSP 和 path policy 约束的 HTML/iframe 不使用未经审查的 `srcdoc`/任意 external navigation。

### 11.2 构建和打包

`<Path>package.json</Path>` 的 `start`/`start:dev` 会先构建 preload、renderer、splash/theme，再通过 launch script 启动 Electron；`build:client`、`build:server` 和 electron-builder 负责可发布产物。main 运行时加载的是 `desktop/preload.bundle.cjs`，不是源文件 `desktop/preload.cjs`。打包模式 server/renderer 由 artifact seed 解析到版本化目录；开发模式使用 source server。

`<Path>tests/shell-surface-manifest.test.ts</Path>` 与 `<Path>tests/build-server-artifact.test.ts</Path>` 保护壳表面、preload/server protocol contract 和 server artifact 依赖。修改 preload API、server protocol、renderer entry 或 electron-builder surface 时，应先理解这些测试和 `<Path>shared/contract-versions.cjs</Path>`。

## 12. 测试阅读索引

推荐按以下顺序读测试，而不是先读所有组件 snapshot：

1. `<Path>tests/desktop-main-gpu-startup-contract.test.ts</Path>`：main 窗口创建与 GPU 启动阶段；
2. `<Path>tests/desktop-gpu-startup-policy.test.ts</Path>`：跨平台 GPU policy；
3. `<Path>tests/ipc-wrapper.test.ts</Path>`：IPC wrapper 的异常/handler 纪律；
4. `<Path>desktop/src/react/__tests__/services/server-connection.test.ts</Path>`：连接 identity、token 和 URL；
5. `<Path>desktop/src/react/__tests__/services/websocket.test.ts</Path>`、`<Path>desktop/src/react/__tests__/services/ws-message-handler.test.ts</Path>`：WS 行为投影；
6. `<Path>desktop/src/react/__tests__/hooks/use-plugin-iframe.test.tsx</Path>`、`<Path>desktop/src/react/__tests__/hooks/use-plugin-surface-url.test.tsx</Path>`：插件 surface host；
7. `<Path>desktop/src/react/__tests__/app-init.test.ts</Path>`：初始化副作用和 fallback；
8. `<Path>desktop/src/react/__tests__/components/AppPages.test.tsx</Path>`、`<Path>desktop/src/react/__tests__/components/PluginPageView.test.tsx</Path>`、`<Path>desktop/src/react/__tests__/components/PluginCardBlock.test.tsx</Path>`：UI 组合。

**本次未运行：**以上测试、构建、Electron 启动和跨平台诊断均未执行；索引只反映静态存在和源码可读证据。

## 13. Why、代价、边界与替代设计

### Why 采用独立 server + preload 白名单 + React 投影

背景约束是同一套 Agent/Session 能力要服务 Electron、CLI、PWA、Bridge 和插件。把业务放进 Electron main 会让其他客户端无法复用；让 renderer 直接读文件会扩大攻击面；让每个组件各自维护 WS 会导致重复重连和事件竞态。因此当前设计把 server/Core 作为跨客户端 authority，把 Electron 限定为 OS/lifecycle adapter，把 React 限定为投影。

### 代价

- 启动链路长，必须协调 bootstrap、artifact、server、preload、renderer 和 app-ready；
- server-info 文件、connection identity 和 WS ticket 需要额外验证；
- Zustand slice 之间存在 session identity、版本和事件顺序约束；
- 诊断代码和多窗口代码增加 main 复杂度。

### 替代方案及反转条件

| 方案 | 优点 | 代价 | 何时可能反转 |
|---|---|---|---|
| Electron main 直接承载业务 | 单进程调用简单 | CLI/PWA 无法复用，权限边界混乱 | 产品明确只支持单桌面客户端 |
| renderer 直连文件/Node | 原型快 | 破坏 context isolation，难审计 | 仅限一次性隔离原型且不进入生产 |
| 每个组件自建 WS | 局部容易理解 | 重复连接、事件乱序、恢复不一致 | 应用只有一个无状态实时流 |
| 当前分层 | 复用、可审计、可恢复 | 组合和文档成本高 | 只有在系统不再跨客户端时才不再必要 |

## 14. 证据分类与待验证

### 事实

- main 使用 `contextIsolation: true`、`nodeIntegration: false`，preload 指向 bundle：`<Path>desktop/main.cjs</Path>`；
- preload 以 `contextBridge.exposeInMainWorld` 暴露 `hana`，业务通信注释指向 HTTP/WS：`<Path>desktop/preload.cjs</Path>`；
- `initApp()` 读取 server port/token、identity、health/config/agents，连接 WS 并调用 app-ready：`<Path>desktop/src/react/app-init.ts</Path>`；
- Zustand 由多个行为 slice 合成：`<Path>desktop/src/react/stores/index.ts</Path>`；
- WS 具备 ticket、重连、stream resume、resource catch-up：`<Path>desktop/src/react/services/websocket.ts</Path>`；
- 插件 surface 由 React hook/controller 验证来源、origin、slot、grant：`<Path>desktop/src/react/hooks/use-plugin-iframe.ts</Path>`、`<Path>desktop/src/react/plugin-ui/plugin-ui-host-controller.ts</Path>`。

### 推断

- Electron 层是 lifecycle/OS adapter，server 是跨客户端 authority；
- `server-info.json` 是一种可被 CLI/外部工具复用的启动发现协议，而不只是桌面内部临时文件；
- app-ready 是“业务可交互”信号，故意晚于 `did-finish-load`。

### 假设

- 生产发布的 artifact seed、renderer pointer 和 server pointer 在同一版本策略下协同更新；
- 所有 renderer 入口都能获得与主窗口等价的 preload contract，除非明确是 PWA/mobile。

### 待验证

- 真实 macOS/Windows/Linux 上 server 复用、guardian、GPU fallback 和 force kill 的完整时序；
- renderer 崩溃后 artifact demotion 与重载是否在每个平台都保持同一连接状态；
- 多窗口同时写入 settings/file watcher 时，IPC 事件去重和 listener 清理是否没有泄漏；
- 远程/cloud connection 的 cookie、WS ticket 过期和 offline resume 行为。

## 15. 下一篇

下一篇 `<Path>{roots.state}/specdev/changes/{change}/teaching/08-plugin-protocol-sdk-runtime.md</Path>` 将沿着本篇的 iframe 落点深入：PluginManager 如何扫描和加载插件，full-access/restricted 如何决定贡献面，iframe ticket、surface session、asset cookie 如何分别约束文档加载、动态 API 和静态资源，以及 `@hana/plugin-sdk`、`@hana/plugin-runtime`、`@hana/plugin-components` 如何把这些边界包装成作者可用的接口。

## 16. 本篇阅读检查

读完后应能用自己的话解释：

- 为什么 `app.whenReady()` 之后仍不能立即显示主窗口；
- 为什么 `window.hana.getServerPort()` 是 IPC，而聊天请求却必须走 `hanaFetch`/WS；
- 为什么 WS 重连后要同时做 stream resume 和 resource catch-up；
- 为什么 plugin page 的 iframe URL 不是普通静态 URL，而是 ticket/session 派生的受限 surface。
