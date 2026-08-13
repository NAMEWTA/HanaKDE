# 08. PluginManager、插件协议、SDK 与 Runtime：从目录到受限 UI Surface

## 1. 阅读目标与前置知识

这篇面向已经读过总览、Core/Server 概览和桌面客户端篇的读者。需要知道 Node.js 模块加载、JSON Schema、HTTP middleware、iframe `postMessage` 和基本权限模型。目标是建立一条可复述的因果链：插件目录如何变成贡献注册表，何时执行生命周期代码，HTTP route 如何把请求身份交给插件，以及 iframe 页面如何在不获得宿主 Node 权限的情况下请求有限的 host capability。

本篇聚焦插件平台，不把 `lib/` 的所有领域能力展开成 API 手册。资源读写的跨域 authority 见 `<Path>{roots.state}/specdev/changes/{change}/teaching/05-shared-persistence-resource-security.md</Path>`；桌面窗口和 React 初始化见 `<Path>{roots.state}/specdev/changes/{change}/teaching/07-desktop-electron-react.md</Path>`。

## 2. 一句话心智模型

插件平台同时有三条不同的信任路径：

```text
PluginManager（Node 主进程）
  scan → descriptor → load contributions → optional lifecycle activation
      │ tools/routes/providers/extensions/pages/widgets
      ▼
Server plugin route proxy
  auth principal → iframe ticket / surface session / asset session
      ▼
Desktop host + iframe page
  URL ticket loads document; surface session calls own route;
  HttpOnly asset cookie loads static assets; postMessage calls host UI capability
```

不要把三种凭证混成一个 token：

- **iframe ticket**：短时、绑定某个 `surfacePath` 的文档加载凭证；
- **surface session**：较长时、绑定插件的页面脚本调用自身 route 的请求凭证；
- **asset session cookie**：只覆盖该插件 `/assets/` 路径的 HttpOnly 静态资源凭证。

这个分离是本篇最重要的 Why：文档加载、动态 API、静态资源有不同的暴露面和生命周期，使用同一长期 bearer token 会扩大重放和路径越权风险。

## 3. 职责与非职责

### 职责

- 扫描 builtin/community 插件目录并读取 manifest/贡献目录；
- 按 source、disabled、trust、minAppVersion 和格式问题决定是否加载；
- 注册 tools、skills、commands、agents、routes、extensions、providers、pages、widgets、settings tabs；
- 以 load/activation timeout、token、disposable 和 `onunload` 管理生命周期；
- 为 HTTP route、iframe surface、静态 assets 和 UI `postMessage` 提供可验证的协议边界；
- 给插件作者提供稳定的 `@hana/plugin-sdk`、`@hana/plugin-runtime`、`@hana/plugin-components` facade。

### 非职责

- PluginManager 不是 Electron 窗口管理器，也不直接渲染 React；
- 插件不拥有宿主 session、Agent、用户工作区文件或任意服务器权限；
- `@hana/plugin-sdk` 不暴露 iframe 内的 raw filesystem/Node API；
- `@hana/plugin-runtime` 不等于 sandbox，restricted 插件代码仍在主进程执行，权限模型控制的是扩展点和 capability；
- `assets/` 不是私密存储，不应放 secrets、source map、源码或运行时数据。

## 4. 目录与契约地图

| 领域 | 关键路径 | 作用 |
|---|---|---|
| Manager | `<Path>core/plugin-manager.ts</Path>` | 扫描、加载、激活、贡献注册、卸载、诊断 |
| Context | `<Path>core/plugin-context.ts</Path>` | pluginId、dataDir、bus、resources、network、config、log 等运行上下文 |
| Route context | `<Path>core/plugin-route-request-context.ts</Path>` | 每次 HTTP 请求的 principal、grant、request-scoped bus |
| Ticket | `<Path>core/plugin-iframe-ticket-service.ts</Path>` | HMAC 签发/验证 iframe ticket |
| Surface session | `<Path>core/plugin-surface-session-service.ts</Path>` | HMAC 签发/验证动态 route session |
| Asset session | `<Path>core/plugin-asset-session-service.ts</Path>` | HMAC token、cookie 名和 `/assets/` scope |
| Server route | `<Path>server/routes/plugins.ts</Path>` | 插件管理、ticket endpoint、route proxy、surface activation |
| Asset HTTP | `<Path>server/http/plugin-assets.ts</Path>` | 路径/扩展名/realpath/Range 保护后的静态服务 |
| Shared protocol | `<Path>packages/plugin-protocol/src/index.ts</Path>` | UI message、capability、ResourceRef、版本和 parser |
| Browser SDK | `<Path>packages/plugin-sdk/src/index.ts</Path>`、`<Path>packages/plugin-sdk/README.md</Path>` | iframe ready/assets/api/host/theme facade |
| Node Runtime | `<Path>packages/plugin-runtime/src/index.ts</Path>`、`<Path>packages/plugin-runtime/README.md</Path>` | definePlugin/defineTool、bus、resources、session/media helpers |
| UI components | `<Path>packages/plugin-components/src/index.ts</Path>`、`<Path>packages/plugin-components/styles.css</Path>` | Button、Input、Card、List、ThemeProvider 等 React primitives |
| Built-ins | `<Path>plugins/beautify</Path>`、`<Path>plugins/media</Path>`、`<Path>plugins/office</Path>`、`<Path>plugins/jimeng-cli</Path>` | 与应用一起打包的示例/默认插件 |

## 5. PluginManager 生命周期：scan → load → activate → unload

### 5.1 构造和数据结构

`PluginManager` 构造函数接收 `pluginsDirs`、`dataDir`、EventBus、preferences、appVersion、ResourceIO/resourceWatch、session file 注册器、slash registry 和 runtime context，见 `<Path>core/plugin-manager.ts</Path>`。多个目录按顺序处理：第一个是 builtin，后续是 community；`pluginKey` 把 source 与 id 组合，避免同名插件互相覆盖。

内部注册表包括 `_plugins`、`_tools`、`_commands`、`_skillPaths`、`_agentTemplates`、`_providerPlugins`、`_extensionFactories`、`_pages`、`_widgets`、`_settingsTabs` 和 `routeRegistry`。这反映一个设计选择：插件贡献是可查询的 projection，插件实例和上下文是生命周期状态，不应要求 route 层穿透私有字段。

### 5.2 scan：只读描述，不执行生命周期

`scan()` 遍历目录，跳过隐藏目录，调用 `_readPluginDescriptor()`：

1. 读取 `manifest.json`（可缺省）；
2. 推导 id/name/version/description；
3. 探测 `tools`、`skills`、`commands`、`agents`、`routes`、`providers`、`extensions`、`index` 等贡献；
4. 归一化 `trust`、`activationEvents`、`capabilities`、`sensitiveCapabilities`、UI host capabilities；
5. 识别不兼容格式、同 source id 冲突和缺失 community 目录。

**事实：** `scan()` 只构造 descriptor 并写 `_scanned`，没有调用 `onload`；生命周期入口是否存在由 `resolvePluginEntry` 判断，见 `<Path>core/plugin-manager.ts</Path>`。

### 5.3 loadAll：门禁先于代码加载

`loadAll()` 为每个 descriptor 建立 `status: "loading"`、`activationState: "inactive"` 的 entry，然后按以下门禁处理：

- community 插件在 disabled preference 中：`disabled`，不执行；
- 格式问题：`incompatible`；
- community `trust: full-access` 但用户总开关关闭：`restricted` 状态，不部分加载；
- `minAppVersion` 高于当前 app：`incompatible`；
- 通过门禁后才调用 `_loadPluginWithBoundary()`，成功为 `loaded`，异常为 `failed`。

Builtin 始终按 full-access 计算；community 是否 full-access 由 manifest 和用户开关共同决定。注意“restricted”是扩展能力等级，不是 JavaScript 沙箱：`PLUGINS_EN.md` 明确提示插件代码在主进程运行，权限模型控制系统扩展点而非 Node API 隔离。

### 5.4 `_loadPlugin`：先声明贡献，再加载高权限扩展

`_loadPlugin()` 创建 `createPluginContext()`，注入 pluginId/pluginKey/pluginDir/dataDir、bus、accessLevel、ResourceIO、watch、config schema、network allowlist 和 runtime context。然后按阶段执行：

```text
tools → skills → commands → agent templates → configuration
  （full-access 才继续）
routes → extensions → providers → page → widget → settings tab
  → 若 onStartup 匹配，activate lifecycle
```

每个阶段前后都有 `_assertActiveLoad()`；整个 load 有 `_withLoadTimeout()`，超时会标记 `_loadCancelled` 并清理已注册贡献。`_loadPluginWithBoundary()` 使用 load token 防止异步导入在取消后晚到并污染全局注册表。

### 5.5 lazy activation：声明先可见，生命周期按事件启动

`activationEvents` 默认规则是：有 lifecycle 且 manifest 缺失字段时按 `onStartup` 兼容旧插件；显式数组则严格匹配。`_activatePluginEntry()` 用 `activationState: activating/activated/failed` 和 `_activationPromise` 去重，并在 lifecycle import 后实例化默认导出 class，注入 `ctx`、`register()` 和动态 `ctx.registerTool()`。

事件入口包括：

- `onStartup`：load 阶段结束时立即激活；
- `onPageOpen`/`onWidgetOpen`：`activatePluginRoute()` 在 route proxy 识别 surface 后触发；
- `onToolCall:<name>`：静态 tool wrapper 在实际执行前触发；
- `onBusRequest:<type>` 等扩展事件：由 activation matcher 识别前缀。

**Why：** 纯声明贡献（例如 tool schema/page metadata）可以在启动时可见，而持久连接、watcher、background task 等昂贵资源只在真正需要时启动。代价是第一次 route/tool 调用可能承担 activation 延迟，并必须正确处理并发 promise、timeout 和失败缓存。

### 5.6 unload：逆序清理和贡献撤销

`unloadPlugin()` 标记取消，调用 `_cleanupPluginEntry()`：先 `onunload()`，再逆序执行 disposables，清空 instance/activation state，最后 `_cleanupPluginContributions()` 移除 tools/commands/slash/skills/providers/config/extensions/pages/widgets/settings/routes。状态改为 `unloaded`，并刷新 route registry。

升级或 dev reload 依赖同一条路径，故插件作者必须把 bus subscription、watch、timer、dynamic tool dispose 交给 `register()`；否则 reload 后会出现重复 handler 或旧实例继续响应。

## 6. 贡献类型与内置插件案例

### 6.1 工具型 restricted 插件：Office

`<Path>plugins/office/manifest.json</Path>` 声明 `trust: restricted` 和 `office.read`、`office.html_to_pdf`、`resource.read`、`resource.materialize` 能力；工具位于 `<Path>plugins/office/tools</Path>`。它适合说明：不需要 lifecycle/routes/providers 的插件可以保持 restricted，但仍应通过 `ctx.resources` 和 capability 访问用户资源，不能猜本机路径。

### 6.2 builtin full-access：Beautify

`<Path>plugins/beautify/manifest.json</Path>` 声明 `trust: full-access`、`resource.read/write`、`activationEvents: ["onStartup"]`，并有 configuration schema。其 `<Path>plugins/beautify/index.ts</Path>` 注册生命周期/资源相关能力，工具位于 `<Path>plugins/beautify/tools</Path>`。它展示 builtin 不受 community full-access 开关限制，并能在启动时建立后台能力。

### 6.3 媒体和 provider：media / jimeng-cli

`<Path>plugins/media/manifest.json</Path>` 与 `<Path>plugins/media/tools</Path>` 展示 Agent-facing media tool 如何复用 host Media Manager；`<Path>plugins/jimeng-cli/manifest.json</Path>`、`<Path>plugins/jimeng-cli/providers</Path>` 展示 full-access provider/CLI adapter 的位置。真正执行仍受 runtime session permission、exec policy 和 provider capability 约束，插件不能通过字符串拼 shell 命令绕过 host。

### 6.4 UI surface 的契约位置

仓库当前 builtin 示例主要偏工具/Provider；UI 形状的正式示例和 manifest 字段在 `<Path>PLUGINS_EN.md</Path>` 的 Page、Widget、Card、`chat.surface` 章节，宿主实现位于 `<Path>desktop/src/react/components/plugin/PluginPageView.tsx</Path>`、`<Path>desktop/src/react/components/plugin/PluginWidgetView.tsx</Path>` 和 `<Path>desktop/src/react/components/chat/PluginCardBlock.tsx</Path>`。不能因为某个 builtin 没有 page manifest 就推断 UI 协议不存在。

## 7. Server plugin route：从管理 API 到 catch-all proxy

`<Path>server/routes/plugins.ts</Path>` 同时承载插件管理和运行时 route：

- `/plugins/dev/*`：开发安装、reload、enable/disable、invokeTool、diagnostics、surfaces；
- `/plugins/pages`、`/plugins/widgets`、`/plugins/ui-host-capabilities`：给 renderer 的 surface catalog；
- `/plugins/iframe-ticket`：校验 route、插件存在性和 principal，签发 ticket + surface session；
- `/plugins/:pluginId/assets/*`：静态资源入口；
- 最后的 `route.all("/plugins/:pluginId/*")`：验证 ticket、按 route 激活 lifecycle、解析 agentId、构造 request principal、转发到插件 Hono app，并附加 asset session cookie。

catch-all 的顺序很关键：assets 必须先于 route proxy，管理/工件 API 必须先于 catch-all，否则 `/assets` 会被插件动态 route 吞掉。`getRouteApp()` 和 `activatePluginRoute()` 是 server 与 Manager 的唯一公开接缝之一。

## 8. 三类凭证的详细协议

### 8.1 iframe ticket：只证明“可以加载这个 surface”

`<Path>core/plugin-iframe-ticket-service.ts</Path>` 使用 HMAC key（存于 HANA security dir）签发 payload：schemaVersion、ticketId、pluginId、surfacePath、action `plugins.iframe`、principalId、issuedAt、expiresAt。`verifyPluginIframeTicket()` 检查签名、schema/action、pluginId、surfacePath 和过期时间，失败抛出带 code/status 的 `PluginIframeTicketError`。

`POST /api/plugins/iframe-ticket` 会先从 route URL 解析 pluginId/surfacePath，调用 `assertPluginIframeSurfaceAllowed()`，确认 route app 存在，再同时签发 ticket 与 surface session，见 `<Path>server/routes/plugins.ts</Path>`。桌面 `usePluginSurfaceUrl()` 把返回的 ticket 和 session 加到 iframe URL；ticket 只用于初始文档请求。

### 8.2 surface session：动态 API 的请求级身份

`<Path>core/plugin-surface-session-service.ts</Path>` 的 token payload action 是 `plugins.surface`，默认 TTL 比 ticket 长。SDK 的 `hana.api.fetch(path, init)` 从当前 iframe URL 读取 `pluginSurfaceSession`，规范化相对 route path，并设置 `X-Hana-Plugin-Surface-Session` header，见 `<Path>packages/plugin-sdk/src/index.ts</Path>`。

server 在 route proxy 中把 surface session 验证结果铸造成 plugin principal；`pluginRouteRequestPrincipal()` 和 `createPluginRouteRequestContext()` 把它限制为该插件自己的 route，并不携带 studio scope。route handler 应使用 `getPluginRequestContext(c)` 取得 request-scoped bus，敏感系统 capability 再按 manifest 声明和用户 grant 检查。

### 8.3 asset session cookie：只让浏览器加载静态产物

`<Path>core/plugin-asset-session-service.ts</Path>` 为每个 pluginId 生成哈希 cookie 名和 `/api/plugins/<id>/assets/` Path，属性包括 `HttpOnly`、`SameSite=Strict`、短 Max-Age，可选 Secure。server 在成功代理 surface 文档后附加 cookie；之后浏览器请求 JS/CSS/font/image/video 时只需带 cookie，不必把 ticket 或 surface token 暴露给每个静态请求。

`<Path>server/http/plugin-assets.ts</Path>` 仍会验证 cookie、插件 loaded 状态、assets root realpath、路径段、扩展名和目标文件。允许的扩展名是 JS/MJS/CSS/JSON/图片/字体/wasm/MP4/WebM/MOV；拒绝 `.map`、dotfile、`..`、反斜杠和 symlink 越出 assets root。`serveFileContent` 支持 HEAD/byte range，满足视频 seeking。

## 9. UI protocol 与 postMessage 安全

### 9.1 线协议

`<Path>packages/plugin-protocol/src/index.ts</Path>` 固定 `PLUGIN_UI_PROTOCOL = "hana.plugin.ui"`、version `1`，定义 `PluginUiMessage` 的 `protocol/version/id/kind/type/payload/error`，并提供 `parsePluginUiMessage()`。非 event 消息必须有非空 id；error 必须有 code/message；版本或形状错误会得到 `BAD_MESSAGE` 或 `UNSUPPORTED_VERSION`。

能力目录包括 `toast.show`、`external.open`、`clipboard.writeText`、`resource.open`、`resource.pick`、`resource.requestAccess` 和 `ui.resize`。ResourceRef 是结构化身份（local-file、mount、session-file、resource、url），不是“把路径字符串交给 iframe”。

### 9.2 宿主验证顺序

`<Path>desktop/src/react/hooks/use-plugin-iframe.ts</Path>` 监听 window message，先通过 `isTrustedPluginIframeMessage()` 检查：

1. `event.source` 必须是当前 iframe `contentWindow`；
2. `event.origin` 必须等于 route URL origin；
3. `parsePluginIframeHostMessage()` 必须接受协议/legacy ready/resize/request；
4. request 交给 `<Path>desktop/src/react/plugin-ui/plugin-ui-host-controller.ts</Path>`；
5. controller 按 capability 名、allowedSlots、grantedCapabilities、payload validator 顺序检查；
6. 成功调用 host handler，失败返回结构化 error；响应只 postMessage 回原 iframe 和 expected origin。

这比只检查 `type` 严格得多：恶意同源/跨源窗口不能借用另一个 iframe 的 source，card 也不能调用只允许 page/widget 的能力，未授权 external/clipboard/resource 请求不会落到平台 API。

### 9.3 SDK 请求和握手

`createHanaPluginSdk()` 默认以 iframe 的 `parent` 为 target，推导 `hana-host-origin` 或 referrer origin；`hana.ready()` 发 `event`，`host.request()` 发带 id 的 `request`，等待同 type/id 的 response/error，超时抛 `HanaPluginError(TIMEOUT)`。theme subscribe 同样验证 source/origin 后才接受 `hana.theme.changed`。

`hana.ui.resize()` 是 event；宿主 `clampPluginIframeSize()` 按 slot 限制 card 50–400×30–600，surface 高度不超过 viewport 减 chrome，避免插件改变宿主布局到任意尺寸。

## 10. SDK、Runtime、Components 的分工

### 10.1 `@hana/plugin-sdk`：浏览器 presentation facade

稳定接口包括：

- `hana.assets.url(path)`：生成当前 plugin assets URL，拒绝绝对 URL、反斜杠、dotfile、`.`/`..`；
- `hana.api.url/fetch(path)`：生成当前 plugin route，拒绝 `api/plugins` 越权路径，并附加 surface session header；
- `hana.host.request()` 与 toast/external/clipboard/resources convenience wrappers；
- `hana.theme.getSnapshot/subscribe()`；
- `hana.ui.resize()`、`hana.ready()`。

它刻意不提供 `fs`、Node、host token 或 raw ResourceIO。浏览器页面只能请求 host 打开/选择/申请资源，真正读写交给 runtime `ctx.resources`。

### 10.2 `@hana/plugin-runtime`：Node-side stable shapes

Runtime 导出 `definePlugin()`、`defineTool()`、`defineBusHandler()`、`requestBus()`、`getPluginRequestContext()` 以及 session/agent/model/media/usage/resource helpers。`definePlugin()` 返回与当前 Manager 兼容的 default class；静态 `tools/*.js` 仍由 Manager 读取 named exports，这是兼容约束，不要误以为所有插件都走同一 loader。

Runtime 的关键边界：

- `ctx.resources` 通过 ResourceIO 处理 read/search/write/materialize/watch；URL 资源只读；
- `ctx.network.fetch()` 检查 manifest `network.fetch`、allowedHosts、HTTPS/private-network、method、timeout、response bytes；
- `sessionPermission` 和 `resolveInvocation()` 把工具动作分类为 read/routine/review，失败时 fail closed；
- `stageFile()` 只交付插件生成物，不是修改用户源文件的捷径；
- route handler 通过 request-scoped `req.bus` 调用敏感 system capability，manifest 声明和 full-access grant 缺一不可。

### 10.3 `@hana/plugin-components`：视觉和交互约束

`<Path>packages/plugin-components/src/controls.tsx</Path>` 提供 Button、IconButton、TextInput、Textarea、Switch、Select；`<Path>packages/plugin-components/src/layout.tsx</Path>` 提供 CardShell、SettingRow、EmptyState、List；`<Path>packages/plugin-components/src/theme.tsx</Path>` 提供 `HanaThemeProvider` 和内置 token。它不增加权限，只让 plugin UI 共享可访问、可主题化的视觉 primitives。样式在 `<Path>packages/plugin-components/styles.css</Path>`，插件构建时要把 CSS 一并打包/加载。

## 11. 端到端 UI 请求主链路

以用户打开插件 page 并点击“打开资源”为例：

```text
React refreshPluginUI()
 → GET /api/plugins/pages
 → PluginPageView
 → usePluginSurfaceUrl() POST /api/plugins/iframe-ticket
 → server 校验 route + principal，签发 ticket/session
 → iframe GET /api/plugins/:id/page?pluginIframeTicket=...
 → server verify ticket，proxy plugin route，Set-Cookie asset session
 → iframe hana.ready()（postMessage）
 → user clicks resource.open
 → SDK request(id, type, payload)
 → host source/origin/slot/grant/payload validation
 → preload/host resource picker or opener
 → response(id,type) 回 iframe
```

如果页面随后调用自身动态 route：

```text
hana.api.fetch('api/data')
 → URL /api/plugins/:id/api/data
 → X-Hana-Plugin-Surface-Session
 → verify surface token + plugin principal
 → request-scoped plugin bus/capability grant
 → plugin route response
```

如果只加载 lazy JS chunk/image/video，则浏览器自动带 scoped HttpOnly asset cookie，不复用 surface session。

## 12. 状态、错误、超时与生命周期矩阵

| 范围 | 状态/错误 | 处理 |
|---|---|---|
| scan | descriptor parse error、id collision、missing directory | 记录日志，跳过或 reconcile community stale entry |
| load gate | disabled、restricted、incompatible、failed | 不执行被拒绝贡献；失败清理已注册项 |
| lifecycle | inactive/activating/activated/failed | `_activationPromise` 去重，timeout 后保留失败信息 |
| route | plugin not found、ticket required/mismatch/expired、agent not found | 404/403/400 结构化错误，不降级为隐式全局身份 |
| asset | malformed path、unknown extension、symlink escape、cookie missing | 404/403；不泄露文件路径 |
| UI message | BAD_MESSAGE、UNSUPPORTED_VERSION、UNKNOWN_TYPE、SLOT_DENIED、CAPABILITY_DENIED、HOST_ERROR、TIMEOUT | parser/controller/SDK 各自 fail closed |
| unload | onunload/disposable error | 记录错误，继续清理其余 disposable 和贡献 |

**重要边界：** lifecycle timeout 不能安全终止已执行的任意 Node 代码，只能取消后续注册并清理可追踪资源；插件作者仍需让 onload 可中断、onunload 幂等。`postMessage` timeout 只结束 iframe 请求 promise，不会撤销已经到达 host 的副作用，因此 host handler 必须自行保持幂等/权限检查。

## 13. 安全不变量与 Why

### 13.1 身份绑定

每个 ticket/session payload 都绑定 pluginId，ticket 还绑定 surfacePath/principalId；验证使用 timing-safe HMAC compare 和过期检查。这样一个插件的凭证不能加载另一个插件 route，也不能把 surface ticket 当长期动态 API credential。

### 13.2 能力最小化

manifest 的 `capabilities`/`sensitiveCapabilities` 与用户 full-access grant 共同决定 route bus 能力；UI `hostCapabilities` 与用户 grant 决定 iframe host request。显式空数组是“无能力”，只有两个字段都缺失的 legacy manifest 才按兼容规则视为声明全部，见 `<Path>core/plugin-route-request-context.ts</Path>` 和 `<Path>PLUGINS_EN.md</Path>`。

### 13.3 资源身份而非路径

`PluginResourceRef` 保留 mount/session-file/resource/url 身份和版本，插件不能把它降级成猜测的本机路径。需要第三方库时先 `materialize()`，写回仍走 ResourceIO。这样审计可以知道是哪一个 plugin principal 修改了哪个资源。

### 13.4 静态资源隔离

asset route 只解析 assets root 下的真实文件，拒绝 symlink escape、dotfile、source map 和不允许扩展名；cookie Path 只覆盖该 plugin 的 assets 子树。代价是插件不能把任意 server-generated file 放进 assets，动态内容必须走 route。

### 13.5 postMessage 来源校验

必须同时匹配 source window 和 origin；仅匹配 origin 不足以区分同一页面中的多个 iframe，仅匹配 source 也无法防跨源消息伪造。协议 parser、slot allowlist、payload validator 和 grant 检查形成四层门禁。

## 14. 构建、打包与兼容约束

- 插件入口和静态工具按当前 loader 约定使用 ESM-compatible source；lifecycle default export 应通过 `definePlugin()` 保持 class-compatible；
- `tools/*.js` 的 named exports（`name`、`description`、`parameters`、`execute`）仍是兼容入口，即使实现内部使用 `defineTool()`；
- 浏览器 UI 产物必须放进 plugin `assets/`，通过 `hana.assets.url()` 引用，不能依赖带 token 的 chunk URL；
- lazy imports、CSS、fonts、JSON、wasm、视频都必须能从 assets route 读取；不要发布 source map/secrets；
- `@hana/plugin-sdk`、`@hana/plugin-runtime`、`@hana/plugin-components` 的 package exports/tsconfig 要与仓库 aliases 一致，见 `<Path>package.json</Path>`、`<Path>tsconfig.json</Path>` 和各 package `package.json`；
- server artifact 构建必须带上 plugin runtime dependencies；相关依赖追踪在 `<Path>scripts/build-server.mjs</Path>` 和 `<Path>tests/build-server-artifact.test.ts</Path>`；
- Electron renderer 不应直接 import Node-side runtime；SDK 只进入 iframe/browser bundle，runtime 只进入 server/plugin bundle；
- `plugin-components` CSS 必须随 UI 构建注入，主题 token 不应假设宿主 renderer 的私有 CSS class。

## 15. 测试阅读索引

按协议层次阅读：

1. `<Path>tests/plugin-ui-protocol.test.ts</Path>`：message schema、版本和 parser；
2. `<Path>tests/plugin-ui-capabilities.test.ts</Path>`：capability payload validator 和 grant；
3. `<Path>tests/plugin-ui-host-controller.test.ts</Path>`：source/origin/slot/handler/error；
4. `<Path>tests/plugin-sdk.test.ts</Path>`：SDK handshake、request/response、theme、asset/api URL；
5. `<Path>desktop/src/react/__tests__/hooks/use-plugin-iframe.test.tsx</Path>`：iframe host hook；
6. `<Path>desktop/src/react/__tests__/hooks/use-plugin-surface-url.test.tsx</Path>`：ticket/session URL 拼接和失败状态；
7. `<Path>desktop/src/react/__tests__/plugin-ui/capabilities.test.ts</Path>`、`<Path>desktop/src/react/__tests__/components/PluginCardBlock.grants.test.tsx</Path>`：renderer UI grant；
8. `<Path>tests/plugin-runtime.test.ts</Path>`：`definePlugin` lifecycle compatibility；
9. `<Path>tests/plugin-ui-contributions.test.ts</Path>`、`<Path>tests/plugin-slash-contributions.test.ts</Path>`：Manager contribution registry/unload；
10. `<Path>tests/plugin-routes.test.ts</Path>`、`<Path>tests/plugin-route-request-context.test.ts</Path>`：proxy、principal、capability deny；
11. `<Path>tests/plugin-sdk-examples.test.ts</Path>`：文档/示例中 surface session 等契约。

静态检索没有找到独立的 `plugin-iframe-ticket`、`plugin-surface-session` 或 `plugin-asset-session` 测试文件；这些 service 的证据来自实现和 route/UI 集成测试，不能把它们描述成已有单元测试。**本次没有运行任何测试、构建或插件加载。**

## 16. Why、代价、边界与替代设计

### 当前设计的因果链

系统需要让 Agent 工具、后台 route、桌面 page/widget/card 和第三方插件共同工作，同时不能把宿主文件、账号和窗口权限全部暴露给插件。于是：

1. Manager 用 descriptor/registry 把“可发现贡献”和“运行时实例”分开；
2. activation events 把昂贵 lifecycle 推迟到使用时；
3. server route proxy 统一认证、principal 和 capability grant；
4. 三类凭证把文档、动态 API、静态资源的生命周期拆开；
5. SDK/Runtime/Components 分别面向 browser、Node、React，避免跨运行时误 import。

### 代价

- 插件作者要理解 manifest、权限、activation、route context、ResourceRef 和 UI protocol 多层合同；
- 同名 builtin/community shadowing、pluginKey 和 stale directory reconcile 增加诊断复杂度；
- timeout/late import/disposable 需要严格生命周期纪律；
- 静态资源必须经过构建和 assets route，不能随手暴露本机文件；
- postMessage 是异步协议，错误可能跨越 iframe、renderer、server 三层传播。

### 替代方案与反转条件

| 方案 | 优点 | 代价 | 何时可能采用 |
|---|---|---|---|
| 所有插件直接进主进程、无 capability | API 简单 | 无法审计/撤销，插件可见面过大 | 仅内部可信单体工具 |
| 每个插件独立子进程 + RPC | OS 隔离更强 | 启动成本、序列化和部署复杂，现有 EventBus/ResourceIO 需重做 | 不可信第三方代码成为首要威胁时 |
| iframe 直接带长期 server token | 实现快 | token 可被静态资源/页面脚本重放和横向使用 | 只做一次性内部原型，不能作为生产协议 |
| 当前分层 ticket/session/cookie | 路径和能力最小化，可渐进兼容 | 协议数量多，需维护 key/TTL/版本 | 当前跨客户端、可安装插件目标下的推荐 |

如果未来插件代码需要真正的 hostile-code 隔离，当前 restricted/full-access 不能被误称为 sandbox，应评估子进程/worker/container；这会反转部分 Manager 和 Runtime 设计，但不应在没有威胁模型和迁移合同前直接替换。

## 17. 证据分类、假设和待验证

### 事实

- `PluginManager.scan/loadAll/_loadPlugin/activatePlugin/unloadPlugin` 及状态字段存在于 `<Path>core/plugin-manager.ts</Path>`；
- server ticket endpoint、route proxy 和 `activatePluginRoute` 存在于 `<Path>server/routes/plugins.ts</Path>`；
- ticket、surface session、asset session 分别有独立 HMAC service：`<Path>core/plugin-iframe-ticket-service.ts</Path>`、`<Path>core/plugin-surface-session-service.ts</Path>`、`<Path>core/plugin-asset-session-service.ts</Path>`；
- assets route 做 extension/path/realpath 检查：`<Path>server/http/plugin-assets.ts</Path>`；
- UI protocol parser 和 capability constants 在 `<Path>packages/plugin-protocol/src/index.ts</Path>`；
- SDK、Runtime、Components 的公开接口分别在各 package source/README；
- renderer host 同时校验 source、origin、slot、grant 和 payload：`<Path>desktop/src/react/hooks/use-plugin-iframe.ts</Path>`、`<Path>desktop/src/react/plugin-ui/plugin-ui-host-controller.ts</Path>`。

### 推断

- descriptor/registry 与 lifecycle instance 分离，是为了让 UI catalog、工具发现和实际资源启动拥有不同成本；
- ticket/session/cookie 三分法是按暴露面和 TTL 最小化，而不是重复实现认证；
- route request context 让同一插件的不同 HTTP 请求不会共享隐式 principal 或 bus grant。

### 假设

- HMAC key 文件权限和 HANA_HOME security directory 在各平台都由 host 正确保护；
- server 与桌面/iframe 依赖同一 `@hana/plugin-protocol` 版本，协议 version mismatch 会明确失败；
- builtin 插件目录在发布 artifact 中与 server bundle 的相对布局保持一致。

### 待验证

- key rotation、HANA_HOME 迁移或多 server 并行时，旧 ticket/session/cookie 的失效策略；
- plugin route proxy 在真实反向代理、cloud connection、跨 origin iframe 下的 cookie SameSite 行为；
- lifecycle timeout 期间插件已发出的外部副作用是否需要额外 cancellation contract；
- symlink、case-insensitive filesystem、byte-range video 和 CDN/cache 在 macOS/Windows/Linux 的一致性；
- community/builtin 同名 shadowing、upgrade/reload 与当前 idle Pi extension rebinding 的完整顺序；
- 真实运行时 `@hana/plugin-components` CSS 与宿主主题切换的视觉和 CSP 兼容性。

## 18. 下一篇与阅读练习

下一篇建议阅读 `<Path>{roots.state}/specdev/changes/{change}/teaching/09-end-to-end-business-flows.md</Path>`，把本篇的协议接到完整业务流：桌面 Prompt、Channel/DM、后台 automation、Resource/Knowledge 编辑和插件 UI 请求。之后读 `<Path>{roots.state}/specdev/changes/{change}/teaching/10-tests-and-reading-map.md</Path>`，按行为契约回到测试。

读完本篇后应能解释：

- 为什么 `loadAll()` 成功不等于 lifecycle 已执行；
- 为什么 iframe 初始 URL 的 ticket 不能拿去调用插件 API；
- 为什么静态 JS chunk 使用 HttpOnly asset cookie，而动态 API 使用显式 surface session header；
- 为什么 restricted 插件仍不能被称作 Node sandbox；
- 为什么 `definePlugin()`、`defineTool()`、`hana.api.fetch()` 和 `HanaThemeProvider` 分属不同 package，而不是一个“大而全”的 SDK。
